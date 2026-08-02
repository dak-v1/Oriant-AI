/**
 * lib/runtime/verify/m7.ts — the M7 exit criteria, as executable checks.
 *
 * ROLE_C_PLAN M7 asks for "one full end-to-end test: fixture plan → activated →
 * approval decided". M7-1 is that sentence taken at full width. Every milestone
 * before it proved its own layer and stopped there: M4 drove the scheduler and
 * `activate()`, M5 drove the executor and the approval interrupt, M6 drove three
 * route handlers through three screen readers. None of them ever walked the
 * PRODUCT — nobody had yet asked whether a plan that validates can be built,
 * proved, activated, fired, paused, decided and read back without a human
 * reaching past a door the owner does not have.
 *
 * SO M7-1 GOES THROUGH THE DOORS. `validateApprovedPlan` for the plan, then
 * `POST /api/runtime/build`, `POST /api/runtime/sandbox`,
 * `POST /api/runtime/activation`, `POST /api/runtime/scheduler`, then the
 * Approvals inbox's own `fetchInbox` and `submitDecision`, and finally the four
 * Operate views read through the modules their screens call —
 * `loadScheduler`/`loadApprovals`/`loadRuns` with `statTiles` for the Workspace,
 * `fetchCalendar`, `fetchRoster`, `fetchConnections`, and the M7 attention list
 * through `fetchNotifications`. The Factory, the Sandbox and Activation have
 * never been exercised over HTTP by any check in this repo; a `next build` proves
 * they compile, and nothing until now proved they answer.
 *
 * NOTHING IS HAND-BUILT IN M7-1. The one input is `BRIGHTPATH_PLAN`, which is the
 * contract's own data. Every package was emitted by the Factory, every verdict
 * earned by the sandbox suite, every trigger written by `activate`, every run
 * started by the cron or by the dependency it fanned out to, and every approval
 * raised by `policy.ts` breaching a limit. The two constructed inputs in this
 * whole file are M7-4's historic runs and its unresolvable timezone, and both are
 * named where they appear — they are situations, not answers.
 *
 * THE FOUR M7-SPECIFIC GUARANTEES, and the thing that would break each:
 *
 *   - M7-2 REALTIME. A signal that always fires is the same as no signal, so the
 *     check asserts the revision does NOT move twice — once before anything has
 *     happened and once between two mutations — as well as that it moves for a
 *     run starting, an approval appearing and an approval being decided. The
 *     decision is observed on a connection that is HELD OPEN, because a revision
 *     that only advances when a client reconnects is a polling loop wearing a
 *     stream's clothes: `prime()` would carry a reconnect test on its own while
 *     the observer's timer was dead.
 *   - M7-3 NOTIFICATIONS. Three kinds in one runtime — an overdue approval, a run
 *     that failed, and a gate that would now refuse a go-live — paired with a
 *     quiet runtime that must report nothing at all. Either half alone is
 *     satisfiable by a broken implementation: one that always reports something,
 *     and one that always reports nothing.
 *   - M7-4 `countRunsToday`. M6 recorded that the roster carried a display copy
 *     of the worker's private counter; M7 made it one exported function. The
 *     check proves that by making the DISPLAY and the ENFORCEMENT answer the same
 *     awkward questions: three runs at 01:00 Singapore, which a UTC day boundary
 *     forgets entirely, and a run whose `startedAt` will not parse, which must
 *     count against the cap rather than be ignored. In both cases the roster's
 *     number and the scheduler's refusal have to move together, and each is
 *     paired with the control where they move together the other way.
 *   - M7-5 ACTIVATION BLAME. Three worlds, one shut gate each, and the other two
 *     gates asserted OPEN in every one of them — a checklist that blocked on
 *     everything would satisfy "the packages gate is shut" three times over.
 *
 * WHAT THIS STILL DOES NOT PROVE, said plainly, because M5 and M6 were both made
 * to say it. No React renders here. No component, no lane switch on a page, no
 * focus order, no contrast ratio and no pixel is covered, and `NotificationCenter`
 * is not mounted on any screen for this file to reach even if it could. M7-3
 * proves the derivation behind the bell, not the bell. Nothing here sends a
 * notification anywhere either — external delivery is Role D's and does not
 * exist, which is why the route reports it as `notEvaluated` and why this file
 * asserts that it does.
 *
 * EACH CHECK GETS A FRESH WORLD, as in M4, M5 and M6. Sharing one runtime would
 * be cheaper and would hide exactly the class of bug this milestone can have — a
 * pending approval, a failed run or a change signal surviving a boundary it
 * should not have. The sandbox verdict is the single thing earned once and
 * reused by the checks that are not about the sandbox, because it is evidence
 * about the plan rather than about any particular screen; M7-1 declines that
 * shortcut on purpose and earns its own through the route, since "prove them in
 * the sandbox" is a step of the walk rather than a precondition of it.
 *
 * DETERMINISM IS AN M3 EXIT CRITERION AND MUST NOT REGRESS. Clock, ids, tools and
 * reasoner are pinned exactly as in the sandbox, the session is injected rather
 * than composed from the environment, and M7-6 walks the whole product twice
 * under identical seeds and compares all five Operate reads byte for byte. The
 * one thing deliberately outside that comparison is the realtime stream: its
 * epoch is the process's own start instant and its frames carry wall time, which
 * is display metadata about a connection rather than anything the runtime
 * recorded. M7-2 therefore asserts revision DELTAS, which are deterministic, and
 * never the frames themselves.
 *
 * Run it with: npm run verify:m7
 */

import { POST as activationPOST } from "../../../app/api/runtime/activation/route";
import { GET as agentsGET, POST as agentsPOST } from "../../../app/api/runtime/agents/route";
import {
  GET as approvalsGET,
  POST as approvalsPOST,
} from "../../../app/api/runtime/approvals/route";
import { POST as buildPOST } from "../../../app/api/runtime/build/route";
import { GET as calendarGET } from "../../../app/api/runtime/calendar/route";
import { GET as eventsGET } from "../../../app/api/runtime/events/route";
import { GET as integrationsGET } from "../../../app/api/runtime/integrations/route";
import { GET as notificationsGET } from "../../../app/api/runtime/notifications/route";
import { GET as runGET, POST as runPOST } from "../../../app/api/runtime/run/route";
import { POST as sandboxPOST } from "../../../app/api/runtime/sandbox/route";
import {
  GET as schedulerGET,
  POST as schedulerPOST,
} from "../../../app/api/runtime/scheduler/route";
import { fetchRoster } from "../../../components/live/agents/api";
import type { AgentView, RosterView } from "../../../components/live/agents/api";
import { fetchInbox, submitDecision } from "../../../components/live/approvals/api";
import type { InboxView } from "../../../components/live/approvals/api";
import { fetchCalendar } from "../../../components/live/calendar/api";
import type { CalendarView } from "../../../components/live/calendar/api";
import { fetchConnections } from "../../../components/live/integrations/api";
import type { ConnectionsView } from "../../../components/live/integrations/api";
import { fetchNotifications } from "../../../components/live/notifications/api";
import type { NotificationSnapshot } from "../../../components/live/notifications/api";
import { RUNTIME_TOPICS } from "../../../components/live/useRuntimeEvents";
import {
  atRiskItems,
  createDirectory,
  statTiles,
  upcomingRuns,
} from "../../../components/live/workspace/read-model";
import type { AttentionItem, StatTile, UpcomingEntry } from "../../../components/live/workspace/read-model";
import { planFacts } from "../../../components/live/workspace/plan-facts";
import {
  loadApprovals,
  loadRuns,
  loadScheduler,
} from "../../../components/live/workspace/runtime-api";
import type {
  ApprovalsSnapshot,
  Loaded,
  RunsSnapshot,
  SchedulerSnapshot,
} from "../../../components/live/workspace/runtime-api";
import { BRIGHTPATH_PLAN } from "../../plan/fixtures/brightpath";
import type { ApprovedPlan } from "../../plan/types";
import { validateApprovedPlan } from "../../plan/validate";
import { LocalPackageGenerator, buildPlan } from "../build/runner";
import { InMemoryBuildStore } from "../build/store";
import type { BuildDeps } from "../build/types";
import type { ExecutorOptions } from "../executor";
import { FixtureReasoner } from "../llm";
import { runSuite } from "../sandbox/runner";
import { BRIGHTPATH_SCENARIOS } from "../sandbox/scenarios";
import { runStressSweep } from "../sandbox/stress";
import type { SandboxVerdict } from "../sandbox/types";
import { FixedSandboxEvidence, activate } from "../schedule/activation";
import type { ActivationDeps, ActivationResult } from "../schedule/activation";
import { enqueueTriggerEvent } from "../schedule/queue";
import { InMemorySchedulerStore } from "../schedule/store";
import { triggerIdFor } from "../schedule/triggers";
import type { SchedulerDeps } from "../schedule/types";
import { countRunsToday, runDueWork } from "../schedule/worker";
import { currentPlan, resolvePlanState } from "../current-plan";
import { resolveActivePlan } from "../active-plan";
import type { RuntimeSession } from "../session";
import { FixedClock, InMemoryRunStore, createIdFactory } from "../store";
import { StubIntegrationProvider } from "../tools";
import type { RunState, TriggerEvent } from "../types";

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

/* ═══════════════════════════ The fixture ═══════════════════════════ */

const FINANCE = "finance-followup";
const MARKETING = "marketing";
const SWEEP = "payment-reminder-drafting";
const SUMMARY = "overdue-invoice-summary";
/** Marketing's manual workflow: the one run in this file nobody schedules. */
const PLANNING = "content-planning";
const OWNER = "user_sarah_chen";

const SEND = "gmail.messages.send";

const SWEEP_TRIGGER_ID = triggerIdFor(BRIGHTPATH_PLAN.planId, FINANCE, SWEEP);

