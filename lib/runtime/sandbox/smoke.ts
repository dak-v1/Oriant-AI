/**
 * lib/runtime/sandbox/smoke.ts — scenarios for a plan nobody wrote scenarios for.
 *
 * THE PROBLEM THIS SOLVES. `scenarios.ts` is sixteen hand-written cases about
 * four named BrightPath agents. A plan that arrives from Role B contains
 * different agents with different ids, so none of those cases apply — and
 * `runSuite` treats an agent with no scenarios as NOT ready, deliberately:
 * absence of evidence must not read as evidence of safety at an activation gate.
 *
 * Left there, every ingested plan would be permanently unprovable and therefore
 * permanently unactivatable. That is the correct failure but a useless one.
 *
 * WHAT A GENERATED SCENARIO CAN HONESTLY ASSERT. Not that the agent does its job
 * well — nobody wrote down what "well" means for an agent that arrived over a
 * seam ten minutes ago. What it CAN assert is the property the whole ingest
 * pipeline rests on:
 *
 *     a draft_only agent runs to its first action, stops, and writes nothing
 *
 * That is exactly the guarantee `from-handoff.ts` claims when it defaults every
 * ingested agent to `draft_only`, and asserting it here is what turns the claim
 * into evidence. A generated scenario is therefore a SMOKE test with teeth: it
 * cannot tell you the agent is useful, and it will absolutely tell you if a
 * guardrail leaked.
 *
 * Every generated case is labelled `Smoke` so the sandbox screen can show at a
 * glance which agents are covered by real scenarios and which are only covered
 * by this. Confusing the two would be the one way this file makes things worse.
 */

import type { AgentSpec, ApprovedPlan } from "../../plan/types";
import { isReadOnly } from "../../plan/operations";
import type { SandboxScenario } from "./types";
import type { ReasonResult } from "../types";

/** Marks a scenario as generated rather than authored. */
export const SMOKE_CATEGORY = "Smoke";

/**
 * Reasoning that establishes nothing measurable.
 *
 * Deliberate: a `draft_only` agent must stop at its first act REGARDLESS of the
 * numbers, because its mode decides that and no limit is consulted. Feeding
 * plausible metrics would prove a limit branch this agent does not use, and
 * would quietly mask a mode that had been changed to `auto_within_limits`
 * behind our back — which is the single thing this scenario exists to catch.
 */
function neutralReasoning(agent: AgentSpec): Record<string, ReasonResult> {
  return {
    __default: {
      summary: `Smoke run for ${agent.name}: prepare the work and stop.`,
      data: { smoke: true, agentId: agent.id },
      metrics: {},
    },
  };
}

/**
 * One scenario per enabled workflow. Per workflow rather than per agent because
 * an agent can carry a workflow whose steps route through a different tool, and
 * a single case would leave the others unproven while reporting the agent green.
 */
export function smokeScenariosFor(agent: AgentSpec): SandboxScenario[] {
  return agent.workflows
    .filter((workflow) => workflow.enabled)
    .map((workflow) => {
      const writes = workflow.steps
        .filter((step) => step.kind === "act" || step.kind === "approve")
        .flatMap((step) => (step.tool ? [step.tool.operation] : []))
        .filter((operation) => !isReadOnly(operation));

      const pauses = workflow.steps.some(
        (step) => step.kind === "act" || step.kind === "approve",
      );

      return {
        id: `smoke-${agent.id}-${workflow.id}`,
        name: `${agent.name}: prepares and stops`,
        description:
          `Generated because no scenario was written for ${agent.name}. It proves ` +
          `the agent runs its workflow, stops before acting, and touches nothing ` +
          `outside what the plan granted. It does not prove the agent does its job well.`,
        category: SMOKE_CATEGORY,
        agentId: agent.id,
        workflowId: workflow.id,
        reasonScript: neutralReasoning(agent),
        // The owner never decides, so the run must be found where it stopped.
        owner: { decision: "leave_pending" },
        expect: pauses
          ? {
              finalStatus: "awaiting_approval" as const,
              // The assertion that matters. Not "it paused" — "it wrote nothing".
              mustNotCall: writes,
              approvals: 1,
            }
          : {
              // A workflow with no act step can only gather, which is a
              // degraded agent rather than an unsafe one.
              finalStatus: "completed" as const,
              approvals: 0,
            },
      };
    });
}

/**
 * Smoke scenarios for every agent in a plan that no authored scenario covers.
 *
 * Authored scenarios always win. Generating alongside them would let a weak
 * generated case report an agent green while its real, harder scenario was
 * failing — the coverage equivalent of grading your own homework.
 */
export function smokeScenariosForPlan(
  plan: ApprovedPlan,
  authored: SandboxScenario[] = [],
): SandboxScenario[] {
  const covered = new Set(authored.map((scenario) => scenario.agentId));
  return plan.agents
    .filter((agent) => !covered.has(agent.id))
    .flatMap(smokeScenariosFor);
}

/**
 * The suite to prove a plan with: whatever was authored for it, plus generated
 * cover for everything else. What comes back is always enough for `runSuite` to
 * reach a verdict on every agent, which is what Activation's sandbox gate needs.
 */
