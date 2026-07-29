/**
 * components/live/calendar/month.ts — calendar counting, with no timezone in it.
 *
 * Every function here takes and returns a DAY KEY: "2026-07-24", already resolved
 * by the server in the calendar's own zone. That is what makes the arithmetic
 * below safe to do in a browser. Turning an instant into a day is a question
 * about a timezone and belongs on the server; asking which weekday the 24th of
 * July 2026 is, or what comes a month before it, is arithmetic over a civil
 * calendar and has no zone in it at all.
 *
 * `Date.UTC` is used as the counting machine for exactly that reason — the same
 * trick `addDays` and `weekdayOf` use in lib/runtime/schedule/cron.ts. Nothing
 * here ever constructs a `Date` from the reader's locale, and nothing here reads
 * a clock: "today" arrives from the response as `todayKey`, because the server's
 * idea of today in Singapore is the only one this screen is allowed to have.
 *
 * Month and weekday names are fixed English rather than `toLocaleString`. Two
 * reasons: a server-rendered month label that disagrees with the client's locale
 * is a hydration mismatch, and the rest of the product spells its months this way
 * already.
 */

const MS_PER_DAY = 86_400_000;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Monday-first, matching the grid. */
export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/**
 * The same seven, spelled out. Exported because the grid's column headers show
 * the abbreviation and must ANNOUNCE the whole word: "Mon" is read by at least
 * one screen reader as the word "mon", and a column header is the one label a
 * grid user hears on every cell they move to.
 */
export const WEEKDAY_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Null when the text is not a real calendar day — never a silently rolled-over one. */
export function dayKeyMs(dayKey: string): number | null {
  if (!DAY_PATTERN.test(dayKey)) return null;
  const year = Number(dayKey.slice(0, 4));
  const month = Number(dayKey.slice(5, 7));
  const day = Number(dayKey.slice(8, 10));
  const ms = Date.UTC(year, month - 1, day);
  const back = new Date(ms);
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() + 1 !== month ||
    back.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
}

export function msDayKey(ms: number): string {
  const at = new Date(ms);
  return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
}

/** `null` in, `null` out: a caller holding an unreadable key must not get a plausible one. */
export function addDays(dayKey: string, count: number): string | null {
  const ms = dayKeyMs(dayKey);
  return ms === null ? null : msDayKey(ms + count * MS_PER_DAY);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(dayKey: string): number | null {
  const ms = dayKeyMs(dayKey);
  if (ms === null) return null;
  return (new Date(ms).getUTCDay() + 6) % 7;
}

export function dayOfMonth(dayKey: string): number | null {
  const ms = dayKeyMs(dayKey);
  return ms === null ? null : new Date(ms).getUTCDate();
}

/* ═══════════════════════════ Months ═══════════════════════════ */

/** "2026-07" from "2026-07-24". */
export function monthKeyOf(dayKey: string): string {
  return dayKey.slice(0, 7);
}

/** The inclusive first and last day of a month. */
export function monthRange(monthKey: string): { from: string; to: string } | null {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return null;
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  if (month < 1 || month > 12) return null;
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${monthKey}-01`, to: `${monthKey}-${pad(lastDay)}` };
}

/** The month `delta` months away. Null when `monthKey` is not one. */
export function shiftMonth(monthKey: string, delta: number): string | null {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return null;
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  if (month < 1 || month > 12) return null;
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}`;
}

/* ═══════════════════════════ Words ═══════════════════════════ */

/** "July 2026", or the raw key when it is not a month. */
export function monthLabel(monthKey: string): string {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return monthKey;
  const month = Number(monthKey.slice(5, 7));
  const name = MONTH_NAMES[month - 1];
  return name === undefined ? monthKey : `${name} ${monthKey.slice(0, 4)}`;
}

/** "Friday 24 July 2026", or the raw key when it is not a day. */
export function dayLabelLong(dayKey: string): string {
  const index = weekdayIndex(dayKey);
  const day = dayOfMonth(dayKey);
  const month = Number(dayKey.slice(5, 7));
  const weekday = index === null ? undefined : WEEKDAY_LONG[index];
  const name = MONTH_NAMES[month - 1];
  if (weekday === undefined || day === null || name === undefined) return dayKey;
  return `${weekday} ${day} ${name} ${dayKey.slice(0, 4)}`;
}

/** "Fri 24 Jul", for a compact heading. */
export function dayLabelShort(dayKey: string): string {
  const index = weekdayIndex(dayKey);
  const day = dayOfMonth(dayKey);
  const month = Number(dayKey.slice(5, 7));
  const weekday = index === null ? undefined : WEEKDAY_SHORT[index];
  const name = MONTH_NAMES[month - 1];
  if (weekday === undefined || day === null || name === undefined) return dayKey;
  return `${weekday} ${day} ${name.slice(0, 3)}`;
}

/* ═══════════════════════════ The grid ═══════════════════════════ */

export interface GridCell {
  dayKey: string;
  dayOfMonth: number;
  /** False for the leading and trailing days that only exist to square the grid. */
  inRange: boolean;
}

/**
 * A Monday-first grid covering the whole range, padded to whole weeks.
 *
 * The padding days are rendered muted and are NOT clickable, because they fall
 * outside the range the server was asked about: their emptiness is an artefact of
 * the query, not a fact about the schedule, and a day that looks empty for the
 * wrong reason is the mistake this screen most has to avoid.
 *
 * Returns an empty array rather than throwing when either bound is unreadable —
 * the caller renders the range's own error instead of a broken month.
 */
export function buildGrid(from: string, to: string): GridCell[] {
  const fromMs = dayKeyMs(from);
  const toMs = dayKeyMs(to);
  const leading = weekdayIndex(from);
  const trailing = weekdayIndex(to);
  if (fromMs === null || toMs === null || leading === null || trailing === null) return [];
  if (toMs < fromMs) return [];

  const startMs = fromMs - leading * MS_PER_DAY;
  const endMs = toMs + (6 - trailing) * MS_PER_DAY;

  const cells: GridCell[] = [];
  for (let ms = startMs; ms <= endMs; ms += MS_PER_DAY) {
    const dayKey = msDayKey(ms);
    cells.push({
      dayKey,
      dayOfMonth: new Date(ms).getUTCDate(),
      inRange: ms >= fromMs && ms <= toMs,
    });
  }
  return cells;
}
