/**
 * lib/runtime/session.ts — one composed runtime, so callers wire nothing.
 *
 * The executor deliberately takes every dependency by injection (clock, ids,
 * store, tools, reasoner) because sandbox determinism demands it. That is right
 * for the library and tedious for a route handler, so this module assembles the
 * standard production-shaped wiring in one place.
 *
 * TWO SWITCHES ARE READ HERE AND NOWHERE ELSE, which is the property that makes
 * this file worth having: what the runtime talks to, and where it keeps what it
 * learns.
 *
 * ORIANT_RUNTIME_MODE selects the reasoner:
 *   unset / anything but "live" → FixtureReasoner, no network, deterministic
 *   "live"                      → AiAndReasoner, requires the AI& credentials
 * The default fails closed: an unconfigured deployment cannot accidentally
 * start spending on a provider.
 *
 * ORIANT_RUNTIME_STORAGE selects the stores:
 *   unset / "file" → the durable, file-backed stores under data/runtime/
 *   "memory"       → the in-memory stores, discarded with the process
 *   anything else  → THROWS at session construction
 * Here the default fails closed in the other direction, and the asymmetry is
 * deliberate. For the reasoner the dangerous default is "does something"; for
 * storage the dangerous default is "forgets something", because a paused run and
 * its pending approval must outlive the process or the approval interrupt is
 * defeated (RUNTIME_SETUP.md §3, ROLE_C_PLAN M0). Durable is therefore what you
 * get for free.
 *
 * An unrecognised value throws instead of quietly selecting the default, which
 * the mode switch above does not do. The reason is the shape of the mistake this
 * repo has already made once: an unrecognised `operatingMode` fell through into
 * the auto-act path. `ORIANT_RUNTIME_STORAGE=postgres` is a thing a developer
 * will type the day the migration path in STORAGE.md is taken up, and silently
 * treating it as "file" would give them a green server that is not using the
 * database they just configured.
 *
 * TESTS AND THE SANDBOX DO NOT COME THROUGH HERE. `lib/runtime/verify/*` and
 * `lib/runtime/sandbox/runner.ts` construct `InMemoryRunStore`, `FixedClock` and
 * a seeded `createIdFactory()` explicitly, and they must keep doing so:
 * determinism is an M3 exit criterion, and a store that touches a disk is
 * neither deterministic nor fast. This module is the SERVER's composition root,
 * reached only through `getRuntimeSession()`.
 */

import path from "node:path";
import type { ApprovedPlan } from "../plan/types";
import { BRIGHTPATH_PLAN } from "../plan/fixtures/brightpath";
import { InMemoryBuildStore } from "./build/store";
import { LocalPackageGenerator } from "./build/runner";
import type { BuildDeps, BuildStore } from "./build/types";
import type { ExecutorOptions } from "./executor";
import { AiAndReasoner, FixtureReasoner } from "./llm";
import { createFileStores } from "./persist";
import { createPostgresStores } from "./persist/pg";
import { InMemorySchedulerStore } from "./schedule/store";
import type { SchedulerDeps, SchedulerStore } from "./schedule/types";
import { InMemoryRunStore, SystemClock, createIdFactory } from "./store";
import { StubIntegrationProvider } from "./tools";
import { createComposioIntegrationProvider } from "./tools/composio-sdk";
import { currentPlan, resolvePlanState, type PlanState } from "./current-plan";
import { resolveActivePlan } from "./active-plan";
import type { IntegrationProvider, Reasoner, RunStore } from "./types";

export type RuntimeMode = "fixture" | "live";

export function runtimeMode(): RuntimeMode {
  return process.env.ORIANT_RUNTIME_MODE === "live" ? "live" : "fixture";
}

