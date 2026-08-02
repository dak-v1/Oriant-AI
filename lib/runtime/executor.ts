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
 * THAT CONFINEMENT IS ALSO WHY A TOOL'S ARGUMENT SCHEMA IS A REASON-STEP
 * CONCERN. An `act` step names an integration and an operation and carries no
 * arguments of its own; what it sends is `context[ACTION_KEY]`, which the
 * preceding `reason` step wrote. So "the model produced `to` where Composio
 * wanted `recipient_email`" cannot be fixed at the act step — by then the only
 * options are translating a guess or refusing. `toolSchemaBlock` below puts the
 * tool's own published schema into the prompt of the step that produces the
 * arguments, and lib/runtime/tools/composio.ts checks the result against that
 * same schema before anything leaves the process. Guidance here; the gate there.
 *
 * A `fetch` STEP HAS NO SUCH PRECEDING STEP TO RELY ON, and that was the hole.
 * `runFetch` built its arguments from the same ACTION_KEY, so a workflow whose
 * FIRST step is a fetch sent `{}` — and `{}` is not an error. Composio's
 * GMAIL_LIST_THREADS and GOOGLECALENDAR_FIND_FREE_SLOTS both publish
 * `required: []`, so an empty argument list is accepted and means "every thread
 * in the mailbox" and "free slots with no time bounds". The run record then
 * reports ok on an answer to a question nobody asked. A `required`-based shape
 * check cannot catch that: nothing is missing and no name is unknown.
 *
 * Two changes close it, and they are deliberately on opposite sides of the seam.
 * `StepSpec.argumentSource` (lib/plan/types.ts) lets the plan SAY where a step's
 * arguments come from — stated values, the preceding reason step, or none with a
 * written justification. `guardFetchArguments` below is the gate: before any
 * fetch is sent, and only against a provider that can describe its own tools, an
 * empty argument list is refused when the tool publishes any parameter at all,
 * unless the plan declared "none" and said why. Fail closed — a schema that
 * cannot be read refuses too. See `resolveStepArguments`.
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
 * Two guards make "exactly what they approved" true rather than merely
 * intended. Resume refuses to continue when the step under the cursor is no
 * longer the step the ApprovalRequest froze — a plan edited while the approval
 * sat in the inbox would otherwise replay the frozen send against a different
 * step and then propose it a second time. And resume CLAIMS the run before it
 * does any work, flipping "awaiting_approval" to "running" and persisting that
 * first, so two concurrent resumes cannot both decide they are the one that
 * gets to act.
 *
 * CANCELLATION is cooperative and bounded by step boundaries: a cancel that
 * lands while a tool call is already in flight cannot un-send it. What it does
 * guarantee is that no later step runs. That guarantee rests on persist()
 * below — nothing may write over a terminal status, so a step loop holding a
 * stale copy of the run can no longer resurrect it at the next boundary.
 *
 * A RESUMED RUN ANNOUNCES ITSELF, because nothing else can see it finish. A run
 * the scheduler started ends inside a worker pass, and that pass is what fans
 * out to whatever was chained behind it. A run that PAUSED settles its job
 * immediately and finishes much later, inside resumeRun, which no pass ever
 * observes — and on the BrightPath plan that is the ordinary path rather than
 * the edge case, because the Friday sweep pauses on its first over-limit
 * invoice. So `ExecutorOptions.onRunResumed` is called once per resume that
 * actually did work, whatever the outcome.
 *
 * It is a CALLBACK, not a call into lib/runtime/schedule, and the reason is
 * structural rather than stylistic: the scheduler already imports this module,
 * so importing it back would close a cycle — and this module has no business
 * knowing what a dependency trigger is in the first place. What the executor
 * owes is the fact ("this resume settled, here is the outcome"); deciding what
 * that means belongs to whoever wired it up. lib/runtime/approvals.ts supplies
 * the wiring the Approvals inbox uses.
 *
 * Deliberately NOT emitted from finish(), which would also fire for runs the
 * worker started — the worker fans those out itself, and a second fan-out would
 * double-count its summary. Narrowing the notice to the resume path makes that
 * overlap impossible rather than merely unlikely.
 *
 * THE METRIC TRUST BOUNDARY is the honest weak point of this design, so it is
 * written down here rather than glossed. policy.ts decides whether an act may
 * proceed by evaluating `PolicyLimit` against `ToolInvocation.metrics`, and
 * those numbers originate in `ReasonResult.metrics` — that is, in the model. A
 * model that understates `invoice.amount` would otherwise walk straight past
 * the limit that exists to stop it.
 *
 * auditMetrics() narrows that gap without inventing a schema the contract does
 * not have. It can verify a metric shaped `<collection>.<field>` when a fetch
 * step returned that collection AND the act's own arguments name a specific
 * record in it: there the fetched record wins outright, and a disagreement both
 * corrects the number and forces an approval that names the two figures.
 *
 * What it CANNOT verify, stated plainly:
 *
 *   - metrics with no fetch-side source at all — `emails.per_run`,
 *     `bookings.per_run`, `booking.notice_hours`, the contract's own
 *     `discount.percent`. They describe what the agent DECIDED, not any record
 *     it read. They stay model-asserted, and a model that understates one
 *     evades that limit.
 *   - any act whose arguments identify no record. With no target there is
 *     nothing to compare against, and clamping to the batch maximum instead
 *     would escalate every routine run.
 *   - the mapping from `PolicyLimit.metric` to a record field, which is
 *     inferred from the metric id because contract §8 Q4 is still open with D.
 *     A metric named differently from the collection it describes is simply
 *     unverifiable.
 *
 * `StepSpec.emptyBatch` (the batch-empty skip in runAct) leans on this same
 * boundary from its SAFE side: the declared batch metric is usually
 * model-asserted, so a model could understate it to zero — but a zero can only
 * suppress that step's own action, never cause one. Anything that actually
 * performs still walks the full six-step order.
 *
 * So: the limits are NOT airtight. Where a number cannot be corroborated,
 * enforcement rests on the model reporting honestly, and the prompt rules in
 * llm.ts are defence in depth, not a control. Closing this properly needs the
 * metric vocabulary agreed with D and `metricSources` carried on
 * `ToolInvocation` all the way into the M5 approval card.
 *
 * Everything here is injectable — clock, ids, tools, reasoner, store — because
 * sandbox determinism (M3) requires that two runs of the same scenario produce
 * byte-identical event streams.
 */

