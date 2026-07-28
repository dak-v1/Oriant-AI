/**
 * lib/runtime/session.ts — one composed runtime, so callers wire nothing.
 *
 * The executor deliberately takes every dependency by injection (clock, ids,
 * store, tools, reasoner) because sandbox determinism demands it. That is right
 * for the library and tedious for a route handler, so this module assembles the
 * standard production-shaped wiring in one place.
 *
 * Storage is in-memory and survives only within a process. It is held on
 * globalThis so Next's dev-server module reloads do not silently reset a
 * half-finished journey — the same trick lib/server/store.ts uses. This is a
 * development affordance, NOT a database: every run, approval and package is
 * lost on restart. M4 cannot ship on it, because a paused run must outlive the
 * process (see ROLE_C_PLAN, M0 storage decision).
 *
 * ORIANT_RUNTIME_MODE selects the reasoner:
 *   unset / anything but "live" → FixtureReasoner, no network, deterministic
 *   "live"                      → AiAndReasoner, requires the AI& credentials
 * The default fails closed: an unconfigured deployment cannot accidentally
 * start spending on a provider.
 */

import type { ApprovedPlan } from "../plan/types";
import { BRIGHTPATH_PLAN } from "../plan/fixtures/brightpath";
import { InMemoryBuildStore } from "./build/store";
import { LocalPackageGenerator } from "./build/runner";
import type { BuildDeps } from "./build/types";
import type { ExecutorOptions } from "./executor";
import { AiAndReasoner, FixtureReasoner } from "./llm";
import { InMemoryRunStore, SystemClock, createIdFactory } from "./store";
import { StubIntegrationProvider } from "./tools";
import type { IntegrationProvider, Reasoner } from "./types";

export type RuntimeMode = "fixture" | "live";

export function runtimeMode(): RuntimeMode {
  return process.env.ORIANT_RUNTIME_MODE === "live" ? "live" : "fixture";
}

export interface RuntimeSession {
  mode: RuntimeMode;
  plan: ApprovedPlan;
  runStore: InMemoryRunStore;
  buildStore: InMemoryBuildStore;
  tools: IntegrationProvider;
  reasoner: Reasoner;
  executor: ExecutorOptions;
  build: BuildDeps;
  /** Clears runs, approvals and packages. Development only. */
  reset(): void;
}

interface SessionGlobal {
  __oriantRuntime?: RuntimeSession;
}

function createSession(): RuntimeSession {
  const mode = runtimeMode();
  const runStore = new InMemoryRunStore();
  const buildStore = new InMemoryBuildStore();
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
    plan,
    runStore,
    buildStore,
    tools,
    reasoner,
    executor: {
      store: runStore,
      tools,
      reasoner,
      clock,
      newId,
      globalPolicy: plan.globalPolicy,
    },
    build: {
      store: buildStore,
      generator: new LocalPackageGenerator(),
      clock,
      newId,
    },
    reset() {
      runStore.reset();
      buildStore.reset();
    },
  };
}

/**
 * The process-wide session. Cached on globalThis so a dev-server reload does
 * not discard in-flight runs and approvals.
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
