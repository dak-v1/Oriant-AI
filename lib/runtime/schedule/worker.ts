/**
 * lib/runtime/schedule/worker.ts — where "live" actually happens (ROLE_C_PLAN M4).
 *
 * Everything before this file runs because a human asked. `runDueWork` is the
 * function on the other side of that line: a cron minute arrives, a job is
 * claimed, a run appears, and nobody was watching. Six decisions carry that
 * weight, and each one is a place this could have been written differently.
 *
 * THE LOOP RETURNS. It drains what is due and hands back a summary rather than
 * running forever, and that is the single most important shape decision here. A
 * scheduler that only exists as a daemon can only be demonstrated, never proved:
 * M4's exit criterion — "activate the fixture plan, the Friday sweep fires on
 * schedule, a run appears with no human involvement" — has to be one function
 * call against a `FixedClock` with a byte-identical result on a rerun, or it
 * cannot join the M3 determinism guarantee. `startPoller` at the foot of this
 * file is the daemon, it is four interesting lines long, and nothing else in the
 * runtime depends on it.
 *
 * THE JOB'S CONTRACT ENDS WHEN THE RUN IS UNDER WAY. A run that pauses for
 * approval settles its job `succeeded`. This is the mistake worth naming
 * explicitly because it looks so much like an unfinished outcome: route a paused
 * run to the failure path and the job retries, `claimIdempotencyKey` refuses the
 * second start, and three attempts later the job dead-letters while pointing at
 * a perfectly healthy run sitting in the owner's inbox. A run that ended
 * `failed` or `refused` settles the same way, for the same reason plus a
 * mechanical one — its key is claimed, so no retry could produce a second run
 * even if retrying were the right answer. The failure belongs to the run.
 *
 * POLICY GATES THE START, AND A REFUSAL IS NOT AN ERROR. `resolveRunStart` is
 * called with the agent's policy, the plan's global quiet window and the count
 * of runs already started today, BEFORE any run exists. A refusal settles the
 * job `skipped` with the reason verbatim. "Correctly did nothing at 3am" is a
 * success and must not page anyone, and the difference between "the agent
 * decided not to" and "the agent broke" is the difference between an owner who
 * trusts the workforce and one who stops reading its notifications.
 *
 * IT RUNS WHAT THE SANDBOX PROVED, NOT WHAT COMPILES NOW. The bundle comes from
 * `loadBundle`, which reads the STORED package for the agent's current version,
 * and a missing one fails the job rather than falling back to compiling the spec
 * on the spot. Compiling here would be easy, would always work, and would mean a
 * workforce going live on a package no sandbox scenario ever executed — which is
 * the whole of what activation gates on.
 *
 * ONE AGENT RUNS ONE JOB AT A TIME. `maxRunsPerDay` is checked and then acted
 * on, so two lanes reading a count of 2 against a cap of 3 would both pass and
 * the agent would run four times. Serialising the gate AND the run per agent
 * closes that inside this process, and it buys a second property worth having on
 * its own: a finance sweep can never overlap itself. Across two processes the
 * cap still races, and closing it properly needs a counter the `RunStore`
 * interface does not have — said plainly here rather than left for someone to
 * discover from a run count of four.
 *
 * THE LOCAL DAY IS THE AGENT'S, NOT UTC. A daily cap that resets at the wrong
 * midnight is a bug an owner notices: in Singapore a UTC reset lands at 8am, so
 * the morning's runs are counted against yesterday. The zone comes from the
 * agent's own quiet hours, falling back to the plan's, because `QuietHours` is
 * the only place contract §3.10 states a timezone for an agent at all.
 */

import type { AgentSpec, ApprovedPlan, QuietHours } from "../../plan/types";
import { loadBundle } from "../build/runner";
import type { BuildDeps } from "../build/types";
import type { ExecutorOptions } from "../executor";
import { startRun } from "../executor";
import { resolveRunStart } from "../policy";
import type { AgentBundle, RunState, RunStatus } from "../types";
import { enqueueFiring, markFailed, markSkipped, markSucceeded } from "./queue";
import {
  advanceScheduleTrigger,
  dependencyFirings,
  dueScheduleTriggers,
} from "./triggers";
import type { WorkflowCompletion } from "./triggers";
import type { JobStatus, QueuedJob, SchedulerDeps } from "./types";

