/**
 * lib/runtime/schedule/cron.ts — when a cron expression is next due (ROLE_C_PLAN M4).
 *
 * One exported function, and the reason it is hand-rolled rather than a
 * dependency is the reason this file is worth reading.
 *
 * IT ACCEPTS EXACTLY WHAT THE GATE ACCEPTS. `isValidCron` in lib/plan/validate.ts
 * defines a deliberately small 5-field grammar — star, star-slash step, range,
 * bare number, and comma lists of those — and validator rule 4 blocks any plan
 * whose cron falls outside it. A general cron library would happily parse `@weekly`,
 * `L`, `5#3` or a seconds field, so a plan could then be scheduled on a grammar the
 * handoff gate never sanctioned; conversely a stricter parser here would refuse to
 * schedule plans the gate has already passed as runnable. Either direction is drift
 * between the two halves of the same promise. So this module does not re-implement
 * the acceptance test at all: it calls `isValidCron` and only then parses. A bug in
 * the parser below can make it reject something the gate accepted — loud, and
 * caught at activation — but it can never make it accept something the gate refused.
 *
 * THE TIMEZONE IS THE HARD PART. A cron is a wall-clock statement ("Friday at
 * nine, Singapore time") and the runtime needs a UTC instant. Between those two
 * sits the tz database, and the only copy of it available without adding a
 * dependency is the platform's own, reachable through `Intl.DateTimeFormat` with a
 * `timeZone` — the same instrument `localMinutes` in lib/runtime/policy.ts already
 * uses for quiet hours. Everything below is built out of two primitives: read the
 * wall clock at an instant, and search for the instant that produces a wall clock.
 *
 * DST IS NOT GLOSSED. Twice a year a wall-clock time either does not exist or
 * exists twice, and a scheduler that has not decided what it does then has decided
 * by accident. The decisions, stated once so they can be argued with:
 *
 *   SPRING FORWARD — a wall clock inside the gap (02:30 on a day where 02:00 jumps
 *   straight to 03:00) fires at the instant the clocks jump, i.e. the first instant
 *   that exists after the gap. It is not skipped. A daily 02:30 sweep silently not
 *   running one day a year is the kind of absence nobody notices until it matters,
 *   and this matches what crontab has always done with clock-skipped fixed-time
 *   jobs. Where several cron minutes fall inside one gap they all collapse onto
 *   that same instant — which costs nothing, because `TriggerEvent.idempotencyKey`
 *   is derived from the fire instant, so the executor refuses the duplicates at the
 *   one place duplicates are refused.
 *
 *   FALL BACK — a wall clock that happens twice (01:30 on a day where 02:00 returns
 *   to 01:00) fires at the FIRST of the two, and the second occurrence never fires.
 *   Once, and early. Firing both would be two runs of a job the owner asked to run
 *   once, and the two instants are genuinely different so the idempotency key
 *   cannot save us there; this is the one DST case that has to be decided by the
 *   arithmetic rather than caught downstream.
 *
 * THE DAY-OF-MONTH / DAY-OF-WEEK UNION is crontab's oldest trap. When BOTH fields
 * are restricted the day matches if EITHER matches, not both — `0 0 1,15 * 5` is
 * the 1st, the 15th, AND every Friday. Read as an intersection instead, the Friday
 * sweep would fire on whichever Fridays happened to also satisfy a day-of-month
 * term, which is to say almost never, and the failure would look like a scheduler
 * that simply forgot. "Restricted" means the field does not begin with `*`, which
 * is the test Vixie cron itself applies; it carries Vixie's quirk that a star-slash
 * step counts as unrestricted even though it plainly restricts something, because
 * Vixie tests the field's first character. Faithful beats clever
 * here: the convention is only useful if everyone implements the same one.
 *
 * PURE AND CLOCK-FREE. `after` is a parameter, never `Date.now()`. Determinism is
 * an M3 exit criterion and this module is on the path of every scheduled run.
 */

import { isValidCron } from "../../plan/validate";

/**
 * Raised when the expression or the zone cannot be scheduled AT ALL, as opposed
 * to a well-formed expression that simply has no next occurrence. The caller's
 * response differs: an unschedulable trigger is a handoff defect somebody must
 * fix and activation must refuse to register it, whereas `null` is an answer.
 */
export class CronError extends Error {
  readonly code = "cron_error";

