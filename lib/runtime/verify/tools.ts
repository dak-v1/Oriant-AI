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
 * NO CREDENTIALS AND NO NETWORK, which is what keeps this in the default sweep.
 * The SDK is injected as `FakeComposio`, a hand-written object satisfying
 * `ComposioExecutionClient`, and TOOLS-6 deletes COMPOSIO_API_KEY from the
 * environment for the duration of one check so the target proves the same thing
 * on a developer machine that HAS a key as on CI that does not.
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

import { BRIGHTPATH_PLAN } from "../../plan/fixtures/brightpath";
import { OPERATIONS } from "../../plan/operations";
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
import type { ToolResult } from "../types";

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