/** Read off the plan, so a fixture edit turns a check red rather than silent. */
const financeSpec = BRIGHTPATH_PLAN.agents.find((agent) => agent.id === FINANCE);

/** Required by exactly one agent, which is what makes M7-3's blocker attributable. */
const MARKETING_ONLY_INTEGRATION = "mailchimp";
/** Required by several, and M7-5's way of shutting the integrations gate alone. */
const REQUIRED_BUT_DOWN = "quickbooks";

/* ═══════════════════════════ Instants ═══════════════════════════ */

/*
 * UTC, annotated with the wall clock Sarah reads. Asia/Singapore is UTC+8, and
 * every rule under test — the cron, the quiet window, `escalateAfterMins`, the
 * daily cap — is stated in her time and none of them in UTC.
 */

/** Friday 08:30 Asia/Singapore: go-live, half an hour before the sweep. */
const ACTIVATED_AT = "2026-07-24T00:30:00.000Z";
/** Friday 09:00 Asia/Singapore. The cron minute. */
const FRIDAY_0900 = "2026-07-24T01:00:00.000Z";
/** The following Friday, where the sweep's next firing lands. */
const NEXT_FRIDAY_0900 = "2026-07-31T01:00:00.000Z";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

/** The half hour between go-live and the cron minute. */
const UNTIL_CRON_MS = 30 * MS_PER_MINUTE;
/** How long the sweep sits in the inbox before Sarah opens it. */
const REVIEW_DELAY_MS = 40 * MS_PER_MINUTE;

/**
 * Finance escalates after 240 minutes, so five hours past the cron minute is one
 * hour past the deadline — far enough to be unambiguous, close enough that the
 * runtime's own sentence ("Overdue by 1h.") is worth asserting verbatim.
 */
const UNTIL_OVERDUE_MS = 5 * MS_PER_HOUR;

/*
 * M7-4's three instants, on a Sunday for a reason: no BrightPath cron is due on
 * one. Friday belongs to the sweep, weekday mornings to Admin, and the 25th at
 * 10:00 to Marketing — so a Sunday is the only day where a firing this check
 * enqueues by hand is the only firing in the world.
 */

/** Sunday 26 July 01:00 Asia/Singapore — still SATURDAY the 25th in UTC. */
const LOCAL_SUNDAY_0100 = "2026-07-25T17:00:00.000Z";
/** Sunday 26 July 10:00 Asia/Singapore. Outside quiet hours. */
const LOCAL_SUNDAY_1000 = "2026-07-26T02:00:00.000Z";
/** Monday 27 July 10:00 Asia/Singapore: one local midnight later. */
const LOCAL_MONDAY_1000 = "2026-07-27T02:00:00.000Z";

/* ═══════════════════════════ The owner's edit ═══════════════════════════ */

/**
 * What Sarah changes before approving.
 *
 * The same three change kinds M5-2 pins — one key rewritten, one added, one
 * cleared — because `cleared` is expressed as `undefined`, which is the value
 * JSON drops and a store is most likely to lose. M7 does not re-prove the merge;
 * it carries the edit through the HTTP door M5 asserted below, so a route that
 * dropped `editedArgs` on the way to `decideAndResume` shows up here.
 */
const SARAH_EDIT: Record<string, unknown> = {
  instruction: "Chase only the two largest balances, and soften the opening line.",
  cc: "accounts@brightpath.example",
  source: undefined,
};

/* ═══════════════════════════ Small helpers ═══════════════════════════ */

/** Where a relative href is resolved against; never fetched. */
const LINK_BASE = "https://app.oriant.invalid";

function canonical(value: unknown): string {
  return JSON.stringify(value);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A JSON object, or a refusal. Used on the route responses read raw. */
async function jsonOf(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(
      `a runtime route answered ${response.status} with a body that is not JSON: ` +
        `${text.slice(0, 200)}`,
    );
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`a runtime route answered ${response.status} with ${typeof raw}, not an object`);
  }
  return raw as Record<string, unknown>;
}

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`${LINK_BASE}${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Rejects rather than waits forever.
 *
 * Only the realtime check needs it, and it needs it badly: everything else here
 * settles on the injected clock, while `RuntimeObserver` runs on a real timer. A
 * check that hung would take `npm run verify` with it and report nothing at all,
 * where a red check reports which frame never arrived.
 */
function withDeadline<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${what} did not arrive within ${ms}ms`));
    }, ms);
    timer.unref();
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/* ═══════════════════════════ The transport ═══════════════════════════ */

/**
 * The live areas' api modules fetch relative URLs, because in a browser they are
 * relative to the page. There is no server here, so `globalThis.fetch` is pointed
 * at the route handlers for the length of this run and restored after — the same
 * substitution `verify:m6` makes, extended to the four endpoints M7 adds.
 *
 * The restore is not tidiness: `npm run verify` runs every milestone in ONE Node
 * process, and a stubbed `fetch` left behind would be handed to whatever ran next.
 *
 * An unrouted path throws rather than answering 404. A reader asking for an
 * endpoint this file has not wired would otherwise report "the runtime answered
 * 404", which reads as a runtime fault instead of a gap in the harness.
 */
type Fetch = typeof globalThis.fetch;

const routerFetch: Fetch = async (input, init) => {
  const href =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input instanceof Request
          ? input.url
          : String(input);
  const url = new URL(href, LINK_BASE);
  const method = (init?.method ?? "GET").toUpperCase();

  // Rebuilt from the parts the handlers read — url, method, body — rather than
  // forwarded, because the readers also send `cache` and `signal`, which mean
  // nothing to a function call.
  const request = new Request(
    url.href,
    method === "GET" ? undefined : { method, body: init?.body ?? null },
  );

  switch (url.pathname) {
    case "/api/runtime/agents":
      return method === "GET" ? agentsGET() : agentsPOST(request);
    case "/api/runtime/approvals":
      return method === "GET" ? approvalsGET(request) : approvalsPOST(request);
    case "/api/runtime/calendar":
      return calendarGET(request);
    case "/api/runtime/integrations":
      return integrationsGET();
    case "/api/runtime/notifications":
      return notificationsGET(request);
    case "/api/runtime/run":
      return method === "GET" ? runGET(request) : runPOST(request);
    case "/api/runtime/scheduler":
      return method === "GET" ? schedulerGET(request) : schedulerPOST(request);
    default:
      throw new Error(
        `verify:m7 has no route wired for ${method} ${url.pathname}. This is a gap in the ` +
          `harness, not a runtime failure.`,
      );
  }
};

/* ═══════════════════════════ The world ═══════════════════════════ */

interface World {
  clock: FixedClock;
  build: BuildDeps & { store: InMemoryBuildStore };
  runStore: InMemoryRunStore;
  scheduler: SchedulerDeps & { store: InMemorySchedulerStore };
  integrations: StubIntegrationProvider;
  executor: ExecutorOptions;
  plan: ApprovedPlan;
  session: RuntimeSession;
}

interface WorldOptions {
  /** What the routes and `activate` see. Packages are always built from the plan
      the world was created with, so passing a drifted plan is how a gate shuts. */
  plan?: ApprovedPlan;
  /** Connections the integrations registry reports as not connected. */
  disconnected?: string[];
  /** Skip the Factory, so M7-1 can drive it through its own route instead. */
  prebuilt?: boolean;
  /** The instant the world starts at. Defaults to go-live minus thirty minutes. */
  at?: string;
}

/**
 * The session shape `getRuntimeSession()` caches on `globalThis`, assembled from
 * the deterministic pieces instead of from the environment.
 *
 * `lib/runtime/session.ts` reads two env switches and picks a reasoner and a
 * storage backend; a verifier that went through it would touch a disk, read a
 * wall clock and mint random ids — three ways to lose the M3 determinism
 * guarantee before the first assertion. Installing a session instead is the same
 * substitution the sandbox makes one layer down, and it is why every route below
 * runs without a server, a file or a network.
 */
interface SessionGlobal {
  __oriantRuntime?: RuntimeSession;
}

function install(world: World): void {
  (globalThis as unknown as SessionGlobal).__oriantRuntime = world.session;
}

/**
 * `world.plan` is the SEED here, and the current plan is read from the store.
 *
 * `session.plan` is gone; the routes resolve `session.currentPlan()` out of
 * `SchedulerStore.getCurrentPlan`, so `makeWorld` seeds the store and this
 * delegates to the real resolver rather than stubbing it. Stubbing would leave
 * every check below green even if `resolveCurrentPlan` returned the wrong plan
 * outright, which is the one failure M7's gates are meant to be sensitive to.
 *
 * Note this is called again by `withRegistry` on a world that shares the SAME
 * scheduler store, so the rebuilt session keeps reading the same stored plan —
 * which is correct: swapping the integrations registry does not change what the
 * owner intends.
 */
function sessionFor(world: Omit<World, "session">): RuntimeSession {
  return {
    mode: "fixture",
    // Nothing in M7 holds a live tool client, and a check that did would be
    // reaching a real customer from the test suite.
    toolsLive: false,
    storage: "memory",
    dataDir: null,
    seedPlan: world.plan,
    currentPlan: () => currentPlan(world.scheduler.store),
    planState: () => resolvePlanState(world.scheduler.store),
    // Read through the store as production does. Answering with `world.plan`
    // would claim a deployment exists before anything is activated, and M7
    // walks the whole go-live path — when activation happens is the point.
    deployedPlan: async () => {
      const active = await resolveActivePlan(world.scheduler.store);
      return active.source === "deployment" ? active.plan : null;
    },
    // Mirrors `executorWith` in lib/runtime/session.ts.
    executorFor: (forPlan) => ({ ...world.executor, globalPolicy: forPlan.globalPolicy }),
    runStore: world.runStore,
    buildStore: world.build.store,
    schedulerStore: world.scheduler.store,
    tools: world.integrations,
    // Mirrors the not-live branch of `toolsFor` in lib/runtime/session.ts: with
    // tools off every organization gets the one stub, because a simulated send
    // is not attributable to anybody. `toolsLive: false` above is what makes
    // ignoring the organization correct here rather than the bug this method
    // exists to prevent.
    toolsFor: () => world.integrations,
    reasoner: world.executor.reasoner,
    executor: world.executor,
    build: world.build,
    scheduler: world.scheduler,
    reset: async () => {},
  };
}

