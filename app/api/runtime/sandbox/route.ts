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
 *               by `sweepFor` on the same principle. That function is
 *               lib/runtime/sandbox/sweep.ts and its header carries the
 *               measurement that forced the split.
 *
 * THE SWEEP CHOICE IS NO LONGER MADE IN THIS FILE, and that is a fix rather than
 * a tidy-up. It used to sit here as a private function, copied verbatim into
 * app/api/runtime/activation/route.ts because Next refuses a route module that
 * exports anything but its handlers — two copies kept in step by a comment asking
 * whoever edited one to remember the other, with nothing asserting they agreed. A
 * one-sided edit would have gone green and put this route and the go-live gate
 * back to answering differently about the same workforce, which is the exact bug
 * the paragraphs above describe. Both doors now call the one function, and verify
 * M7-7 drives both and requires the sweeps they report to match.
 *
 * THE POST BODY NOW NAMES ITS OWN PLAN AND CARRIES THE SWEEP'S ROWS. Both were
 * already on `SandboxVerdict` and both were dropped on the way out, and the two
 * omissions cost the same thing: a caller could not tell what it was holding. A
 * bare `ready: true` cannot say which workforce it is about, and a sweep reduced
 * to three numbers cannot say whether `passed < total` means a guardrail leaked
 * or means the sweep never walked that boundary — a distinction
 * lib/runtime/sandbox/smoke-stress.ts creates on purpose and this body used to
 * erase. Both additions are fields, not changes: every field this response
 * carried before it carries still, in the same shape.
 *
 * NOTHING HERE MAKES THE GATE EASIER TO OPEN. `runSuite` still treats an agent
 * with no scenarios as not ready and still refuses a verdict with no sweep, so a
 * plan generation cannot cover — no enabled workflow, or no agents at all —
 * comes back BLOCKED with the reason named, not passed for want of a failure.
 * Verified against four sabotaged plans; the sweep module's header lists them.
 */
import { NextResponse } from "next/server";
import { runScenario, runSuite } from "@/lib/runtime/sandbox/runner";
import type { SandboxDeps } from "@/lib/runtime/sandbox/runner";
import { BRIGHTPATH_SCENARIOS } from "@/lib/runtime/sandbox/scenarios";
import { suiteForPlan } from "@/lib/runtime/sandbox/smoke";
import { sweepFor } from "@/lib/runtime/sandbox/sweep";
import { getRuntimeSession } from "@/lib/runtime/session";

export const dynamic = "force-dynamic";

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
    /* ── WHICH workforce this verdict is about ──
       `SandboxVerdict` has carried these two fields since M3 and this body
       dropped them, which left every caller holding a verdict it could not
       attribute. The GET above publishes `planId`/`planVersion` for the library;
       a caller that read the library, POSTed, and got back a bare `ready: true`
       had to ASSUME the two requests straddled no ingest — the same assumption
       the "one plan per verdict" comment above refuses to make on the server
       side. A green verdict that cannot name its own workforce is precisely the
       substitution this file's header is about, so it names it. */
    planId: verdict.planId,
    planVersion: verdict.planVersion,
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
      ? {
          total: verdict.stress.total,
          passed: verdict.stress.passed,
          passRate: verdict.stress.passRate,
          /* ── The sweep's own rows, which this body used to drop ──
             lib/runtime/sandbox/smoke-stress.ts reports a sweep that could not
             walk the whole space as `cases` whose ids begin `coverage-`, and its
             header names this response as the surface where that reporting still
             did not arrive: three numbers cannot tell a guardrail that does not
             hold apart from a boundary nobody crossed. Both drag `passed` below
             `total` and both shut the gate, but only one of them is a bug in the
             workforce — and the person deciding whether to go live is the one who
             needs to know which. The rows are the runtime's, verbatim; nothing
             here summarises or filters them. */
          cases: verdict.stress.cases,
        }
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
