"use client";
/**
 * View-models — derived values with the SAME names as the design's template
 * variables ({{ … }} in reference/Margo.dc.html), so each screen component is
 * a mechanical port. All lifecycle facts come from the server state.
 */
import { BASE_FEE, BUILD_FILES, BUILD_WAVES, VALIDATE_CHECKS } from "./fixtures";
import { CALL_CARDS, DESIGN_CARDS } from "./script";
import type { AppState } from "./store";
import { useApp } from "./store";
import type { AgentDef, AgentStatus } from "./contracts";

/* ── status → label/color (from the design) ──────────────────────────────── */
export const SM: Record<AgentStatus, { l: string; c: string }> = {
  recommended: { l: "Recommended", c: "var(--ink3)" },
  "needs-info": { l: "Needs design", c: "var(--ember)" },
  "needs-config": { l: "Needs setup", c: "var(--ochre)" },
  "needs-integration": { l: "Needs integration", c: "var(--ochre)" },
  ready: { l: "Ready to build", c: "var(--forest)" },
};

const mmss = (startedAt: number) => {
  const el = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  return `${String(Math.floor(el / 60)).padStart(2, "0")}:${String(el % 60).padStart(2, "0")}`;
};

export const team = (s: AppState): AgentDef[] => s.server?.plan?.team ?? [];
export const planned = (s: AppState): AgentDef[] => team(s).filter((a) => a.inPlan);

/* ── sidebar journey ─────────────────────────────────────────────────────── */
export const ORDER = ["call", "report", "planner", "build", "validate", "workspace", "approvals"] as const;
export const LABELS = ["The call", "The brief", "Build the team", "The factory", "The sandbox", "The floor", "Your desk"];
export const META: Record<string, [string, string]> = {
  call: ["Phase 1", "Kickoff call with Margo"],
  report: ["Phase 1", "The company brief"],
  design: ["Phase 2", "Designing a custom agent"],
  planner: ["Phase 2", "Build the team"],
  build: ["Phase 2", "The agent factory"],
  validate: ["Phase 2", "The sandbox"],
  workspace: ["Live", "The floor"],
  approvals: ["Live", "Your desk"],
};

export function journeyVals(s: AppState) {
  const cur = s.screen === "design" ? "planner" : s.screen;
  const ci = ORDER.indexOf(cur as (typeof ORDER)[number]);
  return ORDER.map((sc, i) => {
    const active = cur === sc;
    const done = i < ci;
    return {
      n: String(i + 1).padStart(2, "0"),
      label: LABELS[i],
      screen: sc,
      bg: active ? "var(--ink)" : "transparent",
      color: active ? "var(--paper)" : done ? "var(--ink2)" : "var(--ink)",
      numColor: active ? "rgba(244,238,227,.6)" : "var(--ink3)",
      weight: active ? 700 : 500,
      dot: active ? "var(--paper)" : done ? "var(--forest)" : "var(--line2)",
    };
  });
}

