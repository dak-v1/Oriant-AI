/**
 * components/live/agents/api.ts — the only place a roster response is allowed to
 * become a fact (ROLE_C_PLAN M6).
 *
 * IT PARSES RATHER THAN CASTS, for the reason every live surface in this
 * directory does: `await response.json() as Roster` is one line shorter and is a
 * lie, and the first field the route renames turns into an `undefined` rendered
 * as a blank where a state, a cap or a next-fire time should be. On this screen a
 * blank is specifically dangerous — an agent whose state failed to read must not
 * render beside four agents that read fine, looking like the quiet one.
 *
 * THE STRING UNIONS ARE CLOSED SETS AND UNRECOGNISED WORDS ARE REFUSED. Every
 * judgement this screen makes hangs off one of them: whether "Resume" is offered
 * at all hangs off `paused`, whether a run counts as in flight hangs off
 * `awaiting_approval`. A word with no judgement attached would land in whichever
 * bucket a fallback happened to pick, and the fallback is invisible. The lists
 * are built from keyed objects that `satisfy` the runtime's own unions, so a
 * sixth `AgentRuntimeState` is a compile error here rather than a blind spot at
 * run time.
 *
 * READING FAILS CLOSED; A TRANSITION REPORTS WHAT IT CAN. A GET that cannot be
 * understood is refused whole and the screen shows the sentence naming the field.
 * A pause or resume, by the time its answer arrives, has already happened or
 * already been refused, so `submitTransition` never throws on a shape — it
 * returns what it could establish and says plainly when it could not.
 *
 * A REFUSED RESUME IS A NORMAL ANSWER, NOT AN ERROR PAGE. `resumeAgent` returns
 * `changed: false` with a sentence — not in the plan, never activated, version
 * drifted, wrong state — and the route sends that back as a 409 whose body is the
 * ordinary `{ change }` shape rather than `{ error }`. So a non-2xx here is read
 * for `change.detail` FIRST and only then for `error`: dropping the runtime's own
 * explanation and printing "409" would be exactly the silent failure the roster
 * exists to prevent.
 */

import type { Op, OperatingMode, QuietHours, TriggerSpec } from "@/lib/plan/types";
import type { AgentRuntimeState } from "@/lib/runtime/schedule/types";
import type { PolicyDecision, RunStatus } from "@/lib/runtime/types";

export type { AgentRuntimeState, OperatingMode, RunStatus };

/* ═══════════════════════════ Vocabularies ═══════════════════════════ */

const AGENT_STATES = Object.keys({
  building: true,
  validated: true,
  active: true,
  paused: true,
  failed: true,
} satisfies Record<AgentRuntimeState, true>) as AgentRuntimeState[];

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

const OPERATING_MODES = Object.keys({
  draft_only: true,
  act_after_approval: true,
  auto_within_limits: true,
} satisfies Record<OperatingMode, true>) as OperatingMode[];

const OPS = Object.keys({
  "<": true,
  "<=": true,
  ">": true,
  ">=": true,
  "==": true,
} satisfies Record<Op, true>) as Op[];

const ON_BREACH = ["require_approval", "block"] as const;
export type OnBreach = (typeof ON_BREACH)[number];

const GATE_ACTIONS = Object.keys({
  allow: true,
  require_approval: true,
  refuse: true,
} satisfies Record<PolicyDecision["action"], true>) as PolicyDecision["action"][];

/* ═══════════════════════════ Shapes ═══════════════════════════ */

export interface TriggerView {
  triggerId: string;
  enabled: boolean;
  /** Null for every kind but `schedule`; the rest wait for something to arrive. */
  nextFireAt: string | null;
  lastFiredAt: string | null;
  registeredAt: string;
}

export interface WorkflowView {
  workflowId: string;
  name: string;
  description: string;
  enabled: boolean;
  kind: TriggerSpec["kind"];
  /** The owner's words for when it runs — "Every Friday at 9:00am". */
  label: string;
  /** Null when no trigger is registered for this workflow. */
  trigger: TriggerView | null;
}

export interface RunView {
  runId: string;
  workflowId: string;
  status: RunStatus;
  startedAt: string;
  endedAt: string | null;
  failure: string | null;
  events: number;
  pendingApprovalId: string | null;
  /** The runtime's sentence for what it is waiting on, or what ended it. */
  detail: string;
}

