/**
 * app/api/runtime/run/route.ts — trigger and inspect agent runs (M1 over HTTP).
 *
 *   GET  ?runId=      one run with its full event stream
 *   GET               every run, summarised
 *   POST { agentId, workflowId?, payload? }   start a run
 *
 * A run may finish OR pause for approval; "awaiting_approval" is a normal
 * success response, not an error. The paused run is resumed through
 * /api/runtime/approvals.
 *
 * Runs execute against the STORED package, never a freshly compiled one: if an
 * agent has not been built for its current version the request is refused. That
 * is what makes the build gate meaningful rather than advisory.
 */
import { NextResponse } from "next/server";
import { loadBundle } from "@/lib/runtime/build/runner";
import { startRun } from "@/lib/runtime/executor";
import { getRuntimeSession } from "@/lib/runtime/session";
import type { TriggerEvent } from "@/lib/runtime/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = getRuntimeSession();
  const runId = new URL(request.url).searchParams.get("runId");

  if (runId) {
    const run = await session.runStore.getRun(runId);
    if (!run) {
      return NextResponse.json({ error: `Run ${runId} not found.` }, { status: 404 });
    }
    return NextResponse.json({ run });
  }

  const runs = await session.runStore.listRuns();
  return NextResponse.json({
    runs: runs.map((r) => ({
      runId: r.runId,
      agentId: r.agentId,
      workflowId: r.workflowId,
      status: r.status,
      pendingApprovalId: r.pendingApprovalId,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      failure: r.failure,
      events: r.events.length,
    })),
  });
}

export async function POST(request: Request) {
  const session = getRuntimeSession();

  let body: { agentId?: string; workflowId?: string; payload?: Record<string, unknown> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "A JSON body with agentId is required." }, { status: 400 });
  }

  /* ── The workforce this request is about ──
     The plan the owner currently intends, read ONCE and reused for the lookup,
     for the refusal's `available` list and for the executor below. Two reads
     could straddle a concurrent ingest and produce a response that names the
     agents of one plan while running an agent from another. */
  const plan = await session.currentPlan();

  const spec = plan.agents.find((a) => a.id === body.agentId);
  if (!spec) {
    return NextResponse.json(
      {
        error: `Unknown agent "${String(body.agentId)}".`,
        available: plan.agents.map((a) => a.id),
      },
      { status: 400 },
    );
  }

  const workflow = body.workflowId
    ? spec.workflows.find((w) => w.id === body.workflowId)
    : spec.workflows.find((w) => w.enabled);
  if (!workflow) {
    return NextResponse.json(
      {
        error: `Agent "${spec.id}" has no matching enabled workflow.`,
        available: spec.workflows.filter((w) => w.enabled).map((w) => w.id),
      },
      { status: 400 },
    );
  }

  const bundle = await loadBundle(spec, session.build);
  if (!bundle) {
    return NextResponse.json(
      {
        error: `Agent "${spec.id}" has no built package for version ${spec.version}. POST /api/runtime/build first.`,
      },
      { status: 409 },
    );
  }

  const firedAt = session.executor.clock.now().toISOString();
  const trigger: TriggerEvent = {
    kind: workflow.trigger.kind === "schedule" ? "schedule" : "manual",
    workflowId: workflow.id,
    agentId: spec.id,
    firedAt,
    payload: body.payload ?? {},
    // Manual invocations are distinct events, so the key must be unique per
    // request; the scheduler supplies a stable key for real triggers (M4).
    idempotencyKey: session.executor.newId("trig"),
  };

  // Executed with THIS plan's deps, not the session's seeded ones.
  // `ExecutorOptions.globalPolicy` is the org-wide denies and the quiet window,
  // and `session.executor` carries the fixture's copy of both — starting a real
  // agent with it would leave a capability the owner forbade unforbidden. The
  // clock and id factory above are shared either way; only the policy differs,
  // which is the whole reason `executorFor` exists.
  const outcome = await startRun(bundle, trigger, session.executorFor(plan));

  return NextResponse.json({
    runId: outcome.run.runId,
    status: outcome.status,
    approvalId: outcome.approvalId,
    failure: outcome.run.failure,
    events: outcome.run.events,
  });
}
