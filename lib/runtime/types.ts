/**
 * lib/runtime/types.ts — the agent runtime's own vocabulary (ROLE_C_PLAN M1).
 *
 * Design decision that shapes everything here: the runtime INTERPRETS the
 * plan's `StepSpec[]` rather than executing generated code. The contract
 * already gives a structured, ordered step list, so control flow belongs to
 * the runtime and the LLM is confined to `reason` steps. That means:
 *
 *   - generated code can never fail to compile or run;
 *   - execution order is deterministic and identical in sandbox and live;
 *   - the model cannot invent a tool call that policy did not sanction.
 *
 * An "agent package" is therefore a COMPILED spec — prompts, resolved tool
 * bindings and a flattened allowlist — not a bundle of handler code. The
 * Agent Factory (M2) produces these; the executor (M1) consumes them.
 */

import type {
  AgentSpec,
  OutputSpec,
  RiskLevel,
  StepKind,
  StepSpec,
  WorkflowSpec,
} from "../plan/types";

/* ═══════════════════════ Agent package (M2 output) ═══════════════════════ */

export interface AgentPackage {
  agentId: string;
  /** Mirrors AgentSpec.version — the Factory rebuilds only on a bump. */
  agentVersion: number;
  builtAt: string;
  /** Compiled once from role + guidance; prefixed to every LLM call. */
  systemPrompt: string;
  workflows: CompiledWorkflow[];
  /** Flattened union of every ToolGrant.operations — the runtime's fast
      allowlist check. Never widened at run time. */
  allowedOperations: string[];
  /** Stable hash of the inputs that produced this package. Two builds of the
      same spec must produce the same checksum (M2 equivalence test). */
  checksum: string;
}

export interface CompiledWorkflow {
  workflowId: string;
  name: string;
  enabled: boolean;
  /** Prompt fragment describing this workflow's job, prepended to its steps. */
  prompt: string;
  steps: StepSpec[];
  output: OutputSpec;
}

/* ═══════════════════════════ Triggers ═══════════════════════════ */

export interface TriggerEvent {
  kind: "schedule" | "event" | "threshold" | "dependency" | "manual";
  /** Which workflow this fires. */
  workflowId: string;
  agentId: string;
  firedAt: string;
  /** Event payload / schedule context handed to the first step. */
  payload: Record<string, unknown>;
  /** Stable key so a re-delivered trigger cannot double-start a run. */
  idempotencyKey: string;
}

/* ═══════════════════════════ Tools ═══════════════════════════ */

/**
 * Every tool call is mediated: agents never touch Gmail directly, they ask
 * the runtime. Sandbox injects a stub client, production injects D's real
 * one — same agent code, one swapped dependency.
 */
