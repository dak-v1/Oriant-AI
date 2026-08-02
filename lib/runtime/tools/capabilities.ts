/**
 * lib/runtime/tools/capabilities.ts — the ONLY place a runtime capability
 * becomes a Composio tool.
 *
 * The runtime speaks a vocabulary it owns: `gmail.messages.send`,
 * `hubspot.invoices.list`, `slack.messages.post`. Every one of those ids is
 * declared in `lib/plan/operations.ts`, granted by an `AgentSpec.tools` entry,
 * checked against the allowlist and weighed by policy before anything is
 * called. Composio speaks a different vocabulary entirely — `GMAIL_SEND_EMAIL`,
 * `SLACK_SEND_MESSAGE`, `GOOGLECALENDAR_FIND_FREE_SLOTS` — and the two are
 * related by nothing but a decision somebody made and wrote down.
 *
 * WHY THIS IS A TABLE AND NOT A STRING TRANSFORM.
 *
 * The tempting rule is `"gmail.messages.send" -> "GMAIL_MESSAGES_SEND"`. It is
 * wrong at almost every entry below, and each way it is wrong is a different
 * kind of wrong:
 *
 *   - The verb does not match. Composio calls it `GMAIL_SEND_EMAIL`, not
 *     `GMAIL_SEND_MESSAGE`. `slack.messages.read` is `SLACK_FETCH_CONVERSATION_
 *     HISTORY`. There is no morphological rule connecting those.
 *   - The toolkit prefix does not match the integration id. `google-calendar`
 *     is `GOOGLECALENDAR`, `whatsapp-business` is `WHATSAPP`. Role B's
 *     `TOOLKIT_SLUGS` in lib/server/planner/providers/composio.ts learned this
 *     the same way: whatsapp-business -> whatsapp is not derivable from the
 *     string, it is a fact about Composio's catalog.
 *   - SOME CAPABILITIES HAVE NO TOOL AT ALL. Composio's HubSpot toolkit
 *     publishes 300+ tools and not one of them touches an invoice, a note or a
 *     refund. Its QuickBooks toolkit covers accounts, customers, vendors and
 *     balance reports — no invoices, no payments. A transform would have
 *     produced `HUBSPOT_INVOICES_LIST` and `QUICKBOOKS_INVOICES_LIST`, both of
 *     which Composio would reject at execution time with a tool-not-found —
 *     i.e. the transform turns a design gap into a runtime mystery.
 *
 * A near-miss is worse than a miss. `HUBSPOT_LIST_QUOTES_PAGE` exists and a
 * quote is not an invoice; `QUICKBOOKS_CUSTOMER_BALANCE_DETAIL` exists and a
 * balance is not a payment history. Mapping either would give an agent
 * plausible-looking data about the wrong thing, and the agent would then reason
 * over it and email a customer. So the second table below is as load-bearing as
 * the first: A CAPABILITY WITH NO COMPOSIO TOOL REFUSES, NAMING ITSELF. It does
 * not improvise, and it does not silently return an empty list.
 *
 * TOTALITY IS THE INVARIANT. Every id in `lib/plan/operations.ts` appears in
 * exactly one of the two tables. That is what `lib/runtime/verify/tools.ts`
 * asserts, and it is why adding an operation to the shared registry without
 * deciding its Composio fate turns the verify sweep red rather than producing a
 * capability that refuses for a reason nobody wrote down.
 *
 * THE SLUGS WERE READ FROM THE CATALOG, NOT REMEMBERED. Each toolkit's tool
 * list was pulled from Composio's own `/api/v3/tools?toolkit_slug=...` while
 * writing this file. That is also why the refusals below can state what the
 * toolkit *does* contain — the absence is a checked fact, not an assumption.
 * When Composio publishes a tool that fills one of these gaps, the fix is to
 * move the entry from the second table to the first.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO: ARGUMENT TRANSLATION.
 *
 * This table maps a capability to a TOOL. It says nothing about that tool's
 * arguments, and it never will. `gmail.messages.send` used to carry whatever the
 * reason step produced — `{ to, subject, body }` — straight to
 * `GMAIL_SEND_EMAIL`, which wants `recipient_email`. Hand-writing a
 * per-capability argument mapper here would be twenty more guesses about a shape
 * that lives on Composio's side and changes with toolkit versions, and a guess
 * that is wrong SILENTLY (a dropped `cc`, a misnamed `body`) is exactly the
 * failure mode the rest of this runtime is built to avoid.
 *
 * THE HONEST SEAM NOW EXISTS, and it is lib/runtime/tools/schema.ts: the tool's
 * own JSON schema, fetched from Composio's catalog, given to the model at the
 * `reason` step so the arguments are produced in the tool's vocabulary in the
 * first place — and checked against that same schema immediately before
 * execution, because a prompt is guidance and a send needs a gate. A capability
 * added to the first table above therefore needs no argument work here at all;
 * that is the property that made the schema worth fetching rather than
 * transcribing.
 */

