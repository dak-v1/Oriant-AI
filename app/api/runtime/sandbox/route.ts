/**
 * app/api/runtime/sandbox/route.ts — the Sandbox over HTTP (M3).
 *
 *   GET   the scenario library, grouped by category
 *   POST  run the suite; { scenarioId } runs one, { stress: false } skips the sweep
 *
 * The verdict returned here is what Activation gates on. It is recomputed on
 * every request rather than cached, because a stale "ready" is the one failure
 * mode that matters: it would let a workforce go live on evidence gathered
 * before the plan changed.
 *
 * Runs are fully stubbed and deterministic, so this endpoint is safe to call
 * repeatedly and never reaches a real customer system.
 *
 * WHAT IS PROVED IS THE CURRENT PLAN — `session.currentPlan()`, what the owner
 * actually intends — and no longer the seed fixture. Proving the fixture while
 * Activation deploys the ingested plan would be the one thing a pre-flight gate
 * must never do: a green verdict about a workforce that is not the one going
 * live. Each handler resolves it once; see the POST for why once matters.
 *
 * THE SCENARIO LIBRARY IS STILL THE FIXTURE'S, AND THE PLAN NO LONGER IS. Every
 * scenario in `BRIGHTPATH_SCENARIOS` names a BrightPath agent id, and the stress
 * sweep names `finance-followup` outright, so against an ingested plan the
 * runner answers `Agent "…" is not in the plan` for each one and every agent
 * comes back with no scenarios. The verdict is therefore RED for a real
 * workforce, which is the safe direction — absence of evidence reads as absence
 * of safety, exactly as lib/runtime/sandbox/runner.ts intends — but it is a shut
 * activation gate rather than a judgement of the owner's agents. Deriving
 * scenarios for an ingested plan is the missing piece and it is not this
 * route's to invent; pairing a real plan with the demo library silently would
 * be worse than being unable to prove it at all.
 */
import { NextResponse } from "next/server";
import { runScenario, runSuite } from "@/lib/runtime/sandbox/runner";
import { BRIGHTPATH_SCENARIOS } from "@/lib/runtime/sandbox/scenarios";
import { runStressSweep } from "@/lib/runtime/sandbox/stress";
import { getRuntimeSession } from "@/lib/runtime/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const categories = new Map<string, { id: string; name: string; description: string; agentId: string }[]>();
  for (const scenario of BRIGHTPATH_SCENARIOS) {
    const list = categories.get(scenario.category) ?? [];
    list.push({
      id: scenario.id,
      name: scenario.name,
      description: scenario.description,
      agentId: scenario.agentId,
    });
    categories.set(scenario.category, list);
  }

  return NextResponse.json({
    total: BRIGHTPATH_SCENARIOS.length,
    categories: [...categories.entries()].map(([category, scenarios]) => ({
      category,
      scenarios,
    })),
  });
}

export async function POST(request: Request) {
  const session = getRuntimeSession();

  let body: { scenarioId?: string; stress?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // An empty body means "run everything".
  }

  /* ── One plan per verdict ──
     Resolved once and handed to the single scenario, the sweep and the suite
     alike. Three separate reads could straddle an ingest, and a verdict whose
     sweep proved one workforce and whose scenarios proved another is worse than
     no verdict: `SandboxVerdict.planId` would name one of them and the results
     would be about both. */
  const plan = await session.currentPlan();

  if (body.scenarioId) {
    const scenario = BRIGHTPATH_SCENARIOS.find((s) => s.id === body.scenarioId);
    if (!scenario) {
      return NextResponse.json(
        {
          error: `Unknown scenario "${body.scenarioId}".`,
          available: BRIGHTPATH_SCENARIOS.map((s) => s.id),
        },
        { status: 404 },
      );
    }
    const result = await runScenario(scenario, plan, { packages: session.build });
    return NextResponse.json({ result });
  }

  // `packages` is supplied so the suite proves the artefact the Factory BUILT
  // and stored, not a fresh compile of the spec. Activation's sandbox gate
  // resolves it the same way; without this the two could disagree — a green
  // verdict here and a shut gate there for an agent whose package is missing.
  const stress =
    body.stress === false
      ? null
      : await runStressSweep(plan, { packages: session.build });
  const verdict = await runSuite(BRIGHTPATH_SCENARIOS, plan, {
    stress,
    packages: session.build,
  });

  return NextResponse.json({
    ready: verdict.ready,
    total: verdict.total,
    passed: verdict.passed,
    failed: verdict.failed,
    byAgent: verdict.byAgent,
    stress: verdict.stress
      ? { total: verdict.stress.total, passed: verdict.stress.passed, passRate: verdict.stress.passRate }
      : null,
    // Trimmed for transport: the full event stream is available per scenario.
    results: verdict.results.map((r) => ({
      scenarioId: r.scenarioId,
      name: r.name,
      category: r.category,
      agentId: r.agentId,
      passed: r.passed,
      failures: r.failures,
      finalStatus: r.finalStatus,
      approvalsRaised: r.approvalsRaised,
      operationsCalled: r.operationsCalled,
    })),
  });
}
