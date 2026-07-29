/**
 * components/live/workspace/read-model.ts — the judgements the Workspace makes,
 * separated from the pixels that show them (ROLE_C_PLAN M5).
 *
 * Everything here is a pure function of a snapshot. That is worth the extra file
 * for one reason above all the usual ones: the load-bearing content of this
 * screen is not layout, it is a handful of definitions — what counts as "at
 * risk", what counts as "today", what a run is waiting on — and definitions
 * buried in JSX cannot be argued with, tested, or found again six weeks later.
 * `atRiskItems` below is the whole of the "anything at risk" tile; if it is
 * wrong, the tile is wrong, and it is one function to read.
 *
 * THREE DEFINITIONS THIS MODULE COMMITS TO, and the reasoning for each:
 *
 *   AT RISK is overdue approvals + dead-lettered jobs + failed runs + refused
 *   runs. The first three are self-evident. Refused is the arguable one: a
 *   refusal means the runtime correctly blocked an operation policy forbids, so
 *   in one sense it is the product working exactly as designed. It is counted
 *   anyway, because from the owner's chair it is still work that did not happen,
 *   and the cause — an agent whose plan asks it to do something it may not do —
 *   is a plan defect that will recur every time the workflow fires. Each row
 *   says which of the four it is, so the count is never the only signal.
 *
 *   SKIPPED IS NOT AT RISK, and this is the definition most likely to be
 *   "fixed" by someone who has not read lib/runtime/schedule/types.ts. A skipped
 *   job is quiet hours or the daily cap — `resolveRunStart` deciding an agent
 *   may not wake up — and the type header is explicit that "correctly did
 *   nothing at 3am" is a success that must not page anyone. It is surfaced with
 *   its reason and counted nowhere.
 *
 *   TODAY is one business day, not each row's own. A schedule fires in its own
 *   timezone and the API returns UTC instants, so grouping per row would let two
 *   triggers eleven minutes apart land under different headings. One zone,
 *   chosen by `businessZone` and named on screen, is the version an owner can
 *   actually reason about.
 *
 * NO WALL CLOCK. Every instant compared against comes from the server's own
 * `now`, which the scheduler and approvals routes return for exactly this
 * purpose. That is a house rule for `lib/runtime` and merely good sense here,
 * but "overdue" is the one word where a few minutes of client drift shows, and
 * the screen would rather say "the server thinks it is 09:04" than quietly
 * disagree with the runtime it is reporting on.
 */

import type { OperatingMode, RiskLevel } from "@/lib/plan/types";
import type { JobStatus } from "@/lib/runtime/schedule/types";
import type { RunStatus } from "@/lib/runtime/types";
import type { OutcomeMetric, WorkspacePlanFacts } from "./plan-facts";
import type {
  ApprovalsSnapshot,
  Loaded,
  PendingApprovalRow,
  RunRow,
  RunsSnapshot,
  SchedulerSnapshot,
  TriggerRow,
} from "./runtime-api";

/* ═══════════════════════════ Time, in one zone ═══════════════════════════ */

/**
 * A timezone the screen can format in, or an honest admission that it could not.
 *
 * `Intl.DateTimeFormat` throws a `RangeError` on a zone the runtime does not
 * know, and a plan is data — the zone in it is as untrusted as anything else
 * crossing the contract. Falling back to UTC and SAYING SO beats both
 * alternatives: crashing the screen over a typo in a plan, and silently
 * relabelling a Singapore morning as the previous day.
 */
export interface Zone {
  /** The zone actually being formatted in. */
  id: string;
  /** What the plan asked for; differs from `id` only when `ok` is false. */
  requested: string;
  /** False when the requested zone was unusable and UTC was substituted. */
  ok: boolean;
  /** "2026-07-24", for grouping. Null when the instant is unreadable. */
  dayKey(iso: string): string | null;
  /** "09:00". Null when the instant is unreadable. */
  time(iso: string): string | null;
  /** "Fri 24 Jul". Null when the instant is unreadable. */
  day(iso: string): string | null;
  /** "Fri 24 Jul · 09:00". Null when the instant is unreadable. */
  stamp(iso: string): string | null;
}

function partsFormatter(
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone });
}

