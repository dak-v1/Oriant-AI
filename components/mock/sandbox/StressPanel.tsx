"use client";
/**
 * StressPanel — the 20-case stress test (spec §15): a fast progress strip
 * (~4s), then three stat cards, the case list (passed collapsed; escalated
 * and failed expanded) and the reassuring failed-case review.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, ChevronDown, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import { STRESS_TEST } from "@/lib/mock/fixtures/sandbox-scenarios";
import { WF, WF_NAME } from "@/lib/mock/fixtures/ids";
import type { StressCase } from "@/lib/mock/types";
import { DUR, EASE } from "@/lib/mock/motion";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import styles from "./sandbox.module.css";

function outcomeBadge(outcome: StressCase["outcome"]) {
  switch (outcome) {
    case "passed":
      return <StatusBadge status="completed" label="Passed" />;
    case "escalated":
      return <StatusBadge status="pending" label="Escalated correctly" />;
    case "failed":
      return <StatusBadge status="failed" label="Failed safely" />;
  }
}

function CaseRow({ c }: { c: StressCase }) {
  return (
    <div className={styles.caseRow}>
      <span className={styles.caseId}>#{c.id}</span>
      <div className={styles.caseBody}>
        <p className={styles.caseName}>{c.name}</p>
        <p className="oa-sub">{c.note}</p>
      </div>
      <span className={styles.caseBadge}>{outcomeBadge(c.outcome)}</span>
    </div>
  );
}

export default function StressPanel({
  state,
  caseNum,
}: {
  state: "running" | "done";
  caseNum: number;
}) {
  const [passedOpen, setPassedOpen] = useState(false);

  /* ── Progress strip ── */
  if (state === "running") {
    const shown = Math.min(Math.max(caseNum, 1), STRESS_TEST.total);
    const current = STRESS_TEST.cases[shown - 1];
    const pct = Math.round((caseNum / STRESS_TEST.total) * 100);
    return (
      <div className={`oa-card ${styles.progressCard}`}>
        <div style={{ display: "grid", gap: 4 }}>
          <p className="oa-micro">20-case stress test · {WF_NAME[WF.complaintResolution]}</p>
          <h2 className="oa-h3" aria-live="polite">
            Case {shown} of {STRESS_TEST.total}
            {current ? ` — ${current.name}` : ""}
          </h2>
        </div>
        <div className="oa-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Stress test progress">
          <span style={{ width: `${pct}%` }} />
        </div>
        <span className="oa-sim-note">
          Prepared demo result — 20 deterministic cases, replayed against the built workflow.
        </span>
      </div>
    );
  }

  /* ── Summary ── */
  const attention = STRESS_TEST.cases.filter((c) => c.outcome !== "passed");
  const passed = STRESS_TEST.cases.filter((c) => c.outcome === "passed");
  const failedCase = STRESS_TEST.cases.find((c) => c.outcome === "failed");

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.card, ease: EASE }}
      style={{ display: "grid", gap: 16 }}
    >
      <div className="oa-between">
        <div style={{ display: "grid", gap: 3 }}>
          <p className="oa-micro">20-case stress test · {WF_NAME[WF.complaintResolution]}</p>
          <h2 className="oa-h3">
            {STRESS_TEST.passed} of {STRESS_TEST.total} cases handled exactly as designed
          </h2>
        </div>
        <span className="oa-sim-note">Prepared demo result</span>
      </div>

      <div className={styles.statGrid}>
        <div className={`oa-card oa-card--flat ${styles.statCard}`}>
          <div className={styles.statTop}>
            <CheckCircle2 size={16} aria-hidden style={{ color: "var(--oa-teal-deep)" }} />
            <span className="oa-micro">Passed</span>
          </div>
          <span className={styles.statNum} style={{ color: "var(--oa-teal-deep)" }}>
            {STRESS_TEST.passed}
          </span>
          <p className="oa-sub">Handled end to end within policy.</p>
        </div>
        <div className={`oa-card oa-card--flat ${styles.statCard}`}>
          <div className={styles.statTop}>
            <TriangleAlert size={16} aria-hidden style={{ color: "var(--oa-amber-ink)" }} />
            <span className="oa-micro">Escalated correctly</span>
          </div>
          <span className={styles.statNum} style={{ color: "var(--oa-amber-ink)" }}>
            {STRESS_TEST.escalated}
          </span>
          <p className="oa-sub">Handed to you exactly when the rules require.</p>
        </div>
        <div className={`oa-card oa-card--flat ${styles.statCard}`}>
          <div className={styles.statTop}>
            <XCircle size={16} aria-hidden style={{ color: "var(--oa-red-ink)" }} />
            <span className="oa-micro">Failed</span>
          </div>
          <span className={styles.statNum} style={{ color: "var(--oa-red-ink)" }}>
            {STRESS_TEST.failed}
          </span>
          <p className="oa-sub">Stopped safely — no customer was contacted.</p>
        </div>
      </div>

      {/* Escalated + failed expanded; passed collapsed by default. */}
      <div className={styles.caseList} aria-label="Cases needing attention">
        {attention.map((c) => (
          <CaseRow key={c.id} c={c} />
        ))}
      </div>

      {failedCase && (
        <div className={`oa-card ${styles.failReview}`}>
          <span className={styles.failIcon} aria-hidden>
            <ShieldCheck size={19} />
          </span>
          <div className={styles.failBody}>
            <h3 className="oa-h3">Failed-case review — case #{failedCase.id}</h3>
            <p className={styles.failQuote}>{STRESS_TEST.failureExplanation}</p>
            <p className="oa-sub">
              This is exactly what the sandbox is for: the gap surfaced here, safely, instead of in
              front of a real customer.
            </p>
          </div>
        </div>
      )}

      <div>
        <button
          type="button"
          className={styles.accBtn}
          aria-expanded={passedOpen}
          onClick={() => setPassedOpen((v) => !v)}
        >
          {passed.length} passed cases
          <ChevronDown
            size={15}
            aria-hidden
            className={`${styles.accChevron} ${passedOpen ? styles.accChevronOpen : ""}`}
          />
        </button>
        {passedOpen && (
          <div className={styles.caseList} style={{ marginTop: 8 }}>
            {passed.map((c) => (
              <CaseRow key={c.id} c={c} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
