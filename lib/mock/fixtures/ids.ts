/**
 * lib/mock/fixtures/ids.ts — canonical identifiers shared by every fixture file.
 * Import from here; never re-type an id string that exists here.
 */

/* ── Demo clock (deterministic — never derive dates at runtime) ── */
export const DEMO_TODAY = "2026-07-24";
export const DEMO_MONTH = "2026-07"; // calendar month shown in the workspace
export const DEMO_MONTH_LABEL = "July 2026";

/* ── Agents ── */
export const AGENT = {
  admin: "admin-operations",
  marketing: "marketing",
  finance: "finance-followup",
  recovery: "service-recovery",
  // The approved plan's real roster (support_helpdesk_gmail /
  // marketing_campaign_gmail in the planner). Present so the integration
  // cards' "Needed by" chips can name the workforce the plan actually holds
  // rather than the retired BrightPath demo roster.
  helpdesk: "helpdesk",
} as const;

export const AGENT_NAME: Record<string, string> = {
  [AGENT.admin]: "Admin Operations Agent",
  [AGENT.marketing]: "Marketing Agent",
  [AGENT.finance]: "Finance Follow-up Agent",
  [AGENT.recovery]: "Service Recovery Coordinator",
  [AGENT.helpdesk]: "Helpdesk Agent",
};

/* ── Workflows ── */
export const WF = {
  customerResponse: "customer-response-drafting",
  appointmentScheduling: "appointment-scheduling",
  contentPlanning: "content-planning",
  campaignDrafting: "campaign-drafting-approval",
  invoiceSummary: "overdue-invoice-summary",
  paymentReminders: "payment-reminder-drafting",
  complaintResolution: "high-value-complaint-resolution",
  // added by the NL command "Add a weekly overdue-invoice summary" variant
  weeklyInvoiceDigest: "weekly-invoice-digest",
} as const;

export const WF_NAME: Record<string, string> = {
  [WF.customerResponse]: "Customer Response Drafting",
  [WF.appointmentScheduling]: "Appointment Scheduling",
  [WF.contentPlanning]: "Content Planning",
  [WF.campaignDrafting]: "Campaign Drafting and Approval",
  [WF.invoiceSummary]: "Overdue Invoice Summary",
  [WF.paymentReminders]: "Payment Reminder Drafting",
  [WF.complaintResolution]: "High-Value Complaint Resolution",
  [WF.weeklyInvoiceDigest]: "Weekly Invoice Digest",
};

/* ── Integrations (apps) ── */
export const APP = {
  gmail: "gmail",
  googleCalendar: "google-calendar",
  hubspot: "hubspot",
  whatsapp: "whatsapp-business",
  quickbooks: "quickbooks",
  googleDrive: "google-drive",
  slack: "slack",
  outlook: "outlook",
  telegram: "telegram",
  intercom: "intercom",
  microsoftCalendar: "microsoft-calendar",
  calendly: "calendly",
  salesforce: "salesforce",
  pipedrive: "pipedrive",
  xero: "xero",
  stripe: "stripe",
  dropbox: "dropbox",
  onedrive: "onedrive",
  notion: "notion",
  mailchimp: "mailchimp",
  metaBusiness: "meta-business",
  linkedin: "linkedin",
  canva: "canva",
  teams: "microsoft-teams",
  asana: "asana",
  clickup: "clickup",
} as const;

/* ── MCP / internal tools ── */
export const MCP = {
  files: "mcp-files-documents",
  browser: "mcp-browser-research",
  calendar: "mcp-calendar-actions",
  crm: "mcp-crm-records",
  knowledge: "mcp-internal-knowledge",
} as const;

/** The seven connections recommended for the BrightPath plan (spec §12). */
export const RECOMMENDED_APP_IDS: string[] = [
  APP.gmail,
  APP.googleCalendar,
  APP.hubspot,
  APP.whatsapp,
  APP.quickbooks,
  APP.googleDrive,
  APP.slack,
];

/* ── Discovery questions (spec §9.2 order) ── */
export const DQ = {
  overloaded: "dq-overloaded-team",
  appointment: "dq-appointment-flow",
  decisions: "dq-human-decisions",
  finance: "dq-finance-repeat",
  coordination: "dq-hardest-coordination",
} as const;

/** Interview order. */
export const DISCOVERY_QUESTION_ORDER: string[] = [
  DQ.overloaded,
  DQ.appointment,
  DQ.decisions,
  DQ.finance,
  DQ.coordination,
];

/* ── Knowledge fact id prefixes ──
 * Base facts (onboarding + canvas): fact-base-*
 * Per-question unlocks:            fact-q1-* … fact-q5-*
 * Upload bonus:                    fact-upload-*
 * Employee response bonus:         fact-invite-*
 * Assumptions:                     fact-assume-*
 * Gaps:                            fact-gap-*
 * Opportunities:                   fact-opp-*
 */

/* ── Sandbox ── */
export const SCENARIO = {
  complaint: "scenario-high-value-complaint",
  appointment: "scenario-appointment-rush",
  invoice: "scenario-invoice-friday",
} as const;

/* ── Approvals (workspace fixtures) ── */
export const APPROVAL = {
  refund: "ap-refund-tan",           // $180 refund: high value, financial
  campaign: "ap-campaign-august",    // public campaign copy
  writeoff: "ap-invoice-writeoff",   // invoice write-off
  reschedule: "ap-reschedule-lim",   // schedule change after confirmation
  reminder: "ap-payment-reminders",  // Friday reminder batch
  complaint: "ap-complaint-wong",    // service recovery resolution
  contentPlan: "ap-content-plan",    // marketing content plan
  quote: "ap-maintenance-quote",     // renewal quote: customer facing
} as const;

/* ── Calendar events referenced by approvals (cal-*) ── */
export const CAL = {
  refund: "cal-refund-tan",
  campaign: "cal-campaign-august",
  writeoff: "cal-invoice-writeoff",
  reschedule: "cal-reschedule-lim",
  reminder: "cal-payment-reminders",
  complaint: "cal-complaint-wong",
  contentPlan: "cal-content-plan",
  quote: "cal-maintenance-quote",
} as const;

/* ── Owner / people ── */
export const OWNER = { name: "Sarah Chen", initials: "SC", role: "Owner" } as const;
export const PEOPLE = {
  careLead: "Priya Nair",       // Customer Care lead
  opsLead: "Marcus Tan",        // Field Operations lead
  marketingLead: "Dana Lim",    // Marketing coordinator
  financeLead: "Wei Ling Goh",  // Finance lead
} as const;

/* ── Pricing (spec §11.8) ── */
export const PRICING: Record<string, { setup: number; monthly: number }> = {
  [AGENT.admin]: { setup: 180, monthly: 59 },
  [AGENT.marketing]: { setup: 140, monthly: 49 },
  [AGENT.finance]: { setup: 160, monthly: 55 },
  [AGENT.recovery]: { setup: 420, monthly: 129 },
};
