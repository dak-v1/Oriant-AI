/**
 * components/live/pipeline/api.ts — the only place an answer from
 * `/api/runtime/pipeline` is allowed to become something this screen renders.
 *
 * A 422 IS A RESULT, NOT A FAILURE, and that is the single most important thing
 * in this module. The route's own header says so: "a blocked pass is answered
 * 422 — the request was fine, the CONTENT is not yet live-able". Its body is a
 * complete `PipelineResult` with all six stages, the gaps and the stage that
 * stopped it. A client that treated a non-2xx as an error would throw away
 * exactly the information the owner needs, and would teach whoever is watching
 * that a correctly-refused activation is a bug. So 200 and 422 land in the same
 * `pass` branch and the difference between them is `completed`.
 *
 * PARSED, NOT CAST, for the reason `components/live/integrations/api.ts` gives
 * at length: `await res.json() as PipelineResult` tells TypeScript a shape
 * nothing checked, and the first field the route renames renders as a blank
 * where a blocker should be. Here the specific cost is a gap's `resolution`
 * silently going missing — the actionable half of the only report that says what
 * the runtime had to assume about an owner's business.
 *
 * TWO UNIONS ARE REFUSED, ONE STRING IS DELIBERATELY NOT.
 *
 *   `status` and `severity` are refused when unrecognised. Every judgement this
 *   screen makes is keyed on them — which badge a stage carries, which severity
 *   group a gap is filed under — and a word with no judgement attached lands in
 *   whichever bucket a fallback happened to pick.
 *
 *   `operatingMode` is read as a plain string on purpose. The screen's central
 *   claim is "every agent is draft_only", and the safe test for that is equality
 *   with `draft_only` rather than membership of a union: a mode this build has
 *   never heard of must render as NOT draft_only and loudly, which is precisely
 *   what refusing the whole read would prevent it from doing.
 *
 *   `code` is a plain string for the opposite reason — nothing here is decided
 *   by it, so a new gap code is a label this screen has not learned rather than
 *   a read it should reject.
 */

import type { GapSeverity } from "@/lib/plan/ingest/types";
import type { StageId, StageStatus } from "@/lib/runtime/pipeline/types";

/* ═══════════════════════════ Vocabularies ═══════════════════════════ */

/**
 * The six stages, in the order `runPipeline` attempts them.
 *
 * Written as an object so the type checker enforces totality — a seventh stage
 * added to the runtime fails to compile here rather than vanishing from a
 * screen whose whole job is to show all six. `Object.keys` preserves insertion
 * order for string keys, so the literal below IS the display order.
 */
export const STAGE_ORDER = Object.keys({
  collect: true,
  ingest: true,
  validate: true,
  build: true,
  prove: true,
  activate: true,
} satisfies Record<StageId, true>) as StageId[];

const STAGE_STATUSES = Object.keys({
  ok: true,
  blocked: true,
  failed: true,
  skipped: true,
} satisfies Record<StageStatus, true>) as StageStatus[];

/** Most consequential first; the gap report renders the groups in this order. */
export const SEVERITY_ORDER = Object.keys({
  blocking: true,
  degraded: true,
  note: true,
} satisfies Record<GapSeverity, true>) as GapSeverity[];

/* ═══════════════════════════ Shapes ═══════════════════════════ */

export interface StageView {
  stage: StageId;
  status: StageStatus;
  /** One line, in the owner's language. Never a stack trace. */
  summary: string;
  detail: string[];
  /** Where the owner goes to fix a block. Absent on an `ok` stage. */
  href: string | null;
}

export interface GapView {
  code: string;
  severity: GapSeverity;
  agentId: string | null;
  message: string;
  /** What would remove the assumption. The actionable half; never hidden. */
  resolution: string;
}

export interface PlanAgentView {
  id: string;
  name: string;
  /** Compared against "draft_only" by value — see the module header. */
  operatingMode: string;
}

export interface PlanView {
  planId: string;
  version: number;
  agents: PlanAgentView[];
}

export interface LiveView {
  deploymentId: string | null;
  agents: number;
  triggersRegistered: number;
}

