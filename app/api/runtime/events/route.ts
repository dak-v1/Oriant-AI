/**
 * app/api/runtime/events/route.ts — the change signal the live screens listen to
 * (ROLE_C_PLAN M7, "background runs push to Workspace/Approvals without a
 * refresh").
 *
 *   GET   text/event-stream, held open until the client goes away
 *
 * IT PUSHES A SIGNAL, NOT A PAYLOAD, and that is the decision everything else
 * here follows from. A frame says `{ revision, topics }` and nothing more; the
 * screen that cares refetches its OWN endpoint. Pushing state down this pipe
 * would mean re-serialising what nine routes already serialise, in a second
 * shape, maintained by a second author — and then every screen would have two
 * sources for the same fact and no rule for which wins when they disagree. A
 * signal cannot drift from the thing it describes, because it does not describe
 * it: it only says that it moved.
 *
 * IT OBSERVES THE STORES; NOTHING ANNOUNCES ITSELF. The obvious design is for the
 * executor, the worker and the approvals route to publish as they write. It was
 * rejected for one reason: an announcement somebody forgets to add is a screen
 * that silently stops updating, and silence is indistinguishable from calm. A
 * poll of cheap store reads, diffed into a revision, cannot be forgotten by a
 * future writer — a write that lands in a store is a write this route notices,
 * whether or not its author had ever heard of this file.
 *
 * WHAT THAT COSTS, SAID PLAINLY. One pass reads every run, every pending
 * approval, every trigger, every job, every agent record and the active
 * deployment. Under the file store that is a directory walk per table plus a read
 * per record, and it is the same work the Workspace already does on every
 * refresh. What makes it affordable is that it happens ONCE PER PROCESS rather
 * than once per screen, only while at least one client is connected, and only on
 * a configurable interval that defaults conservatively. Five tabs on five screens
 * cost one pass, not five.
 *
 * THE REVISION IS A COMPARAND, NOT A LOG. There are no `id:` lines in this
 * stream, deliberately: an id makes a browser send `Last-Event-ID` on reconnect,
 * which is a promise to replay, and this route cannot replay because it never
 * held a history. So the reconnect story is written down instead of implied. On
 * connect the client is handed `{ epoch, revision }`; if either differs from what
 * it held, it missed something and MUST REFETCH, because the signal cannot say
 * what it missed. `epoch` exists for the restart case — a fresh process starts
 * counting at zero, and without it a client holding revision 7 would read a
 * genuine zero as "nothing new". Two server processes behind one address differ
 * in epoch too, so a client that lands on the other one refetches rather than
 * trusting a counter that was never about it.
 *
 * ONE TIMER PER PROCESS, NOT ONE PER CONNECTION. `RuntimeObserver` is cached on
 * `globalThis` exactly as the runtime session and the poller host are, and for
 * the sharper of their two reasons: a browser reconnects on its own, and a timer
 * allocated per connection would accumulate one per reconnect — invisibly, until
 * an afternoon of flaky wifi has a hundred of them reading the run store. The
 * interval starts when the first subscriber arrives and is cleared when the last
 * one leaves, so an idle server polls nothing at all. Each tick serialises one
 * frame and hands the same string to every subscriber.
 *
 * AN EMPTY RUNTIME IS A VALID STREAM. No plan activated, no runs, no approvals:
 * every fingerprint is the digest of an empty list, nothing ever differs, and the
 * client sits on a quiet connection which is the honest report. Refusing to open
 * would make "nothing has happened yet" look like "realtime is broken".
 *
 * A RUNTIME THAT CANNOT BE OBSERVED IS A STREAM THAT SAYS SO, IN BAND. When
 * configuration is unreadable or the session cannot be composed, this route still
 * answers 200 and still opens a stream — because `EventSource` gives the browser
 * no access to the body of a non-2xx response, so a 500 here would reach the
 * owner as the word "error" and nothing else. Instead the stream opens, says
 * exactly what is wrong in `hello.stalled`, sets `observing: false`, and closes.
 * The hook reads that sentence, degrades to a slow poll, and puts the sentence on
 * screen. A stale screen that knows it is stale is the whole point of M7; a
 * status code nobody can read is not.
 *
 * HEARTBEATS ARE COMMENTS, AND THEY EXIST FOR THE MIDDLEBOXES. Proxies and load
 * balancers close connections that go quiet, and a correctly quiet runtime is
 * exactly the case that would trip them. A `:` comment every 20 seconds keeps
 * bytes moving without adding a frame the client has to interpret. The observer's
 * tick is therefore `min(interval, heartbeat)`: one timer still, doing two jobs,
 * so a long observation interval cannot starve the keep-alive.
 *
 * WHERE THIS DOES NOT WORK, so nobody discovers it in production: a serverless
 * platform that caps a function's duration will cut the stream at the cap. That
 * is survivable rather than fatal — the browser reconnects, `hello` carries the
 * current revision, and the epoch/revision comparison turns a cut connection into
 * one refetch — but on such a platform this is a reconnect loop with a long
 * period, not a held socket, and the screens must (and do) still work with no
 * stream at all.
 *
 * NOTHING BUT THE ROUTE'S OWN EXPORTS LEAVES THIS FILE, and that is a constraint
 * rather than a preference: Next type-checks a route module against a closed set
 * of allowed exports, so a helper exported from here fails `next build` with an
 * error about an index signature that names no cause. The observation machinery
 * is therefore module-private, which costs it the one thing it would otherwise
 * have — a seam a verifier could call directly. What it has instead is the same
 * seam `verify:m6` already uses for the runtime session: the observer is cached
 * on `globalThis.__oriantRuntimeObserver`, and dropping that handle (after
 * `observer.dispose()`, so its interval goes with it) is how a test starts from a
 * clean counter. If this ever needs a real API, the honest fix is a module under
 * lib/runtime that this route is a thin door onto — not an export here.
 *
 * Determinism: this is route code, so wall time is allowed here in a way it is
 * not under lib/runtime — and this file is doubly clear of that rule, because it
 * writes to no store, stamps no record, and generates no id. Every instant it
 * emits is display metadata about the connection itself.
 *
 * Unauthenticated on purpose for now, exactly as every other /api/runtime route
 * is. That must be gated before any deployment — this one is a long-lived
 * connection that reveals, by its timing alone, when a business's agents are
 * working.
 */

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { RuntimeSession } from "@/lib/runtime/session";
import { getRuntimeSession } from "@/lib/runtime/session";

