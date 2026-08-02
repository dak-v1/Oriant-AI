/**
 * components/live/approvals/api.ts — everything the live inbox knows about the
 * runtime, and the one place a response is allowed to become a fact.
 *
 * The screen talks to `/api/runtime/approvals` for the queue and the decision,
 * `/api/runtime/run` for the evidence behind a proposal, and `/api/runtime/build`
 * for the agents' display names. Those routes are ours, which is exactly why the
 * parsing below is not a cast: a cast would let a shape change in the route
 * surface here as a blank card or an `undefined` in the middle of a sentence an
 * owner is about to act on, and the failure would look like a quiet UI bug rather
 * than the contract break it is.
 *
 * READING FAILS CLOSED, DECIDING FAILS OPEN, AND THE ASYMMETRY IS THE POINT.
 *
 *   - A GET that cannot be understood is REFUSED WHOLE. One malformed approval
 *     does not get skipped past so the rest can render: an inbox is a decision
 *     surface, and a half-parsed proposal is worse than no inbox at all, because
 *     the owner cannot see what is missing from it. The screen shows the error
 *     and the raw status; nothing invents a default.
 *
 *   - A POST response is parsed as LENIENTLY AS POSSIBLE AND AS PESSIMISTICALLY
 *     AS POSSIBLE, because by the time it arrives the decision has already
 *     executed. Refusing to read it would tell an owner their approval failed
 *     when it in fact sent the email. So `submitDecision` never throws on a
 *     shape: it reports what it could establish, keeps the raw body for what it
 *     could not, and never upgrades an unreadable answer into a success.
 *
 * THREE OUTCOMES, NOT TWO, and the third is the one that matters.
 * `DecisionResult` separates "the runtime refused this" from "we do not know
 * whether it happened". The refusal statuses are enumerable because the route
 * validates everything before it writes — 400, 404 and 409 are all raised ahead
 * of `saveDecision`, so they are guaranteed no-ops. A transport failure or any
 * other status is `unknown`, and the screen must say so: retrying a decision
 * that already landed is how an owner sends a customer two emails.
 *
 * ONE LOOKUP IS ALLOWED TO FAIL SILENTLY. `fetchAgentNames` is cosmetic — it
 * turns `finance-followup` into "Finance Follow-up Agent" — so it swallows its
 * own errors and returns an empty map. The id is the truth either way and is
 * always shown somewhere; a display-name service must not be able to take the
 * inbox down.
 */

/* ═══════════════════════════ The runtime's shapes ═══════════════════════════ */

export type RiskLevel = "low" | "medium" | "high";

/** Mirrors `ApprovalDeadlineState` (lib/runtime/approvals.ts). */
export type DeadlineState = "due" | "overdue" | "unreadable";

export interface ApprovalDeadlineView {
  dueAt: string;
  state: DeadlineState;
  overdueByMins: number;
  minutesRemaining: number;
  /** The runtime's own sentence — "Overdue by 2h 15m." Never recomputed here. */
  detail: string;
}

export interface ProposedInvocation {
  integrationId: string;
  operation: string;
  args: Record<string, unknown>;
  metrics: Record<string, number>;
}

export interface ApprovalView {
  approvalId: string;
  runId: string;
  agentId: string;
  workflowId: string;
  stepId: string;
  reason: string;
  risk: RiskLevel;
  breachedLimits: string[];
  approvalOwner: string;
  createdAt: string;
  dueAt: string;
  proposed: ProposedInvocation;
}

export interface PendingApprovalView extends ApprovalView {
  deadline: ApprovalDeadlineView;
}

export interface InboxView {
  /** The server's clock. Every deadline below was judged against this instant. */
  now: string;
  overdueCount: number;
  pending: PendingApprovalView[];
}

/** Mirrors `ApprovalArgChange`. */
export interface ArgChangeView {
  key: string;
  kind: "added" | "changed" | "cleared";
  from?: unknown;
  to?: unknown;
}

