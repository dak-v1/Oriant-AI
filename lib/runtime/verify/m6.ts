/**
 * lib/runtime/verify/m6.ts — the M6 exit criterion, as an executable check.
 *
 * ROLE_C_PLAN M6 exits on "every sidenav item leads somewhere real", which is a
 * sentence about a browser and cannot be typed into a headless runner without
 * changing what it claims. The honest translation is the half that is falsifiable
 * without a DOM: **each of the three new screens is fed data that is genuinely
 * derived from the runtime, and that data changes when the runtime changes.** A
 * calendar that renders beautifully from a constant leads nowhere real; so does a
 * roster whose "paused" pill is a local `useState`.
 *
 * SO THE CHECKS DRIVE THE REAL ROUTE HANDLERS THROUGH THE REAL SCREEN READERS.
 * `app/api/runtime/{calendar,agents,integrations}` hold the projections — the
 * three-source event walk, the roster's join across four stores, the grant walk
 * and its borrowed blocking rule — and none of that logic exists anywhere else,
 * so a verifier that re-derived it would be proving only that it agrees with
 * itself. Each check therefore installs a deterministic `RuntimeSession` and then
 * reads through each area's own module under `components/live` — `fetchRoster`,
 * `fetchCalendar`, `fetchConnections`, `submitTransition`, `fetchApprovalRecord`
 * — which are the modules the screens themselves call. Two things come free from
 * that choice:
 *
 *   - Every assertion below is about a value the screen would actually hold,
 *     one layer above the route's JSON rather than one layer below it.
 *   - Those readers PARSE rather than cast, and refuse a state word this build
 *     has no treatment for. So a route that renamed `dayKey`, or started emitting
 *     a sixth `AgentRuntimeState`, turns a check red at the reader instead of
 *     silently rendering a blank pill on a day that then looks empty.
 *
 * The one thing this file swaps out is the transport: `globalThis.fetch` is
 * pointed at the route handlers for the duration of `runM6Verification()` and
 * restored afterwards, because the readers ask for a relative `/api/runtime/...`
 * URL and there is no server here. Nothing else about their path is bypassed.
 *
 * WHAT THIS STILL DOES NOT PROVE, said plainly, because M5 was made to say it
 * too: no React renders here. No component, no lane switch on a page, no
 * keyboard order and no pixel is covered. `verify:m6` proves the data behind the
 * three screens, not the screens.
 *
 * NOTHING IS HAND-BUILT. Every run below was started by the Friday cron through
 * `runDueWork`, every approval was raised by `policy.ts` breaching a limit on
 * that run, and every runtime state was written by `activate`, `pauseAgent` or
 * `resumeAgent`. The two constructed inputs are named where they appear and are
 * both plan-shaped rather than runtime-shaped: a plan whose marketing agent has
 * moved one version past its built package (M6-2), and an integration provider
 * with two connections switched off (M6-6). Both are situations, not answers.
 *
 * A CHECK THAT CANNOT FAIL IS NOT A CHECK, so each one is paired with the thing
 * that would break it:
 *
 *   - M6-1 asserts the roster BEFORE and AFTER each transition, so a pill wired
 *     to anything other than `AgentRuntimeRecord` fails, and pairs every refusal
 *     with the identical call that succeeds — a resume refused for version drift
 *     is only interesting beside the same resume applied without it.
 *   - M6-2 asserts the roster against `listAgentStates()` itself, and then
 *     against a world where the packages gate blocked: an agent whose package was
 *     never built must not read as active, and nothing may have been written.
 *   - M6-5 reads the SAME approval at three instants of the injected clock and
 *     requires its `at` to be identical and its state to move. A route reading
 *     wall time fails on `view.now` before it fails on anything else.
 *   - M6-6 derives the expected integration rows FROM THE PLAN's `ToolGrant[]`
 *     rather than from the route, and drives one required and one optional
 *     connection down at the same time, so "everything blocks" and "nothing
 *     blocks" both go red.
 *   - M6-7 pins the wall-clock label and the weekday, which is where a UTC
 *     reading of `0 9 * * 5` shows up (09:00 becomes 01:00 or 17:00), and adds
 *     the one instant on this plan where the local day and the UTC day disagree.
 *
 * EACH CHECK GETS A FRESH WORLD, as in M4 and M5. Sharing one runtime across all
 * of them would be cheaper and would hide exactly the class of bug this milestone
 * can have — a pause, a blocked activation or a decided approval surviving a
 * boundary it should not have. The sandbox verdict is the single thing built once
 * and reused, because it is evidence about the plan rather than about any
 * particular screen.
 *
 * M6-9 IS ABOUT THE HARNESS, NOT THE PRODUCT, and is the only check here that is.
 * The readers refuse rather than shrug, so a route that renames a field or answers
 * 400 reaches this file as a thrown error; M6-9 turns that into a named failure
 * and a short count instead of a stack trace that says nothing about which
 * surface broke.
 *
 * DETERMINISM IS AN M3 EXIT CRITERION AND MUST NOT REGRESS. Clock, ids, tools and
 * reasoner are pinned exactly as in the sandbox, the session is injected rather
 * than composed from the environment, and M6-8 builds the whole loop twice under
 * identical seeds and compares all four screen reads byte for byte.
 *
 * Run it with: npm run verify:m6
 */

import { GET as agentsGET, POST as agentsPOST } from "../../../app/api/runtime/agents/route";
import { GET as approvalsGET } from "../../../app/api/runtime/approvals/route";
import { GET as calendarGET } from "../../../app/api/runtime/calendar/route";
import { GET as integrationsGET } from "../../../app/api/runtime/integrations/route";
import { fetchRoster, submitTransition } from "../../../components/live/agents/api";
import type { AgentView, RosterView } from "../../../components/live/agents/api";
import { fetchApprovalRecord } from "../../../components/live/approvals/api";
import { ApprovalsApiError } from "../../../components/live/approvals/api";
import { resolveApprovalsLane } from "../../../components/live/approvals/lane";
import { fetchCalendar } from "../../../components/live/calendar/api";
import type { CalendarEventView, CalendarView } from "../../../components/live/calendar/api";
import { fetchConnections } from "../../../components/live/integrations/api";
import type { ConnectionsView } from "../../../components/live/integrations/api";
import { businessZone } from "../../../components/live/workspace/plan-facts";
import { BRIGHTPATH_PLAN } from "../../plan/fixtures/brightpath";
import type { ApprovedPlan } from "../../plan/types";
import { dependencyFanOut } from "../approvals";
import { LocalPackageGenerator, buildPlan, loadBundle } from "../build/runner";
import { InMemoryBuildStore } from "../build/store";
import type { BuildDeps } from "../build/types";
import { decideAndResume } from "../executor";
import type { ExecutorOptions } from "../executor";
import { FixtureReasoner } from "../llm";
import { runSuite } from "../sandbox/runner";
import { BRIGHTPATH_SCENARIOS } from "../sandbox/scenarios";
import { runStressSweep } from "../sandbox/stress";
import { FixedSandboxEvidence, activate } from "../schedule/activation";
import type { ActivationDeps, ActivationResult } from "../schedule/activation";
import { InMemorySchedulerStore } from "../schedule/store";
import { triggerIdFor } from "../schedule/triggers";
import type { SchedulerDeps } from "../schedule/types";
import type { SandboxVerdict } from "../sandbox/types";
import { currentPlan, resolvePlanState } from "../current-plan";
import { resolveActivePlan } from "../active-plan";
import type { RuntimeSession } from "../session";
import { runDueWork } from "../schedule/worker";
import { FixedClock, InMemoryRunStore, createIdFactory } from "../store";
import { StubIntegrationProvider } from "../tools";
import type { ApprovalRequest, RunState } from "../types";

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

/* ═══════════════════════════ The fixture ═══════════════════════════ */

