"use client";
/**
 * components/live/workspace/ActivityFeed.tsx — what the workforce actually did
 * (ROLE_C_PLAN M5).
 *
 * The feed answers the last clause of M5's exit criterion — "and the Workspace
 * reflects it" — so it is deliberately a list of RUNS rather than a list of
 * pleasant sentences about runs. Every row is one `RunState`: its status, when
 * it started, and what it is waiting on or what ended it. Nothing is
 * editorialised, because the whole value of this panel on the day something goes
 * wrong is that it says the same thing the run store says.
 *
 * "WHAT IT IS WAITING ON" IS A JOIN, and it is the only real work here. A run
 * knows it is `awaiting_approval` and knows its `pendingApprovalId`; the
 * operation being proposed and the deadline it is running against live on the
 * approval. `activityRows` performs that join and — importantly — reports a run
 * whose approval is NOT in the pending list as exactly that, rather than as a
 * generic wait. That state means the decision was recorded but the run has not
 * settled, which is worth seeing rather than smoothing over.
 *
 * The list is capped and does not paginate. `GET /api/runtime/run` returns every
 * run there has ever been with no filter and no window, so a long-lived
 * deployment would eventually hand this panel thousands of rows; capping at the
 * newest few is the honest thing a summary card can do with an unbounded list.
 * A real "recent runs" view belongs behind a filtered endpoint, and this comment
 * is where that is written down rather than discovered.
 */

import Link from "next/link";
import { Activity, ArrowRight } from "lucide-react";
import type { RiskLevel } from "@/lib/plan/types";
import { activityRows } from "./read-model";
import type { Directory, Zone } from "./read-model";
import type { ApprovalsSnapshot, Loaded, RunsSnapshot } from "./runtime-api";
import { Card, EmptyNote, LoadingNote, SourceError, StatusPill } from "./ui";
import styles from "./live-workspace.module.css";

const FEED_LIMIT = 8;

const RISK_CLASS = {
  low: styles.riskLow,
  medium: styles.riskMedium,
  high: styles.riskHigh,
} satisfies Record<RiskLevel, string>;

export default function ActivityFeed({
  runs,
  approvals,
  directory,
  zone,
  live,
  onRetry,
}: {
  runs: Loaded<RunsSnapshot>;
  /** Null when the inbox did not answer; the join simply degrades. */
  approvals: ApprovalsSnapshot | null;
  directory: Directory;
  zone: Zone;
  live: boolean;
  onRetry: () => void;
}) {
  const snapshot = runs.data;
  const rows = snapshot
    ? activityRows({ runs: snapshot, approvals, live, limit: FEED_LIMIT })
    : [];

  return (
    <Card
      title="Recent runs"
      icon={<Activity size={16} className={styles.cardIcon} aria-hidden />}
    >
      {runs.error !== null && (
        <SourceError source="Your recent activity" message={runs.error} retry={onRetry} />
      )}

      {snapshot === null && runs.error === null && (
        <LoadingNote>Loading your recent activity…</LoadingNote>
      )}

      {snapshot !== null && rows.length === 0 && (
        <EmptyNote>
          No agent has run yet. A run appears here the moment a trigger fires or
          someone starts a workflow by hand — nothing needs to be watching for it
          to be recorded.
        </EmptyNote>
      )}

      {rows.length > 0 && (
        <ul className={styles.rows}>
          {rows.map((row) => {
            const started = zone.stamp(row.startedAt);
            const body = (
              <>
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>
                    {directory.workflowName(row.agentId, row.workflowId)}
                  </span>
                  <span className={styles.rowSub}>
                    {directory.agentName(row.agentId)} · started{" "}
                    {started ?? "at a time this browser cannot read"}
                  </span>
                  <span className={styles.rowSub}>{row.detail}</span>
                  {row.risk !== null && (
                    <span className={styles.rowMeta}>
                      <span className={`${styles.risk} ${RISK_CLASS[row.risk]}`}>
                        {row.risk} risk
                      </span>
                    </span>
                  )}
                </span>
                <span className={styles.rowSide}>
                  <StatusPill kind="run" status={row.status} />
                  {row.href !== null && <ArrowRight size={16} aria-hidden />}
                </span>
              </>
            );

            return (
              <li key={row.runId}>
                {row.href === null ? (
                  <div className={`oa-row ${styles.itemRow}`}>{body}</div>
                ) : (
                  <Link href={row.href} className={`oa-row oa-row--click ${styles.itemRow}`}>
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {snapshot !== null && snapshot.runs.length > rows.length && (
        <p className={styles.footNote}>
          Showing the {rows.length} newest of {snapshot.runs.length} runs.
        </p>
      )}
    </Card>
  );
}
