/**
 * app/api/runtime/calendar/route.ts — the runtime projected into time (ROLE_C_PLAN M6).
 *
 *   GET                       the month containing the server's instant
 *   GET  ?from=&to=           an explicit inclusive range of calendar DAYS
 *
 * Three sources, one event shape: what is going to happen (registered schedule
 * triggers), what did happen (runs), and what is waiting on a person (pending
 * approvals at their `dueAt`). Nothing here is a new source of truth — every
 * field is read from the scheduler store, the run store or `lib/runtime/approvals`,
 * and where the runtime does not know something this route says so rather than
 * filling the gap in.
 *
 * ALL THE TIME ARITHMETIC HAPPENS HERE, ON PURPOSE. The response carries, for
 * every event, a resolved UTC instant AND the day key and clock time it falls on
 * in the calendar's timezone. A browser doing that itself would do it in the
 * reader's zone, and a Friday 09:00 Singapore sweep read in London is a Thursday
 * evening — the schedule would appear on the wrong day, on the screen whose whole
 * job is which day things happen. So the zone is chosen once, named in the
 * response, and the client renders strings it did not compute.
 *
 * THE ZONE IS THE BUSINESS'S, AND IT IS `businessZone()`. Imported from
 * components/live/workspace/plan-facts rather than re-derived, because the
 * Workspace's "today" and the calendar's "today" disagreeing by a day would be
 * worse than either choice on its own. It is a pure function of the plan with no
 * React in it; the import direction is unusual and the shared answer is worth it.
 *
 * THE FIRST OCCURRENCE IS A FACT; THE REST ARE PROJECTIONS, AND THEY ARE LABELLED.
 * `ScheduledTrigger.nextFireAt` is what the scheduler will actually claim — the
 * runtime computed it and stores it. Every later occurrence in the range is this
 * route re-running the trigger's FROZEN cron through `nextFireAfter`, which is
 * the same function that produced `nextFireAt`, so the two cannot drift about
 * what "Friday at nine" means. But a projection is a statement about a future
 * that has not been committed to anything: pause the agent, edit the plan, or
 * leave the poller off, and it never happens. So it carries `state: "projected"`
 * and the screen says so. Presenting projections as scheduled runs would be this
 * screen's version of the fabricated number the Workspace refused to print.
 *
 * WHAT CANNOT BE PLACED IS LISTED, NOT DROPPED. An approval whose `dueAt` will
 * not parse, a run with an unreadable `startedAt`, a trigger whose frozen cron no
 * longer schedules — none of them has a point on a calendar, and silently
 * omitting them would let the one item nobody can reason about disappear behind a
 * calm-looking month. They come back in `unplaceable`, with the reason and a link
 * where one exists.
 *
 * A CALENDAR WITH NOTHING ON IT HAS SEVERAL VERY DIFFERENT CAUSES, so `summary`
 * counts them apart: schedule triggers that can appear here, live triggers that
 * never can (`event`, `threshold`, `dependency`, `manual` wait for something to
 * arrive, not for time to pass), and triggers stood down by a pause. An empty
 * month with four signal triggers live is a working workforce; an empty month
 * with nothing registered has never been activated. The screen must be able to
 * tell the owner which.
 *
 * Unauthenticated for now, exactly as every other /api/runtime route is; that
 * must be gated before any deployment.
 */
import { NextResponse } from "next/server";
import { businessZone } from "@/components/live/workspace/plan-facts";
import type { RiskLevel } from "@/lib/plan/types";
import { pendingApprovals } from "@/lib/runtime/approvals";
import { CronError, nextFireAfter } from "@/lib/runtime/schedule/cron";
import { getRuntimeSession } from "@/lib/runtime/session";
import type { RunState, RunStatus } from "@/lib/runtime/types";

export const dynamic = "force-dynamic";

/* ═══════════════════════════ The event shape ═══════════════════════════ */

type CalendarEventKind = "scheduled" | "run" | "approval";