const FINANCE = "finance-followup";
const MARKETING = "marketing";
const ADMIN = "admin-operations";
const SWEEP = "payment-reminder-drafting";
const SUMMARY = "overdue-invoice-summary";
const OWNER = "user_sarah_chen";

const SWEEP_TRIGGER_ID = triggerIdFor(BRIGHTPATH_PLAN.planId, FINANCE, SWEEP);

/** The two connections M6-6 switches off: one required by the plan, one not. */
const REQUIRED_BUT_DOWN = "quickbooks";
const OPTIONAL_BUT_DOWN = "google-drive";

/* ═══════════════════════════ Instants ═══════════════════════════ */

/*
 * UTC, annotated with the wall clock Sarah reads, exactly as in M5. Asia/Singapore
 * is UTC+8, and that offset is the whole of M6-7: a cron written "0 9 * * 5" is a
 * statement about her Friday morning, not about 09:00Z.
 */

/** Friday 08:30 Asia/Singapore: activation, half an hour before the sweep. */
const ACTIVATED_AT = "2026-07-24T00:30:00.000Z";
/** Friday 09:00 Asia/Singapore. The cron minute. */
const FRIDAY_0900 = "2026-07-24T01:00:00.000Z";
/** The following Friday, which is where the sweep's next firing lands. */
const NEXT_FRIDAY_0900 = "2026-07-31T01:00:00.000Z";

const MS_PER_MINUTE = 60_000;

/** The half hour between go-live and the cron minute. */
const UNTIL_CRON_MS = 30 * MS_PER_MINUTE;
/** How long the sweep sits in the inbox before Sarah opens it. */
const REVIEW_DELAY_MS = 40 * MS_PER_MINUTE;

/**
 * Still Friday the 24th in UTC, already Saturday the 25th at 01:00 in Singapore.
 *
 * At +8 the two calendars can only disagree between 00:00 and 08:00 local, and no
 * workflow in this plan is scheduled in that window — so this instant is the only
 * way M6-7 can ask "which calendar is the grid grouped by" and get an answer that
 * a UTC implementation would get wrong.
 */
const LOCAL_DAY_HAS_ROLLED_OVER = "2026-07-24T17:00:00.000Z";

/* ═══════════════════════════ Small helpers ═══════════════════════════ */

/** Where a relative `href` is resolved against; never fetched. */
const LINK_BASE = "https://app.oriant.invalid";

function canonical(value: unknown): string {
  return JSON.stringify(value);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The weekday of a `YYYY-MM-DD` day key, worked out here rather than trusted. */
function weekdayOf(dayKey: string): number {
  return new Date(`${dayKey}T00:00:00.000Z`).getUTCDay();
}

const FRIDAY = 5;

/**
 * The ninth result, and the only one that is about the harness rather than the
 * product: it passes when all eight checks reached their own verdict, and fails
 * naming the error when a read threw and ended the run early.
 */
const COMPLETED = "M6-9 every screen read the checks above make was answered";

/* ═══════════════════════════ The transport ═══════════════════════════ */

/**
 * The live areas' api modules fetch relative URLs, because in the browser they
 * are relative to the page. There is no server here, so `globalThis.fetch` is
 * pointed at the route handlers for the length of this run, and restored after.
 *
 * The restore is not tidiness: `npm run verify` runs every milestone in ONE Node
 * process, and leaving a stubbed `fetch` behind would hand it to whatever runs
 * next.
 *
 * An unrouted path throws rather than returning a 404. A reader that asked for an
 * endpoint this file has not wired would otherwise report "the runtime answered
 * 404", which reads like a runtime fault instead of a gap in the harness.
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
    case "/api/runtime/calendar":
      return calendarGET(request);
    case "/api/runtime/integrations":
      return integrationsGET();
    case "/api/runtime/approvals":
      return approvalsGET(request);
    default:
      throw new Error(
        `verify:m6 has no route wired for ${method} ${url.pathname}. This is a gap in the ` +
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
  /** The plan the SESSION and the activation see; not always what was built. */
  plan: ApprovedPlan;
  session: RuntimeSession;
}

interface WorldOptions {
  /**
   * What the routes and `activate` are given. Packages are always built from
   * `BRIGHTPATH_PLAN`, so passing a plan whose agent versions have moved is how
   * M6-2 produces an agent with no package without deleting anything.
   */
  plan?: ApprovedPlan;
  /** Connections the integrations registry reports as not connected. */
  disconnected?: string[];
}

/**
 * The session shape `getRuntimeSession()` caches on `globalThis`, built from the
 * deterministic pieces instead of from the environment.
 *
 * `lib/runtime/session.ts` reads two env switches and picks a reasoner and a
 * storage backend; a verifier that went through it would touch a disk, read a
 * wall clock and generate random ids — three ways to lose the M3 determinism
 * guarantee before the first assertion. Installing a session instead is the same
 * substitution the sandbox makes one layer down, and it is why the routes below
 * are exercised without a server, a file or a network.
 */
interface SessionGlobal {
  __oriantRuntime?: RuntimeSession;
}

function install(world: World): void {
  (globalThis as unknown as SessionGlobal).__oriantRuntime = world.session;
}

async function makeWorld(seed: string, options: WorldOptions = {}): Promise<World> {
  const clock = new FixedClock(ACTIVATED_AT);

  const build: BuildDeps & { store: InMemoryBuildStore } = {
    store: new InMemoryBuildStore(),
    generator: new LocalPackageGenerator(),
    clock,
    newId: createIdFactory(`${seed}-build`),
    sleep: async () => {},
  };
  await buildPlan(BRIGHTPATH_PLAN, build);

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
  const reasoner = new FixtureReasoner();
  const executor: ExecutorOptions = {
    store: runStore,
    tools: integrations,
    reasoner,
    clock,
    newId: createIdFactory(`${seed}-run`),
    sleep: async () => {},
    globalPolicy: plan.globalPolicy,
  };

  /*
   * THE PLAN LIVES IN THE STORE NOW, not in a session field.
   *
   * `session.plan` used to be the whole mechanism: the routes read it
   * synchronously and a test changed it by rebuilding the session. It is gone,
   * and the routes read `session.currentPlan()` — which resolves out of
   * `SchedulerStore.getCurrentPlan`. So the world seeds the store, exactly as an
   * ingest through the pipeline would.
   *
   * Deliberately NOT stubbed as `currentPlan: async () => plan`. That would keep
   * these checks green even if `resolveCurrentPlan` were broken outright, and
   * M6-1's entire job is to notice when the roster stops reading the plan the
   * owner intends. The store is already a real in-memory store here, so seeding
   * it is the same substitution the harness makes everywhere else: real
   * component, fake environment.
   */
  await scheduler.store.saveCurrentPlan(plan);

  return {
    clock,
    build,
    runStore,
    scheduler,
    integrations,
    executor,
    plan,
    session: {
      mode: "fixture",
      // No world in this file holds a live tool client, and a check that ran
      // against one would be reaching a real customer from the test suite.
      toolsLive: false,
      storage: "memory",
      dataDir: null,
      // The construction seed. Same value as the current plan here because this
      // world has exactly one plan, but read through the store like production.
      seedPlan: plan,
      currentPlan: () => currentPlan(scheduler.store),
      planState: () => resolvePlanState(scheduler.store),
      // Read through the store exactly as production does, rather than returned
      // as `plan`. A stub answering with the world's plan would report a
      // deployment where there is none, and M6 asserts drift — which is the
      // difference between what is deployed and what is intended.
      deployedPlan: async () => {
        const active = await resolveActivePlan(scheduler.store);
        return active.source === "deployment" ? active.plan : null;
      },
      // Mirrors `executorWith` in lib/runtime/session.ts: the same deps, carrying
      // the policy of whichever plan is being executed.
      executorFor: (forPlan) => ({ ...executor, globalPolicy: forPlan.globalPolicy }),
      runStore,
      buildStore: build.store,
      schedulerStore: scheduler.store,
      tools: integrations,
      // Mirrors the not-live branch of `toolsFor` in lib/runtime/session.ts: with
      // tools off every organization gets the one stub, because a simulated send
      // is not attributable to anybody. `toolsLive: false` above is what makes
      // ignoring the organization correct here rather than the bug this method
      // exists to prevent.
      toolsFor: () => integrations,
      reasoner,
      executor,
      build,
      scheduler,
      reset: async () => {},
    },
  };
}

