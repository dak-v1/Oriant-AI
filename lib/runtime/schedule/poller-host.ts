/**
 * lib/runtime/schedule/poller-host.ts — the process that makes a schedule fire.
 *
 * `runDueWork` is one pass and `startPoller` is the daemon around it, and until
 * this file existed nothing anywhere called the second one. The consequence was
 * quiet and complete: a deployed build registered triggers, showed agents as
 * live, computed a `nextFireAt` for every cron — and then waited for a human to
 * POST /api/runtime/scheduler, which is the one thing M4's exit criterion says
 * must not be needed. This module is the server process deciding to turn the
 * worker itself. Five decisions carry that, and the first two are the ones that
 * keep it safe to have at all.
 *
 * OFF IS THE DEFAULT, AND OPTING IN IS THE ONLY WAY ON. `ORIANT_POLLER` is
 * unset in every environment nobody has thought about, and unset means no pass
 * ever runs. This is the strongest default in the repo and it is deliberately
 * stronger than `ORIANT_RUNTIME_MODE`'s: mode decides what a run is allowed to
 * touch, this decides whether runs happen at all with nobody present. A
 * developer who types `npm run dev` has asked to see some screens; a workforce
 * that starts dispatching thirty seconds later — against whatever credentials
 * happen to be in `.env.local` — is not something they asked for, and on a
 * machine configured for live mode it is customer email. So the switch is
 * explicit, it is documented as off, and turning it on is a sentence somebody
 * had to write down.
 *
 * THE POLLER NEVER TAKES THE SERVER DOWN WITH IT. Configuration this build
 * cannot read, or a runtime session that cannot be composed, ends as a refusal
 * to start plus a loud line on stderr — never as a thrown `register()`, which in
 * Next is a server that does not boot. The trade is the point: an unreadable
 * `ORIANT_POLLER` should cost the deployment its background scheduler, not its
 * product. `session.ts` throws on an unrecognised `ORIANT_RUNTIME_STORAGE` for
 * the opposite and equally correct reason — that value silently changes what
 * every request does, and it surfaces on one request rather than at boot.
 *
 * BUT A REFUSAL IS NEVER QUIET, and that is what earns the paragraph above. An
 * operator who typed `ORIANT_POLLER=treu` believes the Friday sweep is armed. A
 * poller that shrugged and stayed off would leave them with exactly the failure
 * `enqueueDueSchedules` is written to avoid — a sweep that silently did not
 * happen, noticed a month later in the unchased invoices. Hence one rule,
 * applied to every variable here: THE POLLER STARTS ONLY ON CONFIGURATION IT
 * FULLY UNDERSTANDS, and anything else is reported by name with the accepted
 * values beside it.
 *
 * ONE PER PROCESS, CACHED ON `globalThis`, exactly as `session.ts` caches the
 * session and for a sharper reason. Next's dev server re-evaluates modules on
 * hot reload while `globalThis` survives, so a cache held in module scope would
 * mean a second poller per reload — each one polling the schedule, each one
 * advancing the same triggers, each one competing for the same job budget. The
 * claim is safe (`claimNextJob` locks, in memory and on disk alike) so the
 * damage is waste rather than double-firing, but it is unbounded waste, and it
 * is invisible until an editor has been saved forty times.
 *
 * SHUTDOWN CLOSES THE CLAIM WINDOW; IT DOES NOT DRAIN THE QUEUE. On SIGTERM or
 * SIGINT the interval is cleared, so no pass begins after the signal and the
 * process stops taking on work it cannot finish. A pass already inside a run
 * when the signal lands is NOT awaited — `Poller` exposes no handle to it, and
 * waiting properly would mean waiting out a run, which can be minutes. That
 * residual is visible rather than lost: the job it claimed stays `running` in
 * the queue, which is the state `WorkSummary.unsettled` already names, and the
 * run it started is in the `RunStore`. What stopping prevents is the worse and
 * likelier case — a poller that keeps claiming fresh jobs while the process is
 * being torn down around it.
 */

