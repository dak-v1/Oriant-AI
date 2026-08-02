"use client";
/**
 * LiveCalendarScreen — the runtime in time: what is going to happen, what did,
 * and what is waiting on a decision (ROLE_C_PLAN M6, hardened in M7).
 *
 * Everything on this screen is read from `/api/runtime/calendar`, which projects
 * the scheduler's registered triggers, the run log and the pending approvals into
 * one event shape. Nothing is scripted; an empty month means no trigger is due,
 * no run started and no approval falls due in it, and the empty state says which
 * of those is true rather than shrugging.
 *
 * THE BROWSER DOES NO TIMEZONE ARITHMETIC, AND THAT IS THE WHOLE POINT OF THE
 * SPLIT. A schedule is a wall-clock statement in the agent's own zone — "Friday
 * at nine, Singapore time" — and the run log is UTC instants. Recomputing that
 * here would compute it in the READER's zone, and a Friday-morning sweep read
 * from London lands on Thursday evening: the screen whose only job is which day
 * things happen would be wrong about which day things happen. So the route
 * resolves every event to an instant plus the day and clock time it falls on in
 * the calendar's zone, this file renders those strings, and the zone is named on
 * screen so an owner elsewhere is never quietly misled.
 *
 * A STALE MONTH IS KEPT WHEN A REFRESH FAILS. A read that cannot reach the
 * runtime replaces neither the grid nor the truth: the events stay, a banner says
 * the view is out of date and names the error, and the "last read" stamp stops
 * advancing. Blanking the calendar on a transient failure would read as "nothing
 * is scheduled", which is also what a healthy quiet week looks like.
 *
 * ── M7 ──
 *
 * REALTIME, AND IT REPORTS ITS OWN HEALTH. `useRuntimeEvents` pushes a signal
 * when `runs`, `approvals` or `schedule` moves — a run starting, an approval
 * appearing or being decided, a cron advancing its `nextFireAt` — and this screen
 * refetches the month it is already looking at. The three topics are the three
 * sources the route joins and nothing else: an agent being paused reaches this
 * calendar through its triggers, and a deployment through the same, so neither is
 * subscribed to directly. Several of them changing at once is ONE signal frame
 * and therefore one refetch, by construction rather than by debouncing (see the
 * events route's observer). The connection's state is on screen in words, because
 * swapping "silently stale because nobody refreshed" for "silently stale because
 * a stream died" would be no progress at all.
 *
 * IT DOES NOT DEPEND ON THE STREAM. Mount, a month change, a returning tab and
 * the Refresh button all still read. At most one read is ever in flight: a newer
 * trigger aborts the older one rather than racing it, so the worst a burst can do
 * is cancel itself.
 *
 * FOUR STATES, KEPT APART. Loading is a skeleton shaped like the grid; empty says
 * what would put something in this range; error keeps the last good month and
 * names what failed; and BLOCKED is its own banner — no trigger is registered at
 * all, which is the activation gate not having been passed, and no amount of
 * waiting or refreshing will change it. Merging blocked into empty was the M6
 * shape and it hid the one case with an action attached behind the one without.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Globe,
  Inbox,
  List,
  Radio,
  RefreshCw,
  Rocket,
  WifiOff,
} from "lucide-react";
import type { RuntimeEventsStatus, RuntimeTopic } from "@/components/live/useRuntimeEvents";
import { useRuntimeEvents } from "@/components/live/useRuntimeEvents";
import type { CalendarFailureKind, CalendarView } from "./api";
import { CalendarApiError, fetchCalendar } from "./api";
import { addDays, dayLabelShort, monthKeyOf, monthLabel, monthRange, shiftMonth } from "./month";
import { KIND_META, KIND_ORDER, STATE_META, stateFill } from "./state-meta";
import DayView from "./DayView";
import MonthGrid from "./MonthGrid";
import styles from "./live-calendar.module.css";

type Range = { from: string; to: string };
type View = "month" | "day";

/**
 * What this screen is derived from, and therefore what it wakes for.
 *
 * The narrowest true answer: `runs` and `approvals` are two of the route's three
 * sources, and `schedule` is both the third (registered triggers) and the thing
 * that moves when a firing is claimed. `agents` and `deployment` are deliberately
 * absent — every way they change this calendar changes a trigger first.
 */
