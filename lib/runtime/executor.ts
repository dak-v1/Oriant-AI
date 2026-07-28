/**
 * lib/runtime/executor.ts — the agent executor and the approval interrupt.
 *
 * This is the spine of Role C (ROLE_C_PLAN M1). Every screen in Build and
 * Operate is a view over what happens here.
 *
 * The executor INTERPRETS the plan's ordered `StepSpec[]`. Control flow is
 * therefore deterministic TypeScript, not model output: the LLM is confined
 * to `reason` steps, and it can never invent a tool call, skip a policy check
 * or change the order of execution.
 *
 * THE APPROVAL INTERRUPT is the subtle part and the reason this file exists
 * as its own module. When policy says "ask the owner", the executor:
 *
 *   1. freezes the exact invocation it proposed into an ApprovalRequest,
 *   2. persists the run with `cursor` pointing AT the paused step,
 *   3. returns, leaving status "awaiting_approval".
 *
 * The process may then die. Later, resumeRun() reloads the run, replays the
 * frozen invocation verbatim (so the owner gets exactly what they approved,
 * plus any edits they made) and continues from the same cursor. The run is
 * never re-executed from the start, and the paused step is never performed
 * twice.
 *
 * Everything here is injectable — clock, ids, tools, reasoner, store — because
 * sandbox determinism (M3) requires that two runs of the same scenario produce
 * byte-identical event streams.
 */

import type {
  AgentPolicy,
  OutputSpec,
  QuietHours,
  StepSpec,
} from "../plan/types";
import {
  approvalDueAt,
  resolveAct,
  resolveFetch,
} from "./policy";
import type {
  AgentBundle,
  ApprovalDecision,
  CompiledWorkflow,
  ExecutorDeps,
  ReasonResult,
  RunEvent,
  RunState,
  RunStatus,
  ToolInvocation,
  ToolResult,
  TriggerEvent,
} from "./types";

/* ═══════════════════════ Context conventions ═══════════════════════ */

/**
 * Reserved keys inside RunState.context. Steps read and write ordinary keys
 * by step id; these two carry the cross-step state the runtime itself needs.
 */
export const METRICS_KEY = "__metrics";
/** The action the most recent `reason` step proposed; becomes an act's args. */
export const ACTION_KEY = "__action";

/** Sentinel used when an `approve` step pauses without any tool call. */
export const CHECKPOINT_INTEGRATION = "oriant";
export const CHECKPOINT_OPERATION = "workflow.checkpoint";

function isCheckpoint(invocation: ToolInvocation): boolean {
  return (
    invocation.integrationId === CHECKPOINT_INTEGRATION &&
    invocation.operation === CHECKPOINT_OPERATION
  );
}

/* ═══════════════════════════ Deps ═══════════════════════════ */

