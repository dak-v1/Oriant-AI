/**
 * lib/runtime/tools.ts — the tool mediation layer's test doubles (ROLE_C_PLAN M1/M3).
 *
 * Agents never touch Gmail, HubSpot or a calendar directly. Every call goes
 * through a `ToolClient`, which is the seam the whole runtime is built around:
 * the sandbox injects the stubs below, production injects D's real client
 * (contract §8 Q3). Same agent code, one swapped dependency — so a scenario
 * proven in the sandbox is the same code path that later sends a real email.
 *
 * Three properties make these doubles worth having:
 *
 *   1. DETERMINISM. Every response is a hand-written literal pinned to a fixed
 *      demo date. No `Date.now()`, no `Math.random()`, no counters that drift
 *      between runs. M3's exit criterion is that the same scenario yields an
 *      identical verdict across five consecutive runs, and a stub that invented
 *      fresh data on each call would make that impossible.
 *
 *   2. FIXTURES THAT EXERCISE POLICY. The invoice list deliberately contains a
 *      95 SGD invoice and a 1,200 SGD invoice, because the contract's worked
 *      example turns on exactly that pair: the first sends immediately under an
 *      `invoice.amount <= 500` limit, the second breaches it and must pause for
 *      approval. Test data that never breaches a limit proves nothing.
 *
 *   3. NOTHING SHARED BY REFERENCE. Responses are cloned on the way out and
 *      invocations cloned on the way into the call log, so a caller that mutates
 *      a result cannot change what the next call returns, and a caller that
 *      reuses an args object cannot rewrite history in the log.
 *
 * Writes are simulated rather than refused: they return `{ simulated: true }`
 * and are recorded, which lets a sandbox run reach its output step and lets a
 * test assert that the agent tried to send exactly one email. Deciding whether
 * a write is *permitted* is policy's job, not this file's — the runtime has
 * already made that call before anything arrives here.
 */

import { getOperation } from "../plan/operations";
import type {
  IntegrationProvider,
  ToolClient,
  ToolInvocation,
  ToolResult,
} from "./types";

/* ═══════════════════════════ Helpers ═══════════════════════════ */

/** Matches lib/runtime/store.ts: cloning keeps stub state unshared. */
function clone<T>(value: T): T {
  return structuredClone(value);
}

function ok(data: unknown): ToolResult {
  return { ok: true, data };
}

function fail(error: string): ToolResult {
  return { ok: false, error };
}