async function makeWorld(seed: string, options: WorldOptions = {}): Promise<World> {
  const clock = new FixedClock(options.at ?? ACTIVATED_AT);

  const build: BuildDeps & { store: InMemoryBuildStore } = {
    store: new InMemoryBuildStore(),
    generator: new LocalPackageGenerator(),
    clock,
    newId: createIdFactory(`${seed}-build`),
    sleep: async () => {},
  };
  if (options.prebuilt !== false) await buildPlan(BRIGHTPATH_PLAN, build);

  const runStore = new InMemoryRunStore();
  const integrations = new StubIntegrationProvider({
    disconnected: options.disconnected ?? [],
  });
  const scheduler: SchedulerDeps & { store: InMemorySchedulerStore } = {
    store: new InMemorySchedulerStore(),
    clock,
    newId: createIdFactory(`${seed}-sched`),
  };
  const plan = options.plan ?? BRIGHTPATH_PLAN;
  const executor: ExecutorOptions = {
    store: runStore,
    tools: integrations,
    reasoner: new FixtureReasoner(),
    clock,
    newId: createIdFactory(`${seed}-run`),
    sleep: async () => {},
    globalPolicy: plan.globalPolicy,
  };

  // Seeds what the routes read as the CURRENT plan, exactly as an ingest through
  // the pipeline would. See `sessionFor` for why this is a real store write and
  // not a stubbed accessor.
  await scheduler.store.saveCurrentPlan(plan);

  const parts = { clock, build, runStore, scheduler, integrations, executor, plan };
  return { ...parts, session: sessionFor(parts) };
}

/**
 * The same world, watching a different registry.
 *
 * M7-3 needs a connection that was live at go-live and is not live now, which is
 * the shape of a real revocation rather than an artificial one: an integrations
 * gate only becomes interesting AFTER a plan is live, and a world built with the
 * connection already down could never have activated in the first place.
 */
function withRegistry(world: World, integrations: StubIntegrationProvider): World {
  const executor: ExecutorOptions = { ...world.executor, tools: integrations };
  const parts = { ...world, integrations, executor };
  return { ...parts, session: sessionFor(parts) };
}

function activationDeps(world: World, verdict: SandboxVerdict | null): ActivationDeps {
  return {
    scheduler: world.scheduler,
    packages: world.build,
    integrations: world.integrations,
    sandbox: new FixedSandboxEvidence(verdict),
  };
}

async function goLive(world: World, verdict: SandboxVerdict | null): Promise<ActivationResult> {
  return activate(world.plan, activationDeps(world, verdict), { activatedBy: OWNER });
}

/** One turn of the worker, driven directly. See M7-4 for why `pollSchedules`. */
function turn(world: World, pollSchedules: boolean) {
  return runDueWork({
    plan: world.plan,
    scheduler: world.scheduler,
    executor: world.executor,
    build: world.build,
    pollSchedules,
  });
}

function manualFiring(agentId: string, workflowId: string, invocationId: string, at: string): TriggerEvent {
  const triggerId = triggerIdFor(BRIGHTPATH_PLAN.planId, agentId, workflowId);
  return {
    kind: "manual",
    agentId,
    workflowId,
    firedAt: at,
    payload: { requestedBy: "m7-verification", invocationId },
    idempotencyKey: `${triggerId}#manual@${invocationId}`,
  };
}

/* ═══════════════════════════ The change signal ═══════════════════════════ */

/**
 * The observation machinery lives inside the events route and exports nothing —
 * Next type-checks a route module against a closed set of allowed exports, so a
 * seam there would fail `next build`. Its header names the substitute: the
 * observer is cached on `globalThis.__oriantRuntimeObserver`, and disposing it
 * (which clears its interval) then dropping the handle is how a caller starts
 * from a clean counter. That is the same `globalThis` seam this file already uses
 * for the runtime session.
 */
interface ObserverGlobal {
  __oriantRuntimeObserver?: { observing: boolean; observer?: { dispose(): void } };
}

function resetObserver(): void {
  const container = globalThis as unknown as ObserverGlobal;
  container.__oriantRuntimeObserver?.observer?.dispose();
  delete container.__oriantRuntimeObserver;
}

interface Frame {
  event: string;
  data: Record<string, unknown>;
}

/**
 * One SSE block → one frame, or nothing.
 *
 * Heartbeats are `:` comments carrying no `data:` line, so they fall out here
 * rather than being mistaken for a signal — which matters, because a check that
 * counted heartbeats as change signals would report a completely idle runtime as
 * a busy one.
 */
