/**
 * app/api/runtime/agents/route.ts — the roster, and the two transitions an owner
 * is allowed to ask for (ROLE_C_PLAN M6).
 *
 *   GET                       one row per agent in the approved plan
 *   POST { agentId, action }   "pause" or "resume"
 *
 * NOTHING HERE IS A SECOND SOURCE OF TRUTH. Every field below is re-derived on
 * read from something that already owns it: `AgentRuntimeRecord` for the state,
 * the SchedulerStore for triggers and queued work, the RunStore for runs and
 * approvals, and the `ApprovedPlan` for the config. There is no roster table and
 * no cached summary, for the same reason `activationChecklist` refuses to
 * memoise: a roster is read precisely when somebody suspects something is wrong,
 * and a stale row is worse than a slow one.
 *
 * THE PLAN HALF AND THE RUNTIME HALF ARE ANSWERED IN ONE READ, AT ONE INSTANT.
 * "Waiting on Sarah for 4h" and "next fires Friday 09:00" are only comparable if
 * they were judged against the same clock, so `now` is taken once at the top and
 * returned with the body — the same contract `/api/runtime/{scheduler,approvals}`
 * publish, and for the same reason: a client must never have to trust its own
 * clock agrees with the server's.
 *
 * PAUSE AND RESUME DELEGATE; THEY DO NOT RE-DECIDE. `pauseAgent` and
 * `resumeAgent` (lib/runtime/schedule/activation.ts) hold the transition rules —
 * triggers off before the record says paused, record says active before any
 * trigger can fire, a resume refused when the agent left the plan, was never
 * activated, drifted in version, or is in a state resume does not restart.
 * `POST /api/runtime/scheduler` already exposed the same pair in M4 and calls the
 * same two functions, so there is ONE implementation of those rules and two doors
 * onto it. This door exists because the roster needs the change in the roster's
 * own vocabulary, and because a screen about agents should not have to POST to a
 * route named after the queue.
 *
 * THERE IS NO "STOP", AND THIS ROUTE SAYS SO RATHER THAN INVENTING ONE.
 * ROLE_C_PLAN M6 lists "pause/resume/stop"; `AgentRuntimeState` has five values
 * and none of them is stopped, and activation.ts has no third function. Pause IS
 * the stop — it disables every trigger and marks the agent paused, and its own
 * header says stopping is never the unsafe direction. The one stop-shaped
 * primitive the runtime does have is `cancelRun(runId)`, which ends a single run
 * in flight and says nothing about whether the agent runs again. So `stop` is
 * refused with that sentence rather than quietly mapped onto pause: an owner who
 * presses a button labelled "stop" and gets a pause has been told something
 * untrue about what the workforce will do tomorrow morning.
 *
 * THE CONFIG IS D'S, AND IS SERVED READ-ONLY. Operating mode, limits,
 * `alwaysApprove`, `forbidden`, the approval owner, `escalateAfterMins`, quiet
 * hours and the tool grants are all `AgentSpec` fields (PLAN_CONTRACT §3.9,
 * §3.10). They belong to the lane that plans the workforce; contract §4.2 is
 * explicit that runtime state is Role C's and never travels back into the plan,
 * and the converse holds here — there is no PATCH on this route and there must
 * not be one. Changing a limit is a plan edit that goes through approval and
 * re-activation, not a toggle on an operations screen.
 *
 * Unauthenticated on purpose for now, exactly as every other /api/runtime route
 * is. That must be gated before any deployment.
 */
import { NextResponse } from "next/server";
import type { AgentSpec, ApprovedPlan } from "@/lib/plan/types";
import { isPastDue, pendingApprovals } from "@/lib/runtime/approvals";
import type { PendingApproval } from "@/lib/runtime/approvals";
import { resolveRunStart } from "@/lib/runtime/policy";
import { pauseAgent, resumeAgent } from "@/lib/runtime/schedule/activation";
import type {
  AgentRuntimeRecord,
  QueuedJob,
  ScheduledTrigger,
} from "@/lib/runtime/schedule/types";
import { agentTimezone, countRunsToday } from "@/lib/runtime/schedule/worker";
import { getRuntimeSession } from "@/lib/runtime/session";
import { reconcileAgents, resolveActivePlan } from "@/lib/runtime/active-plan";
import type { RunState } from "@/lib/runtime/types";

