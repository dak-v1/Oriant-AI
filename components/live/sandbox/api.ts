/**
 * components/live/sandbox/api.ts — the only place an answer from
 * `/api/runtime/sandbox` is allowed to become something the Sandbox screen
 * renders, plus the one field this screen needs from `/api/runtime/agents`.
 *
 * WHAT THIS REPLACES IS THE REASON IT IS STRICT. The screen at /app/sandbox was
 * a script: `SANDBOX_SCENARIOS` and `STRESS_TEST` in lib/mock/fixtures, three
 * cases about a named BrightPath customer and a "20-case stress test" whose
 * 18/1/1 split was a constant. It never called this endpoint, which has been
 * GENERATING a scenario suite from the plan the runtime holds since M3, so the
 * tests on screen had nothing to do with the workforce anyone was about to
 * activate — and the counters said "passed" about runs that never happened.
 * Every field below is therefore something the sandbox actually did: a scenario
 * the runtime generated for THIS plan, a pass/fail it judged in code, a failure
 * line it wrote, an event the executor emitted.
 *
 * PARSED, NOT CAST, for the reason components/live/pipeline/api.ts gives at
 * length: `await res.json() as SandboxVerdict` tells TypeScript a shape nothing
 * checked, and the first field the route renames renders as a blank where a
 * failure should be. Here the specific cost is `failures` going missing — the
 * lines saying WHY a scenario failed — or `passed` reading as absent on the one
 * screen an owner uses to decide whether a workforce is safe to put in front of
 * customers.
 *
 * THE READERS ARE DUPLICATED FROM THE NEIGHBOURING LANES ON PURPOSE. Pipeline,
 * build, agents and integrations each keep their own copy, and this is the
 * fifth. A shared module would be one place where somebody loosening a parse for
 * one route loosens it for five; hoisting them is a refactor of all five at
 * once, not a thing to do while replacing a mock.
 *
 * ── WHERE THIS FILE IS DELIBERATELY LOOSE, AND WHY EACH ONE IS SAFE ──
 *
 *   `passed` and `ready` are strict booleans, and `failures` a strict array of
 *   strings. Every judgement on the screen hangs off those three, so a missing
 *   one must be a refusal rather than a falsy default. A verdict that reads as
 *   green because a field was absent is the one outcome this lane exists to
 *   prevent.
 *
 *   `finalStatus`, `packageSource` and `isolation` are plain strings. Nothing is
 *   DECIDED by them — they are printed, and compared by equality where a
 *   sentence depends on it (`=== "stored"`) — so a seventh status word is a
 *   label this build has not learned rather than a read worth throwing away. The
 *   unsafe direction here would be refusing a real, complete result over a word.
 *
 *   A RUN EVENT IS READ AS `{ kind, at }` PLUS ITS RAW FIELDS. `RunEvent` in
 *   lib/runtime/types.ts is an open union whose members carry different fields,
 *   and its own comments record `batch_empty` being added later with the note
 *   that older readers "degrade to exactly that" — rendering the unknown kind by
 *   its text. A per-kind parse would turn the next addition into a blank
 *   timeline for a run that went perfectly. So the discriminator and the instant
 *   are strict, every other field is carried verbatim and read by name only
 *   where the kind is recognised, and an unrecognised kind still renders with
 *   whatever sentence it brought.
 *
 *   `planId`, `planVersion` and `stress.cases` on a verdict are OPTIONAL. They
 *   are additions to the POST body made alongside this screen; a runtime that
 *   does not carry them is not malformed, it is older. Absent, they become
 *   `null` and the screen says out loud which question it therefore cannot
 *   answer — see `VerdictView`. Defaulting them to something plausible would be
 *   this file inventing the two facts it added them to stop inventing.
 */

/* ═══════════════════════════ Shapes ═══════════════════════════ */

/** One scenario in the library `GET /api/runtime/sandbox` publishes. */
export interface LibraryScenarioView {
  id: string;
  name: string;
  description: string;
  agentId: string;
}

export interface LibraryCategoryView {
  category: string;
  scenarios: LibraryScenarioView[];
}

