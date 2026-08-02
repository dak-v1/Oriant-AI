/**
 * app/api/runtime/build/route.ts — the Agent Factory over HTTP (M2).
 *
 *   GET   build status for the approved plan, plus every job so far
 *   POST  build the plan; { force: true } rebuilds even unchanged agents
 *
 * Unauthenticated on purpose for now: this branch is Role C's development
 * surface and the runtime is fixture-backed. Every /api/runtime route must be
 * gated before any deployment — this one mutates state, so an open POST here
 * lets anyone rebuild the workforce.
 */
import { NextResponse } from "next/server";
import { buildPlan, planBuildStatus } from "@/lib/runtime/build/runner";
import { getRuntimeSession } from "@/lib/runtime/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = getRuntimeSession();

  /* ── The plan being built, resolved once ──
     This handler reads it four times — the status, the job filter, the header
     and the roster — and a second read could straddle an ingest, so one
     response would report jobs for one workforce beside the agents of another.
     `currentPlan()` rather than the seed: the Factory builds what the owner
     intends, and packages compiled for the BrightPath fixture carry the
     fixture's agent ids, which is exactly what Activation's package gate would
     then fail to find for the real plan. */
  const plan = await session.currentPlan();

  const status = await planBuildStatus(plan, session.build);
  const jobs = await session.buildStore.listJobs({ planId: plan.planId });
  const packages = await session.buildStore.listPackages();

  return NextResponse.json({
    mode: session.mode,
    plan: {
      planId: plan.planId,
      version: plan.version,
      agents: plan.agents.map((a) => ({
        id: a.id,
        name: a.name,
        version: a.version,
        operatingMode: a.policy.operatingMode,
      })),
    },
    ready: status.ready,
    missing: status.missing,
    packages: packages.map((p) => ({
      agentId: p.agentId,
      agentVersion: p.agentVersion,
      checksum: p.checksum,
      builtAt: p.builtAt,
      workflows: p.pkg.workflows.length,
      allowedOperations: p.pkg.allowedOperations.length,
    })),
    jobs,
  });
}

export async function POST(request: Request) {
  const session = getRuntimeSession();

  let force = false;
  try {
    const body = (await request.json()) as { force?: unknown };
    force = body.force === true;
  } catch {
    // No body is the common case: a plain POST means "build what changed".
  }

  // Same plan the GET above reports on, read the same way: a POST that built the
  // seed fixture would fill the package store with a demo workforce nobody asked
  // for and leave the ingested plan unbuilt.
  const plan = await session.currentPlan();
  const result = await buildPlan(plan, session.build, { force });

  return NextResponse.json({
    mode: session.mode,
    built: result.built,
    skipped: result.skipped,
    failed: result.failed,
    ready: result.ready,
    jobs: result.jobs.map((j) => ({
      jobId: j.jobId,
      agentId: j.agentId,
      agentVersion: j.agentVersion,
      status: j.status,
      attempt: j.attempt,
      checksum: j.checksum,
      error: j.error,
      logs: j.logs,
    })),
  });
}
