/**
 * app/api/runtime/scheduler/route.ts — the trigger engine and job queue over HTTP (M4).
 *
 *   GET   ?status=                    registered triggers with their next fire
 *                                     times, and the queue, filtered by job status
 *   POST                              drive the scheduler once: claim what is due
 *                                     and execute it, returning the worker's summary
 *   POST  { now }                     the same pass at a chosen instant — FIXTURE MODE ONLY
 *   POST  { agentId, action }         "pause" or "resume" one agent
 *
 * ONE PASS PER REQUEST, NOT A DAEMON. `runDueWork` drains what is due and
 * returns; `startPoller` is the long-lived wrapper and nothing in this process
 * calls it. Driving the scheduler from a request is what makes M4 demonstrable
 * without a background worker — and it is the same single call the M4
 * verification asserts against, so what this endpoint does is exactly what
 * `npm run verify:m4` proves. The summary is returned as the worker produced it
 * rather than reshaped here: `WorkSummary` already distinguishes succeeded from
 * skipped from retrying from dead-lettered, and a route-local shape would be a
 * second vocabulary for the same six outcomes.
 *
 * A TRIGGER IS AN ARTEFACT OF A DEPLOYMENT, NOT OF THE CURRENT PLAN, and until
 * M6 this list could not say so. `activate()` writes the triggers and FREEZES the
 * cron into them; they keep firing across every later plan edit. So a row here
 * reading "next Friday at 09:00" may be holding a version the owner has already
 * replaced, and the two cases render identically. `live` and the per-trigger
 * `lifecycle` are the difference, reconciled by lib/runtime/active-plan.ts —
 * `/api/runtime/agents` answers the same question about the same pair of plans
 * with the same four words, so the roster and the queue cannot describe one
 * drifted agent in two vocabularies.
 *
 * THE CURRENT PLAN IS WHAT THE TRIGGER FILTER AND THE RESUME GUARD READ, and it
 * now comes from `session.currentPlan()` rather than a field assigned at session
 * construction — that field was the BrightPath fixture, so this list was filtered
 * to the demo's `planId` on every runtime, including ones where a real plan had
 * been ingested. Reading the DEPLOYED plan instead would be the opposite mistake
 * and is precisely what makes drift invisible, which is the failure M6-1 exists
 * to catch. The reconciliation is alongside it and reads both.
 *
 * ONE READ COVERS BOTH HALVES OF THE GET. `session.planState()` returns the
 * current plan, the deployed one and the reconciliation between them together, so
 * the triggers listed here and the `live`/`lifecycle` block describing them are
 * scoped to the SAME plan by construction. Two separate reads could straddle a
 * concurrent ingest, and this response would then filter triggers by one plan's
 * id while tagging them with another plan's drift — a row reading "running" under
 * a heading counted from a workforce it is not part of.
 *
 * THE `now` OVERRIDE IS HONOURED ONLY WHEN NOTHING REAL CAN BE REACHED, and that
 * guard is the most important line in this file. It exists so the Friday sweep
 * can be shown on a Tuesday: move the clock to Friday 09:00, turn the worker
 * once, watch a run appear. Otherwise the same parameter is a replay button
 * pointed at real customer systems — every trigger whose `nextFireAt` falls
 * before the instant they name comes due at once, and the runs that follow send
 * real email to real people. Worse, the overridden instant is what quiet hours
 * are evaluated against, so it can walk a run straight through the window the
 * owner set. It is refused rather than clamped or ignored, and the refusal is a
 * 409: the request is well formed and the server's configuration conflicts.
 *
 * THE GUARD ASKS TWO QUESTIONS, and it used to ask one. `session.mode !==
 * "fixture"` was sufficient only while live tools implied live mode. They no
 * longer do: `ORIANT_RUNTIME_TOOLS=composio` mounts a real Composio client under
 * a session still reporting `mode: "fixture"`, which is a supported
 * configuration — real hands, cheap brain. A mode-only check would have passed
 * there while `session.tools` could send. So `session.toolsLive` is the half
 * that actually means "this can reach a person", and both are asked.
 *
 * `!== "fixture"` rather than `=== "live"` is kept for the mode half: anything
 * this build does not recognise as the sandboxed mode is treated as dangerous.
 *
 * WHEN THE CLOCK MOVES, IT MOVES FOR BOTH LAYERS. The override replaces the
 * scheduler's clock AND the executor's, because handing them separate clocks
 * would let a job be claimed at an instant the run it starts has never heard of —
 * the run events, the approval deadlines and the daily-cap boundary would all be
 * stamped from a different day than the firing that caused them.
 *
 * Unauthenticated on purpose for now, exactly as /api/runtime/build is: this
 * branch is Role C's development surface and the runtime is fixture-backed. It
 * must be gated before any deployment, along with every other /api route. No
 * auth scheme is invented here; that decision belongs with whoever owns the
 * deployment.
 */
