"use client";
/**
 * ApprovalCard — one decision card in the Approval Inbox (spec §18.1).
 *
 * Card anatomy: workflow + agent line, decision title, one-line reason,
 * risk tag + value chip + due time, related customer/campaign, StatusBadge,
 * Review (ghost) + Approve (soft, pending/review_requested only).
 *
 * Approving morphs the card to its approved state IN PLACE via layout
 * motion — the linked calendar pill and activity feed change in the very
 * same store update (§20 "Workspace" motion row).
 */
import { motion } from "framer-motion";
import { Check, Clock, UserRound } from "lucide-react";
import type { ApprovalItem } from "@/lib/mock/types";
import { DEMO_TODAY } from "@/lib/mock/fixtures/ids";
import { DUR, EASE, fadeUp } from "@/lib/mock/motion";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { RISK_TAG, cap, dueLabel } from "./format";
import styles from "./approvals.module.css";

export default function ApprovalCard({
  item,
  index,
  reduced,
  onReview,
  onApprove,
}: {
  item: ApprovalItem;
  /** Position in the visible list (entrance stagger only). */
  index: number;
  reduced: boolean;
  onReview: () => void;
  onApprove: () => void;
}) {
  const actionable = item.status === "pending" || item.status === "review_requested";

  const motionProps = reduced
    ? {}
    : {
        variants: fadeUp,
        initial: "hidden" as const,
        animate: "show" as const,
        custom: Math.min(index, 5),
        exit: {
          opacity: 0,
          scale: 0.985,
          transition: { duration: DUR.micro, ease: EASE },
        },
      };

  return (
    <motion.article
      layout={!reduced}
      {...motionProps}
      className={`oa-card oa-card--flat ${styles.card} ${actionable ? "" : styles.cardDecided}`}
      aria-labelledby={`${item.id}-title`}
    >
      <div className={styles.cardTop}>
        <span className={styles.wfLine}>
          {item.workflowName} · {item.agentName}
        </span>
        <StatusBadge status={item.status} />
      </div>

      <h3 id={`${item.id}-title`} className={styles.cardTitle}>
        {item.title}
      </h3>

      <p className={styles.reason} title={item.reason}>
        {item.reason}
      </p>

      <div className={styles.metaRow}>
        <span className={`oa-tag ${RISK_TAG[item.risk]}`}>Risk: {cap(item.risk)}</span>
        <span className="oa-tag oa-tag--neutral">{item.valueLabel}</span>
        <span className={`${styles.due} ${item.dueAt === DEMO_TODAY ? styles.dueToday : ""}`}>
          <Clock size={12} aria-hidden />
          Due {dueLabel(item.dueAt, item.dueTime)}
        </span>
      </div>

      <p className={styles.customer}>
        <UserRound size={13} aria-hidden />
        <span className={styles.customerText}>{item.customer}</span>
      </p>

      <div className={styles.cardActions}>
        <button type="button" className="oa-btn oa-btn--ghost oa-btn--sm" onClick={onReview}>
          Review
        </button>
        {actionable ? (
          <button type="button" className="oa-btn oa-btn--soft oa-btn--sm" onClick={onApprove}>
            <Check size={13} aria-hidden />
            Approve
          </button>
        ) : item.status === "approved" ? (
          <motion.span
            className={styles.decidedNote}
            initial={reduced ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.card, ease: EASE }}
          >
            <Check size={13} aria-hidden />
            Calendar and activity updated
          </motion.span>
        ) : null}
      </div>
    </motion.article>
  );
}
