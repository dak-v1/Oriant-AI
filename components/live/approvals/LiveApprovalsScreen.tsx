"use client";
/**
 * LiveApprovalsScreen — the runtime-backed Approval Inbox: every paused run
 * waiting on its owner, read from `/api/runtime/approvals`.
 *
 * This is the screen ROLE_C_PLAN calls the product's core loop. A scheduled run
 * fires, an `act` step breaches a policy limit, the executor persists the run and
 * raises an approval — and from here the owner reads it, edits it, decides it,
 * and the paused run continues. Nothing on this screen is scripted; if the queue
 * is empty it is because no run is paused, and the empty state says exactly what
 * would change that rather than shrugging.
 *
 * THE STALE LIST IS KEPT WHEN A REFRESH FAILS. A background read that cannot
 * reach the runtime replaces neither the list nor the truth: the items stay, a
 * banner says the view is stale and names the error, and the timestamp beside
 * the counts stops advancing. Blanking the inbox on a transient failure would
 * read as "nothing is waiting on you", which is the single most expensive thing
 * this screen could get wrong.
 *
 * AND NOTHING ELSE ON THE SCREEN IS ALLOWED TO SAY IT EITHER. That rule used to
 * hold for the list and quietly break everywhere else: the header printed a teal
 * "Nothing pending" and the rail printed "Pending approvals 0" whenever the
 * count happened to be zero — including before the first read had returned, and
 * including when it had failed. Both now distinguish "the runtime said nothing
 * is waiting" from "nobody has asked yet" from "we asked and it would not
 * answer", because only the first of the three is good news. An empty queue is
 * reassuring exactly once: after a successful read.
 *
 * OVERDUE IS NEVER COMPUTED HERE. Each item carries the deadline the runtime
 * derived from `escalateAfterMins`, judged against the server's clock, which
 * arrives in the same response as `now`. The screen filters on that state and
 * prints that sentence. A browser recomputation would drift from the notifier's
 * by whatever the two clocks disagree about, and "overdue" is precisely the
 * field where a few minutes shows.
 *
 * ── Realtime (M7) ──
 *
 * THE 15-SECOND TIMER IS GONE AND THE STREAM REPLACED IT — one mechanism, not
 * two. `useRuntimeEvents` pushes a revision when `approvals` or `runs` changes
 * and this screen refetches the endpoint it already read. Both topics, because
 * a paused run and its approval are two separate store writes: an observation
 * pass can see one before the other, and subscribing to both means the inbox
 * wakes on whichever lands first.
 *
 * IT DOES NOT DEPEND ON THE STREAM. The mount read, the Refresh button and the
 * hook's own fallback timer are all still here; if no stream ever opens, the
 * screen behaves as it did in M5, five seconds slower, and the rail says in
 * words which of the two is happening. An owner must be able to tell whether the
 * inbox in front of them is current, and "it looks calm" is not an answer.
 *
 * A SIGNAL THAT ARRIVES WITH THE DRAWER OPEN IS HELD, NOT APPLIED. Refetching
 * underneath a half-written edit is a data race with a human in it. The change
 * is not discarded — the rail says something moved, and closing the panel
 * refetches immediately.
 *
 * DECISIONS STAY VISIBLE AFTER THEY LEAVE THE QUEUE. A decided approval is no
 * longer pending, so the next read drops it — and an owner who just approved
 * something would watch it vanish with no confirmation. The rail keeps what was
 * decided in this session, with the run status each decision produced, and every
 * entry reopens its record.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  Inbox,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useRuntimeEvents } from "@/components/live/useRuntimeEvents";
import type { RuntimeTopic } from "@/components/live/useRuntimeEvents";
import { readStream } from "@/components/live/workspace/stream-status";
import type {
  ApiFailureKind,
  InboxView,
  PendingApprovalView,
  PlanContext,
  RiskLevel,
} from "./api";
import { ApprovalsApiError, fetchInbox, fetchPlanContext } from "./api";
import { deadlineTone, formatClock, runStatusMeta } from "./format";
import ApprovalListCard from "./ApprovalListCard";
import EmptyInbox from "./EmptyInbox";
import ReviewDrawer from "./ReviewDrawer";
import type { DecidedSummary } from "./ReviewDrawer";
import shell from "@/components/mock/approvals/approvals.module.css";
import styles from "./live-approvals.module.css";

/**
 * What this screen is derived from.
 *
 * `approvals` is obvious. `runs` is here because an approval and the paused run
 * that carries it are two writes: `RunState.pendingApprovalId` and the approval
 * record itself. One observation pass can see either first, so listening to both
 * is what makes "a run just paused" reach this list on the earliest pass rather
 * than the next one. Module-level so its identity is stable across renders.
 */