/* ── call screen ─────────────────────────────────────────────────────────── */
export function callVals(s: AppState) {
  const c = s.call;
  const card = CALL_CARDS[Math.min(c.idx, CALL_CARDS.length - 1)] ?? CALL_CARDS[0];
  const filled = c.filled;
  const done = c.phase === "done";
  const speaking = c.phase === "speaking";
  const userTalking = c.phase === "user-talking";
  const review = c.phase === "review";
  const listening = !speaking && !userTalking && !done && !review && c.active;

  const gsel = () => Object.keys(s.goals).filter((k) => s.goals[k]).join(", ") || "(nothing yet)";
  const ssel = () => Object.keys(s.systems).filter((k) => s.systems[k]).join(", ") || "(nothing yet)";
  const ansOf = (cc: (typeof CALL_CARDS)[number]) =>
    cc.type === "goals" ? gsel()
      : cc.type === "systems" ? ssel()
        : cc.type === "canvas-intro" ? (c.canvasUp ? "I uploaded our Lean Canvas." : "Let's build it together.")
          : filled[cc.id] || "…";

  const tstamp = (n: number) => "2:" + String(10 + n).padStart(2, "0") + " PM";
  const tx: { who: string; text: string; time: string; whoColor: string }[] = [];
  let ti = 0;
  for (let i = 0; i < c.idx; i++) {
    const cc = CALL_CARDS[i];
    if (cc.type === "canvas-q" && c.canvasUp) continue;
    tx.push({ who: "Margo", text: cc.q, time: tstamp(ti++), whoColor: "var(--ink)" });
    tx.push({ who: "You", text: ansOf(cc), time: tstamp(ti++), whoColor: "var(--ember)" });
    if (cc.type === "canvas-intro" && c.canvasUp) {
      tx.push({ who: "Margo", text: "Perfect — I pulled it all into your canvas.", time: tstamp(ti++), whoColor: "var(--ink)" });
    }
  }
  if (!done) tx.push({ who: "Margo", text: card.q, time: tstamp(ti++), whoColor: "var(--ink)" });

  const notes: string[] = [];
  if (filled.profile) notes.push(filled.profile);
  const g = Object.keys(s.goals).filter((k) => s.goals[k]);
  if (g.length) notes.push("Wants off the plate: " + g.join(", "));
  if (c.canvasUp || filled.lc_segments) notes.push("Lean Canvas captured");
  if (filled.volume) notes.push("Support volume: " + filled.volume);
  if (filled.constraints) notes.push("Guardrails: " + filled.constraints);
  if (!notes.length) notes.push("Margo is jotting notes as you talk…");

  const waveBars = Array.from({ length: 34 }, (_, i) => ({
    h: 9 + Math.round(30 * Math.exp(-Math.pow((i - 16.5) / 9, 2))),
    delay: ((i % 7) * 0.09).toFixed(2) + "s",
  }));

  const topic =
    card.chap === "Lean Canvas" && card.short !== "Lean Canvas"
      ? "LEAN CANVAS · " + card.short.toUpperCase()
      : card.chap.toUpperCase();

  const isGoals = card.type === "goals";
  const isSystems = card.type === "systems";
  const isIntro = card.type === "canvas-intro";
  const isOptions = !!card.options;
  const isVoice = !isGoals && !isSystems && !isIntro && !isOptions;

  let big = "Margo is listening…";
  let sub = "Tap the mic to reply";
  if (speaking) { big = "Margo is talking…"; sub = "She’s asking you something"; }
  else if (c.transcribing) { big = "Transcribing…"; sub = "Nosana is writing it down"; }
  else if (userTalking) { big = "Listening…"; sub = c.recording ? "Recording — tap the mic to stop" : "Capturing your voice"; }
  else if (review) { big = "Here’s what I heard"; sub = "Fix anything, then send"; }
  else if (isOptions) sub = "Pick the closest answer";
  else if (isGoals || isSystems) sub = "Choose any that fit, then send";
  else if (isIntro) sub = "Upload one, or build it together";

  return {
    onCall: s.screen === "call",
    callDone: done,
    callActive: c.active && !done,
    callPaused: !c.active && !done,
    callSpeaking: speaking,
    callTopic: topic,
    callStatusBig: big,
    callStatusSub: sub,
    callTimer: mmss(c.startedAt),
    callTx: tx,
    callNotes: notes,
    waveBars,
    callTxOpen: c.txOpen,
    txIsTranscript: c.txTab === "transcript",
    txIsNotes: c.txTab === "notes",
    muteLabel: c.muted ? "Unmute" : "Mute",
    recording: c.recording,
    transcribing: c.transcribing,
    generating: s.generating,
    reportReady: !!s.server?.report,
    composeVoice: isVoice && listening && !c.typedMode,
    composeOptions: isOptions && listening,
    composeGoals: isGoals && listening,
    composeSystems: isSystems && listening,
    composeIntro: isIntro && listening,
    composeReview: review || (isVoice && listening && c.typedMode),
    reviewDraft: c.draft,
    reviewPh: card.ph ?? "Type your answer…",
    voiceLive: !!s.providers?.nosana,
    optionList: (card.options ?? []).map((o) => ({ label: o, pick: () => useApp.getState().callPick(o) })),
    obGoals: Object.keys(s.goals).map((k) => {
      const on = s.goals[k];
      return {
        label: k,
        toggle: () => useApp.getState().toggleGoal(k),
        bg: on ? "var(--ink)" : "transparent",
        fg: on ? "var(--paper)" : "var(--ink2)",
        bd: on ? "var(--ink)" : "var(--line2)",
      };
    }),
    obSystems: Object.keys(s.systems).map((k) => {
      const on = s.systems[k];
      return {
        label: k,
        toggle: () => useApp.getState().toggleSystem(k),
        bg: on ? "var(--card)" : "transparent",
        fg: on ? "var(--ink)" : "var(--ink3)",
        bd: on ? "var(--line2)" : "var(--line)",
        dot: on ? "var(--forest)" : "var(--line2)",
      };
    }),
  };
}

