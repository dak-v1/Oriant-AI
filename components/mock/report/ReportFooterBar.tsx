"use client";
/**
 * ReportFooterBar — the sticky bottom bar of Human Approval Gate 1 (spec §10):
 * report completeness (animated width), confirmed facts vs assumptions totals,
 * the remaining non-blocking gaps line, Save draft, and the ONE primary
 * action — Approve and send to Planner (or Re-approve when stale, or
 * Open Workforce Planner once approved).
 */
import { ArrowRight, CircleCheck, ShieldCheck, TriangleAlert } from "lucide-react";
import { REPORT_SECTIONS } from "@/lib/mock/fixtures/company-report";
import styles from "./report.module.css";

const TOTAL_SECTIONS = REPORT_SECTIONS.length;

export default function ReportFooterBar({
  confirmedCount,
  factTotals,
  gapCount,
  reportStatus,
  stale,
  version,
  onSaveDraft,
  onApprove,
  onOpenPlanner,
}: {
  confirmedCount: number;
  factTotals: { confirmed: number; assumptions: number };
  gapCount: number;
  reportStatus: "draft" | "approved";
  stale: boolean;
  version: number;
  onSaveDraft: () => void;
  onApprove: () => void;
  onOpenPlanner: () => void;
}) {
  const pct = Math.round((confirmedCount / TOTAL_SECTIONS) * 100);
  const approved = reportStatus === "approved";

  return (
    <div className={`oa-card ${styles.footer}`}>
      <div className={styles.footerBlock}>
        <span className="oa-micro">Report completeness</span>
        <div className={`oa-progress oa-progress--teal ${styles.footerBar}`} aria-hidden>
          <span style={{ width: `${pct}%` }} />
        </div>
        <span className="oa-sub" aria-live="polite">
          {confirmedCount} of {TOTAL_SECTIONS} sections confirmed · {pct}%
        </span>
      </div>

      <div style={{ display: "grid", gap: 7 }}>
        <span className={styles.footerStat}>
          <CircleCheck size={14} aria-hidden style={{ color: "var(--oa-teal-deep)" }} />
          {factTotals.confirmed} confirmed facts · {factTotals.assumptions} assumptions
        </span>
        <span className={styles.footerStat}>
          <TriangleAlert size={14} aria-hidden style={{ color: "var(--oa-amber-ink)" }} />
          {gapCount} non-blocking gaps remain — planning can proceed
        </span>
      </div>

      <div className={styles.footerActions}>
        {!approved && (
          <button type="button" className="oa-btn oa-btn--ghost" onClick={onSaveDraft}>
            Save draft
          </button>
        )}
        {approved ? (
          <button type="button" className="oa-btn oa-btn--primary" onClick={onOpenPlanner}>
            Open Workforce Planner <ArrowRight size={15} aria-hidden />
          </button>
        ) : stale ? (
          <button type="button" className="oa-btn oa-btn--primary" onClick={onApprove}>
            <ShieldCheck size={15} aria-hidden /> Re-approve report (v{version + 1})
          </button>
        ) : (
          <button type="button" className="oa-btn oa-btn--primary" onClick={onApprove}>
            <ShieldCheck size={15} aria-hidden /> Approve and send to Planner
          </button>
        )}
      </div>
    </div>
  );
}
