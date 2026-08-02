"use client";
/**
 * components/live/workspace/LiveWorkspace.tsx — the Operate overview, over the
 * real runtime (ROLE_C_PLAN M5, hardened in M7).
 *
 * This is the far end of M5's exit criterion. A scheduled run fires, the agent
 * pauses, an approval appears, the owner edits and approves it in the inbox, the
 * run resumes and completes — and this screen is the "and the Workspace reflects
 * it". Everything on it is read from /api/runtime/{scheduler,approvals,run};
 * nothing is fixtured, and the scripted demo lane it sits beside is reached by
 * the same route with the switch off.
 *
 * THE PAGE IS ASSEMBLED FROM TWO DIFFERENT KINDS OF FACT, and keeping them
 * distinct is most of the design. The PLAN arrives as props, rendered on the
 * server from `getRuntimeSession().plan`: outcomes, agent names, workflow names,
 * the timezone the business day is measured in. The RUNTIME arrives over fetch:
 * triggers, jobs, approvals, runs. The plan cannot fail to load and never
 * changes between refreshes; the runtime can do both. Mixing them would mean a
 * single failed request blanking the outcome targets, which are known perfectly
 * well without it.
 *
 * THREE SOURCES, THREE FAILURE STATES, NEVER A SHARED ZERO. Each endpoint keeps
 * its own `Loaded`, and a tile whose source did not answer shows a dash and says
 * which source, rather than a nought. This matters more here than anywhere else
 * on the page: zero approvals waiting and zero problems is also exactly what a
 * healthy workspace looks like, so a failure rendered as zero is a failure
 * rendered as good news. The "at risk" tile needs all three and is withheld
 * unless it has all three, for the same reason.
 *
 * ── What M7 changed, and why each change is not decoration ──
 *
 * REALTIME, WITHOUT DEPENDING ON IT. `useRuntimeEvents` subscribes to all five
 * topics — this screen is a view over every one of them — and a signal schedules
 * a refetch. The mount load, the visibility listener and the Refresh button all
 * stay exactly as they were: if the stream never opens, this page behaves as it
 * did in M5, one interval slower than the hook's own fallback timer and saying
 * so in writing. Nothing on the page is derived from the stream; the stream only
 * decides WHEN to re-ask the endpoints the screen already reads.
 *
 * SIGNALS ARE COALESCED, VISIBILITY INCLUDED. One refresh is three requests, and
 * a run in flight moves runs, schedule and approvals within the same observation
 * pass — plus a tab return can arrive alongside the reconnect that follows it.
 * `scheduleRefresh` collapses everything inside a short window into ONE refetch.
 * The manual button is deliberately not coalesced: a person who presses Refresh
 * is asking for it now.
 *
 * A BACKGROUND REFRESH THAT FAILS KEEPS THE LAST GOOD NUMBERS. Before the stream
 * existed a refresh happened when a human asked for one, so replacing the data
 * with the failure was the whole answer. Now it happens by itself every few
 * seconds, and one transient failure would blank a dashboard nobody touched —
 * then fill it again — which teaches an owner that dashes mean nothing. So a
 * background failure keeps what the runtime last confirmed, says so in a banner
 * naming the source and the error, and the server-time stamp stops advancing
 * because it is read from the data being kept. A FIRST load and a MANUAL refresh
 * still report the failure directly: nothing is ever kept that was never good.
 *
 * LOADING IS NOT EMPTY AND IS NOT FAILURE. Every panel now distinguishes three
 * states — see `ui.tsx` and `statTiles`. The tiles in particular used to print
 * "The scheduler did not answer" for the first second of every page load, which
 * was a report of four failures that had not happened yet.
 *
 * WHAT IS DELIBERATELY ABSENT. There is no "Ask Oriant" command bar and no
 * notifications drawer. Both are listed in M5, and both would be shells here —
 * routing a command by `Capability.id` needs a dispatcher that does not exist,
 * and a notifications drawer needs a notification store. A command bar that
 * accepts a sentence and does nothing with it is worse than no command bar,
 * because it is the one control on the page that promises the product can be
 * driven by asking.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, LayoutGrid, RefreshCw } from "lucide-react";
import { RUNTIME_TOPICS, useRuntimeEvents } from "@/components/live/useRuntimeEvents";
import type { WorkspacePlanFacts } from "./plan-facts";
import {
  atRiskItems,
  createDirectory,
  createZone,
  looksActivated,
  statTiles,
  upcomingRuns,
} from "./read-model";
import type { StatTile } from "./read-model";
import { loadApprovals, loadRuns, loadScheduler } from "./runtime-api";
import type {
  ApprovalsSnapshot,
  Loaded,
  RunsSnapshot,
  SchedulerSnapshot,
} from "./runtime-api";
import { readStream } from "./stream-status";
import ActivationNotice from "./ActivationNotice";
import ActivityFeed from "./ActivityFeed";
import ApprovalsPreview from "./ApprovalsPreview";
import AttentionPanel from "./AttentionPanel";
import OutcomeProgress from "./OutcomeProgress";
import SchedulePanel from "./SchedulePanel";
import styles from "./live-workspace.module.css";

/**
 * How long several change signals are allowed to pile up before one refetch.
 *
 * Short enough that a decision made in the inbox is reflected here before the
 * owner has finished switching tabs, long enough that the reconnect + `hello` +
 * first signal burst that follows a tab return is one refetch and not three.
 */
