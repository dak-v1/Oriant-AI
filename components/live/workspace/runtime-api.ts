/**
 * components/live/workspace/runtime-api.ts — reading the runtime from the
 * browser, without trusting it (ROLE_C_PLAN M5).
 *
 * Everything the live Workspace shows about what is happening now comes from
 * four endpoints that already exist and are already the source of truth:
 * /api/runtime/{scheduler,approvals,run,activation}. This module is the only
 * place that talks to them, and it does two things the rest of the screen then
 * gets to assume.
 *
 * FIRST, IT PARSES RATHER THAN CASTS. `await response.json() as Snapshot` is one
 * line shorter and is a lie: it tells TypeScript a shape it never checked, and
 * the first field the route renames becomes `undefined` rendered as a blank
 * where a number should be. A blank in the "at risk" tile is the specific
 * failure this codebase cannot tolerate — it reads as "nothing is wrong". So
 * every field is read and narrowed, and a response that does not match is an
 * ERROR the screen shows, not a snapshot with holes in it.
 *
 * The same posture applies to the string unions. A job status, a run status or a
 * deadline state that this build does not recognise is refused rather than
 * passed through, because the whole screen is a set of judgements about those
 * words — "dead_letter is at risk", "skipped is not a failure" — and a word with
 * no judgement attached would slip into whichever bucket the fallback happened
 * to pick. The status lists are built from a keyed object `satisfies` the
 * runtime's own union, so a seventh `JobStatus` is a compile error here rather
 * than a blind spot at run time; that is the pattern
 * app/api/runtime/scheduler/route.ts already uses for `?status=`.
 *
 * SECOND, IT FAILS PER SOURCE, NOT PER PAGE. Each endpoint is loaded into its
 * own `Loaded<T>`, so the scheduler being unreachable costs the schedule panel
 * and the "scheduled runs" tile and nothing else; the approvals inbox preview
 * still renders. One combined try/catch would take the whole Workspace down for
 * the least important of the three, and — worse — a single `Promise.all` reject
 * would leave the tiles showing the last good numbers next to an error, which is
 * a screen that contradicts itself.
 *
 * ACTIVATION IS DELIBERATELY NOT LOADED WITH THE REST. GET /api/runtime/activation
 * re-derives the sandbox verdict on every request — it runs the whole scenario
 * library and the stress sweep before it can answer, and its own header says it
 * is slow on purpose and must never learn to memoise. Firing that from a
 * dashboard on every mount, and again on every refocus, would turn a page an
 * owner leaves open into a machine that re-proves the workforce every few
 * seconds. It is fetched only when someone asks what is blocking activation.
 */

import type { RiskLevel } from "@/lib/plan/types";
import type { ApprovalDeadlineState } from "@/lib/runtime/approvals";
import type { JobStatus } from "@/lib/runtime/schedule/types";
import type { TriggerSpec } from "@/lib/plan/types";
import type { RunStatus } from "@/lib/runtime/types";

/* ═══════════════════════════ Vocabularies ═══════════════════════════ */

/**
 * The runtime's string unions, as values a run-time check can consult.
 *
 * Written as keyed objects with `satisfies` so the list and the union cannot
 * drift: a status added to the runtime and not added here fails to compile.
 * An array of literals would have accepted the omission silently, and the
 * consequence would be this screen refusing a status the store legitimately
 * returns.
 */
const JOB_STATUSES = Object.keys({
  queued: true,
  running: true,
  succeeded: true,
  failed: true,
  dead_letter: true,
  skipped: true,
} satisfies Record<JobStatus, true>) as JobStatus[];

const RUN_STATUSES = Object.keys({
  running: true,
  awaiting_approval: true,
  completed: true,
  failed: true,
  refused: true,
  cancelled: true,
} satisfies Record<RunStatus, true>) as RunStatus[];

const TRIGGER_KINDS = Object.keys({
  schedule: true,
  event: true,
  threshold: true,
  dependency: true,
  manual: true,
} satisfies Record<TriggerSpec["kind"], true>) as TriggerSpec["kind"][];

const RISK_LEVELS = Object.keys({
  low: true,
  medium: true,
  high: true,
} satisfies Record<RiskLevel, true>) as RiskLevel[];

const DEADLINE_STATES = Object.keys({
  due: true,
  overdue: true,
  unreadable: true,
} satisfies Record<ApprovalDeadlineState, true>) as ApprovalDeadlineState[];

/* ═══════════════════════════ Snapshots ═══════════════════════════ */

export interface TriggerRow {
  triggerId: string;
  agentId: string;
  workflowId: string;
  kind: TriggerSpec["kind"];
  /** The owner's words for the schedule — "Every Friday at 9:00am". */
  label: string;
  enabled: boolean;
  /** Null for every kind but `schedule`; those wait for something to arrive. */
  nextFireAt: string | null;
  lastFiredAt: string | null;
  registeredAt: string;
}

