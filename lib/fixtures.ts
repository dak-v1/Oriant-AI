/**
 * Fixture data for the demo company — Overtone Coffee — ported verbatim from
 * the approved design (reference/Margo.dc.html).
 *
 * Honesty rule (blueprint §24.4): anything served from this file is labeled
 * mode:"fixture" in the provider trace. Live provider results replace these
 * only when real API keys are configured.
 */
import type {
  AgentDef, ApprovalRequest, CalendarMark, CompanyReport, FeedEvent,
} from "./contracts";

export const ORG = { name: "Overtone Coffee", owner: "Nadia O.", initials: "NO" };

export const FIXTURE_REPORT: Omit<CompanyReport, "version" | "status" | "history"> = {
  exec:
    "Overtone Coffee is a 12-person specialty roaster selling single-origin beans and flexible subscriptions direct-to-consumer, with a small but growing wholesale channel. The team is strong on product and thin on operational capacity: repetitive support, subscription admin and wholesale intake eat hours that don’t scale. The owner wants more capacity and faster response times without hiring — while keeping the final say on anything financial or brand-facing.",
  facts: [
    { k: "Industry", v: "Specialty coffee · roaster & DTC" },
    { k: "Team", v: "12 people" },
    { k: "Model", v: "Bags · subscriptions · wholesale" },
    { k: "Channels", v: "Shopify · IG · email · cafes" },
    { k: "Founded", v: "2021 · one roastery" },
    { k: "Prepared", v: "From your call · 19 Jul 2026" },
  ],
  canvas: [
    { label: "Problem", dot: "var(--ochre)", body: "Support spikes at drops, wholesale leads stall for days, restocking is reactive so best-sellers sell out." },
    { label: "Customer segments", dot: "var(--forest)", body: "Home specialty drinkers · subscription regulars · independent cafes (wholesale)." },
    { label: "Unique value", dot: "var(--forest)", body: "Single-origin roasted to order, on a subscription that bends to your schedule." },
    { label: "Solution", dot: "var(--forest)", body: "DTC storefront + flexible subscriptions + a small, hands-on wholesale program." },
    { label: "Channels", dot: "var(--forest)", body: "Shopify store, Instagram, email, and word-of-mouth between cafes." },
    { label: "Revenue", dot: "var(--forest)", body: "One-off bags, recurring subscriptions, and wholesale invoices." },
    { label: "Cost structure", dot: "var(--forest)", body: "Green beans, packaging, shipping, fulfillment, and a 12-person team." },
    { label: "Key metrics", dot: "var(--ochre)", body: "MRR · subscriber churn · first-response time · stockout days per roast." },
    { label: "Unfair advantage", dot: "var(--forest)", body: "Direct importer relationships and a loyal, vocal subscriber base." },
  ],
  processes: [
    { name: "Order-status replies", trigger: "Customer message", systems: "Gorgias · Shopify", freq: "~300/wk", owner: "Support" },
    { name: "Subscription changes", trigger: "Customer request", systems: "Recharge", freq: "~60/wk", owner: "Support" },
    { name: "Wholesale intake", trigger: "Inbound email/DM", systems: "Gmail", freq: "~8/wk", owner: "Founder" },
    { name: "Bean reordering", trigger: "Low stock", systems: "Shopify · Sheets", freq: "Weekly", owner: "Ops" },
    { name: "Review responses", trigger: "New review/DM", systems: "IG · Trustpilot", freq: "~25/wk", owner: "Marketing" },
  ],
  systems: [
    { name: "Shopify", use: "Orders, catalog, stock levels", status: "Connected" },
    { name: "Recharge", use: "Subscription management", status: "Connected" },
    { name: "Gorgias", use: "Support inbox", status: "Ready to connect" },
    { name: "Gmail", use: "Wholesale inbox", status: "Needs auth" },
    { name: "Google Sheets", use: "Reorder tracking", status: "Connected" },
    { name: "Instagram", use: "DMs & review replies", status: "Not connected" },
  ],
  pain: [
    { t: "Support spikes at drops", detail: "Volume jumps ~65% during a release; first-response time slips past a day." },
    { t: "Wholesale leads stall", detail: "Inbound cafe interest sits in the founder’s inbox for days with no clear owner." },
    { t: "Reactive restocking", detail: "Best-selling roasts sell out because reorder is triggered by memory, not stock levels." },
  ],
  useCases: [
    { name: "Respond to repeat customer questions", trigger: "customer.message.received", freq: "~300/wk", risk: "Medium" },
    { name: "Apply a subscription change", trigger: "customer.request", freq: "~60/wk", risk: "Low" },
    { name: "Qualify a wholesale lead", trigger: "wholesale.email.received", freq: "~8/wk", risk: "Medium" },
    { name: "Flag and draft a reorder", trigger: "stock.below_floor", freq: "Weekly", risk: "High" },
    { name: "Draft on-brand review replies", trigger: "review.created", freq: "~25/wk", risk: "Low" },
  ],
  constraints: [
    "Refunds, reorders and wholesale pricing always require the owner’s approval.",
    "Agents may never access banking or move money.",
    "Brand voice stays warm, plain and never defensive.",
    "Customer data is shared with providers on a need-to-know basis only.",
  ],
};

