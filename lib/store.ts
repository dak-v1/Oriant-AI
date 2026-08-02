"use client";
/**
 * Client store — a faithful port of the design prototype's interaction logic
 * (reference/Margo.dc.html, DCLogic), re-based onto the server:
 *
 *   · UI state (screens, typewriter, timers, drag) lives here.
 *   · Lifecycle state (report, plan versions, builds, approvals) lives on the
 *     server behind the Orchestration Controller; every mutation round-trips
 *     and replaces `server` with the authoritative result.
 */
import { create } from "zustand";
import type {
  AgentConfig, AgentSpecAnswers, Db, PlanDiff,
} from "./contracts";
import { DEFAULT_CONFIG } from "./fixtures";
import {
  CALL_CARDS, DESIGN_CARDS, DEFAULT_GOALS, DEFAULT_SYSTEMS, LC_UPLOAD_DATA,
} from "./script";
import { cancelSpeech, loadVoicePref, primeVoices, saveVoicePref, speak, speechSupported } from "./speech";

export type Screen =
  | "landing" | "call" | "report" | "planner" | "design"
  | "build" | "validate" | "workspace" | "approvals";

export type CallPhase = "speaking" | "listening" | "user-talking" | "review" | "paused" | "done";

export interface ProviderFlags { aiand: boolean; nosana: boolean; doubleword: boolean; daytona: boolean }

interface CallState {
  idx: number;
  active: boolean;
  phase: CallPhase;
  typed: string;
  filled: Record<string, string>;
  startedAt: number;
  canvasUp: boolean;
  muted: boolean;
  txOpen: boolean;
  txTab: "transcript" | "notes";
  recording: boolean;
  transcribing: boolean;
  typedMode: boolean;
  draft: string;
}

interface DesignState {
  id: string | null;
  name: string;
  idx: number;
  active: boolean;
  phase: CallPhase;
  typed: string;
  filled: Record<string, string>;
  startedAt: number;
  uploaded: boolean;
}

interface PlannerUi {
  tab: "workflow" | "team" | "usecases";
  view: "plan" | "config";
  sel: string;
  diff: PlanDiff | null;
  nlText: string;
  nlBusy: boolean;
  cfg: AgentConfig;
  cfgAgentId: string | null;
}

export interface AppState {
  server: Db | null;
  providers: ProviderFlags | null;
  hydrated: boolean;
  error: string | null;
  generating: boolean;   // report being written after the call
  validating: boolean;

  screen: Screen;
  faqOpen: number;
  tick: number;          // 1s heartbeat for timers

  call: CallState;
  goals: Record<string, boolean>;
  systems: Record<string, boolean>;

  design: DesignState;
  pl: PlannerUi;
  approvalSel: string;
  drag: { type: "add" | "move"; id: string } | null;
  /** Margo speaks her questions aloud (browser speech synthesis) */
  voiceOn: boolean;
  voiceSupported: boolean;
  toggleVoice(): void;

  /* actions */
  hydrate(): Promise<void>;
  resetAll(): Promise<void>;
  clearError(): void;
  go(s: Screen): void;
  enterApp(): void;
  toLanding(): void;
  toggleFaq(i: number): void;

  enterCall(idx: number, keep: boolean): void;
  callFill(id: string, val: string): void;
  callSay(): void;
  callNext(): void;
  callJump(idx: number): void;
  endCall(): void;
  resumeCall(): void;
  callUpload(): void;
  callBuild(): void;
  callAnswerVoice(): Promise<void>;
  callTypeInstead(): void;
  callSetDraft(v: string): void;
  callConfirmDraft(): void;
  callPick(opt: string): void;
  callMute(): void;
  callToggleTx(): void;
  callTxTabSet(t: "transcript" | "notes"): void;
  toggleGoal(k: string): void;
  toggleSystem(k: string): void;
  callToReport(): Promise<void>;

  saveReportExec(text: string): Promise<void>;
  approveReport(): Promise<void>;