export interface JobRow {
  jobId: string;
  triggerId: string | null;
  agentId: string;
  workflowId: string;
  status: JobStatus;
  attempt: number;
  maxAttempts: number;
  runAfter: string;
  enqueuedAt: string;
  startedAt: string | null;
  endedAt: string | null;
  runId: string | null;
  error: string | null;
  /** Set only on `skipped` — quiet hours or the daily cap, never a failure. */
  skipReason: string | null;
}

export interface SchedulerSnapshot {
  mode: string;
  /** The server's instant. Every `nextFireAt` below is read against it. */
  now: string;
  triggers: TriggerRow[];
  jobs: JobRow[];
}

export interface ApprovalDeadlineRow {
  state: ApprovalDeadlineState;
  overdueByMins: number;
  minutesRemaining: number;
  /** One line in the owner's language — "Overdue by 2h 15m." */
  detail: string;
}

export interface PendingApprovalRow {
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
  /** What the agent proposes to do. The full draft lives in the inbox. */
  integrationId: string;
  operation: string;
  deadline: ApprovalDeadlineRow;
}

export interface ApprovalsSnapshot {
  now: string;
  overdueCount: number;
  pending: PendingApprovalRow[];
}

export interface RunRow {
  runId: string;
  agentId: string;
  workflowId: string;
  status: RunStatus;
  pendingApprovalId: string | null;
  startedAt: string;
  endedAt: string | null;
  failure: string | null;
  /** How many events the run recorded; the stream itself is a separate read. */
  events: number;
}

export interface RunsSnapshot {
  runs: RunRow[];
}

export interface ActivationBlockerRow {
  message: string;
  href: string;
  agentId: string | null;
  integrationId: string | null;
}

export interface ActivationGateRow {
  id: string;
  label: string;
  satisfied: boolean;
  detail: string;
  blockers: ActivationBlockerRow[];
}

export interface ActivationSnapshot {
  planId: string;
  planVersion: number;
  ready: boolean;
  gates: ActivationGateRow[];
  /** Present only when this plan version is already live. */
  deployment: {
    deploymentId: string;
    planVersion: number;
    activatedAt: string;
    activatedBy: string;
  } | null;
}

/* ═══════════════════════════ Narrowing ═══════════════════════════ */

/**
 * A parse failure, told apart from every other failure so `load` can replace it
 * with a sentence an owner can act on.
 *
 * The messages below are written for a developer reading a stack trace — they
 * name the field and the shape it was expected to be — and they must never reach
 * a screen. What an owner needs to be told is that the answer could not be read
 * and that nothing was shown from it, which is what `load` says instead. The
 * technical message is kept on the error, so it is one `console.error` away and
 * not lost.
 */
class UnreadableAnswer extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnreadableAnswer";
  }
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new UnreadableAnswer(`${path} should be a JSON object; got ${describe(value)}.`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new UnreadableAnswer(`${path} should be an array; got ${describe(value)}.`);
  }
  return value;
}

function asText(source: Record<string, unknown>, key: string, path: string): string {
  const value = source[key];
  if (typeof value !== "string") {
    throw new UnreadableAnswer(`${path}.${key} should be a string; got ${describe(value)}.`);
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
    throw new UnreadableAnswer(
      `${path}.${key} should be a string or null; got ${describe(value)}.`,
    );
  }
  return value;
}

function asNumber(source: Record<string, unknown>, key: string, path: string): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new UnreadableAnswer(`${path}.${key} should be a finite number; got ${describe(value)}.`);
  }
  return value;
}

function asFlag(source: Record<string, unknown>, key: string, path: string): boolean {
  const value = source[key];
  if (typeof value !== "boolean") {
    throw new UnreadableAnswer(`${path}.${key} should be true or false; got ${describe(value)}.`);
  }
  return value;
}

function asTextList(
  source: Record<string, unknown>,
  key: string,
  path: string,
): string[] {
  return asArray(source[key], `${path}.${key}`).map((entry, index) => {
    if (typeof entry !== "string") {
      throw new UnreadableAnswer(
        `${path}.${key}[${index}] should be a string; got ${describe(entry)}.`,
      );
    }
    return entry;
  });
}

/**
 * One of a known set, or an error naming the set.
 *
 * This is where the module earns its keep. Every judgement the Workspace makes
 * is keyed on one of these words, so a word with no judgement attached would
 * land in whatever bucket a fallback chose — a new terminal job status quietly
 * counted as healthy, for instance. Refusing it costs a visible error; accepting
 * it costs a wrong number nobody can see is wrong.
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
    throw new UnreadableAnswer(
      `${path}.${key} is ${describe(value)}, which this build does not recognise. ` +
        `Expected one of: ${allowed.join(", ")}.`,
    );
  }
  return match;
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "nothing";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "an array";
  return typeof value;
}

/* ═══════════════════════════ Parsers ═══════════════════════════ */