export const FIXTURE_TEAM: AgentDef[] = [
  { id: "frontdesk", name: "Front Desk", role: "Customer support", tag: "Preset", desc: "Clears the “where’s my order?” pile, drafts replies, escalates the sensitive ones.", price: 180, integ: ["Gorgias", "Shopify"], approval: "Draft for approval", covers: "Repeat customer questions", fit: "Sized to your ~300/wk support volume", inPlan: true, status: "needs-config", base: "needs-config" },
  { id: "subs", name: "Subscriptions", role: "Retention", tag: "Preset", desc: "Pauses, swaps and reschedules coffee subscriptions on request.", price: 140, integ: ["Recharge", "Shopify"], approval: "Review after action", covers: "Subscription changes", fit: "Direct Recharge integration", inPlan: true, status: "ready", base: "needs-config" },
  { id: "restock", name: "Restock Radar", role: "Inventory", tag: "Preset", desc: "Watches green-bean stock, flags low roasts, drafts the reorder.", price: 120, integ: ["Shopify", "Sheets"], approval: "Decision required", covers: "Restock & reorder", fit: "Reads Shopify stock levels", inPlan: true, status: "needs-integration", base: "needs-integration" },
  { id: "wholesale", name: "Wholesale Intake", role: "Custom agent", tag: "Custom", desc: "Qualifies cafe & wholesale leads, preps a pricing sheet, books the call.", price: 210, integ: ["Gmail", "HubSpot"], approval: "Decision required", covers: "Wholesale intake", fit: "No preset fits — custom-built", inPlan: true, status: "needs-info", base: "needs-info" },
  { id: "reviews", name: "Reviews", role: "Marketing", tag: "Preset", desc: "Drafts on-brand replies to reviews and DMs — never posts without you.", price: 90, integ: ["Instagram", "Trustpilot"], approval: "Draft for approval", covers: "Review replies", fit: "Brand voice is ready", inPlan: false, status: "recommended", base: "needs-config" },
  { id: "report", name: "Monday Report", role: "Reporting", tag: "Preset", desc: "Bundles sales, tickets and stock into one Monday-morning readout.", price: 70, integ: ["Shopify", "Sheets"], approval: "Inform only", covers: "Weekly reporting", fit: "Rolls up the numbers", inPlan: false, status: "recommended", base: "needs-config" },
  { id: "bookings", name: "Bookings", role: "Scheduling", tag: "Preset", desc: "Offers slots, books tastings and roastery tours, sends reminders.", price: 110, integ: ["Calendly", "Gmail"], approval: "Review after action", covers: "Appointments", fit: "For your tasting events", inPlan: false, status: "recommended", base: "needs-config" },
  { id: "invoices", name: "Cash Desk", role: "Finance", tag: "Preset", desc: "Preps invoices from approved orders and chases the unpaid ones.", price: 130, integ: ["QuickBooks", "Shopify"], approval: "Draft for approval", covers: "Invoicing", fit: "Wholesale billing", inPlan: false, status: "recommended", base: "needs-config" },
  { id: "social", name: "Social Scheduler", role: "Marketing", tag: "Preset", desc: "Drafts and schedules launch posts from approved brand rules.", price: 95, integ: ["Instagram", "Buffer"], approval: "Draft for approval", covers: "Content", fit: "Drop announcements", inPlan: false, status: "recommended", base: "needs-config" },
  { id: "leads", name: "Lead Qualifier", role: "Sales", tag: "Preset", desc: "Scores inbound leads against your criteria and routes the good ones.", price: 100, integ: ["HubSpot", "Gmail"], approval: "Decision required", covers: "Lead routing", fit: "Feeds wholesale", inPlan: false, status: "recommended", base: "needs-config" },
  { id: "faq", name: "Knowledge Builder", role: "Ops", tag: "Preset", desc: "Turns your docs into an approved answer library the team can trust.", price: 60, integ: ["Notion", "Sheets"], approval: "Inform only", covers: "Knowledge base", fit: "Feeds Front Desk", inPlan: false, status: "recommended", base: "needs-config" },
];