export const dynamic = "force-dynamic";

/* ═══════════════════════════ The vocabulary ═══════════════════════════ */

/**
 * The closed set of things a screen can care about.
 *
 * Five, and each one is a different question an owner asks, which is why they are
 * not one topic: the Approvals inbox must wake for a decision that appeared and
 * must NOT redraw because a cron advanced its `nextFireAt`, and the calendar is
 * the exact opposite. A sixth topic is a deliberate act — add it here, give it a
 * fingerprint below, and the hook's own list stops compiling until it is taught
 * the word.
 */
export type RuntimeTopic =
  | "runs"
  | "approvals"
  | "schedule"
  | "agents"
  | "deployment";

const TOPICS = Object.keys({
  runs: true,
  approvals: true,
  schedule: true,
  agents: true,
  deployment: true,
} satisfies Record<RuntimeTopic, true>) as RuntimeTopic[];

/* ═══════════════════════════ Configuration ═══════════════════════════ */

/** How long between store observations. Blank means the default below. */
const EVENTS_INTERVAL_ENV = "ORIANT_EVENTS_INTERVAL_MS";

/**
 * Fast enough that an approval raised by an unattended run reaches the inbox
 * while the owner is still looking at it, and five times better than the 15s
 * timer the inbox used before this route existed. Slower than a second, because
 * a pass is a walk of the whole run store and nobody is watching a millisecond.
 */