/**
 * Swap what the owner currently intends, mid-check.
 *
 * The drift case in M6-1 needs the plan to move AFTER activation froze a
 * version, which is what makes a resume a 409 rather than a no-op. It used to be
 * done by re-installing a session with a different `plan` field; now the plan is
 * a stored fact, so moving it is a write. Same session, same stores — only the
 * intended plan changes, which is precisely the fact drift is measured against.
 */
async function setCurrentPlan(world: World, plan: ApprovedPlan): Promise<void> {
  await world.scheduler.store.saveCurrentPlan(plan);
}

function activationDeps(world: World, verdict: SandboxVerdict): ActivationDeps {
  return {
    scheduler: world.scheduler,
    packages: world.build,
    integrations: world.integrations,
    sandbox: new FixedSandboxEvidence(verdict),
  };
}

async function goLive(world: World, verdict: SandboxVerdict): Promise<ActivationResult> {
  return activate(world.plan, activationDeps(world, verdict), { activatedBy: OWNER });
}

/* ═══════════════════════ The world the screens read ═══════════════════════ */

/**
 * Everything the three screens have something to show: a schedule that has fired,
 * a run that finished, a run still waiting, and a decision outstanding.
 *
 * It is M5's loop, run for a different reason. M5 proved the loop; M6 needs the
 * state it leaves behind, because the calendar's three sources do not all exist
 * until it has run — there is no finished run before the approval is decided and
 * no pending approval until the chained summary has paused.
 */
interface Loop {
  ok: true;
  world: World;
  /** The Friday sweep: started by the cron, paused, approved, completed. */
  sweepRun: RunState;
  /** The summary chained behind it, paused on a write-off. */
  summaryRun: RunState;
  /** The decision still outstanding when the screens are read. */
  pending: ApprovalRequest;
  /** All four screen reads, taken at the same moment for M6-8. */
  fingerprint: string;
}

interface LoopFailed {
  ok: false;
  why: string;
}

type LoopAttempt = Loop | LoopFailed;

async function runLoop(seed: string, verdict: SandboxVerdict): Promise<LoopAttempt> {
  const spec = BRIGHTPATH_PLAN.agents.find((agent) => agent.id === FINANCE);
  if (spec === undefined) {
    return { ok: false, why: `the plan no longer contains an agent called "${FINANCE}"` };
  }

  const world = await makeWorld(seed);
  const activation = await goLive(world, verdict);
  if (!activation.activated) {
    return {
      ok: false,
      why:
        `activation was blocked at go-live: ` +
        activation.blockers.map((blocker) => blocker.message).join("; "),
    };
  }

  // Advancing rather than constructing at 09:00 is the point: `nextFireAt` was
  // computed before the instant it fires at, exactly as at a real go-live.
  world.clock.advance(UNTIL_CRON_MS);
  const firstPass = await runDueWork({
    plan: BRIGHTPATH_PLAN,
    scheduler: world.scheduler,
    executor: world.executor,
    build: world.build,
    pollSchedules: true,
  });

  const job = firstPass.jobs.find(
    (entry) => entry.agentId === FINANCE && entry.workflowId === SWEEP,
  );
  const started = job?.runId ? await world.runStore.getRun(job.runId) : null;
  if (started === null || started.pendingApprovalId === null) {
    return {
      ok: false,
      why:
        `the Friday cron produced no paused run for ${FINANCE}/${SWEEP} — the pass claimed ` +
        `${firstPass.claimed} job(s) and the run ended "${started?.status ?? "nothing"}"`,
    };
  }

  const bundle = await loadBundle(spec, world.build);
  if (bundle === null) {
    return { ok: false, why: `no built package exists for ${FINANCE} v${spec.version}` };
  }

  world.clock.advance(REVIEW_DELAY_MS);
  const fanOut = dependencyFanOut({ plan: BRIGHTPATH_PLAN, scheduler: world.scheduler });
  await decideAndResume(
    {
      approvalId: started.pendingApprovalId,
      decision: "approved",
      decidedBy: OWNER,
      decidedAt: world.clock.now().toISOString(),
    },
    bundle,
    { ...world.executor, onRunResumed: fanOut.onRunResumed },
  );

  // The pass that turns the chained dependency into a run of its own.
  await runDueWork({
    plan: BRIGHTPATH_PLAN,
    scheduler: world.scheduler,
    executor: world.executor,
    build: world.build,
    pollSchedules: true,
  });

  const sweepRun = await world.runStore.getRun(started.runId);
  const runs = await world.runStore.listRuns();
  const summaryRun = runs.find((run) => run.workflowId === SUMMARY) ?? null;
  if (sweepRun === null || summaryRun === null) {
    return {
      ok: false,
      why:
        `the decision did not leave the two runs M6 reads: sweep=${sweepRun?.status ?? "gone"}, ` +
        `summary=${summaryRun === null ? "never started" : summaryRun.status}`,
    };
  }
  if (summaryRun.pendingApprovalId === null) {
    return {
      ok: false,
      why: `the chained ${SUMMARY} run ended "${summaryRun.status}" instead of pausing for a decision`,
    };
  }
  const pending = await world.runStore.getApproval(summaryRun.pendingApprovalId);
  if (pending === null) {
    return {
      ok: false,
      why: `run ${summaryRun.runId} points at approval ${summaryRun.pendingApprovalId}, which is not stored`,
    };
  }

  // Taken here rather than by the caller so both halves of M6-8 measure the same
  // moment; a check that read one extra screen first would be comparing two
  // different questions and calling the answer non-deterministic.
  install(world);
  const fingerprint = canonical({
    roster: await fetchRoster(),
    calendar: await fetchCalendar(null),
    connections: await fetchConnections(),
    approval: await fetchApprovalRecord(pending.approvalId),
  });

  return { ok: true, world, sweepRun, summaryRun, pending, fingerprint };
}

function cannotProceed(attempt: LoopFailed, about: string): string {
  return (
    `The Friday sweep never reached the state these screens read, so there is no ${about} ` +
    `to test: ${attempt.why}. M6-3 is the check that owns this failure.`
  );
}

/* ═══════════════════════════ Screen readers ═══════════════════════════ */

function agentRow(roster: RosterView, agentId: string): AgentView | undefined {
  return roster.agents.find((agent) => agent.agentId === agentId);
}

function triggerOf(agent: AgentView | undefined, workflowId: string) {
  return agent?.workflows.find((workflow) => workflow.workflowId === workflowId)?.trigger ?? null;
}

function eventsFor(view: CalendarView, predicate: (event: CalendarEventView) => boolean) {
  return view.events.filter(predicate);
}

/** Chronological, ties broken by id — the order the route promises. */
function isOrdered(view: CalendarView): boolean {
  for (let index = 1; index < view.events.length; index++) {
    const previous = view.events[index - 1];
    const current = view.events[index];
    if (previous === undefined || current === undefined) return false;
    const left = Date.parse(previous.at);
    const right = Date.parse(current.at);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    if (left > right) return false;
    if (left === right && previous.id.localeCompare(current.id) > 0) return false;
  }
  return true;
}

/* ═══════════════ What the plan says about integrations ═══════════════ */