/** use-case name prefix → covering agent id (from the design) */
export const COVER_MAP: Record<string, string> = {
  "Respond to repeat": "frontdesk",
  "Apply a subscription": "subs",
  "Qualify a wholesale": "wholesale",
  "Flag and draft": "restock",
  "Draft on-brand": "reviews",
};

export const BASE_FEE = 120;

export const DEFAULT_CONFIG = {
  mode: "approval" as const,
  channels: { Email: true, "Website chat": true },
  knowledge: { "Company brief": true, FAQ: true },
  approvals: { Refunds: true, "Sensitive cases": true },
  target: "< 1 hour",
  hours: "Business hours",
  escalation: "Founder",
  retry: "3 retries",
};

export const FIXTURE_EVENTS: FeedEvent[] = [
  { t: "2:14pm", who: "Front Desk", msg: "Answered order-status question from J. Kwon → sent", tone: "done" },
  { t: "2:09pm", who: "Wholesale Intake", msg: "Qualified Blue Fox Cafe (score 82) → asked you to approve pricing", tone: "wait" },
  { t: "1:51pm", who: "Restock Radar", msg: "Ethiopia Guji below 12kg → drafted reorder", tone: "wait" },
  { t: "1:38pm", who: "Subscriptions", msg: "Paused M. Alvarez subscription for 2 weeks → done", tone: "done" },
  { t: "1:20pm", who: "Front Desk", msg: "Escalated a damaged-order refund → your desk", tone: "ember" },
];

export const FIXTURE_APPROVALS: ApprovalRequest[] = [
  { id: "a1", agent: "Front Desk", title: "Refund $48 to M. Alvarez", summary: "Order #4471 arrived cracked. Customer sent a photo. Proposes a full refund and a $10 credit.", risk: "Medium", due: "Today · 4:00pm", status: "required", amount: "$48.00", comments: [] },
  { id: "a2", agent: "Wholesale Intake", title: "Send pricing sheet to Blue Fox Cafe", summary: "Lead scored 82/100. Proposes tier-2 wholesale pricing and a Thursday call slot.", risk: "Medium", due: "Today · 5:30pm", status: "required", amount: "—", comments: [] },
  { id: "a3", agent: "Restock Radar", title: "Reorder 60kg Ethiopia Guji", summary: "Stock at 11kg, below the 15kg floor. Proposes a reorder from the usual importer.", risk: "High", due: "Tomorrow · 9:00am", status: "required", amount: "$2,340", comments: [] },
  { id: "a4", agent: "Reviews", title: "Reply to 3-star review from D. Park", summary: "Drafted a warm, non-defensive reply acknowledging the late delivery.", risk: "Low", due: "Tomorrow · 12:00pm", status: "approved", amount: "—", comments: [] },
  { id: "a5", agent: "Monday Report", title: "Weekly ops digest", summary: "Auto-compiled. No action needed — informational.", risk: "Low", due: "Mon · 8:00am", status: "done", amount: "—", comments: [] },
];

export const FIXTURE_CALENDAR: { month: string; marks: CalendarMark[] } = {
  month: "July 2026",
  marks: [
    { day: 19, today: true },
    { day: 20, color: "done" },
    { day: 21, color: "ember" },
    { day: 22, color: "ochre" },
    { day: 24, color: "forest" },
    { day: 27, color: "ember" },
  ],
};

export const VALIDATE_CHECKS = [
  { k: "Schema validation", v: "passed" },
  { k: "Secret scan", v: "passed" },
  { k: "Tool allowlist", v: "passed" },
  { k: "Permission policy", v: "passed" },
  { k: "Unit tests", v: "12 / 12" },
  { k: "Integration tests", v: "5 / 5" },
];

export const BUILD_WAVES = [
  { w: "Wave 0", label: "Shared contracts", note: "Event schemas · error model · logging" },
  { w: "Wave 1", label: "Agent packages", note: "Prompt · spec · tools · unit tests" },
  { w: "Wave 2", label: "Adapters", note: "Event mappings · approval hooks · integrations" },
  { w: "Wave 3", label: "Workflow tests", note: "End-to-end · failure paths · approvals" },
];

export const BUILD_FILES = [
  "agent.yaml", "workflow.yaml", "prompt.md", "tools.yaml",
  "permissions.yaml", "test-cases.yaml", "required-integrations.json", "README.md",
];
