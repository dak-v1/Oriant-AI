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
 * BOTH ARMS ARE GATED NOW, AND THE ARGUMENT FOR EXEMPTING ONE OF THEM IS WORTH
 * KEEPING AS A WARNING. The Supabase arm's payload comes out of
 * `role_c_handoffs` through the service-role key, where the organization was
 * written by Role B's own finalize step — so, it was reasoned, there is no
 * caller-supplied id in it to distrust and ORIANT_ALLOWED_ORGANIZATION_IDS does
 * not apply. The premise is true. The conclusion does not follow, because the
 * writer that fills that table is `POST /api/planner/:workforcePlanId/
 * finalize-handoff`, which has NO AUTH CHECK OF ANY KIND, and
 * `GET /api/planner/context` — also unauthenticated — hands out the plan and
 * organization ids to call it with. So an anonymous caller finalises a 'ready'
 * row for any already-approved plan whose tools are connected, POSTs `{}` here,
 * and the pass runs with LIVE Composio clients. The id's provenance was never
 * the question; authority to trigger an activation is, and the allowlist is the
 * only thing on this deployment that answers it. See
 * lib/runtime/pipeline/organization-gate.ts.
 *
 * THE CHECK GOES BEFORE THE CLAIM, WHICH IS WHY IT IS NOT WRITTEN INLINE HERE.
 * `lib/runtime/pipeline/gated-claim.ts` resolves the target through
 * `source.pending()` — the accessor that returns a handoff's organization while
 * claiming nothing — gates it, and only then claims. A refused handoff is left
 * 'ready' and collects unchanged the day an operator permits its organization.
 * Refusing after the claim would leave the row 'consumed' with nothing deployed,
 * which is the wedge lib/runtime/pipeline/source.ts was rewritten to remove.
 *
 * BOTH OF THOSE 403s ARE THE EARLY, EXPLAINING REFUSAL. The allowlist is enforced
 * where a live Composio client is handed out (`liveIntegrationProviderFor` in
 * lib/runtime/tools/organization.ts), which is what every path into live
 * execution goes through — this route among them, at the activate stage, through
 * `session.toolsFor`. Answering here first is what buys the untouched row: a pass
 * that only refused at its first `act` step would have claimed the handoff,
 * ingested it and written it in as the current plan on the way, and the caller
 * would get a failed run instead of a sentence naming the variable. The gate
 * explains; the provider is the one that cannot be routed around.
 *
 * NEITHER GET IS GATED, on either arm. They claim nothing and run nothing, so
 * there is no organization to act as; the gate is about what a request would DO
 * with somebody's connected accounts, and a listing does nothing with anybody's.
 *
 * Unauthenticated, like every other /api/runtime/* route (ROLE_C_PLAN M7). This
 * one is a write path into a live workforce and must be gated before deployment.
 */
import { NextResponse } from "next/server";
import { ROLE_B_HANDOFF_RESOLVED } from "@/lib/plan/fixtures/role-b-handoff";
import { assertedActor } from "@/lib/runtime/pipeline/attribution";
import { claimIfPermitted } from "@/lib/runtime/pipeline/gated-claim";
import { runPipeline } from "@/lib/runtime/pipeline/run";
import type { PipelineResult } from "@/lib/runtime/pipeline/types";
import {
  HandoffPayloadError,
  StaticHandoffSource,
  SupabaseHandoffSource,
  type CollectedHandoff,
  type HandoffSource,
} from "@/lib/runtime/pipeline/source";
import { getRuntimeSession, type RuntimeSession } from "@/lib/runtime/session";
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
 *
 * The session is PASSED IN rather than fetched here, so both handlers read it
 * exactly once and the gate below judges the same object this source was built
 * from. It is memoised on `globalThis`, so this changes no behaviour; it changes
 * how obvious it is that `toolsLive` and the clock came from one place.
 */
