"use client";
/**
 * components/live/workspace/SchedulePanel.tsx — what is about to run
 * (ROLE_C_PLAN M5).
 *
 * Two cards over one derivation. "Today" and "Next" are the same list split on a
 * day boundary, and they are rendered from a single `upcomingRuns()` call for
 * that reason: two independent queries would eventually disagree about whether a
 * 23:58 job belongs to tonight or tomorrow.
 *
 * THE DAY IS THE BUSINESS'S, AND IT IS NAMED ON SCREEN. Each schedule fires in
 * its own timezone while the API returns UTC instants, so "today" is a question
 * about whose day. The zone is chosen once by `businessZone` (the plan's
 * org-wide quiet hours, falling back to the first schedule trigger) and printed
 * in the page header, because a Friday sweep filed under Thursday with no
 * explanation is worse than one filed under a zone the owner can see and
 * disagree with.
 *
 * THE THIRD LIST IS THE POINT OF THIS PANEL. `event`, `threshold`, `dependency`
 * and `manual` triggers have no `nextFireAt` — they are driven by something
 * arriving rather than by time passing — so they can never appear in a schedule
 * at all. Left out, a live workflow would be invisible on every surface, and
 * `app/api/runtime/activation/route.ts` names that exact failure as the worst
 * outcome available: a workflow the owner believes is live that nothing will
 * ever start. They get their own list, saying what each is waiting for, plus the
 * standing caveat that an event or threshold trigger needs an inbound delivery
 * path before anything can arrive.
 *
 * SKIPPED JOBS SIT HERE, NOT UNDER "AT RISK". A skip is quiet hours or the daily
 * cap — the scheduler correctly declining to wake an agent — and
 * lib/runtime/schedule/types.ts is explicit that this must read differently from
 * a failure. It is a scheduling fact, so it belongs beside the schedule, with
 * the reason the runtime gave and no alarm attached to it.
 */

import { CalendarDays, Moon, RadioTower, Timer } from "lucide-react";
import type { Directory, UpcomingEntry, Zone } from "./read-model";
import { skippedJobs, splitByDay, waitingTriggers } from "./read-model";
import type { Loaded, SchedulerSnapshot } from "./runtime-api";
import { Card, EmptyNote, LoadingNote, SourceError, StatusPill } from "./ui";
import styles from "./live-workspace.module.css";

/** Enough to plan a week around; the calendar (M6) is the full view. */
const NEXT_LIMIT = 6;
const SKIPPED_LIMIT = 3;

