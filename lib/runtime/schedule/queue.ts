/**
 * lib/runtime/schedule/queue.ts — the job queue (ROLE_C_PLAN M4).
 *
 * A trigger firing is a fact about the world; a queued job is a claim on a
 * worker slot. triggers.ts owns the first, this module owns the second, and it
 * is a separate file because the five rules below are the ones a scheduler gets
 * wrong — and all five are easier to argue with when they sit together.
 *
 * THERE ARE TWO LAYERS OF DUPLICATE PROTECTION AND ONLY THE SECOND IS A
 * GUARANTEE. `enqueueTriggerEvent` refuses to create a second job for an
 * idempotency key the queue already holds; `startRun` refuses to create a second
 * run for a key `RunStore.claimIdempotencyKey` has already granted. They are not
 * redundant. The queue layer stops a re-delivered Friday nine o'clock consuming
 * a worker slot and a retry budget; the executor layer stops it reaching a
 * customer. But the check here is a scan followed by an insert with an await
 * between them, so two workers enqueuing the same firing at the same instant can
 * both miss — and that window is exactly why the executor's claim exists and why
 * IT, not this, is what the promise rests on. Nobody reading this file should
 * come away believing the queue is the guarantee.
 *
 * BACKOFF MOVES A DATE; IT NEVER SLEEPS. `runAfter` is the earliest instant a
 * worker may claim a job, and a retry expresses its delay by moving that field
 * forward. A worker that awaited a timer instead would hold a concurrency slot
 * for a delay nobody can see, and would forget the delay entirely at the next
 * restart — the same objection ./types.ts makes to an in-process timer wheel,
 * one level down.
 *
 * THERE IS NO JITTER, DELIBERATELY. The standard advice is to jitter backoff so
 * a herd of retries does not re-synchronise, and the standard implementation is
 * `Math.random()`, which is banned in runtime library code because determinism
 * is an M3 exit criterion and must not regress. The trade is being made
 * knowingly and is cheap at this size: a firing produces one job, so the "herd"
 * is a handful of workflows that happened to fail in the same minute. If a real
 * herd ever appears, jitter has to arrive as an injected seeded source beside
 * `newId`, never as a call to the global RNG.
 *
 * A JOB ID IS MINTED WHERE A TRIGGER ID IS DERIVED. triggers.ts derives its ids
 * so that the same firing computed twice yields the same idempotency key. A job
 * id cannot follow that rule: it becomes a filename under the durable store,
 * whose id grammar (`recordFileName`, lib/runtime/persist/atomic.ts) allows
 * letters, digits and `. _ - @` and nothing else, while every key minted by
 * `buildTriggerEvent` contains `::` and `#`. So the identity of a FIRING lives
 * in the key and the identity of a ROW lives in the id, and the duplicate check
 * above is the only thing keeping the two in step.
 *
 * `failed` IS NEVER PRODUCED HERE, and that is a decision rather than an
 * omission. A job whose attempt threw either has attempts left — in which case
 * it returns to `queued` with `runAfter` moved, because `claimNextJob` will only
 * ever claim a `queued` job — or it does not, in which case it is `dead_letter`,
 * which ./types.ts defines as exactly that state. No third case is left for
 * `failed` to name. It stays in the union for a caller holding a genuinely
 * unretryable failure; the worker has none, because every failure it can produce
 * is one that a rebuild or a re-activation could resolve between two attempts.
 */

import type { TriggerEvent } from "../types";
import type { TriggerFiring } from "./triggers";
import type { JobStatus, QueuedJob, SchedulerDeps, SchedulerStore } from "./types";

/* ═══════════════════════════ Wiring ═══════════════════════════ */

/** Enqueueing needs an id; settling an already-enqueued job does not. */
export type EnqueueDeps = Pick<SchedulerDeps, "store" | "clock" | "newId">;
export type SettleDeps = Pick<SchedulerDeps, "store" | "clock">;

/* ═══════════════════════════ Defaults ═══════════════════════════ */

