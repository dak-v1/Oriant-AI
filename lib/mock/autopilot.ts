"use client";
/**
 * lib/mock/autopilot.ts — the "Do it for me" auto-play demo.
 *
 * A tiny transient store (never persisted) plus a window-event command bus.
 * The AutopilotController runs an ordered script that drives the whole
 * journey — navigating routes, filling the demo data, and triggering the real
 * animated interactions (voice, generation, build, sandbox, activation) so a
 * screen recording looks like a person performing the demo, ending on the
 * Operate workspace.
 *
 * Screens cooperate through the bus: the engine dispatches a command, the
 * screen runs its own auto-sequence (its existing handlers + services), and
 * the engine waits on the demo store's state to know the step finished.
 */
import { useEffect, useRef } from "react";
import { create } from "zustand";

export interface AutopilotState {
  running: boolean;
  /**
   * Presentation ("recording") mode: hides every demo/fake sign (Interactive
   * Demo badges, "prepared demo data" notes, simulation labels, the demo-company
   * shortcut) plus the auto-play button and overlay, so a screen recording is
   * clean. Turned on automatically while the auto-play runs; also togglable.
   */
  presentation: boolean;
  /** Monotonic run token; incremented on start/stop so a stale run aborts. */
  token: number;
  /** Human label of the current step, shown in the overlay. */
  label: string;
  step: number;
  total: number;
  start: () => void;
  stop: () => void;
  setPresentation: (v: boolean) => void;
  setProgress: (step: number, total: number, label: string) => void;
}

export const useAutopilot = create<AutopilotState>((set, get) => ({
  running: false,
  presentation: false,
  token: 0,
  label: "",
  step: 0,
  total: 0,
  start: () =>
    set({ running: true, presentation: true, token: get().token + 1, step: 0, label: "Starting…" }),
  stop: () => set({ running: false, presentation: false, token: get().token + 1, label: "" }),
  setPresentation: (v) => set({ presentation: v }),
  setProgress: (step, total, label) => set({ step, total, label }),
}));

/* ── Command bus (screen cooperation) ─────────────────────────────────────
   The engine dispatches a command; the target screen listens and runs its
   auto-sequence. Kept off the React tree so any mounted screen can react. */

const AP_EVENT = "oriant-ap";

export function apDispatch(cmd: string, payload?: unknown): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AP_EVENT, { detail: { cmd, payload } }));
}

/** React hook: run `handler` whenever the engine dispatches `cmd`. */
export function useApCommand(cmd: string, handler: (payload?: unknown) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const onEvt = (e: Event) => {
      const detail = (e as CustomEvent).detail as { cmd: string; payload?: unknown };
      if (detail?.cmd === cmd) ref.current(detail.payload);
    };
    window.addEventListener(AP_EVENT, onEvt);
    return () => window.removeEventListener(AP_EVENT, onEvt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmd]);
}