const INBOX_TOPICS: RuntimeTopic[] = ["approvals", "runs"];

const TONE_CLASS = {
  live: styles.streamLive,
  waiting: styles.streamWaiting,
  degraded: styles.streamDegraded,
} as const;

type RiskFilter = "all" | RiskLevel;
type DueFilter = "all" | "overdue" | "due";

/**
 * Why the read failed, kept apart from the message because the three cases need
 * three different things from the reader. A transport failure is theirs to fix;
 * an HTTP status is the runtime's answer; a malformed body is a contract break
 * between this screen and a route, and saying so beats "something went wrong".
 */
interface LoadFailure {
  kind: ApiFailureKind | "unknown";
  message: string;
}

const FAILURE_ADVICE: Record<LoadFailure["kind"], string> = {
  transport:
    "Your browser could not reach the app at all. Check that it is running and that you are " +
    "still connected to it.",
  http: "The app answered, and the answer was a refusal. Its reason is above.",
  malformed:
    "The answer came back in a form this screen could not read, so nothing was shown from it " +
    "on purpose: a half-read approval is worse than none, because you cannot see what is " +
    "missing from it.",
  unknown: "The failure did not say what it was, which is itself worth reporting.",
};

const RISK_OPTIONS: RiskLevel[] = ["high", "medium", "low"];