const DEFAULT_OBSERVE_INTERVAL_MS = 3_000;

/**
 * Below this a pass is a busy loop against a filesystem, and a value this small
 * is far more likely to be a unit mix-up than an intention — the same reasoning,
 * and the same refusal rather than a clamp, as `MIN_POLL_INTERVAL_MS` in
 * lib/runtime/schedule/poller-host.ts.
 */
const MIN_OBSERVE_INTERVAL_MS = 500;

/**
 * Past five minutes the word "realtime" is not true and the client's own fallback
 * poll would serve the owner better. Refused rather than accepted, so nobody
 * configures a stream that quietly does less than the timer it replaced.
 */
const MAX_OBSERVE_INTERVAL_MS = 300_000;

/** Bytes on the wire at least this often, so an idle stream is not culled. */
const HEARTBEAT_MS = 20_000;

/** What the browser waits before reconnecting after the stream drops. */
const RETRY_MS = 3_000;

/**
 * The same, for a stream that opened only to explain that it cannot observe
 * anything. A client of ours closes and stops asking; `curl` and anything else
 * naive backs off to a minute rather than reopening every three seconds.
 */
const REFUSED_RETRY_MS = 60_000;

type EventsConfig =
  | { decision: "observe"; intervalMs: number }
  /** Something this build cannot read. Loud, and no stream is derived. */
  | { decision: "refuse"; reason: string };

/**
 * Pure, and takes the environment rather than reading it, so the decision can be
 * argued with directly instead of through a server restart.
 */
function readEventsConfig(
  env: Readonly<Record<string, string | undefined>>,
): EventsConfig {
  const raw = (env[EVENTS_INTERVAL_ENV] ?? "").trim();
  if (raw === "") return { decision: "observe", intervalMs: DEFAULT_OBSERVE_INTERVAL_MS };

  // Digits only. `Number()` reads "3s" as NaN, "3e3" as 3000 and " -1 " as -1,
  // and every one of those is a different person's typo rather than a value to
  // salvage.
  if (!/^\d+$/.test(raw)) {
    return {
      decision: "refuse",
      reason:
        `${EVENTS_INTERVAL_ENV} is "${raw}"; it must be a whole number of milliseconds, ` +
        `e.g. ${DEFAULT_OBSERVE_INTERVAL_MS}. No change signal is being derived, so screens ` +
        `will fall back to refreshing themselves on a timer.`,
    };
  }

  const intervalMs = Number(raw);
  if (intervalMs < MIN_OBSERVE_INTERVAL_MS) {
    return {
      decision: "refuse",
      reason:
        `${EVENTS_INTERVAL_ENV} is ${intervalMs}ms, below the ${MIN_OBSERVE_INTERVAL_MS}ms ` +
        `floor this route accepts — each pass reads the whole run store, so anything faster ` +
        `is only busier. No change signal is being derived. If seconds were meant, ` +
        `${intervalMs * 1000} is the value.`,
    };
  }
  if (intervalMs > MAX_OBSERVE_INTERVAL_MS) {
    return {
      decision: "refuse",
      reason:
        `${EVENTS_INTERVAL_ENV} is ${intervalMs}ms, above the ${MAX_OBSERVE_INTERVAL_MS}ms ` +
        `ceiling this route accepts. A push slower than that is not realtime and a screen's ` +
        `own fallback timer would serve the owner better. No change signal is being derived.`,
    };
  }

  return { decision: "observe", intervalMs };
}

/* ═══════════════════════════ Fingerprints ═══════════════════════════ */

type Snapshot = Record<RuntimeTopic, string>;