export interface PipelinePass {
  /** True only when every stage reported ok. */
  completed: boolean;
  /** The stage that stopped the pass, or null when it ran to the end. */
  stoppedAt: StageId | null;
  stages: StageView[];
  plan: PlanView | null;
  gaps: GapView[];
  /** What is live at the end. Null on anything that did not complete. */
  live: LiveView | null;
  /** The route's own top-level sentence about draft_only, when it sent one. */
  notice: string | null;
  /**
   * The runtime's stamp, present only on a pass read back from `GET`. A pass
   * this tab just ran carries null rather than a browser clock, which would be
   * a different clock wearing the same label.
   */
  at: string | null;
  /** 200 completed, 422 a gate refused. Null for a pass read back from `GET`. */
  httpStatus: number | null;
}

/* ═══════════════════════════ Outcomes ═══════════════════════════ */

/**
 * Four things that can come back, kept apart because they ask four different
 * things of the reader.
 *
 *   pass         the pipeline answered, completed or blocked. NOT an error.
 *   refused      the request itself was rejected (400) — the body was not a
 *                handoff. Nothing ran.
 *   unreachable  the browser never got an answer. Nothing is known.
 *   malformed    the runtime answered in a shape this screen does not
 *                understand — a contract break, not a workforce problem.
 */
export type PassOutcome =
  | { kind: "pass"; pass: PipelinePass }
  | { kind: "refused"; status: number; message: string; hint: string | null }
  | { kind: "unreachable"; message: string }
  | { kind: "malformed"; message: string };

/** `GET` adds one case: the runtime is fine and no pass has ever been run. */
export type LastOutcome = PassOutcome | { kind: "none"; hint: string | null };

/* ═══════════════════════════ Strict readers ═══════════════════════════ */

export class PipelineShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PipelineShapeError";
  }
}