/**
 * Whether the runtime executes tools for real. ITS OWN SWITCH, ASKED FOR BY NAME.
 *
 *   unset / anything but "composio" → StubIntegrationProvider
 *   "composio"                      → real Composio clients
 *
 * DELIBERATELY NOT COUPLED TO `ORIANT_RUNTIME_MODE`, and the first attempt got
 * this wrong. `.env.example` has always promised that live mode means a real
 * model AND real tool clients, so the obvious repair was to make the promise
 * true — live implies live hands. That is the wrong repair. Somebody who set
 * `ORIANT_RUNTIME_MODE=live` was asking for a better model; they were not asking
 * to send email to customers, and a deployment already running that way would
 * have started doing so on the next deploy with no line in any diff naming the
 * change. Sending is not a side effect of a reasoning flag.
 *
 * So the documentation was wrong rather than the code, and it now says so. The
 * default here is the safe one whatever the mode, and reaching real customers
 * takes a variable whose only purpose is to say that is what you want.
 *
 * `mode` is still taken as a parameter: callers read it alongside this, and a
 * signature that hides the pairing would invite the coupling straight back.
 */
export function liveTools(_mode: RuntimeMode): boolean {
  return (process.env.ORIANT_RUNTIME_TOOLS ?? "").trim() === "composio";
}

/* ═══════════════════════════ Storage ═══════════════════════════ */

export type RuntimeStorage = "file" | "memory" | "postgres";

/**
 * Durable unless explicitly told otherwise, and loud about anything it does not
 * recognise. See the header for why this switch throws where `runtimeMode()`
 * shrugs.
 *
 * `postgres` is the production path (docs/STORAGE.md §7). It stays OPT-IN
 * rather than becoming the default even though it is the stronger store,
 * because `RUNTIME_SETUP.md` §1 promises a clean clone runs on
 * `npm install && npm run dev` — and a default that needs a connection string
 * breaks exactly that promise.
 */
export function runtimeStorage(): RuntimeStorage {
  const raw = (process.env.ORIANT_RUNTIME_STORAGE ?? "").trim();
  if (raw === "" || raw === "file") return "file";
  if (raw === "memory") return "memory";
  if (raw === "postgres" || raw === "supabase") return "postgres";
  throw new Error(
    `ORIANT_RUNTIME_STORAGE is "${raw}", which this build does not implement. ` +
      `Use "file" (the default — durable, under data/runtime/), "memory" ` +
      `(discarded on restart), or "postgres" (Supabase; requires DATABASE_URL).`,
  );
}

/**
 * The Supabase connection string, read only when storage is `postgres`.
 *
 * Validation of its SHAPE lives in persist/pg/client.ts, which is where the
 * error messages can be specific about pooler-versus-direct and about the
 * project URL being pasted here by mistake. This function only insists that
 * something is present, so the failure for "storage=postgres, no URL" names the
 * two variables involved rather than a parse error.
 */
export function runtimeDatabaseUrl(): string {
  const raw = (process.env.DATABASE_URL ?? "").trim();
  if (raw === "") {
    throw new Error(
      "ORIANT_RUNTIME_STORAGE=postgres requires DATABASE_URL. Set it to the " +
        "Supabase Transaction pooler URI (Dashboard → Connect → Transaction " +
        "pooler), or unset ORIANT_RUNTIME_STORAGE to use the default file store.",
    );
  }
  return raw;
}

/**
 * Where the file-backed stores live. Absolute, because two processes started
 * from different directories must not each get their own copy of every run.
 *
 * `data/` is already gitignored and is where `lib/server/store.ts` keeps the
 * legacy demo lane's `db.json`, so the runtime's tables sit beside it in their
 * own subdirectory rather than sharing a file with it. The two lanes share a
 * parent directory and nothing else.
 */
export function runtimeDataDir(): string {
  const configured = (process.env.ORIANT_RUNTIME_DATA_DIR ?? "").trim();
  if (configured !== "") return path.resolve(process.cwd(), configured);
  return path.join(process.cwd(), "data", "runtime");
}

/* ═══════════════════════════ Session ═══════════════════════════ */

