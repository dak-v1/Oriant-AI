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
  /**
   * The business this workforce belongs to.
   *
   * A workforce is not a free-floating set of agents; it is one company's staff,
   * and this is the field that says which company. That makes it the field that
   * decides WHOSE CREDENTIALS the agents act through: Composio holds one set of
   * OAuth connections per organization, so `gmail.messages.send` sends from
   * whichever organization the runtime resolves here.
   *
   * REQUIRED, and deliberately not optional. The value already exists on Role
   * B's handoff (`organization.id`) and on the `role_c_handoffs` row the plan was
   * built from, so the only thing optionality would buy is an ingest path that
   * silently skips it — leaving live execution to read the organization from the
   * environment instead. That is one organization per process, set by hand, next
   * to a plan that already knew the answer, and it is a wrong answer waiting for
   * the second customer on the same server. Required turns "which business is
   * this" from a deployment setting into a fact the plan carries.
   *
   * Fail closed. A plan whose organizationId is missing or blank must REFUSE to
   * execute tools. It must never fall back to a process-wide default, because
   * that default is some other business's connected accounts.
   */
  organizationId: string;
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
  /**
   * Where this step's tool arguments come from. Absent means `{ kind:
   * "reasoning" }` — the behaviour every plan written before this field had.
   * See `StepArgumentSource`.
   */
  argumentSource?: StepArgumentSource;
  /** `act` steps only. Baseline risk; policy may escalate it further. */
  risk?: RiskLevel;
}

export type StepKind = "fetch" | "reason" | "act" | "approve";

/**
 * WHERE A STEP'S TOOL ARGUMENTS COME FROM.
 *
 * WHY THE CONTRACT NEEDS A FIELD FOR THIS, said loudly because this is a change
 * to the one handoff between the lanes.
 *
 * §1 at the top of this file is the governing rule: a limit, permission,
 * schedule or TARGET must never live only in prose, because an LLM cannot be
 * trusted to enforce its own constraints. The scope of a read is exactly such a
 * target, and until this field existed it lived only in prose. "Read the request
 * threads that arrived since yesterday's sweep" is a `fetch` step's
 * `instruction`; what the runtime actually sent was an EMPTY argument list,
 * because `StepSpec.tool` carries an integration and an operation and nothing
 * else, and the only writer of the runtime's pending-argument slot is a `reason`
 * step. A workflow that OPENS with a fetch had nothing to send.
 *
 * And an empty argument list is not an error. Composio's GMAIL_LIST_THREADS
 * publishes `required: []`; so does GOOGLECALENDAR_FIND_FREE_SLOTS. Empty
 * arguments therefore succeed, and mean "every thread in the mailbox" and "free
 * slots with no time bounds". A morning diary sweep with no date range is not a
 * diary sweep — it is a wrong answer the run record reports as ok, which is
 * strictly worse than a failure. Two of the three enabled Meridian workflows
 * open with a fetch.
 *
 * So the scope of a read is structure, not prose, and structure belongs in the
 * contract.
 *
 * THE THREE ARMS, and what each of them rejects:
 *
 *   "literal"   — the plan states the arguments. This is the arm a fetch-first
 *                 workflow needs: the date range, the label filter, the page
 *                 size are facts about the JOB, known when the plan is approved,
 *                 and they belong to whoever approved it rather than to a model
 *                 re-deriving them on every run.
 *   "reasoning" — the preceding `reason` step's `data` becomes the argument
 *                 list. The pre-existing behaviour, now something a plan SAYS
 *                 rather than something it falls into. Use it when the arguments
 *                 genuinely depend on the run (which thread, which record, a
 *                 window relative to now).
 *   "none"      — the call is made with no arguments AND somebody wrote down
 *                 why. Required, non-blank prose. This is the arm that keeps an
 *                 unfiltered read possible without keeping it accidental: after
 *                 this field, "list the whole mailbox" is a sentence a human
 *                 committed to the plan, and the runtime records it on the run.
 *
 * WHAT WAS REJECTED.
 *
 *   A TEMPLATE LANGUAGE. `{ time_min: "{{now}}", time_max: "{{now+P10D}}" }` was
 *   the obvious way to express a relative window in a literal. It is a second
 *   expression language living in a data contract, silently wrong when a
 *   placeholder is misspelled (it sends the literal text), and it duplicates
 *   what a `reason` step already does with a model that can be told the schema.
 *   A run-relative window uses "reasoning"; a fixed one uses "literal".
 *
 *   PUTTING THE DEFAULT AT "none". It would have made every existing fetch step
 *   declare itself unfiltered, which is exactly the fiction this field removes.
 *   Absent means "reasoning", and the RUNTIME refuses the resulting empty call —
 *   so an old plan fails loudly instead of quietly acquiring a justification
 *   nobody wrote.
 *
 * WHERE THIS IS ENFORCED, and why not here. Whether a tool needs arguments at
 * all is a fact about Composio's published input schema, and this file may not
 * import lib/runtime (the boundary rule at the top). So lib/plan/validate.ts
 * cannot decide it; the runtime does, in lib/runtime/executor.ts, where the
 * schema is reachable and where a fetch whose arguments the tool's schema cannot
 * satisfy is refused before anything is sent. What the validator can usefully
 * add later is SHAPE — rule 0 checking that `argumentSource` is one of these
 * three arms with its own member present — which is a check on the plan, not on
 * the catalog. Until it does, the executor validates the shape too and fails
 * closed on anything it cannot read.
 */
export type StepArgumentSource =
  /** Sent verbatim. `values` is the whole argument list, not a patch. */
  | { kind: "literal"; values: Record<string, unknown> }
  /** The preceding `reason` step's `data`. The default when the field is absent. */
  | { kind: "reasoning" }
  /** No arguments, deliberately. `justification` must be non-blank prose. */
  | { kind: "none"; justification: string };

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
