/**
 * app/api/runtime/collect/route.ts — Role C picks up its own post.
 *
 *   GET                       what is waiting in role_c_handoffs. Claims nothing
 *   GET  ?fixture=1           the same, against the stored Role B payload
 *   POST {}                   claim the oldest waiting handoff and run it
 *   POST { handoffId }        claim that one specifically
 *   POST { fixture: true }    a dry run against the stored Role B payload
 *
 * THE GAP THIS CLOSES. Role B finalises a plan into `role_c_handoffs` and stops.
 * `POST /api/runtime/pipeline` runs a handoff end to end but has to be HANDED
 * one, so the two lanes were joined by a person copying a jsonb column out of
 * Supabase and pasting it into a request body. This route is the seam: collect,
 * claim, run, settle.
 *
 * WHAT A POST DOES TO THE ROW, and why the two failure directions differ:
 *
 *   completed pass   → 'consumed'. Done, forever. The workforce is live.
 *   blocked pass     → 'failed'. A GATE SHUT ON PURPOSE — a stale plan version,
 *                      a disconnected tool, a workforce no sandbox has proved.
 *   thrown pass      → 'failed'. Something broke and an engineer has to look.
 *
 * A BLOCKED PASS MUST NOT CONSUME THE HANDOFF. Blocked is the product working:
 * `runPipeline` refused to put a workforce live and said which gate and why.
 * Somebody fixes the cause — reconnects the tool, re-approves the plan — and the
 * SAME handoff has to be collectable again. Marking it 'consumed' would record
 * that this plan had been dealt with when nothing was ever activated, and the
 * unique `workforce_plan_id` means there is no second row to collect instead.
 * 'failed' is the honest terminal state: it releases the claim, and Role B's
 * next `finalize-handoff` resets the row to 'ready' with the corrected payload.
 *
 * There is no force flag here either, for the reason `pipeline/run.ts` gives at
 * length: the gates are the product.
 *
 * Unauthenticated, like every other /api/runtime/* route (ROLE_C_PLAN M7). This
 * one is a write path into a live workforce and must be gated before deployment.
 */
import { NextResponse } from "next/server";
import { ROLE_B_HANDOFF_RESOLVED } from "@/lib/plan/fixtures/role-b-handoff";
import { runPipeline } from "@/lib/runtime/pipeline/run";
import type { PipelineResult } from "@/lib/runtime/pipeline/types";
import {
  HandoffPayloadError,
  StaticHandoffSource,
  SupabaseHandoffSource,
  type CollectedHandoff,
  type HandoffSource,
} from "@/lib/runtime/pipeline/source";
import { getRuntimeSession } from "@/lib/runtime/session";
import { SupabaseConfigurationError, supabaseLive } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/**
 * The stored Role B payload as if it were a row.
 *
 * `_RESOLVED` rather than the verbatim `ROLE_B_HANDOFF`: the verbatim one is
 * deliberately stale (plan v1 against current v2, an approval owner nobody can
 * resolve) and blocks at ingest, which proves the gates but never reaches the
 * settle step this route exists to demonstrate.
 *
 * Rebuilt on every request, so the fixture arm never runs out of work. The
 * claim it performs is real but process-local; only the Supabase source settles
 * anything durable.
 */
function fixtureHandoff(): CollectedHandoff {
  const plan = ROLE_B_HANDOFF_RESOLVED.workforce_plan;
  return {
    id: `fixture:${plan.id}`,
    workforcePlanId: plan.id,
    organizationId: ROLE_B_HANDOFF_RESOLVED.organization.id,
    idempotencyKey: `workforce:${plan.id}:v${plan.current_version}`,
    payload: ROLE_B_HANDOFF_RESOLVED,
    status: "ready",
    createdAt: ROLE_B_HANDOFF_RESOLVED.generated_at,
  };
}

/**
 * Throws `SupabaseConfigurationError` rather than returning null so the one
 * handler below turns every "not configured" into the same 503 — a collector
 * pointed at nothing must say so, not report an empty queue.
 */
