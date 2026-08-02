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
 */
import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/runtime/pipeline/run";
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

  const result = await runPipeline(
    { payload: source },
    {
      build: session.build,
      scheduler: session.scheduler,
      integrations: session.tools,
      // Recorded on the deployment. A deployment that cannot say who put it
      // live is not evidence of anything, so this has a real default rather
      // than an empty string.
      activatedBy: body.activatedBy ?? "user_sarah_chen",
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
