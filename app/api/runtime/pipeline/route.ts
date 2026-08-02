/**
 * app/api/runtime/pipeline/route.ts — the whole chain, in one call.
 *
 *   POST { payload }            run a handoff end to end
 *   POST { fixture: true }      run the stored Role B handoff, for a dry run
 *   GET                         what the last pass produced
 *
 * Six stages: collect, ingest, validate, build, prove, activate. The response
 * always carries all six — a stage the pass never reached is reported as
 * `skipped` rather than omitted, so a UI renders the same six rows whatever
 * happened.
 *
 * THERE IS NO FORCE FLAG, and there will not be one. The gates are the product:
 * an activation without a sandbox verdict is exactly what every check in this
 * repository exists to prevent, and an override here would make all of them
 * optional. A blocked pass is answered 422 — the request was fine, the CONTENT
 * is not yet live-able, and the stage detail says who fixes what.
 *
 * ONE MORE REFUSAL APPLIES HERE, AND IT IS ABOUT WHO ASKED RATHER THAN ABOUT
 * WHAT THEY ASKED FOR. When tools are live, the organization the payload names
 * must appear in ORIANT_ALLOWED_ORGANIZATION_IDS or the request is answered 403
 * before anything is ingested. It USED TO LIVE IN THIS FILE and now lives in
 * lib/runtime/pipeline/organization-gate.ts, because POST /api/runtime/collect
 * ran the same class of payload through the same pass — first on its fixture arm
 * with no check at all, then on its Supabase arm behind an exemption that an
 * unauthenticated `finalize-handoff` made worthless. That module's header says
 * why the hole exists and why no door is exempt from it.
 *
 * THE 403 BELOW IS THE EARLY, EXPLAINING REFUSAL — NOT THE ENFORCEMENT. The rule
 * itself is applied where a live Composio client is handed out
 * (`liveIntegrationProviderFor` in lib/runtime/tools/organization.ts), which is
 * the one place every path into live execution goes through, including the five
 * this gate never saw: /api/runtime/activation, /run, /approvals, /scheduler and
 * the background poller. Keeping the check here is still worth its line: an
 * unpermitted pass that got past this point would ingest, write itself in as the
 * current plan, build, prove and only then refuse at its first `act` step — a
 * worse answer, arrived at expensively, with half the state already written. This
 * one costs nothing and says which id was refused and what to add.
 *
 * `activatedBy` IS A CLAIM, NOT AN IDENTITY. Nothing here authenticates the
 * caller, so what lands on the deployment record is marked as caller-asserted —
 * see lib/runtime/pipeline/attribution.ts.
 */
import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/runtime/pipeline/run";
import { assertedActor } from "@/lib/runtime/pipeline/attribution";
import { organizationGate } from "@/lib/runtime/pipeline/organization-gate";
import type { WorkforceHandoffPayload } from "@/lib/plan/ingest/types";
import { ROLE_B_HANDOFF } from "@/lib/plan/fixtures/role-b-handoff";
import { getRuntimeSession } from "@/lib/runtime/session";

export const dynamic = "force-dynamic";

interface PipelineGlobal {
  __oriantLastPipeline?: unknown;
}

function looksLikeHandoff(value: unknown): value is WorkforceHandoffPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.handoff_type === "workforce_plan" &&
    typeof v.workforce_plan === "object" &&
    Array.isArray(v.agents) &&
    Array.isArray(v.integrations)
  );
}

export async function GET() {
  const g = globalThis as unknown as PipelineGlobal;
  return NextResponse.json({
    last: g.__oriantLastPipeline ?? null,
    hint: g.__oriantLastPipeline
      ? undefined
      : 'No pass yet. POST {"fixture":true} to run the stored Role B handoff.',
  });
}

export async function POST(request: Request) {
  const session = getRuntimeSession();

  let body: { payload?: unknown; fixture?: boolean; activatedBy?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: 'A JSON body is required: {"payload": <handoff>} or {"fixture": true}.' },
      { status: 400 },
    );
  }

  const source: unknown = body.fixture === true ? ROLE_B_HANDOFF : body.payload;
  if (!looksLikeHandoff(source)) {
    return NextResponse.json(
      {
        error: "Body is not a WorkforceHandoffPayload.",
        hint: "GET /api/planner/:workforcePlanId/handoff from Role B, then POST its .payload here.",
      },
      { status: 400 },
    );
  }

  // BEFORE `runPipeline`, NOT INSIDE IT. The pass has a side effect a refusal
  // must not leave behind: a valid plan is written as the CURRENT plan between
  // validate and build, so a gate that ran later would have already put a
  // stranger's workforce in front of the owner as what they intend.
  //
  // THE FIXTURE ARM IS CHECKED TOO, and that is not an oversight. `{fixture:
  // true}` looks like caller-supplied nothing, but ROLE_B_HANDOFF names
  // organization 1647df28-… — a real uuid out of Role B's seed data, not the
  // `org-brightpath-demo-fixture` stand-in that resolveToolsOrganization treats
  // specially. Selecting it with live tools on still selects a real company's
  // connections, so it goes through the same door. The collect route's own
  // fixture arm runs the same stored handoff and now goes through it too.
  //
  // A DESCRIPTOR, TURNED INTO A RESPONSE HERE. The gate lives under lib/runtime,
  // which imports nothing from Next; see its header for why that is worth the
  // one extra line at each call site.
  //
  // AND IT IS THE EARLY ANSWER, NOT THE ONLY ONE. `session.toolsFor` refuses the
  // same organization again at the activate stage below — see the header. If this
  // line were ever deleted the pass would not become permitted, it would become
  // expensive and confusing: half-written state and a refusal at the first `act`.
  const refusal = organizationGate(source, session.toolsLive);
  if (refusal) return NextResponse.json(refusal.body, { status: refusal.status });

  const result = await runPipeline(
    { payload: source },
    {
      build: session.build,
      scheduler: session.scheduler,
      // NOT `session.tools`, which is the BrightPath fixture's organization. The
      // payload in this request body belongs to a business that names itself, and
      // the pipeline resolves the provider once ingest has read that name — see
      // `PipelineDeps.integrationsFor`. Handing a fixed provider here asked the
      // demo organization whether the CALLER's tools were connected.
      integrationsFor: (organizationId) => session.toolsFor(organizationId),
      // Recorded on the deployment, MARKED FOR WHAT IT IS. This route is
      // unauthenticated, so `body.activatedBy` is a claim and nothing more; the
      // old `?? "user_sarah_chen"` avoided an empty string by writing a real
      // person out of lib/plan/users.ts onto the record of an activation nobody
      // authenticated. See lib/runtime/pipeline/attribution.ts.
      activatedBy: assertedActor(body.activatedBy),
    },
  );

  const summary = {
    completed: result.completed,
    stoppedAt: result.stoppedAt,
    stages: result.stages,
    live: result.live,
    plan: result.plan
      ? {
          planId: result.plan.planId,
          version: result.plan.version,
          agents: result.plan.agents.map((a) => ({
            id: a.id,
            name: a.name,
            operatingMode: a.policy.operatingMode,
          })),
        }
      : null,
    gaps: result.gaps,
    // Repeated at the top level because it is the one thing a person watching a
    // successful activation still needs to know.
    notice: result.completed
      ? "Live, and every agent is draft_only: it prepares work and stops for the owner. Role B's handoff carries no approval boundaries."
      : undefined,
  };

  const g = globalThis as unknown as PipelineGlobal;
  g.__oriantLastPipeline = { at: new Date().toISOString(), ...summary };

  return NextResponse.json(summary, { status: result.completed ? 200 : 422 });
}