/** Mirrors `ApprovalVersion`. */
export interface ApprovalVersionView {
  version: number;
  author: "agent" | "owner";
  authoredBy: string;
  authoredAt: string;
  args: Record<string, unknown>;
  changes: ArgChangeView[];
}

export interface DecisionView {
  decision: "approved" | "rejected";
  decidedBy: string;
  decidedAt: string;
  reason?: string;
}

/** One approval and everything decided about it — the drawer's read. */
export interface ApprovalRecordView {
  now: string;
  approval: ApprovalView;
  deadline: ApprovalDeadlineView;
  /** Null while the approval is still pending. */
  decision: DecisionView | null;
  versions: ApprovalVersionView[];
  edited: boolean;
}

/**
 * A run event flattened for display. The runtime's `RunEvent` is a ten-arm union
 * whose arms carry different fields; the timeline needs a kind, an instant and a
 * line of prose, so the arms are collapsed once here rather than switched on in
 * three components.
 */
export interface RunEventView {
  kind: string;
  at: string;
  stepId: string | null;
  /** Present on the approval events, and how the timeline finds THIS approval. */
  approvalId: string | null;
  text: string;
}

export interface RunView {
  runId: string;
  agentId: string;
  workflowId: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  failure: string | null;
  /** The trigger payload and accumulated step outputs — the proposal's evidence. */
  context: Record<string, unknown>;
  events: RunEventView[];
  trigger: { kind: string; firedAt: string; payload: Record<string, unknown> } | null;
}

/* ═══════════════════════════ Errors ═══════════════════════════ */

export type ApiFailureKind = "transport" | "http" | "malformed";

export class ApprovalsApiError extends Error {
  readonly kind: ApiFailureKind;
  /** Null for a transport failure — there was no response to have a status. */
  readonly status: number | null;

  constructor(kind: ApiFailureKind, message: string, status: number | null = null) {
    super(message);
    this.name = "ApprovalsApiError";
    this.kind = kind;
    this.status = status;
  }
}

/* ═══════════════════════════ Strict readers ═══════════════════════════ */

/**
 * Every reader names the field it rejected. The screen shows that sentence
 * verbatim, so "the inbox is broken" becomes "pending[2].deadline.state is
 * missing" without anyone opening a console.
 */

function fail(where: string, why: string): never {
  throw new ApprovalsApiError("malformed", `${where} ${why}`);
}

function obj(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(where, "is not a JSON object.");
  }
  return value as Record<string, unknown>;
}

function str(source: Record<string, unknown>, key: string, where: string): string {
  const value = source[key];
  if (typeof value !== "string") fail(`${where}.${key}`, "is missing or not a string.");
  return value;
}

function optionalStr(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" ? value : null;
}