import type {
  AgentPolicy,
  FailurePolicy,
  OutputSpec,
  QuietHours,
  StepArgumentSource,
  StepSpec,
} from "../plan/types";
import {
  approvalDueAt,
  resolveAct,
  resolveFetch,
} from "./policy";
import {
  asToolSchemaSource,
  checkArgumentsAgainstSchema,
  summariseArgumentNames,
  type ToolArgumentLookup,
} from "./tools/schema";
import type {
  AgentBundle,
  ApprovalDecision,
  ApprovalRequest,
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
/**
 * Provenance for the numbers the most recent `act` step was judged on — see
 * auditMetrics(). It belongs on `ToolInvocation` so it can travel into the M5
 * approval card; until that type change is agreed it rides here, where it is
 * at least persisted with the run.
 */
export const METRIC_SOURCES_KEY = "__metricSources";
/**
 * What `FailurePolicy.onExhausted` asked for when a tool call ran out of
 * retries. Recorded as data so a notifier (M7) can act on it; see performTool.
 */
export const FAILURE_NOTICE_KEY = "__failureNotice";
/**
 * Every fetch this run made with no arguments against a tool that accepts some —
 * i.e. every deliberately unfiltered read. See `guardFetchArguments`.
 */
export const UNFILTERED_FETCH_KEY = "__unfilteredFetches";
/**
 * The run's own facts, for the model to reason FROM.
 *
 * WHY THIS IS HERE AND NOT ON `trigger`. The context already carries
 * `trigger: trigger.payload`, and a payload is whatever the integration sent —
 * `{}` for every schedule trigger, which is most of them. `TriggerEvent.firedAt`
 * was thrown away at the same line, so the model was never told WHEN it is
 * running. That is the fact a `reason` step needs before it can produce the one
 * argument shape a literal cannot express: a window relative to now. A tool
 * schema saying `time_min — ISO-8601 timestamp` is unanswerable by a model that
 * does not know the date, and it would answer anyway.
 *
 * REJECTED: seeding ACTION_KEY from `trigger.payload` so the first fetch has
 * something to send. A webhook payload's field names are not the tool's argument
 * names, so that turns a silent unfiltered read into a refused one at best and a
 * wrong-shaped send at worst — and it does nothing at all for the schedule
 * triggers this was supposed to fix, whose payload is empty. The trigger's facts
 * are evidence, not arguments; they go where evidence goes.
 *
 * Prefixed `__` like the rest of the envelope, which is what keeps
 * `FixtureReasoner`'s context walk (lib/runtime/llm.ts) from harvesting it as
 * though it were tool output.
 */
export const RUN_FACTS_KEY = "__run";

export interface RunFacts {
  /** `TriggerEvent.firedAt` — when this run's trigger fired, ISO 8601. */
  firedAt: string;
}

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
  /**
   * Called once, after a resume that actually drove the run, with whatever the
   * run settled as — completed, refused, failed, or paused again at a second
   * approval. See the module header for why this exists as a callback and why it
   * is confined to the resume path.
   *
   * Optional, and its absence changes nothing about the run: a caller that does
   * not care (the sandbox, the M1 checks) supplies nothing. It may throw; the
   * throw is caught and reported on `RunOutcome.followUpError` rather than
   * turning a settled, correct run into a failure, because by the time this is
   * called the run is already persisted and terminal and there is nowhere left
   * to record a failure against it.
   */
  onRunResumed?(outcome: RunOutcome): Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ═══════════════════════ Terminal status ═══════════════════════ */

/**
 * A run that has reached one of these is over. Terminal is forever: nothing in
 * this module ever writes a status over one of them, which is what makes a
 * cancellation stick.
 */
const TERMINAL_STATUSES: readonly RunStatus[] = [
  "completed",
  "failed",
  "refused",
  "cancelled",
];

function isTerminalStatus(status: RunStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Every write to a live run goes through here.
 *
 * A run object is held in memory across awaits — a tool call, a model call, a
 * human deciding. Meanwhile another actor (cancelRun, in practice) can reach
 * the store first and write a terminal status. Saving our stale copy over it
 * would resurrect the run, and the loop would carry on and perform the very
 * side effect the cancel existed to prevent. Routing every save through one
 * place is what makes that impossible by construction rather than by four
 * call sites each remembering to check.
 *
 * Returns the authoritative stored run when the write was refused, and null
 * when it landed. Callers must treat a non-null return as "someone else
 * finished this run" and hand that run back rather than continuing.
 *
 * This is a precondition a real store should enforce itself —
 * `UPDATE runs SET ... WHERE run_id = $1 AND status NOT IN (<terminal>)`,
 * checking the affected row count. Doing it here leaves a window between the
 * read and the write, which is exactly why cancellation is documented as
 * cooperative at step boundaries rather than immediate. Closing the window
 * needs a conditional write on `RunStore` (lib/runtime/types.ts), which this
 * module cannot add on its own.
 */
async function persist(state: RunState, deps: ExecutorOptions): Promise<RunState | null> {
  const stored = await deps.store.getRun(state.runId);
  if (stored && isTerminalStatus(stored.status)) return stored;
  await deps.store.saveRun(state);
  return null;
}

/** The outcome shape for a run some other actor already brought to an end. */
function outcomeOf(run: RunState): RunOutcome {
  return { run, status: run.status, approvalId: run.pendingApprovalId };
}

/* ═══════════════════════════ Result ═══════════════════════════ */

export interface RunOutcome {
  run: RunState;
  /** Convenience mirror of run.status. */
  status: RunStatus;
  /** Set when the run paused; the approval the owner must decide. */
  approvalId: string | null;
  /**
   * Set when `ExecutorOptions.onRunResumed` threw. The run itself is settled and
   * correct; only the caller's follow-on work failed — queuing the dependent
   * workflows, in practice. Reported here for the same reason the worker records
   * a failed fan-out on its job outcome rather than on the run: losing the
   * dependents is worth saying out loud, and pretending the run went wrong is
   * not the way to say it.
   */
  followUpError?: string;
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
    context: {
      [METRICS_KEY]: {},
      [RUN_FACTS_KEY]: { firedAt: trigger.firedAt } satisfies RunFacts,
      trigger: trigger.payload,
    },
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
 * In-flight resumes, one chain per run.
 *
 * The claim below is compare-and-set SHAPED, but `RunStore` offers no
 * conditional write today: `getRun` and `saveRun` are two separate awaits, so
 * two concurrent resumes can both read "awaiting_approval" and both go on to
 * replay the frozen invocation — the customer gets two identical emails. This
 * queue is what makes the claim real in the meantime: every resume for a given
 * run runs to completion before the next one takes its first read, so the loser
 * sees the settled status and returns the run untouched, exactly as resumeRun's
 * docstring promises.
 *
 * In-process only, and it does not pretend otherwise. Two Node processes over
 * one database still need the store to express the claim as
 * `UPDATE runs SET status='running' WHERE run_id = $1 AND status =
 * 'awaiting_approval'` and check the affected row count. The entry is dropped
 * as soon as its tail settles, so nothing accumulates and no state leaks
 * between runs or between tests.
 */
const resumeQueue = new Map<string, Promise<void>>();

function serialiseByRun<T>(runId: string, work: () => Promise<T>): Promise<T> {
  const previous = resumeQueue.get(runId) ?? Promise.resolve();
  const result = previous.then(work);
  // The chain must survive a rejected link, or one failed resume would reject
  // every resume queued behind it.
  const link = result.then(
    () => undefined,
    () => undefined,
  );
  resumeQueue.set(runId, link);
  void link.then(() => {
    if (resumeQueue.get(runId) === link) resumeQueue.delete(runId);
  });
  return result;
}

/**
 * Resume a paused run once its approval has been decided.
 *
 * Safe to call more than once, and safe to call concurrently: exactly one
 * caller claims the run, and every other caller is handed the run untouched
 * rather than re-executing it.
 */
export async function resumeRun(
  runId: string,
  bundle: AgentBundle,
  deps: ExecutorOptions,
): Promise<RunOutcome> {
  return serialiseByRun(runId, () => resumeOnce(runId, bundle, deps));
}

async function resumeOnce(
  runId: string,
  bundle: AgentBundle,
  deps: ExecutorOptions,
): Promise<RunOutcome> {
  const state = await deps.store.getRun(runId);
  if (!state) throw new Error(`Run ${runId} not found.`);

  if (state.status !== "awaiting_approval") {
    return outcomeOf(state);
  }

  const approvalId = state.pendingApprovalId;
  if (!approvalId) {
    throw new Error(`Run ${runId} is awaiting approval but carries no approval id.`);
  }

  const decision = await deps.store.getDecision(approvalId);
  if (!decision) {
    // Still pending; nothing to do. Note this is a legitimate call, which is
    // why the claim below cannot live at the top of the function: flipping an
    // undecided run to "running" here would strand it.
    return { run: state, status: state.status, approvalId };
  }

  const request = await deps.store.getApproval(approvalId);
  if (!request) throw new Error(`Approval ${approvalId} not found for run ${runId}.`);

  const workflow = findWorkflow(bundle, state.workflowId);
  const step = workflow.steps[state.cursor];

  // Claim the run before any work happens. One resume gets through; the rest
  // read the settled status and hand it back. Placed after the lookups above
  // so a single claim covers both the approve and the reject branch.
  const claimed = await claimForResume(state, deps);
  if (!claimed) {
    const fresh = await deps.store.getRun(runId);
    // Never report the stale local copy: it still says "awaiting_approval" and
    // would tell the loser the opposite of what happened.
    // No announcement either: this call drove nothing, and the resume that did
    // has already made — or will make — the one notice this run gets.
    return fresh ? outcomeOf(fresh) : outcomeOf(state);
  }

  // Past the claim this call owns the resume, so it also owns the notice that
  // the run settled. Splitting the rest out is what makes that exactly one
  // expression to wrap, rather than five returns each remembering to announce.
  const outcome = await applyDecision(state, bundle, workflow, step, request, decision, deps);
  return announceResume(outcome, deps);
}

/**
 * Everything a claimed resume does: verify the plan has not drifted under the
 * approval, record the decision, replay or refuse, and carry the workflow on.
 */
async function applyDecision(
  state: RunState,
  bundle: AgentBundle,
  workflow: CompiledWorkflow,
  step: StepSpec | undefined,
  request: ApprovalRequest,
  decision: ApprovalDecision,
  deps: ExecutorOptions,
): Promise<RunOutcome> {
  const runId = state.runId;
  const approvalId = request.approvalId;

  // The cursor is an INDEX, and the approval froze a step ID. If the plan was
  // re-approved while this sat in the inbox, the index can now point at a
  // different step — and replaying the frozen send against it would perform
  // the side effect under the wrong step and then propose the same send again
  // at the real one. The owner approved a step, not a position in a list.
  //
  // The guard runs before the approval_resolved emit so the event stream is
  // never annotated against the drifted step, and it covers `approve`-step
  // checkpoints too, where no tool runs but the cursor still advances into a
  // step nobody reviewed. It fails the run rather than throwing: the decision
  // is already recorded and write-once, so a throw would leave the run wedged
  // in "awaiting_approval" with every retry dying in saveDecision.
  if (!step || step.id !== request.stepId) {
    const reason =
      `Run ${runId} was paused at step ${request.stepId} (index ${state.cursor}) but the ` +
      `agent package now has ${step ? `"${step.id}"` : "no step"} there. The workflow changed ` +
      `while the approval was pending, so the approved action will not be replayed against a ` +
      `different step list.`;
    // Named for the step the OWNER saw, not the one that drifted under it.
    emit(state, {
      kind: "error",
      at: iso(deps),
      stepId: request.stepId,
      message: reason,
      attempt: 1,
    });
    return finish(state, "failed", deps, reason);
  }

  emit(state, {
    kind: "approval_resolved",
    at: iso(deps),
    stepId: step.id,
    approvalId,
    decision: decision.decision,
  });

  if (decision.decision === "rejected") {
    emit(state, {
      kind: "refused",
      at: iso(deps),
      stepId: step.id,
      reason: decision.reason ?? "The owner rejected this action.",
    });
    return finish(state, "refused", deps, decision.reason ?? "Rejected by owner.");
  }

  // Approved. Replay the FROZEN invocation, with any owner edits merged over
  // it, so what runs is exactly what was shown and agreed. Its metrics were
  // audited against the fetch results when the approval was raised; they are
  // not re-derived here, because the frozen numbers are the ones the owner saw.
  if (!isCheckpoint(request.invocation)) {
    const invocation: ToolInvocation = {
      ...request.invocation,
      args: resolvedApprovalArgs(request, decision),
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
  const clobbered = await persist(state, deps);
  if (clobbered) return outcomeOf(clobbered);

  return drive(state, bundle, workflow, deps);
}

/**
 * The arguments a decided approval actually executes with: the frozen
 * invocation's args, with the owner's edits laid over them.
 *
 * One line, exported, and used by the replay above rather than restated at the
 * call site — because lib/runtime/approvals.ts derives the owner's
 * `ApprovalVersion` from this same expression. A version describing a different
 * merge than the one that ran would be an audit trail of something that never
 * happened, and two copies of a spread is exactly the kind of duplication that
 * drifts without anyone noticing.
 */
export function resolvedApprovalArgs(
  request: ApprovalRequest,
  decision: ApprovalDecision,
): Record<string, unknown> {
  return { ...request.invocation.args, ...(decision.editedArgs ?? {}) };
}

/**
 * Tell the caller its resume settled, if it asked to be told.
 *
 * The callback's failure is caught and carried on the outcome rather than
 * thrown. By this point the run is terminal and persisted, and persist() refuses
 * to write over a terminal status — so there is genuinely nowhere else to put
 * it, and letting it escape would report a completed run to the owner as a 409.
 */
async function announceResume(
  outcome: RunOutcome,
  deps: ExecutorOptions,
): Promise<RunOutcome> {
  const notify = deps.onRunResumed;
  if (!notify) return outcome;

  try {
    await notify(outcome);
    return outcome;
  } catch (err) {
    return {
      ...outcome,
      followUpError: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Flip "awaiting_approval" to "running" and persist it BEFORE any work happens.
 *
 * The read is the guard: a run that is no longer awaiting approval was already
 * claimed (or cancelled, or finished) by someone else, and this caller must not
 * proceed. A SQL store expresses the same thing as a single conditional UPDATE
 * and checks the affected row count — never SELECT then UPDATE.
 */
async function claimForResume(state: RunState, deps: ExecutorOptions): Promise<boolean> {
  const stored = await deps.store.getRun(state.runId);
  if (!stored || stored.status !== "awaiting_approval") return false;
  state.status = "running";
  // The run is no longer waiting on anything, and RunState.pendingApprovalId is
  // documented as set only while it is.
  state.pendingApprovalId = null;
  await deps.store.saveRun(state);
  return true;
}

/**
 * Mark a run cancelled.
 *
 * Cooperative, and bounded by step boundaries: a cancel landing while an `act`
 * step's tool call is already in flight cannot un-send it. What it guarantees
 * is that no LATER step runs — drive() re-reads the stored status before every
 * step, and persist() refuses to write over a terminal status, so the loop can
 * no longer overwrite the cancellation with its own stale copy of the run.
 */
export async function cancelRun(runId: string, deps: ExecutorOptions): Promise<void> {
  const state = await deps.store.getRun(runId);
  if (!state) return;
  // The FULL terminal set, not just completed/failed: cancelling an already
  // refused or already cancelled run would overwrite its outcome, replace its
  // endedAt and append a second run_finished event.
  if (isTerminalStatus(state.status)) return;

  state.status = "cancelled";
  state.endedAt = iso(deps);
  // A dead run cannot be waiting on an approval. Clearing this restores the
  // invariant on RunState.pendingApprovalId, which cancelRun was the only path
  // to violate, and stops the run pointing the owner at a decision that could
  // never take effect.
  //
  // It does not remove the approval from `listPendingApprovals`, which filters
  // on "has no decision" and never looks at the run. Withdrawing it properly
  // needs `ApprovalRequest.withdrawnAt` and `RunStore.withdrawApproval` in
  // lib/runtime/types.ts and lib/runtime/store.ts. Until those exist,
  // decideAndResume() below is the backstop: it refuses a decision on a run
  // that is not awaiting one, before the write-once decision slot is consumed.
  state.pendingApprovalId = null;
  emit(state, { kind: "run_finished", at: iso(deps), status: "cancelled" });
  await persist(state, deps);
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
    // A cancel — or any other actor's terminal write — may have landed between
    // steps. The STORE is authoritative here, not the copy of the run this loop
    // is carrying: that copy still says "running" and is exactly what used to
    // overwrite the cancellation at the bottom of the loop.
    const fresh = await deps.store.getRun(state.runId);
    if (fresh && isTerminalStatus(fresh.status)) {
      return outcomeOf(fresh);
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
          const outcome = await runAct(
            state,
            step,
            bundle,
            workflow,
            deps,
            policy,
            globalForbidden,
          );
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
    const clobbered = await persist(state, deps);
    if (clobbered) return outcomeOf(clobbered);
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

/* ═══════════════ Where a step's arguments come from ═══════════════ */

/**
 * The arguments a tool step will send, or the reason it will not send any.
 *
 * WHY THIS IS A FUNCTION AND NOT THREE SPREADS. Every tool step used to build
 * `{ ...state.context[ACTION_KEY] }` at its own call site — runFetch, runAct and
 * pauseForCheckpoint, three copies of one convention nothing named. That is what
 * made "a fetch with no preceding reason step sends `{}`" invisible: there was
 * nowhere the question "where do these arguments come from?" was being asked, so
 * there was nowhere to answer it. `StepSpec.argumentSource` is the answer, and
 * this is the single place it is read.
 *
 * IT VALIDATES THE DECLARATION RATHER THAN TRUSTING IT, because a plan crosses
 * the seam as JSON: the union in lib/plan/types.ts is a promise, not a
 * guarantee, and lib/plan/validate.ts cannot yet check this field's shape. Fail
 * closed on everything it cannot read — a misspelled `kind`, a `literal` with no
 * object of values, a `none` with a blank justification. The last one is the
 * one that matters: "no arguments, deliberately" is only worth anything if the
 * deliberation was written down, and an empty string is not a reason.
 *
 * REJECTED: falling back to "reasoning" on a malformed declaration. It is the
 * permissive arm and the pre-existing behaviour, so a typo would resolve to
 * exactly the silent empty send this whole change exists to remove.
 */
type ResolvedArguments =
  | { ok: true; args: Record<string, unknown>; source: StepArgumentSource }
  | { ok: false; reason: string };

function argumentsFromReasoning(state: RunState): Record<string, unknown> {
  return { ...(state.context[ACTION_KEY] as Record<string, unknown> | undefined) };
}

function resolveStepArguments(state: RunState, step: StepSpec): ResolvedArguments {
  // Widened deliberately; see above. The declared type does not survive JSON.
  const declared: unknown = step.argumentSource;

  if (declared === undefined) {
    // The default, and the behaviour of every plan written before the field
    // existed: whatever the last reason step proposed. The gate below is what
    // stops that being an empty argument list nobody noticed.
    return { ok: true, args: argumentsFromReasoning(state), source: { kind: "reasoning" } };
  }

  if (!isRecord(declared)) {
    return {
      ok: false,
      reason:
        `Step "${step.id}" declares an argumentSource that is ${declared === null ? "null" : typeof declared}, ` +
        `not one of { kind: "literal" | "reasoning" | "none" }. Nothing was sent.`,
    };
  }

  const kind = declared["kind"];

  if (kind === "reasoning") {
    return { ok: true, args: argumentsFromReasoning(state), source: { kind: "reasoning" } };
  }

  if (kind === "literal") {
    const values = declared["values"];
    if (!isRecord(values)) {
      return {
        ok: false,
        reason:
          `Step "${step.id}" declares argumentSource "literal" but its \`values\` is ` +
          `${values === undefined ? "absent" : typeof values}, so there is no argument list to ` +
          `send. Nothing was sent.`,
      };
    }
    // Shallow, matching what the rest of this file does with an argument record
    // and what lib/runtime/tools/composio.ts copies again before the SDK sees
    // it. Nested values are shared with the plan and must be treated as frozen.
    return { ok: true, args: { ...values }, source: { kind: "literal", values } };
  }

  if (kind === "none") {
    const justification = declared["justification"];
    if (typeof justification !== "string" || justification.trim().length === 0) {
      return {
        ok: false,
        reason:
          `Step "${step.id}" declares argumentSource "none" with no justification. An ` +
          `unfiltered call is allowed only where somebody wrote down why it is the right ` +
          `call; a blank justification is not that. Nothing was sent.`,
      };
    }
    return { ok: true, args: {}, source: { kind: "none", justification } };
  }

  return {
    ok: false,
    reason:
      `Step "${step.id}" declares argumentSource kind "${String(kind)}", which this build ` +
      `does not implement. Expected "literal", "reasoning" or "none". Nothing was sent.`,
  };
}

/** True when this step's arguments are the previous reason step's output — the
    only case where putting a tool's schema in that reason step's prompt is the
    truth. A malformed declaration counts as "no", because the step will refuse
    and describing it to the model would be describing something that cannot run. */
function takesArgumentsFromReasoning(step: StepSpec): boolean {
  const declared: unknown = step.argumentSource;
  if (declared === undefined) return true;
  return isRecord(declared) && declared["kind"] === "reasoning";
}

/** Names that will actually appear on the wire. `undefined` is absent — the same
    rule `checkArgumentsAgainstSchema` applies, because `JSON.stringify` drops
    it, and the two must agree about what "empty" means. */
function presentArgumentNames(args: Record<string, unknown>): string[] {
  return Object.keys(args).filter((name) => args[name] !== undefined);
}

/** One deliberately unfiltered read, recorded on the run. */
export interface UnfilteredFetchNotice {
  stepId: string;
  operation: string;
  /** What the tool would have accepted, so the record shows what was declined. */
  accepts: string;
  justification: string;
}

/**
 * The gate: may this fetch be sent as it stands?
 *
 * Returns null to proceed, or the sentence the run is refused with.
 *
 * WHAT IT CATCHES THAT THE PROVIDER CANNOT. lib/runtime/tools/composio.ts
 * already refuses a missing required argument and a name the tool does not
 * publish. Neither fires on `{}` against a tool whose parameters are all
 * optional — nothing is missing and no name is unknown — and that is precisely
 * the shape a fetch-first workflow produced. GMAIL_LIST_THREADS and
 * GOOGLECALENDAR_FIND_FREE_SLOTS both publish `required: []`, so the call
 * succeeded and returned the whole mailbox. The rule this adds is therefore not
 * about validity but about INTENT: an empty argument list to a tool that accepts
 * arguments is a read nobody scoped, and it is refused unless the plan declared
 * `argumentSource: { kind: "none" }` and said why.
 *
 * IT BINDS ONLY WHERE A REAL REQUEST COULD LEAVE, and that asymmetry is the
 * design rather than an oversight. `asToolSchemaSource` returns null for every
 * provider that cannot describe its own tools — the sandbox stub, which
 * simulates every call, and the two refusing providers in
 * lib/runtime/tools/organization.ts, which reach no tool at all. None of them
 * can list a real mailbox, so there is nothing there to guard and nothing to
 * guard it with. The one provider that CAN send is the Composio one, and it is a
 * schema source. Where the schema is reachable this fails closed; where no
 * schema can exist, behaviour is unchanged.
 *
 * FAIL CLOSED ON A SCHEMA THAT WILL NOT LOAD, which is the opposite of
 * `toolSchemaBlock`'s choice a few lines down, on purpose and for the reason
 * that file already gives: a missing schema costs the model some guidance, and
 * costs the send everything. The provider would refuse the same call at
 * execution; refusing here names the step and spends no retries on a failure
 * that is deterministic.
 *
 * The catalog read is memoised per tool for the process (./tools/schema-cache.ts),
 * so this is one HTTP call per tool per process, not one per step.
 */
async function guardFetchArguments(
  state: RunState,
  step: StepSpec,
  operation: string,
  resolved: Extract<ResolvedArguments, { ok: true }>,
  deps: ExecutorOptions,
): Promise<string | null> {
  const source = asToolSchemaSource(deps.tools);
  if (source === null) return null;

  let lookup: ToolArgumentLookup;
  try {
    // Same per-step deadline as everything else; a catalog that hangs must not
    // hold the run open, and here the timeout is a refusal rather than a shrug.
    lookup = await withTimeout(
      deps,
      () => source.describeToolArguments(operation),
      `tool schema for ${operation}`,
    );
  } catch (error) {
    return (
      `Refusing fetch step "${step.id}": ${operation}'s own input schema could not be read, ` +
      `so there was no way to tell whether its arguments scope the read — ` +
      `${error instanceof Error ? error.message : String(error)}. Nothing was sent.`
    );
  }

  // `no_tool` is not this gate's business: the capability has a written reason
  // it cannot be routed (lib/runtime/tools/capabilities.ts) and the provider
  // quotes that sentence when the call reaches it. Two refusals for one fact
  // would just bury the useful one.
  if (lookup.kind === "no_tool") return null;

  if (lookup.kind === "unavailable") {
    return (
      `Refusing fetch step "${step.id}": ${operation} routes to ${lookup.toolSlug ?? "a Composio tool"}, ` +
      `whose input schema could not be read — ${lookup.reason} Its arguments are what bound this ` +
      `read, and an unbounded read reports success on the wrong answer, so nothing was sent.`
    );
  }

  const sending = presentArgumentNames(resolved.args);

  if (sending.length === 0) {
    // A tool that genuinely publishes no parameters can only ever be called this
    // way, so `{}` is the complete and correct argument list.
    if (lookup.schema.properties.size === 0) return null;

    if (resolved.source.kind === "none") {
      const notice: UnfilteredFetchNotice = {
        stepId: step.id,
        operation,
        accepts: summariseArgumentNames(lookup.schema),
        justification: resolved.source.justification,
      };
      const existing = state.context[UNFILTERED_FETCH_KEY];
      state.context[UNFILTERED_FETCH_KEY] = Array.isArray(existing)
        ? [...existing, notice]
        : [notice];
      return null;
    }

    return (
      `Refusing fetch step "${step.id}": it would call ${lookup.toolSlug} for "${operation}" ` +
      `with no arguments at all, and that tool requires none — so the call would succeed and ` +
      `return everything, unfiltered, and the run would report that as the answer. ` +
      `${lookup.toolSlug} accepts: ${summariseArgumentNames(lookup.schema)}. Give the step an ` +
      `\`argumentSource\` in the plan: { kind: "literal", values: { … } } to state the scope, ` +
      `{ kind: "reasoning" } with a reason step before it to derive the scope, or ` +
      `{ kind: "none", justification: "…" } if reading everything really is the intent. ` +
      `Nothing was sent.`
    );
  }

  // Non-empty, so the ordinary shape rules apply. The same exported check the
  // provider runs immediately before `tools.execute` — one gate, applied one
  // layer earlier so the refusal names the step and costs no retries.
  const shape = checkArgumentsAgainstSchema(resolved.args, lookup.schema);
  if (!shape.ok) {
    return (
      `Refusing fetch step "${step.id}": its arguments do not match ${lookup.toolSlug}'s own ` +
      `input schema, so nothing was sent — ${shape.problems.join("; ")}. ` +
      `${lookup.toolSlug} accepts: ${summariseArgumentNames(lookup.schema)}.`
    );
  }

  return null;
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

  const resolved = resolveStepArguments(state, step);
  if (!resolved.ok) {
    emit(state, { kind: "refused", at: iso(deps), stepId: step.id, reason: resolved.reason });
    return finish(state, "refused", deps, resolved.reason);
  }

  // AFTER the policy decision, mirroring the order in
  // lib/runtime/tools/composio.ts: an operation the agent may not read at all
  // should say so, rather than report an argument problem underneath a refusal
  // the owner cannot act on. Refused, not failed — this is the runtime declining
  // to send, and a deterministic shape problem must not be retried.
  const guard = await guardFetchArguments(state, step, step.tool.operation, resolved, deps);
  if (guard !== null) {
    emit(state, { kind: "refused", at: iso(deps), stepId: step.id, reason: guard });
    return finish(state, "refused", deps, guard);
  }

  const invocation: ToolInvocation = {
    integrationId: step.tool.integrationId,
    operation: step.tool.operation,
    args: resolved.args,
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
  const schemaBlock = await toolSchemaBlock(state, step, workflow, deps);

  const result = await withTimeout(
    deps,
    () =>
      deps.reasoner.reason({
        systemPrompt: bundle.pkg.systemPrompt,
        workflowPrompt:
          schemaBlock.length === 0 ? workflow.prompt : `${workflow.prompt}\n\n${schemaBlock}`,
        instruction: step.instruction,
        context: state.context,
      }),
    `reason step ${step.id}`,
  );

  applyReasonResult(state, step.id, result);
  emit(state, { kind: "reasoning", at: iso(deps), stepId: step.id, summary: result.summary });
}

/* ══════════════ The tool schema, on the way into a reason step ══════════════ */

/**
 * The step whose arguments THIS reason step is about to produce, or null.
 *
 * WHY THIS FUNCTION HAS TO EXIST, AND WHAT THE INVESTIGATION FOUND. An act step
 * has no arguments of its own: `StepSpec.tool` carries `{ integrationId,
 * operation }` and nothing else, there is no argument template anywhere in
 * lib/plan/types.ts, and `runAct` reads `state.context[ACTION_KEY]` — which
 * `applyReasonResult` wrote from the last reason step's `data`. So the ONLY
 * place a tool's argument names can be got right is the reason step that
 * produces them, and the schema has to reach that step's prompt.
 *
 * THE SCAN'S THREE RULES, each from how ACTION_KEY actually behaves:
 *
 *   - a later `reason` step ENDS the search and returns null, because it will
 *     overwrite ACTION_KEY before any tool sees this step's output;
 *   - `approve` is stepped over: a checkpoint pauses and replays, it does not
 *     replace the pending action, so the act after it still sends this step's
 *     arguments;
 *   - `fetch` counts as well as `act`. `runFetch` builds its args from the same
 *     key, so a read whose arguments are wrong fails in exactly the same way.
 *
 * A step with no `tool` returns null rather than being skipped: the run is about
 * to fail on that step anyway, and guessing past it would put the WRONG tool's
 * schema in front of the model.
 */
function toolConsumerOf(workflow: CompiledWorkflow, reasonStep: StepSpec): StepSpec | null {
  // Located by id rather than by `state.cursor`. The two agree today — `drive`
  // dispatches the step under the cursor — but a prompt that silently describes
  // the WRONG tool is the worst outcome this function has available, and an id
  // cannot drift the way an index can.
  const reasonIndex = workflow.steps.findIndex((candidate) => candidate.id === reasonStep.id);
  if (reasonIndex < 0) return null;

  for (let i = reasonIndex + 1; i < workflow.steps.length; i += 1) {
    const step = workflow.steps[i];
    if (!step) return null;
    if (step.kind === "reason") return null;
    if (step.kind === "approve") continue;
    if (!step.tool) return null;
    // A FOURTH RULE, added with `StepSpec.argumentSource`: a tool step whose
    // arguments the PLAN states does not consume this reason step's output, so
    // it is not this step's consumer and the scan continues past it. Without
    // this the prompt would describe a tool nothing will send the model's answer
    // to — and, worse, would hide the schema of the step further on that IS fed
    // by this reasoning. Wrong guidance is worse than none; that is the whole
    // premise of this block existing.
    if (!takesArgumentsFromReasoning(step)) continue;
    return step;
  }
  return null;
}

/**
 * Reserved context key: why a reason step's prompt did NOT carry the schema it
 * should have. See `toolSchemaBlock`.
 *
 * Recorded in `RunState.context` rather than as a `RunEvent` because the event
 * union lives in lib/runtime/types.ts and the only kind that would fit is
 * `error` — which would put a failure mark on a reason step that completed
 * perfectly well, on every screen that renders a timeline. The key is prefixed
 * `__` like the rest of the executor's envelope, which is also what keeps
 * `FixtureReasoner`'s context walk (lib/runtime/llm.ts) from harvesting it as
 * though it were tool output.
 */
export const TOOL_SCHEMA_NOTICE_KEY = "__toolSchemaNotice";

export interface ToolSchemaNotice {
  stepId: string;
  /** The capability whose schema was wanted. */
  operation: string;
  reason: string;
}

/**
 * The tool-argument block for this reason step's prompt, or "".
 *
 * FAIL SOFT HERE, FAIL CLOSED AT THE SEND, and the asymmetry is the design. A
 * catalog that cannot be reached costs the model its guidance; it must not cost
 * the run its reasoning step, because the act step that follows refuses on its
 * own — `ComposioIntegrationProvider.execute` checks the same schema before it
 * sends anything, and reports the fetch failure there. Throwing here would turn
 * one degraded prompt into a failed run and would say LESS about why.
 *
 * The absence is still written down: `TOOL_SCHEMA_NOTICE_KEY` records it on the
 * run, so the refusal that follows is not the first anyone hears of it.
 *
 * NOTHING HAPPENS FOR A PROVIDER THAT CANNOT DESCRIBE TOOLS — the sandbox stub
 * and the two organization refusals in lib/runtime/tools/organization.ts. The
 * stub simulates every send, so there is no shape to match; the refusals never
 * reach a tool at all. Neither wants a block, and neither wants a notice.
 */
async function toolSchemaBlock(
  state: RunState,
  step: StepSpec,
  workflow: CompiledWorkflow,
  deps: ExecutorOptions,
): Promise<string> {
  const consumer = toolConsumerOf(workflow, step);
  const operation = consumer?.tool?.operation;
  if (operation === undefined) return "";

  const source = asToolSchemaSource(deps.tools);
  if (source === null) return "";

  const note = (reason: string): string => {
    const notice: ToolSchemaNotice = { stepId: step.id, operation, reason };
    state.context[TOOL_SCHEMA_NOTICE_KEY] = notice;
    return "";
  };

  let lookup: ToolArgumentLookup;
  try {
    // Raced against the same per-step deadline as the reasoning call itself: a
    // catalog that hangs must not hold a run open past its budget, and the
    // timeout is a reason to send the prompt without the block, not to fail.
    lookup = await withTimeout(
      deps,
      () => source.describeToolArguments(operation),
      `tool schema for ${operation}`,
    );
  } catch (error) {
    return note(error instanceof Error ? error.message : String(error));
  }

  // `no_tool` needs no notice: the capability has a written reason it cannot be
  // routed (lib/runtime/tools/capabilities.ts) and the act step quotes it.
  if (lookup.kind === "no_tool") return "";
  if (lookup.kind === "unavailable") return note(lookup.reason);
  return lookup.prompt;
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
  workflow: CompiledWorkflow,
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

  // The same declaration a fetch reads. An `act` whose arguments are stated in
  // the plan is unusual but not nonsense — a fixed report recipient, a standing
  // channel — and if the field were honoured on one kind of tool step and
  // ignored on the other, a plan could declare something this file silently did
  // not do. There is no empty-argument gate here: an act is already gated by
  // policy and, when it escalates, shown to a human in full.
  const resolvedArgs = resolveStepArguments(state, step);
  if (!resolvedArgs.ok) {
    emit(state, { kind: "refused", at: iso(deps), stepId: step.id, reason: resolvedArgs.reason });
    return finish(state, "refused", deps, resolvedArgs.reason);
  }
  const args = resolvedArgs.args;

  // The numbers policy is about to judge came out of the model. Cross-check the
  // ones the fetch steps can vouch for before handing them to the enforcement
  // layer; see the trust-boundary note in the module header for what this can
  // and cannot establish.
  const audit = auditMetrics(
    { ...((state.context[METRICS_KEY] as Record<string, number>) ?? {}) },
    collectFetchEvidence(state, workflow),
    args,
  );
  state.context[METRIC_SOURCES_KEY] = audit.sources;

  const invocation: ToolInvocation = {
    integrationId: step.tool.integrationId,
    operation: step.tool.operation,
    args,
    metrics: audit.metrics,
  };

  /*
   * THE EMPTY-BATCH SKIP (StepSpec.emptyBatch, lib/plan/types.ts): a step that
   * acts on a batch, whose declared batch metric measured EXACTLY ZERO, has no
   * action to gate. Record that on the run and complete the step — do not call
   * the tool, and do not consult policy, because policy answers "may this
   * invocation be performed" and there is no invocation to perform. Consulting
   * it anyway is what filled the approvals queue with "Send an email to the
   * customer" cards whose approval would send nothing.
   *
   * Placed AFTER auditMetrics on purpose: the check reads the AUDITED figures,
   * so where a fetch-side record can vouch for the count, a tool-attested
   * nonzero beats a model claiming zero — the one direction the trust boundary
   * can be tightened here. Where nothing can corroborate it (the usual case
   * for per_run counts, per the module header) the count is model-asserted,
   * and that is safe for exactly one reason: an understated count can only
   * SUPPRESS this step's own action, never cause one. Every path that performs
   * the action still walks the full six-step order below.
   *
   * `=== 0` and nothing looser. An ABSENT metric falls through to the normal
   * path — an unmeasured batch is not an empty one, and it must escalate the
   * same way an unmeasured limit does (fail closed, mirroring evaluateLimits).
   * NaN and negatives fall through too; neither is a batch anybody counted.
   */
  const emptyBatch = declaredEmptyBatch(step);
  if (emptyBatch !== null && invocation.metrics[emptyBatch.metric] === 0) {
    emit(state, {
      kind: "batch_empty",
      at: iso(deps),
      stepId: step.id,
      metric: emptyBatch.metric,
      summary:
        `batch empty: ${emptyBatch.metric} = 0, nothing to send — ` +
        `step completed without acting`,
    });
    return null;
  }

  const decision = resolveAct({
    invocation,
    policy,
    globalForbidden,
    allowedOperations: bundle.pkg.allowedOperations,
    stepRisk: step.risk,
  });

  if (decision.action === "refuse") {
    // A hard deny is never softened, and a metric dispute never rescues one.
    emit(state, { kind: "refused", at: iso(deps), stepId: step.id, reason: decision.reason });
    return finish(state, "refused", deps, decision.reason);
  }

  if (decision.action === "require_approval") {
    return pauseForApproval(state, step, invocation, bundle, deps, {
      reason: audit.disputes.length
        ? `${decision.reason} ${audit.disputes.join(" ")}`
        : decision.reason,
      risk: decision.risk,
      breachedLimits: decision.breachedLimits,
    });
  }

  if (audit.disputes.length > 0) {
    // Every limit is satisfied once the tool's own figures are substituted, so
    // policy would let this through. It does not go through unattended: a model
    // that misreports the records it just read is not something the runtime will
    // act on by itself, and silently correcting the number would hide that it
    // ever happened.
    return pauseForApproval(state, step, invocation, bundle, deps, {
      reason:
        `The figures this action was judged on disagree with the records the fetch steps ` +
        `returned. ${audit.disputes.join(" ")} The tool's values were used and still sit ` +
        `within policy, but the disagreement needs a human before anything is sent.`,
      risk: "high",
      breachedLimits: [],
    });
  }

  const result = await performTool(state, step, invocation, bundle, deps);
  if (!result.ok) {
    return finish(state, "failed", deps, result.error ?? "Action failed.");
  }
  state.context[step.id] = result.data;
  return null;
}

/**
 * The step's emptyBatch declaration, or null when there is none it can trust.
 *
 * Validated rather than believed, for the same reason `resolveStepArguments`
 * validates: a plan crosses the seam as JSON, so `StepSpec.emptyBatch`'s type
 * is a promise, not a guarantee. But the fail-closed direction here is the
 * OPPOSITE of argumentSource's, and deliberately so: there, the permissive
 * fallback was the silent empty send the field exists to remove, so a
 * malformed declaration refuses. Here the permissive arm is the SKIP — the
 * path that bypasses the pause — so failing closed means NOT skipping. A
 * malformed declaration therefore reads as absent and the step proceeds into
 * the normal policy path, where the worst outcome is the pre-existing noise:
 * an approval card too many, never an action too few. Validator rule 0
 * reports the malformed shape at the gate, which is where a typo gets fixed.
 */
function declaredEmptyBatch(step: StepSpec): { metric: string } | null {
  const declared: unknown = step.emptyBatch;
  if (!isRecord(declared)) return null;
  const metric = declared["metric"];
  if (typeof metric !== "string" || metric.trim().length === 0) return null;
  return { metric };
}

/* ═══════════════════ Metric provenance (trust boundary) ═══════════════════ */

/**
 * Where the number policy was judged on actually came from.
 *
 *   "tool"     — a record a fetch step returned carries this exact value.
 *   "model"    — the reasoning step asserted it and nothing could corroborate
 *                it. Not a red flag on its own: several contract metrics have
 *                no fetch-side source by nature.
 *   "disputed" — a fetched record carries a DIFFERENT value. The tool's figure
 *                was used and the act was escalated.
 */
export type MetricSource = "tool" | "model" | "disputed";

interface MetricAudit {
  /** What policy should evaluate: tool-attested figures win over asserted ones. */
  metrics: Record<string, number>;
  sources: Record<string, MetricSource>;
  /** One sentence per disagreement; empty when nothing was contradicted. */
  disputes: string[];
}

/**
 * Amount-ish field names, in preference order. Same list and same reasoning as
 * the fixture reasoner's derive() in lib/runtime/llm.ts — the two must agree
 * about what "amount" means or the check would dispute its own inputs.
 */
const AMOUNT_FIELDS = ["amount", "amountDue", "amount_due", "total", "balance", "value"];

/** Bounded so a large fetch result cannot turn every act into a deep walk. */
const EVIDENCE_MAX_DEPTH = 3;
const EVIDENCE_MAX_NODES = 200;
/**
 * Ids shorter than this are not matched as substrings of an argument. "A1"
 * inside a subject line is a coincidence; "INV-9004" is not.
 */
const MIN_SUBSTRING_ID_LENGTH = 4;

/**
 * The records this run actually read, indexed by the singular of the array key
 * that held them — so `{ invoices: [...] }` from a fetch step answers questions
 * about the metric `invoice.amount`.
 *
 * Only `fetch` steps count. An act's own result is not evidence about the act,
 * and a reason step's output is the model talking, which is the thing being
 * checked.
 *
 * Two fetch steps can contribute to the same collection — the overdue-invoice
 * digest reads invoices from QuickBooks and then from HubSpot. They are merged
 * in step order, so where the same id appears twice the earlier step's copy is
 * the one consulted. Arbitrary, but deterministic, which is what the sandbox
 * needs; a real reconciliation belongs with the metric vocabulary (§8 Q4).
 */
function collectFetchEvidence(
  state: RunState,
  workflow: CompiledWorkflow,
): Map<string, Record<string, unknown>[]> {
  const collections = new Map<string, Record<string, unknown>[]>();
  for (const step of workflow.steps) {
    if (step.kind !== "fetch") continue;
    const result = state.context[step.id];
    if (result === undefined) continue;
    collectCollections(result, collections);
  }
  return collections;
}

/** Breadth-first, bounded, keys visited in sorted order so it is reproducible. */
function collectCollections(
  root: unknown,
  into: Map<string, Record<string, unknown>[]>,
): void {
  interface Node {
    key: string;
    value: unknown;
    depth: number;
  }
  const queue: Node[] = [{ key: "", value: root, depth: 0 }];
  let head = 0;
  let budget = EVIDENCE_MAX_NODES;

  while (head < queue.length && budget > 0) {
    const node = queue[head];
    head += 1;
    budget -= 1;
    if (!node || node.depth > EVIDENCE_MAX_DEPTH) continue;

    if (Array.isArray(node.value)) {
      const records = (node.value as unknown[]).filter(isRecord);
      if (records.length > 0 && node.key.length > 0) {
        const subject = singular(node.key);
        const existing = into.get(subject);
        if (existing) existing.push(...records);
        else into.set(subject, [...records]);
      }
      continue;
    }

    if (!isRecord(node.value)) continue;
    const record = node.value;
    for (const key of Object.keys(record).sort()) {
      queue.push({ key, value: record[key], depth: node.depth + 1 });
    }
  }
}

/**
 * Verify what can be verified, and be explicit about the rest.
 *
 * Deliberately NOT a replacement source of metrics: a metric the model did not
 * report is left absent, because policy.ts fails closed on a missing metric and
 * filling one in from tool data would quietly convert "could not confirm" into
 * an answer nobody established.
 *
 * Equally deliberately NOT a clamp to the batch maximum. A finance sweep that
 * reads six invoices and chases one small one is the ordinary case; taking the
 * largest amount in the batch would escalate every routine run and teach the
 * owner to click through approvals without reading them.
 */
function auditMetrics(
  reported: Record<string, number>,
  collections: Map<string, Record<string, unknown>[]>,
  args: Record<string, unknown>,
): MetricAudit {
  const metrics: Record<string, number> = {};
  const sources: Record<string, MetricSource> = {};
  const disputes: string[] = [];

  for (const metric of Object.keys(reported).sort()) {
    const claimed = reported[metric];
    metrics[metric] = claimed;
    sources[metric] = "model";

    // `invoice.amount` → subject "invoice", field "amount". The mapping is
    // inferred from the metric id because contract §8 Q4 (who owns the metric
    // vocabulary) is still open with D; when it closes, this belongs beside the
    // operation registry in lib/plan/operations.ts, not here.
    const dot = metric.lastIndexOf(".");
    if (dot <= 0 || dot === metric.length - 1) continue;
    const records = collections.get(metric.slice(0, dot));
    if (!records || records.length === 0) continue;

    const target = pickTargetRecord(records, args);
    if (!target) continue;

    const attested = readMetricField(target, metric.slice(dot + 1));
    if (attested === null) continue;

    if (attested === claimed) {
      sources[metric] = "tool";
      continue;
    }

    // The tool is the source of truth about its own records.
    metrics[metric] = attested;
    sources[metric] = "disputed";
    disputes.push(
      `${metric} was reported as ${claimed}, but ${describeRecord(target)} carries ${attested}.`,
    );
  }

  return { metrics, sources, disputes };
}

function describeRecord(record: Record<string, unknown>): string {
  const id = record["id"];
  return typeof id === "string" && id.length > 0 ? `record ${id}` : "the fetched record";
}

/**
 * Which fetched record this act is about, or null when that cannot be pinned
 * down.
 *
 * Exact match on an argument value first, then an id occurring inside one — a
 * reminder addressed to "Overdue invoice INV-9004" names its invoice even
 * though no argument equals the id. That second rule is a heuristic and is
 * treated as one: a false positive costs an approval the owner did not strictly
 * need, never a send that should have paused. Two different records matching is
 * treated as no match, because guessing between them would be worse than
 * admitting the act is unscoped.
 */
function pickTargetRecord(
  records: Record<string, unknown>[],
  args: Record<string, unknown>,
): Record<string, unknown> | null {
  const strings: string[] = [];
  for (const key of Object.keys(args).sort()) {
    const value = args[key];
    if (typeof value === "string" && value.length > 0) strings.push(value);
  }
  if (strings.length === 0) return null;

  let match: Record<string, unknown> | null = null;
  for (const record of records) {
    const id = record["id"];
    if (typeof id !== "string" || id.length === 0) continue;
    const named = strings.some(
      (s) => s === id || (id.length >= MIN_SUBSTRING_ID_LENGTH && s.includes(id)),
    );
    if (!named) continue;
    if (match !== null && match["id"] !== id) return null;
    if (match === null) match = record;
  }
  return match;
}

/** The named field, falling back to the amount synonyms when it is an amount. */
function readMetricField(record: Record<string, unknown>, field: string): number | null {
  const direct = toFiniteNumber(record[field]);
  if (direct !== null) return direct;
  if (!AMOUNT_FIELDS.includes(field)) return null;
  for (const alias of AMOUNT_FIELDS) {
    const value = toFiniteNumber(record[alias]);
    if (value !== null) return value;
  }
  return null;
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Naive and deliberately so, matching lib/runtime/llm.ts: "invoices" → "invoice". */
function singular(word: string): string {
  if (word.length > 3 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
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
  const request: ApprovalRequest = {
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
  };

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

  // The run is persisted BEFORE the approval is created, which is the opposite
  // of the obvious order and deliberate. A cancel can land while the step that
  // escalates is in flight; persist() then refuses this write, and because the
  // approval does not exist yet, nothing appears in the owner's inbox for a run
  // that is already dead. The other order leaves a live approval behind a
  // cancelled run — an item the owner can act on to no effect.
  const clobbered = await persist(state, deps);
  if (clobbered) return outcomeOf(clobbered);

  await deps.store.createApproval(request);

  return { run: state, status: "awaiting_approval", approvalId };
}

/**
 * An `approve` step is an unconditional checkpoint with no tool call.
 *
 * Deliberately NOT routed through `resolveStepArguments`. There is no tool here
 * and therefore no argument list to source: what this freezes is the pending
 * proposal, unchanged, so the owner looks at what the run is actually holding.
 * Reading a plan-stated `argumentSource` here would show them something the plan
 * composed instead of what the agent decided.
 */
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

  const error = last.error ?? "tool call failed";
  applyOnExhausted(state, step, invocation, bundle, deps, failurePolicy, attempts, error);
  // The enum is deliberately NOT spliced into the message. `failure` is shown
  // to owners and is substring-matched by the sandbox's reasonContains
  // assertions; policy metadata does not belong in owner-facing prose.
  return { ok: false, error };
}

/**
 * The record left on a run when a tool call ran out of retries. Written to
 * `RunState.context[FAILURE_NOTICE_KEY]`; a first-class field on `RunState`
 * would be the better home, which is a change to lib/runtime/types.ts.
 */
interface FailureNotice {
  policy: FailurePolicy["onExhausted"];
  stepId: string;
  operation: string;
  attempts: number;
  error: string;
  at: string;
  /** Who to tell, or null when the policy says tell nobody. */
  notify: string | null;
  /** "now" belongs in the inbox; "queued" is a background notification. */
  urgency: "now" | "queued" | null;
}

/**
 * What `FailurePolicy.onExhausted` (contract §3.8) actually does.
 *
 * The three values used to be indistinguishable: the enum was concatenated into
 * the error string and nothing read it, so "fail_silent" was neither silent nor
 * different from "escalate". They are now distinct in the two ways M1 can
 * honestly make them distinct — a different event in the run stream, and a
 * different recorded intent for whoever notifies the owner.
 *
 *   escalate     → raise it now, addressed to the approval owner. The M5 inbox
 *                  is where "now" becomes visible.
 *   notify_owner → queue a notification to the approval owner. There is no
 *                  notification channel yet — that is M7 — so what M1 owes is a
 *                  recorded intent a later notifier can act on, not a pretend
 *                  send.
 *   fail_silent  → record the failure and tell nobody. `notify` is null, and
 *                  that absence IS the behaviour, not an omission.
 *
 * All three still end the run `failed`. Turning `fail_silent` into `completed`
 * would change what the M3 verdict and the M4 activation gate observe, and no
 * sandbox scenario covers that yet; it belongs with M5's scenario coverage.
 */
function applyOnExhausted(
  state: RunState,
  step: StepSpec,
  invocation: ToolInvocation,
  bundle: AgentBundle,
  deps: ExecutorOptions,
  failurePolicy: FailurePolicy,
  attempts: number,
  error: string,
): void {
  const owner = bundle.spec.policy.approvalOwner;
  const base = {
    stepId: step.id,
    operation: invocation.operation,
    attempts,
    error,
    at: iso(deps),
  };

  let notice: FailureNotice;
  let message: string;

  if (failurePolicy.onExhausted === "fail_silent") {
    notice = { ...base, policy: "fail_silent", notify: null, urgency: null };
    message =
      `${invocation.operation} failed after ${attempts} attempt(s). Failure policy ` +
      `"fail_silent": recorded on the run, no one is notified.`;
  } else if (failurePolicy.onExhausted === "notify_owner") {
    notice = { ...base, policy: "notify_owner", notify: owner, urgency: "queued" };
    message =
      `${invocation.operation} failed after ${attempts} attempt(s). Failure policy ` +
      `"notify_owner": a notification to ${owner} is queued on the run.`;
  } else {
    // Anything else is treated as "escalate" — the loudest of the three. The
    // plan validator does not yet check this union, so an unrecognised value
    // must fail towards telling a human rather than towards silence.
    notice = { ...base, policy: "escalate", notify: owner, urgency: "now" };
    message =
      `${invocation.operation} failed after ${attempts} attempt(s). Failure policy ` +
      `"escalate": raised to ${owner} for attention now.`;
  }

  state.context[FAILURE_NOTICE_KEY] = notice;
  emit(state, { kind: "error", at: iso(deps), stepId: step.id, message, attempt: attempts });
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

  const clobbered = await persist(state, deps);
  if (clobbered) {
    // Someone else — a cancel, in practice — reached a terminal status first.
    // Theirs is the authoritative outcome, and discarding this whole state
    // object discards the run_finished event staged a line above with it, so
    // the stored stream carries exactly one terminal event.
    return outcomeOf(clobbered);
  }
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
 * Raised when an approval can no longer change anything: its run was cancelled,
 * already finished, or has moved on to a different pause. Distinct from a
 * generic failure because the caller's correct response is different — the
 * item should leave the inbox, not be retried. app/api/runtime/approvals
 * already maps a thrown error to HTTP 409.
 */
export class ApprovalNotActionableError extends Error {
  readonly code = "approval_not_actionable";

  constructor(message: string) {
    super(message);
    this.name = "ApprovalNotActionableError";
  }
}

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

  // Checked BEFORE the write, not after. `saveDecision` is write-once, so
  // recording a decision against a run that can no longer act on it burns the
  // only slot that approval will ever have — and the caller gets a 200 for a
  // decision that did nothing. Refusing first leaves the approval decidable if
  // the situation was transient, and tells the owner the truth if it was not.
  const run = await deps.store.getRun(request.runId);
  if (!run) {
    throw new ApprovalNotActionableError(
      `Approval ${decision.approvalId} refers to run ${request.runId}, which no longer exists. ` +
        `No decision was recorded.`,
    );
  }
  if (run.status !== "awaiting_approval" || run.pendingApprovalId !== decision.approvalId) {
    throw new ApprovalNotActionableError(
      `Approval ${decision.approvalId} is no longer actionable: run ${request.runId} is ` +
        `"${run.status}"` +
        (run.pendingApprovalId === decision.approvalId
          ? ""
          : ` and is not waiting on this approval`) +
        `. No decision was recorded.`,
    );
  }

  await deps.store.saveDecision(decision);
  return resumeRun(request.runId, bundle, deps);
}
