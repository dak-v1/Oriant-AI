"use client";
/**
 * ReportOutline — sticky section list on the left of the report (spec §10).
 * Per-section status glyph (draft dot / confirmed check / rejected strike),
 * click scrolls the document to the section, active section follows scroll.
 * Below 1024px it renders as a horizontal pill strip (same markup).
 */
import { motion, useReducedMotion } from "framer-motion";
import { Check, Minus } from "lucide-react";
import type { ReportSectionId, ReportSectionStatus } from "@/lib/mock/types";
import { REPORT_SECTIONS } from "@/lib/mock/fixtures/company-report";
import { DUR, EASE } from "@/lib/mock/motion";
import styles from "./report.module.css";

export default function ReportOutline({
  statuses,
  activeId,
  confirmedCount,
  onJump,
}: {
  statuses: Record<ReportSectionId, ReportSectionStatus>;
  activeId: ReportSectionId;
  confirmedCount: number;
  onJump: (id: ReportSectionId) => void;
}) {
  const reduced = useReducedMotion();
  const total = REPORT_SECTIONS.length;

  return (
    <nav className={styles.outline} aria-label="Report outline">
      <div className={`oa-card oa-card--flat ${styles.outlineMeta}`}>
        <p className="oa-micro">Outline</p>
        <div className="oa-progress oa-progress--teal" aria-hidden>
          <span style={{ width: `${(confirmedCount / total) * 100}%` }} />
        </div>
        <p className="oa-sub" aria-live="polite">
          {confirmedCount} of {total} sections confirmed
        </p>
      </div>

      <div className={`oa-card oa-card--flat ${styles.outlineList}`}>
        {REPORT_SECTIONS.map((section, i) => {
          const status = statuses[section.id];
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
              onClick={() => onJump(section.id)}
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
                  ? " — confirmed"
                  : status === "rejected"
                    ? " — rejected"
                    : " — draft"}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