/* ═══════════════════════════ Defaults ═══════════════════════════ */

/**
 * One job at a time by default.
 *
 * Determinism is an M3 exit criterion and must not regress: with a single lane
 * the order of claims is the store's due order, and two passes over the same
 * queue produce identical output down to the byte. Concurrency is an operational
 * decision the contract explicitly keeps out of the plan (§4.3
 * `AgentRuntimeConfig.concurrency`), so raising it is a deployment's choice to
 * trade that reproducibility for throughput — not a default this library takes
 * on the deployment's behalf.
 */
export const DEFAULT_CONCURRENCY = 1;

/**
 * The most jobs one pass will process.
 *
 * Not a performance knob. A completed run fires dependency triggers, whose jobs
 * are due immediately and are drained by the same pass, so a dependency cycle
 * the validator did not catch — A after B, B after A — would otherwise spin
 * until the process died. The budget turns that into a pass that returns with
 * `budgetReached` set and a queue somebody can look at.
 */
export const DEFAULT_JOB_BUDGET = 100;

/** How often the daemon wrapper wakes, when nobody says otherwise. */
export const DEFAULT_POLL_INTERVAL_MS = 30_000;

/**
 * Used only when neither the agent nor the plan declares quiet hours, which is
 * the one case where the plan states no timezone anywhere. Named rather than
 * inlined because a UTC daily boundary is wrong for every business this product
 * is for, and the constant is where that shows up.
 */
export const FALLBACK_TIMEZONE = "UTC";

/* ═══════════════════════════ Wiring ═══════════════════════════ */

export interface WorkerDeps {
  /**
   * The plan whose triggers this worker serves. Agent policy, the global quiet
   * window and the set of agents that may run all come from here, so a worker
   * is always operating on one plan — never on "whatever is in the queue".
   */
  plan: ApprovedPlan;
  /** Queue, triggers and agent runtime state. Its clock drives the whole pass. */
  scheduler: SchedulerDeps;
  /** Runs, approvals, tools and the reasoner. `store` here is the `RunStore`. */
  executor: ExecutorOptions;
  /** Where built packages live; `loadBundle` reads it. */
  build: Pick<BuildDeps, "store">;
  /** Jobs in flight at once. Default `DEFAULT_CONCURRENCY`. */
  concurrency?: number;
  /** Ceiling on jobs processed by one pass. Default `DEFAULT_JOB_BUDGET`. */
  maxJobs?: number;
  /** Attempts before a job dead-letters. Default is the queue's. */
  maxAttempts?: number;
  /**
   * Whether the pass polls due schedule triggers before draining.
   *
   * Default true, so one call is the whole path from cron minute to run. Set
   * false to prove the drain on its own against a hand-queued job, or in a
   * deployment where one leader polls the schedule and several workers only
   * drain — two processes both advancing the same trigger is safe (the
   * idempotency key deduplicates) but pointless.
   */
  pollSchedules?: boolean;
}

/* ═══════════════════════════ Results ═══════════════════════════ */

export interface JobOutcome {
  jobId: string;
  agentId: string;
  workflowId: string;
  /** The job's status after the pass. `queued` means it will be retried. */
  status: JobStatus;
  attempt: number;
  runId: string | null;
  /** The run's own outcome, when this job produced one. */
  runStatus: RunStatus | null;
  /** One line a reader can act on: the skip reason, the error, or the result. */
  detail: string;
}

export interface ScheduleTick {
  /** The instant the schedule was polled at. */
  at: string;
  /** Jobs this tick newly queued. */
  enqueued: QueuedJob[];
  /** Firings that matched a job already queued — a re-delivery, refused. */
  duplicates: number;
  /**
   * Triggers that fired but whose next occurrence could not be computed. Each
   * one stays due and will be retried next tick; see `enqueueDueSchedules`.
   */
  errors: { triggerId: string; message: string }[];
}