/**
 * A bounded stand-in for "the state of this topic".
 *
 * SORTED BEFORE HASHING, so a store that returns the same records in a different
 * order is not reported as a change. Two of the three store implementations
 * promise a total order already; depending on that promise here would make a
 * future store's ordering a source of phantom refetches on every screen.
 *
 * Truncated to 16 hex characters: this is compared against the previous value in
 * the same process microseconds later, never stored, never transmitted, and never
 * relied on to resist an adversary.
 *
 * The separator is not decoration. Without one, ["ab", "c"] and ["a", "bc"] hash
 * alike, and a run id that happened to end where the next field began would be a
 * change nobody was ever told about. A newline cannot occur inside any part —
 * every one of them is ids, enum words, integers and ISO instants.
 */
function digest(parts: string[]): string {
  const hash = createHash("sha256");
  for (const part of [...parts].sort()) {
    hash.update(part);
    hash.update("\n");
  }
  return hash.digest("hex").slice(0, 16);
}

/**
 * One read of everything the five topics are about.
 *
 * WHAT IS FINGERPRINTED IS WHAT CAN PUSH, and the converse is the part worth
 * stating: the passage of time is NOT a store change and does not push. An
 * approval crossing its `escalateAfterMins` boundary while nobody writes anything
 * produces no frame — the deadline is derived from `now` by whoever renders it,
 * so a screen showing a countdown must run its own clock. This route reports that
 * the runtime moved, not that the world did.
 */
async function readSnapshot(session: RuntimeSession): Promise<Snapshot> {
  // The deployment topic is scoped to a plan, and it has to be the plan the owner
  // currently intends rather than the construction-time seed. Read off the seed,
  // this asked "is the BRIGHTPATH fixture deployed?" on every runtime — so on one
  // where a real plan had been ingested the answer was a constant, and a go-live
  // was a change no screen was ever told about. A read that throws propagates and
  // becomes a `stalled` frame, which is the honest report.
  const plan = await session.currentPlan();

  const [runs, approvals, triggers, jobs, states, deployment] = await Promise.all([
    session.runStore.listRuns(),
    session.runStore.listPendingApprovals(),
    session.schedulerStore.listTriggers(),
    session.schedulerStore.listJobs(),
    session.schedulerStore.listAgentStates(),
    session.schedulerStore.getActiveDeployment(plan.planId),
  ]);

  return {
    // `cursor` and the event count are what moves while a run is in flight; the
    // status alone would leave a long `running` run looking frozen on the feed.
    runs: digest(
      runs.map(
        (run) =>
          `${run.runId}|${run.status}|${run.cursor}|${run.events.length}|` +
          `${run.endedAt ?? ""}|${run.pendingApprovalId ?? ""}`,
      ),
    ),
    // Ids alone: an `ApprovalRequest` is frozen at creation, so the only things
    // that can happen to it are appearing and — once a decision is written —
    // leaving the pending set. Both change this set.
    approvals: digest(approvals.map((request) => request.approvalId)),
    // Triggers and jobs together, because "when does it next run" and "is it
    // queued right now" are one question on every screen that asks either.
    schedule: digest([
      ...triggers.map(
        (trigger) =>
          `t|${trigger.triggerId}|${trigger.enabled}|${trigger.nextFireAt ?? ""}|` +
          `${trigger.lastFiredAt ?? ""}`,
      ),
      ...jobs.map(
        (job) =>
          `j|${job.jobId}|${job.status}|${job.attempt}|${job.runAfter}|${job.runId ?? ""}`,
      ),
    ]),
    agents: digest(
      states.map(
        (record) =>
          `${record.agentId}|${record.state}|${record.agentVersion}|${record.updatedAt}`,
      ),
    ),
    deployment: digest(
      deployment === null
        ? ["none"]
        : [
            deployment.deploymentId,
            String(deployment.planVersion),
            deployment.activatedAt,
          ],
    ),
  };
}

/* ═══════════════════════════ Frames ═══════════════════════════ */

interface SignalPayload {
  epoch: string;
  revision: number;
  /** The topics that differed on this pass. Empty on a state report. */
  topics: RuntimeTopic[];
  at: string;
  /** Non-null when the runtime could not be read; the reason, verbatim. */
  stalled: string | null;
}