export interface RuntimeSession {
  mode: RuntimeMode;
  /**
   * Whether `tools` can reach a real customer.
   *
   * SEPARATE FROM `mode`, and every safety guard must ask THIS one. `mode` is
   * about the reasoner; since `ORIANT_RUNTIME_TOOLS` was split out, a session
   * can report `mode: "fixture"` while holding a live Composio client. Any
   * check written as `mode !== "fixture"` to mean "this could affect the real
   * world" is now wrong — /api/runtime/scheduler's clock override was exactly
   * that, and it would have let a caller move the clock past the owner's quiet
   * hours and send for real.
   */
  toolsLive: boolean;
  storage: RuntimeStorage;
  /** Absolute directory backing the stores; null when storage is "memory". */
  dataDir: string | null;
  /**
   * THE CONSTRUCTION-TIME SEED, AND ALMOST CERTAINLY NOT WHAT YOU WANT.
   *
   * This is the BrightPath fixture, always. It exists because a session is built
   * synchronously and a stored plan can only be read with an `await`, so
   * something has to fill `executor.globalPolicy` at construction.
   *
   * It is NOT the workforce the owner asked for. Anything a person reads —
   * a roster, a checklist, a calendar, a notification — must come from
   * `currentPlan()`, which returns what was actually ingested. This field was
   * called `plan` until routes started showing it to people as though it were
   * theirs; the rename is deliberate, so that every use has to be looked at.
   */
  seedPlan: ApprovedPlan;
  /**
   * The plan the owner currently intends: the newest one ingested from Role B,
   * or the fixture with a stated reason when nothing has been ingested yet.
   */
  currentPlan(): Promise<ApprovedPlan>;
  /** Current plan, running plan, and the per-agent drift between them. */
  planState(): Promise<PlanState>;
  /**
   * The plan that is actually DEPLOYED, or null when nothing has gone live.
   *
   * WHAT THE WORKER MUST RUN, and the distinction is a safety boundary rather
   * than a nicety. `currentPlan()` is what the owner INTENDS, and a plan becomes
   * current the moment it validates — before it is built, before the sandbox has
   * proved anything, before any gate has been passed. A worker resolving its
   * schedule from `currentPlan()` will therefore execute a revision that failed
   * `prove` and was never activated: the pass stops, nothing is deployed, and
   * the live schedule quietly starts running the unproved version anyway.
   *
   * Null is a real answer and callers must honour it. Nothing deployed means
   * nothing to run — inventing a fallback here would restore the exact bug.
   */
  deployedPlan(): Promise<ApprovedPlan | null>;
  /**
   * Executor dependencies carrying THAT plan's global policy.
   *
   * `globalPolicy` is org-wide DENIES and the quiet window, so running an agent
   * with another plan's copy is a safety bug, not an inaccuracy: a capability
   * the owner forbade would not be forbidden. Any caller that actually executes
   * must build its deps from the plan it is executing, which is what this is
   * for. `executor` below is the seeded one and must not be used to run work.
   */
  executorFor(plan: ApprovedPlan): ExecutorOptions;
  runStore: RunStore;
  buildStore: BuildStore;
  schedulerStore: SchedulerStore;
  tools: IntegrationProvider;
  reasoner: Reasoner;
  executor: ExecutorOptions;
  build: BuildDeps;
  scheduler: SchedulerDeps;
  /**
   * Clears runs, approvals, packages, triggers, queued jobs and deployments.
   * Development only — under "file" storage this deletes state that has
   * deliberately outlived the process.
   */
  reset(): Promise<void>;
}

interface SessionGlobal {
  __oriantRuntime?: RuntimeSession;
}

interface SessionStores {
  dataDir: string | null;
  runStore: RunStore;
  buildStore: BuildStore;
  schedulerStore: SchedulerStore;
  reset(): Promise<void>;
}

/**
 * The one branch. Both arms produce the same three interfaces, so nothing
 * downstream of this function can tell which was chosen — that is the whole
 * point of `RunStore`, `BuildStore` and `SchedulerStore` being as narrow as
 * they are.
 */
function createStores(storage: RuntimeStorage): SessionStores {
  if (storage === "memory") {
    const runStore = new InMemoryRunStore();
    const buildStore = new InMemoryBuildStore();
    const schedulerStore = new InMemorySchedulerStore();
    return {
      dataDir: null,
      runStore,
      buildStore,
      schedulerStore,
      async reset() {
        runStore.reset();
        buildStore.reset();
        schedulerStore.reset();
      },
    };
  }

  if (storage === "postgres") {
    // Constructing the stores opens no connection and runs no query: the schema
    // migration starts here and every store method awaits it, so this stays
    // synchronous and `getRuntimeSession()` keeps its shape.
    const stores = createPostgresStores(runtimeDatabaseUrl());
    return {
      // Nothing on disk to point at; the runtime's state lives in Supabase.
      dataDir: null,
      runStore: stores.runStore,
      buildStore: stores.buildStore,
      schedulerStore: stores.schedulerStore,
      reset: () => stores.reset(),
    };
  }

  const stores = createFileStores(runtimeDataDir());
  return {
    dataDir: stores.root,
    runStore: stores.runStore,
    buildStore: stores.buildStore,
    schedulerStore: stores.schedulerStore,
    reset: () => stores.reset(),
  };
}

