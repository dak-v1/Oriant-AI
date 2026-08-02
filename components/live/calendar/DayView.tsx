"use client";
/**
 * DayView — one day of the runtime, in order (ROLE_C_PLAN M6).
 *
 * The month grid answers "how busy, and is anything wrong"; this answers "what,
 * exactly, and in what order". It is a plain ordered list rather than the
 * scripted screen's 08:00–18:00 hour rail, and that is a deliberate difference:
 * the demo's fixtures all fall inside office hours, while a real runtime puts a
 * dependency run at 02:14 and an approval deadline at 13:00 on the same day. A
 * rail would either drop those or draw sixteen empty rows to reach them.
 *
 * EVERY ROW SAYS WHAT IT IS IN WORDS. The state chip carries an icon and a word,
 * the kind carries a tag, and the runtime's own sentence is printed underneath
 * rather than summarised — `detail` is composed by the route from
 * `ApprovalDeadline.detail`, `RunState.failure` and the trigger's label, and a
 * second opinion in the browser would eventually disagree with the inbox about
 * what "overdue" means.
 *
 * THE APPROVAL PHRASEBOOK IS THE INBOX'S, NOT A SECOND COPY. `describeAction`
 * turns `gmail.messages.send` into "Send an email to the customer" from a closed
 * table and falls back to the raw identifier when it has no entry — which is
 * exactly the honesty this screen needs, and re-deriving it here would be a
 * second table to keep in step.
 *
 * ── M7 ──
 *
 * THIS IS WHERE THE MONTH'S KEYBOARD JOURNEY ENDS, so it takes focus when it
 * opens. Pressing Enter on a day in the grid replaces the calendar with this
 * list; leaving focus behind on a cell that no longer exists would drop the
 * reader at the top of the document with no idea anything had happened. The
 * heading is therefore programmatically focusable (`tabIndex={-1}`) and the
 * screen focuses it on the hand-off, which puts the date, the item count and then
 * every row's own link in front of a reader in that order.
 *
 * IT IS ALSO THE ONLY KEYBOARD PATH TO AN APPROVAL FROM THE MONTH. The grid's
 * pills are deliberately out of the tab order (see MonthGrid's header), so the
 * "Review approval" link on each row below is what makes the runtime's deep link
 * reachable without a mouse. It is an ordinary link in ordinary tab order, and it
 * must stay one.
 */
import type { RefObject } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarOff } from "lucide-react";
import { RISK_TAG, describeAction } from "@/components/live/approvals/format";
import type { CalendarEventView } from "./api";
import { dayLabelLong } from "./month";
import { KIND_META, STATE_META, stateFill } from "./state-meta";
import styles from "./live-calendar.module.css";

