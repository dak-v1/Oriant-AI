/**
 * components/live/notifications/api.ts — reading the attention list from the
 * browser, without trusting it (ROLE_C_PLAN M7).
 *
 * One endpoint, one parser, and the same posture
 * components/live/workspace/runtime-api.ts takes on the four it reads: PARSE,
 * NEVER CAST. `await response.json() as Snapshot` is a line shorter and is a lie
 * — it asserts a shape nothing checked, and the first field a route renames
 * becomes `undefined` rendered as a blank. On this surface specifically a blank
 * is the dangerous failure: an item with no severity word, or a list that came
 * back empty because a field moved, reads as "nothing needs you".
 *
 * SO A MALFORMED RESPONSE IS AN ERROR, NEVER A SHORT LIST. If any item fails to
 * narrow, the whole read fails and the surface says so. Dropping the bad item and
 * keeping the rest is the tempting alternative and it is exactly wrong here: the
 * dropped one could be the overdue approval, and nobody would ever know it had
 * been quietly discarded.
 *
 * THE TWO UNIONS ARE IMPORTED FROM THE ROUTE, TYPE-ONLY. The route is the emitter
 * and owns the vocabulary; the lists below are built as keyed objects that
 * `satisfies` those unions, so an eighth kind added there stops this file
 * compiling until it is taught the word. An array of string literals would have
 * accepted the omission silently, and the consequence would be this screen
 * refusing an item the runtime legitimately raised. That is the seam
 * `useRuntimeEvents.ts` already uses for `RuntimeTopic`.
 *
 * FAILURE KINDS ARE KEPT APART FROM THE MESSAGE because the three need different
 * things from the reader: a transport failure is theirs to fix, an HTTP status is
 * the runtime's answer, and a malformed body is a contract break between this
 * file and the route. "Something went wrong" is true of all three and useful for
 * none.
 */

import type {
  NotificationKind,
  NotificationSeverity,
} from "@/app/api/runtime/notifications/route";

export type { NotificationKind, NotificationSeverity };

/* ═══════════════════════════ Vocabularies ═══════════════════════════ */

const KINDS = Object.keys({
  approval_overdue: true,
  approval_waiting: true,
  approval_deadline_unreadable: true,
  job_dead_letter: true,
  run_failed: true,
  run_refused: true,
  activation_blocked: true,
} satisfies Record<NotificationKind, true>) as NotificationKind[];

const SEVERITIES = Object.keys({
  action_required: true,
  attention: true,
  waiting: true,
} satisfies Record<NotificationSeverity, true>) as NotificationSeverity[];

const SOURCE_IDS = ["approvals", "runs", "jobs", "activation"] as const;

export type NotificationSourceId = (typeof SOURCE_IDS)[number];

/* ═══════════════════════════ Shapes ═══════════════════════════ */

export interface NotificationAction {
  href: string;
  label: string;
}

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  subject: string | null;
  detail: string;
  agentId: string | null;
  agentName: string | null;
  workflowId: string | null;
  workflowName: string | null;
  at: string | null;
  atNote: string | null;
  action: NotificationAction | null;
  actionNote: string | null;
  /** Changes when the item's meaning changes — the key a dismissal is held on. */
  fingerprint: string;
}

export interface NotificationSource {
  id: NotificationSourceId;
  label: string;
  ok: boolean;
  problem: string | null;
}

export interface NotEvaluated {
  id: string;
  label: string;
  reason: string;
  href: string | null;
}

export interface NotificationCounts {
  actionRequired: number;
  attention: number;
  waiting: number;
  /** Everything derived, before the route's cap. */
  total: number;
}

export interface NotificationSnapshot {
  mode: string;
  /** The runtime instant every severity and deadline was judged against. */
  now: string;
  /** False when any source failed — a short list is then not a quiet runtime. */
  complete: boolean;
  counts: NotificationCounts;
  limit: number;
  items: NotificationItem[];
  sources: NotificationSource[];
  notEvaluated: NotEvaluated[];
}

/* ═══════════════════════════ Failures ═══════════════════════════ */

export type NotificationsFailureKind = "transport" | "http" | "malformed";

export class NotificationsApiError extends Error {
  readonly kind: NotificationsFailureKind;

  constructor(kind: NotificationsFailureKind, message: string) {
    super(message);
    this.name = "NotificationsApiError";
    this.kind = kind;
  }
}

/* ═══════════════════════════ Narrowing ═══════════════════════════ */

function fail(message: string): never {
  throw new NotificationsApiError("malformed", message);
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "nothing";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "an array";
  return typeof value;
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${path} should be a JSON object; got ${describe(value)}.`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(`${path} should be an array; got ${describe(value)}.`);
  return value;
}

function asText(source: Record<string, unknown>, key: string, path: string): string {
  const value = source[key];
  if (typeof value !== "string") {
    fail(`${path}.${key} should be a string; got ${describe(value)}.`);
  }
  return value;
}

function asTextOrNull(
  source: Record<string, unknown>,
  key: string,
  path: string,
): string | null {
  const value = source[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    fail(`${path}.${key} should be a string or null; got ${describe(value)}.`);
  }
  return value;
}

function asCount(source: Record<string, unknown>, key: string, path: string): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${path}.${key} should be a finite number; got ${describe(value)}.`);
  }
  return value;
}

function asFlag(source: Record<string, unknown>, key: string, path: string): boolean {
  const value = source[key];
  if (typeof value !== "boolean") {
    fail(`${path}.${key} should be true or false; got ${describe(value)}.`);
  }
  return value;
}

