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

import type {
  AgentSpec,
  ApprovedPlan,
  Op,
  PolicyLimit,
  QuietHours,
  StepSpec,
  WorkflowSpec,
} from "../../plan/types";
import { getOperation, isReadOnly } from "../../plan/operations";
import { flattenOperations } from "../factory";
import type { SandboxScenario } from "./types";
import type { ReasonResult, RunStatus } from "../types";

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
 * WHAT THIS SWEEP IS AND WHY IT WAS REWRITTEN.
 *
 * `stress.ts` walks BrightPath's `invoice.amount <= 500` boundary. Against any
 * other plan every one of its cases fails on a missing agent, so an ingested
 * workforce needs a sweep derived from ITS OWN policy. That is this.
 *
 * The version this replaces took `agent.workflows.find((w) => w.enabled)` and
 * moved on: one workflow per agent, the rest unproven, and a verdict that read
 * the same either way. Not a hole an attacker walks through — a gate weaker than
 * the sentence describing it, which is its own kind of lie. Every enabled
 * workflow is swept now, and the case count is a function of the plan rather
 * than of the order its workflows happen to be listed in.
 *
 * THREE PROPERTIES HOLD THE WHOLE THING UP.
 *
 *   NOTHING IS HAND-WRITTEN FOR A FIXTURE. Every metric, every operation, every
 *   quiet-hours minute below is read off the plan under test. A generator that
 *   named `finance-followup` would be evidence about a demo, not about the
 *   workforce someone is trying to activate. Nothing here may mention an id.
 *
 *   THE EXPECTATION IS RE-DERIVED, NEVER BORROWED. `predictAct` below is a
 *   second, deliberately plain implementation of contract §3.10 written from the
 *   contract rather than from `lib/runtime/policy.ts`. Calling `resolveAct` to
 *   decide what `resolveAct` should do would make every case pass by
 *   construction — the sweep would be a coverage report with a gate's name on
 *   it. Two independent readings of the same rule disagreeing is the entire
 *   signal this file exists to produce.
 *
 *   IT PREDICTS THE WHOLE RUN, NOT ONE STEP. The previous generator assumed an
 *   unattended agent inside its limits ACTS, and was measurably wrong about it:
 *   BrightPath's scheduling workflow ends on an `alwaysApprove` operation, so it
 *   pauses whatever the numbers say, and the sweep reported four guardrail
 *   failures against an agent obeying its guardrail. False alarms are how people
 *   learn to click past a gate. `walkWorkflow` therefore runs the same step order
 *   the executor runs and stops where the executor stops.
 *
 * WHAT IT STILL CANNOT SAY. That the agent does its job well — nobody wrote down
 * what "well" means for a workforce that arrived over a seam. Every assertion
 * below is about acting, asking or refusing, and about WHICH of those the plan
 * requires at each point.
 */

/**
 * The magnitudes a generated sweep walks where limits are not consulted at all.
 * Chosen to span three orders and to include zero, because "it asked about
 * $1,200" and "it asked about nothing" are different claims and a mode that held
 * for one has not been shown to hold for the other.
 */
const MAGNITUDES = [0, 1, 95, 500, 1200, 25_000];

/**
 * THE BOUND, stated rather than discovered.
 *
 * Every case is a full stubbed run, so an unbounded generator turns the sandbox
 * gate into something nobody waits for — and a gate nobody waits for is skipped.
 * The ceilings are per workflow and per agent rather than per plan, deliberately:
 * a plan-wide budget spent in listing order would starve the agents at the end of
 * the array, which is the same "only the first one counts" defect this rewrite
 * removes, just moved up a level. Total emitted is therefore at most
 *
 *     agents × (MAX_POLICY_PROBES_PER_AGENT + MAX_RUN_GATE_CASES_PER_AGENT)
 *   + enabled workflows × MAX_METRIC_CASES_PER_WORKFLOW
 *
 * which grows linearly with the plan and never with the square of it. Anything a
 * ceiling refuses is NAMED on `GeneratedSweep.dropped` — a sweep that quietly
 * emitted fewer cases than the plan implies would be the original lie again.
 *
 * NOTE WHAT THE PER-UNIT SHAPE MEANS FOR THE GATE, because it is what lets
 * `runGeneratedStress` refuse a truncated sweep without walling off large plans.
 * These ceilings cannot bite because a plan is BIG: a hundred agents with two
 * limits each emit every case they imply, since each agent is measured against
 * its own budget. A ceiling bites only when ONE agent declares more guardrails
 * than the sandbox will walk — which is precisely the case where the un-walked
 * guardrails are the un-proved ones. So "the ceiling bit" and "this plan has
 * boundaries nobody crossed" are the same statement, and treating the first as
 * grounds for shutting the gate is not a size penalty.
 */
const MAX_METRIC_CASES_PER_WORKFLOW = 16;
const MAX_POLICY_PROBES_PER_AGENT = 8;
const MAX_RUN_GATE_CASES_PER_AGENT = 12;

