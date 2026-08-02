/**
 * components/live/agents/read-model.ts — the judgements the roster makes,
 * separated from the pixels that show them (ROLE_C_PLAN M6).
 *
 * The load-bearing content of this screen is not layout. It is a short list of
 * definitions — what "doing now" means, what to say when there is no next run,
 * when a count is missing rather than zero — and definitions buried in JSX cannot
 * be argued with, tested, or found again six weeks later. Each one below is a
 * pure function of a snapshot the route already produced.
 *
 * THREE DEFINITIONS THIS MODULE COMMITS TO.
 *
 *   DOING NOW is the runs in flight, and nothing else. A registered trigger that
 *   has not fired is not activity; a completed run is not activity. In flight
 *   means `running` or `awaiting_approval` — and the second one is included
 *   deliberately, because a run paused for a decision IS the agent doing
 *   something: it is holding a customer email open, waiting on a human. Treating
 *   it as idle is how an approval sits for a day.
 *
 *   NO NEXT RUN HAS FOUR DIFFERENT CAUSES AND THEY ARE NEVER MERGED. Paused,
 *   never activated, registered-but-stood-down, and live-but-waiting-for-a-signal
 *   all produce an empty schedule column, and each asks something completely
 *   different of the owner — resume it, activate the plan, look at why the
 *   triggers are off, or nothing at all. "Nothing scheduled" on its own is true
 *   and useless.
 *
 *   A COUNT THAT COULD NOT BE TAKEN IS ABSENT, NEVER ZERO. `runsToday` is null
 *   when the agent's timezone could not be resolved, and it renders as an
 *   admission. Zero would read as "plenty of headroom left under the cap today",
 *   which is the one wrong answer available.
 *
 * NO WALL CLOCK. Every instant compared against comes from the server's own
 * `now`, which the route returns for exactly this purpose. Time formatting goes
 * through `createZone` from the Workspace's read-model rather than a second
 * formatter here — one honest treatment of an unusable timezone across the whole
 * Operate surface, and one fewer place for a Singapore morning to be relabelled
 * as the previous day.
 */

import type { Op, OperatingMode, QuietHours } from "@/lib/plan/types";
import type { Zone } from "@/components/live/workspace/read-model";
import { agentStateLabel } from "./pills";
import type { AgentView, RunView, WorkflowView } from "./api";

/* ═══════════════════════════ Labels ═══════════════════════════ */

/**
 * The same three words the scripted roster uses, restated against the CONTRACT's
 * `OperatingMode` rather than imported from `components/mock`. The live lane
 * carries no dependency on the demo lane — but the wording is deliberately
 * identical, because the two screens describe one setting.
 */
export const MODE_LABEL = {
  draft_only: "Prepares the work and waits for you — it never acts on its own",
  act_after_approval: "Acts only after you approve",
  auto_within_limits: "Works within the limits you set",
} satisfies Record<OperatingMode, string>;

/**
 * How a workflow is started, in the owner's words.
 *
 * The stored word ("schedule", "dependency") is a vocabulary this product's
 * reader never chose and cannot look up, so it is never rendered on its own.
 */
export const KIND_LABEL = {
  schedule: "On a schedule",
  event: "When something happens in a connected tool",
  threshold: "When a number crosses a line",
  dependency: "After another workflow finishes",
  manual: "Only when someone starts it",
} satisfies Record<WorkflowView["kind"], string>;

/**
 * A comparison, as words rather than as a symbol. A limit is one of the few
 * places this screen shows an owner a rule they are being held to, and "at most
 * 1200" is a rule; "<= 1200" is a fragment of a config file.
 */
export const LIMIT_OP_WORD = {
  "<": "under",
  "<=": "at most",
  ">": "over",
  ">=": "at least",
  "==": "exactly",
} satisfies Record<Op, string>;

/**
 * What a trigger with no `nextFireAt` is waiting for.
 *
 * `event`, `threshold`, `dependency` and `manual` triggers are driven by
 * something arriving rather than by time passing, so they can never show a clock.
 * Saying nothing would leave a live workflow looking dormant; this says what
 * would start it. `schedule` is in the map because a schedule trigger with no
 * next fire time is a real state — registration failed to compute one — and it
 * should not fall through to a generic sentence.
 */
export const WAITING_FOR = {
  schedule: "Waiting for its next run time to be worked out.",
  event: "Starts when the connected tool reports the event it listens for.",
  threshold: "Starts when the metric it watches crosses its threshold.",
  dependency: "Starts after the workflow it depends on completes.",
  manual: "Starts only when someone runs it.",
} satisfies Record<WorkflowView["kind"], string>;

