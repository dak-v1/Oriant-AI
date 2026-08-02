/**
 * lib/runtime/pipeline/organization-gate.ts — WHOSE handoff a request may run.
 *
 * ONE GATE, THREE DOORS, AND EVERY DOOR AFTER THE FIRST IS WHY THIS FILE EXISTS.
 * Every line below was written inside app/api/runtime/pipeline/route.ts, where it
 * refused a payload naming an organization nobody permitted. It moved here the
 * day the second entrance was noticed: `POST /api/runtime/collect
 * {"fixture": true}` builds a handoff out of ROLE_B_HANDOFF_RESOLVED — whose
 * `organization.id` is a real uuid from Role B's seed data, not the
 * `org-brightpath-demo-fixture` stand-in — and hands it to the SAME
 * ingest→build→prove→activate pass with no check at all. With live tools that
 * activated a workforce acting through that organization's connected accounts,
 * past the gate that exists to prevent exactly this, and no database was involved
 * so nothing else stood in the way. The THIRD door — the same route's Supabase
 * arm — was left open deliberately and is covered now; see below for why the
 * reasoning that exempted it was answering the wrong question.
 *
 * SHARED RATHER THAN COPIED, deliberately. Two spellings of one refusal drift,
 * and the half that drifts is the half nobody reads; the bug this closes IS the
 * shape of a rule that lived in one route while a second route ran the same
 * payload. lib/runtime/verify/collect.ts (COLLECT-9) requires all three doors to
 * answer byte for byte, so a re-copy shows up as a red check rather than as a
 * quiet second opinion.
 *
 * THE HOLE THIS CLOSES.
 *
 * Every /api/runtime/* route is unauthenticated (ROLE_C_PLAN M7) and has to be
 * gated before deployment. That was survivable while the organization whose
 * credentials the runtime acted through came from ORIANT_ORGANIZATION_ID: one
 * organization per process, set by an operator, unreachable from a request.
 *
 * It is not survivable now. The pipeline route takes `body.payload` FROM THE
 * REQUEST, `ingestHandoff` copies `payload.organization.id` verbatim into
 * `ApprovedPlan.organizationId`, and that id is what selects whose Composio
 * connected accounts the workforce acts through (lib/runtime/tools/
 * organization.ts). So an anonymous caller who knows — or guesses — an
 * organization id can have this server ingest, activate and run a workforce that
 * sends from that company's Gmail, to that company's customers, under its name.
 * Moving the owner onto the plan was the right change; this is the consequence
 * it opened, and it closes with it.
 *
 * AND IT COVERS EVERY ARM OF THOSE ROUTES, WHICH IS THE SECOND THING THIS FILE
 * GOT WRONG. For one release the SUPABASE arm of POST /api/runtime/collect was
 * left open, on the grounds that its organization id comes out of
 * `role_c_handoffs` — written by Role B's own finalize step rather than typed by
 * whoever sent the request — so there was "no caller-supplied id to distrust".
 * That premise is true, and it is not the question. The writer that fills that
 * table is `POST /api/planner/:workforcePlanId/finalize-handoff`, which has no
 * auth check of any kind, and `GET /api/planner/context` hands out the plan and
 * organization ids to call it with. So an anonymous caller finalises a 'ready'
 * row and then collects it, and the id is theirs after all — supplied one hop
 * earlier. PROVENANCE OF A VALUE IS NOT AUTHORITY TO TRIGGER AN ACTIVATION, and
 * this gate was only ever asking the first question.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THIS FILE IS NO LONGER THE ENFORCEMENT. IT IS THE EARLY, EXPLAINING REFUSAL,
 * AND THE PARAGRAPH THAT USED TO SIT HERE WAS WRONG IN A WAY WORTH RECORDING.
 * It argued that lib/runtime/tools/organization.ts "was the obvious place and is
 * still the wrong one", on the grounds that an allowlist there would not refuse
 * an activation but would starve a workforce ALREADY live, mid-run, with no
 * request to answer 403 to. The observation is correct. The conclusion was not,
 * and this file then went on to claim in its own refusal text that the rule
 * applied to "EVERY path into an activation" — which was false the day it was
 * written. An audit found five paths reaching live Composio execution with
 * ORIANT_ALLOWED_ORGANIZATION_IDS never read at all:
 *
 *   POST /api/runtime/activation, POST /api/runtime/run,
 *   POST /api/runtime/approvals, POST /api/runtime/scheduler,
 *   and the background poller, unattended, on a timer.
 *
 * All unauthenticated, like the three below. A comment asserting a safety
 * property the code does not have is worse than no comment, because it is what
 * the next reader checks instead of the code.
 *
 * PER-ROUTE GATING CANNOT CONVERGE — every new route that touches the runtime is
 * another place to remember, and five were already missed. So the rule now lives
 * where a LIVE tool client is handed out: `liveIntegrationProviderFor` in
 * lib/runtime/tools/organization.ts, which all eight paths reach through
 * `session.toolsFor` / `session.executorFor`. An unpermitted organization gets a
 * provider that refuses every call by name — never null, never the stub, never
 * somebody else's. Starving a live workforce is the accepted, intended cost, and
 * it is loud: the refusal lands in the run record quoting the variable.
 *
 * WHY THIS GATE IS STILL HERE. A 403 before anything happens is a better answer
 * than a pass that ingests, builds, proves, activates and then fails at its first
 * `act` step: it costs nothing, it leaves no half-finished state behind, and its
 * body says which id was refused and what to add. It is also the only one of the
 * two that can answer a REQUEST, which is the difference between an explanation
 * and a symptom. What it is not is the last line — that is the provider, and
 * every message here points at it.
 *
 * THE RULE, STATED ONCE. ORIANT_ALLOWED_ORGANIZATION_IDS is the operator's
 * statement of which organizations THIS DEPLOYMENT MAY ACT FOR. Empty, with live
 * tools, means none — on every path, whatever the id's provenance, whether it is
 * refused early here or at the hands. With tools off it restricts nothing
 * anywhere, because the stub reaches nobody.
 *
 * ORDER MATTERS ON THE STORED ARM, and lib/runtime/pipeline/gated-claim.ts is
 * where it is enforced: a stored handoff is gated BEFORE it is claimed, so a
 * refusal leaves the row 'ready' and collectable the day an operator permits its
 * organization. Refusing after the claim would leave it 'consumed' with nothing
 * deployed — the wedge lib/runtime/pipeline/source.ts was rewritten to remove.
 *
 * FRAMEWORK-FREE, WHICH IS WHY THIS RETURNS A DESCRIPTOR AND NOT A RESPONSE.
 * Nothing under lib/runtime/** imports from `next/server`, and that is a
 * property worth keeping rather than an accident: this library is compiled on
 * its own by scripts/verify.mjs, bundled into the Daytona sandbox runner, and
 * driven by the worker — three places with no request, no route and no reason to
 * pull Next in. So the gate answers with `{ status, body }` and each route turns
 * that into a `NextResponse.json(body, { status })` on its own line. The alternative,
 * returning a NextResponse from here, would have made a verify target that only
 * wanted to know WHETHER a payload is refused depend on the framework to find out.
 *
 * IT IS A STOPGAP AND .env.example SAYS SO. The real fix is authenticating these
 * routes and deriving the organization from the caller's session; until then
 * this holds the blast radius to organizations an operator named by hand.
 */

