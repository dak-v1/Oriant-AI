/**
 * app/api/runtime/activation/route.ts — the go-live gate over HTTP (M4).
 *
 *   GET   the ActivationChecklist: all three gates, their blockers, and the
 *         deployment already live for this plan version when there is one
 *   POST  { activatedBy }   go live
 *
 * A BLOCKED ACTIVATION IS AN EXPECTED OUTCOME, NOT AN ERROR, and the status code
 * says so: a refused go-live returns **409 with the whole checklist**, never a
 * 500 and never a 200. `activate` already refuses by returning the checklist
 * rather than throwing, because "not ready" is the ordinary case the deploy
 * screen exists to render. A 500 would throw that detail away and tell the owner
 * the server broke; a 200 would let a caller that only checks the status code
 * report a workforce live that is not. 409 is the honest answer — the request was
 * well formed and the state of the plan conflicts with it — and the body is
 * exactly what the screen needs to name the gate that shut.
 *
 * THE CHECKLIST SAYS WHETHER THIS PLAN *CAN* GO LIVE; IT NEVER SAID WHAT IS LIVE
 * ALREADY. Those are different questions and the gap between them is the whole
 * of the go-live decision — an owner about to press this button needs to know
 * which agents are new, which are about to be replaced mid-flight, and which
 * will be left running for a plan that no longer contains them. `live` and
 * `lifecycle` answer it, reconciled by `session.planState()` — one read of both
 * plans — and they are the same four words `/api/runtime/agents` tags its roster
 * with, so the deploy screen and the roster cannot disagree about what is
 * running.
 *
 * EVERYTHING BELOW IS ABOUT THE CURRENT PLAN, `session.currentPlan()`, and each
 * handler resolves it exactly once. The gates, the reconciliation and the
 * go-live have to be about one workforce or the response contradicts itself:
 * a checklist judging the plan as it was before an ingest, attached to a
 * deployment of the plan as it is after, is a go-live nobody authorised.
 *
 * `checklist.activeDeployment` IS NOT `live.deploymentId`, DELIBERATELY. The
 * first is set only when THIS plan version is already live; the second is
 * whatever is running, at whatever version. `activeDeployment: null` alongside a
 * non-null `live.deploymentId` is the interesting case and is exactly what a
 * re-activation after a plan edit looks like: something IS live, and it is not
 * this.
 *
 * ONLY GET GAINS THIS. POST is a write, and a reconciliation taken before
 * `activate` runs would describe a workforce the response itself has just
 * superseded. The success body already returns the deployment that was written;
 * a caller wanting the new picture re-reads GET, and gets one that is true.
 *
 * THE CHECKLIST IS RE-DERIVED ON EVERY REQUEST, THE SANDBOX VERDICT INCLUDED, so
 * this handler is deliberately slow: it runs the whole scenario library and the
 * stress sweep before it can answer. That is the price of the rule
 * lib/runtime/schedule/activation.ts is built around — a cached "ready" is the
 * one failure mode that ships a workforce on evidence gathered before the plan
 * changed. Nothing here memoises, and nothing here should learn to.
 *
 * AND THE EVIDENCE IS NOW DERIVED FROM THE PLAN BEING GATED, which it was not.
 * This route judged `session.currentPlan()` while proving it with
 * `BRIGHTPATH_SCENARIOS` and the authored `runStressSweep`, both of which name
 * BrightPath agent ids. Against an ingested plan the runner answered `Agent "…"
 * is not in the plan` for every case, so the sandbox gate reported:
 *
 *     0 of 24 scenarios passed, 0 of 20 stress cases passed
 *     blockers: "Agent marketing-content-approval-agent has no scenarios."
 *
 * The go-live button was therefore unpressable for every real workforce — not
 * because anything was unsafe, but because the gate was reading someone else's
 * homework. `POST /api/runtime/collect` already derived its suite from the plan
 * (lib/runtime/pipeline/run.ts), so the same workforce passed through one door
 * and was refused at this one. `SessionSandboxEvidence` below now derives both
 * halves the same way that pipeline does, and the doors agree.
 *
 * IT DOES NOT OPEN ANY GATE THAT WAS HONESTLY SHUT. `runSuite` still refuses a
 * verdict for an agent no scenario covers and still refuses one with no sweep,
 * so a plan generation cannot cover arrives here BLOCKED with the reason named —
 * checked against a plan with every workflow disabled, a plan with no agents,
 * and a provable plan with one unprovable agent added, all three of which still
 * shut this gate and say which agent shut it.
 *
 * WHICH SWEEP COUNTS AS EVIDENCE IS DECIDED IN lib/runtime/sandbox/sweep.ts, and
 * moving it there was a fix rather than a tidy-up. This file carried `sweepFor`
 * as a private copy of the one in app/api/runtime/sandbox/route.ts — verbatim,
 * because Next refuses a route module that exports anything but its handlers —
 * kept in step by a comment asking whoever edited one to remember the other, with
 * nothing asserting they agreed. A one-sided edit would have gone green and put
 * the go-live gate back to answering differently from the Sandbox about the same
 * workforce, which is precisely the two-doors defect the paragraph above records.
 * Both doors now call the one function, and verify M7-7 drives both and requires
 * the sweeps they report to match.
 *
 * Unauthenticated on purpose for now, exactly as /api/runtime/build is: this
 * branch is Role C's development surface and the runtime is fixture-backed. It
 * must be gated before any deployment, along with every other /api route — and
 * of all of them this is the one that most needs it, because POST here is the
 * call that puts a workforce live. No auth scheme is invented here; that decision
 * belongs with whoever owns the deployment.
 */