import { getOperation } from "../../plan/operations";

/* ═══════════════════════════ Toolkits ═══════════════════════════ */

/**
 * Runtime integration id -> Composio toolkit slug.
 *
 * DUPLICATED FROM `TOOLKIT_SLUGS` in lib/server/planner/providers/composio.ts
 * ON PURPOSE, and the duplication is named rather than hidden. That module
 * imports `@composio/core` at the top level; importing it from here would drag
 * the SDK into `lib/runtime`'s module graph and, more to the point, into
 * `lib/runtime/verify/tools.ts`, which has to compile and run under the verify
 * harness's CommonJS output with no credentials and no network. Seven strings
 * are a cheaper price than that coupling.
 *
 * The two tables must agree. They are checked against each other by eye and by
 * the fact that a disagreement produces a connected account this file cannot
 * find — Role B's table decides which toolkit an OAuth connection is made
 * against, and this one decides which toolkit the runtime looks that connection
 * up under.
 *
 * MAILCHIMP IS ABSENT, AND ITS ABSENCE IS THE DECISION. Composio does publish a
 * mailchimp toolkit, but this application has no path to connect one:
 * `initiateConnection()` refuses any tool key outside Role B's table, so
 * `app/api/integrations/**` can never produce a mailchimp connected account.
 * A runtime that mapped mailchimp capabilities to Composio tools would be
 * offering to call an account that cannot exist. So mailchimp reports
 * not-connected, hands out no client, and its three capabilities refuse — see
 * `UNROUTABLE_CAPABILITIES`. This is a gap in the integration surface, not an
 * oversight in this file; closing it means adding mailchimp to Role B's table
 * first.
 */
export const COMPOSIO_TOOLKIT_BY_INTEGRATION: Readonly<Record<string, string>> = {
  gmail: "gmail",
  "google-calendar": "googlecalendar",
  "google-drive": "googledrive",
  hubspot: "hubspot",
  quickbooks: "quickbooks",
  slack: "slack",
  "whatsapp-business": "whatsapp",
};

/** The toolkit slugs one connection scan has to ask about. Stable order. */
export const COMPOSIO_TOOLKIT_SLUGS: readonly string[] = Object.values(
  COMPOSIO_TOOLKIT_BY_INTEGRATION,
).sort();

/** Integration ids this provider can ever route. Everything else refuses. */
export const COMPOSIO_ROUTED_INTEGRATIONS: readonly string[] = Object.keys(
  COMPOSIO_TOOLKIT_BY_INTEGRATION,
).sort();

/**
 * Lookups go through Maps rather than through the record literals above.
 * `noUncheckedIndexedAccess` is off in this repo's tsconfig, so
 * `RECORD[missingKey]` is typed `string` while being `undefined` at run time —
 * the exact shape of bug this file exists to prevent. `Map.get` types the
 * absence, so every miss has to be handled.
 */
const TOOLKIT_BY_INTEGRATION = new Map(Object.entries(COMPOSIO_TOOLKIT_BY_INTEGRATION));

/* ═══════════════════════════ The map ═══════════════════════════ */

interface MappedCapability {
  /** Repeated here rather than derived from the registry so a mapping that
      drifts onto the wrong integration is a visible contradiction. */
  readonly integrationId: string;
  readonly toolSlug: string;
}