function num(source: Record<string, unknown>, key: string, where: string): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${where}.${key}`, "is missing or not a finite number.");
  }
  return value;
}

function strArray(source: Record<string, unknown>, key: string, where: string): string[] {
  const value = source[key];
  if (!Array.isArray(value)) fail(`${where}.${key}`, "is missing or not an array.");
  return value.map((item, i) => {
    if (typeof item !== "string") fail(`${where}.${key}[${i}]`, "is not a string.");
    return item;
  });
}

function record(source: Record<string, unknown>, key: string, where: string): Record<string, unknown> {
  return obj(source[key], `${where}.${key}`);
}

function numberRecord(
  source: Record<string, unknown>,
  key: string,
  where: string,
): Record<string, number> {
  const raw = record(source, key, where);
  const out: Record<string, number> = {};
  for (const metric of Object.keys(raw)) {
    const value = raw[metric];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      fail(`${where}.${key}.${metric}`, "is not a finite number.");
    }
    out[metric] = value;
  }
  return out;
}

const RISKS: RiskLevel[] = ["low", "medium", "high"];

function risk(source: Record<string, unknown>, where: string): RiskLevel {
  const value = str(source, "risk", where);
  const known = RISKS.find((candidate) => candidate === value);
  // Refused rather than defaulted. There is no safe guess: assume "low" and a
  // high-risk action loses its warning; assume "high" and every ordinary item
  // shouts. The runtime has exactly three, and a fourth is a contract change
  // that should be noticed here.
  if (!known) fail(`${where}.risk`, `is "${value}", which is not low, medium or high.`);
  return known;
}

const DEADLINE_STATES: DeadlineState[] = ["due", "overdue", "unreadable"];

/**
 * The ONE enum that degrades instead of refusing, because the runtime already
 * defines the state to degrade into. `unreadable` means "cannot tell whether
 * this is overdue, so treat it as needing attention" — an unrecognised state is
 * precisely that, and `isPastDue` already counts it. Refusing here would blank
 * an inbox over a label; defaulting to `due` would hide the item that nobody can
 * reason about, which is the failure lib/runtime/approvals.ts refuses by name.
 */
function deadline(value: unknown, where: string): ApprovalDeadlineView {
  const raw = obj(value, where);
  const state = str(raw, "state", where);
  const known = DEADLINE_STATES.find((candidate) => candidate === state);
  return {
    dueAt: str(raw, "dueAt", where),
    state: known ?? "unreadable",
    overdueByMins: num(raw, "overdueByMins", where),
    minutesRemaining: num(raw, "minutesRemaining", where),
    detail: known
      ? str(raw, "detail", where)
      : "This screen does not recognise the deadline this item came back with, so it is " +
        "treated as needing attention rather than as having time left.",
  };
}

function approval(value: unknown, where: string): ApprovalView {
  const raw = obj(value, where);
  const proposed = record(raw, "proposed", where);
  return {
    approvalId: str(raw, "approvalId", where),
    runId: str(raw, "runId", where),
    agentId: str(raw, "agentId", where),
    workflowId: str(raw, "workflowId", where),
    stepId: str(raw, "stepId", where),
    reason: str(raw, "reason", where),
    risk: risk(raw, where),
    breachedLimits: strArray(raw, "breachedLimits", where),
    approvalOwner: str(raw, "approvalOwner", where),
    createdAt: str(raw, "createdAt", where),
    dueAt: str(raw, "dueAt", where),
    proposed: {
      integrationId: str(proposed, "integrationId", `${where}.proposed`),
      operation: str(proposed, "operation", `${where}.proposed`),
      args: record(proposed, "args", `${where}.proposed`),
      metrics: numberRecord(proposed, "metrics", `${where}.proposed`),
    },
  };
}

/* ═══════════════════════════ Transport ═══════════════════════════ */

async function getJson(url: string, signal: AbortSignal | undefined): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { signal, headers: { accept: "application/json" } });
  } catch (err) {
    // Includes the abort, which the caller distinguishes by checking the signal.
    throw new ApprovalsApiError(
      "transport",
      `The app could not be reached: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const body = await readBody(response);
  if (!response.ok) {
    throw new ApprovalsApiError("http", errorMessage(body, response), response.status);
  }
  return body;
}

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

/* ═══════════════════════════ Reads ═══════════════════════════ */

export async function fetchInbox(signal?: AbortSignal): Promise<InboxView> {
  const raw = obj(await getJson("/api/runtime/approvals", signal), "The inbox response");
  const pending = raw.pending;
  if (!Array.isArray(pending)) fail("The inbox response.pending", "is missing or not an array.");

  return {
    now: str(raw, "now", "The inbox response"),
    overdueCount: num(raw, "overdueCount", "The inbox response"),
    pending: pending.map((item, i) => ({
      ...approval(item, `pending[${i}]`),
      deadline: deadline(obj(item, `pending[${i}]`).deadline, `pending[${i}].deadline`),
    })),
  };
}

