/**
 * lib/plan/types.ts — the Plan Contract (docs/PLAN_CONTRACT.md v2).
 *
 * This is the ONE handoff between Role B (Plan) and Role C (Build + Operate).
 * D emits an `ApprovedPlan`; everything downstream of it belongs to Role C.
 *
 * The governing rule (contract §1):
 *   prose  → goes into the prompt   (what the agent TRIES to do)
 *   structure → goes into the runtime (what the agent is ALLOWED to do)
 *
 * A limit, permission, schedule or target must never live only in prose — an
 * LLM cannot be trusted to enforce its own constraints, so the runtime
 * enforces them outside the model.
 *
 * Nothing in this file may import from lib/runtime or lib/mock: the contract
 * is the boundary, and both sides depend on it rather than on each other.
 */

export type Op = "<" | "<=" | ">" | ">=" | "==";
export type RiskLevel = "low" | "medium" | "high";

/**
 * The operating modes, as a VALUE as well as a type.
 *
 * A plan crosses the seam as JSON, so at run time `operatingMode` is whatever
 * string the sender put there — the union is a promise, not a guarantee. Both
 * the handoff gate and the policy engine therefore have to test membership at
 * run time, and a hand-maintained second copy of this list would drift from the
 * type the moment a mode is added. Deriving the type from the array makes that
 * drift impossible: adding a mode here forces every membership check and every
 * exhaustive switch to be revisited in the same edit.
 */
export const OPERATING_MODES = [
  /** Prepares work, never acts. Always creates an approval. */
  "draft_only",
  /** Creates an approval; acts once approved. */
  "act_after_approval",
  /** Acts directly; escalates only when a limit is breached. */
  "auto_within_limits",
] as const;

export type OperatingMode = (typeof OPERATING_MODES)[number];

/**
 * Membership test for a value the type system has not proven. Fails closed:
 * `undefined`, a typo, or a mode a future contract adds before this build
 * implements it are all "not an operating mode".
 */
export function isOperatingMode(value: unknown): value is OperatingMode {
  return (OPERATING_MODES as readonly unknown[]).includes(value);
}

/* ═══════════════════════════ Root ═══════════════════════════ */

export interface ApprovedPlan {
  planId: string;
  /** Bumps on every approval. */
  version: number;
  approvedAt: string; // ISO 8601
  approvedBy: string; // user id
  /** Report version this plan was derived from — lets Role C detect that the
      plan is stale relative to a re-approved company report. */
  reportVersion: number;
  /** The business goals this plan exists to move. Planned FIRST. */
  businessOutcomes: BusinessOutcome[];
  agents: AgentSpec[];
  /** Applies to every agent unless the agent is stricter. */
  globalPolicy: {
    quietHours: QuietHours | null;
    /** Operation ids denied org-wide. */
    forbidden: string[];
  };
}

/* ═══════════════════════ Business outcomes ═══════════════════════ */

export interface BusinessOutcome {
  id: string;
  name: string;
  priority: "high" | "medium" | "low";
  owner: string; // user id
  metrics: OutcomeMetric[];
  /** Agents contributing to this outcome. This is the ONLY direction the
      relationship is stored — agents do not carry an outcome list. */
  agentIds: string[];
}

/**
 * Structured so the Workspace can render progress ("34 days → target 21").
 * A prose aspiration cannot be rendered, compared or trended.
 */
export interface OutcomeMetric {
  id: string;
  label: string;
  metric: string; // "invoice.days_to_payment"
  direction: "decrease" | "increase";
  /** From the approved company report where known; null if not measured yet. */
  baseline: number | null;
  target: number;
  unit: string;
}

/* ═══════════════════════════ Agent ═══════════════════════════ */

export interface AgentSpec {
  id: string;
  /** Bump on ANY change to this agent. The Agent Factory rebuilds only the
      agents whose version changed — never the whole plan. */
  version: number;
  name: string;
  role: string;

  capabilities: Capability[];
  workflows: WorkflowSpec[];
  tools: ToolGrant[];
  policy: AgentPolicy;

  /** Prose only. Shapes the system prompt. Never enforced, never parsed. */
  guidance: {
    objective: string;
    businessContext: string;
    tone?: string;
    examples?: string[];
  };
}

/**
 * A semantic index of what an agent can do, so the command bar and future
 * orchestration can answer "which agent can draft marketing emails?" without
 * scanning every workflow.
 */
export interface Capability {
  id: string;
  name: string;
  description: string;
  /** MUST be a subset of this agent's granted operations (validator rule 14).
      Without this, capabilities become a second source of truth about what an
      agent can do — one the UI trusts and the runtime ignores. */
  backedBy: string[];
}