import type { WorkforceHandoffPayload } from "../../plan/ingest/types";

/** Named, so every message about it can quote it and a grep for the variable
    lands here rather than on a bare string literal. */
export const ALLOWED_ORGANIZATIONS_ENV = "ORIANT_ALLOWED_ORGANIZATION_IDS";

/**
 * A refusal, ready for whichever route asked.
 *
 * `status` and `body` and nothing else: headers, cookies and streams are the
 * route's business, and a descriptor that grew any of them would be a
 * NextResponse with extra steps.
 */
export interface OrganizationRefusal {
  status: number;
  body: {
    error: string;
    code: "organization_not_allowlisted";
    /** The caller's own input, echoed; null when the payload named none. */
    organizationId: string | null;
    allowlist: {
      variable: string;
      configured: boolean;
      permitted: number;
    };
    hint: string;
    stopgap: string;
  };
}

/** The permitted ids. Empty when the variable is unset, which permits nothing —
    see `organizationGate` for why that is the right way round. */
export function allowedOrganizationIds(): Set<string> {
  const raw = process.env[ALLOWED_ORGANIZATIONS_ENV] ?? "";
  // Exact match after trimming, never case-folded: an organization id is an
  // opaque key (a uuid today, `seed:...` in some fixtures), and normalising it
  // would be this file inventing an equality the database does not use.
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
}

