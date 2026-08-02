/**
 * components/live/calendar/api.ts — the only place `/api/runtime/calendar`
 * becomes a fact this screen will draw (ROLE_C_PLAN M6).
 *
 * IT PARSES RATHER THAN CASTS, for the reason
 * `components/live/workspace/runtime-api.ts` gives at length: `await res.json()
 * as CalendarView` tells TypeScript a shape nothing checked, and the first field
 * the route renames becomes `undefined` rendered as a blank pill on a day that
 * looks empty. An empty-looking day is precisely the failure this screen cannot
 * afford — it reads as "nothing is scheduled", which is also what a healthy
 * quiet week looks like. So a response that does not match is an ERROR the screen
 * shows, never a month with holes in it.
 *
 * THE STATE WORDS ARE THE SCREEN'S WHOLE VOCABULARY, so an unrecognised one is
 * refused rather than passed through. Every visual treatment, every legend entry
 * and every "is this pressing" judgement is keyed on one of ten words; a word
 * with no treatment attached would fall into whichever bucket a fallback picked,
 * and a projected occurrence rendered as a committed run is the specific lie this
 * lane exists to avoid. The lists are built from keyed objects `satisfies` the
 * unions, so adding a state to the type without adding it here fails to compile.
 *
 * NO TIMEZONE ARITHMETIC HAPPENS IN THIS FILE, OR ANYWHERE ELSE IN THIS LANE.
 * The route resolves every event to an instant plus the day key and clock time it
 * falls on in the calendar's own zone, and those strings are rendered as given.
 * A browser recomputing a cron in the reader's locale is how a Friday-morning
 * sweep in Singapore shows up on Thursday in London.
 *
 * The narrowing helpers below are this module's own rather than shared with the
 * Workspace's or the inbox's copies. Each live area owns its readers — that is
 * the pattern already in the repo — and the alternative, a shared parsing
 * utility, would couple three screens' failure messages together for the sake of
 * a dozen lines.
 */

/* ═══════════════════════════ Shapes ═══════════════════════════ */

export type RiskLevel = "low" | "medium" | "high";

export type CalendarEventKind = "scheduled" | "run" | "approval";

export type CalendarEventState =
  | "scheduled"
  | "projected"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "refused"
  | "cancelled"
  | "awaiting_decision"
  | "overdue";

export interface CalendarEventView {
  id: string;
  kind: CalendarEventKind;
  state: CalendarEventState;
  /** The resolved UTC instant. */
  at: string;
  /** "2026-07-24" in the calendar's timezone — computed by the server. */
  dayKey: string;
  /** "09:00" in the calendar's timezone — computed by the server. */
  timeLabel: string;
  endedAt: string | null;
  endedTimeLabel: string | null;
  agentId: string;
  agentName: string;
  workflowId: string;
  workflowName: string;
  title: string;
  detail: string;
  href: string | null;
  runId: string | null;
  approvalId: string | null;
  triggerId: string | null;
  risk: RiskLevel | null;
  proposed: { integrationId: string; operation: string } | null;
  scheduleTimezone: string | null;
}

/** Something real that has no point in time, so it cannot go on a grid. */
export interface UnplaceableView {
  id: string;
  kind: CalendarEventKind;
  agentId: string;
  agentName: string;
  workflowId: string;
  workflowName: string;
  reason: string;
  href: string | null;
}

export type ZoneSource = "global-quiet-hours" | "schedule-trigger" | "fallback";

export interface CalendarZoneView {
  id: string;
  requested: string;
  /** False when the plan named a zone the server's tz database does not know. */
  ok: boolean;
  source: ZoneSource;
  /** Schedules written in a different zone than the one this grid groups by. */
  otherScheduleZones: string[];
}

export interface CalendarSummaryView {
  registeredTriggers: number;
  scheduleTriggers: number;
  /** `event`, `threshold`, `dependency`, `manual` — live, and never on a grid. */
  signalTriggers: number;
  disabledTriggers: number;
  scheduledInRange: number;
  runsInRange: number;
  approvalsInRange: number;
  pendingApprovals: number;
  totalRuns: number;
}

export interface CalendarView {
  mode: string;
  /** The server's instant, which every event was projected against. */
  now: string;
  /** The server's today, in the calendar's timezone. */
  todayKey: string;
  range: { from: string; to: string; days: number };
  timezone: CalendarZoneView;
  events: CalendarEventView[];
  unplaceable: UnplaceableView[];
  summary: CalendarSummaryView;
  truncated: boolean;
  truncationDetail: string | null;
}

/* ═══════════════════════════ Vocabularies ═══════════════════════════ */