const COALESCE_MS = 400;

const TONE_CLASS = {
  live: styles.streamLive,
  waiting: styles.streamWaiting,
  degraded: styles.streamDegraded,
} as const;

/** What each `Loaded` is CALLED on screen, in the owner's language. */
const SOURCE_NAMES = {
  scheduler: "the schedule",
  approvals: "the approvals queue",
  runs: "your recent activity",
} as const;

/** The three runtime reads this screen is assembled from, as one value. */
interface Sources {
  scheduler: Loaded<SchedulerSnapshot>;
  approvals: Loaded<ApprovalsSnapshot>;
  runs: Loaded<RunsSnapshot>;
}

const NOTHING_READ: Sources = {
  scheduler: { data: null, error: null },
  approvals: { data: null, error: null },
  runs: { data: null, error: null },
};

/** What is on screen from an earlier read, and why the newest one did not replace it. */
interface StaleRead {
  sources: string[];
  message: string;
}

/**
 * What to keep when a read comes back.
 *
 * `data: null, error: null` is `load`'s report of an ABORT — nothing was learned,
 * so nothing is written. Otherwise a background failure keeps the last good read
 * and a first or manual one reports the failure. See the module header.
 */
function settle<T>(previous: Loaded<T>, next: Loaded<T>, background: boolean): Loaded<T> {
  if (next.data !== null) return next;
  if (next.error === null) return previous;
  if (!background || previous.data === null) return next;
  return previous;
}

