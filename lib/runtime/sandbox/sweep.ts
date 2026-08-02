/**
 * lib/runtime/sandbox/sweep.ts — WHICH stress sweep is evidence about THIS plan.
 *
 * THE DEFECT THIS FILE CLOSES IS NOT THE CHOICE BELOW; IT IS THAT THE CHOICE WAS
 * MADE TWICE. `sweepFor` lived verbatim in app/api/runtime/sandbox/route.ts and
 * again in app/api/runtime/activation/route.ts, each under a header instructing
 * whoever edited one to remember the other in the same commit. Nothing asserted
 * they agreed. A one-sided edit compiled, linted and shipped green, and what it
 * produces is the exact failure both of those routes were rewritten to remove:
 * THE TWO DOORS DISAGREE. One workforce, proved at /api/runtime/sandbox and
 * refused at /api/runtime/activation — or worse, the reverse — with both answers
 * looking equally authoritative and neither able to explain the other. A
 * discipline that no check enforces is not a discipline; it is a hope, and this
 * repo has already shipped that hope twice.
 *
 * WHY THE FUNCTION LIVES HERE AND NOT IN EITHER ROUTE. Next refuses a route
 * module that exports anything besides its handlers, so neither route can own it,
 * and a route importing from another route is a dependency between two transports
 * that would still leave the runtime's rule stated inside a URL. The rule is not
 * about HTTP at all: it is "what counts as a stress sweep ABOUT this plan", which
 * is a sandbox decision, so it belongs beside the two sweeps it is choosing
 * between. lib/runtime is framework-free and this file keeps it that way — no
 * next/server, no Request, nothing that cannot be compiled and run by
 * scripts/verify.mjs without the app around it.
 *
 * REJECTED: EXPORTING IT FROM ONE ROUTE AND IMPORTING THAT FROM THE OTHER, which
 * Next forbids outright; REJECTED: leaving one copy behind as "the reference
 * implementation", which is the same two-doors bug with a comment claiming
 * otherwise; REJECTED: lib/runtime/pipeline, where `run.ts` already answers this
 * question differently and correctly — see below — so putting both answers in one
 * module would invite someone to unify them.
 *
 * ── THE CHOICE ITSELF ────────────────────────────────────────────────────────
 *
 * `suiteForPlan` already decides scenario by scenario whether an authored case
 * applies to the plan in hand. A sweep has no such seam — it is one function over
 * a whole plan — so the same decision has to be made once, here.
 *
 * THE OBVIOUS ANSWER IS "ALWAYS GENERATE", AND IT WAS MEASURED WRONG.
 * lib/runtime/pipeline/run.ts always generates and is right to: it only ever
 * holds a plan that arrived over the seam. These two routes also serve the
 * BrightPath fixture, and the generator then assumed an `auto_within_limits`
 * agent ACTS at any point inside its limits — while BrightPath's
 * admin-operations agent carries `alwaysApprove:
 * ["google-calendar.events.update"]` and its first enabled workflow ends on
 * exactly that operation, so it pauses whatever the numbers say, precisely as
 * the plan instructs. Generating for the fixture produced:
 *
 *     20 of 24 stress cases passed
 *     blockers: "4 of 24 stress case(s) failed."
 *     stress-admin-operations-1  bookings.per_run = 11 (within <= 12)
 *                                expected "completed" but got "awaiting_approval"
 *
 * Four false failures accusing an agent of a guardrail breach for obeying its
 * guardrail. Shipping that would have swapped a wall for a liar: the fixture
 * path, which lib/runtime/current-plan.ts promises keeps working permanently and
 * which verify M7 walks through both of these routes, would have gone red — and
 * red for a reason no owner could act on, which is how people learn to click past
 * a gate. A false red is not a safe default.
 *
 * THAT PARTICULAR HOLE HAS SINCE BEEN CLOSED — the generator in
 * lib/runtime/sandbox/smoke.ts now reads `alwaysApprove` — and the record stays
 * anyway, for two reasons. It is why the fixture and an ingested plan are swept
 * differently at all, so deleting it would leave the branch below looking
 * arbitrary. And it is the shape of the risk rather than one instance of it: a
 * generator infers what a plan means, the authored sweep states what THIS plan
 * means, and the fixture is the one plan in the repo where somebody wrote the
 * second down. Which sweep the demo path is proved by is not a thing to change
 * without measuring it again.
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
 * 100 — honest, because there was no boundary to cross — while the scenario suite
 * remains the thing that has to cover every agent. That is what keeps the gate
 * shut on a plan nothing can prove; verified against four sabotaged plans:
 *
 *     every workflow disabled       BLOCKED "No scenario ran." +
 *                                           "Agent … has no scenarios."
 *     zero agents                   BLOCKED "No scenario ran."
 *     one unprovable agent added    BLOCKED "Agent ghost-agent has no scenarios."
 *     unattended, no limits at all  BLOCKED "Agent … failed 1 of 1 scenarios."
 *
 * WHAT NOW HOLDS THE TWO DOORS TOGETHER is verify M7-7 in
 * lib/runtime/verify/m7.ts, which drives POST /api/runtime/sandbox and
 * GET /api/runtime/activation against the same runtime and requires the sweep
 * they report to be the same one — for the fixture, where the authored sweep must
 * win, and for an ingested plan, where the generated one must. The two arms
 * produce different sweeps on purpose, so a route that stopped calling this
 * function and started deciding for itself fails one arm or the other rather than
 * shipping.
 */

import type { ApprovedPlan } from "../../plan/types";
import { BRIGHTPATH_PLAN } from "../../plan/fixtures/brightpath";
import type { SandboxDeps } from "./runner";
import { runGeneratedStress } from "./smoke-stress";
import { runStressSweep } from "./stress";
import type { StressResult } from "./types";

/**
 * The stress sweep that is evidence about `plan`, authored or generated.
 *
 * `deps` is required rather than defaulted to `{}`, which is the one thing about
 * this signature worth arguing over: `runGeneratedStress` and `runStressSweep`
 * both accept an empty `SandboxDeps` and quietly prove a fresh compile of the
 * spec instead of the package the Factory built and stored. That is a weaker
 * claim wearing the same name, and a caller that omitted `packages` by accident
 * would never find out. Making the parameter mandatory turns that omission into a
 * compile error at the only two call sites there are.
 *
 * Returns the promise rather than awaiting it: there is nothing to do with the
 * result here, and an `async` wrapper would only add a frame between the caller
 * and whichever sweep actually threw.
 */
export function sweepFor(plan: ApprovedPlan, deps: SandboxDeps): Promise<StressResult> {
  return plan.planId === BRIGHTPATH_PLAN.planId
    ? runStressSweep(plan, deps)
    : runGeneratedStress(plan, deps);
}