const EVENT_KINDS = Object.keys({
  scheduled: true,
  run: true,
  approval: true,
} satisfies Record<CalendarEventKind, true>) as CalendarEventKind[];

const EVENT_STATES = Object.keys({
  scheduled: true,
  projected: true,
  running: true,
  awaiting_approval: true,
  completed: true,
  failed: true,
  refused: true,
  cancelled: true,
  awaiting_decision: true,
  overdue: true,
} satisfies Record<CalendarEventState, true>) as CalendarEventState[];

const RISK_LEVELS = Object.keys({
  low: true,
  medium: true,
  high: true,
} satisfies Record<RiskLevel, true>) as RiskLevel[];

const ZONE_SOURCES = Object.keys({
  "global-quiet-hours": true,
  "schedule-trigger": true,
  fallback: true,
} satisfies Record<ZoneSource, true>) as ZoneSource[];

/* ═══════════════════════════ Errors ═══════════════════════════ */

export type CalendarFailureKind = "transport" | "http" | "malformed";

export class CalendarApiError extends Error {
  readonly kind: CalendarFailureKind;
  /** Null for a transport failure — there was no response to have a status. */
  readonly status: number | null;

  constructor(kind: CalendarFailureKind, message: string, status: number | null = null) {
    super(message);
    this.name = "CalendarApiError";
    this.kind = kind;
    this.status = status;
  }
}

/* ═══════════════════════════ Strict readers ═══════════════════════════ */

/**
 * Every reader names the field it rejected, so "the calendar is broken" becomes
 * "events[4].dayKey is missing or not a string" without anyone opening a console.
 */
function fail(where: string, why: string): never {
  throw new CalendarApiError("malformed", `${where} ${why}`);
}

function obj(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(where, "is not a JSON object.");
  }
  return value as Record<string, unknown>;
}

function arr(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) fail(where, "is missing or not an array.");
  return value;
}

function str(source: Record<string, unknown>, key: string, where: string): string {
  const value = source[key];
  if (typeof value !== "string") fail(`${where}.${key}`, "is missing or not a string.");
  return value;
}