/**
 * Ten states, not five, and each one is a distinction the runtime already makes.
 * Collapsing `refused` into `failed` would hide the difference between "policy
 * correctly stopped this" and "this broke"; collapsing `projected` into
 * `scheduled` would hide the difference between a fact and an extrapolation. The
 * screen groups them by kind so the legend stays readable.
 */
type CalendarEventState =
  /* kind: scheduled */
  | "scheduled"
  | "projected"
  /* kind: run — mirrors RunStatus exactly */
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "refused"
  | "cancelled"
  /* kind: approval — mirrors ApprovalDeadlineState, minus the unplaceable one */
  | "awaiting_decision"
  | "overdue";

interface CalendarEvent {
  /** Stable across reads: derived from what the event IS, never generated. */
  id: string;
  kind: CalendarEventKind;
  state: CalendarEventState;
  /** The resolved UTC instant. */
  at: string;
  /** "2026-07-24" — the day `at` falls on in the calendar's timezone. */
  dayKey: string;
  /** "09:00" in the calendar's timezone. */
  timeLabel: string;
  /** Runs only, and only once they have settled. */
  endedAt: string | null;
  endedTimeLabel: string | null;
  agentId: string;
  agentName: string;
  workflowId: string;
  workflowName: string;
  /** What the pill says. */
  title: string;
  /** Why it is here and what state it is in. Never empty. */
  detail: string;
  /** Where clicking goes, when there is somewhere real to go. */
  href: string | null;
  runId: string | null;
  approvalId: string | null;
  triggerId: string | null;
  risk: RiskLevel | null;
  /** Approvals only: what the agent proposes to do, for the phrasebook. */
  proposed: { integrationId: string; operation: string } | null;
  /** Schedule triggers only: the zone the cron itself is written in. */
  scheduleTimezone: string | null;
}

interface UnplaceableItem {
  id: string;
  kind: CalendarEventKind;
  agentId: string;
  agentName: string;
  workflowId: string;
  workflowName: string;
  /** Why it has no point in time. */
  reason: string;
  href: string | null;
}

/* ═══════════════════════════ Zone arithmetic ═══════════════════════════ */

const MS_PER_SECOND = 1_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

interface CalendarZone {
  /** The zone actually formatted in — differs from `requested` only when `ok` is false. */
  id: string;
  requested: string;
  /** False when the plan named a zone this platform's tz database does not know. */
  ok: boolean;
  dayKey(ms: number): string | null;
  time(ms: number): string | null;
  /** `local - UTC` in ms at an instant, for seeding the cron projection. */
  offset(ms: number): number;
}

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    // Not `hour12: false`: several engines render midnight as "24" under that
    // option, which would file every midnight event on the previous day. The same
    // note appears in lib/runtime/schedule/cron.ts, for the same reason.
    hourCycle: "h23",
  });
}

/**
 * A zone that formats, or an honest substitution.
 *
 * `Intl.DateTimeFormat` throws on a zone it does not know, and the zone comes
 * from the plan, which is data. Crashing this route over a typo would take the
 * whole calendar down; silently relabelling a Singapore morning as the previous
 * day would be worse. So UTC is substituted, `ok` is false, and the screen says
 * which zone was asked for.
 */