export const dynamic = "force-dynamic";

/**
 * How much settled history one row carries. A roster is a glance, not an audit
 * log — `/api/runtime/run` is where a full history lives. Runs still in flight
 * are added on top of this rather than counted against it, because "what is it
 * doing now" is the first question this screen exists to answer and a busy day
 * must never push the answer off the end of the list.
 */
const RECENT_RUNS = 8;

/* ═══════════════════════ The agent's local day ═══════════════════════ */

interface DailyCount {
  /** Runs started on the agent's local day. Null when the zone was unusable. */
  runsToday: number | null;
  /** Why the count is missing. Null when it is present. */
  unavailable: string | null;
  timezone: string;
}

/**
 * Today's count, taken by the scheduler's own function rather than restated.
 *
 * `agentTimezone` and `countRunsToday` are lib/runtime/schedule/worker.ts's, and
 * they are what `resolveRunStart` is fed at the moment a run is authorised. Until
 * M7 this route carried a second copy of both, which meant the number an owner
 * read and the number the scheduler enforced were two implementations of the same
 * three rules — runs STARTED (not completed), on the agent's own local day (not
 * UTC), and an unreadable `startedAt` counted AGAINST the cap rather than
 * ignored. They agreed, and nothing kept them agreeing. Now there is one.
 *
 * ONLY THE FAILURE HANDLING IS THIS ROUTE'S, and it is deliberately not the
 * worker's. The worker throws on a zone this platform's tz database cannot
 * resolve, because it is about to authorise a run and has no safe number to use.
 * A roster is only describing one, so it reports the count as UNAVAILABLE with
 * the runtime's own sentence: zero would read as "plenty of headroom left today",
 * which is the one wrong answer available, and a throw would take every other
 * agent's row down with it.
 */
function dailyRunCount(runs: RunState[], timezone: string, at: Date): DailyCount {
  try {
    return { runsToday: countRunsToday(runs, timezone, at), unavailable: null, timezone };
  } catch (error) {
    return {
      runsToday: null,
      unavailable:
        `Today's runs could not be counted against this agent's cap. ` +
        `${error instanceof Error ? error.message : String(error)}`,
      timezone,
    };
  }
}

/* ═══════════════════════════ Describing a run ═══════════════════════════ */

/**
 * What this run is waiting on, or what ended it — never an empty cell.
 *
 * The vocabulary matches `describeRun` in components/live/workspace/read-model.ts
 * on purpose: the Workspace feed and the roster show the same runs, and two
 * different sentences for one `awaiting_approval` would read as two different
 * things happening.
 *
 * The join to the pending queue is what turns a status into a sentence. A run
 * whose approval is NOT pending is reported as exactly that rather than as a
 * plain wait — it means a decision is recorded and the run has not settled, which
 * is a state worth seeing rather than smoothing over.
 */
function describeRun(run: RunState, pending: Map<string, PendingApproval>): string {
  switch (run.status) {
    case "running":
      return `In progress — ${run.events.length} ${
        run.events.length === 1 ? "event" : "events"
      } recorded so far.`;
    case "awaiting_approval": {
      const waiting =
        run.pendingApprovalId === null ? undefined : pending.get(run.pendingApprovalId);
      if (!waiting) {
        return (
          "Paused for an approval that is no longer pending — the decision is recorded " +
          "but the run has not settled."
        );
      }
      return (
        `Waiting on ${waiting.request.approvalOwner}: ${waiting.request.invocation.operation} — ` +
        `${waiting.deadline.detail}`
      );
    }
    case "completed":
      return "Finished with no decision outstanding.";
    case "failed":
      return run.failure ?? "Failed and recorded no reason.";
    case "refused":
      return run.failure ?? "Policy refused the operation and ended the run.";
    case "cancelled":
      return "Cancelled before it finished.";
  }
}

function newestFirst(a: RunState, b: RunState): number {
  const left = Date.parse(a.startedAt);
  const right = Date.parse(b.startedAt);
  if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return right - left;
  return b.runId.localeCompare(a.runId);
}

function isInFlight(run: RunState): boolean {
  return run.status === "running" || run.status === "awaiting_approval";
}

