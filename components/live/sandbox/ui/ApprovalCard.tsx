"use client";
/**
 * ApprovalCard — the human checkpoint, as the runtime actually raised it.
 *
 * ADAPTED FROM components/mock/sandbox/ApprovalCard.tsx. The amber-outlined
 * card, its kicker, its body and the quiet resolved summary underneath are the
 * mock's, class for class. One thing is gone and its absence is the whole
 * adaptation:
 *
 * THERE IS NO APPROVE BUTTON, NO EDITABLE RESOLUTION AND NO "ASK AGENT TO
 * UPDATE". The mock's card was the demo's interactive centrepiece — a textarea,
 * a 1.5-second scripted revision, and a primary button that resumed a fixture
 * timeline. None of those can exist here, and offering them would be worse than
 * offering nothing:
 *
 *   THE DECISION HAS ALREADY BEEN MADE. A sandbox scenario carries a
 *   `ScenarioOwner` — approve, reject, or leave pending — and the runner applies
 *   it the moment the run pauses, inside the same request. By the time this card
 *   is on screen the run is over and its verdict is on the page beside it.
 *
 *   AND IT IS PART OF THE TEST. What the simulated owner does is how the approve
 *   and reject paths get exercised at all; a button letting a person override it
 *   would be changing the test rather than answering it, and the result already
 *   printed would no longer be about what happened.
 *
 * So this card REPORTS: the reason the executor wrote, the risk it assigned, the
 * policy limits that were breached, and — when the stream carries it — what the
 * simulated owner then decided. Every one of those is a field of the
 * `needs_approval` event, verbatim. Nothing is summarised, because the reason is
 * the single sentence an owner would be shown in production and a paraphrase of
 * it is not evidence of anything.
 *
 * Real approvals, the ones a person actually decides, live at
 * /app/workspace/approvals. This is a record of a rehearsal.
 */

import { AlertTriangle, ShieldCheck, UserCheck } from "lucide-react";
import type { RunEventView } from "../api";
import { eventList, eventText } from "../api";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import styles from "./sandbox.module.css";

export default function ApprovalCard({
  event,
  /** The `approval_resolved` event carrying the same approvalId, when there is one. */
  resolution,
}: {
  event: RunEventView;
  resolution: RunEventView | null;
}) {
  const reason = eventText(event, "reason");
  const risk = eventText(event, "risk");
  const approvalId = eventText(event, "approvalId");
  const stepId = eventText(event, "stepId");
  const breached = eventList(event, "breachedLimits") ?? [];
  const decision = resolution === null ? null : eventText(resolution, "decision");

  return (
    <div className={styles.approval} role="group" aria-label="Human checkpoint raised by the run">
      <div className={styles.approvalHead}>
        <span className={styles.approvalKicker}>Human checkpoint</span>
        <StatusBadge
          status={decision === "approved" ? "approved" : decision === "rejected" ? "failed" : "pending"}
          label={
            decision === "approved"
              ? "Approved in the run"
              : decision === "rejected"
                ? "Rejected in the run"
                : "Left pending"
          }
        />
        {risk !== null && (
          <span
            className={`oa-tag ${risk === "high" ? "oa-tag--amber" : "oa-tag--neutral"}`}
          >
            {risk} risk
          </span>
        )}
      </div>
      <div className={styles.approvalBody}>
        <div style={{ display: "grid", gap: 6 }}>
          <h3 className="oa-h3" style={{ margin: 0 }}>
            The run stopped and would not act without a person.
          </h3>
          {/* The executor's own sentence. Set apart as verbatim text so it is
              never mistaken for this screen's wording. */}
          {reason === null ? (
            <p className="oa-sub">
              The runtime raised this checkpoint and its event carried no reason field, so
              this screen has nothing to quote. It is not summarising one.
            </p>
          ) : (
            <p className={styles.verbatim}>{reason}</p>
          )}
        </div>

        {breached.length > 0 && (
          <div style={{ display: "grid", gap: 6 }}>
            <p className="oa-micro">Policy limits breached</p>
            <ul className={styles.opList}>
              {breached.map((limitId) => (
                <li key={limitId} className={styles.opChip}>
                  {limitId}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ display: "grid", gap: 6 }}>
          {(stepId !== null || approvalId !== null) && (
            <p className="oa-sub" style={{ margin: 0 }}>
              {stepId !== null && (
                <>
                  Step <span className={styles.mono}>{stepId}</span>
                </>
              )}
              {stepId !== null && approvalId !== null && " · "}
              {approvalId !== null && (
                <>
                  Approval <span className={styles.mono}>{approvalId}</span>
                </>
              )}
            </p>
          )}
        </div>

        {decision === null ? (
          <div className={styles.resolved} style={{ background: "var(--oa-bg-alt)" }}>
            <div className={styles.resolvedHead}>
              <AlertTriangle
                size={16}
                aria-hidden
                style={{ color: "var(--oa-amber-ink)", flex: "none" }}
              />
              <p className={styles.eventTitle} style={{ flex: 1 }}>
                The run ended here
              </p>
            </div>
            <p className={styles.resolvedText}>
              No <code>approval_resolved</code> event followed this one, so the run stopped at
              the checkpoint and stayed there. For a scenario whose simulated owner is
              &ldquo;leave pending&rdquo; that is the expected outcome and the result beside
              this timeline says so.
            </p>
          </div>
        ) : (
          <div className={styles.resolved}>
            <div className={styles.resolvedHead}>
              <UserCheck
                size={16}
                aria-hidden
                style={{ color: "var(--oa-teal-deep)", flex: "none" }}
              />
              <p className={styles.eventTitle} style={{ flex: 1 }}>
                The scenario&apos;s simulated owner {decision === "approved" ? "approved" : decision}
              </p>
            </div>
            <p className={styles.resolvedText}>
              Decided inside the run, by the scenario, not by anyone at this screen. What the
              simulated owner does is part of the test: it is how the approve and reject paths
              are exercised at all, and it is fixed so the verdict repeats.
            </p>
          </div>
        )}

        <span className="oa-sim-note">
          <ShieldCheck size={13} aria-hidden style={{ verticalAlign: "-2px" }} /> A rehearsal.
          Every tool call in this run was served by a stub; nothing reached a real system and
          no real approval was created.
        </span>
      </div>
    </div>
  );
}
