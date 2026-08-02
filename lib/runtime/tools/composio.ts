/**
 * lib/runtime/tools/composio.ts — the runtime's hands.
 *
 * Until this file existed, `ORIANT_RUNTIME_MODE=live` swapped the BRAIN and
 * nothing else: `session.ts` mounted `StubIntegrationProvider` unconditionally,
 * so a "live" run reasoned with a real model over real context and then
 * simulated every side effect. Every `act` step returned `{ simulated: true }`
 * and the run reported success. That is the single worst outcome this system
 * can produce — a timeline that says an invoice reminder was sent, an owner who
 * believes it, and a customer who was never emailed. `StubToolClient` is honest
 * about this in the sandbox, where "simulated" is the point; carried into live
 * mode it becomes a lie the UI repeats.
 *
 * So this provider is deliberately the least accommodating object in the
 * runtime. Everything it cannot prove, it refuses:
 *
 *   NO CREDENTIALS  -> the constructor throws `ComposioToolsConfigError`, in
 *                      the style of `ReasonerConfigError` in lib/runtime/llm.ts
 *                      and for the same reason. Loud at wiring beats silent at
 *                      the first act step, and there is NO fallback to the stub:
 *                      a demo that looks like it sent and did not is worse than
 *                      a demo that stops.
 *   NO CONNECTION   -> `getToolClient` returns null, which `performTool` in
 *                      executor.ts already turns into "Integration X is not
 *                      connected." That null is the whole fail-closed story: a
 *                      required grant blocks activation, an optional one
 *                      degrades, and nothing reaches Composio.
 *   NO MAPPING      -> the call refuses with the sentence from
 *                      lib/runtime/tools/capabilities.ts naming why no Composio
 *                      tool exists. It never improvises a slug.
 *   NO ANSWER YET   -> an integration whose connection state has not been
 *                      loaded reads as NOT connected. Unknown is never
 *                      optimistic.
 *
 * THE SYNCHRONOUS-SEAM PROBLEM, AND WHY THERE IS A SNAPSHOT.
 *
 * `IntegrationProvider.getIntegrationStatus` and `.getToolClient` are both
 * synchronous — they are called from `performTool`, from the activation
 * checklist and from `app/api/runtime/integrations/route.ts`, none of which can
 * await. Composio's connection state lives behind an HTTP call. Those two facts
 * cannot both be honoured by asking Composio inside the getter, so this class
 * keeps a SNAPSHOT of connection state and refreshes it out of band:
 *
 *   - the constructor primes one refresh (fire and forget — `refresh()` never
 *     rejects, so there is no unhandled rejection to leak);
 *   - `ready()` is what a caller that CAN await should await before starting a
 *     run, and the pipeline/activation paths can;
 *   - `call()` awaits `ensureFresh()` itself, so an execution never runs on a
 *     snapshot older than the TTL even if nobody else ever refreshed.
 *
 * Before the first load lands, every integration reads "required". That is a
 * pessimistic answer to "is Gmail connected?" for a second or so after boot,
 * and pessimistic is the correct direction for this seam to be wrong in.
 *
 * A REFRESH THAT FAILS DOES NOT INVENT DISCONNECTIONS. If Composio is
 * unreachable, the previous snapshot stands and the error is recorded rather
 * than turned into "everything is disconnected". Two reasons: the previous
 * answer came from Composio itself and is the best evidence available, and a
 * transient outage that silently paused every workflow would be indistinguish-
 * able from an owner having revoked access. What it must NOT do is mark the
 * snapshot fresh — so the next call retries, and a genuinely dead connection
 * still fails at `tools.execute`, visibly, with Composio's own words.
 *
 * WHY THE SDK IS AN INTERFACE AND NOT AN IMPORT.
 *
 * This file names `ComposioExecutionClient`, a two-method structural type, and
 * imports nothing from `@composio/core`. The real SDK is constructed in
 * lib/runtime/tools/composio-sdk.ts, which is the only module that imports it.
 * That is not decoration:
 *
 *   - `lib/runtime/verify/tools.ts` has to compile to CommonJS under
 *     scripts/verify.mjs and run in the default sweep with no credentials and
 *     no network. An SDK import in its module graph would make that a
 *     require-of-ESM question on every developer's Node version, for no gain.
 *   - The fake client the verify target injects is fifteen lines instead of a
 *     mocked class hierarchy.
 *   - The SDK's surface changes; `execute(slug, {userId, connectedAccountId,
 *     arguments})` and `connectedAccounts.list({userIds, toolkitSlugs})` are the
 *     two shapes this runtime depends on, and pinning exactly those makes an
 *     upgrade a compile error in one file rather than a behaviour change here.
 *
 * The interface was written against the installed SDK's own declarations
 * (node_modules/@composio/core, 0.14.1) — `Tools.execute` and
 * `ConnectedAccounts.list` — not against remembered documentation.
 *
 * IDENTITY IS A CONSTRUCTOR PARAMETER, NEVER A DEFAULT.
 *
 * Composio scopes a connected account to a user id. This application uses the
 * ORGANIZATION ID for that: `initiateConnection(organizationId, toolKey)` in
 * lib/server/planner/providers/composio.ts passes it as Composio's `userId`,
 * and `app/api/integrations/[organizationId]/[toolKey]/**` is where the value
 * comes from — it is the `organization_id` column on `integration_connections`
 * and on `role_c_handoffs`, i.e. the id Role B put on the handoff this
 * workforce was built from. There is no default and no `"default"` fallback:
 * executing one organization's Gmail under another organization's id is the
 * kind of mistake that cannot be undone by rolling back a deploy.
 */