/* ═══════════════════════════ Grouping ═══════════════════════════ */

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const bucket = grouped.get(key(item));
    if (bucket === undefined) grouped.set(key(item), [item]);
    else bucket.push(item);
  }
  return grouped;
}

/* ═══════════════════════════ The roster ═══════════════════════════ */

export async function GET() {
  const session = getRuntimeSession();
  // Routes may read wall time; the runtime library beneath them may not. Taken
  // once so every deadline, day boundary and next-fire on this page was judged
  // against the same instant.
  const now = session.executor.clock.now();
  const plan = session.plan;

  const [triggers, jobs, states, deployment, runs, pending] = await Promise.all([
    session.schedulerStore.listTriggers({ planId: plan.planId }),
    session.schedulerStore.listJobs(),
    session.schedulerStore.listAgentStates(),
    session.schedulerStore.getActiveDeployment(plan.planId),
    session.runStore.listRuns(),
    pendingApprovals(session.runStore, now),
  ]);

  const triggersByAgent = groupBy<ScheduledTrigger>(triggers, (t) => t.agentId);
  const jobsByAgent = groupBy<QueuedJob>(jobs, (j) => j.agentId);
  const runsByAgent = groupBy<RunState>(runs, (r) => r.agentId);
  const approvalsByAgent = groupBy<PendingApproval>(pending, (p) => p.request.agentId);
  const stateById = new Map<string, AgentRuntimeRecord>(
    states.map((record) => [record.agentId, record]),
  );
  const approvalById = new Map<string, PendingApproval>(
    pending.map((item) => [item.request.approvalId, item]),
  );

  const agents = plan.agents.map((spec) =>
    describeAgent({
      spec,
      plan,
      now,
      runtime: stateById.get(spec.id) ?? null,
      triggers: triggersByAgent.get(spec.id) ?? [],
      jobs: jobsByAgent.get(spec.id) ?? [],
      runs: runsByAgent.get(spec.id) ?? [],
      approvals: approvalsByAgent.get(spec.id) ?? [],
      approvalById,
    }),
  );

  /* ── Runtime records for agents the plan no longer contains ──
     The runtime outlives plan edits by design: triggers are frozen at
     activation, so a record for a departed agent is a real thing that may still
     be firing. Dropping it silently would leave the only screen that could show
     it showing nothing. */
  const planned = new Set(plan.agents.map((agent) => agent.id));
  const unplanned = states
    .filter((record) => !planned.has(record.agentId))
    .map((record) => ({
      agentId: record.agentId,
      agentVersion: record.agentVersion,
      state: record.state,
      detail: record.detail,
      updatedAt: record.updatedAt,
      enabledTriggers: (triggersByAgent.get(record.agentId) ?? []).filter((t) => t.enabled)
        .length,
    }));

  /*
   * Two plans, deliberately.
   *
   * `plan` above is the CURRENT one and everything that guards a transition
   * keeps reading it — replacing it with the deployed plan made drift invisible
   * and broke M6-1, which exists to catch exactly that.
   *
   * `deployedPlan` is what is actually running. Comparing the two is what lets
   * a row say "running v3, the plan now says v4" instead of silently showing
   * one number and meaning the other.
   */
  const active = await resolveActivePlan(session.schedulerStore);
  const lifecycle = reconcileAgents(
    active.source === "deployment" ? active.plan : null,
    plan,
  );
  const lifecycleById = new Map(lifecycle.map((row) => [row.agentId, row]));

  return NextResponse.json({
    mode: session.mode,
    now: now.toISOString(),
    /** What is RUNNING, versus what the owner has currently planned. */
    live: {
      source: active.source,
      deploymentId: active.deploymentId,
      running: lifecycle.filter((r) => r.lifecycle === "running").length,
      drifted: lifecycle.filter((r) => r.lifecycle === "drifted").length,
      planned: lifecycle.filter((r) => r.lifecycle === "planned").length,
      retired: lifecycle.filter((r) => r.lifecycle === "retired").length,
    },
    lifecycle,
    plan: {
      planId: plan.planId,
      planVersion: plan.version,
      approvedAt: plan.approvedAt,
    },
    /**
     * Judged from the triggers, not from a stored flag: `activate()` writes
     * triggers first, so their existence is the cheapest sound evidence a
     * go-live happened. "Registered", not "enabled" — an owner who has paused
     * every agent has an activated plan with nothing running, and telling them
     * to go and activate it would be wrong.
     */
    activated: triggers.length > 0,
    deployment:
      deployment === null
        ? null
        : {
            deploymentId: deployment.deploymentId,
            planVersion: deployment.planVersion,
            activatedAt: deployment.activatedAt,
            activatedBy: deployment.activatedBy,
          },
    globalPolicy: {
      quietHours: plan.globalPolicy.quietHours,
      forbidden: plan.globalPolicy.forbidden,
    },
    // Each roster row gains its tag. Attached here rather than inside the row
    // builder so the builder stays a pure function of the CURRENT plan and the
    // reconciliation stays the one place the two plans are compared.
    agents: agents.map((row: { agentId: string }) => {
      const tag = lifecycleById.get(row.agentId);
      return {
        ...row,
        lifecycle: tag?.lifecycle ?? "planned",
        runningVersion: tag?.runningVersion ?? null,
        plannedVersion: tag?.plannedVersion ?? null,
        lifecycleNote: tag?.note ?? "Planned, not yet activated.",
      };
    }),
    unplanned,
  });
}