/* ── planner screen ──────────────────────────────────────────────────────── */
export function plannerVals(s: AppState) {
  const t = team(s);
  const pl = s.pl;
  const cfg = pl.cfg;
  const inPlan = planned(s);
  const base = s.server?.plan?.baseFee ?? BASE_FEE;
  const sum = inPlan.reduce((x, a) => x + a.price, 0);
  const total = base + sum;
  const low = Math.round((total * 0.72) / 10) * 10;
  const high = Math.round((total * 1.4) / 10) * 10;
  const store = () => useApp.getState();

  const mkCard = (a: AgentDef) => {
    const m = SM[a.status] ?? SM.recommended;
    let action = "";
    if (a.status === "needs-info") action = "Design agent →";
    else if (a.status === "needs-integration") action = "Connect & set up →";
    else if (a.status === "needs-config") action = "Configure →";
    return {
      id: a.id, name: a.name, role: a.role, tag: a.tag, desc: a.desc,
      approval: a.approval, isCustom: a.tag === "Custom", notCustom: a.tag !== "Custom",
      statusLabel: m.l, statusColor: m.c,
      cardBd: pl.sel === a.id ? "var(--ink)" : "var(--line2)",
      priceLabel: "$" + a.price + "/mo",
      integLabel: a.integ.join(" · "),
      hasAction: !!action, actionLabel: action,
      resolve: () => store().resolveAgent(a.id),
      select: () => store().plSelect(a.id),
      remove: () => store().removeAgent(a.id),
      rename: (name: string) => store().renameAgent(a.id, name),
      dragStart: () => store().setDrag({ type: "move", id: a.id }),
      drop: () => store().dropOnCard(a.id),
    };
  };

  const useCases = s.server?.report?.useCases ?? [];
  const COVER: Record<string, string> = {
    "Respond to repeat": "frontdesk", "Apply a subscription": "subs",
    "Qualify a wholesale": "wholesale", "Flag and draft": "restock", "Draft on-brand": "reviews",
  };
  const cover = useCases.map((u) => {
    let aid: string | null = null;
    Object.keys(COVER).forEach((k) => { if (u.name.startsWith(k)) aid = COVER[k]; });
    const ag = t.find((a) => a.id === aid);
    const inP = ag?.inPlan;
    const cust = ag?.tag === "Custom";
    const cv = cust && inP
      ? { l: "Tier 2 · custom", c: "var(--ember)" }
      : inP ? { l: "Covered", c: "var(--forest)" } : { l: "Not yet covered", c: "var(--ink3)" };
    return { name: u.name, trigger: u.trigger, freq: u.freq, agent: ag ? ag.name : "—", covLabel: cv.l, covColor: cv.c };
  });
  const covered = cover.filter((c) => c.covLabel !== "Not yet covered").length;

  const sel = t.find((a) => a.id === pl.sel);
  const blockers = inPlan.filter((a) => a.status !== "ready");
  const canConfirm = inPlan.length > 0 && blockers.length === 0;

  const mkMulti = (g: "channels" | "knowledge" | "approvals", opts: string[]) =>
    opts.map((k) => ({
      label: k,
      toggle: () => store().plCfgToggle(g, k),
      bg: cfg[g][k] ? "var(--ink)" : "transparent",
      fg: cfg[g][k] ? "var(--paper)" : "var(--ink2)",
      bd: cfg[g][k] ? "var(--ink)" : "var(--line2)",
    }));
  const mkSingle = (fl: "mode" | "target" | "hours" | "escalation" | "retry", opts: string[]) =>
    opts.map((v) => ({
      label: v,
      set: () => store().plCfgSet(fl, v),
      bg: cfg[fl] === v ? "var(--ink)" : "transparent",
      fg: cfg[fl] === v ? "var(--paper)" : "var(--ink2)",
      bd: cfg[fl] === v ? "var(--ink)" : "var(--line2)",
    }));

  const cfgAgent = t.find((a) => a.id === pl.cfgAgentId) ?? sel;
  const creds = cfgAgent
    ? cfgAgent.integ.map((sys, i) => ({
        ref: sys.toLowerCase().replace(/[^a-z]/g, "") + "_api",
        system: sys,
        status: i === 0 ? "Connect" : "Connected",
        color: i === 0 ? "var(--ochre)" : "var(--forest)",
      }))
    : [];

  return {
    onPlanner: s.screen === "planner",
    plViewPlan: pl.view === "plan",
    plViewConfig: pl.view === "config",
    plTabFlow: pl.tab === "workflow", plTabTeam: pl.tab === "team", plTabUse: pl.tab === "usecases",
    plTabFlowBg: pl.tab === "workflow" ? "var(--ink)" : "transparent",
    plTabFlowFg: pl.tab === "workflow" ? "var(--paper)" : "var(--ink2)",
    plTabTeamBg: pl.tab === "team" ? "var(--ink)" : "transparent",
    plTabTeamFg: pl.tab === "team" ? "var(--paper)" : "var(--ink2)",
    plTabUseBg: pl.tab === "usecases" ? "var(--ink)" : "transparent",
    plTabUseFg: pl.tab === "usecases" ? "var(--paper)" : "var(--ink2)",
    plTeamCards: inPlan.map(mkCard),
    plLibrary: t.filter((a) => !a.inPlan).map((a) => ({
      id: a.id, name: a.name, role: a.role,
      priceLabel: "$" + a.price + "/mo",
      add: () => store().addAgent(a.id),
      dragStart: () => store().setDrag({ type: "add", id: a.id }),
    })),
    plNodes: inPlan.map((a) => ({
      name: a.name, role: a.role, gate: a.approval,
      dot: (SM[a.status] ?? SM.recommended).c,
      open: () => store().resolveAgent(a.id),
    })),
    plCover: cover, plCovered: covered, plUseTotal: cover.length,
    plPlannedCount: inPlan.length,
    plTotal: "$" + total, plLow: "$" + low, plHigh: "$" + high,
    plVer: "v" + (s.server?.plan?.version ?? 1),
    plStale: !!s.server?.plan?.stale,
    plCanUndo: (s.server?.planHistory.length ?? 0) > 0,
    plNl: pl.nlText, plNlBusy: pl.nlBusy,
    plDiff: pl.diff, plHasDiff: !!pl.diff,
    plCanConfirm: canConfirm, plCantConfirm: !canConfirm,
    plBlockerCount: blockers.length,
    aiandLive: !!s.providers?.aiand,
    cfgName: cfgAgent?.name ?? "",
    cfgModeDraftBd: cfg.mode === "draft" ? "var(--ink)" : "var(--line2)",
    cfgModeRoutineBd: cfg.mode === "routine" ? "var(--ink)" : "var(--line2)",
    cfgModeApprovalBd: cfg.mode === "approval" ? "var(--ink)" : "var(--line2)",
    cfgChannels: mkMulti("channels", ["Email", "Website chat", "Schedule", "File upload", "Agent event"]),
    cfgKnowledge: mkMulti("knowledge", ["Company brief", "FAQ", "Product catalog", "Connected system"]),
    cfgApprovals: mkMulti("approvals", ["Refunds", "Wholesale pricing", "Publishing", "Sensitive cases", "Financial"]),
    cfgTarget: mkSingle("target", ["< 5 min", "< 1 hour", "Same day"]),
    cfgHours: mkSingle("hours", ["24/7", "Business hours"]),
    cfgEsc: mkSingle("escalation", ["Founder", "Support lead", "Ops"]),
    cfgRetry: mkSingle("retry", ["No retry", "1 retry", "3 retries"]),
    cfgCreds: creds,
  };
}