import {
  COMPOSIO_ROUTED_INTEGRATIONS,
  COMPOSIO_TOOLKIT_SLUGS,
  resolveCapability,
  toolkitSlugFor,
} from "./capabilities";
import type {
  Clock,
  IntegrationProvider,
  ToolClient,
  ToolInvocation,
  ToolResult,
} from "../types";

/* ═══════════════════════════ Errors ═══════════════════════════ */

/**
 * Thrown when live tool execution is selected but not configured. Named so
 * wiring code can tell "you have not set this up" apart from "the call failed",
 * exactly as `ReasonerConfigError` does for the AI& side.
 */
export class ComposioToolsConfigError extends Error {
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(
      `Composio tool execution is not configured. Missing: ${missing.join(", ")}. ` +
        "Set COMPOSIO_API_KEY in .env.local and pass the organization id whose " +
        "connections were made through /api/integrations/[organizationId]/**. " +
        "This provider deliberately does not fall back to StubIntegrationProvider: " +
        "a stub answers every write with { simulated: true } and the run reports " +
        "success, so a silent fallback would show an owner an email that was never " +
        "sent.",
    );
    this.name = "ComposioToolsConfigError";
    this.missing = missing;
  }
}

/* ═══════════════════════ The SDK, as this file needs it ═══════════════════════ */

/** One row of `composio.connectedAccounts.list()`. Wider in the SDK; these are
    the four fields any decision here is allowed to depend on. */
export interface ComposioConnectedAccount {
  readonly id: string;
  /** Composio's ConnectedAccountStatuses: ACTIVE, EXPIRED, INITIATED, … */
  readonly status: string;
  readonly isDisabled: boolean;
  readonly toolkit: { readonly slug: string };
}

export interface ComposioConnectedAccountPage {
  readonly items: readonly ComposioConnectedAccount[];
}

export interface ComposioConnectedAccountQuery {
  userIds?: string[];
  toolkitSlugs?: string[];
  limit?: number;
}

/** The subset of `ToolExecuteParams` this runtime sends. */
export interface ComposioToolExecuteBody {
  userId?: string;
  connectedAccountId?: string;
  arguments?: Record<string, unknown>;
  version?: string;
  dangerouslySkipVersionCheck?: boolean;
}

/** `ToolExecuteResponse`, narrowed. `successful` is the field that decides. */
export interface ComposioToolExecuteResult {
  readonly successful: boolean;
  readonly error: string | null;
  readonly data: Record<string, unknown>;
}

