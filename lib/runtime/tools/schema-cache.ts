/**
 * lib/runtime/tools/schema-cache.ts — one fetch per tool, per process.
 *
 * WHY A CACHE AT ALL. A tool's input schema is now read on TWO hot paths: once
 * when a `reason` step's prompt is built (lib/runtime/executor.ts) and again
 * immediately before `tools.execute` (lib/runtime/tools/composio.ts), for every
 * act step, on every retry. Without memoisation a three-step workflow makes four
 * catalog calls to learn the same fact, and a run's latency becomes a function of
 * Composio's round-trip rather than of the work it is doing.
 *
 * WHY IT IS PROCESS-WIDE AND NOT PER PROVIDER. A tool's schema is CATALOG data:
 * GMAIL_SEND_EMAIL's arguments do not depend on whose Gmail is connected. The
 * provider cache in ./composio-sdk.ts is keyed by organization because a
 * connection snapshot IS organization-specific; this one deliberately is not, so
 * two customers on one server learn the shape of GMAIL_SEND_EMAIL once between
 * them. Held on `globalThis` alongside that cache and the SQL pool, so a
 * dev-server hot reload does not orphan an in-flight fetch.
 *
 * KEYED BY SLUG *AND VERSION*, which is the part that is easy to get wrong.
 * Composio pins tool behaviour to a toolkit version and the runtime may pin one
 * (`ComposioIntegrationProviderOptions.toolkitVersions`). A schema fetched for
 * "latest" and then used to check a call executed against a pinned version would
 * be checking the wrong shape — quietly, and in the direction that lets a wrong
 * argument list through. The caller builds the key from both.
 *
 * AND "LATEST" IS NOT A VERSION, which ./catalog-recording.ts measured rather than
 * assumed. An unpinned fetch is resolved SERVER-SIDE to a dated version — every
 * one of the twelve reachable tools answered `20260721_00` on the day of the
 * recording — so the string this key carries when nothing is pinned names a moving
 * target. The consequence is deliberate and worth stating: a long-lived process
 * pins itself to whatever "latest" meant the first time it asked, and keeps
 * checking arguments against that shape until it restarts. That is the right way
 * round — a schema that changed under a running workforce would change what the
 * gate refuses mid-run — but it means the recording's `version` field, not the
 * word "latest", is what identifies the shape a check was proved against.
 *
 * FAILURES ARE NOT CACHED. A rejected fetch removes its own entry, so a Composio
 * blip costs one refused act step and not every act step until the process
 * restarts. The cost is that a genuinely dead slug is re-fetched on every
 * attempt; that is the right way round, because the failure is loud each time
 * rather than a stale silence.
 *
 * The IN-FLIGHT PROMISE is what is stored, not the resolved value, so a workflow
 * that reaches the same tool from two places at once makes one HTTP call — the
 * same reasoning as `refresh()`'s shared scan in ./composio.ts.
 */

import type { ToolCatalogEntry } from "./schema";

interface SchemaCacheGlobal {
  __oriantToolSchemas?: Map<string, Promise<ToolCatalogEntry>>;
}

function cache(): Map<string, Promise<ToolCatalogEntry>> {
  const g = globalThis as unknown as SchemaCacheGlobal;
  return (g.__oriantToolSchemas ??= new Map<string, Promise<ToolCatalogEntry>>());
}

/** The cache key. A helper rather than a template literal at the call site so
    the version can never be forgotten in one of the two places it is built. */
export function toolSchemaKey(toolSlug: string, version: string | undefined): string {
  return `${toolSlug}@${version ?? "latest"}`;
}

/**
 * The catalog entry for one tool, fetched at most once per process.
 *
 * `load` must REJECT rather than resolve to anything empty when the schema
 * cannot be had: this function's contract is that what it resolves to is a
 * usable schema, and the caller's contract is that no schema means no send.
 */
export function cachedToolSchema(
  key: string,
  load: () => Promise<ToolCatalogEntry>,
): Promise<ToolCatalogEntry> {
  const entries = cache();
  const hit = entries.get(key);
  if (hit !== undefined) return hit;

  const pending = load();
  entries.set(key, pending);
  // Attached here rather than left to the caller so a rejection can never become
  // an unhandled rejection, and so the eviction happens exactly once per failed
  // fetch. The identity check matters: a retry may already have replaced this
  // entry with a live one, and evicting THAT would defeat the cache silently.
  pending.catch(() => {
    if (entries.get(key) === pending) entries.delete(key);
  });
  return pending;
}

/** Discards every cached schema. Tests, and a toolkit version change under a
    live process; a running workforce keeps what it has learned. */
export function resetToolSchemaCache(): void {
  const g = globalThis as unknown as SchemaCacheGlobal;
  g.__oriantToolSchemas = undefined;
}
