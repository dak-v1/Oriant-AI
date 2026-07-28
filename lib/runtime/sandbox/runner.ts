/**
 * lib/runtime/sandbox/runner.ts — the Sandbox (ROLE_C_PLAN M3).
 *
 * Runs scenarios end to end through the real executor with every dependency
 * pinned, then judges the result in code.
 *
 * DETERMINISM IS THE EXIT CRITERION, not a nice-to-have: Activation gates on
 * the verdict, and a flaky verdict is no gate at all. Four things are pinned
 * per scenario, and all four have to be, because any one left free reintroduces
 * variance:
 *
 *   clock   FixedClock, so every timestamp in the event stream is fixed
 *   ids     seeded from the scenario id, so run and approval ids repeat
 *   tools   StubToolClient, so the outside world always answers the same
 *   reason  FixtureReasoner, so no model temperature enters the run
 *
 * A scenario is re-runnable in place: it constructs its own stores, so running
 * the same suite twice cannot leak state from the first pass into the second.
 */

import type { ApprovedPlan, AgentSpec } from "../../plan/types";
import { bundleAgent } from "../factory";
import { decideAndResume, startRun } from "../executor";
import type { ExecutorOptions } from "../executor";
import { FixtureReasoner } from "../llm";
import { InMemoryRunStore, FixedClock, createIdFactory } from "../store";
import { StubIntegrationProvider, StubToolClient } from "../tools";
import type { RiskLevel, RunStatus, TriggerEvent } from "../types";
import {
  InProcessIsolation,
  type AgentVerdict,
  type SandboxIsolation,
  type SandboxScenario,
  type SandboxVerdict,
  type ScenarioResult,
  type StressResult,
} from "./types";

/** Fixed instant for every sandbox run: 09:00 Asia/Singapore on demo day. */
export const SANDBOX_NOW = "2026-07-24T01:00:00.000Z";
export const SANDBOX_BUILT_AT = "2026-07-24T00:00:00.000Z";

/** A pause loop that never terminates would hang the suite rather than fail it. */
const MAX_PAUSES = 10;

const RISK_ORDER: RiskLevel[] = ["low", "medium", "high"];

export interface SandboxDeps {
  isolation?: SandboxIsolation;
}

/* ═══════════════════════ One scenario ═══════════════════════ */

export async function runScenario(
  scenario: SandboxScenario,
  plan: ApprovedPlan,
  deps: SandboxDeps = {},
): Promise<ScenarioResult> {
  const isolation = deps.isolation ?? new InProcessIsolation();
  return isolation.run(scenario.id, () => execute(scenario, plan));
}

