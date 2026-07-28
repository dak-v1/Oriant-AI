/**
 * app/api/runtime/approvals/route.ts — the owner's decision point.
 *
 *   GET   every pending approval, newest deadline first
 *   POST  { approvalId, decision, decidedBy?, reason?, editedArgs? }
 *
 * This is the single call the Approvals inbox will make in M5. It records the
 * decision and resumes the paused run atomically from the caller's point of
 * view, so a decision can never be stored without the run continuing.
 *
 * `editedArgs` is how an owner changes a draft before approving; the merged
 * invocation is what actually executes, so what they approved is what runs.
 */
import { NextResponse } from "next/server";
import { loadBundle } from "@/lib/runtime/build/runner";
import { decideAndResume } from "@/lib/runtime/executor";
import { getRuntimeSession } from "@/lib/runtime/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = getRuntimeSession();
  const pending = await session.runStore.listPendingApprovals();

  return NextResponse.json({
    pending: pending.map((a) => ({
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
    editedArgs?: Record<string, unknown>;
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

  try {
    const outcome = await decideAndResume(
      {
        approvalId: body.approvalId,
        decision: body.decision,
        decidedBy: body.decidedBy ?? spec.policy.approvalOwner,
        decidedAt: session.executor.clock.now().toISOString(),
        reason: body.reason,
        editedArgs: body.editedArgs,
      },
      bundle,
      session.executor,
    );

    return NextResponse.json({
      runId: outcome.run.runId,
      status: outcome.status,
      approvalId: outcome.approvalId,
      failure: outcome.run.failure,
      events: outcome.run.events,
    });
  } catch (err) {
    // The store rejects a second decision on the same approval, which would
    // otherwise resume one run twice.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 409 },
    );
  }
}
