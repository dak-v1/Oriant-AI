"use client";
/**
 * ReportOutline — the report's left column (spec §10, improvement spec §11.3):
 * a Contents card (per-section status glyph, click scrolls to the section)
 * with the Completeness card directly below it, showing fact-level review
 * progress, the needs-review count, the missing-info line and ONE button that
 * jumps to the next unresolved fact.
 *
 * Sticky on desktop only. Below 1024px both cards render above the document
 * in normal flow (never an overlay, acceptance R-02).
 */
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownToDot, Check, Minus } from "lucide-react";
import type { ReportSectionDef, ReportSectionId, ReportSectionStatus } from "@/lib/mock/types";
import { DUR, EASE } from "@/lib/mock/motion";
import styles from "./report.module.css";

type OutlineSectionId = ReportSectionId | "internal-json-handoff";

export interface FactCompleteness {
  total: number;
  confirmed: number;
  needsReview: number;
  /** Facts that are unreviewed or rejected (the jump-button targets). */
  unresolved: number;
  missingInfoCount: number;
}

export default function ReportOutline({
  sections,
  statuses,
  activeId,
  completeness,
  onJump,
  onJumpToUnresolved,
}: {
  sections: ReportSectionDef[];
  statuses: Record<ReportSectionId, ReportSectionStatus>;
  activeId: OutlineSectionId;
  completeness: FactCompleteness;
  onJump: (id: OutlineSectionId) => void;
  onJumpToUnresolved: () => void;
}) {
  const reduced = useReducedMotion();
  const pct =
    completeness.total > 0 ? Math.round((completeness.confirmed / completeness.total) * 100) : 0;
  const outlineSections: Array<{ id: OutlineSectionId; title: string }> = [
    ...sections,
    { id: "internal-json-handoff", title: "Internal Json handoff" },
  ];

  return (
    <nav className={styles.outline} aria-label="Report contents and completeness">
      <div className={`oa-card oa-card--flat ${styles.outlineList}`}>
        <p className={`oa-micro ${styles.outlineTitle}`}>Contents</p>
        {outlineSections.map((section, i) => {
          const status = section.id === "internal-json-handoff" ? "confirmed" : statuses[section.id];
          const active = section.id === activeId;
          return (
            <button
              key={section.id}
              type="button"
              className={[
                styles.outlineItem,
                active ? styles.outlineItemActive : "",
                status === "rejected" ? styles.outlineItemRejected : "",
              ].join(" ")}
              aria-current={active ? "true" : undefined}
              onClick={() => onJump(section.id as OutlineSectionId)}
            >
              <span className={styles.outlineGlyph} aria-hidden>
                {status === "confirmed" ? (
                  <motion.span
                    key="check"
                    className={`${styles.outlineGlyph} ${styles.glyphConfirmed}`}
                    initial={reduced ? false : { scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: DUR.micro, ease: EASE }}
                  >
                    <Check size={11} strokeWidth={3} />
                  </motion.span>
                ) : status === "rejected" ? (
                  <span className={`${styles.outlineGlyph} ${styles.glyphRejected}`}>
                    <Minus size={11} strokeWidth={3} />
                  </span>
                ) : (
                  <span className={styles.glyphDraft} />
                )}
              </span>
              <span>
                {i + 1}. {section.title}
              </span>
              <span className={styles.srOnly}>
                {status === "confirmed"
                  ? ", confirmed"
                  : status === "rejected"
                    ? ", rejected"
                    : ", draft"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Completeness — fact-level review progress (improvement spec §11.3) */}
      <div className={`oa-card oa-card--flat ${styles.completeness}`}>
        <p className="oa-micro">Completeness</p>
        <div className="oa-progress oa-progress--teal" aria-hidden>
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className={styles.completenessLead} aria-live="polite">
          {completeness.confirmed} of {completeness.total} facts confirmed
        </p>
        <p className="oa-sub">
          {completeness.needsReview > 0
            ? `${completeness.needsReview} fact${completeness.needsReview === 1 ? "" : "s"} still need review`
            : "Every fact is reviewed"}
        </p>
        <p className="oa-sub">
          {completeness.missingInfoCount} missing info item
          {completeness.missingInfoCount === 1 ? "" : "s"}, non-blocking
        </p>
        <button
          type="button"
          className="oa-btn oa-btn--ghost oa-btn--sm"
          onClick={onJumpToUnresolved}
          disabled={completeness.unresolved === 0}
        >
          <ArrowDownToDot size={13} aria-hidden />
          {completeness.unresolved === 0 ? "No unresolved facts" : "Go to next unresolved fact"}
        </button>
      </div>
    </nav>
  );
}
