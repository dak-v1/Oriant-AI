/**
 * lib/plan/fixtures/brightpath.ts — the canonical valid `ApprovedPlan`.
 *
 * This is Role C's entire input until D's real planner lands, so it exists for
 * two reasons at once:
 *
 *   1. It is the reference answer for `validateApprovedPlan()`. The M0 exit
 *      criterion is that this plan returns `[]`, warnings included.
 *   2. It is chosen for RUNTIME PATH COVERAGE, not for looks. Between the four
 *      agents every branch of the policy resolver (contract §3.10) is reachable
 *      from a real workflow:
 *
 *      admin-operations  auto_within_limits  acts directly inside its limits,
 *                                            and hits `alwaysApprove` when it
 *                                            moves a confirmed booking
 *      marketing         draft_only          never acts; every write pauses
 *      finance-followup  auto_within_limits  acts, escalates on limit breach,
 *                                            and always pauses on a write-off
 *      service-recovery  act_after_approval  explicit `approve` checkpoint,
 *                                            then resume and act
 *
 *      ROLE_C_PLAN's M0 fixture table has a fifth row — the "broken set", whose
 *      three paths are throws mid-run, needs a disconnected tool, and hangs.
 *      There is deliberately no fifth agent here for it. All three are
 *      properties of the TOOL DOUBLE rather than of an `AgentSpec`, so they
 *      live as sandbox scenarios (SC-11, SC-22, SC-24) instead. An agent that
 *      is meant to misbehave could not both sit in this array and pass its
 *      scenarios, so it would hold the M3 Activation gate shut permanently, and
 *      it would break M0-4 ("every agent serves a business outcome"), M2's
 *      "4 generated packages" exit and M3's "all 4 agents pass".
 *
 * Ids match lib/mock/fixtures/ids.ts (AGENT.*, APP.*) so the demo surfaces and
 * the runtime speak the same language. They are written out literally rather
 * than imported: the contract is the boundary between the lanes, and nothing
 * under lib/plan may depend on lib/mock.
 *
 * Every operation string below comes from lib/plan/operations.ts. Nothing here
 * is free-typed, and no agent is granted `hubspot.refunds.issue`, which the
 * global policy denies org-wide (rule 3: granted and forbidden cannot overlap).
 *
 * Company: BrightPath Home Services, Singapore. 18 staff, roughly 650 requests
 * and 420 completed jobs a month. Residential maintenance on recurring plans.
 * Owner Sarah Chen. Demo date 2026-07-24, timezone Asia/Singapore.
 */

import type {
  AgentSpec,
  ApprovedPlan,
  BusinessOutcome,
  QuietHours,
} from "../types";

/** Every approval in this plan lands with the owner. */
const OWNER = "user_sarah_chen";

/** Shared business context, so the four prompts describe one company. */
const COMPANY_CONTEXT =
  "BrightPath Home Services, Singapore. 18 staff handling roughly 650 " +
  "requests and 420 completed jobs a month across aircon servicing, " +
  "plumbing, electrical work and general upkeep. Most customers are on " +
  "recurring maintenance plans, so the relationship matters more than any " +
  "single job.";

/** Nobody is contacted outside working hours unless a workflow opts out. */
const WORKING_HOURS: QuietHours = {
  start: "18:00",
  end: "09:00",
  timezone: "Asia/Singapore",
};

/* ═════════════════════════ Admin Operations ═════════════════════════ */

