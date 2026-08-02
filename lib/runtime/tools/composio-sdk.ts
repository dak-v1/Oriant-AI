/**
 * lib/runtime/tools/composio-sdk.ts — the one place `@composio/core` is imported.
 *
 * `lib/runtime/tools/composio.ts` deliberately knows the SDK only as
 * `ComposioExecutionClient`, a two-method structural type. This module is the
 * seam where that type meets the real thing, and it exists so the boundary has
 * exactly one crossing point:
 *
 *   - `lib/runtime/verify/tools.ts` runs in the DEFAULT verify sweep, compiled
 *     to CommonJS by scripts/verify.mjs and executed with no credentials and no
 *     network. `@composio/core` is ESM-only (`"type": "module"`, an exports map
 *     with .mjs entries), so an import anywhere in that module graph turns the
 *     sweep into a question about which Node version is installed. Keeping the
 *     import here means the verify target never loads it at all.
 *   - When the SDK's surface moves — `tools.execute` gaining a required
 *     argument, `connectedAccounts.list` changing its query shape — the break
 *     is a compile error in THIS file, next to the assignment that asserts the
 *     shape, rather than a behaviour change deep inside the provider.
 *
 * The assignment on the last line of `createComposioClient` is the assertion:
 * if `Composio` stops satisfying `ComposioExecutionClient`, tsc says so here.
 *
 * WHY THIS IS NOT lib/server/planner/providers/composio.ts. That module owns
 * CONNECTING — `initiateConnection()`, `checkConnectionStatus()`, the auth-config
 * cache — and is imported by `app/api/integrations/**`. It has no execution and
 * this file adds none to it, because the two have different lifetimes and
 * different failure postures: a failed connection attempt is a user-facing
 * "try again", a failed tool execution is a workflow that must stop. They share
 * the toolkit vocabulary and nothing else, and that vocabulary is duplicated
 * (with the duplication named) in lib/runtime/tools/capabilities.ts.
 */

import { Composio } from "@composio/core";
import {
  ComposioIntegrationProvider,
  ComposioToolsConfigError,
  type ComposioExecutionClient,
  type ComposioIntegrationProviderOptions,
} from "./composio";

/**
 * The Composio API key, or a named throw.
 *
 * Read here as well as in the provider constructor because this function runs
 * FIRST — building an SDK client around an empty key would produce an object
 * that fails on its first request with a 401 rather than at wiring with a
 * sentence naming the variable.
 */
export function requireComposioApiKey(override?: string): string {
  const env = typeof process === "undefined" ? undefined : process.env;
  const raw = override ?? (typeof env?.COMPOSIO_API_KEY === "string" ? env.COMPOSIO_API_KEY : "");
  const apiKey = raw.trim();
  if (apiKey.length === 0) throw new ComposioToolsConfigError(["COMPOSIO_API_KEY"]);
  return apiKey;
}

/**
 * ORIANT_ORGANIZATION_ID, WHICH IS NOW THE FIXTURE'S FALLBACK AND NOTHING ELSE.
 *
 * This used to be how live tool execution learned whose Gmail to send from, for
 * every plan. That was wrong, and wrong in a way configuration could not fix:
 * the answer was already on the plan. Role B's handoff carries
 * `organization.id`, `role_c_handoffs.organization_id` stores it, and
 * `ApprovedPlan.organizationId` now holds it — so an ingested plan knows its own
 * owner and must be executed through it. One organization per process, set by
 * hand, is a wrong answer waiting for the second customer on the same server.
 *
 * WHAT IS LEFT FOR IT. The BrightPath fixture is a demo company that does not
 * exist, so `BRIGHTPATH_DEMO_ORGANIZATION_ID` has no Composio connections behind
 * it and never will. When the fixture is the plan being served — a clone that
 * has ingested nothing (lib/runtime/current-plan.ts) — there is no real owner to
 * resolve, and this variable stands in so a demo can run through somebody's own
 * connections. That is its ONLY legitimate use. The decision to reach for it
 * lives in ./organization.ts, which reaches for it for the fixture and refuses
 * for anything else; this function only reads and validates.
 *
 * NOT A DEFAULT, even there — a throw. Composio scopes every connected account
 * to a user id, and this application uses the organization id for that (see the
 * header of ./composio.ts). Guessing would mean executing one business's Gmail
 * under another business's identity.
 *
 * The value is the `organization_id` that `/api/integrations/[organizationId]/
 * [toolKey]/connect` was called with when the owner linked their tools.
 */
export function requireComposioOrganizationId(override?: string): string {
  const env = typeof process === "undefined" ? undefined : process.env;
  const raw =
    override ?? (typeof env?.ORIANT_ORGANIZATION_ID === "string" ? env.ORIANT_ORGANIZATION_ID : "");
  const organizationId = raw.trim();
  if (organizationId.length === 0) {
    throw new ComposioToolsConfigError([
      "ORIANT_ORGANIZATION_ID (the organization whose Composio connections the runtime acts through)",
    ]);
  }
  return organizationId;
}