/* ═══════════════════════════ Workflow ═══════════════════════════ */

export interface WorkflowSpec {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: TriggerSpec;
  steps: StepSpec[];
  output: OutputSpec;
  onFailure: FailurePolicy;
}

/** `label` is for D's canvas; every other field is what the scheduler uses. */
export type TriggerSpec =
  | { kind: "schedule"; label: string; cron: string; timezone: string }
  | {
      kind: "event";
      label: string;
      integrationId: string;
      event: string;
      filter?: Record<string, unknown>;
    }
  | { kind: "threshold"; label: string; metric: string; op: Op; value: number }
  | { kind: "dependency"; label: string; afterWorkflowId: string }
  | { kind: "manual"; label: string };

/**
 * `kind` tells the runtime WHAT to do; `instruction` tells the LLM HOW.
 * The four kinds map one-to-one onto runtime events:
 *   fetch   → read-only tool call, never needs approval
 *   reason  → LLM call (decide, draft, classify); no side effects
 *   act     → side-effecting tool call, gated by AgentPolicy
 *   approve → explicit checkpoint regardless of policy
 */
export interface StepSpec {
  id: string;
  kind: StepKind;
  instruction: string;
  /** Required for `fetch` and `act`. The runtime REJECTS any call whose
      operation is not granted in the agent's `tools`. */
  tool?: { integrationId: string; operation: string };
  /** `act` steps only. Baseline risk; policy may escalate it further. */
  risk?: RiskLevel;
}

export type StepKind = "fetch" | "reason" | "act" | "approve";

export interface OutputSpec {
  kind: "draft" | "message" | "record_update" | "booking" | "report";
  /** Prose. Becomes the sandbox assertion for "did this run succeed?" */
  successCriteria: string;
}

export interface FailurePolicy {
  retries: number;
  backoffSeconds: number;
  onExhausted: "escalate" | "notify_owner" | "fail_silent";
}

/* ═══════════════════════════ Tools ═══════════════════════════ */

/**
 * One field doing three jobs: D requests the right OAuth scopes, Role C's
 * Activation checklist knows what must be connected, and Role C's runtime
 * rejects undeclared calls.
 */
export interface ToolGrant {
  integrationId: string;
  /** Whitelist of callable operations. Anything not listed is refused at
      runtime, even if the model asks for it. */
  operations: string[];
  purpose: string;
  /** true  → a missing connection BLOCKS activation
      false → the agent degrades gracefully without it */
  required: boolean;
}

/* ═══════════════════════════ Policy ═══════════════════════════ */

export interface QuietHours {
  start: string; // "18:00"
  end: string; // "09:00"
  timezone: string; // IANA, e.g. "Asia/Singapore"
}

export interface PolicyLimit {
  id: string;
  metric: string; // "invoice.amount", "emails.per_run"
  op: Op;
  value: number;
  unit?: string;
  onBreach: "require_approval" | "block";
}

export interface AgentPolicy {
  operatingMode: OperatingMode;
  /** REQUIRED and non-empty when operatingMode is "auto_within_limits".
      Meaningless otherwise. */
  limits: PolicyLimit[];
  /** Operation ids that ALWAYS create an approval, whatever the mode. */
  alwaysApprove: string[];
  /** Hard denies. Refused outright — never escalated to a human. */
  forbidden: string[];
  approvalOwner: string; // user id
  /** Minutes before a pending approval is flagged overdue. */
  escalateAfterMins: number;
  quietHours: QuietHours | null;
  maxRunsPerDay: number | null;
}

/* ═══════════════════ Lane ownership (contract §4) ═══════════════════ */

/** D's plan-time status. Never appears in an ApprovedPlan. */
export type PlanAgentStatus =
  | "recommended"
  | "needs_information"
  | "needs_configuration"
  | "ready_to_build";

/** Role C's runtime status. Never appears in an ApprovedPlan. */
export type AgentRuntimeState =
  | "building"
  | "validated"
  | "active"
  | "paused"
  | "failed";

/**
 * Operational knobs belong to the lane that RUNS the agents, not the lane
 * that plans them — surfacing them in the Planner would put infrastructure
 * controls in front of a small-business owner (contract §4.3).
 */
export interface AgentRuntimeConfig {
  agentId: string;
  concurrency: number;
  queue: string;
}

/* ═══════════════════════════ Validation ═══════════════════════════ */

export interface PlanValidationError {
  severity: "error" | "warning";
  /** Which contract rule (docs/PLAN_CONTRACT.md §6) produced this. */
  rule: number;
  agentId?: string;
  workflowId?: string;
  stepId?: string;
  outcomeId?: string;
  capabilityId?: string;
  message: string;
}