const adminOperations: AgentSpec = {
  id: "admin-operations",
  version: 4,
  name: "Admin Operations Agent",
  role: "Triages inbound enquiries and books technician appointments",

  guidance: {
    objective:
      "Get every enquiry a first response the same morning and turn the " +
      "straightforward ones into a booked slot without Sarah touching the " +
      "calendar. Protect technician travel time: cluster jobs by district " +
      "rather than by the order enquiries arrived in.",
    businessContext: COMPANY_CONTEXT,
    tone:
      "Brisk and practical. Confirm the specifics (address, access, unit " +
      "count) rather than promising an outcome the technician has not seen.",
    examples: [
      "A plan customer asks for their quarterly aircon service, two units, " +
        "flexible on day, and the technician has an open Tuesday morning in " +
        "the same district. Book it and confirm.",
      "A customer asks to move a confirmed Thursday visit to Friday. The " +
        "booking already exists, so propose the move and let Sarah confirm.",
    ],
  },

  capabilities: [
    {
      id: "read_enquiries",
      name: "Read enquiries",
      description:
        "Read inbound enquiry threads and individual messages in the shared inbox.",
      backedBy: ["gmail.threads.read", "gmail.messages.read"],
    },
    {
      id: "check_availability",
      name: "Check technician availability",
      description:
        "Read technician calendars, working hours and blocked days before offering a slot.",
      backedBy: [
        "google-calendar.events.list",
        "google-calendar.availability.read",
      ],
    },
    {
      id: "book_appointment",
      name: "Book an appointment",
      description: "Create a tentative booking in the technician calendar.",
      backedBy: ["google-calendar.events.create"],
    },
    {
      id: "reschedule_appointment",
      name: "Reschedule a confirmed appointment",
      description:
        "Move an already confirmed visit. Always routed to the owner first.",
      backedBy: ["google-calendar.events.update"],
    },
    {
      id: "draft_enquiry_reply",
      name: "Draft an enquiry reply",
      description: "Compose a reply to an inbound enquiry, unsent.",
      backedBy: ["gmail.drafts.create"],
    },
    {
      id: "log_customer_note",
      name: "Log a customer note",
      description: "Record what was agreed on the customer record.",
      backedBy: ["hubspot.notes.create"],
    },
    {
      id: "message_on_whatsapp",
      name: "Handle WhatsApp enquiries",
      description:
        "Read and answer enquiries that arrive over WhatsApp rather than email.",
      backedBy: [
        "whatsapp-business.messages.read",
        "whatsapp-business.messages.send",
      ],
    },
  ],

  tools: [
    {
      integrationId: "gmail",
      operations: [
        "gmail.threads.read",
        "gmail.messages.read",
        "gmail.drafts.create",
      ],
      purpose: "Read inbound enquiries and prepare replies for the shared inbox",
      required: true,
    },
    {
      integrationId: "google-calendar",
      operations: [
        "google-calendar.events.list",
        "google-calendar.availability.read",
        "google-calendar.events.create",
        "google-calendar.events.update",
      ],
      purpose: "See technician availability and place bookings",
      required: true,
    },
    {
      integrationId: "hubspot",
      operations: ["hubspot.contacts.read", "hubspot.notes.create"],
      purpose: "Look up the customer's plan and record what was agreed",
      required: true,
    },
    {
      integrationId: "whatsapp-business",
      // Optional: roughly a fifth of enquiries arrive here, but the agent
      // still works if the number is not connected.
      operations: [
        "whatsapp-business.messages.read",
        "whatsapp-business.messages.send",
      ],
      purpose: "Answer enquiries that arrive over WhatsApp",
      required: false,
    },
  ],

  policy: {
    operatingMode: "auto_within_limits",
    limits: [
      {
        id: "bookings-per-run",
        metric: "bookings.per_run",
        op: "<=",
        value: 12,
        unit: "count",
        onBreach: "require_approval",
      },
      {
        id: "booking-notice",
        metric: "booking.notice_hours",
        op: ">=",
        value: 24,
        unit: "hours",
        onBreach: "require_approval",
      },
    ],
    // Creating a slot is routine; moving one a customer already confirmed
    // is not, whatever the limits say.
    alwaysApprove: ["google-calendar.events.update"],
    forbidden: ["hubspot.invoices.write_off", "hubspot.refunds.issue"],
    approvalOwner: OWNER,
    escalateAfterMins: 120,
    quietHours: WORKING_HOURS,
    maxRunsPerDay: 6,
  },

  workflows: [
    {
      id: "appointment-scheduling",
      name: "Appointment Scheduling",
      description:
        "Every weekday morning, turn overnight enquiries into booked slots and clear any clash they create.",
      enabled: true,
      trigger: {
        kind: "schedule",
        label: "Every weekday at 8:00am",
        cron: "0 8 * * 1-5",
        timezone: "Asia/Singapore",
      },
      steps: [
        {
          id: "sched-1",
          kind: "fetch",
          instruction:
            "Read enquiry threads received since the last run and pull out the ones asking for a visit.",
          tool: { integrationId: "gmail", operation: "gmail.threads.read" },
        },
        {
          id: "sched-2",
          kind: "fetch",
          instruction:
            "Read technician working hours and blocked days for the next ten working days.",
          tool: {
            integrationId: "google-calendar",
            operation: "google-calendar.availability.read",
          },
        },
        {
          id: "sched-3",
          kind: "reason",
          instruction:
            "Match each enquiry to a technician and a slot. Cluster jobs in the same district on the same run, respect the stated job duration, and leave anything needing a site assessment unscheduled with a reason.",
        },
        {
          id: "sched-4",
          kind: "act",
          instruction:
            "Create the tentative booking for each matched enquiry, including address, unit count and access notes.",
          tool: {
            integrationId: "google-calendar",
            operation: "google-calendar.events.create",
          },
          risk: "medium",
        },
        {
          id: "sched-5",
          kind: "act",
          instruction:
            "Where a new booking clashes with a visit the customer already confirmed, propose moving the confirmed visit to the nearest free slot.",
          tool: {
            integrationId: "google-calendar",
            operation: "google-calendar.events.update",
          },
          risk: "high",
        },
      ],
      output: {
        kind: "booking",
        successCriteria:
          "Every schedulable enquiry has exactly one tentative booking with a technician, an address and a duration, no technician is double-booked, and every confirmed visit that had to move is waiting on Sarah rather than already moved.",
      },
      onFailure: { retries: 2, backoffSeconds: 120, onExhausted: "notify_owner" },
    },
    {
      id: "customer-response-drafting",
      name: "Customer Response Drafting",
      description:
        "When an enquiry lands in the shared inbox, prepare a reply with the customer's history already in it.",
      enabled: true,
      trigger: {
        kind: "event",
        label: "When an enquiry arrives in the shared inbox",
        integrationId: "gmail",
        event: "message.received",
        filter: { label: "enquiries", isReply: false },
      },
      steps: [
        {
          id: "reply-1",
          kind: "fetch",
          instruction: "Read the incoming message and any earlier messages in the thread.",
          tool: { integrationId: "gmail", operation: "gmail.messages.read" },
        },
        {
          id: "reply-2",
          kind: "fetch",
          instruction:
            "Look up the sender: maintenance plan, last visit, open jobs and any standing access instructions.",
          tool: { integrationId: "hubspot", operation: "hubspot.contacts.read" },
        },
        {
          id: "reply-3",
          kind: "reason",
          instruction:
            "Draft a reply that answers the actual question and asks for the one or two details a technician would need. Quote a price only where the plan already fixes it.",
        },
        {
          id: "reply-4",
          kind: "act",
          instruction: "Save the reply as a draft on the original thread.",
          tool: { integrationId: "gmail", operation: "gmail.drafts.create" },
          risk: "low",
        },
        {
          id: "reply-5",
          kind: "act",
          instruction:
            "Add a short note to the customer record saying what was asked and what was drafted.",
          tool: { integrationId: "hubspot", operation: "hubspot.notes.create" },
          risk: "low",
        },
      ],
      output: {
        kind: "draft",
        successCriteria:
          "Each enquiry has one draft reply on its own thread, the draft names the customer's plan correctly, and the customer record carries a matching note.",
      },
      onFailure: { retries: 3, backoffSeconds: 60, onExhausted: "escalate" },
    },
  ],
};