interface HelloPayload extends SignalPayload {
  /** False when nothing is being observed; the stream closes after this frame. */
  observing: boolean;
  /** Every topic this build can report, so a client can check its own list. */
  vocabulary: RuntimeTopic[];
  /** Null when nothing is being observed. */
  intervalMs: number | null;
  heartbeatMs: number;
  mode: string | null;
  storage: string | null;
  /** One sentence, safe to put in front of an owner. Never empty. */
  detail: string;
}

/**
 * `JSON.stringify` can never emit a raw newline, so one `data:` line always holds
 * one whole frame and no client has to reassemble anything.
 */
function frame(event: string, data: SignalPayload | HelloPayload): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function comment(text: string): string {
  return `: ${text}\n\n`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/* ═══════════════════════════ The observer ═══════════════════════════ */

type Sink = (text: string) => void;

/**
 * One poll, many listeners, one revision counter — see the module header for why
 * each of those three is singular.
 */
class RuntimeObserver {
  /** Identifies THIS counter. A client that sees a new one has missed everything. */
  readonly epoch: string;
  readonly intervalMs: number;
  /** `min(interval, heartbeat)`: one timer, two jobs. */
  private readonly tickMs: number;

  private readonly sinks = new Set<Sink>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private snapshot: Snapshot | null = null;
  private revision = 0;
  private stalled: string | null = null;
  private inFlight: Promise<void> | null = null;
  private lastObservedMs = 0;
  private lastWriteMs = 0;
  /** Retained only so `hello` can name the mode and storage it is watching. */
  private session: RuntimeSession | null = null;

  constructor(intervalMs: number, epoch: string) {
    this.intervalMs = intervalMs;
    this.tickMs = Math.min(intervalMs, HEARTBEAT_MS);
    this.epoch = epoch;
  }

  /**
   * Observe once, now, without waiting for a tick.
   *
   * Called before every `hello` so the revision a client is handed is current
   * rather than up to one interval old — which matters precisely on the reconnect
   * path, where that number is the whole basis for deciding whether anything was
   * missed. Concurrent connections share one pass.
   */
  async prime(): Promise<void> {
    await this.observe();
  }

  hello(observing: boolean, detail: string): HelloPayload {
    return {
      epoch: this.epoch,
      revision: this.revision,
      topics: [],
      at: new Date().toISOString(),
      stalled: this.stalled,
      observing,
      vocabulary: [...TOPICS],
      intervalMs: this.intervalMs,
      heartbeatMs: HEARTBEAT_MS,
      mode: this.session?.mode ?? null,
      storage: this.session?.storage ?? null,
      detail,
    };
  }

  /**
   * Adds a listener and returns its release.
   *
   * The release is idempotent because it is called from two places that can both
   * fire for one disconnect — the request's abort signal and the stream's own
   * `cancel` — and a double release would drop the interval while other clients
   * were still listening.
   */
  subscribe(sink: Sink): () => void {
    this.sinks.add(sink);
    this.start();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.sinks.delete(sink);
      if (this.sinks.size === 0) this.stop();
    };
  }

  /** Stops the interval regardless of listeners. For tests and hot reload. */
  dispose(): void {
    this.sinks.clear();
    this.stop();
  }

  private start(): void {
    if (this.timer !== null) return;
    // Counted from now, so the first heartbeat is a full interval away rather
    // than immediate on a process that has been idle for an hour.
    this.lastWriteMs = Date.now();
    this.timer = setInterval(() => {
      this.tick();
    }, this.tickMs);
  }

  private stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const now = Date.now();
    if (now - this.lastObservedMs >= this.intervalMs) void this.observe();
    if (now - this.lastWriteMs >= HEARTBEAT_MS) {
      this.publish(comment(`heartbeat ${new Date().toISOString()}`));
    }
  }

  /** Never rejects; a failed pass becomes a `stalled` frame. */
  private observe(): Promise<void> {
    if (this.inFlight !== null) return this.inFlight;
    const work = this.observeOnce().finally(() => {
      this.inFlight = null;
    });
    this.inFlight = work;
    return work;
  }

  private async observeOnce(): Promise<void> {
    this.lastObservedMs = Date.now();

    let next: Snapshot;
    try {
      this.session = getRuntimeSession();
      next = await readSnapshot(this.session);
    } catch (error) {
      const reason =
        `The runtime could not be read, so this stream cannot currently notice a change: ` +
        `${messageOf(error)}`;
      // Announced on the transition only. A store that is broken stays broken,
      // and a frame per tick would turn one fault into a stream of them.
      if (this.stalled !== reason) {
        this.stalled = reason;
        this.publish(frame("signal", this.signal([])));
      }
      return;
    }

    const previous = this.snapshot;
    this.snapshot = next;
    const recovered = this.stalled !== null;
    this.stalled = null;

    // The first pass establishes the baseline. Announcing every topic as changed
    // because nothing was known before would make one client's connection look,
    // to every other client, like the whole runtime moving.
    const changed =
      previous === null ? [] : TOPICS.filter((topic) => previous[topic] !== next[topic]);

    if (changed.length > 0) this.revision += 1;
    if (changed.length === 0 && !recovered) return;
    this.publish(frame("signal", this.signal(changed)));
  }

  private signal(topics: RuntimeTopic[]): SignalPayload {
    return {
      epoch: this.epoch,
      revision: this.revision,
      topics,
      at: new Date().toISOString(),
      stalled: this.stalled,
    };
  }

  /**
   * One serialisation, handed to every listener.
   *
   * A sink that throws has already lost its connection and is about to release
   * itself; it must not stop the listeners after it in the set from being told.
   */
  private publish(text: string): void {
    this.lastWriteMs = Date.now();
    for (const sink of this.sinks) {
      try {
        sink(text);
      } catch {
        /* the sink's own writer handles this; see `send` in GET */
      }
    }
  }
}

