/**
 * lib/runtime/verify/tools.ts — real tool execution, proved without credentials.
 *
 * WHY THIS TARGET EXISTS. `lib/runtime/tools/composio.ts` is the first object in
 * this runtime that can do something irreversible. Every other verify target
 * checks that a decision was made correctly; this one checks that a decision is
 * made AT ALL before anything leaves the process. The failure it is written
 * against is specific and has a shape the rest of the suite is blind to: a
 * capability with no Composio tool being turned into a plausible slug by a
 * string transform, executed, and answered with somebody else's data.
 *
 * The four properties under test, all of them refusals:
 *
 *   1. TOTALITY. Every capability the BrightPath fixture uses — and every one in
 *      the shared registry — has an EXPLICIT entry in capabilities.ts, either a
 *      Composio tool slug or a written reason there cannot be one. "Not in the
 *      table" is never an answer, because a table with holes is a table that
 *      improvises at the holes.
 *   2. AN UNMAPPED CAPABILITY REFUSES, and refuses before any HTTP call. There
 *      is no Composio invoice tool for HubSpot or QuickBooks; the runtime says
 *      so rather than reaching for `HUBSPOT_LIST_QUOTES_PAGE`.
 *   3. MAILCHIMP REFUSES. It has no connection path in this application, so it
 *      reports not-connected and hands out no client EVEN IF Composio claims an
 *      active account for it — the check below plants exactly that trap.
 *   4. A MISSING API KEY IS A NAMED ERROR AT CONSTRUCTION, never a quiet
 *      downgrade to the stub. `ComposioToolsConfigError`, in the shape of
 *      `ReasonerConfigError`.
 *
 * AND THE FIFTH, ADDED WITH `ApprovedPlan.organizationId`: WHOSE HANDS. A plan
 * now names the business its agents act as, and lib/runtime/tools/
 * organization.ts is the only place that turns that name into credentials. Its
 * failure mode is not a wrong answer but a PLAUSIBLE one — sending a customer's
 * mail through whichever organization the server was configured with last — and
 * nothing downstream can tell, because the send succeeds. TOOLS-11..16 are
 * written against exactly that:
 *
 *   11. A blank organization refuses, AND ORIANT_ORGANIZATION_ID does not
 *       rescue it. The check runs with the variable set, because a check that
 *       ran with it unset would pass without asking the question.
 *   12. The BrightPath fixture is the ONLY plan that reads that variable. A real
 *       organization resolves to itself, identically, whether it is set or not.
 *   13. An unresolved organization hands back a REFUSING client — not null,
 *       which would read as "the owner never connected Gmail", and never the
 *       stub, which would report a send that did not happen.
 *   14. Two organizations get two providers, each scanning and executing under
 *       its own identity; the same organization twice gets one.
 *   15. A resolvable organization with no credentials refuses by name rather
 *       than throwing a stack trace into a route handler.
 *   16. The ingest refusal and the runtime refusal are the same fact: a handoff
 *       with no `organization.id` is blocked at the seam, and the plan it would
 *       have produced is refused again at the hands.
 *
 * AND THE SIXTH, ADDED WHEN THE ALLOWLIST MOVED HERE: WHETHER THIS DEPLOYMENT MAY
 * ACT FOR THEM AT ALL. ORIANT_ALLOWED_ORGANIZATION_IDS used to be read only by
 * lib/runtime/pipeline/organization-gate.ts, which sits on three request paths —
 * while POST /api/runtime/activation, /run, /approvals, /scheduler and the
 * background poller reached live Composio execution without it ever being read.
 * `liveIntegrationProviderFor` is the one function all eight go through, so the
 * rule lives there and TOOLS-17..20 are what hold it there:
 *
 *   17. A PERMITTED organization still gets a real, live provider and still
 *       executes as itself. A check that only proved refusals would be satisfied
 *       by a function that refused everything.
 *   18. An UNPERMITTED one gets the refusing provider — its own class, not
 *       "unresolved", because the owner is perfectly well known — carrying the
 *       allowlist reason, and no SDK client is even constructed. The permitted id
 *       appears nowhere in the message, which is the gate's rule about not
 *       telling a stranger what this server would accept, kept in a string that
 *       travels further than the 403 does.
 *   19. AN EMPTY ALLOWLIST PERMITS NOTHING — unset, blank, and whitespace-only
 *       commas all mean none rather than all, for a real plan and for the demo
 *       fixture's borrowed stand-in alike. This is the direction that has to be
 *       fail-closed and the one an "if configured" shortcut would get backwards.
 *   20. TOOLS OFF IS UNRESTRICTED, whatever the allowlist says. The stub executes
 *       for the very organization the live path refuses in the same environment,
 *       because a simulated send reaches nobody — the demo, the verify targets
 *       and a clean clone all depend on it.
 *
 * NO CREDENTIALS AND NO NETWORK, which is what keeps this in the default sweep.
 * The SDK is injected as `FakeComposio`, a hand-written object satisfying
 * `ComposioExecutionClient`, and TOOLS-6 deletes COMPOSIO_API_KEY from the
 * environment for the duration of one check so the target proves the same thing
 * on a developer machine that HAS a key as on CI that does not. TOOLS-11..16
 * inject the same fake one layer further out — see "the SDK, quarantined"
 * below — and every one of them puts back whatever environment variables it
 * touched, because `npm run verify` runs all targets in one process and a check
 * that leaked ORIANT_ORGANIZATION_ID would decide a later target's result from
 * the sweep's ordering.
 *
 * WHAT THIS DOES NOT PROVE, stated plainly: that the slugs are right. A fake SDK
 * accepts `GMAIL_SEND_EMAIL` and would accept `GMAIL_SEND_MESSAGE` just as
 * happily. The slugs were read from Composio's live catalog when capabilities.ts
 * was written, and a wrong one surfaces at run time as a
 * `ComposioToolNotFoundError` naming the slug — which the provider quotes
 * verbatim. TOOLS-3 catches the mechanical half of that (a slug filed under the
 * wrong toolkit); the semantic half needs the catalog, and the catalog needs the
 * network, and this target is worth more by staying offline.
 */

import Module from "node:module";
import {
  BRIGHTPATH_DEMO_ORGANIZATION_ID,
  BRIGHTPATH_PLAN,
} from "../../plan/fixtures/brightpath";
import {
  ROLE_B_HANDOFF_RESOLVED,
  ROLE_B_HANDOFF_UNOWNED,
} from "../../plan/fixtures/role-b-handoff";
import { ingestHandoff } from "../../plan/ingest/from-handoff";
import { OPERATIONS } from "../../plan/operations";
// The variable's name, from the module that parses it, so a rename cannot leave
// these checks setting a string nothing reads. Safe to import statically — the
// gate imports one TYPE and nothing else, so it brings no `@composio/core` with
// it and does not disturb the quarantine below.
import { ALLOWED_ORGANIZATIONS_ENV } from "../pipeline/organization-gate";
import {
  hasCapabilityDecision,
  mappedCapabilities,
  resolveCapability,
  toolkitSlugFor,
  unroutableCapabilities,
} from "../tools/capabilities";
import {
  ComposioIntegrationProvider,
  ComposioToolsConfigError,
  type ComposioConnectedAccount,
  type ComposioConnectedAccountPage,
  type ComposioConnectedAccountQuery,
  type ComposioExecutionClient,
  type ComposioToolExecuteBody,
  type ComposioToolExecuteResult,
} from "../tools/composio";
import { FixedClock } from "../store";
import { StubIntegrationProvider } from "../tools";
// TYPE-ONLY, and it has to stay that way: a value import of this module would
// pull `@composio/core` into the target's module graph. See "the SDK,
// quarantined" below. TypeScript elides this line entirely.
import type { ToolsOrganization } from "../tools/organization";
import type { IntegrationProvider, ToolResult } from "../types";

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

