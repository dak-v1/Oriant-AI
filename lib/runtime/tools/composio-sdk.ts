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
 * The organization whose connected accounts this runtime acts through.
 *
 * NOT A DEFAULT — a throw. Composio scopes every connected account to a user
 * id, and this application uses the organization id for that (see the header of
 * ./composio.ts). Guessing it would mean executing one business's Gmail under
 * another business's identity, so an unset variable stops live mode rather than
 * picking something plausible.
 *
 * The value is the `organization_id` that `/api/integrations/[organizationId]/
 * [toolKey]/connect` was called with when the owner linked their tools — the
 * same id on the `role_c_handoffs` row this workforce was built from. Set
 * ORIANT_ORGANIZATION_ID to it, or pass `organizationId` explicitly when a
 * caller already has one in hand (the pipeline does: `CollectedHandoff.
 * organizationId`), which is the better path once activation is wired per org.
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
  /** Defaults to ORIANT_ORGANIZATION_ID; pass it when the caller knows better. */
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