import { NextResponse } from "next/server";
import type { ApprovedPlan } from "@/lib/plan/types";
import { runSuite } from "@/lib/runtime/sandbox/runner";
import type { SandboxDeps } from "@/lib/runtime/sandbox/runner";
import { BRIGHTPATH_SCENARIOS } from "@/lib/runtime/sandbox/scenarios";
import { suiteForPlan } from "@/lib/runtime/sandbox/smoke";
import { sweepFor } from "@/lib/runtime/sandbox/sweep";
import type { SandboxVerdict } from "@/lib/runtime/sandbox/types";
import {
  activate,
  activationBlockers,
  activationChecklist,
} from "@/lib/runtime/schedule/activation";
import type { ActivationDeps, SandboxEvidence } from "@/lib/runtime/schedule/activation";
import { getRuntimeSession } from "@/lib/runtime/session";
import type { RuntimeSession } from "@/lib/runtime/session";

export const dynamic = "force-dynamic";

/* ═══════════════════════════ Gate inputs ═══════════════════════════ */

/**
 * The sandbox gate's evidence, earned on demand.
 *
 * Nothing stores a verdict — M3's is a derivation over the scenario library and
 * the built packages, not a row — so the suite runs when the gate asks for it.
 * INSIDE `latestVerdict` rather than before it, which is the only interesting
 * choice here: `sandboxGate` turns a throwing evidence source into a shut gate
 * carrying the error, so an owner who cannot activate gets the reason on their
 * checklist instead of a 500 with no checklist in it.
 *
 * It proves the packages the Factory STORED (`session.build`) rather than a fresh
 * compile of the specs. The gate exists to say that the artefact activation is
 * about to deploy is the one that was proved, and an equivalent recompilation is
 * a weaker, different claim — the same reasoning lib/runtime/sandbox/runner.ts
 * gives for preferring the stored package.
 *
 * THE PLAN IS HANDED IN, NOT RESOLVED HERE. It has to be the same object the
 * checklist is judging and, on GET, the same one the reconciliation below
 * describes — resolving it a second time inside `latestVerdict` would let an
 * ingest land between the two and produce a verdict about a workforce this
 * response never mentions.
 *
 * AND THE SUITE IS DERIVED FROM THAT PLAN. `suiteForPlan` keeps every authored
 * BrightPath case whose agent the plan actually contains and generates smoke
 * cover for every agent it does not reach, so the gate judges the workforce in
 * front of it instead of failing to find a workforce it has never been given.
 * Handing `BRIGHTPATH_SCENARIOS` straight to `runSuite`, as this did, meant an
 * ingested plan was gated on 24 cases that could only ever report "not in the
 * plan" — see the header. The generated cases are weaker claims than the
 * authored ones and say so in their own descriptions; what they are not is
 * absent, and an absent scenario is what `runSuite` correctly refuses to treat
 * as safety.
 */
