/**
 * lib/runtime/policy.ts — the enforcement layer.
 *
 * This file is the whole behavioural contract of the product: it decides
 * whether an agent may act on its own, must ask the owner first, or must be
 * refused outright. Everything the owner believes about "the AI cannot spend
 * my money without asking" is implemented here and nowhere else.
 *
 * Two rules govern the code below:
 *
 *  1. The LLM never participates in this decision. The model proposes; this
 *     module disposes. A model cannot be trusted to enforce its own limits,
 *     so enforcement lives outside it, in plain deterministic TypeScript.
 *
 *  2. It fails CLOSED. When the runtime cannot prove a limit is respected —
 *     because the metric it needs was never established — the answer is
 *     "ask a human", not "assume it is fine". See evaluateLimits().
 *
 * The order in resolveAct() is the order written in docs/PLAN_CONTRACT.md
 * section 3.10 and must not be reordered: forbidden beats everything, and a
 * hard deny is never softened into an approval request.
 */

import type {
  AgentPolicy,
  Op,
  PolicyLimit,
  QuietHours,
  RiskLevel,
} from "../plan/types";
import { getOperation } from "../plan/operations";
import type { PolicyDecision, ToolInvocation } from "./types";

/* ═══════════════════════════ Limits ═══════════════════════════ */

/**
 * A policy arrives as JSON over the seam, so a declared array is a promise
 * rather than proof — the same posture lib/plan/validate.ts takes at the gate.
 * A missing collection must read as empty here, never throw: a TypeError
 * escaping the enforcement layer is a run that dies without a decision.
 */
function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
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

export interface LimitEvaluation {
  /** Limits breached where onBreach is "require_approval". */
  needsApproval: PolicyLimit[];
  /** Limits breached where onBreach is "block". */
  blocked: PolicyLimit[];
  /** Limits whose metric was absent from the invocation. Treated as breached
      (fail closed) and surfaced separately so the cause is debuggable. */
  unmeasured: PolicyLimit[];
}

/**
 * A limit whose metric is missing is NOT satisfied.
 *
 * Consider `invoice.amount <= 500` on an invocation that never established an
 * amount. Treating that as "satisfied" would let an unbounded payment through
 * on the strength of missing data, which is the exact failure this system
 * exists to prevent. Instead it escalates to the owner, and the reason string
 * names the missing metric so the gap is easy to close: the agent's `reason`
 * step should be emitting it via ReasonResult.metrics.
 */
export function evaluateLimits(
  limits: PolicyLimit[],
  metrics: Record<string, number>,
): LimitEvaluation {
  const needsApproval: PolicyLimit[] = [];
  const blocked: PolicyLimit[] = [];
  const unmeasured: PolicyLimit[] = [];

  for (const limit of limits) {
    const value = metrics[limit.metric];
    const measured = typeof value === "number" && Number.isFinite(value);

    if (!measured) {
      unmeasured.push(limit);
      // Unmeasured is a breach; route it the same way an over-limit value goes.
      (limit.onBreach === "block" ? blocked : needsApproval).push(limit);
      continue;
    }

    if (!satisfies(value, limit.op, limit.value)) {
      (limit.onBreach === "block" ? blocked : needsApproval).push(limit);
    }
  }

  return { needsApproval, blocked, unmeasured };
}

function describeLimit(l: PolicyLimit): string {
  return `${l.metric} ${l.op} ${l.value}${l.unit ? ` ${l.unit}` : ""}`;
}

/* ═══════════════════════════ Act resolution ═══════════════════════════ */

export interface ResolveActInput {
  invocation: ToolInvocation;
  policy: AgentPolicy;
  /** plan.globalPolicy.forbidden — org-wide denies. */
  globalForbidden: string[];
  /** The compiled package's flattened allowlist (AgentPackage.allowedOperations). */
  allowedOperations: string[];
  /** StepSpec.risk, if the plan declared one. */
  stepRisk?: RiskLevel;
}

/**
 * The six-step resolution order from contract section 3.10. Do not reorder.
 */