export function describeQuietHours(quietHours: QuietHours | null): string | null {
  return quietHours === null
    ? null
    : `${quietHours.start} to ${quietHours.end} ${quietHours.timezone}`;
}

/** Workflow id → the name the owner recognises; the id when the plan lost it. */
export function workflowNames(agent: AgentView): Map<string, string> {
  return new Map(agent.workflows.map((workflow) => [workflow.workflowId, workflow.name]));
}

export function isInFlight(run: RunView): boolean {
  return run.status === "running" || run.status === "awaiting_approval";
}

/* ═══════════════════════════ Doing now ═══════════════════════════ */

export interface ActivityReading {
  /** One line naming what it is doing, or that it is doing nothing. */
  headline: string;
  /** The runtime's own sentence beneath it, or why there is nothing to say. */
  detail: string;
  /** More in flight than the headline names. Null when there is only the one. */
  extra: string | null;
  /** True when a run is holding for a human decision. */
  needsDecision: boolean;
  /** The approval blocking the headline run, for a deep link. */
  approvalId: string | null;
}

/**
 * What this agent is doing at the instant the roster was read.
 *
 * The headline names the run that most needs attention rather than the newest
 * one: a run waiting on a decision outranks a run that is simply executing,
 * because only one of the two is stalled on a person.
 */
export function readActivity(agent: AgentView): ActivityReading {
  const names = workflowNames(agent);
  const inFlight = agent.runs.filter(isInFlight);

  if (inFlight.length === 0) {
    return {
      headline: "Nothing running",
      detail:
        agent.runtime === null
          ? "This agent has never been put live, so nothing has ever started it."
          : agent.runtime.state === "paused"
            ? "Paused — nothing will start a run until it is resumed."
            : agent.counts.registeredTriggers === 0
              ? "Nothing is set up to start this agent, so it will not run."
              : "Nothing is running. The next run starts when one of its triggers fires.",
      extra: null,
      needsDecision: false,
      approvalId: null,
    };
  }

  const waiting = inFlight.find((run) => run.status === "awaiting_approval");
  const lead = waiting ?? inFlight[0];

  return {
    headline: names.get(lead.workflowId) ?? lead.workflowId,
    // The route's sentence, verbatim. It is the one that already joined the run
    // to its pending approval and its deadline.
    detail: lead.detail,
    extra:
      inFlight.length === 1
        ? null
        : `${inFlight.length - 1} other ${inFlight.length === 2 ? "run is" : "runs are"} also in flight.`,
    needsDecision: waiting !== undefined,
    approvalId: lead.pendingApprovalId,
  };
}

/* ═══════════════════════════ Next run ═══════════════════════════ */

export interface NextRunReading {
  /** A formatted instant, or a phrase when there is no instant to give. */
  headline: string;
  detail: string;
  /** True only when a real scheduled time is behind the headline. */
  scheduled: boolean;
}

/**
 * When this agent next wakes up, or — far more usefully — why it does not.
 *
 * See the module header: the four causes of an empty schedule are kept apart
 * because they need four different responses. The soonest enabled `schedule`
 * trigger wins; a fire time already in the past is still reported, because
 * "overdue to fire" is precisely what an owner needs to see when nothing is
 * turning the scheduler.
 */
