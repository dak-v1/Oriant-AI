"use client";
/**
 * ApprovalListCard — one pending decision in the live inbox.
 *
 * The anatomy is the scripted inbox's, deliberately: same card padding, same
 * workflow/agent lead line, same title-then-reason stack, same meta row of tags
 * and due time. It reads as the same product because it uses the same
 * stylesheet, not a copy of it.
 *
 * FOUR THINGS DIFFER FROM THE DEMO CARD, EACH FOR A REASON.
 *
 *   1. There is no one-click Approve. On the scripted screen approving is free —
 *      it moves a fixture. Here it replays a frozen invocation against a tool
 *      client and resumes a paused run, so the only action on the card is
 *      "Review and decide". A decision surface that can be operated without
 *      reading the proposal is a decision surface that will be.
 *
 *   2. Overdue is the RUNTIME's answer, not the browser's. `deadline.detail` is
 *      rendered verbatim and `deadline.state` picks the treatment;
 *      `escalateAfterMins` is never recomputed here. Two clocks disagreeing
 *      about whether something is late is exactly the bug an owner cannot see.
 *
 *   3. The operation id is always on the card, under the plain-language line.
 *      The sentence is a translation and can be missing; the identifier is what
 *      the runtime will actually call, and it is never hidden.
 *
 *   4. Colour never carries the state alone. An overdue card is tinted AND
 *      tagged "Overdue"; risk is a word before it is a hue.
 *
 * `agentName` IS NULLABLE, AND NULL MEANS "NOT KNOWN YET" RATHER THAN "UNKNOWN"
 * (M7). The names come from a second request, so for the first frames of a load
 * the screen genuinely does not have them. It used to render the agent id in the
 * gap and swap it for the name a moment later, which is a value that changes
 * under a reader's eye — and an id is exactly what this card shows when the plan
 * has no name for an agent, so the flicker was indistinguishable from a real
 * answer. Null renders the lead line without the agent segment: nothing, rather
 * than something that is about to be replaced.
 *
 * IT IS MEMOISED, AND `onReview` TAKES THE ID FOR THAT REASON. The inbox
 * re-renders on every change signal, every filter click and every tick of its
 * own connection status; without this the whole list re-rendered each time,
 * including a dozen cards whose approval had not moved. The screen therefore
 * passes ONE stable `useCallback` rather than a fresh arrow per row — a new
 * closure per render would defeat `memo` completely and leave the wrapper as
 * pure cost.
 *
 * WHAT IT DOES NOT SAVE, so nobody expects more of it than it gives: a REFETCH
 * re-parses the whole response, so every `item` is a new object and every card
 * re-renders. That is deliberate rather than unfinished — the alternative is a
 * deep comparison of every approval on every read, to avoid re-rendering markup
 * that is a dozen spans deep and holds no state. The saving that matters is the
 * one above: the renders that are NOT reads, which on this screen outnumber them.
 */
import { memo } from "react";
import { AlertTriangle, ArrowRight, Clock, ShieldAlert } from "lucide-react";
import type { PendingApprovalView } from "./api";
import { RISK_TAG, deadlineTone, describeAction, formatInstant } from "./format";
import shell from "@/components/mock/approvals/approvals.module.css";
import styles from "./live-approvals.module.css";

function ApprovalListCard({
  item,
  agentName,
  focused,
  onReview,
}: {
  item: PendingApprovalView;
  /**
   * The plan's display name, the agent id when the plan has no name for it, or
   * null while the lookup has not answered. See the module header.
   */
  agentName: string | null;
  /** Briefly ringed after arriving on a ?focus= deep link. */
  focused: boolean;
  onReview: (approvalId: string) => void;
}) {
  const action = describeAction(item.proposed);
  const tone = deadlineTone(item.deadline.state);
  const titleId = `${item.approvalId}-title`;

  return (
    <article
      id={`oa-live-approval-${item.approvalId}`}
      className={`oa-card oa-card--flat ${shell.card} ${tone.pressing ? styles.cardPressing : ""} ${
        focused ? shell.cardFocus : ""
      }`}
      aria-labelledby={titleId}
    >
      <div className={shell.cardTop}>
        <span className={shell.cardTopLead}>
          <span
            className={shell.statusIconChip}
            style={
              tone.pressing
                ? { background: "var(--oa-soft-amber)", color: "var(--oa-amber-ink)" }
                : { background: "var(--oa-soft-blue)", color: "var(--oa-blue-dark)" }
            }
            aria-hidden
          >
            {tone.pressing ? <AlertTriangle size={11} /> : <Clock size={11} />}
          </span>
          <span className={shell.wfLine}>
            {agentName === null ? item.workflowId : `${agentName} · ${item.workflowId}`}
          </span>
        </span>
        <span className={`oa-status ${tone.pressing ? "oa-status--pending" : "oa-status--review"}`}>
          {tone.pressing ? tone.label : "Waiting on you"}
        </span>
      </div>

      <h3 id={titleId} className={shell.cardTitle}>
        {action.headline}
      </h3>

      <p className={shell.reason} title={item.reason}>
        {item.reason}
      </p>

      <p className={styles.opLine} title={`${item.proposed.operation} · ${item.proposed.integrationId}`}>
        {item.proposed.operation} · {action.integration}
      </p>

      {!action.named && (
        <span className={styles.unnamedOp}>
          <ShieldAlert size={12} aria-hidden />
          No plain-language description for this operation — read the arguments before deciding.
        </span>
      )}

      <div className={shell.metaRow}>
        <span className={`oa-tag ${RISK_TAG[item.risk]}`}>Risk: {item.risk}</span>
        {item.breachedLimits.map((limit) => (
          <span key={limit} className={styles.limitTag}>
            Limit: {limit}
          </span>
        ))}
        <span className={`${shell.due} ${tone.pressing ? styles.duePressing : ""}`}>
          <Clock size={12} aria-hidden />
          {item.deadline.detail}
        </span>
      </div>

      <p className={shell.customer}>
        <span className={shell.customerText}>
          Raised {formatInstant(item.createdAt)} · for {item.approvalOwner}
        </span>
      </p>

      <div className={shell.cardActions}>
        {/* The accessible name carries the headline, so a screen reader user
            tabbing the list hears which decision each button opens rather than
            twelve identical "Review and decide"s. */}
        <button
          type="button"
          className="oa-btn oa-btn--soft oa-btn--sm"
          onClick={() => onReview(item.approvalId)}
          aria-label={`Review and decide: ${action.headline}`}
        >
          Review and decide
          <ArrowRight size={13} aria-hidden />
        </button>
      </div>
    </article>
  );
}

export default memo(ApprovalListCard);
