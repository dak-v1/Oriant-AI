/**
 * demo-company.ts — canonical BrightPath Home Services demo company fixture.
 * Covers spec §6 (demo company), §7.2 (onboarding sections), §7.3 (tool catalog)
 * and improvement spec §7 (business-function grouping + one-line purposes).
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

/** Catalog entry: the shared ToolChip contract plus a one-line purpose
 *  (improvement spec §7 — purpose stays local to this fixture). */
export type CatalogTool = ToolChip & { purpose: string };

/** Spec §7.3 + improvement spec §7 — the selectable tool catalog, grouped by
 *  business function. Catalog-only additions (Shopify, WooCommerce) use plain
 *  string ids because they exist nowhere else in the mock. */
export const TOOL_CATALOG: CatalogTool[] = [
  // Communication
  { id: APP.gmail, name: "Gmail", category: "communication", purpose: "Shared inbox for customer email" },
  { id: APP.outlook, name: "Outlook", category: "communication", purpose: "Customer email for Microsoft 365 teams" },
  { id: APP.whatsapp, name: "WhatsApp Business", category: "communication", purpose: "Customer chat on your business number" },
  { id: APP.telegram, name: "Telegram", category: "communication", purpose: "Direct customer messaging channel" },
  { id: APP.intercom, name: "Intercom", category: "communication", purpose: "Live chat on your website" },
  { id: APP.slack, name: "Slack", category: "communication", purpose: "Team chat and internal channels" },
  { id: APP.teams, name: "Microsoft Teams", category: "communication", purpose: "Team chat and meetings in Microsoft 365" },
  // Calendar
  { id: APP.googleCalendar, name: "Google Calendar", category: "scheduling", purpose: "Team and technician scheduling" },
  { id: APP.microsoftCalendar, name: "Microsoft Calendar", category: "scheduling", purpose: "Scheduling for Microsoft 365 teams" },
  { id: APP.calendly, name: "Calendly", category: "scheduling", purpose: "Self-service booking links for customers" },
  // Customer management
  { id: APP.hubspot, name: "HubSpot", category: "crm", purpose: "Customer records and deal tracking" },
  { id: APP.salesforce, name: "Salesforce", category: "crm", purpose: "Customer records for larger sales teams" },
  { id: APP.pipedrive, name: "Pipedrive", category: "crm", purpose: "Simple sales pipeline tracking" },
  // Finance
  { id: APP.quickbooks, name: "QuickBooks", category: "finance", purpose: "Invoicing and accounting" },
  { id: APP.xero, name: "Xero", category: "finance", purpose: "Cloud accounting and invoicing" },
  { id: APP.stripe, name: "Stripe", category: "finance", purpose: "Card payments and payouts" },
  // Marketing
  { id: APP.mailchimp, name: "Mailchimp", category: "marketing", purpose: "Email newsletters and campaigns" },
  { id: APP.metaBusiness, name: "Meta Business Suite", category: "marketing", purpose: "Facebook and Instagram publishing" },
  { id: APP.linkedin, name: "LinkedIn", category: "marketing", purpose: "Company page posts and hiring content" },
  { id: APP.canva, name: "Canva", category: "marketing", purpose: "Design templates and brand assets" },
  // Storage
  { id: APP.googleDrive, name: "Google Drive", category: "storage", purpose: "Shared files and documents" },
  { id: APP.dropbox, name: "Dropbox", category: "storage", purpose: "File storage and sharing" },
  { id: APP.onedrive, name: "OneDrive", category: "storage", purpose: "File storage in Microsoft 365" },
  { id: APP.notion, name: "Notion", category: "storage", purpose: "Team wiki, SOPs and notes" },
  // Commerce
  { id: "shopify", name: "Shopify", category: "commerce", purpose: "Online store orders and customers" },
  { id: "woocommerce", name: "WooCommerce", category: "commerce", purpose: "Orders and stock on a WordPress store" },
  // Project management
  { id: APP.asana, name: "Asana", category: "project", purpose: "Task and project tracking" },
  { id: APP.clickup, name: "ClickUp", category: "project", purpose: "Projects, tasks and docs in one place" },
];

/** Business-function labels (improvement spec §7).
 *  "collaboration" is a legacy union member with no catalog tools; it is kept
 *  only so this record satisfies the ToolCategory union. */
export const TOOL_CATEGORY_LABELS: Record<ToolCategory, string> = {
  communication: "Communication",
  scheduling: "Calendar",
  crm: "Customer Management",
  finance: "Finance",
  marketing: "Marketing",
  storage: "Storage",
  commerce: "Commerce",
  project: "Project Management",
  other: "Other",
  collaboration: "Communication",
};

/** Display order for category groups and filter chips (improvement spec §7). */
export const TOOL_CATEGORY_ORDER: ToolCategory[] = [
  "communication",
  "scheduling",
  "crm",
  "finance",
  "marketing",
  "storage",
  "commerce",
  "project",
  "other",
];

/** Spec §7.1 — Sarah's hardcoded opening voice answer. */
export const DEMO_INTRO_ANSWER =
  "We run BrightPath Home Services in Singapore, eighteen of us doing residential " +
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
    blurb: "Lean Canvas, SOPs or an org chart: anything already written down.",
  },
  {
    id: "consent",
    title: "Permissions and consent",
    blurb: "What Oriant may read, what it may draft, and what always needs approval.",
  },
];