  constructor(message: string) {
    super(message);
    this.name = "CronError";
  }
}

/* ═══════════════════════════ The grammar ═══════════════════════════ */

/** minute, hour, day-of-month, month, day-of-week — the order of the fields. */
const FIELD_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  // 0 and 7 both spell Sunday in crontab; 7 is normalised to 0 below so the
  // weekday from the calendar (0-6) can be compared directly.
  [0, 7],
];

interface CronFields {
  /** Every set is sorted ascending, which is what makes "first match wins". */
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  /** 0-6, Sunday first. */
  daysOfWeek: number[];
  /** See the union rule in the header: "does not begin with `*`". */
  domRestricted: boolean;
  dowRestricted: boolean;
}

function inclusiveRange(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let value = from; value <= to; value += step) out.push(value);
  return out;
}

/**
 * One comma-separated term. Every numeric conversion here is safe because
 * `isValidCron` has already proved the shape; parsing is not the place to
 * re-litigate acceptance.
 */
function parseTerm(term: string, min: number, max: number): number[] {
  if (term === "*") return inclusiveRange(min, max, 1);
  if (term.startsWith("*/")) return inclusiveRange(min, max, Number(term.slice(2)));

  const dash = term.indexOf("-");
  if (dash > 0) {
    return inclusiveRange(Number(term.slice(0, dash)), Number(term.slice(dash + 1)), 1);
  }
  return [Number(term)];
}

function parseField(field: string, min: number, max: number): number[] {
  const values = new Set<number>();
  for (const term of field.split(",")) {
    for (const value of parseTerm(term, min, max)) values.add(value);
  }
  return [...values].sort((a, b) => a - b);
}

function parseCron(expression: string): CronFields {
  const fields = expression.trim().split(/\s+/);
  const bounds = (index: number): readonly [number, number] => {
    const range = FIELD_RANGES[index];
    // Unreachable: isValidCron proved there are exactly five fields. Kept so the
    // index access is honest rather than asserted away.
    if (!range) throw new CronError(`Cron "${expression}" has no field at position ${index}.`);
    return range;
  };

  const read = (index: number): number[] => {
    const field = fields[index] ?? "*";
    const [min, max] = bounds(index);
    return parseField(field, min, max);
  };

  // 7 and 0 are the same day. Normalising to 0 keeps the comparison against the
  // calendar's own weekday a plain membership test.
  const daysOfWeek = [...new Set(read(4).map((day) => (day === 7 ? 0 : day)))].sort(
    (a, b) => a - b,
  );

  return {
    minutes: read(0),
    hours: read(1),
    daysOfMonth: read(2),
    months: read(3),
    daysOfWeek,
    domRestricted: !(fields[2] ?? "*").startsWith("*"),
    dowRestricted: !(fields[4] ?? "*").startsWith("*"),
  };
}

/* ═══════════════════════════ Zone arithmetic ═══════════════════════════ */

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** A civil date with no instant attached — the thing the day fields match on. */
interface CivilDay {
  year: number;
  month: number;
  day: number;
}

const MS_PER_SECOND = 1_000;
const MS_PER_DAY = 86_400_000;
const MINUTES_PER_DAY = 1_440;

/**
 * Formatters are expensive to construct and this module builds one per zone per
 * call otherwise. A pure memo: it changes nothing observable, which is what keeps
 * two identical verify runs byte-identical.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timezone);
  if (cached) return cached;

  let created: Intl.DateTimeFormat;
  try {
    created = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      // Not `hour12: false`, which renders midnight as "24" on several engines
      // and would silently move every midnight cron to the wrong day.
      hourCycle: "h23",
    });
  } catch {
    throw new CronError(
      `"${timezone}" is not an IANA timezone this platform's tz database knows, so no ` +
        `wall-clock time can be resolved for it. Validator rule 4 (lib/plan/validate.ts) ` +
        `should have refused this plan at the handoff gate.`,
    );
  }

  formatters.set(timezone, created);
  return created;
}

function wallClockAt(ms: number, formatter: Intl.DateTimeFormat): WallClock {
  const parts = formatter.formatToParts(new Date(ms));
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    return part ? Number(part.value) : 0;
  };

  const hour = read("hour");
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    // h23 should never yield 24; costs one comparison to be sure it cannot.
    hour: hour === 24 ? 0 : hour,
    minute: read("minute"),
    second: read("second"),
  };
}

/**
 * The zone's offset at an instant, in milliseconds, as `local - UTC`.
 *
 * Computed by reading the wall clock and re-interpreting it AS IF it were UTC:
 * the difference between that and the real instant is the offset. Floored to the
 * second first, because the wall clock carries no sub-second component and an
 * unfloored input would fold the millisecond remainder into the answer — which
 * would break the equality comparisons the transition search below depends on.
 */