export async function fetchApprovalRecord(
  approvalId: string,
  signal?: AbortSignal,
): Promise<ApprovalRecordView> {
  const url = `/api/runtime/approvals?approvalId=${encodeURIComponent(approvalId)}`;
  const raw = obj(await getJson(url, signal), "The approval response");

  return {
    now: str(raw, "now", "The approval response"),
    approval: approval(raw.approval, "The approval"),
    deadline: deadline(raw.deadline, "The approval deadline"),
    decision: decisionRecord(raw.decision),
    versions: versionList(raw.versions, "The approval versions"),
    edited: raw.edited === true,
  };
}

function decisionRecord(value: unknown): DecisionView | null {
  if (value === null || value === undefined) return null;
  const raw = obj(value, "The recorded decision");
  const decision = str(raw, "decision", "The recorded decision");
  if (decision !== "approved" && decision !== "rejected") {
    fail("The recorded decision.decision", `is "${decision}", not approved or rejected.`);
  }
  const reason = optionalStr(raw, "reason");
  return {
    decision,
    decidedBy: str(raw, "decidedBy", "The recorded decision"),
    decidedAt: str(raw, "decidedAt", "The recorded decision"),
    ...(reason === null ? {} : { reason }),
  };
}

function versionList(value: unknown, where: string): ApprovalVersionView[] {
  if (!Array.isArray(value)) fail(where, "is missing or not an array.");
  return value.map((item, i) => {
    const raw = obj(item, `${where}[${i}]`);
    const author = str(raw, "author", `${where}[${i}]`);
    if (author !== "agent" && author !== "owner") {
      fail(`${where}[${i}].author`, `is "${author}", not agent or owner.`);
    }
    const changes = raw.changes;
    if (!Array.isArray(changes)) fail(`${where}[${i}].changes`, "is missing or not an array.");
    return {
      version: num(raw, "version", `${where}[${i}]`),
      author,
      authoredBy: str(raw, "authoredBy", `${where}[${i}]`),
      authoredAt: str(raw, "authoredAt", `${where}[${i}]`),
      args: record(raw, "args", `${where}[${i}]`),
      changes: changes.map((change, c) => argChange(change, `${where}[${i}].changes[${c}]`)),
    };
  });
}

const CHANGE_KINDS: ArgChangeView["kind"][] = ["added", "changed", "cleared"];

function argChange(value: unknown, where: string): ArgChangeView {
  const raw = obj(value, where);
  const kind = str(raw, "kind", where);
  const known = CHANGE_KINDS.find((candidate) => candidate === kind);
  if (!known) fail(`${where}.kind`, `is "${kind}", which is not added, changed or cleared.`);
  return {
    key: str(raw, "key", where),
    kind: known,
    ...(Object.hasOwn(raw, "from") ? { from: raw.from } : {}),
    ...(Object.hasOwn(raw, "to") ? { to: raw.to } : {}),
  };
}

/**
 * The run behind a proposal — its trigger, its accumulated context and its
 * timeline. This is the evidence half of the drawer: an owner approving a
 * customer email should be able to see which invoices the agent read to get
 * there without leaving the screen.
 */
export async function fetchRun(runId: string, signal?: AbortSignal): Promise<RunView> {
  const url = `/api/runtime/run?runId=${encodeURIComponent(runId)}`;
  const body = obj(await getJson(url, signal), "The run response");
  const raw = record(body, "run", "The run response");
  const trigger = raw.trigger;

  return {
    runId: str(raw, "runId", "The run"),
    agentId: str(raw, "agentId", "The run"),
    workflowId: str(raw, "workflowId", "The run"),
    status: str(raw, "status", "The run"),
    startedAt: str(raw, "startedAt", "The run"),
    endedAt: optionalStr(raw, "endedAt"),
    failure: optionalStr(raw, "failure"),
    context: record(raw, "context", "The run"),
    events: eventList(raw.events),
    trigger:
      typeof trigger === "object" && trigger !== null && !Array.isArray(trigger)
        ? {
            kind: optionalStr(trigger as Record<string, unknown>, "kind") ?? "unknown",
            firedAt: optionalStr(trigger as Record<string, unknown>, "firedAt") ?? "",
            payload: obj(
              (trigger as Record<string, unknown>).payload ?? {},
              "The run trigger payload",
            ),
          }
        : null,
  };
}

