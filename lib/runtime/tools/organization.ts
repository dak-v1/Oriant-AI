/**
 * lib/runtime/tools/organization.ts — WHOSE hands, decided by the plan, and
 * WHETHER this deployment may act for them at all.
 *
 * Two questions, one function. `liveIntegrationProviderFor` is the only place a
 * live Composio provider is produced, which makes it the only place either
 * question can be answered without a list of callers to keep up to date. The
 * first half is below; the second — ORIANT_ALLOWED_ORGANIZATION_IDS — is the
 * block headed "THE SECOND QUESTION THIS MODULE ANSWERS".
 *
 * THE BUG THIS FIXES. Live tool execution used to read ORIANT_ORGANIZATION_ID to
 * decide whose Composio connections to act through. That is a data-modelling
 * mistake dressed as a configuration setting, and the giveaway is that the right
 * answer was already in the process and thrown away: Role B's handoff carries
 * `organization: { id, external_key, name }`, `role_c_handoffs.organization_id`
 * stores it, `CollectedHandoff.organizationId` reads it, and the collect route
 * echoes it back. Then nothing consumed it. So a server that had just ingested a
 * specific customer's workforce had to be TOLD, by an environment variable,
 * whose Gmail to send from — one organization per process, set by hand, sitting
 * next to a plan that already knew. That is not a future scaling problem; it is
 * a wrong answer waiting for the second row in a table.
 *
 * `ApprovedPlan.organizationId` now carries the owner, and this module is the one
 * place that turns it into hands.
 *
 * THE ORDER, AND WHY IT IS THAT ORDER.
 *
 *   1. the plan's own organization      — an ingested plan knows its owner
 *   2. the fixture's stand-in           — ONLY for BRIGHTPATH_DEMO_ORGANIZATION_ID
 *   3. refuse, by name                  — never (1) belonging to somebody else,
 *                                         never the stub
 *
 * Step 1 is checked BEFORE the environment is read at all, which is the property
 * that makes the fix real. If the variable could override a plan's own id, then
 * a deployment that still had the old setting in place would keep sending every
 * customer's mail from whichever organization was configured last — the original
 * bug, surviving the rename. It cannot: for any plan that is not the fixture,
 * ORIANT_ORGANIZATION_ID is not consulted and its value is irrelevant.
 *
 * WHY THE FIXTURE GETS AN EXCEPTION AND NOTHING ELSE DOES. BrightPath is not a
 * business. `BRIGHTPATH_DEMO_ORGANIZATION_ID` is a deliberately non-uuid string
 * that says "demo" precisely so nobody mistakes it for a customer, and there are
 * no Composio connections behind it — there is no owner to resolve because the
 * company does not exist. A clean clone that has ingested nothing is served that
 * fixture (lib/runtime/current-plan.ts), and ROLE_C_PLAN promises the scripted
 * demo keeps working. So the environment variable stands in for the fixture's
 * missing owner and for nothing else. An ingested plan never needs it.
 *
 * FAILING CLOSED IS A REFUSAL, NOT A NULL AND NOT A THROW.
 *
 * A throw would take out a route handler for what is, mid-process, a data
 * problem about one plan rather than a wiring problem about the deployment —
 * `session.ts` already makes the wiring failure loud at construction, which is
 * the right place for that. And returning null from `getToolClient` would make
 * `performTool` report "Integration gmail is not connected", which is FALSE and
 * actively misleading: Gmail may be connected perfectly well, and an owner sent
 * to reconnect it is being sent to perform a fix that cannot work. So the
 * unresolved case hands back a client that refuses with the true sentence.
 * ./composio.ts sets the same precedent — it returns a non-null client for a
 * connected-but-unroutable integration rather than claim it is disconnected.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THE SECOND QUESTION THIS MODULE ANSWERS, AND THE ONE IT IS THE CHOKEPOINT FOR:
 * not only WHOSE hands, but whether this deployment may act for them at all.
 * ORIANT_ALLOWED_ORGANIZATION_IDS is the operator's statement of that, and
 * `liveIntegrationProviderFor` below enforces it — the single function that hands
 * out a LIVE Composio provider.
 *
 * IT USED TO LIVE ONLY ON THE ROUTES, AND PER-ROUTE GATING CANNOT CONVERGE.
 * lib/runtime/pipeline/organization-gate.ts refuses an unpermitted organization
 * at POST /api/runtime/pipeline and at both arms of POST /api/runtime/collect.
 * Those are the three doors somebody remembered. An audit found five more that
 * reach live Composio execution with the variable never read:
 *
 *   POST /api/runtime/activation   activates a deployment for `currentPlan()`
 *   POST /api/runtime/run          live fetch/act; needs only a built package
 *   POST /api/runtime/approvals    resuming a paused run is the moment a held
 *                                  `act` invocation actually executes
 *   POST /api/runtime/scheduler    a worker pass starts real runs
 *   the background poller          the same path, unattended, on a timer
 *
 * All five are unauthenticated, like every /api/runtime/* route (ROLE_C_PLAN M7),
 * and every one of them resolves its hands through `session.toolsFor(plan
 * .organizationId)` or `session.executorFor(plan)` — both of which are this
 * function. So ONE check here covers all five, and covers the next route to touch
 * the runtime before it is written. A check per route is a list to remember, and
 * the audit is the evidence that the list does not get remembered.
 *
 * THE EARLIER NOTE SAYING THIS WAS THE WRONG PLACE IS SUPERSEDED, AND SAYING SO
 * IS PART OF THE CHANGE — a rule that quietly contradicts the comment explaining
 * why it does not exist is worse than either. organization-gate.ts rejected this
 * location on two grounds:
 *
 *   1. It would also restrict the `role_c_handoffs` arm of /collect, whose id
 *      Role B's finalize step wrote rather than a caller. That arm is now
 *      deliberately restricted: the writer feeding that table is
 *      `POST /api/planner/:workforcePlanId/finalize-handoff`, which has no auth
 *      check, so provenance was never authority.
 *   2. A check here would not refuse an activation, it would STARVE A WORKFORCE
 *      THAT IS ALREADY LIVE, mid-run, with no request to answer 403 to and
 *      nobody watching. That is true, and it is now the intended behaviour. A
 *      workforce acting for an organization this deployment was never permitted
 *      to act for is exactly what must stop, and it stops LOUDLY rather than
 *      silently: every refused step lands in the run record quoting the variable
 *      and the id. The alternative that objection was protecting is mail going
 *      out under a stranger's name because a route was added after the gate.
 *
 * WITH TOOLS OFF THIS RESTRICTS NOTHING, and structurally rather than by asking.
 * `liveIntegrationProviderFor` is reached only from the live branch of `toolsFor`
 * in lib/runtime/session.ts, so with ORIANT_RUNTIME_TOOLS unset the allowlist is
 * never read at all. Every `act` step is then a `StubIntegrationProvider` call
 * that reaches nobody; restricting a simulation buys no safety and would break
 * the demo, the verify targets and a clean clone. That is why there is no
 * `toolsLive` parameter here — the switch stays in session.ts, where it already
 * is, and this module cannot be handed the wrong answer for it.
 *
 * THE ROUTE GATES STAY AND ARE NOT REDUNDANT. A 403 before any work is a better
 * answer than a pass that ingests, builds, proves and then dies at its first
 * `act` step, and the gate's body says which id was refused and what to add. That
 * is the EARLY, EXPLAINING refusal. This one is the refusal that cannot be routed
 * around.
 */