/* ═════════════════════════════ Marketing ═════════════════════════════ */

const marketing: AgentSpec = {
  id: "marketing",
  version: 2,
  name: "Marketing Agent",
  role: "Plans and drafts customer campaigns, never publishes them",

  guidance: {
    objective:
      "Keep a month of campaign work ready for Sarah to review in one sitting. " +
      "Lean on the seasonal pattern of the business: pre-monsoon drainage " +
      "checks, the hot-season aircon rush, and renewal reminders timed to the " +
      "plan anniversary rather than the calendar month.",
    businessContext: COMPANY_CONTEXT,
    tone:
      "Plain, local and specific. No superlatives, no invented guarantees, " +
      "and never a discount that has not been signed off.",
    examples: [
      "August sits between the aircon peak and the year-end rush, so lead " +
        "with plan renewals and a drainage check add-on rather than a discount.",
    ],
  },

  capabilities: [
    {
      id: "review_campaign_history",
      name: "Review campaign history",
      description: "Read past campaigns and how they performed before proposing new ones.",
      backedBy: ["mailchimp.campaigns.read"],
    },
    {
      id: "draft_campaign",
      name: "Draft a campaign",
      description: "Prepare campaign copy and audience as an unpublished draft.",
      backedBy: ["mailchimp.campaigns.create_draft"],
    },
    {
      id: "read_customer_segments",
      name: "Read customer segments",
      description: "Read plan values and contact records to choose an audience.",
      backedBy: ["hubspot.contacts.read", "hubspot.deals.read"],
    },
    {
      id: "read_brand_assets",
      name: "Read brand material",
      description: "Read approved copy, price lists and photos from the shared drive.",
      backedBy: ["google-drive.files.read"],
    },
    {
      id: "notify_team",
      name: "Share plans internally",
      description: "Post a proposed content plan to the internal channel.",
      backedBy: ["slack.messages.post"],
    },
  ],

  tools: [
    {
      integrationId: "mailchimp",
      // Deliberately no `mailchimp.campaigns.publish`. It is forbidden below,
      // and rule 3 refuses a plan that both grants and forbids an operation.
      operations: ["mailchimp.campaigns.read", "mailchimp.campaigns.create_draft"],
      purpose: "Read past campaigns and prepare new ones as drafts",
      required: true,
    },
    {
      integrationId: "hubspot",
      operations: ["hubspot.contacts.read", "hubspot.deals.read"],
      purpose: "Choose an audience from plan value and customer history",
      required: true,
    },
    {
      integrationId: "google-drive",
      operations: ["google-drive.files.read"],
      purpose: "Reuse approved copy, price lists and job photos",
      required: false,
    },
    {
      integrationId: "slack",
      operations: ["slack.messages.read", "slack.messages.post"],
      purpose: "Share the proposed plan with Sarah and the team",
      required: false,
    },
  ],

  policy: {
    operatingMode: "draft_only",
    // Meaningless in this mode (contract §3.10): every write pauses anyway.
    limits: [],
    alwaysApprove: [],
    forbidden: ["mailchimp.campaigns.publish", "hubspot.refunds.issue"],
    approvalOwner: OWNER,
    escalateAfterMins: 480,
    quietHours: WORKING_HOURS,
    maxRunsPerDay: 2,
  },

  workflows: [
    {
      id: "content-planning",
      name: "Content Planning",
      description:
        "On request, propose next month's campaign themes against what actually worked before.",
      enabled: true,
      trigger: {
        kind: "manual",
        label: "Run when Sarah asks for next month's plan",
      },
      steps: [
        {
          id: "plan-1",
          kind: "fetch",
          instruction:
            "Read the last six months of campaigns, their audiences and their open and click rates.",
          tool: { integrationId: "mailchimp", operation: "mailchimp.campaigns.read" },
        },
        {
          id: "plan-2",
          kind: "fetch",
          instruction:
            "Read plan values and renewal dates to see which segments are worth addressing next month.",
          tool: { integrationId: "hubspot", operation: "hubspot.deals.read" },
        },
        {
          id: "plan-3",
          kind: "reason",
          instruction:
            "Propose three to four themes for next month with an audience and a reason for each, ranked by expected value. Say plainly which past campaign each one is modelled on.",
        },
        {
          id: "plan-4",
          kind: "act",
          instruction: "Post the proposed plan to the internal channel for Sarah to react to.",
          tool: { integrationId: "slack", operation: "slack.messages.post" },
          risk: "low",
        },
      ],
      output: {
        kind: "report",
        successCriteria:
          "The team channel has one plan covering next month, each theme names its audience and its evidence, and nothing was sent to a customer.",
      },
      onFailure: { retries: 1, backoffSeconds: 300, onExhausted: "notify_owner" },
    },
    {
      id: "campaign-drafting-approval",
      name: "Campaign Drafting and Approval",
      description:
        "Late each month, turn the agreed themes into campaign drafts waiting for Sarah's approval.",
      enabled: true,
      trigger: {
        kind: "schedule",
        label: "On the 25th of each month at 10:00am",
        cron: "0 10 25 * *",
        timezone: "Asia/Singapore",
      },
      steps: [
        {
          id: "camp-1",
          kind: "fetch",
          instruction: "Read the campaign that ran last month and how it performed.",
          tool: { integrationId: "mailchimp", operation: "mailchimp.campaigns.read" },
        },
        {
          id: "camp-2",
          kind: "fetch",
          instruction:
            "Read the contact records for the intended audience, excluding anyone with an open complaint.",
          tool: { integrationId: "hubspot", operation: "hubspot.contacts.read" },
        },
        {
          id: "camp-3",
          kind: "fetch",
          instruction: "Read the approved price list and the current photo set from the shared drive.",
          tool: { integrationId: "google-drive", operation: "google-drive.files.read" },
        },
        {
          id: "camp-4",
          kind: "reason",
          instruction:
            "Write the campaign: subject line, body, audience and send window. Every price must come from the approved list, and no claim may go beyond what the service actually includes.",
        },
        {
          id: "camp-5",
          kind: "act",
          instruction: "Save the campaign as a draft with its audience attached. Do not publish it.",
          tool: {
            integrationId: "mailchimp",
            operation: "mailchimp.campaigns.create_draft",
          },
          risk: "low",
        },
      ],
      output: {
        kind: "draft",
        successCriteria:
          "One unpublished campaign draft exists with a subject line, body and audience, every price matches the approved list, and the approval is sitting with Sarah.",
      },
      onFailure: { retries: 2, backoffSeconds: 120, onExhausted: "notify_owner" },
    },
  ],
};