export interface ComposioExecutionClient {
  readonly tools: {
    execute(
      slug: string,
      body: ComposioToolExecuteBody,
    ): Promise<ComposioToolExecuteResult>;
  };
  readonly connectedAccounts: {
    list(query: ComposioConnectedAccountQuery): Promise<ComposioConnectedAccountPage>;
  };
}

/* ═══════════════════════ Connection state ═══════════════════════ */

/**
 * What one scan learned about one integration.
 *
 * `needs_approval` is carried as its own state rather than folded into
 * "required" because it is the one Composio status an owner can act on
 * immediately: the connection existed and the token died. The integrations
 * screen renders it as "a connection the runtime may not call yet", which is
 * exactly right — and `getToolClient` still returns null for it.
 */
type ConnectionState =
  | { kind: "connected"; connectedAccountId: string; status: string }
  | { kind: "needs_approval"; status: string; reason: string }
  | { kind: "disconnected"; status: string | null; reason: string };

/**
 * Composio's `ConnectedAccountStatuses`, ranked so a toolkit with more than one
 * account resolves the same way every time. Role B's `STATUS_MAP` collapses the
 * same vocabulary onto the planner's three words; this one keeps EXPIRED
 * distinct because the runtime can offer a re-authorise prompt where the
 * planner could only say "error".
 */
const STATUS_RANK = new Map<string, number>([
  ["ACTIVE", 5],
  ["EXPIRED", 4],
  ["INITIATED", 3],
  ["INITIALIZING", 2],
  ["INACTIVE", 1],
  ["FAILED", 0],
  ["REVOKED", 0],
]);

/** A status Composio has added since this build ranks below everything known,
    so it can never displace an ACTIVE account we can actually use. */
function rankOf(status: string): number {
  return STATUS_RANK.get(status) ?? -1;
}

function stateFor(account: ComposioConnectedAccount): ConnectionState {
  if (account.isDisabled) {
    return {
      kind: "disconnected",
      status: account.status,
      reason:
        "the connected account is disabled in Composio, so its credentials will " +
        "not be used even though the account still exists",
    };
  }
  if (account.status === "ACTIVE") {
    return { kind: "connected", connectedAccountId: account.id, status: account.status };
  }
  if (account.status === "EXPIRED") {
    return {
      kind: "needs_approval",
      status: account.status,
      reason:
        "the connection's credentials have expired; the owner has to re-authorise " +
        "it before the runtime can act on their behalf",
    };
  }
  if (account.status === "INITIATED" || account.status === "INITIALIZING") {
    return {
      kind: "disconnected",
      status: account.status,
      reason: "the authorisation flow was started but never finished",
    };
  }
  return {
    kind: "disconnected",
    status: account.status,
    reason: `Composio reports the connected account as ${account.status}`,
  };
}

/* ═══════════════════════════ Options ═══════════════════════════ */

export interface ComposioIntegrationProviderOptions {
  /**
   * Composio's connected-account identity. THE ORGANIZATION ID — the same value
   * `/api/integrations/[organizationId]/[toolKey]/connect` passed to
   * `initiateConnection()` when the owner linked their tools, which is the
   * `organization_id` on the Role B handoff this workforce came from. Required,
   * never defaulted; see the header.
   */
  organizationId: string;
  /** The SDK seam. Built by lib/runtime/tools/composio-sdk.ts in production,
      faked in lib/runtime/verify/tools.ts. */
  client: ComposioExecutionClient;
  /** Overrides `process.env.COMPOSIO_API_KEY`. Validated either way — see
      below for why an injected client does not excuse a missing key. */
  apiKey?: string;
  /** Injected because nothing in lib/runtime reads a wall clock directly. */
  clock?: Clock;
  /** How long a connection snapshot is trusted. Default 60s. */
  connectionTtlMs?: number;
  /**
   * Composio pins tool behaviour to a toolkit version. Keyed by INTEGRATION id
   * (`"gmail"`, not `"GMAIL_SEND_EMAIL"`). When an integration has no entry the
   * call sets `dangerouslySkipVersionCheck`, because the SDK refuses to execute
   * an unpinned "latest" otherwise and a demo that cannot run is not a safer
   * demo. Pin versions here before this is trusted with real customers: the
   * risk being skipped is a toolkit release changing an argument shape under a
   * running workforce.
   */
  toolkitVersions?: Readonly<Record<string, string>>;
  /**
   * Whether the constructor kicks off the first connection scan. Default true.
   * Tests set false to observe the pre-load state, which is the state every
   * getter has to answer pessimistically.
   */
  prime?: boolean;
}

