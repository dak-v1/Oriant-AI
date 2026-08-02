/**
 * components/live/build/api.ts — the only place an answer from
 * `/api/runtime/build` is allowed to become something the Agent Factory renders,
 * plus the one field this screen needs from `/api/runtime/agents`.
 *
 * WHAT THIS REPLACES IS THE REASON IT IS STRICT. The screen at /app/build was a
 * simulation: `mockAgentFactoryService` animated a percentage against a fixture
 * table, and an agent with no fixture entry sat at "Queued, waiting for a build
 * slot…" for ever because there was no slot and no queue and no runtime. Every
 * field below is therefore a fact the Factory actually recorded — a job row it
 * wrote, a package checksum it stored, a reason it gave for an agent having no
 * current package — and there is deliberately nothing in these types that could
 * carry a number this screen made up.
 *
 * PARSED, NOT CAST, for the reason `components/live/pipeline/api.ts` gives at
 * length: `await res.json() as BuildStatus` tells TypeScript a shape nothing
 * checked, and the first field the route renames renders as a blank where a
 * failure should be. Here the specific cost is a job's `error` going missing —
 * the one sentence saying why an agent cannot be activated — or a `checksum`
 * quietly reading as absent, which turns a built package into an unbuilt one on
 * the screen the owner uses to decide whether to go live.
 *
 * THE READERS ARE DUPLICATED FROM THE NEIGHBOURING LANES ON PURPOSE. Pipeline,
 * agents and integrations each keep their own copy, and this is the fourth. A
 * shared module would be one place where somebody loosening a parse for one
 * route loosens it for four; hoisting them is a refactor of all four at once,
 * not a thing to do while replacing a mock.
 *
 * ONE UNION IS REFUSED, TWO STRINGS ARE DELIBERATELY NOT.
 *
 *   `status` is refused when unrecognised. Every judgement the card makes hangs
 *   off it — whether the agent is built, being built, refused or broken — and a
 *   seventh word with no judgement attached would land in whichever branch a
 *   fallback happened to pick. The safe direction here is to render nothing and
 *   say why, because the unsafe one is a card that reads as built.
 *
 *   `mode` is a plain string, and so is the plan's `source`. Both are read by
 *   equality (`=== "live"`, `=== "ingested"`) rather than membership, because a
 *   word this build has never heard of must render as NOT-live and NOT-yours,
 *   loudly — which is exactly what refusing the whole read would prevent the
 *   screen from doing. Same reasoning as `operatingMode` in the pipeline lane.
 *
 *   A log line's `level` is a plain string for the third reason: nothing is
 *   decided by it, it only tints a line, so an unknown level is a label this
 *   screen has not learned rather than a read it should reject.
 */

import type { BuildJobStatus } from "@/lib/runtime/build/types";

/* ═══════════════════════════ Vocabularies ═══════════════════════════ */

/**
 * The six words a build job can carry, in the order a job moves through them.
 *
 * Written as an object so the type checker enforces totality — a seventh status
 * added to `lib/runtime/build/types.ts` fails to compile here rather than
 * arriving on screen as an unstyled badge nobody has words for. `Object.keys`
 * preserves insertion order for string keys, so this IS the legend's order.
 */
export const BUILD_STATUSES = Object.keys({
  queued: true,
  generating: true,
  validating: true,
  completed: true,
  skipped: true,
  failed: true,
} satisfies Record<BuildJobStatus, true>) as BuildJobStatus[];

/* ═══════════════════════════ Shapes ═══════════════════════════ */

export interface LogLineView {
  at: string;
  /** "info" | "warn" | "error" in practice; kept open. See the module header. */
  level: string;
  message: string;
}

/**
 * Which response a job row was read out of, carried because the two carry
 * different amounts of the same row.
 *
 * `GET` returns whole `BuildJob` records; the `POST` reply projects them down to
 * eight fields and drops `startedAt` and `endedAt`. Without this, a completed job
 * read out of the POST has `endedAt: null` and is indistinguishable from a job
 * the store holds with no end recorded — and rendering the first as the second
 * would tell somebody their finished build never finished. One is a field the
 * response does not carry, the other is a fact about the runtime.
 */
export type JobOrigin = "store" | "build-response";

export interface JobView {
  origin: JobOrigin;
  jobId: string;
  agentId: string;
  agentVersion: number;
  status: BuildJobStatus;
  /** 1-based generation attempt. 0 on a job that skipped before generating. */
  attempt: number;
  /** The stored package's checksum, once there is one. */
  checksum: string | null;
  /** Why the job failed, in the runner's own words. Null on every other status. */
  error: string | null;
  logs: LogLineView[];
  /**
   * Null-tolerant because the same reader serves both verbs: `GET` returns whole
   * `BuildJob` rows, and the `POST` reply projects them down to eight fields and
   * drops the two instants. A missing instant renders as "—" rather than being a
   * parse failure, because the POST's own report is otherwise complete and
   * refusing it would throw away the freshest answer in existence.
   */
  startedAt: string | null;
  endedAt: string | null;
}