export interface CountsView {
  /** Null when the agent's local day could not be resolved — never a zero. */
  runsToday: number | null;
  runsTodayUnavailable: string | null;
  /** Null means uncapped. */
  maxRunsPerDay: number | null;
  dayTimezone: string;
  inFlight: number;
  pendingApprovals: number;
  overdueApprovals: number;
  failedRuns: number;
  refusedRuns: number;
  deadLetterJobs: number;
  /** Quiet hours or the daily cap. NOT a failure — kept apart on purpose. */
  skippedJobs: number;
  enabledTriggers: number;
  registeredTriggers: number;
}

export interface LimitView {
  id: string;
  metric: string;
  op: Op;
  value: number;
  unit: string | null;
  onBreach: OnBreach;
}

export interface ToolGrantView {
  integrationId: string;
  operations: string[];
  purpose: string;
  required: boolean;
}

/** D's configuration, read-only. Nothing on this screen writes any of it. */
export interface ConfigView {
  operatingMode: OperatingMode;
  limits: LimitView[];
  alwaysApprove: string[];
  forbidden: string[];
  approvalOwner: string;
  escalateAfterMins: number;
  quietHours: QuietHours | null;
  maxRunsPerDay: number | null;
  tools: ToolGrantView[];
}

export interface RuntimeView {
  state: AgentRuntimeState;
  agentVersion: number;
  /** The runtime's own sentence about why it is in this state. Shown verbatim. */
  detail: string;
  updatedAt: string;
}

export interface StartGateView {
  action: PolicyDecision["action"];
  reason: string;
}

export interface AgentView {
  agentId: string;
  name: string;
  role: string;
  /** The plan's version. `runtime.agentVersion` is what was activated. */
  version: number;
  /** Null when no runtime record exists — this agent has never been activated. */
  runtime: RuntimeView | null;
  versionDrift: boolean;
  workflows: WorkflowView[];
  runs: RunView[];
  runsTotal: number;
  counts: CountsView;
  /** Null when the daily count was unavailable, so the gate could not be asked. */
  startGate: StartGateView | null;
  config: ConfigView;
}

export interface UnplannedAgentView {
  agentId: string;
  agentVersion: number;
  state: AgentRuntimeState;
  detail: string;
  updatedAt: string;
  enabledTriggers: number;
}

export interface RosterView {
  mode: string;
  /** The server's instant. Every deadline and next-fire was judged against it. */
  now: string;
  planId: string;
  planVersion: number;
  approvedAt: string;
  /** True when triggers are registered — the cheapest evidence of a go-live. */
  activated: boolean;
  deployment: {
    deploymentId: string;
    planVersion: number;
    activatedAt: string;
    activatedBy: string;
  } | null;
  globalQuietHours: QuietHours | null;
  globalForbidden: string[];
  agents: AgentView[];
  /** Runtime records for agent ids the plan no longer contains. */
  unplanned: UnplannedAgentView[];
}

/* ═══════════════════════════ Errors ═══════════════════════════ */

export type ApiFailureKind = "transport" | "http" | "malformed";

export class AgentsApiError extends Error {
  readonly kind: ApiFailureKind;
  /** Null for a transport failure — there was no response to have a status. */
  readonly status: number | null;

  constructor(kind: ApiFailureKind, message: string, status: number | null = null) {
    super(message);
    this.name = "AgentsApiError";
    this.kind = kind;
    this.status = status;
  }
}

/* ═══════════════════════════ Strict readers ═══════════════════════════ */

/**
 * Every reader names the field it rejected, and the screen prints that sentence
 * verbatim: "the roster is broken" becomes "agents[2].counts.runsToday is not a
 * finite number" without anyone opening a console.
 */
