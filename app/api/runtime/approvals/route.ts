/**
 * app/api/runtime/approvals/route.ts — the owner's decision point.
 *
 *   GET                every pending approval, most overdue first
 *   GET   ?approvalId=  one approval with its decision and version history
 *   POST  { approvalId, decision, decidedBy?, reason?, editedArgs? }
 *
 * This is the single call the Approvals inbox makes. It records the decision and
 * resumes the paused run atomically from the caller's point of view, so a
 * decision can never be stored without the run continuing.
 *
 * `editedArgs` is how an owner changes a draft before approving; the merged
 * invocation is what actually executes, so what they approved is what runs. What
 * they changed is derived back out as an `ApprovalVersion`
 * (lib/runtime/approvals.ts) from the same merge, and returned here so the inbox
 * can say "you edited this before approving" without keeping its own copy.
 *
 * TWO THINGS THIS ROUTE NOW REFUSES that it used to wave through, both because
 * an approval record has to mean exactly one thing:
 *
 *   - `editedArgs` that is not a JSON object. Spreading a string over the frozen
 *     args produces `{ "0": "h", "1": "i" }` and sends it to a customer.
 *   - `editedArgs` alongside a rejection. The edits could never execute, so
 *     storing them would leave an audit trail of an action nobody performed.
 *
 * THE DEPENDENCY FAN-OUT IS WIRED HERE, and it is the easiest thing in M5 to
 * miss. A run that paused settles its scheduler job immediately and finishes
 * inside this handler, which no worker pass observes — so without
 * `dependencyFanOut` anything chained behind the Friday sweep would silently
 * never become due. It is passed as `ExecutorOptions.onRunResumed` rather than
 * called afterwards so that every path out of `decideAndResume`, including the
 * ones that settle without completing, goes through the same notice.
 *
 * Unauthenticated on purpose for now, exactly as the other /api/runtime routes
 * are; that must be gated before any deployment.
 */
import { NextResponse } from "next/server";
import {
  approvalDeadline,
  approvalRecord,
  dependencyFanOut,
  isPastDue,
  pendingApprovals,
} from "@/lib/runtime/approvals";
import { loadBundle } from "@/lib/runtime/build/runner";
import { decideAndResume } from "@/lib/runtime/executor";
import { getRuntimeSession } from "@/lib/runtime/session";
import type { ApprovalDecision, ApprovalRequest } from "@/lib/runtime/types";

export const dynamic = "force-dynamic";

/**
 * The list shape, unchanged from M4 apart from the added `deadline`. Every field
 * the previous contract carried is still here and still named the same thing —
 * `dueAt` included, even though `deadline` restates it, because a caller written
 * against the old shape must keep working.
 */
function describeApproval(a: ApprovalRequest) {
  return {
    approvalId: a.approvalId,
    runId: a.runId,
    agentId: a.agentId,
    workflowId: a.workflowId,
    stepId: a.stepId,
    reason: a.reason,
    risk: a.risk,
    breachedLimits: a.breachedLimits,
    approvalOwner: a.approvalOwner,
    createdAt: a.createdAt,
    dueAt: a.dueAt,
    // What the agent proposes to do, exactly as it will be replayed.
    proposed: {
      integrationId: a.invocation.integrationId,
      operation: a.invocation.operation,
      args: a.invocation.args,
      metrics: a.invocation.metrics,
    },
  };
}

export async function GET(request: Request) {
  const session = getRuntimeSession();
  // Routes may read wall time; the runtime library beneath them may not.
  const now = session.executor.clock.now();

  const focus = new URL(request.url).searchParams.get("approvalId");

  /* ── One approval ──
     The review drawer's read, and the only way to see an approval after a
     decision has taken it out of the pending list. */
  if (focus !== null) {
    const record = await approvalRecord(session.runStore, focus, now);
    if (!record) {
      return NextResponse.json({ error: `Approval ${focus} not found.` }, { status: 404 });
    }
    return NextResponse.json({
      now: now.toISOString(),
      approval: describeApproval(record.request),
      deadline: record.deadline,
      decision: record.decision,
      versions: record.versions,
      edited: record.edited,
    });
  }

  /* ── The inbox ──
     Order comes from the store, which lists by `dueAt` ascending — most overdue
     first, which is the order an inbox wants. It is not re-sorted here. */
  const pending = await pendingApprovals(session.runStore, now);
  const overdue = pending.filter((item) => isPastDue(item.deadline));

  return NextResponse.json({
    // The instant every deadline below was judged against. Without it a client
    // has to trust its own clock agrees with the server's, and "overdue" is
    // precisely the field where a few minutes of drift shows.
    now: now.toISOString(),
    overdueCount: overdue.length,
    pending: pending.map((item) => ({
      ...describeApproval(item.request),
      // Derived, never stored: `escalateAfterMins` already fixed `dueAt` when the
      // approval was raised, and everything else is a function of it and `now`.
      deadline: item.deadline,
    })),
  });
}