function offsetAt(ms: number, formatter: Intl.DateTimeFormat): number {
  const floored = Math.floor(ms / MS_PER_SECOND) * MS_PER_SECOND;
  const wall = wallClockAt(floored, formatter);
  return (
    Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second) - floored
  );
}

/**
 * The instant at which the offset changes, somewhere in `(lo, hi]`.
 *
 * Binary search rather than arithmetic because an offset change is a step
 * function with no closed form: the tz database is the only authority on when a
 * zone jumps, and the only question it answers is "what is the offset at this
 * instant". Searched in whole seconds — every transition in the database lands on
 * one — so this settles in about a dozen probes over a gap of an hour or two.
 *
 * The caller guarantees the offsets at the two ends differ, and that no second
 * transition sits between them: the window here is the width of a single DST
 * shift, and no zone shifts twice within that.
 */
function transitionBetween(lo: number, hi: number, formatter: Intl.DateTimeFormat): number {
  const before = offsetAt(lo, formatter);
  let low = Math.floor(lo / MS_PER_SECOND);
  let high = Math.ceil(hi / MS_PER_SECOND);

  while (high - low > 1) {
    const mid = low + Math.floor((high - low) / 2);
    if (offsetAt(mid * MS_PER_SECOND, formatter) === before) low = mid;
    else high = mid;
  }
  return high * MS_PER_SECOND;
}

/**
 * The UTC instant for one wall-clock minute in the zone.
 *
 * Two candidates are built from the offsets a day either side of the target — far
 * enough apart to bracket any DST shift near it, close enough that only one shift
 * can sit between them. Then:
 *
 *   both candidates read back as the target → the time happens twice (fall back);
 *                                             the EARLIER one is returned.
 *   one reads back                          → the ordinary case.
 *   neither reads back                      → the time does not exist (spring
 *                                             forward); the instant the clocks
 *                                             jump is returned.
 *
 * Round-tripping is the test rather than trusting the arithmetic, because the
 * arithmetic cannot tell the three cases apart on its own.
 */
function instantForWallClock(
  day: CivilDay,
  hour: number,
  minute: number,
  formatter: Intl.DateTimeFormat,
  timezone: string,
): number {
  const asIfUtc = Date.UTC(day.year, day.month - 1, day.day, hour, minute, 0, 0);
  const before = offsetAt(asIfUtc - MS_PER_DAY, formatter);
  const after = offsetAt(asIfUtc + MS_PER_DAY, formatter);

  const candidates =
    before === after
      ? [asIfUtc - before]
      : [asIfUtc - before, asIfUtc - after].sort((a, b) => a - b);

  for (const candidate of candidates) {
    const wall = wallClockAt(candidate, formatter);
    if (
      wall.year === day.year &&
      wall.month === day.month &&
      wall.day === day.day &&
      wall.hour === hour &&
      wall.minute === minute
    ) {
      return candidate;
    }
  }

  const lo = candidates[0];
  const hi = candidates[candidates.length - 1];
  if (lo === undefined || hi === undefined || lo === hi) {
    // With a single candidate the offset is constant across the whole window, so
    // the candidate must read back as the target. Reaching here means the zone
    // behaved in a way this arithmetic does not model, and guessing an instant
    // for a scheduled run is worse than refusing to produce one.
    throw new CronError(
      `Could not resolve ${format(day)} ${pad(hour)}:${pad(minute)} in "${timezone}" to a UTC ` +
        `instant: the zone reported one offset for the surrounding day but a different local ` +
        `time for the instant that offset implies.`,
    );
  }
  return transitionBetween(lo, hi, formatter);
}

/* ═══════════════════════════ Calendar walking ═══════════════════════════ */

/**
 * Civil-date arithmetic done through `Date.UTC`, which is safe precisely because
 * no timezone is involved: this is calendar counting, and the zone only enters
 * when a wall clock is turned into an instant.
 */