function fail(where: string, why: string): never {
  throw new AgentsApiError("malformed", `${where} ${why}`);
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

function numOrNull(source: Record<string, unknown>, key: string, where: string): number | null {
  const value = source[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${where}.${key}`, "is not a finite number or null.");
  }
  return value;
}

function flag(source: Record<string, unknown>, key: string, where: string): boolean {
  const value = source[key];
  if (typeof value !== "boolean") fail(`${where}.${key}`, "is missing or not true/false.");
  return value;
}

function strList(source: Record<string, unknown>, key: string, where: string): string[] {
  return arr(source[key], `${where}.${key}`).map((item, index) => {
    if (typeof item !== "string") fail(`${where}.${key}[${index}]`, "is not a string.");
    return item;
  });
}

/**
 * One of a known set, or a refusal naming the set. See the module header for why
 * nothing here falls back to a "safe" default: there is no safe default when the
 * word is what the screen's judgement is keyed on.
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
      `is ${JSON.stringify(value)}, which this build does not recognise. ` +
        `Expected one of: ${allowed.join(", ")}.`,
    );
  }
  return match;
}

function quietHours(value: unknown, where: string): QuietHours | null {
  if (value === null || value === undefined) return null;
  const raw = obj(value, where);
  return {
    start: str(raw, "start", where),
    end: str(raw, "end", where),
    timezone: str(raw, "timezone", where),
  };
}

/* ═══════════════════════════ Parsing the roster ═══════════════════════════ */

function readTrigger(value: unknown, where: string): TriggerView | null {
  if (value === null || value === undefined) return null;
  const raw = obj(value, where);
  return {
    triggerId: str(raw, "triggerId", where),
    enabled: flag(raw, "enabled", where),
    nextFireAt: strOrNull(raw, "nextFireAt", where),
    lastFiredAt: strOrNull(raw, "lastFiredAt", where),
    registeredAt: str(raw, "registeredAt", where),
  };
}

function readWorkflow(value: unknown, where: string): WorkflowView {
  const raw = obj(value, where);
  return {
    workflowId: str(raw, "workflowId", where),
    name: str(raw, "name", where),
    description: str(raw, "description", where),
    enabled: flag(raw, "enabled", where),
    kind: member(raw, "triggerKind", where, TRIGGER_KINDS),
    label: str(raw, "triggerLabel", where),
    trigger: readTrigger(raw.trigger, `${where}.trigger`),
  };
}

function readRun(value: unknown, where: string): RunView {
  const raw = obj(value, where);
  return {
    runId: str(raw, "runId", where),
    workflowId: str(raw, "workflowId", where),
    status: member(raw, "status", where, RUN_STATUSES),
    startedAt: str(raw, "startedAt", where),
    endedAt: strOrNull(raw, "endedAt", where),
    failure: strOrNull(raw, "failure", where),
    events: num(raw, "events", where),
    pendingApprovalId: strOrNull(raw, "pendingApprovalId", where),
    detail: str(raw, "detail", where),
  };
}

function readCounts(value: unknown, where: string): CountsView {
  const raw = obj(value, where);
  return {
    runsToday: numOrNull(raw, "runsToday", where),
    runsTodayUnavailable: strOrNull(raw, "runsTodayUnavailable", where),
    maxRunsPerDay: numOrNull(raw, "maxRunsPerDay", where),
    dayTimezone: str(raw, "dayTimezone", where),
    inFlight: num(raw, "inFlight", where),
    pendingApprovals: num(raw, "pendingApprovals", where),
    overdueApprovals: num(raw, "overdueApprovals", where),
    failedRuns: num(raw, "failedRuns", where),
    refusedRuns: num(raw, "refusedRuns", where),
    deadLetterJobs: num(raw, "deadLetterJobs", where),
    skippedJobs: num(raw, "skippedJobs", where),
    enabledTriggers: num(raw, "enabledTriggers", where),
    registeredTriggers: num(raw, "registeredTriggers", where),
  };
}

function readConfig(value: unknown, where: string): ConfigView {
  const raw = obj(value, where);
  return {
    operatingMode: member(raw, "operatingMode", where, OPERATING_MODES),
    limits: arr(raw.limits, `${where}.limits`).map((entry, index) => {
      const at = `${where}.limits[${index}]`;
      const limit = obj(entry, at);
      return {
        id: str(limit, "id", at),
        metric: str(limit, "metric", at),
        op: member(limit, "op", at, OPS),
        value: num(limit, "value", at),
        unit: strOrNull(limit, "unit", at),
        onBreach: member(limit, "onBreach", at, ON_BREACH),
      };
    }),
    alwaysApprove: strList(raw, "alwaysApprove", where),
    forbidden: strList(raw, "forbidden", where),
    approvalOwner: str(raw, "approvalOwner", where),
    escalateAfterMins: num(raw, "escalateAfterMins", where),
    quietHours: quietHours(raw.quietHours, `${where}.quietHours`),
    maxRunsPerDay: numOrNull(raw, "maxRunsPerDay", where),
    tools: arr(raw.tools, `${where}.tools`).map((entry, index) => {
      const at = `${where}.tools[${index}]`;
      const grant = obj(entry, at);
      return {
        integrationId: str(grant, "integrationId", at),
        operations: strList(grant, "operations", at),
        purpose: str(grant, "purpose", at),
        required: flag(grant, "required", at),
      };
    }),
  };
}

function readRuntime(value: unknown, where: string): RuntimeView | null {
  if (value === null || value === undefined) return null;
  const raw = obj(value, where);
  return {
    state: member(raw, "state", where, AGENT_STATES),
    agentVersion: num(raw, "agentVersion", where),
    detail: str(raw, "detail", where),
    updatedAt: str(raw, "updatedAt", where),
  };
}

function readStartGate(value: unknown, where: string): StartGateView | null {
  if (value === null || value === undefined) return null;
  const raw = obj(value, where);
  return {
    action: member(raw, "action", where, GATE_ACTIONS),
    reason: str(raw, "reason", where),
  };
}

function readAgent(value: unknown, where: string): AgentView {
  const raw = obj(value, where);
  return {
    agentId: str(raw, "agentId", where),
    name: str(raw, "name", where),
    role: str(raw, "role", where),
    version: num(raw, "version", where),
    runtime: readRuntime(raw.runtime, `${where}.runtime`),
    versionDrift: flag(raw, "versionDrift", where),
    workflows: arr(raw.workflows, `${where}.workflows`).map((entry, index) =>
      readWorkflow(entry, `${where}.workflows[${index}]`),
    ),
    runs: arr(raw.runs, `${where}.runs`).map((entry, index) =>
      readRun(entry, `${where}.runs[${index}]`),
    ),
    runsTotal: num(raw, "runsTotal", where),
    counts: readCounts(raw.counts, `${where}.counts`),
    startGate: readStartGate(raw.startGate, `${where}.startGate`),
    config: readConfig(raw.config, `${where}.config`),
  };
}

function readRoster(value: unknown): RosterView {
  const root = obj(value, "The roster response");
  const plan = obj(root.plan, "The roster response.plan");
  const global = obj(root.globalPolicy, "The roster response.globalPolicy");
  const deployment = root.deployment;

  return {
    mode: str(root, "mode", "The roster response"),
    now: str(root, "now", "The roster response"),
    planId: str(plan, "planId", "The roster response.plan"),
    planVersion: num(plan, "planVersion", "The roster response.plan"),
    approvedAt: str(plan, "approvedAt", "The roster response.plan"),
    activated: flag(root, "activated", "The roster response"),
    deployment:
      deployment === null || deployment === undefined
        ? null
        : (() => {
            const at = "The roster response.deployment";
            const row = obj(deployment, at);
            return {
              deploymentId: str(row, "deploymentId", at),
              planVersion: num(row, "planVersion", at),
              activatedAt: str(row, "activatedAt", at),
              activatedBy: str(row, "activatedBy", at),
            };
          })(),
    globalQuietHours: quietHours(global.quietHours, "The roster response.globalPolicy.quietHours"),
    globalForbidden: strList(global, "forbidden", "The roster response.globalPolicy"),
    agents: arr(root.agents, "The roster response.agents").map((entry, index) =>
      readAgent(entry, `agents[${index}]`),
    ),
    unplanned: arr(root.unplanned, "The roster response.unplanned").map((entry, index) => {
      const at = `unplanned[${index}]`;
      const row = obj(entry, at);
      return {
        agentId: str(row, "agentId", at),
        agentVersion: num(row, "agentVersion", at),
        state: member(row, "state", at, AGENT_STATES),
        detail: str(row, "detail", at),
        updatedAt: str(row, "updatedAt", at),
        enabledTriggers: num(row, "enabledTriggers", at),
      };
    }),
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

/**
 * The best sentence the response carries, in the order a reader needs them.
 *
 * `change.detail` FIRST: a refused resume is a normal answer with a real
 * explanation, and it arrives in the ordinary body rather than as `{ error }`.
 * Then the route's own `{ error }`. Only then the bare status, which tells an
 * owner nothing they can act on.
 */
function bestMessage(body: unknown, response: Response): string {
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    const root = body as Record<string, unknown>;
    const change = root.change;
    if (typeof change === "object" && change !== null && !Array.isArray(change)) {
      const detail = (change as Record<string, unknown>).detail;
      if (typeof detail === "string" && detail.trim() !== "") return detail;
    }
    const error = root.error;
    if (typeof error === "string" && error.trim() !== "") return error;
  }
  if (typeof body === "string" && body.trim() !== "") return body.slice(0, 400);
  return `The runtime answered ${response.status} ${response.statusText}.`;
}

/* ═══════════════════════════ The read ═══════════════════════════ */

export async function fetchRoster(signal?: AbortSignal): Promise<RosterView> {
  let response: Response;
  try {
    response = await fetch("/api/runtime/agents", {
      signal,
      // The runtime stores are the truth and they change under us; a cached
      // roster is one that still shows an agent as active after it was paused.
      cache: "no-store",
      headers: { accept: "application/json" },
    });
  } catch (err) {
    throw new AgentsApiError(
      "transport",
      `Could not reach /api/runtime/agents: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const body = await readBody(response);
  if (!response.ok) {
    throw new AgentsApiError("http", bestMessage(body, response), response.status);
  }
  return readRoster(body);
}

/* ═══════════════════════════ The transition ═══════════════════════════ */

export type AgentAction = "pause" | "resume";

/** What the runtime did, as far as the answer allows us to say. */
export interface TransitionOutcome {
  /** False when nothing changed — already stopped, or the resume was refused. */
  changed: boolean;
  /** The runtime's own sentence. Always shown; never paraphrased. */
  detail: string;
  /** The record as stored; null when this agent has no runtime record. */
  state: AgentRuntimeState | null;
  /** Triggers this call switched off or back on. */
  triggers: number;
  /** Resume only: enabled workflows left with no usable trigger. */
  rejected: string[];
}

export type TransitionResult =
  /** HTTP 2xx: the transition ran. `changed` says whether it moved anything. */
  | { kind: "applied"; outcome: TransitionOutcome }
  /**
   * The runtime declined. For a resume this is the ordinary refusal — the agent
   * is not in the plan, was never activated, has drifted in version, or is in a
   * state resume does not restart — and `message` is the runtime's own words.
   */
  | { kind: "refused"; status: number; message: string }
  /** Nobody can say whether it landed. Both transitions are safe to re-try. */
  | { kind: "unknown"; message: string };

/**
 * Lenient on the way out, for the same reason the approvals inbox is: by the time
 * this response exists the transition has already happened, so refusing to read
 * it would tell an owner their pause failed when the triggers are already off.
 * Anything unreadable becomes an admission rather than an assumption.
 */
function readOutcome(body: unknown): TransitionOutcome {
  const unreadable: TransitionOutcome = {
    changed: false,
    detail:
      "The runtime accepted the request but its answer was not a shape this screen can " +
      "read, so it cannot say what changed. Refresh the roster to see the agent's state.",
    state: null,
    triggers: 0,
    rejected: [],
  };

  if (typeof body !== "object" || body === null || Array.isArray(body)) return unreadable;
  const root = body as Record<string, unknown>;
  const change = root.change;
  if (typeof change !== "object" || change === null || Array.isArray(change)) return unreadable;

  const row = change as Record<string, unknown>;
  const detail = row.detail;
  const record = row.record;
  const state =
    typeof record === "object" && record !== null && !Array.isArray(record)
      ? AGENT_STATES.find(
          (candidate) => candidate === (record as Record<string, unknown>).state,
        ) ?? null
      : null;

  const triggers = Array.isArray(row.triggers) ? row.triggers.length : 0;
  const rejected = Array.isArray(row.rejected)
    ? row.rejected
        .map((entry) =>
          typeof entry === "object" && entry !== null && !Array.isArray(entry)
            ? (entry as Record<string, unknown>).workflowId
            : null,
        )
        .filter((id): id is string => typeof id === "string")
    : [];

  return {
    changed: row.changed === true,
    detail:
      typeof detail === "string" && detail.trim() !== ""
        ? detail
        : "The runtime reported no detail for this change, which is itself worth reporting.",
    state,
    triggers,
    rejected,
  };
}

/**
 * Pause or resume one agent.
 *
 * Both are safe to send again after an unknown outcome, and that is a property of
 * the runtime rather than of this function: pausing is idempotent by design, and
 * resuming re-derives every trigger from the plan instead of toggling whatever it
 * finds. That is why there is no equivalent here of the approvals inbox's "never
 * resend" warning — sending a decision twice would send a customer two emails;
 * sending a resume twice re-registers the same triggers.
 */
export async function submitTransition(
  input: { agentId: string; action: AgentAction; by?: string; reason?: string },
  signal?: AbortSignal,
): Promise<TransitionResult> {
  let response: Response;
  try {
    response = await fetch("/api/runtime/agents", {
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
        `Refresh the roster to see whether it landed; both pause and resume are safe to send ` +
        `again.`,
    };
  }

  const body = await readBody(response);
  if (!response.ok) {
    return { kind: "refused", status: response.status, message: bestMessage(body, response) };
  }
  return { kind: "applied", outcome: readOutcome(body) };
}