/**
 * Three attempts, not ten. Every failure this queue retries is a transport-shaped
 * one — the executor already exhausts `FailurePolicy.retries` against the tool
 * itself before it gives up — so a job reaching here has usually failed for a
 * reason more attempts will not fix. Three costs about two minutes of delay and
 * still covers a restart landing mid-job.
 */
export const DEFAULT_MAX_ATTEMPTS = 3;

/** First retry waits this long; each subsequent one doubles it. */
export const BACKOFF_BASE_MS = 30_000;

/**
 * The ceiling. Fifteen minutes is under the shortest interval any BrightPath
 * schedule repeats at, so a job can never back off past its own next firing and
 * leave two occurrences of the same workflow queued behind each other.
 */
export const BACKOFF_MAX_MS = 900_000;

/* ═══════════════════════════ Job status ═══════════════════════════ */

/**
 * A job in one of these is settled: no worker will claim it again, and nothing
 * in this module writes over it. `dead_letter` is in the list for the reason
 * ./types.ts gives — it stops a poison job consuming workers while staying
 * visible — and `skipped` is in it because a correctly refused start is an
 * outcome, not a pause.
 */
const TERMINAL_JOB_STATUSES: readonly JobStatus[] = [
  "succeeded",
  "failed",
  "dead_letter",
  "skipped",
];

export function isTerminalJobStatus(status: JobStatus): boolean {
  return TERMINAL_JOB_STATUSES.includes(status);
}

/* ═══════════════════════════ Guards ═══════════════════════════ */

/**
 * A count that arrives from configuration, coerced without pretending a bad
 * value was meant. `Math.max(1, Math.floor(NaN))` is `NaN`, which would then be
 * written into `maxAttempts` and compare false against everything — a job that
 * can never dead-letter and never stops retrying.
 */