/* ═══════════════════════════ The fake SDK ═══════════════════════════ */

interface ExecutedCall {
  slug: string;
  body: ComposioToolExecuteBody;
}

interface FakeComposioOptions {
  /** What `connectedAccounts.list` reports. */
  accounts?: ComposioConnectedAccount[];
  /** What `tools.execute` answers. A string means "throw with this message". */
  result?: ComposioToolExecuteResult | string;
}

/**
 * Fifteen honest lines instead of a mocked SDK. It records what it was asked to
 * do, which is the only way a check can assert that NOTHING was asked — the
 * property every refusal in this file turns on.
 */
class FakeComposio implements ComposioExecutionClient {
  readonly executed: ExecutedCall[] = [];
  readonly queries: ComposioConnectedAccountQuery[] = [];
  private readonly accounts: ComposioConnectedAccount[];
  private readonly result: ComposioToolExecuteResult | string;

  constructor(options: FakeComposioOptions = {}) {
    this.accounts = options.accounts ?? [];
    this.result = options.result ?? { successful: true, error: null, data: { ok: true } };
  }

  readonly tools = {
    execute: async (
      slug: string,
      body: ComposioToolExecuteBody,
    ): Promise<ComposioToolExecuteResult> => {
      this.executed.push({ slug, body });
      if (typeof this.result === "string") throw new Error(this.result);
      return this.result;
    },
  };

  readonly connectedAccounts = {
    list: async (
      query: ComposioConnectedAccountQuery,
    ): Promise<ComposioConnectedAccountPage> => {
      this.queries.push(query);
      return { items: this.accounts };
    },
  };
}

function account(
  toolkitSlug: string,
  status: string,
  id: string,
  isDisabled = false,
): ComposioConnectedAccount {
  return { id, status, isDisabled, toolkit: { slug: toolkitSlug } };
}

const ORG = "org_brightpath_demo";
const API_KEY = "ak_verify_not_a_real_key";

/** Every provider in this file shares one frozen clock: the TTL must never be
    the reason a check passes or fails. */
function provider(
  client: ComposioExecutionClient,
  overrides: { prime?: boolean } = {},
): ComposioIntegrationProvider {
  return new ComposioIntegrationProvider({
    organizationId: ORG,
    client,
    apiKey: API_KEY,
    clock: new FixedClock("2026-07-24T09:00:00+08:00"),
    prime: overrides.prime,
  });
}

/* ═══════════════ The environment, borrowed and put back ═══════════════ */

/**
 * Run `body` with these variables set — or, for `null`, unset — and restore the
 * environment afterwards, including when `body` throws.
 *
 * TOOLS-6 does this inline for one variable. Six of the organization checks need
 * one or two each, and `npm run verify` runs every target in a single process:
 * a check that left ORIANT_ORGANIZATION_ID behind would make some later target's
 * result depend on the order the sweep happened to run in, which is the one
 * failure a verification suite must not have.
 */
