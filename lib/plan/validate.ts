/**
 * lib/plan/validate.ts — the handoff gate (contract §6).
 *
 * The entire integration risk between the two lanes is "D emitted something
 * Role C cannot run". This file reduces that risk to one green/red check, run
 * before a plan is ever built into agent packages.
 *
 * Two principles shape it:
 *
 *   1. Fail closed. Anything the registry does not recognise is treated as
 *      unsafe, never as harmless. An unknown operation is not read-only, so a
 *      `fetch` step cannot smuggle a side effect through the ungated path.
 *   2. Report everything. The validator never short-circuits on the first
 *      failure: D wants the whole list, not a game of whack-a-mole. Errors
 *      block the handoff, warnings are advisory and do not.
 *
 * The sixteen contract rules are all SEMANTIC — they ask whether a well-formed
 * plan makes sense — so they run behind a structural pass (rule 0) that first
 * establishes the plan is well-formed at all. Without it every rule passes
 * vacuously on a truncated hand-off, because every rule is a loop over a
 * collection and a missing collection reads as empty.
 *
 * Determinism matters as much here as in the runtime (M3): no clock, no
 * randomness, no I/O. The same plan always yields the same list, in the same
 * order (structural findings first, then plan order: outcomes, then agents,
 * then workflows, then steps).
 */

import {
  getOperation,
  isKnownOperation,
  isReadOnly,
  operationsFor,
} from "./operations";
import { isOperatingMode, OPERATING_MODES } from "./types";
import { isKnownUser } from "./users";
import type {
  AgentPolicy,
  AgentSpec,
  ApprovedPlan,
  BusinessOutcome,
  Capability,
  FailurePolicy,
  Op,
  OutcomeMetric,
  OutputSpec,
  PlanValidationError,
  PolicyLimit,
  QuietHours,
  RiskLevel,
  StepKind,
  StepSpec,
  TriggerSpec,
  WorkflowSpec,
} from "./types";

/* ═══════════════════════ Structural helpers ═══════════════════════ */

/**
 * Plans arrive as JSON over the seam (and later over the wire in M4), so the
 * declared types are a promise, not a guarantee. Missing collections degrade
 * to empty rather than throwing part-way through validation.
 */
function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The entries of a collection that can safely be dereferenced. A single `null`
 * inside `agents` would otherwise take the whole gate down with a TypeError at
 * the first property access — and the gate's job is to hand D a list, not a
 * stack trace. Rule 0 reports the dropped entries; the rules below skip them.
 */
function objectsIn<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value.filter(isObject) as T[]) : [];
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** 24-hour HH:MM, which is what QuietHours.start and .end promise to be. */
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

function isHhMm(value: unknown): boolean {
  return typeof value === "string" && HH_MM.test(value);
}

/**
 * A union's members as a runtime set.
 *
 * `Record<T, true>` is what makes this trustworthy: TypeScript demands every
 * member of the union as a key and rejects anything that is not one, so adding
 * a value to a union in types.ts breaks compilation here until this list
 * catches up. A hand-typed `string[]` would silently drift out of step with the
 * type it mirrors — the exact defect class these membership checks exist to
 * catch. (`OperatingMode` is the one union that needs its member list in three
 * modules, so types.ts exports it directly as OPERATING_MODES.)
 */
function membersOf<T extends string>(map: Record<T, true>): ReadonlySet<string> {
  return new Set(Object.keys(map));
}

const OPS = membersOf<Op>({ "<": true, "<=": true, ">": true, ">=": true, "==": true });
const RISK_LEVELS = membersOf<RiskLevel>({ low: true, medium: true, high: true });
const STEP_KINDS = membersOf<StepKind>({
  fetch: true,
  reason: true,
  act: true,
  approve: true,
});
const TRIGGER_KINDS = membersOf<TriggerSpec["kind"]>({
  schedule: true,
  event: true,
  threshold: true,
  dependency: true,
  manual: true,
});
const OUTPUT_KINDS = membersOf<OutputSpec["kind"]>({
  draft: true,
  message: true,
  record_update: true,
  booking: true,
  report: true,
});
const ON_EXHAUSTED = membersOf<FailurePolicy["onExhausted"]>({
  escalate: true,
  notify_owner: true,
  fail_silent: true,
});
const ON_BREACH = membersOf<PolicyLimit["onBreach"]>({
  require_approval: true,
  block: true,
});
const PRIORITIES = membersOf<BusinessOutcome["priority"]>({
  high: true,
  medium: true,
  low: true,
});
const DIRECTIONS = membersOf<OutcomeMetric["direction"]>({
  decrease: true,
  increase: true,
});

function list(members: ReadonlySet<string>): string {
  return [...members].join(", ");
}

/* ═══════════════════════ Cron and timezone ═══════════════════════ */

/**
 * minute, hour, day-of-month, month, day-of-week.
 * Day-of-week allows 7 as well as 0 because both spell Sunday in crontab.
 */
const CRON_FIELD_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];

const NUMERIC = /^\d+$/;

/** One comma-separated term: a star, a star-slash step, a number, or a range. */
function isCronTerm(term: string, min: number, max: number): boolean {
  if (term === "*") return true;

  if (term.startsWith("*/")) {
    const stepText = term.slice(2);
    if (!NUMERIC.test(stepText)) return false;
    const step = Number(stepText);
    // A step of 0 never advances, and a step wider than the field is a typo.
    return step >= 1 && step <= max;
  }

  // indexOf > 0 so a leading "-" is rejected rather than read as a range.
  const dash = term.indexOf("-");
  if (dash > 0) {
    const fromText = term.slice(0, dash);
    const toText = term.slice(dash + 1);
    if (!NUMERIC.test(fromText) || !NUMERIC.test(toText)) return false;
    const from = Number(fromText);
    const to = Number(toText);
    return from >= min && to <= max && from <= to;
  }

  if (!NUMERIC.test(term)) return false;
  const value = Number(term);
  return value >= min && value <= max;
}