export interface WorkSummary {
  startedAt: string;
  endedAt: string;
  concurrency: number;
  /** What the schedule poll at the top of the pass did. */
  schedule: ScheduleTick;
  claimed: number;
  succeeded: number;
  skipped: number;
  /** Failed this pass and queued for another attempt. */
  retrying: number;
  deadLettered: number;
  /** Claimed but left unsettled because the store refused the write. */
  unsettled: number;
  /** Jobs queued by a dependency trigger firing on a run that completed. */
  dependencyJobs: number;
  /**
   * The pass processed as many jobs as `maxJobs` allowed, so work may still be
   * due — call again. A hint rather than a proof: a queue holding exactly
   * `maxJobs` jobs sets it too.
   */
  budgetReached: boolean;
  /** Every job this pass claimed, in claim order. */
  jobs: JobOutcome[];
}

/* ═══════════════════════════ Guards ═══════════════════════════ */

/** Mirrors the guard of the same name in ./queue.ts, for the same reason. */
function positiveInt(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

/**
 * Every instant in a pass comes from here.
 *
 * An Invalid Date compares false against everything, so a broken clock would not
 * throw — it would quietly claim nothing, skip nothing and report an empty
 * summary, which reads exactly like a queue with no work in it.
 */
function nowFrom(deps: Pick<WorkerDeps, "scheduler">): Date {
  const at = deps.scheduler.clock.now();
  if (!Number.isFinite(at.getTime())) {
    throw new Error(
      `The scheduler clock returned ${String(at)}, which is not a real instant. Due times, ` +
        `backoff and the daily-cap boundary are all computed from it, so no work can be ` +
        `claimed safely and the pass refuses to run rather than reporting an empty queue.`,
    );
  }
  return at;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/* ═══════════════════ One agent at a time ═══════════════════ */

/**
 * In-flight work, one chain per agent. Same construction as `serialiseByRun` in
 * lib/runtime/executor.ts, and the same limitation: in-process only.
 *
 * It covers the daily-cap gate AND the run it authorises, because a gate that
 * releases before the run it approved has not started is not a gate. The entry
 * is dropped as soon as its tail settles, so nothing accumulates between passes
 * and no state leaks between tests.
 */
const agentLanes = new Map<string, Promise<void>>();

function serialiseByAgent<T>(agentId: string, work: () => Promise<T>): Promise<T> {
  const previous = agentLanes.get(agentId) ?? Promise.resolve();
  const result = previous.then(work);
  // The chain must survive a rejected link, or one failed job would reject every
  // job queued behind it for the same agent.
  const link = result.then(
    () => undefined,
    () => undefined,
  );
  agentLanes.set(agentId, link);
  void link.then(() => {
    if (agentLanes.get(agentId) === link) agentLanes.delete(agentId);
  });
  return result;
}

/* ═══════════════════════ The agent's local day ═══════════════════════ */

/**
 * A pure memo, exactly as in ./cron.ts: formatters are expensive to construct
 * and this would otherwise build one per run per pass. It changes nothing
 * observable, which is what keeps two identical passes byte-identical.
 */
const dayFormatters = new Map<string, Intl.DateTimeFormat>();

function dayFormatterFor(timezone: string): Intl.DateTimeFormat {
  const cached = dayFormatters.get(timezone);
  if (cached) return cached;

  let created: Intl.DateTimeFormat;
  try {
    created = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    throw new Error(
      `"${timezone}" is not an IANA timezone this platform's tz database knows, so the ` +
        `agent's local day cannot be resolved and maxRunsPerDay cannot be counted against ` +
        `it. The zone comes from the agent's quietHours or the plan's; validateApprovedPlan ` +
        `(lib/plan/validate.ts) refuses both at the handoff gate, so reaching here means the ` +
        `plan was assembled around that gate.`,
    );
  }

  dayFormatters.set(timezone, created);
  return created;
}

/** `2026-07-31` in the given zone. Compared, never displayed. */
function localDayKey(at: Date, timezone: string): string {
  const parts = dayFormatterFor(timezone).formatToParts(at);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

/**
 * Which day boundary this agent's cap resets on. Quiet hours are the only place
 * the contract attaches a timezone to an agent, so they are the only honest
 * source; see FALLBACK_TIMEZONE for what happens when neither declares one.
 *
 * EXPORTED FOR THE SAME REASON `countRunsToday` BELOW IS. A screen that shows a
 * cap must resolve the day against the zone the scheduler will resolve it
 * against, or the count and the limit are about different days.
 */
export function agentTimezone(spec: AgentSpec, plan: ApprovedPlan): string {
  return (
    spec.policy.quietHours?.timezone ??
    plan.globalPolicy?.quietHours?.timezone ??
    FALLBACK_TIMEZONE
  );
}

/**
 * Runs this agent has STARTED on its own local day.
 *
 * Started, not completed. `maxRunsPerDay` caps how often an agent wakes up, so a
 * run that failed, was refused or is still waiting on an approval counts the
 * same as one that finished — counting only successes would let an agent that
 * fails repeatedly retry its way past the owner's limit.
 *
 * EXPORTED BECAUSE THE ENFORCEMENT AND THE DISPLAY MUST BE ONE FUNCTION.
 * `startGated` below feeds this number to `resolveRunStart`, and the roster
 * (`app/api/runtime/agents/route.ts`) shows the owner "3 of 5 today" — which is
 * a promise about what the scheduler will do in an hour's time. Those were two
 * copies of the same three rules until M7, and two copies is two chances to
 * disagree about a run that started at 00:30 in Singapore.
 *
 * It takes the runs rather than the store on purpose. The worker holds one
 * agent and reads its runs; the roster already holds every run in the system and
 * would otherwise make one store round trip per row to be told what it knows.
 *
 * It THROWS on a zone this platform's tz database cannot resolve, because the
 * worker has no safe number to fall back on — see `dayFormatterFor`. A caller
 * that is only displaying the count can catch that and report the count as
 * unavailable; a caller that is about to authorise a run must not.
 */
export function countRunsToday(runs: RunState[], timezone: string, at: Date): number {
  const today = localDayKey(at, timezone);
  let count = 0;

  for (const run of runs) {
    const startedMs = Date.parse(run.startedAt);
    if (!Number.isFinite(startedMs)) {
      // An unreadable start instant counts AGAINST the cap rather than being
      // ignored. Under-counting a cap is the direction that lets an agent run
      // more times than the owner allowed.
      count += 1;
      continue;
    }
    if (localDayKey(new Date(startedMs), timezone) === today) count += 1;
  }

  return count;
}

/* ═══════════════════════ Polling the schedule ═══════════════════════ */

/**
 * Queue a job for every schedule trigger that has come due, and move each one on
 * to its next occurrence.
 *
 * THE ORDER IS ENQUEUE, THEN ADVANCE, and it is the wrong way round on purpose.
 * A crash between the two leaves the trigger still due, so the next tick
 * re-derives the same firing, computes the same idempotency key, and the queue
 * hands back the job that already exists — one job, at the cost of one wasted
 * scan. Advancing first would make the same crash lose the firing outright, and
 * a Friday sweep that silently did not happen is the failure nobody notices
 * until the invoices are a month old.
 *
 * An advance that throws is recorded rather than swallowed, and the trigger is
 * left exactly as it was. It stays due, so the next tick tries again and the
 * duplicate check keeps the queue clean in the meantime — which is the least
 * destructive answer available. Writing `nextFireAt: null` to stop the retries
 * would silently take a workflow off the schedule the owner activated, and
 * disabling the trigger would do it more loudly but no more correctly.
 */
export async function enqueueDueSchedules(deps: WorkerDeps): Promise<ScheduleTick> {
  const now = nowFrom(deps);
  const tick: ScheduleTick = {
    at: now.toISOString(),
    enqueued: [],
    duplicates: 0,
    errors: [],
  };

  const firings = await dueScheduleTriggers(now, deps.scheduler, {
    planId: deps.plan.planId,
  });

  for (const firing of firings) {
    const queued = await enqueueFiring(firing, deps.scheduler, {
      maxAttempts: deps.maxAttempts,
    });
    if (queued.created) tick.enqueued.push(queued.job);
    else tick.duplicates += 1;

    try {
      // `firedAt` is the canonical ISO of the fire instant, produced by
      // buildTriggerEvent from the same number this trigger's nextFireAt parsed
      // to, so the round trip is exact.
      const firedAt = new Date(Date.parse(firing.event.firedAt));
      await deps.scheduler.store.saveTrigger(
        advanceScheduleTrigger(firing.trigger, firedAt, now),
      );
    } catch (error) {
      tick.errors.push({
        triggerId: firing.trigger.triggerId,
        message: messageOf(error),
      });
    }
  }

  return tick;
}

/* ═══════════════════════════ The pass ═══════════════════════════ */

interface PassState {
  /** Job slots left in this pass's budget. */
  remaining: number;
  /** Claims made so far; doubles as the claim-order sequence number. */
  claims: number;
  results: { seq: number; outcome: JobOutcome }[];
  dependencyJobs: number;
}

/**
 * Poll the schedule, then claim and execute jobs until nothing is due.
 *
 * This is M4's exit criterion in one call: with the fixture plan activated and a
 * clock reading Friday 09:00 Asia/Singapore, it enqueues the overdue-invoice
 * sweep, claims it, starts a run, and returns a summary naming the run — with no
 * human anywhere in the sequence.
 */
export async function runDueWork(deps: WorkerDeps): Promise<WorkSummary> {
  const startedAt = nowFrom(deps);
  const concurrency = positiveInt(deps.concurrency, DEFAULT_CONCURRENCY);
  const budget = positiveInt(deps.maxJobs, DEFAULT_JOB_BUDGET);

  const schedule: ScheduleTick =
    deps.pollSchedules === false
      ? { at: startedAt.toISOString(), enqueued: [], duplicates: 0, errors: [] }
      : await enqueueDueSchedules(deps);

  const pass: PassState = { remaining: budget, claims: 0, results: [], dependencyJobs: 0 };

  // Rounds, not one sweep. A lane stops the moment the queue is empty, but
  // another lane may still be inside a run that is about to queue a dependent
  // workflow — so with more than one lane the queue can refill after the first
  // lane has already given up. Repeating until a whole round claims nothing is
  // what makes "until none are due" true rather than true-at-concurrency-one.
  // It terminates because every round either claims a job (bounded by the
  // budget) or is the last one, and it costs one empty claim per lane.
  for (;;) {
    const before = pass.claims;
    await Promise.all(Array.from({ length: concurrency }, () => drain(deps, pass)));
    if (pass.claims === before || pass.remaining <= 0) break;
  }

  // Claim order, not completion order. With more than one lane the two differ,
  // and only the first is reproducible — a summary that reshuffled itself
  // between two identical passes would make the M3 determinism check unreadable.
  pass.results.sort((left, right) => left.seq - right.seq);
  const jobs = pass.results.map((entry) => entry.outcome);
  const count = (status: JobStatus): number =>
    jobs.filter((job) => job.status === status).length;

  return {
    startedAt: startedAt.toISOString(),
    endedAt: nowFrom(deps).toISOString(),
    concurrency,
    schedule,
    claimed: jobs.length,
    succeeded: count("succeeded"),
    skipped: count("skipped"),
    retrying: count("queued"),
    deadLettered: count("dead_letter"),
    unsettled: count("running"),
    dependencyJobs: pass.dependencyJobs,
    budgetReached: pass.claims >= budget,
    jobs,
  };
}

/**
 * One concurrency lane: claim, process, repeat until the queue is empty or the
 * pass runs out of budget.
 *
 * The budget slot is reserved BEFORE the claim and handed back when nothing was
 * claimable, which is what makes `maxJobs` a real ceiling across every lane
 * rather than a per-lane suggestion.
 */
async function drain(deps: WorkerDeps, pass: PassState): Promise<void> {
  for (;;) {
    if (pass.remaining <= 0) return;
    pass.remaining -= 1;

    const job = await deps.scheduler.store.claimNextJob(nowFrom(deps));
    if (!job) {
      pass.remaining += 1;
      return;
    }

    const seq = pass.claims;
    pass.claims += 1;

    let outcome: JobOutcome;
    try {
      outcome = await processJob(job, deps, pass);
    } catch (error) {
      // One job must never abort the rest of the pass — the same rule buildPlan
      // applies to one agent failing to build. The job is left as claimed, which
      // is visible in the summary as `unsettled`.
      outcome = {
        jobId: job.jobId,
        agentId: job.agentId,
        workflowId: job.workflowId,
        status: job.status,
        attempt: job.attempt,
        runId: job.runId,
        runStatus: null,
        detail: `The worker failed while processing this job: ${messageOf(error)}`,
      };
    }
    pass.results.push({ seq, outcome });
  }
}

/* ═══════════════════════════ One job ═══════════════════════════ */

interface StartResult {
  job: QueuedJob;
  /** Null when policy declined the start; no run was created. */
  run: RunState | null;
  detail: string;
}

async function processJob(
  job: QueuedJob,
  deps: WorkerDeps,
  pass: PassState,
): Promise<JobOutcome> {
  let started: StartResult;

  try {
    const spec = findAgent(deps.plan, job.agentId);

    const standDown = await standDownReason(job, spec, deps);
    if (standDown) {
      return describeOutcome(await markSkipped(job, standDown, deps.scheduler), null, standDown);
    }

    const bundle = await loadBundle(spec, deps.build);
    if (!bundle) {
      throw new Error(
        `Agent "${spec.id}" has no stored package for version ${spec.version}, so there is ` +
          `nothing proven to run. The Agent Factory builds one (M2) and the Sandbox is what ` +
          `proves it (M3); compiling the spec here instead would put a workforce live on a ` +
          `package no scenario ever executed. Rebuild the agent, then re-activate.`,
      );
    }

    started = await serialiseByAgent(spec.id, () => startGated(job, spec, bundle, deps));
  } catch (error) {
    return settleFailure(job, error, deps);
  }

  // The job is settled from here on. Everything below may add detail; nothing
  // below may write to the job again, or the failure path would be settling a
  // job that already carries an outcome.
  let detail = started.detail;
  const run = started.run;

  if (run !== null && run.status === "completed") {
    try {
      const queued = await fireDependencies(run, deps);
      pass.dependencyJobs += queued;
      if (queued > 0) detail += ` Queued ${queued} dependent workflow(s).`;
    } catch (error) {
      // The run is finished and correct; only the fan-out failed. Recording it
      // on the outcome keeps it visible without pretending the run went wrong.
      detail += ` Dependent workflows could not be queued: ${messageOf(error)}`;
    }
  }

  return describeOutcome(started.job, run, detail);
}

/**
 * The gate and the run, together, under the agent's lane.
 *
 * They are inseparable: the count `resolveRunStart` judges is only true until
 * the next run starts, so releasing the lane between the decision and
 * `startRun` would let a second job pass a cap the first has already consumed.
 */
async function startGated(
  job: QueuedJob,
  spec: AgentSpec,
  bundle: AgentBundle,
  deps: WorkerDeps,
): Promise<StartResult> {
  const at = nowFrom(deps);
  const timezone = agentTimezone(spec, deps.plan);
  const globalQuietHours: QuietHours | null = deps.plan.globalPolicy?.quietHours ?? null;
  const runsToday = countRunsToday(
    await deps.executor.store.listRuns({ agentId: spec.id }),
    timezone,
    at,
  );

  const gate = resolveRunStart({
    at,
    policy: spec.policy,
    globalQuietHours,
    runsToday,
  });

  // Anything that is not an outright allow stops the run. `resolveRunStart`
  // returns only "allow" or "refuse" today; treating a future third answer as a
  // stop is the fail-closed direction, since there is no such thing as a run
  // start that half-happens.
  if (gate.action !== "allow") {
    const skipped = await markSkipped(job, gate.reason, deps.scheduler);
    return {
      job: skipped,
      run: null,
      // The persisted `skipReason` stays in the owner's language; the diagnostic
      // context belongs on the pass summary, where an operator is reading.
      detail:
        `${gate.reason} (${spec.id} had already started ${runsToday} run(s) on its ` +
        `${timezone} day)`,
    };
  }

  const outcome = await startRun(bundle, job.trigger, deps.executor);
  const succeeded = await markSucceeded(job, outcome.run.runId, deps.scheduler);
  return { job: succeeded, run: outcome.run, detail: describeRun(outcome.run) };
}

/** What the pass summary says about a run that started. */
function describeRun(run: RunState): string {
  switch (run.status) {
    case "completed":
      return `Run ${run.runId} completed.`;
    case "awaiting_approval":
      return (
        `Run ${run.runId} is waiting on approval ${run.pendingApprovalId ?? "?"}. The job is ` +
        `done — the run is under way and the decision is the owner's.`
      );
    case "refused":
      return `Run ${run.runId} was refused by policy: ${run.failure ?? "no reason recorded"}.`;
    case "failed":
      return `Run ${run.runId} failed: ${run.failure ?? "no reason recorded"}.`;
    default:
      // "running" and "cancelled". startRun returns only when a run has finished
      // or paused, so this is another actor's write landing mid-run; reported
      // rather than reclassified.
      return `Run ${run.runId} ended the start call as "${run.status}".`;
  }
}

/**
 * Whether this job must not be started at all, independent of policy.
 *
 * Two signals, both owned by activation and both meaning "this is not live any
 * more": the trigger that queued the job has been stood down, or the agent's
 * runtime record says it is anything other than `active`. Either produces a
 * SKIP, not a failure — the job did not break, it was overtaken.
 *
 * The absence of an agent runtime record is deliberately not treated as a stand
 * down. The record is written at activation, so absence means "nothing has said
 * anything about this agent", where `paused` means "someone said stop". Fail
 * closed applies to the claim that exists, not to the silence.
 */
async function standDownReason(
  job: QueuedJob,
  spec: AgentSpec,
  deps: WorkerDeps,
): Promise<string | null> {
  if (job.triggerId !== null) {
    const trigger = await deps.scheduler.store.getTrigger(job.triggerId);
    if (trigger && !trigger.enabled) {
      return (
        `${spec.name} no longer has this workflow on its schedule — the trigger was switched ` +
        `off after the run was queued, so it was not started.`
      );
    }
  }

  const state = await deps.scheduler.store.getAgentState(spec.id);
  if (state && state.state !== "active") {
    const detail = state.detail.length > 0 ? ` ${state.detail}` : "";
    return `${spec.name} is ${state.state}, not active, so this run was not started.${detail}`;
  }

  return null;
}

/**
 * The attempt threw before any run existed. Retry with backoff, or dead-letter.
 *
 * Its own try/catch, because the settle is a store write and a store that
 * refuses it must not take down the pass: one unwritable row costing the summary
 * of every other job in the queue is a far worse outcome than one job reported
 * as unsettled.
 */
async function settleFailure(
  job: QueuedJob,
  error: unknown,
  deps: WorkerDeps,
): Promise<JobOutcome> {
  const message = messageOf(error);

  try {
    const settled = await markFailed(job, message, deps.scheduler);
    const detail =
      settled.status === "dead_letter"
        ? `Dead-lettered after ${settled.attempt} attempt(s): ${message}`
        : `Attempt ${job.attempt} failed; retrying after ${settled.runAfter}. ${message}`;
    return describeOutcome(settled, null, detail);
  } catch (settleError) {
    return {
      jobId: job.jobId,
      agentId: job.agentId,
      workflowId: job.workflowId,
      status: job.status,
      attempt: job.attempt,
      runId: job.runId,
      runStatus: null,
      detail:
        `${message} — and the failure could not be recorded against the job: ` +
        `${messageOf(settleError)}`,
    };
  }
}

function describeOutcome(job: QueuedJob, run: RunState | null, detail: string): JobOutcome {
  return {
    jobId: job.jobId,
    agentId: job.agentId,
    workflowId: job.workflowId,
    status: job.status,
    attempt: job.attempt,
    runId: job.runId,
    runStatus: run === null ? null : run.status,
    detail,
  };
}

function findAgent(plan: ApprovedPlan, agentId: string): AgentSpec {
  // A collection arriving over the seam is a promise, not proof — as in policy.ts.
  const agents = Array.isArray(plan.agents) ? plan.agents : [];
  const spec = agents.find((candidate) => candidate.id === agentId);
  if (!spec) {
    throw new Error(
      `A queued job names agent "${agentId}", which plan ${plan.planId} v${plan.version} ` +
        `does not contain. The plan changed after the job was queued. Re-activate so the ` +
        `trigger behind it is stood down, or run this worker against the plan that queued it.`,
    );
  }
  return spec;
}

/* ═══════════════════════ Dependency fan-out ═══════════════════════ */

/**
 * Offer a finished run to the dependency triggers waiting on it. Returns how
 * many jobs that queued.
 *
 * Only a `completed` run fires anything, and `dependencyFirings` enforces that a
 * second time: a workflow chained behind another is chained behind its RESULT,
 * and the finance summary is meaningless if the reminder sweep refused, failed,
 * or is still sitting in the approvals inbox.
 *
 * The jobs it queues are due immediately, so the same pass drains them and one
 * call carries the whole chain — bounded by the pass's job budget, which is what
 * a cycle the validator missed would run into.
 *
 * EXPORTED BECAUSE THE WORKER IS NOT THE ONLY PLACE A RUN COMPLETES, and that is
 * a hole worth naming rather than leaving to be discovered. A run that pauses
 * for approval settles its job here and completes LATER, inside
 * `decideAndResume` when the owner decides — a path this pass never observes. On
 * the BrightPath plan that is the ordinary case, not the edge one: the Friday
 * sweep pauses on its first over-limit invoice, so the summary chained behind it
 * only becomes due once Sarah has approved. Whoever wires the Approvals inbox
 * (M5) must call this with the resumed run, and it is exported so that call is
 * this function rather than a second copy of the same reasoning.
 */
export async function fireDependencies(
  run: RunState,
  deps: Pick<WorkerDeps, "plan" | "scheduler" | "maxAttempts">,
): Promise<number> {
  const completion: WorkflowCompletion = {
    agentId: run.agentId,
    workflowId: run.workflowId,
    runId: run.runId,
    status: run.status,
    completedAt: run.endedAt ?? nowFrom(deps).toISOString(),
  };

  const triggers = await deps.scheduler.store.listTriggers({
    planId: deps.plan.planId,
    kind: "dependency",
    enabled: true,
  });

  let queued = 0;
  for (const firing of dependencyFirings(triggers, completion)) {
    const result = await enqueueFiring(firing, deps.scheduler, {
      maxAttempts: deps.maxAttempts,
    });
    if (result.created) queued += 1;
  }
  return queued;
}

/* ═══════════════════════════ The daemon ═══════════════════════════ */

export interface PollerOptions {
  /** Milliseconds between passes. Default `DEFAULT_POLL_INTERVAL_MS`. */
  intervalMs?: number;
  onPass?(summary: WorkSummary): void;
  onError?(error: unknown): void;
}

export interface Poller {
  stop(): void;
}

/**
 * Re-asked before every pass, so a daemon can follow what is deployed.
 *
 * `null` means "nothing to run right now", which is the ordinary state of a
 * runtime with no active deployment — not an error and not worth waking anyone
 * for.
 */
export type WorkerDepsResolver = () => Promise<WorkerDeps | null>;

/**
 * The long-lived wrapper. Deliberately the thinnest thing that could work,
 * because everything interesting is in `runDueWork` and anything that accretes
 * here is behaviour no test can reach.
 *
 * The `busy` flag is the only line worth reading. A pass that outruns the
 * interval must not have a second one started on top of it: the store's claim
 * would stop the two double-claiming a job, but they would still both poll the
 * schedule, both advance the same triggers and both compete for the job budget.
 */
export function startPoller(
  deps: WorkerDeps | WorkerDepsResolver,
  options: PollerOptions = {},
): Poller {
  const intervalMs = positiveInt(options.intervalMs, DEFAULT_POLL_INTERVAL_MS);
  let busy = false;
  let stopped = false;

  /*
   * A plain `deps` is captured once, which is what a caller pinning its own
   * world wants and what every existing caller passes.
   *
   * A RESOLVER IS RE-ASKED EVERY PASS, and that is the option an unattended host
   * needs. The plan a daemon should be serving changes the moment somebody
   * activates one; a poller that resolved its plan at startup goes on serving
   * the previous workforce — or, on a runtime where nothing was deployed yet,
   * serving nothing — until the process restarts. Nobody watches an unattended
   * poller closely enough to notice that.
   */
  const resolve: WorkerDepsResolver = typeof deps === "function" ? deps : async () => deps;

  const timer = setInterval(() => {
    if (busy || stopped) return;
    busy = true;
    void resolve()
      // Null is a quiet tick, not a failure. Reporting "nothing is deployed"
      // through `onError` would page somebody once per interval for a runtime
      // that is merely idle.
      .then((current) => (current === null ? null : runDueWork(current)))
      .then((summary) => {
        if (summary !== null) options.onPass?.(summary);
      })
      .catch((error: unknown) => options.onError?.(error))
      .finally(() => {
        busy = false;
      });
  }, intervalMs);

  return {
    stop(): void {
      stopped = true;
      clearInterval(timer);
    },
  };
}