/* ── design (custom agent) screen ────────────────────────────────────────── */
export function designVals(s: AppState) {
  const d = s.design;
  const c = DESIGN_CARDS[d.idx] ?? DESIGN_CARDS[0];
  const store = () => useApp.getState();
  const list = DESIGN_CARDS.map((cc, i) => ({
    short: cc.short,
    jump: () => store().dJump(i),
    dot: i < d.idx || d.phase === "done" ? "var(--forest)" : i === d.idx ? "var(--ink)" : "var(--line2)",
    bg: i === d.idx ? "var(--card)" : "transparent",
  }));
  const val = d.filled[c.id] ?? "";
  return {
    onDesign: s.screen === "design",
    dList: list,
    dAgentName: d.name || "custom agent",
    dDone: d.phase === "done",
    dInProgress: d.phase !== "done",
    dActive: d.active,
    dPaused: !d.active,
    dSpeaking: d.phase === "speaking",
    dCaption: d.phase === "speaking" ? d.typed : c.q,
    dCardId: c.id.toUpperCase(),
    dNum: d.idx + 1,
    dTotal: DESIGN_CARDS.length,
    dIsMaterials: c.type === "materials",
    dPh: c.ph,
    dFilledVal: val,
    dCanNext: val.trim().length > 0 || c.type === "materials",
    dTimer: mmss(d.startedAt),
    dStatus:
      d.phase === "speaking" ? "Margo is talking…"
        : d.phase === "user-talking" ? "Transcribing your voice…"
          : d.phase === "paused" ? "Paused" : "Listening — type or just talk",
    dUploaded: d.uploaded,
  };
}