class SessionSandboxEvidence implements SandboxEvidence {
  private readonly session: RuntimeSession;
  private readonly plan: ApprovedPlan;

  constructor(session: RuntimeSession, plan: ApprovedPlan) {
    this.session = session;
    this.plan = plan;
  }

  async latestVerdict(): Promise<SandboxVerdict> {
    const deps: SandboxDeps = { packages: this.session.build };
    // Sweep first, so a throw from it closes the gate before any scenario runs
    // and the caller pays for a suite whose verdict could not be reached anyway.
    const stress = await sweepFor(this.plan, deps);
    return runSuite(suiteForPlan(this.plan, BRIGHTPATH_SCENARIOS), this.plan, {
      ...deps,
      stress,
    });
  }
}

/**
 * The three gates' inputs, assembled per request, for one plan.
 *
 * Cheap on its own — the expense is inside the evidence, and only when a gate
 * actually reads it.
 *
 * AND THE INTEGRATIONS GATE NOW ASKS THE PLAN'S OWN ORGANIZATION, which it did
 * not. This function had the plan in its hand and still passed `session.tools` —
 * the provider for the BrightPath fixture's organization, which is a demo with
 * no Composio connections behind it at all. So gate 3, one of the three things
 * standing between a workforce and go-live, answered "has the DEMO connected
 * Gmail?" and printed the result under the customer's name. Every blocker on
 * this checklist was about somebody else's connections, and the two directions
 * it can be wrong are both bad: an owner told to reconnect a tool that is
 * connected, or a go-live opened on connections that are not theirs.
 *
 * `toolsFor` fails closed on its own (lib/runtime/tools/organization.ts): a plan
 * whose organization cannot be resolved gets a provider that reports every
 * connection as "required" and refuses every call by name, so this gate comes
 * back SHUT with the reason rather than falling through to the fixture's
 * provider or the stub. Nothing about that is re-implemented here.
 */
function gateInputs(session: RuntimeSession, plan: ApprovedPlan): ActivationDeps {
  return {
    scheduler: session.scheduler,
    packages: session.build,
    integrations: session.toolsFor(plan.organizationId),
    sandbox: new SessionSandboxEvidence(session, plan),
  };
}

/* ═══════════════════════════ The checklist ═══════════════════════════ */