/**
 * The scenario library THIS PLAN will be judged by — generated for the plan the
 * runtime holds, never a fixture shelf.
 *
 * `planId`/`planVersion` are the whole reason this read happens on mount rather
 * than the screen waiting for somebody to press Run: they say whose workforce
 * the tests below are about, and they are what a verdict is later checked
 * against so one plan's evidence cannot be attributed to another's agents.
 */
export interface LibraryView {
  planId: string;
  planVersion: number;
  total: number;
  categories: LibraryCategoryView[];
}

export interface AgentVerdictView {
  agentId: string;
  total: number;
  passed: number;
  failed: number;
  ready: boolean;
}

/**
 * One row of the stress sweep.
 *
 * A row whose `caseId` starts `coverage-` is NOT a run: it is the sweep
 * reporting a boundary it never walked, written as a failing case by
 * lib/runtime/sandbox/smoke-stress.ts because that is the one channel every
 * downstream reader already looks at. The screen separates them; see
 * `isCoverageCase`.
 */
export interface StressCaseView {
  caseId: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface StressView {
  total: number;
  passed: number;
  /** 0-100, rounded, by the runtime. Never recomputed here. */
  passRate: number;
  /**
   * The sweep's own rows, or null when this runtime's response does not carry
   * them. Null is not "there were none" — an empty array is that — and the two
   * are rendered differently, because a sweep reduced to three numbers cannot
   * say whether a red case is a guardrail that leaked or a boundary nobody
   * crossed.
   */
  cases: StressCaseView[] | null;
}

/** One scenario's result as the WHOLE-SUITE reply projects it. */
export interface SuiteResultView {
  scenarioId: string;
  name: string;
  category: string;
  agentId: string;
  passed: boolean;
  /** One line per unmet expectation, in the runner's words. Empty when passed. */
  failures: string[];
  /** A `RunStatus` word in practice; printed, never branched on. */
  finalStatus: string;
  approvalsRaised: number;
  /** Every invocation in order, retries included. */
  operationsCalled: string[];
}

/**
 * What one `POST /api/runtime/sandbox` with no scenarioId reported.
 *
 * `planId`/`planVersion` are nullable because the response carrying them is
 * newer than some runtimes this screen may talk to. When they are null the
 * screen cannot check that the verdict and the library describe the same
 * workforce, and it says so rather than assuming they agree — an ingest landing
 * between the library read and the run is exactly the case where assuming would
 * be worst.
 */
export interface VerdictView {
  planId: string | null;
  planVersion: number | null;
  ready: boolean;
  total: number;
  passed: number;
  failed: number;
  /** Why the gate is shut, one line per reason. Empty exactly when ready. */
  blockers: string[];
  byAgent: AgentVerdictView[];
  /** Null means no sweep ran, which `runSuite` treats as absent evidence. */
  stress: StressView | null;
  results: SuiteResultView[];
}

/**
 * One event the executor emitted, as read off the wire.
 *
 * `fields` is the rest of the event, unparsed. See the module header for why a
 * per-kind parse was rejected.
 */
export interface RunEventView {
  kind: string;
  at: string;
  fields: Readonly<Record<string, unknown>>;
}

/**
 * What one `POST /api/runtime/sandbox` with a `scenarioId` reported.
 *
 * This is the ONLY form that carries `events`, and that is the whole reason the
 * screen offers a per-test run at all: the suite reply projects each result down
 * to eight fields and drops the stream, so a step-by-step trace exists for a
 * single run and for nothing else. A screen that animated one for the others
 * would be inventing exactly what this lane was built to delete.
 */
export interface ScenarioRunView {
  scenarioId: string;
  name: string;
  category: string;
  agentId: string;
  passed: boolean;
  failures: string[];
  finalStatus: string;
  approvalsRaised: number;
  operationsCalled: string[];
  /** `RunState.failure` verbatim — the refusal or error an owner would see. */
  failureReason: string | null;
  /** "stored" | "compiled" | "none". Compared by equality; see the header. */
  packageSource: string;
  /** "in-process" | "remote". Same. */
  isolation: string;
  events: RunEventView[];
  /** Empty string when the run never started — the runner's own convention. */
  runId: string;
}

/**
 * Where the plan on this screen came from — the whole reason this lane reads a
 * second endpoint.
 *
 * `GET /api/runtime/sandbox` reports the plan and says nothing about its
 * provenance, and `lib/runtime/current-plan.ts` falls back to the built-in demo
 * plan whenever nothing has been ingested. A sandbox that proves those demo
 * agents with no caveat is telling an owner their workforce has been tested.
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

export type LibraryOutcome = { kind: "library"; library: LibraryView } | ApiFailure;
export type VerdictOutcome = { kind: "verdict"; verdict: VerdictView } | ApiFailure;
export type ScenarioOutcome = { kind: "run"; run: ScenarioRunView } | ApiFailure;
export type SourceOutcome = { kind: "source"; source: PlanSourceView } | ApiFailure;

/* ═══════════════════════════ Strict readers ═══════════════════════════ */

export class SandboxShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxShapeError";
  }
}