/**
 * One of a known set, or a refusal naming the set.
 *
 * This is where the module earns its keep. Every judgement this surface makes is
 * keyed on one of these words — which icon, which chip, which group, whether the
 * live region announces it — so a word with no judgement attached would land in
 * whichever branch a fallback happened to pick. Refusing costs a visible error;
 * accepting costs an urgent item rendered as an ordinary one.
 */
function asMember<T extends string>(
  source: Record<string, unknown>,
  key: string,
  path: string,
  allowed: readonly T[],
): T {
  const value = source[key];
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    fail(
      `${path}.${key} is ${describe(value)}, which this build does not recognise. ` +
        `Expected one of: ${allowed.join(", ")}.`,
    );
  }
  return match;
}

/* ═══════════════════════════ Parsing ═══════════════════════════ */

function parseAction(value: unknown, path: string): NotificationAction | null {
  if (value === null || value === undefined) return null;
  const row = asRecord(value, path);
  return { href: asText(row, "href", path), label: asText(row, "label", path) };
}

function parseItem(value: unknown, path: string): NotificationItem {
  const row = asRecord(value, path);
  const item: NotificationItem = {
    id: asText(row, "id", path),
    kind: asMember(row, "kind", path, KINDS),
    severity: asMember(row, "severity", path, SEVERITIES),
    title: asText(row, "title", path),
    subject: asTextOrNull(row, "subject", path),
    detail: asText(row, "detail", path),
    agentId: asTextOrNull(row, "agentId", path),
    agentName: asTextOrNull(row, "agentName", path),
    workflowId: asTextOrNull(row, "workflowId", path),
    workflowName: asTextOrNull(row, "workflowName", path),
    at: asTextOrNull(row, "at", path),
    atNote: asTextOrNull(row, "atNote", path),
    action: parseAction(row.action, `${path}.action`),
    actionNote: asTextOrNull(row, "actionNote", path),
    fingerprint: asText(row, "fingerprint", path),
  };

  /* The route promises that exactly one of each pair is present, and this surface
     renders on that promise: an item with neither an action nor a reason for
     having none is the "notification that is just noise" this milestone set out
     to avoid, and it must not reach a screen unnoticed. */
  if (item.action === null && item.actionNote === null) {
    fail(
      `${path} has no action and no explanation for having none. Every item must either ` +
        `say where to go or say why there is nowhere.`,
    );
  }
  if (item.at === null && item.atNote === null) {
    fail(
      `${path} has no instant and no explanation for having none. Every item must either ` +
        `say when it happened or say why there is no time to show.`,
    );
  }

  return item;
}

function parseSnapshot(raw: unknown): NotificationSnapshot {
  const body = asRecord(raw, "notifications");
  const counts = asRecord(body.counts, "notifications.counts");

  return {
    mode: asText(body, "mode", "notifications"),
    now: asText(body, "now", "notifications"),
    complete: asFlag(body, "complete", "notifications"),
    counts: {
      actionRequired: asCount(counts, "actionRequired", "notifications.counts"),
      attention: asCount(counts, "attention", "notifications.counts"),
      waiting: asCount(counts, "waiting", "notifications.counts"),
      total: asCount(counts, "total", "notifications.counts"),
    },
    limit: asCount(body, "limit", "notifications"),
    items: asArray(body.items, "notifications.items").map((entry, index) =>
      parseItem(entry, `notifications.items[${index}]`),
    ),
    sources: asArray(body.sources, "notifications.sources").map((entry, index) => {
      const path = `notifications.sources[${index}]`;
      const row = asRecord(entry, path);
      return {
        id: asMember(row, "id", path, SOURCE_IDS),
        label: asText(row, "label", path),
        ok: asFlag(row, "ok", path),
        problem: asTextOrNull(row, "problem", path),
      };
    }),
    notEvaluated: asArray(body.notEvaluated, "notifications.notEvaluated").map(
      (entry, index) => {
        const path = `notifications.notEvaluated[${index}]`;
        const row = asRecord(entry, path);
        return {
          id: asText(row, "id", path),
          label: asText(row, "label", path),
          reason: asText(row, "reason", path),
          href: asTextOrNull(row, "href", path),
        };
      },
    ),
  };
}

/* ═══════════════════════════ The read ═══════════════════════════ */

const NOTIFICATIONS_URL = "/api/runtime/notifications";

export async function fetchNotifications(
  signal?: AbortSignal,
): Promise<NotificationSnapshot> {
  let response: Response;
  try {
    response = await fetch(NOTIFICATIONS_URL, {
      signal,
      // The stores are the truth and they move under us. A cached attention list
      // is a list that still says an approval is waiting after it was decided.
      cache: "no-store",
      headers: { accept: "application/json" },
    });
  } catch (error) {
    // An abort is a navigation or a superseded refresh, not a failure. Rethrown
    // as-is so the caller's own `signal.aborted` check owns it.
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new NotificationsApiError(
      "transport",
      `The browser could not reach ${NOTIFICATIONS_URL}: ` +
        `${error instanceof Error ? error.message : String(error)}.`,
    );
  }

  const text = await response.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new NotificationsApiError(
      response.ok ? "malformed" : "http",
      `${NOTIFICATIONS_URL} answered ${response.status} with a body that is not JSON.`,
    );
  }

  if (!response.ok) {
    // Every /api/runtime route reports failure as `{ error }`, so the runtime's
    // own sentence is preferred over a status code an owner cannot act on.
    const stated =
      typeof raw === "object" && raw !== null && !Array.isArray(raw)
        ? (raw as { error?: unknown }).error
        : undefined;
    throw new NotificationsApiError(
      "http",
      typeof stated === "string" && stated.trim() !== ""
        ? stated
        : `${NOTIFICATIONS_URL} answered ${response.status}.`,
    );
  }

  return parseSnapshot(raw);
}