export function resolveAct(input: ResolveActInput): PolicyDecision {
  const { invocation, policy, globalForbidden, allowedOperations, stepRisk } = input;
  const operation = invocation.operation;
  const baseRisk: RiskLevel =
    stepRisk ?? getOperation(operation)?.baselineRisk ?? "medium";

  // 1. Hard deny. Refused outright, never escalated to a human.
  if (policy.forbidden.includes(operation) || globalForbidden.includes(operation)) {
    return {
      action: "refuse",
      reason: `Operation ${operation} is forbidden for this agent and can never be performed, with or without approval.`,
    };
  }

  // 2. Not granted. The model asked for something the plan never sanctioned.
  if (!allowedOperations.includes(operation)) {
    return {
      action: "refuse",
      reason: `Operation ${operation} was not granted to this agent in the approved plan.`,
    };
  }

  // 3. Always-approve list wins over the operating mode.
  if (policy.alwaysApprove.includes(operation)) {
    return {
      action: "require_approval",
      reason: `${operation} always requires owner approval.`,
      risk: escalate(baseRisk, "high"),
      breachedLimits: [],
    };
  }

  // 4/5. Modes that never act unattended.
  if (policy.operatingMode === "draft_only") {
    return {
      action: "require_approval",
      reason: "This agent prepares work but never acts on its own.",
      risk: baseRisk,
      breachedLimits: [],
    };
  }
  if (policy.operatingMode === "act_after_approval") {
    return {
      action: "require_approval",
      reason: "This agent acts only after owner approval.",
      risk: baseRisk,
      breachedLimits: [],
    };
  }

  // 6. auto_within_limits — the only mode that can proceed unattended.
  //
  // Written as a GUARDED branch, never as the fall-through the other five steps
  // drop into. "Anything I do not recognise" must not land in the one path that
  // can act on a customer without asking, and a fall-through puts it there.
  if (policy.operatingMode === "auto_within_limits") {
    // `limits` is read defensively because evaluateLimits iterates it directly.
    // An absent list is a handoff defect, not a licence: validator rule 2 makes
    // an empty limit set in this mode a blocking error, so the tolerance here
    // is only about refusing to crash mid-decision.
    const limits = asArray(policy.limits);
    const evaluation = evaluateLimits(limits, invocation.metrics);

    if (evaluation.blocked.length > 0) {
      return {
        action: "refuse",
        reason:
          `Blocked by limit ${evaluation.blocked.map(describeLimit).join(", ")}.` +
          (evaluation.unmeasured.length > 0
            ? ` Unmeasured: ${evaluation.unmeasured.map((l) => l.metric).join(", ")}.`
            : ""),
      };
    }

    if (evaluation.needsApproval.length > 0) {
      const unmeasured = evaluation.needsApproval.filter((l) =>
        evaluation.unmeasured.includes(l),
      );
      const exceeded = evaluation.needsApproval.filter(
        (l) => !evaluation.unmeasured.includes(l),
      );

      const parts: string[] = [];
      if (exceeded.length > 0) {
        parts.push(`exceeds ${exceeded.map(describeLimit).join(", ")}`);
      }
      if (unmeasured.length > 0) {
        parts.push(
          `could not confirm ${unmeasured.map((l) => l.metric).join(", ")}`,
        );
      }

      return {
        action: "require_approval",
        reason: `Needs approval because it ${parts.join(" and ")}.`,
        risk: escalate(baseRisk, "high"),
        breachedLimits: evaluation.needsApproval.map((l) => l.id),
      };
    }

    return {
      action: "allow",
      reason: limits.length
        ? `Within all limits (${limits.map(describeLimit).join(", ")}).`
        : "Within policy.",
    };
  }

  // Unreachable through the type system — the union is exhausted above — but
  // reachable at run time, because the plan is JSON: a typo, an omitted field,
  // or a fourth mode added to the contract before this build implemented it.
  //
  // Refuse, deliberately, rather than require_approval. An unrecognised mode is
  // not a risky act awaiting a judgement call; it means there is no policy
  // regime to judge it under. Routing it to a human would hide the contract
  // drift behind an ordinary-looking approval card and the owner would never
  // learn the plan is unrunnable — the same reason steps 1 and 2 refuse rather
  // than escalate. The `never` binding is compile-time only: it forces this
  // branch to be revisited if OPERATING_MODES grows, and must stay paired with
  // the runtime return, which is what actually closes the hole.
  const unhandledMode: never = policy.operatingMode;
  return {
    action: "refuse",
    reason:
      `Agent policy declares operating mode "${String(unhandledMode)}", which this runtime ` +
      `does not implement. No act can be resolved under an unrecognised mode.`,
  };
}

const RISK_ORDER: RiskLevel[] = ["low", "medium", "high"];

/** Risk only ever ratchets upward; an escalation never makes an act look safer. */
function escalate(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER.indexOf(a) >= RISK_ORDER.indexOf(b) ? a : b;
}

/* ═══════════════════════════ Fetch resolution ═══════════════════════════ */

/**
 * Read-only steps still have to be sanctioned: the grant list is what stops an
 * agent reading a system nobody approved. But a genuine read never requires
 * approval, so there is no policy evaluation beyond the allowlist.
 */