function parseScheduler(raw: unknown): SchedulerSnapshot {
  const body = asRecord(raw, "scheduler");
  return {
    mode: asText(body, "mode", "scheduler"),
    now: asText(body, "now", "scheduler"),
    triggers: asArray(body.triggers, "scheduler.triggers").map((entry, index) => {
      const path = `scheduler.triggers[${index}]`;
      const row = asRecord(entry, path);
      return {
        triggerId: asText(row, "triggerId", path),
        agentId: asText(row, "agentId", path),
        workflowId: asText(row, "workflowId", path),
        kind: asMember(row, "kind", path, TRIGGER_KINDS),
        label: asText(row, "label", path),
        enabled: asFlag(row, "enabled", path),
        nextFireAt: asTextOrNull(row, "nextFireAt", path),
        lastFiredAt: asTextOrNull(row, "lastFiredAt", path),
        registeredAt: asText(row, "registeredAt", path),
      };
    }),
    jobs: asArray(body.jobs, "scheduler.jobs").map((entry, index) => {
      const path = `scheduler.jobs[${index}]`;
      const row = asRecord(entry, path);
      return {
        jobId: asText(row, "jobId", path),
        triggerId: asTextOrNull(row, "triggerId", path),
        agentId: asText(row, "agentId", path),
        workflowId: asText(row, "workflowId", path),
        status: asMember(row, "status", path, JOB_STATUSES),
        attempt: asNumber(row, "attempt", path),
        maxAttempts: asNumber(row, "maxAttempts", path),
        runAfter: asText(row, "runAfter", path),
        enqueuedAt: asText(row, "enqueuedAt", path),
        startedAt: asTextOrNull(row, "startedAt", path),
        endedAt: asTextOrNull(row, "endedAt", path),
        runId: asTextOrNull(row, "runId", path),
        error: asTextOrNull(row, "error", path),
        skipReason: asTextOrNull(row, "skipReason", path),
      };
    }),
  };
}

function parseApprovals(raw: unknown): ApprovalsSnapshot {
  const body = asRecord(raw, "approvals");
  return {
    now: asText(body, "now", "approvals"),
    overdueCount: asNumber(body, "overdueCount", "approvals"),
    pending: asArray(body.pending, "approvals.pending").map((entry, index) => {
      const path = `approvals.pending[${index}]`;
      const row = asRecord(entry, path);
      const proposed = asRecord(row.proposed, `${path}.proposed`);
      const deadline = asRecord(row.deadline, `${path}.deadline`);
      return {
        approvalId: asText(row, "approvalId", path),
        runId: asText(row, "runId", path),
        agentId: asText(row, "agentId", path),
        workflowId: asText(row, "workflowId", path),
        stepId: asText(row, "stepId", path),
        reason: asText(row, "reason", path),
        risk: asMember(row, "risk", path, RISK_LEVELS),
        breachedLimits: asTextList(row, "breachedLimits", path),
        approvalOwner: asText(row, "approvalOwner", path),
        createdAt: asText(row, "createdAt", path),
        dueAt: asText(row, "dueAt", path),
        integrationId: asText(proposed, "integrationId", `${path}.proposed`),
        operation: asText(proposed, "operation", `${path}.proposed`),
        deadline: {
          state: asMember(deadline, "state", `${path}.deadline`, DEADLINE_STATES),
          overdueByMins: asNumber(deadline, "overdueByMins", `${path}.deadline`),
          minutesRemaining: asNumber(
            deadline,
            "minutesRemaining",
            `${path}.deadline`,
          ),
          detail: asText(deadline, "detail", `${path}.deadline`),
        },
      };
    }),
  };
}

function parseRuns(raw: unknown): RunsSnapshot {
  const body = asRecord(raw, "runs");
  return {
    runs: asArray(body.runs, "runs.runs").map((entry, index) => {
      const path = `runs.runs[${index}]`;
      const row = asRecord(entry, path);
      return {
        runId: asText(row, "runId", path),
        agentId: asText(row, "agentId", path),
        workflowId: asText(row, "workflowId", path),
        status: asMember(row, "status", path, RUN_STATUSES),
        pendingApprovalId: asTextOrNull(row, "pendingApprovalId", path),
        startedAt: asText(row, "startedAt", path),
        endedAt: asTextOrNull(row, "endedAt", path),
        failure: asTextOrNull(row, "failure", path),
        events: asNumber(row, "events", path),
      };
    }),
  };
}

