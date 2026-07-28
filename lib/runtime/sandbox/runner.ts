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
 * A scenario is re-runnable in place: it constructs its own stores, clones the
 * spec before any patch touches it, and builds a scripted responder's cursor
 * per run — so neither the shared fixture nor the scenario constant carries
 * anything out of one pass and into the next.
 *
 * WHAT IS UNDER TEST IS THE STORED PACKAGE, not a convenient recompilation of
 * the spec. Compiling on the fly proves an artefact equivalent to the one M2
 * built — and "equivalent" is precisely the assumption a pluggable
 * PackageGenerator invalidates. Given the Factory's store the sandbox loads
 * what the Factory actually stored, and every result records which of the two
 * it earned.
 */

import type { ApprovedPlan, AgentSpec } from "../../plan/types";
import { loadBundle } from "../build/runner";
import type { BuildDeps } from "../build/types";
import { bundleAgent } from "../factory";
import { decideAndResume, startRun } from "../executor";
import type { ExecutorOptions } from "../executor";
import { FixtureReasoner } from "../llm";
import { InMemoryRunStore, FixedClock, createIdFactory } from "../store";
import { StubIntegrationProvider, StubToolClient } from "../tools";
import type { StubResponder } from "../tools";
import type {
  AgentBundle,
  RiskLevel,
  RunStatus,
  ToolClient,
  ToolInvocation,
  ToolResult,
  TriggerEvent,
} from "../types";
import {
  InProcessIsolation,
  type AgentVerdict,
  type PackageSource,
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
  /**
   * The Agent Factory's package store. Supplied, the sandbox proves the package
   * M2 built and stored — the artefact Activation will deploy. Omitted, it
   * compiles from the spec and stays a pure `(scenario, plan)` function for
   * library and unit use; the difference is recorded on every result rather
   * than left for the reader to infer.
   */
  packages?: Pick<BuildDeps, "store">;
}

/* ═══════════════════════ One scenario ═══════════════════════ */

/**
 * Runs one scenario and judges it.
 *
 * TWO PATHS, AND THE RESULT SAYS WHICH ONE IT CAME BACK ON. An isolation that
 * can genuinely execute a scenario elsewhere offers `runScenarioRemotely`; one
 * that only wraps local work does not. Preferring the remote method when it
 * exists is what makes isolation real — see `SandboxIsolation` for why handing a
 * remote isolation the local closure `run` takes would produce a remote-looking
 * verdict for work done in this process.
 *
 * NOTHING HERE FALLS BACK. A remote isolation that cannot deliver throws, and
 * that throw is allowed straight through: catching it and running locally would
 * reproduce exactly the lie the split exists to prevent, and turning it into a
 * failed `ScenarioResult` would blame the workforce for a broken sandbox. The
 * only results this function returns are ones that genuinely ran somewhere, and
 * each says where.
 *
 * `isolation: "remote"` is stamped HERE rather than trusted from the payload:
 * the remote process ran the scenario in ITS process and honestly stamped
 * "in-process", and this side is the only party that knows the result crossed a
 * machine boundary. Nothing else about the result is touched — the acceptance
 * criterion is that a remote result is deep-equal to a local one, and an
 * adapter, or this line, editing anything else would make that comparison
 * meaningless.
 *
 * `deps.packages` is deliberately NOT forwarded remotely: a sandbox has no
 * Factory store, so a remote run compiles and says so (`packageSource:
 * "compiled"`). That is a weaker claim than proving the stored artefact, which
 * is why the result records it rather than the caller having to remember.
 */
export async function runScenario(
  scenario: SandboxScenario,
  plan: ApprovedPlan,
  deps: SandboxDeps = {},
): Promise<ScenarioResult> {
  const isolation = deps.isolation;

  if (isolation?.runScenarioRemotely) {
    const result = await isolation.runScenarioRemotely(scenario);
    return { ...result, isolation: "remote" };
  }

  const local = isolation ?? new InProcessIsolation();
  return local.run(scenario.id, () => execute(scenario, plan, deps));
}

