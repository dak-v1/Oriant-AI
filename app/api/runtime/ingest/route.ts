/**
 * app/api/runtime/ingest/route.ts — Role B's handoff enters Role C here.
 *
 *   POST { payload }   ingest a handoff and report what it produced
 *   POST { fixture }   ingest the stored Role B fixture, for a dry run
 *   GET                what the last ingest produced, without re-running it
 *
 * REPORTING, NOT ACTIVATING. This route converts and inspects; it never builds
 * or activates. Role B's own handoff note says the discovery interview's
 * approval boundaries are not wired into the payload, so every ingested agent
 * arrives as `draft_only` and a human should see the gap report before any of
 * it is put in front of a customer. A route that ingested and activated in one
 * call would make that report something nobody had to read.
 *
 * A payload with blocking gaps is answered 422, not 400: the request was
 * well-formed and the CONTENT is not yet buildable, which is a different
 * conversation with whoever sent it.
 */
import { NextResponse } from "next/server";
import { ingestHandoff } from "@/lib/plan/ingest/from-handoff";
import type { WorkforceHandoffPayload } from "@/lib/plan/ingest/types";
import { ROLE_B_HANDOFF } from "@/lib/plan/fixtures/role-b-handoff";
import { validateApprovedPlan } from "@/lib/plan/validate";

export const dynamic = "force-dynamic";

interface IngestGlobal {
  __oriantLastIngest?: {
    at: string;
    planId: string;
    runnable: boolean;
    gaps: unknown[];
    summary: unknown[];
  };
}

/** Cheap shape check before the adapter touches it, so a wrong body reads as a
    wrong body rather than as a stack trace from deep inside the mapping. */
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
  const g = globalThis as unknown as IngestGlobal;
  return NextResponse.json({
    last: g.__oriantLastIngest ?? null,
    hint: g.__oriantLastIngest
      ? undefined
      : 'Nothing ingested yet. POST {"fixture":true} to dry-run against the stored Role B payload.',
  });
}

export async function POST(request: Request) {
  let body: { payload?: unknown; fixture?: boolean };
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
        error:
          'Body is not a WorkforceHandoffPayload. Expected handoff_type "workforce_plan" with workforce_plan, agents[] and integrations[].',
        hint: 'Fetch it from Role B: GET /api/planner/:workforcePlanId/handoff, then POST its .payload here. Or POST {"fixture":true} for a dry run.',
      },
      { status: 400 },
    );
  }

  const result = ingestHandoff(source);
  const findings = validateApprovedPlan(result.plan);
  const errors = findings.filter((f) => f.severity === "error");

  const g = globalThis as unknown as IngestGlobal;
  g.__oriantLastIngest = {
    at: new Date().toISOString(),
    planId: result.plan.planId,
    runnable: result.runnable,
    gaps: result.gaps,
    summary: result.summary,
  };

  const payload = {
    runnable: result.runnable && errors.length === 0,
    plan: {
      planId: result.plan.planId,
      version: result.plan.version,
      agents: result.plan.agents.length,
      outcomes: result.plan.businessOutcomes.length,
    },
    summary: result.summary,
    gaps: result.gaps,
    validation: {
      errors: errors.length,
      warnings: findings.length - errors.length,
      findings,
    },
    // Said plainly, because it is the single most consequential consequence of
    // what Role B does not yet send.
    notice:
      "Every ingested agent is draft_only: it prepares work and stops for the owner. The handoff carries no approval boundaries, so this is the only posture that is safe without guessing.",
  };

  return NextResponse.json(payload, {
    status: payload.runnable ? 200 : 422,
  });
}
