"use client";
/**
 * ReportFooterBar — the approval bar of Human Approval Gate 1 (spec §10,
 * improvement spec §11.3). Sits in normal document flow at the end of the
 * report (never overlapping content, acceptance R-02): a slim card with the
 * fact-level review summary on the left and Save draft + the ONE primary
 * action (Approve and send to Planner / Re-approve / Open Workforce Planner)
 * on the right.
 */
import { ArrowRight, CircleCheck, ShieldCheck } from "lucide-react";
import styles from "./report.module.css";

export default function ReportFooterBar({
  factConfirmed,
  factTotal,
  needsReview,
  reportStatus,
  stale,
  version,
  onSaveDraft,
  onApprove,
  onOpenPlanner,
}: {
  factConfirmed: number;
  factTotal: number;
  needsReview: number;
  reportStatus: "draft" | "approved";
  stale: boolean;
  version: number;
  onSaveDraft: () => void;
  onApprove: () => void;
  onOpenPlanner: () => void;
}) {
  const approved = reportStatus === "approved";

  return (
    <div className={`oa-card ${styles.footer}`}>
      <div className={styles.footerSummary}>
        <span className={styles.footerStat} aria-live="polite">
          <CircleCheck size={14} aria-hidden style={{ color: "var(--oa-teal-deep)" }} />
          {factConfirmed} of {factTotal} facts confirmed
        </span>
        {!approved && needsReview > 0 && (
          <span className="oa-sub">
            {needsReview} still need review. Approving confirms every unreviewed fact.
          </span>
        )}
        {!approved && needsReview === 0 && (
          <span className="oa-sub">Every fact is reviewed. Ready to approve.</span>
        )}
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