export default function LiveApprovalsScreen() {
  const searchParams = useSearchParams();
  const fieldId = useId();

  const [inbox, setInbox] = useState<InboxView | null>(null);
  /** Agent names and the runtime mode. Null until the lookup answers. */
  const [plan, setPlan] = useState<PlanContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyRefresh, setBusyRefresh] = useState(false);
  const [loadError, setLoadError] = useState<LoadFailure | null>(null);
  /** Browser clock — when this tab last got an answer, not a runtime instant. */
  const [readAt, setReadAt] = useState<Date | null>(null);

  const [agentFilter, setAgentFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");

  const [openId, setOpenId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [decided, setDecided] = useState<DecidedSummary[]>([]);
  const [liveUpdates, setLiveUpdates] = useState(true);
  /** A change signal arrived while the review panel was open. */
  const [held, setHeld] = useState(false);

  const handledFocus = useRef<string | null>(null);
  const highlightTimer = useRef<number | null>(null);
  /* Read inside the signal effect, which must not re-run — and therefore must
     not re-read the list — merely because the drawer opened or closed. */
  const drawerOpen = useRef(false);
  /* Which read is the newest. Four callers can start one — mount, a change
     signal, the Refresh button and a decision landing — and with the stream
     running two can now genuinely overlap. Without this the SLOWER response
     wins, which on this screen means an inbox that silently goes backwards. */
  const readSeq = useRef(0);

  /* ── Reading the runtime ── */

  const load = useCallback(async (signal?: AbortSignal) => {
    const seq = (readSeq.current += 1);
    try {
      const next = await fetchInbox(signal);
      if (signal?.aborted || seq !== readSeq.current) return;
      setInbox(next);
      setReadAt(new Date());
      setLoadError(null);
    } catch (err) {
      if (signal?.aborted || seq !== readSeq.current) return;
      // Deliberately does NOT clear `inbox`; see the module header.
      setLoadError({
        kind: err instanceof ApprovalsApiError ? err.kind : "unknown",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  /* The queue and the plan context are loaded independently, and `loading`
     tracks only the QUEUE. Waiting for both would let a slow (and purely
     cosmetic) name lookup hold an inbox full of decisions behind a skeleton. */
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await load(controller.signal);
      if (!controller.signal.aborted) setLoading(false);
    })();
    void fetchPlanContext(controller.signal).then((context) => {
      if (!controller.signal.aborted) setPlan(context);
    });
    return () => controller.abort();
  }, [load]);

  const refresh = useCallback(async () => {
    setBusyRefresh(true);
    setHeld(false);
    await load();
    setBusyRefresh(false);
  }, [load]);

  /* ── The change signal ──
     One mechanism, replacing the timer this screen used to run. The hook
     suspends itself on a hidden tab and falls back to its own slow poll when no
     stream is available, so neither concern lives here any more. */
  const events = useRuntimeEvents(INBOX_TOPICS, { enabled: liveUpdates });
  const stream = readStream(events);

  useEffect(() => {
    drawerOpen.current = openId !== null;
  }, [openId]);

  useEffect(() => {
    // Revision 0 is the hook's initial value; the mount read covers it.
    if (events.revision === 0) return;
    if (drawerOpen.current) {
      setHeld(true);
      return;
    }
    void load();
  }, [events.revision, load]);

  /* ── ?focus=<approvalId> ──
     Opens the drawer on that item whether or not it is still pending: the drawer
     reads the approval by id, so a link from a notification still resolves after
     somebody else has decided it — and says so. */
  const focusParam = searchParams.get("focus");
  useEffect(() => {
    if (focusParam === null || handledFocus.current === focusParam) return;
    handledFocus.current = focusParam;
    setAgentFilter("all");
    setRiskFilter("all");
    setDueFilter("all");
    setOpenId(focusParam);
    setHighlightId(focusParam);
    highlightTimer.current = window.setTimeout(() => {
      highlightTimer.current = null;
      setHighlightId(null);
    }, 2600);
  }, [focusParam]);

  useEffect(
    () => () => {
      if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    },
    [],
  );

  /* ── Filtering ──
     Each group's counts are taken over the items the OTHER groups already allow,
     so a chip reading zero means "nothing here matches what you have chosen",
     not "nothing here at all".

     Deliberately not memoised. These are a handful of passes over a queue that
     is a review list, not a data grid; the only thing `useMemo` would add is a
     dependency array restating every filter, and a dependency array that has to
     be kept in step with a closure is a stale count waiting to happen. What IS
     memoised is one level down — `ApprovalListCard`, so that a connection state
     changing or a filter being clicked does not re-render a dozen cards whose
     approval has not moved. */
  const pending = inbox?.pending ?? [];

  const byAgent = (item: PendingApprovalView) =>
    agentFilter === "all" || item.agentId === agentFilter;
  const byRisk = (item: PendingApprovalView) => riskFilter === "all" || item.risk === riskFilter;
  const byDue = (item: PendingApprovalView) =>
    dueFilter === "all" ||
    (dueFilter === "overdue"
      ? deadlineTone(item.deadline.state).pressing
      : !deadlineTone(item.deadline.state).pressing);

  const agentScoped = pending.filter((item) => byRisk(item) && byDue(item));
  const agents = Array.from(new Set(pending.map((item) => item.agentId)))
    .sort()
    .map((id) => ({
      id,
      label: plan?.agentNames[id] ?? id,
      count: agentScoped.filter((item) => item.agentId === id).length,
    }));

  const riskScoped = pending.filter((item) => byAgent(item) && byDue(item));
  const riskCounts: Record<RiskFilter, number> = {
    all: riskScoped.length,
    high: riskScoped.filter((item) => item.risk === "high").length,
    medium: riskScoped.filter((item) => item.risk === "medium").length,
    low: riskScoped.filter((item) => item.risk === "low").length,
  };

  const dueScoped = pending.filter((item) => byAgent(item) && byRisk(item));
  const dueOverdue = dueScoped.filter((item) => deadlineTone(item.deadline.state).pressing).length;
  const dueCounts = {
    all: dueScoped.length,
    overdue: dueOverdue,
    due: dueScoped.length - dueOverdue,
  };

  const visible = pending.filter((item) => byAgent(item) && byRisk(item) && byDue(item));

  const clearFilters = () => {
    setAgentFilter("all");
    setRiskFilter("all");
    setDueFilter("all");
  };

  /* ── Decisions ── */

  /* Stable, so `memo` on the card is not defeated by a fresh arrow per row. */
  const openReview = useCallback((approvalId: string) => setOpenId(approvalId), []);

  const onDecided = useCallback((summary: DecidedSummary) => {
    setDecided((current) => [summary, ...current.filter((s) => s.approvalId !== summary.approvalId)]);
    // The item has left the pending queue; re-read so the list and the counts
    // agree with what just happened.
    void load();
  }, [load]);

  const closeDrawer = useCallback(() => {
    setOpenId(null);
    setHeld(false);
    void load();
  }, [load]);

  /* ── What this screen can honestly say about its own numbers ── */

  const overdueCount = inbox?.overdueCount ?? 0;
  /** True only after a read that succeeded — the one state where zero is calm. */
  const answered = inbox !== null;
  const stale = answered && loadError !== null;

  const countSummary = useMemo(() => {
    if (!answered) {
      return loadError === null
        ? "Loading the approvals queue."
        : "The approvals queue could not be loaded. Nothing is known about what is waiting.";
    }
    const waiting = `${pending.length} approval${pending.length === 1 ? "" : "s"} waiting on you, ${overdueCount} overdue.`;
    return stale ? `${waiting} This is the last confirmed list; a newer one failed to load.` : waiting;
  }, [answered, loadError, overdueCount, pending.length, stale]);

  const updateNote = !liveUpdates
    ? "Live updates are switched off for this screen, so a new approval will not appear until you press Refresh."
    : events.status === "live"
      ? "A run that pauses appears here the moment it happens — no reload needed."
      : "This screen is not receiving updates automatically at the moment, so a new approval can take a few seconds longer to appear. Its connection is shown in the panel beside this one.";

  return (
    <main className="oa-page">
      <header className="oa-between" style={{ marginBottom: 20, alignItems: "flex-start" }}>
        <div style={{ display: "grid", gap: 6 }}>
          <p className="oa-eyebrow">Operate · Approval inbox</p>
          <h1 className="oa-h1">
            Approval <span className="oa-serif">inbox</span>
          </h1>
          <p className="oa-lead">
            Every run your agents have paused, waiting on a decision from you. Deciding one resumes
            the run where it stopped.
          </p>
        </div>
        <div className={shell.headSide}>
          {/* Nothing is claimed about the mode until the lookup answers. It used
              to render "Runtime mode unknown" from the first frame — a statement
              that this screen could not establish something it had not yet
              asked about, corrected a moment later. */}
          {plan !== null &&
            (plan.mode === "live" ? (
              <span className="oa-tag oa-tag--amber">Actions are real</span>
            ) : plan.mode === "fixture" ? (
              <span className="oa-tag oa-tag--teal">Practice mode — nothing is sent</span>
            ) : (
              <span className="oa-tag oa-tag--neutral">
                Cannot tell whether actions are real
              </span>
            ))}

          {!answered ? (
            loadError !== null && (
              <span className="oa-tag oa-tag--amber">Queue could not be loaded</span>
            )
          ) : overdueCount > 0 ? (
            <span className="oa-tag oa-tag--amber">{overdueCount} overdue</span>
          ) : pending.length > 0 ? (
            <span className="oa-tag oa-tag--neutral">{pending.length} waiting on you</span>
          ) : stale ? (
            <span className="oa-tag oa-tag--neutral">Nothing pending at the last read</span>
          ) : (
            <span className="oa-tag oa-tag--teal">Nothing pending</span>
          )}
        </div>
      </header>

      {/* The counts, for anyone not reading the rail. Its text changes only when
          the numbers do, so a pushed refetch that changed nothing announces
          nothing. */}
      <p role="status" className={styles.srOnly}>
        {countSummary}
      </p>

      <div className={styles.split}>
        {/* ══ Inbox ══ */}
        <section className={styles.inboxPane} aria-labelledby={`${fieldId}-inbox-heading`}>
          <h2 className={styles.srOnly} id={`${fieldId}-inbox-heading`}>
            Decisions waiting on you
          </h2>

          {loadError && (
            <div className={styles.errorBox} role="alert">
              <p className={styles.errorTitle}>
                <AlertTriangle size={15} aria-hidden />
                {answered ? "This list is out of date" : "The approvals queue could not be loaded"}
              </p>
              {/* The raw reason, except when the answer was unreadable — there the
                  reason names a field for a developer, and the sentence below it
                  is the one an owner can act on. */}
              {loadError.kind !== "malformed" && (
                <p className={styles.errorDetail}>{loadError.message}</p>
              )}
              <p>{FAILURE_ADVICE[loadError.kind]}</p>
              {answered && (
                <p>
                  The items below are what was last confirmed, at{" "}
                  {readAt ? readAt.toLocaleTimeString() : "an earlier point"}. Newer approvals may
                  exist, and ones decided since may still be showing.
                </p>
              )}
              <div>
                <button
                  type="button"
                  className="oa-btn oa-btn--ghost oa-btn--sm"
                  onClick={() => void refresh()}
                  aria-busy={busyRefresh}
                >
                  <RefreshCw size={13} className={busyRefresh ? "oa-spin" : ""} aria-hidden />
                  Try again
                </button>
              </div>
            </div>
          )}

          {pending.length > 0 && (
            <div className={shell.filters}>
              <FilterGroup id={`${fieldId}-agent`} label="Agent">
                <FilterChip
                  label="All"
                  count={agentScoped.length}
                  selected={agentFilter === "all"}
                  onSelect={() => setAgentFilter("all")}
                />
                {agents.map((agent) => (
                  <FilterChip
                    key={agent.id}
                    label={agent.label}
                    count={agent.count}
                    selected={agentFilter === agent.id}
                    onSelect={() => setAgentFilter(agent.id)}
                  />
                ))}
              </FilterGroup>

              <FilterGroup id={`${fieldId}-risk`} label="Risk">
                <FilterChip
                  label="Any"
                  count={riskCounts.all}
                  selected={riskFilter === "all"}
                  onSelect={() => setRiskFilter("all")}
                />
                {RISK_OPTIONS.map((level) => (
                  <FilterChip
                    key={level}
                    label={level}
                    count={riskCounts[level]}
                    selected={riskFilter === level}
                    onSelect={() => setRiskFilter(level)}
                  />
                ))}
              </FilterGroup>

              <FilterGroup id={`${fieldId}-status`} label="Status">
                <FilterChip
                  label="All"
                  count={dueCounts.all}
                  selected={dueFilter === "all"}
                  onSelect={() => setDueFilter("all")}
                />
                <FilterChip
                  label="Overdue"
                  count={dueCounts.overdue}
                  selected={dueFilter === "overdue"}
                  onSelect={() => setDueFilter("overdue")}
                />
                <FilterChip
                  label="Still in time"
                  count={dueCounts.due}
                  selected={dueFilter === "due"}
                  onSelect={() => setDueFilter("due")}
                />
              </FilterGroup>
            </div>
          )}

          {/* LOADING. Three grey cards on their own are indistinguishable from an
              empty queue at a glance, so the sentence above them is part of the
              state rather than decoration. */}
          {loading && !answered && (
            <div className={shell.list} aria-busy="true">
              <p className={styles.loadingLead}>
                <Loader2 size={13} className="oa-spin" aria-hidden />
                Loading the approvals queue…
              </p>
              {[0, 1, 2].map((index) => (
                <div key={index} className={`oa-card oa-card--flat ${styles.skelCard}`} aria-hidden>
                  <div className={styles.skelLine} style={{ width: "42%" }} />
                  <div className={styles.skelLine} style={{ width: "78%" }} />
                  <div className={styles.skelLine} style={{ width: "60%" }} />
                </div>
              ))}
            </div>
          )}

          {/* EMPTY, and only after a read that actually succeeded. */}
          {!loading && answered && !loadError && pending.length === 0 && (
            <EmptyInbox updateNote={updateNote} />
          )}

          {pending.length > 0 && visible.length === 0 && (
            <div className={shell.empty}>
              <Inbox size={20} aria-hidden />
              <p className={shell.emptyTitle}>Nothing matches these filters.</p>
              <p className="oa-sub">
                {pending.length} approval{pending.length === 1 ? " is" : "s are"} pending under a
                different agent, risk or status.
              </p>
              <button type="button" className="oa-btn oa-btn--ghost oa-btn--sm" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          )}

          {visible.length > 0 && (
            <div className={shell.list} role="list" aria-label="Pending approvals">
              {visible.map((item) => (
                <div role="listitem" key={item.approvalId}>
                  <ApprovalListCard
                    item={item}
                    agentName={plan === null ? null : plan.agentNames[item.agentId] ?? item.agentId}
                    focused={highlightId === item.approvalId}
                    onReview={openReview}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ══ Rail ══ */}
        <aside className={styles.railPane} aria-label="Status and guidance">
          <section className={`oa-card ${styles.railCard}`} aria-labelledby={`${fieldId}-runtime`}>
            <div className={styles.railHead}>
              <h2 className={`oa-micro ${styles.railHeading}`} id={`${fieldId}-runtime`}>
                Status
              </h2>
              {/* Not `disabled` while it works: disabling the control a keyboard
                  user just activated drops focus to the document body. */}
              <button
                type="button"
                className="oa-btn oa-btn--ghost oa-btn--sm"
                onClick={() => void refresh()}
                aria-busy={busyRefresh}
              >
                <RefreshCw size={13} className={busyRefresh ? "oa-spin" : ""} aria-hidden />
                Refresh
              </button>
            </div>
            <div className={styles.railRows}>
              <RailRow
                label="Waiting on you"
                value={answered ? String(pending.length) : "Not loaded"}
              />
              <RailRow
                label="Overdue"
                value={answered ? String(overdueCount) : "Not loaded"}
              />
              <RailRow label="Current time" value={inbox ? formatClock(inbox.now) : "—"} />
              <RailRow
                label="Last updated"
                value={readAt ? readAt.toLocaleTimeString() : "—"}
              />
            </div>

            {/* The connection, in a word and then a sentence. Colour reinforces
                the word; it never carries it. */}
            <div className={styles.streamRow}>
              <span className={`${styles.streamState} ${TONE_CLASS[stream.tone]}`}>
                {stream.label}
              </span>
              <button
                type="button"
                className={`oa-chip ${liveUpdates ? "oa-chip--selected" : ""}`}
                aria-pressed={liveUpdates}
                onClick={() => setLiveUpdates((current) => !current)}
              >
                Live updates
              </button>
            </div>
            {/* Announced when it changes, because an owner has to be told that
                the inbox in front of them stopped being pushed. The timestamp is
                deliberately outside the live region: it moves on every push, and
                a region that announced that would be noise rather than news. */}
            <p className={styles.streamDetail} aria-live="polite">
              {stream.detail}
            </p>
            {stream.changedAt !== null && (
              <p className={styles.streamDetail}>Last change seen at {stream.changedAt}.</p>
            )}

            {held && (
              <p className={styles.heldNote} role="status">
                Something changed while the review panel was open. The list was not refreshed
                underneath your edit; closing the panel picks the change up.
              </p>
            )}

            <p className="oa-sub">
              Overdue is worked out where your agents run, from each agent&apos;s escalation
              window against the time above — never recalculated in your browser, so the two
              cannot drift apart.
            </p>
          </section>

          {decided.length > 0 && (
            <section className={`oa-card ${styles.railCard}`} aria-labelledby={`${fieldId}-decided`}>
              <h2 className={`oa-micro ${styles.railHeading}`} id={`${fieldId}-decided`}>
                Decided in this session
              </h2>
              <ul className={styles.recentList}>
                {decided.map((entry) => (
                  <li key={entry.approvalId}>
                    <button
                      type="button"
                      className={styles.recentRow}
                      onClick={() => openReview(entry.approvalId)}
                    >
                      <span className={styles.recentTitle}>{entry.headline}</span>
                      <span className={styles.recentMeta}>
                        <span
                          className={`oa-status oa-status--${
                            entry.decision === "approved" ? "approved" : "neutral"
                          }`}
                        >
                          {entry.decision === "approved" ? "Approved" : "Rejected"}
                        </span>
                        {entry.edited && <span className="oa-tag">Edited</span>}
                        <span className="oa-sub">
                          Run: {runStatusMeta(entry.runStatus, entry.decision).label}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="oa-sub">
                Decided approvals leave the queue immediately. These stay until you reload the page.
              </p>
            </section>
          )}

          <section className={`oa-card ${styles.railCard}`} aria-labelledby={`${fieldId}-howto`}>
            <h2 className={`oa-micro ${styles.railHeading}`} id={`${fieldId}-howto`}>
              How an approval gets here
            </h2>
            <ol className={styles.stateSteps}>
              <li>
                A live agent starts a run — the Friday sweep, another workflow finishing,
                someone starting it by hand.
              </li>
              <li>
                A step it wants to take needs you: that is how the agent is set up, the action
                is on the list that always needs you, or one of your limits was passed.
              </li>
              <li>
                The run is saved exactly where it stopped and the decision appears here.
                Deciding it carries that same run on from where it stopped.
              </li>
            </ol>
            <div className={styles.railActions}>
              <Link href="/app/deploy" className="oa-btn oa-btn--ghost oa-btn--sm">
                <ShieldCheck size={13} aria-hidden />
                Go-live checks
              </Link>
              <Link href="/app/workspace/calendar?live=1" className="oa-btn oa-btn--ghost oa-btn--sm">
                <CalendarClock size={13} aria-hidden />
                Schedule
              </Link>
            </div>
          </section>
        </aside>
      </div>

      <ReviewDrawer
        approvalId={openId}
        open={openId !== null}
        plan={plan}
        onClose={closeDrawer}
        onDecided={onDecided}
        onFocusApproval={openReview}
      />
    </main>
  );
}

/* ═══════════════════════════ Pieces ═══════════════════════════ */

/**
 * One row of filter chips, as a named group.
 *
 * The label used to be a bare `<span>` carrying an id nothing referenced, so a
 * screen reader met three undifferentiated runs of toggle buttons and had to
 * infer from the words which was risk and which was status. `role="group"` plus
 * `aria-labelledby` is what makes "Risk — high, 3, not pressed" a sentence.
 */
function FilterGroup({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.filterRow} role="group" aria-labelledby={id}>
      <span className={styles.filterLabel} id={id}>
        {label}
      </span>
      {children}
    </div>
  );
}

function FilterChip({
  label,
  count,
  selected,
  onSelect,
}: {
  label: string;
  count: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`oa-chip ${selected ? "oa-chip--selected" : ""}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      {label}
      <span className={shell.chipCount}>{count}</span>
    </button>
  );
}

function RailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.railRow}>
      <span className={styles.railLabel}>{label}</span>
      <span className={styles.railValue}>{value}</span>
    </div>
  );
}
