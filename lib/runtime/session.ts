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
import { InMemorySchedulerStore } from "./schedule/store";
import type { SchedulerDeps, SchedulerStore } from "./schedule/types";
import { InMemoryRunStore, SystemClock, createIdFactory } from "./store";
import { StubIntegrationProvider } from "./tools";
import type { IntegrationProvider, Reasoner, RunStore } from "./types";

export type RuntimeMode = "fixture" | "live";

export function runtimeMode(): RuntimeMode {
  return process.env.ORIANT_RUNTIME_MODE === "live" ? "live" : "fixture";
}

/* ═══════════════════════════ Storage ═══════════════════════════ */

export type RuntimeStorage = "file" | "memory";

/**
 * Durable unless explicitly told otherwise, and loud about anything it does not
 * recognise. See the header for why this switch throws where `runtimeMode()`
 * shrugs.
 */
export function runtimeStorage(): RuntimeStorage {
  const raw = (process.env.ORIANT_RUNTIME_STORAGE ?? "").trim();
  if (raw === "" || raw === "file") return "file";
  if (raw === "memory") return "memory";
  throw new Error(
    `ORIANT_RUNTIME_STORAGE is "${raw}", which this build does not implement. ` +
      `Use "file" (the default — durable, under data/runtime/) or "memory" ` +
      `(discarded on restart). Postgres is the documented production path but is ` +
      `not wired yet; see docs/STORAGE.md.`,
  );
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
  storage: RuntimeStorage;
  /** Absolute directory backing the stores; null when storage is "memory". */
  dataDir: string | null;
  plan: ApprovedPlan;
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
  const tools = new StubIntegrationProvider();
  const clock = new SystemClock();
  const newId = createIdFactory();

  // In live mode the AiAndReasoner constructor throws when credentials are
  // missing. Surfacing that at session construction is deliberate: loud at
  // wiring beats silent at the first reason step.
  const reasoner: Reasoner =
    mode === "live" ? new AiAndReasoner() : new FixtureReasoner();

  const plan = BRIGHTPATH_PLAN;

  return {
    mode,
    storage,
    dataDir: stores.dataDir,
    plan,
    runStore: stores.runStore,
    buildStore: stores.buildStore,
    schedulerStore: stores.schedulerStore,
    tools,
    reasoner,
    executor: {
      store: stores.runStore,
      tools,
      reasoner,
      clock,
      newId,
      globalPolicy: plan.globalPolicy,
    },
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