function createSession(): RuntimeSession {
  const mode = runtimeMode();
  const storage = runtimeStorage();
  const stores = createStores(storage);

  /*
   * THE HANDS FOLLOW THE BRAIN, and until now they did not.
   *
   * `.env.example` has always promised that live mode means "real LLM for
   * `reason` steps AND real tool clients for `fetch`/`act` steps". Only the
   * first half was true: this line mounted the stub unconditionally, so a
   * deployment configured for live ran a real model against simulated hands and
   * reported success for sends that never happened. That is the worst failure
   * available here — worse than refusing — because nothing downstream can tell.
   *
   * `createComposioIntegrationProvider()` throws `ComposioToolsConfigError` when
   * COMPOSIO_API_KEY or ORIANT_ORGANIZATION_ID is missing, exactly as
   * `AiAndReasoner` throws below. Loud at wiring, never a silent stub.
   *
   * ORIANT_RUNTIME_TOOLS is its own switch and defaults to the stub whatever
   * the mode — see `liveTools`. Reaching a real customer takes a variable that
   * says so and nothing else does.
   */
  const toolsLive = liveTools(mode);
  const tools: IntegrationProvider = toolsLive
    ? createComposioIntegrationProvider()
    : new StubIntegrationProvider();
  const clock = new SystemClock();
  const newId = createIdFactory();

  // In live mode the AiAndReasoner constructor throws when credentials are
  // missing. Surfacing that at session construction is deliberate: loud at
  // wiring beats silent at the first reason step.
  const reasoner: Reasoner =
    mode === "live" ? new AiAndReasoner() : new FixtureReasoner();

  const seedPlan = BRIGHTPATH_PLAN;

  // One factory, so the seeded `executor` below and every per-plan set built by
  // `executorFor` cannot drift apart in anything except the policy that is the
  // whole point of the distinction.
  const executorWith = (plan: ApprovedPlan): ExecutorOptions => ({
    store: stores.runStore,
    tools,
    reasoner,
    clock,
    newId,
    globalPolicy: plan.globalPolicy,
  });

  return {
    mode,
    toolsLive,
    storage,
    dataDir: stores.dataDir,
    seedPlan,
    currentPlan: () => currentPlan(stores.schedulerStore),
    planState: () => resolvePlanState(stores.schedulerStore),
    deployedPlan: async () => {
      const active = await resolveActivePlan(stores.schedulerStore);
      // Only a real deployment counts. `resolveActivePlan` also answers with a
      // fixture stand-in so screens have something to render; treating that as
      // deployed would have the worker run demo agents against live tools.
      return active.source === "deployment" ? active.plan : null;
    },
    executorFor: executorWith,
    runStore: stores.runStore,
    buildStore: stores.buildStore,
    schedulerStore: stores.schedulerStore,
    tools,
    reasoner,
    executor: executorWith(seedPlan),
    build: {
      store: stores.buildStore,
      generator: new LocalPackageGenerator(),
      clock,
      newId,
    },
    scheduler: {
      store: stores.schedulerStore,
      clock,
      newId,
    },
    reset: () => stores.reset(),
  };
}

/**
 * The process-wide session. Cached on globalThis so a dev-server reload does not
 * discard in-flight work.
 *
 * Under "file" storage the cache is a performance affordance rather than the
 * thing that keeps state alive — the files are the state, and a reload that
 * dropped this cache would lose nothing. Under "memory" it is load-bearing and
 * everything is still gone at the next restart.
 */
export function getRuntimeSession(): RuntimeSession {
  const g = globalThis as unknown as SessionGlobal;
  if (!g.__oriantRuntime) g.__oriantRuntime = createSession();
  return g.__oriantRuntime;
}

/** Discards the cached session; the next call rebuilds it from current env. */
export function resetRuntimeSession(): void {
  const g = globalThis as unknown as SessionGlobal;
  g.__oriantRuntime = undefined;
}