import { BRIGHTPATH_DEMO_ORGANIZATION_ID } from "../../plan/fixtures/brightpath";
import { MERIDIAN_DEMO_ORGANIZATION_ID } from "../../plan/fixtures/meridian";

/**
 * Every organization id that names a DEMO FIXTURE rather than a business. These
 * — and only these — may borrow the operator's ORIANT_ORGANIZATION_ID stand-in.
 * A new fixture plan must be added here or its demo org will be treated as a
 * real (and nonexistent) Composio account; see the comment at the membership
 * check for the outage that taught this.
 */
const KNOWN_FIXTURE_ORGANIZATION_IDS: ReadonlySet<string> = new Set([
  BRIGHTPATH_DEMO_ORGANIZATION_ID,
  MERIDIAN_DEMO_ORGANIZATION_ID,
]);
import { ComposioToolsConfigError } from "./composio";
import { providerForOrganization } from "./composio-sdk";
/*
 * THE VARIABLE IS READ THROUGH THE GATE'S PARSER RATHER THAN RE-PARSED HERE, and
 * the import points UP into ../pipeline on purpose.
 *
 * REJECTED: a second `process.env[...].split(",")` in this file. Two parsers of
 * one variable drift, and the drift that matters is silent — one of them
 * case-folding, or trimming differently — which would make the early refusal and
 * the chokepoint disagree about the same id. There is exactly one reading.
 *
 * REJECTED, THOUGH IT IS THE TIDIER DIRECTION: moving `ALLOWED_ORGANIZATIONS_ENV`
 * and `allowedOrganizationIds` down here and having organization-gate.ts import
 * them. It would put the constant in the module that owns the rule, and it would
 * drag `@composio/core` into the gate's module graph — this file imports
 * ./composio-sdk, the one module that loads the SDK. lib/runtime/verify/collect.ts
 * imports the gate and is compiled to CommonJS by scripts/verify.mjs; the SDK is
 * ESM-only, so that import would make a target which never goes near Composio
 * depend on the Node version. The gate imports one type and nothing else, and
 * that stays true.
 */