/**
 * The action every generated case proposes, and the one field in it that is
 * load-bearing: it carries NO STRING VALUES.
 *
 * `auditMetrics` in the executor cross-checks the model's numbers against the
 * records a fetch step returned, and it finds the record by matching STRING
 * arguments against fetched ids. A generated case that put a plausible customer
 * name or invoice reference here would match a stub record, disagree with it on
 * `invoice.amount` — because the whole point is to walk that number past the
 * boundary — and be escalated for a metric dispute instead of for the limit
 * under test. Every prediction below would then be wrong for a reason that has
 * nothing to do with the boundary.
 */
const NEUTRAL_ACTION: Record<string, unknown> = { generated: true };

/* ─────────────── Contract §3.10, read a second time ─────────────── */

/** What the plan requires of one act. Mirrors `PolicyDecision.action`. */
type ActVerdict = "acts" | "asks" | "refuses";

interface Prediction {
  verdict: ActVerdict;
  /**
   * A fragment of the sentence the runtime must give as its reason.
   *
   * Asserted because `refused` and `awaiting_approval` are each produced by
   * several different rules, and "it stopped" is a much weaker claim than "it
   * stopped because this operation is forbidden". A guardrail that fires for the
   * wrong reason is a guardrail nobody has tested. Empty where the run is
   * expected to proceed and there is no reason to give.
   */
  because: string;
}

function satisfies(value: number, op: Op, limit: number): boolean {
  switch (op) {
    case "<":
      return value < limit;
    case "<=":
      return value <= limit;
    case ">":
      return value > limit;
    case ">=":
      return value >= limit;
    case "==":
      return value === limit;
  }
}

/**
 * FAIL CLOSED. A limit whose metric nobody established is not a limit anybody
 * respected, and the six-step order treats it as breached — which is the single
 * most valuable thing this sweep can drive an agent at, because it is the branch
 * that turns missing data into an escalation rather than into a send.
 */
function limitHolds(limit: PolicyLimit, metrics: Record<string, number>): boolean {
  const value = metrics[limit.metric];
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  return satisfies(value, limit.op, limit.value);
}

/**
 * Contract §3.10, in order, written from the contract. See the section header
 * for why this is a second implementation rather than a call into policy.ts.
 */
function predictAct(
  agent: AgentSpec,
  plan: ApprovedPlan,
  granted: ReadonlySet<string>,
  operation: string,
  metrics: Record<string, number>,
): Prediction {
  // 1. Hard deny, agent's own or org-wide. Never softened into an approval.
  if (
    agent.policy.forbidden.includes(operation) ||
    plan.globalPolicy.forbidden.includes(operation)
  ) {
    return { verdict: "refuses", because: "is forbidden for this agent" };
  }

  // 2. Never granted.
  if (!granted.has(operation)) {
    return { verdict: "refuses", because: "was not granted to this agent" };
  }

  // 3. Always-approve beats the operating mode.
  if (agent.policy.alwaysApprove.includes(operation)) {
    return { verdict: "asks", because: "always requires owner approval" };
  }

  // 4/5. Modes that never act unattended.
  if (agent.policy.operatingMode === "draft_only") {
    return { verdict: "asks", because: "prepares work but never acts" };
  }
  if (agent.policy.operatingMode === "act_after_approval") {
    return { verdict: "asks", because: "acts only after owner approval" };
  }

  // 6. The only mode that may proceed alone.
  if (agent.policy.operatingMode === "auto_within_limits") {
    const limits = Array.isArray(agent.policy.limits) ? agent.policy.limits : [];
    const breached = limits.filter((limit) => !limitHolds(limit, metrics));
    if (breached.some((limit) => limit.onBreach === "block")) {
      return { verdict: "refuses", because: "Blocked by limit" };
    }
    if (breached.length > 0) {
      return { verdict: "asks", because: "Needs approval because it" };
    }
    return { verdict: "acts", because: "" };
  }

  // An unrecognised mode is not a risky act awaiting judgement; it means there
  // is no regime to judge it under. The runtime refuses, and so does this.
  return { verdict: "refuses", because: "which this runtime does not implement" };
}

/** The fetch rule: sanctioned, and genuinely read-only. */
function predictFetch(
  agent: AgentSpec,
  plan: ApprovedPlan,
  granted: ReadonlySet<string>,
  operation: string,
): Prediction {
  if (
    agent.policy.forbidden.includes(operation) ||
    plan.globalPolicy.forbidden.includes(operation)
  ) {
    return { verdict: "refuses", because: "is forbidden for this agent" };
  }
  if (!granted.has(operation)) {
    return { verdict: "refuses", because: "was not granted to this agent" };
  }
  if (!isReadOnly(operation)) {
    return { verdict: "refuses", because: "is not read-only" };
  }
  return { verdict: "acts", because: "" };
}

/* ─────────────── The run, predicted end to end ─────────────── */

interface WorkflowWalk {
  finalStatus: RunStatus;
  /** Write operations the run must have performed before it stopped. */
  performed: string[];
  /** Write operations it must never have reached. */
  withheld: string[];
  because: string;
}