export interface PackageView {
  agentId: string;
  agentVersion: number;
  checksum: string;
  builtAt: string;
  workflows: number;
  allowedOperations: number;
}

/** An agent with no current package, and the runtime's reason. */
export interface MissingView {
  agentId: string;
  reason: string;
}

export interface PlanAgentView {
  id: string;
  name: string;
  version: number;
  /** Compared against "draft_only" by value, never by union membership. */
  operatingMode: string;
}

export interface FactoryView {
  /** "fixture" or "live". Read by equality; see the module header. */
  mode: string;
  planId: string;
  planVersion: number;
  /** The plan being built, in the runtime's own order. */
  agents: PlanAgentView[];
  /** Every agent has a current, validated package. What Activation gates on. */
  ready: boolean;
  missing: MissingView[];
  packages: PackageView[];
  /** Every job recorded for this plan id, across versions and attempts. */
  jobs: JobView[];
}

/** What one `POST /api/runtime/build` reported about itself. */
export interface BuildReport {
  mode: string;
  built: number;
  skipped: number;
  failed: number;
  ready: boolean;
  jobs: JobView[];
}

/**
 * Where the plan on this screen came from — the whole reason this lane reads a
 * second endpoint.
 *
 * `GET /api/runtime/build` reports the plan and says nothing about its
 * provenance, and `lib/runtime/current-plan.ts` falls back to the built-in
 * demo fixture whenever nothing has been ingested. A Factory that renders
 * those four demo agents with no caveat is telling an owner their workforce is
 * being built. `planId` and `planVersion` come along so the screen can check it
 * is talking about the same plan the Factory just reported, rather than
 * attributing one plan's provenance to another's agents.
 */
export interface PlanSourceView {
  /** "ingested" or "fixture" from the runtime. Any other word is not trusted. */
  source: string;
  /** The runtime's sentence explaining a fixture fallback. Null when real. */
  fallbackReason: string | null;
  planId: string;
  planVersion: number;
}

/* ═══════════════════════════ Outcomes ═══════════════════════════ */

/**
 * The three ways an answer can fail to be an answer, kept apart because they ask
 * three different things of the reader: a refusal is the runtime's own sentence,
 * an unreachable route is the browser never being told anything, and a malformed
 * body is a contract break between this screen and the route.
 */
export type ApiFailure =
  | { kind: "refused"; status: number; message: string; hint: string | null }
  | { kind: "unreachable"; message: string }
  | { kind: "malformed"; message: string };

export type StatusOutcome = { kind: "view"; view: FactoryView } | ApiFailure;
export type RunOutcome = { kind: "report"; report: BuildReport } | ApiFailure;
export type SourceOutcome = { kind: "source"; source: PlanSourceView } | ApiFailure;

/* ═══════════════════════════ Strict readers ═══════════════════════════ */

export class BuildShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildShapeError";
  }
}

