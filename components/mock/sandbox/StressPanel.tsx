"use client";
/**
 * StressPanel — main-panel content for the 20-case stress test entry (spec
 * §14; S-01): the fast progress strip (~4s) while running, then the
 * case-by-case list (escalated and failed first, passed behind an
 * accordion). The result summary, stats and failure explanation render in
 * the OUTPUT panel on the right.
 */
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
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
  state: "idle" | "running" | "done";
  caseNum: number;
}) {
  const reduced = useReducedMotion();
  const [passedOpen, setPassedOpen] = useState(false);

  if (state === "idle") {
    return (
      <div className={`oa-card oa-card--flat ${styles.empty}`}>
        <div style={{ display: "grid", gap: 6 }}>
          <h3 className="oa-h3">The case results appear here</h3>
          <p className="oa-sub" style={{ maxWidth: 460 }}>
            Run the stress test to replay all 20 edge cases against the built workflow. Each case
            reports whether it passed, escalated to you, or stopped safely.
          </p>
        </div>
        <span className="oa-sim-note">
          Prepared demo result: 20 deterministic cases, replayed against the built workflow.
        </span>
      </div>
    );
  }

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
            {current ? `: ${current.name}` : ""}
          </h2>
        </div>
        <div
          className="oa-progress"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Stress test progress"
        >
          <span style={{ width: `${pct}%` }} />
        </div>
        <span className="oa-sim-note">
          Prepared demo result: 20 deterministic cases, replayed against the built workflow.
        </span>
      </div>
    );
  }

  /* ── Case list (escalated + failed first; passed behind the accordion) ── */
  const attention = STRESS_TEST.cases.filter((c) => c.outcome !== "passed");
  const passed = STRESS_TEST.cases.filter((c) => c.outcome === "passed");

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.card, ease: EASE }}
      style={{ display: "grid", gap: 12 }}
    >
      <div className="oa-between">
        <p className="oa-micro">Cases needing attention</p>
        <span className="oa-sim-note">Prepared demo result</span>
      </div>
      <div className={styles.caseList} aria-label="Cases needing attention">
        {attention.map((c) => (
          <CaseRow key={c.id} c={c} />
        ))}
      </div>

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