export function createZone(requested: string): Zone {
  let id = requested;
  let ok = true;
  try {
    partsFormatter(requested, { year: "numeric" }).format(new Date(0));
  } catch {
    id = "UTC";
    ok = false;
  }

  const dayParts = partsFormatter(id, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timeText = partsFormatter(id, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const dayText = partsFormatter(id, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const instant = (iso: string): Date | null => {
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? new Date(ms) : null;
  };

  const dayKey = (iso: string): string | null => {
    const at = instant(iso);
    if (!at) return null;
    const parts = dayParts.formatToParts(at);
    const pick = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";
    const year = pick("year");
    const month = pick("month");
    const day = pick("day");
    return year && month && day ? `${year}-${month}-${day}` : null;
  };

  const time = (iso: string): string | null => {
    const at = instant(iso);
    return at ? timeText.format(at) : null;
  };

  const day = (iso: string): string | null => {
    const at = instant(iso);
    return at ? dayText.format(at) : null;
  };

  return {
    id,
    requested,
    ok,
    dayKey,
    time,
    day,
    stamp(iso: string): string | null {
      const d = day(iso);
      const t = time(iso);
      return d && t ? `${d} · ${t}` : null;
    },
  };
}

/* ═══════════════════════════ Naming things ═══════════════════════════ */

/**
 * Ids → the words the owner recognises.
 *
 * An id the plan does not contain is returned AS THE ID rather than as "Unknown
 * agent". The runtime outlives plan edits by design — triggers are frozen at
 * activation — so a run for an agent that has since left the plan is a real and
 * legitimate thing to see, and the id is the only handle anyone has on it.
 */
export interface Directory {
  agentName(agentId: string): string;
  agentMode(agentId: string): OperatingMode | null;
  workflowName(agentId: string, workflowId: string): string;
}

export function createDirectory(plan: WorkspacePlanFacts): Directory {
  const agents = new Map(plan.agents.map((agent) => [agent.id, agent]));
  const workflows = new Map(
    plan.workflows.map((workflow) => [
      `${workflow.agentId}/${workflow.id}`,
      workflow,
    ]),
  );

  return {
    agentName: (agentId) => agents.get(agentId)?.name ?? agentId,
    agentMode: (agentId) => agents.get(agentId)?.operatingMode ?? null,
    workflowName: (agentId, workflowId) =>
      workflows.get(`${agentId}/${workflowId}`)?.name ?? workflowId,
  };
}

/* ═══════════════════════════ Deep links ═══════════════════════════ */

/**
 * The inbox, focused on one item.
 *
 * `live` is carried through because the live Operate surface is behind an
 * explicit switch; dropping it here would land a click from the live Workspace
 * on the scripted demo inbox, where the approval it names does not exist.
 */
export function approvalsHref(approvalId: string | null, live: boolean): string {
  const params = new URLSearchParams();
  if (live) params.set("live", "1");
  if (approvalId !== null) params.set("focus", approvalId);
  const query = params.toString();
  return query === ""
    ? "/app/workspace/approvals"
    : `/app/workspace/approvals?${query}`;
}

/* ═══════════════════════════ Stat tiles ═══════════════════════════ */

/**
 * THREE STATES, NOT TWO, and the third is the one M7 added.
 *
 * A tile used to have a number or a dash, and the dash said "the source did not
 * answer". That sentence was printed for the first second of every page load,
 * before any source had been ASKED — so the screen opened by reporting four
 * failures that had not happened. `loading` is the missing word: the source has
 * not answered YET, which is neither a number nor a fault, and it renders as
 * neither.
 */
export type TileState =
  /** `value` is a number the runtime actually reported. */
  | "ready"
  /** The source has not answered yet. Not a failure, and not a nought. */
  | "loading"
  /** The source answered with a failure, or could not be reached. */
  | "unavailable";

export interface StatTile {
  id: string;
  label: string;
  /** Null unless `state` is "ready". Never a stand-in for an unread source. */
  value: number | null;
  state: TileState;
  /**
   * The window the number covers, what is being read, or why there is no
   * number. Always present, because a tile with no number and no explanation is
   * the failure this whole type exists to prevent.
   */
  detail: string;
  /** Whether a non-zero value means something needs doing. */
  tone: "neutral" | "attention";
}

/**
 * What one source is currently doing.
 *
 * The `data: null, error: null` pair is `load`'s report of an ABORT — a
 * superseded refresh — which is honestly "still reading", because the refresh
 * that superseded it is.
 */
function sourceState(source: Loaded<unknown>): TileState {
  if (source.data !== null) return "ready";
  return source.error === null ? "loading" : "unavailable";
}

/** The worst state across several sources, and which ones actually failed. */
function combine(
  sources: ReadonlyArray<{ name: string; source: Loaded<unknown> }>,
): { state: TileState; failed: string[] } {
  const failed = sources
    .filter((entry) => sourceState(entry.source) === "unavailable")
    .map((entry) => entry.name);
  if (failed.length > 0) return { state: "unavailable", failed };
  const loading = sources.some((entry) => sourceState(entry.source) === "loading");
  return { state: loading ? "loading" : "ready", failed };
}

function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function statTiles(input: {
  scheduler: Loaded<SchedulerSnapshot>;
  approvals: Loaded<ApprovalsSnapshot>;
  runs: Loaded<RunsSnapshot>;
  /** Derived by the page; null whenever any of its three sources is not ready. */
  atRisk: AttentionItem[] | null;
  upcoming: UpcomingEntry[] | null;
}): StatTile[] {
  const scheduler = sourceState(input.scheduler);
  const approvals = sourceState(input.approvals);
  const risk = combine([
    { name: "the scheduler", source: input.scheduler },
    { name: "the approvals inbox", source: input.approvals },
    { name: "the run log", source: input.runs },
  ]);

  const schedulerDetail =
    scheduler === "loading"
      ? "Reading the scheduler…"
      : "The scheduler did not answer.";

  return [
    {
      id: "workflows",
      label: "Active workflows",
      value:
        input.scheduler.data === null
          ? null
          : input.scheduler.data.triggers.filter((trigger) => trigger.enabled).length,
      state: scheduler,
      detail: scheduler === "ready" ? "registered and enabled" : schedulerDetail,
      tone: "neutral",
    },
    {
      id: "approvals",
      label: "Approvals needing a decision",
      value: input.approvals.data === null ? null : input.approvals.data.pending.length,
      state: approvals,
      detail:
        approvals === "ready"
          ? "waiting on you now"
          : approvals === "loading"
            ? "Reading the approvals inbox…"
            : "The approvals inbox did not answer, so this is NOT a count of zero.",
      tone: "attention",
    },
    {
      id: "risk",
      label: "At risk",
      // Withheld unless every one of its three sources answered — a partial
      // "at risk" count reads as reassurance it has not earned.
      value: risk.state === "ready" && input.atRisk !== null ? input.atRisk.length : null,
      state: risk.state,
      detail:
        risk.state === "ready"
          ? "overdue, dead-lettered, failed or refused"
          : risk.state === "loading"
            ? "Reading the scheduler, the inbox and the run log…"
            : `At risk needs the scheduler, the inbox and the run log; ${list(risk.failed)} did not answer.`,
      tone: "attention",
    },
    {
      id: "scheduled",
      label: "Scheduled runs upcoming",
      value: scheduler === "ready" && input.upcoming !== null ? input.upcoming.length : null,
      state: scheduler,
      detail: scheduler === "ready" ? "next fires and queued work" : schedulerDetail,
      tone: "neutral",
    },
  ];
}

/* ═══════════════════════════ At risk ═══════════════════════════ */

export type AttentionKind =
  | "overdue_approval"
  | "dead_letter"
  | "failed_run"
  | "refused_run";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  /** What it is, in the owner's language. */
  title: string;
  /** Why it is here. Never empty. */
  detail: string;
  agentId: string;
  workflowId: string;
  /** Where to go and deal with it, when there is somewhere to go. */
  href: string | null;
}

export const ATTENTION_LABEL = {
  overdue_approval: "Overdue approval",
  dead_letter: "Dead-lettered job",
  failed_run: "Failed run",
  refused_run: "Refused by policy",
} satisfies Record<AttentionKind, string>;

/**
 * Everything that needs a human, ordered by how directly it is the owner's move.
 *
 * Overdue approvals first: they are the only entries where the owner IS the
 * remedy. A dead-lettered job or a failed run needs a diagnosis; an approval
 * that blew its `escalateAfterMins` deadline needs a decision, and every minute
 * it waits is a minute an agent is idle by design.
 */
export function atRiskItems(input: {
  approvals: ApprovalsSnapshot;
  scheduler: SchedulerSnapshot;
  runs: RunsSnapshot;
  directory: Directory;
  live: boolean;
}): AttentionItem[] {
  const { approvals, scheduler, runs, directory, live } = input;
  const items: AttentionItem[] = [];

  for (const approval of approvals.pending) {
    if (approval.deadline.state === "due") continue;
    items.push({
      id: `approval:${approval.approvalId}`,
      kind: "overdue_approval",
      title: `${directory.agentName(approval.agentId)} — ${approval.operation}`,
      detail: approval.deadline.detail,
      agentId: approval.agentId,
      workflowId: approval.workflowId,
      href: approvalsHref(approval.approvalId, live),
    });
  }

  for (const job of scheduler.jobs) {
    if (job.status !== "dead_letter") continue;
    items.push({
      id: `job:${job.jobId}`,
      kind: "dead_letter",
      title: `${directory.agentName(job.agentId)} — ${directory.workflowName(
        job.agentId,
        job.workflowId,
      )}`,
      detail:
        job.error ??
        `Gave up after ${job.attempt} of ${job.maxAttempts} attempts. Nothing retries it automatically.`,
      agentId: job.agentId,
      workflowId: job.workflowId,
      href: null,
    });
  }

  for (const run of runs.runs) {
    if (run.status !== "failed" && run.status !== "refused") continue;
    items.push({
      id: `run:${run.runId}`,
      kind: run.status === "failed" ? "failed_run" : "refused_run",
      title: `${directory.agentName(run.agentId)} — ${directory.workflowName(
        run.agentId,
        run.workflowId,
      )}`,
      detail:
        run.failure ??
        (run.status === "failed"
          ? "The run ended in failure and recorded no reason."
          : "Policy refused the operation and ended the run."),
      agentId: run.agentId,
      workflowId: run.workflowId,
      href: null,
    });
  }

  return items;
}

/**
 * Jobs the scheduler correctly declined to start.
 *
 * Kept apart from `atRiskItems` on purpose — see the module header. These are
 * shown so an owner can tell "the agent decided not to" from "the agent broke",
 * which is the exact distinction `JobStatus.skipped` exists to preserve.
 */
export interface SkippedEntry {
  jobId: string;
  agentId: string;
  workflowId: string;
  reason: string;
  at: string;
}

export function skippedJobs(scheduler: SchedulerSnapshot): SkippedEntry[] {
  return scheduler.jobs
    .filter((job) => job.status === "skipped")
    .map((job) => ({
      jobId: job.jobId,
      agentId: job.agentId,
      workflowId: job.workflowId,
      reason: job.skipReason ?? "The scheduler skipped this run and gave no reason.",
      at: job.endedAt ?? job.enqueuedAt,
    }));
}

/* ═══════════════════════════ The schedule ═══════════════════════════ */

export interface UpcomingEntry {
  key: string;
  /** The instant this is expected to run. */
  at: string;
  agentId: string;
  workflowId: string;
  /** One line about why it is due when it is due. */
  detail: string;
  source: "trigger" | "job";
  /** Set for queued work; null for a trigger that has not fired yet. */
  jobStatus: JobStatus | null;
}

/**
 * What is going to run, soonest first.
 *
 * Two sources, deliberately merged rather than shown as separate lists. A
 * trigger's `nextFireAt` is an intention; a queued job is that intention already
 * committed to the queue and waiting for a worker. An owner asking "what runs
 * next" means both, and splitting them would show the same Friday sweep twice —
 * once as a schedule and once as a job — with no way to tell they are the same
 * event. The job wins where both exist, because a queued job is the more
 * definite fact.
 */
export function upcomingRuns(input: {
  scheduler: SchedulerSnapshot;
  directory: Directory;
}): UpcomingEntry[] {
  const { scheduler, directory } = input;
  const nowMs = Date.parse(scheduler.now);
  const entries: UpcomingEntry[] = [];
  const claimed = new Set<string>();

  for (const job of scheduler.jobs) {
    if (job.status !== "queued" && job.status !== "running") continue;
    claimed.add(`${job.agentId}/${job.workflowId}`);
    entries.push({
      key: `job:${job.jobId}`,
      at: job.status === "running" ? job.startedAt ?? job.runAfter : job.runAfter,
      agentId: job.agentId,
      workflowId: job.workflowId,
      detail:
        job.status === "running"
          ? "Running now."
          : job.attempt > 1
            ? `Queued — retry ${job.attempt} of ${job.maxAttempts}.`
            : "Queued, waiting for a worker.",
      source: "job",
      jobStatus: job.status,
    });
  }

  for (const trigger of scheduler.triggers) {
    if (!trigger.enabled || trigger.nextFireAt === null) continue;
    // A fire time in the past means the trigger is due and no pass has run yet.
    // Kept rather than hidden: "overdue to fire" is exactly what an owner needs
    // to see when nothing is turning the scheduler.
    if (claimed.has(`${trigger.agentId}/${trigger.workflowId}`)) continue;
    const fireMs = Date.parse(trigger.nextFireAt);
    entries.push({
      key: `trigger:${trigger.triggerId}`,
      at: trigger.nextFireAt,
      agentId: trigger.agentId,
      workflowId: trigger.workflowId,
      detail:
        Number.isFinite(fireMs) && Number.isFinite(nowMs) && fireMs < nowMs
          ? `${trigger.label} — due now, waiting for the scheduler to turn.`
          : trigger.label,
      source: "trigger",
      jobStatus: null,
    });
  }

  // Unreadable instants sort last rather than throwing off the order; they are
  // still shown, with the time rendered as unreadable by the panel.
  return entries.sort((a, b) => {
    const left = Date.parse(a.at);
    const right = Date.parse(b.at);
    if (!Number.isFinite(left) && !Number.isFinite(right)) {
      return a.key.localeCompare(b.key);
    }
    if (!Number.isFinite(left)) return 1;
    if (!Number.isFinite(right)) return -1;
    if (left !== right) return left - right;
    return `${directory.agentName(a.agentId)}${a.key}`.localeCompare(
      `${directory.agentName(b.agentId)}${b.key}`,
    );
  });
}

export interface SplitSchedule {
  today: UpcomingEntry[];
  later: UpcomingEntry[];
  /** True when `now` or the zone could not produce a day to compare against. */
  undated: boolean;
}

/** Splits the upcoming list on the business day named by `zone`. */
export function splitByDay(
  entries: UpcomingEntry[],
  now: string,
  zone: Zone,
): SplitSchedule {
  const todayKey = zone.dayKey(now);
  if (todayKey === null) return { today: [], later: entries, undated: true };

  const today: UpcomingEntry[] = [];
  const later: UpcomingEntry[] = [];
  for (const entry of entries) {
    if (zone.dayKey(entry.at) === todayKey) today.push(entry);
    else later.push(entry);
  }
  return { today, later, undated: false };
}

/**
 * Triggers that are live but have no next fire time.
 *
 * `event`, `threshold`, `dependency` and `manual` triggers are driven by
 * something arriving rather than by time passing, so they can never appear in
 * the schedule — and a workflow the owner believes is live but which never shows
 * up anywhere is the worst outcome this screen can produce. They get their own
 * list, with what each is waiting for spelled out.
 */
export interface WaitingTrigger {
  triggerId: string;
  agentId: string;
  workflowId: string;
  label: string;
  waitingFor: string;
}

const WAITING_FOR = {
  event: "Starts when the integration reports the event it listens for.",
  threshold: "Starts when the metric it watches crosses its threshold.",
  dependency: "Starts after the workflow it depends on completes.",
  manual: "Starts only when someone runs it.",
  schedule: "Waiting for its next fire time to be computed.",
} satisfies Record<TriggerRow["kind"], string>;

export function waitingTriggers(scheduler: SchedulerSnapshot): WaitingTrigger[] {
  return scheduler.triggers
    .filter((trigger) => trigger.enabled && trigger.nextFireAt === null)
    .map((trigger) => ({
      triggerId: trigger.triggerId,
      agentId: trigger.agentId,
      workflowId: trigger.workflowId,
      label: trigger.label,
      waitingFor: WAITING_FOR[trigger.kind],
    }));
}

/* ═══════════════════════════ The run feed ═══════════════════════════ */

export interface ActivityRow {
  runId: string;
  agentId: string;
  workflowId: string;
  status: RunStatus;
  startedAt: string;
  endedAt: string | null;
  /** What this run is waiting on, or what ended it. Never empty. */
  detail: string;
  /** The approval blocking it, when there is one. */
  approvalId: string | null;
  risk: RiskLevel | null;
  href: string | null;
}

/**
 * Recent runs, newest first, each saying what it is waiting on.
 *
 * The join to pending approvals is what turns "awaiting_approval" from a status
 * into a sentence: the run knows only its `pendingApprovalId`, and the operation
 * being proposed and the deadline it is against live on the approval. A run
 * whose approval is not in the pending list is reported as exactly that rather
 * than as a plain wait — it means the decision was recorded but the run has not
 * settled, which is a state worth seeing rather than smoothing over.
 */
export function activityRows(input: {
  runs: RunsSnapshot;
  approvals: ApprovalsSnapshot | null;
  live: boolean;
  limit: number;
}): ActivityRow[] {
  const pending = new Map<string, PendingApprovalRow>(
    (input.approvals?.pending ?? []).map((item) => [item.approvalId, item]),
  );

  return [...input.runs.runs]
    .sort((a, b) => {
      const left = Date.parse(a.startedAt);
      const right = Date.parse(b.startedAt);
      if (Number.isFinite(left) && Number.isFinite(right) && left !== right) {
        return right - left;
      }
      return b.runId.localeCompare(a.runId);
    })
    .slice(0, input.limit)
    .map((run) => describeRun(run, pending, input.live));
}

function describeRun(
  run: RunRow,
  pending: Map<string, PendingApprovalRow>,
  live: boolean,
): ActivityRow {
  const base = {
    runId: run.runId,
    agentId: run.agentId,
    workflowId: run.workflowId,
    status: run.status,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    approvalId: run.pendingApprovalId,
    risk: null as RiskLevel | null,
    href: null as string | null,
  };

  switch (run.status) {
    case "awaiting_approval": {
      const approval =
        run.pendingApprovalId === null ? undefined : pending.get(run.pendingApprovalId);
      if (!approval) {
        return {
          ...base,
          detail:
            "Paused for an approval that is no longer pending — the decision is " +
            "recorded but the run has not settled.",
        };
      }
      return {
        ...base,
        detail: `${approval.operation} — ${approval.deadline.detail}`,
        risk: approval.risk,
        href: approvalsHref(approval.approvalId, live),
      };
    }
    case "running":
      return {
        ...base,
        detail: `In progress — ${run.events} ${run.events === 1 ? "event" : "events"} recorded so far.`,
      };
    case "completed":
      return { ...base, detail: "Finished with no decision outstanding." };
    case "failed":
      return { ...base, detail: run.failure ?? "Failed and recorded no reason." };
    case "refused":
      return {
        ...base,
        detail: run.failure ?? "Policy refused the operation and ended the run.",
      };
    case "cancelled":
      return { ...base, detail: "Cancelled before it finished." };
  }
}

/* ═══════════════════════ Outcome progress ═══════════════════════ */

/**
 * What is genuinely known about one metric — and, just as importantly, what is
 * not.
 *
 * `current` is absent from this type. That is not an oversight and it is not a
 * gap to fill with the latest run's numbers: nothing in the runtime measures
 * `invoice.days_to_payment`, so there is no honest value to put there.
 * PLAN_CONTRACT §1 says structure exists so measurement can be rendered rather
 * than described; the corollary is that a measurement nobody took must render as
 * untaken. A plausible-looking number here would be the one fabricated fact on
 * an otherwise evidenced screen, and it would be the fact an owner acted on.
 *
 * What IS known: the target, the direction, the baseline where the approved
 * report supplied one (`baseline: number | null` — contract §3.2), and the gap
 * between the two. `gap` is arithmetic over two plan numbers, not a claim about
 * the world.
 */
export interface MetricReading {
  id: string;
  label: string;
  metric: string;
  direction: OutcomeMetric["direction"];
  /** Formatted for display, e.g. "34 days". Null when the plan has no baseline. */
  baseline: string | null;
  target: string;
  /** "13 days better than the baseline". Null when there is no baseline. */
  gap: string | null;
  /** Why there is no current value. Always set — see the type header. */
  unmeasured: string;
}

const UNMEASURED =
  "Not measured — the runtime records runs and approvals, not this metric.";

const UNMEASURED_NO_BASELINE =
  "Not measured, and the approved plan carries no baseline for it either.";

export function readMetric(metric: OutcomeMetric): MetricReading {
  const target = formatMeasure(metric.target, metric.unit);
  if (metric.baseline === null) {
    return {
      id: metric.id,
      label: metric.label,
      metric: metric.metric,
      direction: metric.direction,
      baseline: null,
      target,
      gap: null,
      unmeasured: UNMEASURED_NO_BASELINE,
    };
  }

  const distance = Math.abs(metric.target - metric.baseline);
  const towards =
    metric.direction === "decrease"
      ? metric.target < metric.baseline
      : metric.target > metric.baseline;

  return {
    id: metric.id,
    label: metric.label,
    metric: metric.metric,
    direction: metric.direction,
    baseline: formatMeasure(metric.baseline, metric.unit),
    target,
    gap:
      distance === 0
        ? "The target is the baseline — no movement asked for."
        : towards
          ? `${formatMeasure(distance, metric.unit)} of movement asked for.`
          : // A target on the wrong side of the baseline is a plan defect, and
            // saying so is more useful than rendering the distance as progress.
            `The target is ${formatMeasure(distance, metric.unit)} the wrong side of the baseline for a ${metric.direction}.`,
    unmeasured: UNMEASURED,
  };
}

export function directionLabel(direction: OutcomeMetric["direction"]): string {
  return direction === "decrease" ? "Lower is better" : "Higher is better";
}

/**
 * A number with its unit, in the units the contract actually uses.
 *
 * Unrecognised units are printed verbatim beside the number rather than dropped.
 * `unit` is an open string in the contract (§8 Q4 is still open on the metric
 * vocabulary), so an unknown one is expected rather than exceptional.
 */
const UNIT_SUFFIX: Record<string, { one: string; many: string }> = {
  percent: { one: "%", many: "%" },
  days: { one: "day", many: "days" },
  day: { one: "day", many: "days" },
  hours: { one: "hour", many: "hours" },
  hour: { one: "hour", many: "hours" },
  minutes: { one: "minute", many: "minutes" },
  minute: { one: "minute", many: "minutes" },
  count: { one: "", many: "" },
};

function formatMeasure(value: number, unit: string): string {
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
  const known = UNIT_SUFFIX[unit.toLowerCase()];
  if (!known) {
    // Currencies and anything else read as a prefix-or-suffix we cannot guess,
    // so the unit is shown as written in the plan.
    return unit.trim() === "" ? rounded : `${rounded} ${unit}`;
  }
  const word = Math.abs(value) === 1 ? known.one : known.many;
  if (word === "") return rounded;
  return word === "%" ? `${rounded}%` : `${rounded} ${word}`;
}

/**
 * The agents an outcome is attributed to, and what the runtime knows about each.
 *
 * This is the honest substitute for a progress number. It cannot say the
 * days-to-payment moved, but it can say which agents were made responsible, that
 * they are live, and how much work they have actually done — every part of which
 * is a fact the runtime holds.
 */
export interface OutcomeAttribution {
  agentId: string;
  name: string;
  /** False when the outcome names an agent the plan no longer contains. */
  inPlan: boolean;
  /** Null when the scheduler did not answer. */
  liveTriggers: number | null;
  /** Null when the run log did not answer. */
  runs: number | null;
  awaitingDecision: number;
}

export function attributions(input: {
  agentIds: string[];
  plan: WorkspacePlanFacts;
  scheduler: SchedulerSnapshot | null;
  runs: RunsSnapshot | null;
  approvals: ApprovalsSnapshot | null;
  directory: Directory;
}): OutcomeAttribution[] {
  const known = new Set(input.plan.agents.map((agent) => agent.id));

  return input.agentIds.map((agentId) => ({
    agentId,
    name: input.directory.agentName(agentId),
    inPlan: known.has(agentId),
    liveTriggers: input.scheduler
      ? input.scheduler.triggers.filter(
          (trigger) => trigger.agentId === agentId && trigger.enabled,
        ).length
      : null,
    runs: input.runs
      ? input.runs.runs.filter((run) => run.agentId === agentId).length
      : null,
    awaitingDecision: (input.approvals?.pending ?? []).filter(
      (approval) => approval.agentId === agentId,
    ).length,
  }));
}

/* ═══════════════════════════ Activation ═══════════════════════════ */

/**
 * Whether this plan has ever been put live, judged from the triggers alone.
 *
 * `activate()` registers triggers first, so their existence is the cheapest
 * honest evidence a go-live happened — and it costs nothing, where asking
 * /api/runtime/activation costs a full sandbox suite. Note the test is
 * "registered", not "enabled": an owner who has paused every agent has an
 * activated plan with nothing running, and telling them to go and activate it
 * would be wrong.
 */
export function looksActivated(scheduler: SchedulerSnapshot): boolean {
  return scheduler.triggers.length > 0;
}
