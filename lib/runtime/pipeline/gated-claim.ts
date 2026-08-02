/**
 * lib/runtime/pipeline/gated-claim.ts — the one safe order for taking a stored
 * handoff: resolve, gate, and only then claim.
 *
 * WHY THIS IS A MODULE AND NOT FIFTEEN LINES IN THE ROUTE. The rule it encodes
 * is an ORDER, and an order is exactly the kind of thing a later edit rearranges
 * without noticing. `POST /api/runtime/collect` used to read
 * `body.handoffId ?? oldest` and go straight to `source.claim(...)`; adding the
 * organization gate anywhere after that line would have produced the failure
 * lib/runtime/pipeline/source.ts was rewritten to eliminate — a row left
 * 'consumed' with nothing deployed, invisible to every scan, releasable only by
 * a Role B re-finalise. Naming the order gives lib/runtime/verify/collect.ts
 * something to hold onto (COLLECT-12..14): the route's Supabase arm cannot be
 * driven without a database, but this function can, against the in-memory twin.
 *
 * WHAT THE ORDER BUYS. A refused handoff is untouched. It is still 'ready', it
 * is still first in the queue, and the day an operator adds its organization to
 * ORIANT_ALLOWED_ORGANIZATION_IDS the same row runs with the same payload. The
 * alternative — claim, then refuse — records that this plan was dealt with when
 * nothing was ever activated, and `workforce_plan_id` is UNIQUE so there is no
 * second row to collect instead.
 *
 * THE SCAN IS NOT AN OPTIMISATION AND IT IS NOT SKIPPABLE. `source.pending()` is
 * the only accessor that returns a handoff's organization WITHOUT claiming it —
 * `claim()` answers with the row and the exclusive hold in one statement, by
 * design (see source.ts on why the claim is a conditional UPDATE), so there is
 * no version of "look first" that goes through it. That costs one extra SELECT
 * on the `{ handoffId }` path, which previously went straight to the claim. It
 * is the price of knowing whose workforce is about to go live before it does.
 *
 * THE RACE THIS ACCEPTS, NAMED RATHER THAN HIDDEN. Between the scan and the
 * claim, Role B could re-finalise the same row with a different organization,
 * and the claim would then hand back a payload this function gated in its
 * earlier form. The only writer that can do that is
 * `POST /api/planner/:workforcePlanId/finalize-handoff` through the service-role
 * key, the window is two statements wide, and the correction available — re-gate
 * after the claim and mark the row 'failed' when it diverges — would strand a
 * payload Role B had just refreshed behind another finalize. Refusing to claim
 * is cheap; un-claiming is not, which is the whole reason the gate goes first.
 *
 * FRAMEWORK-FREE, like everything else under lib/runtime: the refusal travels
 * back as the gate's `{ status, body }` descriptor and the route turns it into a
 * NextResponse on its own line.
 */

import { handoffOrganizationGate, type OrganizationRefusal } from "./organization-gate";
import type { CollectedHandoff, HandoffSource, PendingScan } from "./source";

/**
 * What happened, in the four ways it can happen.
 *
 * A DISCRIMINATED UNION RATHER THAN `CollectedHandoff | null`, because the four
 * outcomes are four different HTTP answers — 200 "nothing waiting", 403, 409,
 * and the run itself — and a caller handed a null has to reconstruct which one
 * it was by asking the source again. The scan is carried on `empty` for the same
 * reason: the route reports unreadable rows there, and re-scanning to find them
 * would be a second read of a queue that has already been read.
 */
export type GatedClaim =
  /** Claimed and held. The pass may run. */
  | { outcome: "claimed"; handoff: CollectedHandoff }
  /**
   * The gate said no. NOTHING WAS CLAIMED — `handoff` is what the scan saw, and
   * the row is exactly as it was found.
   */
  | { outcome: "refused"; refusal: OrganizationRefusal; handoff: CollectedHandoff }
  /** No id was asked for and nothing runnable is waiting. Carries the scan so
      the caller can name the rows that could not be read. */
  | { outcome: "empty"; scan: PendingScan }
  /** The conditional UPDATE matched no row: already claimed, consumed, failed,
      or gone. A normal outcome of two collectors racing. */
  | { outcome: "unclaimable"; handoffId: string };

/**
 * Take the named handoff, or the oldest waiting one, if this deployment is
 * permitted to act for its organization.
 *
 * `handoffId` undefined means "the oldest", which is what a poller sends.
 *
 * A NAMED ID THAT THE SCAN DID NOT SEE STILL REACHES `claim()`, deliberately.
 * The row may be consumed, failed, absent — all of which the claim answers with
 * null, hence `unclaimable` — or it may be a waiting row whose payload is not a
 * handoff, which `pending()` reports as unreadable rather than collectable. That
 * last one has to keep reaching the claim, because the claim is what retires it:
 * it marks the row 'failed' and throws `HandoffPayloadError`, which is how the
 * caller learns the row is dead instead of being told somebody else won it. None
 * of those cases has an organization to gate — an unreadable payload has no
 * readable owner, and a pass that throws at the claim never reaches ingest.
 */
export async function claimIfPermitted(
  source: HandoffSource,
  handoffId: string | undefined,
  toolsLive: boolean,
): Promise<GatedClaim> {
  const scan = await source.pending();

  const chosen =
    handoffId === undefined
      ? // Oldest first: `pending()` orders by created_at ascending.
        (scan.collectable[0] ?? null)
      : (scan.collectable.find((candidate) => candidate.id === handoffId) ?? null);

  let targetId: string;
  if (handoffId !== undefined) targetId = handoffId;
  else if (chosen !== null) targetId = chosen.id;
  // A poller asking an empty queue is the healthy case, not an error, and it is
  // the one outcome where there is nothing to gate because there is nothing to
  // run.
  else return { outcome: "empty", scan };

  if (chosen !== null) {
    const refusal = handoffOrganizationGate(chosen, toolsLive);
    // BEFORE THE CLAIM. This return is the whole point of the module.
    if (refusal !== null) return { outcome: "refused", refusal, handoff: chosen };
  }

  const claimed = await source.claim(targetId);
  if (claimed === null) return { outcome: "unclaimable", handoffId: targetId };
  return { outcome: "claimed", handoff: claimed };
}
