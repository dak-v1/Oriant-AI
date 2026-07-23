/**
 * demo-company.ts — canonical BrightPath Home Services demo company fixture.
 * Covers spec §6 (demo company), §7.2 (onboarding sections), §7.3 (tool catalog).
 */

import type { CompanyProfile, ToolCategory, ToolChip } from "../types";
import { APP } from "./ids";

/** Spec §6 — the hardcoded "Use demo company" profile. */
export const DEMO_COMPANY: CompanyProfile = {
  name: "BrightPath Home Services",
  industry: "Residential maintenance and home services",
  location: "Singapore",
  businessModel: "Appointment-based services with recurring maintenance plans",
  teamSize: 18,
  monthlyVolume: "~650 customer requests, 420 completed jobs",
  teams: ["Customer Care", "Field Operations", "Marketing", "Finance", "Management"],
  primaryGoal:
    "Reduce manual coordination while keeping customer-facing and financial decisions human",
  alwaysApprove: [
    "Refunds above $100",
    "Public marketing content",
    "Invoice write-offs",
    "Schedule changes after customer confirmation",
  ],
  neverAutomate: [
    "Employee termination",
    "Bank transfers",
    "Legal commitments",
    "Deletion of customer records",
  ],
  painPoints: [
    "Messages sorted manually across Gmail and WhatsApp",
    "Appointments repeatedly rescheduled by phone and calendar",
    "Marketing planned inconsistently and waiting on the owner",
    "Overdue invoices checked manually every week",
    "High-value complaints need input from several teams before a decision",
  ],
};

/** Spec §7.3 — the full selectable tool catalog, in spec category order. */
export const TOOL_CATALOG: ToolChip[] = [
  // Customer communication
  { id: APP.gmail, name: "Gmail", category: "communication" },
  { id: APP.outlook, name: "Outlook", category: "communication" },
  { id: APP.whatsapp, name: "WhatsApp Business", category: "communication" },
  { id: APP.telegram, name: "Telegram", category: "communication" },
  { id: APP.intercom, name: "Intercom", category: "communication" },
  // Scheduling
  { id: APP.googleCalendar, name: "Google Calendar", category: "scheduling" },
  { id: APP.microsoftCalendar, name: "Microsoft Calendar", category: "scheduling" },
  { id: APP.calendly, name: "Calendly", category: "scheduling" },
  // CRM and sales
  { id: APP.hubspot, name: "HubSpot", category: "crm" },
  { id: APP.salesforce, name: "Salesforce", category: "crm" },
  { id: APP.pipedrive, name: "Pipedrive", category: "crm" },
  // Finance
  { id: APP.quickbooks, name: "QuickBooks", category: "finance" },
  { id: APP.xero, name: "Xero", category: "finance" },
  { id: APP.stripe, name: "Stripe", category: "finance" },
  // Storage and documents
  { id: APP.googleDrive, name: "Google Drive", category: "storage" },
  { id: APP.dropbox, name: "Dropbox", category: "storage" },
  { id: APP.onedrive, name: "OneDrive", category: "storage" },
  { id: APP.notion, name: "Notion", category: "storage" },
  // Marketing
  { id: APP.mailchimp, name: "Mailchimp", category: "marketing" },
  { id: APP.metaBusiness, name: "Meta Business Suite", category: "marketing" },
  { id: APP.linkedin, name: "LinkedIn", category: "marketing" },
  { id: APP.canva, name: "Canva", category: "marketing" },
  // Internal collaboration
  { id: APP.slack, name: "Slack", category: "collaboration" },
  { id: APP.teams, name: "Microsoft Teams", category: "collaboration" },
  { id: APP.asana, name: "Asana", category: "collaboration" },
  { id: APP.clickup, name: "ClickUp", category: "collaboration" },
];

export const TOOL_CATEGORY_LABELS: Record<ToolCategory, string> = {
  communication: "Customer communication",
  scheduling: "Scheduling",
  crm: "CRM and sales",
  finance: "Finance",
  storage: "Storage and documents",
  marketing: "Marketing",
  collaboration: "Internal collaboration",
};

/** Spec §7.1 — Sarah's hardcoded opening voice answer. */
export const DEMO_INTRO_ANSWER =
  "We run BrightPath Home Services in Singapore — eighteen of us doing residential " +
  "maintenance, around 650 customer requests a month. Too much of our day goes into " +
  "sorting Gmail and WhatsApp messages by hand and rescheduling appointments over the " +
  "phone. Marketing keeps waiting on me, and every Friday the finance team combs " +
  "through overdue invoices manually.";

/** Spec §7.2 — the seven onboarding capture areas. */
export const ONBOARDING_SECTIONS: { id: string; title: string; blurb: string }[] = [
  {
    id: "company",
    title: "Company",
    blurb: "What BrightPath does, where it operates and how it earns.",
  },
  {
    id: "team",
    title: "Team and responsibilities",
    blurb: "Who is on the team and which team handles what.",
  },
  {
    id: "goals",
    title: "Goals",
    blurb: "What Sarah wants Oriant to improve first.",
  },
  {
    id: "automation-preference",
    title: "Automation preference",
    blurb: "How much should stay with people versus run automatically.",
  },
  {
    id: "tools",
    title: "Existing tools",
    blurb: "The systems the team already works in every day.",
  },
  {
    id: "business-info",
    title: "Business information",
    blurb: "Lean Canvas, SOPs or an org chart — anything already written down.",
  },
  {
    id: "consent",
    title: "Permissions and consent",
    blurb: "What Oriant may read, what it may draft, and what always needs approval.",
  },
];