export function suiteForPlan(
  plan: ApprovedPlan,
  authored: SandboxScenario[] = [],
): SandboxScenario[] {
  const planAgents = new Set(plan.agents.map((agent) => agent.id));
  // Authored scenarios for agents this plan does not contain are dropped rather
  // than run: they would fail on a missing agent and read as a broken workforce.
  const applicable = authored.filter((scenario) => planAgents.has(scenario.agentId));
  return [...applicable, ...smokeScenariosForPlan(plan, applicable)];
}

/* ═══════════════════════ Generated stress sweep ═══════════════════════ */

/**
 * The magnitudes a generated sweep walks. Chosen to span three orders and to
 * include zero, because "it asked about $1,200" and "it asked about nothing"
 * are different claims and a mode that held for one has not been shown to hold
 * for the other.
 */
const MAGNITUDES = [0, 1, 95, 500, 1200, 25_000];

/**
 * A stress sweep for a plan the authored sweep does not cover.
 *
 * `stress.ts` walks the BrightPath finance agent's `invoice.amount <= 500`
 * boundary, which is meaningless for an agent that does not exist in the plan
 * under test — every case would fail on a missing agent and read as a broken
 * workforce rather than an inapplicable sweep.
 *
 * What a generated sweep proves depends on the mode, and in both cases it is
 * the property that mode claims:
 *
 *   draft_only / act_after_approval   the agent asks AT EVERY MAGNITUDE. This is
 *                                     the one that matters for ingested plans:
 *                                     it catches a mode that is accidentally
 *                                     magnitude-dependent, which no single
 *                                     smoke case can see.
 *   auto_within_limits                each limit's boundary is walked at
 *                                     value-1, value and value+1, so an
 *                                     off-by-one in the comparison shows up.
 */
export function stressScenariosForPlan(plan: ApprovedPlan): SandboxScenario[] {
  const scenarios: SandboxScenario[] = [];

  for (const agent of plan.agents) {
    const workflow = agent.workflows.find((w) => w.enabled);
    if (!workflow) continue;

    const acts = workflow.steps.filter((s) => s.kind === "act" || s.kind === "approve");
    if (acts.length === 0) continue;

    const writes = acts
      .flatMap((s) => (s.tool ? [s.tool.operation] : []))
      .filter((operation) => !isReadOnly(operation));

    const unattended = agent.policy.operatingMode === "auto_within_limits";

    // For an unattended agent, walk each declared limit. For any other mode the
    // limits are not consulted at all, so a generic magnitude ladder is the
    // honest sweep.
    const points: Array<{ label: string; metrics: Record<string, number>; asks: boolean }> = [];

    if (unattended) {
      /**
       * Every OTHER limit has to be satisfied while one is walked.
       *
       * `evaluateLimits` fails closed on a metric it was never given, so a case
       * that supplies only the limit under test leaves the rest unmeasured and
       * the agent escalates — correctly, and for a reason that has nothing to do
       * with the boundary being probed. The sweep then reports a guardrail
       * failure on entirely correct behaviour, which is exactly the false alarm
       * that teaches people to ignore it.
       */
      const satisfyingValue = (l: (typeof agent.policy.limits)[number]): number =>
        l.op === "<=" || l.op === "<" ? Math.max(0, l.value - 1)
        : l.op === ">=" || l.op === ">" ? l.value + 1
        : l.value;

      const baseline: Record<string, number> = {};
      for (const other of agent.policy.limits) {
        baseline[other.metric] = satisfyingValue(other);
      }

      for (const limit of agent.policy.limits) {
        for (const delta of [-1, 0, 1]) {
          const value = limit.value + delta;
          // Re-uses the operator rather than assuming `<=`, so a `>=` floor
          // (a notice-period limit, say) is walked in the right direction.
          const satisfied =
            limit.op === "<=" ? value <= limit.value
            : limit.op === "<" ? value < limit.value
            : limit.op === ">=" ? value >= limit.value
            : limit.op === ">" ? value > limit.value
            : value === limit.value;
          points.push({
            label: `${limit.metric} = ${value} (${satisfied ? "within" : "outside"} ${limit.op} ${limit.value})`,
            // Baseline first so the metric under test overrides its own entry.
            metrics: { ...baseline, [limit.metric]: value },
            asks: !satisfied,
          });
        }
      }
    } else {
      for (const magnitude of MAGNITUDES) {
        points.push({
          label: `magnitude ${magnitude} — must still ask`,
          metrics: { "generic.amount": magnitude, "generic.count": magnitude },
          asks: true,
        });
      }
    }

    points.forEach((point, index) => {
      scenarios.push({
        id: `stress-${agent.id}-${index + 1}`,
        name: `${agent.name}: ${point.label}`,
        description: `Generated sweep across ${agent.name}'s decision boundary.`,
        category: SMOKE_CATEGORY,
        agentId: agent.id,
        workflowId: workflow.id,
        reasonScript: {
          __default: {
            summary: `Stress point: ${point.label}.`,
            data: { stress: true },
            metrics: point.metrics,
          },
        },
        owner: { decision: "leave_pending" },
        expect: point.asks
          ? { finalStatus: "awaiting_approval" as const, mustNotCall: writes, approvals: 1 }
          : { finalStatus: "completed" as const, approvals: 0 },
      });
    });
  }

  return scenarios;
}
