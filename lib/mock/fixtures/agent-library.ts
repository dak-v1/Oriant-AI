/**
 * lib/mock/fixtures/agent-library.ts — the four BrightPath agents for the
 * AI Workforce Planner (spec §11.2–§11.5, §11.8). Three presets plus the
 * custom Service Recovery Coordinator with its rough proposal (§11.3) and
 * design-cycle questions (§11.5). Costs come from PRICING (ids.ts).
 */

import type { AgentDef, DiscoveryQuestion } from "../types";
import { AGENT, AGENT_NAME, WF, WF_NAME, APP, MCP, PRICING, OWNER, PEOPLE } from "./ids";

/** Design-cycle questions for the custom agent (spec §11.5 clarifications). */
const RECOVERY_DESIGN_QUESTIONS: DiscoveryQuestion[] = [
  {
    id: "dq-sr-objective",
    question: "What should this agent achieve when a serious complaint comes in?",
    reason: "The objective sets the line between coordinating a case and deciding it.",
    answer:
      "Gather everything I need in one place — the customer's history, the job, the invoice and the technician's notes — and propose a fair resolution. The final decision on any compensation is always mine.",
    factIds: [],
    sections: ["goals", "processes"],
  },
  {
    id: "dq-sr-trigger",
    question: "When exactly should the agent step in?",
    reason: "A precise trigger keeps routine complaints with Customer Care.",
    answer:
      "When a complaint is marked high severity, or when a high-value customer asks for compensation. Everyday grumbles should stay with Priya's team.",
    factIds: [],
    sections: ["processes", "rules"],
  },
  {
    id: "dq-sr-inputs",
    question: "What information does it need, and from which systems?",
    reason: "Required inputs define the read permissions the agent is granted.",
    answer:
      "Customer history from HubSpot, the job record, invoice and payment status from QuickBooks, and the technician's notes — it should ask Operations for those through Slack.",
    factIds: [],
    sections: ["systems", "processes"],
  },
  {
    id: "dq-sr-actions",
    question: "What may it do on its own, and what must it never do?",
    reason: "Permitted and forbidden actions become hard guardrails in the build.",
    answer:
      "It can collect information, request technician notes and draft a resolution with a proposed compensation amount. It must never issue a refund or promise a customer anything without my approval.",
    factIds: [],
    sections: ["rules"],
  },
  {
    id: "dq-sr-escalation",
    question: "When should it hand a case straight to you?",
    reason: "Escalation rules stop cases from looping when the agent is stuck.",
    answer:
      "If it cannot get the information it needs, or if the customer stays very upset after our first response, it should come straight to me with whatever it has gathered.",
    factIds: [],
    sections: ["rules", "processes"],
  },
  {
    id: "dq-sr-success",
    question: "How will you judge whether this agent is working?",
    reason: "Success criteria become the metrics shown after sandbox runs.",
    answer:
      "Serious complaints reach me as one complete case file within a few hours instead of days, and the customer gets a considered answer within one business day of my decision.",
    factIds: [],
    sections: ["goals"],
  },
];