export default function LiveWorkspace({
  plan,
  live,
}: {
  plan: WorkspacePlanFacts;
  /** True when the live switch is on; carried into every deep link. */
  live: boolean;
}) {
  const [sources, setSources] = useState<Sources>(NOTHING_READ);
  /** "first" until one whole read has landed — the only time panels may show loading. */
  const [phase, setPhase] = useState<"first" | "ready">("first");
  /**
   * A read the OWNER asked for is in flight. Drives the spinner, never a
   * control's `disabled`.
   *
   * Background reads deliberately do not set it. With the change stream running,
   * a spinner tied to every read would blink through "Refreshing…" every few
   * seconds on a busy runtime — motion on a dense screen that says nothing the
   * connection line beneath it does not already say, and an `aria-busy` that
   * flickers for a screen reader with it.
   */
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState<StaleRead | null>(null);

  const abort = useRef<AbortController | null>(null);
  const coalesce = useRef<number | null>(null);
  /* A mirror of `sources`, so a read can compare against what is currently on
     screen without a functional setState — the comparison decides what the
     staleness banner says, and a state updater must stay free of that. `read` is
     the only writer of either, so the two cannot drift. */
  const shown = useRef<Sources>(NOTHING_READ);

  const read = useCallback(async (background: boolean) => {
    // One controller for all three, so a superseded refresh cannot land its
    // scheduler half on top of a newer approvals half.
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    if (!background) setBusy(true);

    const [nextScheduler, nextApprovals, nextRuns] = await Promise.all([
      loadScheduler(controller.signal),
      loadApprovals(controller.signal),
      loadRuns(controller.signal),
    ]);

    // Aborted: a newer refresh owns the state now, and writing here would undo
    // it. `load` reports an abort as neither data nor error for this check.
    if (controller.signal.aborted) return;

    const previous = shown.current;
    const merged: Sources = {
      scheduler: settle(previous.scheduler, nextScheduler, background),
      approvals: settle(previous.approvals, nextApprovals, background),
      runs: settle(previous.runs, nextRuns, background),
    };
    shown.current = merged;
    setSources(merged);

    /* Only the sources whose failure was ABSORBED need a banner. A failure the
       panels are already showing — a first read, a manual refresh, or a source
       that never had good data to keep — does not get said twice. */
    const kept: Array<{ name: string; message: string }> = [];
    const absorbed = <T,>(
      name: string,
      next: Loaded<T>,
      settled: Loaded<T>,
    ): void => {
      if (next.error !== null && settled !== next) kept.push({ name, message: next.error });
    };
    absorbed(SOURCE_NAMES.scheduler, nextScheduler, merged.scheduler);
    absorbed(SOURCE_NAMES.approvals, nextApprovals, merged.approvals);
    absorbed(SOURCE_NAMES.runs, nextRuns, merged.runs);

    setStale(
      kept.length === 0
        ? null
        : {
            sources: kept.map((entry) => entry.name),
            message: kept[0]?.message ?? "",
          },
    );

    setPhase("ready");
    if (!background) setBusy(false);
  }, []);

  /** The owner asked. Immediate, never coalesced. */
  const refresh = useCallback(() => {
    void read(false);
  }, [read]);

  /**
   * Something else asked — a change signal, or a tab coming back. Collapsed into
   * one refetch per window, so several topics moving at once cost one round of
   * three requests rather than one round each.
   */
  const scheduleRefresh = useCallback(() => {
    if (coalesce.current !== null) return;
    coalesce.current = window.setTimeout(() => {
      coalesce.current = null;
      void read(true);
    }, COALESCE_MS);
  }, [read]);

  useEffect(() => {
    void read(false);
    return () => {
      abort.current?.abort();
      if (coalesce.current !== null) window.clearTimeout(coalesce.current);
    };
  }, [read]);

  /* Every topic: this screen shows approvals, runs, the schedule, agent state
     through the triggers, and whether the plan is activated at all. */
  const events = useRuntimeEvents(RUNTIME_TOPICS);
  const stream = readStream(events);

  useEffect(() => {
    // Revision 0 is the hook's initial value; the mount read above covers it.
    if (events.revision === 0) return;
    scheduleRefresh();
  }, [events.revision, scheduleRefresh]);

  /* Coming back to the tab stays a refetch of its own, and deliberately so: the
     stream is an optimisation and this listener is the guarantee. Both go
     through the same coalescing window, so a return that also reconnects the
     stream is still one refetch. */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [scheduleRefresh]);

  const { scheduler, approvals, runs } = sources;

  const zone = useMemo(() => createZone(plan.timezone), [plan.timezone]);
  const directory = useMemo(() => createDirectory(plan), [plan]);

  const upcoming = useMemo(
    () =>
      scheduler.data === null
        ? null
        : upcomingRuns({ scheduler: scheduler.data, directory }),
    [scheduler.data, directory],
  );

  /* Withheld unless every source answered — see the header. */
  const attention = useMemo(() => {
    if (scheduler.data === null || approvals.data === null || runs.data === null) {
      return null;
    }
    return atRiskItems({
      approvals: approvals.data,
      scheduler: scheduler.data,
      runs: runs.data,
      directory,
      live,
    });
  }, [scheduler.data, approvals.data, runs.data, directory, live]);

  const tiles = useMemo(
    () =>
      statTiles({
        scheduler,
        approvals,
        runs,
        atRisk: attention,
        upcoming,
      }),
    [scheduler, approvals, runs, attention, upcoming],
  );

  const tilesLoading = tiles.some((tile) => tile.state === "loading");

  // The server's own instant, never the browser's: "overdue" is the one word
  // where a few minutes of client drift shows. Read from the data actually being
  // shown, so a kept-stale read reports the stale instant rather than now.
  const serverNow = scheduler.data?.now ?? approvals.data?.now ?? null;
  const stamp = serverNow === null ? null : zone.stamp(serverNow);
  const mode = scheduler.data?.mode ?? null;
  const activated = scheduler.data === null ? null : looksActivated(scheduler.data);

  return (
    <main className="oa-page">
      <header className={`oa-between ${styles.head}`}>
        <div className={styles.headTitles}>
          <p className="oa-eyebrow">Operate · Workspace</p>
          <h1 className="oa-h1">
            Your workforce, <span className="oa-serif">live</span>
          </h1>
          <p className="oa-lead">
            Everything here is your own workforce — the same schedules, approvals
            and runs your agents are working from. None of it is sample data.
          </p>
        </div>

        <div className={styles.headActions}>
          {/* Three answers, not two. An unrecognised mode must not be dressed
              as the safe one: "practice" is a promise that nothing leaves the
              building, and this screen may only make it when it knows. */}
          {mode !== null && (
            <span className={styles.modeBadge}>
              <LayoutGrid size={12} aria-hidden />
              {mode === "live"
                ? "Actions are real"
                : mode === "fixture"
                  ? "Practice mode"
                  : "Cannot tell whether actions are real"}
            </span>
          )}
          <div className={styles.headMeta}>
            <span className={styles.headStamp}>
              {stamp === null ? "Current time unavailable" : `Now ${stamp}`}
            </span>
            <span className={styles.headZone}>
              Day grouped by {zone.id}
              {zone.ok
                ? ""
                : ` (your plan asked for "${zone.requested}", which is not a timezone this browser knows)`}
            </span>
          </div>
          {/* Never `disabled` while it works: disabling the control a keyboard
              user just activated drops focus to the document body. */}
          <button
            type="button"
            className="oa-btn oa-btn--ghost oa-btn--sm"
            onClick={refresh}
            aria-busy={busy}
          >
            <RefreshCw size={13} aria-hidden className={busy ? "oa-spin" : undefined} />
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <div className={styles.headNotes}>
        <p className="oa-sub">
          {phase === "first"
            ? "Loading…"
            : stamp === null
              ? "Loaded, but no clock came back with it."
              : `Last updated ${stamp}.`}
        </p>

        {/* The connection's own health, in words.
            THE LIVE REGION IS THE STATE AND THE SENTENCE, NOT THE TIMESTAMP.
            `changedAt` moves on every push, so including it would make a polite
            region announce itself every few seconds on a busy runtime — the
            opposite of what it is for. What is announced is a screen that has
            stopped being current, and nothing else. */}
        <div className={styles.streamNote}>
          <span className={styles.streamLine} aria-live="polite">
            <span className={`${styles.streamState} ${TONE_CLASS[stream.tone]}`}>
              {stream.label}
            </span>
            <span className={styles.streamDetail}>{stream.detail}</span>
          </span>
          {stream.changedAt !== null && (
            <span className={styles.streamStamp}>
              Last change seen at {stream.changedAt}.
            </span>
          )}
        </div>

        {stale !== null && (
          <div className={styles.staleNote} role="status">
            <p className={styles.staleTitle}>
              <AlertTriangle size={14} aria-hidden />
              The last automatic refresh could not read {listSources(stale.sources)}
            </p>
            <p style={{ margin: 0 }}>{stale.message}</p>
            <p style={{ margin: 0 }}>
              The figures below are what was last confirmed
              {stamp === null ? "" : `, at ${stamp}`} — not what is true now.
            </p>
          </div>
        )}

        {mode === "fixture" && (
          <p className={styles.footNote}>
            This workspace is in practice mode: nothing your agents do leaves the
            building — no email is sent and no record is written anywhere else.
            Everything else on this page is real: runs, decisions about your rules,
            approvals, pauses and resumes.
          </p>
        )}

        {mode !== null && mode !== "live" && mode !== "fixture" && (
          <p className={styles.footNote}>
            This workspace could not say whether what your agents do is real or
            only practice. Until it can, treat everything here as real.
          </p>
        )}
      </div>

      {/* ── Stat tiles ── */}
      <section
        aria-label="Workspace summary"
        aria-busy={tilesLoading}
        className={`oa-card ${styles.summaryCard}`}
      >
        {tiles.map((tile) => (
          <Stat key={tile.id} tile={tile} />
        ))}
      </section>

      {activated === false && <ActivationNotice planVersion={plan.planVersion} />}

      {attention !== null && <AttentionPanel items={attention} />}

      {/* ── The grid ── */}
      <div className={styles.cols}>
        <div className={styles.col}>
          <ApprovalsPreview
            approvals={approvals}
            directory={directory}
            live={live}
            onRetry={refresh}
          />
          <ActivityFeed
            runs={runs}
            approvals={approvals.data}
            directory={directory}
            zone={zone}
            live={live}
            onRetry={refresh}
          />
        </div>

        <div className={styles.col}>
          <SchedulePanel
            scheduler={scheduler}
            entries={upcoming ?? []}
            zone={zone}
            directory={directory}
            onRetry={refresh}
          />
        </div>
      </div>

      <OutcomeProgress
        plan={plan}
        scheduler={scheduler.data}
        runs={runs.data}
        approvals={approvals.data}
        directory={directory}
      />

      <p className={styles.footNote}>
        Plan version {plan.planVersion}, approved {plan.approvedAt}.{" "}
        <Link href="/app/workspace?live=0" className={styles.inlineLink}>
          See the sample workspace instead
        </Link>
        .
      </p>
    </main>
  );
}