import {
  ALLOWED_ORGANIZATIONS_ENV,
  allowedOrganizationIds,
} from "../pipeline/organization-gate";
import type {
  IntegrationProvider,
  ToolClient,
  ToolInvocation,
  ToolResult,
} from "../types";

/** The environment variable's remaining job, named so a message can quote it. */
export const FIXTURE_ORGANIZATION_ENV = "ORIANT_ORGANIZATION_ID";

/* ═══════════════════════════ Resolution ═══════════════════════════ */

/**
 * `plan` — the plan named its own owner. The normal answer, and the only one a
 *          customer's workforce is ever allowed to get.
 * `fixture_fallback` — the plan is the BrightPath demo, which has no owner, so
 *          ORIANT_ORGANIZATION_ID stood in.
 * `unresolved` — nobody. Carries the sentence every refusal quotes.
 */
export type ToolsOrganization =
  | { kind: "plan"; organizationId: string }
  | { kind: "fixture_fallback"; organizationId: string }
  | { kind: "unresolved"; reason: string };

/**
 * Which organization a plan's tools act as.
 *
 * Takes the id rather than the whole `ApprovedPlan` because that is the only
 * field the decision may depend on, and a signature that took the plan would
 * invite a second criterion to creep in later.
 */
export function resolveToolsOrganization(planOrganizationId: string): ToolsOrganization {
  const orgId = planOrganizationId.trim();

  if (orgId.length === 0) {
    // Ingest refuses a handoff with no `organization.id` (lib/plan/ingest/
    // from-handoff.ts, gap `organization_unresolved`), so reaching here means a
    // plan was built some other way — a fixture under construction, a hand-
    // written test plan, a migration that predates the field. Whatever it is,
    // it is not evidence about which business to bill, so it gets nobody's
    // connections rather than the last-configured one's.
    return {
      kind: "unresolved",
      reason:
        "this plan does not say which business it belongs to, so there is no way " +
        "to tell whose connected accounts its agents should act through. " +
        "ApprovedPlan.organizationId is empty; re-ingest the handoff, which " +
        "carries organization.id.",
    };
  }

  // THE LINE THAT MATTERS. Anything that is not a demo fixture is a real
  // organization and is used as-is, without the environment being consulted.
  //
  // A SET, NOT ONE ID, and the day that changed is worth recording: this check
  // named BRIGHTPATH_DEMO_ORGANIZATION_ID alone, written when BrightPath was
  // the only fixture the server could fall back to. Then the served fallback
  // became Meridian — and Meridian's demo org, being "not the fixture" by this
  // line's definition, was treated as a real business named
  // "org-meridian-demo-fixture". No such Composio account exists, so with live
  // tools ON and ORIANT_ORGANIZATION_ID correctly set, the integrations gate
  // still refused wholesale. The property this check actually guards is "a demo
  // org that is not a real business may borrow the operator's stand-in; a real
  // org id never consults the environment" — and that property belongs to every
  // demo fixture the server can serve, not to whichever one was first.
  if (!KNOWN_FIXTURE_ORGANIZATION_IDS.has(orgId)) {
    return { kind: "plan", organizationId: orgId };
  }

  const env = typeof process === "undefined" ? undefined : process.env;
  const raw = typeof env?.ORIANT_ORGANIZATION_ID === "string" ? env.ORIANT_ORGANIZATION_ID : "";
  const fallback = raw.trim();
  if (fallback.length === 0) {
    return {
      kind: "unresolved",
      reason:
        `the plan being served is a demo fixture (${orgId}), which is not a real ` +
        `business and has no Composio connections. Ingest a handoff so the runtime ` +
        `executes a real plan through its own organization, or set ` +
        `${FIXTURE_ORGANIZATION_ENV} to an organization whose connections the demo ` +
        `may borrow.`,
    };
  }
  return { kind: "fixture_fallback", organizationId: fallback };
}

/* ═══════════════════════════ The refusals ═══════════════════════════ */

/** Scoped to one integration for the same reason `ComposioToolClient` is: a
    client that answered for any integration is a client that can be spent on
    the wrong grant. Here it only ever refuses, but the shape must not differ. */
