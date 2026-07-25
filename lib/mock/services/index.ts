/**
 * lib/mock/services/index.ts — the central mock service layer (spec §2).
 *
 * Each service returns typed data and emits ordered status events after
 * deterministic delays via runTimeline(). Live integrations can replace this
 * module later without rewriting components. All timers are cancellable —
 * Reset / route changes cannot cause stale updates (cancelAllMockWork()).
 *
 * Every service accepts { instant?: boolean } so the demo menu's Fast-forward
 * and rehearsal mode can complete any phase without waiting.
 */
import { runTimeline, stageSteps, type TimelineHandle } from "./timeline";
export { cancelAllMockWork } from "./timeline";

export interface RunOpts {
  instant?: boolean;
}

/* ── Voice (spec §9.1 sequence, §22 timing) ─────────────────────────────── */

export type VoiceEvent =
  | { type: "listening" }
  | { type: "waveform" }
  | { type: "word"; word: string; index: number; total: number }
  | { type: "done" };

export const mockVoiceService = {
  /**
   * Simulate one voice answer: 0.6s listening → 2.4s waveform "capture" →
   * the hardcoded answer revealed word by word (~1.5s total).
   */
  startAnswer(
    answer: string,
    onEvent: (e: VoiceEvent) => void,
    opts?: RunOpts,
  ): TimelineHandle {
    const words = answer.split(" ");
    const perWord = Math.max(30, Math.min(90, Math.round(1500 / words.length)));
    const steps = [
      { delay: 0, emit: { type: "listening" } as VoiceEvent },
      { delay: 600, emit: { type: "waveform" } as VoiceEvent },
      ...words.map((word, i) => ({
        // first word arrives after the waveform "capture" pause
        delay: i === 0 ? 2400 : perWord,
        emit: { type: "word", word, index: i, total: words.length } as VoiceEvent,
      })),
      { delay: 250, emit: { type: "done" } as VoiceEvent },
    ];
    return runTimeline(steps, (e) => onEvent(e), opts);
  },
};

/* ── Discovery analysis (4 stages over ~6s, spec §22) ───────────────────── */

export const mockDiscoveryService = {
  analyse(
    stages: string[],
    onStage: (stage: string, index: number) => void,
    opts?: RunOpts,
  ): TimelineHandle {
    return runTimeline(stageSteps(stages, 6000), onStage, opts);
  },
};

/* ── Planner generation (5 stages over ~8s) + NL reconfigure (~2.5s) ────── */

export const mockPlannerService = {
  generate(
    stages: string[],
    onStage: (stage: string, index: number) => void,
    opts?: RunOpts,
  ): TimelineHandle {
    return runTimeline(stageSteps(stages, 8000), onStage, opts);
  },

  reconfigure(
    reasoning: string[],
    onStep: (line: string, index: number) => void,
    opts?: RunOpts,
  ): TimelineHandle {
    return runTimeline(stageSteps(reasoning, 2500), onStep, opts);
  },
};

/* ── Agent Factory (per-agent jobs, 8–15s, staggered; spec §14) ─────────── */

export type BuildEvent =
  | { type: "status"; status: "generating" | "validating" | "completed" }
  | { type: "log"; index: number }
  | { type: "progress"; pct: number };

export const mockAgentFactoryService = {
  /**
   * Play one agent's build: log lines at their fixture offsets, progress
   * interpolated, validating at 82%, completed at the end.
   */
  build(
    fixture: { duration: number; logOffsets: number[] },
    onEvent: (e: BuildEvent) => void,
    opts?: RunOpts,
  ): TimelineHandle {
    type Step = { delay: number; emit: BuildEvent };
    const events: { at: number; emit: BuildEvent }[] = [
      { at: 0, emit: { type: "status", status: "generating" } },
      ...fixture.logOffsets.map((at, index) => ({
        at,
        emit: { type: "log", index } as BuildEvent,
      })),
      // progress ticks every 500ms
      ...Array.from({ length: Math.floor(fixture.duration / 500) }, (_, k) => ({
        at: (k + 1) * 500,
        emit: {
          type: "progress",
          pct: Math.min(99, Math.round(((k + 1) * 500 * 100) / fixture.duration)),
        } as BuildEvent,
      })),
      { at: Math.round(fixture.duration * 0.82), emit: { type: "status", status: "validating" } },
      { at: fixture.duration, emit: { type: "progress", pct: 100 } },
      { at: fixture.duration, emit: { type: "status", status: "completed" } },
    ];
    events.sort((a, b) => a.at - b.at);

    const steps: Step[] = events.map((e, i) => ({
      delay: i === 0 ? e.at : e.at - events[i - 1].at,
      emit: e.emit,
    }));
    return runTimeline(steps, (e) => onEvent(e), opts);
  },
};

/* ── Sandbox (event timeline with approval pause; spec §15) ─────────────── */

export const mockSandboxService = {
  /**
   * Play scenario events up to (and including) the approval_pause, or all
   * remaining events after resume. Caller slices the fixture list.
   */
  run(
    events: { at: number }[],
    onEvent: (index: number) => void,
    opts?: RunOpts,
  ): TimelineHandle {
    const steps = events.map((e, i) => ({
      delay: i === 0 ? Math.max(300, e.at) : Math.max(200, e.at - events[i - 1].at),
      emit: i,
    }));
    return runTimeline(steps, (i) => onEvent(i), opts);
  },
};

/* ── Deployment (sequential agent activation, 5–8s; spec §16) ───────────── */

export const mockDeploymentService = {
  activate(
    agentIds: string[],
    onEvent: (e: { agentId: string; status: "activating" | "active" }) => void,
    opts?: RunOpts,
  ): TimelineHandle {
    const steps: { delay: number; emit: { agentId: string; status: "activating" | "active" } }[] =
      agentIds.flatMap((agentId, i) => [
        { delay: i === 0 ? 500 : 400, emit: { agentId, status: "activating" as const } },
        { delay: 1100, emit: { agentId, status: "active" as const } },
      ]);
    return runTimeline(steps, (e) => onEvent(e), opts);
  },
};

/* ── Notifications (mock WhatsApp preview; spec §19.2) ──────────────────── */

export const mockNotificationService = {
  send(
    onEvent: (stage: "sending" | "delivered") => void,
    opts?: RunOpts,
  ): TimelineHandle {
    return runTimeline(
      [
        { delay: 400, emit: "sending" as const },
        { delay: 900, emit: "delivered" as const },
      ],
      (e) => onEvent(e),
      opts,
    );
  },
};

/* ── Generic connection wizard (3 steps over ~3s; spec §12, §22) ────────── */

export const mockConnectionService = {
  connect(
    onStep: (step: "account" | "permissions" | "testing" | "connected") => void,
    opts?: RunOpts,
  ): TimelineHandle {
    return runTimeline(
      [
        { delay: 300, emit: "account" as const },
        { delay: 900, emit: "permissions" as const },
        { delay: 900, emit: "testing" as const },
        { delay: 1000, emit: "connected" as const },
      ],
      (e) => onStep(e),
      opts,
    );
  },
};
