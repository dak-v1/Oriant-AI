/**
 * lib/plan/operations.ts — the shared operation vocabulary.
 *
 * Contract §8 Q2: `"gmail.drafts.create"` must come from one registry both
 * lanes import, never from free-typed strings. Until D owns this next to the
 * integration registry, Role C maintains it here and D imports it.
 *
 * `access` is the single most load-bearing field:
 *   - "read"  → a `fetch` step may use it; never needs approval
 *   - "write" → only an `act` step may use it; always subject to AgentPolicy
 * Validator rule 7 rejects any `fetch` step pointing at a write operation,
 * which is what stops a side effect from sneaking through the ungated path.
 *
 * Integration ids match lib/mock/fixtures/ids.ts (APP.*) so the real system
 * and the demo fixtures speak the same language.
 */

export type OperationAccess = "read" | "write";

export interface OperationDef {
  id: string;
  integrationId: string;
  access: OperationAccess;
  /** Plain language, shown in approval cards and the integrations screen. */
  description: string;
  /** Baseline risk for a write op; AgentPolicy may escalate further. */
  baselineRisk?: "low" | "medium" | "high";
}

function op(
  id: string,
  integrationId: string,
  access: OperationAccess,
  description: string,
  baselineRisk?: OperationDef["baselineRisk"],
): OperationDef {
  return { id, integrationId, access, description, baselineRisk };
}

export const OPERATIONS: OperationDef[] = [
  /* ── Gmail ── */
  op("gmail.threads.read", "gmail", "read", "Read email threads in the shared inbox"),
  op("gmail.messages.read", "gmail", "read", "Read individual emails"),
  op("gmail.drafts.create", "gmail", "write", "Create an email draft (not sent)", "low"),
  op("gmail.messages.send", "gmail", "write", "Send an email to a customer", "medium"),

  /* ── Google Calendar ── */
  op("google-calendar.events.list", "google-calendar", "read", "Read technician calendars"),
  op("google-calendar.availability.read", "google-calendar", "read", "Read working hours and blocked days"),
  op("google-calendar.events.create", "google-calendar", "write", "Create a tentative booking", "medium"),
  op("google-calendar.events.update", "google-calendar", "write", "Move or update a confirmed booking", "high"),

  /* ── HubSpot ── */
  op("hubspot.contacts.read", "hubspot", "read", "Read customer records and history"),
  op("hubspot.deals.read", "hubspot", "read", "Read deal and plan value"),
  op("hubspot.invoices.list", "hubspot", "read", "List invoices and their due dates"),
  op("hubspot.notes.create", "hubspot", "write", "Add a note to a customer record", "low"),
  op("hubspot.invoices.write_off", "hubspot", "write", "Write off an invoice balance", "high"),
  op("hubspot.refunds.issue", "hubspot", "write", "Issue a refund to a customer", "high"),

  /* ── WhatsApp Business ── */
  op("whatsapp-business.messages.read", "whatsapp-business", "read", "Read incoming customer messages"),
  op("whatsapp-business.messages.send", "whatsapp-business", "write", "Send a WhatsApp message", "medium"),

  /* ── QuickBooks ── */
  op("quickbooks.invoices.list", "quickbooks", "read", "List invoices and payment status"),
  op("quickbooks.payments.read", "quickbooks", "read", "Read payment history"),

  /* ── Slack ── */
  op("slack.messages.read", "slack", "read", "Read internal channel messages"),
  op("slack.messages.post", "slack", "write", "Post an internal message to the team", "low"),

  /* ── Google Drive ── */
  op("google-drive.files.read", "google-drive", "read", "Read documents and job sheets"),

  /* ── Mailchimp (marketing) ── */
  op("mailchimp.campaigns.read", "mailchimp", "read", "Read existing campaigns"),
  op("mailchimp.campaigns.create_draft", "mailchimp", "write", "Draft a campaign (not published)", "low"),
  op("mailchimp.campaigns.publish", "mailchimp", "write", "Publish a campaign publicly", "high"),
];

const BY_ID = new Map(OPERATIONS.map((o) => [o.id, o]));

export function getOperation(id: string): OperationDef | undefined {
  return BY_ID.get(id);
}

export function isKnownOperation(id: string): boolean {
  return BY_ID.has(id);
}

/** Unknown operations are NOT read-only — fail closed. */
export function isReadOnly(id: string): boolean {
  return BY_ID.get(id)?.access === "read";
}

export function operationsFor(integrationId: string): OperationDef[] {
  return OPERATIONS.filter((o) => o.integrationId === integrationId);
}
