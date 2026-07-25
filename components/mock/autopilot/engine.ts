"use client";
/**
 * engine.ts — the autopilot run context + loop. The context gives each script
 * stop a small toolkit: navigate and settle, wait on demo-store state, pause,
 * dispatch a screen command, and check whether the run was aborted (Stop
 * pressed or a newer run started).
 */
import type { DemoStore } from "@/lib/mock/store";
import { useDemoStore } from "@/lib/mock/store";

export interface ApCtx {
  /** Current demo store (state + actions). */
  s: () => DemoStore;
  /** Navigate to a route and let it settle. */
  go: (route: string, settleMs?: number) => Promise<void>;
  /** Poll until the predicate holds (or timeout/abort). Returns whether it held. */
  wait: (pred: (s: DemoStore) => boolean, timeoutMs?: number) => Promise<boolean>;
  /** Abortable pause. */
  delay: (ms: number) => Promise<void>;
  /** Fire a screen command over the bus. */
  dispatch: (cmd: string, payload?: unknown) => void;
  /** True once the run has been superseded or stopped. */
  aborted: () => boolean;
}

export interface ApStop {
  label: string;
  route?: string;
  /** Runs the stop (dispatch a command and/or drive store actions). */
  run?: (ctx: ApCtx) => Promise<void> | void;
  /** Waited after `run`; the stop is complete once this holds. */
  done?: (s: DemoStore) => boolean;
  /** Max wait for `done` (ms). */
  timeout?: number;
  /** Extra pause after the stop, for pacing (ms). */
  pause?: number;
}

export function makeCtx(
  push: (route: string) => void,
  aborted: () => boolean,
  dispatch: (cmd: string, payload?: unknown) => void,
): ApCtx {
  const delay = (ms: number) =>
    new Promise<void>((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (aborted() || Date.now() - started >= ms) return resolve();
        setTimeout(tick, Math.min(80, ms));
      };
      tick();
    });

  const wait = (pred: (s: DemoStore) => boolean, timeoutMs = 20000) =>
    new Promise<boolean>((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (aborted()) return resolve(false);
        if (pred(useDemoStore.getState())) return resolve(true);
        if (Date.now() - started >= timeoutMs) return resolve(false);
        setTimeout(tick, 120);
      };
      tick();
    });

  const go = async (route: string, settleMs = 550) => {
    if (aborted()) return;
    push(route);
    await delay(settleMs);
  };

  return {
    s: () => useDemoStore.getState(),
    go,
    wait,
    delay,
    dispatch,
    aborted,
  };
}

/** Run the ordered script, updating the overlay progress as it goes. */
export async function runScript(
  stops: ApStop[],
  ctx: ApCtx,
  onProgress: (step: number, total: number, label: string) => void,
): Promise<void> {
  for (let i = 0; i < stops.length; i++) {
    if (ctx.aborted()) return;
    const stop = stops[i];
    onProgress(i + 1, stops.length, stop.label);
    if (stop.route) await ctx.go(stop.route);
    if (ctx.aborted()) return;
    if (stop.run) await stop.run(ctx);
    if (ctx.aborted()) return;
    if (stop.done) await ctx.wait(stop.done, stop.timeout ?? 20000);
    if (ctx.aborted()) return;
    await ctx.delay(stop.pause ?? 650);
  }
}