function parseActivation(raw: unknown): ActivationSnapshot {
  const body = asRecord(raw, "activation");
  const checklist = asRecord(body.checklist, "activation.checklist");
  const deploymentRaw = checklist.activeDeployment;

  return {
    planId: asText(checklist, "planId", "activation.checklist"),
    planVersion: asNumber(checklist, "planVersion", "activation.checklist"),
    ready: asFlag(checklist, "ready", "activation.checklist"),
    gates: asArray(checklist.gates, "activation.checklist.gates").map(
      (entry, index) => {
        const path = `activation.checklist.gates[${index}]`;
        const row = asRecord(entry, path);
        return {
          id: asText(row, "id", path),
          label: asText(row, "label", path),
          satisfied: asFlag(row, "satisfied", path),
          detail: asText(row, "detail", path),
          blockers: asArray(row.blockers, `${path}.blockers`).map(
            (blocker, at) => {
              const blockerPath = `${path}.blockers[${at}]`;
              const fields = asRecord(blocker, blockerPath);
              return {
                message: asText(fields, "message", blockerPath),
                href: asText(fields, "href", blockerPath),
                agentId: asTextOrNull(fields, "agentId", blockerPath),
                integrationId: asTextOrNull(fields, "integrationId", blockerPath),
              };
            },
          ),
        };
      },
    ),
    deployment:
      deploymentRaw === null || deploymentRaw === undefined
        ? null
        : (() => {
            const path = "activation.checklist.activeDeployment";
            const row = asRecord(deploymentRaw, path);
            return {
              deploymentId: asText(row, "deploymentId", path),
              planVersion: asNumber(row, "planVersion", path),
              activatedAt: asText(row, "activatedAt", path),
              activatedBy: asText(row, "activatedBy", path),
            };
          })(),
  };
}

/* ═══════════════════════════ Loading ═══════════════════════════ */

/**
 * One source's outcome. Exactly one of `data` and `error` is set, and a panel
 * that has neither has simply not loaded yet — three states, distinguishable,
 * because "no data" and "failed to fetch" must never render the same way.
 */
export interface Loaded<T> {
  data: T | null;
  error: string | null;
}

/**
 * `label` is what this source is CALLED on screen, and it is threaded through
 * every failure message for one reason: the alternative was naming the URL, and
 * a URL tells the person reading a dashboard nothing they can do anything about.
 */
async function getJson(url: string, label: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    signal,
    // The runtime stores are the truth and they change under us; a cached
    // dashboard is a dashboard that says an approval is still waiting after it
    // has been decided.
    cache: "no-store",
    headers: { accept: "application/json" },
  });

  const body = await response.text();
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    throw new Error(`${label} answered ${response.status}, and the answer could not be read.`);
  }

  if (!response.ok) {
    // Every /api/runtime route reports failure as `{ error }`, so the server's
    // own sentence is preferred over a status code the owner cannot act on.
    const stated =
      typeof raw === "object" && raw !== null && !Array.isArray(raw)
        ? (raw as { error?: unknown }).error
        : undefined;
    throw new Error(
      typeof stated === "string" && stated.trim() !== ""
        ? stated
        : `${label} answered ${response.status}.`,
    );
  }

  return raw;
}

async function load<T>(
  url: string,
  label: string,
  parse: (raw: unknown) => T,
  signal: AbortSignal,
): Promise<Loaded<T>> {
  try {
    return { data: parse(await getJson(url, label, signal)), error: null };
  } catch (err) {
    // An abort is a navigation or a superseded refresh, not a failure to report.
    // Reported as neither data nor error so the panel keeps whatever it had.
    if (err instanceof DOMException && err.name === "AbortError") {
      return { data: null, error: null };
    }
    /* A parse failure names a field and a JSON shape, which is a sentence for a
       developer. The screen is told the same fact in the terms it can act on:
       the answer could not be read, and nothing was taken from it. */
    if (err instanceof UnreadableAnswer) {
      return {
        data: null,
        error:
          `${label} answered, but in a form this screen could not read, so nothing was ` +
          `taken from it. None of the figures here are a count of zero.`,
      };
    }
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export function loadScheduler(signal: AbortSignal): Promise<Loaded<SchedulerSnapshot>> {
  return load("/api/runtime/scheduler", "The schedule", parseScheduler, signal);
}

export function loadApprovals(signal: AbortSignal): Promise<Loaded<ApprovalsSnapshot>> {
  return load("/api/runtime/approvals", "The approvals queue", parseApprovals, signal);
}

export function loadRuns(signal: AbortSignal): Promise<Loaded<RunsSnapshot>> {
  return load("/api/runtime/run", "Your recent activity", parseRuns, signal);
}

/**
 * The activation checklist — on demand only. See the module header: this
 * endpoint re-runs the sandbox suite to answer, and a dashboard that called it
 * on a timer would re-prove the whole workforce every few seconds.
 */
export function loadActivation(signal: AbortSignal): Promise<Loaded<ActivationSnapshot>> {
  return load("/api/runtime/activation", "The go-live checks", parseActivation, signal);
}