/* ═══════════════════════════ Finance Follow-up ═══════════════════════════ */

const financeFollowUp: AgentSpec = {
  id: "finance-followup",
  version: 3,
  name: "Finance Follow-up Agent",
  role: "Chases overdue invoices and prepares payment reminders",

  guidance: {
    objective:
      "Reduce time to payment on overdue invoices without damaging customer " +
      "relationships. Prefer a polite reminder over an aggressive one, and " +
      "never chase the same person twice in a week.",
    businessContext: COMPANY_CONTEXT,
    tone:
      "Warm, direct, never threatening. Always offer a way to query the bill " +
      "and always name the job the invoice is for.",
    examples: [
      "A five-day-late $95 invoice from a six-year plan customer gets a gentle " +
        "nudge, no escalation.",
      "A $1,200 invoice is past the limit, so the reminder waits for Sarah " +
        "rather than going out automatically.",
    ],
  },

  capabilities: [
    {
      id: "read_invoices",
      name: "Read invoices",
      description: "Look up overdue invoices, amounts and due dates in both systems.",
      backedBy: ["hubspot.invoices.list", "quickbooks.invoices.list"],
    },
    {
      id: "read_payment_history",
      name: "Read payment history",
      description: "Check what has actually been paid before chasing anything.",
      backedBy: ["quickbooks.payments.read"],
    },
    {
      id: "draft_payment_reminder",
      name: "Draft a payment reminder",
      description: "Compose a reminder email for an overdue invoice.",
      backedBy: ["gmail.drafts.create"],
    },
    {
      id: "send_payment_reminder",
      name: "Send a payment reminder",
      description: "Send a reminder to the customer within the agreed limits.",
      backedBy: ["gmail.messages.send"],
    },
    {
      id: "propose_write_off",
      name: "Propose a write-off",
      description:
        "Propose writing off a small, long-uncollectable balance. Always routed to the owner.",
      backedBy: ["hubspot.invoices.write_off"],
    },
    {
      id: "post_finance_digest",
      name: "Post a finance digest",
      description: "Summarise the week's collections position in the internal channel.",
      backedBy: ["slack.messages.post"],
    },
  ],

  tools: [
    {
      integrationId: "hubspot",
      operations: [
        "hubspot.invoices.list",
        "hubspot.contacts.read",
        "hubspot.invoices.write_off",
      ],
      purpose: "Find overdue invoices, read the customer's history, clear dead balances",
      required: true,
    },
    {
      integrationId: "gmail",
      operations: ["gmail.drafts.create", "gmail.messages.send"],
      purpose: "Prepare and send payment reminders",
      required: true,
    },
    {
      integrationId: "quickbooks",
      operations: ["quickbooks.invoices.list", "quickbooks.payments.read"],
      purpose: "Confirm what has been paid before anyone is chased",
      required: true,
    },
    {
      integrationId: "slack",
      operations: ["slack.messages.post"],
      purpose: "Give Sarah a weekly collections position",
      required: false,
    },
  ],

  policy: {
    operatingMode: "auto_within_limits",
    limits: [
      {
        id: "invoice-amount",
        metric: "invoice.amount",
        op: "<=",
        value: 500,
        unit: "SGD",
        onBreach: "require_approval",
      },
      {
        id: "email-batch",
        metric: "emails.per_run",
        op: "<=",
        value: 20,
        unit: "count",
        onBreach: "require_approval",
      },
    ],
    alwaysApprove: ["hubspot.invoices.write_off"],
    forbidden: ["hubspot.refunds.issue"],
    approvalOwner: OWNER,
    escalateAfterMins: 240,
    quietHours: WORKING_HOURS,
    maxRunsPerDay: 3,
  },

  workflows: [
    {
      id: "payment-reminder-drafting",
      name: "Payment Reminder Drafting",
      description:
        "Every Friday morning, chase invoices past their due date, softening the tone for long-standing customers.",
      enabled: true,
      trigger: {
        kind: "schedule",
        label: "Every Friday at 9:00am",
        cron: "0 9 * * 5",
        timezone: "Asia/Singapore",
      },
      steps: [
        {
          id: "sweep-1",
          kind: "fetch",
          instruction: "List every invoice more than three days past its due date.",
          tool: { integrationId: "hubspot", operation: "hubspot.invoices.list" },
        },
        {
          id: "sweep-2",
          kind: "fetch",
          instruction:
            "Read recent payments so anything already settled or part-paid drops out of the list.",
          tool: { integrationId: "quickbooks", operation: "quickbooks.payments.read" },
        },
        {
          id: "sweep-3",
          kind: "fetch",
          instruction:
            "Load each remaining customer's plan value, tenure and previous reminder history.",
          tool: { integrationId: "hubspot", operation: "hubspot.contacts.read" },
        },
        {
          id: "sweep-4",
          kind: "reason",
          instruction:
            "Decide who to chase this week and write a reminder for each. Soften the tone for long-standing customers, name the job the invoice covers, and skip anyone already chased in the last seven days.",
        },
        {
          id: "sweep-5",
          kind: "act",
          instruction: "Send the reminder to the customer.",
          tool: { integrationId: "gmail", operation: "gmail.messages.send" },
          risk: "medium",
        },
      ],
      output: {
        kind: "message",
        successCriteria:
          "Every selected overdue invoice has exactly one reminder sent or queued for approval, no customer received more than one email, and nothing already paid was chased.",
      },
      onFailure: { retries: 2, backoffSeconds: 60, onExhausted: "notify_owner" },
    },
    {
      id: "overdue-invoice-summary",
      name: "Overdue Invoice Summary",
      description:
        "Straight after the sweep, close off the dead balances and give Sarah the week's collections position.",
      enabled: true,
      // Depends on the sweep in this same agent: the summary is meaningless
      // until the reminders have gone out.
      trigger: {
        kind: "dependency",
        label: "After the Friday reminder sweep",
        afterWorkflowId: "payment-reminder-drafting",
      },
      steps: [
        {
          id: "digest-1",
          kind: "fetch",
          instruction: "List every invoice still open, with its age in days.",
          tool: { integrationId: "quickbooks", operation: "quickbooks.invoices.list" },
        },
        {
          id: "digest-2",
          kind: "fetch",
          instruction:
            "Cross-check against the invoice records to see which ones were chased this morning.",
          tool: { integrationId: "hubspot", operation: "hubspot.invoices.list" },
        },
        {
          id: "digest-3",
          kind: "reason",
          instruction:
            "Split the open invoices into chased, awaiting approval and uncollectable. Treat a balance as uncollectable only if it is under $30 and more than 120 days old with at least three reminders behind it.",
        },
        {
          id: "digest-4",
          kind: "act",
          instruction:
            "Write off the balances judged uncollectable, one at a time, with the reason attached.",
          tool: { integrationId: "hubspot", operation: "hubspot.invoices.write_off" },
          risk: "high",
        },
        {
          id: "digest-5",
          kind: "act",
          instruction:
            "Post the collections position to the internal channel: total outstanding, chased today, waiting on Sarah.",
          tool: { integrationId: "slack", operation: "slack.messages.post" },
          risk: "low",
        },
      ],
      output: {
        kind: "report",
        successCriteria:
          "The team channel has one summary with a total outstanding figure that reconciles to the open invoice list, and no balance was written off without Sarah approving it.",
      },
      onFailure: { retries: 1, backoffSeconds: 120, onExhausted: "fail_silent" },
    },
  ],
};

