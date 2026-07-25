"use client";
/**
 * MonthCalendar — the reusable July 2026 month grid (spec §17.1, §18.2).
 *
 * Google-Calendar-familiar, Oriant-styled. The grid layout is derived
 * STATICALLY from DEMO_MONTH: 2026-07-01 is a Wednesday and July has 31
 * days, so a Monday-first grid carries leading Jun 29–30 and trailing
 * Aug 1–2 as muted cells (never `new Date()` with no args).
 *
 * Also imported by the Approvals screen in `compact` mode (2 slim pills
 * + "+N" overflow per day). State colours + icons come exclusively from
 * ./stateMeta (C-01) and every pill carries its state as accessible
 * text — colour is never the only signal (spec §21).
 */
import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { CalendarEvent } from "@/lib/mock/types";
import { DEMO_MONTH, DEMO_MONTH_LABEL, DEMO_TODAY } from "@/lib/mock/fixtures/ids";
import { DUR, EASE } from "@/lib/mock/motion";
import { STATE_META, stateFill } from "./stateMeta";
import styles from "./calendar.module.css";

/* ── Static July 2026 grid (Monday-first, 5 weeks × 7 days) ── */

const pad2 = (n: number) => String(n).padStart(2, "0");

interface GridCell {
  iso: string;
  day: number;
  inMonth: boolean;
}

const GRID_CELLS: GridCell[] = [
  { iso: "2026-06-29", day: 29, inMonth: false },
  { iso: "2026-06-30", day: 30, inMonth: false },
  ...Array.from({ length: 31 }, (_, i) => ({
    iso: `${DEMO_MONTH}-${pad2(i + 1)}`,
    day: i + 1,
    inMonth: true,
  })),
  { iso: "2026-08-01", day: 1, inMonth: false },
  { iso: "2026-08-02", day: 2, inMonth: false },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_FULL = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/** Non-compact cells show up to 4 pills; compact cells show 2 + "+N". */
const MAX_PILLS = 4;
const MAX_PILLS_COMPACT = 2;

export default function MonthCalendar({
  events,
  selectedDate = null,
  onSelectDate,
  onSelectEvent,
  compact = false,
}: {
  events: CalendarEvent[];
  selectedDate?: string | null;
  onSelectDate: (isoDate: string) => void;
  onSelectEvent?: (id: string) => void;
  compact?: boolean;
}) {
  const reduced = useReducedMotion();

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const list = map.get(ev.date);
      if (list) list.push(ev);
      else map.set(ev.date, [ev]);
    }
    for (const list of map.values()) list.sort((a, b) => a.time.localeCompare(b.time));
    return map;
  }, [events]);

  const maxPills = compact ? MAX_PILLS_COMPACT : MAX_PILLS;

  return (
    <div
      role="group"
      className={`${styles.gridOuter} ${compact ? styles.gridCompact : ""}`}
      aria-label={`${DEMO_MONTH_LABEL} automation calendar`}
    >
      {WEEKDAYS.map((w) => (
        <span key={w} className={styles.weekday} aria-hidden>
          {w}
        </span>
      ))}

      {GRID_CELLS.map((cell, idx) => {
        if (!cell.inMonth) {
          return (
            <div key={cell.iso} className={`${styles.cell} ${styles.cellOut}`} aria-hidden>
              <span className={`${styles.dayNum} ${styles.dayNumOut}`}>{cell.day}</span>
            </div>
          );
        }

        const dayEvents = byDate.get(cell.iso) ?? [];
        const shown = dayEvents.slice(0, maxPills);
        const overflow = dayEvents.length - shown.length;
        const isToday = cell.iso === DEMO_TODAY;
        const isSelected = selectedDate === cell.iso;
        const weekday = WEEKDAYS_FULL[idx % 7];
        const countText =
          dayEvents.length === 0
            ? "nothing scheduled"
            : `${dayEvents.length} scheduled item${dayEvents.length > 1 ? "s" : ""}`;

        return (
          <div
            key={cell.iso}
            className={`${styles.cell} ${isSelected ? styles.cellSelected : ""}`}
          >
            <button
              type="button"
              className={styles.cellHit}
              aria-label={`${weekday} ${cell.day} July${isToday ? ", today" : ""}, ${countText}`}
              aria-pressed={isSelected}
              onClick={() => onSelectDate(cell.iso)}
            >
              <span
                className={`${styles.dayNum} ${isToday ? styles.dayNumToday : ""}`}
                aria-hidden
              >
                {cell.day}
              </span>
              {isToday && !compact && (
                <span className={styles.todayTag} aria-hidden>
                  Today
                </span>
              )}
            </button>

            {dayEvents.length > 0 && (
              <div className={styles.pills}>
                {shown.map((ev) => {
                  const meta = STATE_META[ev.state];
                  return (
                    <motion.button
                      /* keyed on state so a live state change re-enters softly */
                      key={`${ev.id}-${ev.state}`}
                      type="button"
                      initial={reduced ? false : { opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: DUR.micro, ease: EASE }}
                      className={compact ? styles.pillSlim : styles.pill}
                      style={stateFill(ev.state)}
                      title={`${ev.title} (${meta.label})`}
                      aria-label={`${ev.time}, ${ev.title}, ${meta.label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectEvent) onSelectEvent(ev.id);
                        else onSelectDate(ev.date);
                      }}
                    >
                      {compact ? (
                        <>
                          <meta.icon size={10} aria-hidden />
                          <span className={styles.pillTitle}>{ev.title}</span>
                        </>
                      ) : (
                        <>
                          <span className={styles.pillHead}>
                            <meta.icon size={11} aria-hidden />
                            <span className={styles.pillTime}>{ev.time}</span>
                            <span className={styles.pillTitle}>{ev.title}</span>
                          </span>
                          <span className={styles.pillState}>{meta.label}</span>
                        </>
                      )}
                    </motion.button>
                  );
                })}
                {overflow > 0 && (
                  <span className={styles.more}>
                    +{overflow} more
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