/**
 * Ordered by how much a reader wants it: the field that carries the sentence for
 * each event kind comes first, and the rest are the fallbacks. A kind this build
 * has never seen still renders its own name and instant rather than an empty row.
 */
const EVENT_TEXT_KEYS = [
  "summary",
  "reason",
  "message",
  "instruction",
  "decision",
  "status",
  "workflowId",
  "operation",
];

function eventList(value: unknown): RunEventView[] {
  if (!Array.isArray(value)) return [];
  const events: RunEventView[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    const kind = optionalStr(raw, "kind");
    if (kind === null) continue;
    const text = EVENT_TEXT_KEYS.map((key) => optionalStr(raw, key)).find(
      (candidate) => candidate !== null && candidate.trim() !== "",
    );
    events.push({
      kind,
      at: optionalStr(raw, "at") ?? "",
      stepId: optionalStr(raw, "stepId"),
      approvalId: optionalStr(raw, "approvalId"),
      text: text ?? "",
    });
  }
  return events;
}

export interface PlanContext {
  /** agentId → display name. Empty when the lookup was unavailable. */
  agentNames: Record<string, string>;
  /**
   * "fixture" (tools stubbed, nothing leaves the building) or "live" (real
   * integrations). Null when it could not be established — which the screen
   * must render as "unknown", never as the safe one, because the difference is
   * whether approving sends a customer an email.
   */
  mode: "fixture" | "live" | null;
}

/**
 * Agent display names and the runtime's mode, from the Factory's status
 * endpoint — the only route that already publishes both.
 *
 * Degrades to `{ agentNames: {}, mode: null }` on any failure. The names are
 * cosmetic (the agent id is shown regardless) and a null mode is rendered as an
 * admission rather than an assumption, so nothing here can take the inbox down.
 */
export async function fetchPlanContext(signal?: AbortSignal): Promise<PlanContext> {
  try {
    const body = await getJson("/api/runtime/build", signal);
    if (typeof body !== "object" || body === null) return { agentNames: {}, mode: null };
    const root = body as Record<string, unknown>;

    const rawMode = optionalStr(root, "mode");
    const mode = rawMode === "fixture" || rawMode === "live" ? rawMode : null;

    const plan = root.plan;
    if (typeof plan !== "object" || plan === null) return { agentNames: {}, mode };
    const agents = (plan as Record<string, unknown>).agents;
    if (!Array.isArray(agents)) return { agentNames: {}, mode };

    const agentNames: Record<string, string> = {};
    for (const entry of agents) {
      if (typeof entry !== "object" || entry === null) continue;
      const row = entry as Record<string, unknown>;
      const id = optionalStr(row, "id");
      const name = optionalStr(row, "name");
      if (id !== null && name !== null && name.trim() !== "") agentNames[id] = name;
    }
    return { agentNames, mode };
  } catch {
    return { agentNames: {}, mode: null };
  }
}

/* ═══════════════════════════ The decision ═══════════════════════════ */

export interface DecisionInput {
  approvalId: string;
  decision: "approved" | "rejected";
  /** Required by the route when rejecting. */
  reason?: string;
  /**
   * A PATCH over the frozen args, omitted entirely when the owner changed
   * nothing. Never a replacement: the runtime merges it with
   * `{ ...proposed, ...editedArgs }`.
   */
  editedArgs?: Record<string, unknown>;
}

/** What the runtime did, as far as the response allows us to say. */
export interface DecisionOutcome {
  runId: string | null;
  /** The run's status AFTER resuming. Kept raw; an unknown one is shown verbatim. */
  runStatus: string | null;
  /**
   * Set when the resumed run PAUSED AGAIN at a different approval. The route
   * returns the run's current pending approval, which is a new item to decide,
   * not the one just decided — easy to misread as an echo, and it is not.
   */
  nextApprovalId: string | null;
  failure: string | null;
  events: RunEventView[];
  versions: ApprovalVersionView[];
  edited: boolean;
  /** Dependent workflows this decision made due (M4 → M5 fan-out). */
  dependentsQueued: number | null;
  /** The fan-out failed. The run itself is settled and correct regardless. */
  dependencyError: string | null;
  /** Present only when the basics could not be read — rendered as-is. */
  unreadable: string | null;
}