/** The real SDK, narrowed to what the runtime uses. */
export function createComposioClient(apiKey?: string): ComposioExecutionClient {
  const key = requireComposioApiKey(apiKey);
  // The narrowing assignment IS the version check — see the header.
  const sdk: ComposioExecutionClient = new Composio({ apiKey: key });
  return sdk;
}

export interface ComposioProviderWiring
  extends Omit<ComposioIntegrationProviderOptions, "client" | "organizationId"> {
  /**
   * The organization to act as. PASS IT — it is `ApprovedPlan.organizationId`,
   * and every plan carries one. Omitting it falls back to ORIANT_ORGANIZATION_ID,
   * which is now correct for the fixture plan alone; see
   * `requireComposioOrganizationId` and ./organization.ts.
   */
  organizationId?: string;
}

/**
 * What `lib/runtime/session.ts` calls in live mode. Throws
 * `ComposioToolsConfigError` at construction when either the key or the
 * organization is missing, which is the behaviour the session file already
 * relies on for `AiAndReasoner`: loud at wiring, never a silent stub.
 */
export function createComposioIntegrationProvider(
  wiring: ComposioProviderWiring = {},
): ComposioIntegrationProvider {
  const apiKey = requireComposioApiKey(wiring.apiKey);
  const organizationId = requireComposioOrganizationId(wiring.organizationId);
  return new ComposioIntegrationProvider({
    ...wiring,
    apiKey,
    organizationId,
    client: createComposioClient(apiKey),
  });
}

/* ═══════════════ One provider per organization, per process ═══════════════ */

interface CachedProvider {
  /** The key this provider was built with; a rotation must not be served the
      old client. See `providerForOrganization`. */
  apiKey: string;
  provider: ComposioIntegrationProvider;
}

interface ProviderCacheGlobal {
  __oriantComposioProviders?: Map<string, CachedProvider>;
}

/**
 * The Composio provider for ONE organization, built once and reused.
 *
 * CACHED FOR THE SAME REASON `getPool` CACHES THE POSTGRES POOL: this is a
 * shared resource with state, not a value. A `ComposioIntegrationProvider`
 * carries a connection snapshot, an in-flight scan and a TTL, and those exist to
 * make `getToolClient`/`getIntegrationStatus` answerable SYNCHRONOUSLY (see the
 * header of ./composio.ts). Constructing one per request would defeat both
 * halves: every call would rescan Composio, and every scan would still be in
 * flight when the synchronous getters were asked — so they would answer
 * "required" forever, which reads as "the owner has not connected Gmail" and
 * blocks activation on a workforce whose tools are perfectly well connected.
 *
 * KEYED BY ORGANIZATION, which is the entire point. Two customers on one server
 * get two providers, each scanning its own connected accounts; the same customer
 * asked twice gets one. A single-entry cache like `getPool`'s would evict one
 * customer's snapshot every time the other executed a step, and a cache with no
 * key at all is the process-wide provider this change exists to remove.
 *
 * NO ENVIRONMENT FALLBACK HERE, deliberately. A blank organization id throws
 * rather than quietly becoming ORIANT_ORGANIZATION_ID, because the caller that
 * passed a blank one is a plan that does not know its owner — and answering that
 * with somebody else's connections is the exact failure this module was rewritten
 * to make impossible. The one caller allowed to reach for the environment does it
 * explicitly, for the fixture, in ./organization.ts.
 *
 * Held on `globalThis` alongside the runtime session and the SQL pool, so a
 * dev-server hot reload does not orphan an in-flight connection scan and start a
 * second one against the same organization.
 */
export function providerForOrganization(organizationId: string): ComposioIntegrationProvider {
  const orgId = organizationId.trim();
  if (orgId.length === 0) {
    throw new ComposioToolsConfigError([
      "organizationId (this plan does not say which business it belongs to, and " +
        "there is no process-wide default to borrow — see ApprovedPlan.organizationId)",
    ]);
  }

  // Read once, so the cached entry and the client inside it cannot disagree
  // about which key built it.
  const apiKey = requireComposioApiKey();

  const g = globalThis as unknown as ProviderCacheGlobal;
  const cache = (g.__oriantComposioProviders ??= new Map<string, CachedProvider>());

  const hit = cache.get(orgId);
  // The key comparison mirrors `getPool`'s `key === connectionString`: a
  // credential that changed under a live process (a rotation, or a test that
  // sets the variable and resets the session) must rebuild, not be served a
  // client still authenticating with the old one.
  if (hit !== undefined && hit.apiKey === apiKey) return hit.provider;

  const provider = createComposioIntegrationProvider({ organizationId: orgId, apiKey });
  cache.set(orgId, { apiKey, provider });
  return provider;
}

/** Discards every cached provider. Tests and credential rotation only; a
    running workforce keeps its snapshots. */
export function resetOrganizationProviders(): void {
  const g = globalThis as unknown as ProviderCacheGlobal;
  g.__oriantComposioProviders = undefined;
}