/** Args arrive as `unknown`, so every filter narrows before it trusts a value. */
function numberArg(args: Record<string, unknown>, key: string): number | null {
  const raw = args[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function stringArg(args: Record<string, unknown>, key: string): string | null {
  const raw = args[key];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/**
 * The demo's frozen "today", mirroring `DEMO_TODAY` in lib/mock/fixtures/ids.ts.
 * Duplicated on purpose: the runtime must never import the demo fixtures, and a
 * stub that derived dates from the real clock would break determinism anyway.
 */
export const STUB_TODAY = "2026-07-24";

/* ═══════════════════════════ Canned data ═══════════════════════════ */

export interface StubInvoice {
  id: string;
  customerId: string;
  customer: string;
  amount: number;
  currency: "SGD";
  issuedDate: string;
  dueDate: string;
  /** Relative to STUB_TODAY, precomputed so nothing here reads a clock. */
  daysOverdue: number;
  description: string;
  /** ISO date of the last reminder, or null when never chased. */
  lastChasedAt: string | null;
}

/**
 * Six overdue invoices for BrightPath Home Services, exported so scenario
 * fixtures and limit tests can assert against the same numbers rather than
 * re-typing them. The mix is chosen for policy coverage, not realism alone:
 *
 *   - INV-9001 at 95 SGD  → the contract's "gentle nudge" case, well inside a
 *                           500 SGD limit and inside a 20-email batch;
 *   - INV-9004 at 1,200 SGD → breaches `invoice.amount <= 500` and must pause;
 *   - the rest straddle the boundary so a batch contains both outcomes.
 */
export const STUB_INVOICES: StubInvoice[] = [
  {
    id: "INV-9001",
    customerId: "cust-wong-adeline",
    customer: "Adeline Wong",
    amount: 95,
    currency: "SGD",
    issuedDate: "2026-07-05",
    dueDate: "2026-07-19",
    daysOverdue: 5,
    description: "Aircon servicing top-up, 1 unit",
    lastChasedAt: null,
  },
  {
    id: "INV-9002",
    customerId: "cust-lim-wei-sheng",
    customer: "Lim Wei Sheng",
    amount: 340,
    currency: "SGD",
    issuedDate: "2026-06-28",
    dueDate: "2026-07-12",
    daysOverdue: 12,
    description: "Quarterly maintenance visit",
    lastChasedAt: "2026-07-21",
  },
  {
    id: "INV-9003",
    customerId: "cust-tan-boon-huat",
    customer: "Tan Boon Huat",
    amount: 480,
    currency: "SGD",
    issuedDate: "2026-07-07",
    dueDate: "2026-07-21",
    daysOverdue: 3,
    description: "Water heater replacement, labour and parts",
    lastChasedAt: null,
  },
  {
    id: "INV-9004",
    customerId: "cust-riverfront-mcst",
    customer: "Riverfront Residences MCST",
    amount: 1200,
    currency: "SGD",
    issuedDate: "2026-07-01",
    dueDate: "2026-07-15",
    daysOverdue: 9,
    description: "Common-area servicing, 8 units",
    lastChasedAt: null,
  },
  {
    id: "INV-9005",
    customerId: "cust-rahman-nadia",
    customer: "Nadia Rahman",
    amount: 260,
    currency: "SGD",
    issuedDate: "2026-06-19",
    dueDate: "2026-07-03",
    daysOverdue: 21,
    description: "Plumbing callout and pipe repair",
    lastChasedAt: "2026-07-10",
  },
  {
    id: "INV-9006",
    customerId: "cust-greenleaf-cafe",
    customer: "GreenLeaf Cafe",
    amount: 720,
    currency: "SGD",
    issuedDate: "2026-07-08",
    dueDate: "2026-07-22",
    daysOverdue: 2,
    description: "Kitchen extraction deep clean",
    lastChasedAt: null,
  },
];

interface StubContact {
  id: string;
  name: string;
  email: string;
  phone: string;
  planTier: string;
  /** Annual plan value in SGD; the "high-value customer" signal. */
  planValueSgd: number;
  customerSince: string;
  tenureYears: number;
  openInvoices: number;
  totalOutstandingSgd: number;
  lastContactedAt: string | null;
  priorComplaints: number;
  paymentBehaviour: "prompt" | "occasionally_late" | "chronically_late";
}

const STUB_CONTACTS: StubContact[] = [
  {
    id: "cust-wong-adeline",
    name: "Adeline Wong",
    email: "adeline.wong@example.sg",
    phone: "+65 9123 4567",
    planTier: "Maintenance Plan — Premium",
    planValueSgd: 4800,
    customerSince: "2020-03-11",
    tenureYears: 6,
    openInvoices: 1,
    totalOutstandingSgd: 95,
    lastContactedAt: "2026-07-22",
    priorComplaints: 2,
    paymentBehaviour: "prompt",
  },
  {
    id: "cust-lim-wei-sheng",
    name: "Lim Wei Sheng",
    email: "wslim@example.sg",
    phone: "+65 9234 5678",
    planTier: "Maintenance Plan — Standard",
    planValueSgd: 1800,
    customerSince: "2023-09-02",
    tenureYears: 2,
    openInvoices: 1,
    totalOutstandingSgd: 340,
    lastContactedAt: "2026-07-21",
    priorComplaints: 0,
    paymentBehaviour: "occasionally_late",
  },
  {
    id: "cust-tan-boon-huat",
    name: "Tan Boon Huat",
    email: "bh.tan@example.sg",
    phone: "+65 9345 6789",
    planTier: "Ad hoc",
    planValueSgd: 0,
    customerSince: "2026-02-14",
    tenureYears: 0,
    openInvoices: 1,
    totalOutstandingSgd: 480,
    lastContactedAt: null,
    priorComplaints: 0,
    paymentBehaviour: "prompt",
  },
  {
    id: "cust-riverfront-mcst",
    name: "Riverfront Residences MCST",
    email: "accounts@riverfront-mcst.example.sg",
    phone: "+65 6456 7890",
    planTier: "Commercial Contract",
    planValueSgd: 14400,
    customerSince: "2021-11-30",
    tenureYears: 4,
    openInvoices: 1,
    totalOutstandingSgd: 1200,
    lastContactedAt: "2026-07-16",
    priorComplaints: 1,
    paymentBehaviour: "occasionally_late",
  },
  {
    id: "cust-rahman-nadia",
    name: "Nadia Rahman",
    email: "nadia.rahman@example.sg",
    phone: "+65 9567 8901",
    planTier: "Ad hoc",
    planValueSgd: 0,
    customerSince: "2025-05-06",
    tenureYears: 1,
    openInvoices: 1,
    totalOutstandingSgd: 260,
    lastContactedAt: "2026-07-10",
    priorComplaints: 0,
    paymentBehaviour: "chronically_late",
  },
  {
    id: "cust-greenleaf-cafe",
    name: "GreenLeaf Cafe",
    email: "ops@greenleaf.example.sg",
    phone: "+65 6678 9012",
    planTier: "Commercial Contract",
    planValueSgd: 7200,
    customerSince: "2022-08-15",
    tenureYears: 3,
    openInvoices: 1,
    totalOutstandingSgd: 720,
    lastContactedAt: null,
    priorComplaints: 0,
    paymentBehaviour: "prompt",
  },
];

const CONTACTS_BY_ID = new Map(STUB_CONTACTS.map((c) => [c.id, c]));
const CONTACTS_BY_EMAIL = new Map(STUB_CONTACTS.map((c) => [c.email, c]));

/**
 * The contact returned when a call names nobody. Resolved by id rather than by
 * position so reordering the array above cannot silently change it.
 */
const DEFAULT_CONTACT: StubContact =
  CONTACTS_BY_ID.get("cust-wong-adeline") ?? STUB_CONTACTS[0];

const STUB_DEALS = [
  {
    id: "deal-4102",
    customerId: "cust-riverfront-mcst",
    name: "Riverfront annual servicing renewal",
    stage: "contract_sent",
    valueSgd: 14400,
    closeDate: "2026-08-31",
    owner: "user_sarah_chen",
  },
  {
    id: "deal-4118",
    customerId: "cust-greenleaf-cafe",
    name: "GreenLeaf quarterly deep clean upsell",
    stage: "proposal",
    valueSgd: 2400,
    closeDate: "2026-09-15",
    owner: "user_sarah_chen",
  },
];

const STUB_CALENDAR_EVENTS = [
  {
    id: "evt-4401",
    technicianId: "tech-marcus",
    technician: "Marcus Tan",
    title: "Aircon servicing — JB-2231",
    start: "2026-07-24T09:00:00+08:00",
    end: "2026-07-24T11:00:00+08:00",
    location: "Bukit Timah",
    jobRef: "JB-2231",
    status: "confirmed",
  },
  {
    id: "evt-4402",
    technicianId: "tech-marcus",
    technician: "Marcus Tan",
    title: "Water heater install — JB-2240",
    start: "2026-07-24T14:00:00+08:00",
    end: "2026-07-24T16:30:00+08:00",
    location: "Serangoon",
    jobRef: "JB-2240",
    status: "confirmed",
  },
  {
    id: "evt-4403",
    technicianId: "tech-siti",
    technician: "Siti Nurhaliza",
    title: "Quarterly maintenance — JB-2244",
    start: "2026-07-25T10:00:00+08:00",
    end: "2026-07-25T12:00:00+08:00",
    location: "Tampines",
    jobRef: "JB-2244",
    status: "tentative",
  },
  {
    id: "evt-4404",
    technicianId: "tech-ravi",
    technician: "Ravi Kumar",
    title: "Plumbing callout — JB-2247",
    start: "2026-07-25T15:00:00+08:00",
    end: "2026-07-25T16:00:00+08:00",
    location: "Clementi",
    jobRef: "JB-2247",
    status: "confirmed",
  },
];

/**
 * Free slots rather than busy blocks, because that is what a scheduling agent
 * actually reasons over. Saturday 25 July morning is deliberately open for
 * Marcus so the service-recovery scenario has a goodwill slot to offer.
 */
const STUB_AVAILABILITY = {
  timezone: "Asia/Singapore",
  asOf: STUB_TODAY,
  workingHours: { start: "09:00", end: "18:00" },
  blockedDays: ["2026-08-09"],
  technicians: [
    {
      id: "tech-marcus",
      name: "Marcus Tan",
      skills: ["aircon", "electrical"],
      freeSlots: [
        { start: "2026-07-24T11:30:00+08:00", end: "2026-07-24T13:30:00+08:00" },
        { start: "2026-07-25T09:00:00+08:00", end: "2026-07-25T11:00:00+08:00" },
      ],
    },
    {
      id: "tech-siti",
      name: "Siti Nurhaliza",
      skills: ["aircon", "general"],
      freeSlots: [
        { start: "2026-07-24T09:00:00+08:00", end: "2026-07-24T12:00:00+08:00" },
        { start: "2026-07-27T14:00:00+08:00", end: "2026-07-27T17:00:00+08:00" },
      ],
    },
    {
      id: "tech-ravi",
      name: "Ravi Kumar",
      skills: ["plumbing"],
      freeSlots: [
        { start: "2026-07-27T09:00:00+08:00", end: "2026-07-27T12:00:00+08:00" },
      ],
    },
  ],
};

const STUB_GMAIL_THREADS = [
  {
    id: "thread-7781",
    subject: "Aircon servicing for 3 units — availability next week?",
    from: "Priya Menon <priya.menon@example.sg>",
    receivedAt: "2026-07-24T08:41:00+08:00",
    unread: true,
    messageCount: 1,
    messageIds: ["msg-7781-1"],
    snippet:
      "Hi, could I book servicing for 3 units next week? Weekday mornings work best.",
  },
  {
    id: "thread-7782",
    subject: "Re: Invoice INV-9002 — payment query",
    from: "Lim Wei Sheng <wslim@example.sg>",
    receivedAt: "2026-07-23T17:12:00+08:00",
    unread: true,
    messageCount: 2,
    messageIds: ["msg-7782-1", "msg-7782-2"],
    snippet:
      "I thought this was covered by the plan. Could you send a breakdown before I pay?",
  },
];

const STUB_GMAIL_MESSAGES = [
  {
    id: "msg-7781-1",
    threadId: "thread-7781",
    from: "Priya Menon <priya.menon@example.sg>",
    to: "hello@brightpath.example.sg",
    sentAt: "2026-07-24T08:41:00+08:00",
    subject: "Aircon servicing for 3 units — availability next week?",
    body:
      "Hi BrightPath,\n\nCould I book servicing for 3 units next week? Weekday " +
      "mornings work best, and I am in Tampines. What would it cost?\n\nThanks,\nPriya",
  },
  {
    id: "msg-7782-1",
    threadId: "thread-7782",
    from: "BrightPath Accounts <accounts@brightpath.example.sg>",
    to: "wslim@example.sg",
    sentAt: "2026-07-21T09:05:00+08:00",
    subject: "Invoice INV-9002 — now 9 days past due",
    body:
      "Dear Mr Lim,\n\nA gentle reminder that invoice INV-9002 for $340 was due " +
      "on 12 July.\n\nBrightPath Home Services",
  },
  {
    id: "msg-7782-2",
    threadId: "thread-7782",
    from: "Lim Wei Sheng <wslim@example.sg>",
    to: "accounts@brightpath.example.sg",
    sentAt: "2026-07-23T17:12:00+08:00",
    subject: "Re: Invoice INV-9002 — payment query",
    body:
      "I thought the quarterly visit was covered by my plan. Could you send a " +
      "breakdown before I pay?\n\nWei Sheng",
  },
];

const STUB_WHATSAPP_MESSAGES = [
  {
    id: "wa-3310",
    conversationId: "wa-conv-wong",
    customerId: "cust-wong-adeline",
    from: "+65 9123 4567",
    contactName: "Adeline Wong",
    receivedAt: "2026-07-24T09:14:00+08:00",
    direction: "inbound",
    body:
      "This is the second time my aircon servicing has been pushed back. First " +
      "14 July, then 18, now you tell me 21 July also cannot. I have been a " +
      "customer for six years. Very disappointed.",
    jobRef: "JB-2231",
  },
  {
    id: "wa-3311",
    conversationId: "wa-conv-greenleaf",
    customerId: "cust-greenleaf-cafe",
    from: "+65 6678 9012",
    contactName: "GreenLeaf Cafe",
    receivedAt: "2026-07-24T10:02:00+08:00",
    direction: "inbound",
    body: "Can the deep clean move to Monday morning instead? Kitchen is busy Friday.",
    jobRef: "JB-2251",
  },
];

const STUB_QUICKBOOKS_INVOICES = [
  { id: "INV-9001", customerId: "cust-wong-adeline", amount: 95, status: "overdue", issuedDate: "2026-07-05", dueDate: "2026-07-19", paidAt: null },
  { id: "INV-9002", customerId: "cust-lim-wei-sheng", amount: 340, status: "disputed", issuedDate: "2026-06-28", dueDate: "2026-07-12", paidAt: null },
  { id: "INV-9003", customerId: "cust-tan-boon-huat", amount: 480, status: "overdue", issuedDate: "2026-07-07", dueDate: "2026-07-21", paidAt: null },
  { id: "INV-9004", customerId: "cust-riverfront-mcst", amount: 1200, status: "overdue", issuedDate: "2026-07-01", dueDate: "2026-07-15", paidAt: null },
  { id: "INV-9005", customerId: "cust-rahman-nadia", amount: 260, status: "overdue", issuedDate: "2026-06-19", dueDate: "2026-07-03", paidAt: null },
  { id: "INV-9006", customerId: "cust-greenleaf-cafe", amount: 720, status: "overdue", issuedDate: "2026-07-08", dueDate: "2026-07-22", paidAt: null },
  // Paid in advance for work not yet delivered: the fairness signal the
  // service-recovery scenario leans on.
  { id: "INV-8804", customerId: "cust-wong-adeline", amount: 360, status: "paid", issuedDate: "2026-06-25", dueDate: "2026-07-09", paidAt: "2026-07-02" },
];

const STUB_PAYMENTS = [
  { id: "pay-5501", customerId: "cust-wong-adeline", invoiceId: "INV-8804", amount: 360, method: "bank_transfer", paidAt: "2026-07-02", daysEarlyOrLate: -7 },
  { id: "pay-5502", customerId: "cust-lim-wei-sheng", invoiceId: "INV-8790", amount: 340, method: "paynow", paidAt: "2026-04-18", daysEarlyOrLate: 6 },
  { id: "pay-5503", customerId: "cust-riverfront-mcst", invoiceId: "INV-8756", amount: 1200, method: "bank_transfer", paidAt: "2026-04-27", daysEarlyOrLate: 12 },
  { id: "pay-5504", customerId: "cust-rahman-nadia", invoiceId: "INV-8712", amount: 180, method: "paynow", paidAt: "2026-03-30", daysEarlyOrLate: 25 },
  { id: "pay-5505", customerId: "cust-greenleaf-cafe", invoiceId: "INV-8801", amount: 720, method: "bank_transfer", paidAt: "2026-04-20", daysEarlyOrLate: -2 },
];

const STUB_SLACK_MESSAGES = [
  {
    id: "slack-9901",
    channel: "#field-ops",
    author: "Marcus Tan",
    postedAt: "2026-07-23T18:22:00+08:00",
    text:
      "Replacement compressor for JB-2231 arrived today. I can protect a Saturday " +
      "morning slot if someone approves the goodwill visit.",
  },
  {
    id: "slack-9902",
    channel: "#field-ops",
    author: "Priya Nair",
    postedAt: "2026-07-24T08:05:00+08:00",
    text: "Two reschedules on JB-2231 already. Customer is a 6-year plan holder, please handle carefully.",
  },
  {
    id: "slack-9903",
    channel: "#accounts",
    author: "Wei Ling Goh",
    postedAt: "2026-07-24T09:30:00+08:00",
    text: "Riverfront MCST usually settles late but always pays. No need to escalate hard.",
  },
];

const STUB_DRIVE_FILES = [
  {
    id: "file-2201",
    name: "Job sheet JB-2231.pdf",
    mimeType: "application/pdf",
    modifiedAt: "2026-07-21T16:40:00+08:00",
    folder: "Job sheets / July 2026",
    excerpt:
      "Annual servicing, 3 units. Booked 14 Jul, rescheduled 18 Jul (technician " +
      "on medical leave), rescheduled 21 Jul (compressor part delay). Incomplete.",
  },
  {
    id: "file-2202",
    name: "Service price list 2026.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    modifiedAt: "2026-01-08T11:15:00+08:00",
    folder: "Operations",
    excerpt: "Aircon servicing $65/unit. Deep clean $180. Callout fee $40 waived on plans.",
  },
  {
    id: "file-2203",
    name: "Complaint handling policy.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    modifiedAt: "2025-11-02T09:00:00+08:00",
    folder: "Operations",
    excerpt:
      "Any goodwill credit must be approved by the owner. Apologise by name, " +
      "state the cause, offer a concrete remedy.",
  },
];

const STUB_MAILCHIMP_CAMPAIGNS = [
  {
    id: "camp-3301",
    name: "June aircon servicing promotion",
    status: "sent",
    sentAt: "2026-06-03T10:00:00+08:00",
    recipients: 812,
    openRate: 0.41,
    clickRate: 0.07,
    subject: "Beat the haze: 15% off aircon servicing this June",
  },
  {
    id: "camp-3302",
    name: "July maintenance plan renewals",
    status: "sent",
    sentAt: "2026-07-02T10:00:00+08:00",
    recipients: 386,
    openRate: 0.52,
    clickRate: 0.11,
    subject: "Your maintenance plan is up for renewal",
  },
  {
    id: "camp-3303",
    name: "August seasonal offer",
    status: "draft",
    sentAt: null,
    recipients: 0,
    openRate: 0,
    clickRate: 0,
    subject: "(draft) National Day servicing bundle",
  },
];

/* ═══════════════════════════ Read responders ═══════════════════════════ */

export type StubResponder = (args: Record<string, unknown>) => ToolResult;

/**
 * One responder per read operation in lib/plan/operations.ts. Filters are
 * honoured where an agent would plausibly pass one (`minDaysOverdue`,
 * `customerId`, `threadId`, `limit`); any other argument is ignored rather than
 * rejected, since the stub is not trying to be an API validator.
 */
const READ_RESPONDERS = new Map<string, StubResponder>([
  /* ── Gmail ── */
  [
    "gmail.threads.read",
    (args) => {
      const limit = numberArg(args, "limit");
      const threads =
        limit === null ? STUB_GMAIL_THREADS : STUB_GMAIL_THREADS.slice(0, Math.max(0, limit));
      return ok({ threads: clone(threads), total: STUB_GMAIL_THREADS.length });
    },
  ],
  [
    "gmail.messages.read",
    (args) => {
      const threadId = stringArg(args, "threadId");
      const messageId = stringArg(args, "messageId");
      let messages = STUB_GMAIL_MESSAGES;
      if (threadId !== null) messages = messages.filter((m) => m.threadId === threadId);
      if (messageId !== null) messages = messages.filter((m) => m.id === messageId);
      return ok({ messages: clone(messages) });
    },
  ],

  /* ── Google Calendar ── */
  [
    "google-calendar.events.list",
    (args) => {
      const technicianId = stringArg(args, "technicianId");
      const events =
        technicianId === null
          ? STUB_CALENDAR_EVENTS
          : STUB_CALENDAR_EVENTS.filter((e) => e.technicianId === technicianId);
      return ok({ events: clone(events), timezone: STUB_AVAILABILITY.timezone });
    },
  ],
  [
    "google-calendar.availability.read",
    (args) => {
      const technicianId = stringArg(args, "technicianId");
      const availability = clone(STUB_AVAILABILITY);
      if (technicianId !== null) {
        availability.technicians = availability.technicians.filter((t) => t.id === technicianId);
      }
      return ok(availability);
    },
  ],

  /* ── HubSpot ── */
  [
    "hubspot.contacts.read",
    (args) => {
      const id = stringArg(args, "contactId") ?? stringArg(args, "customerId");
      const email = stringArg(args, "email");
      const found =
        (id === null ? undefined : CONTACTS_BY_ID.get(id)) ??
        (email === null ? undefined : CONTACTS_BY_EMAIL.get(email));
      if (found === undefined && (id !== null || email !== null)) {
        return fail(`Stub: no contact matching ${id ?? email}`);
      }
      return ok({ contact: clone(found ?? DEFAULT_CONTACT) });
    },
  ],
  [
    "hubspot.deals.read",
    (args) => {
      const customerId = stringArg(args, "customerId");
      const deals =
        customerId === null
          ? STUB_DEALS
          : STUB_DEALS.filter((d) => d.customerId === customerId);
      return ok({ deals: clone(deals) });
    },
  ],
  [
    "hubspot.invoices.list",
    (args) => {
      const minDaysOverdue = numberArg(args, "minDaysOverdue");
      const customerId = stringArg(args, "customerId");
      const limit = numberArg(args, "limit");

      let invoices = STUB_INVOICES;
      if (minDaysOverdue !== null) {
        invoices = invoices.filter((i) => i.daysOverdue >= minDaysOverdue);
      }
      if (customerId !== null) {
        invoices = invoices.filter((i) => i.customerId === customerId);
      }
      if (limit !== null) invoices = invoices.slice(0, Math.max(0, limit));

      const totalOutstanding = invoices.reduce((sum, i) => sum + i.amount, 0);
      return ok({
        invoices: clone(invoices),
        count: invoices.length,
        totalOutstanding,
        currency: "SGD",
        asOf: STUB_TODAY,
      });
    },
  ],

  /* ── WhatsApp Business ── */
  [
    "whatsapp-business.messages.read",
    (args) => {
      const conversationId = stringArg(args, "conversationId");
      const messages =
        conversationId === null
          ? STUB_WHATSAPP_MESSAGES
          : STUB_WHATSAPP_MESSAGES.filter((m) => m.conversationId === conversationId);
      return ok({ messages: clone(messages) });
    },
  ],

  /* ── QuickBooks ── */
  [
    "quickbooks.invoices.list",
    (args) => {
      const status = stringArg(args, "status");
      const customerId = stringArg(args, "customerId");
      let invoices = STUB_QUICKBOOKS_INVOICES;
      if (status !== null) invoices = invoices.filter((i) => i.status === status);
      if (customerId !== null) invoices = invoices.filter((i) => i.customerId === customerId);
      return ok({ invoices: clone(invoices), asOf: STUB_TODAY });
    },
  ],
  [
    "quickbooks.payments.read",
    (args) => {
      const customerId = stringArg(args, "customerId");
      const payments =
        customerId === null
          ? STUB_PAYMENTS
          : STUB_PAYMENTS.filter((p) => p.customerId === customerId);
      return ok({ payments: clone(payments) });
    },
  ],

  /* ── Slack ── */
  [
    "slack.messages.read",
    (args) => {
      const channel = stringArg(args, "channel");
      const messages =
        channel === null
          ? STUB_SLACK_MESSAGES
          : STUB_SLACK_MESSAGES.filter((m) => m.channel === channel);
      return ok({ messages: clone(messages) });
    },
  ],

  /* ── Google Drive ── */
  [
    "google-drive.files.read",
    (args) => {
      const fileId = stringArg(args, "fileId");
      const files =
        fileId === null ? STUB_DRIVE_FILES : STUB_DRIVE_FILES.filter((f) => f.id === fileId);
      return ok({ files: clone(files) });
    },
  ],

  /* ── Mailchimp ── */
  [
    "mailchimp.campaigns.read",
    (args) => {
      const status = stringArg(args, "status");
      const campaigns =
        status === null
          ? STUB_MAILCHIMP_CAMPAIGNS
          : STUB_MAILCHIMP_CAMPAIGNS.filter((c) => c.status === status);
      return ok({ campaigns: clone(campaigns) });
    },
  ],
]);

/* ═══════════════════════════ Stub tool client ═══════════════════════════ */

export interface StubToolClientOptions {
  /**
   * Scopes the client to a single integration, so a call aimed elsewhere is
   * refused. Leave unset for the shared client the provider hands out.
   */
  integrationId?: string;
  /**
   * Per-operation overrides, consulted BEFORE the built-in table and before the
   * registry check, so a test can stub an operation the registry does not know
   * about or force a specific failure.
   */
  responses?: Record<string, StubResponder>;
}

export class StubToolClient implements ToolClient {
  private readonly integrationId: string | null;
  private readonly overrides: Map<string, StubResponder>;
  /** Every invocation, in order, refusals included. */
  private readonly log: ToolInvocation[] = [];

  constructor(opts?: StubToolClientOptions) {
    this.integrationId = opts?.integrationId ?? null;
    this.overrides = new Map(Object.entries(opts?.responses ?? {}));
  }

  /** Copy, so a test holding the list cannot rewrite what was recorded. */
  get calls(): ReadonlyArray<ToolInvocation> {
    return this.log.map((call) => clone(call));
  }

  callsTo(operation: string): ReadonlyArray<ToolInvocation> {
    return this.log.filter((call) => call.operation === operation).map((call) => clone(call));
  }

  /** Drops the log between test cases so runs cannot leak into each other. */
  reset(): void {
    this.log.length = 0;
  }

  async call(invocation: ToolInvocation): Promise<ToolResult> {
    // Snapshot first: the record must survive a caller that reuses its args
    // object across calls, and a refusal is as interesting to assert as a hit.
    this.log.push(clone(invocation));

    const { integrationId, operation, args } = invocation;

    if (this.integrationId !== null && this.integrationId !== integrationId) {
      return fail(
        `Stub client is scoped to "${this.integrationId}" but was called for "${integrationId}"`,
      );
    }

    const override = this.overrides.get(operation);
    if (override !== undefined) return override(clone(args));

    const def = getOperation(operation);
    if (def === undefined) {
      // Fail closed, exactly as the real mediation layer must: an operation the
      // shared registry does not know cannot be sanctioned by any grant.
      return fail(`Unknown operation "${operation}" — not in lib/plan/operations.ts`);
    }
    if (def.integrationId !== integrationId) {
      return fail(
        `Operation "${operation}" belongs to "${def.integrationId}", not "${integrationId}"`,
      );
    }

    if (def.access === "write") {
      // Simulated rather than performed. Policy has already decided this call is
      // permitted; the stub's job is to let the run continue and be assertable.
      return ok({ simulated: true, operation, args: clone(args) });
    }

    const responder = READ_RESPONDERS.get(operation);
    if (responder === undefined) {
      // Only reachable if the registry gains a read operation this file has not
      // caught up with. An empty result keeps runs alive without inventing data.
      return ok({ operation, results: [], note: "no stub fixture for this operation" });
    }
    return responder(clone(args));
  }
}

/* ═══════════════════════ Stub integration provider ═══════════════════════ */

/** The seven BrightPath connections plus Mailchimp for the marketing agent. */
export const DEFAULT_CONNECTED_INTEGRATIONS: string[] = [
  "gmail",
  "google-calendar",
  "hubspot",
  "whatsapp-business",
  "quickbooks",
  "google-drive",
  "slack",
  "mailchimp",
];

export interface StubIntegrationProviderOptions {
  /** Replaces the default connected set outright when supplied. */
  connected?: string[];
  /** Removed from whichever connected set is in force. */
  disconnected?: string[];
  /** Share one client across integrations; defaults to a fresh StubToolClient. */
  client?: ToolClient;
}

/**
 * Stands in for D's integration layer (contract §8 Q3). A disconnected
 * integration returns `null` from `getToolClient`, which is the path the
 * runtime must handle without crashing — a `required: true` grant blocks
 * activation, an optional one degrades gracefully.
 */
export class StubIntegrationProvider implements IntegrationProvider {
  private readonly connectedIds: Set<string>;
  private readonly shared: ToolClient;
  private readonly stub: StubToolClient;

  constructor(opts?: StubIntegrationProviderOptions) {
    this.connectedIds = new Set(opts?.connected ?? DEFAULT_CONNECTED_INTEGRATIONS);
    for (const id of opts?.disconnected ?? []) this.connectedIds.delete(id);

    const injected = opts?.client;
    this.stub = injected instanceof StubToolClient ? injected : new StubToolClient();
    this.shared = injected ?? this.stub;
  }

  getToolClient(integrationId: string): ToolClient | null {
    return this.connectedIds.has(integrationId) ? this.shared : null;
  }

  /**
   * Only "connected" and "required" are emitted. The interface also allows
   * "optional" and "needs_approval", but those are D's real-world states and a
   * stub inventing them would let tests assert behaviour we have not agreed.
   */
  getIntegrationStatus(
    integrationId: string,
  ): "connected" | "required" | "optional" | "needs_approval" {
    return this.connectedIds.has(integrationId) ? "connected" : "required";
  }

  /**
   * The client to assert against. When a non-stub client was injected, this is
   * an unused built-in stub rather than the injected one, since only a
   * StubToolClient carries a call log — assert against your own client instead.
   */
  get client(): StubToolClient {
    return this.stub;
  }

  get connected(): ReadonlyArray<string> {
    return Array.from(this.connectedIds);
  }
}