export function resolveFetch(
  operation: string,
  allowedOperations: string[],
  globalForbidden: string[],
  policy: AgentPolicy,
): PolicyDecision {
  if (policy.forbidden.includes(operation) || globalForbidden.includes(operation)) {
    return { action: "refuse", reason: `Operation ${operation} is forbidden for this agent.` };
  }
  if (!allowedOperations.includes(operation)) {
    return {
      action: "refuse",
      reason: `Operation ${operation} was not granted to this agent in the approved plan.`,
    };
  }
  const def = getOperation(operation);
  if (!def || def.access !== "read") {
    // Validator rule 7 should have caught this at handoff; refuse at run time
    // too, because a write reached through the fetch path would skip policy.
    return {
      action: "refuse",
      reason: `Operation ${operation} is not read-only and cannot be used by a fetch step.`,
    };
  }
  return { action: "allow", reason: "Read-only operation within grant." };
}

/* ═══════════════════════════ Run-level gates ═══════════════════════════ */

/** Minutes since local midnight for `at`, in the given IANA timezone. */
function localMinutes(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function parseHhMm(value: string): number {
  const [h, m] = value.split(":");
  return Number(h ?? 0) * 60 + Number(m ?? 0);
}

/**
 * Quiet hours normally wrap midnight (18:00 to 09:00), so the inside test is
 * a union of two ranges rather than a simple between.
 *
 * This answers for ONE window only. Since resolveRunStart takes the union of
 * the agent's window and the plan's global one, a `false` here is not the same
 * as "this agent may run" — the other window still gets a vote.
 */
export function isWithinQuietHours(at: Date, quietHours: QuietHours | null): boolean {
  if (!quietHours) return false;
  const now = localMinutes(at, quietHours.timezone);
  const start = parseHhMm(quietHours.start);
  const end = parseHhMm(quietHours.end);
  // A degenerate window is an empty range: this window is never quiet. It no
  // longer opts the agent out of the org-wide window, which is what a plan
  // wanting an always-available agent has to say some other way.
  if (start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

export interface RunGateInput {
  at: Date;
  policy: AgentPolicy;
  globalQuietHours: QuietHours | null;
  /** Runs already started for this agent on the local day. */
  runsToday: number;
}

/** Unset is unreachable at the call sites below, but keeps the access honest. */
function describeWindow(window: QuietHours | null): string {
  return window ? `${window.start} to ${window.end} ${window.timezone}` : "unset";
}

/**
 * Gates whether a triggered run may start at all. Enforced by the scheduler
 * (M4); exposed here so the same rules govern sandbox and production.
 *
 * Quiet hours are the UNION of the agent's window and the plan's global one:
 * it is quiet if EITHER says quiet. Contract §3.1 says globalPolicy "applies to
 * every agent unless the agent is stricter", and for a restriction "stricter"
 * can only mean quiet for longer. Reading the agent's window as a REPLACEMENT
 * inverted that — an agent declaring a narrower window escaped an org-wide
 * constraint simply by mentioning quiet hours at all, which is the one thing a
 * global floor exists to prevent.
 *
 * The two windows are tested separately rather than merged into a single minute
 * range: each `QuietHours` carries its own IANA timezone, and a merged range
 * across two zones would not mean anything. `isWithinQuietHours` already
 * handles the midnight wrap and reads an unset window as "not quiet", so the
 * one-window and no-window cases need no special casing here.
 */
export function resolveRunStart(input: RunGateInput): PolicyDecision {
  const { at, policy, globalQuietHours, runsToday } = input;

  // Reported separately so the refusal names the window that actually blocked
  // the run. An owner shown an org-wide window they cannot find in the agent's
  // own config has no way to act on the message.
  if (isWithinQuietHours(at, policy.quietHours)) {
    return {
      action: "refuse",
      reason: `Inside this agent's quiet hours (${describeWindow(policy.quietHours)}).`,
    };
  }

  if (isWithinQuietHours(at, globalQuietHours)) {
    return {
      action: "refuse",
      reason: `Inside org-wide quiet hours (${describeWindow(globalQuietHours)}).`,
    };
  }

  if (policy.maxRunsPerDay !== null && runsToday >= policy.maxRunsPerDay) {
    return {
      action: "refuse",
      reason: `Daily run limit reached (${policy.maxRunsPerDay}).`,
    };
  }

  return { action: "allow", reason: "Within run policy." };
}

/** createdAt + escalateAfterMins, as an ISO string. */
export function approvalDueAt(createdAt: Date, policy: AgentPolicy): string {
  return new Date(createdAt.getTime() + policy.escalateAfterMins * 60_000).toISOString();
}