import type { RuntimeSession } from "../session";
import { getRuntimeSession } from "../session";
import type { Poller, WorkSummary, WorkerDeps } from "./worker";
import { DEFAULT_POLL_INTERVAL_MS, startPoller, type WorkerDepsResolver } from "./worker";

/* ═══════════════════════════ The switches ═══════════════════════════ */

/** Turns the daemon on. Absent, blank or off-valued means no pass ever runs. */
export const POLLER_SWITCH_ENV = "ORIANT_POLLER";

/** Optional override for the gap between passes. */
export const POLLER_INTERVAL_ENV = "ORIANT_POLLER_INTERVAL_MS";

/**
 * The shortest gap this host will accept.
 *
 * Not a performance guess. A `TriggerSpec` cron is minute-granular, so the fine
 * detail below a second buys no responsiveness whatsoever — while every pass
 * takes the file store's claim lock and reads the whole queue, which at 50ms is
 * a busy loop against a filesystem. A value under this is far more likely to be
 * a unit mix-up (seconds typed into a milliseconds field) than an intention, and
 * the rule above says a value that might be a mistake is refused rather than
 * clamped.
 */
export const MIN_POLL_INTERVAL_MS = 1_000;

/**
 * Both directions are ENUMERATED, and anything in neither set is a refusal.
 *
 * A single truthiness test would have read `ORIANT_POLLER=off` as on, which is
 * the exact inversion of the one property this module has to get right. Spelling
 * both lists out means the only inputs that produce an answer are inputs
 * somebody could have meant.
 */
const ON_VALUES = new Set(["on", "true", "1", "yes", "enabled"]);
const OFF_VALUES = new Set(["", "off", "false", "0", "no", "disabled"]);

/* ═══════════════════════════ Configuration ═══════════════════════════ */

export type PollerConfig =
  | { decision: "start"; intervalMs: number }
  /** Nobody asked for a poller. The ordinary state of most environments. */
  | { decision: "off"; reason: string }
  /** Somebody asked for something this build cannot read. Loud, and still off. */
  | { decision: "refuse"; reason: string };

/**
 * Pure, and takes the environment rather than reading it, so the decision table
 * above can be argued with directly instead of through a process restart.
 */
export function readPollerConfig(
  env: Readonly<Record<string, string | undefined>>,
): PollerConfig {
  const requested = (env[POLLER_SWITCH_ENV] ?? "").trim();
  const normalised = requested.toLowerCase();

  if (OFF_VALUES.has(normalised)) {
    return {
      decision: "off",
      reason:
        requested === ""
          ? `${POLLER_SWITCH_ENV} is not set, so this process runs no scheduler passes. ` +
            `Triggers still register and still compute a nextFireAt; nothing turns the ` +
            `worker, so every firing waits for a POST to /api/runtime/scheduler. Set ` +
            `${POLLER_SWITCH_ENV}=on to let schedules fire on their own.`
          : `${POLLER_SWITCH_ENV} is "${requested}", so this process runs no scheduler ` +
            `passes. Set it to "on" to let schedules fire on their own.`,
    };
  }

  if (!ON_VALUES.has(normalised)) {
    return {
      decision: "refuse",
      reason:
        `${POLLER_SWITCH_ENV} is "${requested}", which this build does not recognise, so the ` +
        `poller has NOT started and no schedule will fire on its own. Use "on" (or ` +
        `${[...ON_VALUES].filter((value) => value !== "on").join(", ")}) to start it, or ` +
        `"off" / unset to leave it stopped. It is refused rather than guessed at because a ` +
        `mistyped switch that quietly means "off" is a workforce nobody notices has stopped.`,
    };
  }

  const interval = (env[POLLER_INTERVAL_ENV] ?? "").trim();
  if (interval === "") return { decision: "start", intervalMs: DEFAULT_POLL_INTERVAL_MS };

  // Digits only. `Number()` would happily accept "30s" as NaN, "1e4" as 10000
  // and " -5 " as -5, and each of those is a different person's typo rather than
  // a value to salvage.
  if (!/^\d+$/.test(interval)) {
    return {
      decision: "refuse",
      reason:
        `${POLLER_INTERVAL_ENV} is "${interval}"; it must be a whole number of ` +
        `milliseconds, e.g. ${DEFAULT_POLL_INTERVAL_MS}. The poller has NOT started.`,
    };
  }

  const intervalMs = Number(interval);
  if (intervalMs < MIN_POLL_INTERVAL_MS) {
    return {
      decision: "refuse",
      reason:
        `${POLLER_INTERVAL_ENV} is ${intervalMs}ms, below the ${MIN_POLL_INTERVAL_MS}ms floor ` +
        `this host accepts. Cron is minute-granular, so nothing below a second is more ` +
        `responsive — only busier. The poller has NOT started; if seconds were meant, ` +
        `${intervalMs * 1000} is the value.`,
    };
  }

  return { decision: "start", intervalMs };
}

