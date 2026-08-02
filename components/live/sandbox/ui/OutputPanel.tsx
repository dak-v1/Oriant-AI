"use client";
/**
 * OutputPanel — the OUTPUT zone: what the selected test actually produced.
 *
 * ADAPTED FROM components/mock/sandbox/OutputPanel.tsx. The sections, the
 * `.outSection` / `.outRow` / `.outStat` rhythm, the metric list and the log
 * accordion are the mock's. What each section CONTAINS is different, and the
 * differences are not cosmetic:
 *
 *   RESULT SUMMARY   the mock printed a fixture's `result` event and a
 *                    "Completed within policy" badge that was a constant. This
 *                    prints the runtime's own `passed` boolean, the status the
 *                    run ended in, and — when the run failed — every failure
 *                    line the judge wrote, verbatim. The failure lines are the
 *                    single most useful thing on this page and they are never
 *                    behind a disclosure.
 *
 *   CHECKPOINTS      the mock had a hard-coded "Owner approval" row. This
 *                    reports `approvalsRaised`, which is a count the executor
 *                    kept, and says plainly that zero is a real answer.
 *
 *   WARNINGS         the mock derived warnings by regex-matching the word
 *                    "flagged" in fixture titles. There is no equivalent and
 *                    none is invented; what replaces it is the operations log,
 *                    which is evidence rather than a keyword search.
 *
 *   EVIDENCE         the mock showed illustrative metrics under a note saying
 *                    they were illustrative. This shows which artefact was
 *                    proved (`packageSource`), where it ran (`isolation`) and
 *                    the run id — the three facts a `ScenarioResult` carries
 *                    specifically so a verdict cannot be taken on trust.
 *
 * THE PANEL ALSO SAYS WHICH DOOR ANSWERED. A suite row and a single run are both
 * real results and one of them has no event stream, so a section that would be
 * empty for that reason says so rather than rendering as empty.
 */

import { useState } from "react";
import {
  ChevronDown,
  CircleHelp,
  FileText,
  Inbox,
  ShieldCheck,
  TriangleAlert,
  UserCheck,
  XCircle,
} from "lucide-react";
import type { StressView } from "../api";
import { isCoverageCase } from "../api";
import { isolationNote, packageSourceNote, statusGloss } from "../format";
import type { TestOutcome } from "../outcome";
import {
  outcomeApprovals,
  outcomeFailures,
  outcomeFinalStatus,
  outcomeOperations,
  outcomePassed,
} from "../outcome";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import styles from "./sandbox.module.css";

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

