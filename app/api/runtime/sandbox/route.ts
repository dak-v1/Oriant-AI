/**
 * app/api/runtime/sandbox/route.ts — the Sandbox over HTTP (M3).
 *
 *   GET   the scenario library THIS PLAN will be judged by, grouped by category
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
 * THE EVIDENCE IS NOW DERIVED FROM THE PLAN TOO, WHICH IS THE BUG THIS FILE
 * CARRIED UNTIL NOW. The plan stopped being the fixture; the scenarios did not.
 * Every case in `BRIGHTPATH_SCENARIOS` names a BrightPath agent id and the
 * authored sweep names `finance-followup` outright, so against an ingested plan
 * the runner answered `Agent "…" is not in the plan` for all of them. Measured
 * on the ingested handoff fixture, that read:
 *
 *     0 of 24 scenarios passed, 0 of 20 stress cases passed
 *     blockers: "Agent marketing-content-approval-agent has no scenarios."
 *
 * — a gate that could never open for any real workforce, no matter how safe it
 * was. That direction is the safe one and it is still not a gate; it is a wall.
 * `POST /api/runtime/collect` had already solved this, so the same workforce got
 * two different answers depending which door you came through. Both doors now
 * derive their evidence the same way, and the same plan gets the same verdict.
 *
 * THE PAIRING, AND WHY IT IS TWO CHOICES RATHER THAN ONE.
 *
 *   scenarios   `suiteForPlan(plan, BRIGHTPATH_SCENARIOS)` — authored cases
 *               survive only where their agent is in the plan, and every agent
 *               they do not reach gets generated smoke cover. For BrightPath
 *               that is all 24 authored cases and nothing generated; for an
 *               ingested plan it is generated cover throughout.
 *   sweep       authored for the fixture, generated for everything else, chosen
 *               by `sweepFor` below on the same principle. The comment there
 *               carries the measurement that forced the split.
 *
 * NOTHING HERE MAKES THE GATE EASIER TO OPEN. `runSuite` still treats an agent
 * with no scenarios as not ready and still refuses a verdict with no sweep, so a
 * plan generation cannot cover — no enabled workflow, or no agents at all —
 * comes back BLOCKED with the reason named, not passed for want of a failure.
 * Verified against four sabotaged plans; the header of `sweepFor` lists them.
 */
import { NextResponse } from "next/server";
import type { ApprovedPlan } from "@/lib/plan/types";
import { BRIGHTPATH_PLAN } from "@/lib/plan/fixtures/brightpath";
import { runScenario, runSuite } from "@/lib/runtime/sandbox/runner";
import type { SandboxDeps } from "@/lib/runtime/sandbox/runner";
import { BRIGHTPATH_SCENARIOS } from "@/lib/runtime/sandbox/scenarios";
import { suiteForPlan } from "@/lib/runtime/sandbox/smoke";
import { runGeneratedStress } from "@/lib/runtime/sandbox/smoke-stress";
import { runStressSweep } from "@/lib/runtime/sandbox/stress";
import type { StressResult } from "@/lib/runtime/sandbox/types";
import { getRuntimeSession } from "@/lib/runtime/session";

export const dynamic = "force-dynamic";

/**
 * The stress sweep that is evidence ABOUT THIS PLAN.
 *
 * `suiteForPlan` already decides scenario by scenario whether an authored case
 * applies. A sweep has no such seam — it is one function over a whole plan — so
 * the same decision has to be made once, here.
 *
 * THE OBVIOUS ANSWER IS "ALWAYS GENERATE", AND IT IS WRONG, which is the only
 * genuinely surprising thing in this file. `lib/runtime/pipeline/run.ts` always
 * generates, and is right to: it only ever holds a plan that arrived over the
 * seam. This route also serves the fixture, and the generated sweep is measurably
 * wrong about it. `stressScenariosForPlan` assumes an `auto_within_limits` agent
 * ACTS at any point inside its limits, but BrightPath's admin-operations agent
 * carries `alwaysApprove: ["google-calendar.events.update"]` and its first
 * enabled workflow ends on exactly that operation — so it pauses whatever the
 * numbers say, precisely as the plan instructs. Generating for it produced:
 *
 *     20 of 24 stress cases passed
 *     blockers: "4 of 24 stress case(s) failed."
 *     stress-admin-operations-1  bookings.per_run = 11 (within <= 12)
 *                                expected "completed" but got "awaiting_approval"
 *
 * Four false failures accusing an agent of a guardrail breach for obeying its
 * guardrail. Shipping that would have swapped a wall for a liar: the fixture
 * path, which `lib/runtime/current-plan.ts` promises keeps working permanently
 * and which verify M7 walks through this very route, would have gone red — and
 * red for a reason no owner could act on, which is how people learn to click
 * past a gate.
 *
 * So the authored sweep wins where it is genuinely about the plan in hand. That
 * is the SAME rule `suiteForPlan` applies to scenarios, not an exception to it.
 *
 * MATCHED ON `planId` RATHER THAN ON AN AGENT ID. The authored sweep is not
 * generically "the finance sweep"; its 20 cases are hard-coded against this
 * fixture's `invoice.amount <= 500` and `emails.per_run <= 20`. A different plan
 * that happened to contain an agent called `finance-followup` with other limits
 * would be swept against numbers that are not its own — evidence about the wrong
 * workforce, which is the whole class of bug being removed here. The version is
 * deliberately NOT compared: the fixture and its sweep are edited together in
 * this repo, and pinning it would silently drop a bumped fixture into the
 * generated sweep and back into the four false failures above.
 *
 * WHAT THIS IS NOT is a way to skip a sweep. Every plan gets one, and a plan the
 * generator finds no boundary in gets a sweep of zero cases at a pass rate of
 * 100 — honest, because there was no boundary to cross — while the scenario
 * suite remains the thing that has to cover every agent. That is what keeps the
 * gate shut on a plan nothing can prove:
 *
 *     every workflow disabled       BLOCKED "No scenario ran." +
 *                                           "Agent … has no scenarios."
 *     zero agents                   BLOCKED "No scenario ran."
 *     one unprovable agent added    BLOCKED "Agent ghost-agent has no scenarios."
 *     unattended, no limits at all  BLOCKED "Agent … failed 1 of 1 scenarios."
 *
 * KEPT IN STEP WITH ITS TWIN BY HAND. `app/api/runtime/activation/route.ts`
 * carries the same function, because Next refuses a route module that exports
 * anything but its handlers and neither route may reach into the other. Change
 * one and change the other in the same commit, or the two doors start
 * disagreeing again — which is the bug this file was rewritten to close.
 */
