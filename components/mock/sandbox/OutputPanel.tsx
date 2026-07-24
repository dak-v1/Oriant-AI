"use client";
/**
 * OutputPanel — the OUTPUT zone of the sandbox workspace (spec §14; S-01):
 * result summary, approval checkpoints, warnings and generated evidence
 * (scenario metrics + a compact log accordion). Stress-test results render
 * here too (18 passed / 1 escalated / 1 failed with the explanation).
 *
 * Pure content: SandboxScreen mounts it in the right column at >=1024px and
 * inside a Drawer below that.
 */
import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  FileText,
  Inbox,
  ShieldCheck,
  TriangleAlert,
  UserCheck,
  XCircle,
} from "lucide-react";
import type { SandboxRunState, SandboxScenario } from "@/lib/mock/types";
import { STRESS_TEST } from "@/lib/mock/fixtures/sandbox-scenarios";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import styles from "./sandbox.module.css";

function fmtOffset(ms: number): string {
  return `+${(ms / 1000).toFixed(1)}s`;
}

function QuietNote({ title, note }: { title: string; note: string }) {
  return (
    <div className={`oa-panel ${styles.outEmpty}`}>
      <span className={styles.emptyIcon} aria-hidden style={{ width: 36, height: 36 }}>
        <Inbox size={16} />
      </span>
      <p className={styles.outRowTitle}>{title}</p>
      <p className="oa-sub">{note}</p>
    </div>
  );
}

/* ── Scenario output ── */