/** Write operations an act step from `fromIndex` onward would attempt. */
function writesFrom(workflow: WorkflowSpec, fromIndex: number): Set<string> {
  const writes = new Set<string>();
  for (let i = fromIndex; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    if (step.kind !== "act" || !step.tool) continue;
    if (!isReadOnly(step.tool.operation)) writes.add(step.tool.operation);
  }
  return writes;
}

/**
 * Where this workflow stops, given these numbers.
 *
 * Walks the executor's own step order because the outcome of a RUN is decided by
 * the FIRST step that stops it, not by the step the sweep happens to be
 * interested in. An agent well inside its limits still pauses if a later step is
 * on the always-approve list, and a sweep that predicted "acts" for it would
 * accuse it of breaching a guardrail it was obeying.
 *
 * Returns null when the workflow cannot be predicted at all — a fetch or act
 * step carrying no tool, which validator rules 6 and 7 should have refused at
 * the gate. Guessing there would manufacture a case whose result means nothing;
 * the caller records the workflow as unswept instead, which is the honest answer
 * and a visible one.
 */
function walkWorkflow(
  agent: AgentSpec,
  plan: ApprovedPlan,
  granted: ReadonlySet<string>,
  workflow: WorkflowSpec,
  metrics: Record<string, number>,
): WorkflowWalk | null {
  const performed: string[] = [];

  const stopAt = (index: number, finalStatus: RunStatus, because: string): WorkflowWalk => {
    const done = new Set(performed);
    return {
      finalStatus,
      performed: [...done],
      withheld: [...writesFrom(workflow, index)].filter((op) => !done.has(op)),
      because,
    };
  };

  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];

    if (step.kind === "reason") continue;

    // An explicit checkpoint pauses whatever policy would have said, and the
    // owner is shown the step's own instruction as the reason.
    if (step.kind === "approve") {
      return stopAt(i, "awaiting_approval", step.instruction);
    }

    if (!step.tool) return null;
    const operation = step.tool.operation;

    if (step.kind === "fetch") {
      const read = predictFetch(agent, plan, granted, operation);
      if (read.verdict === "refuses") return stopAt(i, "refused", read.because);
      continue;
    }

    const act = predictAct(agent, plan, granted, operation, metrics);
    if (act.verdict === "acts") {
      if (!isReadOnly(operation)) performed.push(operation);
      continue;
    }
    return stopAt(i, act.verdict === "asks" ? "awaiting_approval" : "refused", act.because);
  }

  return { finalStatus: "completed", performed: [...new Set(performed)], withheld: [], because: "" };
}

/* ─────────────── Turning a walk into a scenario ─────────────── */

interface MetricCase {
  label: string;
  metrics: Record<string, number>;
}

/**
 * The owner never decides, so the run has to be found where the plan says it
 * should have stopped — and a case that asserts `mustCall` as well as
 * `mustNotCall` catches the opposite failure to a leak: a guardrail that fires
 * when the plan said the agent was free to act, which is how an over-cautious
 * workforce quietly stops doing its job.
 */
function stressScenario(
  agent: AgentSpec,
  workflow: WorkflowSpec,
  id: string,
  label: string,
  metrics: Record<string, number>,
  walk: WorkflowWalk,
): SandboxScenario {
  return {
    id,
    name: `${agent.name}: ${label}`,
    description:
      `Generated from ${agent.name}'s own policy: at this point the approved plan ` +
      `requires the run to ${describeStatus(walk.finalStatus)}.`,
    category: SMOKE_CATEGORY,
    agentId: agent.id,
    workflowId: workflow.id,
    reasonScript: {
      __default: {
        summary: `Generated stress point: ${label}.`,
        data: { ...NEUTRAL_ACTION },
        metrics,
      },
    },
    owner: { decision: "leave_pending" },
    expect: {
      finalStatus: walk.finalStatus,
      approvals: walk.finalStatus === "awaiting_approval" ? 1 : 0,
      ...(walk.performed.length > 0 ? { mustCall: walk.performed } : {}),
      ...(walk.withheld.length > 0 ? { mustNotCall: walk.withheld } : {}),
      ...(walk.because.length > 0 ? { reasonContains: walk.because } : {}),
    },
  };
}

function describeStatus(status: RunStatus): string {
  return status === "completed"
    ? "run to the end and act"
    : status === "awaiting_approval"
      ? "stop and ask the owner"
      : "refuse outright";
}

/* ─────────────── The metric families, per workflow ─────────────── */

/**
 * The numbers to drive one workflow at, in the order they are worth keeping.
 *
 * Order is the truncation policy: when a workflow carries more limits than the
 * per-workflow ceiling allows cases for, what survives is what proves the most.
 * Fail-closed goes first because it is the branch that decides what happens when
 * the runtime knows nothing, and knowing nothing is the ordinary state of a
 * workforce nobody has instrumented yet.
 */
