"use client";
/**
 * ScenarioMain — the main panel of the sandbox workspace (spec §14; S-01):
 * selected test description, INPUT panel, the EXPECTED BEHAVIOR line, the
 * aligned Run test / Stop / Run again controls, then the staged step
 * timeline (or the stress-test case content for the stress entry).
 */
import { ListChecks, PanelRight, Play, RotateCcw, Square } from "lucide-react";
import type { SandboxRunState, SandboxScenario } from "@/lib/mock/types";
import { STRESS_TEST } from "@/lib/mock/fixtures/sandbox-scenarios";
import { WF, WF_NAME } from "@/lib/mock/fixtures/ids";
import { ENTRY_CATEGORY, EXPECTED_BEHAVIOR, STRESS_ENTRY_ID } from "./stages";
import StageRail from "./StageRail";
import EventTimeline from "./EventTimeline";
import StressPanel from "./StressPanel";
import styles from "./sandbox.module.css";

/** Input rows for the stress entry (no fixture equivalent exists). */
const STRESS_INPUT: { label: string; value: string }[] = [
  { label: "Workflow", value: WF_NAME[WF.complaintResolution] },
  { label: "Cases", value: `${STRESS_TEST.total} deterministic edge cases` },
  {
    label: "Coverage",
    value: "Refund requests, escalations, missing data, quiet hours, bilingual messages",
  },
  { label: "Source", value: "Prepared demo set, replayed against the built workflow" },
];

const STRESS_DESCRIPTION =
  "Twenty edge cases replayed against the complaint workflow to probe policy limits, missing data and escalation rules before anything goes live.";

export default function ScenarioMain({
  selectedId,
  scenario,
  traceActive,
  phase,
  displayCount,
  pauseIdx,
  stopped,
  stressState,
  stressCase,
  runLabel,
  runIsPrimary,
  canRun,
  onRun,
  canStop,
  onStop,
  showOutputButton,
  onOpenOutput,
}: {
  selectedId: string;
  /** The selected scenario, or null for the stress entry. */
  scenario: SandboxScenario | null;
  traceActive: boolean;
  phase: SandboxRunState["phase"];
  displayCount: number;
  pauseIdx: number;
  stopped: boolean;
  stressState: "idle" | "running" | "done";
  stressCase: number;
  runLabel: string;
  runIsPrimary: boolean;
  canRun: boolean;
  onRun: () => void;
  canStop: boolean;
  onStop: () => void;
  /** Below 1024px the output panel lives in a drawer behind this button. */
  showOutputButton: boolean;
  onOpenOutput: () => void;
}) {
  const isStress = selectedId === STRESS_ENTRY_ID;
  const name = isStress ? "20-case stress test" : (scenario?.name ?? "");
  const description = isStress ? STRESS_DESCRIPTION : (scenario?.description ?? "");
  const input = isStress ? STRESS_INPUT : (scenario?.input ?? []);
  const expected = EXPECTED_BEHAVIOR[selectedId] ?? "";
  const category = ENTRY_CATEGORY[selectedId] ?? "";
  const isRerun = runLabel === "Run again";

  return (
    <div className={styles.mainCol}>
      {/* ── Selected test header ── */}
      <header className={styles.mainHead}>
        <div className={styles.mainTitleRow}>
          <h2 className="oa-h2" style={{ margin: 0 }}>
            {name}
          </h2>
          <span className="oa-tag oa-tag--neutral">{category}</span>
        </div>
        <p className="oa-sub" style={{ maxWidth: 640 }}>
          {description}
        </p>
      </header>

      {/* ── Input ── */}
      <section aria-label="Test input" style={{ display: "grid", gap: 8 }}>
        <p className="oa-micro">Input</p>
        <div className={`oa-panel ${styles.kvPanel}`}>
          {input.map((row) => (
            <div key={row.label} className={styles.kvRow}>
              <span className={styles.kvLabel}>{row.label}</span>
              <p className={styles.kvValue}>{row.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Expected behavior ── */}
      <div className={styles.expected}>
        <ListChecks size={16} aria-hidden className={styles.expectedIcon} />
        <p className={styles.expectedText}>
          <strong>Expected behavior: </strong>
          {expected}
        </p>
      </div>

      {/* ── Run controls (aligned, 44px) ── */}
      <div className={styles.runRow}>
        <button
          type="button"
          className={`oa-btn ${runIsPrimary ? "oa-btn--primary" : "oa-btn--ghost"}`}
          onClick={onRun}
          disabled={!canRun}
        >
          {isRerun ? <RotateCcw size={15} aria-hidden /> : <Play size={15} aria-hidden />}
          {runLabel}
        </button>
        <button
          type="button"
          className="oa-btn oa-btn--ghost"
          onClick={onStop}
          disabled={!canStop}
        >
          <Square size={14} aria-hidden />
          Stop
        </button>
        {showOutputButton && (
          <button type="button" className="oa-btn oa-btn--ghost" onClick={onOpenOutput}>
            <PanelRight size={15} aria-hidden />
            View output
          </button>
        )}
        <span className="oa-sim-note" style={{ marginLeft: "auto" }}>
          Simulated run. Nothing reaches real customers or systems.
        </span>
      </div>

      {/* ── Step timeline / stress cases ── */}
      {isStress ? (
        <StressPanel state={stressState} caseNum={stressCase} />
      ) : (
        scenario && (
          <section aria-label="Step timeline" style={{ display: "grid", gap: 14 }}>
            <StageRail
              scenario={scenario}
              traceActive={traceActive}
              phase={phase}
              displayCount={displayCount}
              stopped={stopped}
            />
            <EventTimeline
              scenario={scenario}
              displayCount={displayCount}
              phase={phase}
              pauseIdx={pauseIdx}
              stopped={stopped}
            />
          </section>
        )
      )}
    </div>
  );
}