export async function GET() {
  const session = getRuntimeSession();

  /* ── Both plans, in one read ──
     `planState()` resolves what the owner intends, what is actually deployed
     and the reconciliation between them together. This handler used to resolve
     the active plan itself and call `reconcileAgents` by hand, which left the
     gates judging one plan and the diff describing another whenever an ingest
     landed between the two reads — inside a single response about a single
     button. One read, one workforce. */
  const state = await session.planState();
  const plan = state.current.plan;
  const lifecycle = state.lifecycle;

  /* ── The gates judge what is INTENDED ──
     The current plan, never the deployed one: gating a go-live against the
     workforce already running can never fail and would prove nothing. The
     reconciliation above reads both and is what makes the difference visible. */
  const checklist = await activationChecklist(plan, gateInputs(session, plan));

  return NextResponse.json({
    mode: session.mode,
    /**
     * WHICH workforce this checklist is about. `source: "fixture"` means nothing
     * has been ingested and this button would put the BrightPath demo live —
     * `fallbackReason` is the sentence to show for it. A deploy screen that
     * renders a plan without saying where it came from is the screen that lets
     * a demo be mistaken for the owner's own workforce.
     */
    plan: {
      planId: plan.planId,
      version: plan.version,
      source: state.current.source,
      fallbackReason: state.current.fallbackReason,
    },
    /**
     * What is RUNNING right now, and what pressing the button would change.
     * `planned` is what this activation would start, `drifted` what it would
     * replace, `retired` what it would leave running for a plan that has
     * dropped it — the last of which is the one nobody expects.
     */
    live: {
      source: state.active.source,
      deploymentId: state.active.deploymentId,
      running: lifecycle.filter((row) => row.lifecycle === "running").length,
      drifted: lifecycle.filter((row) => row.lifecycle === "drifted").length,
      planned: lifecycle.filter((row) => row.lifecycle === "planned").length,
      retired: lifecycle.filter((row) => row.lifecycle === "retired").length,
    },
    /**
     * Per agent, so the screen can name them rather than only count them. The
     * checklist itself is NOT touched: `ActivationChecklist` is the gates'
     * shape and belongs to lib/runtime/schedule/activation.ts.
     */
    lifecycle,
    checklist,
    // The same blockers the gates already carry, flattened in gate order, so a
    // caller rendering one list and a caller rendering three gates are reading
    // the same facts rather than assembling their own.
    blockers: activationBlockers(checklist),
  });
}

/* ═══════════════════════════ Go live ═══════════════════════════ */

export async function POST(request: Request) {
  const session = getRuntimeSession();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: "A JSON body with activatedBy is required." },
      { status: 400 },
    );
  }

  // `null` and `[]` are both valid JSON and neither carries a field. Narrowed
  // here rather than cast through, so a body of `null` is the caller's 400 and
  // not a TypeError reaching the client as a 500.
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json(
      { error: "The request body must be a JSON object with activatedBy." },
      { status: 400 },
    );
  }
  const body = raw as { activatedBy?: unknown };

  const activatedBy =
    typeof body.activatedBy === "string" ? body.activatedBy.trim() : "";
  if (activatedBy === "") {
    // `activate` throws on a blank actor rather than returning a checklist,
    // because a deployment record that cannot say who put the workforce live is
    // not an audit record. Caught here so the caller's omission is a 400 that
    // names the field, not a 500 that names nothing.
    return NextResponse.json(
      {
        error:
          "activatedBy is required: it is the user id recorded on the deployment, " +
          "and a go-live record that cannot say who authorised it is not evidence of anything.",
      },
      { status: 400 },
    );
  }

  /* ── The workforce going live ──
     Read once, after the body checks so a malformed request fails cheaply, and
     handed to both the gates and `activate` itself. Two reads here would be the
     worst version of this bug available: the checklist in the success body would
     describe the plan as it was, and the deployment beside it would freeze the
     plan as it is. */
  const plan = await session.currentPlan();
  const result = await activate(plan, gateInputs(session, plan), { activatedBy });

  if (!result.activated) {
    return NextResponse.json(
      {
        mode: session.mode,
        activated: false,
        outcome: result.outcome,
        checklist: result.checklist,
        blockers: result.blockers,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    mode: session.mode,
    activated: true,
    // "activated" | "superseded" | "unchanged" — a re-activation of the live
    // version writes nothing and says so, rather than reporting a second go-live.
    outcome: result.outcome,
    checklist: result.checklist,
    deployment: result.deployment,
    supersedes: result.supersedes,
    agents: result.agents,
    // Null on "unchanged". Callers MUST render `registration.rejected`: those are
    // enabled workflows that got no trigger, and a workflow the owner believes is
    // live which nothing will ever start is the worst outcome available.
    registration: result.registration,
  });
}
