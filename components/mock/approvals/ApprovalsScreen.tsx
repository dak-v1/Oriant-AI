"use client";
/**
 * ApprovalsScreen — Approval Inbox + compact Automation Calendar split
 * (spec §18, §18.1; §20 "Workspace" motion row).
 *
 * Desktop ≥1024: left ~40% independently scrollable inbox, right ~60% sticky
 * compact month calendar with a selected-day strip. ≤768: "Approvals /
 * Calendar" tabs swap the panes. Selecting a calendar day adds a removable
 * "On {date}" chip that filters the inbox; approving anywhere morphs the
 * card in place while the linked calendar pill and the activity feed update
 * from the same store change.
 *
 * Deep link (C-02): /app/workspace/approvals?focus=<approvalId> scrolls the
 * card into view, opens its Review drawer and highlights it briefly. The
 * route wraps this component in <Suspense> for useSearchParams.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, CalendarDays, Inbox, X } from "lucide-react";
import type { ApprovalItem } from "@/lib/mock/types";
import { useDemoStore } from "@/lib/mock/store";
import { APPROVAL_FILTERS } from "@/lib/mock/fixtures/approvals";
import { DEMO_MONTH_LABEL, DEMO_TODAY } from "@/lib/mock/fixtures/ids";
import { DUR, EASE } from "@/lib/mock/motion";
import MonthCalendar from "@/components/mock/calendar/MonthCalendar";
import {
  STATE_META,
  STATE_ORDER,
  stateFill,
} from "@/components/mock/calendar/stateMeta";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { toast } from "@/components/mock/ui/Toaster";
import ApprovalCard from "./ApprovalCard";
import ReviewDrawer from "./ReviewDrawer";
import { dayLabel } from "./format";
import styles from "./approvals.module.css";

/** §18.1 filter chip ids → predicates over ApprovalItem. */
const FILTER_PRED: Record<string, (item: ApprovalItem) => boolean> = {
  all: () => true,
  assigned: (i) => i.flags.includes("assigned_to_me"),
  financial: (i) => i.flags.includes("financial"),
  marketing: (i) => i.team === "marketing",
  admin: (i) => i.team === "admin",
  high_value: (i) => i.flags.includes("high_value"),
  customer_facing: (i) => i.flags.includes("customer_facing"),
  due_today: (i) => i.dueAt === DEMO_TODAY,
};