/**
 * Capability id -> Composio tool slug. Every entry was chosen against the
 * toolkit's real tool list, and the non-obvious choices say why on the line.
 * The count is not asserted here; `verify/tools.ts` asserts the property that
 * matters — that this table plus the refusals below cover the whole registry.
 */
const CAPABILITY_TOOL_TABLE: Readonly<Record<string, MappedCapability>> = {
  /* ── Gmail ── */
  "gmail.threads.read": { integrationId: "gmail", toolSlug: "GMAIL_LIST_THREADS" },
  // Composio splits the message read in two — BY_THREAD_ID and BY_MESSAGE_ID —
  // where the runtime has one capability. The thread variant wins because every
  // workflow that reads mail reaches a message THROUGH a thread it just listed;
  // a caller holding only a message id is the case the plan does not have.
  "gmail.messages.read": {
    integrationId: "gmail",
    toolSlug: "GMAIL_FETCH_MESSAGE_BY_THREAD_ID",
  },
  "gmail.drafts.create": { integrationId: "gmail", toolSlug: "GMAIL_CREATE_EMAIL_DRAFT" },
  // Not GMAIL_SEND_DRAFT: that sends a draft created earlier, which would make
  // this capability depend on a draft id the plan never carries.
  "gmail.messages.send": { integrationId: "gmail", toolSlug: "GMAIL_SEND_EMAIL" },

  /* ── Google Calendar ── */
  "google-calendar.events.list": {
    integrationId: "google-calendar",
    toolSlug: "GOOGLECALENDAR_EVENTS_LIST",
  },
  // FIND_FREE_SLOTS rather than FREE_BUSY_QUERY: the stub's fixture — and the
  // scheduling agent's reasoning — is about free slots to offer a customer, not
  // about busy blocks to subtract.
  "google-calendar.availability.read": {
    integrationId: "google-calendar",
    toolSlug: "GOOGLECALENDAR_FIND_FREE_SLOTS",
  },
  "google-calendar.events.create": {
    integrationId: "google-calendar",
    toolSlug: "GOOGLECALENDAR_CREATE_EVENT",
  },
  // UPDATE_EVENT, not PATCH_EVENT. `events.update` is the high-risk "move a
  // confirmed booking" operation, and a full update is what the approval card
  // describes; a patch would let a partial payload silently keep old values.
  "google-calendar.events.update": {
    integrationId: "google-calendar",
    toolSlug: "GOOGLECALENDAR_UPDATE_EVENT",
  },

  /* ── HubSpot ── */
  // The single-record read, not HUBSPOT_LIST_CONTACTS_PAGE: every fixture call
  // names a customer, and "read customer records and history" is a lookup.
  "hubspot.contacts.read": {
    integrationId: "hubspot",
    toolSlug: "HUBSPOT_FETCH_CONTACT_DETAILS_BY_ID",
  },
  // There is no read-deals-for-one-customer tool, so this is the page read and
  // the filtering is the agent's problem — the same shape the stub has.
  "hubspot.deals.read": { integrationId: "hubspot", toolSlug: "HUBSPOT_READ_A_PAGE_OF_DEALS" },

  /* ── WhatsApp Business ── */
  "whatsapp-business.messages.send": {
    integrationId: "whatsapp-business",
    toolSlug: "WHATSAPP_SEND_MESSAGE",
  },

  /* ── Slack ── */
  "slack.messages.read": {
    integrationId: "slack",
    toolSlug: "SLACK_FETCH_CONVERSATION_HISTORY",
  },
  // Composio ships several spellings of "post to a channel"
  // (SLACK_CHAT_POST_MESSAGE, SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL).
  // SLACK_SEND_MESSAGE is the current primary; the others are legacy aliases.
  "slack.messages.post": { integrationId: "slack", toolSlug: "SLACK_SEND_MESSAGE" },

  /* ── Google Drive ── */
  // FIND_FILE answers both shapes the capability is called with — with a file
  // id and without one. GOOGLEDRIVE_PARSE_FILE is the tool that returns a
  // document's TEXT, and it needs an id, so it is a second capability
  // (`google-drive.files.parse`) that the plan does not yet declare. Mapping it
  // here would mean a call with no id could not be served at all.
  "google-drive.files.read": {
    integrationId: "google-drive",
    toolSlug: "GOOGLEDRIVE_FIND_FILE",
  },
};