/* ═══════════════════════════ Reporting ═══════════════════════════ */

const LOG_PREFIX = "[oriant:poller]";

function say(message: string): void {
  console.info(`${LOG_PREFIX} ${message}`);
}

function complain(message: string): void {
  console.error(`${LOG_PREFIX} ${message}`);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Whether a pass is worth a line.
 *
 * An idle tick is the overwhelmingly common case — a poller on a 30s interval
 * that logged every tick would write 2,880 lines a day saying nothing happened,
 * and the one line that mattered would be lost among them. A pass counts as
 * having done something if it queued a firing, claimed a job, or hit an error
 * polling the schedule.
 */
function didWork(summary: WorkSummary): boolean {
  return (
    summary.claimed > 0 ||
    summary.schedule.enqueued.length > 0 ||
    summary.schedule.errors.length > 0
  );
}

function tally(summary: WorkSummary): string {
  const parts: string[] = [];
  const add = (count: number, label: string): void => {
    if (count > 0) parts.push(`${count} ${label}`);
  };
  add(summary.succeeded, "succeeded");
  add(summary.skipped, "skipped");
  add(summary.retrying, "retrying");
  add(summary.deadLettered, "dead-lettered");
  add(summary.unsettled, "unsettled");
  add(summary.dependencyJobs, "dependent queued");
  return parts.length > 0 ? parts.join(", ") : "nothing to claim";
}

/**
 * One header line plus one line per claimed job — enough for an operator to
 * answer "what did the workforce do overnight" from the log alone, which is the
 * only account of an unattended run that exists before the Workspace renders it.
 *
 * A schedule error is reported even on an otherwise idle pass, because a trigger
 * that cannot be advanced stays due and is retried forever: silent, repeating,
 * and the sort of thing that is only ever found by someone already looking.
 */
function reportPass(summary: WorkSummary): void {
  for (const error of summary.schedule.errors) {
    complain(
      `${summary.startedAt} — trigger ${error.triggerId} fired but could not be advanced to ` +
        `its next occurrence, so it stays due and will be retried: ${error.message}`,
    );
  }

  if (!didWork(summary)) return;

  say(
    `${summary.startedAt} — queued ${summary.schedule.enqueued.length}` +
      `${summary.schedule.duplicates > 0 ? ` (${summary.schedule.duplicates} re-delivered)` : ""}` +
      `, claimed ${summary.claimed}: ${tally(summary)}`,
  );

  for (const job of summary.jobs) {
    const line = `  ${job.agentId}/${job.workflowId} ${job.status} — ${job.detail}`;
    // `dead_letter` is terminal and `running` means the job was left claimed;
    // both are things somebody has to look at, so they leave on stderr.
    if (job.status === "dead_letter" || job.status === "running") complain(line);
    else say(line);
  }

  if (summary.budgetReached) {
    complain(
      `${summary.startedAt} — the pass stopped at its job budget, so work may still be due. ` +
        `A queue that never empties usually means a dependency cycle the plan validator did ` +
        `not catch.`,
    );
  }
}

/* ═══════════════════════════ The handle ═══════════════════════════ */

interface PollerHostHandle {
  poller: Poller;
  intervalMs: number;
}

interface PollerHostGlobal {
  __oriantPollerHost?: PollerHostHandle;
}

function hostGlobal(): PollerHostGlobal {
  return globalThis as unknown as PollerHostGlobal;
}

export type PollerHostOutcome =
  | "started"
  /** This process already has one; the second request changed nothing. */
  | "already-running"
  | "off"
  /** Configuration this build could not read. See `readPollerConfig`. */
  | "refused"
  /** Configuration was fine; the runtime session could not be composed. */
  | "unavailable";

export interface PollerHostStatus {
  outcome: PollerHostOutcome;
  /** One sentence, already logged, safe to surface as-is. */
  reason: string;
  /** The interval a running poller is on; null when nothing is running. */
  intervalMs: number | null;
}

/* ═══════════════════════════ Shutdown ═══════════════════════════ */

const SHUTDOWN_SIGNALS = ["SIGTERM", "SIGINT"] as const;

/**
 * Stops the process's poller if it has one. Returns whether it stopped anything.
 *
 * Synchronous on purpose: it runs from a signal handler, and a handler that
 * awaited would be racing whatever else on the signal is calling `process.exit`.
 * Clearing the interval is the whole of what has to happen before the process
 * goes — see the header on what stopping does and does not promise.
 */
export function stopPollerHost(): boolean {
  const g = hostGlobal();
  const handle = g.__oriantPollerHost;
  if (!handle) return false;
  handle.poller.stop();
  g.__oriantPollerHost = undefined;
  return true;
}

/**
 * `once` rather than `on`, so a second Ctrl-C is handled by whoever else is
 * listening — including Node's own default, if a bare custom server left the
 * poller as the only listener. A stopped poller has nothing left to say about
 * the signal, and a handler that stayed registered would be quietly holding the
 * process's shutdown open on a daemon that already went.
 */
function installShutdownHandlers(): void {
  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, () => {
      if (stopPollerHost()) {
        say(
          `${signal} — stopped. No further pass will start; a pass already under way is ` +
            `neither interrupted nor waited for.`,
        );
      }
    });
  }
}