/** Every reader names the field it rejected, so the screen can print it verbatim. */
function fail(where: string, why: string): never {
  throw new BuildShapeError(`${where} ${why}`);
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

function strOrNull(
  source: Record<string, unknown>,
  key: string,
  where: string,
): string | null {
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

/* ═══════════════════════════ The rows ═══════════════════════════ */

function logLine(value: unknown, where: string): LogLineView {
  const raw = obj(value, where);
  return {
    at: str(raw, "at", where),
    level: str(raw, "level", where),
    message: str(raw, "message", where),
  };
}

/**
 * One job row.
 *
 * `where` is passed in because the identical shape arrives from both verbs, and
 * a message reading "the build status response.jobs[2].status" when the fault
 * was in the POST reply sends whoever is debugging to the wrong handler.
 */
function jobView(value: unknown, where: string, origin: JobOrigin): JobView {
  const raw = obj(value, where);
  return {
    origin,
    jobId: str(raw, "jobId", where),
    agentId: str(raw, "agentId", where),
    agentVersion: num(raw, "agentVersion", where),
    status: member(raw, "status", where, BUILD_STATUSES),
    attempt: num(raw, "attempt", where),
    checksum: strOrNull(raw, "checksum", where),
    error: strOrNull(raw, "error", where),
    logs: arr(raw.logs, `${where}.logs`).map((item, index) =>
      logLine(item, `${where}.logs[${index}]`),
    ),
    startedAt: strOrNull(raw, "startedAt", where),
    endedAt: strOrNull(raw, "endedAt", where),
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
  return `The runtime answered ${response.status} ${response.statusText}.`;
}

function errorHint(body: unknown): string | null {
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    const hint = (body as Record<string, unknown>).hint;
    if (typeof hint === "string" && hint.trim() !== "") return hint;
  }
  return null;
}

function transportFailure(url: string, err: unknown): ApiFailure {
  return {
    kind: "unreachable",
    message: `Could not reach ${url}: ${err instanceof Error ? err.message : String(err)}`,
  };
}

function refusal(body: unknown, response: Response): ApiFailure {
  return {
    kind: "refused",
    status: response.status,
    message: errorMessage(body, response),
    hint: errorHint(body),
  };
}

function shapeFailure(err: unknown): ApiFailure {
  return { kind: "malformed", message: err instanceof Error ? err.message : String(err) };
}

const URL_BUILD = "/api/runtime/build";
const URL_AGENTS = "/api/runtime/agents";

/* ═══════════════════════════ The reads ═══════════════════════════ */

/**
 * What the Factory has built for the plan the owner currently intends.
 *
 * Free and writes nothing, so this is the one request the screen makes on its
 * own initiative — on mount, when the change stream says something moved, when
 * the tab comes back, and while a build of ours is in flight.
 */
export async function fetchBuildStatus(signal?: AbortSignal): Promise<StatusOutcome> {
  let response: Response;
  try {
    response = await fetch(URL_BUILD, {
      signal,
      // The job store changes whenever anyone builds — here, on /app/pipeline,
      // or by curl. A cached read of this endpoint is a lie with a timestamp.
      cache: "no-store",
      headers: { accept: "application/json" },
    });
  } catch (err) {
    return transportFailure(URL_BUILD, err);
  }

  const body = await readBody(response);
  if (!response.ok) return refusal(body, response);

  try {
    const where = "The build status response";
    const root = obj(body, where);
    const plan = obj(root.plan, `${where}.plan`);

    return {
      kind: "view",
      view: {
        mode: str(root, "mode", where),
        planId: str(plan, "planId", `${where}.plan`),
        planVersion: num(plan, "version", `${where}.plan`),
        agents: arr(plan.agents, `${where}.plan.agents`).map((item, index) => {
          const at = `${where}.plan.agents[${index}]`;
          const agent = obj(item, at);
          return {
            id: str(agent, "id", at),
            name: str(agent, "name", at),
            version: num(agent, "version", at),
            operatingMode: str(agent, "operatingMode", at),
          };
        }),
        ready: flag(root, "ready", where),
        missing: arr(root.missing, `${where}.missing`).map((item, index) => {
          const at = `${where}.missing[${index}]`;
          const row = obj(item, at);
          return { agentId: str(row, "agentId", at), reason: str(row, "reason", at) };
        }),
        packages: arr(root.packages, `${where}.packages`).map((item, index) => {
          const at = `${where}.packages[${index}]`;
          const row = obj(item, at);
          return {
            agentId: str(row, "agentId", at),
            agentVersion: num(row, "agentVersion", at),
            checksum: str(row, "checksum", at),
            builtAt: str(row, "builtAt", at),
            workflows: num(row, "workflows", at),
            allowedOperations: num(row, "allowedOperations", at),
          };
        }),
        jobs: arr(root.jobs, `${where}.jobs`).map((item, index) =>
          jobView(item, `${where}.jobs[${index}]`, "store"),
        ),
      },
    };
  } catch (err) {
    return shapeFailure(err);
  }
}

/**
 * Where the plan came from: the owner's ingested workforce, or the demo.
 *
 * A second endpoint for one field, and worth it. `GET /api/runtime/build`
 * reports the plan without its provenance, and the substitution it cannot see is
 * the exact one this whole effort exists to remove — a screen showing built-in
 * demo agents as though they were the customer's own.
 *
 * Its failure is never fatal to the Factory: the cards are still real job rows
 * for a real plan. What a failure here costs is the ability to say WHOSE plan,
 * and the screen says that rather than falling silent — see `PlanSourceNotice`.
 */
export async function fetchPlanSource(signal?: AbortSignal): Promise<SourceOutcome> {
  let response: Response;
  try {
    response = await fetch(URL_AGENTS, {
      signal,
      cache: "no-store",
      headers: { accept: "application/json" },
    });
  } catch (err) {
    return transportFailure(URL_AGENTS, err);
  }

  const body = await readBody(response);
  if (!response.ok) return refusal(body, response);

  try {
    const where = "The roster response";
    const root = obj(body, where);
    const plan = obj(root.plan, `${where}.plan`);
    return {
      kind: "source",
      source: {
        source: str(plan, "source", `${where}.plan`),
        fallbackReason: strOrNull(plan, "fallbackReason", `${where}.plan`),
        planId: str(plan, "planId", `${where}.plan`),
        planVersion: num(plan, "planVersion", `${where}.plan`),
      },
    };
  } catch (err) {
    return shapeFailure(err);
  }
}

/* ═══════════════════════════ The write ═══════════════════════════ */

/**
 * Build the current plan.
 *
 * THIS WRITES, and it is never automatic anywhere in this lane: no retry, no
 * build on mount, no build because a stream said something moved. Every attempt
 * is a press of a button by somebody who meant it, for the same reason the
 * pipeline's POST is — a build compiles and stores packages that Activation then
 * gates on, and a screen that rebuilds on its own initiative is a screen that
 * can change what goes live while nobody is looking.
 *
 * `force` rebuilds agents whose stored package is already current. Off by
 * default because the runner's skip is a feature — it keeps a one-agent edit a
 * one-agent build — and on only when the operator ticks the box.
 *
 * The whole plan is built inside this one request: `buildPlan` walks the agents
 * sequentially and answers when the last one is done. There is no progress to
 * subscribe to and none is invented; what there IS, and what the screen reads
 * while this is in flight, is the job store the runner writes to as it goes.
 */
export async function runBuild(
  options: { force: boolean },
  signal?: AbortSignal,
): Promise<RunOutcome> {
  let response: Response;
  try {
    response = await fetch(URL_BUILD, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ force: options.force }),
    });
  } catch (err) {
    return transportFailure(URL_BUILD, err);
  }

  const body = await readBody(response);
  if (!response.ok) return refusal(body, response);

  try {
    const where = "The build response";
    const root = obj(body, where);
    return {
      kind: "report",
      report: {
        mode: str(root, "mode", where),
        built: num(root, "built", where),
        skipped: num(root, "skipped", where),
        failed: num(root, "failed", where),
        ready: flag(root, "ready", where),
        jobs: arr(root.jobs, `${where}.jobs`).map((item, index) =>
          jobView(item, `${where}.jobs[${index}]`, "build-response"),
        ),
      },
    };
  } catch (err) {
    return shapeFailure(err);
  }
}