export interface ToolInvocation {
  integrationId: string;
  operation: string;
  args: Record<string, unknown>;
  /**
   * Measurable facts about this invocation, evaluated against PolicyLimit.
   * e.g. { "invoice.amount": 1200, "emails.per_run": 12 }.
   * A limit whose metric is absent here is treated as NOT satisfied
   * (fail closed) — see policy.ts.
   */
  metrics: Record<string, number>;
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface ToolClient {
  /** Read-only and side-effecting calls both route here; the runtime has
      already decided whether the call is permitted. */
  call(invocation: ToolInvocation): Promise<ToolResult>;
}

/** Provided by D's integration layer in production (contract §8 Q3). */
export interface IntegrationProvider {
  getToolClient(integrationId: string): ToolClient | null;
  getIntegrationStatus(
    integrationId: string,
  ): "connected" | "required" | "optional" | "needs_approval";
}

/* ═══════════════════════════ Policy ═══════════════════════════ */

export type PolicyDecision =
  | { action: "allow"; reason: string }
  | {
      action: "require_approval";
      reason: string;
      risk: RiskLevel;
      /** PolicyLimit ids that pushed this over the line (empty when the
          escalation came from the operating mode or alwaysApprove). */
      breachedLimits: string[];
    }
  | { action: "refuse"; reason: string };

/* ═══════════════════════════ Runs ═══════════════════════════ */

export type RunStatus =
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "refused"
  | "cancelled";

export interface RunState {
  runId: string;
  agentId: string;
  agentVersion: number;
  workflowId: string;
  status: RunStatus;
  trigger: TriggerEvent;
  /**
   * Index of the NEXT step to execute. The approval interrupt persists this
   * and resumes from exactly here — the single most important field in the
   * runtime.
   */
  cursor: number;
  /** Accumulated step outputs, keyed by step id, available to later steps. */
  context: Record<string, unknown>;
  events: RunEvent[];
  /** Set while status is "awaiting_approval". */
  pendingApprovalId: string | null;
  startedAt: string;
  endedAt: string | null;
  /** Populated when status is "failed" or "refused". */
  failure: string | null;
}

/* ═══════════════════════════ Events ═══════════════════════════ */

export type RunEvent =
  | { kind: "run_started"; at: string; workflowId: string }
  | { kind: "step_started"; at: string; stepId: string; stepKind: StepKind; instruction: string }
  | { kind: "tool_call"; at: string; stepId: string; integrationId: string; operation: string; ok: boolean; summary: string }
  | { kind: "reasoning"; at: string; stepId: string; summary: string }
  | { kind: "needs_approval"; at: string; stepId: string; approvalId: string; reason: string; risk: RiskLevel; breachedLimits: string[] }
  | { kind: "approval_resolved"; at: string; stepId: string; approvalId: string; decision: ApprovalDecision["decision"] }
  | { kind: "refused"; at: string; stepId: string; reason: string }
  | { kind: "output"; at: string; stepId: string; outputKind: OutputSpec["kind"]; summary: string }
  | { kind: "error"; at: string; stepId: string | null; message: string; attempt: number }
  | { kind: "run_finished"; at: string; status: RunStatus };

/* ═══════════════════════════ Approvals ═══════════════════════════ */

export interface ApprovalRequest {
  approvalId: string;
  runId: string;
  agentId: string;
  workflowId: string;
  stepId: string;
  /** Frozen invocation — what the agent proposes to do. Replayed verbatim on
      approve, so the owner approves exactly what runs. */
  invocation: ToolInvocation;
  reason: string;
  risk: RiskLevel;
  breachedLimits: string[];
  approvalOwner: string;
  createdAt: string;
  /** createdAt + AgentPolicy.escalateAfterMins. */
  dueAt: string;
}

export interface ApprovalDecision {
  approvalId: string;
  decision: "approved" | "rejected";
  decidedBy: string;
  decidedAt: string;
  /** Required when rejected. */
  reason?: string;
  /**
   * Owner edits before approving. Merged over the frozen invocation's args,
   * producing an ApprovalVersion in the Operate surface (M5).
   */
  editedArgs?: Record<string, unknown>;
}

/* ═══════════════════════════ Persistence ═══════════════════════════ */

/**
 * Deliberately narrow so M0's storage decision can be swapped in without
 * touching the executor. The in-memory implementation is the test double;
 * the real one lands in M0/M4.
 */
export interface RunStore {
  createRun(state: RunState): Promise<void>;
  saveRun(state: RunState): Promise<void>;
  getRun(runId: string): Promise<RunState | null>;
  listRuns(filter?: { agentId?: string; status?: RunStatus }): Promise<RunState[]>;
  /** Returns false when the key has already been used — the scheduler's
      guarantee against double-firing a run (M4). */
  claimIdempotencyKey(key: string): Promise<boolean>;

  createApproval(request: ApprovalRequest): Promise<void>;
  getApproval(approvalId: string): Promise<ApprovalRequest | null>;
  getDecision(approvalId: string): Promise<ApprovalDecision | null>;
  saveDecision(decision: ApprovalDecision): Promise<void>;
  listPendingApprovals(): Promise<ApprovalRequest[]>;
}

/* ═══════════════════════════ Executor wiring ═══════════════════════════ */

/** Produces the structured result of a `reason` step. */
export interface Reasoner {
  reason(input: {
    systemPrompt: string;
    workflowPrompt: string;
    instruction: string;
    context: Record<string, unknown>;
  }): Promise<ReasonResult>;
}

export interface ReasonResult {
  /** Human-readable summary for the timeline. */
  summary: string;
  /** Structured data merged into run context for later steps. */
  data: Record<string, unknown>;
  /** Metric values this reasoning established, e.g. invoice.amount. Merged
      into the metrics of subsequent act steps so limits can be evaluated. */
  metrics?: Record<string, number>;
}

/** Injected so runs are deterministic in the sandbox (M3 exit criterion). */
export interface Clock {
  now(): Date;
}

export interface ExecutorDeps {
  store: RunStore;
  tools: IntegrationProvider;
  reasoner: Reasoner;
  clock: Clock;
  /** Deterministic id generation — seeded in sandbox, random in production. */
  newId(prefix: string): string;
}

/** Everything the executor needs about the agent, resolved once per run. */
export interface AgentBundle {
  spec: AgentSpec;
  pkg: AgentPackage;
}

export type { AgentSpec, WorkflowSpec, StepSpec, RiskLevel };