class RefusingToolClient implements ToolClient {
  private readonly integrationId: string;
  private readonly reason: string;

  constructor(integrationId: string, reason: string) {
    this.integrationId = integrationId;
    this.reason = reason;
  }

  async call(invocation: ToolInvocation): Promise<ToolResult> {
    return {
      ok: false,
      error:
        `Refusing "${invocation.operation}" on "${this.integrationId}": ${this.reason} ` +
        `Nothing was sent to Composio, and no other organization's connections were ` +
        `used in its place.`,
    };
  }
}

/**
 * A provider that hands out nothing but refusals, saying why.
 *
 * SHARED BY THE TWO REFUSALS BELOW rather than written twice, because the two
 * differ ONLY in the sentence they carry: an owner who is told "nothing was sent
 * and nobody else's accounts were used" needs that promise kept identically
 * whichever decision shut the door. The subclasses exist so that WHICH decision
 * it was survives to a caller — see `refusal`.
 *
 * The last clause of the refusal is doing real work. "Nothing was sent" is the
 * fact an operator needs; "no other organization's connections were used in its
 * place" is the fact they cannot verify for themselves from a timeline, and it
 * is the one this whole module is about.
 */
abstract class RefusingOrganizationProvider implements IntegrationProvider {
  /**
   * WHICH refusal this is, without an `instanceof`. `organization_not_allowlisted`
   * is deliberately the same string lib/runtime/pipeline/organization-gate.ts
   * puts in its 403 body: one deployment-level decision, refused early on a
   * request and again at the hands, and a screen correlating the two should not
   * have to know they were spelled differently.
   */
  abstract readonly refusal: "organization_unresolved" | "organization_not_allowlisted";

  /** Public so a status screen can explain itself without re-deriving this. */
  readonly reason: string;

  constructor(reason: string) {
    this.reason = reason;
  }

  getToolClient(integrationId: string): ToolClient | null {
    // Not null. See the header: null is read downstream as "the owner has not
    // connected this tool", which is a different problem with a different fix.
    return new RefusingToolClient(integrationId, this.reason);
  }

  /**
   * Always "required", never "connected". The activation checklist reads this,
   * and a workforce whose credentials cannot be resolved — or whose organization
   * this deployment may not act for — must not be able to go live.
   * "needs_approval" would be a lie of a different kind: it claims a connection
   * exists and has lapsed, and would send the owner to Composio to re-authorise
   * something that was never the problem.
   */
  getIntegrationStatus(): "connected" | "required" | "optional" | "needs_approval" {
    return "required";
  }
}

/**
 * The provider for a plan whose organization could not be resolved at all.
 * Refuses every call, saying which decision could not be made.
 */
export class UnresolvedOrganizationProvider extends RefusingOrganizationProvider {
  readonly refusal = "organization_unresolved" as const;
}

/**
 * The provider for a plan whose organization RESOLVED PERFECTLY WELL and is not
 * one this deployment is permitted to act for.
 *
 * ITS OWN CLASS, NOT `UnresolvedOrganizationProvider` WITH A DIFFERENT STRING.
 * The two are different facts with different fixes — one is repaired by
 * re-ingesting a handoff that names an owner, the other by an operator adding an
 * id to ORIANT_ALLOWED_ORGANIZATION_IDS — and a name that said "unresolved"
 * about a plan whose owner is known would be the kind of small lie this file
 * keeps removing from elsewhere.
 */
export class UnpermittedOrganizationProvider extends RefusingOrganizationProvider {
  readonly refusal = "organization_not_allowlisted" as const;
}

/* ═══════════════════════════ The allowlist ═══════════════════════════ */

/** A resolved owner: the two arms of `ToolsOrganization` that name an id. Spelled
    as an exclusion rather than re-listed, so a third resolution kind added later
    is a compile error here rather than a silently unchecked path. */
type ResolvedToolsOrganization = Exclude<ToolsOrganization, { kind: "unresolved" }>;

/**
 * The sentence an unpermitted organization refuses with.
 *
 * IT NAMES THE ID IT REFUSED AND NEVER THE LIST. The id is the plan's own and is
 * already on every screen about it; the permitted ids are the answer to "what
 * would this server accept", and lib/runtime/pipeline/organization-gate.ts
 * withholds them from an anonymous caller for that reason. This string travels
 * further than that 403 does — into a run record, an approval, an owner's inbox —
 * so it withholds them too. An operator can read their own environment.
 *
 * `configured` is passed in rather than re-derived so the message and the
 * decision are made from ONE read of the variable: a message that said "unset"
 * about a set variable, because the environment changed between two reads, would
 * send an operator to fix the wrong thing.
 */