function listSources(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "this workspace";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * One tile.
 *
 * THREE RENDERINGS FOR THREE STATES, and the middle one is why `TileState`
 * exists. A number is a number. A source that ANSWERED and had nothing to give
 * is an em dash plus the reason — never a nought, see the module header. A
 * source that has not answered yet is a moving bar, because a dash beside "The
 * scheduler did not answer" is a failure report about a request still in flight.
 *
 * The reason is in the visible text rather than in a `title`, because a tooltip
 * is not available to a keyboard or a screen reader and this is the part of the
 * page most likely to be read at a glance and acted on.
 */
function Stat({ tile }: { tile: StatTile }) {
  const attention = tile.tone === "attention" && tile.value !== null && tile.value > 0;

  return (
    <div className={styles.sumStat}>
      {tile.state === "loading" ? (
        <span className={styles.sumSkel} aria-hidden />
      ) : (
        <span
          className={`${styles.sumNum} ${tile.value === null ? styles.sumNumMissing : ""} ${
            attention ? styles.sumNumAttention : ""
          }`}
        >
          {tile.value === null ? "—" : tile.value}
        </span>
      )}
      <span className={styles.sumLabel}>{tile.label}</span>
      <span className={styles.sumTime}>{tile.detail}</span>
    </div>
  );
}
