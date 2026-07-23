/**
 * lib/mock/fixtures/integrations.ts — connection catalogue for BrightPath Home
 * Services (spec §12): 7 recommended apps, 12 additional available apps and the
 * 5 MCP / internal tools, plus the tab order for the integrations screen.
 */

import type { IntegrationDef } from "../types";
import { AGENT, APP, MCP } from "./ids";

export const INTEGRATIONS: Record<string, IntegrationDef> = {
  /* ── Recommended for the BrightPath plan (spec §12) ── */

  [APP.gmail]: {
    id: APP.gmail,
    name: "Gmail",
    category: "Customer communication",
    kind: "app",
    purpose: "Lets agents read the shared ops inbox and prepare reply drafts without sending anything on their own.",
    neededBy: [AGENT.admin, AGENT.finance, AGENT.recovery],
    reads: ["Incoming customer emails", "Email threads and labels", "Shared inbox folders"],
    actions: ["Draft replies for review", "Label and sort enquiries", "Queue approved sends"],
    defaultStatus: "required",
    advanced: {
      protocol: "OAuth 2.0",
      server: "https://gmail.googleapis.com",
      scopes: ["gmail.readonly", "gmail.compose", "gmail.labels"],
    },
    permissionSummary: [
      "Oriant can read mail arriving in the shared ops inbox.",
      "Agents prepare drafts; nothing is sent without your approval rules.",
      "You can disconnect at any time — existing drafts stay in Gmail.",
    ],
    account: "ops@brightpath.sg",
  },

  [APP.googleCalendar]: {
    id: APP.googleCalendar,
    name: "Google Calendar",
    category: "Scheduling",
    kind: "app",
    purpose: "Gives the Admin Operations Agent visibility of technician calendars so it can propose and hold appointment slots.",
    neededBy: [AGENT.admin],
    reads: ["Technician calendars", "Existing bookings", "Working hours and blocked days"],
    actions: ["Propose available slots", "Create tentative holds", "Update bookings after approval"],
    defaultStatus: "required",
    advanced: {
      protocol: "OAuth 2.0",
      server: "https://www.googleapis.com/calendar/v3",
      scopes: ["calendar.events.readonly", "calendar.events", "calendar.settings.readonly"],
    },
    permissionSummary: [
      "Oriant can see technician availability across BrightPath calendars.",
      "Slots are held as tentative until a coordinator or rule confirms them.",
      "Schedule changes after customer confirmation always need a person.",
    ],
    account: "ops@brightpath.sg",
  },

  [APP.hubspot]: {
    id: APP.hubspot,
    name: "HubSpot",
    category: "CRM and sales",
    kind: "app",
    purpose: "Provides customer records, plan value and service history so replies and complaint resolutions use real context.",
    neededBy: [AGENT.admin, AGENT.marketing, AGENT.recovery],
    reads: ["Contact records", "Service and complaint history", "Maintenance plan value"],
    actions: ["Log interactions", "Update contact notes", "Tag high-value customers"],
    defaultStatus: "required",
    advanced: {
      protocol: "OAuth 2.0",
      server: "https://api.hubapi.com",
      scopes: ["crm.objects.contacts.read", "crm.objects.contacts.write", "crm.objects.notes.write"],
    },
    permissionSummary: [
      "Oriant can read customer records and their service history.",
      "Agents may add notes and tags but never delete a customer record.",
      "High-value customer tags drive the extra approval rules you set.",
    ],
    account: "BrightPath Home Services — SG portal",
  },

  [APP.whatsapp]: {
    id: APP.whatsapp,
    name: "WhatsApp Business",
    category: "Customer communication",
    kind: "app",
    purpose: "Lets agents read incoming WhatsApp enquiries and queue reply drafts on your business number.",
    neededBy: [AGENT.admin, AGENT.recovery],
    reads: ["Incoming customer messages", "Chat history with each customer"],
    actions: ["Draft replies for review", "Queue approved messages"],
    defaultStatus: "required",
    advanced: {
      protocol: "OAuth 2.0",
      server: "https://graph.facebook.com/v19.0",
      scopes: ["whatsapp_business_messaging", "whatsapp_business_management"],
    },
    permissionSummary: [
      "Oriant can read messages sent to your WhatsApp Business number.",
      "Replies are drafted first; sending follows your approval rules.",
      "No message ever goes to a high-value customer automatically.",
    ],
    account: "+65 6744 2018 — BrightPath Services",
  },

  [APP.quickbooks]: {
    id: APP.quickbooks,
    name: "QuickBooks",
    category: "Finance",
    kind: "app",
    purpose: "Lets the finance and recovery agents check invoice and payment status; they can flag items but never change amounts.",
    neededBy: [AGENT.finance, AGENT.recovery],
    reads: ["Invoices and due dates", "Payment status", "Customer balances"],
    actions: ["Draft payment reminders", "Flag invoices for review"],
    defaultStatus: "required",
    advanced: {
      protocol: "OAuth 2.0",
      server: "https://quickbooks.api.intuit.com",
      scopes: ["com.intuit.quickbooks.accounting.read", "com.intuit.quickbooks.payment.read"],
    },
    permissionSummary: [
      "Oriant can read invoices, due dates and payment status.",
      "Agents never edit amounts, write off invoices or move money.",
      "Write-offs and refunds always come to you as approval requests.",
    ],
    account: "BrightPath Home Services Pte Ltd",
  },

  [APP.googleDrive]: {
    id: APP.googleDrive,
    name: "Google Drive",
    category: "Storage and documents",
    kind: "app",
    purpose: "Gives the Marketing Agent access to brand assets, past campaigns and the content calendar folder.",
    neededBy: [AGENT.marketing],
    reads: ["Brand asset folder", "Past campaign documents", "Content calendar sheet"],
    actions: ["Attach assets to drafts", "Save campaign drafts to the marketing folder"],
    defaultStatus: "required",
    advanced: {
      protocol: "OAuth 2.0",
      server: "https://www.googleapis.com/drive/v3",
      scopes: ["drive.readonly", "drive.file"],
    },
    permissionSummary: [
      "Oriant can read the shared marketing folders you choose.",
      "Drafts are saved into the marketing folder, never elsewhere.",
      "Nothing is shared outside BrightPath without your approval.",
    ],
    account: "ops@brightpath.sg",
  },

  [APP.slack]: {
    id: APP.slack,
    name: "Slack",
    category: "Internal collaboration",
    kind: "app",
    purpose: "Lets agents post summaries and approval notifications into your team channels instead of more email.",
    neededBy: [AGENT.marketing, AGENT.finance, AGENT.recovery],
    reads: ["Messages in #ops and #finance", "Channel member list"],
    actions: ["Post daily and weekly summaries", "Notify approvers of pending items"],
    defaultStatus: "required",
    advanced: {
      protocol: "OAuth 2.0",
      server: "https://slack.com/api",
      scopes: ["channels:read", "chat:write", "users:read"],
    },
    permissionSummary: [
      "Oriant can post into the channels you pick, such as #ops and #finance.",
      "Agents only read channels they post into, nothing private.",
      "Notifications link back to the approval — decisions stay in Oriant.",
    ],
    account: "brightpath-sg.slack.com",
  },

  /* ── Available apps (optional, not in the current plan) ── */

  [APP.outlook]: {
    id: APP.outlook,
    name: "Outlook",
    category: "Customer communication",
    kind: "app",
    purpose: "Alternative shared mailbox if part of your team works in Microsoft 365 instead of Gmail.",
    neededBy: [],
    reads: ["Incoming customer emails", "Shared mailbox folders"],
    actions: ["Draft replies for review", "Sort and label enquiries"],
    defaultStatus: "optional",
    advanced: {
      protocol: "OAuth 2.0",
      server: "https://graph.microsoft.com/v1.0",
      scopes: ["Mail.Read", "Mail.ReadWrite.Shared"],
    },
    permissionSummary: [
      "Oriant can read mail in the shared mailbox you select.",
      "Replies are drafted for review, never sent automatically.",
      "Disconnecting removes access immediately.",
    ],
    account: "ops@brightpath.sg",
  },

  [APP.intercom]: {
    id: APP.intercom,
    name: "Intercom",
    category: "Customer communication",
    kind: "app",
    purpose: "Website chat inbox — useful if you later add live chat to the BrightPath booking page.",
    neededBy: [],
    reads: ["Website chat conversations", "Visitor context"],
    actions: ["Draft chat replies", "Tag conversations by topic"],
    defaultStatus: "optional",
    advanced: {
      protocol: "OAuth 2.0",
      server: "https://api.intercom.io",
      scopes: ["conversations.read", "conversations.write"],
    },
    permissionSummary: [
      "Oriant can read chats started on your website widget.",
      "Suggested replies wait for a person unless you set a rule.",
      "Visitor data stays inside your Intercom workspace.",
    ],
    account: "brightpath.sg workspace",
  },

  [APP.calendly]: {
    id: APP.calendly,
    name: "Calendly",
    category: "Scheduling",
    kind: "app",
    purpose: "Self-service booking links customers could use to pick their own maintenance slots.",
    neededBy: [],
    reads: ["Booking page availability", "New bookings and cancellations"],
    actions: ["Create single-use booking links", "Sync bookings to the calendar"],
    defaultStatus: "optional",
    advanced: {
      protocol: "OAuth 2.0",
      server: "https://api.calendly.com",
      scopes: ["scheduling_links:create", "scheduled_events:read"],
    },
    permissionSummary: [
      "Oriant can create booking links tied to technician availability.",
      "Bookings still follow your confirmation and approval rules.",
      "You control which services get a self-service link.",
    ],
    account: "brightpath-services",
  },

  [APP.xero]: {
    id: APP.xero,
    name: "Xero",
    category: "Finance",
    kind: "app",
    purpose: "Alternative accounting connection if you ever move off QuickBooks.",
    neededBy: [],
    reads: ["Invoices and due dates", "Payment status"],
    actions: ["Draft payment reminders", "Flag invoices for review"],
    defaultStatus: "optional",
    advanced: {
      protocol: "OAuth 2.0",
      server: "https://api.xero.com",
      scopes: ["accounting.transactions.read", "accounting.contacts.read"],
    },
    permissionSummary: [
      "Oriant can read invoices and payment status.",
      "Agents never change amounts or record payments.",
      "Write-offs always require your approval.",
    ],
    account: "BrightPath Home Services Pte Ltd",
  },

  [APP.stripe]: {
    id: APP.stripe,
    name: "Stripe",
    category: "Finance",
    kind: "app",
    purpose: "Read-only view of card payments if you add online payment links to invoices.",
    neededBy: [],
    reads: ["Payment status", "Payout schedule"],
    actions: ["Match payments to invoices", "Flag failed payments"],
    defaultStatus: "optional",
    advanced: {
      protocol: "OAuth 2.0",
      server: "https://api.stripe.com/v1",
      scopes: ["charges.read", "payouts.read"],
    },
    permissionSummary: [
      "Oriant can see whether a payment succeeded or failed.",
      "Agents can never charge, refund or move money.",
      "Refund requests always come to you first.",
    ],
    account: "BrightPath Home Services Pte Ltd",
  },

  [APP.notion]: {
    id: APP.notion,
    name: "Notion",
    category: "Storage and documents",
    kind: "app",
    purpose: "Team wiki connection if your SOPs and checklists live in Notion pages.",
    neededBy: [],
    reads: ["Selected wiki pages", "SOP databases"],
    actions: ["Quote SOP steps in drafts", "Suggest page updates for review"],
    defaultStatus: "optional",
    advanced: {
      protocol: "OAuth 2.0",
      server: "https://api.notion.com/v1",
      scopes: ["read_content", "read_comments"],
    },
    permissionSummary: [
      "Oriant can read only the pages you share with it.",
      "Agents quote your SOPs; they do not edit pages.",
      "Suggested updates arrive as review items.",
    ],
    account: "BrightPath team workspace",
  },

  [APP.mailchimp]: {
    id: APP.mailchimp,
    name: "Mailchimp",
    category: "Marketing",
    kind: "app",
    purpose: "Email newsletter tool the Marketing Agent could draft campaigns into once you approve copy.",
    neededBy: [],
    reads: ["Audience lists", "Past campaign performance"],
    actions: ["Create draft campaigns", "Schedule approved sends"],
    defaultStatus: "optional",
    advanced: {
      protocol: "OAuth 2.0",
      server: "https://us21.api.mailchimp.com/3.0",
      scopes: ["campaigns:write", "lists:read"],
    },
    permissionSummary: [
      "Oriant can create campaign drafts in your account.",
      "Nothing sends to customers until you approve the copy.",
      "Audience lists are read, never exported.",
    ],
    account: "hello@brightpath.sg",
  },

  [APP.metaBusiness]: {
    id: APP.metaBusiness,
    name: "Meta Business",
    category: "Marketing",
    kind: "app",
    purpose: "Facebook and Instagram publishing — drafts only; public posts always stay human-approved.",
    neededBy: [],
    reads: ["Page inbox and comments", "Post performance"],
    actions: ["Prepare post drafts", "Schedule approved posts"],
    defaultStatus: "optional",
    advanced: {
      protocol: "OAuth 2.0",
      server: "https://graph.facebook.com/v19.0",
      scopes: ["pages_manage_posts", "pages_read_engagement"],
    },
    permissionSummary: [
      "Oriant can prepare posts for your BrightPath pages.",
      "Public content never publishes without your approval.",
      "Ad spend is out of scope — no budget actions at all.",
    ],
    account: "BrightPath Home Services SG page",
  },

  [APP.linkedin]: {
    id: APP.linkedin,
    name: "LinkedIn",
    category: "Marketing",
    kind: "app",
    purpose: "Company page publishing for hiring and B2B maintenance-contract content.",
    neededBy: [],
    reads: ["Company page posts", "Post performance"],
    actions: ["Prepare post drafts", "Schedule approved posts"],
    defaultStatus: "optional",
    advanced: {
      protocol: "OAuth 2.0",
      server: "https://api.linkedin.com/v2",
      scopes: ["w_organization_social", "r_organization_social"],
    },
    permissionSummary: [
      "Oriant can draft posts for the BrightPath company page.",
      "Posts publish only after your approval.",
      "No connection requests or private messages, ever.",
    ],
    account: "BrightPath Home Services — company page",
  },

  [APP.canva]: {
    id: APP.canva,
    name: "Canva",
    category: "Marketing",
    kind: "app",
    purpose: "Design tool link so campaign drafts can reference your existing BrightPath templates.",
    neededBy: [],
    reads: ["Brand kit", "Shared design folders"],
    actions: ["Attach designs to campaign drafts", "Request a design from a template"],
    defaultStatus: "optional",
    advanced: {
      protocol: "OAuth 2.0",
      server: "https://api.canva.com/rest/v1",
      scopes: ["design:content:read", "brandtemplate:content:read"],
    },
    permissionSummary: [
      "Oriant can browse your brand kit and shared folders.",
      "Designs are attached to drafts, never published directly.",
      "Your templates are not edited without a review step.",
    ],
    account: "BrightPath brand workspace",
  },

  [APP.teams]: {
    id: APP.teams,
    name: "Microsoft Teams",
    category: "Internal collaboration",
    kind: "app",
    purpose: "Alternative to Slack for internal summaries if your team moves to Microsoft 365.",
    neededBy: [],
    reads: ["Messages in selected channels"],
    actions: ["Post summaries", "Notify approvers of pending items"],
    defaultStatus: "optional",
    advanced: {
      protocol: "OAuth 2.0",
      server: "https://graph.microsoft.com/v1.0",
      scopes: ["ChannelMessage.Send", "Channel.ReadBasic.All"],
    },
    permissionSummary: [
      "Oriant can post into the Teams channels you select.",
      "Only selected channels are read, nothing private.",
      "Notifications link back to Oriant for decisions.",
    ],
    account: "brightpath.sg tenant",
  },

  [APP.asana]: {
    id: APP.asana,
    name: "Asana",
    category: "Internal collaboration",
    kind: "app",
    purpose: "Task tracking — agents could file follow-up tasks for technicians and coordinators.",
    neededBy: [],
    reads: ["Project task lists", "Task status and assignees"],
    actions: ["Create follow-up tasks", "Update task status after approval"],
    defaultStatus: "optional",
    advanced: {
      protocol: "OAuth 2.0",
      server: "https://app.asana.com/api/1.0",
      scopes: ["tasks:read", "tasks:write"],
    },
    permissionSummary: [
      "Oriant can create tasks in the projects you choose.",
      "Tasks are assigned to people, never closed silently.",
      "You choose which projects are visible.",
    ],
    account: "BrightPath Operations workspace",
  },

  /* ── MCP and internal tools (spec §12) ── */

  [MCP.files]: {
    id: MCP.files,
    name: "Files and Documents",
    category: "MCP and internal tools",
    kind: "mcp",
    purpose: "A secure tool connection that lets agents read approved company documents such as SOPs, price lists and service checklists.",
    neededBy: [AGENT.admin, AGENT.marketing, AGENT.finance, AGENT.recovery],
    reads: ["SOP library", "Standard price list", "Service checklists"],
    actions: ["Search approved documents", "Quote relevant sections in drafts"],
    defaultStatus: "required",
    advanced: {
      protocol: "MCP over HTTPS",
      server: "https://mcp.oriant.ai/brightpath/files",
      scopes: ["documents.read", "documents.search"],
    },
    permissionSummary: [
      "Agents can search the documents you have shared with Oriant.",
      "Only approved folders are visible — nothing else on your Drive.",
      "Documents are quoted, never edited or deleted.",
    ],
    account: "BrightPath document store",
  },

  [MCP.browser]: {
    id: MCP.browser,
    name: "Browser Research",
    category: "MCP and internal tools",
    kind: "mcp",
    purpose: "A secure tool connection that lets the Marketing Agent research public web pages for content ideas and local context.",
    neededBy: [AGENT.marketing],
    reads: ["Public web pages", "Competitor service pages"],
    actions: ["Summarise pages for content research", "Cite sources in campaign drafts"],
    defaultStatus: "optional",
    advanced: {
      protocol: "MCP over HTTPS",
      server: "https://mcp.oriant.ai/brightpath/browser",
      scopes: ["web.fetch", "web.search"],
    },
    permissionSummary: [
      "The agent can read public web pages only.",
      "It never logs in anywhere or fills in forms.",
      "Everything it reads is cited in the draft it produces.",
    ],
    account: "BrightPath research sandbox",
  },

  [MCP.calendar]: {
    id: MCP.calendar,
    name: "Calendar Actions",
    category: "MCP and internal tools",
    kind: "mcp",
    purpose: "A secure tool connection that lets the Admin Operations Agent check availability and hold slots through one controlled channel.",
    neededBy: [AGENT.admin],
    reads: ["Technician availability", "Existing holds and bookings"],
    actions: ["Propose slots", "Create and release tentative holds"],
    defaultStatus: "optional",
    advanced: {
      protocol: "MCP over HTTPS",
      server: "https://mcp.oriant.ai/brightpath/calendar",
      scopes: ["availability.read", "holds.write"],
    },
    permissionSummary: [
      "The agent can check availability and place tentative holds.",
      "Confirmed bookings still follow your approval rules.",
      "Holds expire automatically if not confirmed.",
    ],
    account: "BrightPath scheduling service",
  },

  [MCP.crm]: {
    id: MCP.crm,
    name: "CRM Records",
    category: "MCP and internal tools",
    kind: "mcp",
    purpose: "A secure tool connection that gives agents controlled read access to customer records and service history.",
    neededBy: [AGENT.admin, AGENT.marketing, AGENT.recovery],
    reads: ["Customer profiles", "Service and complaint history", "Maintenance plan value"],
    actions: ["Look up a customer before drafting", "Add interaction notes"],
    defaultStatus: "required",
    advanced: {
      protocol: "MCP over HTTPS",
      server: "https://mcp.oriant.ai/brightpath/crm",
      scopes: ["contacts.read", "history.read", "notes.write"],
    },
    permissionSummary: [
      "Agents look up one customer at a time, with an audit trail.",
      "Records can be read and annotated, never deleted.",
      "High-value customer flags trigger your stricter approval rules.",
    ],
    account: "HubSpot via Oriant connector",
  },

  [MCP.knowledge]: {
    id: MCP.knowledge,
    name: "Internal Knowledge Search",
    category: "MCP and internal tools",
    kind: "mcp",
    purpose: "A secure tool connection that lets agents search everything confirmed during Discovery — your rules, processes and preferences.",
    neededBy: [AGENT.admin, AGENT.recovery],
    reads: ["Confirmed company facts", "Approval rules", "Process descriptions"],
    actions: ["Check a rule before acting", "Cite the source of a decision"],
    defaultStatus: "optional",
    advanced: {
      protocol: "MCP over HTTPS",
      server: "https://mcp.oriant.ai/brightpath/knowledge",
      scopes: ["knowledge.read", "knowledge.search"],
    },
    permissionSummary: [
      "Agents can check your confirmed rules before every decision.",
      "Only facts you confirmed or uploaded are searchable.",
      "Assumptions are marked as assumptions, never treated as fact.",
    ],
    account: "BrightPath knowledge model",
  },
};

/** Tab order for the integrations screen (spec §12). */
export const INTEGRATION_TAB_ORDER: { id: string; label: string }[] = [
  { id: "recommended", label: "Recommended for your plan" },
  { id: "connected", label: "Connected apps" },
  { id: "available", label: "Available apps" },
  { id: "mcp", label: "MCP and internal tools" },
];