function metricCasesFor(agent: AgentSpec): MetricCase[] {
  const limits = Array.isArray(agent.policy.limits) ? agent.policy.limits : [];
  const unattended = agent.policy.operatingMode === "auto_within_limits";

  if (!unattended || limits.length === 0) {
    // Limits are not consulted in this mode, so a magnitude ladder is the honest
    // sweep: it catches a mode that is accidentally magnitude-dependent, which
    // no single case can see.
    return [
      { label: "nothing measured at all", metrics: {} },
      ...MAGNITUDES.map((magnitude) => ({
        label: `magnitude ${magnitude}`,
        metrics: { "generic.amount": magnitude, "generic.count": magnitude },
      })),
    ];
  }

  /**
   * Every OTHER limit satisfied while one is walked.
   *
   * The runtime fails closed on a metric it was never given, so a case supplying
   * only the limit under test leaves the rest unmeasured and the agent escalates
   * — correctly, and for a reason that has nothing to do with the boundary being
   * probed. That is the false alarm that teaches people to ignore the sweep.
   */
  const satisfying = (limit: PolicyLimit): number =>
    limit.op === "<=" || limit.op === "<"
      ? Math.max(0, limit.value - 1)
      : limit.op === ">=" || limit.op === ">"
        ? limit.value + 1
        : limit.value;

  const baseline: Record<string, number> = {};
  for (const limit of limits) baseline[limit.metric] = satisfying(limit);

  const cases: MetricCase[] = [];

  // 1. Fail closed, one limit at a time and then all of them together. The
  //    per-limit form is what names the metric an agent is missing.
  for (const limit of limits) {
    const metrics = { ...baseline };
    delete metrics[limit.metric];
    cases.push({ label: `${limit.metric} never measured`, metrics });
  }
  cases.push({ label: "nothing measured at all", metrics: {} });

  // 2. Each boundary at just-under, exactly-on and just-over, in the direction
  //    its own operator points, so a `<=` written as `<` shows up.
  for (const limit of limits) {
    for (const delta of [-1, 0, 1]) {
      const value = limit.value + delta;
      cases.push({
        label: `${limit.metric} = ${value} against ${limit.op} ${limit.value}`,
        // Baseline first, so the limit under test overrides its own entry — and
        // so two limits sharing a metric interact exactly as the plan says.
        metrics: { ...baseline, [limit.metric]: value },
      });
    }
  }

  // 3. Every limit breached at once. Satisfying one limit can breach another
  //    when they share a metric, and a sweep that only ever moves one number has
  //    not looked at the combination the runtime actually evaluates.
  if (limits.length > 1) {
    const all: Record<string, number> = { ...baseline };
    for (const limit of limits) {
      all[limit.metric] =
        limit.op === "<=" || limit.op === "<"
          ? limit.value + 1
          : limit.op === ">=" || limit.op === ">"
            ? Math.max(0, limit.value - 1)
            : limit.value + 1;
    }
    cases.push({ label: "every limit breached at once", metrics: all });
  }

  return cases;
}

/* ─────────────── The policy probes, per agent ─────────────── */

/**
 * Operations the plan says this agent must never perform, and operations it must
 * always ask about — driven at directly, because neither list is reachable from
 * an approved workflow.
 *
 * A plan that validates cannot contain a step attempting a forbidden operation
 * (rule 3 refuses a plan that both grants and forbids one), so the deny list has
 * no coverage at all unless a scenario constructs it. `specPatch` exists for
 * exactly this: it replaces the workflow's steps on a CLONE with a single act
 * step attempting the operation. Nothing reaches a tool on either path — a deny
 * refuses at step 1 and an always-approve pauses at step 3, both before the
 * invocation is made — so the probe is safe whether or not the integration is
 * even connected.
 *
 * ONE PROBE PER AGENT, NOT PER WORKFLOW, and this is not the defect being fixed
 * elsewhere in this file: `forbidden` and `alwaysApprove` are agent-level, the
 * allowlist is agent-level, and the probe throws the workflow's own steps away.
 * A second workflow would re-prove the identical decision at the cost of another
 * run. The metric families above are per workflow precisely because they are the
 * ones whose answer varies with the steps.
 */
