"use client";
/**
 * The scripted Automation Calendar (spec §18.2, §20 "Workspace").
 *
 * July 2026 month view (static demo month), team filter chips, the 5-state
 * legend, and a day-timeline drawer whose event detail links back to the
 * Approval Inbox. Approving a linked item here updates the pill live —
 * approvals, calendar and activity share one store.
 *
 * WHY IT IS IN THIS FILE RATHER THAN IN `page.tsx`. It used to BE the page. M6
 * gave this route a second, runtime-backed screen, so the page had to become a
 * server component to read the lane switch — and a server component cannot also
 * be this client component. The obvious home, `components/mock/calendar/`,
 * belongs to the scripted lane and is deliberately not edited by the live one:
 * ROLE_C_PLAN's integration checkpoints require the fixture path to keep working
 * permanently, and the safest way to honour that is to touch none of it. So the
 * screen moved the shortest distance it could, into its own route's directory,
 * with its markup, its store reads and its behaviour unchanged.
 */
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { CalendarEvent } from "@/lib/mock/types";
import { useDemoStore } from "@/lib/mock/store";
import { DEMO_MONTH_LABEL, DEMO_TODAY } from "@/lib/mock/fixtures/ids";
import { DUR, EASE } from "@/lib/mock/motion";
import Drawer from "@/components/mock/ui/Drawer";
import MonthCalendar from "@/components/mock/calendar/MonthCalendar";
import {
  STATE_META,
  STATE_ORDER,
  stateFill,
} from "@/components/mock/calendar/stateMeta";
import DayTimeline from "@/components/mock/calendar/DayTimeline";
import styles from "@/components/mock/calendar/calendar.module.css";

type TeamFilter = "all" | CalendarEvent["team"];

const TEAM_FILTERS: { id: TeamFilter; label: string }[] = [
  { id: "all", label: "All teams" },
  { id: "customer_care", label: "Customer Care" },
  { id: "admin", label: "Admin" },
  { id: "marketing", label: "Marketing" },
  { id: "finance", label: "Finance" },
];

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTH_NAMES: Record<string, string> = { "06": "June", "07": "July", "08": "August" };

/** "2026-07-24" → "Friday 24 July" (parsed from the fixture string, never now()). */
function formatDayLong(iso: string): string {
  const weekday = WEEKDAY_NAMES[new Date(`${iso}T12:00:00`).getDay()];
  return `${weekday} ${Number(iso.slice(8, 10))} ${MONTH_NAMES[iso.slice(5, 7)] ?? ""}`.trim();
}

export default function DemoCalendarScreen() {
  const reduced = useReducedMotion();
  const calendarEvents = useDemoStore((s) => s.workspace.calendarEvents);

  const [team, setTeam] = useState<TeamFilter>("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);

  /* ≤768px: the month grid switches to compact mode (spec §21). */
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setCompact(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const allEvents = useMemo(() => Object.values(calendarEvents), [calendarEvents]);

  const teamCounts = useMemo(() => {
    const counts: Record<TeamFilter, number> = {
      all: allEvents.length,
      customer_care: 0,
      admin: 0,
      marketing: 0,
      finance: 0,
    };
    for (const ev of allEvents) counts[ev.team] += 1;
    return counts;
  }, [allEvents]);

  const filtered = useMemo(
    () => (team === "all" ? allEvents : allEvents.filter((ev) => ev.team === team)),
    [allEvents, team],
  );

  const dayEvents = useMemo(
    () => (selectedDate ? filtered.filter((ev) => ev.date === selectedDate) : []),
    [filtered, selectedDate],
  );

  const openDay = (iso: string) => {
    setSelectedDate(iso);
    setExpandedEventId(null);
  };

  const openEvent = (id: string) => {
    const ev = calendarEvents[id];
    if (!ev) return;
    setSelectedDate(ev.date);
    setExpandedEventId(id);
  };

  const closeDrawer = () => {
    setSelectedDate(null);
    setExpandedEventId(null);
  };

  const entrance = (i: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: DUR.card, ease: EASE, delay: i * 0.06 },
        };

  return (
    <main className="oa-page">
      <header className="oa-between" style={{ marginBottom: 4, alignItems: "flex-start" }}>
        <div style={{ display: "grid", gap: 6 }}>
          <p className="oa-eyebrow">Operate · Automation Calendar</p>
          <h1 className="oa-h1">
            Automation <span className="oa-serif">calendar</span>
          </h1>
          <p className="oa-lead">
            Every scheduled run and held decision across your AI workforce, one month at a
            glance.
          </p>
        </div>

        <div className={styles.monthNav}>
          <button
            type="button"
            className="oa-btn oa-btn--ghost oa-btn--icon"
            disabled
            title="Sample month"
            aria-label="Previous month (sample month only)"
          >
            <ChevronLeft size={15} aria-hidden />
          </button>
          <span className={styles.monthLabel}>{DEMO_MONTH_LABEL}</span>
          <button
            type="button"
            className="oa-btn oa-btn--ghost oa-btn--icon"
            disabled
            title="Sample month"
            aria-label="Next month (sample month only)"
          >
            <ChevronRight size={15} aria-hidden />
          </button>
          <button
            type="button"
            className="oa-btn oa-btn--ghost oa-btn--sm"
            onClick={() => openDay(DEMO_TODAY)}
          >
            <CalendarDays size={14} aria-hidden />
            Today
          </button>
        </div>
      </header>

      <motion.div className={styles.toolbar} {...entrance(1)}>
        <div className={styles.teamChips} role="group" aria-label="Filter by team">
          {TEAM_FILTERS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`oa-chip ${team === t.id ? "oa-chip--selected" : ""}`}
              aria-pressed={team === t.id}
              onClick={() => setTeam(t.id)}
            >
              {t.label}
              <span className={styles.chipCount}>{teamCounts[t.id]}</span>
            </button>
          ))}
        </div>

        <div className={styles.legend} role="group" aria-label="Calendar event states">
          {STATE_ORDER.map((state) => {
            const meta = STATE_META[state];
            return (
              <span key={state} className={styles.legendItem} title={meta.treatment}>
                <span className={styles.legendSwatch} style={stateFill(state)} aria-hidden>
                  <meta.icon size={10} />
                </span>
                {meta.label}
              </span>
            );
          })}
        </div>
      </motion.div>

      <motion.section
        className={`oa-card ${styles.calCard}`}
        aria-label={`${DEMO_MONTH_LABEL} month view`}
        {...entrance(2)}
      >
        <MonthCalendar
          events={filtered}
          selectedDate={selectedDate}
          onSelectDate={openDay}
          onSelectEvent={openEvent}
          compact={compact}
        />
      </motion.section>

      <Drawer
        open={Boolean(selectedDate)}
        onClose={closeDrawer}
        wide
        eyebrow={`Day timeline · ${DEMO_MONTH_LABEL}`}
        title={selectedDate ? formatDayLong(selectedDate) : ""}
      >
        {selectedDate && (
          <DayTimeline
            events={dayEvents}
            expandedId={expandedEventId}
            onToggle={(id) => setExpandedEventId((cur) => (cur === id ? null : id))}
          />
        )}
      </Drawer>
    </main>
  );
}