function ScenarioOutput({ outcome }: { outcome: TestOutcome }) {
  const [opsOpen, setOpsOpen] = useState(false);

  if (outcome.kind === "none") {
    return (
      <QuietNote
        title="No result yet"
        note="Run this test, or the whole suite, and the runtime's own judgement appears here: pass or fail, the failure lines it wrote, the approvals it raised and every operation it called."
      />
    );
  }

  const passed = outcomePassed(outcome);
  const failures = outcomeFailures(outcome) ?? [];
  const finalStatus = outcomeFinalStatus(outcome);
  const approvals = outcomeApprovals(outcome) ?? 0;
  const operations = outcomeOperations(outcome) ?? [];
  const gloss = finalStatus === null ? null : statusGloss(finalStatus);

  return (
    <>
      {/* ── Result summary ── */}
      <div className={styles.outSection}>
        <p className="oa-micro">Result summary</p>
        <div className={`oa-card oa-card--flat ${styles.outCard}`}>
          <StatusBadge
            status={passed === true ? "completed" : "failed"}
            label={passed === true ? "Passed" : "Failed"}
          />
          <div style={{ display: "grid", gap: 4 }}>
            <h3 className="oa-h3">
              The run ended <span className={styles.mono}>{finalStatus ?? "—"}</span>
            </h3>
            <p className="oa-sub">
              {gloss === null
                ? "This screen has no gloss for that status word; it is printed exactly as the runtime sent it."
                : `It ${gloss}. Whether that is a pass is judged in code against what the scenario expected, and the badge above is that judgement.`}
            </p>
          </div>
          {outcome.kind === "run" && outcome.run.failureReason !== null && (
            <p className={`${styles.verbatim} ${styles.failLine}`}>
              {outcome.run.failureReason}
            </p>
          )}
        </div>
      </div>

      {/* ── Failures, verbatim, never folded away ── */}
      <div className={styles.outSection}>
        <p className="oa-micro">Unmet expectations</p>
        {failures.length === 0 ? (
          <p className="oa-sub">
            None. Every expectation this scenario declared — the status it had to end in, the
            operations it had to call, the ones it must never call — was met.
          </p>
        ) : (
          <ul className={styles.verbatimList}>
            {failures.map((line) => (
              <li key={line} className={`${styles.verbatim} ${styles.failLine}`}>
                {line}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Approvals ── */}
      <div className={styles.outSection}>
        <p className="oa-micro">Approvals raised</p>
        <div className={styles.outRow}>
          <UserCheck
            size={15}
            aria-hidden
            className={styles.outRowIcon}
            style={{ color: approvals > 0 ? "var(--oa-amber-ink)" : "var(--oa-muted)" }}
          />
          <div className={styles.outRowBody}>
            <p className={styles.outRowTitle}>
              {approvals === 0 ? "The run never stopped for a person" : `${approvals} checkpoint${approvals === 1 ? "" : "s"}`}
            </p>
            <p className="oa-sub">
              {approvals === 0
                ? "Zero is a real answer and not always a good one: whether this workflow should have paused is what the scenario's expectations decide, and the verdict above is that decision."
                : "Each one was decided inside the run by the scenario's simulated owner — that decision is part of the test, which is how the approve and reject paths get exercised."}
            </p>
          </div>
          <span className={styles.outStatNum}>{approvals}</span>
        </div>
      </div>

      {/* ── Operations, in order ──
          The mock's "warnings" section derived amber rows by matching the word
          "flagged" in fixture prose. Nothing here does that. This is the
          evidence that replaced it: the ordered call log is how "the guardrail
          held" is read as a fact rather than a hope. */}
      <div className={styles.outSection}>
        <p className="oa-micro">Operations called</p>
        {operations.length === 0 ? (
          <p className="oa-sub">
            No operation reached the tool client. For a scenario that proves a guardrail
            stops an action, that is the pass; for one that proves work gets done, it is not.
          </p>
        ) : (
          <>
            <button
              type="button"
              className={styles.accBtn}
              aria-expanded={opsOpen}
              onClick={() => setOpsOpen((open) => !open)}
            >
              <FileText size={14} aria-hidden />
              {operations.length} {operations.length === 1 ? "call" : "calls"}, retries included
              <ChevronDown
                size={15}
                aria-hidden
                className={`${styles.accChevron} ${opsOpen ? styles.accChevronOpen : ""}`}
              />
            </button>
            {opsOpen && (
              <ul className={styles.opList} style={{ marginTop: 8 }}>
                {operations.map((operation, index) => (
                  <li key={`${operation}-${index}`} className={styles.opChip}>
                    <span className={styles.opIndex}>{index + 1}</span> {operation}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* ── What the verdict is evidence ABOUT ── */}
      <div className={styles.outSection}>
        <p className="oa-micro">What this proved</p>
        {outcome.kind === "suite" ? (
          <div className={styles.outRow}>
            <CircleHelp size={15} aria-hidden className={styles.outRowIcon} />
            <div className={styles.outRowBody}>
              <p className={styles.outRowTitle}>Not carried by the suite reply</p>
              <p className="oa-sub">
                The whole-suite response projects each result down to eight fields and drops
                which artefact was proved, where it ran, and the run id. Run this one test on
                its own to get them — the single-scenario reply carries the whole result.
              </p>
            </div>
          </div>
        ) : (
          <div className={`oa-card oa-card--flat ${styles.outCard}`}>
            <div className={styles.metricList}>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>Package</span>
                <span className={`${styles.metricValue} ${styles.mono}`}>
                  {outcome.run.packageSource}
                </span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>Isolation</span>
                <span className={`${styles.metricValue} ${styles.mono}`}>
                  {outcome.run.isolation}
                </span>
              </div>
              <div className={styles.metricRow}>
                <span className={styles.metricLabel}>Run id</span>
                <span className={`${styles.metricValue} ${styles.mono}`}>
                  {outcome.run.runId === "" ? "none — the run never started" : outcome.run.runId}
                </span>
              </div>
            </div>
            <p className="oa-sub" style={{ margin: 0 }}>
              {packageSourceNote(outcome.run.packageSource)}
            </p>
            <p className="oa-sub" style={{ margin: 0 }}>
              {isolationNote(outcome.run.isolation)}
            </p>
          </div>
        )}
      </div>
    </>
  );
}

/* ── Stress output ── */

function StressOutput({ stress, hasVerdict }: { stress: StressView | null; hasVerdict: boolean }) {
  if (!hasVerdict) {
    return (
      <QuietNote
        title="No sweep yet"
        note="The stress sweep runs as part of the suite. Its totals appear here and its cases in the panel to the left."
      />
    );
  }

  if (stress === null) {
    return (
      <div className={styles.outSection}>
        <p className="oa-micro">Result summary</p>
        <div className={`oa-card oa-card--flat ${styles.outCard}`}>
          <StatusBadge status="failed" label="No sweep ran" />
          <p className="oa-sub" style={{ margin: 0 }}>
            A sweep that did not run is absent evidence, not a pass. The runtime refuses to
            call a verdict ready without one, and the blocker list on the page says so in its
            own words.
          </p>
        </div>
      </div>
    );
  }

  const coverage = stress.cases === null ? [] : stress.cases.filter(isCoverageCase);
  const brokeGuardrail =
    stress.cases === null ? null : stress.cases.filter((row) => !row.passed && !isCoverageCase(row));

  return (
    <>
      <div className={styles.outSection}>
        <p className="oa-micro">Result summary</p>
        <div className={`oa-card oa-card--flat ${styles.outCard}`}>
          <StatusBadge
            status={stress.passed === stress.total ? "completed" : "failed"}
            label={stress.passed === stress.total ? "Every case passed" : "Cases outstanding"}
          />
          <div style={{ display: "grid", gap: 4 }}>
            <h3 className="oa-h3">
              {stress.passed} of {stress.total} cases passed
            </h3>
            <p className="oa-sub">
              {stress.passRate}% by the runtime&apos;s own count. Each case walks a boundary
              this plan declares — a policy limit, a quiet-hours window, a daily cap — and is
              judged in code.
            </p>
          </div>
        </div>
        <div className={styles.outStat}>
          <ShieldCheck size={15} aria-hidden style={{ color: "var(--oa-teal-deep)" }} />
          Passed
          <span className={styles.outStatNum} style={{ color: "var(--oa-teal-deep)" }}>
            {stress.passed}
          </span>
        </div>
        {brokeGuardrail !== null && (
          <div className={styles.outStat}>
            <XCircle size={15} aria-hidden style={{ color: "var(--oa-red-ink)" }} />
            Guardrail failures
            <span className={styles.outStatNum} style={{ color: "var(--oa-red-ink)" }}>
              {brokeGuardrail.length}
            </span>
          </div>
        )}
        {stress.cases !== null && (
          <div className={styles.outStat}>
            <TriangleAlert size={15} aria-hidden style={{ color: "var(--oa-amber-ink)" }} />
            Not walked
            <span className={styles.outStatNum} style={{ color: "var(--oa-amber-ink)" }}>
              {coverage.length}
            </span>
          </div>
        )}
      </div>

      {/* THE LINE THAT DECIDES WHETHER THESE NUMBERS MEAN WHAT THEY LOOK LIKE.
          A shortfall is reported by the sweep as failing cases, so it is already
          inside the totals above — 41 of 43 with two of them never walked reads
          identically to 41 of 43 with two guardrails broken until somebody says
          which. */}
      {stress.cases === null ? (
        <div className={styles.outSection}>
          <p className={styles.caveat}>
            <TriangleAlert size={14} aria-hidden />
            This runtime sent totals without the sweep&apos;s per-case rows, so this screen
            cannot separate a guardrail that failed from a boundary the sweep never walked.
            Both are counted in the numbers above.
          </p>
        </div>
      ) : coverage.length > 0 ? (
        <div className={styles.outSection}>
          <p className={styles.caveat}>
            <TriangleAlert size={14} aria-hidden />
            {coverage.length} of the failing rows above are not failures: they are boundaries
            the generator&apos;s ceilings refused to emit, so those guardrails were never
            tested. They are listed first in the panel to the left.
          </p>
        </div>
      ) : (
        <div className={styles.outSection}>
          <p className="oa-sub" style={{ margin: 0 }}>
            The sweep reported no coverage shortfall, so every boundary this plan implies was
            walked.
          </p>
        </div>
      )}
    </>
  );
}

/* ── Panel ── */

export default function OutputPanel({
  isStress,
  outcome,
  stress,
  hasVerdict,
}: {
  isStress: boolean;
  outcome: TestOutcome;
  stress: StressView | null;
  hasVerdict: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
      {isStress ? (
        <StressOutput stress={stress} hasVerdict={hasVerdict} />
      ) : (
        <ScenarioOutput outcome={outcome} />
      )}
    </div>
  );
}