function strOrNull(source: Record<string, unknown>, key: string, where: string): string | null {
  const value = source[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") fail(`${where}.${key}`, "is not a string or null.");
  return value;
}

function num(source: Record<string, unknown>, key: string, where: string): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${where}.${key}`, "is missing or not a finite number.");
  }
  return value;
}

function flag(source: Record<string, unknown>, key: string, where: string): boolean {
  const value = source[key];
  if (typeof value !== "boolean") fail(`${where}.${key}`, "is missing or not true/false.");
  return value;
}

function strList(source: Record<string, unknown>, key: string, where: string): string[] {
  return arr(source[key], `${where}.${key}`).map((entry, index) => {
    if (typeof entry !== "string") fail(`${where}.${key}[${index}]`, "is not a string.");
    return entry;
  });
}

/**
 * One of a known set, or a refusal naming the set. See the module header: this
 * is where the file earns its keep.
 */
function member<T extends string>(
  source: Record<string, unknown>,
  key: string,
  where: string,
  allowed: readonly T[],
): T {
  const value = source[key];
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    fail(
      `${where}.${key}`,
      `is ${JSON.stringify(value)}, which this build has no treatment for. ` +
        `Expected one of: ${allowed.join(", ")}.`,
    );
  }
  return match;
}

function riskOrNull(
  source: Record<string, unknown>,
  key: string,
  where: string,
): RiskLevel | null {
  if (source[key] === null || source[key] === undefined) return null;
  return member(source, key, where, RISK_LEVELS);
}

function proposedOrNull(
  source: Record<string, unknown>,
  where: string,
): { integrationId: string; operation: string } | null {
  const value = source.proposed;
  if (value === null || value === undefined) return null;
  const fields = obj(value, `${where}.proposed`);
  return {
    integrationId: str(fields, "integrationId", `${where}.proposed`),
    operation: str(fields, "operation", `${where}.proposed`),
  };
}

/* ═══════════════════════════ Parsing ═══════════════════════════ */

function parseEvent(value: unknown, where: string): CalendarEventView {
  const row = obj(value, where);
  return {
    id: str(row, "id", where),
    kind: member(row, "kind", where, EVENT_KINDS),
    state: member(row, "state", where, EVENT_STATES),
    at: str(row, "at", where),
    dayKey: str(row, "dayKey", where),
    timeLabel: str(row, "timeLabel", where),
    endedAt: strOrNull(row, "endedAt", where),
    endedTimeLabel: strOrNull(row, "endedTimeLabel", where),
    agentId: str(row, "agentId", where),
    agentName: str(row, "agentName", where),
    workflowId: str(row, "workflowId", where),
    workflowName: str(row, "workflowName", where),
    title: str(row, "title", where),
    detail: str(row, "detail", where),
    href: strOrNull(row, "href", where),
    runId: strOrNull(row, "runId", where),
    approvalId: strOrNull(row, "approvalId", where),
    triggerId: strOrNull(row, "triggerId", where),
    risk: riskOrNull(row, "risk", where),
    proposed: proposedOrNull(row, where),
    scheduleTimezone: strOrNull(row, "scheduleTimezone", where),
  };
}

function parseUnplaceable(value: unknown, where: string): UnplaceableView {
  const row = obj(value, where);
  return {
    id: str(row, "id", where),
    kind: member(row, "kind", where, EVENT_KINDS),
    agentId: str(row, "agentId", where),
    agentName: str(row, "agentName", where),
    workflowId: str(row, "workflowId", where),
    workflowName: str(row, "workflowName", where),
    reason: str(row, "reason", where),
    href: strOrNull(row, "href", where),
  };
}

function parseCalendar(raw: unknown): CalendarView {
  const body = obj(raw, "The calendar response");
  const range = obj(body.range, "The calendar response.range");
  const timezone = obj(body.timezone, "The calendar response.timezone");
  const summary = obj(body.summary, "The calendar response.summary");

  return {
    mode: str(body, "mode", "The calendar response"),
    now: str(body, "now", "The calendar response"),
    todayKey: str(body, "todayKey", "The calendar response"),
    range: {
      from: str(range, "from", "range"),
      to: str(range, "to", "range"),
      days: num(range, "days", "range"),
    },
    timezone: {
      id: str(timezone, "id", "timezone"),
      requested: str(timezone, "requested", "timezone"),
      ok: flag(timezone, "ok", "timezone"),
      source: member(timezone, "source", "timezone", ZONE_SOURCES),
      otherScheduleZones: strList(timezone, "otherScheduleZones", "timezone"),
    },
    events: arr(body.events, "The calendar response.events").map((entry, index) =>
      parseEvent(entry, `events[${index}]`),
    ),
    unplaceable: arr(body.unplaceable, "The calendar response.unplaceable").map(
      (entry, index) => parseUnplaceable(entry, `unplaceable[${index}]`),
    ),
    summary: {
      registeredTriggers: num(summary, "registeredTriggers", "summary"),
      scheduleTriggers: num(summary, "scheduleTriggers", "summary"),
      signalTriggers: num(summary, "signalTriggers", "summary"),
      disabledTriggers: num(summary, "disabledTriggers", "summary"),
      scheduledInRange: num(summary, "scheduledInRange", "summary"),
      runsInRange: num(summary, "runsInRange", "summary"),
      approvalsInRange: num(summary, "approvalsInRange", "summary"),
      pendingApprovals: num(summary, "pendingApprovals", "summary"),
      totalRuns: num(summary, "totalRuns", "summary"),
    },
    truncated: flag(body, "truncated", "The calendar response"),
    truncationDetail: strOrNull(body, "truncationDetail", "The calendar response"),
  };
}

/* ═══════════════════════════ Transport ═══════════════════════════ */

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Kept as text so an HTML error page from a proxy is still legible.
    return text;
  }
}

/** The route's own `{ error }` sentence when there is one; a generic line if not. */
function errorMessage(body: unknown, response: Response): string {
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    const error = (body as Record<string, unknown>).error;
    if (typeof error === "string" && error.trim() !== "") return error;
  }
  if (typeof body === "string" && body.trim() !== "") return body.slice(0, 400);
  return `The server answered ${response.status} ${response.statusText}.`;
}

/**
 * One month, or one explicit range, of the runtime in time.
 *
 * `cache: "no-store"` because the runtime stores are the truth and they change
 * underneath us; a cached calendar is one that still shows an approval as
 * waiting after it has been decided.
 */
export async function fetchCalendar(
  range: { from: string; to: string } | null,
  signal?: AbortSignal,
): Promise<CalendarView> {
  const query =
    range === null ? "" : `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
  const url = `/api/runtime/calendar${query}`;

  let response: Response;
  try {
    response = await fetch(url, {
      signal,
      cache: "no-store",
      headers: { accept: "application/json" },
    });
  } catch (err) {
    // Includes the abort, which the caller distinguishes by checking the signal.
    throw new CalendarApiError(
      "transport",
      `The app could not be reached: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const body = await readBody(response);
  if (!response.ok) {
    throw new CalendarApiError("http", errorMessage(body, response), response.status);
  }
  return parseCalendar(body);
}
