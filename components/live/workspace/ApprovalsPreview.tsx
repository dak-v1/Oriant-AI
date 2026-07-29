"use client";
/**
 * components/live/workspace/ApprovalsPreview.tsx — the decisions waiting on the
 * owner, as seen from the Workspace (ROLE_C_PLAN M5).
 *
 * This panel is a PREVIEW and stops being one the moment it grows an Approve
 * button. Deciding an approval resumes a paused run, records an
 * `ApprovalVersion` when the owner edits, and can fan out to dependent
 * workflows — the whole of `POST /api/runtime/approvals`. None of that should be
 * reachable from a summary card where the owner cannot see the draft they are
 * approving. The scripted demo lane has an inline Approve here and can afford
 * it, because nothing it approves is real. This one links.
 *
 * SO EVERY ROW IS A DEEP LINK, `?focus=<approvalId>`, which is the M5 item the
 * plan lists for calendar and notifications and which this screen is the first
 * real user of. The row is one `<a>` covering the whole item rather than a
 * clickable `<div>` with an `onClick`: it lands on the keyboard, it announces
 * itself, and middle-click opens it in a tab, all of which an owner triaging a
 * queue actually does.
 *
 * ORDER COMES FROM THE SERVER AND IS NOT SECOND-GUESSED. Both stores list
 * pending approvals by `dueAt` ascending — most overdue first, which is the
 * order an inbox wants — and lib/runtime/approvals.ts deliberately does not
 * re-sort. Sorting again here would be a second opinion about the same
 * question, and the two would eventually differ on the day it mattered.
 *
 * The deadline text is the server's `deadline.detail`, not a local
 * recomputation. "Overdue by 2h 15m" is a judgement `approvalDeadline` makes
 * against the runtime's own clock, and a browser that recomputed it from its own
 * would drift by exactly the amount that makes "overdue" wrong.
 */

import Link from "next/link";
import { AlertTriangle, ArrowRight, ClipboardCheck, Clock } from "lucide-react";
import type { RiskLevel } from "@/lib/plan/types";
import { approvalsHref } from "./read-model";
import type { Directory } from "./read-model";
import type { ApprovalsSnapshot, Loaded, PendingApprovalRow } from "./runtime-api";
import { Card, EmptyNote, LoadingNote, SourceError } from "./ui";
import styles from "./live-workspace.module.css";

/** How many fit before the panel stops being a preview. */
const PREVIEW_LIMIT = 4;

const RISK_CLASS = {
  low: styles.riskLow,
  medium: styles.riskMedium,
  high: styles.riskHigh,
} satisfies Record<RiskLevel, string>;

export default function ApprovalsPreview({
  approvals,
  directory,
  live,
  onRetry,
}: {
  approvals: Loaded<ApprovalsSnapshot>;
  directory: Directory;
  live: boolean;
  onRetry: () => void;
}) {
  const snapshot = approvals.data;

  return (
    <Card
      title="Approvals needing a decision"
      icon={<ClipboardCheck size={16} className={styles.cardIcon} aria-hidden />}
      count={snapshot ? snapshot.pending.length : null}
      action={
        <Link
          href={approvalsHref(null, live)}
          className="oa-btn oa-btn--primary oa-btn--sm"
        >
          Open approval inbox
          <ArrowRight size={13} aria-hidden />
        </Link>
      }
    >
      {approvals.error !== null && (
        <SourceError
          source="The approvals inbox"
          message={approvals.error}
          retry={onRetry}
        />
      )}

      {snapshot === null && approvals.error === null && (
        <LoadingNote>Reading the approval queue…</LoadingNote>
      )}

      {snapshot !== null && snapshot.pending.length === 0 && (
        <EmptyNote>
          Nothing is waiting on a decision. Agents running in{" "}
          <strong>auto within limits</strong> act without asking while they stay
          inside their limits, so an empty queue is a normal state rather than a
          quiet one.
        </EmptyNote>
      )}

      {snapshot !== null && snapshot.pending.length > 0 && (
        <>
          <ul className={styles.rows}>
            {snapshot.pending.slice(0, PREVIEW_LIMIT).map((approval) => (
              <li key={approval.approvalId}>
                <Link
                  href={approvalsHref(approval.approvalId, live)}
                  className={`oa-row oa-row--click ${styles.itemRow}`}
                >
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>
                      {directory.agentName(approval.agentId)} ·{" "}
                      {directory.workflowName(approval.agentId, approval.workflowId)}
                    </span>
                    <span className={styles.rowSub}>{approval.reason}</span>
                    <span className={styles.mono}>{approval.operation}</span>
                    <span className={styles.rowMeta}>
                      <span
                        className={`${styles.risk} ${RISK_CLASS[approval.risk]}`}
                      >
                        {approval.risk} risk
                      </span>
                      <Deadline approval={approval} />
                      {approval.breachedLimits.map((limit) => (
                        <span key={limit} className="oa-tag oa-tag--neutral">
                          limit: {limit}
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className={styles.rowSide} aria-hidden>
                    <ArrowRight size={16} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {snapshot.pending.length > PREVIEW_LIMIT && (
            <p className={styles.footNote}>
              {snapshot.pending.length - PREVIEW_LIMIT} more waiting. The inbox has
              all of them, with filters and the full draft.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * The deadline, with the late case marked in text and by icon as well as
 * colour. `unreadable` is shown as late on purpose: `isPastDue` counts it, and a
 * deadline the runtime cannot evaluate must never look like one with time left.
 */
function Deadline({ approval }: { approval: PendingApprovalRow }) {
  const late = approval.deadline.state !== "due";
  return (
    <span className={`${styles.deadline} ${late ? styles.deadlineLate : ""}`}>
      {late ? <AlertTriangle size={12} aria-hidden /> : <Clock size={12} aria-hidden />}
      {approval.deadline.detail}
    </span>
  );
}
