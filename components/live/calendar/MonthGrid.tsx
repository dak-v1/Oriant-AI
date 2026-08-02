"use client";
/**
 * MonthGrid — density and state at a glance, for whatever range the route was
 * asked about (ROLE_C_PLAN M6, hardened in M7).
 *
 * The grid is built from the range's own day keys rather than from a month
 * constant, so the same component renders July, a fortnight, or a single week
 * without knowing which it is. Days outside the range are drawn muted and are
 * inert: they were not asked about, so their emptiness is a fact about the query
 * and not about the schedule, and a cell that looks quiet for the wrong reason is
 * the mistake this screen most has to avoid.
 *
 * NOTHING HERE COMPUTES A TIME. `timeLabel` and `dayKey` arrive from the server,
 * already in the calendar's zone. The only arithmetic in this file is counting
 * weekdays, which has no timezone in it (see ./month.ts), and the bucketing is
 * done once in ./projection.ts rather than per cell.
 *
 * ── M7: THE DAY IS THE FOCUSABLE THING, AND THERE IS ONE TAB STOP ──
 *
 * This grid used to give every cell a button and every pill another one. Six
 * weeks of that is upwards of a hundred tab stops between the toolbar and
 * whatever comes after the calendar, and a keyboard user looking for one overdue
 * decision had to walk through every quiet Tuesday in July to reach it. Tab order
 * that long is not "keyboard accessible"; it is keyboard accessible in the same
 * sense that a phone book is searchable.
 *
 * So the grid is a grid: `role="grid"` with real rows and column headers, ONE tab
 * stop, and a roving tabindex over the day cells. Arrows move a day at a time and
 * a week at a time, Home and End go to the ends of the week, PageUp and PageDown
 * change the month, and Enter or Space opens the day. That is the ARIA grid
 * pattern, and it is also how every calendar an owner has ever used behaves.
 *
 * THE PILLS ARE NOT SEPARATELY FOCUSABLE, AND THAT IS A DECISION WITH A COST.
 * A pill that carries a deep link is still a link — a mouse click on it still
 * goes straight to the approval — but it is out of the tab order. The
 * functionality is not lost, it moves: opening the day is one keystroke, and the
 * day view lists every item as a row with its state in words and its "Review
 * approval" link in the tab order. A list is the shape this content actually is;
 * a grid cell is a summary of one. What would be unacceptable is if the approval
 * were reachable ONLY by mouse, and it is not — the day view, the header's
 * "waiting on you" link and the Approvals inbox all reach it by keyboard.
 *
 * ONE RULE DECIDES WHAT A PILL DOES. An event the runtime gave a deep link — an
 * approval, or a run paused on one — IS that link. Everything else is inert text
 * inside the cell, because there is nowhere else honest to send it: this build
 * has no run detail screen, and a link to one that does not exist is worse than
 * no link.
 *
 * MEMOISED, AND FOR A REASON THAT IS NOT SUPERSTITION. Since M7 the screen above
 * holds a live connection whose status sentence changes on its own — connecting,
 * live, reconnecting, degraded. Every one of those is a re-render of the parent
 * in which nothing about the month has changed, and without `memo` each would
 * rebuild six weeks of cells. The projection is additionally cached against the
 * identity of the events array, so even a genuine re-render of this component
 * does not re-bucket the month unless a fetch returned something new.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import type { CalendarEventView } from "./api";
import { WEEKDAY_LONG, WEEKDAY_SHORT, weekdayIndex } from "./month";
import type { DayProjection } from "./projection";
import { projectMonth } from "./projection";
import { STATE_META, stateFill } from "./state-meta";
import styles from "./live-calendar.module.css";

/** How many pills fit before a cell starts counting instead of listing. */
const MAX_PILLS = 3;
const MAX_PILLS_COMPACT = 2;