import { NextResponse } from "next/server";
import { pauseAgent, resumeAgent } from "@/lib/runtime/schedule/activation";
import type { JobStatus } from "@/lib/runtime/schedule/types";
import { runDueWork } from "@/lib/runtime/schedule/worker";
import { getRuntimeSession } from "@/lib/runtime/session";
import { FixedClock } from "@/lib/runtime/store";
import type { Clock } from "@/lib/runtime/types";

export const dynamic = "force-dynamic";

/**
 * The six job statuses as values, because `?status=` arrives as a string and a
 * union is not something a run-time check can consult.
 *
 * Written as a keyed object with `satisfies` rather than as an array, so the two
 * cannot drift: a seventh status added to `JobStatus` and not added here is a
 * compile error. An array would have accepted the omission silently, and the
 * result would be this route rejecting a status the store can legitimately
 * return — a queue view with a blind spot in it.
 */
const JOB_STATUSES = Object.keys({
  queued: true,
  running: true,
  succeeded: true,
  failed: true,
  dead_letter: true,
  skipped: true,
} satisfies Record<JobStatus, true>) as JobStatus[];

/* ═══════════════════════ Triggers and the queue ═══════════════════════ */

export async function GET(request: Request) {
  const session = getRuntimeSession();

  const requested = new URL(request.url).searchParams.get("status");
  const status = JOB_STATUSES.find((candidate) => candidate === requested) ?? null;
  if (requested !== null && status === null) {
    // Fail closed: an unrecognised filter must not quietly become "no filter".
    // A caller asking for the dead-lettered jobs and being handed the whole queue
    // would read every healthy job as a failure.
    return NextResponse.json(
      {
        error: `Unknown job status "${requested}".`,
        available: JOB_STATUSES,
      },
      { status: 400 },
    );
  }

  /* ── Both plans and the drift between them, in ONE read ──
     `planState()` resolves the current plan, the deployed one and
     `reconcileAgents` over the pair, which is exactly what `/api/runtime/agents`
     reports — so the roster and the queue cannot describe one drifted agent in
     two vocabularies. It also keeps the `null` right: with nothing deployed the
     fixture stands in for the ACTIVE plan, and calling its agents "running" would
     claim a go-live that never happened.

     The trigger filter below reads `state.current.plan` from this same result
     rather than resolving the plan again, so the list and the lifecycle tags on
     it are scoped to the SAME plan. Two reads could straddle an ingest — see the
     header. */
  const state = await session.planState();
  const lifecycle = state.lifecycle;
  const lifecycleById = new Map(lifecycle.map((row) => [row.agentId, row]));

  // Filtered to the current plan, matching what the worker itself polls
  // (`dueScheduleTriggers` filters by the plan POST hands it, which is the same
  // one), so what this endpoint lists is what a pass would actually consider —
  // not every trigger the store has ever held.
  const triggers = await session.schedulerStore.listTriggers({
    planId: state.current.plan.planId,
  });
  const jobs = await session.schedulerStore.listJobs(
    status === null ? undefined : { status },
  );

  return NextResponse.json({
    mode: session.mode,
    // The instant every `nextFireAt` below should be read against; without it a
    // caller has to trust its own clock agrees with the server's.
    now: session.scheduler.clock.now().toISOString(),
    /** What is RUNNING, versus what the owner has currently planned. */
    live: {
      source: state.active.source,
      deploymentId: state.active.deploymentId,
      running: lifecycle.filter((row) => row.lifecycle === "running").length,
      drifted: lifecycle.filter((row) => row.lifecycle === "drifted").length,
      planned: lifecycle.filter((row) => row.lifecycle === "planned").length,
      retired: lifecycle.filter((row) => row.lifecycle === "retired").length,
    },
    /**
     * The full reconciliation, so anything agent-keyed in this response can be
     * joined to it. The jobs below deliberately carry no tag of their own: a job
     * is one firing that has already been stamped with the trigger that caused
     * it, and restating the agent's lifecycle on every row of a queue would be a
     * second copy of a fact that is authoritative here.
     */
    lifecycle,
    triggers: triggers.map((trigger) => {
      const tag = lifecycleById.get(trigger.agentId);
      return {
        triggerId: trigger.triggerId,
        agentId: trigger.agentId,
        workflowId: trigger.workflowId,
        kind: trigger.kind,
        // The owner's words for the schedule — "Every Friday at 9:00am".
        label: trigger.spec.label,
        enabled: trigger.enabled,
        // Null for every kind but `schedule`: event, threshold and dependency
        // triggers are driven by something arriving, not by time passing.
        nextFireAt: trigger.nextFireAt,
        lastFiredAt: trigger.lastFiredAt,
        registeredAt: trigger.registeredAt,
        /**
         * Which version this row will actually fire, against what the plan now
         * asks for. NULL rather than "planned" when the agent is in neither
         * plan — unlike the roster, whose rows are built FROM the current plan
         * and so always reconcile, a registered trigger can outlive both. That
         * is an orphan still firing on a frozen cron, and calling it "planned,
         * not yet activated" would be the one wrong answer available.
         */
        lifecycle: tag?.lifecycle ?? null,
        runningVersion: tag?.runningVersion ?? null,
        plannedVersion: tag?.plannedVersion ?? null,
        lifecycleNote:
          tag?.note ??
          "Registered for an agent that is in neither the deployed plan nor the current " +
            "one. It still fires.",
      };
    }),
    status,
    jobs: jobs.map((job) => ({
      jobId: job.jobId,
      triggerId: job.triggerId,
      agentId: job.agentId,
      workflowId: job.workflowId,
      status: job.status,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      runAfter: job.runAfter,
      enqueuedAt: job.enqueuedAt,
      startedAt: job.startedAt,
      endedAt: job.endedAt,
      runId: job.runId,
      error: job.error,
      // Set only on `skipped`, and never an error: quiet hours and the daily cap
      // are the agent deciding not to run, which the Workspace must show
      // differently from the agent breaking.
      skipReason: job.skipReason,
      // Trimmed for transport — the payload is on the run. The key is kept
      // because it is the identity of the firing, and it is what any question
      // about a suspected double-fire is answered with.
      trigger: {
        kind: job.trigger.kind,
        firedAt: job.trigger.firedAt,
        idempotencyKey: job.trigger.idempotencyKey,
      },
    })),
  });
}

