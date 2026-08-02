/**
 * lib/runtime/pipeline/attribution.ts — what a deployment record is entitled to
 * say about who put a workforce live.
 *
 * `Deployment.activatedBy` is an audit field. lib/runtime/schedule/activation.ts
 * throws on a blank one, in as many words: "a deployment record that cannot say
 * who put this workforce live is not evidence of anything". Three screens render
 * it verbatim — the live agent roster, the integrations screen, the activation
 * gates panel — and each of them reads as a statement of fact.
 *
 * ON TWO ROUTES IT WAS NOT ONE. `POST /api/runtime/pipeline` and
 * `POST /api/runtime/collect` are unauthenticated (ROLE_C_PLAN M7) and both did
 * `body.activatedBy ?? "user_sarah_chen"`. So an anonymous request could name
 * anybody as the person who took a workforce live — and when it named nobody,
 * the record named Sarah Chen anyway, who is a REAL entry in lib/plan/users.ts
 * and, on a live deployment, a real person who did not do it. That default was
 * written to avoid an empty string. It bought a false one instead, which is
 * worse: an empty field reads as missing, and a name reads as known.
 *
 * WHAT THIS DOES, AND ALL IT DOES. It marks the value for what it is. The
 * recorded actor becomes `unverified:<whatever the caller claimed>`, or
 * `unverified:anonymous` when the caller claimed nothing. The record stops
 * asserting an identity this server never established, and it still answers the
 * question the audit field exists for — what the request said, and that nothing
 * checked it. IT GRANTS AND REFUSES NOTHING; the gate in
 * lib/runtime/pipeline/organization-gate.ts is what decides whether a request
 * may act at all, and this prefix has no part in that decision.
 *
 * REJECTED: a second field on `Deployment` — `activatedByVerified: boolean` —
 * which is the shape a real auth system will want. It is one bit that ripples
 * through the scheduler store, the Postgres row, two API shapes and three
 * screens, and every deployment already recorded would need back-filling with a
 * default that is itself a claim. The prefix travels with the value into every
 * place it is already rendered, and the day these routes carry a session the
 * marker comes off at one call site.
 *
 * REJECTED: refusing a request that names no actor, the way
 * `POST /api/runtime/activation` does. That route is driven by a person clicking
 * go-live, so demanding a field costs nothing; these two are the automated lane
 * — a poller sending `{}` is the normal case collect exists for — and a 400
 * there would close the seam to buy a string the server still cannot verify.
 *
 * NOT APPLIED TO `POST /api/runtime/activation`, which carries the same property
 * — unauthenticated, actor straight off the body — and is left exactly as it is
 * by this change. It is named here rather than quietly skipped: its actor is
 * equally unverified, and marking it belongs with whatever change next touches
 * that route rather than smuggled in beside a fix to a different door.
 */

/** The one marker, named so a grep for it finds every place it is applied or
    stripped rather than a bare string literal in four files. */
export const UNVERIFIED_ACTOR_PREFIX = "unverified:";

/**
 * What the record says when the request said nothing.
 *
 * "anonymous" and not a user id: there is no person to name, and the point of
 * this module is that the field stops naming one when nobody is known.
 */
export const UNATTRIBUTED_ACTOR = `${UNVERIFIED_ACTOR_PREFIX}anonymous`;

/**
 * The actor to record for a caller-asserted `activatedBy`.
 *
 * `unknown` rather than `string | undefined` because the body is `JSON.parse`
 * output on both routes: a caller can send `activatedBy: 42`, or an object, and
 * a cast that took it at its word would put a number where an audit record
 * promises a user id.
 *
 * Idempotent on an already-marked value, so a caller echoing back something they
 * read off a previous deployment is recorded once rather than as
 * `unverified:unverified:…`.
 */
export function assertedActor(claimed: unknown): string {
  const trimmed = typeof claimed === "string" ? claimed.trim() : "";
  if (trimmed === "") return UNATTRIBUTED_ACTOR;
  if (trimmed.startsWith(UNVERIFIED_ACTOR_PREFIX)) return trimmed;
  return `${UNVERIFIED_ACTOR_PREFIX}${trimmed}`;
}