export interface MonthGridProps {
  from: string;
  to: string;
  /** The server's today, in the calendar's timezone. */
  todayKey: string;
  events: CalendarEventView[];
  selectedDayKey: string | null;
  /** Opens a day. The same path a click and an Enter both take. */
  onSelectDay: (dayKey: string) => void;
  /** PageUp / PageDown. Handed up because the range belongs to the screen. */
  onStepMonth: (delta: number) => void;
  compact?: boolean;
  /**
   * Increment to pull DOM focus back into the grid — used when the day view
   * hands control back, so the reader lands on the day they came from rather
   * than at the top of the document.
   */
  focusNonce: number;
  /** "July 2026". Names the grid for anything that lists a page's landmarks. */
  rangeLabel: string;
}

function MonthGridImpl({
  from,
  to,
  todayKey,
  events,
  selectedDayKey,
  onSelectDay,
  onStepMonth,
  compact = false,
  focusNonce,
  rangeLabel,
}: MonthGridProps) {
  const maxPills = compact ? MAX_PILLS_COMPACT : MAX_PILLS;

  const projection = useMemo(
    () => projectMonth({ from, to, todayKey, events, maxPills }),
    [from, to, todayKey, events, maxPills],
  );
  const { weeks, navigable } = projection;

  /* ── Roving tabindex ──
     One day at a time holds `tabIndex={0}`; every other cell is reachable only
     with the arrow keys. `navigable` is contiguous, so a week is exactly seven
     steps along it and no date arithmetic is needed here. */
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const cells = useRef(new Map<string, HTMLDivElement>());
  /** Set only by a deliberate move, so nothing steals focus on a re-render. */
  const pendingFocus = useRef<string | null>(null);
  /**
   * PageUp / PageDown asked for a different range, and DOM focus has to be moved
   * after it. See the effect below for what happens when it is not.
   */
  const steppedRange = useRef(false);

  /* Which day the grid would give focus to if the reader tabbed into it: the
     selected day, else today, else the first day in the range. Recomputed
     whenever the range moves, because a focus key from last month is a cell that
     no longer exists. */
  const restingKey = useMemo(() => {
    if (navigable.length === 0) return null;
    if (focusKey !== null && navigable.includes(focusKey)) return focusKey;
    if (selectedDayKey !== null && navigable.includes(selectedDayKey)) return selectedDayKey;
    if (navigable.includes(todayKey)) return todayKey;
    return navigable[0];
  }, [focusKey, navigable, selectedDayKey, todayKey]);

  useEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (target === null) return;
    cells.current.get(target)?.focus();
  });

  /* The screen asking for focus back after the day view hands over.
     ZERO IS THE ONLY VALUE THAT MEANS "DO NOT", and it has to be, because this
     component UNMOUNTS while the day view is on screen: a guard that compared
     against the nonce seen at mount would find them equal on every return and
     quietly do nothing, leaving the reader at the top of the document. A first
     paint always carries zero, and only a hand-off ever increments it. */
  useEffect(() => {
    if (focusNonce === 0) return;
    const target =
      selectedDayKey !== null && navigable.includes(selectedDayKey)
        ? selectedDayKey
        : navigable[0];
    if (target === undefined) return;
    setFocusKey(target);
    cells.current.get(target)?.focus();
  }, [focusNonce, navigable, selectedDayKey]);

  /* ── After PageUp / PageDown ──
     The roving tab stop follows the new range on its own, because `restingKey`
     is derived from `navigable`. DOM FOCUS DOES NOT, and leaving it behind is
     not cosmetic — it strands the keyboard entirely, in one of two ways:

       - the focused day is in the NEW range's leading or trailing week (July 31
         is in August's first row), so React reconciles the same keyed cell into
         the out-of-range branch, which has no `onKeyDown` and no ref. Focus
         stays on a node where every arrow, Home, End and Enter now does
         nothing, and the only way out is to tab clear of the grid;
       - the focused day is in neither range, so the cell unmounts and the
         browser drops focus to `document.body` — the top of the document.

     Either way the reader pressed a documented key and lost their place. The
     flag is set by the keystroke and consumed here, on the render that has the
     new range, so nothing steals focus on an ordinary re-render. */
  useEffect(() => {
    if (!steppedRange.current) return;
    steppedRange.current = false;
    if (restingKey === null) return;
    setFocusKey(restingKey);
    cells.current.get(restingKey)?.focus();
  }, [navigable, restingKey]);

  const moveTo = useCallback((dayKey: string) => {
    pendingFocus.current = dayKey;
    setFocusKey(dayKey);
  }, []);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>, dayKey: string) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelectDay(dayKey);
        return;
      }
      if (event.key === "PageUp" || event.key === "PageDown") {
        event.preventDefault();
        // Set BEFORE the range changes; consumed by the effect above on the
        // render that has the new one.
        steppedRange.current = true;
        onStepMonth(event.key === "PageUp" ? -1 : 1);
        return;
      }

      const index = navigable.indexOf(dayKey);
      if (index < 0) return;

      const weekday = weekdayIndex(dayKey);
      let next: number | null = null;
      switch (event.key) {
        case "ArrowLeft":
          next = index - 1;
          break;
        case "ArrowRight":
          next = index + 1;
          break;
        case "ArrowUp":
          next = index - 7;
          break;
        case "ArrowDown":
          next = index + 7;
          break;
        case "Home":
          next = weekday === null ? 0 : index - weekday;
          break;
        case "End":
          next = weekday === null ? navigable.length - 1 : index + (6 - weekday);
          break;
        default:
          return;
      }

      event.preventDefault();
      /* Clamped, never wrapped. Falling off the end of a month onto its start is
         disorienting, and stopping at the last day is what every date picker a
         reader has used already does. */
      const clamped = Math.min(Math.max(next, 0), navigable.length - 1);
      const target = navigable[clamped];
      if (target !== undefined && target !== dayKey) moveTo(target);
    },
    [moveTo, navigable, onSelectDay, onStepMonth],
  );

  if (weeks.length === 0) {
    return (
      <p className="oa-sub" role="status">
        The range {from} to {to} could not be laid out as a calendar. Nothing was drawn rather than
        a grid that might be wrong about which day is which.
      </p>
    );
  }

  return (
    <>
      {projection.outsideRange > 0 && (
        <p className={styles.note} role="status">
          {projection.outsideRange}{" "}
          {projection.outsideRange === 1 ? "event falls" : "events fall"} on a day this grid does
          not contain, so {projection.outsideRange === 1 ? "it is" : "they are"} not drawn below.
          This calendar and the range it asked for disagree; the day view and the counts
          underneath still include {projection.outsideRange === 1 ? "it" : "them"}.
        </p>
      )}

      <p id="oa-cal-grid-help" className={styles.gridHelp}>
        Arrow keys move a day at a time and a week at a time, Home and End reach the ends of the
        week, Page Up and Page Down change the month, and Enter opens the focused day in full.
      </p>

      <div
        className={`${styles.grid} ${compact ? styles.gridCompact : ""}`}
        role="grid"
        aria-label={`${rangeLabel}, ${from} to ${to}`}
        aria-describedby="oa-cal-grid-help"
        /* The header row counts: it is a row, and a reader told "row 2 of 5"
           while standing on the first week would be told something false. */
        aria-rowcount={weeks.length + 1}
        aria-colcount={7}
      >
        <div className={styles.gridRow} role="row">
          {WEEKDAY_SHORT.map((weekday, index) => (
            <span key={weekday} className={styles.weekday} role="columnheader" aria-label={WEEKDAY_LONG[index]}>
              {weekday}
            </span>
          ))}
        </div>

        {weeks.map((week) => (
          <div className={styles.gridRow} role="row" key={week[0]?.dayKey ?? "week"}>
            {week.map((day) => (
              <DayCell
                key={day.dayKey}
                day={day}
                selected={day.dayKey === selectedDayKey}
                resting={day.dayKey === restingKey}
                onSelectDay={onSelectDay}
                onKeyDown={onKeyDown}
                register={cells.current}
              />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

export default memo(MonthGridImpl);

/* ═══════════════════════════ One day ═══════════════════════════ */

function DayCell({
  day,
  selected,
  resting,
  onSelectDay,
  onKeyDown,
  register,
}: {
  day: DayProjection;
  selected: boolean;
  /** True for the single cell that holds the grid's tab stop. */
  resting: boolean;
  onSelectDay: (dayKey: string) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>, dayKey: string) => void;
  register: Map<string, HTMLDivElement>;
}) {
  if (!day.inRange) {
    /* Still a gridcell: every row must have seven, or a screen reader's column
       arithmetic — "Wednesday, week 3" — stops being true. It is disabled rather
       than hidden, and it says what it is. */
    return (
      <div
        role="gridcell"
        aria-disabled
        className={`${styles.cell} ${styles.cellOut}`}
        tabIndex={-1}
      >
        <span className={styles.srOnly}>{day.summary}</span>
        <span className={`${styles.dayNum} ${styles.dayNumOut}`} aria-hidden>
          {day.dayOfMonth}
        </span>
      </div>
    );
  }

  return (
    <div
      role="gridcell"
      ref={(element) => {
        if (element === null) register.delete(day.dayKey);
        else register.set(day.dayKey, element);
      }}
      tabIndex={resting ? 0 : -1}
      aria-selected={selected}
      aria-current={day.isToday ? "date" : undefined}
      className={`${styles.cell} ${styles.cellIn} ${selected ? styles.cellSelected : ""}`}
      onClick={() => onSelectDay(day.dayKey)}
      onKeyDown={(event) => onKeyDown(event, day.dayKey)}
    >
      {/* Read first, so a reader moving through the month hears the date and the
          load before the individual pills. */}
      <span className={styles.srOnly}>{day.summary}</span>

      <span className={`${styles.dayNum} ${day.isToday ? styles.dayNumToday : ""}`} aria-hidden>
        {day.dayOfMonth}
      </span>
      {day.isToday && (
        <span className={styles.todayTag} aria-hidden>
          Today
        </span>
      )}
      {day.pressing > 0 && (
        <span className={styles.cellFlag} aria-hidden>
          Overdue
        </span>
      )}

      {day.events.length > 0 && (
        <div className={styles.pills}>
          {day.shown.map((event) => (
            <EventPill key={event.id} event={event} />
          ))}
          {day.overflow > 0 && (
            /* Not a control: the whole cell already opens the day, and a button
               inside a gridcell would be a second tab stop for the same action. */
            <span className={styles.more} aria-hidden>
              +{day.overflow} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════ One pill ═══════════════════════════ */

/**
 * A pill is a word, an icon and a border style before it is a colour.
 *
 * All three are rendered every time: the state's label sits under the title, the
 * icon differs for every state (see ./state-meta.ts), and `projected` is dashed
 * where `scheduled` is solid. Take the colour away and the pill still says which
 * of the ten states it is.
 */
function EventPill({ event }: { event: CalendarEventView }) {
  const meta = STATE_META[event.state];
  const Icon = meta.icon;

  const body = (
    <>
      <span className={styles.pillHead}>
        <Icon size={11} aria-hidden />
        <span className={styles.pillTime}>{event.timeLabel}</span>
        <span className={styles.pillTitle}>{event.title}</span>
      </span>
      <span className={styles.pillState}>{meta.label}</span>
    </>
  );

  if (event.href === null) {
    return (
      <span className={styles.pill} style={stateFill(event.state)}>
        {body}
      </span>
    );
  }

  /* Out of the tab order on purpose — see the module header. The click is a
     shortcut for a mouse; the keyboard route to the same approval is the day
     view, one Enter away. `stopPropagation` keeps the cell from also opening the
     day underneath the navigation. */
  return (
    <Link
      href={event.href}
      className={styles.pill}
      style={stateFill(event.state)}
      tabIndex={-1}
      onClick={(clickEvent) => clickEvent.stopPropagation()}
    >
      {body}
    </Link>
  );
}