export type DecisionResult =
  /** HTTP 2xx. The decision is recorded and the run has already resumed. */
  | { kind: "recorded"; outcome: DecisionOutcome }
  /** The runtime refused BEFORE writing anything. Safe to correct and retry. */
  | { kind: "refused"; status: number; message: string }
  /** Nobody can say whether it landed. Refresh before retrying — never resend. */
  | { kind: "unknown"; message: string };

/**
 * The statuses this route raises ahead of `saveDecision`, and therefore the only
 * ones that guarantee nothing happened: 400 for a malformed request, 404 for an
 * approval that does not exist, 409 for an agent, package or run that cannot
 * take the decision — including the second decision on an already-decided
 * approval. Anything else is treated as unknown, deliberately: a 500 from
 * somewhere other than the handler's own catch could have landed on either side
 * of the write.
 */
const GUARANTEED_NO_OP = [400, 404, 409];

export async function submitDecision(
  input: DecisionInput,
  signal?: AbortSignal,
): Promise<DecisionResult> {
  let response: Response;
  try {
    response = await fetch("/api/runtime/approvals", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(input),
    });
  } catch (err) {
    return {
      kind: "unknown",
      message:
        `The request never completed (${err instanceof Error ? err.message : String(err)}). ` +
        `The decision may or may not have been recorded — refresh the inbox and check before ` +
        `deciding again, because resending an approval that landed sends the action twice.`,
    };
  }

  const body = await readBody(response);

  if (!response.ok) {
    if (GUARANTEED_NO_OP.includes(response.status)) {
      return { kind: "refused", status: response.status, message: errorMessage(body, response) };
    }
    return {
      kind: "unknown",
      message:
        `The server answered ${response.status}: ${errorMessage(body, response)} That answer ` +
        `does not prove the decision was refused, so it may already have been recorded. ` +
        `Refresh the inbox and check before deciding again.`,
    };
  }

  return { kind: "recorded", outcome: readOutcome(body) };
}

/**
 * Lenient on purpose — see the module header. Every field that cannot be read
 * becomes null, and `unreadable` carries the reason so the screen can show the
 * raw answer instead of pretending it understood one.
 */
function readOutcome(body: unknown): DecisionOutcome {
  const empty: DecisionOutcome = {
    runId: null,
    runStatus: null,
    nextApprovalId: null,
    failure: null,
    events: [],
    versions: [],
    edited: false,
    dependentsQueued: null,
    dependencyError: null,
    unreadable: null,
  };

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      ...empty,
      unreadable:
        "Your decision was accepted, but the answer could not be read, so this screen " +
        "cannot say how the run ended.",
    };
  }

  const raw = body as Record<string, unknown>;
  const runStatus = optionalStr(raw, "runStatus") ?? optionalStr(raw, "status");
  const dependents = raw.dependentsQueued;

  let versions: ApprovalVersionView[] = [];
  try {
    versions = versionList(raw.versions ?? [], "The decision versions");
  } catch {
    // A version list we cannot read costs an audit note, not the outcome.
    versions = [];
  }

  return {
    runId: optionalStr(raw, "runId"),
    runStatus,
    nextApprovalId: optionalStr(raw, "approvalId"),
    failure: optionalStr(raw, "failure"),
    events: eventList(raw.events),
    versions,
    edited: raw.edited === true,
    dependentsQueued:
      typeof dependents === "number" && Number.isFinite(dependents) ? dependents : null,
    dependencyError: optionalStr(raw, "dependencyError"),
    unreadable:
      runStatus === null
        ? "Your decision was accepted, but nothing came back about how the run ended, so " +
          "this screen cannot confirm it."
        : null,
  };
}