export default function DayView({
  dayKey,
  events,
  zoneId,
  isToday,
  headingRef,
}: {
  dayKey: string;
  /** This day's events. Order comes from the route: chronological, ties by id. */
  events: CalendarEventView[];
  /** The timezone every time below is expressed in. */
  zoneId: string;
  isToday: boolean;
  /** Focused by the screen when the grid hands over. See the module header. */
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const pressing = events.filter((event) => STATE_META[event.state].pressing).length;
  const headingId = `oa-cal-day-${dayKey}`;

  return (
    <section className={`oa-card ${styles.dayCard}`} aria-labelledby={headingId}>
      <div className={styles.dayHead}>
        <div>
          <p className="oa-micro">{isToday ? "Today" : "Day view"}</p>
          {/* `tabIndex={-1}`: reachable by script, never a stop in tab order. */}
          <h2 className="oa-h2" id={headingId} ref={headingRef} tabIndex={-1}>
            {dayLabelLong(dayKey)}
          </h2>
        </div>
        <div className="oa-cluster">
          <span className="oa-tag oa-tag--neutral">
            {events.length} {events.length === 1 ? "item" : "items"}
          </span>
          {pressing > 0 && (
            <span className="oa-tag oa-tag--amber">{pressing} overdue</span>
          )}
          <span className="oa-tag oa-tag--neutral">Times in {zoneId}</span>
        </div>
      </div>

      {events.length === 0 ? (
        <div className={styles.emptyDay}>
          <CalendarOff size={20} aria-hidden />
          <p style={{ margin: 0, fontWeight: 700 }}>Nothing on this day.</p>
          <p className="oa-sub" style={{ maxWidth: 420 }}>
            Nothing is scheduled, no run started and no decision falls due on{" "}
            {dayLabelLong(dayKey)} in {zoneId}. Workflows that wait for an event, a threshold or
            another workflow never appear on a calendar at all — they start when something
            arrives, not when time passes.
          </p>
        </div>
      ) : (
        <ol className={styles.dayList}>
          {events.map((event) => (
            <DayRow key={event.id} event={event} />
          ))}
        </ol>
      )}
    </section>
  );
}

/* ═══════════════════════════ One event ═══════════════════════════ */

function DayRow({ event }: { event: CalendarEventView }) {
  const meta = STATE_META[event.state];
  const kind = KIND_META[event.kind];
  const Icon = meta.icon;

  /**
   * The phrasebook reads `integrationId` and `operation` and nothing else; the
   * empty `args`/`metrics` satisfy the inbox's shared type and are NOT data. The
   * full proposed arguments live on the approval, which is one click away.
   */
  const action =
    event.proposed === null
      ? null
      : describeAction({ ...event.proposed, args: {}, metrics: {} });

  return (
    <li className={`${styles.dayRow} ${meta.pressing ? styles.dayRowPressing : ""}`}>
      <span className={styles.rowTime}>
        <span className={styles.rowTimeMain}>{event.timeLabel}</span>
        {event.endedTimeLabel !== null && (
          <span className={styles.rowTimeSub}>ended {event.endedTimeLabel}</span>
        )}
      </span>

      <span className={styles.rowIcon} style={stateFill(event.state)} aria-hidden>
        <Icon size={14} />
      </span>

      <div className={styles.rowMain}>
        <p className={styles.rowTitle}>{event.title}</p>
        <p className={styles.rowAgent}>
          {event.agentName}
          {action !== null && ` · ${action.headline}`}
        </p>
        <p className={styles.rowDetail}>{event.detail}</p>

        <div className={styles.rowTags}>
          <span className={styles.stateChip} style={stateFill(event.state)}>
            <Icon size={11} aria-hidden />
            {meta.label}
          </span>
          <span className="oa-tag oa-tag--neutral">{kind.tag}</span>
          {event.risk !== null && (
            <span className={`oa-tag ${RISK_TAG[event.risk]}`}>Risk: {event.risk}</span>
          )}
          {action !== null && !action.named && (
            <span className="oa-tag oa-tag--amber">No plain description of this action</span>
          )}
          {event.scheduleTimezone !== null && (
            <span className="oa-tag oa-tag--neutral">
              Scheduled in {event.scheduleTimezone}
            </span>
          )}
        </div>
      </div>

      <div className={styles.rowSide}>
        {event.href === null ? (
          <span className="oa-sub">{noDestination(event)}</span>
        ) : (
          <Link href={event.href} className="oa-btn oa-btn--soft oa-btn--sm">
            Review approval
            <ArrowUpRight size={13} aria-hidden />
          </Link>
        )}
      </div>
    </li>
  );
}

/**
 * Why there is no link, said out loud.
 *
 * A blank cell here would read as "nothing more to see", when the truth is that
 * this build has nowhere to send you: there is no run detail screen and a future
 * firing has not produced anything to look at yet.
 */
function noDestination(event: CalendarEventView): string {
  switch (event.kind) {
    case "scheduled":
      return "Nothing to open yet — it has not run.";
    case "approval":
      return "There is no link to this approval.";
    case "run":
      return "There is no detail page for a run yet.";
  }
}