  plTab(t: PlannerUi["tab"]): void;
  plSelect(id: string): void;
  plConfigOpen(id: string): void;
  plConfigBack(): void;
  plConfigSave(): Promise<void>;
  plCfgToggle(group: "channels" | "knowledge" | "approvals", k: string): void;
  plCfgSet(field: "mode" | "target" | "hours" | "escalation" | "retry", v: string): void;
  addAgent(id: string): Promise<void>;
  removeAgent(id: string): Promise<void>;
  renameAgent(id: string, name: string): Promise<void>;
  addCustom(): Promise<void>;
  plUndo(): Promise<void>;
  plSetNl(v: string): void;
  plPreview(): Promise<void>;
  plApplyDiff(): Promise<void>;
  plDiscardDiff(): void;
  setDrag(d: AppState["drag"]): void;
  dropOnCard(id: string): Promise<void>;
  dropOnList(): Promise<void>;
  resolveAgent(id: string): void;
  confirmWorkflow(): Promise<void>;

  enterDesign(id: string): void;
  dFill(v: string): void;
  dSay(): void;
  dNext(): void;
  dJump(i: number): void;
  endDesign(): void;
  resumeDesign(): void;
  dUpload(): void;
  finishDesign(): Promise<void>;

  startBuild(): Promise<void>;
  gotoValidate(): Promise<void>;
  activate(): Promise<void>;

  selectApproval(id: string): void;
  decide(decision: "approved" | "rejected"): Promise<void>;
}

/* ── module-level timers (never in state) ────────────────────────────────── */
let speakT: ReturnType<typeof setInterval> | null = null;
let sayT: ReturnType<typeof setInterval> | null = null;
let ansT: ReturnType<typeof setTimeout> | null = null;
let clockT: ReturnType<typeof setInterval> | null = null;
let pollT: ReturnType<typeof setInterval> | null = null;
let recorder: MediaRecorder | null = null;
let recChunks: Blob[] = [];
let recCancelled = false;
const renameTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearTimers() {
  if (speakT) clearInterval(speakT);
  if (sayT) clearInterval(sayT);
  if (ansT) clearTimeout(ansT);
  speakT = sayT = null; ansT = null;
  cancelSpeech(); // Margo stops talking the moment the moment passes
}

function stopClock() {
  if (clockT) { clearInterval(clockT); clockT = null; }
}

/** Stop any live microphone capture without submitting it. */
function cancelRecording() {
  if (recorder && recorder.state !== "inactive") {
    recCancelled = true;
    try { recorder.stop(); } catch { /* already stopped */ }
  }
}

async function api(path: string, init?: RequestInit): Promise<{ ok: boolean; body: unknown; status: number }> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  let body: unknown = null;
  try { body = await res.json(); } catch { /* empty */ }
  return { ok: res.ok, body, status: res.status };
}

const freshCall = (): CallState => ({
  idx: 0, active: true, phase: "speaking", typed: "", filled: {},
  startedAt: 0, canvasUp: false, muted: false, txOpen: true,
  txTab: "transcript", recording: false, transcribing: false,
  typedMode: false, draft: "",
});

const freshDesign = (): DesignState => ({
  id: null, name: "", idx: 0, active: true, phase: "speaking",
  typed: "", filled: {}, startedAt: 0, uploaded: false,
});

