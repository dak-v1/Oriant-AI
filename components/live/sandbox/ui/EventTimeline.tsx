"use client";
/**
 * EventTimeline — the step feed of a sandbox run, from the run's own events.
 *
 * ADAPTED FROM components/mock/sandbox/EventTimeline.tsx. The feed, its spine,
 * the round icon per event, the stage dividers and the inline approval card are
 * the mock's, class for class. Three things are different, and each one is a
 * fixture habit that would have become a lie here:
 *
 * 1. NOTHING IS REVEALED OVER TIME. The mock took a `displayCount` and drew a
 *    growing prefix of a fixture array while a timer advanced it, with a
 *    "Agents working, next step arriving…" row pulsing at the bottom. There is
 *    no such thing to draw: `POST /api/runtime/sandbox` runs the scenario inside
 *    the request and returns the finished stream, so every event in this feed
 *    arrived in the same millisecond as every other. This component takes the
 *    events and renders them, all of them, at once. An invented reveal is the
 *    exact defect this lane exists to remove.
 *
 * 2. EVERY EVENT CARRIES THE SAME INSTANT, AND THE FEED SAYS SO INSTEAD OF
 *    HIDING IT. The mock printed "+2.4s" offsets from fixture timings.
 *    `lib/runtime/sandbox/runner.ts` pins a `FixedClock` — that is the point of
 *    it, one of the four things pinned so a verdict repeats — so every `at` in a
 *    sandbox run is the same ISO instant and no duration can be computed from
 *    them. Rendering "+0.0s" against each row would be a measurement of nothing.
 *    The caption states the fact once and the rows carry no clock at all.
 *
 * 3. AN UNKNOWN EVENT KIND STILL RENDERS. `RunEvent` is an open union and has
 *    already grown once. A kind this build has no icon for gets the neutral one,
 *    its kind word as the title and whatever sentence it brought — which is what
 *    that union's own comment says older readers should do. Dropping it would
 *    silently shorten a real run's trace.
 */

import { Fragment } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Circle,
  Database,
  FileText,
  Hand,
  Inbox,
  ListChecks,
  MinusCircle,
  Sparkles,
  UserCheck,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { RunEventView } from "../api";
import { eventFlag, eventSentence, eventText } from "../api";
import ApprovalCard from "./ApprovalCard";
import { STAGE_LABEL, stageOfEventKind, type StageId } from "./stages";
import styles from "./sandbox.module.css";

/**
 * Icon and title per event kind.
 *
 * The titles are this screen's words for the runtime's kinds — a label, never a
 * substitute for the event's own sentence, which is always rendered underneath
 * verbatim. A kind absent from this table is not an error; see rule 3.
 */
const KIND_META: Record<string, { icon: LucideIcon; cls: string; title: string }> = {
  run_started: { icon: Zap, cls: styles.iconBlue, title: "Run started" },
  step_started: { icon: ListChecks, cls: styles.iconNeutral, title: "Step started" },
  reasoning: { icon: Sparkles, cls: styles.iconNeutral, title: "Reasoning" },
  tool_call: { icon: Database, cls: styles.iconNeutral, title: "Tool call" },
  batch_empty: { icon: MinusCircle, cls: styles.iconNeutral, title: "Nothing to send" },
  output: { icon: FileText, cls: styles.iconNeutral, title: "Output" },
  error: { icon: AlertTriangle, cls: styles.iconAmber, title: "Error" },
  needs_approval: { icon: Hand, cls: styles.iconAmber, title: "Approval required" },
  approval_resolved: { icon: UserCheck, cls: styles.iconTeal, title: "Approval resolved" },
  refused: { icon: Ban, cls: styles.iconAmber, title: "Refused" },
  run_finished: { icon: CheckCircle2, cls: styles.iconResult, title: "Run finished" },
};

function StageDivider({ stage }: { stage: StageId | null }) {
  const cls =
    stage === "checkpoint"
      ? styles.stageDividerCheckpoint
      : stage === "result"
        ? styles.stageDividerResult
        : "";
  return (
    <div className={`${styles.stageDivider} ${cls}`} role="separator">
      {stage === null ? "Unrecognised events" : STAGE_LABEL[stage]}
    </div>
  );
}

/**
 * One event.
 *
 * The chips carry whatever identity the event brought — a step id, an
 * integration and operation on a tool call, a status on the finish — and nothing
 * is filled in when a field is absent.
 */
