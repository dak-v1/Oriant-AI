"use client";
/**
 * SandboxScreen — the focused validation workspace (spec §14; S-01).
 *
 * Four zones:
 *  1. header summary strip: tests passed / remaining / critical failures /
 *     ready-for-activation chip
 *  2. left rail: the 3 scenarios + the 20-case stress test as a 4th entry
 *  3. main panel: description, input, expected behavior, run controls and
 *     the staged step timeline (Preparing → Running trigger → Agent action
 *     → Human checkpoint → Result)
 *  4. output panel: result summary, checkpoints, warnings, evidence
 *     (right column at >=1024px, a drawer below)
 *
 * The run is driven by mockSandboxService.run over the pre-pause and
 * post-pause slices of the scenario fixture; every handle is cancelled on
 * unmount so route changes never leave stale timers.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import { atLeast } from "@/lib/mock/state-machine";
import { mockSandboxService } from "@/lib/mock/services";
import { runTimeline, type TimelineHandle } from "@/lib/mock/services/timeline";
import { SANDBOX_SCENARIOS, STRESS_TEST } from "@/lib/mock/fixtures/sandbox-scenarios";
import { SCENARIO } from "@/lib/mock/fixtures/ids";
import { DUR, EASE } from "@/lib/mock/motion";
import Drawer from "@/components/mock/ui/Drawer";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { ENTRY_CATEGORY, STRESS_ENTRY_ID, type EntryStatus } from "./stages";
import ScenarioRail, { type RailEntry } from "./ScenarioRail";
import ScenarioMain from "./ScenarioMain";
import OutputPanel from "./OutputPanel";
import styles from "./sandbox.module.css";

const SCENARIO_LIST = Object.values(SANDBOX_SCENARIOS);
const TOTAL_TESTS = SCENARIO_LIST.length + 1; /* 3 scenarios + stress test */

/** True at >=1024px; the output panel moves into a drawer below that. */
function useWide(): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return wide;
}