function createCalendarZone(requested: string): CalendarZone {
  let id = requested;
  let ok = true;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = zoneFormatter(requested);
  } catch {
    id = "UTC";
    ok = false;
    formatter = zoneFormatter("UTC");
  }

  const wallClockAt = (ms: number): WallClock => {
    const parts = formatter.formatToParts(new Date(ms));
    const read = (type: Intl.DateTimeFormatPartTypes): number => {
      const part = parts.find((candidate) => candidate.type === type);
      return part ? Number(part.value) : 0;
    };
    const hour = read("hour");
    return {
      year: read("year"),
      month: read("month"),
      day: read("day"),
      hour: hour === 24 ? 0 : hour,
      minute: read("minute"),
      second: read("second"),
    };
  };

  return {
    id,
    requested,
    ok,
    dayKey(ms: number): string | null {
      if (!Number.isFinite(ms)) return null;
      const wall = wallClockAt(ms);
      return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}`;
    },
    time(ms: number): string | null {
      if (!Number.isFinite(ms)) return null;
      const wall = wallClockAt(ms);
      return `${pad(wall.hour)}:${pad(wall.minute)}`;
    },
    offset(ms: number): number {
      // Floored to the second first: the wall clock carries no sub-second part,
      // and an unfloored input would fold the millisecond remainder into the
      // answer. Same derivation as `offsetAt` in schedule/cron.ts.
      const floored = Math.floor(ms / MS_PER_SECOND) * MS_PER_SECOND;
      const wall = wallClockAt(floored);
      return (
        Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second) -
        floored
      );
    },
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/* ═══════════════════════════ The range ═══════════════════════════ */

/**
 * Long enough for any month view plus the days either side of it, short enough
 * that a projection over a minute-granular cron cannot be asked to enumerate a
 * year. A caller wanting more asks for it a month at a time, which is also how
 * the screen navigates.
 */
const MAX_RANGE_DAYS = 62;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The UTC midnight of a civil date, or null when the text is not one. */
function parseDayKey(value: string): number | null {
  if (!DAY_PATTERN.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const ms = Date.UTC(year, month - 1, day);
  const back = new Date(ms);
  // Rejects 2026-02-30 and friends: `Date.UTC` rolls them over rather than
  // failing, and a range silently starting on a different day than the one the
  // caller typed is exactly the class of quiet wrongness this screen exists to
  // avoid.
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() + 1 !== month ||
    back.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
}

/** The whole calendar month a day key sits in. */
function monthOf(dayKey: string): { from: string; to: string } {
  const year = Number(dayKey.slice(0, 4));
  const month = Number(dayKey.slice(5, 7));
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = dayKey.slice(0, 7);
  return { from: `${prefix}-01`, to: `${prefix}-${pad(lastDay)}` };
}

/* ═══════════════════════════ Naming things ═══════════════════════════ */

/**
 * Ids → the words the owner recognises. An id the plan no longer contains is
 * returned AS THE ID: triggers are frozen at activation and runs outlive plan
 * edits, so a run for a departed agent is a real thing to see and the id is the
 * only handle anyone has on it.
 */
interface Names {
  agent(agentId: string): string;
  workflow(agentId: string, workflowId: string): string;
}

function createNames(agents: { id: string; name: string; workflows: { id: string; name: string }[] }[]): Names {
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name || agent.id]));
  const workflowNames = new Map(
    agents.flatMap((agent) =>
      agent.workflows.map(
        (workflow) => [`${agent.id}/${workflow.id}`, workflow.name || workflow.id] as const,
      ),
    ),
  );
  return {
    agent: (agentId) => agentNames.get(agentId) ?? agentId,
    workflow: (agentId, workflowId) =>
      workflowNames.get(`${agentId}/${workflowId}`) ?? workflowId,
  };
}

/* ═══════════════════════════ Deep links ═══════════════════════════ */

/**
 * The live inbox, opened on one approval.
 *
 * `live=1` is not optional and is not a guess: these events exist only in the
 * runtime, so the scripted inbox — which is what this URL renders by default —
 * would not contain the approval being linked to. The parameter names are
 * verified against `components/live/approvals/LiveApprovalsScreen` (`?focus=`)
 * and `app/app/workspace/approvals/page.tsx` (`?live=`), not assumed.
 */
function approvalHref(approvalId: string): string {
  return `/app/workspace/approvals?live=1&focus=${encodeURIComponent(approvalId)}`;
}

/* ═══════════════════════════ Run sentences ═══════════════════════════ */

/**
 * What a run means, in the owner's language. Exhaustive over `RunStatus`, so a
 * seventh status is a compile error here rather than an event with an empty
 * detail line.
 */
function describeRun(run: RunState): string {
  switch (run.status) {
    case "running":
      return `Started and still working — ${run.events.length} ${
        run.events.length === 1 ? "event" : "events"
      } recorded so far.`;
    case "awaiting_approval":
      return "Paused mid-run: a step needs a decision before it can continue.";
    case "completed":
      return "Ran to completion with no decision outstanding.";
    case "failed":
      return run.failure ?? "The run failed and recorded no reason.";
    case "refused":
      return run.failure ?? "Policy refused the operation and ended the run.";
    case "cancelled":
      return "Cancelled before it finished.";
  }
}

function runState(status: RunStatus): CalendarEventState {
  // A direct mapping rather than a cast: the two unions happen to share their
  // spellings today, and a `RunStatus` that gains a member must be given a
  // calendar state deliberately rather than leaking through.
  switch (status) {
    case "running":
      return "running";
    case "awaiting_approval":
      return "awaiting_approval";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "refused":
      return "refused";
    case "cancelled":
      return "cancelled";
  }
}

/* ═══════════════════════════ Projection limits ═══════════════════════════ */

/**
 * A cron is allowed to say "every five minutes", and a month of that is nine
 * thousand points nobody can read. Both caps below stop the walk and set
 * `truncated`, so an owner is told the month is showing part of the picture
 * rather than being handed a plausible-looking full one.
 */
const MAX_PROJECTION_STEPS = 240;
const MAX_PROJECTED_PER_TRIGGER = 48;
const MAX_EVENTS = 600;

/* ═══════════════════════════ The handler ═══════════════════════════ */

export async function GET(request: Request) {
  const session = getRuntimeSession();
  // Routes may read wall time; the runtime library beneath them may not.
  const now = session.executor.clock.now();
  const nowMs = now.getTime();

  const url = new URL(request.url);

  /* ── The query ──
     Unknown parameters are refused rather than ignored. `?form=2026-07-01` would
     otherwise silently return the current month, and a calendar quietly showing
     a different range than the one asked for is indistinguishable from a
     schedule that moved. */
  const unknown = [...url.searchParams.keys()].filter((key) => key !== "from" && key !== "to");
  if (unknown.length > 0) {
    return NextResponse.json(
      {
        error:
          `This endpoint does not accept ${unknown.map((key) => `"${key}"`).join(", ")}. ` +
          `Send no parameters for the current month, or from and to as inclusive calendar ` +
          `days (YYYY-MM-DD) in the calendar's own timezone.`,
      },
      { status: 400 },
    );
  }

  const zoneChoice = businessZone(session.plan);
  const zone = createCalendarZone(zoneChoice.timezone);

  const todayKey = zone.dayKey(nowMs);
  if (todayKey === null) {
    // Only reachable if the server's own clock is not a readable instant. Failing
    // loudly beats projecting a calendar against a time nobody can name.
    return NextResponse.json(
      {
        error:
          `The server's clock read ${String(now)}, which is not an instant a calendar can be ` +
          `built around. Nothing was projected.`,
      },
      { status: 500 },
    );
  }

  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  if ((fromParam === null) !== (toParam === null)) {
    return NextResponse.json(
      {
        error:
          "from and to must be given together. One without the other would leave this route " +
          "guessing how far to project, and the answer it guessed would look like a schedule.",
      },
      { status: 400 },
    );
  }

  const range = fromParam === null || toParam === null ? monthOf(todayKey) : { from: fromParam, to: toParam };

  const fromMs = parseDayKey(range.from);
  const toMs = parseDayKey(range.to);
  if (fromMs === null || toMs === null) {
    return NextResponse.json(
      {
        error:
          `from and to must be calendar days written as YYYY-MM-DD; got from=${JSON.stringify(
            range.from,
          )} and to=${JSON.stringify(range.to)}. Both are read in ${zone.id}, the timezone this ` +
          `plan's schedule is expressed in.`,
      },
      { status: 400 },
    );
  }
  if (fromMs > toMs) {
    return NextResponse.json(
      { error: `from (${range.from}) is after to (${range.to}).` },
      { status: 400 },
    );
  }

  const days = Math.round((toMs - fromMs) / MS_PER_DAY) + 1;
  if (days > MAX_RANGE_DAYS) {
    return NextResponse.json(
      {
        error:
          `${range.from} to ${range.to} is ${days} days; this endpoint projects at most ` +
          `${MAX_RANGE_DAYS} at a time. A wider window would ask a minute-granular cron to be ` +
          `enumerated for a year. Request it a month at a time.`,
      },
      { status: 400 },
    );
  }

  const inRange = (dayKey: string | null): dayKey is string =>
    dayKey !== null && dayKey >= range.from && dayKey <= range.to;

  const names = createNames(session.plan.agents);
  const events: CalendarEvent[] = [];
  const unplaceable: UnplaceableItem[] = [];
  let truncated = false;

  /* ═══ (a) SCHEDULED — what is going to happen ═══ */

  const triggers = await session.schedulerStore.listTriggers({ planId: session.plan.planId });
  const enabled = triggers.filter((trigger) => trigger.enabled);
  const scheduleTriggers = enabled.filter((trigger) => trigger.spec.kind === "schedule");

  // The instant at or just before local midnight on `from`. Two hours of slack
  // covers any DST shift near it; occurrences that land before the real local
  // midnight are filtered by their day key, so the slack costs a few wasted
  // steps and never a wrong day.
  const projectFromMs = fromMs - zone.offset(fromMs) - 2 * MS_PER_HOUR;

  for (const trigger of scheduleTriggers) {
    const spec = trigger.spec;
    if (spec.kind !== "schedule") continue; // narrowing; filtered above

    const agentName = names.agent(trigger.agentId);
    const workflowName = names.workflow(trigger.agentId, trigger.workflowId);

    const base = {
      kind: "scheduled" as const,
      agentId: trigger.agentId,
      agentName,
      workflowId: trigger.workflowId,
      workflowName,
      title: workflowName,
      endedAt: null,
      endedTimeLabel: null,
      href: null,
      runId: null,
      approvalId: null,
      triggerId: trigger.triggerId,
      risk: null,
      proposed: null,
      scheduleTimezone: spec.timezone,
    };

    const nextMs = trigger.nextFireAt === null ? Number.NaN : Date.parse(trigger.nextFireAt);
    if (!Number.isFinite(nextMs)) {
      unplaceable.push({
        id: `sched:${trigger.triggerId}`,
        kind: "scheduled",
        agentId: trigger.agentId,
        agentName,
        workflowId: trigger.workflowId,
        workflowName,
        reason:
          trigger.nextFireAt === null
            ? `${spec.label} is registered but has no next fire time, so nothing will start it ` +
              `until it is re-registered.`
            : `${spec.label} has a next fire time the runtime cannot read ` +
              `("${trigger.nextFireAt}"), so it cannot be placed on a day.`,
        href: null,
      });
      continue;
    }

    // The authoritative one: this exact instant is what a worker pass will claim.
    const nextDay = zone.dayKey(nextMs);
    if (inRange(nextDay)) {
      const time = zone.time(nextMs);
      if (time !== null) {
        events.push({
          ...base,
          id: `sched:${trigger.triggerId}@${new Date(nextMs).toISOString()}`,
          state: "scheduled",
          at: new Date(nextMs).toISOString(),
          dayKey: nextDay,
          timeLabel: time,
          // A fire time in the PAST means the trigger is due and no worker pass
          // has claimed it — with `ORIANT_POLLER` off that is the ordinary state,
          // and a calendar that showed it as an ordinary upcoming firing would be
          // promising a run nothing is going to start. The Workspace's schedule
          // panel says the same thing in the same words.
          detail:
            nextMs < nowMs
              ? `${spec.label} — due now, waiting for the scheduler to turn. It has not fired.`
              : `${spec.label} — the next firing the scheduler holds for this workflow.`,
        });
      }
    }

    /* Everything after it is this route re-running the frozen cron. Labelled
       `projected`, never `scheduled` — see the module header.

       `settled` is what tells a walk that finished from one that was cut off. A
       walk ends settled when the expression is exhausted, when it passes the end
       of the range, or when the cron itself refused; it ends UNsettled when
       either cap stopped it, and only then is there more the owner is not being
       shown. Claiming truncation either way would make the warning meaningless
       in exactly the months where it matters. */
    let cursorMs = Math.max(nextMs, projectFromMs);
    let projected = 0;
    let settled = false;
    for (let step = 0; step < MAX_PROJECTION_STEPS && !settled; step++) {
      let occurrence: Date | null;
      try {
        occurrence = nextFireAfter(spec.cron, spec.timezone, new Date(cursorMs));
      } catch (error) {
        if (!(error instanceof CronError)) throw error;
        unplaceable.push({
          id: `sched:${trigger.triggerId}:projection`,
          kind: "scheduled",
          agentId: trigger.agentId,
          agentName,
          workflowId: trigger.workflowId,
          workflowName,
          reason:
            `Later occurrences of ${spec.label} could not be worked out: ${error.message} ` +
            `The next firing above still stands; nothing beyond it is shown.`,
          href: null,
        });
        settled = true;
        break;
      }

      // Well formed and out of occurrences — see `nextFireAfter`'s contract.
      if (occurrence === null) {
        settled = true;
        break;
      }

      cursorMs = occurrence.getTime();
      const dayKey = zone.dayKey(cursorMs);
      if (dayKey === null || dayKey > range.to) {
        settled = true;
        break;
      }
      if (dayKey < range.from) continue;
      // Never re-state the authoritative firing as a projection.
      if (cursorMs <= nextMs) continue;

      const time = zone.time(cursorMs);
      if (time === null) continue;

      events.push({
        ...base,
        id: `sched:${trigger.triggerId}@${occurrence.toISOString()}`,
        state: "projected",
        at: occurrence.toISOString(),
        dayKey,
        timeLabel: time,
        detail:
          `${spec.label} — worked out from the schedule this workflow was activated with. ` +
          `It happens only if the agent is still live and something is turning the scheduler.`,
      });

      projected += 1;
      if (projected >= MAX_PROJECTED_PER_TRIGGER) break;
    }
    if (!settled) truncated = true;
  }

  /* ═══ (b) RUNS — what actually happened ═══ */

  const runs = await session.runStore.listRuns();
  for (const run of runs) {
    const agentName = names.agent(run.agentId);
    const workflowName = names.workflow(run.agentId, run.workflowId);
    const startedMs = Date.parse(run.startedAt);

    if (!Number.isFinite(startedMs)) {
      unplaceable.push({
        id: `run:${run.runId}`,
        kind: "run",
        agentId: run.agentId,
        agentName,
        workflowId: run.workflowId,
        workflowName,
        reason:
          `This run records its start as "${run.startedAt}", which is not a readable instant, ` +
          `so it cannot be placed on a day. Its status is "${run.status}".`,
        href:
          run.pendingApprovalId === null ? null : approvalHref(run.pendingApprovalId),
      });
      continue;
    }

    const dayKey = zone.dayKey(startedMs);
    if (!inRange(dayKey)) continue;
    const time = zone.time(startedMs);
    if (time === null) continue;

    const endedMs = run.endedAt === null ? Number.NaN : Date.parse(run.endedAt);
    const endedTimeLabel = Number.isFinite(endedMs) ? zone.time(endedMs) : null;

    events.push({
      id: `run:${run.runId}`,
      kind: "run",
      state: runState(run.status),
      at: new Date(startedMs).toISOString(),
      dayKey,
      timeLabel: time,
      endedAt: run.endedAt,
      endedTimeLabel,
      agentId: run.agentId,
      agentName,
      workflowId: run.workflowId,
      workflowName,
      title: workflowName,
      detail: describeRun(run),
      // A paused run's only useful destination is the decision holding it up.
      // Every other run has nowhere to go: there is no run detail screen, and a
      // link to one that does not exist is worse than none.
      href:
        run.status === "awaiting_approval" && run.pendingApprovalId !== null
          ? approvalHref(run.pendingApprovalId)
          : null,
      runId: run.runId,
      approvalId: run.pendingApprovalId,
      triggerId: null,
      risk: null,
      proposed: null,
      scheduleTimezone: null,
    });
  }

  /* ═══ (c) APPROVALS — what is waiting on a person ═══ */

  const pending = await pendingApprovals(session.runStore, now);
  for (const item of pending) {
    const approval = item.request;
    const agentName = names.agent(approval.agentId);
    const workflowName = names.workflow(approval.agentId, approval.workflowId);
    const href = approvalHref(approval.approvalId);

    // The runtime's own derivation, not a second opinion: `unreadable` is the
    // state lib/runtime/approvals.ts reports when `dueAt` will not parse, and it
    // counts as needing attention rather than as time in hand.
    if (item.deadline.state === "unreadable") {
      unplaceable.push({
        id: `approval:${approval.approvalId}`,
        kind: "approval",
        agentId: approval.agentId,
        agentName,
        workflowId: approval.workflowId,
        workflowName,
        reason: `${item.deadline.detail} It is still waiting on a decision.`,
        href,
      });
      continue;
    }

    const dueMs = Date.parse(approval.dueAt);
    const dayKey = zone.dayKey(dueMs);
    if (!inRange(dayKey)) continue;
    const time = zone.time(dueMs);
    if (time === null) continue;

    events.push({
      id: `approval:${approval.approvalId}`,
      kind: "approval",
      state: item.deadline.state === "overdue" ? "overdue" : "awaiting_decision",
      at: new Date(dueMs).toISOString(),
      dayKey,
      timeLabel: time,
      endedAt: null,
      endedTimeLabel: null,
      agentId: approval.agentId,
      agentName,
      workflowId: approval.workflowId,
      workflowName,
      title: workflowName,
      // Two runtime sentences, joined: why it needs a person, and where it
      // stands against `escalateAfterMins`. Neither is recomputed here.
      detail: `${approval.reason} ${item.deadline.detail}`,
      href,
      runId: approval.runId,
      approvalId: approval.approvalId,
      triggerId: null,
      risk: approval.risk,
      proposed: {
        integrationId: approval.invocation.integrationId,
        operation: approval.invocation.operation,
      },
      scheduleTimezone: null,
    });
  }

  /* ═══ Order, cap, answer ═══ */

  // Chronological, ties broken by id, so two reads of an unchanged runtime
  // produce the same list in the same order.
  events.sort((a, b) => {
    const left = Date.parse(a.at);
    const right = Date.parse(b.at);
    if (left !== right) return left - right;
    return a.id.localeCompare(b.id);
  });

  const kept = events.length > MAX_EVENTS ? events.slice(0, MAX_EVENTS) : events;
  if (kept.length < events.length) truncated = true;

  const scheduleZones = [
    ...new Set(
      scheduleTriggers.flatMap((trigger) =>
        trigger.spec.kind === "schedule" ? [trigger.spec.timezone] : [],
      ),
    ),
  ]
    .filter((candidate) => candidate !== zone.id)
    .sort();

  return NextResponse.json({
    mode: session.mode,
    /** The instant this projection was made against. */
    now: now.toISOString(),
    todayKey,
    range: { from: range.from, to: range.to, days },
    timezone: {
      id: zone.id,
      requested: zone.requested,
      ok: zone.ok,
      /** Where the zone came from: the plan's quiet hours, a trigger, or nothing. */
      source: zoneChoice.source,
      /**
       * Schedules written in a DIFFERENT zone than the one this calendar groups
       * by. Empty on BrightPath; not empty is a real possibility once a plan
       * spans regions, and an owner reading one grid must know it is one grid.
       */
      otherScheduleZones: scheduleZones,
    },
    events: kept,
    unplaceable,
    /**
     * Why the calendar looks the way it does. An empty month with signal
     * triggers live is a working workforce; an empty month with nothing
     * registered has never been activated, and the two need opposite advice.
     */
    summary: {
      registeredTriggers: triggers.length,
      scheduleTriggers: scheduleTriggers.length,
      signalTriggers: enabled.length - scheduleTriggers.length,
      disabledTriggers: triggers.length - enabled.length,
      scheduledInRange: kept.filter((event) => event.kind === "scheduled").length,
      runsInRange: kept.filter((event) => event.kind === "run").length,
      approvalsInRange: kept.filter((event) => event.kind === "approval").length,
      pendingApprovals: pending.length,
      totalRuns: runs.length,
    },
    truncated,
    truncationDetail: truncated
      ? `More events fall in this range than are shown (${kept.length} returned). Narrow the ` +
        `range to see the rest; nothing was summarised or averaged.`
      : null,
  });
}