/* ═══════════════════════ The refusals ═══════════════════════ */

interface UnroutableCapability {
  readonly integrationId: string;
  /** Shown verbatim on the run timeline. Written for the person who has to
      decide what to do about it, not for a log grep. */
  readonly reason: string;
}

/**
 * Capabilities the runtime declares and Composio cannot perform. Listed one by
 * one because "not in the map" and "known to be impossible" are different
 * facts, and only the second one can be explained to an owner.
 */
const UNROUTABLE_CAPABILITY_TABLE: Readonly<Record<string, UnroutableCapability>> = {
  /* ── HubSpot: the toolkit is connected, these objects are not exposed ── */
  "hubspot.invoices.list": {
    integrationId: "hubspot",
    reason:
      "Composio's HubSpot toolkit publishes no invoice tool — it covers contacts, " +
      "companies, deals, tickets, quotes and line items. A quote is not an invoice, " +
      "so nothing here is substituted. Read invoices from QuickBooks, or add a " +
      "HubSpot invoice tool on Composio's side first.",
  },
  "hubspot.notes.create": {
    integrationId: "hubspot",
    reason:
      "Composio's HubSpot toolkit publishes no note or engagement tool, so there is " +
      "no way to attach a note to a customer record. The nearest thing is a custom " +
      "CRM object write, which would put the note somewhere nobody looks.",
  },
  "hubspot.invoices.write_off": {
    integrationId: "hubspot",
    reason:
      "Composio's HubSpot toolkit has no invoice object at all, so a balance cannot " +
      "be written off through it. This is a high-risk money operation; refusing is " +
      "the only safe answer while the tool does not exist.",
  },
  "hubspot.refunds.issue": {
    integrationId: "hubspot",
    reason:
      "Composio's HubSpot toolkit publishes no refund tool. This moves money, so it " +
      "refuses rather than routing through some adjacent object that happens to " +
      "accept a number.",
  },

  /* ── QuickBooks: connected, but the toolkit is thin ── */
  "quickbooks.invoices.list": {
    integrationId: "quickbooks",
    reason:
      "Composio's QuickBooks toolkit exposes accounts, customers, vendors, employees " +
      "and balance reports — there is no invoice tool. QUICKBOOKS_CUSTOMER_BALANCE_" +
      "DETAIL reports a balance, not the invoices behind it, so it is not a stand-in.",
  },
  "quickbooks.payments.read": {
    integrationId: "quickbooks",
    reason:
      "Composio's QuickBooks toolkit publishes no payment tool. Payment history is " +
      "what the collections agent uses to decide whether to chase somebody, and a " +
      "balance report cannot answer 'has this customer paid before'.",
  },

  /* ── WhatsApp: outbound only, by the platform's own design ── */
  "whatsapp-business.messages.read": {
    integrationId: "whatsapp-business",
    reason:
      "Composio's WhatsApp toolkit is send-only — templates, media and outbound " +
      "messages. Inbound WhatsApp messages arrive by webhook on the WhatsApp Cloud " +
      "API and there is no endpoint that lists them, so no tool can exist for this. " +
      "Reading inbound WhatsApp needs a webhook receiver, not a tool call.",
  },

  /* ── Mailchimp: no connection path in this application ── */
  // See COMPOSIO_TOOLKIT_BY_INTEGRATION above for the full reasoning. The short
  // version: Role B's adapter refuses to start a mailchimp connection, so no
  // mailchimp connected account can exist for any organization, so every
  // mailchimp capability is uncallable however Composio's catalog looks.
  "mailchimp.campaigns.read": {
    integrationId: "mailchimp",
    reason:
      "Mailchimp is not routed through Composio by this application: " +
      "lib/server/planner/providers/composio.ts refuses to start a connection for " +
      "it, so no connected account exists to execute against. The marketing agent's " +
      "Mailchimp grant cannot be honoured live.",
  },
  "mailchimp.campaigns.create_draft": {
    integrationId: "mailchimp",
    reason:
      "Mailchimp is not routed through Composio by this application, so there is no " +
      "connected account to draft a campaign against.",
  },
  "mailchimp.campaigns.publish": {
    integrationId: "mailchimp",
    reason:
      "Mailchimp is not routed through Composio by this application. This publishes " +
      "to the public, so it refuses loudly rather than appearing to have worked.",
  },
};