function ScenarioOutput({
  scenario,
  traceActive,
  phase,
  displayCount,
  stopped,
}: {
  scenario: SandboxScenario;
  traceActive: boolean;
  phase: SandboxRunState["phase"];
  displayCount: number;
  stopped: boolean;
}) {
  const [logsOpen, setLogsOpen] = useState(false);

  const revealed = traceActive
    ? scenario.events.slice(0, Math.min(displayCount, scenario.events.length))
    : [];
  const completed = traceActive && phase === "completed";
  const paused = traceActive && phase === "paused_for_approval" && !stopped;
  const runningNow =
    traceActive && (phase === "running" || phase === "resuming") && !stopped;

  const pauseIdx = scenario.events.findIndex((e) => e.kind === "approval_pause");
  const hasCheckpoint = pauseIdx >= 0;
  const checkpointResolved = traceActive && hasCheckpoint && displayCount > pauseIdx + 1;
  const resultEvent = completed
    ? [...scenario.events].reverse().find((e) => e.kind === "result")
    : undefined;
  /* Deterministic warning derivation: flagged items surfaced by the run. */
  const warnings = revealed.filter((e) => /flagged/i.test(e.title));

  if (!traceActive || (revealed.length === 0 && !runningNow)) {
    return (
      <QuietNote
        title="No output yet"
        note="Run this test to generate the result summary, checkpoints and evidence."
      />
    );
  }

  return (
    <>
      {/* Result summary */}
      <div className={styles.outSection}>
        <p className="oa-micro">Result summary</p>
        {completed && resultEvent ? (
          <div className={`oa-card oa-card--flat ${styles.outCard}`}>
            <StatusBadge status="completed" label="Completed within policy" />
            <div style={{ display: "grid", gap: 4 }}>
              <h3 className="oa-h3">{resultEvent.title}</h3>
              <p className="oa-sub">{resultEvent.detail}</p>
            </div>
          </div>
        ) : stopped ? (
          <div className={`oa-panel ${styles.outRow}`}>
            <p className="oa-sub" style={{ margin: 0 }}>
              Run stopped by you after {revealed.length} of {scenario.events.length} steps. Run
              again to complete the test.
            </p>
          </div>
        ) : paused ? (
          <div className={`oa-panel ${styles.outRow}`}>
            <p className="oa-sub" style={{ margin: 0 }}>
              Paused at the human checkpoint. Approve the proposed resolution in the timeline to
              finish the run.
            </p>
          </div>
        ) : (
          <div className={`oa-panel ${styles.outRow}`}>
            <p className="oa-sub" style={{ margin: 0 }} aria-live="polite">
              Run in progress: {revealed.length} of {scenario.events.length} steps completed.
            </p>
          </div>
        )}
      </div>

      {/* Approval checkpoints */}
      <div className={styles.outSection}>
        <p className="oa-micro">Approval checkpoints</p>
        {hasCheckpoint ? (
          <div className={styles.outRow}>
            <UserCheck
              size={15}
              aria-hidden
              className={styles.outRowIcon}
              style={{
                color: checkpointResolved ? "var(--oa-teal-deep)" : "var(--oa-amber-ink)",
              }}
            />
            <div className={styles.outRowBody}>
              <p className={styles.outRowTitle}>Owner approval</p>
              <p className="oa-sub">
                {checkpointResolved
                  ? "Resolved by you. Only the approved text was used."
                  : paused
                    ? "Waiting for your decision in the timeline."
                    : displayCount > pauseIdx
                      ? "Reached, waiting to resolve."
                      : "Not reached yet."}
              </p>
            </div>
            <StatusBadge
              status={checkpointResolved ? "approved" : "pending"}
              label={checkpointResolved ? "Approved" : "Waiting"}
            />
          </div>
        ) : (
          <p className="oa-sub">No human checkpoint is required for this scenario.</p>
        )}
      </div>

      {/* Warnings */}
      <div className={styles.outSection}>
        <p className="oa-micro">Warnings</p>
        {warnings.length > 0 ? (
          warnings.map((w) => (
            <div key={w.id} className={styles.outRow}>
              <TriangleAlert
                size={15}
                aria-hidden
                className={styles.outRowIcon}
                style={{ color: "var(--oa-amber-ink)" }}
              />
              <div className={styles.outRowBody}>
                <p className={styles.outRowTitle}>{w.title}</p>
                <p className="oa-sub">{w.detail}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="oa-sub">No warnings raised in this run.</p>
        )}
      </div>

      {/* Generated evidence */}
      {completed && (
        <div className={styles.outSection}>
          <p className="oa-micro">Generated evidence</p>
          <div className={`oa-card oa-card--flat ${styles.outCard}`}>
            <div className={styles.metricList}>
              {scenario.metrics.map((m) => (
                <div key={m.label} className={styles.metricRow}>
                  <span className={styles.metricLabel}>{m.label}</span>
                  <span className={styles.metricValue}>{m.value}</span>
                </div>
              ))}
            </div>
            <span className="oa-sim-note">Prepared demo result. Metrics are illustrative.</span>
          </div>
          <button
            type="button"
            className={styles.accBtn}
            aria-expanded={logsOpen}
            onClick={() => setLogsOpen((v) => !v)}
          >
            <FileText size={14} aria-hidden />
            Run log · {scenario.events.length} events
            <ChevronDown
              size={15}
              aria-hidden
              className={`${styles.accChevron} ${logsOpen ? styles.accChevronOpen : ""}`}
            />
          </button>
          {logsOpen && (
            <div className={styles.logBox} tabIndex={0}>
              {scenario.events.map((ev) => (
                <p key={ev.id} className={styles.logLine}>
                  <span className={styles.logTime}>[{fmtOffset(ev.at)}]</span>{" "}
                  <span className={styles.logTitle}>{ev.title}</span> · {ev.detail}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ── Stress-test output ── */

function StressOutput({ state }: { state: "idle" | "running" | "done" }) {
  const failedCase = STRESS_TEST.cases.find((c) => c.outcome === "failed");

  if (state === "idle") {
    return (
      <QuietNote
        title="No output yet"
        note="Run the stress test to generate the pass/fail summary and the failure explanation."
      />
    );
  }
  if (state === "running") {
    return (
      <QuietNote
        title="Stress test in progress"
        note="The summary appears here once all 20 cases have been replayed."
      />
    );
  }

  return (
    <>
      <div className={styles.outSection}>
        <p className="oa-micro">Result summary</p>
        <div className={`oa-card oa-card--flat ${styles.outCard}`}>
          <StatusBadge status="review_requested" label="Needs review" />
          <div style={{ display: "grid", gap: 4 }}>
            <h3 className="oa-h3">
              {STRESS_TEST.passed} of {STRESS_TEST.total} cases handled exactly as designed
            </h3>
            <p className="oa-sub">
              One case escalated to you correctly and one stopped safely. No customer was
              contacted in any case.
            </p>
          </div>
        </div>
        <div className={styles.outStat}>
          <CheckCircle2 size={15} aria-hidden style={{ color: "var(--oa-teal-deep)" }} />
          Passed
          <span className={styles.outStatNum} style={{ color: "var(--oa-teal-deep)" }}>
            {STRESS_TEST.passed}
          </span>
        </div>
        <div className={styles.outStat}>
          <TriangleAlert size={15} aria-hidden style={{ color: "var(--oa-amber-ink)" }} />
          Escalated correctly
          <span className={styles.outStatNum} style={{ color: "var(--oa-amber-ink)" }}>
            {STRESS_TEST.escalated}
          </span>
        </div>
        <div className={styles.outStat}>
          <XCircle size={15} aria-hidden style={{ color: "var(--oa-red-ink)" }} />
          Failed safely
          <span className={styles.outStatNum} style={{ color: "var(--oa-red-ink)" }}>
            {STRESS_TEST.failed}
          </span>
        </div>
      </div>

      {failedCase && (
        <div className={styles.outSection}>
          <p className="oa-micro">Failed-case review</p>
          <div className={`oa-card oa-card--flat ${styles.outCard}`}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldCheck size={16} aria-hidden style={{ color: "var(--oa-teal-deep)" }} />
              <h3 className="oa-h3" style={{ margin: 0 }}>
                Case #{failedCase.id}: {failedCase.name}
              </h3>
            </div>
            <p className={styles.failQuote}>{STRESS_TEST.failureExplanation}</p>
            <p className="oa-sub">
              This is exactly what the sandbox is for: the gap surfaced here, safely, instead of
              in front of a real customer.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Panel ── */

export default function OutputPanel({
  isStress,
  scenario,
  traceActive,
  phase,
  displayCount,
  stopped,
  stressState,
}: {
  isStress: boolean;
  scenario: SandboxScenario | null;
  traceActive: boolean;
  phase: SandboxRunState["phase"];
  displayCount: number;
  stopped: boolean;
  stressState: "idle" | "running" | "done";
}) {
  return (
    <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
      {isStress || !scenario ? (
        <StressOutput state={stressState} />
      ) : (
        <ScenarioOutput
          scenario={scenario}
          traceActive={traceActive}
          phase={phase}
          displayCount={displayCount}
          stopped={stopped}
        />
      )}
    </div>
  );
}
