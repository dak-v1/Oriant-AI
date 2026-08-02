/**
 * Composio adapter for the Person B planner/integrations backend.
 *
 * Follows the {mode, data, error} convention from
 * lib/server/providers/aiand.ts, but is self-contained here rather than
 * touching lib/server/providers/env.ts — that file backs aiandLive()/etc.
 * for code that already depends on it; adding to it wasn't asked for.
 * COMPOSIO_API_KEY is read directly in this file instead, matching the
 * "lib/server/planner/ stays independent" pattern used throughout this
 * backend.
 *
 * Scope: hubspot, slack, quickbooks, whatsapp-business, gmail,
 * google-calendar, and google-drive all route through Composio. Anything
 * with no OAuth (manual) is out of scope for this adapter.
 *
 * Uses connectedAccounts.link() — never initiate(), which is deprecated
 * and sunsetting for Composio-managed OAuth per the SDK's own source
 * comments (2026-05-08 for new orgs, 2026-07-03 for all orgs).
 */
import { Composio } from "@composio/core";

export interface ComposioResult<T> {
  mode: "live" | "fixture";
  data: T;
  error?: string;
}

/**
 * Real Composio toolkit slugs for our in-scope tool keys — confirmed live
 * against the actual catalog, not a string transform. google-calendar and
 * google-drive drop their hyphen on Composio's side, but whatsapp-business
 * maps to a genuinely different name ("whatsapp"), which is why this is a
 * hardcoded table rather than any generic rule.
 */
const TOOLKIT_SLUGS: Record<string, string> = {
  hubspot: "hubspot",
  slack: "slack",
  quickbooks: "quickbooks",
  "whatsapp-business": "whatsapp",
  gmail: "gmail",
  "google-calendar": "googlecalendar",
  "google-drive": "googledrive",
};

export const COMPOSIO_TOOL_KEYS = new Set(Object.keys(TOOLKIT_SLUGS));

function composioApiKey(): string | undefined {
  return process.env.COMPOSIO_API_KEY || undefined;
}

let cachedClient: Composio | null = null;
function getClient(): Composio {
  if (!cachedClient) {
    cachedClient = new Composio({ apiKey: composioApiKey() });
  }
  return cachedClient;
}

/**
 * toolkitSlug -> authConfigId, cached for the process lifetime (per spec —
 * cheap, low churn). A cache hit is still tagged mode:"live": the data is
 * real, just resolved by an earlier call this process, not stale/fake.
 */
const authConfigCache = new Map<string, string>();

async function getOrCreateAuthConfig(toolkitSlug: string): Promise<ComposioResult<string | null>> {
  const cached = authConfigCache.get(toolkitSlug);
  if (cached) return { mode: "live", data: cached };

  if (!composioApiKey()) {
    return { mode: "fixture", data: null, error: "COMPOSIO_API_KEY is not configured." };
  }

  try {
    const client = getClient();
    const existing = await client.authConfigs.list({ toolkit: toolkitSlug });
    const authConfigId =
      existing.items[0]?.id ??
      (await client.authConfigs.create(toolkitSlug, { type: "use_composio_managed_auth" })).id;
    authConfigCache.set(toolkitSlug, authConfigId);
    return { mode: "live", data: authConfigId };
  } catch (err) {
    return { mode: "fixture", data: null, error: String(err) };
  }
}

/**
 * Starts a Composio connection for one org + tool. organizationId is passed
 * as Composio's `userId` — one connected account per (org, toolkit), the
 * natural mapping given Composio's per-user connection model.
 *
 * mode:"fixture" here means "cannot proceed" (unconfigured, or the live
 * call failed) — unlike aiandJson's fixture, there's no meaningful fake
 * OAuth flow to fall back to. Callers must treat it as a failure.
 */
export async function initiateConnection(
  organizationId: string,
  toolKey: string
): Promise<ComposioResult<{ externalConnectionId: string; redirectUrl: string } | null>> {
  const slug = TOOLKIT_SLUGS[toolKey];
  if (!slug) {
    return { mode: "fixture", data: null, error: `"${toolKey}" is not a Composio-routed tool.` };
  }
  if (!composioApiKey()) {
    return { mode: "fixture", data: null, error: "COMPOSIO_API_KEY is not configured." };
  }

  const authConfigResult = await getOrCreateAuthConfig(slug);
  if (!authConfigResult.data) {
    return { mode: "fixture", data: null, error: authConfigResult.error };
  }

  try {
    const client = getClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const callbackUrl = `${appUrl}/app/integrations?tool=${toolKey}&status=callback`;
    const connectionRequest = await client.connectedAccounts.link(organizationId, authConfigResult.data, {
      callbackUrl,
    });
    return {
      mode: "live",
      data: {
        externalConnectionId: connectionRequest.id,
        redirectUrl: connectionRequest.redirectUrl ?? "",
      },
    };
  } catch (err) {
    return { mode: "fixture", data: null, error: String(err) };
  }
}

/**
 * Composio's ConnectedAccountStatuses mapped onto our 4-value enum.
 * INACTIVE (disabled) has no clean equivalent — mapped to "error" as the
 * closest fit rather than inventing a 5th status value.
 */
const STATUS_MAP: Record<string, "connected" | "error" | "pending"> = {
  INITIALIZING: "pending",
  INITIATED: "pending",
  ACTIVE: "connected",
  FAILED: "error",
  EXPIRED: "error",
  REVOKED: "error",
  INACTIVE: "error",
};

/**
 * mode:"fixture"/data:null here means "couldn't determine — don't
 * overwrite what's already stored," which is different from
 * initiateConnection's "cannot start at all."
 */
export async function checkConnectionStatus(
  externalConnectionId: string
): Promise<ComposioResult<"connected" | "error" | "pending" | null>> {
  if (!composioApiKey()) {
    return { mode: "fixture", data: null, error: "COMPOSIO_API_KEY is not configured." };
  }
  try {
    const client = getClient();
    const account = await client.connectedAccounts.get(externalConnectionId);
    return { mode: "live", data: STATUS_MAP[account.status] ?? "error" };
  } catch (err) {
    return { mode: "fixture", data: null, error: String(err) };
  }
}