/**
 * The organization this payload would run as, or null when it names none.
 *
 * Read through `unknown` rather than off the declared type, because the route's
 * `looksLikeHandoff` never checks `organization` — a body that satisfies it can
 * arrive with none at all, and `payload.organization.id` would then throw a
 * TypeError inside the gate, answering 500 to exactly the request the gate
 * exists to refuse. Tightening `looksLikeHandoff` instead was rejected: ingest's
 * `organization_unresolved` gap explains a missing owner far better than a
 * generic "not a WorkforceHandoffPayload" 400, and that explanation is what a
 * caller should still get on the stub path, where this gate does nothing.
 */
export function payloadOrganizationId(payload: WorkforceHandoffPayload): string | null {
  const organization: unknown = payload.organization;
  if (typeof organization !== "object" || organization === null) return null;
  const id: unknown = (organization as Record<string, unknown>).id;
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * What this gate needs from a handoff that came out of `role_c_handoffs`.
 *
 * STRUCTURAL, NOT `CollectedHandoff` FROM ./source, on purpose. This module
 * imports one type and nothing else; source.ts reaches @supabase/supabase-js
 * through lib/server/supabase. A gate that dragged a database client into every
 * verify target and the sandbox bundle to read two strings would be paying for a
 * dependency it never uses, and the framework-free note below would be the next
 * property to go.
 */
export interface StoredHandoff {
  /** `role_c_handoffs.organization_id`, as Role B's finalize step wrote it. */
  organizationId: string;
  /** The stored payload. Its `organization.id` is the value ingest copies onto
      the plan, and therefore the one that selects whose accounts get used. */
  payload: WorkforceHandoffPayload;
}

/**
 * The decision, once, for one already-extracted id.
 *
 * PRIVATE AND SHARED RATHER THAN TWO PUBLIC SPELLINGS: every door has to answer
 * byte for byte (COLLECT-9 asserts it across three of them), and the only way to
 * guarantee that is for there to be one place the words live. The exported
 * functions below differ solely in where they find the id.
 *
 * `toolsLive` and not `mode`: since ORIANT_RUNTIME_TOOLS was split out, a
 * session can report `mode: "fixture"` while holding live Composio clients, and
 * a guard written against the mode would open on the one deployment that can
 * reach a customer (`RuntimeSession.toolsLive`). It is a PARAMETER rather than a
 * `getRuntimeSession()` call for the same reason the rest of lib/runtime takes
 * its dependencies by injection: the caller already holds the session, and a
 * gate that composed its own would read the environment from inside a module
 * every verify target compiles.
 *
 * IT DOES NOT NAME THE ROUTE IT IS REFUSING FOR, and that is a choice rather
 * than an omission. Every door runs the same payload through the same pass and
 * is refused for the same reason, so a body that differed between them would
 * suggest to a reader that the rule does — and would give the copy this file
 * exists to prevent somewhere to start.
 */
function refuseUnlessPermitted(
  organizationId: string | null,
  toolsLive: boolean,
): OrganizationRefusal | null {
  // TOOLS OFF — RESTRICT NOTHING, which is the default and by far the common
  // case. Every `act` step is a `StubIntegrationProvider` call that reaches
  // nobody, so a refusal here would protect an organization from a simulation.
  // The demo, the verify targets and a clean clone all run through this line,
  // and making them carry an allowlist buys no safety at all.
  if (!toolsLive) return null;

  const allowed = allowedOrganizationIds();
  if (organizationId !== null && allowed.has(organizationId)) return null;

  // Both refusals below are the same shape and the same status, because they are
  // the same decision: this pass would act as an organization nobody on this
  // deployment has permitted. FAILING CLOSED INCLUDES THE UNNAMED CASE — an id
  // that cannot be read cannot be checked, and "cannot be checked" must never
  // read as "fine", which is the mistake that put an env var in charge of whose
  // mail got sent in the first place.
  const configured = allowed.size > 0;
  const named = organizationId !== null;

  /*
   * WHICH DOORS THIS COVERS, STATED HONESTLY — AND IT IS THE THIRD TIME THESE
   * WORDS HAVE HAD TO BE CORRECTED. They first read "POST /api/runtime/collect
   * is not restricted either", true of the whole route while the gate lived on
   * the pipeline route alone. They then promised the asymmetry: fixture arm
   * gated, `role_c_handoffs` arm not, because Role B's finalize step wrote the
   * organization there rather than the caller. That promise was false the moment
   * anyone looked at the writer — `POST /api/planner/:workforcePlanId/
   * finalize-handoff` has no auth check, so an anonymous caller supplies the id
   * one hop earlier and collects what they deposited. They then claimed EVERY
   * path into an activation, while /activation, /run, /approvals, /scheduler and
   * the poller reached live Composio execution without this variable being read.
   *
   * Each time, the text was describing a bypass as a rule. It no longer claims
   * completeness for itself at all: it names the three request doors it really
   * covers, and points at the chokepoint that covers the rest. A caller reading
   * this now knows both what refused them and what would have refused them later.
   */
  const everyDoor =
    `This is the EARLY refusal, on the three request paths that start an ` +
    `activation: POST /api/runtime/pipeline, POST /api/runtime/collect ` +
    `{"fixture": true}, and POST /api/runtime/collect against role_c_handoffs. ` +
    `The stored arm is checked BEFORE the row is claimed, so a refused handoff ` +
    `stays 'ready' and is collectable unchanged once its organization is ` +
    `permitted. IT IS NOT THE ONLY ENFORCEMENT. The same allowlist is applied ` +
    `wherever a live Composio client is handed out ` +
    `(lib/runtime/tools/organization.ts), so POST /api/runtime/activation, ` +
    `/run, /approvals, /scheduler and the background poller refuse there too — ` +
    `every tool call answering "this deployment is not permitted to act for" ` +
    `that organization, with nothing sent. Refusing here first only means you ` +
    `get this explanation instead of that symptom.`;

  const body = {
    error: named
      ? `Refusing to run this handoff: it names organization "${organizationId}", ` +
        `which ${ALLOWED_ORGANIZATIONS_ENV} does not permit. Live tools are on ` +
        `(ORIANT_RUNTIME_TOOLS=composio), so running it would act through that ` +
        `organization's connected accounts — and this route is unauthenticated, so ` +
        `nothing in this request established that you may act for it. Nothing was ` +
        `ingested, built, recorded as the current plan, or activated, and no ` +
        `handoff row was claimed.`
      : `Refusing to run this handoff: it names no organization, so there is nothing ` +
        `to check against ${ALLOWED_ORGANIZATIONS_ENV}. Live tools are on ` +
        `(ORIANT_RUNTIME_TOOLS=composio), and an unresolvable owner is refused rather ` +
        `than defaulted — the alternative is running somebody's workforce through ` +
        `whichever organization this server was last configured with. Nothing was ` +
        `ingested, built, recorded as the current plan, or activated, and no ` +
        `handoff row was claimed.`,
    code: "organization_not_allowlisted" as const,
    // The caller's own input, echoed so an operator reading a log knows which id
    // was refused without reconstructing the request.
    organizationId,
    allowlist: {
      variable: ALLOWED_ORGANIZATIONS_ENV,
      configured,
      // THE COUNT, NEVER THE IDS. Listing them would answer an anonymous prober's
      // real question — which ids this server accepts — and hand over the exact
      // strings needed to walk through the gate. An operator can read their own
      // environment; a stranger gets to know only that the door is shut.
      permitted: allowed.size,
    },
    hint: named
      ? configured
        ? `To permit it, add ${organizationId} to ${ALLOWED_ORGANIZATIONS_ENV} ` +
          `(comma-separated) and restart the server. To run it without touching ` +
          `anyone's accounts, unset ORIANT_RUNTIME_TOOLS: the stub path is not ` +
          `restricted. ${everyDoor}`
        : `${ALLOWED_ORGANIZATIONS_ENV} is unset, so while live tools are on this ` +
          `server permits no organization at all. Set it to a comma-separated list ` +
          `of organization ids — ${organizationId} to permit this one — and restart ` +
          `the server. ${everyDoor}`
      : `Role B's payload carries organization.id, the same value as ` +
        `role_c_handoffs.organization_id and the /api/integrations/[organizationId]/… ` +
        `routes the owner connected their tools through. Re-fetch the handoff with ` +
        `GET /api/planner/:workforcePlanId/handoff and POST its .payload, then add ` +
        `that id to ${ALLOWED_ORGANIZATIONS_ENV}.`,
    stopgap:
      `${ALLOWED_ORGANIZATIONS_ENV} is a stopgap. /api/runtime/* is unauthenticated ` +
      `(ROLE_C_PLAN M7); once these routes carry a session the organization comes ` +
      `from the caller and this allowlist goes away.`,
  };

  // 403 rather than 422. A 422 would say the CONTENT is not live-able, which is
  // what every other refusal on these routes means and is not what happened: the
  // handoff may be perfectly good, and the same bytes are accepted the moment an
  // operator permits its organization. What is missing is authority.
  //
  // AND NOT A QUIET DOWNGRADE TO THE STUB, which is the tempting third answer.
  // It would return 200 with six green stages for a workforce that will never
  // send anything — the failure this codebase keeps removing, because nothing
  // downstream can tell a simulated send from a real one.
  return { status: 403, body };
}

/**
 * The refusal for a payload that came in on a request, or null to proceed.
 *
 * Used by POST /api/runtime/pipeline (the caller's own `body.payload`, and the
 * `{"fixture": true}` constant, which names a real organization out of Role B's
 * seed data rather than the `org-brightpath-demo-fixture` stand-in).
 */
export function organizationGate(
  payload: WorkforceHandoffPayload,
  toolsLive: boolean,
): OrganizationRefusal | null {
  return refuseUnlessPermitted(payloadOrganizationId(payload), toolsLive);
}

/**
 * The same refusal for a handoff read out of `role_c_handoffs`, or null.
 *
 * A ROW CARRIES THE ID TWICE and both have to be permitted, which is one line
 * more than it looks. `payload.organization.id` is checked FIRST because it is
 * the value ingest copies onto the plan and therefore the one `integrationsFor`
 * receives at the activate stage — refuse the wrong one and the message names an
 * id that decides nothing. `organization_id`, the column, is checked second:
 * Role B's finalize step writes both from the same organization so they agree,
 * and if they ever stop agreeing an operator who permitted one of them has not
 * permitted the other. Silently running on the strength of the id that happened
 * to be on the list is not a decision anyone made.
 *
 * REJECTED: a refusal body naming both ids. It would be a third shape for one
 * rule, reachable only through a Role B bug, and COLLECT-9 requires every door
 * to answer byte for byte — this way a divergence is refused with the ordinary
 * words about whichever id was not permitted.
 */
export function handoffOrganizationGate(
  handoff: StoredHandoff,
  toolsLive: boolean,
): OrganizationRefusal | null {
  // Read through `unknown` for the same reason `payloadOrganizationId` does: the
  // row reaches this module as a cast over a PostgREST result, not as anything
  // validated, so a null column must refuse rather than throw a TypeError out of
  // the gate that exists to refuse it.
  const column: unknown = handoff.organizationId;
  const trimmed = typeof column === "string" ? column.trim() : "";

  return (
    refuseUnlessPermitted(payloadOrganizationId(handoff.payload), toolsLive) ??
    refuseUnlessPermitted(trimmed === "" ? null : trimmed, toolsLive)
  );
}