function EventCard({ event }: { event: RunEventView }) {
  const meta = KIND_META[event.kind];
  const Icon = meta?.icon ?? Circle;
  const iconCls = meta?.cls ?? styles.iconNeutral;
  const title = meta?.title ?? event.kind;

  const stepId = eventText(event, "stepId");
  const operation = eventText(event, "operation");
  const integrationId = eventText(event, "integrationId");
  const status = eventText(event, "status");
  const ok = eventFlag(event, "ok");
  const sentence = eventSentence(event);

  return (
    <div className={styles.event}>
      <span className={`${styles.eventIcon} ${iconCls}`} aria-hidden>
        <Icon size={17} />
      </span>
      <div className={`oa-card oa-card--flat ${styles.eventCard}`}>
        <div className={styles.eventHead}>
          <span className={styles.actorChip}>{event.kind}</span>
          {stepId !== null && <span className={styles.actorChip}>{stepId}</span>}
          {integrationId !== null && <span className={styles.actorChip}>{integrationId}</span>}
          {operation !== null && <span className={styles.actorChip}>{operation}</span>}
          {/* `ok` is the only boolean on a tool_call and it decides whether the
              call succeeded, so it is shown as a word rather than left to the
              summary to imply. */}
          {ok !== null && (
            <span className={`oa-tag ${ok ? "oa-tag--teal" : "oa-tag--amber"}`}>
              {ok ? "ok" : "not ok"}
            </span>
          )}
          {status !== null && <span className="oa-tag oa-tag--neutral">{status}</span>}
        </div>
        <p className={styles.eventTitle}>{title}</p>
        {sentence === null ? (
          <p className="oa-sub">
            This event carried no sentence of its own; the chips above are everything the
            runtime attached to it.
          </p>
        ) : (
          <p className="oa-sub">{sentence}</p>
        )}
      </div>
    </div>
  );
}

export default function EventTimeline({
  events,
  /** Null when no run has been read for the selected scenario. */
  emptyNote,
}: {
  events: RunEventView[];
  emptyNote: { title: string; body: string };
}) {
  if (events.length === 0) {
    return (
      <div className={`oa-card oa-card--flat ${styles.empty}`}>
        <span className={styles.emptyIcon} aria-hidden>
          <Inbox size={20} />
        </span>
        <div style={{ display: "grid", gap: 6 }}>
          <h3 className="oa-h3">{emptyNote.title}</h3>
          <p className="oa-sub" style={{ maxWidth: 460 }}>
            {emptyNote.body}
          </p>
        </div>
        <span className="oa-sim-note">
          Every tool call in a sandbox run is served by a stub. No customer, message or
          calendar is touched, here or anywhere else on this page.
        </span>
      </div>
    );
  }

  /* An `approval_resolved` is drawn INSIDE the card for the `needs_approval` it
     answers, exactly as the mock folded its resolution into the approval card —
     so it is skipped when the feed reaches it. Matched on approvalId rather than
     on position, because a run can pause more than once (the runner allows up to
     ten) and the second resolution belongs to the second pause. */
  const resolutionByApproval = new Map<string, RunEventView>();
  for (const event of events) {
    if (event.kind !== "approval_resolved") continue;
    const approvalId = eventText(event, "approvalId");
    if (approvalId !== null) resolutionByApproval.set(approvalId, event);
  }

  return (
    <div className={styles.feed}>
      {events.map((event, index) => {
        if (event.kind === "approval_resolved" && eventText(event, "approvalId") !== null) {
          return null;
        }
        const stage = stageOfEventKind(event.kind);
        const previous = index > 0 ? stageOfEventKind(events[index - 1].kind) : undefined;
        const newStage = previous === undefined || stage !== previous;
        const approvalId = eventText(event, "approvalId");

        return (
          <Fragment key={`${event.kind}-${index}`}>
            {newStage && <StageDivider stage={stage} />}
            {event.kind === "needs_approval" ? (
              <div className={styles.event}>
                <span className={`${styles.eventIcon} ${styles.iconAmber}`} aria-hidden>
                  <Hand size={17} />
                </span>
                <ApprovalCard
                  event={event}
                  resolution={
                    approvalId === null ? null : resolutionByApproval.get(approvalId) ?? null
                  }
                />
              </div>
            ) : (
              <EventCard event={event} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