interface AgentInput {
  spec: AgentSpec;
  plan: ApprovedPlan;
  now: Date;
  runtime: AgentRuntimeRecord | null;
  triggers: ScheduledTrigger[];
  jobs: QueuedJob[];
  runs: RunState[];
  approvals: PendingApproval[];
  approvalById: Map<string, PendingApproval>;
}

function describeAgent(input: AgentInput) {
  const { spec, plan, now, runtime, triggers, jobs, runs, approvals, approvalById } = input;

  /* ── Workflows and their triggers ──
     `triggerIdFor` derives one trigger per (plan, agent, workflow), so this is a
     lookup rather than a filter with a tie to break. A null trigger against an
     ENABLED workflow is the case worth surfacing: the plan says it should run and
     nothing will ever start it. */
  const triggerByWorkflow = new Map(triggers.map((trigger) => [trigger.workflowId, trigger]));
  const workflows = spec.workflows.map((workflow) => {
    const trigger = triggerByWorkflow.get(workflow.id) ?? null;
    return {
      workflowId: workflow.id,
      name: workflow.name,
      description: workflow.description,
      enabled: workflow.enabled,
      triggerKind: workflow.trigger.kind,
      /** The owner's words for when it runs — "Every Friday at 9:00am". */
      triggerLabel: workflow.trigger.label,
      trigger:
        trigger === null
          ? null
          : {
              triggerId: trigger.triggerId,
              enabled: trigger.enabled,
              // Null for every kind but `schedule`; the rest wait for something
              // to arrive rather than for time to pass.
              nextFireAt: trigger.nextFireAt,
              lastFiredAt: trigger.lastFiredAt,
              registeredAt: trigger.registeredAt,
            },
    };
  });

  /* ── History ──
     Newest first, capped, with every in-flight run guaranteed present however
     busy the day was. */
  const sorted = [...runs].sort(newestFirst);
  const recent = sorted.slice(0, RECENT_RUNS);
  const shown = new Set(recent.map((run) => run.runId));
  for (const run of sorted) {
    if (isInFlight(run) && !shown.has(run.runId)) {
      recent.push(run);
      shown.add(run.runId);
    }
  }
  recent.sort(newestFirst);

  const timezone = agentTimezone(spec, plan);
  const daily = dailyRunCount(runs, timezone, now);

  /**
   * Whether a run could start right now, and why not when it could not.
   *
   * This is `resolveRunStart` itself — the function the worker gates on — not a
   * restatement of it, so quiet hours (the UNION of the agent's window and the
   * org's) and the daily cap are answered here exactly as the scheduler would
   * answer them a second from now. Withheld entirely when the day could not be
   * resolved, because feeding it a made-up count would produce a confident
   * sentence about a limit nobody counted.
   */
  const startGate =
    daily.runsToday === null
      ? null
      : resolveRunStart({
          at: now,
          policy: spec.policy,
          globalQuietHours: plan.globalPolicy.quietHours,
          runsToday: daily.runsToday,
        });

  return {
    agentId: spec.id,
    name: spec.name,
    role: spec.role,
    /** The PLAN's version. `runtime.agentVersion` is what was activated. */
    version: spec.version,

    /**
     * Null means no `AgentRuntimeRecord` exists: this agent has never been
     * through activation. Distinct from every state in the union, and rendered
     * as such — "never activated" and "paused" ask different things of an owner.
     */
    runtime:
      runtime === null
        ? null
        : {
            state: runtime.state,
            agentVersion: runtime.agentVersion,
            /** The runtime's own sentence, shown verbatim. */
            detail: runtime.detail,
            updatedAt: runtime.updatedAt,
          },
    /**
     * The record was written at a different agent version than the plan now
     * carries. `resumeAgent` refuses exactly this case, so the roster says it
     * before the owner presses a button that cannot work.
     */
    versionDrift: runtime !== null && runtime.agentVersion !== spec.version,

    workflows,

    runs: recent.map((run) => ({
      runId: run.runId,
      workflowId: run.workflowId,
      status: run.status,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      failure: run.failure,
      events: run.events.length,
      pendingApprovalId: run.pendingApprovalId,
      /** What it is waiting on, or what ended it. Never empty. */
      detail: describeRun(run, approvalById),
    })),
    runsTotal: runs.length,

    counts: {
      /** Started today in the agent's own timezone; null when unresolvable. */
      runsToday: daily.runsToday,
      runsTodayUnavailable: daily.unavailable,
      /** The cap from `AgentPolicy`. Null means uncapped. */
      maxRunsPerDay: spec.policy.maxRunsPerDay,
      dayTimezone: daily.timezone,
      inFlight: runs.filter(isInFlight).length,
      pendingApprovals: approvals.length,
      overdueApprovals: approvals.filter((item) => isPastDue(item.deadline)).length,
      failedRuns: runs.filter((run) => run.status === "failed").length,
      refusedRuns: runs.filter((run) => run.status === "refused").length,
      /** Terminal after `maxAttempts`; nothing retries out of it automatically. */
      deadLetterJobs: jobs.filter((job) => job.status === "dead_letter").length,
      /**
       * Quiet hours or the daily cap — the agent correctly deciding not to wake
       * up. NOT a failure, and counted separately so the roster can keep the two
       * apart (lib/runtime/schedule/types.ts).
       */
      skippedJobs: jobs.filter((job) => job.status === "skipped").length,
      enabledTriggers: triggers.filter((trigger) => trigger.enabled).length,
      registeredTriggers: triggers.length,
    },

    startGate:
      startGate === null
        ? null
        : { action: startGate.action, reason: startGate.reason },

    /**
     * D's configuration, surfaced so an owner can inspect what their agent is
     * allowed to do. READ-ONLY — see the module header; there is no write path
     * onto any of it and there must not be one.
     */
    config: {
      operatingMode: spec.policy.operatingMode,
      limits: spec.policy.limits.map((limit) => ({
        id: limit.id,
        metric: limit.metric,
        op: limit.op,
        value: limit.value,
        unit: limit.unit ?? null,
        onBreach: limit.onBreach,
      })),
      alwaysApprove: spec.policy.alwaysApprove,
      forbidden: spec.policy.forbidden,
      approvalOwner: spec.policy.approvalOwner,
      escalateAfterMins: spec.policy.escalateAfterMins,
      quietHours: spec.policy.quietHours,
      maxRunsPerDay: spec.policy.maxRunsPerDay,
      tools: spec.tools.map((grant) => ({
        integrationId: grant.integrationId,
        operations: grant.operations,
        purpose: grant.purpose,
        // Read as written. The activation gate treats a MISSING flag as required
        // (fail closed); here the plan's own value is reported so the two are
        // never confused — this screen describes the plan, that gate judges it.
        required: grant.required,
      })),
    },
  };
}