export default function SchedulePanel({
  scheduler,
  entries,
  zone,
  directory,
  onRetry,
}: {
  scheduler: Loaded<SchedulerSnapshot>;
  /**
   * Derived once by the page and handed down rather than recomputed here, so
   * the "scheduled runs upcoming" tile and these two cards are provably
   * counting the same list.
   */
  entries: UpcomingEntry[];
  zone: Zone;
  directory: Directory;
  onRetry: () => void;
}) {
  const snapshot = scheduler.data;

  /* One card, not two, whenever there is nothing to split. Rendering "nothing
     due today" beside "no further runs" while the scheduler is unreachable
     would be a screen calmly reporting a schedule it never read. */
  if (snapshot === null) {
    return (
      <Card
        title="Schedule"
        icon={<CalendarDays size={16} className={styles.cardIcon} aria-hidden />}
      >
        {scheduler.error === null ? (
          <LoadingNote>Loading the schedule…</LoadingNote>
        ) : (
          <SourceError source="The schedule" message={scheduler.error} retry={onRetry} />
        )}
      </Card>
    );
  }

  const split = splitByDay(entries, snapshot.now, zone);
  const waiting = waitingTriggers(snapshot);
  const skipped = skippedJobs(snapshot);

  return (
    <>
      <Card
        title="Today's schedule"
        icon={<CalendarDays size={16} className={styles.cardIcon} aria-hidden />}
      >
        {split.undated && (
          <EmptyNote>
            The current time could not be read, so nothing can be placed against
            today. Everything due is listed under Next runs instead.
          </EmptyNote>
        )}

        {!split.undated && split.today.length === 0 && (
          <EmptyNote>Nothing is due to run today in {zone.id}.</EmptyNote>
        )}

        {split.today.length > 0 && (
          <ul className={styles.flatList}>
            {split.today.map((entry) => (
              <ScheduleRow
                key={entry.key}
                entry={entry}
                zone={zone}
                directory={directory}
                dayLabel="Today"
              />
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Next runs"
        icon={<Timer size={16} className={styles.cardIcon} aria-hidden />}
      >
        {split.later.length === 0 && (
          <EmptyNote>
            No further runs have a time. Anything below is waiting for something to
            arrive rather than for the clock.
          </EmptyNote>
        )}

        {split.later.length > 0 && (
          <ul className={styles.flatList}>
            {split.later.slice(0, NEXT_LIMIT).map((entry) => (
              <ScheduleRow
                key={entry.key}
                entry={entry}
                zone={zone}
                directory={directory}
                dayLabel={zone.day(entry.at)}
              />
            ))}
          </ul>
        )}

        {split.later.length > NEXT_LIMIT && (
          <p className={styles.footNote}>
            {split.later.length - NEXT_LIMIT} further scheduled runs not shown.
          </p>
        )}

        {waiting.length > 0 && (
          <div className={styles.signalList}>
            <p className={styles.signalHead}>
              <RadioTower size={13} aria-hidden /> Waiting for something to arrive, not for a
              time
            </p>
            <ul className={styles.flatList}>
              {waiting.map((trigger) => (
                <li key={trigger.triggerId} className={styles.signalRow}>
                  <span className={styles.signalName}>
                    {directory.agentName(trigger.agentId)} ·{" "}
                    {directory.workflowName(trigger.agentId, trigger.workflowId)}
                  </span>
                  <span className={styles.signalWhy}>
                    {trigger.label} — {trigger.waitingFor}
                  </span>
                </li>
              ))}
            </ul>
            <p className={styles.footNote}>
              A workflow that waits for an event or a number only starts once
              something arrives — a message from the connected tool, or a fresh
              reading. If nothing is delivering to it, these stay live and never
              run.
            </p>
          </div>
        )}

        {skipped.length > 0 && (
          <div className={styles.signalList}>
            <p className={styles.signalHead}>
              <Moon size={13} aria-hidden /> Recently skipped, on purpose
            </p>
            <ul className={styles.flatList}>
              {skipped.slice(0, SKIPPED_LIMIT).map((job) => (
                <li key={job.jobId} className={styles.signalRow}>
                  <span className={styles.signalName}>
                    {directory.agentName(job.agentId)} ·{" "}
                    {directory.workflowName(job.agentId, job.workflowId)}
                  </span>
                  <span className={styles.signalWhy}>{job.reason}</span>
                </li>
              ))}
            </ul>
            <p className={styles.footNote}>
              A skip is the agent correctly deciding not to run — quiet hours, or
              its daily cap. It is not a failure and is counted as one nowhere.
            </p>
          </div>
        )}
      </Card>
    </>
  );
}

function ScheduleRow({
  entry,
  zone,
  directory,
  dayLabel,
}: {
  entry: UpcomingEntry;
  zone: Zone;
  directory: Directory;
  dayLabel: string | null;
}) {
  const time = zone.time(entry.at);
  return (
    <li className={styles.flatRow}>
      <span className={styles.timeBlock}>
        <span className={styles.timeMain}>{time ?? "—"}</span>
        <span className={styles.timeSub}>
          {time === null ? "time unreadable" : (dayLabel ?? "")}
        </span>
      </span>
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>
          {directory.workflowName(entry.agentId, entry.workflowId)}
        </span>
        <span className={styles.rowSub}>
          {directory.agentName(entry.agentId)} — {entry.detail}
        </span>
      </span>
      {entry.jobStatus !== null && (
        <span className={styles.rowSide}>
          <StatusPill kind="job" status={entry.jobStatus} />
        </span>
      )}
    </li>
  );
}