interface PlannedIntegration {
  integrationId: string;
  /** Agents that hold a grant on it, in plan order. */
  agentIds: string[];
  /** Every operation granted on it, in first-reference order. */
  operationIds: string[];
  /** Required by at least one agent — the flag read exactly as the gate reads it. */
  required: boolean;
}

/**
 * The integrations an `ApprovedPlan` references, walked from `ToolGrant[]`.
 *
 * Derived from the PLAN rather than read back from the route, which is the whole
 * point of M6-6: asking the implementation which integrations it should have
 * listed would prove only that it lists what it lists.
 */
function integrationsThePlanReferences(plan: ApprovedPlan): PlannedIntegration[] {
  const order: string[] = [];
  const rows = new Map<string, PlannedIntegration>();

  for (const agent of plan.agents) {
    for (const grant of agent.tools) {
      let row = rows.get(grant.integrationId);
      if (row === undefined) {
        row = {
          integrationId: grant.integrationId,
          agentIds: [],
          operationIds: [],
          required: false,
        };
        rows.set(grant.integrationId, row);
        order.push(grant.integrationId);
      }
      if (!row.agentIds.includes(agent.id)) row.agentIds.push(agent.id);
      for (const operation of grant.operations) {
        if (!row.operationIds.includes(operation)) row.operationIds.push(operation);
      }
      // Anything but an explicit `false` is required, matching `integrationDemand`.
      row.required = row.required || grant.required !== false;
    }
  }

  return order.flatMap((id) => {
    const row = rows.get(id);
    return row === undefined ? [] : [row];
  });
}

/** Every row's grants attributed to the right agents, with the right operations. */
function attributionMatches(view: ConnectionsView, planned: PlannedIntegration[]): boolean {
  return planned.every((expected) => {
    const row = view.integrations.find(
      (candidate) => candidate.integrationId === expected.integrationId,
    );
    if (row === undefined) return false;
    if (canonical(row.grants.map((grant) => grant.agentId)) !== canonical(expected.agentIds)) {
      return false;
    }
    if (
      canonical(row.operations.map((operation) => operation.id)) !==
      canonical(expected.operationIds)
    ) {
      return false;
    }
    return row.requiredByPlan === expected.required;
  });
}

/* ═══════════════════════════ The checks ═══════════════════════════ */