export const AGENT_LIBRARY: Record<string, AgentDef> = {
  [AGENT.admin]: {
    id: AGENT.admin,
    name: AGENT_NAME[AGENT.admin],
    source: "preset",
    role: "Handles routine customer replies and appointment coordination.",
    description:
      "Watches Gmail and WhatsApp Business for new enquiries, drafts replies from the company knowledge base, and coordinates appointment scheduling against technician calendars. Everything customer-facing is queued for Customer Care review before it goes out.",
    fitScore: 94,
    fitReason:
      "Directly addresses the two biggest confirmed bottlenecks: Customer Care mornings lost to repeated questions, and manual appointment coordination across phone and calendar.",
    coveredOutcomes: [
      "Faster first response to customer enquiries",
      "Fewer scheduling handoffs between Customer Care and Field Operations",
      "Consistent answers to repeated questions across Gmail and WhatsApp",
    ],
    workflows: [
      {
        id: WF.customerResponse,
        name: WF_NAME[WF.customerResponse],
        description:
          "Drafts replies to routine customer enquiries arriving in Gmail and WhatsApp Business, using the customer's HubSpot record and past answers.",
        trigger: { kind: "event", label: "New enquiry in Gmail or WhatsApp Business" },
        steps: [
          "Read the incoming message and detect the enquiry type",
          "Match the sender to their HubSpot customer record",
          "Draft a reply in the customer's channel using approved answer patterns",
          "Queue the draft for Customer Care review",
        ],
        handoff: "The drafted reply plus a link to the customer's record passes to the Customer Care review queue.",
        onFailure: "If the sender cannot be matched in HubSpot, the message is flagged to Priya Nair and left untouched.",
        humanApprovals: ["Replies touching complaints, refunds or cancellations"],
      },
      {
        id: WF.appointmentScheduling,
        name: WF_NAME[WF.appointmentScheduling],
        description:
          "Coordinates new bookings and reschedules: checks technician availability, proposes slots and prepares confirmations.",
        trigger: { kind: "event", label: "Customer requests, confirms or changes an appointment" },
        steps: [
          "Read the request and identify the job type and location",
          "Check technician availability in Google Calendar",
          "Propose two to three suitable slots to the customer",
          "Hold the chosen slot and draft the confirmation message",
          "Update Google Calendar and HubSpot once the confirmation is approved",
        ],
        handoff: "The confirmed slot and customer details flow into Google Calendar and the HubSpot job record.",
        onFailure: "If no technician slot is free within three working days, the request escalates to Marcus Tan.",
        humanApprovals: ["Schedule changes after customer confirmation"],
      },
    ],
    integrations: [
      { integrationId: APP.gmail, purpose: "Read enquiries and prepare draft replies." },
      { integrationId: APP.whatsapp, purpose: "Read messages and prepare draft replies on the busiest channel." },
      { integrationId: APP.googleCalendar, purpose: "Check technician availability and hold appointment slots." },
      { integrationId: APP.hubspot, purpose: "Match customers and keep job records up to date." },
      { integrationId: MCP.crm, purpose: "Look up customer history when drafting replies." },
      { integrationId: MCP.files, purpose: "Pull SOPs, price lists and service checklists when drafting replies." },
      { integrationId: MCP.calendar, purpose: "Hold and reschedule appointment slots through one controlled channel." },
      { integrationId: MCP.knowledge, purpose: "Check confirmed BrightPath rules and preferences before drafting." },
    ],
    autonomyNote:
      "Drafts and schedules; nothing reaches a customer until Customer Care approves it. Confirmed-schedule changes always need explicit approval.",
    humanApprovals: [
      "Schedule changes after customer confirmation",
      "Replies touching complaints, refunds or cancellations",
    ],
    setupCost: PRICING[AGENT.admin].setup,
    monthlyCost: PRICING[AGENT.admin].monthly,
    defaultConfig: {
      operatingMode: "act_after_approval",
      triggers: ["event", "manual"],
      channels: ["Gmail", "WhatsApp Business", "Google Calendar"],
      workflowsEnabled: {
        [WF.customerResponse]: true,
        [WF.appointmentScheduling]: true,
      },
      approvalActions: [
        "Send a reply about a complaint, refund or cancellation",
        "Change a schedule after the customer has confirmed",
      ],
      processOwner: PEOPLE.careLead,
      approvalOwner: PEOPLE.careLead,
      quietHours: "21:00–08:00",
      runFrequency: "Continuous during business hours (Mon–Sat 08:00–18:00)",
      dataAccess: [
        "Customer contact and job records (HubSpot)",
        "Shared inboxes (Gmail, WhatsApp Business)",
        "Technician calendars (Google Calendar)",
      ],
      forbiddenActions: [
        "Issue refunds or credits",
        "Delete customer records",
        "Confirm a schedule change without approval once the customer has confirmed",
      ],
    },
  },

  [AGENT.marketing]: {
    id: AGENT.marketing,
    name: AGENT_NAME[AGENT.marketing],
    source: "preset",
    role: "Plans weekly content and drafts campaigns for owner approval.",
    description:
      "Produces a weekly content plan from recent jobs and seasonal demand, then drafts campaign copy and visual briefs for each approved item. Nothing is published anywhere without Sarah's explicit approval.",
    fitScore: 86,
    fitReason:
      "Marketing is currently planned inconsistently and waits on Sarah; a steady drafting cadence with a hard approval gate removes the bottleneck without removing control.",
    coveredOutcomes: [
      "A consistent weekly content plan instead of ad-hoc posting",
      "Every campaign reviewed before it goes public",
      "Marketing output no longer blocked on Sarah's calendar",
    ],
    workflows: [
      {
        id: WF.contentPlanning,
        name: WF_NAME[WF.contentPlanning],
        description:
          "Builds a weekly content plan from recent completed jobs, seasonal maintenance themes and past campaign performance.",
        trigger: { kind: "schedule", label: "Every Monday 09:00" },
        steps: [
          "Review last week's completed jobs and enquiries for themes",
          "Draft a weekly plan of three posts and one customer email",
          "Attach a short copy outline and suggested visual for each item",
          "Send the plan to Dana Lim in Slack for review",
        ],
        handoff: "Approved plan items pass to Campaign Drafting with their target channel and publish date.",
        onFailure: "If the plan is not reviewed within two working days, the agent re-pings Dana Lim and pauses drafting.",
        humanApprovals: ["Sign-off on the weekly content plan"],
      },
      {
        id: WF.campaignDrafting,
        name: WF_NAME[WF.campaignDrafting],
        description:
          "Drafts full campaign copy and a visual brief for each approved plan item, then routes it through owner approval before anything is scheduled.",
        trigger: { kind: "dependency", label: "Approved content-plan item due for drafting" },
        steps: [
          "Draft the campaign copy and visual brief for the item",
          "Save the draft and assets to the marketing folder in Google Drive",
          "Submit the draft to Sarah Chen for approval",
          "Schedule the approved version for its publish date",
        ],
        handoff: "The approved draft, assets and publish date pass to the scheduling step as one package.",
        onFailure: "If a draft is rejected, the agent files the feedback and produces one revision before asking for direction.",
        humanApprovals: ["All public campaign content before publishing"],
      },
    ],
    integrations: [
      { integrationId: APP.googleDrive, purpose: "Store drafts, briefs and campaign assets." },
      { integrationId: APP.slack, purpose: "Send plans and drafts to the team for review." },
      { integrationId: APP.hubspot, purpose: "Read customer segments and past campaign engagement." },
      { integrationId: MCP.files, purpose: "Read brand guidelines and past campaign documents." },
      { integrationId: MCP.browser, purpose: "Research local trends and seasonal topics for content plans." },
      { integrationId: MCP.crm, purpose: "Read customer segments and service history for campaign targeting." },
    ],
    autonomyNote:
      "Draft-only by default. The agent never publishes, posts or emails customers — it prepares work for humans to approve and ship.",
    humanApprovals: [
      "All public marketing content before publishing",
      "Weekly content plan sign-off",
    ],
    setupCost: PRICING[AGENT.marketing].setup,
    monthlyCost: PRICING[AGENT.marketing].monthly,
    defaultConfig: {
      operatingMode: "draft_only",
      triggers: ["schedule", "dependency", "manual"],
      channels: ["Slack", "Google Drive", "Gmail"],
      workflowsEnabled: {
        [WF.contentPlanning]: true,
        [WF.campaignDrafting]: true,
      },
      approvalActions: [
        "Publish or schedule any public campaign content",
        "Send any marketing email to customers",
      ],
      processOwner: PEOPLE.marketingLead,
      approvalOwner: OWNER.name,
      quietHours: "19:00–08:00 and Sundays",
      runFrequency: "Weekly plan on Mondays; drafting as approved items come due",
      dataAccess: [
        "Marketing folder and brand assets (Google Drive)",
        "Customer segments and campaign history (HubSpot)",
        "Completed job categories for content themes",
      ],
      forbiddenActions: [
        "Publish any content without owner approval",
        "Send marketing messages directly to customers",
        "Purchase advertising or boost posts",
      ],
    },
  },

  [AGENT.finance]: {
    id: AGENT.finance,
    name: AGENT_NAME[AGENT.finance],
    source: "preset",
    role: "Automates the Friday overdue-invoice check and reminder drafting.",
    description:
      "Replaces the manual Friday routine: pulls overdue invoices from QuickBooks, produces an aging summary for the finance team, and drafts personalised payment reminders that go out only after batch approval.",
    fitScore: 91,
    fitReason:
      "The Friday QuickBooks check and reminder drafting was described as a fixed weekly routine — exactly the repeatable, rule-bound work this preset automates.",
    coveredOutcomes: [
      "Faster, consistent follow-up on overdue invoices",
      "A Friday summary the finance team no longer compiles by hand",
      "Reminders drafted and batched for one approval instead of written one by one",
    ],
    workflows: [
      {
        id: WF.invoiceSummary,
        name: WF_NAME[WF.invoiceSummary],
        description:
          "Compiles the weekly overdue-invoice picture from QuickBooks, grouped by age and customer, with disputes and write-off candidates flagged.",
        trigger: { kind: "schedule", label: "Every Friday 09:00" },
        steps: [
          "Pull all overdue invoices from QuickBooks",
          "Group them by aging bucket and customer",
          "Flag disputed invoices and potential write-off candidates",
          "Post the summary to Wei Ling Goh in Slack",
        ],
        handoff: "The overdue list with aging buckets and flags feeds directly into Payment Reminder Drafting.",
        onFailure: "If QuickBooks data cannot be read, the run stops and Wei Ling Goh is notified — no reminders are drafted.",
        humanApprovals: ["Flagging an invoice as a write-off candidate"],
      },
      {
        id: WF.paymentReminders,
        name: WF_NAME[WF.paymentReminders],
        description:
          "Drafts personalised payment reminders for each overdue invoice and queues the batch for finance approval before sending.",
        trigger: { kind: "dependency", label: "New overdue-invoice summary available" },
        steps: [
          "Draft a reminder for each overdue invoice, matched to its aging bucket",
          "Exclude disputed invoices and customers with open complaints",
          "Queue the full batch for Friday approval",
          "Send approved reminders through Gmail",
        ],
        handoff: "The approved batch returns to Gmail for sending, and outcomes are logged against each invoice in QuickBooks.",
        onFailure: "If a customer has an open complaint, their reminder is held and flagged rather than sent.",
        humanApprovals: ["Sending the Friday reminder batch", "Any write-off proposal"],
      },
    ],
    integrations: [
      { integrationId: APP.quickbooks, purpose: "Read invoice, payment and overdue status." },
      { integrationId: APP.gmail, purpose: "Send approved payment reminders." },
      { integrationId: APP.slack, purpose: "Deliver the Friday summary to the finance team." },
      { integrationId: MCP.files, purpose: "Attach invoice PDFs to reminders when needed." },
    ],
    autonomyNote:
      "Reads freely, sends only after batch approval. Write-offs are never actioned — only flagged for a human decision.",
    humanApprovals: [
      "Sending the Friday reminder batch",
      "Invoice write-offs",
    ],
    setupCost: PRICING[AGENT.finance].setup,
    monthlyCost: PRICING[AGENT.finance].monthly,
    defaultConfig: {
      operatingMode: "act_after_approval",
      triggers: ["schedule", "dependency"],
      channels: ["QuickBooks", "Gmail", "Slack"],
      workflowsEnabled: {
        [WF.invoiceSummary]: true,
        [WF.paymentReminders]: true,
      },
      approvalActions: [
        "Send the weekly payment-reminder batch",
        "Propose an invoice write-off",
      ],
      processOwner: PEOPLE.financeLead,
      approvalOwner: PEOPLE.financeLead,
      quietHours: "Weekends and 19:00–08:00",
      runFrequency: "Weekly — Fridays 09:00",
      dataAccess: [
        "Invoices, payments and aging data (QuickBooks)",
        "Customer billing contacts (HubSpot)",
        "Reminder templates (Google Drive)",
      ],
      forbiddenActions: [
        "Write off an invoice",
        "Offer discounts or payment plans",
        "Contact a customer more than once per week about the same invoice",
      ],
    },
  },

  [AGENT.recovery]: {
    id: AGENT.recovery,
    name: AGENT_NAME[AGENT.recovery],
    source: "custom",
    role: "Coordinates high-value complaints across teams into one decision-ready case file.",
    description:
      "A custom-designed coordinator for serious complaints. It gathers the customer's history, job record, invoice status and technician notes from three teams, drafts a resolution with a proposed compensation, and presents Sarah one complete case file. It never commits money or contacts the customer without approval.",
    fitScore: 0,
    fitReason:
      "No preset covers this: the process spans Customer Care, Operations and Finance, and carries strict financial guardrails — so it is designed from your discovery answers instead of matched from the library.",
    coveredOutcomes: [
      "Clearer escalation path for serious complaints",
      "Decision-ready case files within hours instead of days",
      "No compensation ever promised without owner approval",
    ],
    workflows: [
      {
        id: WF.complaintResolution,
        name: WF_NAME[WF.complaintResolution],
        description:
          "Runs the full recovery cycle for a high-value complaint: gather, verify, draft, submit for approval, then send the agreed response.",
        trigger: {
          kind: "event",
          label: "Complaint marked high severity, or a high-value customer requests compensation",
        },
        steps: [
          "Pull the customer's history from HubSpot and the linked job record",
          "Read the invoice and payment status from QuickBooks",
          "Request technician notes from Field Operations via Slack",
          "Draft a resolution with a proposed compensation amount",
          "Submit the complete case file to Sarah Chen for approval",
        ],
        handoff: "The complete case file — history, job record, invoice status, technician notes and draft resolution — lands in Sarah's approval queue.",
        onFailure: "If any required input is still missing after four business hours, the case escalates to Sarah with everything gathered so far.",
        humanApprovals: [
          "Any compensation or refund",
          "The final resolution message to the customer",
        ],
      },
    ],
    integrations: [
      { integrationId: APP.hubspot, purpose: "Read customer history and complaint records." },
      { integrationId: APP.whatsapp, purpose: "Read the complaint thread and queue update drafts for the customer." },
      { integrationId: APP.quickbooks, purpose: "Check invoice and payment status for the affected job." },
      { integrationId: APP.slack, purpose: "Request technician notes from Field Operations." },
      { integrationId: APP.gmail, purpose: "Send the approved resolution to the customer." },
      { integrationId: MCP.crm, purpose: "Assemble the case file from customer and job records." },
      { integrationId: MCP.knowledge, purpose: "Reference service policies when drafting resolutions." },
      { integrationId: MCP.files, purpose: "Retrieve job reports and service records for the case file." },
    ],
    autonomyNote:
      "Coordinates and drafts only. Refunds, credits and promises to customers are structurally impossible without Sarah's approval.",
    humanApprovals: [
      "Any compensation or refund",
      "Final resolution message to the customer",
      "Cases escalated with incomplete information",
    ],
    setupCost: PRICING[AGENT.recovery].setup,
    monthlyCost: PRICING[AGENT.recovery].monthly,
    defaultConfig: {
      operatingMode: "act_after_approval",
      triggers: ["event", "threshold", "approval"],
      channels: ["HubSpot", "Slack", "Gmail"],
      workflowsEnabled: {
        [WF.complaintResolution]: true,
      },
      approvalActions: [
        "Propose any compensation amount",
        "Send the final resolution to the customer",
      ],
      processOwner: PEOPLE.careLead,
      approvalOwner: OWNER.name,
      quietHours: "21:00–08:00 (overnight cases queue for the morning)",
      runFrequency: "Event-driven — as qualifying complaints arrive",
      dataAccess: [
        "Customer history and complaints (HubSpot)",
        "Invoice and payment status (QuickBooks)",
        "Job records and technician notes (via Field Operations)",
      ],
      forbiddenActions: [
        "Issue refunds or credits",
        "Promise compensation to a customer",
        "Delete or edit customer records",
        "Contact the customer before the resolution is approved",
      ],
    },
    customProposal: {
      whyCustom:
        "Preset agents each work inside one team's routine. This process spans Customer Care, Operations and Finance, needs judgement about severity and compensation, and carries hard financial guardrails — it has to be designed around your rules, not matched from a library.",
      objective:
        "Coordinate high-value complaint resolution end-to-end without making any financial commitment.",
      trigger:
        "A complaint is marked high severity, or a high-value customer asks for compensation.",
      requiredInputs: [
        "HubSpot customer history",
        "Job record and technician notes",
        "Invoice and payment status",
        "The complaint message and its severity marking",
      ],
      teamsInvolved: ["Customer Care", "Field Operations", "Finance", "Management"],
      decisions: [
        "Whether a case qualifies as high value",
        "Which resolution options to draft and propose",
        "When to escalate for missing information or unresolved sentiment",
      ],
      allowedActions: [
        "Read customer, job and invoice records",
        "Request technician notes from Field Operations",
        "Draft resolutions and compensation proposals",
        "Submit complete case files to the owner approval queue",
      ],
      prohibitedActions: [
        "Issue refunds or credits",
        "Promise compensation to a customer",
        "Delete or edit customer records",
        "Contact the customer before approval",
      ],
      approvalPoints: [
        "Any compensation amount",
        "The final customer-facing resolution",
        "Cases submitted with incomplete information",
      ],
      missingInformation: [
        "Exact definition of a high-value customer",
        "Compensation bands Sarah is comfortable pre-approving",
        "Response-time target for the first acknowledgment",
      ],
    },
    designQuestions: RECOVERY_DESIGN_QUESTIONS,
  },
};

/** Library display order: presets first, custom last. */
export const LIBRARY_ORDER: string[] = [
  AGENT.admin,
  AGENT.marketing,
  AGENT.finance,
  AGENT.recovery,
];

/** Expected outcomes shown with the plan pricing (spec §11.8 — no guaranteed savings). */
export const PLAN_OUTCOMES: string[] = [
  "Faster first response to customer enquiries",
  "Fewer scheduling handoffs between Customer Care and Field Operations",
  "Consistent review of every campaign before it goes public",
  "Faster follow-up on overdue invoices",
  "Clearer escalation path for serious complaints",
];