/* ═══════════════════════ Service Recovery Coordinator ═══════════════════════ */

const serviceRecovery: AgentSpec = {
  id: "service-recovery",
  version: 2,
  name: "Service Recovery Coordinator",
  role: "Handles high-value complaints and prepares a recovery offer for approval",

  guidance: {
    objective:
      "Get a real answer in front of an unhappy plan customer within hours, " +
      "not days. Establish what actually happened from the job record before " +
      "responding, and put a concrete remedy on the table rather than an " +
      "apology on its own.",
    businessContext: COMPANY_CONTEXT,
    tone:
      "Accountable and unhurried. Name the failure plainly, avoid blaming the " +
      "technician by name, and never promise a refund: money decisions are " +
      "Sarah's alone.",
    examples: [
      "A plan customer on their third failed aircon visit wants compensation. " +
        "Prepare the timeline, propose a free service plus a senior technician " +
        "revisit, and hold it for Sarah.",
    ],
  },

  capabilities: [
    {
      id: "read_complaint_thread",
      name: "Read the complaint",
      description:
        "Read the full complaint thread across email and WhatsApp before responding.",
      backedBy: [
        "gmail.threads.read",
        "gmail.messages.read",
        "whatsapp-business.messages.read",
      ],
    },
    {
      id: "read_customer_value",
      name: "Read customer value",
      description: "Read plan value, tenure and job history to size the response.",
      backedBy: ["hubspot.contacts.read", "hubspot.deals.read"],
    },
    {
      id: "read_service_history",
      name: "Read job sheets",
      description: "Read the technician's job sheets and photos for the visits in question.",
      backedBy: ["google-drive.files.read"],
    },
    {
      id: "draft_recovery_offer",
      name: "Draft a recovery offer",
      description: "Prepare the response and the proposed remedy, unsent.",
      backedBy: ["gmail.drafts.create"],
    },
    {
      id: "send_recovery_response",
      name: "Send an approved response",
      description: "Send the response once the owner has approved it.",
      backedBy: ["gmail.messages.send"],
    },
    {
      id: "reply_on_whatsapp",
      name: "Reply on WhatsApp",
      description: "Answer on the channel the complaint arrived on, once approved.",
      backedBy: ["whatsapp-business.messages.send"],
    },
    {
      id: "log_resolution",
      name: "Log the resolution",
      description: "Record what was agreed and what it cost on the customer record.",
      backedBy: ["hubspot.notes.create"],
    },
    {
      id: "alert_team",
      name: "Alert the team",
      description: "Flag an open complaint to the operations channel.",
      backedBy: ["slack.messages.post"],
    },
  ],

  tools: [
    {
      integrationId: "gmail",
      operations: [
        "gmail.threads.read",
        "gmail.messages.read",
        "gmail.drafts.create",
        "gmail.messages.send",
      ],
      purpose: "Read the complaint and respond once approved",
      required: true,
    },
    {
      integrationId: "hubspot",
      // No refunds grant: refunds are forbidden org-wide and for this agent,
      // so the operation must never appear here (rule 3).
      operations: [
        "hubspot.contacts.read",
        "hubspot.deals.read",
        "hubspot.notes.create",
      ],
      purpose: "Size the customer relationship and record the resolution",
      required: true,
    },
    {
      integrationId: "slack",
      operations: ["slack.messages.read", "slack.messages.post"],
      purpose: "Pick up complaints raised internally and keep operations informed",
      required: true,
    },
    {
      integrationId: "whatsapp-business",
      operations: [
        "whatsapp-business.messages.read",
        "whatsapp-business.messages.send",
      ],
      purpose: "Answer on whichever channel the complaint arrived on",
      required: false,
    },
    {
      integrationId: "google-drive",
      operations: ["google-drive.files.read"],
      purpose: "Read job sheets and photos for the visits being complained about",
      required: false,
    },
  ],

  policy: {
    operatingMode: "act_after_approval",
    // Meaningless in this mode: every act pauses for Sarah regardless.
    limits: [],
    alwaysApprove: [],
    forbidden: ["hubspot.refunds.issue"],
    approvalOwner: OWNER,
    escalateAfterMins: 60,
    // A complaint that lands at 7pm must not sit until the morning waiting for
    // a quiet-hours window to open. `null` would NOT achieve that: the runtime
    // resolves an unset window as `policy.quietHours ?? globalPolicy.quietHours`
    // (resolveRunStart in lib/runtime/policy.ts), so this agent would silently
    // inherit the org-wide 18:00-09:00 block and never run out of hours. A
    // degenerate window is the supported way to say "never quiet": start ===
    // end is documented there as meaning the agent is always free to run.
    quietHours: { start: "00:00", end: "00:00", timezone: "Asia/Singapore" },
    maxRunsPerDay: null,
  },

  workflows: [
    {
      id: "high-value-complaint-resolution",
      name: "High-Value Complaint Resolution",
      description:
        "When a complaint is flagged, build the timeline, propose a remedy, and hold it for Sarah.",
      enabled: true,
      trigger: {
        kind: "event",
        label: "When a thread is labelled as a complaint",
        integrationId: "gmail",
        event: "thread.labelled",
        filter: { label: "complaint" },
      },
      steps: [
        {
          id: "recov-1",
          kind: "fetch",
          instruction:
            "Read the whole complaint thread, including anything the team already replied.",
          tool: { integrationId: "gmail", operation: "gmail.threads.read" },
        },
        {
          id: "recov-2",
          kind: "fetch",
          instruction:
            "Read the customer's plan value, tenure and the jobs behind the complaint.",
          tool: { integrationId: "hubspot", operation: "hubspot.deals.read" },
        },
        {
          id: "recov-3",
          kind: "reason",
          instruction:
            "Write the timeline of what happened, state plainly where BrightPath fell short, and propose a remedy sized to the relationship. Never propose a refund; propose service, a revisit or a plan extension instead.",
        },
        {
          id: "recov-4",
          kind: "approve",
          instruction:
            "Put the timeline and the proposed remedy in front of Sarah before anything reaches the customer.",
        },
        {
          id: "recov-5",
          kind: "act",
          instruction: "Send the approved response to the customer on the original thread.",
          tool: { integrationId: "gmail", operation: "gmail.messages.send" },
          risk: "high",
        },
      ],
      output: {
        kind: "message",
        successCriteria:
          "The customer has one response on the original thread, it matches what Sarah approved word for word, and it contains no refund offer.",
      },
      onFailure: { retries: 1, backoffSeconds: 180, onExhausted: "escalate" },
    },
    {
      id: "recovery-case-review",
      name: "Recovery Case Review",
      description:
        "On request, work through the complaints the team raised internally and close off the ones already resolved.",
      enabled: true,
      trigger: {
        kind: "manual",
        label: "Run when Sarah reviews open complaints",
      },
      steps: [
        {
          id: "review-1",
          kind: "fetch",
          instruction:
            "Read the operations channel for complaints the team raised but never logged.",
          tool: { integrationId: "slack", operation: "slack.messages.read" },
        },
        {
          id: "review-2",
          kind: "fetch",
          instruction:
            "Read the customer records for each case to see what has already been recorded.",
          tool: { integrationId: "hubspot", operation: "hubspot.contacts.read" },
        },
        {
          id: "review-3",
          kind: "reason",
          instruction:
            "For each case, state whether it is resolved, still open or needs a revisit, and draft the note that should sit on the customer record.",
        },
        {
          id: "review-4",
          kind: "approve",
          instruction: "Have Sarah confirm the resolution status of each case before it is recorded.",
        },
        {
          id: "review-5",
          kind: "act",
          instruction:
            "Write the confirmed note onto each customer record, including the remedy given and its cost.",
          tool: { integrationId: "hubspot", operation: "hubspot.notes.create" },
          risk: "low",
        },
      ],
      output: {
        kind: "record_update",
        successCriteria:
          "Every complaint raised in the channel has a matching note on the customer record with a resolution status Sarah confirmed.",
      },
      onFailure: { retries: 1, backoffSeconds: 60, onExhausted: "notify_owner" },
    },
  ],
};