function addDays(day: CivilDay, count: number): CivilDay {
  const shifted = new Date(Date.UTC(day.year, day.month - 1, day.day) + count * MS_PER_DAY);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** 0 = Sunday, matching the normalised day-of-week set. */
function weekdayOf(day: CivilDay): number {
  return new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
}

/** The union rule. See the header for why it is a union and when. */
function dayMatches(day: CivilDay, fields: CronFields): boolean {
  if (!fields.months.includes(day.month)) return false;

  const byDayOfMonth = fields.daysOfMonth.includes(day.day);
  const byDayOfWeek = fields.daysOfWeek.includes(weekdayOf(day));

  return fields.domRestricted && fields.dowRestricted
    ? byDayOfMonth || byDayOfWeek
    : byDayOfMonth && byDayOfWeek;
}

/**
 * The search bound, in days.
 *
 * Every satisfiable expression in this grammar recurs at least once per calendar
 * year bar one: `29 2` needs a leap year, and the longest real gap between leap
 * years is the eight from 2096 to 2104. Eight years plus a couple of days covers
 * it, and an unsatisfiable expression — `0 0 30 2 *`, February the 30th — costs
 * about three thousand cheap calendar comparisons before it is reported as never.
 * A scheduler that loops forever on a typo is not a scheduler.
 */
const MAX_SEARCH_DAYS = 2_932;

/* ═══════════════════════════ The one export ═══════════════════════════ */

/**
 * The first UTC instant strictly after `after` at which `cron` is due in
 * `timezone`, or null when the expression is well formed but can never match a
 * real date.
 *
 * Throws `CronError` when the expression or the zone cannot be scheduled at all.
 * The distinction is the caller's whole decision: null is an answer to record,
 * a throw is a plan defect to surface.
 *
 * Seconds and milliseconds on the result are zero, because cron resolves to the
 * minute — except for a firing pulled onto a DST transition, which lands wherever
 * the tz database says the zone jumped.
 */
export function nextFireAfter(cron: string, timezone: string, after: Date): Date | null {
  if (!isValidCron(cron)) {
    throw new CronError(
      `"${cron}" is not a schedulable cron expression. Expected five numeric fields — ` +
        `minute hour day-of-month month day-of-week — built from "*", "*/n", "a-b", a number, ` +
        `or comma-separated lists of those, for example "0 9 * * 5".`,
    );
  }

  const afterMs = after.getTime();
  if (!Number.isFinite(afterMs)) {
    throw new CronError(
      `Cannot compute the next firing of "${cron}": the instant to search from is not a valid ` +
        `Date. The scheduler's clock produced ${String(after)}.`,
    );
  }

  const formatter = formatterFor(timezone);
  const fields = parseCron(cron);

  // Start at the first whole minute after `after`, expressed in the trigger's own
  // zone. "Strictly after" is what stops a trigger that has just fired from being
  // handed its own fire instant back and running forever on the same minute.
  const start = wallClockAt(afterMs, formatter);
  let day: CivilDay = { year: start.year, month: start.month, day: start.day };
  let minuteFloor = start.hour * 60 + start.minute + 1;
  if (minuteFloor >= MINUTES_PER_DAY) {
    day = addDays(day, 1);
    minuteFloor = 0;
  }

  for (let dayIndex = 0; dayIndex < MAX_SEARCH_DAYS; dayIndex++) {
    if (dayMatches(day, fields)) {
      // Ascending wall clock yields non-decreasing instants — the DST rules above
      // are both monotone — so the first candidate past `after` is the earliest.
      for (const hour of fields.hours) {
        for (const minute of fields.minutes) {
          if (dayIndex === 0 && hour * 60 + minute < minuteFloor) continue;

          const instant = instantForWallClock(day, hour, minute, formatter, timezone);
          // A wall clock in the second half of a fall-back hour resolves to an
          // instant BEFORE `after` even though its local time is later. Comparing
          // instants rather than wall clocks is the only test that cannot be
          // fooled by that, and it is what guarantees this function advances.
          if (instant > afterMs) return new Date(instant);
        }
      }
    }
    day = addDays(day, 1);
  }

  return null;
}

/* ═══════════════════════════ Message helpers ═══════════════════════════ */

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function format(day: CivilDay): string {
  return `${day.year}-${pad(day.month)}-${pad(day.day)}`;
}