async function withEnv<T>(
  vars: Readonly<Record<string, string | null>>,
  body: () => Promise<T>,
): Promise<T> {
  const saved = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(vars)) {
    saved.set(name, process.env[name]);
    if (value === null) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return await body();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

/* ═══════════════ The SDK, quarantined rather than imported ═══════════════ */

/**
 * WHY THIS EXISTS. TOOLS-11..16 are about `lib/runtime/tools/organization.ts`,
 * which imports `./composio-sdk`, which is the one module in the repository that
 * imports `@composio/core`. Reaching the real SDK here would mean a real HTTP
 * call to Composio from the target that is supposed to prove nothing reaches
 * Composio, so `new Composio({ apiKey })` has to answer with a fake — the same
 * injection every other check in this file performs, moved one layer out so that
 * `createComposioClient`, `providerForOrganization` and the provider cache all
 * run for real.
 *
 * HOW. A module object carrying a fake `Composio` is written into `require.cache`
 * under the path the real package resolves to, the two modules under test are
 * loaded, and the previous cache entry is put back.
 *
 * PUT BACK, NOT LEFT — and the entry is usually NOT empty. M6 and M7 import
 * `app/api/runtime/**`, which reaches `lib/runtime/session.ts`, which imports
 * composio-sdk.ts: by the time this target runs in `npm run verify`, the real
 * package is already loaded, and the first version of this code politely
 * declined to overwrite it and built a real client against a fake key. The stub
 * therefore DISPLACES whatever is there and restores it afterwards, so which
 * `Composio` a later target sees is not decided by this one.
 *
 * Run alone — `npm run verify:tools` — nothing has loaded the package, and the
 * quarantine means this target still never reads `dist/index.mjs`. That is worth
 * keeping: `@composio/core` is ESM-only, and a `require` of ESM from the
 * CommonJS output scripts/verify.mjs produces throws ERR_REQUIRE_ESM below Node
 * 20.19/22.12 — which is why composio-sdk.ts is the only module that imports it.
 *
 * REJECTED: importing `../tools/organization` at the top of this file. Static
 * imports are emitted above every statement, so the stub could not be in place
 * first, and the checks would run against whichever SDK happened to be loaded.
 *
 * REJECTED: stubbing `../tools/composio-sdk` itself, which is shorter and would
 * leave TOOLS-14 proving nothing. The per-organization memoisation under test
 * LIVES in composio-sdk.ts, so replacing that module would replace the code
 * being verified with the assumption being verified.
 */

/** Every client `createComposioClient` built, in construction order. Length is
    itself an assertion: nothing in this target may reach the real SDK, and a
    real `Composio` would never appear here. */
const SDK_CLIENTS: FakeComposioSdk[] = [];

/** What `new Composio({ apiKey })` produces once the package is quarantined. */
class FakeComposioSdk extends FakeComposio {
  readonly apiKey: string;

  constructor(options: { apiKey: string }) {
    // The SAME one ACTIVE Gmail account for every organization, deliberately.
    // What must differ between two organizations is the `userId` their provider
    // scans and executes under; an account id that varied per organization would
    // let TOOLS-14 pass on evidence the real Composio does not supply.
    super({ accounts: [account("gmail", "ACTIVE", "ca_gmail_shared")] });
    this.apiKey = options.apiKey;
    SDK_CLIENTS.push(this);
  }
}

interface QuarantinedModules {
  organization: typeof import("../tools/organization");
  providerCache: typeof import("../tools/composio-sdk");
}

let quarantined: QuarantinedModules | null = null;

/**
 * The two modules under test, loaded once, with `@composio/core` already
 * answered.
 *
 * `await import` rather than a top-level import for one reason: the cache entry
 * has to be in place FIRST, and static imports are emitted above every statement
 * in the file. Under scripts/verify.mjs's CommonJS build TypeScript emits this
 * as a plain `require` at the point of use, so "first" means what it says.
 */
async function organizationModules(): Promise<QuarantinedModules> {
  if (quarantined !== null) return quarantined;

  if (typeof require === "undefined") {
    // Only reachable if this file is ever run as an ES module, where there is no
    // `require.cache` to seed and the import below would load the real SDK.
    // Stopping is the honest answer; loading it quietly is not.
    throw new Error(
      "lib/runtime/verify/tools.ts must run under scripts/verify.mjs's CommonJS " +
        "build: the organization checks quarantine @composio/core through " +
        "require.cache, which does not exist in an ES module.",
    );
  }

  const sdkPath = require.resolve("@composio/core");
  const displaced = require.cache[sdkPath];

  const stub = new Module(sdkPath);
  stub.filename = sdkPath;
  stub.loaded = true;
  stub.exports = { Composio: FakeComposioSdk };
  require.cache[sdkPath] = stub;

  try {
    // This target's own compiled copy of composio-sdk.js is loaded here for the
    // first time — scripts/verify.mjs compiles each target into its own temp
    // directory — so it binds the stub, permanently, however the cache is left.
    quarantined = {
      organization: await import("../tools/organization"),
      providerCache: await import("../tools/composio-sdk"),
    };
  } finally {
    if (displaced === undefined) delete require.cache[sdkPath];
    else require.cache[sdkPath] = displaced;
  }
  return quarantined;
}

/** One line of a detail string, for either arm of the union. */
function describeOrganization(resolved: ToolsOrganization): string {
  return resolved.kind === "unresolved"
    ? `unresolved("${resolved.reason.slice(0, 60)}…")`
    : `${resolved.kind}:${resolved.organizationId}`;
}

/** The one invocation every organization check sends: a real write, on the one
    integration the fake reports connected. */
const SEND: { integrationId: string; operation: string } = {
  integrationId: "gmail",
  operation: "gmail.messages.send",
};

async function trySend(target: IntegrationProvider): Promise<ToolResult | undefined> {
  return target.getToolClient(SEND.integrationId)?.call({
    integrationId: SEND.integrationId,
    operation: SEND.operation,
    args: { recipient_email: "adeline.wong@example.sg" },
    metrics: {},
  });
}

/* ═══════════════════════ Fixture capability set ═══════════════════════ */

/**
 * Every capability the BrightPath plan can reach, from all three places a plan
 * names one. Grants alone would miss a step that calls something ungranted, and
 * steps alone would miss a grant the workflows have not caught up with — and
 * either gap is a capability that arrives at the provider with no entry.
 */
function fixtureCapabilities(): string[] {
  const seen = new Set<string>();
  for (const agent of BRIGHTPATH_PLAN.agents) {
    for (const grant of agent.tools) {
      for (const operation of grant.operations) seen.add(operation);
    }
    for (const capability of agent.capabilities) {
      for (const operation of capability.backedBy) seen.add(operation);
    }
    for (const workflow of agent.workflows) {
      for (const step of workflow.steps) {
        if (step.tool !== undefined) seen.add(step.tool.operation);
      }
    }
  }
  return Array.from(seen).sort();
}

/* ═══════════════════════════ Checks ═══════════════════════════ */

export async function runTOOLSVerification(): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean, detail: string) =>
    checks.push({ name, pass, detail });

  /* ═══ TOOLS-1 the table is total over what the fixture actually uses ═══ */
  {
    const used = fixtureCapabilities();
    const undecided = used.filter((capability) => !hasCapabilityDecision(capability));
    const unknown = used.filter(
      (capability) => resolveCapability(capability).kind === "unknown",
    );

    add(
      "TOOLS-1 every capability the BrightPath fixture uses has an explicit Composio decision",
      used.length > 0 && undecided.length === 0 && unknown.length === 0,
      `${used.length} capabilities across ${BRIGHTPATH_PLAN.agents.length} agents; ` +
        `${undecided.length} with no table entry` +
        (undecided.length === 0 ? "" : ` (${undecided.join(", ")})`) +
        `, ${unknown.length} resolving to "unknown"` +
        (unknown.length === 0 ? "" : ` (${unknown.join(", ")})`),
    );
  }

  /* ═══ TOOLS-2 total over the shared registry, and never contradicting it ═══
         Stronger than TOOLS-1 and the reason a new operation in
         lib/plan/operations.ts cannot ship without a Composio decision. */
  {
    const unknown: string[] = [];
    const misfiled: string[] = [];
    for (const def of OPERATIONS) {
      const route = resolveCapability(def.id);
      if (route.kind === "unknown") {
        unknown.push(def.id);
        continue;
      }
      if (route.integrationId !== def.integrationId) {
        misfiled.push(`${def.id} -> ${route.integrationId} (registry says ${def.integrationId})`);
      }
    }
    const both = mappedCapabilities().filter((capability) =>
      unroutableCapabilities().includes(capability),
    );

    add(
      "TOOLS-2 the table is total over lib/plan/operations.ts and agrees with it about ownership",
      unknown.length === 0 && misfiled.length === 0 && both.length === 0,
      `${OPERATIONS.length} registry operations = ${mappedCapabilities().length} mapped + ` +
        `${unroutableCapabilities().length} explicitly unroutable; ` +
        `${unknown.length} undecided${unknown.length === 0 ? "" : ` (${unknown.join(", ")})`}, ` +
        `${misfiled.length} on the wrong integration${misfiled.length === 0 ? "" : ` (${misfiled.join("; ")})`}, ` +
        `${both.length} listed in both tables`,
    );
  }

  /* ═══ TOOLS-3 a mapped slug belongs to the toolkit it is filed under ═══
         The mechanical half of "is the slug right": Composio prefixes every
         tool with its toolkit, so GMAIL_* under slack is a typo this catches
         without asking the catalog anything. */
  {
    const wrong: string[] = [];
    for (const capability of mappedCapabilities()) {
      const route = resolveCapability(capability);
      if (route.kind !== "tool") {
        wrong.push(`${capability} did not resolve to a tool`);
        continue;
      }
      const expected = `${route.toolkitSlug.toUpperCase()}_`;
      if (!route.toolSlug.startsWith(expected)) {
        wrong.push(`${capability} -> ${route.toolSlug} (expected prefix ${expected})`);
      }
      if (toolkitSlugFor(route.integrationId) !== route.toolkitSlug) {
        wrong.push(`${capability} resolved toolkit ${route.toolkitSlug}, table says otherwise`);
      }
    }

    add(
      "TOOLS-3 every mapped tool slug carries its own toolkit's prefix",
      wrong.length === 0,
      `${mappedCapabilities().length} mapped capabilities checked; ` +
        `${wrong.length} mismatched${wrong.length === 0 ? "" : `: ${wrong.join("; ")}`}`,
    );
  }

  /* ═══ TOOLS-4 an unmapped capability refuses, before any HTTP call ═══
         QuickBooks is CONNECTED here on purpose. The refusal must come from the
         absent tool, not from an absent connection — otherwise the check would
         pass for the wrong reason and stop protecting anything the day
         QuickBooks is linked for real. */
  {
    const fake = new FakeComposio({
      accounts: [account("quickbooks", "ACTIVE", "ca_qb"), account("gmail", "ACTIVE", "ca_gmail")],
    });
    const p = provider(fake);
    await p.ready();

    // Connected, and every capability it has is unroutable. The client is still
    // issued — reporting "QuickBooks is not connected" would be false — and the
    // refusal names the real reason.
    const quickbooks = p.getToolClient("quickbooks");
    const noTool = await quickbooks?.call({
      integrationId: "quickbooks",
      operation: "quickbooks.invoices.list",
      args: { status: "overdue" },
      metrics: {},
    });

    // In no table at all: the registry and capabilities.ts have drifted, or an
    // agent package invented an operation. Either way, nothing is looked up.
    const stranger = await p.getToolClient("gmail")?.call({
      integrationId: "gmail",
      operation: "acme.widgets.frobnicate",
      args: {},
      metrics: {},
    });

    // A grant for one tool spent on another: the client is scoped, so it
    // refuses rather than reaching for Slack through the Gmail connection.
    const crossed = await p.getToolClient("gmail")?.call({
      integrationId: "slack",
      operation: "slack.messages.post",
      args: { channel: "#field-ops" },
      metrics: {},
    });

    add(
      "TOOLS-4 unmapped, unknown and cross-integration calls all refuse without executing anything",
      quickbooks !== null &&
        noTool?.ok === false &&
        (noTool.error ?? "").includes("QuickBooks toolkit") &&
        stranger?.ok === false &&
        (stranger.error ?? "").includes("lib/plan/operations.ts") &&
        crossed?.ok === false &&
        (crossed.error ?? "").includes("bound to") &&
        fake.executed.length === 0,
      `client for connected QuickBooks: ${quickbooks === null ? "null (WRONG — it is connected)" : "issued"}; ` +
        `quickbooks.invoices.list -> ${noTool?.ok === false ? "refused" : "ACCEPTED"}; ` +
        `acme.widgets.frobnicate -> ${stranger?.ok === false ? "refused" : "ACCEPTED"}; ` +
        `slack.messages.post on the gmail client -> ${crossed?.ok === false ? "refused" : "ACCEPTED"}; ` +
        `tools.execute called ${fake.executed.length} time(s) (must be 0)`,
    );
  }

  /* ═══ TOOLS-5 mailchimp refuses even when Composio says it is connected ═══
         The trap: the fake reports an ACTIVE mailchimp account. If the refusal
         were incidental — "we never saw one" — this check would go red. */
  {
    const fake = new FakeComposio({
      accounts: [account("mailchimp", "ACTIVE", "ca_mc"), account("gmail", "ACTIVE", "ca_gmail")],
    });
    const p = provider(fake);
    await p.ready();

    const status = p.getIntegrationStatus("mailchimp");
    const client = p.getToolClient("mailchimp");
    const route = resolveCapability("mailchimp.campaigns.publish");
    const scanned = fake.queries[0]?.toolkitSlugs ?? [];

    add(
      "TOOLS-5 mailchimp reports not-connected and refuses, with an ACTIVE account on offer",
      status === "required" &&
        client === null &&
        route.kind === "unroutable" &&
        !scanned.includes("mailchimp") &&
        p.getIntegrationStatus("gmail") === "connected",
      `status=${status} (must be "required"), client=${client === null ? "null" : "ISSUED"}, ` +
        `mailchimp.campaigns.publish route=${route.kind}, ` +
        `the connection scan asked about [${scanned.join(", ")}] — mailchimp absent, ` +
        `while gmail in the same response reads ${p.getIntegrationStatus("gmail")}`,
    );
  }

  /* ═══ TOOLS-6 no credentials is a named error at construction ═══ */
  {
    const saved = process.env.COMPOSIO_API_KEY;
    delete process.env.COMPOSIO_API_KEY;

    let missingKey: unknown = null;
    try {
      new ComposioIntegrationProvider({ organizationId: ORG, client: new FakeComposio() });
    } catch (error) {
      missingKey = error;
    }

    let missingOrg: unknown = null;
    try {
      new ComposioIntegrationProvider({
        organizationId: "   ",
        client: new FakeComposio(),
        apiKey: API_KEY,
      });
    } catch (error) {
      missingOrg = error;
    }

    if (saved === undefined) delete process.env.COMPOSIO_API_KEY;
    else process.env.COMPOSIO_API_KEY = saved;

    const keyError = missingKey instanceof ComposioToolsConfigError ? missingKey : null;
    const orgError = missingOrg instanceof ComposioToolsConfigError ? missingOrg : null;

    add(
      "TOOLS-6 a missing key or organization throws ComposioToolsConfigError, never a stub",
      keyError !== null &&
        keyError.name === "ComposioToolsConfigError" &&
        keyError.missing.includes("COMPOSIO_API_KEY") &&
        keyError.message.includes("does not fall back") &&
        orgError !== null &&
        orgError.missing.some((entry) => entry.startsWith("organizationId")),
      `no key -> ${keyError === null ? String(missingKey) : `${keyError.name} missing=[${keyError.missing.join(", ")}]`}; ` +
        `blank organization -> ${orgError === null ? String(missingOrg) : `${orgError.name} missing=[${orgError.missing.join(", ")}]`}`,
    );
  }

  /* ═══ TOOLS-7 an unread snapshot is not an optimistic one ═══
         `getIntegrationStatus` and `getToolClient` are synchronous seams over an
         HTTP fact. Before the first scan lands they must answer pessimistically,
         because the alternative is handing out a client for a connection nobody
         has confirmed exists. */
  {
    const fake = new FakeComposio({ accounts: [account("gmail", "ACTIVE", "ca_gmail")] });
    const p = provider(fake, { prime: false });

    const statusBefore = p.getIntegrationStatus("gmail");
    const clientBefore = p.getToolClient("gmail");
    const scansBefore = fake.queries.length;

    await p.ready();
    const statusAfter = p.getIntegrationStatus("gmail");
    const clientAfter = p.getToolClient("gmail");

    add(
      "TOOLS-7 an integration whose state has not been read yet is not connected",
      statusBefore === "required" &&
        clientBefore === null &&
        scansBefore === 0 &&
        statusAfter === "connected" &&
        clientAfter !== null,
      `before the scan: status=${statusBefore} client=${clientBefore === null ? "null" : "ISSUED"} ` +
        `(${scansBefore} scans made); after: status=${statusAfter} ` +
        `client=${clientAfter === null ? "null" : "issued"}`,
    );
  }

  /* ═══ TOOLS-8 a connected integration executes the mapped slug, as the org ═══
         The identity is the point: Composio scopes a connected account to a user
         id, this application uses the organization id, and executing one
         business's Gmail under another's is not undoable. */
  {
    const fake = new FakeComposio({
      accounts: [account("gmail", "ACTIVE", "ca_gmail_9")],
      result: { successful: true, error: null, data: { id: "msg-1", threadId: "t-1" } },
    });
    const p = provider(fake);
    await p.ready();

    const args: Record<string, unknown> = { recipient_email: "adeline.wong@example.sg" };
    const result = await p.getToolClient("gmail")?.call({
      integrationId: "gmail",
      operation: "gmail.messages.send",
      args,
      metrics: { "invoice.amount": 95 },
    });
    const sent = fake.executed[0];
    // Mutating the caller's args after the call must not change what was sent:
    // the executor keeps this object in the run record and in frozen approvals.
    args["recipient_email"] = "somebody-else@example.sg";

    add(
      "TOOLS-8 a connected integration executes the mapped slug under the organization's identity",
      result?.ok === true &&
        fake.executed.length === 1 &&
        sent?.slug === "GMAIL_SEND_EMAIL" &&
        sent.body.userId === ORG &&
        sent.body.connectedAccountId === "ca_gmail_9" &&
        sent.body.arguments?.["recipient_email"] === "adeline.wong@example.sg" &&
        sent.body.dangerouslySkipVersionCheck === true,
      `gmail.messages.send -> ${sent?.slug ?? "NOTHING"} ` +
        `userId=${sent?.body.userId} connectedAccountId=${sent?.body.connectedAccountId} ` +
        `args.recipient_email=${String(sent?.body.arguments?.["recipient_email"])} ` +
        `(caller mutated theirs afterwards), ok=${String(result?.ok)}`,
    );
  }

  /* ═══ TOOLS-9 expired and disabled are not connected ═══
         EXPIRED becomes "needs_approval" because the owner can act on it; both
         still hand out no client, which is the only thing that gates a call. */
  {
    const fake = new FakeComposio({
      accounts: [
        account("gmail", "EXPIRED", "ca_gmail_dead"),
        account("slack", "ACTIVE", "ca_slack_off", true),
        account("hubspot", "INITIATED", "ca_hs_half"),
      ],
    });
    const p = provider(fake);
    await p.ready();

    const gmail = p.getIntegrationStatus("gmail");
    const slack = p.getIntegrationStatus("slack");
    const hubspot = p.getIntegrationStatus("hubspot");
    const issued = ["gmail", "slack", "hubspot"].filter(
      (integrationId) => p.getToolClient(integrationId) !== null,
    );

    add(
      "TOOLS-9 expired, disabled and half-finished connections hand out no client",
      gmail === "needs_approval" &&
        slack === "required" &&
        hubspot === "required" &&
        issued.length === 0,
      `EXPIRED gmail=${gmail} (re-auth is something an owner can do, so it is not ` +
        `flattened into "required"), disabled slack=${slack}, INITIATED hubspot=${hubspot}; ` +
        `clients issued: ${issued.length === 0 ? "none" : issued.join(", ")} (must be none)`,
    );
  }

  /* ═══ TOOLS-10 Composio's own failure is a failed call, not data ═══
         `successful: false` carries a 200 response. Reading it as data would put
         an error object into the run context and let the next step reason over
         it as though the email had gone out. */
  {
    const refusing = new FakeComposio({
      accounts: [account("slack", "ACTIVE", "ca_slack")],
      result: { successful: false, error: "channel_not_found", data: {} },
    });
    const p1 = provider(refusing);
    await p1.ready();
    const refused = await p1.getToolClient("slack")?.call({
      integrationId: "slack",
      operation: "slack.messages.post",
      args: { channel: "#nope" },
      metrics: {},
    });

    const throwing = new FakeComposio({
      accounts: [account("slack", "ACTIVE", "ca_slack")],
      result: "ComposioToolNotFoundError: SLACK_SEND_MESSAGE",
    });
    const p2 = provider(throwing);
    await p2.ready();
    let threw = false;
    let thrownResult: ToolResult | undefined;
    try {
      thrownResult = await p2.getToolClient("slack")?.call({
        integrationId: "slack",
        operation: "slack.messages.post",
        args: {},
        metrics: {},
      });
    } catch {
      threw = true;
    }

    add(
      "TOOLS-10 a Composio refusal and a Composio throw both come back as failed tool calls",
      refused?.ok === false &&
        (refused.error ?? "").includes("channel_not_found") &&
        (refused.error ?? "").includes("SLACK_SEND_MESSAGE") &&
        threw === false &&
        thrownResult?.ok === false &&
        (thrownResult.error ?? "").includes("SLACK_SEND_MESSAGE"),
      `successful:false -> ok=${String(refused?.ok)} "${(refused?.error ?? "").slice(0, 70)}..."; ` +
        `SDK throw -> ${threw ? "PROPAGATED (the executor would see a stack, not a refusal)" : `ok=${String(thrownResult?.ok)}`} ` +
        `"${(thrownResult?.error ?? "").slice(0, 70)}..."`,
    );
  }

  /* ═══════════════════ Whose hands: organization.ts ═══════════════════
         Nothing above this line has loaded lib/runtime/tools/organization.ts,
         and it is loaded here with `@composio/core` already answered from
         require.cache — see "the SDK, quarantined". */
  const { organization: routing, providerCache } = await organizationModules();

  /* ═══ TOOLS-11 a plan with no organization gets nobody's connections ═══
         RUN WITH ORIANT_ORGANIZATION_ID SET, on purpose. A blank id falling
         through to the environment is the original bug wearing the new field's
         name, and a check that ran with the variable unset would go green
         without ever asking. */
  {
    const ELSEWHERE = "org-somebody-elses-gmail";
    const sdkBefore = SDK_CLIENTS.length;
    const seen = await withEnv({ ORIANT_ORGANIZATION_ID: ELSEWHERE }, async () => ({
      empty: routing.resolveToolsOrganization(""),
      // Whitespace is not a name either — `resolveToolsOrganization` trims
      // before it decides, so " " must land where "" lands.
      spaces: routing.resolveToolsOrganization("  \t\n "),
      blankProvider: routing.liveIntegrationProviderFor(""),
    }));
    const { empty, spaces, blankProvider } = seen;
    const refusal = await trySend(blankProvider);

    add(
      "TOOLS-11 a plan that names no organization is refused, and ORIANT_ORGANIZATION_ID does not rescue it",
      empty.kind === "unresolved" &&
        spaces.kind === "unresolved" &&
        empty.reason.includes("ApprovedPlan.organizationId is empty") &&
        // The borrowed value appears nowhere in the answer: not as the
        // organization, and not quoted into the reason as a suggestion.
        !JSON.stringify(seen).includes(ELSEWHERE) &&
        blankProvider instanceof routing.UnresolvedOrganizationProvider &&
        refusal?.ok === false &&
        SDK_CLIENTS.length === sdkBefore,
      `"" -> ${describeOrganization(empty)}; "  \\t\\n " -> ${describeOrganization(spaces)}; ` +
        `with ORIANT_ORGANIZATION_ID=${ELSEWHERE} the value appears in the answer: ` +
        `${JSON.stringify(seen).includes(ELSEWHERE) ? "YES (it was borrowed)" : "no"}; ` +
        `${SEND.operation} -> ${refusal?.ok === false ? "refused" : "ACCEPTED"}; ` +
        `Composio clients constructed: ${SDK_CLIENTS.length - sdkBefore} (must be 0)`,
    );
  }

  /* ═══ TOOLS-12 the fixture is the only plan that reads the environment ═══
         THE LOAD-BEARING PROPERTY of lib/runtime/tools/organization.ts, and the
         one that decides whether the fix is real or a rename: a deployment that
         still has the old ORIANT_ORGANIZATION_ID in place must not be able to
         redirect a real customer's plan with it. */
  {
    // The organization id on Role B's actual handoff, not an invented one.
    const REAL = "1647df28-64de-4c69-b681-d20c3170b88b";
    const BORROWED = "org-the-demo-may-borrow";
    const resolveBoth = async () => ({
      fixture: routing.resolveToolsOrganization(BRIGHTPATH_DEMO_ORGANIZATION_ID),
      real: routing.resolveToolsOrganization(REAL),
    });

    const set = await withEnv({ ORIANT_ORGANIZATION_ID: BORROWED }, resolveBoth);
    const unset = await withEnv({ ORIANT_ORGANIZATION_ID: null }, resolveBoth);

    add(
      "TOOLS-12 only the BrightPath fixture reads ORIANT_ORGANIZATION_ID; a real plan never does",
      set.fixture.kind === "fixture_fallback" &&
        set.fixture.organizationId === BORROWED &&
        unset.fixture.kind === "unresolved" &&
        unset.fixture.reason.includes(routing.FIXTURE_ORGANIZATION_ENV) &&
        set.real.kind === "plan" &&
        set.real.organizationId === REAL &&
        // The whole property in one line: for a plan that is not the fixture,
        // the variable is not an input, so setting it changes nothing.
        JSON.stringify(set.real) === JSON.stringify(unset.real),
      `with ${routing.FIXTURE_ORGANIZATION_ENV}=${BORROWED}: fixture -> ` +
        `${describeOrganization(set.fixture)}, real plan -> ${describeOrganization(set.real)}; ` +
        `with it unset: fixture -> ${describeOrganization(unset.fixture)}, real plan -> ` +
        `${describeOrganization(unset.real)}; the real plan's answer is ` +
        `${JSON.stringify(set.real) === JSON.stringify(unset.real) ? "identical either way" : "DIFFERENT (the environment reached a customer's plan)"}`,
    );
  }

  /* ═══ TOOLS-13 the refusal is a client, not a null and not a stub ═══
         Three wrong answers are available here and each is worse than refusing:
         null reads downstream as "the owner never connected Gmail", "connected"
         lets a workforce go live on credentials nobody could resolve, and the
         stub answers the write with { simulated: true } and reports success. */
  {
    const blankProvider = await withEnv({ ORIANT_ORGANIZATION_ID: null }, async () =>
      routing.liveIntegrationProviderFor(""),
    );
    const integrations = ["gmail", "slack", "google-calendar", "quickbooks"];
    const statuses = integrations.map((id) => blankProvider.getIntegrationStatus(id));
    const clients = integrations.map((id) => blankProvider.getToolClient(id));
    const refusal = await trySend(blankProvider);
    const error = refusal?.ok === false ? refusal.error ?? "" : "";

    add(
      "TOOLS-13 an unresolved organization hands out a refusing client, never null and never the stub",
      blankProvider instanceof routing.UnresolvedOrganizationProvider &&
        !(blankProvider instanceof ComposioIntegrationProvider) &&
        !(blankProvider instanceof StubIntegrationProvider) &&
        statuses.every((status) => status === "required") &&
        clients.every((client) => client !== null) &&
        refusal?.ok === false &&
        error.includes(SEND.operation) &&
        error.includes("Nothing was sent to Composio") &&
        error.includes("no other organization's connections were used in its place"),
      `provider=${blankProvider.constructor.name}; statuses=[${statuses.join(", ")}] ` +
        `(all must be "required" — "connected" would let activation through); ` +
        `clients issued ${clients.filter((client) => client !== null).length}/${clients.length} ` +
        `(null would read as "not connected", which is a different problem with a ` +
        `different fix); refusal="${error.slice(0, 90)}..."`,
    );
  }

  /* ═══ TOOLS-14 one provider per organization, each acting as itself ═══
         The memoisation is not an optimisation: `getToolClient` answers
         synchronously off a connection snapshot, so a provider rebuilt per call
         would answer "required" forever. And the key is the point — a cache with
         one entry, or none, is the process-wide provider this change removes. */
  {
    const ACME = "org-acme-plumbing";
    const GLOBEX = "org-globex-aircon";

    const seen = await withEnv(
      {
        COMPOSIO_API_KEY: API_KEY,
        ORIANT_ORGANIZATION_ID: "org-must-not-be-consulted",
        // BOTH PERMITTED, because this check is about the memoisation and not
        // about the allowlist: `liveIntegrationProviderFor` refuses an
        // unpermitted organization before it builds anything, so without this
        // line the two providers below would be refusals and TOOLS-14 would go
        // green on evidence that no client was ever cached. TOOLS-18 is where
        // the refusal is the subject.
        [ALLOWED_ORGANIZATIONS_ENV]: `${ACME}, ${GLOBEX}`,
      },
      async () => {
        // Reset on the way in AND on the way out: this target must neither
        // inherit a provider from an earlier check nor leave a fake-backed one
        // on globalThis for anything that runs after it.
        providerCache.resetOrganizationProviders();
        const sdkBefore = SDK_CLIENTS.length;

        const acme = routing.liveIntegrationProviderFor(ACME);
        const acmeAgain = routing.liveIntegrationProviderFor(ACME);
        const globex = routing.liveIntegrationProviderFor(GLOBEX);
        for (const built of [acme, globex]) {
          if (built instanceof ComposioIntegrationProvider) await built.ready();
        }

        const acmeSent = await trySend(acme);
        const globexSent = await trySend(globex);
        const clients = SDK_CLIENTS.slice(sdkBefore);

        providerCache.resetOrganizationProviders();
        return { acme, acmeAgain, globex, acmeSent, globexSent, clients };
      },
    );

    // What each fake SDK client was actually asked, in its own words: who the
    // connection scan was for, and who the send went out as.
    const scannedAs = seen.clients.map((client) => (client.queries[0]?.userIds ?? []).join("+"));
    const sentAs = seen.clients.map((client) =>
      client.executed.map((call) => String(call.body.userId)).join("+"),
    );

    add(
      "TOOLS-14 two organizations get two providers, each acting as itself; the same one twice gets one",
      seen.acme === seen.acmeAgain &&
        seen.acme !== seen.globex &&
        seen.acme instanceof ComposioIntegrationProvider &&
        seen.globex instanceof ComposioIntegrationProvider &&
        seen.clients.length === 2 &&
        seen.clients.every((client) => client.apiKey === API_KEY) &&
        seen.acmeSent?.ok === true &&
        seen.globexSent?.ok === true &&
        scannedAs.join(" | ") === `${ACME} | ${GLOBEX}` &&
        sentAs.join(" | ") === `${ACME} | ${GLOBEX}`,
      `${ACME} asked twice -> ${seen.acme === seen.acmeAgain ? "one provider" : "TWO (the snapshot is rebuilt per call)"}; ` +
        `${GLOBEX} -> ${seen.acme === seen.globex ? "THE SAME OBJECT (one organization per process)" : "its own provider"}; ` +
        `SDK clients built: ${seen.clients.length} (must be 2); ` +
        `connection scans ran as [${scannedAs.join(" | ")}], sends went out as [${sentAs.join(" | ")}] ` +
        `— both must read "${ACME} | ${GLOBEX}", never org-must-not-be-consulted`,
    );
  }

  /* ═══ TOOLS-15 no credentials is a refusal, not a stack trace ═══
         session.ts already asserts COMPOSIO_API_KEY at construction, so by the
         time a plan is being executed a missing key means it went away
         mid-flight. That is one plan's problem, not the deployment's, and a
         throw here would take out the route handler serving it. */
  {
    const ACME = "org-acme-plumbing";
    const seen = await withEnv(
      {
        COMPOSIO_API_KEY: null,
        ORIANT_ORGANIZATION_ID: null,
        // PERMITTED, so the refusal this check reads can only be about the
        // missing key. `liveIntegrationProviderFor` asks about authority before
        // credentials — an operator sent to fix a credential for an id they were
        // never allowed to use is being sent to fix the wrong thing — so leaving
        // this unset would make the check pass for the other reason entirely.
        [ALLOWED_ORGANIZATIONS_ENV]: ACME,
      },
      async () => {
        providerCache.resetOrganizationProviders();
        const sdkBefore = SDK_CLIENTS.length;
        let resolved: IntegrationProvider | null = null;
        let threw: unknown = null;
        try {
          resolved = routing.liveIntegrationProviderFor(ACME);
        } catch (error) {
          threw = error;
        }
        const built = SDK_CLIENTS.length - sdkBefore;
        providerCache.resetOrganizationProviders();
        return { resolved, threw, built };
      },
    );
    // Read through `IntegrationProvider`, before the `instanceof` below narrows
    // to the concrete class: this is the seam the activation checklist calls,
    // and the status it gets is what decides whether a workforce may go live.
    const status = seen.resolved?.getIntegrationStatus("gmail");
    const refusal = seen.resolved === null ? undefined : await trySend(seen.resolved);
    const error = refusal?.ok === false ? refusal.error ?? "" : "";

    add(
      "TOOLS-15 a resolvable organization with no credentials refuses by name instead of throwing",
      seen.threw === null &&
        seen.resolved instanceof routing.UnresolvedOrganizationProvider &&
        seen.built === 0 &&
        status === "required" &&
        refusal?.ok === false &&
        error.includes(ACME) &&
        error.includes("COMPOSIO_API_KEY"),
      `liveIntegrationProviderFor("${ACME}") with no key -> ` +
        `${seen.threw !== null ? `THREW ${String(seen.threw)}` : seen.resolved?.constructor.name ?? "null"}; ` +
        `SDK clients built: ${seen.built} (must be 0 — the key is checked before the client); ` +
        `refusal names the organization and the variable: ` +
        `${error.includes(ACME) && error.includes("COMPOSIO_API_KEY") ? "yes" : `NO ("${error.slice(0, 70)}...")`}`,
    );
  }

  /* ═══ TOOLS-16 the ingest refusal and the runtime refusal are one fact ═══
         `organization_unresolved` is the only blocking gap Role B's real payload
         never produces, so without ROLE_B_HANDOFF_UNOWNED both halves of this
         are code nothing executes. The corrected handoff is ingested alongside
         it as the control: the two fixtures differ in `organization.id` and
         nothing else, so the refusal cannot be coming from somewhere else. */
  {
    const unowned = ingestHandoff(ROLE_B_HANDOFF_UNOWNED);
    const owned = ingestHandoff(ROLE_B_HANDOFF_RESOLVED);
    const gap = unowned.gaps.find((entry) => entry.code === "organization_unresolved");

    // Set, again on purpose: the plan reaches the runtime with a blank owner and
    // the deployment has an organization configured. It still gets nobody's.
    const hands = await withEnv(
      { ORIANT_ORGANIZATION_ID: "org-somebody-elses-gmail" },
      async () => routing.liveIntegrationProviderFor(unowned.plan.organizationId),
    );
    const refusal = await trySend(hands);

    add(
      "TOOLS-16 a handoff with no organization is refused at ingest and refused again at the hands",
      gap !== undefined &&
        gap.severity === "blocking" &&
        gap.resolution.includes("organization.id") &&
        unowned.runnable === false &&
        unowned.plan.organizationId === "" &&
        owned.plan.organizationId.length > 0 &&
        owned.gaps.every((entry) => entry.code !== "organization_unresolved") &&
        hands instanceof routing.UnresolvedOrganizationProvider &&
        refusal?.ok === false,
      `ingest: runnable=${unowned.runnable} gap=${gap === undefined ? "NONE (the refusal is dead code)" : `${gap.code}/${gap.severity}`} ` +
        `plan.organizationId="${unowned.plan.organizationId}"; the same fixture WITH an id -> ` +
        `"${owned.plan.organizationId}" and no such gap; runtime: ` +
        `${hands.constructor.name}, ${SEND.operation} -> ${refusal?.ok === false ? "refused" : "ACCEPTED"}`,
    );
  }

  /* ═════════ May this deployment act for them: the allowlist ═════════
         ORIANT_ALLOWED_ORGANIZATION_IDS is enforced in
         `liveIntegrationProviderFor`, the one function that hands out a live
         Composio provider — see the header for the five paths that reached live
         execution while it was read on three routes only. */

  /* ═══ TOOLS-17 a permitted organization still gets live hands ═══
         THE CHECK THAT STOPS THE OTHER THREE PASSING FOR NOTHING. A function
         that refused every organization would satisfy TOOLS-18, -19 and -20 and
         break every deployment that has ever been configured correctly. The
         allowlist here is deliberately two entries with sloppy whitespace,
         because that is the shape an operator's real value has. */
  {
    const ACME = "org-acme-plumbing";
    const OTHER = "org-globex-aircon";
    const seen = await withEnv(
      {
        COMPOSIO_API_KEY: API_KEY,
        ORIANT_ORGANIZATION_ID: null,
        [ALLOWED_ORGANIZATIONS_ENV]: `  ${OTHER} ,  ${ACME}  `,
      },
      async () => {
        providerCache.resetOrganizationProviders();
        const sdkBefore = SDK_CLIENTS.length;
        const resolved = routing.liveIntegrationProviderFor(ACME);
        if (resolved instanceof ComposioIntegrationProvider) await resolved.ready();
        const sent = await trySend(resolved);
        const status = resolved.getIntegrationStatus("gmail");
        const clients = SDK_CLIENTS.slice(sdkBefore);
        providerCache.resetOrganizationProviders();
        return { resolved, sent, status, clients };
      },
    );
    // Who the send actually went out as. A provider that was live but acting as
    // the wrong organization would pass every other clause in this check.
    const sentAs = seen.clients
      .flatMap((client) => client.executed.map((call) => String(call.body.userId)))
      .join("+");

    add(
      "TOOLS-17 an organization on the allowlist gets a live provider and executes as itself",
      seen.resolved instanceof ComposioIntegrationProvider &&
        seen.clients.length === 1 &&
        seen.status === "connected" &&
        seen.sent?.ok === true &&
        sentAs === ACME,
      `liveIntegrationProviderFor("${ACME}") with the allowlist reading ` +
        `"  ${OTHER} ,  ${ACME}  " -> ${seen.resolved.constructor.name} ` +
        `(ComposioIntegrationProvider required — a refusal here means the trimming ` +
        `or the membership test is wrong); gmail=${seen.status}; ` +
        `${SEND.operation} -> ${seen.sent?.ok === true ? "executed" : "REFUSED"} as ` +
        `[${sentAs}] (must be ${ACME}); SDK clients built: ${seen.clients.length} (must be 1)`,
    );
  }

  /* ═══ TOOLS-18 an unpermitted organization is refused at the hands ═══
         THE WHOLE POINT OF MOVING THE RULE HERE. This is the refusal
         /api/runtime/activation, /run, /approvals, /scheduler and the poller
         get — none of them ever consulted the allowlist, and none of them had
         to change. Nothing is constructed, nothing is sent, and the message
         names the id and the variable rather than the list. */
  {
    const ACME = "org-acme-plumbing";
    const PERMITTED = "org-the-only-one-this-server-allows";
    const seen = await withEnv(
      {
        COMPOSIO_API_KEY: API_KEY,
        ORIANT_ORGANIZATION_ID: null,
        [ALLOWED_ORGANIZATIONS_ENV]: PERMITTED,
      },
      async () => {
        providerCache.resetOrganizationProviders();
        const sdkBefore = SDK_CLIENTS.length;
        const resolved = routing.liveIntegrationProviderFor(ACME);
        const sent = await trySend(resolved);
        const status = resolved.getIntegrationStatus("gmail");
        const client = resolved.getToolClient("gmail");
        const built = SDK_CLIENTS.length - sdkBefore;
        providerCache.resetOrganizationProviders();
        return { resolved, sent, status, client, built };
      },
    );
    const unpermitted =
      seen.resolved instanceof routing.UnpermittedOrganizationProvider ? seen.resolved : null;
    const error = seen.sent?.ok === false ? seen.sent.error ?? "" : "";
    // THE COUNT, NEVER THE IDS — the same discretion the 403 exercises, kept in a
    // string that travels further than the 403 does: into a run record, an
    // approval, and an inbox.
    const leaked = error.includes(PERMITTED);

    add(
      "TOOLS-18 an organization the allowlist does not permit gets a refusing provider naming the variable, and no client is built",
      unpermitted !== null &&
        unpermitted.refusal === "organization_not_allowlisted" &&
        !(seen.resolved instanceof ComposioIntegrationProvider) &&
        !(seen.resolved instanceof StubIntegrationProvider) &&
        seen.built === 0 &&
        seen.status === "required" &&
        // Not null: null reads downstream as "the owner never connected Gmail",
        // which is a different problem with a different, useless fix.
        seen.client !== null &&
        seen.sent?.ok === false &&
        error.includes(ACME) &&
        error.includes(ALLOWED_ORGANIZATIONS_ENV) &&
        error.includes("Nothing was sent to Composio") &&
        !leaked,
      `provider=${seen.resolved.constructor.name} refusal=${unpermitted?.refusal ?? "n/a"}; ` +
        `gmail=${seen.status} (must be "required" — "connected" would let activation ` +
        `through), client=${seen.client === null ? "NULL" : "issued"}; SDK clients built: ` +
        `${seen.built} (must be 0); ${SEND.operation} -> ` +
        `${seen.sent?.ok === false ? "refused" : "ACCEPTED"}; the message names the refused ` +
        `id and ${ALLOWED_ORGANIZATIONS_ENV}: ` +
        `${error.includes(ACME) && error.includes(ALLOWED_ORGANIZATIONS_ENV) ? "yes" : "NO"}, ` +
        `and the permitted id ${leaked ? "LEAKED INTO IT" : "never appears"}; ` +
        `"${error.slice(0, 90)}..."`,
    );
  }

  /* ═══ TOOLS-19 an empty allowlist permits nothing, however it is spelled ═══
         THE DIRECTION THAT HAS TO FAIL CLOSED. "Unconfigured means unrestricted"
         is the reading that would make every deployment that has not heard of
         this variable an open door, and it is what an `if (allowed.size > 0)`
         shortcut written for convenience would silently mean. Three spellings of
         empty, and two subjects: a real ingested organization, and the demo
         fixture's borrowed stand-in — which is checked on the id that would
         actually reach Composio, not on the fixture's own name. */
  {
    const REAL = "1647df28-64de-4c69-b681-d20c3170b88b";
    const BORROWED = "org-the-demo-would-borrow";
    const spellings: ReadonlyArray<readonly [string, string | null]> = [
      ["unset", null],
      ["empty string", ""],
      ["separators only", " , ,  "],
    ];

    let refusedEverywhere = true;
    let built = 0;
    let fixtureNamesItsSource = true;
    const outcomes: string[] = [];

    for (const [label, value] of spellings) {
      const seen = await withEnv(
        {
          COMPOSIO_API_KEY: API_KEY,
          ORIANT_ORGANIZATION_ID: BORROWED,
          [ALLOWED_ORGANIZATIONS_ENV]: value,
        },
        async () => {
          providerCache.resetOrganizationProviders();
          const sdkBefore = SDK_CLIENTS.length;
          const real = routing.liveIntegrationProviderFor(REAL);
          const fixture = routing.liveIntegrationProviderFor(BRIGHTPATH_DEMO_ORGANIZATION_ID);
          const realSent = await trySend(real);
          const fixtureSent = await trySend(fixture);
          const made = SDK_CLIENTS.length - sdkBefore;
          providerCache.resetOrganizationProviders();
          return { real, fixture, realSent, fixtureSent, made };
        },
      );

      const bothRefused =
        seen.real instanceof routing.UnpermittedOrganizationProvider &&
        seen.fixture instanceof routing.UnpermittedOrganizationProvider &&
        seen.realSent?.ok === false &&
        seen.fixtureSent?.ok === false;
      if (!bothRefused) refusedEverywhere = false;
      built += seen.made;

      // The fixture's refusal has to name the BORROWED id and where it came
      // from: an operator told "not permitted to act for org-the-demo-would-
      // borrow" would otherwise grep their handoffs for it and find nothing.
      const fixtureError =
        seen.fixtureSent?.ok === false ? seen.fixtureSent.error ?? "" : "";
      if (
        !fixtureError.includes(BORROWED) ||
        !fixtureError.includes(routing.FIXTURE_ORGANIZATION_ENV)
      ) {
        fixtureNamesItsSource = false;
      }

      outcomes.push(
        `${label}: real -> ${seen.real.constructor.name}/` +
          `${seen.realSent?.ok === false ? "refused" : "ACCEPTED"}, fixture -> ` +
          `${seen.fixture.constructor.name}/` +
          `${seen.fixtureSent?.ok === false ? "refused" : "ACCEPTED"}`,
      );
    }

    add(
      "TOOLS-19 an unset, blank or separators-only allowlist permits no organization at all",
      refusedEverywhere && built === 0 && fixtureNamesItsSource,
      `${outcomes.join("; ")}; SDK clients built across all three: ${built} (must be 0); ` +
        `the fixture's refusal names the borrowed id and ` +
        `${routing.FIXTURE_ORGANIZATION_ENV}: ${fixtureNamesItsSource ? "yes" : "NO"}`,
    );
  }

  /* ═══ TOOLS-20 with tools off the allowlist restricts nothing ═══
         The default, the demo, the verify targets and a clean clone all run
         here, and an allowlist they had to carry would buy no safety: every
         `act` step is a `StubIntegrationProvider` call that reaches nobody.
         PROVED BY CONTRAST, IN ONE ENVIRONMENT — the same organization, with the
         allowlist permitting nothing, executes down the stub branch and is
         refused down the live one. Two providers, one env, so the difference
         cannot be coming from anywhere else.

         The stub is constructed here rather than reached through
         `getRuntimeSession()`, mirroring the not-live branch of `toolsFor` in
         lib/runtime/session.ts: with ORIANT_RUNTIME_TOOLS unset that function
         returns the session's one stub and never calls
         `liveIntegrationProviderFor` at all, so the allowlist is not merely
         permissive with tools off — it is not read. */
  {
    const ACME = "org-acme-plumbing";
    const seen = await withEnv(
      {
        COMPOSIO_API_KEY: API_KEY,
        ORIANT_ORGANIZATION_ID: null,
        [ALLOWED_ORGANIZATIONS_ENV]: null,
      },
      async () => {
        providerCache.resetOrganizationProviders();
        const sdkBefore = SDK_CLIENTS.length;

        const stub: IntegrationProvider = new StubIntegrationProvider();
        const simulated = await trySend(stub);
        const stubStatus = stub.getIntegrationStatus("gmail");

        const live = routing.liveIntegrationProviderFor(ACME);
        const refused = await trySend(live);

        const built = SDK_CLIENTS.length - sdkBefore;
        providerCache.resetOrganizationProviders();
        return { stub, simulated, stubStatus, live, refused, built };
      },
    );

    add(
      "TOOLS-20 tools off is unrestricted: the stub executes for the very organization the live path refuses",
      seen.simulated?.ok === true &&
        seen.stubStatus === "connected" &&
        seen.live instanceof routing.UnpermittedOrganizationProvider &&
        seen.refused?.ok === false &&
        seen.built === 0,
      `with ${ALLOWED_ORGANIZATIONS_ENV} unset (permits nothing), organization ${ACME}: ` +
        `stub gmail=${seen.stubStatus}, ${SEND.operation} -> ` +
        `${seen.simulated?.ok === true ? "simulated" : "REFUSED (the demo and every verify target run through this line)"}; ` +
        `live -> ${seen.live.constructor.name}, ${SEND.operation} -> ` +
        `${seen.refused?.ok === false ? "refused" : "ACCEPTED"}; ` +
        `SDK clients built: ${seen.built} (must be 0)`,
    );
  }

  return checks;
}

export function formatResults(results: Check[]): string {
  const lines = results.map(
    (r) => `${r.pass ? "PASS" : "FAIL"}  ${r.name}\n        ${r.detail}`,
  );
  const failed = results.filter((r) => !r.pass).length;
  lines.push("");
  lines.push(
    failed === 0
      ? `TOOLS OK — ${results.length}/${results.length} checks passed.`
      : `TOOLS BROKEN — ${failed} of ${results.length} checks failed.`,
  );
  return lines.join("\n");
}