/* ═══════════════════════════ Derivations ═══════════════════════════ */

/**
 * The job that describes an agent NOW, out of every job ever recorded for it.
 *
 * Ordered by `startedAt` rather than by position, because the array order is the
 * store's and only one of the three implementations promises anything about it —
 * `InMemoryBuildStore.listJobs` returns Map insertion order, which is a detail of
 * that class and not a contract. Position breaks ties, since two jobs for one
 * agent can share a millisecond and the later element is then the later write.
 *
 * A row with no `startedAt` sorts oldest, which only arises on a POST-shaped row
 * whose instants the route drops. Those are never passed in the SAME call as
 * store rows — the screen reduces each response separately and lays one result
 * over the other — so a missing instant never competes with a real one, and the
 * comparison here never has to decide between them.
 */
export function latestJobByAgent(jobs: readonly JobView[]): Map<string, JobView> {
  const latest = new Map<string, JobView>();
  const position = new Map<string, number>();

  jobs.forEach((job, index) => {
    const held = latest.get(job.agentId);
    if (held === undefined) {
      latest.set(job.agentId, job);
      position.set(job.agentId, index);
      return;
    }
    const heldAt = held.startedAt ?? "";
    const jobAt = job.startedAt ?? "";
    const newer = jobAt === heldAt ? index > (position.get(job.agentId) ?? -1) : jobAt > heldAt;
    if (newer) {
      latest.set(job.agentId, job);
      position.set(job.agentId, index);
    }
  });

  return latest;
}

/**
 * The stored package for an agent AT THE VERSION THE PLAN ASKS FOR, keyed by
 * both.
 *
 * Keyed on the pair rather than on the agent id because the store keeps history:
 * `getPackage(id, version)` is what `planBuildStatus` gates on, and a card that
 * looked up by id alone would show last week's checksum next to this week's spec
 * and call the agent built. That is the same substitution `missing` exists to
 * report — "the stored package no longer matches the approved spec" — and it
 * must not be possible to contradict it here.
 */
export function packageKey(agentId: string, agentVersion: number): string {
  return `${agentId}@${agentVersion}`;
}

export function packagesByAgentVersion(
  packages: readonly PackageView[],
): Map<string, PackageView> {
  return new Map(packages.map((record) => [packageKey(record.agentId, record.agentVersion), record]));
}