/** Every reader names the field it rejected, so the screen can print it verbatim. */
function fail(where: string, why: string): never {
  throw new SandboxShapeError(`${where} ${why}`);
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

function numOrNull(
  source: Record<string, unknown>,
  key: string,
  where: string,
): number | null {
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

/** A list of plain strings — `failures`, `blockers`, `operationsCalled`. */
function strings(value: unknown, where: string): string[] {
  return arr(value, where).map((item, index) => {
    if (typeof item !== "string") fail(`${where}[${index}]`, "is not a string.");
    return item;
  });
}

/* ═══════════════════════════ The rows ═══════════════════════════ */

/**
 * One event. `kind` and `at` are required; everything else is carried through.
 *
 * The rest is copied into a fresh object rather than handed on as the parsed
 * body, so the timeline cannot accidentally mutate what a later reader sees and
 * so `fields` never aliases the two required keys back into itself.
 */
function runEvent(value: unknown, where: string): RunEventView {
  const raw = obj(value, where);
  const fields: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(raw)) {
    if (key === "kind" || key === "at") continue;
    fields[key] = item;
  }
  return { kind: str(raw, "kind", where), at: str(raw, "at", where), fields };
}

function suiteResult(value: unknown, where: string): SuiteResultView {
  const raw = obj(value, where);
  return {
    scenarioId: str(raw, "scenarioId", where),
    name: str(raw, "name", where),
    category: str(raw, "category", where),
    agentId: str(raw, "agentId", where),
    passed: flag(raw, "passed", where),
    failures: strings(raw.failures, `${where}.failures`),
    finalStatus: str(raw, "finalStatus", where),
    approvalsRaised: num(raw, "approvalsRaised", where),
    operationsCalled: strings(raw.operationsCalled, `${where}.operationsCalled`),
  };
}

function stress(value: unknown, where: string): StressView | null {
  if (value === null || value === undefined) return null;
  const raw = obj(value, where);
  return {
    total: num(raw, "total", where),
    passed: num(raw, "passed", where),
    passRate: num(raw, "passRate", where),
    // Absent is null — "this runtime does not carry the rows" — and present but
    // empty is an empty array, which is a sweep that genuinely found no
    // boundary. The screen says something different for each.
    cases:
      raw.cases === undefined || raw.cases === null
        ? null
        : arr(raw.cases, `${where}.cases`).map((item, index) => {
            const at = `${where}.cases[${index}]`;
            const row = obj(item, at);
            return {
              caseId: str(row, "caseId", at),
              label: str(row, "label", at),
              passed: flag(row, "passed", at),
              detail: str(row, "detail", at),
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

const URL_SANDBOX = "/api/runtime/sandbox";
const URL_AGENTS = "/api/runtime/agents";

/* ═══════════════════════════ The reads ═══════════════════════════ */

/**
 * The scenario library this plan will be judged by.
 *
 * Free and runs nothing, so this is the one request the screen makes on its own
 * initiative — on mount, when the change stream says something moved, and when
 * the tab comes back. It is what lets the rail show the real generated tests
 * before anybody has pressed anything, with every row honestly marked "Not run".
 */
export async function fetchLibrary(signal?: AbortSignal): Promise<LibraryOutcome> {
  let response: Response;
  try {
    response = await fetch(URL_SANDBOX, {
      signal,
      // The library is derived from the plan the runtime holds, and an ingest
      // in another tab changes it. A cached read here is a list of tests about
      // a workforce that is no longer the one in front of the owner.
      cache: "no-store",
      headers: { accept: "application/json" },
    });
  } catch (err) {
    return transportFailure(URL_SANDBOX, err);
  }

  const body = await readBody(response);
  if (!response.ok) return refusal(body, response);

  try {
    const where = "The sandbox library response";
    const root = obj(body, where);
    return {
      kind: "library",
      library: {
        planId: str(root, "planId", where),
        planVersion: num(root, "planVersion", where),
        total: num(root, "total", where),
        categories: arr(root.categories, `${where}.categories`).map((item, index) => {
          const at = `${where}.categories[${index}]`;
          const group = obj(item, at);
          return {
            category: str(group, "category", at),
            scenarios: arr(group.scenarios, `${at}.scenarios`).map((entry, position) => {
              const scenarioAt = `${at}.scenarios[${position}]`;
              const scenario = obj(entry, scenarioAt);
              return {
                id: str(scenario, "id", scenarioAt),
                name: str(scenario, "name", scenarioAt),
                description: str(scenario, "description", scenarioAt),
                agentId: str(scenario, "agentId", scenarioAt),
              };
            }),
          };
        }),
      },
    };
  } catch (err) {
    return shapeFailure(err);
  }
}

/**
 * Where the plan came from: the owner's ingested workforce, or the demo.
 *
 * A second endpoint for one field, and worth it for the same reason the Factory
 * reads it. `GET /api/runtime/sandbox` reports the plan without its provenance,
 * and the substitution it cannot see is the exact one this whole effort exists
 * to remove — a screen proving built-in demo agents as though they were the
 * customer's own, on the page that decides whether to go live.
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

/* ═══════════════════════════ The runs ═══════════════════════════ */

/**
 * Run the whole suite and the stress sweep.
 *
 * NEVER AUTOMATIC, and the reason is different from the Factory's. A build
 * writes packages; this writes nothing at all — every tool call is served by a
 * stub, the run store is in-memory and thrown away, and the route's own header
 * says it is safe to call repeatedly. What it costs instead is TIME: the whole
 * scenario library and the whole sweep execute inside this one request. So it
 * is a press of a button by somebody who meant it, never a retry loop, and
 * never a re-run because a stream said something moved.
 *
 * There is no progress to subscribe to and none is invented. The runtime
 * answers once, with the finished verdict.
 */
export async function runSuite(signal?: AbortSignal): Promise<VerdictOutcome> {
  let response: Response;
  try {
    response = await fetch(URL_SANDBOX, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", accept: "application/json" },
      // An empty object, spelled out: `{ stress: false }` would skip the sweep,
      // and `runSuite` refuses a ready verdict without one. This screen never
      // asks for the cheaper answer, because the cheaper answer cannot open the
      // gate it is rendering.
      body: JSON.stringify({}),
    });
  } catch (err) {
    return transportFailure(URL_SANDBOX, err);
  }

  const body = await readBody(response);
  if (!response.ok) return refusal(body, response);

  try {
    const where = "The sandbox verdict";
    const root = obj(body, where);
    return {
      kind: "verdict",
      verdict: {
        planId: strOrNull(root, "planId", where),
        planVersion: numOrNull(root, "planVersion", where),
        ready: flag(root, "ready", where),
        total: num(root, "total", where),
        passed: num(root, "passed", where),
        failed: num(root, "failed", where),
        blockers: strings(root.blockers, `${where}.blockers`),
        byAgent: arr(root.byAgent, `${where}.byAgent`).map((item, index) => {
          const at = `${where}.byAgent[${index}]`;
          const row = obj(item, at);
          return {
            agentId: str(row, "agentId", at),
            total: num(row, "total", at),
            passed: num(row, "passed", at),
            failed: num(row, "failed", at),
            ready: flag(row, "ready", at),
          };
        }),
        stress: stress(root.stress, `${where}.stress`),
        results: arr(root.results, `${where}.results`).map((item, index) =>
          suiteResult(item, `${where}.results[${index}]`),
        ),
      },
    };
  } catch (err) {
    return shapeFailure(err);
  }
}

/**
 * Run ONE scenario and get its whole event stream back.
 *
 * The route answers 404 with `{ error, available }` for an id it cannot find in
 * the suite it derives from the current plan — which is what an ingest landing
 * between the library read and this press looks like. That arrives here as an
 * ordinary refusal carrying the runtime's own sentence, which already names the
 * plan, so nothing is special-cased: the screen prints what the runtime said and
 * re-reads the library.
 */
export async function runOneScenario(
  scenarioId: string,
  signal?: AbortSignal,
): Promise<ScenarioOutcome> {
  let response: Response;
  try {
    response = await fetch(URL_SANDBOX, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ scenarioId }),
    });
  } catch (err) {
    return transportFailure(URL_SANDBOX, err);
  }

  const body = await readBody(response);
  if (!response.ok) return refusal(body, response);

  try {
    const where = "The scenario run";
    const root = obj(body, where);
    const raw = obj(root.result, `${where}.result`);
    const at = `${where}.result`;
    return {
      kind: "run",
      run: {
        scenarioId: str(raw, "scenarioId", at),
        name: str(raw, "name", at),
        category: str(raw, "category", at),
        agentId: str(raw, "agentId", at),
        passed: flag(raw, "passed", at),
        failures: strings(raw.failures, `${at}.failures`),
        finalStatus: str(raw, "finalStatus", at),
        approvalsRaised: num(raw, "approvalsRaised", at),
        operationsCalled: strings(raw.operationsCalled, `${at}.operationsCalled`),
        failureReason: strOrNull(raw, "failureReason", at),
        packageSource: str(raw, "packageSource", at),
        isolation: str(raw, "isolation", at),
        events: arr(raw.events, `${at}.events`).map((item, index) =>
          runEvent(item, `${at}.events[${index}]`),
        ),
        runId: str(raw, "runId", at),
      },
    };
  } catch (err) {
    return shapeFailure(err);
  }
}

/* ═══════════════════════════ Derivations ═══════════════════════════ */

/**
 * A stress row that is an accounting of MISSING evidence rather than a run.
 *
 * lib/runtime/sandbox/smoke-stress.ts prefixes exactly these ids `coverage-`
 * and opens every one of their details with "NOT A GUARDRAIL FAILURE — MISSING
 * EVIDENCE", precisely so a caller can tell them apart. Matching the prefix is
 * therefore reading the runtime's own convention, not guessing at one; and the
 * consequence of getting it wrong is only which heading a row appears under,
 * because both kinds are red and both shut the gate.
 */
export function isCoverageCase(row: StressCaseView): boolean {
  return row.caseId.startsWith("coverage-");
}

/** Every scenario in the library, flattened in the order the route grouped them. */
export function flattenLibrary(library: LibraryView): LibraryScenarioView[] {
  return library.categories.flatMap((group) => group.scenarios);
}

/** The category a scenario was published under, for the rail's tag. */
export function categoryIndex(library: LibraryView): Map<string, string> {
  const index = new Map<string, string>();
  for (const group of library.categories) {
    for (const scenario of group.scenarios) index.set(scenario.id, group.category);
  }
  return index;
}

/* ── Reading a run event's own fields ──
   The timeline knows what a `tool_call` carries and nothing else does, so these
   stay here beside the parse rather than being re-implemented per component.
   Each one answers "did the event bring this?" and never "what should it be" —
   there is no default anywhere below. */

export function eventText(event: RunEventView, key: string): string | null {
  const value = event.fields[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function eventFlag(event: RunEventView, key: string): boolean | null {
  const value = event.fields[key];
  return typeof value === "boolean" ? value : null;
}

export function eventList(event: RunEventView, key: string): string[] | null {
  const value = event.fields[key];
  if (!Array.isArray(value)) return null;
  const items: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    items.push(entry);
  }
  return items;
}

/**
 * The one sentence an event brought, whatever kind it is.
 *
 * Ordered by how specific the field is rather than alphabetically: `summary` is
 * the executor's own narration, `reason` is a policy or refusal sentence, and
 * `message` is an error. An event carrying none of them renders with its kind
 * label alone, which is the honest outcome for a kind this build has not learned
 * — and is exactly the degradation `RunEvent`'s own comment describes.
 */
export function eventSentence(event: RunEventView): string | null {
  return (
    eventText(event, "summary") ??
    eventText(event, "reason") ??
    eventText(event, "message") ??
    eventText(event, "instruction")
  );
}