const CALENDAR_TOPICS: RuntimeTopic[] = ["runs", "approvals", "schedule"];

/**
 * Why the read failed, kept apart from the message because the three cases need
 * three different things from the reader — the same split the live inbox makes.
 */
interface LoadFailure {
  kind: CalendarFailureKind | "unknown";
  message: string;
}

const FAILURE_ADVICE: Record<LoadFailure["kind"], string> = {
  transport:
    "Your browser could not reach the app at all. Check that it is running and that you are " +
    "still connected to it.",
  http: "The app answered, and the answer was a refusal. Its reason is above.",
  malformed:
    "The answer came back in a form this screen could not read, so nothing was drawn from it " +
    "on purpose: a half-read month is worse than none, because a day that looks empty is " +
    "indistinguishable from a day that genuinely is.",
  unknown: "The failure did not say what it was, which is itself worth reporting.",
};

/** The connection, in one word, before the sentence explaining it. */
const STREAM_WORD = {
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
  unsupported: "Not live",
} satisfies Record<RuntimeEventsStatus, string>;

export default function LiveCalendarScreen() {
  /** Null means "whatever month the server is in" — only it knows, in its zone. */
  const [range, setRange] = useState<Range | null>(null);
  const [nonce, setNonce] = useState(0);

  const [data, setData] = useState<CalendarView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  /** Browser clock: when this tab last got an answer, not a runtime instant. */
  const [readAt, setReadAt] = useState<Date | null>(null);

  const [view, setView] = useState<View>("month");
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);

  /* Focus hand-offs between the two views. Both are counters rather than
     booleans so a second hand-off in the same direction still fires. */
  const [gridFocusNonce, setGridFocusNonce] = useState(0);
  const [dayFocusNonce, setDayFocusNonce] = useState(0);
  const dayHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const stream = useRuntimeEvents(CALENDAR_TOPICS);

  /* ≤768px: fewer pills per cell, matching the scripted calendar's behaviour. */
  useEffect(() => {
    const query = window.matchMedia("(max-width: 768px)");
    const apply = () => setCompact(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  /* ── Reading the runtime ──
     One effect, four triggers: the range, the Refresh button and the visibility
     listener (both through `nonce`), and the change stream's revision. Each
     aborts whatever the last one started, so a burst costs at most one completed
     read rather than one per trigger. */
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    void (async () => {
      try {
        const next = await fetchCalendar(range, controller.signal);
        if (controller.signal.aborted) return;
        setData(next);
        setReadAt(new Date());
        setFailure(null);
        // Keep the selected day inside the window that was actually fetched: a
        // day view drawn from a month nobody loaded would show an empty day and
        // mean nothing by it.
        setSelectedDayKey((current) => {
          if (current !== null && current >= next.range.from && current <= next.range.to) {
            return current;
          }
          if (next.todayKey >= next.range.from && next.todayKey <= next.range.to) {
            return next.todayKey;
          }
          return next.range.from;
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        // Deliberately does NOT clear `data`; see the module header.
        setFailure({
          kind: err instanceof CalendarApiError ? err.kind : "unknown",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setBusy(false);
        }
      }
    })();
    return () => controller.abort();
  }, [range, nonce, stream.revision]);

  const refresh = useCallback(() => setNonce((current) => current + 1), []);

  /* A tab that has been in the background for an hour is showing an hour-old
     month. The stream also suspends and catches up on return; this stays because
     nothing on this screen may depend on the stream being there at all. */
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  /* ── Navigation ──
     Derived as strings rather than as an object, so the callbacks below change
     identity only when the range genuinely moves. That is what lets the month
     grid skip a re-render when the connection banner rewords itself. */
  const activeFrom = range?.from ?? data?.range.from ?? null;
  const activeTo = range?.to ?? data?.range.to ?? null;
  const activeMonthKey = activeFrom === null ? null : monthKeyOf(activeFrom);

  const stepMonth = useCallback(
    (delta: number) => {
      if (activeMonthKey === null) return;
      const shifted = shiftMonth(activeMonthKey, delta);
      if (shifted === null) return;
      const next = monthRange(shifted);
      if (next === null) return;
      setRange(next);
    },
    [activeMonthKey],
  );

  const goToDay = useCallback(
    (dayKey: string) => {
      setSelectedDayKey(dayKey);
      setView("day");
      if (activeFrom !== null && activeTo !== null && (dayKey < activeFrom || dayKey > activeTo)) {
        const next = monthRange(monthKeyOf(dayKey));
        if (next !== null) setRange(next);
      }
    },
    [activeFrom, activeTo],
  );

  /* The grid's hand-off, and only the grid's. Stepping a day with the buttons
     below the day view must NOT move focus — the reader is holding down "next
     day" and would lose the button under their finger every time. */
  const openDayFromGrid = useCallback(
    (dayKey: string) => {
      goToDay(dayKey);
      setDayFocusNonce((current) => current + 1);
    },
    [goToDay],
  );

  const backToMonth = useCallback(() => {
    setView("month");
    setGridFocusNonce((current) => current + 1);
  }, []);

  const goToToday = () => {
    if (data === null) return;
    const next = monthRange(monthKeyOf(data.todayKey));
    if (next !== null) setRange(next);
    setSelectedDayKey(data.todayKey);
  };

  /* The day view taking focus when the grid hands over. Zero means "nobody
     opened a day", which is every first paint — the same rule the grid's own
     `focusNonce` follows, and for the same reason: these components mount and
     unmount as the view changes, so the guard cannot be "has it changed since I
     was created". */
  useEffect(() => {
    if (dayFocusNonce === 0) return;
    dayHeadingRef.current?.focus();
  }, [dayFocusNonce]);

  /* ── Derivations ── */

  const dayEvents = useMemo(
    () =>
      data === null || selectedDayKey === null
        ? []
        : data.events.filter((event) => event.dayKey === selectedDayKey),
    [data, selectedDayKey],
  );

  const headingMonth = activeMonthKey === null ? "" : monthLabel(activeMonthKey);
  const zone = data?.timezone ?? null;
  /* Blocked: nothing is registered, so nothing on this calendar can be in the
     future no matter how long anyone waits. Judged from the triggers rather than
     from a stored flag — the same evidence the roster uses. */
  const blocked = data !== null && data.summary.registeredTriggers === 0;

  return (
    <main className="oa-page">
      <header className="oa-between" style={{ marginBottom: 4, alignItems: "flex-start" }}>
        <div style={{ display: "grid", gap: 6 }}>
          <p className="oa-eyebrow">Operate · Automation calendar</p>
          <h1 className="oa-h1">
            Automation <span className="oa-serif">calendar</span>
          </h1>
          <p className="oa-lead">
            Every scheduled firing, every run and every decision waiting on you, placed on the day
            it actually falls on.
          </p>
        </div>
        <div className={styles.headSide}>
          {data === null ? (
            <span className="oa-tag oa-tag--neutral">
              Cannot tell whether actions are real
            </span>
          ) : data.mode === "live" ? (
            <span className="oa-tag oa-tag--amber">Actions are real</span>
          ) : (
            <span className="oa-tag oa-tag--teal">Practice mode — nothing is sent</span>
          )}
          {zone !== null && (
            <span className="oa-tag oa-tag--neutral">
              <Globe size={12} aria-hidden /> Times in {zone.id}
            </span>
          )}
          {data !== null && data.summary.pendingApprovals > 0 && (
            <Link href="/app/workspace/approvals?live=1" className="oa-tag oa-tag--amber">
              {data.summary.pendingApprovals} waiting on you
            </Link>
          )}
        </div>
      </header>

      <StreamStatus stream={stream} readAt={readAt} busy={busy} hasData={data !== null} />

      {/* ══ Toolbar ══ */}
      <div className={styles.toolbar}>
        <div className={styles.monthNav} role="group" aria-label="Move through the calendar">
          <button
            type="button"
            className="oa-btn oa-btn--ghost oa-btn--icon"
            onClick={() => stepMonth(-1)}
            disabled={activeMonthKey === null}
            aria-label="Previous month"
          >
            <ChevronLeft size={15} aria-hidden />
          </button>
          <span className={styles.monthLabel} aria-live="polite">
            {headingMonth || "…"}
          </span>
          <button
            type="button"
            className="oa-btn oa-btn--ghost oa-btn--icon"
            onClick={() => stepMonth(1)}
            disabled={activeMonthKey === null}
            aria-label="Next month"
          >
            <ChevronRight size={15} aria-hidden />
          </button>
          <button
            type="button"
            className="oa-btn oa-btn--ghost oa-btn--sm"
            onClick={goToToday}
            disabled={data === null}
          >
            <CalendarDays size={14} aria-hidden />
            Today
          </button>
        </div>

        <div className={styles.viewNav}>
          <div role="group" aria-label="Calendar view" className={styles.viewToggle}>
            <button
              type="button"
              className={`oa-chip ${view === "month" ? "oa-chip--selected" : ""}`}
              aria-pressed={view === "month"}
              onClick={backToMonth}
            >
              <CalendarDays size={13} aria-hidden />
              Month
            </button>
            <button
              type="button"
              className={`oa-chip ${view === "day" ? "oa-chip--selected" : ""}`}
              aria-pressed={view === "day"}
              onClick={() => setView("day")}
            >
              <List size={13} aria-hidden />
              Day
            </button>
          </div>
          <button
            type="button"
            className="oa-btn oa-btn--ghost oa-btn--sm"
            onClick={refresh}
            disabled={busy}
          >
            <RefreshCw size={13} className={busy ? "oa-spin" : ""} aria-hidden />
            Refresh
          </button>
        </div>
      </div>

      {/* ══ Failures and caveats ══ */}

      {failure !== null && (
        <div className={styles.errorBox} role="alert">
          <p className={styles.errorTitle}>
            <AlertTriangle size={15} aria-hidden />
            {data === null ? "The calendar could not be loaded" : "This calendar is out of date"}
          </p>
          {/* The raw reason, except when the answer was unreadable — there the
              reason names a field for a developer, and the sentence below it is
              the one an owner can act on. */}
          {failure.kind !== "malformed" && (
            <p className={styles.errorDetail}>{failure.message}</p>
          )}
          <p>{FAILURE_ADVICE[failure.kind]}</p>
          {data !== null && (
            <p>
              What is drawn below is what was last confirmed, at{" "}
              {readAt ? readAt.toLocaleTimeString() : "an earlier point"}. Runs and approvals since
              then are not on it.
            </p>
          )}
          <div>
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--sm"
              onClick={refresh}
              disabled={busy}
            >
              <RefreshCw size={13} className={busy ? "oa-spin" : ""} aria-hidden />
              Try again
            </button>
          </div>
        </div>
      )}

      {blocked && <BlockedByActivation />}

      {zone !== null && !zone.ok && (
        <div className={styles.warnBox} role="alert">
          <p className={styles.warnTitle}>
            <AlertTriangle size={15} aria-hidden />
            The plan&apos;s timezone could not be used
          </p>
          <p>
            Your plan asks for <code>{zone.requested}</code>, which is not a timezone this app
            knows, so every day and time below is in <strong>UTC</strong> instead. The times are
            correct but may sit on the wrong local day — treat the grid as approximate until the
            timezone is fixed in the plan.
          </p>
        </div>
      )}

      {zone !== null && zone.otherScheduleZones.length > 0 && (
        <p className={styles.note}>
          This grid is grouped by <strong>{zone.id}</strong>, but some schedules are written in{" "}
          {zone.otherScheduleZones.join(", ")}. Their times below are converted into {zone.id}, so a
          run may sit on a different local day than the one its own schedule names.
        </p>
      )}

      <Legend />

      {/* ══ Nothing in this range ══
          Above the grid rather than under it: an empty month explains nothing on
          its own, and the sentence that does is the one an owner needs first. */}
      {data !== null && data.events.length === 0 && failure === null && !blocked && (
        <EmptyCalendar data={data} />
      )}

      {/* ══ The calendar ══ */}

      {loading && data === null ? (
        <div className={`oa-card ${styles.skeleton}`} aria-busy="true" aria-label="Loading calendar">
          <div className={styles.skelLine} style={{ width: "38%" }} />
          <div className={styles.skelGrid}>
            {Array.from({ length: 14 }, (_, index) => (
              <div key={index} className={styles.skelCell} />
            ))}
          </div>
        </div>
      ) : data === null ? null : view === "month" ? (
        <section className={`oa-card ${styles.calCard}`} aria-label={`${headingMonth} month view`}>
          <MonthGrid
            from={data.range.from}
            to={data.range.to}
            todayKey={data.todayKey}
            events={data.events}
            selectedDayKey={selectedDayKey}
            onSelectDay={openDayFromGrid}
            onStepMonth={stepMonth}
            compact={compact}
            focusNonce={gridFocusNonce}
            rangeLabel={headingMonth}
          />
        </section>
      ) : selectedDayKey === null ? null : (
        <>
          <div className={styles.dayNav} role="group" aria-label="Move through the days">
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--sm"
              onClick={() => stepDay(selectedDayKey, -1, goToDay)}
            >
              <ChevronLeft size={14} aria-hidden />
              {previousDayLabel(selectedDayKey)}
            </button>
            <button type="button" className="oa-btn oa-btn--ghost oa-btn--sm" onClick={backToMonth}>
              <CalendarDays size={14} aria-hidden />
              Back to {headingMonth}
            </button>
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--sm"
              onClick={() => stepDay(selectedDayKey, 1, goToDay)}
            >
              {nextDayLabel(selectedDayKey)}
              <ChevronRight size={14} aria-hidden />
            </button>
          </div>
          <DayView
            dayKey={selectedDayKey}
            events={dayEvents}
            zoneId={data.timezone.id}
            isToday={selectedDayKey === data.todayKey}
            headingRef={dayHeadingRef}
          />
        </>
      )}

      {/* ══ Everything the grid cannot say ══ */}

      {data !== null && data.truncated && data.truncationDetail !== null && (
        <p className={styles.note}>
          <AlertTriangle size={13} aria-hidden /> {data.truncationDetail}
        </p>
      )}

      {data !== null && data.unplaceable.length > 0 && (
        <section className={`oa-card ${styles.panel}`} aria-label="Real, but with no day to show them on">
          <p className="oa-micro">Real, but with no day to show them on</p>
          <p className="oa-sub">
            These exist, but carry no readable time, so there is no day to draw them on. They are
            listed rather than dropped: the one item nobody can make sense of must not be the one
            that disappears.
          </p>
          <ul className={styles.plainList}>
            {data.unplaceable.map((item) => (
              <li key={item.id} className={styles.plainRow}>
                <span className={styles.plainTitle}>
                  {item.agentName} · {item.workflowName}
                </span>
                <span className="oa-sub">{item.reason}</span>
                {item.href !== null && (
                  <Link href={item.href} className="oa-blue-text">
                    Open it
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data !== null && (
        <section className={`oa-card ${styles.panel}`} aria-label="What feeds this calendar">
          <p className="oa-micro">What feeds this calendar</p>
          <dl className={styles.factGrid}>
            <Fact
              label="Run on a schedule"
              value={data.summary.scheduleTriggers}
              note="Switched on and due at a time — the only kind a calendar can show."
            />
            <Fact
              label="Waiting for something to arrive"
              value={data.summary.signalTriggers}
              note="These start on an event, a threshold or another workflow. Live, and never on a grid."
            />
            <Fact
              label="Stood down"
              value={data.summary.disabledTriggers}
              note="Set up but switched off — a paused agent's workflows, which start nothing."
            />
            <Fact
              label="Runs recorded"
              value={data.summary.totalRuns}
              note={`${data.summary.runsInRange} of them started inside this range.`}
            />
          </dl>
          <p className="oa-sub">
            Today is <strong>{data.todayKey}</strong> in {data.timezone.id}, taken from{" "}
            {zoneSourceNote(data)}. Last updated at{" "}
            {readAt ? readAt.toLocaleTimeString() : "—"}.
          </p>
        </section>
      )}
    </main>
  );
}

/* ═══════════════════════════ The connection ═══════════════════════════ */

/**
 * What the live connection is doing, in words, above the fold.
 *
 * `role="status"` rather than an alert: a stream dropping is not an emergency, it
 * is a fact about how fresh the month below can be. The sentence comes from the
 * hook verbatim — it is the one place that knows whether the browser has no
 * `EventSource`, whether the server said it cannot observe anything, or whether a
 * timer is standing in and how far behind that leaves this page.
 *
 * THE LIVE REGION IS THE CONNECTION AND NOTHING ELSE. The read stamp beside it
 * changes on every refetch, and a `role="status"` is atomic — wrapping both would
 * have a screen reader read the whole paragraph aloud each time the month
 * reloaded, which on a busy runtime is every few seconds. The connection's own
 * state changes rarely and is worth interrupting for; "last read at 14:02:11" is
 * not.
 */
function StreamStatus({
  stream,
  readAt,
  busy,
  hasData,
}: {
  stream: ReturnType<typeof useRuntimeEvents>;
  readAt: Date | null;
  busy: boolean;
  hasData: boolean;
}) {
  const Icon =
    stream.status === "live" ? Radio : stream.status === "unsupported" ? WifiOff : RefreshCw;

  return (
    <p className={styles.stream}>
      <span className={styles.streamState} role="status">
        <Icon
          size={13}
          aria-hidden
          className={
            stream.status === "connecting" || stream.status === "reconnecting" ? "oa-spin" : ""
          }
        />
        <span className={styles.streamWord}>{STREAM_WORD[stream.status]}</span>
        <span className={styles.streamDetail}>{stream.detail}</span>
      </span>
      <span className={styles.streamRead}>
        {busy
          ? "Checking for updates now."
          : readAt === null
            ? hasData
              ? ""
              : "Nothing has loaded yet."
            : `Last updated at ${readAt.toLocaleTimeString()}.`}
      </span>
    </p>
  );
}

/* ═══════════════════════════ Pieces ═══════════════════════════ */

function Fact({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{value}</dd>
      <dd className={styles.factNote}>{note}</dd>
    </div>
  );
}

/**
 * The legend, with the definitions behind a disclosure.
 *
 * The ten words were previously explained in a `title` attribute, which is a
 * tooltip a keyboard never opens, a screen reader reads inconsistently and a touch
 * device has no gesture for — so the sentences that say what "projected" means
 * were, in practice, written for nobody. They are in the document now, one button
 * away, with `aria-expanded` and an `aria-controls` target that exists whether the
 * panel is open or shut.
 */
function Legend() {
  const [open, setOpen] = useState(false);
  const panelId = "oa-cal-legend-detail";

  return (
    <section className={styles.legendBlock} aria-label="What the states on this calendar mean">
      <div className={styles.legend}>
        {KIND_ORDER.map((kind) => {
          const meta = KIND_META[kind];
          return (
            <div key={kind} className={styles.legendGroup}>
              <p className={styles.legendHead}>
                {meta.label}
                <span className={styles.legendSource}>{meta.source}</span>
              </p>
              <div className={styles.legendItems}>
                {meta.states.map((state) => {
                  const stateMeta = STATE_META[state];
                  const Icon = stateMeta.icon;
                  return (
                    <span key={state} className={styles.legendItem}>
                      <span className={styles.legendSwatch} style={stateFill(state)} aria-hidden>
                        <Icon size={10} />
                      </span>
                      {stateMeta.label}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="oa-btn oa-btn--ghost oa-btn--sm"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? "Hide what these states mean" : "What do these states mean?"}
      </button>

      <div id={panelId} hidden={!open}>
        {open && (
          <dl className={styles.legendDefs}>
            {KIND_ORDER.flatMap((kind) =>
              KIND_META[kind].states.map((state) => {
                const meta = STATE_META[state];
                const Icon = meta.icon;
                return (
                  <div key={state} className={styles.legendDef}>
                    <dt className={styles.legendDefTerm}>
                      <span className={styles.legendSwatch} style={stateFill(state)} aria-hidden>
                        <Icon size={10} />
                      </span>
                      {meta.label}
                    </dt>
                    <dd className={styles.legendDefBody}>{meta.description}</dd>
                  </div>
                );
              }),
            )}
          </dl>
        )}
      </div>
    </section>
  );
}

/**
 * Blocked — not empty.
 *
 * No trigger is registered on this runtime at all, so this calendar cannot show a
 * future however long anybody waits or however many times they refresh. That is
 * one specific gate not having been passed, and it has an address: the activation
 * checklist. Empty and blocked used to be one panel with a branch inside it, and
 * the branch with something to do about it was the one that read as a shrug.
 */
function BlockedByActivation() {
  return (
    <div className={styles.blockedBox} role="alert">
      <p className={styles.blockedTitle}>
        <Rocket size={16} aria-hidden />
        Blocked: this plan has not been put live yet
      </p>
      <p>
        Nothing is scheduled, for any agent, in any state. Nothing will start on its own, and no
        month you move to will have a future in it. Runs already recorded still appear below;
        everything ahead of now does not exist yet.
      </p>
      <p>
        Going live runs three checks first: that every agent is ready, that it passed its test
        run, and that the connections it needs are in place. Only then is each workflow put on
        the schedule.
      </p>
      <div className={styles.blockedActions}>
        <Link href="/app/deploy" className="oa-btn oa-btn--primary oa-btn--sm">
          <Rocket size={13} aria-hidden />
          Open the go-live checks
        </Link>
        <Link href="/app/workspace/integrations?live=1" className="oa-btn oa-btn--ghost oa-btn--sm">
          See which connections it needs
        </Link>
      </div>
    </div>
  );
}

/**
 * The honest empty state.
 *
 * "No events" is true and useless: it does not tell an activated workforce whose
 * next sweep is in August apart from one whose triggers all wait for a webhook
 * that has no delivery path. Those need different actions, so the panel names
 * whichever applies from the counts the route returned. The never-activated case
 * is NOT here — it is blocked, above, because it is the only one with a gate
 * behind it.
 */
function EmptyCalendar({ data }: { data: CalendarView }) {
  const { summary } = data;

  return (
    <div className={styles.stateBox}>
      <p className={styles.stateTitle}>
        <Inbox size={17} aria-hidden />
        Nothing falls between {data.range.from} and {data.range.to}.
      </p>

      <p>
        {summary.scheduleTriggers === 0
          ? "No workflow runs on a clock."
          : `${summary.scheduleTriggers} ${
              summary.scheduleTriggers === 1 ? "workflow is" : "workflows are"
            } scheduled, and none of them falls in this range.`}{" "}
        {summary.signalTriggers > 0 &&
          `${summary.signalTriggers} more ${
            summary.signalTriggers === 1 ? "workflow starts" : "workflows start"
          } when something arrives — an event, a threshold, another workflow finishing — which is never a time on a grid.`}{" "}
        {summary.disabledTriggers > 0 &&
          `${summary.disabledTriggers} ${
            summary.disabledTriggers === 1 ? "workflow is" : "workflows are"
          } stood down, which is what a paused agent looks like here.`}
      </p>
      <p style={{ margin: 0, fontWeight: 700 }}>What would put something here:</p>
      <ol className={styles.stateSteps}>
        <li>Move to a month a schedule actually reaches — the arrows above change the range.</li>
        <li>
          Let a workflow start. Something has to actually run the schedule: if nothing is
          turning it, a workforce that has gone live looks perfectly healthy and never starts a
          run — and this calendar would show work that keeps coming due and never happening.
        </li>
        <li>
          Resume anything paused from{" "}
          <Link href="/app/workspace/agents?live=1" className="oa-blue-text">
            your agents
          </Link>
          . A paused agent&apos;s workflows are switched off, not forgotten.
        </li>
      </ol>
    </div>
  );
}

/* ═══════════════════════════ Words and steps ═══════════════════════════ */

function zoneSourceNote(data: CalendarView): string {
  switch (data.timezone.source) {
    case "global-quiet-hours":
      return "your plan's organisation-wide quiet hours";
    case "schedule-trigger":
      return "the first scheduled workflow in your plan";
    case "fallback":
      return "nowhere — your plan names no timezone, so UTC was assumed";
  }
}

/**
 * Day stepping goes through the same `goToDay` as a grid click, so moving off the
 * end of a month loads the next one instead of showing a day that was never
 * fetched.
 */
function stepDay(dayKey: string, delta: number, go: (next: string) => void): void {
  const next = addDays(dayKey, delta);
  if (next !== null) go(next);
}

function previousDayLabel(dayKey: string): string {
  const previous = addDays(dayKey, -1);
  return previous === null ? "Previous day" : dayLabelShort(previous);
}

function nextDayLabel(dayKey: string): string {
  const next = addDays(dayKey, 1);
  return next === null ? "Next day" : dayLabelShort(next);
}