export function readNextRun(agent: AgentView, zone: Zone, now: string): NextRunReading {
  let soonest: { workflow: WorkflowView; at: string; ms: number } | null = null;
  const waitingOnSignal: WorkflowView[] = [];

  for (const workflow of agent.workflows) {
    const trigger = workflow.trigger;
    if (trigger === null || !trigger.enabled) continue;
    if (trigger.nextFireAt === null) {
      waitingOnSignal.push(workflow);
      continue;
    }
    const ms = Date.parse(trigger.nextFireAt);
    // An unreadable instant is not silently dropped; it just cannot win the
    // comparison, and the branch below reports it as unreadable if it is all
    // there is.
    if (!Number.isFinite(ms)) continue;
    if (soonest === null || ms < soonest.ms) {
      soonest = { workflow, at: trigger.nextFireAt, ms };
    }
  }

  if (soonest !== null) {
    const stamp = zone.stamp(soonest.at);
    const nowMs = Date.parse(now);
    const overdue = Number.isFinite(nowMs) && soonest.ms < nowMs;
    return {
      headline: stamp ?? "An instant this browser cannot read",
      detail: overdue
        ? `${soonest.workflow.name} — due now, waiting to start.`
        : `${soonest.workflow.name} · ${soonest.workflow.label}`,
      scheduled: true,
    };
  }

  if (waitingOnSignal.length > 0) {
    const first = waitingOnSignal[0];
    return {
      headline: "Waiting for a signal",
      detail:
        waitingOnSignal.length === 1
          ? `${first.name} — ${WAITING_FOR[first.kind]}`
          : `${waitingOnSignal.length} workflows are live with no clock behind them. ` +
            `${first.name} — ${WAITING_FOR[first.kind]}`,
      scheduled: false,
    };
  }

  if (agent.runtime === null) {
    return {
      headline: "Nothing scheduled",
      detail: "This agent has never been put live, so nothing has ever been set up to start it.",
      scheduled: false,
    };
  }

  if (agent.runtime.state === "paused") {
    return {
      headline: "Nothing scheduled",
      detail:
        "Paused — every trigger is switched off. Resuming picks them up again from the next " +
        "time each is due; runs missed while it was paused are not made up.",
      scheduled: false,
    };
  }

  if (agent.counts.registeredTriggers === 0) {
    return {
      headline: "Nothing scheduled",
      detail:
        "Nothing is set up to start this agent, so it will not run. Putting the plan live " +
        "again is what sets that up.",
      scheduled: false,
    };
  }

  return {
    headline: "Nothing scheduled",
    detail:
      `${agent.counts.registeredTriggers} ${
        agent.counts.registeredTriggers === 1 ? "trigger is" : "triggers are"
      } set up and every one of them is switched off, while the agent itself reads as ` +
      `"${agentStateLabel(agent.runtime.state)}". Those two disagree, so treat the state as ` +
      `unexplained.`,
    scheduled: false,
  };
}

/* ═══════════════════════════ Counts ═══════════════════════════ */

export interface CountReading {
  /** Stable key; the label may change wording without breaking a React list. */
  id: string;
  label: string;
  /** Null when the source could not answer. Rendered as an em dash and a reason. */
  value: number | null;
  /**
   * Printed straight after the value — " / 6" for a capped agent. Composed here
   * rather than in the card so no component has to test a label string to work
   * out whether a cap applies.
   */
  suffix: string | null;
  /** The window or qualifier the number covers, or why it is missing. */
  sub: string;
  /** True when a non-zero value means something needs doing. */
  attention: boolean;
}

/**
 * The four numbers a roster row is worth reading for.
 *
 * Skipped jobs are deliberately NOT folded into failures. A skipped job is quiet
 * hours or the daily cap — the agent correctly deciding not to wake up — and
 * lib/runtime/schedule/types.ts is explicit that "correctly did nothing at 3am"
 * is a success that must not page anyone. It is shown with its own label so an
 * owner can tell "the agent decided not to" from "the agent broke".
 */
export function readCounts(agent: AgentView): CountReading[] {
  const counts = agent.counts;

  const cap =
    counts.maxRunsPerDay === null
      ? "no daily cap"
      : `of ${counts.maxRunsPerDay} allowed · ${counts.dayTimezone}`;

  const failures = counts.failedRuns + counts.refusedRuns + counts.deadLetterJobs;

  return [
    {
      id: "runs-today",
      label: "Runs today",
      value: counts.runsToday,
      suffix:
        counts.runsToday === null || counts.maxRunsPerDay === null
          ? null
          : ` / ${counts.maxRunsPerDay}`,
      sub: counts.runsTodayUnavailable ?? cap,
      attention:
        counts.maxRunsPerDay !== null &&
        counts.runsToday !== null &&
        counts.runsToday >= counts.maxRunsPerDay,
    },
    {
      id: "approvals",
      label: "Waiting on you",
      value: counts.pendingApprovals,
      suffix: null,
      sub:
        counts.overdueApprovals > 0
          ? `${counts.overdueApprovals} past the escalation deadline`
          : "approvals this agent has raised",
      attention: counts.pendingApprovals > 0,
    },
    {
      id: "failures",
      label: "Failures",
      value: failures,
      suffix: null,
      sub: `${counts.failedRuns} failed · ${counts.refusedRuns} blocked by your rules · ${counts.deadLetterJobs} gave up after retrying`,
      attention: failures > 0,
    },
    {
      id: "skipped",
      label: "Skipped",
      value: counts.skippedJobs,
      suffix: null,
      sub: "quiet hours or the daily cap — not a failure",
      attention: false,
    },
  ];
}
