"use client";
/**
 * SandboxScreen — Sandbox + stress test (spec §15; §20 "Sandbox" row; §22
 * timing). Orchestrates the whole experience:
 *
 *  - left: scenario selector, input panel, run controls, result + logs
 *  - right: the animated event timeline with the human-approval interception
 *  - the 20-case stress test (fast progress strip → summary + failed-case review)
 *  - the validation banner → finishValidation() → /app/deploy
 *
 * The run itself is driven by mockSandboxService.run over the pre-pause and
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
import ScenarioPanel from "./ScenarioPanel";
import EventTimeline from "./EventTimeline";
import StressPanel from "./StressPanel";
import styles from "./sandbox.module.css";

const SCENARIO_LIST = Object.values(SANDBOX_SCENARIOS);

export default function SandboxScreen() {
  const router = useRouter();
  const reduced = useReducedMotion();

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
  const [view, setView] = useState<"run" | "stress">("run");
  const [stressLocal, setStressLocal] = useState<"running" | "done" | null>(null);
  const [stressCase, setStressCase] = useState(0);
  const stressHandle = useRef<TimelineHandle | null>(null);

  const selectedId = selectedLocal ?? runScenarioId ?? SCENARIO.complaint;
  const stressState: "idle" | "running" | "done" =
    stressLocal ?? (stressDone ? "done" : "idle");

  const runScenario = runScenarioId ? (SANDBOX_SCENARIOS[runScenarioId] ?? null) : null;
  const pauseIdx = runScenario
    ? runScenario.events.findIndex((e) => e.kind === "approval_pause")
    : -1;

  const runActive =
    phase === "running" || phase === "resuming" || phase === "paused_for_approval";
  const bannerVisible =
    (phase === "completed" || phase === "idle") && atLeast(journey, "validation_review");
  const canRun = !runActive && stressState !== "running";
  const canStress = !runActive && stressState !== "running";
  const runIsPrimary = canRun && !bannerVisible;
  const activeView: "run" | "stress" =
    stressState === "running" ? "stress" : stressState === "done" ? view : "run";

  const displayCount = !runScenario
    ? 0
    : phase === "paused_for_approval"
      ? Math.max(Math.min(eventCount, runScenario.events.length), pauseIdx + 1)
      : Math.min(eventCount, runScenario.events.length);

  /* ── Drive the run: pre-pause slice while "running", post-pause while
        "resuming". Also reconciles a mid-run refresh by resuming from the
        persisted eventCount. Handle cancelled on unmount/phase change. ── */
  useEffect(() => {
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
  }, [phase, runScenarioId, reduced]);

  /* Cancel a stress run left in flight when leaving the page. */
  useEffect(() => () => stressHandle.current?.cancel(), []);

  const onRun = () => {
    if (!canRun) return;
    setView("run");
    startSandboxRun(selectedId);
  };

  const onStress = () => {
    if (!canStress) return;
    setView("stress");
    if (stressState === "done") return;
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

  const onContinue = () => {
    finishValidation();
    router.push("/app/deploy");
  };

  const onTablistKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setView((v) => (v === "run" ? "stress" : "run"));
  };

  return (
    <main className="oa-page">
      <header className="oa-between" style={{ marginBottom: 24, alignItems: "flex-start" }}>
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

      {bannerVisible && (
        <motion.section
          className={styles.banner}
          initial={reduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DUR.card, ease: EASE }}
          aria-label="Validation summary"
        >
          <span className={styles.bannerIcon} aria-hidden>
            <ShieldCheck size={20} />
          </span>
          <div className={styles.bannerBody}>
            <h2 className="oa-h3">Validation complete — the workforce behaved exactly as designed</h2>
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
        <ScenarioPanel
          scenarios={SCENARIO_LIST}
          selectedId={selectedId}
          onSelect={(id) => setSelectedLocal(id)}
          selectionLocked={runActive || stressState === "running"}
          runScenarioId={runScenarioId}
          phase={phase}
          runIsPrimary={runIsPrimary}
          canRun={canRun}
          onRun={onRun}
          stressState={stressState}
          canStress={canStress}
          onStress={onStress}
        />

        <div className={styles.mainCol}>
          {stressState === "done" && (
            <div className={styles.viewRow}>
              <div
                className="oa-tabs"
                role="tablist"
                aria-label="Sandbox views"
                onKeyDown={onTablistKeyDown}
              >
                <button
                  type="button"
                  role="tab"
                  id="sbx-tab-run"
                  aria-selected={activeView === "run"}
                  aria-controls="sbx-view-panel"
                  className={`oa-tab ${activeView === "run" ? "oa-tab--active" : ""}`}
                  onClick={() => setView("run")}
                >
                  Scenario run
                </button>
                <button
                  type="button"
                  role="tab"
                  id="sbx-tab-stress"
                  aria-selected={activeView === "stress"}
                  aria-controls="sbx-view-panel"
                  className={`oa-tab ${activeView === "stress" ? "oa-tab--active" : ""}`}
                  onClick={() => setView("stress")}
                >
                  Stress test
                </button>
              </div>
            </div>
          )}

          <div
            id="sbx-view-panel"
            {...(stressState === "done"
              ? {
                  role: "tabpanel",
                  "aria-labelledby": activeView === "run" ? "sbx-tab-run" : "sbx-tab-stress",
                }
              : {})}
          >
            {activeView === "stress" && stressState !== "idle" ? (
              <StressPanel
                state={stressState === "running" ? "running" : "done"}
                caseNum={stressCase}
              />
            ) : (
              <EventTimeline
                scenario={runScenario}
                displayCount={displayCount}
                phase={phase}
                pauseIdx={pauseIdx}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
