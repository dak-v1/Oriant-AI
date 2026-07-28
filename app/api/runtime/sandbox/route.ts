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
    const result = await runScenario(scenario, session.plan, { packages: session.build });
    return NextResponse.json({ result });
  }

  // `packages` is supplied so the suite proves the artefact the Factory BUILT
  // and stored, not a fresh compile of the spec. Activation's sandbox gate
  // resolves it the same way; without this the two could disagree — a green
  // verdict here and a shut gate there for an agent whose package is missing.
  const stress =
    body.stress === false
      ? null
      : await runStressSweep(session.plan, { packages: session.build });
  const verdict = await runSuite(BRIGHTPATH_SCENARIOS, session.plan, {
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