const DEFAULT_CONNECTION_TTL_MS = 60_000;
/** One page covers it: this application makes at most one connected account
    per (organization, toolkit), and there are seven routed toolkits. */
const CONNECTION_PAGE_LIMIT = 100;

/* ═══════════════════════ The tool client ═══════════════════════ */

/**
 * Scoped to ONE integration, mirroring `StubToolClient`'s `integrationId`
 * option. The scope is not cosmetic: `performTool` looks the client up by the
 * invocation's own integration id, so a client that answered for any
 * integration would let a mis-built package call Slack through the Gmail grant.
 * All state lives on the provider; this is a binding, not a second object with
 * its own idea of what is connected.
 */
class ComposioToolClient implements ToolClient {
  private readonly integrationId: string;
  private readonly provider: ComposioIntegrationProvider;

  constructor(integrationId: string, provider: ComposioIntegrationProvider) {
    this.integrationId = integrationId;
    this.provider = provider;
  }

  async call(invocation: ToolInvocation): Promise<ToolResult> {
    return this.provider.execute(this.integrationId, invocation);
  }
}

function refuse(error: string): ToolResult {
  return { ok: false, error };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/* ═══════════════════════════ The provider ═══════════════════════════ */

export class ComposioIntegrationProvider implements IntegrationProvider {
  private readonly organizationId: string;
  private readonly client: ComposioExecutionClient;
  private readonly clock: Clock;
  private readonly connectionTtlMs: number;
  private readonly toolkitVersions: Map<string, string>;

  /** Absent means NOT YET KNOWN, which every reader treats as not connected. */
  private readonly snapshot = new Map<string, ConnectionState>();
  private loadedAt: number | null = null;
  private inFlight: Promise<void> | null = null;
  private refreshError: string | null = null;

  constructor(options: ComposioIntegrationProviderOptions) {
    const env = typeof process === "undefined" ? undefined : process.env;
    const apiKey = (
      options.apiKey ?? (typeof env?.COMPOSIO_API_KEY === "string" ? env.COMPOSIO_API_KEY : "")
    ).trim();
    const organizationId =
      typeof options.organizationId === "string" ? options.organizationId.trim() : "";

    const missing: string[] = [];
    // The key is required even when a client is injected. An injected client is
    // a TEST SEAM, not evidence that somebody dealt with authentication — and a
    // provider constructed in live mode against an unconfigured environment is
    // a wiring mistake whichever object it was handed.
    if (apiKey.length === 0) missing.push("COMPOSIO_API_KEY");
    if (organizationId.length === 0) {
      missing.push("organizationId (Composio's connected-account identity)");
    }
    if (missing.length > 0) throw new ComposioToolsConfigError(missing);

    this.organizationId = organizationId;
    this.client = options.client;
    // Default kept local rather than importing SystemClock: this is the only
    // clock read in the file and the import would be the module's only reason
    // to reach into the store.
    this.clock = options.clock ?? { now: () => new Date() };
    this.connectionTtlMs = Math.max(0, options.connectionTtlMs ?? DEFAULT_CONNECTION_TTL_MS);
    this.toolkitVersions = new Map(Object.entries(options.toolkitVersions ?? {}));

    // Fire and forget, safely: `refresh()` resolves even when the scan fails,
    // so this cannot become an unhandled rejection. Priming here is what gives
    // the SYNCHRONOUS getters any chance of a truthful answer — see the header.
    if (options.prime !== false) void this.refresh();
  }

  /* ── IntegrationProvider ── */

  /**
   * Null unless this integration is known-connected RIGHT NOW. Not "known to
   * exist", not "probably fine", not "the snapshot is still loading".
   *
   * Deliberately NOT null for a connected integration whose capabilities are
   * all unroutable (QuickBooks, today). Returning null there would make the
   * executor report "QuickBooks is not connected", which is false — it is
   * connected and Composio publishes no tool for what the plan wants. The
   * client refuses with that sentence instead, and the owner learns something
   * true.
   */
  getToolClient(integrationId: string): ToolClient | null {
    const state = this.snapshot.get(integrationId);
    if (state === undefined || state.kind !== "connected") return null;
    return new ComposioToolClient(integrationId, this);
  }

  /**
   * Only three of the four words are ever emitted. "optional" is a property of
   * the PLAN's grant (`ToolGrant.required`), not of the connection, so this
   * provider has no evidence that would justify saying it — the activation
   * checklist already reads required-ness from the grant.
   */
  getIntegrationStatus(
    integrationId: string,
  ): "connected" | "required" | "optional" | "needs_approval" {
    const state = this.snapshot.get(integrationId);
    if (state === undefined) return "required";
    if (state.kind === "connected") return "connected";
    if (state.kind === "needs_approval") return "needs_approval";
    return "required";
  }

  /* ── Connection state ── */

  /**
   * One scan of every routed toolkit for this organization.
   *
   * NEVER REJECTS. Callers include a fire-and-forget in the constructor and an
   * `await` on the hot path of every tool call; a throw from either would turn
   * a Composio blip into a crashed process or a run that failed with a stack
   * trace instead of a sentence. The failure is recorded and quoted into every
   * subsequent refusal, which is where it is actually useful.
   *
   * Concurrent callers share one in-flight scan, so a workflow firing six
   * steps at once makes one HTTP call, not six.
   */
  async refresh(): Promise<void> {
    const existing = this.inFlight;
    if (existing !== null) return existing;

    const run = (async (): Promise<void> => {
      try {
        await this.load();
      } finally {
        this.inFlight = null;
      }
    })();
    this.inFlight = run;
    return run;
  }

  /** For callers that CAN await before starting work — the pipeline and the
      activation path both can. A no-op once a scan has landed. */
  async ready(): Promise<void> {
    if (this.loadedAt === null) await this.refresh();
  }

  /** The last scan's failure, or null. Quoted into refusals; also worth
      surfacing on the integrations screen. */
  get lastError(): string | null {
    return this.refreshError;
  }

  /** Snapshot as plain data, for diagnostics. Copied — a caller holding this
      must not be able to talk the provider into thinking Gmail is connected. */
  connections(): Record<string, { status: string; connectedAccountId: string | null }> {
    const out: Record<string, { status: string; connectedAccountId: string | null }> = {};
    for (const [integrationId, state] of this.snapshot) {
      out[integrationId] = {
        status: state.kind,
        connectedAccountId: state.kind === "connected" ? state.connectedAccountId : null,
      };
    }
    return out;
  }

  private async load(): Promise<void> {
    let page: ComposioConnectedAccountPage;
    try {
      page = await this.client.connectedAccounts.list({
        userIds: [this.organizationId],
        toolkitSlugs: [...COMPOSIO_TOOLKIT_SLUGS],
        limit: CONNECTION_PAGE_LIMIT,
      });
    } catch (error) {
      // The previous snapshot stands and `loadedAt` is NOT advanced, so the
      // next call retries rather than trusting stale data for a full TTL.
      this.refreshError = describeError(error);
      console.warn(
        `[runtime/tools/composio] connection scan for organization ` +
          `${this.organizationId} failed: ${this.refreshError}`,
      );
      return;
    }

    // Best account per toolkit, chosen by rank so two accounts on one toolkit
    // resolve identically on every scan rather than by list order.
    const best = new Map<string, ComposioConnectedAccount>();
    for (const account of page.items) {
      const slug = account.toolkit.slug;
      const incumbent = best.get(slug);
      if (incumbent === undefined || rankOf(account.status) > rankOf(incumbent.status)) {
        best.set(slug, account);
      }
    }

    // Rebuilt from the ROUTED list, not from what came back: an integration
    // whose account disappeared between scans has to move to "disconnected",
    // and a snapshot that only ever gained entries could never do that.
    this.snapshot.clear();
    for (const integrationId of COMPOSIO_ROUTED_INTEGRATIONS) {
      const slug = toolkitSlugFor(integrationId);
      const account = slug === null ? undefined : best.get(slug);
      this.snapshot.set(
        integrationId,
        account === undefined
          ? {
              kind: "disconnected",
              status: null,
              reason:
                `no Composio connected account exists for organization ` +
                `${this.organizationId} on the "${slug ?? integrationId}" toolkit`,
            }
          : stateFor(account),
      );
    }

    this.refreshError = null;
    this.loadedAt = this.clock.now().getTime();
  }

  private async ensureFresh(): Promise<void> {
    if (this.loadedAt === null) {
      await this.refresh();
      return;
    }
    const age = this.clock.now().getTime() - this.loadedAt;
    if (age >= this.connectionTtlMs) await this.refresh();
  }

  /* ── Execution ── */

  /**
   * The client's entry point. Public because `ComposioToolClient` is a binding
   * rather than a separate state holder; nothing outside this module should
   * call it directly, and `boundIntegrationId` is what makes that safe if
   * somebody does.
   *
   * ORDER MATTERS. Scope and mapping are checked before anything touches the
   * network, so a capability Composio cannot perform costs zero HTTP calls and
   * refuses with the same sentence whether or not the tool is connected.
   */
  async execute(
    boundIntegrationId: string,
    invocation: ToolInvocation,
  ): Promise<ToolResult> {
    const { integrationId, operation, args } = invocation;

    if (integrationId !== boundIntegrationId) {
      return refuse(
        `This Composio client is bound to "${boundIntegrationId}" but the invocation ` +
          `names "${integrationId}". A client is scoped to one integration so a grant ` +
          `for one tool cannot be spent on another.`,
      );
    }

    const route = resolveCapability(operation);
    if (route.kind !== "tool") {
      return refuse(
        `Refusing "${operation}": ${route.reason} Nothing was sent to Composio.`,
      );
    }
    if (route.integrationId !== integrationId) {
      return refuse(
        `Refusing "${operation}": the capability map routes it to ` +
          `"${route.integrationId}", but it arrived on the "${integrationId}" client.`,
      );
    }

    await this.ensureFresh();
    const state = this.snapshot.get(integrationId);
    if (state === undefined) {
      return refuse(
        `Refusing "${operation}": the connection state for "${integrationId}" has not ` +
          `been read yet` +
          (this.refreshError === null
            ? "."
            : `, because the last Composio connection scan failed: ${this.refreshError}`),
      );
    }
    if (state.kind !== "connected") {
      return refuse(
        `Refusing "${operation}": "${integrationId}" is not connected for organization ` +
          `${this.organizationId} — ${state.reason}.`,
      );
    }

    const body: ComposioToolExecuteBody = {
      userId: this.organizationId,
      connectedAccountId: state.connectedAccountId,
      // Copied: the executor keeps this args object in the run record and in
      // any frozen approval, and an SDK that mutated it would rewrite what an
      // audit reads as "what the owner approved".
      arguments: { ...args },
    };
    const pinned = this.toolkitVersions.get(integrationId);
    if (pinned !== undefined) body.version = pinned;
    else body.dangerouslySkipVersionCheck = true;

    try {
      const result = await this.client.tools.execute(route.toolSlug, body);
      if (result.successful !== true) {
        // Composio answered and said no. Reported as a failed tool call with
        // its own words rather than as data, so the executor's retry/failure
        // policy sees a failure and the timeline does not read as a success.
        return refuse(
          `Composio refused ${route.toolSlug} for "${operation}": ` +
            `${result.error ?? "no reason given"}`,
        );
      }
      return { ok: true, data: result.data };
    } catch (error) {
      // Includes ComposioToolNotFoundError, which is what a WRONG SLUG in
      // capabilities.ts looks like from here. Naming the slug in the message is
      // the difference between a five-minute fix and an afternoon.
      return refuse(
        `Composio failed to execute ${route.toolSlug} for "${operation}" ` +
          `(organization ${this.organizationId}): ${describeError(error)}`,
      );
    }
  }
}