function policyProbesFor(
  agent: AgentSpec,
  plan: ApprovedPlan,
  granted: ReadonlySet<string>,
  host: WorkflowSpec,
): SandboxScenario[] {
  const denied = [
    ...new Set([...agent.policy.forbidden, ...plan.globalPolicy.forbidden]),
  ].sort();
  const alwaysApprove = [...new Set(agent.policy.alwaysApprove)].sort();

  const probes: SandboxScenario[] = [];
  const build = (operation: string, family: "denied" | "always-approve"): void => {
    const prediction = predictAct(agent, plan, granted, operation, {});
    const finalStatus: RunStatus =
      prediction.verdict === "acts"
        ? "completed"
        : prediction.verdict === "asks"
          ? "awaiting_approval"
          : "refused";
    const write = !isReadOnly(operation);

    probes.push({
      id: `stress-${agent.id}-${family}-${operation}`,
      name: `${agent.name}: ${operation} ${family === "denied" ? "is denied" : "always asks"}`,
      description:
        `Generated from ${agent.name}'s own policy: driven straight at ${operation}, ` +
        `which the approved plan ${family === "denied" ? "forbids" : "routes to the owner"}.`,
      category: SMOKE_CATEGORY,
      agentId: agent.id,
      workflowId: host.id,
      // Pure and re-applied to a fresh clone on every run: it closes over two
      // strings and reads nothing it does not also write.
      specPatch: (spec: AgentSpec) => {
        const target = spec.workflows.find((workflow) => workflow.id === host.id);
        if (!target) return;
        const step: StepSpec = {
          id: "probe-1",
          kind: "act",
          instruction: `Attempt ${operation}.`,
          tool: {
            // The registry knows where the operation lives; the id's own prefix
            // is the fallback for an operation it has never heard of. Neither is
            // consulted on the paths this probe walks, because policy stops the
            // run before any client is resolved.
            integrationId: getOperation(operation)?.integrationId ?? operation.split(".")[0],
            operation,
          },
        };
        target.steps = [step];
      },
      owner: { decision: "leave_pending" },
      expect: {
        finalStatus,
        approvals: finalStatus === "awaiting_approval" ? 1 : 0,
        ...(finalStatus === "completed" && write
          ? { mustCall: [operation] }
          : write
            ? { mustNotCall: [operation] }
            : {}),
        ...(prediction.because.length > 0 ? { reasonContains: prediction.because } : {}),
      },
    });
  };

  for (const operation of denied) build(operation, "denied");
  // A denied operation that also appears on the always-approve list is already
  // covered above and resolves identically, so probing it twice buys nothing.
  for (const operation of alwaysApprove) {
    if (denied.includes(operation)) continue;
    build(operation, "always-approve");
  }
  return probes;
}

/* ─────────────── The run-start gate ─────────────── */

/**
 * A case about whether a run may START, as opposed to what it may do once it
 * has.
 *
 * SEPARATE FROM THE SCENARIOS ABOVE BECAUSE IT IS SEPARATE IN THE RUNTIME.
 * Quiet hours and the daily cap are enforced by `resolveRunStart`, which the
 * SCHEDULER calls (lib/runtime/schedule/worker.ts) before it starts anything.
 * The executor never consults them, so a sandbox scenario cannot reach either
 * one: `startRun` would happily run at 3am and the case would pass without
 * having tested anything. Dressing that up as a scenario would be the exact
 * failure this rewrite exists to remove, so these cases say plainly what they
 * are — the plan's declared windows, evaluated against the gate the scheduler
 * gates on.
 *
 * `unprovable` is a first-class outcome rather than a silent omission. A window
 * written "6pm", or in a timezone this runtime cannot resolve, is not a window
 * anybody is enforcing — `isWithinQuietHours` computes NaN and answers "not
 * quiet" — and the honest report of that is a case that fails with the reason
 * named, not one that never appears.
 */
export type RunGateCase =
  | {
      kind: "gate";
      id: string;
      label: string;
      agentId: string;
      /** ISO instant to evaluate at. */
      at: string;
      runsToday: number;
      expect: "allow" | "refuse";
    }
  | { kind: "unprovable"; id: string; label: string; agentId: string; reason: string };

/**
 * Noon Singapore on the sandbox's own demo day, so a gate case and a scenario
 * are talking about the same afternoon. Written out rather than imported from
 * `runner.ts`: this module is a pure generator, and smoke-stress.ts exists to
 * keep it from depending on the runner at all.
 */
const GATE_ANCHOR_MS = Date.UTC(2026, 6, 24, 4, 0, 0);

/**
 * Minutes since local midnight, or null when the plan named a timezone this
 * runtime cannot resolve. `Intl` throws on an unknown IANA id; policy.ts does
 * not catch it, so a plan carrying one takes the scheduler down rather than
 * being quietly ignored — worth reporting either way.
 */
function localMinutesIn(at: Date, timezone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(at);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return (hour % 24) * 60 + minute;
  } catch {
    return null;
  }
}

/**
 * "HH:MM" as minutes since midnight, or null when it is not that.
 *
 * "24:00" normalises to 0, which is the same set of quiet minutes policy.ts
 * computes for it. Anything else non-numeric is REJECTED rather than coerced:
 * `Number("6pm")` is NaN, every comparison against NaN is false, and a window
 * that silently means "never quiet" is a guardrail that was never there.
 */
function minuteOfDay(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 24 || minute > 59 || (hour === 24 && minute !== 0)) return null;
  const total = hour * 60 + minute;
  return total === 1440 ? 0 : total;
}

/**
 * The minutes a window covers, built by walking it forward from `start`.
 *
 * Constructive on purpose. policy.ts decides membership with a pair of
 * comparisons, and re-writing those comparisons here would produce a check that
 * agrees with the bug it is looking for. Enumerating the set instead is a
 * genuinely different derivation, so an off-by-one in either implementation
 * shows up as a disagreement. Bounded at 1440 by construction.
 */
function quietMinutes(window: QuietHours): Set<number> | null {
  const start = minuteOfDay(window.start);
  const end = minuteOfDay(window.end);
  if (start === null || end === null) return null;
  const minutes = new Set<number>();
  // A degenerate window is an empty range: this window is never quiet.
  if (start === end) return minutes;
  for (let m = start; m !== end; m = (m + 1) % 1440) minutes.add(m);
  return minutes;
}