/* ═══════════════════════ Driving the scheduler ═══════════════════════ */

export async function POST(request: Request) {
  const session = getRuntimeSession();

  /* ── The body ──
     An EMPTY body means "drive one pass with the server's own clock", which is
     the ordinary request and should not need a payload. Bytes that are not JSON
     are a different thing entirely: the caller meant something this route could
     not read, and treating that as the default would run the scheduler on a
     request nobody understood. So the two are told apart rather than both
     falling into the same catch. */
  const text = await request.text();
  let raw: unknown = {};
  if (text.trim() !== "") {
    try {
      raw = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          error:
            "The request body is not JSON. Send no body (or {}) to drive one scheduler " +
            'pass, { now } to drive it at an instant, or { agentId, action } to pause or resume.',
        },
        { status: 400 },
      );
    }
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json(
      { error: "The request body must be a JSON object." },
      { status: 400 },
    );
  }
  const body = raw as {
    now?: unknown;
    agentId?: unknown;
    action?: unknown;
    by?: unknown;
    reason?: unknown;
  };

  /* ── Pause and resume ──
     `action` is the discriminator: present at all and this request is about one
     agent, not about the queue. */
  if (body.action !== undefined) {
    if (body.action !== "pause" && body.action !== "resume") {
      return NextResponse.json(
        {
          error: `Unknown action "${String(body.action)}"; expected "pause" or "resume".`,
        },
        { status: 400 },
      );
    }

    const agentId = typeof body.agentId === "string" ? body.agentId.trim() : "";
    if (agentId === "") {
      return NextResponse.json(
        { error: `agentId is required when action is "${body.action}".` },
        { status: 400 },
      );
    }

    // Refused rather than ignored. Pause and resume read the server's clock, so
    // honouring `now` here is impossible — and silently dropping an override the
    // caller supplied is exactly the quiet mismatch this runtime refuses
    // everywhere else.
    if (body.now !== undefined) {
      return NextResponse.json(
        {
          error:
            "now applies only to a scheduler pass; pause and resume are stamped from the " +
            "server's clock. Send one or the other, not both.",
        },
        { status: 400 },
      );
    }

    const by = typeof body.by === "string" && body.by.trim() !== "" ? body.by.trim() : undefined;
    const reason =
      typeof body.reason === "string" && body.reason.trim() !== "" ? body.reason.trim() : undefined;

    // The agent is NOT checked against the plan first, unlike /api/runtime/run.
    // Pausing an agent the plan no longer contains is a legitimate and useful
    // thing to do — its triggers are still registered and still firing — and
    // `resumeAgent` refuses an unknown agent with a better sentence than this
    // route could write.
    if (body.action === "pause") {
      const change = await pauseAgent(agentId, session.scheduler, { pausedBy: by, reason });
      return NextResponse.json({ mode: session.mode, action: "pause", change });
    }

    // `currentPlan()`, resolved HERE rather than at the top of the handler, so the
    // pause branch above keeps its property of consulting no plan at all: a plan
    // store that will not answer must not be able to refuse a pause, because
    // stopping is never the unsafe direction. Resume re-derives triggers from the
    // plan it is given, so it has to be the one the owner currently intends — the
    // seed would re-derive BrightPath's crons onto somebody else's agent.
    const plan = await session.currentPlan();
    const change = await resumeAgent(agentId, plan, session.scheduler, {
      resumedBy: by,
    });
    // Every one of `resumeAgent`'s `changed: false` paths is a refusal — not in
    // the plan, never activated, version drifted since activation, or in a state
    // resume does not restart — so it is a 409 carrying the reason. `pauseAgent`
    // gets no such treatment because its `changed: false` means "already stopped,
    // nothing to do", which is a success. Stopping is never the unsafe direction;
    // starting is, and starting is the one that demands evidence.
    return NextResponse.json(
      { mode: session.mode, action: "resume", change },
      { status: change.changed ? 200 : 409 },
    );
  }

  if (body.agentId !== undefined) {
    return NextResponse.json(
      {
        error:
          'agentId was given with no action. Add action: "pause" or "resume", or omit ' +
          "agentId to drive one scheduler pass across every agent.",
      },
      { status: 400 },
    );
  }

  /* ── The clock this pass runs on ── */
  let clock: Clock = session.scheduler.clock;
  const overridden = body.now !== undefined;
  if (overridden) {
    if (typeof body.now !== "string" || !Number.isFinite(Date.parse(body.now))) {
      return NextResponse.json(
        {
          error:
            `now must be an ISO 8601 instant, e.g. "2026-07-24T01:00:00.000Z"; got ` +
            `${JSON.stringify(body.now)}. Every due time, backoff and daily-cap boundary in ` +
            `the pass is computed from it, so an unreadable one cannot be guessed at.`,
        },
        { status: 400 },
      );
    }
    if (session.mode !== "fixture" || session.toolsLive) {
      // See the header. This parameter is a replay button, and `session.toolsLive`
      // is the half of the guard that says whether it is pointed at real people.
      // Checking the mode alone was correct only while live tools implied live
      // mode; ORIANT_RUNTIME_TOOLS=composio breaks that implication.
      return NextResponse.json(
        {
          error: session.toolsLive
            ? `now is refused because this runtime holds live tool clients ` +
              `(ORIANT_RUNTIME_TOOLS), whatever its reasoner mode. Moving the clock forward ` +
              `makes every trigger due before that instant fire at once, and those runs would ` +
              `reach real customers through real integrations.`
            : `now is honoured only in fixture mode; this runtime is in "${session.mode}" mode. ` +
              `Moving the clock forward makes every trigger due before that instant fire at once, ` +
              `and against live integrations those runs reach real customers.`,
          mode: session.mode,
          toolsLive: session.toolsLive,
        },
        { status: 409 },
      );
    }
    clock = new FixedClock(body.now);
  }

  /* ── The plan this pass serves ──
     THE DEPLOYED PLAN, NOT THE CURRENT ONE, and that is a safety boundary.
     A plan becomes "current" the moment it validates — before it is built,
     before the sandbox has proved anything, before any gate has passed. Turning
     the worker against `currentPlan()` therefore executes a revision that failed
     `prove` and was never activated: the pipeline stops, nothing is deployed,
     and the live schedule runs the unproved version anyway. `deployedPlan()` is
     what actually went live, and null means nothing has.

     Resolved once, and the SAME object is handed to the worker and used to build
     the executor deps below. `runDueWork` reads agent policy, the global quiet
     window and the set of agents that may run from `plan`, so a second read here
     could serve one plan's triggers under another plan's policy. */
  const plan = await session.deployedPlan();
  if (plan === null) {
    // Not an error. A runtime with nothing activated has no schedule to serve,
    // and saying so is the honest answer — inventing a plan here is precisely
    // the substitution this route was changed to remove.
    return NextResponse.json({
      mode: session.mode,
      now: clock.now().toISOString(),
      overridden: body.now !== undefined,
      ran: false,
      reason:
        "Nothing is deployed, so there is no live schedule to turn. Activate a plan " +
        "first — a plan that has only been ingested is what the owner intends, not " +
        "what is running, and the worker deliberately will not run it.",
    });
  }

  const summary = await runDueWork({
    plan,
    // One clock for both layers — see the header.
    scheduler: { ...session.scheduler, clock },
    // `executorFor(plan)`, NOT `session.executor`: this pass starts real runs, and
    // `session.executor` carries the SEED plan's `globalPolicy` — the fixture's
    // org-wide denies and its quiet window. Executing this plan's work under those
    // would mean a capability THIS owner forbade is not forbidden, which is a
    // safety bug rather than a cosmetic one. Same `plan` the worker is given, so
    // the policy enforced is the policy of the workforce being run.
    executor: { ...session.executorFor(plan), clock },
    build: session.build,
  });

  return NextResponse.json({
    mode: session.mode,
    now: clock.now().toISOString(),
    /** True when `now` moved the clock; false when the pass ran on the server's. */
    clockOverridden: overridden,
    summary,
  });
}