function sourceFor(fixture: boolean, session: RuntimeSession): HandoffSource {
  if (fixture) return new StaticHandoffSource([fixtureHandoff()]);
  if (!supabaseLive()) throw new SupabaseConfigurationError();
  // The scheduler's clock, because lib/runtime never reads a wall clock itself.
  return new SupabaseHandoffSource({ clock: session.scheduler.clock });
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
    const source = sourceFor(fixture, getRuntimeSession());
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

  // An empty or blank `handoffId` means "the oldest", which is what `!targetId`
  // used to say. Written out because the two are now different code paths —
  // `""` reaching the claim as an explicit target would answer 409 to a request
  // that meant "give me whatever is next".
  const requested = typeof body.handoffId === "string" ? body.handoffId.trim() : "";
  const handoffId = requested === "" ? undefined : requested;

  /*
   * ONE SESSION READ FOR THE WHOLE HANDLER, and earlier than it used to be.
   * It is memoised on `globalThis`, so the object is the same one either way;
   * what moves is WHEN a live-tools deployment missing COMPOSIO_API_KEY throws —
   * now before anything is claimed rather than after, which is the better of the
   * two orders. `session.toolsLive` is what the gate below reads, and NOT
   * `session.mode`: a session can report "fixture" while holding live Composio
   * clients, which is the one deployment that can reach a customer.
   */
  let session: RuntimeSession;
  let source: HandoffSource;
  try {
    session = getRuntimeSession();
    source = sourceFor(fixture, session);
  } catch (err) {
    return errorResponse(err);
  }

  let handoff: CollectedHandoff;
  try {
    /*
     * RESOLVE, GATE, THEN CLAIM — in `lib/runtime/pipeline/gated-claim.ts`, and
     * in that order for the reason its header gives at length: a refused handoff
     * has to be left exactly as it was found, 'ready' and collectable, because
     * `workforce_plan_id` is UNIQUE and a row wrongly marked 'consumed' has no
     * successor to collect instead.
     *
     * BOTH ARMS GO THROUGH IT. The fixture arm's payload names a real
     * organization uuid out of Role B's seed data — not the
     * `org-brightpath-demo-fixture` stand-in `resolveToolsOrganization` treats
     * specially — so with live tools `{"fixture": true}` reaches a real
     * company's connected accounts, and the Supabase arm reaches whichever
     * company an unauthenticated `finalize-handoff` deposited a row for. One
     * call, because the difference between the arms was never a difference in
     * who is allowed to put a workforce live.
     */
    const attempt = await claimIfPermitted(source, handoffId, session.toolsLive);

    if (attempt.outcome === "empty") {
      // Not an error: a poller asking an empty queue is the healthy case.
      // Unreadable rows are named, because "nothing is waiting" would be a
      // lie to an operator whose queue is full of rows nobody can parse.
      const { unreadable } = attempt.scan;
      return NextResponse.json({
        collected: false,
        reason:
          unreadable.length > 0
            ? `Nothing runnable is waiting. ${unreadable.length} waiting row(s) could not be read; Role B must re-finalise them.`
            : "Nothing is waiting for Role C.",
        unreadable,
      });
    }

    if (attempt.outcome === "refused") {
      // 403, and the row is untouched — still 'ready', still first in the queue.
      // A descriptor turned into a response here; the gate lives under
      // lib/runtime, which imports nothing from Next.
      return NextResponse.json(attempt.refusal.body, { status: attempt.refusal.status });
    }

    if (attempt.outcome === "unclaimable") {
      // The conditional UPDATE matched no row. Another collector won it, or it
      // is no longer 'ready'. 409 rather than 404: the request was reasonable
      // and the row's state moved underneath it.
      return NextResponse.json(
        {
          collected: false,
          handoffId: attempt.handoffId,
          error:
            "This handoff is not collectable: it was already claimed, consumed or failed. Another collector may hold it.",
        },
        { status: 409 },
      );
    }

    handoff = attempt.handoff;
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

  let result: PipelineResult;
  try {
    result = await runPipeline(
      { payload: handoff.payload },
      {
        build: session.build,
        scheduler: session.scheduler,
        // NOT `session.tools`. The row this route just claimed carries
        // `organizationId` — it is in the response body a dozen lines below — and
        // the plan ingest builds from it carries the same id. A fixed provider
        // here judged every collected workforce against the BrightPath fixture's
        // connections, which is the one organization guaranteed to have none.
        // The pipeline resolves it once ingest has run; see
        // `PipelineDeps.integrationsFor`.
        integrationsFor: (organizationId) => session.toolsFor(organizationId),
        // Recorded on the deployment, MARKED FOR WHAT IT IS. This route is
        // unauthenticated, so `body.activatedBy` is a claim and nothing more;
        // the old `?? "user_sarah_chen"` put a real person from
        // lib/plan/users.ts on the record of an anonymous activation. See
        // lib/runtime/pipeline/attribution.ts — it grants nothing and refuses
        // nothing, it only stops the audit field saying more than it knows.
        activatedBy: assertedActor(body.activatedBy),
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