/** Every reader names the field it rejected, so the screen can show it verbatim. */
function fail(where: string, why: string): never {
  throw new PipelineShapeError(`${where} ${why}`);
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

function strList(source: Record<string, unknown>, key: string, where: string): string[] {
  return arr(source[key], `${where}.${key}`).map((item, index) => {
    if (typeof item !== "string") fail(`${where}.${key}[${index}]`, "is not a string.");
    return item;
  });
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

function memberOrNull<T extends string>(
  source: Record<string, unknown>,
  key: string,
  where: string,
  allowed: readonly T[],
): T | null {
  const value = source[key];
  if (value === null || value === undefined) return null;
  return member(source, key, where, allowed);
}

/* ═══════════════════════════ The pass ═══════════════════════════ */

function stageView(value: unknown, where: string): StageView {
  const raw = obj(value, where);
  return {
    stage: member(raw, "stage", where, STAGE_ORDER),
    status: member(raw, "status", where, STAGE_STATUSES),
    summary: str(raw, "summary", where),
    detail: strList(raw, "detail", where),
    href: strOrNull(raw, "href", where),
  };
}

function gapView(value: unknown, where: string): GapView {
  const raw = obj(value, where);
  return {
    code: str(raw, "code", where),
    severity: member(raw, "severity", where, SEVERITY_ORDER),
    agentId: strOrNull(raw, "agentId", where),
    message: str(raw, "message", where),
    resolution: str(raw, "resolution", where),
  };
}

/**
 * The pass itself.
 *
 * `where` is passed in because the same shape arrives from two places — the
 * POST body and the `last` field of the GET — and a reader that says "the
 * pipeline response.stages[2].summary" when the fault was in the stored record
 * sends whoever is debugging to the wrong endpoint.
 */
function pipelinePass(
  value: unknown,
  where: string,
  httpStatus: number | null,
): PipelinePass {
  const raw = obj(value, where);
  const planRaw = raw.plan;
  const liveRaw = raw.live;

  return {
    completed: flag(raw, "completed", where),
    stoppedAt: memberOrNull(raw, "stoppedAt", where, STAGE_ORDER),
    stages: arr(raw.stages, `${where}.stages`).map((item, index) =>
      stageView(item, `${where}.stages[${index}]`),
    ),
    plan:
      planRaw === null || planRaw === undefined
        ? null
        : (() => {
            const at = `${where}.plan`;
            const plan = obj(planRaw, at);
            return {
              planId: str(plan, "planId", at),
              version: num(plan, "version", at),
              agents: arr(plan.agents, `${at}.agents`).map((item, index) => {
                const agentAt = `${at}.agents[${index}]`;
                const agent = obj(item, agentAt);
                return {
                  id: str(agent, "id", agentAt),
                  name: str(agent, "name", agentAt),
                  operatingMode: str(agent, "operatingMode", agentAt),
                };
              }),
            };
          })(),
    gaps: arr(raw.gaps, `${where}.gaps`).map((item, index) =>
      gapView(item, `${where}.gaps[${index}]`),
    ),
    live:
      liveRaw === null || liveRaw === undefined
        ? null
        : (() => {
            const at = `${where}.live`;
            const live = obj(liveRaw, at);
            return {
              deploymentId: strOrNull(live, "deploymentId", at),
              agents: num(live, "agents", at),
              triggersRegistered: num(live, "triggersRegistered", at),
            };
          })(),
    notice: strOrNull(raw, "notice", where),
    at: strOrNull(raw, "at", where),
    httpStatus,
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

/** The route pairs its 400s with a `hint` saying where a real handoff comes from. */
function errorHint(body: unknown): string | null {
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    const hint = (body as Record<string, unknown>).hint;
    if (typeof hint === "string" && hint.trim() !== "") return hint;
  }
  return null;
}

function transportFailure(url: string, err: unknown): PassOutcome {
  return {
    kind: "unreachable",
    message: `Could not reach ${url}: ${err instanceof Error ? err.message : String(err)}`,
  };
}

const URL_PIPELINE = "/api/runtime/pipeline";

/** What to run: the stored Role B fixture, or a handoff the operator supplied. */
export type PassRequest = { fixture: true } | { payload: unknown };

/**
 * Run one end-to-end pass.
 *
 * This POST WRITES: a completed pass registers triggers and puts a deployment
 * on record. It is therefore never retried automatically anywhere in this lane —
 * every attempt is a press of a button by somebody who meant it.
 */
export async function runPass(
  request: PassRequest,
  signal?: AbortSignal,
): Promise<PassOutcome> {
  let response: Response;
  try {
    response = await fetch(URL_PIPELINE, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(request),
    });
  } catch (err) {
    return transportFailure(URL_PIPELINE, err);
  }

  const body = await readBody(response);

  // 200 and 422 are the two ways the pipeline reports on itself. Everything
  // else means it never got as far as reporting. See the module header.
  if (response.ok || response.status === 422) {
    try {
      return {
        kind: "pass",
        pass: pipelinePass(body, "The pipeline response", response.status),
      };
    } catch (err) {
      return { kind: "malformed", message: err instanceof Error ? err.message : String(err) };
    }
  }

  return {
    kind: "refused",
    status: response.status,
    message: errorMessage(body, response),
    hint: errorHint(body),
  };
}

/**
 * What the last pass produced, if this server has run one.
 *
 * Read on mount so the screen is not blank for somebody who ran the pipeline by
 * curl and then opened this page — which, until this screen existed, was the
 * only way anybody had ever run it.
 */
export async function readLastPass(signal?: AbortSignal): Promise<LastOutcome> {
  let response: Response;
  try {
    response = await fetch(URL_PIPELINE, {
      signal,
      // The stored pass changes whenever anyone POSTs, here or by curl.
      cache: "no-store",
      headers: { accept: "application/json" },
    });
  } catch (err) {
    return transportFailure(URL_PIPELINE, err);
  }

  const body = await readBody(response);
  if (!response.ok) {
    return {
      kind: "refused",
      status: response.status,
      message: errorMessage(body, response),
      hint: errorHint(body),
    };
  }

  try {
    const root = obj(body, "The last-pass response");
    const last = root.last;
    if (last === null || last === undefined) {
      return { kind: "none", hint: errorHint(body) };
    }
    // No HTTP status: this pass was answered on some earlier request, and
    // inferring 200/422 from `completed` would be inventing a fact.
    return { kind: "pass", pass: pipelinePass(last, "The last-pass response.last", null) };
  } catch (err) {
    return { kind: "malformed", message: err instanceof Error ? err.message : String(err) };
  }
}