export async function runM6Verification(): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, pass_: boolean, detail: string) =>
    checks.push({ name, pass: pass_, detail });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = routerFetch;

  try {
    /* 0. The sandbox verdict activation gates on. Earned once, from packages the
          Factory built, exactly as M3 earns it — activation re-derives its own
          conclusions from this data, so a hand-written verdict would test the
          gate against evidence no sandbox ever produced. */
    const evidenceBuild: BuildDeps & { store: InMemoryBuildStore } = {
      store: new InMemoryBuildStore(),
      generator: new LocalPackageGenerator(),
      clock: new FixedClock(ACTIVATED_AT),
      newId: createIdFactory("m6-evidence"),
      sleep: async () => {},
    };
    await buildPlan(BRIGHTPATH_PLAN, evidenceBuild);
    const stress = await runStressSweep(BRIGHTPATH_PLAN, { packages: evidenceBuild });
    const verdict = await runSuite(BRIGHTPATH_SCENARIOS, BRIGHTPATH_PLAN, {
      packages: evidenceBuild,
      stress,
    });

    /* ═══ 1. THE ROSTER IS THE RUNTIME, AND A REFUSAL IS A REFUSAL ═══
       ROLE_C_PLAN M6 asks for "pause/resume/stop". The transitions are read here
       through `submitTransition`, which is what the roster's own buttons call,
       and the roster is re-read after each one so a pill that moved without the
       runtime moving underneath it fails.

       The refusals are the half that matters. `resumeAgent` returns
       `changed: false` with a sentence for four different situations, and a route
       that answered 200 to any of them would put an owner in front of a roster
       claiming an agent is live when nothing was re-registered. Two of the four
       are driven here — an agent the plan does not contain, and one whose version
       has moved since activation — each paired with the identical call that
       succeeds, because a 409 proves nothing beside a call that never gets a 200.
       The other two (never activated, and a state resume does not restart) share
       the same return path and the same route branch. */
    {
      const name =
        "M6-1 the roster reflects a real pause and a real resume, and a refused transition is reported as refused";
      const world = await makeWorld("m6-roster");
      const activation = await goLive(world, verdict);
      install(world);

      if (!activation.activated) {
        add(name, false, `activation was blocked, so there is no live agent to pause`);
      } else {
        const before = await fetchRoster();
        const financeBefore = agentRow(before, FINANCE);
        const startedLive =
          financeBefore?.runtime?.state === "active" &&
          financeBefore.counts.enabledTriggers === 2 &&
          triggerOf(financeBefore, SWEEP)?.enabled === true &&
          triggerOf(financeBefore, SWEEP)?.nextFireAt === FRIDAY_0900;

        /* ── Pause ── */
        const pause = await submitTransition({ agentId: FINANCE, action: "pause", by: OWNER });
        const afterPause = await fetchRoster();
        const financePaused = agentRow(afterPause, FINANCE);
        const adminUntouched = agentRow(afterPause, ADMIN);
        const pauseLanded =
          pause.kind === "applied" &&
          pause.outcome.changed &&
          pause.outcome.state === "paused" &&
          pause.outcome.triggers === 2 &&
          financePaused?.runtime?.state === "paused" &&
          financePaused.counts.enabledTriggers === 0 &&
          triggerOf(financePaused, SWEEP)?.enabled === false &&
          triggerOf(financePaused, SWEEP)?.nextFireAt === null &&
          // Scoped to one agent: a pause that stood the whole workforce down
          // would satisfy every assertion above.
          adminUntouched?.runtime?.state === "active" &&
          adminUntouched.counts.enabledTriggers === 2;

        /* ── Resume ── */
        const resume = await submitTransition({ agentId: FINANCE, action: "resume", by: OWNER });
        const afterResume = await fetchRoster();
        const financeResumed = agentRow(afterResume, FINANCE);
        const resumeLanded =
          resume.kind === "applied" &&
          resume.outcome.changed &&
          resume.outcome.state === "active" &&
          financeResumed?.runtime?.state === "active" &&
          financeResumed.counts.enabledTriggers === 2 &&
          // Re-derived from the plan against the clock, not restored from the
          // disabled record — which is why it is the same instant as before.
          triggerOf(financeResumed, SWEEP)?.nextFireAt === FRIDAY_0900;

        /* ── Refusal 1: an agent the plan does not contain ── */
        const ghost = await submitTransition({ agentId: "no-such-agent", action: "resume" });
        const ghostRecord = await world.scheduler.store.getAgentState("no-such-agent");
        const ghostRefused =
          ghost.kind === "refused" &&
          ghost.status === 409 &&
          ghost.message.includes("is not in plan") &&
          // Nothing was written on the way to refusing.
          ghostRecord === null;

        /* ── Refusal 2: the plan moved past what was activated ──
           The control first: with the ordinary plan installed this exact call is
           applied, so the 409 below is about the drift and not about marketing. */
        const controlResume = await submitTransition({ agentId: MARKETING, action: "resume" });
        const driftedPlan: ApprovedPlan = {
          ...BRIGHTPATH_PLAN,
          agents: BRIGHTPATH_PLAN.agents.map((agent) =>
            agent.id === MARKETING ? { ...agent, version: agent.version + 1 } : agent,
          ),
        };
        /* The plan the owner intends moves; the deployment does not. Written to
           the store rather than swapped onto the session, because the route now
           reads it from there — see `makeWorld`. The refusal below is still the
           version guard in `resumeAgent` firing on a plan whose MARKETING agent
           is now v3 against a runtime record frozen at v2 by activation, and
           `driftedRecord.agentVersion === 2` on the line after it is what proves
           the refusal came from the drift rather than from the record being
           quietly rewritten to agree. */
        await setCurrentPlan(world, driftedPlan);
        const drifted = await submitTransition({ agentId: MARKETING, action: "resume" });
        const driftedRecord = await world.scheduler.store.getAgentState(MARKETING);
        const driftRefused =
          controlResume.kind === "applied" &&
          drifted.kind === "refused" &&
          drifted.status === 409 &&
          drifted.message.includes("Resume restarts what was proved") &&
          driftedRecord?.state === "active" &&
          driftedRecord.agentVersion === 2;

        /* ── A body the route cannot read is a 400 naming the problem ── */
        // The stored plan goes back with the session. `install` alone no longer
        // undoes the drift above, because the drift is not in the session.
        await setCurrentPlan(world, world.plan);
        install(world);
        const malformed = await agentsPOST(
          new Request(`${LINK_BASE}/api/runtime/agents`, {
            method: "POST",
            body: "{ agentId: finance }",
          }),
        );
        const malformedBody = (await malformed.json()) as { error?: unknown };
        const refusedMalformed =
          malformed.status === 400 &&
          typeof malformedBody.error === "string" &&
          malformedBody.error.includes("not JSON");

        const pass =
          startedLive &&
          pauseLanded &&
          resumeLanded &&
          ghostRefused &&
          driftRefused &&
          refusedMalformed;
        add(
          name,
          pass,
          pass
            ? `pausing ${FINANCE} through the roster's own transition switched off both its ` +
                `triggers and moved the row to "paused" with no next firing, while ${ADMIN} ` +
                `stayed active; resuming re-registered both and put the next Friday back at ` +
                `${FRIDAY_0900}. Resuming an agent the plan does not contain was refused 409 ` +
                `without writing a record, and resuming ${MARKETING} — applied a moment earlier ` +
                `— was refused 409 once the plan carried a version its activation never saw, ` +
                `leaving the stored record untouched at active/v2. A body that is not JSON is ` +
                `a 400 that says so`
            : `startedLive=${startedLive} pauseLanded=${pauseLanded} (${pause.kind}) ` +
                `resumeLanded=${resumeLanded} (${resume.kind}) ghostRefused=${ghostRefused} ` +
                `(${ghost.kind}${ghost.kind === "refused" ? `/${ghost.status}` : ""}) ` +
                `driftRefused=${driftRefused} (control=${controlResume.kind}, ` +
                `drifted=${drifted.kind}, record=${driftedRecord?.state ?? "gone"}/` +
                `v${driftedRecord?.agentVersion ?? "?"}) refusedMalformed=${refusedMalformed} ` +
                `(${malformed.status})`,
        );
      }
    }

    /* ═══ 2. THE STATE ON THE ROW IS AgentRuntimeState ═══
       Contract §4.2 makes runtime state Role C's and never part of the plan, so
       there is exactly one place it can come from. Asserted against
       `listAgentStates()` itself rather than against the word "active", and then
       against a world where the packages gate shut: an agent whose package was
       never built must not read as active, and — because `activate` writes
       nothing when a gate blocks — must not read as anything at all. */
    {
      const name =
        "M6-2 every roster row carries the AgentRuntimeState the runtime stored, and an agent with no package does not read as active";
      const live = await makeWorld("m6-states");
      const activation = await goLive(live, verdict);
      install(live);
      const roster = await fetchRoster();
      const stored = await live.scheduler.store.listAgentStates();

      const storedById = new Map(stored.map((record) => [record.agentId, record]));
      const everyRowMatches =
        activation.activated &&
        roster.activated &&
        roster.agents.length === BRIGHTPATH_PLAN.agents.length &&
        roster.agents.every((row) => {
          const record = storedById.get(row.agentId);
          return (
            record !== undefined &&
            row.runtime !== null &&
            row.runtime.state === record.state &&
            row.runtime.agentVersion === record.agentVersion &&
            row.runtime.detail === record.detail &&
            row.versionDrift === false
          );
        }) &&
        stored.every((record) => record.state === "active") &&
        roster.deployment !== null &&
        activation.activated &&
        roster.deployment.deploymentId === activation.deployment.deploymentId;

      /* ── The blocked world ──
         The constructed input: a plan whose marketing agent has moved one version
         past the package that was built for it. That is the real shape of the
         problem — a plan edited after a build — and it is the only way to reach
         the packages gate without deleting a package the Factory made. */
      const drifted: ApprovedPlan = {
        ...BRIGHTPATH_PLAN,
        agents: BRIGHTPATH_PLAN.agents.map((agent) =>
          agent.id === MARKETING ? { ...agent, version: agent.version + 1 } : agent,
        ),
      };
      const blocked = await makeWorld("m6-unbuilt", { plan: drifted });
      const refused = await goLive(blocked, verdict);
      install(blocked);
      const blockedRoster = await fetchRoster();
      const blockedStates = await blocked.scheduler.store.listAgentStates();
      const marketingRow = agentRow(blockedRoster, MARKETING);

      const packagesGateHeld =
        !refused.activated &&
        refused.blockers.length === 1 &&
        refused.blockers[0]?.agentId === MARKETING &&
        refused.blockers[0]?.href === "/app/build" &&
        // The row this check is named for: not "active", and not a state at all.
        marketingRow?.runtime === null &&
        // Nothing was written anywhere: a go-live that half-happened would be the
        // worse failure, and the roster would show it as three live agents.
        blockedStates.length === 0 &&
        blockedRoster.activated === false &&
        blockedRoster.deployment === null &&
        blockedRoster.agents.every((row) => row.runtime === null);

      add(
        name,
        everyRowMatches && packagesGateHeld,
        everyRowMatches && packagesGateHeld
          ? `all ${roster.agents.length} rows carry the state, version and sentence stored in ` +
              `their own AgentRuntimeRecord, and name deployment ` +
              `${roster.deployment?.deploymentId ?? "—"}. With ${MARKETING} moved to a version ` +
              `nothing was built for, the packages gate blocked go-live naming only that agent, ` +
              `no runtime record was written for any agent, and its row reads "never activated" ` +
              `rather than active`
          : `everyRowMatches=${everyRowMatches} (rows=${roster.agents.length}, ` +
              `stored=${stored.length}, activated=${roster.activated}) ` +
              `packagesGateHeld=${packagesGateHeld} (blockers=${refused.activated ? 0 : refused.blockers.length}, ` +
              `marketingRuntime=${canonical(marketingRow?.runtime ?? null)}, ` +
              `statesWritten=${blockedStates.length})`,
      );
    }

    /* ═══ 3. THE CALENDAR IS THREE SOURCES, NOT ONE ═══
       A trigger that has not fired, runs that have, and a decision waiting on a
       person are three different tables with three different notions of "when".
       The check asserts each one is present, is labelled with the right kind and
       the right state, points back at the runtime row it came from, and that the
       whole list is in the order the route promises.

       The projected/scheduled split is asserted separately because it is the one
       distinction on this screen that cannot be recovered from anything else: the
       first occurrence is a fact the scheduler holds, every later one is this
       route re-running a frozen cron, and rendering the second as the first would
       promise runs nothing has committed to. */
    const loop = await runLoop("m6", verdict);
    {
      const name =
        "M6-3 the calendar projects a scheduled trigger, a finished run and a pending approval as events of the right kind and state, in order";
      if (!loop.ok) {
        add(name, false, cannotProceed(loop, "calendar"));
      } else {
        install(loop.world);
        const view = await fetchCalendar(null);

        const trigger = await loop.world.scheduler.store.getTrigger(SWEEP_TRIGGER_ID);
        const scheduled = eventsFor(view, (event) => event.triggerId === SWEEP_TRIGGER_ID);
        const authoritative = scheduled[0];
        const fromTheScheduler =
          scheduled.length === 1 &&
          authoritative?.kind === "scheduled" &&
          authoritative.state === "scheduled" &&
          // The instant the scheduler is holding, not one this route invented.
          authoritative.at === trigger?.nextFireAt &&
          authoritative.runId === null &&
          authoritative.approvalId === null;

        const projected = eventsFor(view, (event) => event.state === "projected");
        const extrapolationsAreLabelled =
          projected.length > 0 &&
          projected.every(
            (event) =>
              event.kind === "scheduled" && event.triggerId !== null && event.runId === null,
          );

        const runEvents = eventsFor(view, (event) => event.kind === "run");
        const stored = new Map(
          (await loop.world.runStore.listRuns()).map((run) => [run.runId, run]),
        );
        const runsMirrorTheStore =
          runEvents.length === stored.size &&
          runEvents.every((event) => {
            const run = event.runId === null ? undefined : stored.get(event.runId);
            return (
              run !== undefined && event.state === run.status && event.at === run.startedAt
            );
          }) &&
          runEvents.some(
            (event) => event.runId === loop.sweepRun.runId && event.state === "completed",
          ) &&
          runEvents.some(
            (event) =>
              event.runId === loop.summaryRun.runId && event.state === "awaiting_approval",
          );

        const approvalEvents = eventsFor(view, (event) => event.kind === "approval");
        const decision = approvalEvents[0];
        const approvalIsAtItsDeadline =
          approvalEvents.length === 1 &&
          decision?.approvalId === loop.pending.approvalId &&
          decision.runId === loop.summaryRun.runId &&
          decision.state === "awaiting_decision" &&
          // An approval's point on a calendar is when it must be answered by.
          decision.at === loop.pending.dueAt &&
          decision.risk === loop.pending.risk;

        // The whole list, and the specific ordering M6 is about: the run happened,
        // then it paused something, then that decision falls due.
        const sweepEvent = runEvents.find((event) => event.runId === loop.sweepRun.runId);
        const summaryEvent = runEvents.find((event) => event.runId === loop.summaryRun.runId);
        const ordered =
          isOrdered(view) &&
          sweepEvent !== undefined &&
          summaryEvent !== undefined &&
          decision !== undefined &&
          authoritative !== undefined &&
          Date.parse(sweepEvent.at) < Date.parse(summaryEvent.at) &&
          Date.parse(summaryEvent.at) < Date.parse(decision.at) &&
          Date.parse(decision.at) < Date.parse(authoritative.at);

        // A month with nothing on it has several causes and the screen must be
        // able to tell them apart; these are the counts it does that with.
        const countsAreReal =
          view.summary.runsInRange === stored.size &&
          view.summary.totalRuns === stored.size &&
          view.summary.approvalsInRange === 1 &&
          view.summary.pendingApprovals === 1 &&
          view.summary.scheduleTriggers === 3 &&
          view.summary.signalTriggers === 5 &&
          view.summary.registeredTriggers === 8 &&
          view.summary.disabledTriggers === 0 &&
          view.unplaceable.length === 0 &&
          view.truncated === false;

        const pass =
          fromTheScheduler &&
          extrapolationsAreLabelled &&
          runsMirrorTheStore &&
          approvalIsAtItsDeadline &&
          ordered &&
          countsAreReal;
        add(
          name,
          pass,
          pass
            ? `the month holds ${view.events.length} events from three tables: ` +
                `${SWEEP}'s next firing at the exact instant the scheduler stores ` +
                `(${authoritative?.at}), ${projected.length} later occurrences labelled ` +
                `"projected" rather than scheduled, ${runEvents.length} runs whose states are ` +
                `their own RunStatus, and one approval placed at its dueAt ` +
                `(${decision?.at}). They come back in chronological order — the sweep ran, the ` +
                `chained summary paused, its decision falls due, the next Friday follows`
            : `fromTheScheduler=${fromTheScheduler} (matched ${scheduled.length}) ` +
                `projectedLabelled=${extrapolationsAreLabelled} (${projected.length}) ` +
                `runsMirrorTheStore=${runsMirrorTheStore} (${runEvents.length} of ${stored.size}) ` +
                `approvalAtDeadline=${approvalIsAtItsDeadline} (${approvalEvents.length}) ` +
                `ordered=${ordered} countsAreReal=${canonical(view.summary)}`,
        );
      }
    }

    /* ═══ 4. THE DEEP LINK RESOLVES IN THE M5 INBOX ═══
       M5 shipped `?focus=<id>` and recorded that nothing linked to it yet. This is
       the link, and the check is not that the href looks plausible: the id is
       pulled out of the URL and handed to `fetchApprovalRecord`, which is the read
       the review drawer makes when it opens, and the wrong id is handed to it as a
       control so a lookup that resolved anything would fail.

       `live=1` is asserted through `resolveApprovalsLane` rather than by matching
       the string, because the lane rule is the thing that decides which screen the
       owner lands on. Without it the link opens the SCRIPTED inbox, which is
       convincing and does not contain this approval. */
    {
      const name =
        "M6-4 a calendar approval links to an id the M5 inbox resolves, on the live lane";
      if (!loop.ok) {
        add(name, false, cannotProceed(loop, "deep link"));
      } else {
        install(loop.world);
        const view = await fetchCalendar(null);
        const event = view.events.find((candidate) => candidate.kind === "approval");
        const href = event?.href ?? null;

        if (href === null) {
          add(name, false, `the approval event carries no href, so nothing links anywhere`);
        } else {
          const url = new URL(href, LINK_BASE);
          // "focus" is the parameter `LiveApprovalsScreen` reads
          // (`searchParams.get("focus")`). It is not exported, so the name is
          // restated here; everything downstream of it is the screen's own code.
          const focus = url.searchParams.get("focus");
          // Environment inputs deliberately undefined: the check is about the
          // URL alone, and `live=1` must select the live lane regardless of
          // what any deployment's env would default to.
          const lane = resolveApprovalsLane({
            live: url.searchParams.get("live") ?? undefined,
            env: undefined,
            operateEnv: undefined,
            runtimeModeEnv: undefined,
          });

          const pointsAtTheInbox =
            url.pathname === "/app/workspace/approvals" &&
            focus === loop.pending.approvalId &&
            lane.lane === "live";

          let resolved = false;
          let resolvedRunId: string | null = null;
          // Caught rather than allowed to propagate, because a link to an id
          // nothing holds is the FAILURE this check exists to catch — and the
          // drawer's reader reports that by throwing. Letting it escape would
          // turn a red check into a dead harness.
          let resolveError: string | null = null;
          if (focus !== null) {
            try {
              const record = await fetchApprovalRecord(focus);
              resolved =
                record.approval.approvalId === focus &&
                record.decision === null &&
                record.deadline.state === "due";
              resolvedRunId = record.approval.runId;
            } catch (error) {
              resolveError = messageOf(error);
            }
          }

          // The control: the same read with an id nothing holds must fail, or
          // "it resolved" means nothing.
          let missingRefused = false;
          let missingMessage = "a fabricated id resolved to an approval";
          try {
            await fetchApprovalRecord(`${loop.pending.approvalId}-not-a-real-id`);
          } catch (error) {
            missingRefused = error instanceof ApprovalsApiError && error.status === 404;
            missingMessage = messageOf(error);
          }

          // A paused run's only useful destination is the decision holding it up,
          // so the run event carries the same link.
          const pausedRunEvent = view.events.find(
            (candidate) => candidate.runId === loop.summaryRun.runId && candidate.kind === "run",
          );
          const pausedRunLinksToo = pausedRunEvent?.href === href;

          const pass =
            pointsAtTheInbox &&
            resolved &&
            resolvedRunId === loop.summaryRun.runId &&
            missingRefused &&
            pausedRunLinksToo;
          add(
            name,
            pass,
            pass
              ? `the approval event links to ${url.pathname} with focus=${focus}, a lane the ` +
                  `shared resolver reads as "live", and that id comes back through the review ` +
                  `drawer's own read as a pending decision on run ${resolvedRunId}. The same ` +
                  `read with a fabricated id is a 404, and the paused run it belongs to carries ` +
                  `the identical link`
              : `pointsAtTheInbox=${pointsAtTheInbox} (path=${url.pathname}, focus=${focus}, ` +
                  `lane=${lane.lane}) resolved=${resolved} (run=${resolvedRunId}` +
                  `${resolveError === null ? "" : `, the inbox refused it: ${resolveError}`}) ` +
                  `missingRefused=${missingRefused} ("${missingMessage}") ` +
                  `pausedRunLinksToo=${pausedRunLinksToo}`,
          );
        }
      }
    }

    /* ═══ 5. OVERDUE IS A FUNCTION OF THE INJECTED CLOCK ═══
       The same approval, read at three instants, with nothing else touched. Its
       `at` is fixed — a deadline does not move — and only its state may change,
       which is what separates a derivation from a stored flag.

       `view.now` is asserted every time because it is the field that catches the
       real regression here: a route that reached for a wall clock would answer
       with today's date, project a different month, and drop this approval out of
       range entirely rather than mislabelling it. */
    {
      const name =
        "M6-5 an approval past its escalation deadline reads overdue on the calendar and a fresh one does not, driven by the injected clock";
      const timed = await runLoop("m6-overdue", verdict);
      if (!timed.ok) {
        add(name, false, cannotProceed(timed, "deadline"));
      } else {
        install(timed.world);
        const dueMs = Date.parse(timed.pending.dueAt);
        const nowMs = timed.world.clock.now().getTime();

        // A minute inside the deadline.
        timed.world.clock.advance(dueMs - nowMs - MS_PER_MINUTE);
        const inside = await fetchCalendar(null);
        // Exactly at it. The boundary is inclusive; M5-6 owns that rule and this
        // check reads it through the screen rather than restating it.
        timed.world.clock.advance(MS_PER_MINUTE);
        const at = await fetchCalendar(null);
        // And well past.
        timed.world.clock.advance(90 * MS_PER_MINUTE);
        const past = await fetchCalendar(null);

        const find = (view: CalendarView) =>
          view.events.find(
            (event) =>
              event.kind === "approval" && event.approvalId === timed.pending.approvalId,
          );
        const a = find(inside);
        const b = find(at);
        const c = find(past);

        const freshIsNotOverdue = a?.state === "awaiting_decision";
        const boundaryIsOverdue = b?.state === "overdue";
        const pastIsOverdue =
          c?.state === "overdue" && c.detail.includes("Overdue by 1h 30m.");

        // Only the state moved.
        const deadlineDidNotMove =
          a !== undefined &&
          a.at === timed.pending.dueAt &&
          b?.at === a.at &&
          c?.at === a.at &&
          b.id === a.id &&
          c.id === a.id;

        const readTheInjectedClock =
          inside.now === new Date(dueMs - MS_PER_MINUTE).toISOString() &&
          at.now === timed.pending.dueAt &&
          past.now === new Date(dueMs + 90 * MS_PER_MINUTE).toISOString();

        const pass =
          freshIsNotOverdue &&
          boundaryIsOverdue &&
          pastIsOverdue &&
          deadlineDidNotMove &&
          readTheInjectedClock;
        add(
          name,
          pass,
          pass
            ? `approval ${timed.pending.approvalId} falls due at ${timed.pending.dueAt}; a minute ` +
                `before it the calendar shows it awaiting a decision, at it and ninety minutes ` +
                `later it shows overdue ("${c?.detail ?? ""}"). The event's id and instant are ` +
                `identical across all three reads, and each read reports the injected instant as ` +
                `its own "now"`
            : `fresh=${a?.state ?? "missing"} boundary=${b?.state ?? "missing"} ` +
                `past=${c?.state ?? "missing"} deadlineDidNotMove=${deadlineDidNotMove} ` +
                `readTheInjectedClock=${readTheInjectedClock} (${inside.now} / ${at.now} / ${past.now})`,
        );
      }
    }

    /* ═══ 6. THE CONNECTIONS SCREEN IS THE PLAN'S GRANTS, AND THE GATE'S RULE ═══
       Two halves. The list and its attribution come from `ToolGrant[]`, walked in
       this file from the plan rather than read back from the route. The blocking
       comes from `activationChecklist`, which the route borrows rather than
       restates — so the check drives one REQUIRED and one OPTIONAL connection down
       at the same time and requires the screen to tell them apart. A screen that
       blocked on everything missing, or on nothing missing, fails one half each. */
    {
      const name =
        "M6-6 the integrations screen lists exactly the plan's connections, attributes them, and blocks on a missing required one but not a missing optional one";
      const planned = integrationsThePlanReferences(BRIGHTPATH_PLAN);

      const connected = await makeWorld("m6-connected");
      await goLive(connected, verdict);
      install(connected);
      const all = await fetchConnections();

      const listedExactly =
        canonical(all.integrations.map((row) => row.integrationId)) ===
        canonical(planned.map((row) => row.integrationId));
      const attributed = attributionMatches(all, planned);
      const nothingBlocked =
        all.gate?.satisfied === true &&
        all.integrations.every((row) => row.blockers.length === 0) &&
        all.unattributedBlockers.length === 0 &&
        all.grantsWithoutIntegration.length === 0 &&
        all.integrations.every((row) => row.status === "connected");

      // Expiry and re-auth are what M6 asked for and what this build does not
      // have. Asserting they are declared missing is how the screen stays honest
      // rather than quietly looking complete.
      const saysWhatItCannotKnow = all.unavailable.some(
        (field) => field.field === "tokenExpiry" && field.reason.trim() !== "",
      );

      /* ── One required and one optional connection switched off ── */
      const down = await makeWorld("m6-disconnected", {
        disconnected: [REQUIRED_BUT_DOWN, OPTIONAL_BUT_DOWN],
      });
      const refusedGoLive = await goLive(down, verdict);
      install(down);
      const partial = await fetchConnections();

      const requiredRow = partial.integrations.find(
        (row) => row.integrationId === REQUIRED_BUT_DOWN,
      );
      const optionalRow = partial.integrations.find(
        (row) => row.integrationId === OPTIONAL_BUT_DOWN,
      );

      const requiredBlocks =
        requiredRow?.requiredByPlan === true &&
        requiredRow.status === "required" &&
        requiredRow.blockers.length === 1 &&
        requiredRow.blockers[0]?.agentId === FINANCE &&
        requiredRow.blockers[0]?.message.includes(REQUIRED_BUT_DOWN) &&
        partial.gate?.satisfied === false &&
        // The blocking is not decoration: go-live actually refused.
        !refusedGoLive.activated;

      const optionalDoesNot =
        optionalRow?.requiredByPlan === false &&
        // Reported as not connected, exactly as it is…
        optionalRow.status === "required" &&
        // …and it stops nothing.
        optionalRow.blockers.length === 0 &&
        partial.unattributedBlockers.length === 0 &&
        partial.integrations
          .filter((row) => row.integrationId !== REQUIRED_BUT_DOWN)
          .every((row) => row.blockers.length === 0);

      const pass =
        listedExactly &&
        attributed &&
        nothingBlocked &&
        saysWhatItCannotKnow &&
        requiredBlocks &&
        optionalDoesNot;
      add(
        name,
        pass,
        pass
          ? `the screen lists the ${planned.length} integrations the plan's tool grants ` +
              `reference, in first-reference order, each attributed to the agents that hold a ` +
              `grant on it and carrying exactly the operations those grants allow, and it says ` +
              `out loud that token expiry is a field this build does not have. With ` +
              `${REQUIRED_BUT_DOWN} and ${OPTIONAL_BUT_DOWN} both disconnected, only the ` +
              `required one carries a blocker — attributed to ${FINANCE}, and matched by a ` +
              `go-live that actually refused — while the optional one reports itself ` +
              `unconnected and stops nothing`
          : `listedExactly=${listedExactly} (${canonical(all.integrations.map((r) => r.integrationId))}) ` +
              `attributed=${attributed} nothingBlocked=${nothingBlocked} ` +
              `saysWhatItCannotKnow=${saysWhatItCannotKnow} requiredBlocks=${requiredBlocks} ` +
              `(status=${requiredRow?.status ?? "missing"}, blockers=${requiredRow?.blockers.length ?? -1}, ` +
              `gate=${partial.gate?.satisfied ?? "missing"}, activated=${refusedGoLive.activated}) ` +
              `optionalDoesNot=${optionalDoesNot} (status=${optionalRow?.status ?? "missing"}, ` +
              `blockers=${optionalRow?.blockers.length ?? -1})`,
      );
    }

    /* ═══ 7. A FRIDAY IN SINGAPORE IS A FRIDAY ON THE CALENDAR ═══
       `0 9 * * 5` in Asia/Singapore is a statement about Sarah's Friday morning.
       Three different mistakes turn it into something else and each shows up in a
       different field: evaluating the cron in UTC moves the instant (09:00Z, which
       is 17:00 local), formatting a correct instant in UTC moves the label (01:00),
       and bucketing days in UTC moves the day itself. The first two are pinned by
       the wall-clock label and the independently computed weekday; the third needs
       an instant where the two calendars disagree, and on this plan there is
       exactly one kind — after 16:00Z, when Singapore has already turned over. */
    {
      const name =
        "M6-7 a cron that fires Friday 09:00 Asia/Singapore lands on Friday at 09:00, and the calendar's day is the local one";
      const world = await makeWorld("m6-zone");
      const activation = await goLive(world, verdict);
      install(world);

      if (!activation.activated) {
        add(name, false, `activation was blocked, so no trigger was registered to project`);
      } else {
        const view = await fetchCalendar(null);
        const fridays = eventsFor(view, (event) => event.triggerId === SWEEP_TRIGGER_ID);
        const first = fridays[0];
        const second = fridays[1];

        const bothAreFridayMornings =
          fridays.length === 2 &&
          first?.state === "scheduled" &&
          second?.state === "projected" &&
          first.at === FRIDAY_0900 &&
          second.at === NEXT_FRIDAY_0900 &&
          first.dayKey === "2026-07-24" &&
          second.dayKey === "2026-07-31" &&
          weekdayOf(first.dayKey) === FRIDAY &&
          weekdayOf(second.dayKey) === FRIDAY &&
          // The discriminator. In UTC these instants read 01:00, and a cron read
          // in UTC would have produced 17:00 local instead.
          first.timeLabel === "09:00" &&
          second.timeLabel === "09:00" &&
          first.scheduleTimezone === "Asia/Singapore";

        // The zone is the plan's, and it is the same one the Workspace groups by.
        const chosen = businessZone(BRIGHTPATH_PLAN);
        const zoneComesFromThePlan =
          view.timezone.id === chosen.timezone &&
          view.timezone.requested === chosen.timezone &&
          view.timezone.source === chosen.source &&
          view.timezone.ok &&
          view.timezone.otherScheduleZones.length === 0;

        /* ── The one instant where the two calendars disagree ── */
        const nowMs = world.clock.now().getTime();
        world.clock.advance(Date.parse(LOCAL_DAY_HAS_ROLLED_OVER) - nowMs);
        const rolled = await fetchCalendar(null);
        const localDayWins =
          rolled.now === LOCAL_DAY_HAS_ROLLED_OVER &&
          // 17:00Z on the 24th is 01:00 on the 25th in Singapore.
          rolled.todayKey === "2026-07-25";

        // And a range asked for in local days is bucketed in local days: Friday
        // alone holds the sweep and not the 25th's monthly campaign trigger.
        const friday = await fetchCalendar({ from: "2026-07-24", to: "2026-07-24" });
        const rangeIsLocal =
          friday.range.days === 1 &&
          friday.events.length === 1 &&
          friday.events[0]?.triggerId === SWEEP_TRIGGER_ID &&
          friday.events[0]?.dayKey === "2026-07-24";

        const pass = bothAreFridayMornings && zoneComesFromThePlan && localDayWins && rangeIsLocal;
        add(
          name,
          pass,
          pass
            ? `"0 9 * * 5" in Asia/Singapore lands on 2026-07-24 and 2026-07-31 — both Fridays, ` +
                `both labelled 09:00, one held by the scheduler and one projected — in a grid ` +
                `whose zone comes from the plan's own quiet hours (${chosen.source}). At ` +
                `${LOCAL_DAY_HAS_ROLLED_OVER}, still the 24th in UTC, the calendar's today is ` +
                `2026-07-25; and asking for 2026-07-24 alone returns the Friday sweep and ` +
                `nothing from the following day`
            : `bothAreFridayMornings=${bothAreFridayMornings} (${canonical(
                fridays.map((event) => [event.state, event.at, event.dayKey, event.timeLabel]),
              )}) zoneComesFromThePlan=${zoneComesFromThePlan} (${canonical(view.timezone)}) ` +
                `localDayWins=${localDayWins} rangeIsLocal=${rangeIsLocal}`,
        );
      }
    }

    /* ═══ 8. Determinism, which M3 earned and M6 must not spend ═══
       All four screen reads, from two worlds built under identical seeds,
       compared as bytes. The failure this guards against is a `Date.now()` or a
       `crypto.randomUUID()` finding its way onto one of the three new
       projections; those never show up in a field anybody thought to assert, and
       they would make `npm run verify` differ between two runs of an unchanged
       repository. */
    {
      const name = "M6-8 the whole Operate surface reads byte-identically on a rerun";
      const again = await runLoop("m6", verdict);
      if (!loop.ok || !again.ok) {
        add(name, false, cannotProceed(!loop.ok ? loop : (again as LoopFailed), "rerun"));
      } else {
        const identical = again.fingerprint === loop.fingerprint;
        add(
          name,
          identical,
          identical
            ? `two independent runtimes under the same seed produced identical roster, calendar, ` +
                `connections and approval reads (${loop.fingerprint.length} bytes)`
            : `the two surfaces diverged: ${loop.fingerprint.length} vs ${again.fingerprint.length} ` +
                `bytes. Something behind the Calendar, Agents or Integrations screen is reading a ` +
                `wall clock or a random source instead of the session's injected Clock and newId.`,
        );
      }
    }

    add(
      COMPLETED,
      true,
      `all eight checks above ran to the end: every roster, calendar, connections and ` +
        `approval read they make was answered by its route and accepted by the reader the ` +
        `screen itself uses`,
    );
  } catch (error) {
    /*
     * Every read above crosses a route boundary, and the screen readers refuse
     * rather than shrug — a 400, a 404 or a field they cannot parse arrives as an
     * exception. Without this, the first such failure would end the process on a
     * stack trace, which says nothing about which surface broke and takes the
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
      `the run stopped at check ${checks.length + 1} of 8: ${messageOf(error)}. Every check ` +
        `after it was skipped, so this result is a floor rather than a verdict.`,
    );
  } finally {
    globalThis.fetch = originalFetch;
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
      ? `M6 EXIT CRITERIA MET — ${results.length}/${results.length} checks passed.`
      : `M6 NOT MET — ${failed} of ${results.length} checks failed.`,
  );
  return lines.join("\n");
}