function parseBlock(block: string): Frame | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice("event: ".length);
    else if (line.startsWith("data: ")) data.push(line.slice("data: ".length));
  }
  if (data.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data.join("\n"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  return { event, data: parsed as Record<string, unknown> };
}

/** What the check reads off a frame. Everything else is display metadata. */
interface Signal {
  epoch: string;
  revision: number;
  topics: string[];
  vocabulary: string[];
  observing: boolean | null;
}

function readSignal(data: Record<string, unknown>): Signal {
  const revision = data.revision;
  const topics = data.topics;
  const vocabulary = data.vocabulary;
  return {
    epoch: typeof data.epoch === "string" ? data.epoch : "",
    revision: typeof revision === "number" ? revision : Number.NaN,
    topics: Array.isArray(topics) ? topics.map(String) : [],
    vocabulary: Array.isArray(vocabulary) ? vocabulary.map(String) : [],
    observing: typeof data.observing === "boolean" ? data.observing : null,
  };
}

/**
 * One connection to `GET /api/runtime/events`, read incrementally.
 *
 * Held open across a mutation on purpose in M7-2's last arm: reconnecting is the
 * easy way to read a revision and it proves only that `prime()` works. A stream
 * whose timer never fires would pass a reconnect test and would push nothing at
 * all to a screen sitting still, which is the entire feature.
 */
class EventStream {
  private readonly controller = new AbortController();
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private readonly decoder = new TextDecoder();
  private buffered = "";
  private readonly pending: Frame[] = [];

  async open(): Promise<void> {
    const response = await eventsGET(
      new Request(`${LINK_BASE}/api/runtime/events`, { signal: this.controller.signal }),
    );
    if (response.status !== 200 || response.body === null) {
      throw new Error(
        `GET /api/runtime/events answered ${response.status} with ` +
          `${response.body === null ? "no body" : "a body"}; the stream must open even when the ` +
          `runtime cannot be observed, because EventSource cannot read a non-2xx body.`,
      );
    }
    this.reader = response.body.getReader();
  }

  /** The next frame of this kind, waiting for it if it has not arrived. */
  async next(event: string, ms: number): Promise<Signal> {
    const reader = this.reader;
    if (reader === null) throw new Error("the events stream was read before it was opened");

    for (;;) {
      const index = this.pending.findIndex((frame) => frame.event === event);
      const held = index === -1 ? undefined : this.pending.splice(index, 1)[0];
      if (held !== undefined) return readSignal(held.data);

      const chunk = await withDeadline(reader.read(), ms, `an SSE "${event}" frame`);
      if (chunk.done) {
        throw new Error(`the events stream closed before an "${event}" frame arrived`);
      }
      this.buffered += this.decoder.decode(chunk.value, { stream: true });
      // Only whole blocks are parsed; the tail stays buffered for the next read.
      const blocks = this.buffered.split("\n\n");
      this.buffered = blocks.pop() ?? "";
      for (const block of blocks) {
        const frame = parseBlock(block);
        if (frame !== null) this.pending.push(frame);
      }
    }
  }

  async close(): Promise<void> {
    this.controller.abort();
    try {
      await this.reader?.cancel();
    } catch {
      /* the route closed it first; both paths reach the same release */
    }
  }
}

/** Connect, read the greeting, disconnect. Each one primes a fresh observation. */
async function greeting(ms: number): Promise<Signal> {
  const stream = new EventStream();
  await stream.open();
  try {
    return await stream.next("hello", ms);
  } finally {
    await stream.close();
  }
}

/* ═══════════════════════════ Operate reads ═══════════════════════════ */

/**
 * Everything the four Operate views hold at one instant.
 *
 * Read through the modules the screens themselves call, so each field below is a
 * value a screen would actually render — one layer above the routes' JSON rather
 * than one layer below it. The Workspace has no single reader (its page composes
 * three loaders and the read model), so that composition is repeated here and
 * nowhere else in this file.
 */
interface OperateSurface {
  scheduler: Loaded<SchedulerSnapshot>;
  approvals: Loaded<ApprovalsSnapshot>;
  runs: Loaded<RunsSnapshot>;
  tiles: StatTile[];
  atRisk: AttentionItem[] | null;
  upcoming: UpcomingEntry[] | null;
  calendar: CalendarView;
  roster: RosterView;
  connections: ConnectionsView;
  notifications: NotificationSnapshot;
}

async function readOperateSurface(plan: ApprovedPlan): Promise<OperateSurface> {
  const signal = new AbortController().signal;
  const [scheduler, approvals, runs] = await Promise.all([
    loadScheduler(signal),
    loadApprovals(signal),
    loadRuns(signal),
  ]);

  const directory = createDirectory(planFacts(plan));
  const ready = scheduler.data !== null && approvals.data !== null && runs.data !== null;
  const atRisk =
    ready && scheduler.data !== null && approvals.data !== null && runs.data !== null
      ? atRiskItems({
          approvals: approvals.data,
          scheduler: scheduler.data,
          runs: runs.data,
          directory,
          live: true,
        })
      : null;
  const upcoming =
    scheduler.data !== null ? upcomingRuns({ scheduler: scheduler.data, directory }) : null;

  return {
    scheduler,
    approvals,
    runs,
    tiles: statTiles({ scheduler, approvals, runs, atRisk, upcoming }),
    atRisk,
    upcoming,
    calendar: await fetchCalendar(null),
    roster: await fetchRoster(),
    connections: await fetchConnections(),
    notifications: await fetchNotifications(),
  };
}

function tile(surface: OperateSurface, id: string): StatTile | undefined {
  return surface.tiles.find((entry) => entry.id === id);
}

function agentRow(roster: RosterView, agentId: string): AgentView | undefined {
  return roster.agents.find((agent) => agent.agentId === agentId);
}

/* ═══════════════════ The whole product, once, end to end ═══════════════════ */

interface Walk {
  ok: true;
  world: World;
  /** Every clause, kept separately so a failure names which one broke. */
  planIsValid: boolean;
  built: Record<string, unknown>;
  proved: Record<string, unknown>;
  activated: Record<string, unknown>;
  firstPass: Record<string, unknown>;
  inboxAtPause: InboxView;
  decided: Record<string, unknown>;
  secondPass: Record<string, unknown>;
  sweepRun: RunState;
  summaryRun: RunState;
  sends: number;
  surface: OperateSurface;
  /** Every Operate read, for the determinism comparison in M7-6. */
  fingerprint: string;
}

interface WalkFailed {
  ok: false;
  why: string;
}

type WalkAttempt = Walk | WalkFailed;

/** The scheduler summary of one HTTP pass, read defensively. */
function summaryOf(body: Record<string, unknown>): Record<string, unknown> {
  const summary = body.summary;
  return typeof summary === "object" && summary !== null && !Array.isArray(summary)
    ? (summary as Record<string, unknown>)
    : {};
}

function countOf(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  return typeof value === "number" ? value : Number.NaN;
}

function flagOf(source: Record<string, unknown>, key: string): boolean {
  return source[key] === true;
}

/**
 * ROLE_C_PLAN M7's exit sentence, walked through the product's own doors.
 *
 * Every step is a call an owner's browser makes. Nothing reaches into a store to
 * arrange a situation, and the only reads that bypass a route are the two at the
 * end that fetch the runs by id purely to report them.
 */
async function walkTheProduct(seed: string): Promise<WalkAttempt> {
  // `prebuilt: false` — the Factory is a step of this walk, not a precondition.
  const world = await makeWorld(seed, { prebuilt: false });
  install(world);

  /* ── 1. The plan validates ── */
  const problems = validateApprovedPlan(BRIGHTPATH_PLAN);
  if (problems.length > 0) {
    return {
      ok: false,
      why:
        `the fixture plan does not satisfy its own contract: ` +
        `${problems.map((problem) => problem.message).join("; ")}`,
    };
  }

  /* ── 2. The Factory builds every agent ── */
  const built = await jsonOf(await buildPOST(jsonRequest("/api/runtime/build", {})));
  if (!flagOf(built, "ready")) {
    return { ok: false, why: `POST /api/runtime/build did not leave the plan ready: ${canonical(built)}` };
  }

  /* ── 3. The Sandbox proves them ── */
  const proved = await jsonOf(await sandboxPOST(jsonRequest("/api/runtime/sandbox", {})));
  if (!flagOf(proved, "ready")) {
    return { ok: false, why: `the sandbox suite did not return a ready verdict: ${canonical(proved)}` };
  }

  /* ── 4. Activation, behind its three real gates ── */
  const activationResponse = await activationPOST(
    jsonRequest("/api/runtime/activation", { activatedBy: OWNER }),
  );
  const activated = await jsonOf(activationResponse);
  if (activationResponse.status !== 200 || !flagOf(activated, "activated")) {
    return {
      ok: false,
      why:
        `go-live was refused with ${activationResponse.status}: ` +
        `${canonical(activated.blockers ?? activated.error ?? activated)}`,
    };
  }

  /* ── 5. The cron minute arrives and the scheduler turns, unattended ──
     Advanced rather than constructed at 09:00: `nextFireAt` was computed before
     the instant it fires at, exactly as at a real go-live. */
  world.clock.advance(UNTIL_CRON_MS);
  const firstPass = summaryOf(await jsonOf(await schedulerPOST(jsonRequest("/api/runtime/scheduler", {}))));

  const runs = await world.runStore.listRuns({ agentId: FINANCE });
  const sweepStarted = runs.find((run) => run.workflowId === SWEEP) ?? null;
  if (sweepStarted === null || sweepStarted.pendingApprovalId === null) {
    return {
      ok: false,
      why:
        `the Friday cron produced no paused run for ${FINANCE}/${SWEEP} — the pass claimed ` +
        `${countOf(firstPass, "claimed")} job(s) and the run ended ` +
        `"${sweepStarted?.status ?? "nothing"}"`,
    };
  }

  /* ── 6. The approval appears in the inbox the owner reads ── */
  const inboxAtPause = await fetchInbox();

  /* ── 7. The owner edits and approves ── */
  world.clock.advance(REVIEW_DELAY_MS);
  const decision = await submitDecision({
    approvalId: sweepStarted.pendingApprovalId,
    decision: "approved",
    editedArgs: SARAH_EDIT,
  });
  if (decision.kind !== "recorded") {
    return {
      ok: false,
      why: `the inbox could not record the decision: ${decision.kind} — ${decision.message}`,
    };
  }

  /* ── 8. The dependent workflow becomes due and runs ── */
  const secondPass = summaryOf(await jsonOf(await schedulerPOST(jsonRequest("/api/runtime/scheduler", {}))));

  const settled = await world.runStore.getRun(sweepStarted.runId);
  const after = await world.runStore.listRuns({ agentId: FINANCE });
  const summaryRun = after.find((run) => run.workflowId === SUMMARY) ?? null;
  if (settled === null || summaryRun === null) {
    return {
      ok: false,
      why:
        `the decision did not leave the two runs M7 reads: sweep=${settled?.status ?? "gone"}, ` +
        `summary=${summaryRun === null ? "never started" : "present"}`,
    };
  }

  const surface = await readOperateSurface(world.plan);

  return {
    ok: true,
    world,
    planIsValid: true,
    built,
    proved,
    activated,
    firstPass,
    inboxAtPause,
    decided: {
      runStatus: decision.outcome.runStatus,
      versions: decision.outcome.versions.length,
      edited: decision.outcome.edited,
      dependentsQueued: decision.outcome.dependentsQueued,
      dependencyError: decision.outcome.dependencyError,
    },
    secondPass,
    sweepRun: settled,
    summaryRun,
    sends: world.integrations.client.callsTo(SEND).length,
    surface,
    fingerprint: canonical(surface),
  };
}

function cannotProceed(attempt: WalkFailed, about: string): string {
  return (
    `The product never reached the state this check reads, so there is no ${about} to ` +
    `test: ${attempt.why}. M7-1 is the check that owns this failure.`
  );
}

/* ═══════════════ Getting a live workforce without the suite ═══════════════ */

/**
 * Build, prove and activate — with the verdict handed over rather than re-earned.
 *
 * M7-1 declines this shortcut because proving the workforce is a step of the walk
 * it is asserting. Every other check needs a live plan as a PRECONDITION, and
 * re-running the scenario library and the stress sweep once per check would cost
 * seconds to prove something M3 already owns.
 */
async function liveWorld(seed: string, verdict: SandboxVerdict, options: WorldOptions = {}): Promise<World | string> {
  const world = await makeWorld(seed, options);
  const activation = await goLive(world, verdict);
  if (!activation.activated) {
    return `activation was blocked at go-live: ${activation.blockers.map((b) => b.message).join("; ")}`;
  }
  install(world);
  return world;
}

/* ═══════════════════════════ Historic runs ═══════════════════════════ */

/**
 * A finished run the store is told about rather than one the runtime produced.
 *
 * The same constructed input M4-6 uses, and for the same unavoidable reason:
 * Singapore is UTC+8, so the local and UTC calendars disagree only between 16:00
 * and 24:00 UTC — which locally is 00:00 to 08:00, squarely inside the quiet
 * window where no genuine run can start. There is no way to ask "which day
 * boundary is this counted on" without putting a run there. M7-4 additionally
 * needs a run whose `startedAt` will not parse, which no runtime would ever
 * write; that is the situation being tested, not the answer.
 */
function historicRun(runId: string, startedAt: string): RunState {
  return {
    runId,
    agentId: FINANCE,
    agentVersion: financeSpec?.version ?? 0,
    workflowId: SWEEP,
    status: "completed",
    trigger: manualFiring(FINANCE, SWEEP, runId, startedAt),
    cursor: 0,
    context: {},
    events: [],
    pendingApprovalId: null,
    startedAt,
    endedAt: startedAt,
    failure: null,
  };
}

/**
 * What the roster says and what the scheduler does, asked of one world.
 *
 * The pairing IS the check: the roster's `runsToday` is a promise about what the
 * scheduler will do in an hour's time, so the only way to prove the two are one
 * function is to read the promise and then make the scheduler keep or break it.
 */
interface CapReading {
  displayed: number | null;
  unavailable: string | null;
  gate: string | null;
  gateReason: string;
  /** What the worker did with a firing at the same instant. */
  jobStatus: string;
  jobDetail: string;
  startedARun: boolean;
}

async function readCap(world: World, invocationId: string, at: string): Promise<CapReading> {
  install(world);
  const roster = await fetchRoster();
  const row = agentRow(roster, FINANCE);

  await enqueueTriggerEvent(manualFiring(FINANCE, SWEEP, invocationId, at), world.scheduler);
  // `pollSchedules: false` — this pass is about ONE hand-enqueued firing, and a
  // schedule poll would let whatever cron happens to be due join it and make the
  // count under test somebody else's.
  const summary = await turn(world, false);
  const job = summary.jobs[0];

  return {
    displayed: row?.counts.runsToday ?? null,
    unavailable: row?.counts.runsTodayUnavailable ?? null,
    gate: row?.startGate?.action ?? null,
    gateReason: row?.startGate?.reason ?? "",
    jobStatus: summary.jobs.length === 1 ? (job?.status ?? "none") : `${summary.jobs.length} jobs`,
    jobDetail: job?.detail ?? "",
    startedARun: job?.runId !== null && job?.runId !== undefined,
  };
}

/* ═══════════════════════════ The checks ═══════════════════════════ */

/**
 * The last result, and the only one about the harness rather than the product:
 * it passes when all six checks reached their own verdict, and fails naming the
 * error when a read threw and ended the run early.
 */
const COMPLETED = "M7-7 every read the checks above make was answered";

export async function runM7Verification(): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, pass_: boolean, detail: string) =>
    checks.push({ name, pass: pass_, detail });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = routerFetch;
  const originalInterval = process.env.ORIANT_EVENTS_INTERVAL_MS;

  try {
    /* 0. The verdict the checks that are not about the sandbox activate behind.
          Earned once, from packages the Factory built, exactly as M4, M5 and M6
          earn it — activation re-derives its own conclusions from this data, so a
          hand-written verdict would test the gate against evidence no sandbox
          ever produced. */
    const evidenceBuild: BuildDeps & { store: InMemoryBuildStore } = {
      store: new InMemoryBuildStore(),
      generator: new LocalPackageGenerator(),
      clock: new FixedClock(ACTIVATED_AT),
      newId: createIdFactory("m7-evidence"),
      sleep: async () => {},
    };
    await buildPlan(BRIGHTPATH_PLAN, evidenceBuild);
    const stress = await runStressSweep(BRIGHTPATH_PLAN, { packages: evidenceBuild });
    const verdict = await runSuite(BRIGHTPATH_SCENARIOS, BRIGHTPATH_PLAN, {
      packages: evidenceBuild,
      stress,
    });

    /* ═══ 1. THE WHOLE PRODUCT, END TO END ═══
       Every clause of the plan's sentence asserted separately, so a failure names
       which clause broke rather than reporting that "the walk" is red. The last
       group is the part no earlier milestone could make: all four Operate views,
       read at the same instant, agreeing about a runtime they each derive
       independently. */
    const walk = await walkTheProduct("m7");
    {
      const name =
        "M7-1 a validated plan is built, proved, activated, fires unattended, pauses, is decided, and every Operate view reads the result";
      if (!walk.ok) {
        add(name, false, `The walk stopped before it finished: ${walk.why}`);
      } else {
        const surface = walk.surface;

        /* ── Clauses 1–3: plan → packages → verdict ── */
        const preparedTheWorkforce =
          walk.planIsValid &&
          countOf(walk.built, "built") === BRIGHTPATH_PLAN.agents.length &&
          countOf(walk.built, "failed") === 0 &&
          countOf(walk.proved, "passed") === countOf(walk.proved, "total") &&
          countOf(walk.proved, "failed") === 0 &&
          // The stress sweep RAN. A skipped sweep reporting ready is the audited
          // defect the sandbox gate exists to refuse.
          walk.proved.stress !== null;

        /* ── Clause 4: all three gates, open, on their own evidence ── */
        const checklist = walk.activated.checklist;
        const gates =
          typeof checklist === "object" && checklist !== null && !Array.isArray(checklist)
            ? ((checklist as { gates?: unknown }).gates ?? [])
            : [];
        const gateList = Array.isArray(gates)
          ? (gates as { id?: unknown; satisfied?: unknown }[])
          : [];
        const wentLive =
          walk.activated.outcome === "activated" &&
          gateList.length === 3 &&
          gateList.every((gate) => gate.satisfied === true) &&
          canonical(gateList.map((gate) => gate.id)) ===
            canonical(["packages", "sandbox", "integrations"]);

        /* ── Clause 5: the cron fired with nobody in the room ── */
        const schedule = walk.firstPass.schedule;
        const enqueued =
          typeof schedule === "object" && schedule !== null && !Array.isArray(schedule)
            ? ((schedule as { enqueued?: unknown }).enqueued ?? [])
            : [];
        const firedUnattended =
          Array.isArray(enqueued) &&
          enqueued.length === 1 &&
          countOf(walk.firstPass, "claimed") === 1 &&
          countOf(walk.firstPass, "succeeded") === 1 &&
          walk.sweepRun.trigger.kind === "schedule" &&
          walk.sweepRun.startedAt === FRIDAY_0900;

        /* ── Clause 6: it paused, and the inbox held the decision ── */
        const waiting = walk.inboxAtPause.pending[0];
        const pausedForSarah =
          walk.inboxAtPause.pending.length === 1 &&
          walk.inboxAtPause.overdueCount === 0 &&
          waiting?.approvalOwner === OWNER &&
          waiting.proposed.operation === SEND &&
          waiting.breachedLimits.length > 0 &&
          waiting.deadline.state === "due" &&
          waiting.deadline.minutesRemaining === (financeSpec?.policy.escalateAfterMins ?? -1);

        /* ── Clauses 7–8: edited, approved, resumed, and the chain moved on ── */
        const decidedAndResumed =
          walk.decided.runStatus === "completed" &&
          walk.decided.edited === true &&
          walk.decided.versions === 2 &&
          walk.decided.dependentsQueued === 1 &&
          walk.decided.dependencyError === null &&
          walk.sweepRun.status === "completed" &&
          // Exactly one reminder reached the integration, edits included.
          walk.sends === 1 &&
          // And the dependent workflow became a run of its own, which is where it
          // meets the write-off the owner has yet to decide.
          countOf(walk.secondPass, "claimed") === 1 &&
          walk.summaryRun.status === "awaiting_approval";

        /* ── Clause 9: what a Workspace, a Calendar, a roster and an
              Integrations view each read at the end ── */
        const workflows = tile(surface, "workflows");
        const approvalsTile = tile(surface, "approvals");
        const riskTile = tile(surface, "risk");
        const scheduledTile = tile(surface, "scheduled");
        const workspaceReadsIt =
          surface.tiles.every((entry) => entry.state === "ready") &&
          workflows?.value === 8 &&
          approvalsTile?.value === 1 &&
          // Nothing is at risk: the decided approval left the inbox, the new one
          // is inside its deadline, and no run failed.
          riskTile?.value === 0 &&
          (scheduledTile?.value ?? 0) > 0 &&
          surface.atRisk?.length === 0;

        const runEvents = surface.calendar.events.filter((event) => event.kind === "run");
        const approvalEvents = surface.calendar.events.filter((event) => event.kind === "approval");
        const nextFriday = surface.calendar.events.find(
          (event) => event.triggerId === SWEEP_TRIGGER_ID && event.state === "scheduled",
        );
        const calendarReadsIt =
          runEvents.length === 2 &&
          runEvents.some(
            (event) => event.runId === walk.sweepRun.runId && event.state === "completed",
          ) &&
          runEvents.some(
            (event) => event.runId === walk.summaryRun.runId && event.state === "awaiting_approval",
          ) &&
          approvalEvents.length === 1 &&
          approvalEvents[0]?.runId === walk.summaryRun.runId &&
          // The sweep is still a Friday-morning commitment for next week.
          nextFriday?.at === NEXT_FRIDAY_0900 &&
          nextFriday.timeLabel === "09:00";

        const finance = agentRow(surface.roster, FINANCE);
        const rosterReadsIt =
          surface.roster.activated &&
          surface.roster.agents.length === BRIGHTPATH_PLAN.agents.length &&
          finance?.runtime?.state === "active" &&
          finance.runsTotal === 2 &&
          // Both runs started on the agent's own Friday, against a cap of three.
          finance.counts.runsToday === 2 &&
          finance.counts.maxRunsPerDay === 3 &&
          finance.counts.dayTimezone === "Asia/Singapore" &&
          finance.counts.pendingApprovals === 1 &&
          finance.counts.failedRuns === 0 &&
          finance.startGate?.action === "allow";

        const integrationsReadIt =
          surface.connections.gate?.satisfied === true &&
          surface.connections.integrations.length === 8 &&
          surface.connections.integrations.every(
            (row) => row.status === "connected" && row.blockers.length === 0,
          );

        // The M7 surface itself: one decision waiting, nothing wrong, and the two
        // things it declined to answer said out loud rather than omitted.
        const attention = surface.notifications;
        const notificationsReadIt =
          attention.complete &&
          attention.counts.actionRequired === 0 &&
          attention.counts.attention === 0 &&
          attention.counts.waiting === 1 &&
          attention.items.length === 1 &&
          attention.items[0]?.kind === "approval_waiting" &&
          attention.notEvaluated.some((entry) => entry.id === "sandbox") &&
          attention.notEvaluated.some((entry) => entry.id === "external-delivery");

        const pass =
          preparedTheWorkforce &&
          wentLive &&
          firedUnattended &&
          pausedForSarah &&
          decidedAndResumed &&
          workspaceReadsIt &&
          calendarReadsIt &&
          rosterReadsIt &&
          integrationsReadIt &&
          notificationsReadIt;

        add(
          name,
          pass,
          pass
            ? `validateApprovedPlan returned no errors; POST /api/runtime/build emitted ` +
                `${countOf(walk.built, "built")} packages; POST /api/runtime/sandbox passed ` +
                `${countOf(walk.proved, "passed")} of ${countOf(walk.proved, "total")} scenarios ` +
                `with the stress sweep run; POST /api/runtime/activation opened all three gates ` +
                `and went live; one POST /api/runtime/scheduler at ${FRIDAY_0900} started run ` +
                `${walk.sweepRun.runId} with nobody in the room; it paused on ` +
                `${waiting?.breachedLimits.join(", ")} and appeared in ${OWNER}'s inbox ` +
                `(${waiting?.deadline.detail}); ${REVIEW_DELAY_MS / MS_PER_MINUTE}m later she ` +
                `edited and approved through the inbox's own POST, the run completed with exactly ` +
                `one ${SEND}, and the chained ${SUMMARY} became a run that is now waiting on her. ` +
                `The Workspace reads ${workflows?.value} active workflows and 1 decision with ` +
                `nothing at risk, the calendar holds both runs and next Friday at ` +
                `${nextFriday?.timeLabel}, the roster shows ${FINANCE} active with ` +
                `${finance?.counts.runsToday} of ${finance?.counts.maxRunsPerDay} runs today, and ` +
                `all ${surface.connections.integrations.length} integrations are connected`
            : `preparedTheWorkforce=${preparedTheWorkforce} wentLive=${wentLive} ` +
                `(${canonical(gateList.map((gate) => [gate.id, gate.satisfied]))}) ` +
                `firedUnattended=${firedUnattended} pausedForSarah=${pausedForSarah} ` +
                `(inbox=${walk.inboxAtPause.pending.length}) decidedAndResumed=${decidedAndResumed} ` +
                `(${canonical(walk.decided)}, sweep=${walk.sweepRun.status}, ` +
                `summary=${walk.summaryRun.status}, sends=${walk.sends}) ` +
                `workspaceReadsIt=${workspaceReadsIt} (${canonical(surface.tiles.map((t) => [t.id, t.state, t.value]))}) ` +
                `calendarReadsIt=${calendarReadsIt} rosterReadsIt=${rosterReadsIt} ` +
                `(runsToday=${finance?.counts.runsToday ?? "—"}) ` +
                `integrationsReadIt=${integrationsReadIt} ` +
                `notificationsReadIt=${notificationsReadIt} (${canonical(attention.counts)})`,
        );
      }
    }

    /* ═══ 2. THE CHANGE SIGNAL MOVES WHEN THE RUNTIME MOVES, AND ONLY THEN ═══
       A signal that always fires is the same as no signal, so the two negatives
       are asserted as hard as the three positives.

       The interval is pinned to the route's own floor for the length of this
       check. `ORIANT_EVENTS_INTERVAL_MS` is read once, when the observer is
       first constructed, and the default is three seconds — which would make the
       held-connection arm below wait that long for a frame it can get in half a
       second. Restored afterwards, and the observer disposed either way, because
       `npm run verify` runs every milestone in one process. */
    {
      const name =
        "M7-2 the realtime revision moves for a run, for an approval raised and for one decided, and does not move when nothing happened";
      const live = await liveWorld("m7-events", verdict);
      if (typeof live === "string") {
        add(name, false, `there is no live runtime to observe: ${live}`);
      } else {
        resetObserver();
        process.env.ORIANT_EVENTS_INTERVAL_MS = "500";
        const held = new EventStream();
        try {
          /* ── The baseline. The first pass establishes the snapshot and must
                announce nothing: a connection is not a change. ── */
          const first = await greeting(5_000);

          /* ── Nothing happened ── */
          const quiet = await greeting(5_000);

          /* ── A run starts and finishes, raising no approval. Marketing is
                draft_only and its content-planning workflow is manual, so this
                is the one run in the file an owner starts by hand — and the one
                that moves `runs` without moving `approvals`. ── */
          await runPOST(jsonRequest("/api/runtime/run", { agentId: MARKETING, workflowId: PLANNING }));
          const afterRun = await greeting(5_000);

          /* ── An approval appears, raised by the cron ── */
          live.clock.advance(UNTIL_CRON_MS);
          await schedulerPOST(jsonRequest("/api/runtime/scheduler", {}));
          const afterApproval = await greeting(5_000);

          /* ── Still nothing ── */
          const stillQuiet = await greeting(5_000);

          /* ── And a decision, observed on a connection that stays open ──
                This arm is the one that cannot be satisfied by `prime()`: the
                frame has to be pushed to a listener that asked for nothing.

                A stream that never pushes is a FAILURE OF THIS CHECK, not of the
                harness, so the wait is caught here rather than allowed to escape
                into the run-stopped catch below. Letting it propagate would take
                the four checks after this one with it, and the observer's timer
                being dead is precisely the defect worth reporting on its own. ── */
          await held.open();
          const hello = await held.next("hello", 5_000);
          const pending = await live.runStore.listPendingApprovals();
          const toDecide = pending[0];
          let pushed: Signal | null = null;
          let pushFailure = "no approval was raised for the owner to decide";
          if (toDecide !== undefined) {
            const waitForSignal = held.next("signal", 10_000);
            live.clock.advance(REVIEW_DELAY_MS);
            await submitDecision({ approvalId: toDecide.approvalId, decision: "approved" });
            try {
              pushed = await waitForSignal;
            } catch (error) {
              pushFailure = messageOf(error);
            }
          }

          const baselineIsSilent = first.revision === 0 && first.observing === true;
          const quietIsQuiet =
            quiet.revision === first.revision &&
            quiet.epoch === first.epoch &&
            stillQuiet.revision === afterApproval.revision;
          const runMoved = afterRun.revision === first.revision + 1;
          const approvalMoved = afterApproval.revision === afterRun.revision + 1;
          const decisionPushed =
            pushed !== null &&
            pushed.revision === afterApproval.revision + 1 &&
            pushed.topics.includes("approvals") &&
            pushed.topics.includes("runs") &&
            // The push landed on the connection that was already open, so its
            // epoch is the one the greeting handed over.
            pushed.epoch === hello.epoch;
          // The client's topic list and the route's are the same five words. A
          // sixth on either side means a screen subscribing to something that
          // never arrives, or a change nothing is listening for.
          const vocabularyAgrees =
            canonical([...hello.vocabulary].sort()) === canonical([...RUNTIME_TOPICS].sort());

          const pass =
            baselineIsSilent &&
            quietIsQuiet &&
            runMoved &&
            approvalMoved &&
            decisionPushed &&
            vocabularyAgrees;
          add(
            name,
            pass,
            pass
              ? `the first connection reported revision 0 and a second, with nothing changed in ` +
                  `between, reported the same number on the same epoch; a manual ${MARKETING} run ` +
                  `took it to ${afterRun.revision}, the Friday cron raising an approval took it to ` +
                  `${afterApproval.revision}, and another idle connection left it there. The ` +
                  `decision was then pushed to a connection that was already open — revision ` +
                  `${pushed?.revision}, topics ${canonical(pushed?.topics ?? [])} — without anyone ` +
                  `reconnecting. The route and the hook agree on all ${RUNTIME_TOPICS.length} topics`
              : `baselineIsSilent=${baselineIsSilent} (rev=${first.revision}, ` +
                  `observing=${first.observing}) quietIsQuiet=${quietIsQuiet} ` +
                  `(${quiet.revision} vs ${first.revision}; ${stillQuiet.revision} vs ` +
                  `${afterApproval.revision}) runMoved=${runMoved} (${afterRun.revision}) ` +
                  `approvalMoved=${approvalMoved} (${afterApproval.revision}) ` +
                  `decisionPushed=${decisionPushed} (${pushed === null ? pushFailure : `rev=${pushed.revision}, topics=${canonical(pushed.topics)}`}) ` +
                  `vocabularyAgrees=${vocabularyAgrees} (${canonical(hello.vocabulary)})`,
          );
        } finally {
          await held.close();
          resetObserver();
          if (originalInterval === undefined) delete process.env.ORIANT_EVENTS_INTERVAL_MS;
          else process.env.ORIANT_EVENTS_INTERVAL_MS = originalInterval;
        }
      }
    }

    /* ═══ 3. THE ATTENTION LIST IS DERIVED, AND IT IS QUIET WHEN THE RUNTIME IS ═══
       Three of the seven kinds in one runtime, each from a different store, and
       each with a destination. Then the same derivation over a runtime where
       nothing has happened, which must report nothing at all — a list that always
       has something in it trains an owner to stop reading it, and a list that
       never does is a bell with the clapper removed.

       The disconnection happens AFTER go-live on purpose: an integrations gate
       that blocks a plan which is already live is the real shape of a revoked
       connection, and a world built with the connection already down could not
       have activated to begin with. */
    {
      const name =
        "M7-3 the attention list reports an overdue approval, a failed run and a blocked gate, and reports nothing when the runtime is quiet";
      const noisyWorld = await liveWorld("m7-noisy", verdict);
      const quietWorld = await liveWorld("m7-quiet", verdict);

      if (typeof noisyWorld === "string" || typeof quietWorld === "string") {
        add(
          name,
          false,
          `there is no live runtime to derive from: ` +
            `${typeof noisyWorld === "string" ? noisyWorld : quietWorld}`,
        );
      } else {
        /* ── Quiet: activated, and nothing has happened yet ── */
        install(quietWorld);
        const calm = await fetchNotifications();

        /* ── Noisy: an approval left past its deadline, a connection revoked,
              and a run that hits the revoked connection ── */
        install(noisyWorld);
        noisyWorld.clock.advance(UNTIL_CRON_MS);
        await schedulerPOST(jsonRequest("/api/runtime/scheduler", {}));
        noisyWorld.clock.advance(UNTIL_OVERDUE_MS);

        const revoked = withRegistry(
          noisyWorld,
          new StubIntegrationProvider({ disconnected: [MARKETING_ONLY_INTEGRATION] }),
        );
        install(revoked);
        await runPOST(jsonRequest("/api/runtime/run", { agentId: MARKETING, workflowId: PLANNING }));
        const loud = await fetchNotifications();

        const overdue = loud.items.filter((item) => item.kind === "approval_overdue");
        const failed = loud.items.filter((item) => item.kind === "run_failed");
        const blocked = loud.items.filter((item) => item.kind === "activation_blocked");

        const reportsTheOverdueApproval =
          overdue.length === 1 &&
          overdue[0]?.severity === "action_required" &&
          overdue[0].agentId === FINANCE &&
          overdue[0].subject === SEND &&
          // The runtime's own sentence, passed through rather than recomputed.
          overdue[0].detail.includes("Overdue by 1h.") &&
          overdue[0].action?.href.includes("live=1") === true &&
          overdue[0].action.href.includes(
            `focus=${overdue[0].id.slice("approval:".length)}`,
          );

        const reportsTheFailedRun =
          failed.length === 1 &&
          failed[0]?.severity === "attention" &&
          failed[0].agentId === MARKETING &&
          failed[0].detail.includes(MARKETING_ONLY_INTEGRATION) &&
          // No run detail screen exists, so the destination is the agent's row.
          failed[0].action?.href === `/app/workspace/agents?live=1#live-agent-${MARKETING}`;

        const reportsTheBlockedGate =
          blocked.length === 1 &&
          blocked[0]?.severity === "attention" &&
          blocked[0].id.startsWith("gate:integrations:") &&
          blocked[0].agentId === MARKETING &&
          blocked[0].detail.includes(MARKETING_ONLY_INTEGRATION) &&
          // This plan version IS live, and the wording has to say so.
          blocked[0].detail.includes("This plan version is live") &&
          blocked[0].action?.href === "/app/integrations";

        // The gate it declined to ask about is declared, not omitted. With null
        // evidence the sandbox gate comes back SHUT, and emitting that would tell
        // an owner their workforce is unproven on the strength of a question this
        // route never asked.
        const saysWhatItDidNotCheck =
          loud.items.every((item) => !item.id.startsWith("gate:sandbox")) &&
          loud.notEvaluated.some((entry) => entry.id === "sandbox") &&
          loud.notEvaluated.some((entry) => entry.id === "external-delivery");

        const countsAddUp =
          loud.complete &&
          loud.counts.actionRequired === 1 &&
          loud.counts.attention === 2 &&
          loud.counts.waiting === 0 &&
          loud.counts.total === 3 &&
          loud.items.length === 3 &&
          // Severity first: the thing only the owner can fix is at the top.
          loud.items[0]?.severity === "action_required";

        const quietIsEmpty =
          calm.complete &&
          calm.items.length === 0 &&
          calm.counts.total === 0 &&
          calm.counts.actionRequired === 0 &&
          calm.counts.attention === 0 &&
          calm.counts.waiting === 0 &&
          calm.sources.length === 4 &&
          calm.sources.every((source) => source.ok);

        const pass =
          reportsTheOverdueApproval &&
          reportsTheFailedRun &&
          reportsTheBlockedGate &&
          saysWhatItDidNotCheck &&
          countsAddUp &&
          quietIsEmpty;
        add(
          name,
          pass,
          pass
            ? `an activated runtime with an approval an hour past its deadline, a ` +
                `${MARKETING_ONLY_INTEGRATION} connection revoked after go-live and a run that ` +
                `hit it produced exactly three items: the overdue decision first, as ` +
                `action_required and linked to itself in the live inbox; the failed run, linked ` +
                `to its agent's row because no run detail screen exists; and the integrations ` +
                `gate that would now refuse this live plan, attributed to ${MARKETING} and linked ` +
                `to the connections screen. The sandbox gate it declined to evaluate is declared ` +
                `rather than omitted, as is the fact that nothing here delivers anywhere. A ` +
                `second runtime, activated and idle, reported nothing at all from all four sources`
            : `overdue=${reportsTheOverdueApproval} (${overdue.length}) ` +
                `failed=${reportsTheFailedRun} (${failed.length}) ` +
                `blocked=${reportsTheBlockedGate} (${blocked.length}) ` +
                `saysWhatItDidNotCheck=${saysWhatItDidNotCheck} countsAddUp=${countsAddUp} ` +
                `(${canonical(loud.counts)}, kinds=${canonical(loud.items.map((i) => i.kind))}) ` +
                `quietIsEmpty=${quietIsEmpty} (${canonical(calm.counts)}, ` +
                `sources=${canonical(calm.sources.map((s) => [s.id, s.ok]))})`,
        );
      }
    }

    /* ═══ 4. THE DISPLAYED COUNT AND THE ENFORCED CAP ARE ONE FUNCTION ═══
       M6 recorded that `app/api/runtime/agents/route.ts` carried a display copy
       of a module-private counter in `schedule/worker.ts`: both counted the same
       three things the same way, and nothing kept them counting the same way. M7
       exported the one function.

       Proving that needs more than calling it twice. What the roster shows is a
       PROMISE about what the scheduler will do, so each arm reads the promise and
       then makes the scheduler keep or break it — on the two days where a second
       implementation would most plausibly have diverged, each paired with the
       control where the same pair moves the other way. */
    {
      const name =
        "M7-4 the roster's runs-today and the scheduler's daily cap are one function, across the local-day boundary and an unreadable start";
      const cap = financeSpec?.policy.maxRunsPerDay ?? null;

      /* ── The local day. Three runs at 01:00 Sunday Singapore, which is still
            Saturday in UTC: a UTC-keyed counter sees an empty day. ── */
      const dayWorld = await liveWorld("m7-day", verdict, { at: LOCAL_SUNDAY_1000 });
      /* ── The unreadable start. Two runs plus one whose instant will not parse,
            which reaches the cap only if the unreadable one counts. ── */
      const badWorld = await liveWorld("m7-unreadable", verdict, { at: LOCAL_SUNDAY_1000 });
      /* ── Its control: the same two runs and no third. ── */
      const controlWorld = await liveWorld("m7-control", verdict, { at: LOCAL_SUNDAY_1000 });

      if (
        typeof dayWorld === "string" ||
        typeof badWorld === "string" ||
        typeof controlWorld === "string"
      ) {
        add(
          name,
          false,
          `there is no live agent whose cap can be tested: ` +
            `${[dayWorld, badWorld, controlWorld].find((w) => typeof w === "string") ?? ""}`,
        );
      } else {
        for (let index = 1; index <= 3; index++) {
          await dayWorld.runStore.createRun(historicRun(`m7-day-${index}`, LOCAL_SUNDAY_0100));
        }
        const heldByLocalDay = await readCap(dayWorld, "day-same", LOCAL_SUNDAY_1000);

        // One local midnight later. In UTC this is only a day after a history a
        // UTC counter had already forgotten, so "reset" has to mean something.
        dayWorld.clock.advance(Date.parse(LOCAL_MONDAY_1000) - Date.parse(LOCAL_SUNDAY_1000));
        const releasedNextDay = await readCap(dayWorld, "day-next", LOCAL_MONDAY_1000);

        await badWorld.runStore.createRun(historicRun("m7-bad-1", LOCAL_SUNDAY_0100));
        await badWorld.runStore.createRun(historicRun("m7-bad-2", LOCAL_SUNDAY_0100));
        await badWorld.runStore.createRun(historicRun("m7-bad-3", "Tuesday morning, I think"));
        const unreadableCounts = await readCap(badWorld, "bad", LOCAL_SUNDAY_1000);

        await controlWorld.runStore.createRun(historicRun("m7-ctl-1", LOCAL_SUNDAY_0100));
        await controlWorld.runStore.createRun(historicRun("m7-ctl-2", LOCAL_SUNDAY_0100));
        const controlAllows = await readCap(controlWorld, "ctl", LOCAL_SUNDAY_1000);

        /* ── The third leg: a zone this platform cannot resolve. The worker
              throws because it is about to authorise a run and has no safe number
              to use; the roster catches that and reports the count as
              unavailable, because zero would read as "plenty of headroom left".
              A display copy would have had to choose one of those on its own. ── */
        const brokenZone = "Mars/Olympus";
        let functionThrows = false;
        try {
          countRunsToday([], brokenZone, new Date(LOCAL_SUNDAY_1000));
        } catch {
          functionThrows = true;
        }
        const brokenPlan: ApprovedPlan = {
          ...BRIGHTPATH_PLAN,
          agents: BRIGHTPATH_PLAN.agents.map((agent) =>
            agent.id === FINANCE && agent.policy.quietHours !== null
              ? {
                  ...agent,
                  policy: {
                    ...agent.policy,
                    quietHours: { ...agent.policy.quietHours, timezone: brokenZone },
                  },
                }
              : agent,
          ),
        };
        const brokenWorld = await makeWorld("m7-zone", { plan: brokenPlan, at: LOCAL_SUNDAY_1000 });
        install(brokenWorld);
        // Caught rather than allowed to escape: a roster that answers 500 on an
        // unresolvable zone is THIS check's failure, and letting it propagate
        // would take the two checks after it down as harness breakage.
        let brokenRoster: RosterView | null = null;
        let brokenRosterError = "";
        try {
          brokenRoster = await fetchRoster();
        } catch (error) {
          brokenRosterError = messageOf(error);
        }
        const brokenRow =
          brokenRoster === null ? undefined : agentRow(brokenRoster, FINANCE);
        const otherRow =
          brokenRoster === null ? undefined : agentRow(brokenRoster, MARKETING);

        const localDayAgrees =
          cap === 3 &&
          heldByLocalDay.displayed === 3 &&
          heldByLocalDay.gate === "refuse" &&
          heldByLocalDay.gateReason.includes("Daily run limit reached (3)") &&
          heldByLocalDay.jobStatus === "skipped" &&
          heldByLocalDay.jobDetail.includes("Daily run limit reached (3)") &&
          !heldByLocalDay.startedARun;

        const midnightReleasesBoth =
          releasedNextDay.displayed === 0 &&
          releasedNextDay.gate === "allow" &&
          releasedNextDay.jobStatus === "succeeded" &&
          releasedNextDay.startedARun;

        const unreadableAgrees =
          unreadableCounts.displayed === 3 &&
          unreadableCounts.gate === "refuse" &&
          unreadableCounts.jobStatus === "skipped" &&
          !unreadableCounts.startedARun &&
          // The control: drop the unreadable run and both halves move together.
          controlAllows.displayed === 2 &&
          controlAllows.gate === "allow" &&
          controlAllows.jobStatus === "succeeded" &&
          controlAllows.startedARun;

        const unresolvableZoneIsReported =
          functionThrows &&
          brokenRow?.counts.runsToday === null &&
          brokenRow.counts.runsTodayUnavailable?.includes("is not an IANA timezone") === true &&
          // Withheld entirely rather than answered from a made-up count.
          brokenRow.startGate === null &&
          // And one broken zone does not take the rest of the roster down.
          otherRow?.counts.runsToday === 0 &&
          otherRow.startGate !== null;

        const pass =
          localDayAgrees && midnightReleasesBoth && unreadableAgrees && unresolvableZoneIsReported;
        add(
          name,
          pass,
          pass
            ? `three runs at 01:00 Sunday Asia/Singapore — still Saturday in UTC, so a UTC day ` +
                `boundary would have counted none of them — show on the roster as 3 of ${cap} with ` +
                `the start gate refusing, and the firing at 10:00 was skipped with the same ` +
                `sentence; one local midnight later the roster reads 0 and the identical firing ` +
                `started a run. A run whose startedAt will not parse counts AGAINST the cap in ` +
                `both places (3 of ${cap}, skipped), and without it the same world reads 2 and ` +
                `starts. A zone the tz database does not know makes the function throw, which the ` +
                `roster reports as an unavailable count with no start gate rather than as zero, ` +
                `while every other agent's row still carries a number`
            : `localDayAgrees=${localDayAgrees} (${canonical(heldByLocalDay)}) ` +
                `midnightReleasesBoth=${midnightReleasesBoth} (${canonical(releasedNextDay)}) ` +
                `unreadableAgrees=${unreadableAgrees} (${canonical(unreadableCounts)} vs control ` +
                `${canonical(controlAllows)}) unresolvableZoneIsReported=${unresolvableZoneIsReported} ` +
                `(throws=${functionThrows}, runsToday=${canonical(brokenRow?.counts.runsToday ?? "no row")}, ` +
                `gate=${canonical(brokenRow?.startGate ?? null)}` +
                `${brokenRosterError === "" ? "" : `, the roster refused it: ${brokenRosterError}`})`,
        );
      }
    }

    /* ═══ 5. A BLOCKED ACTIVATION NAMES THE GATE THAT SHUT ═══
       Three worlds, one shut gate each, and in every one of them the OTHER TWO
       are asserted open. That pairing is the whole check: a checklist that
       blocked on everything, or one that reported a single generic "not ready",
       would satisfy "the packages gate is shut" three times over and tell an
       owner nothing about what to go and fix.

       Nothing may be written on the way to refusing either. A go-live that
       half-happened is the worse failure, and it would leave a roster showing
       live agents behind a checklist that says no. */
    {
      const name =
        "M7-5 a blocked activation names which of the three gates shut, one gate at a time, and writes nothing";

      /* ── Packages: an agent whose version has moved past its built package.
            That is the real shape of the problem — a plan edited after a build —
            and it leaves the sandbox verdict about the same plan version, so the
            other two gates stay open. ── */
      const drifted: ApprovedPlan = {
        ...BRIGHTPATH_PLAN,
        agents: BRIGHTPATH_PLAN.agents.map((agent) =>
          agent.id === MARKETING ? { ...agent, version: agent.version + 1 } : agent,
        ),
      };

      const cases: {
        gate: "packages" | "sandbox" | "integrations";
        world: World;
        evidence: SandboxVerdict | null;
        href: string;
        expect: (message: string) => boolean;
      }[] = [
        {
          gate: "packages",
          world: await makeWorld("m7-gate-packages", { plan: drifted }),
          evidence: verdict,
          href: "/app/build",
          expect: (message) => message.includes("has no package to run"),
        },
        {
          gate: "sandbox",
          world: await makeWorld("m7-gate-sandbox"),
          evidence: null,
          href: "/app/sandbox",
          expect: (message) => message.includes("has not been proved in the sandbox yet"),
        },
        {
          gate: "integrations",
          world: await makeWorld("m7-gate-integrations", { disconnected: [REQUIRED_BUT_DOWN] }),
          evidence: verdict,
          href: "/app/integrations",
          expect: (message) => message.includes(`${REQUIRED_BUT_DOWN} is not connected`),
        },
      ];

      const outcomes: string[] = [];
      let allNamed = true;
      for (const scenario of cases) {
        const result = await goLive(scenario.world, scenario.evidence);
        const shut = result.checklist.gates.filter((gate) => !gate.satisfied);
        const open = result.checklist.gates.filter((gate) => gate.satisfied);
        const blocked = shut[0];

        const triggers = await scenario.world.scheduler.store.listTriggers();
        const states = await scenario.world.scheduler.store.listAgentStates();
        const deployment = await scenario.world.scheduler.store.getActiveDeployment(
          scenario.world.plan.planId,
        );

        const named =
          !result.activated &&
          result.outcome === "blocked" &&
          result.checklist.ready === false &&
          // Exactly one gate shut, and it is the expected one.
          shut.length === 1 &&
          blocked?.id === scenario.gate &&
          open.length === 2 &&
          // It says what is wrong and where to go, and the flattened list the
          // route returns is the gate's own blockers rather than a second set.
          blocked.blockers.length > 0 &&
          blocked.blockers.every((entry) => entry.href === scenario.href) &&
          blocked.blockers.some((entry) => scenario.expect(entry.message)) &&
          canonical(result.blockers) === canonical(blocked.blockers) &&
          // Nothing was written on the way to refusing.
          triggers.length === 0 &&
          states.length === 0 &&
          deployment === null;

        if (!named) allNamed = false;
        outcomes.push(
          `${scenario.gate}: shut=${canonical(shut.map((gate) => gate.id))} ` +
            `open=${canonical(open.map((gate) => gate.id))} ` +
            `blockers=${blocked?.blockers.length ?? 0} wrote=${triggers.length}/${states.length}/` +
            `${deployment === null ? 0 : 1}`,
        );
      }

      add(
        name,
        allNamed,
        allNamed
          ? `each gate was shut on its own and named itself: a marketing agent one version past ` +
              `its package closed "packages" alone and pointed at /app/build; no sandbox verdict ` +
              `closed "sandbox" alone and pointed at /app/sandbox; a disconnected ` +
              `${REQUIRED_BUT_DOWN} closed "integrations" alone and pointed at /app/integrations. ` +
              `In all three the other two gates were satisfied, the flattened blocker list was the ` +
              `shut gate's own, and no trigger, agent record or deployment was written`
          : `one or more gates did not block alone or did not name themselves — ${outcomes.join(" | ")}`,
      );
    }

    /* ═══ 6. Determinism, which M3 earned and M7 must not spend ═══
       The whole product walked twice under identical seeds, compared as bytes
       across all five Operate reads. The failure this guards against never shows
       up in a field anybody thought to assert: one `Date.now()` or one
       `crypto.randomUUID()` on any of the ten routes would make `npm run verify`
       differ between two runs of an unchanged repository.

       The realtime stream is deliberately outside this comparison — its epoch is
       the process's own start instant, which is display metadata about a
       connection rather than anything the runtime recorded. M7-2 asserts revision
       deltas instead, and those are deterministic. */
    {
      const name = "M7-6 the whole end-to-end walk is byte-identical on a rerun";
      const again = await walkTheProduct("m7");
      if (!walk.ok || !again.ok) {
        add(name, false, cannotProceed(!walk.ok ? walk : (again as WalkFailed), "rerun"));
      } else {
        const identical = again.fingerprint === walk.fingerprint;
        add(
          name,
          identical,
          identical
            ? `two independent runtimes under the same seed produced identical Workspace, ` +
                `calendar, roster, connections and notification reads (${walk.fingerprint.length} bytes)`
            : `the two surfaces diverged: ${walk.fingerprint.length} vs ${again.fingerprint.length} ` +
                `bytes. Something behind an Operate screen is reading a wall clock or a random ` +
                `source instead of the session's injected Clock and newId.`,
        );
      }
    }

    add(
      COMPLETED,
      true,
      `all six checks above ran to the end: every build, sandbox, activation, scheduler, ` +
        `approval, roster, calendar, connections, notification and event-stream read they make ` +
        `was answered`,
    );
  } catch (error) {
    /*
     * Every read above crosses a route boundary, and the screen readers refuse
     * rather than shrug — a 400, a 404 or a field they cannot parse arrives here
     * as an exception. Without this, the first such failure would end the process
     * on a stack trace that says nothing about which surface broke, and take the
     * remaining checks with it.
     *
     * The count is deliberately short by one when this fires, so the
     * `expectedChecks` tripwire in scripts/verify.mjs reports the truncation as
     * well: a suite that stopped early must not be able to look like a suite that
     * had fewer checks to run.
     */
    add(
      COMPLETED,
      false,
      `the run stopped at check ${checks.length + 1} of 6: ${messageOf(error)}. Every check ` +
        `after it was skipped, so this result is a floor rather than a verdict.`,
    );
  } finally {
    globalThis.fetch = originalFetch;
    // Belt and braces: M7-2 disposes its own observer, and an exception thrown
    // between opening a stream and that dispose would otherwise leave an
    // interval reading the run store for the rest of the process.
    resetObserver();
    if (originalInterval === undefined) delete process.env.ORIANT_EVENTS_INTERVAL_MS;
    else process.env.ORIANT_EVENTS_INTERVAL_MS = originalInterval;
  }

  return checks;
}

export function formatResults(results: Check[]): string {
  const lines = results.map(
    (r) => `${r.pass ? "PASS" : "FAIL"}  ${r.name}\n        ${r.detail}`,
  );
  const failed = results.filter((r) => !r.pass).length;
  lines.push("");
  lines.push(
    failed === 0
      ? `M7 EXIT CRITERIA MET — ${results.length}/${results.length} checks passed.`
      : `M7 NOT MET — ${failed} of ${results.length} checks failed.`,
  );
  return lines.join("\n");
}