/** The windows that get a vote: it is quiet if EITHER says quiet (contract §3.1). */
function effectiveWindows(agent: AgentSpec, plan: ApprovedPlan): QuietHours[] {
  return [agent.policy.quietHours, plan.globalPolicy.quietHours].filter(
    (window): window is QuietHours => window !== null,
  );
}

/** What the plan requires of a run starting here. Re-derived, never borrowed. */
function predictRunStart(
  agent: AgentSpec,
  plan: ApprovedPlan,
  at: Date,
  runsToday: number,
): "allow" | "refuse" | null {
  for (const window of effectiveWindows(agent, plan)) {
    const minutes = quietMinutes(window);
    if (minutes === null) return null;
    const now = localMinutesIn(at, window.timezone);
    if (now === null) return null;
    if (minutes.has(now)) return "refuse";
  }
  const cap = agent.policy.maxRunsPerDay;
  if (cap !== null && runsToday >= cap) return "refuse";
  return "allow";
}

/**
 * An instant whose local time in `timezone` is `minute` past midnight.
 *
 * Two corrections rather than one: the first lands on the right minute for a
 * fixed offset, the second absorbs a zone whose offset changed between the
 * anchor and the target. Returns null instead of guessing, so a zone this cannot
 * pin down is reported rather than swept at the wrong instant.
 */
function instantAtLocalMinute(timezone: string, minute: number): Date | null {
  let candidate = new Date(GATE_ANCHOR_MS);
  for (let attempt = 0; attempt < 3; attempt++) {
    const have = localMinutesIn(candidate, timezone);
    if (have === null) return null;
    if (have === minute) return candidate;
    let delta = minute - have;
    // The short way round the clock, so 23:59 from 00:01 steps back two minutes
    // rather than forward twenty-three hours into the next day.
    if (delta > 720) delta -= 1440;
    if (delta < -720) delta += 1440;
    candidate = new Date(candidate.getTime() + delta * 60_000);
  }
  return null;
}

function runGateCasesFor(agent: AgentSpec, plan: ApprovedPlan): RunGateCase[] {
  const cases: RunGateCase[] = [];
  const unprovable = (suffix: string, label: string, reason: string): void => {
    cases.push({ kind: "unprovable", id: `gate-${agent.id}-${suffix}`, label, agentId: agent.id, reason });
  };

  /* ── Quiet hours: the minute either side of each edge ── */
  const seen = new Set<string>();
  for (const window of effectiveWindows(agent, plan)) {
    const key = `${window.start}|${window.end}|${window.timezone}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const minutes = quietMinutes(window);
    if (minutes === null) {
      unprovable(
        `window-${seen.size}`,
        `${agent.name}: quiet hours ${window.start}–${window.end}`,
        `"${window.start}" to "${window.end}" is not a pair of HH:MM times, so this window ` +
          `silently enforces nothing and no boundary can be walked.`,
      );
      continue;
    }
    // A degenerate window is documented as "never quiet" and has no edge.
    if (minutes.size === 0) continue;

    const start = minuteOfDay(window.start);
    const end = minuteOfDay(window.end);
    if (start === null || end === null) continue;

    const edges = [...new Set([(start + 1439) % 1440, start, (end + 1439) % 1440, end])];
    for (const edge of edges) {
      const at = instantAtLocalMinute(window.timezone, edge);
      const label = `${agent.name}: ${formatMinute(edge)} ${window.timezone}`;
      if (!at) {
        unprovable(
          `edge-${edge}`,
          label,
          `no instant could be constructed at ${formatMinute(edge)} in "${window.timezone}".`,
        );
        continue;
      }
      const expect = predictRunStart(agent, plan, at, 0);
      if (expect === null) {
        unprovable(`edge-${edge}`, label, `this agent's quiet windows cannot be evaluated.`);
        continue;
      }
      cases.push({
        kind: "gate",
        id: `gate-${agent.id}-edge-${edge}`,
        label: `${label} — must ${expect === "refuse" ? "stay asleep" : "be free to run"}`,
        agentId: agent.id,
        at: at.toISOString(),
        runsToday: 0,
        expect,
      });
    }
  }

  /* ── The daily cap, walked at just-under, exactly-at and just-over ── */
  const cap = agent.policy.maxRunsPerDay;
  if (cap === null) return cases;

  const open = firstOpenInstant(agent, plan);
  if (!open) {
    unprovable(
      "cap",
      `${agent.name}: daily cap of ${cap}`,
      `quiet hours leave no minute of the day open, so no run can ever start and the ` +
        `daily cap cannot be walked.`,
    );
    return cases;
  }

  for (const runsToday of cap > 0 ? [cap - 1, cap, cap + 1] : [cap, cap + 1]) {
    const expect = predictRunStart(agent, plan, open, runsToday);
    if (expect === null) continue;
    cases.push({
      kind: "gate",
      id: `gate-${agent.id}-cap-${runsToday}`,
      label:
        `${agent.name}: ${runsToday} run(s) already today against a cap of ${cap} — ` +
        `must ${expect === "refuse" ? "stay asleep" : "be free to run"}`,
      agentId: agent.id,
      at: open.toISOString(),
      runsToday,
      expect,
    });
  }

  return cases;
}