function sweepFor(plan: ApprovedPlan, deps: SandboxDeps): Promise<StressResult> {
  return plan.planId === BRIGHTPATH_PLAN.planId
    ? runStressSweep(plan, deps)
    : runGeneratedStress(plan, deps);
}

/**
 * THE LIBRARY THIS PLAN WILL ACTUALLY BE JUDGED BY, not the fixture's shelf.
 *
 * This used to list `BRIGHTPATH_SCENARIOS` unconditionally, which made the route
 * contradict itself the moment a plan was ingested: a caller read 24 scenarios,
 * POSTed one of their ids, and was told the agent is not in the plan. Worse for
 * a screen — it rendered a page of coverage for a workforce none of it touches.
 *
 * Resolving the plan makes this handler fallible where it used to be total: a
 * scheduler store that will not answer now 500s instead of listing the demo.
 * That is `lib/runtime/current-plan.ts`'s rule and it is the right one here —
 * showing somebody else's scenarios because we could not read the owner's plan
 * is the substitution this whole file exists to stop.
 *
 * An empty `categories` with `total: 0` is a real answer, and the honest one for
 * a plan nothing can be generated for. The POST is where that becomes a refusal.
 */
export async function GET() {
  const session = getRuntimeSession();
  const plan = await session.currentPlan();
  const suite = suiteForPlan(plan, BRIGHTPATH_SCENARIOS);

  const categories = new Map<string, { id: string; name: string; description: string; agentId: string }[]>();
  for (const scenario of suite) {
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
    // WHICH workforce this library is about. Without it a screen showing 24
    // BrightPath cases and a screen showing one generated smoke case are
    // indistinguishable, and the first one is a demo being mistaken for the
    // owner's own coverage.
    planId: plan.planId,
    planVersion: plan.version,
    total: suite.length,
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

  /* ── The evidence, derived from that plan ──
     Built before the single-scenario branch so both paths address the same
     library. Looking a `scenarioId` up in `BRIGHTPATH_SCENARIOS` while the suite
     ran something else is how GET and POST came to disagree in the first place:
     an id this route had just published was a 404 here. */
  const suite = suiteForPlan(plan, BRIGHTPATH_SCENARIOS);

  if (body.scenarioId) {
    const scenario = suite.find((s) => s.id === body.scenarioId);
    if (!scenario) {
      return NextResponse.json(
        {
          error: `Unknown scenario "${body.scenarioId}" for plan ${plan.planId}.`,
          available: suite.map((s) => s.id),
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
  const deps: SandboxDeps = { packages: session.build };
  // `stress: false` still means "no sweep ran", and `runSuite` still refuses a
  // ready verdict on that basis. It is a way to read the scenario results
  // quickly, never a way to be handed a green light without a boundary walked.
  const stress = body.stress === false ? null : await sweepFor(plan, deps);
  const verdict = await runSuite(suite, plan, { ...deps, stress });

  return NextResponse.json({
    ready: verdict.ready,
    total: verdict.total,
    passed: verdict.passed,
    failed: verdict.failed,
    // Every way the gate is shut, in the verdict's own words. Previously absent
    // from this body, so a caller looking at `ready: false` with 0 results had
    // nothing to render — which is exactly the shape an unprovable plan
    // produces, and exactly when the reason matters most.
    blockers: verdict.blockers,
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