export default function ApprovalsScreen() {
  const reduced = useReducedMotion();
  const searchParams = useSearchParams();
  const approvals = useDemoStore((s) => s.workspace.approvals);
  const calendarEvents = useDemoStore((s) => s.workspace.calendarEvents);
  const approveItem = useDemoStore((s) => s.approveItem);

  const [filterId, setFilterId] = useState("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [ownerDrafts, setOwnerDrafts] = useState<Record<string, string>>({});
  const [isMobile, setIsMobile] = useState(false);
  const [pane, setPane] = useState<"inbox" | "calendar">("inbox");
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const handledFocus = useRef<string | null>(null);
  const scrollTimer = useRef<number | null>(null);
  const highlightTimer = useRef<number | null>(null);

  /* Tabs: two-tab list with arrow-key support (spec §19). */
  const onPaneTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = pane === "inbox" ? "calendar" : "inbox";
    setPane(next);
    document.getElementById(`approvals-tab-${next}`)?.focus();
  };

  /* ≤768px: the split becomes Approvals / Calendar tabs (spec §21). */
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  /* ?focus=<approvalId> (C-02): reset filters so the card is visible, open
     its Review drawer, scroll it into view and highlight it briefly. */
  const focusParam = searchParams.get("focus");
  useEffect(() => {
    if (!focusParam || handledFocus.current === focusParam) return;
    handledFocus.current = focusParam;
    if (!approvals[focusParam]) return;
    setFilterId("all");
    setSelectedDate(null);
    setPane("inbox");
    setReviewId(focusParam);
    setHighlightId(focusParam);
    scrollTimer.current = window.setTimeout(() => {
      scrollTimer.current = null;
      document
        .getElementById(`oa-approval-${focusParam}`)
        ?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    }, 80);
    highlightTimer.current = window.setTimeout(() => {
      highlightTimer.current = null;
      setHighlightId(null);
    }, 2400);
  }, [focusParam, approvals, reduced]);

  /* Cancel focus timers on unmount. */
  useEffect(
    () => () => {
      if (scrollTimer.current !== null) window.clearTimeout(scrollTimer.current);
      if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    },
    [],
  );

  const items = useMemo(() => Object.values(approvals), [approvals]);
  const allEvents = useMemo(() => Object.values(calendarEvents), [calendarEvents]);

  const waitingCount = useMemo(
    () =>
      items.filter((i) => i.status === "pending" || i.status === "review_requested").length,
    [items],
  );

  /** Items on the selected calendar date (linked event date, else due date). */
  const dateFiltered = useMemo(() => {
    if (!selectedDate) return items;
    return items.filter((i) => {
      const eventDate = i.calendarEventId ? calendarEvents[i.calendarEventId]?.date : undefined;
      return eventDate === selectedDate || i.dueAt === selectedDate;
    });
  }, [items, calendarEvents, selectedDate]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const f of APPROVAL_FILTERS) {
      const pred = FILTER_PRED[f.id] ?? (() => true);
      out[f.id] = dateFiltered.filter(pred).length;
    }
    return out;
  }, [dateFiltered]);

  const visible = useMemo(() => {
    const pred = FILTER_PRED[filterId] ?? (() => true);
    return dateFiltered
      .filter(pred)
      .sort((a, b) => `${a.dueAt} ${a.dueTime}`.localeCompare(`${b.dueAt} ${b.dueTime}`));
  }, [dateFiltered, filterId]);

  const dayEvents = useMemo(
    () =>
      selectedDate
        ? allEvents
            .filter((ev) => ev.date === selectedDate)
            .sort((a, b) => a.time.localeCompare(b.time))
        : [],
    [allEvents, selectedDate],
  );

  /* ── Handlers ── */

  const selectDate = (iso: string) =>
    setSelectedDate((cur) => (cur === iso ? null : iso));

  const openEvent = (id: string) => {
    const ev = calendarEvents[id];
    if (!ev) return;
    setSelectedDate(ev.date);
    if (ev.approvalId && approvals[ev.approvalId]) {
      setReviewId(ev.approvalId);
      if (isMobile) setPane("inbox");
    }
  };

  const approve = (item: ApprovalItem) => {
    approveItem(item.id);
    toast({
      title: "Approved. Calendar and activity updated",
      detail: item.title,
      tone: "ok",
    });
  };

  const saveOwnerDraft = (approvalId: string, text: string) =>
    setOwnerDrafts((cur) => ({ ...cur, [approvalId]: text }));

  const clearFilters = () => {
    setFilterId("all");
    setSelectedDate(null);
  };

  const entrance = (i: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: DUR.card, ease: EASE, delay: i * 0.06 },
        };

  const showInbox = !isMobile || pane === "inbox";
  const showCalendar = !isMobile || pane === "calendar";

  /* ── Panes ── */

  const inboxPane = (
    <div className={styles.inboxPane}>
      <motion.div
        className={styles.filters}
        role="group"
        aria-label="Filter approvals"
        {...entrance(1)}
      >
        {APPROVAL_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`oa-chip ${filterId === f.id ? "oa-chip--selected" : ""}`}
            aria-pressed={filterId === f.id}
            onClick={() => setFilterId(f.id)}
          >
            {f.label}
            <span className={styles.chipCount}>{counts[f.id]}</span>
          </button>
        ))}
        {selectedDate && (
          <span className={`oa-chip oa-chip--selected ${styles.dateChip}`}>
            On {dayLabel(selectedDate)}
            <button
              type="button"
              className={styles.dateChipX}
              aria-label={`Remove date filter ${dayLabel(selectedDate)}`}
              onClick={() => setSelectedDate(null)}
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        )}
      </motion.div>

      <motion.div className={styles.inboxScroll} {...entrance(2)}>
        {visible.length === 0 ? (
          <div className={styles.empty}>
            <Inbox size={20} aria-hidden />
            <p className={styles.emptyTitle}>Nothing waiting on you here.</p>
            <p className="oa-sub">
              No approvals match this view{selectedDate ? " and date" : ""}.
            </p>
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--sm"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className={styles.list} role="feed" aria-busy={false} aria-label="Approval inbox">
            <AnimatePresence initial={false}>
              {visible.map((item, i) => (
                <ApprovalCard
                  key={item.id}
                  item={item}
                  index={i}
                  reduced={Boolean(reduced)}
                  highlight={highlightId === item.id}
                  onReview={() => setReviewId(item.id)}
                  onApprove={() => approve(item)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </div>
  );

  const calendarPane = (
    <div className={styles.calPane}>
      <motion.section
        className={`oa-card ${styles.calCard}`}
        aria-label={`${DEMO_MONTH_LABEL} automation calendar`}
        {...entrance(2)}
      >
        <div className={styles.calHead}>
          <div style={{ display: "grid", gap: 2 }}>
            <p className="oa-micro">Automation calendar</p>
            <p className={styles.calMonth}>{DEMO_MONTH_LABEL}</p>
          </div>
          <Link href="/app/workspace/calendar" className="oa-btn oa-btn--ghost oa-btn--sm">
            Full calendar
            <ArrowUpRight size={13} aria-hidden />
          </Link>
        </div>

        <MonthCalendar
          events={allEvents}
          selectedDate={selectedDate}
          onSelectDate={selectDate}
          onSelectEvent={openEvent}
          compact
        />

        <div className={styles.legendMini} role="group" aria-label="Calendar event states">
          {STATE_ORDER.map((state) => {
            const meta = STATE_META[state];
            return (
              <span key={state} className={styles.legendItem} title={meta.treatment}>
                <span className={styles.legendSwatch} style={stateFill(state)} aria-hidden>
                  <meta.icon size={9} />
                </span>
                {meta.label}
              </span>
            );
          })}
        </div>
      </motion.section>

      <AnimatePresence initial={false}>
        {selectedDate && (
          <motion.section
            key={selectedDate}
            className={`oa-panel ${styles.dayStrip}`}
            aria-label={`Scheduled on ${dayLabel(selectedDate)}`}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={{ duration: DUR.card * 0.7, ease: EASE }}
          >
            <div className={styles.dayStripHead}>
              <p className={styles.dayStripTitle}>
                <CalendarDays size={14} aria-hidden />
                {dayLabel(selectedDate)}
                {selectedDate === DEMO_TODAY ? " · Today" : ""}
              </p>
              <button
                type="button"
                className="oa-btn oa-btn--ghost oa-btn--icon"
                aria-label="Clear selected date"
                onClick={() => setSelectedDate(null)}
              >
                <X size={13} aria-hidden />
              </button>
            </div>

            {dayEvents.length === 0 ? (
              <p className="oa-sub">Nothing scheduled this day.</p>
            ) : (
              <ul className={styles.dayList}>
                {dayEvents.map((ev) => {
                  const linked = ev.approvalId ? approvals[ev.approvalId] : undefined;
                  const meta = STATE_META[ev.state];
                  const inner = (
                    <>
                      <span className={styles.dayIcon} style={stateFill(ev.state)} aria-hidden>
                        <meta.icon size={10} />
                      </span>
                      <span className={styles.dayTime}>{ev.time}</span>
                      <span className={styles.dayTitle}>{ev.title}</span>
                      <StatusBadge status={ev.state} />
                    </>
                  );
                  return (
                    <li key={ev.id}>
                      {linked ? (
                        <button
                          type="button"
                          className={styles.dayEvent}
                          onClick={() => {
                            setReviewId(linked.id);
                            if (isMobile) setPane("inbox");
                          }}
                        >
                          {inner}
                        </button>
                      ) : (
                        <div className={styles.dayEvent}>{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className={styles.dayNote}>Approvals are filtered to this date.</p>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <main className="oa-page">
      <header className="oa-between" style={{ marginBottom: 20, alignItems: "flex-start" }}>
        <div style={{ display: "grid", gap: 6 }}>
          <p className="oa-eyebrow">Operate · Approval Inbox</p>
          <h1 className="oa-h1">
            Approval <span className="oa-serif">inbox</span>
          </h1>
          <p className="oa-lead">
            Every decision your agents are holding for you, next to the day it runs.
          </p>
        </div>
        <div className={styles.headSide}>
          {waitingCount > 0 ? (
            <span className="oa-tag oa-tag--amber">{waitingCount} waiting on you</span>
          ) : (
            <span className="oa-tag oa-tag--teal">All clear</span>
          )}
        </div>
      </header>

      {isMobile && (
        <div className={styles.mobileTabs}>
          <div
            className="oa-tabs"
            role="tablist"
            aria-label="Approvals or calendar"
            onKeyDown={onPaneTabKey}
          >
            <button
              type="button"
              role="tab"
              id="approvals-tab-inbox"
              aria-selected={pane === "inbox"}
              tabIndex={pane === "inbox" ? 0 : -1}
              className={`oa-tab ${pane === "inbox" ? "oa-tab--active" : ""}`}
              onClick={() => setPane("inbox")}
            >
              Approvals{waitingCount > 0 ? ` · ${waitingCount}` : ""}
            </button>
            <button
              type="button"
              role="tab"
              id="approvals-tab-calendar"
              aria-selected={pane === "calendar"}
              tabIndex={pane === "calendar" ? 0 : -1}
              className={`oa-tab ${pane === "calendar" ? "oa-tab--active" : ""}`}
              onClick={() => setPane("calendar")}
            >
              Calendar
            </button>
          </div>
        </div>
      )}

      <div className={styles.split}>
        {showInbox && inboxPane}
        {showCalendar && calendarPane}
      </div>

      <ReviewDrawer
        item={reviewId ? approvals[reviewId] ?? null : null}
        open={reviewId !== null}
        onClose={() => setReviewId(null)}
        ownerDraft={reviewId ? ownerDrafts[reviewId] : undefined}
        onSaveOwnerDraft={saveOwnerDraft}
      />
    </main>
  );
}