function positiveInt(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

/**
 * `Date.prototype.toISOString` throws `RangeError: Invalid time value` on an
 * Invalid Date, which tells a reader nothing about which clock produced it or
 * what was being queued. Every instant this module writes goes through here.
 */
function instantOf(at: Date, what: string): string {
  const ms = at.getTime();
  if (!Number.isFinite(ms)) {
    throw new Error(
      `The queue was handed ${what} that is not a real instant (${String(at)}). ` +
        `Job times decide when a worker may claim a job, so an unreadable one would ` +
        `leave the job sitting in the queue reading as "queued" and never running.`,
    );
  }
  return new Date(ms).toISOString();
}

/**
 * Only a job a worker has CLAIMED may be settled. The store flips a job to
 * `running` inside `claimNextJob` and hands back the claimed row, so a job in
 * any other status either belongs to a different worker or is already finished —
 * and writing an outcome over it would either steal work in flight or replace a
 * recorded outcome with a second one.
 */
function assertClaimed(job: QueuedJob, transition: string): void {
  if (job.status === "running") return;
  throw new Error(
    `Cannot settle job ${job.jobId} (${job.agentId}/${job.workflowId}) as "${transition}": ` +
      `it is "${job.status}", not "running". Only a job returned by ` +
      `SchedulerStore.claimNextJob may be settled, because the claim is what makes this ` +
      `worker the one entitled to write its outcome.`,
  );
}

/* ═══════════════════════════ Backoff ═══════════════════════════ */

/**
 * How long after a failed attempt the job becomes claimable again.
 *
 * `attempt` is the attempt that just failed, 1-based, so the first retry waits
 * one base interval. Exponential and capped; see the header for why there is no
 * jitter. `2 ** n` reaches Infinity around n = 1024, and `Math.min` folds that
 * onto the cap rather than producing an unqueueable date.
 */
export function backoffDelayMs(attempt: number): number {
  const n = Number.isFinite(attempt) && attempt >= 1 ? Math.floor(attempt) : 1;
  return Math.min(BACKOFF_BASE_MS * 2 ** (n - 1), BACKOFF_MAX_MS);
}

/* ═══════════════════════════ Enqueueing ═══════════════════════════ */

export interface EnqueueOptions {
  /** The registered trigger behind this job. Null for a manual run. */
  triggerId?: string | null;
  /** Attempts before the job dead-letters. Default `DEFAULT_MAX_ATTEMPTS`. */
  maxAttempts?: number;
  /**
   * Earliest instant a worker may claim it. Defaults to now — a firing that has
   * already happened is due now, not at some future tick.
   */
  runAfter?: Date;
}

export interface EnqueueResult {
  job: QueuedJob;
  /**
   * False when a job for this idempotency key already existed and was returned
   * instead. The caller gets the same object either way, so a re-delivery needs
   * no special handling; this flag exists so a tick can COUNT re-deliveries
   * rather than silently treating them as new work.
   */
  created: boolean;
}

/**
 * The job already holding an idempotency key, if any.
 *
 * A linear scan, filtered to the one agent, because `SchedulerStore` offers no
 * lookup by key and adding one would change an interface two implementations
 * already satisfy. That is the honest cost of the narrow store: a durable
 * implementation should index `trigger.idempotencyKey` and expose
 * `getJobByIdempotencyKey`, at which point this function is where it gets
 * replaced. Until then the scan is bounded by one agent's queue history, which
 * for a plan firing weekly is small.
 */
export async function findJobByIdempotencyKey(
  store: SchedulerStore,
  agentId: string,
  idempotencyKey: string,
): Promise<QueuedJob | null> {
  for (const job of await store.listJobs({ agentId })) {
    if (job.trigger.idempotencyKey === idempotencyKey) return job;
  }
  return null;
}

/**
 * Queue one firing, or hand back the job that is already carrying it.
 *
 * Never throws on a duplicate. A re-delivered trigger is an ordinary event in an
 * at-least-once system, and a scheduler tick that threw on one would take down
 * every other trigger due in the same minute — which is precisely the tick where
 * something has already gone wrong once.
 */
export async function enqueueTriggerEvent(
  event: TriggerEvent,
  deps: EnqueueDeps,
  options: EnqueueOptions = {},
): Promise<EnqueueResult> {
  const key = event.idempotencyKey;
  if (typeof key !== "string" || key.length === 0) {
    throw new Error(
      `Cannot queue ${event.agentId}/${event.workflowId}: the trigger event carries no ` +
        `idempotency key. Without one a re-delivery is indistinguishable from a new firing, ` +
        `so both the queue's duplicate check and the executor's claim are defeated and the ` +
        `workflow can run twice. Build the event with buildTriggerEvent ` +
        `(lib/runtime/schedule/triggers.ts), which derives a key from the cause.`,
    );
  }

  const existing = await findJobByIdempotencyKey(deps.store, event.agentId, key);
  if (existing) return { job: existing, created: false };

  const now = deps.clock.now();
  const enqueuedAt = instantOf(now, "an enqueue time");
  const job: QueuedJob = {
    jobId: deps.newId("job"),
    triggerId: options.triggerId ?? null,
    agentId: event.agentId,
    workflowId: event.workflowId,
    trigger: event,
    status: "queued",
    attempt: 1,
    maxAttempts: positiveInt(options.maxAttempts, DEFAULT_MAX_ATTEMPTS),
    runAfter: options.runAfter
      ? instantOf(options.runAfter, "a runAfter")
      : enqueuedAt,
    enqueuedAt,
    startedAt: null,
    endedAt: null,
    runId: null,
    error: null,
    skipReason: null,
  };

  await deps.store.enqueueJob(job);
  return { job, created: true };
}

/**
 * The same thing for a `TriggerFiring`, which already knows which registered
 * trigger it came from. The only reason `enqueueTriggerEvent` also exists is a
 * run started from outside the trigger engine entirely — a Workspace "run now"
 * that has no registration behind it.
 */
export async function enqueueFiring(
  firing: TriggerFiring,
  deps: EnqueueDeps,
  options: Omit<EnqueueOptions, "triggerId"> = {},
): Promise<EnqueueResult> {
  return enqueueTriggerEvent(firing.event, deps, {
    ...options,
    triggerId: firing.trigger.triggerId,
  });
}

/* ═══════════════════════════ Settling ═══════════════════════════ */

/**
 * Every transition below returns a NEW job rather than mutating the one it was
 * given. The caller is holding the object it passed in across an await while the
 * store writes, and a mutation would make the pre-write and post-write views of
 * the same job indistinguishable — including in the error path, where the
 * failure handler needs to see the status the job actually had when it was
 * claimed.
 */
async function settle(job: QueuedJob, deps: SettleDeps): Promise<QueuedJob> {
  await deps.store.saveJob(job);
  return job;
}

/**
 * The job produced a run. That is the whole of its responsibility.
 *
 * A run that paused for approval is settled here, not treated as unfinished:
 * the job's contract is "get a run under way", and a run sitting in the
 * approvals inbox is under way. The single most likely mistake in this file
 * would be routing that outcome to `markFailed`, which would retry the job,
 * find the idempotency key already claimed, and settle against the same paused
 * run three attempts later having achieved nothing.
 *
 * A run that ended `failed` or `refused` is settled here too, for the same
 * reason plus a mechanical one: its key is claimed, so a retry could not produce
 * a second run even if retrying were the right answer. The failure belongs to
 * the RUN and is read off the run, which `runId` points at.
 */
export async function markSucceeded(
  job: QueuedJob,
  runId: string,
  deps: SettleDeps,
): Promise<QueuedJob> {
  assertClaimed(job, "succeeded");
  return settle(
    {
      ...job,
      status: "succeeded",
      runId,
      endedAt: instantOf(deps.clock.now(), "an end time"),
      error: null,
      skipReason: null,
    },
    deps,
  );
}

/**
 * Policy declined to start the run. Terminal, and NOT a failure.
 *
 * Terminal rather than deferred, which is the decision worth defending. Moving
 * `runAfter` to the end of the quiet window instead would look kinder and would
 * be wrong: the owner asked for a nine o'clock sweep, and a sweep that arrives
 * at some other hour because the runtime held it is a run they did not schedule,
 * against a world that has moved on. The next occurrence of the trigger is the
 * next chance, and `skipReason` is what tells the Workspace this was a decision
 * rather than a breakage.
 */
export async function markSkipped(
  job: QueuedJob,
  reason: string,
  deps: SettleDeps,
): Promise<QueuedJob> {
  assertClaimed(job, "skipped");
  return settle(
    {
      ...job,
      status: "skipped",
      endedAt: instantOf(deps.clock.now(), "an end time"),
      skipReason: reason,
      error: null,
    },
    deps,
  );
}

/**
 * The attempt threw before a run existed. Retry with backoff, or dead-letter.
 *
 * `startedAt` is cleared on the way back to `queued`, because it means "when the
 * claim that is running now began" and there is no longer one. `claimNextJob`
 * stamps it again on the next claim.
 */
export async function markFailed(
  job: QueuedJob,
  error: string,
  deps: SettleDeps,
): Promise<QueuedJob> {
  assertClaimed(job, "failed");
  const now = deps.clock.now();
  const attempts = positiveInt(job.maxAttempts, DEFAULT_MAX_ATTEMPTS);

  if (job.attempt >= attempts) {
    return settle(
      {
        ...job,
        status: "dead_letter",
        endedAt: instantOf(now, "an end time"),
        error: `Gave up after ${job.attempt} of ${attempts} attempt(s): ${error}`,
      },
      deps,
    );
  }

  const delay = backoffDelayMs(job.attempt);
  return settle(
    {
      ...job,
      status: "queued",
      attempt: job.attempt + 1,
      startedAt: null,
      endedAt: null,
      runAfter: instantOf(new Date(now.getTime() + delay), "a retry time"),
      error: `Attempt ${job.attempt} of ${attempts} failed: ${error}`,
    },
    deps,
  );
}

/* ═══════════════════════════ Reading ═══════════════════════════ */

/**
 * The poison jobs. Nothing retries out of `dead_letter` automatically, so this
 * list is the only way one becomes visible again — which is the point of the
 * state existing at all rather than the job simply disappearing.
 */
export async function listDeadLetterJobs(
  deps: Pick<SchedulerDeps, "store">,
): Promise<QueuedJob[]> {
  return deps.store.listJobs({ status: "dead_letter" });
}