function sourceFor(fixture: boolean): HandoffSource {
  if (fixture) return new StaticHandoffSource([fixtureHandoff()]);
  if (!supabaseLive()) throw new SupabaseConfigurationError();
  // The scheduler's clock, because lib/runtime never reads a wall clock itself.
  return new SupabaseHandoffSource({ clock: getRuntimeSession().scheduler.clock });
}

function errorResponse(err: unknown): NextResponse {
  if (err instanceof SupabaseConfigurationError) {
    return NextResponse.json(
      {
        error: err.message,
        code: err.code,
        hint: 'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or use {"fixture": true} for a dry run.',
      },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { error: err instanceof Error ? err.message : String(err) },
    { status: 500 },
  );
}

/** The listing: enough to choose one, never the payload itself. */
function summarise(handoff: CollectedHandoff) {
  return {
    id: handoff.id,
    workforcePlanId: handoff.workforcePlanId,
    organizationId: handoff.organizationId,
    idempotencyKey: handoff.idempotencyKey,
    createdAt: handoff.createdAt,
    agents: handoff.payload.agents.length,
  };
}

/** Why a pass stopped, in one line, for the row that is about to be marked failed. */
function stopReason(result: PipelineResult): string {
  const stopped = result.stages.find((s) => s.stage === result.stoppedAt);
  const where = result.stoppedAt ?? "unknown";
  if (!stopped) return `The pipeline stopped at ${where}.`;
  const detail = stopped.detail.length > 0 ? ` ${stopped.detail.join(" | ")}` : "";
  return `${stopped.status} at ${where}: ${stopped.summary}${detail}`;
}

export async function GET(request: Request) {
  const fixture = new URL(request.url).searchParams.get("fixture") === "1";

  try {
    const source = sourceFor(fixture);
    const { collectable, unreadable } = await source.pending();
    return NextResponse.json({
      source: fixture ? "fixture" : "supabase",
      count: collectable.length,
      pending: collectable.map(summarise),
      // Waiting rows that cannot be run. Surfaced rather than hidden or
      // retired: Role B deposited these believing they landed, and this is the
      // only place anyone finds out they did not. Reporting them changes
      // nothing — a collect attempt is what retires one.
      unreadable,
      hint:
        collectable.length === 0
          ? unreadable.length > 0
            ? "Nothing runnable is waiting, but some rows could not be read — see `unreadable`. Role B needs to re-finalise those."
            : "Nothing is waiting. Role B creates one with POST /api/planner/:workforcePlanId/finalize-handoff."
          : "POST {} to collect the oldest, or POST {\"handoffId\": \"…\"} to pick one.",
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  let body: { handoffId?: string; fixture?: boolean; activatedBy?: string } = {};
  try {
    // An empty body is the normal case for a poller, so it is not an error.
    const raw = await request.text();
    if (raw.trim() !== "") body = JSON.parse(raw) as typeof body;
  } catch {
    return NextResponse.json(
      { error: 'Body must be JSON: {}, {"handoffId": "…"} or {"fixture": true}.' },
      { status: 400 },
    );
  }

  const fixture = body.fixture === true;
  let source: HandoffSource;
  try {
    source = sourceFor(fixture);
  } catch (err) {
    return errorResponse(err);
  }

  let handoff: CollectedHandoff;
  try {
    let targetId = body.handoffId;
    if (!targetId) {
      const { collectable, unreadable } = await source.pending();
      const oldest = collectable[0];
      if (!oldest) {
        // Not an error: a poller asking an empty queue is the healthy case.
        // Unreadable rows are named, because "nothing is waiting" would be a
        // lie to an operator whose queue is full of rows nobody can parse.
        return NextResponse.json({
          collected: false,
          reason:
            unreadable.length > 0
              ? `Nothing runnable is waiting. ${unreadable.length} waiting row(s) could not be read; Role B must re-finalise them.`
              : "Nothing is waiting for Role C.",
          unreadable,
        });
      }
      targetId = oldest.id;
    }

    const claimed = await source.claim(targetId);
    if (!claimed) {
      // The conditional UPDATE matched no row. Another collector won it, or it
      // is no longer 'ready'. 409 rather than 404: the request was reasonable
      // and the row's state moved underneath it.
      return NextResponse.json(
        {
          collected: false,
          handoffId: targetId,
          error:
            "This handoff is not collectable: it was already claimed, consumed or failed. Another collector may hold it.",
        },
        { status: 409 },
      );
    }
    handoff = claimed;
  } catch (err) {
    if (err instanceof HandoffPayloadError) {
      // Claimed, unreadable, and already marked 'failed' by the source. 422:
      // the request was fine and the stored content is not runnable.
      return NextResponse.json(
        { collected: true, handoffId: err.handoffId, handoffStatus: "failed", error: err.message },
        { status: 422 },
      );
    }
    return errorResponse(err);
  }

  const session = getRuntimeSession();

  let result: PipelineResult;
  try {
    result = await runPipeline(
      { payload: handoff.payload },
      {
        build: session.build,
        scheduler: session.scheduler,
        integrations: session.tools,
        // Recorded on the deployment. A deployment that cannot say who put it
        // live is not evidence of anything, so this has a real default.
        activatedBy: body.activatedBy ?? "user_sarah_chen",
      },
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await source.markFailed(handoff.id, `The pipeline threw: ${reason}`);
    return NextResponse.json(
      {
        collected: true,
        handoffId: handoff.id,
        workforcePlanId: handoff.workforcePlanId,
        handoffStatus: "failed",
        error: `The pipeline threw: ${reason}`,
      },
      { status: 500 },
    );
  }

  // The one decision this route exists to get right. See the header: only a
  // completed pass consumes the handoff. A blocked one is a gate doing its job,
  // and the row has to be collectable again once the cause is fixed.
  //
  // GUARDED, because by this line the pipeline has already run. On a completed
  // pass the triggers are registered and the deployment is live, and letting a
  // failed bookkeeping write throw out of the handler would answer a bare 500
  // to a caller whose workforce is now running — the worst of both stories. The
  // settle outcome is reported as a field instead, so the response always tells
  // the truth about what went live.
  let settleError: string | null = null;
  try {
    if (result.completed) {
      await source.markConsumed(handoff.id);
    } else {
      await source.markFailed(handoff.id, stopReason(result));
    }
  } catch (err) {
    settleError = err instanceof Error ? err.message : String(err);
    console.error(`[role-c/collect] settling handoff ${handoff.id} failed: ${settleError}`);
  }

  const settled = settleError === null;
  return NextResponse.json(
    {
      collected: true,
      source: fixture ? "fixture" : "supabase",
      handoffId: handoff.id,
      workforcePlanId: handoff.workforcePlanId,
      organizationId: handoff.organizationId,
      idempotencyKey: handoff.idempotencyKey,
      // The row was claimed as 'consumed'; if the settle did not land that is
      // still its state, which is safe (nothing re-collects it) but stale.
      handoffStatus: settled ? (result.completed ? "consumed" : "failed") : "consumed",
      settled,
      ...(settleError ? { settleError } : {}),
      pipeline: result,
      notice: result.completed
        ? settled
          ? "Live, and every agent is draft_only: it prepares work and stops for the owner. Role B's handoff carries no approval boundaries."
          : "Live, and every agent is draft_only. The handoff row could not be updated afterwards — the deployment is real, the row is stale."
        : settled
          ? `${stopReason(result)} The handoff is marked failed; Role B's next finalize-handoff makes it collectable again.`
          : `${stopReason(result)} Nothing was deployed, and the handoff row could not be marked failed — Role B's next finalize-handoff still releases it.`,
    },
    { status: result.completed ? 200 : 422 },
  );
}