/* ═══════════════════════ Pause and resume ═══════════════════════ */

/**
 * The transitions this route will perform, as values, because `action` arrives
 * as a string and a union is not something a run-time check can consult.
 *
 * Two, not three. See the module header for why `stop` is not here and is
 * refused by name rather than folded into `pause`.
 */
const ACTIONS = Object.keys({
  pause: true,
  resume: true,
} satisfies Record<"pause" | "resume", true>) as ("pause" | "resume")[];

/**
 * What to say when somebody asks for a transition this runtime cannot perform.
 * `stop` gets its own sentence because it is the one a reader of ROLE_C_PLAN
 * will reasonably expect to work.
 */
function unknownActionMessage(action: string): string {
  if (action === "stop") {
    return (
      'There is no "stop" for an agent in this runtime, and it is not being silently ' +
      'treated as a pause. `AgentRuntimeState` has five values — building, validated, ' +
      "active, paused, failed — and none of them is stopped; pausing already disables " +
      "every trigger the agent has, which is what stopping it means here. To end a run " +
      "that is in flight, cancel that run rather than the agent."
    );
  }
  return `Unknown action "${action}"; expected "pause" or "resume".`;
}

export async function POST(request: Request) {
  const session = getRuntimeSession();

  /* ── The body ──
     Unlike the scheduler route, an EMPTY body means nothing here: this endpoint
     performs exactly one kind of thing and it needs to be told which agent. So
     an unreadable body and an absent one are both refused, each naming what was
     missing rather than sharing one message that fits neither. */
  const text = await request.text();
  if (text.trim() === "") {
    return NextResponse.json(
      {
        error:
          'A JSON body of { agentId, action } is required, where action is "pause" or "resume".',
      },
      { status: 400 },
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json(
      {
        error:
          'The request body is not JSON. Send { agentId, action } where action is "pause" ' +
          'or "resume".',
      },
      { status: 400 },
    );
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json(
      { error: "The request body must be a JSON object." },
      { status: 400 },
    );
  }

  const body = raw as {
    agentId?: unknown;
    action?: unknown;
    by?: unknown;
    reason?: unknown;
    now?: unknown;
  };

  const agentId = typeof body.agentId === "string" ? body.agentId.trim() : "";
  if (agentId === "") {
    return NextResponse.json(
      { error: "agentId is required and must be a non-empty string." },
      { status: 400 },
    );
  }

  const action = ACTIONS.find((candidate) => candidate === body.action);
  if (action === undefined) {
    return NextResponse.json(
      {
        error: unknownActionMessage(
          typeof body.action === "string" ? body.action : String(body.action),
        ),
        available: ACTIONS,
      },
      { status: 400 },
    );
  }

  /* ── Refused rather than ignored ──
     `POST /api/runtime/scheduler` accepts a `now` override in fixture mode, so a
     caller copying that body onto this route would expect the clock to move. It
     cannot: pause and resume are stamped from the server's clock. Dropping the
     field silently is exactly the quiet mismatch this runtime refuses everywhere
     else. */
  if (body.now !== undefined) {
    return NextResponse.json(
      {
        error:
          "now is not honoured here. Pause and resume are stamped from the server's clock; " +
          "the clock override belongs to a scheduler pass (POST /api/runtime/scheduler).",
      },
      { status: 400 },
    );
  }

  const by = typeof body.by === "string" && body.by.trim() !== "" ? body.by.trim() : undefined;
  const reason =
    typeof body.reason === "string" && body.reason.trim() !== "" ? body.reason.trim() : undefined;

  /* Not checked against the plan first, deliberately: pausing an agent the plan
     no longer contains is a legitimate and useful thing to do — its triggers are
     still registered and still firing — and `resumeAgent` refuses an unknown
     agent with a better sentence than this route could write. */
  if (action === "pause") {
    const change = await pauseAgent(agentId, session.scheduler, { pausedBy: by, reason });
    return NextResponse.json({ mode: session.mode, action, change });
  }

  const change = await resumeAgent(agentId, session.plan, session.scheduler, { resumedBy: by });

  /* Every `changed: false` path out of `resumeAgent` is a refusal — not in the
     plan, never activated, version drifted since activation, or in a state resume
     does not restart — so it is a 409 carrying the reason. `pauseAgent` gets no
     such treatment: its `changed: false` means "already stopped, nothing to do",
     which is a success. Stopping is never the unsafe direction; starting is, and
     starting is the one that demands evidence. */
  return NextResponse.json(
    { mode: session.mode, action, change },
    { status: change.changed ? 200 : 409 },
  );
}