export const useApp = create<AppState>((set, get) => {
  /* helpers */
  const applyPayload = (body: unknown) => {
    const p = body as { state?: Db; providers?: ProviderFlags; error?: string };
    if (p?.state) set({ server: p.state, providers: p.providers ?? get().providers, hydrated: true });
  };

  const call = async (path: string, init?: RequestInit): Promise<boolean> => {
    const res = await api(path, init);
    if (res.ok) { applyPayload(res.body); return true; }
    const err = (res.body as { error?: string })?.error ?? "The server rejected that.";
    set({ error: err });
    return false;
  };

  const ensureClock = () => {
    if (clockT) return;
    clockT = setInterval(() => set((s) => ({ tick: s.tick + 1 })), 1000);
  };

  const ensureBuildPolling = () => {
    if (pollT) return;
    pollT = setInterval(async () => {
      const s = get();
      if (s.server?.phase !== "building") {
        if (pollT) { clearInterval(pollT); pollT = null; }
        return;
      }
      const res = await api("/api/state");
      if (res.ok) applyPayload(res.body);
    }, 1200);
  };

  /* the Margo-speaks typewriter (call + design share the pattern) */
  const speakCall = () => {
    const st = get();
    const card = CALL_CARDS[st.call.idx];
    if (!card) return;
    const full = card.q;
    let n = 0;
    if (speakT) clearInterval(speakT);
    if (st.voiceOn) speak(full);
    set((s) => ({ call: { ...s.call, phase: "speaking", typed: "" } }));
    speakT = setInterval(() => {
      n += 2;
      set((s) => ({ call: { ...s.call, typed: full.slice(0, n) } }));
      if (n >= full.length) {
        if (speakT) clearInterval(speakT);
        speakT = null;
        set((s) => ({ call: { ...s.call, phase: "listening", typed: full } }));
      }
    }, 30);
  };

  const speakDesign = () => {
    const st = get();
    const card = DESIGN_CARDS[st.design.idx];
    if (!card) return;
    const full = card.q;
    let n = 0;
    if (speakT) clearInterval(speakT);
    if (st.voiceOn) speak(full);
    set((s) => ({ design: { ...s.design, phase: "speaking", typed: "" } }));
    speakT = setInterval(() => {
      n += 2;
      set((s) => ({ design: { ...s.design, typed: full.slice(0, n) } }));
      if (n >= full.length) {
        if (speakT) clearInterval(speakT);
        speakT = null;
        set((s) => ({ design: { ...s.design, phase: "listening", typed: full } }));
      }
    }, 30);
  };

  return {
    server: null,
    providers: null,
    hydrated: false,
    error: null,
    generating: false,
    validating: false,
    screen: "landing",
    faqOpen: 0,
    tick: 0,
    call: freshCall(),
    goals: { ...DEFAULT_GOALS },
    systems: { ...DEFAULT_SYSTEMS },
    design: freshDesign(),
    pl: { tab: "workflow", view: "plan", sel: "frontdesk", diff: null, nlText: "", nlBusy: false, cfg: { ...DEFAULT_CONFIG }, cfgAgentId: null },
    approvalSel: "a1",
    drag: null,
    voiceOn: true,        // runtime preference; persistent product data belongs in Supabase
    voiceSupported: false,

    toggleVoice() {
      const on = !get().voiceOn;
      saveVoicePref(on);
      if (!on) cancelSpeech();
      set({ voiceOn: on });
    },

    async hydrate() {
      // voice preference + voice list are browser-only concerns
      set({ voiceOn: loadVoicePref(), voiceSupported: speechSupported() });
      primeVoices();
      const res = await api("/api/state");
      if (res.ok) applyPayload(res.body);
      // resume where the journey left off
      const s = get();
      if (s.server && s.screen === "landing") {
        // stay on landing — the user chooses when to enter
      }
      if (s.server?.phase === "building") ensureBuildPolling();
    },

    async resetAll() {
      clearTimers();
      await call("/api/reset", { method: "POST" });
      set({
        screen: "landing", call: freshCall(), design: freshDesign(),
        goals: { ...DEFAULT_GOALS }, systems: { ...DEFAULT_SYSTEMS },
        pl: { tab: "workflow", view: "plan", sel: "frontdesk", diff: null, nlText: "", nlBusy: false, cfg: { ...DEFAULT_CONFIG }, cfgAgentId: null },
        approvalSel: "a1", generating: false, validating: false, error: null,
      });
    },

    clearError() { set({ error: null }); },

    go(s) {
      clearTimers();
      stopClock();
      cancelRecording();
      set({ screen: s, error: null });
    },

    enterApp() {
      // resume where the lifecycle actually is (server is the authority)
      const phase = get().server?.phase;
      if (!phase || phase === "onboarding") { get().enterCall(0, false); return; }
      const map: Record<string, Screen> = {
        report_draft: "report", report_approved: "report",
        plan_draft: "planner", plan_approved: "build",
        building: "build", built: "build",
        validating: "validate", validated: "validate",
        active: "workspace",
      };
      get().go(map[phase] ?? "call");
    },
    toLanding() { clearTimers(); stopClock(); cancelRecording(); set({ screen: "landing" }); },
    toggleFaq(i) { set((s) => ({ faqOpen: s.faqOpen === i ? -1 : i })); },

    /* ── the kickoff call ──────────────────────────────────────────────── */

    enterCall(idx, keep) {
      const prev = get().call;
      clearTimers();
      cancelRecording();
      ensureClock();
      set({
        screen: "call",
        error: null,
        call: {
          ...freshCall(),
          idx,
          canvasUp: keep ? prev.canvasUp : false,
          txOpen: prev.txOpen,
          filled: keep ? prev.filled : {},
          startedAt: keep && prev.startedAt ? prev.startedAt : Date.now(),
          phase: keep && prev.phase === "done" ? "done" : "speaking",
        },
      });
      if (!(keep && prev.phase === "done")) setTimeout(speakCall, 90);
    },

    callFill(id, val) {
      set((s) => ({ call: { ...s.call, filled: { ...s.call.filled, [id]: val } } }));
    },

    /* demo voice: type the sample answer like the design prototype */
    callSay() {
      const st = get();
      const card = CALL_CARDS[st.call.idx];
      if (!card || card.type === "goals" || card.type === "systems") return;
      cancelSpeech(); // the owner is talking now — Margo listens
      const full = card.sample ?? "";
      let n = 0;
      if (sayT) clearInterval(sayT);
      set((s) => ({ call: { ...s.call, phase: "user-talking" } }));
      sayT = setInterval(() => {
        n += 2;
        const t = full.slice(0, n);
        set((s) => ({ call: { ...s.call, filled: { ...s.call.filled, [card.id]: t } } }));
        if (n >= full.length) {
          if (sayT) clearInterval(sayT);
          sayT = null;
          set((s) => ({ call: { ...s.call, phase: "listening" } }));
        }
      }, 22);
    },

    callNext() {
      const c = get().call;
      if (c.idx + 1 >= CALL_CARDS.length) {
        clearTimers();
        set((s) => ({ call: { ...s.call, phase: "done", typedMode: false, draft: "" } }));
        // discovery starts immediately; the owner reads the brief when ready
        void get().callToReport();
        return;
      }
      set((s) => ({ call: { ...s.call, idx: c.idx + 1, typedMode: false, draft: "" } }));
      setTimeout(speakCall, 80);
    },

    callJump(idx) {
      clearTimers();
      set((s) => ({ screen: "call", call: { ...s.call, idx, phase: "speaking", typedMode: false, draft: "" } }));
      setTimeout(speakCall, 80);
    },

    endCall() {
      clearTimers();
      stopClock();
      cancelRecording();
      set((s) => ({ call: { ...s.call, active: false, phase: "paused", recording: false, transcribing: false } }));
    },

    resumeCall() {
      ensureClock();
      set((s) => ({ call: { ...s.call, active: true, phase: "listening" } }));
    },

    callUpload() {
      set((s) => ({
        call: { ...s.call, canvasUp: true, filled: { ...s.call.filled, ...LC_UPLOAD_DATA } },
      }));
      const ops = CALL_CARDS.findIndex((c) => c.id === "ops");
      setTimeout(() => get().callJump(ops), 40);
    },

    callBuild() { get().callNext(); },

    /* mic answer: real recording via Nosana when live, sample demo otherwise */
    async callAnswerVoice() {
      const st = get();
      const card = CALL_CARDS[st.call.idx];
      if (!card || st.call.transcribing) return;
      cancelSpeech(); // never record Margo's own voice / talk over the owner

      const live = !!st.providers?.nosana;
      if (!live) {
        // demo behavior from the design: “listen”, fill the sample, advance
        set((s) => ({ call: { ...s.call, phase: "user-talking" } }));
        if (ansT) clearTimeout(ansT);
        ansT = setTimeout(() => {
          get().callFill(card.id, card.sample ?? "");
          get().callNext();
        }, 1100);
        return;
      }

      if (st.call.recording) {
        // second tap = stop → transcribe → review before submission
        recorder?.stop();
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recChunks = [];
        recCancelled = false;
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => recChunks.push(e.data);
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          if (recCancelled) {
            // navigation/pause cancelled the capture — discard, don't submit
            recCancelled = false;
            set((s) => ({ call: { ...s.call, recording: false, transcribing: false } }));
            return;
          }
          set((s) => ({ call: { ...s.call, recording: false, transcribing: true } }));
          try {
            const blob = new Blob(recChunks, { type: recorder?.mimeType || "audio/webm" });
            const form = new FormData();
            form.append("audio", blob, "answer.webm");
            const res = await fetch("/api/transcribe", { method: "POST", body: form });
            const body = (await res.json()) as { ok: boolean; text?: string; error?: string };
            if (body.ok && body.text) {
              // the transcript is shown as editable text before submission
              set((s) => ({
                call: { ...s.call, transcribing: false, phase: "review", typedMode: true, draft: body.text! },
              }));
            } else {
              // name the real cause so it reads as "the workload is down",
              // not "your microphone is broken"
              set((s) => ({
                call: { ...s.call, transcribing: false, phase: "review", typedMode: true },
                error: `Voice transcription unavailable (${body.error ?? "unknown error"}) — type your answer instead.`,
              }));
            }
          } catch {
            // never strand the call on "Transcribing…" — always fall back to typing
            set((s) => ({
              call: { ...s.call, transcribing: false, phase: "review", typedMode: true },
              error: "Couldn’t reach transcription — type your answer instead.",
            }));
          }
        };
        recorder.start();
        set((s) => ({ call: { ...s.call, recording: true, phase: "user-talking" } }));
      } catch {
        set((s) => ({
          call: { ...s.call, typedMode: true, phase: "listening" },
          error: "Microphone unavailable — type your answer instead.",
        }));
      }
    },

    callTypeInstead() {
      const card = CALL_CARDS[get().call.idx];
      set((s) => ({
        call: { ...s.call, typedMode: true, phase: "review", draft: s.call.filled[card?.id ?? ""] ?? "" },
      }));
    },

    callSetDraft(v) { set((s) => ({ call: { ...s.call, draft: v } })); },

    callConfirmDraft() {
      const st = get();
      const card = CALL_CARDS[st.call.idx];
      if (!card || !st.call.draft.trim()) return;
      get().callFill(card.id, st.call.draft.trim());
      get().callNext();
    },

    callPick(opt) {
      const card = CALL_CARDS[get().call.idx];
      if (!card) return;
      get().callFill(card.id, opt);
      if (ansT) clearTimeout(ansT);
      ansT = setTimeout(() => get().callNext(), 380);
    },

    callMute() { set((s) => ({ call: { ...s.call, muted: !s.call.muted } })); },
    callToggleTx() { set((s) => ({ call: { ...s.call, txOpen: !s.call.txOpen } })); },
    callTxTabSet(t) { set((s) => ({ call: { ...s.call, txTab: t } })); },
    toggleGoal(k) { set((s) => ({ goals: { ...s.goals, [k]: !s.goals[k] } })); },
    toggleSystem(k) { set((s) => ({ systems: { ...s.systems, [k]: !s.systems[k] } })); },

    /* the call is done — run Discovery on the server, then read the brief */
    async callToReport() {
      const st = get();
      if (st.server?.report && st.call.phase === "done" && !st.generating) {
        get().go("report");
        return;
      }
      if (st.generating) return;
      set({ generating: true });
      const ok = await call("/api/call/complete", {
        method: "POST",
        body: JSON.stringify({
          answers: st.call.filled,
          goals: st.goals,
          systems: st.systems,
          canvasUploaded: st.call.canvasUp,
        }),
      });
      set({ generating: false });
      if (ok && get().screen !== "call") return; // user already navigated
      if (ok && get().call.phase === "done") {
        // stay on the “Great call” screen; the button opens the brief
      }
    },

    /* ── the brief ─────────────────────────────────────────────────────── */

    async saveReportExec(text) {
      const current = get().server?.report?.exec;
      if (current === undefined || text.trim() === current.trim()) return;
      await call("/api/report", { method: "PATCH", body: JSON.stringify({ exec: text.trim() }) });
    },

    async approveReport() {
      const ok = await call("/api/report/approve", { method: "POST" });
      if (!ok) return;
      const planned = await call("/api/plan/generate", { method: "POST" });
      if (planned) get().go("planner");
    },

    /* ── the planner ───────────────────────────────────────────────────── */

    plTab(t) { set((s) => ({ pl: { ...s.pl, tab: t, view: "plan" } })); },
    plSelect(id) { set((s) => ({ pl: { ...s.pl, sel: id } })); },

    plConfigOpen(id) {
      const agent = get().server?.plan?.team.find((a) => a.id === id);
      set((s) => ({
        pl: {
          ...s.pl, sel: id, view: "config", cfgAgentId: id,
          cfg: agent?.config ? JSON.parse(JSON.stringify(agent.config)) : JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
        },
      }));
    },

    plConfigBack() { set((s) => ({ pl: { ...s.pl, view: "plan" } })); },

    async plConfigSave() {
      const { pl } = get();
      if (!pl.cfgAgentId) return;
      const ok = await call("/api/plan/change", {
        method: "POST",
        body: JSON.stringify({ op: "configure", id: pl.cfgAgentId, config: pl.cfg }),
      });
      if (ok) set((s) => ({ pl: { ...s.pl, view: "plan" } }));
    },

    plCfgToggle(group, k) {
      set((s) => ({
        pl: { ...s.pl, cfg: { ...s.pl.cfg, [group]: { ...s.pl.cfg[group], [k]: !s.pl.cfg[group][k] } } },
      }));
    },

    plCfgSet(field, v) {
      set((s) => ({ pl: { ...s.pl, cfg: { ...s.pl.cfg, [field]: v } } }));
    },

    async addAgent(id) {
      await call("/api/plan/change", { method: "POST", body: JSON.stringify({ op: "add", id }) });
      set((s) => ({ pl: { ...s.pl, sel: id } }));
    },
    async removeAgent(id) {
      await call("/api/plan/change", { method: "POST", body: JSON.stringify({ op: "remove", id }) });
    },
    async renameAgent(id, name) {
      // the input keeps its own DOM text (uncontrolled); commits are debounced
      // so fast typing doesn't race whole-state server replies
      const prev = renameTimers.get(id);
      if (prev) clearTimeout(prev);
      renameTimers.set(id, setTimeout(() => {
        renameTimers.delete(id);
        void call("/api/plan/change", { method: "POST", body: JSON.stringify({ op: "rename", id, name }) });
      }, 500));
    },
    async addCustom() {
      await call("/api/plan/change", { method: "POST", body: JSON.stringify({ op: "add-custom" }) });
      const team = get().server?.plan?.team ?? [];
      const last = [...team].reverse().find((a) => a.tag === "Custom" && a.inPlan);
      if (last) set((s) => ({ pl: { ...s.pl, sel: last.id } }));
    },
    async plUndo() { await call("/api/plan/undo", { method: "POST" }); },

    plSetNl(v) { set((s) => ({ pl: { ...s.pl, nlText: v } })); },

    async plPreview() {
      const { pl } = get();
      if (pl.nlBusy) return; // empty input is fine — the server proposes the default
      set((s) => ({ pl: { ...s.pl, nlBusy: true } }));
      const res = await api("/api/plan/nl", { method: "POST", body: JSON.stringify({ instruction: pl.nlText }) });
      const diff = (res.body as { diff?: PlanDiff })?.diff ?? null;
      set((s) => ({ pl: { ...s.pl, nlBusy: false, diff } }));
      if (!res.ok) set({ error: (res.body as { error?: string })?.error ?? "Couldn’t plan that change." });
    },

    async plApplyDiff() {
      const d = get().pl.diff;
      if (!d) return;
      const ok = await call("/api/plan/apply-diff", { method: "POST", body: JSON.stringify({ diff: d }) });
      if (ok) set((s) => ({ pl: { ...s.pl, diff: null, nlText: "" } }));
    },

    plDiscardDiff() { set((s) => ({ pl: { ...s.pl, diff: null } })); },

    setDrag(d) { set({ drag: d }); },

    async dropOnCard(id) {
      const d = get().drag;
      set({ drag: null });
      if (!d) return;
      if (d.type === "add") { await get().addAgent(d.id); return; }
      if (d.type === "move" && d.id !== id) {
        await call("/api/plan/change", { method: "POST", body: JSON.stringify({ op: "reorder", fromId: d.id, toId: id }) });
      }
    },

    async dropOnList() {
      const d = get().drag;
      set({ drag: null });
      if (d?.type === "add") await get().addAgent(d.id);
    },

    resolveAgent(id) {
      const agent = get().server?.plan?.team.find((a) => a.id === id);
      if (!agent) return;
      if (agent.tag === "Custom") get().enterDesign(id);
      else get().plConfigOpen(id);
    },

    async confirmWorkflow() {
      const ok = await call("/api/plan/approve", { method: "POST" });
      if (ok) get().go("build");
    },

    /* ── the custom-agent design call ──────────────────────────────────── */

    enterDesign(id) {
      const agent = get().server?.plan?.team.find((a) => a.id === id);
      clearTimers();
      ensureClock();
      set({
        screen: "design",
        design: { ...freshDesign(), id, name: agent?.name ?? "Custom agent", startedAt: Date.now() },
      });
      setTimeout(speakDesign, 90);
    },

    dFill(v) {
      const card = DESIGN_CARDS[get().design.idx];
      if (!card) return;
      set((s) => ({ design: { ...s.design, filled: { ...s.design.filled, [card.id]: v } } }));
    },

    dSay() {
      const card = DESIGN_CARDS[get().design.idx];
      if (!card) return;
      cancelSpeech();
      const full = card.sample;
      let n = 0;
      if (sayT) clearInterval(sayT);
      set((s) => ({ design: { ...s.design, phase: "user-talking" } }));
      sayT = setInterval(() => {
        n += 2;
        set((s) => ({ design: { ...s.design, filled: { ...s.design.filled, [card.id]: full.slice(0, n) } } }));
        if (n >= full.length) {
          if (sayT) clearInterval(sayT);
          sayT = null;
          set((s) => ({ design: { ...s.design, phase: "listening" } }));
        }
      }, 22);
    },

    dNext() {
      const d = get().design;
      if (d.idx + 1 >= DESIGN_CARDS.length) {
        clearTimers();
        set((s) => ({ design: { ...s.design, phase: "done" } }));
        return;
      }
      set((s) => ({ design: { ...s.design, idx: d.idx + 1 } }));
      setTimeout(speakDesign, 80);
    },

    dJump(i) {
      clearTimers();
      set((s) => ({ design: { ...s.design, idx: i } }));
      setTimeout(speakDesign, 80);
    },

    endDesign() {
      clearTimers();
      stopClock();
      set((s) => ({ design: { ...s.design, active: false, phase: "paused" } }));
    },

    resumeDesign() {
      ensureClock();
      set((s) => ({ design: { ...s.design, active: true, phase: "listening" } }));
    },

    dUpload() { set((s) => ({ design: { ...s.design, uploaded: true } })); },

    async finishDesign() {
      const d = get().design;
      if (!d.id) return;
      const spec: AgentSpecAnswers = {
        objective: d.filled.objective ?? "",
        trigger: d.filled.trigger ?? "",
        inputs: d.filled.inputs ?? "",
        rules: d.filled.rules ?? "",
        tools: d.filled.tools ?? "",
        forbidden: d.filled.forbidden ?? "",
        success: d.filled.success ?? "",
        materials: d.uploaded ? ["wholesale-price-list.pdf"] : [],
      };
      const ok = await call("/api/plan/change", {
        method: "POST",
        body: JSON.stringify({ op: "spec", id: d.id, spec }),
      });
      if (ok) {
        set((s) => ({ pl: { ...s.pl, view: "plan", tab: "workflow", sel: d.id! } }));
        get().go("planner");
      }
    },

    /* ── factory, sandbox, floor ───────────────────────────────────────── */

    async startBuild() {
      const ok = await call("/api/build/start", { method: "POST" });
      if (ok) ensureBuildPolling();
    },

    async gotoValidate() {
      if (get().screen !== "validate") get().go("validate");
      const s = get();
      const planned = s.server?.plan?.team.filter((a) => a.inPlan) ?? [];
      // only a "validated" record is terminal — missing or failed runs re-run
      const done = planned.length > 0 && planned.every((a) => s.server?.validations[a.id]?.status === "validated");
      const canRun = Object.values(s.server?.buildJobs ?? {}).length > 0 &&
        Object.values(s.server?.buildJobs ?? {}).every((j) => j.status === "completed");
      if (done || !canRun || s.validating) return;
      set({ validating: true });
      await call("/api/validate", { method: "POST" });
      set({ validating: false });
    },

    async activate() {
      const ok = await call("/api/deploy", { method: "POST" });
      if (ok) get().go("workspace");
    },

    selectApproval(id) { set({ approvalSel: id }); },

    async decide(decision) {
      const id = get().approvalSel;
      await call("/api/approvals/decision", {
        method: "POST",
        body: JSON.stringify({ id, decision }),
      });
    },
  };
});

export { CALL_CARDS, DESIGN_CARDS };
