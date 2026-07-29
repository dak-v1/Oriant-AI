/**
 * components/live/calendar/projection.ts — the month, derived exactly once
 * (ROLE_C_PLAN M7, "performance pass on the dense screens").
 *
 * THE MONTH GRID IS THE DENSEST THING IN THE PRODUCT, and the shape of the work
 * is what makes it worth pulling out here. A month is up to 42 cells; the route
 * will hand over as many as 600 events. Asking each cell "which of these 600 are
 * mine, and is any of them pressing" is 42 passes over the whole list — quadratic
 * in the only two numbers that grow — and it happens again on every re-render,
 * including the ones caused by a connection banner changing its wording while
 * nothing about the month moved at all. One pass, bucketed by day key, is linear
 * and is cached by the caller against the identity of the events array, which
 * only changes when a fetch actually returned something new.
 *
 * IT IS PURE AND TAKES NO CLOCK. `todayKey` arrives from the response because the
 * server's idea of today in the calendar's zone is the only one this lane is
 * allowed to have (see ./month.ts). Nothing here reads `Date.now()`, formats a
 * locale, or resolves a timezone.
 *
 * AN EVENT WITH NOWHERE TO GO IS COUNTED, NOT DROPPED. `outsideRange` exists
 * because bucketing by day key silently loses anything whose day is not a cell —
 * and a calendar that quietly forgets an approval is exactly the failure the
 * route's own `unplaceable` list was built to avoid one layer down. If this
 * number is ever non-zero the screen says so; it is a disagreement between the
 * range that was asked for and the range that came back, and it must not look
 * like a quiet week.
 *
 * THE SUMMARY SENTENCE IS PART OF THE PROJECTION, not of the markup. It is what a
 * screen reader hears when a day takes focus, and it is derived from the same
 * bucket the pills are drawn from — so the count spoken and the count shown
 * cannot disagree. Composing it in JSX would put it one refactor away from doing
 * exactly that.
 */

import type { CalendarEventView } from "./api";
import { buildGrid, dayLabelLong } from "./month";
import { STATE_META } from "./state-meta";

/** One cell: a day, whatever fell on it, and how to say so out loud. */
export interface DayProjection {
  dayKey: string;
  dayOfMonth: number;
  /** False for the leading and trailing days that only square the grid. */
  inRange: boolean;
  isToday: boolean;
  /** Everything on this day, in the route's own chronological order. */
  events: CalendarEventView[];
  /** The first `maxPills` of them — what the cell has room to draw. */
  shown: CalendarEventView[];
  /** How many `shown` left out. Zero when everything fits. */
  overflow: number;
  /** How many carry `STATE_META[...].pressing` — today, only an overdue decision. */
  pressing: number;
  /** What a screen reader hears first when this cell takes focus. */
  summary: string;
}

export interface MonthProjection {
  /** Whole weeks, Monday first. Every week has exactly seven days. */
  weeks: DayProjection[][];
  /** In-range day keys in order — the spine the keyboard moves along. */
  navigable: string[];
  /** Events that landed in a cell. */
  placed: number;
  /** Events whose `dayKey` is not a cell in this range. See the module header. */
  outsideRange: number;
  /** Across the whole range. Drives the empty state without a second pass. */
  pressing: number;
}

export interface ProjectionInput {
  from: string;
  to: string;
  /** The server's today, in the calendar's timezone. */
  todayKey: string;
  events: CalendarEventView[];
  /** How many pills a cell draws before it starts counting instead. */
  maxPills: number;
}

/**
 * Bucket a range's events into its cells.
 *
 * Returns an empty projection when the range cannot be laid out — the caller
 * renders the range's own refusal rather than a grid that might be wrong about
 * which day is which.
 */
export function projectMonth(input: ProjectionInput): MonthProjection {
  const cells = buildGrid(input.from, input.to);
  if (cells.length === 0) {
    return { weeks: [], navigable: [], placed: 0, outsideRange: 0, pressing: 0 };
  }

  /* One pass over the events, one over the cells. Nothing below is inside a
     nested loop over both. */
  const byDay = new Map<string, CalendarEventView[]>();
  for (const event of input.events) {
    const bucket = byDay.get(event.dayKey);
    if (bucket === undefined) byDay.set(event.dayKey, [event]);
    else bucket.push(event);
  }

  const weeks: DayProjection[][] = [];
  const navigable: string[] = [];
  let placed = 0;
  let pressingTotal = 0;

  for (let index = 0; index < cells.length; index += 7) {
    const week: DayProjection[] = [];
    for (const cell of cells.slice(index, index + 7)) {
      /* Out-of-range cells are drawn muted and are never given events, even if
         one happens to carry their day key: they fall outside what the server was
         asked about, so anything shown in them would be a fact about the query
         rather than about the schedule. */
      const events = cell.inRange ? (byDay.get(cell.dayKey) ?? []) : [];
      if (cell.inRange) {
        placed += events.length;
        navigable.push(cell.dayKey);
      }

      let pressing = 0;
      for (const event of events) {
        if (STATE_META[event.state].pressing) pressing += 1;
      }
      pressingTotal += pressing;

      const shown = events.length > input.maxPills ? events.slice(0, input.maxPills) : events;
      const isToday = cell.dayKey === input.todayKey;

      week.push({
        dayKey: cell.dayKey,
        dayOfMonth: cell.dayOfMonth,
        inRange: cell.inRange,
        isToday,
        events,
        shown,
        overflow: events.length - shown.length,
        pressing,
        summary: summarise(cell.dayKey, cell.inRange, isToday, events.length, pressing),
      });
    }
    weeks.push(week);
  }

  return {
    weeks,
    navigable,
    placed,
    outsideRange: input.events.length - placed,
    pressing: pressingTotal,
  };
}

/**
 * What a day says about itself.
 *
 * Short on purpose. The cell's visible content — a time, a title and a state word
 * per pill — is read after this, so repeating any of it here would make every
 * move of the arrow keys twice as long to listen to. What this adds is the two
 * things the pills cannot say: the full date (the grid shows a bare number) and
 * whether anything in the cell is past a deadline (which the pills say
 * individually and nobody wants to count by ear).
 */
function summarise(
  dayKey: string,
  inRange: boolean,
  isToday: boolean,
  count: number,
  pressing: number,
): string {
  const date = dayLabelLong(dayKey);
  if (!inRange) return `${date}. Outside the range this calendar was asked about.`;

  const what =
    count === 0
      ? "Nothing scheduled, run or falling due."
      : `${count} ${count === 1 ? "item" : "items"}.`;
  const late =
    pressing === 0
      ? ""
      : ` ${pressing} past ${pressing === 1 ? "its deadline" : "their deadlines"}.`;

  return `${date}${isToday ? ", today" : ""}. ${what}${late}`;
}