export async function POST(request: Request) {
  const session = getRuntimeSession();

  let body: {
    approvalId?: string;
    decision?: string;
    decidedBy?: string;
    reason?: string;
    editedArgs?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "A JSON body with approvalId and decision is required." },
      { status: 400 },
    );
  }

  if (!body.approvalId) {
    return NextResponse.json({ error: "approvalId is required." }, { status: 400 });
  }
  if (body.decision !== "approved" && body.decision !== "rejected") {
    return NextResponse.json(
      { error: 'decision must be "approved" or "rejected".' },
      { status: 400 },
    );
  }
  if (body.decision === "rejected" && !body.reason) {
    // A rejection with no reason leaves the owner nothing to review later.
    return NextResponse.json(
      { error: "A reason is required when rejecting." },
      { status: 400 },
    );
  }

  /* ── The edits ──
     Validated before anything is stored, because the decision slot is
     write-once: an approval decided on a malformed patch has burnt the only
     decision it will ever have. */
  let editedArgs: Record<string, unknown> | undefined;
  if (body.editedArgs !== undefined) {
    if (
      typeof body.editedArgs !== "object" ||
      body.editedArgs === null ||
      Array.isArray(body.editedArgs)
    ) {
      return NextResponse.json(
        {
          error:
            "editedArgs must be a JSON object of the arguments to change. It is merged over " +
            "the frozen invocation, so an array or a string would be spread across it key by " +
            "key and sent as the agent's arguments.",
        },
        { status: 400 },
      );
    }
    if (body.decision === "rejected") {
      // Fail closed on a contradiction rather than picking one half of it.
      // Storing edits against a rejection records an action that never ran; the
      // owner meant to approve-with-changes, or meant to reject, and this route
      // will not guess which.
      return NextResponse.json(
        {
          error:
            "editedArgs cannot accompany a rejection — a rejected action never executes, so " +
            "the edits would be an audit trail of something that did not happen. Approve with " +
            "the edits, or reject without them.",
        },
        { status: 400 },
      );
    }
    editedArgs = body.editedArgs as Record<string, unknown>;
  }

  const approval = await session.runStore.getApproval(body.approvalId);
  if (!approval) {
    return NextResponse.json(
      { error: `Approval ${body.approvalId} not found.` },
      { status: 404 },
    );
  }

  const spec = session.plan.agents.find((a) => a.id === approval.agentId);
  if (!spec) {
    return NextResponse.json(
      { error: `Agent ${approval.agentId} is no longer in the approved plan.` },
      { status: 409 },
    );
  }

  const bundle = await loadBundle(spec, session.build);
  if (!bundle) {
    return NextResponse.json(
      { error: `Agent ${spec.id} has no built package for version ${spec.version}.` },
      { status: 409 },
    );
  }

  const decidedAt = session.executor.clock.now();
  // How overdue this was AT THE MOMENT IT WAS DECIDED. Derived before the
  // decision so the answer is about the wait the owner actually made the agent
  // sit through, not about how long the resume then took.
  const deadline = approvalDeadline(approval, decidedAt);

  // See the header: a resumed run is the one completion no worker pass sees.
  const fanOut = dependencyFanOut({ plan: session.plan, scheduler: session.scheduler });

  const decision: ApprovalDecision = {
    approvalId: body.approvalId,
    decision: body.decision,
    decidedBy: body.decidedBy ?? spec.policy.approvalOwner,
    decidedAt: decidedAt.toISOString(),
    reason: body.reason,
    editedArgs,
  };

  try {
    const outcome = await decideAndResume(decision, bundle, {
      ...session.executor,
      onRunResumed: fanOut.onRunResumed,
    });

    // Derived from the request and the decision that has just been persisted, so
    // the inbox is shown the same record an audit would reconstruct later rather
    // than a response-only summary of it.
    const record = await approvalRecord(session.runStore, body.approvalId, decidedAt);

    return NextResponse.json({
      runId: outcome.run.runId,
      status: outcome.status,
      approvalId: outcome.approvalId,
      failure: outcome.run.failure,
      events: outcome.run.events,
      deadline,
      versions: record?.versions ?? [],
      edited: record?.edited ?? false,
      /** Dependent workflows this decision made due. */
      dependentsQueued: fanOut.queued(),
      /**
       * Set only when the fan-out itself failed. The run above is settled and
       * correct either way — this says the chained workflows were not queued,
       * which is worth surfacing and is not a failure of the decision.
       */
      dependencyError: outcome.followUpError ?? null,
    });
  } catch (err) {
    // The store rejects a second decision on the same approval, which would
    // otherwise resume one run twice; `ApprovalNotActionableError` covers a run
    // that can no longer act on a decision at all.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 409 },
    );
  }
}