/* ═══════════════════════════ Starting ═══════════════════════════ */

/**
 * Compose the worker's dependencies from the server's one runtime session.
 *
 * Deliberately the same four fields `/api/runtime/scheduler` passes, and
 * deliberately the same session object: a poller with its own stores would be a
 * second workforce sharing a schedule with the first, claiming jobs the routes
 * cannot see and writing runs the Workspace would never read.
 *
 * ASYNC BECAUSE THE PLAN IS NOW READ, NOT HELD. This used to take
 * `session.plan`, a construction-time constant that was always the BrightPath
 * fixture — so an unattended poller on a runtime with a real ingested plan
 * polled the DEMO's `planId` (`runDueWork` filters triggers by `deps.plan.planId`)
 * and found nothing due, forever, silently. `currentPlan()` is what the owner
 * actually intends, and it costs an await.
 *
 * `executorFor(plan)` rather than `session.executor` for the same reason the
 * scheduler route does it: `session.executor` carries the SEED plan's
 * `globalPolicy`, so running this plan's work under it would leave a capability
 * THIS owner forbade unforbidden. The plan handed to the worker and the policy
 * enforced on it are the same object here, which is the only arrangement in
 * which the two cannot disagree.
 *
 * RESOLVED EVERY PASS, NOT ONCE AT STARTUP. `startPoller` accepts a resolver for
 * exactly this: a daemon that captured its plan at boot goes on serving the
 * previous workforce until the process restarts, and an unattended poller is the
 * last place anyone would notice. `null` from the resolver is a quiet tick.
 *
 * AND IT IS THE DEPLOYED PLAN, NOT THE CURRENT ONE. A plan becomes current the
 * moment it VALIDATES — before it is built, before the sandbox has proved
 * anything, before a single gate has passed. A poller reading `currentPlan()`
 * would pick up a revision whose pass then failed at `prove`, and start running
 * an unproved workforce that nobody ever activated, unattended, on a timer.
 * `deployedPlan()` is what actually went live; null means nothing has.
 */
