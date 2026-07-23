"use client";
/**
 * ScenarioPanel — the left column of the sandbox (spec §15): scenario
 * selector cards, the INPUT SCENARIO key-value panel, the run controls,
 * and — after a completed run — the RESULT panel and the LOGS accordion.
 */
import { useState } from "react";
import { ChevronDown, FlaskConical, Play } from "lucide-react";
import type { SandboxRunState, SandboxScenario } from "@/lib/mock/types";
import { AGENT_NAME, WF_NAME } from "@/lib/mock/fixtures/ids";
import { STRESS_TEST } from "@/lib/mock/fixtures/sandbox-scenarios";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import styles from "./sandbox.module.css";

function fmtOffset(ms: number): string {
  return `+${(ms / 1000).toFixed(1)}s`;
}

export default function ScenarioPanel({
  scenarios,
  selectedId,
  onSelect,
  selectionLocked,
  runScenarioId,
  phase,
  runIsPrimary,
  canRun,
  onRun,
  stressState,
  canStress,
  onStress,
}: {
  scenarios: SandboxScenario[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** True while a run / pause / stress test is active — no switching mid-run. */
  selectionLocked: boolean;
  /** Scenario of the current/last run (store), for result + status badges. */
  runScenarioId: string | null;
  phase: SandboxRunState["phase"];
  runIsPrimary: boolean;
  canRun: boolean;
  onRun: () => void;
  stressState: "idle" | "running" | "done";
  canStress: boolean;
  onStress: () => void;
}) {
  const [logsOpen, setLogsOpen] = useState(false);
  const selected = scenarios.find((s) => s.id === selectedId) ?? scenarios[0];
  const showResult =
    phase === "completed" && runScenarioId === selected.id;
  const resultEvent = showResult
    ? [...selected.events].reverse().find((e) => e.kind === "result")
    : undefined;

  const runLabel =
    phase === "running" || phase === "resuming"
      ? "Running…"
      : phase === "paused_for_approval"
        ? "Paused for your approval"
        : showResult
          ? "Run again"
          : "Run test";

  return (
    <div className={styles.left}>
      {/* ── Scenario selector ── */}
      <section aria-label="Workflow scenarios" style={{ display: "grid", gap: 10 }}>
        <p className="oa-micro">Scenarios</p>
        <div className={styles.scenarioList}>
          {scenarios.map((sc) => {
            const isSelected = sc.id === selectedId;
            const isRun = runScenarioId === sc.id;
            return (
              <button
                key={sc.id}
                type="button"
                className={`oa-card oa-card--flat ${isSelected ? "oa-card--selected" : ""} ${styles.scenarioCard}`}
                aria-pressed={isSelected}
                disabled={selectionLocked && !isSelected}
                onClick={() => onSelect(sc.id)}
              >
                <div className={styles.scenarioTop}>
                  <p className={styles.scenarioName}>{sc.name}</p>
                  {isRun && phase === "completed" && (
                    <StatusBadge status="completed" label="Tested" />
                  )}
                  {isRun && (phase === "running" || phase === "resuming") && (
                    <StatusBadge status="active" label="Running" />
                  )}
                  {isRun && phase === "paused_for_approval" && (
                    <StatusBadge status="pending" label="Paused" />
                  )}
                </div>
                <p className={styles.scenarioDesc}>{sc.description}</p>
                <div className={styles.scenarioMeta}>
                  <span className="oa-tag oa-tag--neutral">{WF_NAME[sc.workflowId]}</span>
                  <span className="oa-sub" style={{ fontSize: 11.5 }}>
                    {AGENT_NAME[sc.agentId]}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Input scenario ── */}
      <section aria-label="Input scenario" style={{ display: "grid", gap: 10 }}>
        <p className="oa-micro">Input scenario</p>
        <div className={`oa-panel ${styles.kvPanel}`}>
          {selected.input.map((row) => (
            <div key={row.label} className={styles.kvRow}>
              <span className={styles.kvLabel}>{row.label}</span>
              <p className={styles.kvValue}>{row.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Run controls ── */}
      <div className={styles.runRow}>
        <button
          type="button"
          className={`oa-btn ${runIsPrimary ? "oa-btn--primary" : "oa-btn--ghost"}`}
          onClick={onRun}
          disabled={!canRun}
        >
          <Play size={15} aria-hidden />
          {runLabel}
        </button>
        <button
          type="button"
          className="oa-btn oa-btn--ghost"
          onClick={onStress}
          disabled={!canStress}
        >
          <FlaskConical size={15} aria-hidden />
          {stressState === "running"
            ? "Stress test running…"
            : stressState === "done"
              ? "View stress-test results"
              : "Run 20-case stress test"}
        </button>
        {stressState === "done" && (
          <p className="oa-sub" style={{ fontSize: 11.5 }}>
            Stress test: {STRESS_TEST.passed} passed · {STRESS_TEST.escalated} escalated correctly ·{" "}
            {STRESS_TEST.failed} failed safely
          </p>
        )}
        <span className="oa-sim-note">
          Simulated run — nothing reaches real customers or systems.
        </span>
      </div>

      {/* ── Result panel (after a completed run of the selected scenario) ── */}
      {showResult && resultEvent && (
        <section aria-label="Test result" style={{ display: "grid", gap: 10 }}>
          <p className="oa-micro">Result</p>
          <div className={`oa-card oa-card--flat ${styles.resultCard}`}>
            <div style={{ display: "grid", gap: 6 }}>
              <StatusBadge status="completed" label="Completed within policy" />
              <h3 className="oa-h3">{resultEvent.title}</h3>
              <p className="oa-sub">{resultEvent.detail}</p>
            </div>
            <hr className="oa-divider" />
            <div className={styles.metricList}>
              {selected.metrics.map((m) => (
                <div key={m.label} className={styles.metricRow}>
                  <span className={styles.metricLabel}>{m.label}</span>
                  <span className={styles.metricValue}>{m.value}</span>
                </div>
              ))}
            </div>
            <span className="oa-sim-note">Prepared demo result — metrics are illustrative.</span>
          </div>
        </section>
      )}

      {/* ── Logs accordion ── */}
      {showResult && (
        <section aria-label="Run logs">
          <button
            type="button"
            className={styles.accBtn}
            aria-expanded={logsOpen}
            onClick={() => setLogsOpen((v) => !v)}
          >
            Run log · {selected.events.length} events
            <ChevronDown
              size={15}
              aria-hidden
              className={`${styles.accChevron} ${logsOpen ? styles.accChevronOpen : ""}`}
            />
          </button>
          {logsOpen && (
            <div className={styles.logBox} style={{ marginTop: 8 }} tabIndex={0}>
              {selected.events.map((ev) => (
                <p key={ev.id} className={styles.logLine}>
                  <span className={styles.logTime}>[{fmtOffset(ev.at)}]</span>{" "}
                  <span className={styles.logTitle}>{ev.title}</span> — {ev.detail}
                </p>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