export default function SandboxScreen() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const wide = useWide();

  const journey = useDemoStore((s) => s.journey);
  const phase = useDemoStore((s) => s.sandbox.phase);
  const runScenarioId = useDemoStore((s) => s.sandbox.scenarioId);
  const eventCount = useDemoStore((s) => s.sandbox.eventCount);
  const stressDone = useDemoStore((s) => s.sandbox.stressDone);

  const startSandboxRun = useDemoStore((s) => s.startSandboxRun);
  const setSandboxEventCount = useDemoStore((s) => s.setSandboxEventCount);
  const pauseSandboxForApproval = useDemoStore((s) => s.pauseSandboxForApproval);
  const completeSandboxRun = useDemoStore((s) => s.completeSandboxRun);
  const markStressDone = useDemoStore((s) => s.markStressDone);
  const finishValidation = useDemoStore((s) => s.finishValidation);

  /* Local UI state (never journey state — that lives in the store). */
  const [selectedLocal, setSelectedLocal] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const [stressLocal, setStressLocal] = useState<"running" | "done" | null>(null);
  const [stressCase, setStressCase] = useState(0);
  const [outputOpen, setOutputOpen] = useState(false);
  /* Scenarios completed this session; the store only remembers the last run. */
  const [passedLocal, setPassedLocal] = useState<ReadonlySet<string>>(() => new Set());
  const stressHandle = useRef<TimelineHandle | null>(null);

  const selectedId = selectedLocal ?? runScenarioId ?? SCENARIO.complaint;
  const isStressSelected = selectedId === STRESS_ENTRY_ID;
  const stressState: "idle" | "running" | "done" =
    stressLocal ?? (stressDone ? "done" : "idle");

  const selectedScenario = isStressSelected
    ? null
    : (SANDBOX_SCENARIOS[selectedId] ?? SCENARIO_LIST[0]);
  const runScenario = runScenarioId ? (SANDBOX_SCENARIOS[runScenarioId] ?? null) : null;
  const pauseIdxOfRun = runScenario
    ? runScenario.events.findIndex((e) => e.kind === "approval_pause")
    : -1;
  const pauseIdxSelected = selectedScenario
    ? selectedScenario.events.findIndex((e) => e.kind === "approval_pause")
    : -1;

  /* Record completed scenarios (also seeds from a persisted completed run). */
  useEffect(() => {
    if (phase === "completed" && runScenarioId) {
      setPassedLocal((prev) => {
        if (prev.has(runScenarioId)) return prev;
        const next = new Set(prev);
        next.add(runScenarioId);
        return next;
      });
    }
  }, [phase, runScenarioId]);

  const scenarioRunActive =
    (!stopped && (phase === "running" || phase === "resuming")) ||
    phase === "paused_for_approval";
  const locked = scenarioRunActive || stressState === "running";
  const bannerVisible =
    (phase === "completed" || phase === "idle") && atLeast(journey, "validation_review");
  const ready = atLeast(journey, "validation_review");

  const runDisplayCount = !runScenario
    ? 0
    : phase === "paused_for_approval"
      ? Math.max(Math.min(eventCount, runScenario.events.length), pauseIdxOfRun + 1)
      : Math.min(eventCount, runScenario.events.length);

  /* The main panel shows the SELECTED test; its trace only exists when the
     store's last run belongs to that same scenario. */
  const traceActive =
    !isStressSelected && runScenarioId === selectedId && phase !== "idle";

  /* ── Entry statuses (icon + label in the rail; numbers in the strip) ── */
  const statusOf = (id: string): EntryStatus => {
    if (runScenarioId === id) {
      if ((phase === "running" || phase === "resuming") && stopped) return "stopped";
      if (phase === "running" || phase === "resuming") return "running";
      if (phase === "paused_for_approval") return "needs_review";
      if (phase === "completed") return "passed";
    }
    return passedLocal.has(id) ? "passed" : "not_run";
  };
  const stressStatus: EntryStatus =
    stressState === "running" ? "running" : stressState === "done" ? "needs_review" : "not_run";

  const entries: RailEntry[] = [
    ...SCENARIO_LIST.map((sc) => ({
      id: sc.id,
      name: sc.name,
      category: ENTRY_CATEGORY[sc.id] ?? "Customer care",
      status: statusOf(sc.id),
    })),
    {
      id: STRESS_ENTRY_ID,
      name: "20-case stress test",
      category: ENTRY_CATEGORY[STRESS_ENTRY_ID],
      status: stressStatus,
      passNote:
        stressState === "done"
          ? `${STRESS_TEST.passed} of ${STRESS_TEST.total} passed`
          : undefined,
    },
  ];

  const statuses = entries.map((e) => e.status);
  const passedCount = statuses.filter((s) => s === "passed").length;
  const remainingCount = statuses.filter((s) => s === "not_run" || s === "stopped").length;
  const scenariosRun = SCENARIO_LIST.filter((sc) => {
    const st = statusOf(sc.id);
    return st === "passed" || st === "needs_review" || st === "running";
  }).length;

  const chip = ready
    ? { status: "completed", label: "Ready for activation" }
    : locked
      ? { status: "active", label: "Validation in progress" }
      : { status: "idle", label: `${scenariosRun} of ${SCENARIO_LIST.length} scenarios run` };

  /* ── Drive the run: pre-pause slice while "running", post-pause while
        "resuming". Also reconciles a mid-run refresh by resuming from the
        persisted eventCount. Handle cancelled on unmount/phase change. ── */
  useEffect(() => {
    if (stopped) return;
    if (phase !== "running" && phase !== "resuming") return;
    const scenario = runScenarioId ? SANDBOX_SCENARIOS[runScenarioId] : undefined;
    if (!scenario) return;

    const events = scenario.events;
    const pause = events.findIndex((e) => e.kind === "approval_pause");
    const isPre = phase === "running";
    const endIdx = isPre && pause >= 0 ? pause : events.length - 1;
    const floor = !isPre && pause >= 0 ? pause + 1 : 0;
    const startCount = Math.max(useDemoStore.getState().sandbox.eventCount, floor);

    const finalize = () => {
      if (isPre && pause >= 0) pauseSandboxForApproval();
      else completeSandboxRun();
    };

    if (startCount > endIdx) {
      finalize();
      return;
    }

    /* Normalise offsets so a resumed slice starts near zero. */
    const base = startCount > floor ? events[startCount - 1].at : 0;
    const handle = mockSandboxService.run(
      events.slice(startCount, endIdx + 1).map((e) => ({ at: Math.max(0, e.at - base) })),
      (i) => setSandboxEventCount(startCount + i + 1),
      { instant: Boolean(reduced) },
    );
    handle.done.then((finished) => {
      if (finished) finalize();
    });
    return () => handle.cancel();
    // Actions are stable store references; eventCount is read via getState so
    // the timeline is not restarted on every revealed event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, runScenarioId, reduced, stopped]);

  /* Cancel a stress run left in flight when leaving the page. */
  useEffect(() => () => stressHandle.current?.cancel(), []);

  /* Growing past 1024px: the output column takes over from the drawer. */
  useEffect(() => {
    if (wide) setOutputOpen(false);
  }, [wide]);

  const startStress = () => {
    setStressLocal("running");
    setStressCase(0);
    stressHandle.current = runTimeline(
      Array.from({ length: STRESS_TEST.total }, (_, i) => ({ delay: 200, emit: i + 1 })),
      (n) => setStressCase(n),
      { instant: Boolean(reduced) },
    );
    stressHandle.current.done.then((finished) => {
      if (!finished) return;
      setStressLocal("done");
      markStressDone();
    });
  };

  const onRun = () => {
    if (locked) return;
    if (isStressSelected) {
      startStress();
      return;
    }
    setStopped(false);
    startSandboxRun(selectedId);
  };

  const canStop = isStressSelected
    ? stressState === "running"
    : runScenarioId === selectedId && (phase === "running" || phase === "resuming") && !stopped;

  const onStop = () => {
    if (isStressSelected) {
      if (stressState !== "running") return;
      stressHandle.current?.cancel();
      setStressLocal(null);
      setStressCase(0);
      return;
    }
    if (!canStop) return;
    setStopped(true);
  };

  const onContinue = () => {
    finishValidation();
    router.push("/app/deploy");
  };

  const selectedStatus = isStressSelected ? stressStatus : statusOf(selectedId);
  const runLabel =
    selectedStatus === "running"
      ? "Running…"
      : !isStressSelected && selectedStatus === "needs_review"
        ? "Paused for your approval"
        : selectedStatus === "passed" ||
            selectedStatus === "stopped" ||
            (isStressSelected && stressState === "done")
          ? "Run again"
          : "Run test";
  const canRun = !locked;
  const runIsPrimary = canRun && !bannerVisible;

  const entryName = isStressSelected
    ? "20-case stress test"
    : (selectedScenario?.name ?? "Scenario");

  const output = (
    <OutputPanel
      isStress={isStressSelected}
      scenario={selectedScenario}
      traceActive={traceActive}
      phase={traceActive ? phase : "idle"}
      displayCount={traceActive ? runDisplayCount : 0}
      stopped={traceActive && stopped}
      stressState={stressState}
    />
  );

  return (
    <main className="oa-page">
      <header className="oa-between" style={{ marginBottom: 20, alignItems: "flex-start" }}>
        <div style={{ display: "grid", gap: 6, maxWidth: 680 }}>
          <p className="oa-eyebrow">Test · Sandbox &amp; stress test</p>
          <h1 className="oa-h1">
            Test the workforce in a <span className="oa-serif">safe</span> sandbox
          </h1>
          <p className="oa-lead">
            Run realistic BrightPath cases end to end. Every step is visible, risky actions pause
            for your approval, and nothing ever reaches a real customer.
          </p>
        </div>
      </header>

      {/* ── Zone 1: header summary strip ── */}
      <section className={styles.summary} aria-label="Validation summary">
        <div className={styles.summaryItem}>
          <p className="oa-micro">Tests passed</p>
          <p className={styles.summaryValue}>
            {passedCount}
            <span className={styles.summaryOf}>of {TOTAL_TESTS}</span>
          </p>
          <p className={styles.summaryNote}>3 scenarios plus the stress test.</p>
        </div>
        <div className={styles.summaryItem}>
          <p className="oa-micro">Tests remaining</p>
          <p className={styles.summaryValue}>{remainingCount}</p>
          <p className={styles.summaryNote}>Not yet run in this sandbox.</p>
        </div>
        <div className={styles.summaryItem}>
          <p className="oa-micro">Critical failures</p>
          <p className={styles.summaryValue}>0</p>
          <p className={styles.summaryNote}>
            {stressState === "done"
              ? "The one stress-test failure stopped safely; no customer contact."
              : "None so far."}
          </p>
        </div>
        <div className={styles.summaryItem}>
          <p className="oa-micro">Ready for activation</p>
          <div>
            <StatusBadge status={chip.status} label={chip.label} />
          </div>
          <p className={styles.summaryNote}>
            {ready
              ? "Continue whenever you are ready."
              : "Complete at least one scenario run."}
          </p>
        </div>
      </section>

      {bannerVisible && (
        <motion.section
          className={styles.banner}
          initial={reduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DUR.card, ease: EASE }}
          aria-label="Validation complete"
        >
          <span className={styles.bannerIcon} aria-hidden>
            <ShieldCheck size={20} />
          </span>
          <div className={styles.bannerBody}>
            <h2 className="oa-h3">
              Validation complete: the workforce behaved exactly as designed
            </h2>
            <p className="oa-sub">
              {runScenario
                ? `“${runScenario.name}” completed within policy, with risky actions held for your decision.`
                : "The test run completed within policy."}
              {!stressDone &&
                " Optional but worthwhile: the 20-case stress test shows how edge cases behave."}
            </p>
          </div>
          <button type="button" className="oa-btn oa-btn--primary" onClick={onContinue}>
            Continue to activation
            <ArrowRight size={15} aria-hidden />
          </button>
        </motion.section>
      )}

      <div className={styles.layout}>
        {/* ── Zone 2: left rail ── */}
        <ScenarioRail
          entries={entries}
          selectedId={selectedId}
          onSelect={(id) => setSelectedLocal(id)}
          locked={locked}
        />

        {/* ── Zone 3: main panel ── */}
        <ScenarioMain
          selectedId={selectedId}
          scenario={selectedScenario}
          traceActive={traceActive}
          phase={traceActive ? phase : "idle"}
          displayCount={traceActive ? runDisplayCount : 0}
          pauseIdx={pauseIdxSelected}
          stopped={traceActive && stopped}
          stressState={stressState}
          stressCase={stressCase}
          runLabel={runLabel}
          runIsPrimary={runIsPrimary}
          canRun={canRun}
          onRun={onRun}
          canStop={canStop}
          onStop={onStop}
          showOutputButton={!wide}
          onOpenOutput={() => setOutputOpen(true)}
        />

        {/* ── Zone 4: output panel (right column at >=1024px) ── */}
        <aside className={styles.outputCol} aria-label="Test output">
          <div className={styles.railHead}>
            <p className="oa-micro">Output</p>
            <span className="oa-sub" style={{ fontSize: 11.5 }}>
              {entryName}
            </span>
          </div>
          {output}
        </aside>
      </div>

      {/* Output drawer below 1024px */}
      {!wide && (
        <Drawer
          open={outputOpen}
          onClose={() => setOutputOpen(false)}
          title="Output"
          eyebrow={entryName}
        >
          {output}
        </Drawer>
      )}
    </main>
  );
}