async function execute(
  scenario: SandboxScenario,
  plan: ApprovedPlan,
  deps: SandboxDeps,
): Promise<ScenarioResult> {
  const declared = plan.agents.find((a) => a.id === scenario.agentId);
  if (!declared) {
    return failure(scenario, `Agent "${scenario.agentId}" is not in the plan.`);
  }

  // A guardrail scenario deliberately deviates from the approved plan, so it
  // works on a clone: the shared fixture has to survive untouched or the next
  // scenario in the suite would inherit the sabotage and the suite would stop
  // being re-runnable in place.
  let spec: AgentSpec;
  try {
    spec = scenario.specPatch ? patchedSpec(declared, scenario.specPatch) : declared;
  } catch (err) {
    // A broken patch is a scenario bug. Report it as this scenario failing
    // rather than letting it take the whole verdict down with it.
    return failure(scenario, err instanceof Error ? err.message : String(err));
  }

  const workflow = scenario.workflowId
    ? spec.workflows.find((w) => w.id === scenario.workflowId)
    : spec.workflows.find((w) => w.enabled);
  if (!workflow) {
    return failure(scenario, `No enabled workflow for agent "${scenario.agentId}".`);
  }

  /* ── The artefact under test ──
     Prefer what the Factory stored. Proving a fresh compile can green-light a
     package that differs from the one Activation deploys, which is the single
     thing a pre-flight gate must never do. A patched spec has no stored
     counterpart by definition, so it compiles. */
  let bundle: AgentBundle;
  let packageSource: PackageSource;
  if (deps.packages && !scenario.specPatch) {
    const stored = await loadBundle(spec, deps.packages);
    if (!stored) {
      // Fail closed, as /api/runtime/run does: an unbuilt agent has nothing to
      // prove, and an unproven agent must never read as proven.
      return failure(
        scenario,
        `Agent "${spec.id}" has no built package for version ${spec.version}; build before proving.`,
      );
    }
    bundle = stored;
    packageSource = "stored";
  } else {
    bundle = bundleAgent(spec, { builtAt: SANDBOX_BUILT_AT });
    packageSource = "compiled";
  }

  /* ── Pinned dependencies ── */
  const stub = new StubToolClient({
    // A flat override wins over the script, so a scenario can pin one operation
    // and sequence another without the two fighting.
    responses: { ...scriptedResponders(scenario.toolScript), ...scenario.toolResponses },
  });
  const toolClient: RecordingToolClient = scenario.hangOn?.length
    ? new HangingToolClient(stub, new Set(scenario.hangOn))
    : stub;
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
  // Left at the executor's 60s default unless the scenario is about a timeout.
  // A short ceiling on every run would make all of them race a wall clock,
  // which is the flakiness the determinism criterion exists to remove.
  if (scenario.stepTimeoutMs !== undefined) {
    executor.stepTimeoutMs = scenario.stepTimeoutMs;
  }

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

  for (const [operation, expected] of Object.entries(expect.callCounts ?? {})) {
    const actual = called.filter((op) => op === operation).length;
    if (actual !== expected) {
      failures.push(
        `expected "${operation}" to be called ${expected} time(s); it was called ${actual}`,
      );
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
    failureReason: outcome.run.failure ?? null,
    packageSource,
    // Stated by the process that did the work. `execute` only ever runs here,
    // so this is the one place the value can be asserted rather than inferred;
    // `runScenario` overwrites it exactly when a result arrives from elsewhere.
    isolation: "in-process",
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
    failureReason: message,
    // The run never reached a package, so it proved nothing about either one.
    packageSource: "none",
    // This helper is only ever reached from `execute`, which is only ever
    // reached locally. A remote isolation that could not run the scenario
    // throws instead of arriving here.
    isolation: "in-process",
    events: [],
    runId: "",
  };
}

/* ═══════════════════ Scenario-controlled tool behaviour ═══════════════════ */

/** A ToolClient the sandbox can judge. Both the stub and the hanging wrapper
    satisfy it, so judgement reads one log whatever the scenario asked for. */
interface RecordingToolClient extends ToolClient {
  readonly calls: ReadonlyArray<ToolInvocation>;
}

/**
 * Applies a scenario's spec patch to a clone. `structuredClone` rather than a
 * shallow copy because a patch reaches into `policy.limits` and
 * `workflows[].steps`, and a shallow copy would write straight through into the
 * shared fixture.
 */
function patchedSpec(spec: AgentSpec, patch: (spec: AgentSpec) => void): AgentSpec {
  const copy = structuredClone(spec);
  patch(copy);
  return copy;
}

/**
 * Turns `toolScript` into responders whose cursor lives for exactly one run.
 * The cursor is created HERE, not beside the scenario, because a scenario is a
 * module-level constant: a counter declared next to it would survive into the
 * second of the five determinism runs, the first pass would retry and the rest
 * would not, and the exit criterion would fail for a reason that has nothing to
 * do with the agent.
 */
function scriptedResponders(
  script: Record<string, ToolResult[]> | undefined,
): Record<string, StubResponder> {
  const responders: Record<string, StubResponder> = {};
  for (const [operation, replies] of Object.entries(script ?? {})) {
    let cursor = 0;
    responders[operation] = () => {
      // Past the end the last reply repeats, so a script says "fails, fails,
      // then works from here on" without having to guess the attempt count.
      const reply = replies[Math.min(cursor, replies.length - 1)];
      cursor += 1;
      return reply ?? { ok: false, error: `No scripted reply for ${operation}.` };
    };
  }
  return responders;
}

/**
 * A client whose named operations never answer. `StubResponder` returns a
 * `ToolResult`, so a responder cannot express a call that simply never comes
 * back — and a hang is one of the three failure shapes ROLE_C_PLAN M0 asks the
 * fixtures to force. Wrapping the stub is how the sandbox expresses it without
 * loosening the stub's contract for every other scenario.
 *
 * The wrapper keeps its own log and records the hung call: it DID go out, it
 * just never returned, and a scenario asserting attempt counts has to see it.
 */
class HangingToolClient implements RecordingToolClient {
  private readonly inner: StubToolClient;
  private readonly hangOn: ReadonlySet<string>;
  private readonly log: ToolInvocation[] = [];

  constructor(inner: StubToolClient, hangOn: ReadonlySet<string>) {
    this.inner = inner;
    this.hangOn = hangOn;
  }

  get calls(): ReadonlyArray<ToolInvocation> {
    return this.log.map((call) => structuredClone(call));
  }

  async call(invocation: ToolInvocation): Promise<ToolResult> {
    this.log.push(structuredClone(invocation));
    if (this.hangOn.has(invocation.operation)) {
      // Never settles. The executor's stepTimeoutMs ends the wait, and a timer
      // always wins a race against a promise with no resolver — so the outcome
      // is fixed even though it is decided by a clock.
      return new Promise<ToolResult>(() => {});
    }
    return this.inner.call(invocation);
  }
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

  /* ── Why the gate is shut ──
     `ready` is derived from this list rather than computed alongside it, so the
     flag and the explanation can never disagree — and so every way of closing
     the gate has to be given a name a human can act on. */
  const blockers: string[] = [];
  if (results.length === 0) blockers.push("No scenario ran.");
  if (passed !== results.length) {
    blockers.push(`${results.length - passed} of ${results.length} scenario(s) failed.`);
  }
  for (const agent of byAgent) {
    if (agent.ready) continue;
    blockers.push(
      agent.total === 0
        ? `Agent ${agent.agentId} has no scenarios.`
        : `Agent ${agent.agentId} failed ${agent.failed} of ${agent.total} scenarios.`,
    );
  }
  if (stress === null) {
    // The same argument the byAgent rule above makes. The sweep is the only
    // check that walks a limit boundary, and the caller chooses whether to run
    // it — so letting an absent sweep read as a pass would mean a caller could
    // ask for a green verdict and be handed one.
    blockers.push("The stress sweep did not run, so the limit boundary is unproven.");
  } else if (stress.passed !== stress.total) {
    blockers.push(`${stress.total - stress.passed} of ${stress.total} stress case(s) failed.`);
  }

  return {
    planId: plan.planId,
    planVersion: plan.version,
    total: results.length,
    passed,
    failed: results.length - passed,
    ready: blockers.length === 0,
    blockers,
    byAgent,
    results,
    stress,
  };
}

/** A stable digest of a verdict, used to prove repeat runs agree. */
export function verdictFingerprint(verdict: SandboxVerdict): string {
  return JSON.stringify({
    ready: verdict.ready,
    blockers: verdict.blockers,
    results: verdict.results.map((r) => ({
      id: r.scenarioId,
      passed: r.passed,
      status: r.finalStatus,
      approvals: r.approvalsRaised,
      called: r.operationsCalled,
      failures: r.failures,
      // Which artefact was proved is part of what the verdict attests to: the
      // same green result earned on a fresh compile is weaker evidence. Where
      // it was proved is part of it for the same reason.
      packageSource: r.packageSource,
      isolation: r.isolation,
      events: r.events,
    })),
    stress: verdict.stress?.cases.map((c) => [c.caseId, c.passed]),
  });
}