/* ═══════════════════════ The one per process ═══════════════════════ */

type ObserverHandle =
  | { observing: true; observer: RuntimeObserver }
  /** Configuration this build could not read. See `readEventsConfig`. */
  | { observing: false; reason: string };

interface ObserverGlobal {
  __oriantRuntimeObserver?: ObserverHandle;
}

function observerGlobal(): ObserverGlobal {
  return globalThis as unknown as ObserverGlobal;
}

/**
 * Cached on `globalThis` rather than in module scope, exactly as
 * `getRuntimeSession()` and `startPollerHost()` are: Next re-evaluates modules on
 * hot reload while `globalThis` survives, and a module-scoped cache would leave
 * one orphaned interval per save.
 *
 * The environment is read once, here. Changing `ORIANT_EVENTS_INTERVAL_MS` needs
 * a restart, which is the same contract every other switch in this runtime has.
 */
function getObserver(env: Readonly<Record<string, string | undefined>> = process.env): ObserverHandle {
  const g = observerGlobal();
  const existing = g.__oriantRuntimeObserver;
  if (existing) return existing;

  const config = readEventsConfig(env);
  const handle: ObserverHandle =
    config.decision === "refuse"
      ? { observing: false, reason: config.reason }
      : {
          observing: true,
          // The instant is the epoch: readable in a `curl`, different after every
          // restart, and derived rather than generated — there is no id factory
          // in a route and inventing a random one here would be a second source
          // of identity for something that only needs to differ.
          observer: new RuntimeObserver(config.intervalMs, new Date().toISOString()),
        };

  g.__oriantRuntimeObserver = handle;
  return handle;
}

/* There is deliberately no exported `reset` beside this. See the module header:
   a route file may export only the route's own names, so the reset a caller wants
   is `observerGlobal().__oriantRuntimeObserver?.observer?.dispose()` followed by
   dropping the handle — the same `globalThis` seam verify:m6 already uses to
   install a deterministic session. */