/* ═════════════════════════ Business outcomes ═════════════════════════ */

/**
 * Outcomes are planned first and own the relationship to agents (contract
 * §3.2). Between the three, all four agents are accounted for, which is what
 * keeps rule 15 quiet.
 */
const businessOutcomes: BusinessOutcome[] = [
  {
    id: "outcome-faster-collections",
    name: "Faster follow-up on overdue invoices",
    priority: "high",
    owner: OWNER,
    metrics: [
      {
        id: "dso",
        label: "Average days to payment",
        metric: "invoice.days_to_payment",
        direction: "decrease",
        baseline: 34,
        target: 21,
        unit: "days",
      },
      {
        id: "chase-rate",
        label: "Overdue invoices chased within 7 days",
        metric: "invoice.chased_within_7d_pct",
        direction: "increase",
        baseline: 40,
        target: 95,
        unit: "percent",
      },
    ],
    agentIds: ["finance-followup"],
  },
  {
    id: "outcome-admin-load",
    name: "Less time lost to admin and scheduling",
    priority: "high",
    owner: OWNER,
    metrics: [
      {
        id: "admin-hours",
        label: "Owner hours on admin per week",
        metric: "admin.hours_per_week",
        direction: "decrease",
        baseline: 22,
        target: 8,
        unit: "hours",
      },
      {
        id: "first-response",
        label: "Time to first response on an enquiry",
        metric: "enquiry.first_response_minutes",
        direction: "decrease",
        baseline: 180,
        target: 15,
        unit: "minutes",
      },
    ],
    agentIds: ["admin-operations", "marketing"],
  },
  {
    id: "outcome-service-recovery",
    name: "Better recovery on high-value complaints",
    priority: "medium",
    owner: OWNER,
    metrics: [
      {
        id: "resolution-hours",
        label: "Time to resolve a complaint",
        metric: "complaint.resolution_hours",
        direction: "decrease",
        baseline: 48,
        target: 6,
        unit: "hours",
      },
      {
        id: "retained-pct",
        label: "Complaining customers retained",
        metric: "complaint.retained_pct",
        direction: "increase",
        baseline: 60,
        target: 90,
        unit: "percent",
      },
    ],
    agentIds: ["service-recovery"],
  },
];

/* ═══════════════════════════════ The plan ═══════════════════════════════ */

export const BRIGHTPATH_PLAN: ApprovedPlan = {
  planId: "plan-brightpath-001",
  version: 2,
  approvedAt: "2026-07-24T09:30:00+08:00",
  approvedBy: OWNER,
  reportVersion: 2,
  businessOutcomes,
  // Four, deliberately. The M0 fixture table's "broken set" is covered by
  // sandbox scenarios rather than a fifth agent here — see the file header.
  agents: [adminOperations, marketing, financeFollowUp, serviceRecovery],
  globalPolicy: {
    quietHours: WORKING_HOURS,
    // Refunds are Sarah's decision in person, so no agent may reach the
    // operation at all. Nothing above grants it.
    forbidden: ["hubspot.refunds.issue"],
  },
};

/* Individual specs, exported so the Agent Factory and runtime tests can pin
   one agent without reaching through the plan. */
export {
  adminOperations as BRIGHTPATH_ADMIN_OPERATIONS,
  marketing as BRIGHTPATH_MARKETING,
  financeFollowUp as BRIGHTPATH_FINANCE_FOLLOWUP,
  serviceRecovery as BRIGHTPATH_SERVICE_RECOVERY,
};