/* ── build / validate / workspace / approvals ────────────────────────────── */
export function buildVals(s: AppState) {
  const inPlan = planned(s);
  const jobs = s.server?.buildJobs ?? {};
  const rows = inPlan.map((a) => {
    const j = jobs[a.id];
    const pct = j?.pct ?? 0;
    const stt = j?.status === "completed" ? "built" : j?.status === "running" && pct > 0 ? "building" : j ? "queued" : "queued";
    return {
      name: a.name, pct,
      statusLabel: stt,
      color: stt === "built" ? "var(--forest)" : stt === "building" ? "var(--ink)" : "var(--ink3)",
    };
  });
  const jobList = Object.values(jobs);
  const totalPct = jobList.length
    ? Math.round(jobList.reduce((x, j) => x + j.pct, 0) / jobList.length)
    : 0;
  const running = jobList.some((j) => j.status === "running" || j.status === "queued");
  const done = jobList.length > 0 && jobList.every((j) => j.status === "completed");
  const firstBuilt = inPlan.find((a) => s.server?.artifacts[a.id]);
  const files = firstBuilt ? s.server!.artifacts[firstBuilt.id].files.map((f) => f.path) : BUILD_FILES;
  return {
    onBuild: s.screen === "build",
    buildPctLabel: totalPct + "%",
    buildRows: rows,
    buildIdle: !running && !done,
    buildRunning: running,
    buildDone: done,
    buildWaves: BUILD_WAVES,
    buildFiles: files,
    buildFilesAgent: firstBuilt?.name ?? inPlan[0]?.name ?? "Front Desk",
    doublewordLive: !!s.providers?.doubleword,
  };
}