function isCronField(field: string, min: number, max: number): boolean {
  if (field.length === 0) return false;
  return field.split(",").every((term) => isCronTerm(term, min, max));
}

/**
 * A deliberately small 5-field cron parser: no dependency, no seconds field,
 * no named months or weekdays. The scheduler (M4) only ever emits numeric
 * crons, so accepting more here would let unschedulable plans through.
 */
export function isValidCron(expression: string): boolean {
  if (typeof expression !== "string") return false;
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== CRON_FIELD_RANGES.length) return false;
  return fields.every((field, index) => {
    const range = CRON_FIELD_RANGES[index];
    if (!range) return false; // unreachable, but keeps the index access honest
    return isCronField(field, range[0], range[1]);
  });
}

/**
 * The platform's own tz database is the only authority worth trusting here,
 * so ask Intl and treat a throw as "not an IANA zone".
 */
export function isValidTimezone(timezone: string): boolean {
  if (!isNonEmptyString(timezone)) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/* ═════════════════ Rule 0 — the structural pre-pass ═════════════════ */

/**
 * Every rule in §6 assumes a plan whose required fields are present and whose
 * union fields hold real members. Nothing established that. A plan missing
 * `approvedBy`, `reportVersion` and every `agent.version`, carrying junk in
 * four different unions, used to validate completely clean — and an entirely
 * empty plan still reported ready at the Activation gate, because a collection
 * with nothing in it satisfies a loop over it.
 *
 * Rule 0 is that missing precondition. It is numbered 0 rather than 17 because
 * it is not a seventeenth policy question but the ground the other sixteen
 * stand on, and `validateApprovedPlan` already reported a wholly missing plan
 * under rule 0 before this pass existed.
 *
 * Three limits keep it proportionate:
 *   - It asks whether a field is PRESENT and the right shape, never whether its
 *     content is sensible. "Is this cron parseable" stays rule 4.
 *   - It reports; it never throws and never short-circuits. A malformed
 *     hand-off must come back as a list D can act on.
 *   - Where an existing rule already owns a field, rule 0 stays out of its way:
 *     `operatingMode` membership is rule 2's, `approvalOwner` is rule 8's.
 *
 * Note for the contract: docs/PLAN_CONTRACT.md §6 lists sixteen rules and does
 * not yet carry a row for rule 0. Add one when this lands with D, so the table
 * and the gate keep saying the same thing.
 */

type Scope = Pick<
  PlanValidationError,
  "agentId" | "workflowId" | "stepId" | "outcomeId" | "capabilityId"
>;

type Fail = (message: string, scope?: Scope) => void;

/** A readable stand-in so a message about a missing id is still locatable. */
function idOr(value: unknown, fallback: string): string {
  return isNonEmptyString(value) ? String(value) : fallback;
}

/**
 * `null` is a legal QuietHours — it means "no window" — and so is an omitted
 * key, which the runtime reads identically. Anything else present has to be a
 * window the scheduler can actually parse.
 */
function checkQuietHours(
  window: QuietHours | null | undefined,
  owner: string,
  scope: Scope,
  fail: Fail,
): void {
  if (window === null || window === undefined) return;
  if (!isObject(window)) {
    fail(`${owner} quietHours is ${typeof window}, not a window object or null.`, scope);
    return;
  }
  if (!isHhMm(window.start) || !isHhMm(window.end)) {
    fail(
      `${owner} quietHours is "${String(window.start)}" to "${String(window.end)}", which is not 24-hour HH:MM. The runtime parses these into minutes since midnight, so an unparseable value reads as 00:00 and silently becomes a different window from the one the plan meant.`,
      scope,
    );
  }
  if (!isValidTimezone(window.timezone)) {
    fail(
      `${owner} quietHours names timezone "${String(window.timezone)}", which is not an IANA zone. Intl throws on it, and in M4's worker loop that kills the scheduler tick rather than one run.`,
      scope,
    );
  }
}

function checkPolicy(policy: AgentPolicy, label: string, scope: Scope, fail: Fail): void {
  // operatingMode is deliberately absent here: rule 2 owns it, so that one
  // finding carries the rule number D's table already knows.

  if (!Array.isArray(policy.limits)) {
    fail(
      `Agent "${label}" has no policy.limits array. The enforcement layer iterates it directly.`,
      scope,
    );
  } else {
    for (const limit of objectsIn<PolicyLimit>(policy.limits)) {
      const limitLabel = idOr(limit.id, "(limit with no id)");
      if (!isNonEmptyString(limit.id)) {
        fail(`Agent "${label}" has a policy limit with no id. Breached limit ids are what an approval card cites.`, scope);
      }
      if (!isNonEmptyString(limit.metric)) {
        fail(`Limit "${limitLabel}" on agent "${label}" names no metric, so nothing can ever measure it.`, scope);
      }
      if (!OPS.has(limit.op as string)) {
        fail(`Limit "${limitLabel}" on agent "${label}" uses comparison "${String(limit.op)}". Expected one of ${list(OPS)}.`, scope);
      }
      if (!isFiniteNumber(limit.value)) {
        fail(`Limit "${limitLabel}" on agent "${label}" has value ${String(limit.value)}, which is not a finite number. Every comparison against it would be false, so the limit would read as permanently breached.`, scope);
      }
      if (!ON_BREACH.has(limit.onBreach as string)) {
        fail(`Limit "${limitLabel}" on agent "${label}" declares onBreach "${String(limit.onBreach)}". Expected one of ${list(ON_BREACH)} — this is the field that decides whether a breach refuses or asks.`, scope);
      }
    }
  }

  if (!Array.isArray(policy.alwaysApprove)) {
    fail(`Agent "${label}" has no policy.alwaysApprove array.`, scope);
  }
  if (!Array.isArray(policy.forbidden)) {
    fail(`Agent "${label}" has no policy.forbidden array. An absent hard-deny list reads as "nothing is denied".`, scope);
  }
  if (!isFiniteNumber(policy.escalateAfterMins)) {
    fail(`Agent "${label}" has escalateAfterMins ${String(policy.escalateAfterMins)}, which is not a finite number. Approval due times are computed from it.`, scope);
  }
  if (policy.maxRunsPerDay !== null && policy.maxRunsPerDay !== undefined && !isFiniteNumber(policy.maxRunsPerDay)) {
    fail(`Agent "${label}" has maxRunsPerDay ${String(policy.maxRunsPerDay)}. Expected a number or null.`, scope);
  }

  checkQuietHours(policy.quietHours, `Agent "${label}"`, scope, fail);
}

function checkWorkflow(workflow: WorkflowSpec, scope: Scope, fail: Fail): void {
  const label = idOr(workflow.id, "(workflow with no id)");

  if (!isNonEmptyString(workflow.id)) {
    fail("A workflow has no id. Runs, schedules and dependency triggers all address it by id.", scope);
  }
  if (typeof workflow.enabled !== "boolean") {
    fail(
      `Workflow "${label}" has no boolean \`enabled\` flag, so it reads as disabled and would silently never run.`,
      scope,
    );
  }

  const trigger: unknown = workflow.trigger;
  if (!isObject(trigger)) {
    fail(`Workflow "${label}" declares no trigger, so nothing could ever start it.`, scope);
  } else if (!TRIGGER_KINDS.has(String(workflow.trigger.kind))) {
    fail(
      `Workflow "${label}" has trigger kind "${String(workflow.trigger.kind)}". Expected one of ${list(TRIGGER_KINDS)}; the scheduler registers nothing for a kind it cannot read.`,
      scope,
    );
  } else if (workflow.trigger.kind === "threshold") {
    if (!OPS.has(workflow.trigger.op as string)) {
      fail(`Threshold trigger on workflow "${label}" uses comparison "${String(workflow.trigger.op)}". Expected one of ${list(OPS)}.`, scope);
    }
    if (!isFiniteNumber(workflow.trigger.value)) {
      fail(`Threshold trigger on workflow "${label}" has value ${String(workflow.trigger.value)}, which is not a finite number, so the threshold could never be crossed.`, scope);
    }
    if (!isNonEmptyString(workflow.trigger.metric)) {
      fail(`Threshold trigger on workflow "${label}" names no metric to watch.`, scope);
    }
  } else if (workflow.trigger.kind === "event") {
    if (!isNonEmptyString(workflow.trigger.integrationId) || !isNonEmptyString(workflow.trigger.event)) {
      fail(
        `Event trigger on workflow "${label}" is "${String(workflow.trigger.integrationId)}" / "${String(workflow.trigger.event)}". Both an integration and an event name are needed before anything can be subscribed to.`,
        scope,
      );
    }
  }

  // Rule 10 already reports a MISSING output on an enabled workflow; rule 0
  // adds the union member, and does it for disabled workflows too — a disabled
  // workflow is one edit away from being the thing that runs.
  const output: unknown = workflow.output;
  if (isObject(output) && !OUTPUT_KINDS.has(String(workflow.output.kind))) {
    fail(
      `Workflow "${label}" declares output kind "${String(workflow.output.kind)}". Expected one of ${list(OUTPUT_KINDS)}.`,
      scope,
    );
  }

  const onFailure: unknown = workflow.onFailure;
  if (!isObject(onFailure)) {
    fail(
      `Workflow "${label}" declares no onFailure policy, so a failing tool call has no retry budget and no exhaustion behaviour.`,
      scope,
    );
  } else {
    if (!isNonNegativeInteger(workflow.onFailure.retries)) {
      fail(`Workflow "${label}" has onFailure.retries ${String(workflow.onFailure.retries)}. Expected a non-negative whole number.`, scope);
    }
    if (!isNonNegativeInteger(workflow.onFailure.backoffSeconds)) {
      fail(`Workflow "${label}" has onFailure.backoffSeconds ${String(workflow.onFailure.backoffSeconds)}. Expected a non-negative whole number.`, scope);
    }
    if (!ON_EXHAUSTED.has(String(workflow.onFailure.onExhausted))) {
      fail(`Workflow "${label}" has onFailure.onExhausted "${String(workflow.onFailure.onExhausted)}". Expected one of ${list(ON_EXHAUSTED)}.`, scope);
    }
  }

  for (const step of objectsIn<StepSpec>(workflow.steps)) {
    const stepScope: Scope = { ...scope, stepId: isNonEmptyString(step.id) ? step.id : undefined };
    const stepLabel = idOr(step.id, "(step with no id)");

    if (!isNonEmptyString(step.id)) {
      fail(
        `A step in workflow "${label}" has no id. The executor keys accumulated run state by step id, so an absent one collides with every other absent one.`,
        stepScope,
      );
    }
    if (!STEP_KINDS.has(String(step.kind))) {
      fail(
        `Step "${stepLabel}" in workflow "${label}" has kind "${String(step.kind)}". Expected one of ${list(STEP_KINDS)}; the executor has no handler for anything else.`,
        stepScope,
      );
    }
    if (!isNonEmptyString(step.instruction)) {
      fail(
        `Step "${stepLabel}" in workflow "${label}" carries no instruction. It is the prose half of the step and the only thing the model is told to do.`,
        stepScope,
      );
    }
    if (step.risk !== undefined && !RISK_LEVELS.has(String(step.risk))) {
      fail(
        `Step "${stepLabel}" in workflow "${label}" declares risk "${String(step.risk)}". Expected one of ${list(RISK_LEVELS)}.`,
        stepScope,
      );
    }
  }
}

function checkOutcome(outcome: BusinessOutcome, fail: Fail): void {
  const label = idOr(outcome.id, "(outcome with no id)");
  const scope: Scope = { outcomeId: isNonEmptyString(outcome.id) ? outcome.id : undefined };

  if (!isNonEmptyString(outcome.id)) {
    fail("A business outcome has no id. Rule 13 matches agents to outcomes by it.", scope);
  }
  if (!isNonEmptyString(outcome.name)) {
    fail(`Outcome "${label}" has no name, so the Workspace has nothing to label its progress with.`, scope);
  }
  if (!PRIORITIES.has(String(outcome.priority))) {
    fail(`Outcome "${label}" has priority "${String(outcome.priority)}". Expected one of ${list(PRIORITIES)}.`, scope);
  }
  // Presence only. Nothing in §6 resolves an outcome owner the way rule 8
  // resolves approvalOwner, and enforcing ahead of the rule table is how the
  // gate and the contract drift apart in the other direction.
  if (!isNonEmptyString(outcome.owner)) {
    fail(`Outcome "${label}" has no owner.`, scope);
  }
  if (!Array.isArray(outcome.agentIds)) {
    fail(`Outcome "${label}" has no agentIds array. It is the only place the outcome-to-agent relationship is stored.`, scope);
  }

  for (const metric of objectsIn<OutcomeMetric>(outcome.metrics)) {
    const metricLabel = idOr(metric.id, "(metric with no id)");
    if (!isNonEmptyString(metric.metric)) {
      fail(`Metric "${metricLabel}" on outcome "${label}" names no metric key.`, scope);
    }
    if (!isNonEmptyString(metric.label)) {
      fail(`Metric "${metricLabel}" on outcome "${label}" has no label to render.`, scope);
    }
    if (!DIRECTIONS.has(String(metric.direction))) {
      fail(`Metric "${metricLabel}" on outcome "${label}" has direction "${String(metric.direction)}". Expected one of ${list(DIRECTIONS)} — without it, progress cannot be read as good or bad.`, scope);
    }
    if (metric.baseline !== null && !isFiniteNumber(metric.baseline)) {
      fail(`Metric "${metricLabel}" on outcome "${label}" has baseline ${String(metric.baseline)}. Expected a number, or null where nothing has been measured yet.`, scope);
    }
  }
}

/** Reports everything rule 0 owns. Never throws; never returns early. */
function checkStructure(plan: ApprovedPlan, errors: PlanValidationError[]): void {
  const fail: Fail = (message, scope = {}) => {
    errors.push({ severity: "error", rule: 0, ...scope, message });
  };

  /* ── Plan header ── */

  if (!isNonEmptyString(plan.planId)) fail("Plan has no planId.");
  // What this protects: an act step executing through the wrong business's
  // connected accounts. `organizationId` is the plan's answer to "whose Gmail is
  // about to send", and it is the only answer the runtime is allowed to use —
  // the process-wide fallback exists solely for the built-in fixture, which has
  // no owner. So a plan that arrives without one must be stopped at the gate
  // rather than left to be resolved later by whatever the server was configured
  // with. Blank counts as absent: the ingest adapter emits an empty string when
  // Role B's payload names no organization, and that is the shape that would
  // otherwise reach execution.
  if (!isNonEmptyString(plan.organizationId)) {
    fail(
      "Plan has no organizationId, so nothing records which business this workforce belongs to. It is the field credentials are resolved from, and a plan without one either cannot execute a single tool or executes through some other customer's connected accounts.",
    );
  }
  if (!isFiniteNumber(plan.version)) {
    fail(`Plan has version ${String(plan.version)}, which is not a number. Re-approval is detected by comparing it.`);
  }
  if (!isNonEmptyString(plan.approvedAt)) fail("Plan has no approvedAt timestamp.");
  if (!isNonEmptyString(plan.approvedBy)) fail("Plan has no approvedBy user id, so nothing records who authorised this workforce.");
  if (!isFiniteNumber(plan.reportVersion)) {
    fail(
      `Plan has reportVersion ${String(plan.reportVersion)}, which is not a number. Contract §3.1 puts it there specifically so Role C can tell the plan is stale relative to a re-approved company report.`,
    );
  }

  const globalPolicy: unknown = plan.globalPolicy;
  if (!isObject(globalPolicy)) {
    fail("Plan has no globalPolicy object. Org-wide denies are how a plan constrains every agent at once.");
  } else {
    if (!Array.isArray(plan.globalPolicy.forbidden)) {
      fail("globalPolicy.forbidden is not an array. An absent org-wide deny list reads as \"nothing is denied\".");
    }
    checkQuietHours(plan.globalPolicy.quietHours, "globalPolicy", {}, fail);
  }

  /* ── The two mandatory collections ──
     Absent and empty get different messages: they point at different upstream
     faults — a hand-off that broke in transit, versus a plan D genuinely
     emitted with nothing in it. */

  if (!Array.isArray(plan.agents)) {
    fail("Plan has no `agents` array. Check the hand-off was not truncated or the field mis-keyed.");
  } else if (plan.agents.length === 0) {
    fail(
      "Plan contains no agents. Every rule below would pass vacuously, and the build gate derives readiness from missing packages — so an empty plan reaches Activation reporting ready, as a workforce with nobody in it.",
    );
  }

  if (!Array.isArray(plan.businessOutcomes)) {
    fail("Plan has no `businessOutcomes` array. Check the hand-off was not truncated or the field mis-keyed.");
  } else if (plan.businessOutcomes.length === 0) {
    // Warning, not error, to stay consistent with rules 15 and 16: outcome
    // coverage is advisory throughout the table, and a plan with agents already
    // earns one rule-15 warning per agent.
    errors.push({
      severity: "warning",
      rule: 0,
      message:
        "Plan declares no business outcomes, so the Workspace has nothing to report the workforce's progress against.",
    });
  }

  /* ── Entries that cannot be read at all ── */

  reportUnreadable(plan.agents, "agents", fail);
  reportUnreadable(plan.businessOutcomes, "businessOutcomes", fail);

  /* ── Agents ── */

  for (const agent of objectsIn<AgentSpec>(plan.agents)) {
    const label = idOr(agent.id, "(agent with no id)");
    const scope: Scope = { agentId: isNonEmptyString(agent.id) ? agent.id : undefined };

    if (!isNonEmptyString(agent.id)) {
      fail("An agent has no id. Packages, runs, approvals and outcome references are all keyed by it.", scope);
    }
    if (!isFiniteNumber(agent.version)) {
      fail(
        `Agent "${label}" has version ${String(agent.version)}, which is not a number. The Agent Factory rebuilds per agent keyed on the version, so it could never be rebuilt.`,
        scope,
      );
    }
    if (!isNonEmptyString(agent.name)) fail(`Agent "${label}" has no name.`, scope);
    if (!isNonEmptyString(agent.role)) fail(`Agent "${label}" has no role.`, scope);

    const guidance: unknown = agent.guidance;
    if (!isObject(guidance)) {
      fail(
        `Agent "${label}" has no guidance object. The Factory dereferences guidance.objective when it compiles the system prompt, so this fails at build time rather than here.`,
        scope,
      );
    } else {
      if (!isNonEmptyString(agent.guidance.objective)) {
        fail(`Agent "${label}" has no guidance.objective, which is the first line of its system prompt.`, scope);
      }
      if (!isNonEmptyString(agent.guidance.businessContext)) {
        fail(`Agent "${label}" has no guidance.businessContext, so the prompt never says which business it works for.`, scope);
      }
    }

    const policy: unknown = agent.policy;
    if (!isObject(policy)) {
      // Rule 8 reports the unreachable approval owner that follows from this;
      // rule 0 reports the missing object itself.
      fail(`Agent "${label}" has no policy object, so nothing constrains what it may do.`, scope);
    } else {
      checkPolicy(agent.policy, label, scope, fail);
    }

    reportUnreadable(agent.workflows, `agent "${label}" workflows`, fail, scope);
    reportUnreadable(agent.capabilities, `agent "${label}" capabilities`, fail, scope);

    for (const capability of objectsIn<Capability>(agent.capabilities)) {
      if (!isNonEmptyString(capability.id)) {
        fail(`Agent "${label}" has a capability with no id.`, scope);
      }
      if (!Array.isArray(capability.backedBy)) {
        fail(
          `Capability "${idOr(capability.id, "(no id)")}" on agent "${label}" has no backedBy array, so rule 14 cannot check it against the agent's grants.`,
          { ...scope, capabilityId: isNonEmptyString(capability.id) ? capability.id : undefined },
        );
      }
    }

    for (const workflow of objectsIn<WorkflowSpec>(agent.workflows)) {
      const workflowScope: Scope = {
        ...scope,
        workflowId: isNonEmptyString(workflow.id) ? workflow.id : undefined,
      };
      reportUnreadable(workflow.steps, `workflow "${idOr(workflow.id, "(no id)")}" steps`, fail, workflowScope);
      checkWorkflow(workflow, workflowScope, fail);
    }
  }

  /* ── Business outcomes ── */

  for (const outcome of objectsIn<BusinessOutcome>(plan.businessOutcomes)) {
    checkOutcome(outcome, fail);
  }
}

/** Names the entries objectsIn() had to drop, so they are not silently lost. */
function reportUnreadable(value: unknown, label: string, fail: Fail, scope: Scope = {}): void {
  if (!Array.isArray(value)) return;
  value.forEach((entry, index) => {
    if (!isObject(entry)) {
      fail(
        `${label}[${index}] is ${entry === null ? "null" : typeof entry}, not an object. Nothing below can read it, so it is skipped entirely.`,
        scope,
      );
    }
  });
}

/* ═══════════════════════════ The validator ═══════════════════════════ */

/** Returns [] when the plan is safe to build. Any "error" blocks handoff. */
export function validateApprovedPlan(plan: ApprovedPlan): PlanValidationError[] {
  const errors: PlanValidationError[] = [];

  // Widened deliberately: the declared type is a promise about the shape, not
  // proof of it, and the gate must survive a malformed hand-off.
  const candidate: unknown = plan;
  if (candidate === null || typeof candidate !== "object") {
    errors.push({
      severity: "error",
      rule: 0,
      message: "Plan is missing or is not an object.",
    });
    return errors;
  }

  // Rule 0 first: the sixteen rules below are written against a well-formed
  // plan, and reporting "your cron is unparseable" on a hand-off that has no
  // agents array is answering the wrong question.
  checkStructure(plan, errors);

  const agents = objectsIn<AgentSpec>(plan.agents);
  const outcomes = objectsIn<BusinessOutcome>(plan.businessOutcomes);
  const globalForbidden = new Set(
    plan.globalPolicy ? asArray<string>(plan.globalPolicy.forbidden) : [],
  );

  const agentIds = new Set<string>();
  for (const agent of agents) {
    // Rule 9 — agent ids unique across the whole plan.
    if (agentIds.has(agent.id)) {
      errors.push({
        severity: "error",
        rule: 9,
        agentId: agent.id,
        message: `Duplicate agent id "${agent.id}". Agent ids must be unique across the plan.`,
      });
    }
    agentIds.add(agent.id);
  }

  /* ── Business outcomes (rules 9, 13, 16) ── */

  const outcomeIds = new Set<string>();
  /** Agents named by at least one outcome, for rule 15. */
  const referencedAgentIds = new Set<string>();

  for (const outcome of outcomes) {
    if (outcomeIds.has(outcome.id)) {
      errors.push({
        severity: "error",
        rule: 9,
        outcomeId: outcome.id,
        message: `Duplicate outcome id "${outcome.id}". Outcome ids must be unique across the plan.`,
      });
    }
    outcomeIds.add(outcome.id);

    for (const agentId of asArray<string>(outcome.agentIds)) {
      referencedAgentIds.add(agentId);
      if (!agentIds.has(agentId)) {
        errors.push({
          severity: "error",
          rule: 13,
          outcomeId: outcome.id,
          agentId,
          message: `Outcome "${outcome.id}" references agent "${agentId}", which is not in the plan.`,
        });
      }
    }

    const metrics = asArray(outcome.metrics);
    const hasNumericTarget = metrics.some(
      (metric) => typeof metric.target === "number" && Number.isFinite(metric.target),
    );
    if (!hasNumericTarget) {
      errors.push({
        severity: "warning",
        rule: 16,
        outcomeId: outcome.id,
        message: `Outcome "${outcome.id}" has no metric with a numeric target, so the Workspace has nothing to report progress against.`,
      });
    }
  }

  /* ── Agents ── */

  for (const agent of agents) {
    const agentId = agent.id;
    const grants = asArray(agent.tools);

    /** Flattened allowlist: the runtime refuses anything outside it. */
    const granted = new Set<string>();
    for (const grant of grants) {
      for (const operation of asArray<string>(grant.operations)) {
        granted.add(operation);
      }
    }

    // Same posture as globalPolicy above: the declared type promises a policy,
    // a hand-off arriving as JSON does not. A missing one is reported as a
    // rule 8 error, never allowed to throw part-way through the gate.
    const policy = agent.policy;
    const agentForbidden = new Set(policy ? asArray<string>(policy.forbidden) : []);

    // Rule 2 — operating-mode coherence, in two parts.
    //
    // The membership test comes first and is written as a membership test, not
    // a typo check: a hand-off that omits the field entirely is the likelier
    // failure and `undefined` has to fail this too. It matters more than it
    // looks. The runtime refuses every act under a mode it cannot interpret, so
    // an unrecognised mode is an unrunnable agent — and until this check
    // existed a one-character typo also skipped the empty-limits test below,
    // because that test only fires when the mode is already spelled correctly.
    // A plan reading `"draft_onlyy"` with `limits: []` passed the gate clean.
    //
    // Both branches stay under rule 2 rather than minting a rule 17: §6 already
    // scopes rule 2 to operating-mode and limit coherence, and a new rule number
    // would put this file out of step with the agreed sixteen-rule table.
    if (policy && !isOperatingMode(policy.operatingMode)) {
      errors.push({
        severity: "error",
        rule: 2,
        agentId,
        message: `Agent "${agentId}" declares operatingMode "${String(policy.operatingMode)}". Expected one of ${OPERATING_MODES.join(", ")}. The runtime cannot interpret it and would refuse every act step.`,
      });
    } else if (
      policy &&
      policy.operatingMode === "auto_within_limits" &&
      asArray(policy.limits).length === 0
    ) {
      errors.push({
        severity: "error",
        rule: 2,
        agentId,
        message: `Agent "${agentId}" runs in "auto_within_limits" but declares no limits, so nothing could ever escalate.`,
      });
    }

    // Rule 3 — a grant must never contradict a hard deny.
    for (const operation of granted) {
      const sources: string[] = [];
      if (agentForbidden.has(operation)) sources.push("the agent's policy.forbidden");
      if (globalForbidden.has(operation)) sources.push("globalPolicy.forbidden");
      if (sources.length > 0) {
        errors.push({
          severity: "error",
          rule: 3,
          agentId,
          message: `Operation "${operation}" is granted in tools but also listed in ${sources.join(" and ")}. A grant can never override a hard deny.`,
        });
      }
    }

    // Rule 8 — approvalOwner resolves to a real user, in two branches.
    //
    // Presence and resolution are separate failures and both are errors. An
    // empty owner produces an approval addressed to nobody; a well-formed owner
    // id that is not in the directory is worse, because everything downstream
    // looks healthy — the agent pauses correctly, the approval is created
    // correctly, and it waits forever in an inbox no one can open. Resolution
    // is what makes this rule mean what §6 says it means; a non-empty string
    // check alone was the rule claiming more than it enforced.
    if (!policy || !isNonEmptyString(policy.approvalOwner)) {
      errors.push({
        severity: "error",
        rule: 8,
        agentId,
        message: `Agent "${agentId}" has no approvalOwner, so a pending approval would have nobody to go to.`,
      });
    } else if (!isKnownUser(policy.approvalOwner)) {
      errors.push({
        severity: "error",
        rule: 8,
        agentId,
        message: `Agent "${agentId}" names approvalOwner "${policy.approvalOwner}", who is not in the user directory (lib/plan/users.ts). The approval would be addressed to a user that does not exist and would never be seen.`,
      });
    }

    // Rule 12 — a required integration the registry knows nothing about
    // cannot be checked by the Activation checklist.
    for (const grant of grants) {
      if (grant.required && operationsFor(grant.integrationId).length === 0) {
        errors.push({
          severity: "warning",
          rule: 12,
          agentId,
          message: `Agent "${agentId}" requires integration "${grant.integrationId}", which has no operations in the registry.`,
        });
      }
    }

    /* ── Capabilities (rules 9, 14) ── */

    const capabilityIds = new Set<string>();
    for (const capability of asArray(agent.capabilities)) {
      if (capabilityIds.has(capability.id)) {
        errors.push({
          severity: "error",
          rule: 9,
          agentId,
          capabilityId: capability.id,
          message: `Duplicate capability id "${capability.id}" on agent "${agentId}". Capability ids must be unique within an agent.`,
        });
      }
      capabilityIds.add(capability.id);

      for (const operation of asArray<string>(capability.backedBy)) {
        if (!granted.has(operation)) {
          errors.push({
            severity: "error",
            rule: 14,
            agentId,
            capabilityId: capability.id,
            message: `Capability "${capability.id}" claims operation "${operation}", which agent "${agentId}" has no grant for. The runtime would refuse it.`,
          });
        }
      }
    }

    /* ── Workflows ── */

    const workflows = asArray<WorkflowSpec>(agent.workflows);

    // Rule 11 — an agent with nothing enabled will never do any work.
    if (!workflows.some((workflow) => workflow.enabled)) {
      errors.push({
        severity: "warning",
        rule: 11,
        agentId,
        message: `Agent "${agentId}" has no enabled workflows, so it will never run.`,
      });
    }

    const workflowIds = new Set<string>();
    for (const workflow of workflows) {
      const workflowId = workflow.id;

      // Rule 9 — workflow ids unique within the agent.
      if (workflowIds.has(workflowId)) {
        errors.push({
          severity: "error",
          rule: 9,
          agentId,
          workflowId,
          message: `Duplicate workflow id "${workflowId}" on agent "${agentId}". Workflow ids must be unique within an agent.`,
        });
      }
      workflowIds.add(workflowId);

      const steps = asArray(workflow.steps);

      // Rule 10 — an enabled workflow must actually be executable.
      if (workflow.enabled) {
        if (steps.length === 0) {
          errors.push({
            severity: "error",
            rule: 10,
            agentId,
            workflowId,
            message: `Enabled workflow "${workflowId}" has no steps.`,
          });
        }

        const output = workflow.output;
        if (!output) {
          errors.push({
            severity: "error",
            rule: 10,
            agentId,
            workflowId,
            message: `Enabled workflow "${workflowId}" declares no output, so a run has no definition of success.`,
          });
        } else if (!isNonEmptyString(output.successCriteria)) {
          errors.push({
            severity: "error",
            rule: 10,
            agentId,
            workflowId,
            message: `Enabled workflow "${workflowId}" has an output with no successCriteria, so the sandbox has nothing to assert against.`,
          });
        }
      }

      /* ── Triggers (rules 4, 5) ── */

      const trigger = workflow.trigger;
      if (trigger && trigger.kind === "schedule") {
        if (!isValidCron(trigger.cron)) {
          errors.push({
            severity: "error",
            rule: 4,
            agentId,
            workflowId,
            message: `Workflow "${workflowId}" has an unparseable cron "${String(trigger.cron)}". Expected 5 numeric fields, for example "0 9 * * 5".`,
          });
        }
        if (!isValidTimezone(trigger.timezone)) {
          errors.push({
            severity: "error",
            rule: 4,
            agentId,
            workflowId,
            message: `Workflow "${workflowId}" has an invalid IANA timezone "${String(trigger.timezone)}".`,
          });
        }
      } else if (trigger && trigger.kind === "dependency") {
        // A dependency may only chain within one agent: cross-agent ordering
        // is orchestration, which the contract does not model.
        const target = workflows.find((other) => other.id === trigger.afterWorkflowId);
        if (trigger.afterWorkflowId === workflowId) {
          // A workflow waiting on itself can never fire.
          errors.push({
            severity: "error",
            rule: 5,
            agentId,
            workflowId,
            message: `Workflow "${workflowId}" depends on itself, so it could never be triggered.`,
          });
        } else if (!target) {
          errors.push({
            severity: "error",
            rule: 5,
            agentId,
            workflowId,
            message: `Workflow "${workflowId}" depends on "${trigger.afterWorkflowId}", which does not exist on agent "${agentId}".`,
          });
        } else if (!target.enabled) {
          errors.push({
            severity: "error",
            rule: 5,
            agentId,
            workflowId,
            message: `Workflow "${workflowId}" depends on "${trigger.afterWorkflowId}", which is disabled and would never fire it.`,
          });
        }
      }

      /* ── Steps (rules 1, 6, 7, 9) ── */

      // Rule 9 — the executor keys accumulated run state by step id
      // (state.context[step.id]), so a duplicate silently overwrites an
      // earlier step's output and a later step reads the wrong data.
      const seenStepIds = new Set<string>();
      for (const step of steps) {
        if (seenStepIds.has(step.id)) {
          errors.push({
            severity: "error",
            rule: 9,
            agentId,
            workflowId,
            stepId: step.id,
            message: `Duplicate step id "${step.id}" in workflow "${workflowId}". The runtime keys step output by id, so a duplicate would overwrite earlier results.`,
          });
        }
        seenStepIds.add(step.id);
      }

      for (const step of steps) {
        const stepId = step.id;
        const tool = step.tool;

        // Rule 6 — an act step with no tool has nothing to gate.
        if (step.kind === "act" && !tool) {
          errors.push({
            severity: "error",
            rule: 6,
            agentId,
            workflowId,
            stepId,
            message: `Act step "${stepId}" declares no tool. Every act step must name the operation it calls.`,
          });
        }

        // Closest rule to "a fetch that cannot be proven read-only" is 7.
        if (step.kind === "fetch" && !tool) {
          errors.push({
            severity: "error",
            rule: 7,
            agentId,
            workflowId,
            stepId,
            message: `Fetch step "${stepId}" declares no tool, so its read-only status cannot be established.`,
          });
        }

        if (!tool) continue;

        const operation = tool.operation;

        // Rule 1 — the operation must exist, then be granted.
        if (!isKnownOperation(operation)) {
          errors.push({
            severity: "error",
            rule: 1,
            agentId,
            workflowId,
            stepId,
            message: `Step "${stepId}" calls unknown operation "${String(operation)}", which is not in the operation registry.`,
          });
        } else if (getOperation(operation)?.integrationId !== tool.integrationId) {
          // The executor resolves the client by `integrationId`
          // (executor.ts, performTool) but gates on `operation`. If the two
          // disagree, a plan that reads clean here dies at run time: either the
          // stub rejects the mismatch outright, or the wrong integration is not
          // connected and the run is refused. Catching it at the seam is the
          // entire point of the gate.
          errors.push({
            severity: "error",
            rule: 1,
            agentId,
            workflowId,
            stepId,
            message: `Step "${stepId}" calls "${operation}" through integration "${tool.integrationId}", but that operation belongs to "${getOperation(operation)?.integrationId}". The runtime resolves the tool client by integrationId and would refuse it.`,
          });
        } else if (!granted.has(operation)) {
          errors.push({
            severity: "error",
            rule: 1,
            agentId,
            workflowId,
            stepId,
            message: `Step "${stepId}" calls "${operation}", which agent "${agentId}" does not grant in tools[].operations. The runtime would refuse it.`,
          });
        }

        // Rule 7, mirrored — an act step calling a read-only operation is not
        // dangerous, but it is wrong: it pays the approval-gating cost for a
        // read and hides a genuine side effect's absence from anyone auditing
        // the workflow. Warning rather than error because nothing unsafe
        // follows from it.
        if (step.kind === "act" && isReadOnly(operation)) {
          errors.push({
            severity: "warning",
            rule: 7,
            agentId,
            workflowId,
            stepId,
            message: `Act step "${stepId}" calls the read-only operation "${operation}". Reads belong in fetch steps; an act implies a side effect that policy must gate.`,
          });
        }

        // Rule 7 — fetch is the ungated path, so it must be provably read-only.
        // isReadOnly fails closed: an unknown operation is never read-only.
        if (step.kind === "fetch" && !isReadOnly(operation)) {
          errors.push({
            severity: "error",
            rule: 7,
            agentId,
            workflowId,
            stepId,
            message: `Fetch step "${stepId}" calls "${String(operation)}", which is not read-only. Side-effecting operations must be act steps so policy can gate them.`,
          });
        }
      }
    }

    // Rule 15 — an agent no outcome claims cannot be reported on.
    if (!referencedAgentIds.has(agentId)) {
      errors.push({
        severity: "warning",
        rule: 15,
        agentId,
        message: `Agent "${agentId}" is not referenced by any business outcome, so the Workspace cannot attribute its work.`,
      });
    }
  }

  return errors;
}

/* ═══════════════════════════ Convenience ═══════════════════════════ */

/** Broadest scope first, so a line reads agent → workflow → step. */
function describeScope(error: PlanValidationError): string {
  const parts: string[] = [];
  if (error.agentId) parts.push(error.agentId);
  if (error.workflowId) parts.push(error.workflowId);
  if (error.stepId) parts.push(error.stepId);
  if (error.capabilityId) parts.push(error.capabilityId);
  if (error.outcomeId) parts.push(error.outcomeId);
  return parts.length > 0 ? `${parts.join(" / ")}: ` : "";
}

/**
 * Throws on any blocking error. Use at the boundaries that must not proceed
 * with an unbuildable plan (fixture loading, the Agent Factory entry point);
 * use validateApprovedPlan directly wherever warnings should be shown too.
 */
export function assertValidPlan(plan: ApprovedPlan): void {
  const blocking = validateApprovedPlan(plan).filter(
    (error) => error.severity === "error",
  );
  if (blocking.length === 0) return;

  const lines = blocking.map(
    (error) => `  [rule ${error.rule}] ${describeScope(error)}${error.message}`,
  );
  throw new Error(
    `Plan failed validation with ${blocking.length} error${blocking.length === 1 ? "" : "s"}:\n${lines.join("\n")}`,
  );
}