function notPermittedReason(
  resolved: ResolvedToolsOrganization,
  configured: boolean,
): string {
  const orgId = resolved.organizationId;

  // WHERE THE ID CAME FROM, when it did not come from the plan. Without this an
  // operator reads "not permitted to act for org-x", greps their handoffs for
  // org-x and finds nothing — the fixture borrowed it from the environment.
  const borrowed =
    resolved.kind === "fixture_fallback"
      ? ` That id is not on the plan: the plan being served is the BrightPath demo ` +
        `fixture, which has no owner of its own, and ${FIXTURE_ORGANIZATION_ENV} ` +
        `nominated this organization to stand in for it.`
      : "";

  return (
    `this deployment is not permitted to act for organization "${orgId}". ` +
    (configured
      ? `${ALLOWED_ORGANIZATIONS_ENV} is set and does not list it.`
      : `${ALLOWED_ORGANIZATIONS_ENV} is unset, so while live tools are on this ` +
        `deployment permits no organization at all.`) +
    borrowed +
    ` Add ${orgId} to ${ALLOWED_ORGANIZATIONS_ENV} (comma-separated) and restart ` +
    `the server, or unset ORIANT_RUNTIME_TOOLS to run against the stub, which ` +
    `reaches nobody and is not restricted.`
  );
}

/* ═══════════════════════════ Wiring ═══════════════════════════ */

/**
 * The LIVE provider for a plan's organization, or one that refuses by name.
 *
 * Only called when tools are live — the stub-versus-live branch stays in
 * lib/runtime/session.ts next to `liveTools()`, which is the switch that decides
 * it. What this function guarantees is the other half of instruction: once live,
 * there is no path from here back to `StubIntegrationProvider`. A stub answers
 * every write with `{ simulated: true }` and the run reports success, so falling
 * back to it on an unresolved organization would show an owner an email that was
 * never sent — strictly worse than refusing, because nothing downstream can tell.
 *
 * THE CHOKEPOINT FOR ORIANT_ALLOWED_ORGANIZATION_IDS. Every path that can execute
 * a live tool call arrives here: the three request doors the route gate already
 * refuses early, plus /api/runtime/activation, /run, /approvals, /scheduler and
 * the background poller, which it never saw. See the header for the audit and for
 * why the note that put this rule on the routes alone is superseded.
 */
export function liveIntegrationProviderFor(planOrganizationId: string): IntegrationProvider {
  const resolved = resolveToolsOrganization(planOrganizationId);
  if (resolved.kind === "unresolved") {
    return new UnresolvedOrganizationProvider(resolved.reason);
  }

  /*
   * AUTHORITY BEFORE CREDENTIALS, and the order is deliberate. Below this, a
   * missing COMPOSIO_API_KEY refuses by name; that is a question about whether
   * this deployment CAN act, and it is not worth asking about an organization it
   * MAY NOT act for. Refusing in the other order would answer an operator with
   * "the Composio client could not be built" about an id they were never
   * permitted to use, sending them to fix a credential instead of a list.
   *
   * THE RESOLVED ID, NOT THE ARGUMENT. For an ingested plan they are the same
   * string. For the BrightPath fixture they are not: the id that reaches Composio
   * is the ORIANT_ORGANIZATION_ID stand-in, so that is the id whose accounts
   * would be spent and therefore the one that has to be permitted. Checking
   * `planOrganizationId` would let the demo borrow an organization nobody listed.
   */
  const permitted = allowedOrganizationIds();
  if (!permitted.has(resolved.organizationId)) {
    // Never null, never the stub, and never another organization's provider —
    // the same three wrong answers the unresolved case above refuses, for the
    // same reasons.
    return new UnpermittedOrganizationProvider(
      notPermittedReason(resolved, permitted.size > 0),
    );
  }

  try {
    return providerForOrganization(resolved.organizationId);
  } catch (error) {
    // Only `ComposioToolsConfigError` is expected, and by this point it can only
    // mean COMPOSIO_API_KEY went missing after session construction already
    // checked it — a mid-flight failure, not a wiring moment. `session.ts` keeps
    // the loud throw for the wiring moment; here a stack trace would take out a
    // route for what the run can report honestly as a refused step. Anything
    // else rethrows: an unrecognised failure silently becoming "refused" is how
    // a real bug gets filed as a connection problem.
    if (!(error instanceof ComposioToolsConfigError)) throw error;
    return new UnresolvedOrganizationProvider(
      `the Composio client for organization ${resolved.organizationId} could not be ` +
        `built — ${error.message}`,
    );
  }
}