async function resolveDeps(): Promise<WorkerDeps | null> {
  const session = getRuntimeSession();
  const plan = await session.deployedPlan();
  if (plan === null) return null;
  return {
    plan,
    scheduler: session.scheduler,
    // `executorFor(plan)` rather than `session.executor`: the latter carries the
    // SEED plan's globalPolicy, so this plan's work would run under the
    // fixture's org-wide denies and quiet window. Same object as `plan` above,
    // which is the only arrangement in which the two cannot disagree.
    executor: session.executorFor(plan),
    build: session.build,
  };
}

async function compose(): Promise<{ session: RuntimeSession; deps: WorkerDepsResolver }> {
  return { session: getRuntimeSession(), deps: resolveDeps };
}

/**
 * Start the process's one poller, or explain why not.
 *
 * Never throws — see the header. Every failure it can have becomes an outcome
 * plus a line on stderr, because the caller is a Next `register()` hook and an
 * exception there is a server that does not boot.
 *
 * `env` is a parameter rather than a read of `process.env`, so the decision this
 * function makes can be exercised without one.
 *
 * ASYNC ONLY BECAUSE `compose()` IS. The two early returns above it — already
 * running, and the switch being off — still settle without touching a store, so
 * the default path of a server that never turns the poller on remains a couple
 * of string comparisons and no I/O.
 */
export async function startPollerHost(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<PollerHostStatus> {
  const g = hostGlobal();
  const existing = g.__oriantPollerHost;
  if (existing) {
    // Not an error and not worth a line. Next's dev server re-runs this on hot
    // reload, and a warning per save would train the reader to skim.
    return {
      outcome: "already-running",
      reason: `A poller is already running in this process, one pass every ${existing.intervalMs}ms.`,
      intervalMs: existing.intervalMs,
    };
  }

  const config = readPollerConfig(env);
  if (config.decision === "off") {
    return { outcome: "off", reason: config.reason, intervalMs: null };
  }
  if (config.decision === "refuse") {
    complain(config.reason);
    return { outcome: "refused", reason: config.reason, intervalMs: null };
  }

  let session: RuntimeSession;
  // A resolver, not a fixed set: re-asked every pass so the daemon follows what
  // is actually deployed. See `resolveDeps`.
  let deps: WorkerDepsResolver;
  let startedAt: string;
  try {
    ({ session, deps } = await compose());
    // The session's own clock, not wall time: this is runtime library code, and
    // the injected clock is the only instant it is allowed to know.
    // The session's clock rather than `deps`', now that deps are resolved per
    // pass and there may be no deployment to resolve yet. Same clock either way
    // — `resolveDeps` hands the worker `session.scheduler` verbatim.
    startedAt = session.scheduler.clock.now().toISOString();
  } catch (error) {
    const reason =
      `${POLLER_SWITCH_ENV} is on, but the runtime session could not be composed, so the ` +
      `poller has NOT started and no schedule will fire on its own: ${messageOf(error)}`;
    complain(reason);
    return { outcome: "unavailable", reason, intervalMs: null };
  }

  const poller = startPoller(deps, {
    intervalMs: config.intervalMs,
    onPass: reportPass,
    onError: (error: unknown) => {
      // A pass that throws outright is rare — `runDueWork` settles a failing job
      // rather than propagating it — so this is the store or the clock, and the
      // next pass will hit the same thing. Reported every time rather than
      // deduplicated: a repeated line is how "still broken" looks.
      complain(`a scheduler pass failed: ${messageOf(error)}`);
    },
  });

  g.__oriantPollerHost = { poller, intervalMs: config.intervalMs };
  installShutdownHandlers();

  const reason =
    `started at ${startedAt} — one pass every ${config.intervalMs}ms, ${session.mode} mode, ` +
    `${session.storage} storage${session.dataDir === null ? "" : ` (${session.dataDir})`}. ` +
    `The first pass is one interval from now, not now.`;
  say(reason);

  return { outcome: "started", reason, intervalMs: config.intervalMs };
}