/** `540` → `09:00`, for a label a human can act on. */
function formatMinute(minute: number): string {
  const hour = Math.floor(minute / 60);
  return `${String(hour).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/**
 * The first minute of the day this agent is free to run, so the daily-cap cases
 * are not silently decided by quiet hours instead. Null when the windows leave
 * nothing open, which is itself worth reporting.
 */
function firstOpenInstant(agent: AgentSpec, plan: ApprovedPlan): Date | null {
  const windows = effectiveWindows(agent, plan);
  const timezone = windows[0]?.timezone ?? "UTC";
  for (let minute = 0; minute < 1440; minute++) {
    const at = instantAtLocalMinute(timezone, minute);
    if (!at) return null;
    if (predictRunStart(agent, plan, at, 0) === "allow") return at;
  }
  return null;
}

/* ─────────────── Assembling the sweep ─────────────── */

/**
 * WHY THIS IS A STRUCTURE AND NOT A STRING ANY MORE, AND WHAT THE STRING LET
 * THROUGH. `dropped` used to be one aggregate sentence per ceiling, and the only
 * thing that ever read it was a `console.warn` inside the server process. So a
 * sweep that walked 40 of the 300 cases a plan implies came back in EXACTLY the
 * shape of one that walked all 300 — same `total`, same `passRate`, same
 * verdict, same green activation checklist — and the one place the shortfall was
 * written down was a log line on a machine nobody is reading while they click
 * Go Live. That is this repository's signature defect, restated: a gate
 * reporting cover it does not have.
 *
 * A sentence cannot be judged. These fields can:
 *
 *   `implied` / `emitted` are what make a shortfall a NUMBER a caller can put in
 *   front of a person, instead of a phrase it would have to parse.
 *
 *   `reducesCover` is the field the gate reads, and it is the whole reason the
 *   three kinds are distinguished rather than counted together. Two of them mean
 *   a boundary the plan declares was never crossed. The third means there was no
 *   boundary. Treating those alike would either open the gate on missing
 *   evidence or shut it on an honest zero, and both of those are ways to stop
 *   being believed.
 */
export type SweepOmissionKind =
  /** A per-workflow or per-agent ceiling trimmed cases the plan implies. */
  | "ceiling"
  /** A fetch or act step declares no tool, so no honest case can be built. */
  | "unprovable"
  /** The agent has no enabled workflow: nothing runs, so nothing is swept. */
  | "nothing-to-sweep";

export interface SweepOmission {
  kind: SweepOmissionKind;
  /** `agent`, or `agent/workflow` — whichever the omission is about. */
  scope: string;
  /** Cases this scope implies. */
  implied: number;
  /** Cases the sweep actually emitted for it. */
  emitted: number;
  /**
   * True when a boundary the plan DECLARES went unwalked, which is missing
   * evidence and must weigh on the gate. False only for `nothing-to-sweep`,
   * where the plan declares nothing to walk — see `stressSweepFor`.
   */
  reducesCover: boolean;
  /** The sentence a person reads. Names the scope, the numbers and the remedy. */
  detail: string;
}

export interface GeneratedSweep {
  /** Cases run end to end through the executor. */
  scenarios: SandboxScenario[];
  /** Cases about whether a run may start at all; see `RunGateCase`. */
  runGates: RunGateCase[];
  /**
   * One entry per thing the plan implies and this sweep did not emit — a ceiling
   * that bit, a workflow too malformed to predict, an agent with nothing enabled
   * to sweep. Never empty-and-silent: an omission nobody can see is how the
   * sweep came to claim cover it did not have in the first place.
   */
  dropped: SweepOmission[];
  /** Cases this plan implies in total: `emittedCases` plus every shortfall. */
  impliedCases: number;
  /** Cases this sweep actually emitted: scenarios plus run-start gates. */
  emittedCases: number;
}

/**
 * Trims to `limit`, recording the shortfall as a countable omission.
 *
 * WHAT THE TRIM ACTUALLY COSTS, said here because the number alone understates
 * it. `slice(0, limit)` keeps the cases the generator emitted FIRST, and
 * `metricCasesFor` emits every limit's fail-closed case before it emits any
 * limit's boundary ladder. So an agent whose limits overflow this ceiling loses
 * the boundary walk for the limits at the END of its array — not a thinner
 * sample of every limit, but total silence about some of them. That asymmetry
 * is why the shortfall is reported as missing evidence rather than as a
 * proportionate sample, and why `runGeneratedStress` refuses to call a truncated
 * sweep proof.
 */
function capped<T>(cases: T[], limit: number, scope: string, dropped: SweepOmission[]): T[] {
  if (cases.length <= limit) return cases;
  dropped.push({
    kind: "ceiling",
    scope,
    implied: cases.length,
    emitted: limit,
    reducesCover: true,
    detail:
      `${scope}: the plan implies ${cases.length} case(s) here and the sweep walks ${limit}. ` +
      `The other ${cases.length - limit} were never run, so the boundaries they would have ` +
      `crossed are unproven. The ceilings are constants in lib/runtime/sandbox/smoke.ts; ` +
      `raise one deliberately, or declare fewer guardrails on this agent than the sandbox ` +
      `is willing to walk.`,
  });
  return cases.slice(0, limit);
}

/**
 * The generated sweep for one plan: every enabled workflow of every agent walked
 * at its own boundaries, every deny and every always-approve driven at directly,
 * and the run-start gate walked at the edges the plan declares.
 */
export function stressSweepFor(plan: ApprovedPlan): GeneratedSweep {
  const scenarios: SandboxScenario[] = [];
  const runGates: RunGateCase[] = [];
  const dropped: SweepOmission[] = [];

  for (const agent of plan.agents) {
    const granted = new Set(flattenOperations(agent));
    const enabled = agent.workflows.filter((workflow) => workflow.enabled);

    if (enabled.length === 0) {
      // THE ONE OMISSION THAT IS NOT MISSING EVIDENCE, and the reason
      // `reducesCover` is a field rather than an assumption. An agent with no
      // enabled workflow runs nothing, so there is no boundary this sweep
      // failed to walk — a zero here is the honest answer, not a hole in one.
      //
      // It is also already refused, by name, at the gate that should refuse it:
      // `smokeScenariosFor` emits no scenario for such an agent, so `runSuite`
      // reports `total: 0` for it and blocks with "Agent … has no scenarios."
      // Failing it a second time from the sweep would put two red lines on the
      // checklist for one fact, and the weaker of the two would be the one that
      // did not explain itself.
      dropped.push({
        kind: "nothing-to-sweep",
        scope: agent.id,
        implied: 0,
        emitted: 0,
        reducesCover: false,
        detail:
          `${agent.id}: no enabled workflow, so this agent declares no boundary to sweep. ` +
          `No cover was lost here — the scenario suite refuses this agent separately, for ` +
          `having no evidence at all.`,
      });
    }

    /* Every enabled workflow, not the first one. This is the defect. */
    for (const workflow of enabled) {
      const cases = metricCasesFor(agent);
      const built: SandboxScenario[] = [];
      let unpredictable = false;

      for (const metricCase of cases) {
        const walk = walkWorkflow(agent, plan, granted, workflow, metricCase.metrics);
        if (!walk) {
          unpredictable = true;
          break;
        }
        built.push(
          stressScenario(
            agent,
            workflow,
            `stress-${agent.id}-${workflow.id}-${built.length + 1}`,
            metricCase.label,
            metricCase.metrics,
            walk,
          ),
        );
      }

      if (unpredictable) {
        // MISSING EVIDENCE, not an honest zero. This workflow is ENABLED: it
        // will be scheduled and it will run. The generator simply cannot say
        // what it should do, so the sweep proves nothing about it while the
        // plan-level counts would otherwise read as though it had.
        dropped.push({
          kind: "unprovable",
          scope: `${agent.id}/${workflow.id}`,
          implied: cases.length,
          emitted: 0,
          reducesCover: true,
          detail:
            `${agent.id}/${workflow.id}: a fetch or act step declares no tool, so the run ` +
            `cannot be predicted and none of the ${cases.length} case(s) this workflow ` +
            `implies could be built honestly. The workflow is enabled, so it will run live ` +
            `with nothing proved about it.`,
        });
        continue;
      }

      scenarios.push(
        ...capped(built, MAX_METRIC_CASES_PER_WORKFLOW, `${agent.id}/${workflow.id}`, dropped),
      );
    }

    /* Agent-level policy, hosted on any enabled workflow — see policyProbesFor. */
    const host = enabled[0];
    if (host) {
      scenarios.push(
        ...capped(
          policyProbesFor(agent, plan, granted, host),
          MAX_POLICY_PROBES_PER_AGENT,
          `${agent.id} policy probes`,
          dropped,
        ),
      );
    }

    runGates.push(
      ...capped(
        runGateCasesFor(agent, plan),
        MAX_RUN_GATE_CASES_PER_AGENT,
        `${agent.id} run-start gate`,
        dropped,
      ),
    );
  }

  /*
   * The two numbers a person actually asks for — "how much of my plan did this
   * prove?" — computed here rather than left for each caller to re-derive.
   *
   * `implied` minus `emitted` is the shortfall for every kind: a ceiling that
   * kept `limit` of `n`, an unprovable workflow that kept 0 of `n`, and an
   * agent with nothing to sweep that kept 0 of 0. So one sum covers all three
   * without a branch, and `nothing-to-sweep` contributes nothing to the total,
   * which is exactly right — it implied nothing.
   */
  const emittedCases = scenarios.length + runGates.length;
  const impliedCases =
    emittedCases + dropped.reduce((total, omission) => total + omission.implied - omission.emitted, 0);

  return { scenarios, runGates, dropped, impliedCases, emittedCases };
}