export interface ExecutorOptions extends ExecutorDeps {
  /** Injected so retry backoff never really waits in tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Per-step ceiling for a tool or reasoning call. 0 disables. */
  stepTimeoutMs?: number;
  /** plan.globalPolicy — needed for org-wide denies and the quiet window. */
  globalPolicy?: { quietHours: QuietHours | null; forbidden: string[] };
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ═══════════════════════════ Result ═══════════════════════════ */

export interface RunOutcome {
  run: RunState;
  /** Convenience mirror of run.status. */
  status: RunStatus;
  /** Set when the run paused; the approval the owner must decide. */
  approvalId: string | null;
}

/* ═══════════════════════════ Entry points ═══════════════════════════ */

/**
 * Start a new run for one workflow. Returns as soon as the run finishes OR
 * pauses for approval — pausing is a normal outcome, not an error.
 */
export async function startRun(
  bundle: AgentBundle,
  trigger: TriggerEvent,
  deps: ExecutorOptions,
): Promise<RunOutcome> {
  const workflow = findWorkflow(bundle, trigger.workflowId);

  // The scheduler may deliver the same trigger twice; only one run may exist.
  const claimed = await deps.store.claimIdempotencyKey(trigger.idempotencyKey);
  if (!claimed) {
    const existing = (await deps.store.listRuns({ agentId: bundle.spec.id })).find(
      (r) => r.trigger.idempotencyKey === trigger.idempotencyKey,
    );
    if (existing) {
      return { run: existing, status: existing.status, approvalId: existing.pendingApprovalId };
    }
    throw new Error(
      `Trigger ${trigger.idempotencyKey} was already claimed but no run was found.`,
    );
  }

  const startedAt = deps.clock.now();
  const state: RunState = {
    runId: deps.newId("run"),
    agentId: bundle.spec.id,
    agentVersion: bundle.pkg.agentVersion,
    workflowId: workflow.workflowId,
    status: "running",
    trigger,
    cursor: 0,
    context: { [METRICS_KEY]: {}, trigger: trigger.payload },
    events: [],
    pendingApprovalId: null,
    startedAt: startedAt.toISOString(),
    endedAt: null,
    failure: null,
  };

  emit(state, { kind: "run_started", at: iso(deps), workflowId: workflow.workflowId });
  await deps.store.createRun(state);

  return drive(state, bundle, workflow, deps);
}

/**
 * Resume a paused run once its approval has been decided.
 *
 * Safe to call more than once: a run that is no longer awaiting approval is
 * returned untouched rather than re-executed.
 */
export async function resumeRun(
  runId: string,
  bundle: AgentBundle,
  deps: ExecutorOptions,
): Promise<RunOutcome> {
  const state = await deps.store.getRun(runId);
  if (!state) throw new Error(`Run ${runId} not found.`);

  if (state.status !== "awaiting_approval") {
    return { run: state, status: state.status, approvalId: state.pendingApprovalId };
  }

  const approvalId = state.pendingApprovalId;
  if (!approvalId) {
    throw new Error(`Run ${runId} is awaiting approval but carries no approval id.`);
  }

  const decision = await deps.store.getDecision(approvalId);
  if (!decision) {
    // Still pending; nothing to do.
    return { run: state, status: state.status, approvalId };
  }

  const request = await deps.store.getApproval(approvalId);
  if (!request) throw new Error(`Approval ${approvalId} not found for run ${runId}.`);

  const workflow = findWorkflow(bundle, state.workflowId);
  const step = workflow.steps[state.cursor];
  if (!step) throw new Error(`Run ${runId} resumed at an out-of-range step.`);

  emit(state, {
    kind: "approval_resolved",
    at: iso(deps),
    stepId: step.id,
    approvalId,
    decision: decision.decision,
  });

  if (decision.decision === "rejected") {
    state.pendingApprovalId = null;
    emit(state, {
      kind: "refused",
      at: iso(deps),
      stepId: step.id,
      reason: decision.reason ?? "The owner rejected this action.",
    });
    return finish(state, "refused", deps, decision.reason ?? "Rejected by owner.");
  }

  // Approved. Replay the FROZEN invocation, with any owner edits merged over
  // it, so what runs is exactly what was shown and agreed.
  state.status = "running";
  state.pendingApprovalId = null;

  if (!isCheckpoint(request.invocation)) {
    const invocation: ToolInvocation = {
      ...request.invocation,
      args: { ...request.invocation.args, ...(decision.editedArgs ?? {}) },
    };

    // Defence in depth: the plan may have changed while the run was paused.
    // An owner approval can never authorise something now forbidden or no
    // longer granted.
    const recheck = resolveAct({
      invocation,
      policy: bundle.spec.policy,
      globalForbidden: deps.globalPolicy?.forbidden ?? [],
      allowedOperations: bundle.pkg.allowedOperations,
      stepRisk: step.risk,
    });
    if (recheck.action === "refuse") {
      emit(state, { kind: "refused", at: iso(deps), stepId: step.id, reason: recheck.reason });
      return finish(state, "refused", deps, recheck.reason);
    }

    const performed = await performTool(state, step, invocation, bundle, deps);
    if (!performed.ok) {
      return finish(state, "failed", deps, performed.error ?? "Tool call failed.");
    }
    state.context[step.id] = performed.data;
  }

  state.cursor += 1;
  await deps.store.saveRun(state);

  return drive(state, bundle, workflow, deps);
}

/** Mark a run cancelled. The step loop stops at the next boundary. */
export async function cancelRun(runId: string, deps: ExecutorOptions): Promise<void> {
  const state = await deps.store.getRun(runId);
  if (!state) return;
  if (state.status === "completed" || state.status === "failed") return;
  state.status = "cancelled";
  state.endedAt = iso(deps);
  emit(state, { kind: "run_finished", at: iso(deps), status: "cancelled" });
  await deps.store.saveRun(state);
}

/* ═══════════════════════════ The step loop ═══════════════════════════ */

async function drive(
  state: RunState,
  bundle: AgentBundle,
  workflow: CompiledWorkflow,
  deps: ExecutorOptions,
): Promise<RunOutcome> {
  const policy = bundle.spec.policy;
  const globalForbidden = deps.globalPolicy?.forbidden ?? [];

  while (state.cursor < workflow.steps.length) {
    // A cancel may have landed between steps.
    const fresh = await deps.store.getRun(state.runId);
    if (fresh?.status === "cancelled") {
      return { run: fresh, status: "cancelled", approvalId: null };
    }

    const step = workflow.steps[state.cursor];
    if (!step) break;

    emit(state, {
      kind: "step_started",
      at: iso(deps),
      stepId: step.id,
      stepKind: step.kind,
      instruction: step.instruction,
    });

    try {
      switch (step.kind) {
        case "fetch": {
          const outcome = await runFetch(state, step, bundle, deps, policy, globalForbidden);
          if (outcome) return outcome;
          break;
        }
        case "reason": {
          await runReason(state, step, bundle, workflow, deps);
          break;
        }
        case "act": {
          const outcome = await runAct(state, step, bundle, deps, policy, globalForbidden);
          if (outcome) return outcome;
          break;
        }
        case "approve": {
          return await pauseForCheckpoint(state, step, bundle, deps);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emit(state, { kind: "error", at: iso(deps), stepId: step.id, message, attempt: 1 });
      return finish(state, "failed", deps, message);
    }

    state.cursor += 1;
    await deps.store.saveRun(state);
  }

  emit(state, {
    kind: "output",
    at: iso(deps),
    stepId: workflow.steps[workflow.steps.length - 1]?.id ?? "-",
    outputKind: workflow.output.kind,
    summary: summariseOutput(state, workflow.output),
  });

  return finish(state, "completed", deps, null);
}

/* ═══════════════════════════ Step kinds ═══════════════════════════ */

/** Returns a RunOutcome only when the run must stop here. */
async function runFetch(
  state: RunState,
  step: StepSpec,
  bundle: AgentBundle,
  deps: ExecutorOptions,
  policy: AgentPolicy,
  globalForbidden: string[],
): Promise<RunOutcome | null> {
  if (!step.tool) {
    const reason = `Fetch step ${step.id} declares no tool.`;
    emit(state, { kind: "refused", at: iso(deps), stepId: step.id, reason });
    return finish(state, "failed", deps, reason);
  }

  const decision = resolveFetch(
    step.tool.operation,
    bundle.pkg.allowedOperations,
    globalForbidden,
    policy,
  );
  if (decision.action !== "allow") {
    emit(state, { kind: "refused", at: iso(deps), stepId: step.id, reason: decision.reason });
    return finish(state, "refused", deps, decision.reason);
  }

  const invocation: ToolInvocation = {
    integrationId: step.tool.integrationId,
    operation: step.tool.operation,
    args: { ...(state.context[ACTION_KEY] as Record<string, unknown> | undefined) },
    metrics: {},
  };

  const result = await performTool(state, step, invocation, bundle, deps);
  if (!result.ok) {
    return finish(state, "failed", deps, result.error ?? "Fetch failed.");
  }
  state.context[step.id] = result.data;
  return null;
}

async function runReason(
  state: RunState,
  step: StepSpec,
  bundle: AgentBundle,
  workflow: CompiledWorkflow,
  deps: ExecutorOptions,
): Promise<void> {
  const result = await withTimeout(
    deps,
    () =>
      deps.reasoner.reason({
        systemPrompt: bundle.pkg.systemPrompt,
        workflowPrompt: workflow.prompt,
        instruction: step.instruction,
        context: state.context,
      }),
    `reason step ${step.id}`,
  );

  applyReasonResult(state, step.id, result);
  emit(state, { kind: "reasoning", at: iso(deps), stepId: step.id, summary: result.summary });
}

/**
 * Metrics from reasoning are what make limits evaluable: an `act` step can only
 * be checked against `invoice.amount <= 500` if some earlier step established
 * the amount. Later steps overwrite earlier ones for the same metric.
 */
function applyReasonResult(state: RunState, stepId: string, result: ReasonResult): void {
  state.context[stepId] = result.data;
  state.context[ACTION_KEY] = result.data;
  const merged = {
    ...((state.context[METRICS_KEY] as Record<string, number>) ?? {}),
    ...(result.metrics ?? {}),
  };
  state.context[METRICS_KEY] = merged;
}

async function runAct(
  state: RunState,
  step: StepSpec,
  bundle: AgentBundle,
  deps: ExecutorOptions,
  policy: AgentPolicy,
  globalForbidden: string[],
): Promise<RunOutcome | null> {
  if (!step.tool) {
    // Validator rule 6 should have prevented this reaching production.
    const reason = `Act step ${step.id} declares no tool.`;
    emit(state, { kind: "refused", at: iso(deps), stepId: step.id, reason });
    return finish(state, "failed", deps, reason);
  }

  const invocation: ToolInvocation = {
    integrationId: step.tool.integrationId,
    operation: step.tool.operation,
    args: { ...(state.context[ACTION_KEY] as Record<string, unknown> | undefined) },
    metrics: { ...((state.context[METRICS_KEY] as Record<string, number>) ?? {}) },
  };

  const decision = resolveAct({
    invocation,
    policy,
    globalForbidden,
    allowedOperations: bundle.pkg.allowedOperations,
    stepRisk: step.risk,
  });

  if (decision.action === "refuse") {
    emit(state, { kind: "refused", at: iso(deps), stepId: step.id, reason: decision.reason });
    return finish(state, "refused", deps, decision.reason);
  }

  if (decision.action === "require_approval") {
    return pauseForApproval(state, step, invocation, bundle, deps, {
      reason: decision.reason,
      risk: decision.risk,
      breachedLimits: decision.breachedLimits,
    });
  }

  const result = await performTool(state, step, invocation, bundle, deps);
  if (!result.ok) {
    return finish(state, "failed", deps, result.error ?? "Action failed.");
  }
  state.context[step.id] = result.data;
  return null;
}

/* ═══════════════════════ The approval interrupt ═══════════════════════ */

async function pauseForApproval(
  state: RunState,
  step: StepSpec,
  invocation: ToolInvocation,
  bundle: AgentBundle,
  deps: ExecutorOptions,
  detail: { reason: string; risk: "low" | "medium" | "high"; breachedLimits: string[] },
): Promise<RunOutcome> {
  const now = deps.clock.now();
  const approvalId = deps.newId("ap");

  await deps.store.createApproval({
    approvalId,
    runId: state.runId,
    agentId: state.agentId,
    workflowId: state.workflowId,
    stepId: step.id,
    // Frozen: the owner approves exactly this, and exactly this is replayed.
    invocation,
    reason: detail.reason,
    risk: detail.risk,
    breachedLimits: detail.breachedLimits,
    approvalOwner: bundle.spec.policy.approvalOwner,
    createdAt: now.toISOString(),
    dueAt: approvalDueAt(now, bundle.spec.policy),
  });

  emit(state, {
    kind: "needs_approval",
    at: iso(deps),
    stepId: step.id,
    approvalId,
    reason: detail.reason,
    risk: detail.risk,
    breachedLimits: detail.breachedLimits,
  });

  // cursor stays ON this step: resume re-enters exactly here.
  state.status = "awaiting_approval";
  state.pendingApprovalId = approvalId;
  await deps.store.saveRun(state);

  return { run: state, status: "awaiting_approval", approvalId };
}

/** An `approve` step is an unconditional checkpoint with no tool call. */
async function pauseForCheckpoint(
  state: RunState,
  step: StepSpec,
  bundle: AgentBundle,
  deps: ExecutorOptions,
): Promise<RunOutcome> {
  const invocation: ToolInvocation = {
    integrationId: CHECKPOINT_INTEGRATION,
    operation: CHECKPOINT_OPERATION,
    args: { ...(state.context[ACTION_KEY] as Record<string, unknown> | undefined) },
    metrics: { ...((state.context[METRICS_KEY] as Record<string, number>) ?? {}) },
  };
  return pauseForApproval(state, step, invocation, bundle, deps, {
    reason: step.instruction,
    risk: step.risk ?? "medium",
    breachedLimits: [],
  });
}

/* ═══════════════════════════ Tool calls ═══════════════════════════ */

/**
 * Performs a sanctioned invocation with the workflow's retry policy. Policy
 * has already decided this call may happen; failures here are transport
 * failures, not authorisation failures.
 */
async function performTool(
  state: RunState,
  step: StepSpec,
  invocation: ToolInvocation,
  bundle: AgentBundle,
  deps: ExecutorOptions,
): Promise<ToolResult> {
  const workflow = findWorkflow(bundle, state.workflowId);
  const failurePolicy = bundle.spec.workflows.find((w) => w.id === workflow.workflowId)
    ?.onFailure ?? { retries: 0, backoffSeconds: 0, onExhausted: "notify_owner" as const };

  const client = deps.tools.getToolClient(invocation.integrationId);
  if (!client) {
    // Not connected. Distinct from "not permitted": the plan allowed it, the
    // owner simply has not connected the tool yet (Activation gates on this).
    const message = `Integration ${invocation.integrationId} is not connected.`;
    emit(state, { kind: "error", at: iso(deps), stepId: step.id, message, attempt: 1 });
    return { ok: false, error: message };
  }

  const sleep = deps.sleep ?? defaultSleep;
  const attempts = Math.max(0, failurePolicy.retries) + 1;
  let last: ToolResult = { ok: false, error: "not attempted" };

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      last = await withTimeout(deps, () => client.call(invocation), `tool ${invocation.operation}`);
    } catch (err) {
      last = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    if (last.ok) {
      emit(state, {
        kind: "tool_call",
        at: iso(deps),
        stepId: step.id,
        integrationId: invocation.integrationId,
        operation: invocation.operation,
        ok: true,
        summary: describeArgs(invocation),
      });
      return last;
    }

    emit(state, {
      kind: "error",
      at: iso(deps),
      stepId: step.id,
      message: last.error ?? "tool call failed",
      attempt,
    });

    if (attempt < attempts && failurePolicy.backoffSeconds > 0) {
      await sleep(failurePolicy.backoffSeconds * 1000 * attempt);
    }
  }

  emit(state, {
    kind: "tool_call",
    at: iso(deps),
    stepId: step.id,
    integrationId: invocation.integrationId,
    operation: invocation.operation,
    ok: false,
    summary: `failed after ${attempts} attempt(s): ${last.error ?? "unknown"}`,
  });

  // onExhausted shapes what the Operate surface does next (M5); all three
  // outcomes end the run here, and the distinction is recorded on the run.
  return { ok: false, error: `${last.error ?? "tool call failed"} [${failurePolicy.onExhausted}]` };
}

async function withTimeout<T>(
  deps: ExecutorOptions,
  fn: () => Promise<T>,
  label: string,
): Promise<T> {
  const ms = deps.stepTimeoutMs ?? 60_000;
  if (ms <= 0) return fn();

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ═══════════════════════════ Helpers ═══════════════════════════ */

function findWorkflow(bundle: AgentBundle, workflowId: string): CompiledWorkflow {
  const workflow = bundle.pkg.workflows.find((w) => w.workflowId === workflowId);
  if (!workflow) {
    throw new Error(`Workflow ${workflowId} is not present in agent package ${bundle.spec.id}.`);
  }
  if (!workflow.enabled) {
    throw new Error(`Workflow ${workflowId} is disabled.`);
  }
  return workflow;
}

function emit(state: RunState, event: RunEvent): void {
  state.events.push(event);
}

function iso(deps: ExecutorOptions): string {
  return deps.clock.now().toISOString();
}

async function finish(
  state: RunState,
  status: RunStatus,
  deps: ExecutorOptions,
  failure: string | null,
): Promise<RunOutcome> {
  state.status = status;
  state.endedAt = iso(deps);
  state.failure = failure;
  emit(state, { kind: "run_finished", at: iso(deps), status });
  await deps.store.saveRun(state);
  return { run: state, status, approvalId: state.pendingApprovalId };
}

function describeArgs(invocation: ToolInvocation): string {
  const keys = Object.keys(invocation.args);
  return keys.length ? `${invocation.operation} (${keys.join(", ")})` : invocation.operation;
}

function summariseOutput(state: RunState, output: OutputSpec): string {
  const action = state.context[ACTION_KEY] as Record<string, unknown> | undefined;
  const headline =
    typeof action?.summary === "string" ? action.summary : output.successCriteria;
  return `${output.kind}: ${headline}`;
}

/* ═══════════════════════ Decision helper ═══════════════════════ */

/**
 * Record an owner decision and immediately continue the run. This is the
 * single call the Approvals inbox (M5) makes; it keeps "decide" and "resume"
 * atomic from the caller's point of view.
 */
export async function decideAndResume(
  decision: ApprovalDecision,
  bundle: AgentBundle,
  deps: ExecutorOptions,
): Promise<RunOutcome> {
  const request = await deps.store.getApproval(decision.approvalId);
  if (!request) throw new Error(`Approval ${decision.approvalId} not found.`);
  await deps.store.saveDecision(decision);
  return resumeRun(request.runId, bundle, deps);
}