export function validateVals(s: AppState) {
  const inPlan = planned(s);
  const v = s.server?.validations ?? {};
  const runs = inPlan.map((a) => v[a.id]).filter(Boolean);
  const first = runs[0];
  const passed = runs.reduce((x, r) => x + r.tests.passed, 0);
  const failed = runs.reduce((x, r) => x + r.tests.failed, 0);
  const allOk = inPlan.length > 0 && inPlan.every((a) => v[a.id]?.status === "validated");
  const anyFailed = runs.some((r) => r.status === "failed");
  const validatedCount = runs.filter((r) => r.status === "validated").length;
  // every check row carries its own ok flag — no green ✓ on a failed check
  const checks = first
    ? [
        { k: "Schema validation", v: first.securityChecks.schema, ok: first.securityChecks.schema === "passed" },
        { k: "Secret scan", v: first.securityChecks.secret_scan, ok: first.securityChecks.secret_scan === "passed" },
        { k: "Tool allowlist", v: first.securityChecks.tool_allowlist, ok: first.securityChecks.tool_allowlist === "passed" },
        { k: "Permission policy", v: first.securityChecks.permission_policy, ok: first.securityChecks.permission_policy === "passed" },
        { k: "Unit tests", v: `${first.tests.passed} / ${first.tests.passed + first.tests.failed}`, ok: first.tests.failed === 0 },
        { k: "Packages validated", v: `${validatedCount} / ${inPlan.length}`, ok: validatedCount === inPlan.length },
      ]
    : VALIDATE_CHECKS.map((c) => ({ ...c, ok: true }));
  const jobs = Object.values(s.server?.buildJobs ?? {});
  const built = jobs.length > 0 && jobs.every((j) => j.status === "completed");
  return {
    onValidate: s.screen === "validate",
    validating: s.validating || (runs.length === 0 && !anyFailed),
    anyFailed,
    noBuilds: !built && runs.length === 0,
    firstAgentName: inPlan[0]?.name ?? "Front Desk",
    firstStatus: first?.status ?? "running",
    validateChecks: checks,
    sandboxId: first?.sandboxId ?? "…",
    artifactHash: first?.artifactHash ?? "sha256:…",
    testsLabel: runs.length ? `${passed} passed / ${failed} failed` : "running…",
    warningsLabel: runs.flatMap((r) => r.warnings).length
      ? runs.flatMap((r) => r.warnings).join(" · ")
      : "none",
    allValidated: allOk,
    daytonaLive: !!s.providers?.daytona,
    validationMode: first?.mode ?? (s.providers?.daytona ? "live" : "fixture"),
  };
}

export function workspaceVals(s: AppState) {
  const inPlan = planned(s);
  return {
    onWorkspace: s.screen === "workspace",
    roiHours: "63",
    roiValue: "$4,870",
    plannedCount: inPlan.length,
    plannedRows: inPlan.map((a) => ({ name: a.name, role: a.role, desc: a.desc })),
    events: (s.server?.events ?? []).map((e) => ({
      ...e,
      color: e.tone === "done" ? "var(--forest)" : e.tone === "ember" ? "var(--ember)" : "var(--ochre)",
    })),
    apNeed: (s.server?.approvals ?? []).filter((a) => a.status === "required").length,
  };
}