/* ═══════════════════════════ Resolution ═══════════════════════════ */

const CAPABILITY_TOOLS = new Map(Object.entries(CAPABILITY_TOOL_TABLE));
const UNROUTABLE_CAPABILITIES = new Map(Object.entries(UNROUTABLE_CAPABILITY_TABLE));

export type CapabilityRoute =
  | {
      kind: "tool";
      capability: string;
      integrationId: string;
      toolkitSlug: string;
      toolSlug: string;
    }
  | { kind: "unroutable"; capability: string; integrationId: string; reason: string }
  | { kind: "unknown"; capability: string; reason: string };

/**
 * The one lookup. Three answers, and only the first one may reach the network.
 *
 * `unknown` is reserved for a capability neither table names. It is not the
 * same as `unroutable`: unroutable means somebody looked and wrote down why,
 * unknown means the shared registry and this file have drifted apart, which is
 * a bug in the repo rather than a limitation of Composio.
 */
export function resolveCapability(capability: string): CapabilityRoute {
  const mapped = CAPABILITY_TOOLS.get(capability);
  if (mapped !== undefined) {
    const toolkitSlug = TOOLKIT_BY_INTEGRATION.get(mapped.integrationId);
    if (toolkitSlug === undefined) {
      // Only reachable if someone maps a capability onto an integration this
      // file does not route. Refusing beats executing against a toolkit slug
      // guessed from the integration id.
      return {
        kind: "unroutable",
        capability,
        integrationId: mapped.integrationId,
        reason:
          `"${capability}" is mapped to Composio tool ${mapped.toolSlug}, but ` +
          `"${mapped.integrationId}" has no Composio toolkit in this build.`,
      };
    }
    return {
      kind: "tool",
      capability,
      integrationId: mapped.integrationId,
      toolkitSlug,
      toolSlug: mapped.toolSlug,
    };
  }

  const refused = UNROUTABLE_CAPABILITIES.get(capability);
  if (refused !== undefined) {
    return {
      kind: "unroutable",
      capability,
      integrationId: refused.integrationId,
      reason: refused.reason,
    };
  }

  const known = getOperation(capability);
  return {
    kind: "unknown",
    capability,
    reason:
      known === undefined
        ? `"${capability}" is not an operation lib/plan/operations.ts declares, so no ` +
          `grant can have sanctioned it and no Composio tool is looked up for it.`
        : `"${capability}" is declared in lib/plan/operations.ts but has no entry in ` +
          `lib/runtime/tools/capabilities.ts — neither a Composio tool nor a written ` +
          `reason it cannot have one. Add it to one of the two tables.`,
  };
}

/* ═══════════════════════ Introspection (verify + UI) ═══════════════════════ */

/** Every capability with a Composio tool, sorted. */
export function mappedCapabilities(): readonly string[] {
  return Array.from(CAPABILITY_TOOLS.keys()).sort();
}

/** Every capability explicitly recorded as impossible, sorted. */
export function unroutableCapabilities(): readonly string[] {
  return Array.from(UNROUTABLE_CAPABILITIES.keys()).sort();
}

/** True when the capability has an explicit entry either way — i.e. somebody
    decided. This is the property `verify/tools.ts` calls totality. */
export function hasCapabilityDecision(capability: string): boolean {
  return CAPABILITY_TOOLS.has(capability) || UNROUTABLE_CAPABILITIES.has(capability);
}

/** The Composio toolkit slug a routed integration lives under, or null. */
export function toolkitSlugFor(integrationId: string): string | null {
  return TOOLKIT_BY_INTEGRATION.get(integrationId) ?? null;
}