/* ═══════════════════════════ The handler ═══════════════════════════ */

const CONNECTED_DETAIL =
  "Connected. Each frame names the topics that changed; refetch the endpoint your " +
  "screen already reads. Nothing is replayed on reconnect — compare epoch and " +
  "revision, and refetch if either moved.";

export async function GET(request: Request) {
  /* ── The query ──
     Refused rather than ignored, and there is deliberately no topic filter to
     accept: the signal is identical for every listener, so a per-caller filter
     would put the topic vocabulary in two places and let a screen quietly
     subscribe to a word this build does not emit. Filtering is the client's job
     and it already has the list. */
  const unknown = [...new URL(request.url).searchParams.keys()];
  if (unknown.length > 0) {
    return NextResponse.json(
      {
        error:
          `This endpoint does not accept ${unknown.map((key) => `"${key}"`).join(", ")}, or ` +
          `any other parameter. Every listener gets the same change signal and filters it ` +
          `by topic on the client; a server-side filter would be a second place the topic ` +
          `list is written down.`,
      },
      { status: 400 },
    );
  }

  const handle = getObserver();
  const encoder = new TextEncoder();

  let closed = false;
  let release: (() => void) | null = null;
  /* Reassigned inside `start`, where the controller exists. Declared out here
     because `cancel` and the abort listener both have to reach it. */
  let shutdown = (): void => {
    closed = true;
  };
  const onAbort = (): void => shutdown();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (text: string): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // The client vanished between the last check and this write. That is
          // how every one of these connections ends; it is not a fault.
          shutdown();
        }
      };

      shutdown = (): void => {
        if (closed) return;
        closed = true;
        request.signal.removeEventListener("abort", onAbort);
        release?.();
        release = null;
        try {
          controller.close();
        } catch {
          /* already closed by the platform */
        }
      };

      // A client that disconnected while the route was still assembling never
      // reaches the listener set at all.
      if (request.signal.aborted) {
        shutdown();
        return;
      }
      request.signal.addEventListener("abort", onAbort, { once: true });

      if (!handle.observing) {
        send(`retry: ${REFUSED_RETRY_MS}\n\n`);
        send(
          frame("hello", {
            epoch: "none",
            revision: 0,
            topics: [],
            at: new Date().toISOString(),
            stalled: handle.reason,
            observing: false,
            vocabulary: [...TOPICS],
            intervalMs: null,
            heartbeatMs: HEARTBEAT_MS,
            mode: null,
            storage: null,
            detail:
              "No change signal is being derived, so this stream would never say anything. " +
              "It is closing rather than sitting open and looking healthy; refresh your " +
              "screen on a timer instead.",
          }),
        );
        shutdown();
        return;
      }

      send(`retry: ${RETRY_MS}\n\n`);

      const observer = handle.observer;
      // One read before `hello`, so the revision handed over is current. See
      // `prime` for why that matters on a reconnect specifically.
      await observer.prime();
      if (closed) return;

      send(frame("hello", observer.hello(true, CONNECTED_DETAIL)));
      if (closed) return;

      release = observer.subscribe(send);
    },

    // Fires when the consumer lets go without an abort — a second path to the
    // same release, which is why the release is idempotent.
    cancel() {
      shutdown();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      // `no-transform` matters as much as `no-store` here: a proxy that gzips or
      // rewrites this body buffers it, and a buffered event stream is a stream
      // that arrives all at once at the end.
      "cache-control": "no-store, no-transform",
      // nginx's opt-out from response buffering. Harmless everywhere else.
      "x-accel-buffering": "no",
      // `connection: keep-alive` is deliberately NOT set: it is hop-by-hop and
      // forbidden under HTTP/2, where it makes a request malformed rather than
      // persistent.
    },
  });
}