export function approvalsVals(s: AppState) {
  const store = () => useApp.getState();
  const approvals = s.server?.approvals ?? [];
  const sel0 = approvals.find((a) => a.id === s.approvalSel) ?? approvals[0];
  const apNeed = approvals.filter((a) => a.status === "required").length;
  const apRows = approvals.map((a) => {
    const meta =
      a.status === "required" ? { c: "var(--ember)", l: "Needs you" }
        : a.status === "approved" ? { c: "var(--forest)", l: "Approved" }
          : a.status === "rejected" ? { c: "var(--ink3)", l: "Rejected" }
            : { c: "var(--ink3)", l: "Done" };
    const isSel = sel0 && a.id === sel0.id;
    return {
      ...a,
      dot: meta.c, statusLabel: meta.l,
      bg: isSel ? "var(--card)" : "transparent",
      bd: isSel ? "var(--ink)" : "var(--line)",
      select: () => store().selectApproval(a.id),
    };
  });

  // calendar (July 2026 like the design, marks from the server)
  const marks = s.server?.calendar.marks ?? [];
  const markOf = new Map(marks.map((m) => [m.day, m]));
  const cells: { day: number; today?: boolean; dot?: string | null }[] = [];
  const startDay = new Date(2026, 6, 1).getDay();
  for (let i = 0; i < startDay; i++) cells.push({ day: 0 });
  for (let d = 1; d <= 31; d++) {
    const m = markOf.get(d);
    const dot = m?.color === "ember" ? "var(--ember)" : m?.color === "ochre" ? "var(--ochre)" : m?.color === "forest" ? "var(--forest)" : m?.color === "done" ? "var(--ink2)" : null;
    cells.push({ day: d, today: m?.today, dot });
  }
  while (cells.length % 7) cells.push({ day: 0 });
  const calWeeks: { day: string | number; bg: string; fg: string; dot: string | null }[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    calWeeks.push(
      cells.slice(i, i + 7).map((c) => ({
        day: c.day || "",
        bg: c.today ? "var(--ink)" : "transparent",
        fg: c.today ? "var(--paper)" : c.day ? "var(--ink)" : "transparent",
        dot: c.dot ?? null,
      })),
    );
  }

  const status = sel0?.status ?? "done";
  return {
    onApprovals: s.screen === "approvals",
    apNeed,
    apRows,
    apSel: sel0
      ? {
          ...sel0,
          statusLabel: status === "required" ? "Awaiting you" : status === "approved" ? "Approved" : status === "rejected" ? "Rejected" : "Closed",
          riskColor: sel0.risk === "High" ? "var(--ember)" : sel0.risk === "Medium" ? "var(--ochre)" : "var(--ink2)",
          isOpen: status === "required",
        }
      : null,
    apSelClosed: status !== "required",
    calMonth: s.server?.calendar.month ?? "July 2026",
    calWeeks,
  };
}

/* ── report screen ───────────────────────────────────────────────────────── */
export function reportVals(s: AppState) {
  const r = s.server?.report;
  return {
    onReport: s.screen === "report",
    hasReport: !!r,
    repVersion: r ? `v${r.version} · ${r.status}` : "…",
    repExec: r?.exec ?? "",
    repFacts: r?.facts ?? [],
    canvas: r?.canvas ?? [],
    repProcesses: r?.processes ?? [],
    repSystems: (r?.systems ?? []).map((x) => ({
      ...x,
      color:
        x.status === "Connected" ? "var(--forest)"
          : x.status === "Needs auth" ? "var(--ember)"
            : x.status === "Ready to connect" ? "var(--ochre)" : "var(--ink3)",
    })),
    repPain: r?.pain ?? [],
    repUseCases: (r?.useCases ?? []).map((x) => ({
      ...x,
      rc: x.risk === "High" ? "var(--ember)" : x.risk === "Medium" ? "var(--ochre)" : "var(--forest)",
    })),
    repConstraints: r?.constraints ?? [],
    history: r?.history ?? [],
    reportApproved: r?.status === "approved",
    reportNotApproved: r?.status !== "approved",
    approvedLabel: r?.status === "approved" ? `Locked as v${r.version} · sent to planning` : "",
    repToc: [
      { n: "01", label: "Executive summary" }, { n: "02", label: "Company snapshot" },
      { n: "03", label: "Lean Canvas" }, { n: "04", label: "Operations overview" },
      { n: "05", label: "Systems & data" }, { n: "06", label: "Pain points" },
      { n: "07", label: "Automation opportunities" }, { n: "08", label: "Constraints & approvals" },
      { n: "09", label: "Sources & confidence" }, { n: "10", label: "Phase 2 readiness" },
    ],
  };
}
