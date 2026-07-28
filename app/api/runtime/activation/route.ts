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
 * THE CHECKLIST IS RE-DERIVED ON EVERY REQUEST, THE SANDBOX VERDICT INCLUDED, so
 * this handler is deliberately slow: it runs the whole scenario library and the
 * stress sweep before it can answer. That is the price of the rule
 * lib/runtime/schedule/activation.ts is built around — a cached "ready" is the
 * one failure mode that ships a workforce on evidence gathered before the plan
 * changed. Nothing here memoises, and nothing here should learn to.
 *
 * Unauthenticated on purpose for now, exactly as /api/runtime/build is: this
 * branch is Role C's development surface and the runtime is fixture-backed. It
 * must be gated before any deployment, along with every other /api route — and
 * of all of them this is the one that most needs it, because POST here is the
 * call that puts a workforce live. No auth scheme is invented here; that decision
 * belongs with whoever owns the deployment.
 */
import { NextResponse } from "next/server";
import { runSuite } from "@/lib/runtime/sandbox/runner";
import { BRIGHTPATH_SCENARIOS } from "@/lib/runtime/sandbox/scenarios";
import { runStressSweep } from "@/lib/runtime/sandbox/stress";
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
 */
class SessionSandboxEvidence implements SandboxEvidence {
  private readonly session: RuntimeSession;

  constructor(session: RuntimeSession) {
    this.session = session;
  }

  async latestVerdict(): Promise<SandboxVerdict> {
    const packages = this.session.build;
    const stress = await runStressSweep(this.session.plan, { packages });
    return runSuite(BRIGHTPATH_SCENARIOS, this.session.plan, { packages, stress });
  }
}

/**
 * The three gates' inputs, assembled per request.
 *
 * Cheap on its own — the expense is inside the evidence, and only when a gate
 * actually reads it.
 */
function gateInputs(session: RuntimeSession): ActivationDeps {
  return {
    scheduler: session.scheduler,
    packages: session.build,
    integrations: session.tools,
    sandbox: new SessionSandboxEvidence(session),
  };
}

/* ═══════════════════════════ The checklist ═══════════════════════════ */

export async function GET() {
  const session = getRuntimeSession();
  const checklist = await activationChecklist(session.plan, gateInputs(session));

  return NextResponse.json({
    mode: session.mode,
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

  const result = await activate(session.plan, gateInputs(session), { activatedBy });

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