async function execute(
  scenario: SandboxScenario,
  plan: ApprovedPlan,
): Promise<ScenarioResult> {
  const spec = plan.agents.find((a) => a.id === scenario.agentId);
  if (!spec) {
    return failure(scenario, `Agent "${scenario.agentId}" is not in the plan.`);
  }

  const workflow = scenario.workflowId
    ? spec.workflows.find((w) => w.id === scenario.workflowId)
    : spec.workflows.find((w) => w.enabled);
  if (!workflow) {
    return failure(scenario, `No enabled workflow for agent "${scenario.agentId}".`);
  }

  /* ── Pinned dependencies ── */
  const toolClient = new StubToolClient({ responses: scenario.toolResponses });
  const provider = new StubIntegrationProvider({
    client: toolClient,
    disconnected: scenario.disconnected,
  });
  const runStore = new InMemoryRunStore();
  const executor: ExecutorOptions = {
    store: runStore,
    tools: provider,
    reasoner: new FixtureReasoner(scenario.reasonScript),
    clock: new FixedClock(SANDBOX_NOW),
    newId: createIdFactory(scenario.id),
    sleep: async () => {},
    globalPolicy: plan.globalPolicy,
  };

  const bundle = bundleAgent(spec, { builtAt: SANDBOX_BUILT_AT });
  const trigger: TriggerEvent = {
    kind: workflow.trigger.kind === "schedule" ? "schedule" : "manual",
    workflowId: workflow.id,
    agentId: spec.id,
    firedAt: SANDBOX_NOW,
    payload: scenario.triggerPayload ?? {},
    idempotencyKey: `${scenario.id}:1`,
  };

  let outcome;
  try {
    outcome = await startRun(bundle, trigger, executor);
  } catch (err) {
    return failure(scenario, err instanceof Error ? err.message : String(err));
  }

  /* ── The simulated owner ── */
  const approvalIds: string[] = [];
  const approvalReasons: string[] = [];
  const approvalRisks: RiskLevel[] = [];
  const breached = new Set<string>();

  let pauses = 0;
  while (outcome.status === "awaiting_approval" && pauses < MAX_PAUSES) {
    const approvalId = outcome.approvalId;
    if (!approvalId) break;

    const request = await runStore.getApproval(approvalId);
    if (request) {
      approvalIds.push(approvalId);
      approvalReasons.push(request.reason);
      approvalRisks.push(request.risk);
      for (const id of request.breachedLimits) breached.add(id);
    }

    if (scenario.owner.decision === "leave_pending") break;
    pauses += 1;

    try {
      outcome = await decideAndResume(
        {
          approvalId,
          decision: scenario.owner.decision === "approve" ? "approved" : "rejected",
          decidedBy: spec.policy.approvalOwner,
          decidedAt: SANDBOX_NOW,
          reason: scenario.owner.reason ?? "Rejected in sandbox.",
          editedArgs: scenario.owner.editedArgs,
        },
        bundle,
        executor,
      );
    } catch (err) {
      return failure(scenario, err instanceof Error ? err.message : String(err));
    }
  }

  /* ── Judgement, in code ── */
  const called = toolClient.calls.map((c) => c.operation);
  const failures: string[] = [];
  const expect = scenario.expect;

  if (outcome.status !== expect.finalStatus) {
    failures.push(
      `expected final status "${expect.finalStatus}" but got "${outcome.status}"` +
        (outcome.run.failure ? ` (${outcome.run.failure})` : ""),
    );
  }

  for (const operation of expect.mustCall ?? []) {
    if (!called.includes(operation)) {
      failures.push(`expected "${operation}" to be called; it was not`);
    }
  }

  for (const operation of expect.mustNotCall ?? []) {
    if (called.includes(operation)) {
      // The most important failure the sandbox can report: a guardrail leaked.
      failures.push(`"${operation}" must never be called, but it was`);
    }
  }

  if (expect.approvals !== undefined && approvalIds.length !== expect.approvals) {
    failures.push(
      `expected ${expect.approvals} approval(s) but the run raised ${approvalIds.length}`,
    );
  }

  if (expect.minRisk) {
    const highest = approvalRisks.reduce<RiskLevel>(
      (a, b) => (RISK_ORDER.indexOf(b) > RISK_ORDER.indexOf(a) ? b : a),
      "low",
    );
    if (approvalRisks.length === 0 || RISK_ORDER.indexOf(highest) < RISK_ORDER.indexOf(expect.minRisk)) {
      failures.push(
        `expected an approval of at least "${expect.minRisk}" risk; highest raised was "${approvalRisks.length ? highest : "none"}"`,
      );
    }
  }

  for (const limitId of expect.breachedLimits ?? []) {
    if (!breached.has(limitId)) {
      failures.push(`expected limit "${limitId}" to be breached; it was not`);
    }
  }

  if (expect.reasonContains) {
    const haystack = [...approvalReasons, outcome.run.failure ?? ""].join(" | ");
    if (!haystack.includes(expect.reasonContains)) {
      failures.push(
        `expected a reason containing "${expect.reasonContains}"; saw "${haystack}"`,
      );
    }
  }

  return {
    scenarioId: scenario.id,
    name: scenario.name,
    category: scenario.category,
    agentId: scenario.agentId,
    passed: failures.length === 0,
    failures,
    finalStatus: outcome.status,
    approvalsRaised: approvalIds.length,
    operationsCalled: called,
    events: outcome.run.events,
    runId: outcome.run.runId,
  };
}

function failure(scenario: SandboxScenario, message: string): ScenarioResult {
  return {
    scenarioId: scenario.id,
    name: scenario.name,
    category: scenario.category,
    agentId: scenario.agentId,
    passed: false,
    failures: [message],
    finalStatus: "failed" as RunStatus,
    approvalsRaised: 0,
    operationsCalled: [],
    events: [],
    runId: "",
  };
}

/* ═══════════════════════ A whole suite ═══════════════════════ */

export async function runSuite(
  scenarios: SandboxScenario[],
  plan: ApprovedPlan,
  deps: SandboxDeps & { stress?: StressResult | null } = {},
): Promise<SandboxVerdict> {
  const results: ScenarioResult[] = [];
  // Sequential so the event log reads as a narrative and stays reproducible.
  for (const scenario of scenarios) {
    results.push(await runScenario(scenario, plan, deps));
  }

  const byAgent: AgentVerdict[] = plan.agents.map((agent) => {
    const mine = results.filter((r) => r.agentId === agent.id);
    const passed = mine.filter((r) => r.passed).length;
    return {
      agentId: agent.id,
      total: mine.length,
      passed,
      failed: mine.length - passed,
      // An agent with no scenarios is NOT ready: absence of evidence cannot
      // be allowed to read as evidence of safety at an activation gate.
      ready: mine.length > 0 && passed === mine.length,
    };
  });

  const passed = results.filter((r) => r.passed).length;
  const stress = deps.stress ?? null;

  return {
    planId: plan.planId,
    planVersion: plan.version,
    total: results.length,
    passed,
    failed: results.length - passed,
    ready:
      results.length > 0 &&
      passed === results.length &&
      byAgent.every((a) => a.ready) &&
      (stress === null || stress.passed === stress.total),
    byAgent,
    results,
    stress,
  };
}

/** A stable digest of a verdict, used to prove repeat runs agree. */
export function verdictFingerprint(verdict: SandboxVerdict): string {
  return JSON.stringify({
    ready: verdict.ready,
    results: verdict.results.map((r) => ({
      id: r.scenarioId,
      passed: r.passed,
      status: r.finalStatus,
      approvals: r.approvalsRaised,
      called: r.operationsCalled,
      failures: r.failures,
      events: r.events,
    })),
    stress: verdict.stress?.cases.map((c) => [c.caseId, c.passed]),
  });
}
