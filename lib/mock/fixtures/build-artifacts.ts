/**
 * lib/mock/fixtures/build-artifacts.ts — Agent Factory build fixtures
 * (spec §14, §22, Appendix B): deterministic build logs and reviewable
 * artifact packages for the four approved BrightPath agents.
 * service-recovery's agent.yaml reproduces Appendix B exactly.
 */

import type { BuildFixture } from "../types";
import { AGENT } from "./ids";

export const BUILD_FIXTURES: Record<string, BuildFixture> = {
  [AGENT.admin]: {
    agentId: AGENT.admin,
    duration: 9000,
    log: [
      { at: 0, text: "Reading approved plan and agent configuration", tone: "info" },
      { at: 900, text: "Resolving workflows: customer-response-drafting, appointment-scheduling", tone: "info" },
      { at: 1800, text: "Workflow definitions generated (2 of 2)", tone: "ok" },
      { at: 2700, text: "Composing prompt templates from confirmed company knowledge", tone: "info" },
      { at: 3600, text: "Prompt templates written to prompts.md", tone: "ok" },
      { at: 4500, text: "Compiling approval policies: schedule changes after confirmation stay human-approved", tone: "info" },
      { at: 5400, text: "Approval policies compiled (approval-policies.json)", tone: "ok" },
      { at: 6300, text: "Mapping integrations: Gmail, Google Calendar, HubSpot, WhatsApp Business", tone: "info" },
      { at: 7200, text: "WhatsApp Business not yet connected — drafts will queue until activation", tone: "warn" },
      { at: 7900, text: "Generating test cases (8 scenarios)", tone: "info" },
      { at: 8600, text: "Validation passed — package ready for review", tone: "ok" },
    ],
    artifacts: [
      {
        name: "agent.yaml",
        language: "yaml",
        content: `schema_version: '1.0'
agent:
  id: admin-operations
  name: Admin Operations Agent
  source: preset
  objective: Draft customer replies and coordinate appointment scheduling without sending anything unapproved
trigger:
  event_type: [inbox.new_message, booking.requested]
operating_mode: act_after_approval
inputs: [customer_message, customer_record, technician_availability, sop_excerpts]
outputs: [reply_draft, proposed_slots, tentative_calendar_hold, review_request]
permissions:
  read: [gmail_shared_inbox, whatsapp_messages, hubspot_contacts, technician_calendars]
  write: [reply_drafts, tentative_holds, contact_notes]
  forbidden: [send_without_approval, confirm_schedule_change_after_customer_confirmation,
    issue_refund, delete_customer_record]
human_approval:
  required_for: [outbound_send, schedule_change_after_confirmation,
    any_message_to_high_value_customer]
retry_policy:
  max_attempts: 2
  timeout_seconds: 45
  on_exhausted: notify_process_owner
process_owner: Priya Nair
approval_owner: Sarah Chen
`,
      },
      {
        name: "workflows.yaml",
        language: "yaml",
        content: `schema_version: '1.0'
agent: admin-operations
workflows:
  - id: customer-response-drafting
    name: Customer Response Drafting
    trigger:
      kind: event
      sources: [gmail.new_message, whatsapp.new_message]
    steps:
      - classify_enquiry            # service question / booking / complaint / other
      - retrieve_customer_context   # CRM Records lookup, one customer at a time
      - check_sop_and_price_list    # Files and Documents search
      - draft_reply
      - route_to_review_queue
    handoff: reply_draft + customer_context -> approval queue (Customer Care)
    on_failure: leave message unread and marked; notify Priya Nair in Slack
  - id: appointment-scheduling
    name: Appointment Scheduling
    trigger:
      kind: event
      sources: [booking.requested]
    steps:
      - parse_service_request       # service type, units, preferred window
      - query_technician_availability
      - propose_two_slots
      - create_tentative_hold       # expires in 24h if unconfirmed
      - draft_confirmation_message
    handoff: tentative_hold + confirmation_draft -> coordinator review
    on_failure: release hold, hand thread to coordinator with a note
`,
      },
      {
        name: "prompts.md",
        language: "markdown",
        content: `# Prompt templates — Admin Operations Agent

## Customer Response Drafting

**System intent.** You draft replies for BrightPath Home Services, a residential
maintenance company in Singapore. Tone: warm, concise, practical. Always use
the customer's name. Quote prices only from the approved price list. If the
enquiry mentions a complaint or compensation, stop and route to the Service
Recovery Coordinator instead of drafting.

**Grounding.** Before drafting, retrieve: last 3 interactions from CRM Records,
relevant SOP section, plan status (ad-hoc vs recurring maintenance plan).

**Never.** Never promise a specific technician, a refund, or a schedule change
that overrides a confirmed booking. Never invent availability.

## Appointment Scheduling

**System intent.** Offer exactly two candidate slots inside working hours
(Mon–Sat 08:30–18:00, no Sundays or public holidays). Prefer the customer's
stated window. Hold slots tentatively; a person confirms.

**Draft style example.** "Hi Mr Pillai, we can service both aircon units on
Tue 28 Jul 9:30am or Wed 29 Jul 11:00am. Shall I confirm one of these?"
`,
      },
      {
        name: "approval-policies.json",
        language: "json",
        content: `{
  "schemaVersion": "1.0",
  "agentId": "admin-operations",
  "operatingMode": "act_after_approval",
  "alwaysRequireApproval": [
    {
      "action": "outbound_send",
      "reason": "Assist mode: every customer-facing message is reviewed",
      "approver": "Customer Care lead (Priya Nair)"
    },
    {
      "action": "schedule_change_after_customer_confirmation",
      "reason": "Owner rule from Discovery — confirmed bookings stay human-approved",
      "approver": "Sarah Chen"
    },
    {
      "action": "any_message_to_high_value_customer",
      "reason": "Plan rule: no automatic contact with high-value customers",
      "approver": "Sarah Chen"
    }
  ],
  "autoAllowed": [
    "classify_enquiry",
    "retrieve_customer_context",
    "create_tentative_hold"
  ],
  "forbidden": [
    "send_without_approval",
    "confirm_schedule_change_after_customer_confirmation",
    "issue_refund",
    "delete_customer_record"
  ],
  "quietHours": "21:00-08:00 SGT",
  "escalation": {
    "onMissingData": "hand to coordinator with note",
    "onRepeatedFailure": "notify Priya Nair, pause workflow"
  }
}
`,
      },
      {
        name: "test-cases.yaml",
        language: "yaml",
        content: `schema_version: '1.0'
agent: admin-operations
cases:
  - id: tc-adm-01
    name: Routine service enquiry via Gmail
    given: customer asks for aircon chemical wash price
    expect: draft cites approved price list; routed to review; nothing sent
  - id: tc-adm-02
    name: Booking request with preferred window
    given: WhatsApp request, weekday morning preferred
    expect: two slots proposed inside working hours; tentative hold created
  - id: tc-adm-03
    name: Reschedule after customer already confirmed
    given: customer asks to move a confirmed Saturday job
    expect: approval request to Sarah Chen; no calendar change made
  - id: tc-adm-04
    name: Message from high-value customer
    given: sender tagged high-value in CRM
    expect: draft prepared but flagged; requires owner approval to send
  - id: tc-adm-05
    name: Complaint keywords detected
    given: message contains "third time delayed, unacceptable"
    expect: routed to Service Recovery Coordinator; no reply drafted
  - id: tc-adm-06
    name: No technician available in window
    given: requested window fully booked
    expect: nearest alternatives offered; no invented availability
  - id: tc-adm-07
    name: Hold expiry
    given: tentative hold unconfirmed for 24h
    expect: hold released; follow-up draft queued for review
  - id: tc-adm-08
    name: Sunday booking request
    given: customer asks for Sunday slot
    expect: polite draft explaining Mon-Sat hours; two alternatives offered
`,
      },
      {
        name: "integration-manifest.json",
        language: "json",
        content: `{
  "schemaVersion": "1.0",
  "agentId": "admin-operations",
  "connections": [
    {
      "id": "gmail",
      "mode": "read_and_draft",
      "scopes": ["gmail.readonly", "gmail.compose", "gmail.labels"],
      "account": "ops@brightpath.sg"
    },
    {
      "id": "google-calendar",
      "mode": "read_and_hold",
      "scopes": ["calendar.events.readonly", "calendar.events"],
      "account": "ops@brightpath.sg"
    },
    {
      "id": "hubspot",
      "mode": "read_and_annotate",
      "scopes": ["crm.objects.contacts.read", "crm.objects.notes.write"],
      "account": "BrightPath Home Services — SG portal"
    },
    {
      "id": "whatsapp-business",
      "mode": "read_and_draft",
      "scopes": ["whatsapp_business_messaging"],
      "account": "+65 6744 2018"
    }
  ],
  "mcpTools": [
    {
      "id": "mcp-crm-records",
      "server": "https://mcp.oriant.ai/brightpath/crm",
      "scopes": ["contacts.read", "history.read", "notes.write"]
    },
    {
      "id": "mcp-files-documents",
      "server": "https://mcp.oriant.ai/brightpath/files",
      "scopes": ["documents.read", "documents.search"]
    },
    {
      "id": "mcp-calendar-actions",
      "server": "https://mcp.oriant.ai/brightpath/calendar",
      "scopes": ["availability.read", "holds.write"]
    }
  ]
}
`,
      },
    ],
  },

  [AGENT.marketing]: {
    agentId: AGENT.marketing,
    duration: 11000,
    log: [
      { at: 0, text: "Reading approved plan and agent configuration", tone: "info" },
      { at: 1000, text: "Resolving workflows: content-planning, campaign-drafting-approval", tone: "info" },
      { at: 2100, text: "Workflow definitions generated (2 of 2)", tone: "ok" },
      { at: 3200, text: "Importing brand voice notes from the marketing folder", tone: "info" },
      { at: 4300, text: "Prompt templates written to prompts.md", tone: "ok" },
      { at: 5400, text: "Locking publish actions: public content always requires owner approval", tone: "info" },
      { at: 6500, text: "Approval policies compiled (approval-policies.json)", tone: "ok" },
      { at: 7600, text: "No ad-spend permissions granted — budget actions excluded from manifest", tone: "warn" },
      { at: 8600, text: "Mapping integrations: HubSpot, Google Drive", tone: "info" },
      { at: 9600, text: "Generating test cases (7 scenarios)", tone: "info" },
      { at: 10500, text: "Validation passed — package ready for review", tone: "ok" },
    ],
    artifacts: [
      {
        name: "agent.yaml",
        language: "yaml",
        content: `schema_version: '1.0'
agent:
  id: marketing
  name: Marketing Agent
  source: preset
  objective: Plan weekly content and draft campaigns; nothing publishes without owner approval
trigger:
  event_type: [schedule.weekly_monday_0900, campaign.brief_submitted]
operating_mode: draft_only
inputs: [content_calendar, brand_assets, past_campaign_performance, seasonal_context]
outputs: [weekly_content_plan, campaign_draft, owner_approval_request]
permissions:
  read: [google_drive_marketing_folder, hubspot_contact_segments, past_campaigns]
  write: [content_plan_drafts, campaign_drafts]
  forbidden: [publish_public_content, boost_or_spend_budget,
    message_customers_directly, export_contact_lists]
human_approval:
  required_for: [any_public_content, any_campaign_send, use_of_customer_photos]
retry_policy:
  max_attempts: 2
  timeout_seconds: 60
  on_exhausted: notify_process_owner
process_owner: Dana Lim
approval_owner: Sarah Chen
`,
      },
      {
        name: "workflows.yaml",
        language: "yaml",
        content: `schema_version: '1.0'
agent: marketing
workflows:
  - id: content-planning
    name: Content Planning
    trigger:
      kind: schedule
      cron: "0 9 * * MON"        # every Monday 09:00 SGT
    steps:
      - review_last_week_performance
      - scan_seasonal_context      # e.g. haze season, CNY, National Day
      - propose_three_topics
      - assemble_weekly_plan
      - route_to_review            # Dana Lim reviews, Sarah approves
    handoff: weekly_content_plan -> marketing review queue
    on_failure: skip week, notify Dana Lim; never reuse an unapproved plan
  - id: campaign-drafting-approval
    name: Campaign Drafting and Approval
    trigger:
      kind: manual
      sources: [campaign.brief_submitted]
    steps:
      - read_brief_and_brand_kit
      - draft_copy_and_asset_list
      - prepare_two_variants
      - route_to_owner_approval    # public content is an always-approve rule
    handoff: campaign_draft (2 variants) -> owner approval queue
    on_failure: save partial draft to marketing folder with a note
`,
      },
      {
        name: "prompts.md",
        language: "markdown",
        content: `# Prompt templates — Marketing Agent

## Content Planning

**System intent.** You plan weekly content for BrightPath Home Services,
a residential maintenance brand in Singapore. Audience: HDB and condo
households, 30–55, practical and value-conscious. Voice: helpful neighbour,
not salesy. Mix each week: one maintenance tip, one service highlight,
one proof point (review or before/after).

**Grounding.** Use last week's performance summary and the Singapore
seasonal calendar (monsoon months, CNY, National Day) before proposing topics.

**Never.** Never schedule or publish. Never reference a customer by name
without a signed consent note in the brief.

## Campaign Drafting

**System intent.** Draft two variants per brief: one lead with price, one
lead with outcome. Keep SGD prices exactly as given in the brief — do not
round or discount. End every draft with the standard booking call to action.

**Never.** Never invent promotions, percentages or deadlines. Never imply
guaranteed results.
`,
      },
      {
        name: "approval-policies.json",
        language: "json",
        content: `{
  "schemaVersion": "1.0",
  "agentId": "marketing",
  "operatingMode": "draft_only",
  "alwaysRequireApproval": [
    {
      "action": "any_public_content",
      "reason": "Owner rule from Discovery — public campaign content stays with a person",
      "approver": "Sarah Chen"
    },
    {
      "action": "any_campaign_send",
      "reason": "Sends reach customers directly; Assist mode keeps this human",
      "approver": "Sarah Chen"
    },
    {
      "action": "use_of_customer_photos",
      "reason": "Consent must be verified by the marketing coordinator",
      "approver": "Dana Lim"
    }
  ],
  "autoAllowed": [
    "review_last_week_performance",
    "propose_three_topics",
    "draft_copy_and_asset_list"
  ],
  "forbidden": [
    "publish_public_content",
    "boost_or_spend_budget",
    "message_customers_directly",
    "export_contact_lists"
  ],
  "quietHours": "not_applicable_draft_only",
  "escalation": {
    "onMissingData": "draft with placeholder flagged NEEDS INPUT and route to Dana Lim",
    "onRepeatedFailure": "pause workflow, notify Dana Lim"
  }
}
`,
      },
      {
        name: "test-cases.yaml",
        language: "yaml",
        content: `schema_version: '1.0'
agent: marketing
cases:
  - id: tc-mkt-01
    name: Monday plan generation
    given: normal Monday 09:00 run
    expect: three topics proposed; plan routed to review; nothing scheduled
  - id: tc-mkt-02
    name: Campaign brief with fixed price
    given: brief says "$88 aircon servicing promo"
    expect: both variants keep $88 exactly; no invented discount
  - id: tc-mkt-03
    name: Attempted direct publish
    given: reviewer clicks publish inside draft tool
    expect: action blocked; owner approval request created instead
  - id: tc-mkt-04
    name: Customer photo in brief without consent note
    given: brief attaches customer photo, no consent reference
    expect: draft flags photo; approval routed to Dana Lim
  - id: tc-mkt-05
    name: Missing performance data
    given: last week's summary unavailable
    expect: plan drafted from seasonal context only, gap noted for reviewer
  - id: tc-mkt-06
    name: Public holiday week
    given: plan week contains National Day
    expect: holiday-aware schedule suggested; no posts on the holiday itself
  - id: tc-mkt-07
    name: Budget action requested in brief
    given: brief asks to "boost this post $50"
    expect: boost excluded; note explains budget actions are not permitted
`,
      },
      {
        name: "integration-manifest.json",
        language: "json",
        content: `{
  "schemaVersion": "1.0",
  "agentId": "marketing",
  "connections": [
    {
      "id": "hubspot",
      "mode": "read_only_segments",
      "scopes": ["crm.objects.contacts.read"],
      "account": "BrightPath Home Services — SG portal"
    },
    {
      "id": "google-drive",
      "mode": "read_and_save_drafts",
      "scopes": ["drive.readonly", "drive.file"],
      "account": "ops@brightpath.sg"
    }
  ],
  "mcpTools": [
    {
      "id": "mcp-files-documents",
      "server": "https://mcp.oriant.ai/brightpath/files",
      "scopes": ["documents.read", "documents.search"]
    },
    {
      "id": "mcp-browser-research",
      "server": "https://mcp.oriant.ai/brightpath/browser",
      "scopes": ["web.fetch", "web.search"]
    },
    {
      "id": "mcp-crm-records",
      "server": "https://mcp.oriant.ai/brightpath/crm",
      "scopes": ["contacts.read"]
    }
  ]
}
`,
      },
    ],
  },

  [AGENT.finance]: {
    agentId: AGENT.finance,
    duration: 12500,
    log: [
      { at: 0, text: "Reading approved plan and agent configuration", tone: "info" },
      { at: 1100, text: "Resolving workflows: overdue-invoice-summary, payment-reminder-drafting", tone: "info" },
      { at: 2300, text: "Workflow definitions generated (2 of 2)", tone: "ok" },
      { at: 3500, text: "Setting schedule: Fridays 09:00 SGT, aligned to the current manual routine", tone: "info" },
      { at: 4700, text: "Prompt templates written to prompts.md", tone: "ok" },
      { at: 5900, text: "Compiling approval policies: reminder batches and write-off flags stay human-approved", tone: "info" },
      { at: 7100, text: "Approval policies compiled (approval-policies.json)", tone: "ok" },
      { at: 8300, text: "Read-only QuickBooks scope verified — no write access to amounts or payments", tone: "ok" },
      { at: 9400, text: "Payment-plan exclusion list has 1 entry — confirm it stays current after activation", tone: "warn" },
      { at: 10500, text: "Generating test cases (7 scenarios)", tone: "info" },
      { at: 11800, text: "Validation passed — package ready for review", tone: "ok" },
    ],
    artifacts: [
      {
        name: "agent.yaml",
        language: "yaml",
        content: `schema_version: '1.0'
agent:
  id: finance-followup
  name: Finance Follow-up Agent
  source: preset
  objective: Summarise overdue invoices and draft payment reminders every Friday without touching any financial record
trigger:
  event_type: schedule.weekly_friday_0900
operating_mode: act_after_approval
inputs: [quickbooks_invoices, payment_status, customer_balances, exclusion_list]
outputs: [overdue_summary, reminder_draft_batch, writeoff_flag, owner_approval_request]
permissions:
  read: [quickbooks_invoices, payment_status, customer_balances]
  write: [reminder_drafts, invoice_flags, slack_finance_summaries]
  forbidden: [write_off_invoice, edit_invoice_amount, record_payment,
    initiate_payment_or_transfer, send_reminder_without_approval]
human_approval:
  required_for: [reminder_batch_send, any_writeoff_suggestion,
    contact_with_customer_over_60_days_overdue]
retry_policy:
  max_attempts: 3
  timeout_seconds: 90
  on_exhausted: post_failure_note_in_slack_finance
process_owner: Wei Ling Goh
approval_owner: Sarah Chen
`,
      },
      {
        name: "workflows.yaml",
        language: "yaml",
        content: `schema_version: '1.0'
agent: finance-followup
workflows:
  - id: overdue-invoice-summary
    name: Overdue Invoice Summary
    trigger:
      kind: schedule
      cron: "0 9 * * FRI"        # every Friday 09:00 SGT
    steps:
      - pull_open_invoices         # QuickBooks read-only
      - group_by_age_band          # 1-14, 15-30, 31-60, 60+ days
      - apply_exclusion_list       # agreed payment plans are skipped
      - compose_summary
      - post_summary_to_slack      # #finance channel
    handoff: overdue_summary -> payment-reminder-drafting + #finance
    on_failure: retry twice, then post failure note tagging Wei Ling Goh
  - id: payment-reminder-drafting
    name: Payment Reminder Drafting
    trigger:
      kind: dependency
      after: overdue-invoice-summary
    steps:
      - select_invoices_for_reminder
      - draft_reminders_by_age_band  # tone firms with age, never threatens
      - flag_writeoff_candidates     # 60+ days -> owner decision only
      - assemble_batch_for_approval
    handoff: reminder_draft_batch -> owner approval queue
    on_failure: hold batch; nothing sends without an approved batch
`,
      },
      {
        name: "prompts.md",
        language: "markdown",
        content: `# Prompt templates — Finance Follow-up Agent

## Overdue Invoice Summary

**System intent.** Summarise BrightPath's overdue invoices for a busy owner.
Lead with totals (count, SGD value), then age bands, then anything unusual.
Flat, factual tone. Amounts always in SGD with a dollar sign.

**Grounding.** Only QuickBooks data pulled in this run. If a figure cannot be
read, say "not available" — never estimate money.

## Payment Reminder Drafting

**Tone ladder.**
- 1–14 days: friendly nudge — "just a gentle reminder"
- 15–30 days: clear ask with due date and PayNow/bank details
- 31–60 days: firm but polite; offers a call with Wei Ling to discuss
- 60+ days: no draft — flag for owner decision instead

**Never.** Never mention late fees or legal action (BrightPath does not use
them). Never draft for a customer on the agreed payment-plan list. Never
change an amount — quote QuickBooks exactly.
`,
      },
      {
        name: "approval-policies.json",
        language: "json",
        content: `{
  "schemaVersion": "1.0",
  "agentId": "finance-followup",
  "operatingMode": "act_after_approval",
  "alwaysRequireApproval": [
    {
      "action": "reminder_batch_send",
      "reason": "Friday batch reviewed as one approval before any reminder goes out",
      "approver": "Sarah Chen"
    },
    {
      "action": "any_writeoff_suggestion",
      "reason": "Owner rule from Discovery — invoice write-offs are always a human decision",
      "approver": "Sarah Chen"
    },
    {
      "action": "contact_with_customer_over_60_days_overdue",
      "reason": "Long-overdue accounts are relationship decisions, not routine follow-up",
      "approver": "Sarah Chen"
    }
  ],
  "autoAllowed": [
    "pull_open_invoices",
    "compose_summary",
    "post_summary_to_slack"
  ],
  "forbidden": [
    "write_off_invoice",
    "edit_invoice_amount",
    "record_payment",
    "initiate_payment_or_transfer",
    "send_reminder_without_approval"
  ],
  "quietHours": "18:00-08:00 SGT and weekends for outbound reminders",
  "escalation": {
    "onMissingData": "exclude the invoice from the batch and list it in the summary",
    "onRepeatedFailure": "pause schedule, notify Wei Ling Goh"
  }
}
`,
      },
      {
        name: "test-cases.yaml",
        language: "yaml",
        content: `schema_version: '1.0'
agent: finance-followup
cases:
  - id: tc-fin-01
    name: Normal Friday run
    given: 7 overdue invoices in QuickBooks
    expect: summary posted to #finance; batch drafted; nothing sent
  - id: tc-fin-02
    name: Customer on payment plan
    given: overdue invoice for a customer on the exclusion list
    expect: skipped from batch; listed in summary as excluded
  - id: tc-fin-03
    name: Invoice over 60 days
    given: INV 41 days overdue crossing to 60+ next run
    expect: no reminder drafted at 60+; write-off flag routed to owner
  - id: tc-fin-04
    name: Amount mismatch guard
    given: draft template asked to round $857.50 to $860
    expect: amount kept exactly as QuickBooks records it
  - id: tc-fin-05
    name: QuickBooks unreachable
    given: connector times out three times
    expect: no batch created; failure note posted tagging Wei Ling Goh
  - id: tc-fin-06
    name: Batch edited before approval
    given: owner softens tone of one reminder in review
    expect: edited version becomes v2; original preserved in history
  - id: tc-fin-07
    name: Public holiday Friday
    given: run date falls on a public holiday
    expect: run skipped per quiet rules; next-day summary notes the skip
`,
      },
      {
        name: "integration-manifest.json",
        language: "json",
        content: `{
  "schemaVersion": "1.0",
  "agentId": "finance-followup",
  "connections": [
    {
      "id": "quickbooks",
      "mode": "read_only",
      "scopes": ["com.intuit.quickbooks.accounting.read"],
      "account": "BrightPath Home Services Pte Ltd"
    },
    {
      "id": "gmail",
      "mode": "draft_only",
      "scopes": ["gmail.compose"],
      "account": "ops@brightpath.sg"
    },
    {
      "id": "slack",
      "mode": "post_summaries",
      "scopes": ["chat:write", "channels:read"],
      "account": "brightpath-sg.slack.com"
    }
  ],
  "mcpTools": [
    {
      "id": "mcp-internal-knowledge",
      "server": "https://mcp.oriant.ai/brightpath/knowledge",
      "scopes": ["knowledge.read"]
    }
  ]
}
`,
      },
    ],
  },

  [AGENT.recovery]: {
    agentId: AGENT.recovery,
    duration: 15000,
    log: [
      { at: 0, text: "Reading approved custom agent design (Agent Design Report v1)", tone: "info" },
      { at: 1300, text: "Custom build: assembling Service Recovery Coordinator from design answers", tone: "info" },
      { at: 2600, text: "Workflow definition generated: high-value-complaint-resolution", tone: "ok" },
      { at: 3900, text: "Wiring data requests: HubSpot history, job records, invoice status", tone: "info" },
      { at: 5200, text: "Cross-team request path to Field Operations configured (technician notes)", tone: "ok" },
      { at: 6500, text: "Compensation actions locked: issue_refund and promise_compensation are forbidden", tone: "info" },
      { at: 7800, text: "Approval gate inserted before any compensation proposal reaches a customer", tone: "ok" },
      { at: 9100, text: "Escalation rules set: missing information or persistent negative sentiment -> owner", tone: "info" },
      { at: 10400, text: "Sentiment threshold uses a conservative default — tune after first live week", tone: "warn" },
      { at: 11700, text: "Prompt templates written to prompts.md", tone: "ok" },
      { at: 13000, text: "Generating test cases (8 scenarios, includes missing-data case)", tone: "info" },
      { at: 14300, text: "Validation passed — package ready for review", tone: "ok" },
    ],
    artifacts: [
      {
        name: "agent.yaml",
        language: "yaml",
        content: `schema_version: '1.0'
agent:
  id: service-recovery
  name: Service Recovery Coordinator
  source: custom
  objective: Coordinate high-value complaint resolution without making financial commitments
trigger:
  event_type: complaint.high_severity
inputs: [customer_history, job_record, invoice_status, technician_notes]
outputs: [resolution_draft, compensation_proposal, owner_approval_request]
permissions:
  read: [hubspot_customer_history, job_records, invoice_status]
  write: [resolution_drafts, approval_queue]
  forbidden: [issue_refund, promise_compensation, delete_customer_record]
human_approval:
  required_for: [any_compensation, refund, schedule_change_after_confirmation,
    missing_required_information]
`,
      },
      {
        name: "workflows.yaml",
        language: "yaml",
        content: `schema_version: '1.0'
agent: service-recovery
workflows:
  - id: high-value-complaint-resolution
    name: High-Value Complaint Resolution
    trigger:
      kind: event
      sources: [complaint.high_severity, compensation.requested_by_high_value_customer]
    steps:
      - receive_case_from_customer_care   # classified complaint + original message
      - pull_customer_history             # HubSpot: tenure, plan value, prior complaints
      - pull_job_record                   # reschedules, technician assignments
      - pull_invoice_status               # paid / outstanding, QuickBooks read-only
      - request_technician_notes          # message to Field Operations (Marcus Tan)
      - assess_service_failure            # facts first, then sentiment
      - draft_resolution_and_compensation # proposal only, never a promise
      - pause_for_owner_approval          # hard gate before any customer contact
      - send_approved_resolution
      - log_outcome_and_followup
    handoff: resolution_draft + compensation_proposal -> owner approval queue
    on_failure: stop before customer contact; escalate to Sarah Chen with case file
    escalation:
      - condition: required job or invoice data missing
        action: raise data gap to owner; do not guess or proceed
      - condition: customer sentiment remains highly negative after offer
        action: hand conversation to Sarah Chen personally
`,
      },
      {
        name: "prompts.md",
        language: "markdown",
        content: `# Prompt templates — Service Recovery Coordinator

## Case assessment

**System intent.** You coordinate serious complaints for BrightPath Home
Services. Your job is to assemble the full picture — customer value, what
went wrong, what it cost the customer — and propose a fair resolution for
the owner to decide. You are a coordinator, not a negotiator: you never
commit BrightPath to anything.

**Grounding order.** 1) job record facts, 2) invoice status, 3) customer
history, 4) technician notes, 5) the customer's own words. State each fact
with its source. If any required record is missing, stop and raise a data
gap — do not reconstruct events from memory or the message alone.

## Resolution drafting

**Structure.** a) plain acknowledgement of the specific failure (name the
dates), b) what BrightPath will do and when, c) proposed goodwill gesture
marked "pending owner approval", d) a direct line for the customer.

**Compensation guidance.** Service credits in $20 steps, cap $100 without a
separate owner note. Refunds are never proposed as final — always "subject
to approval". Never mention compensation to the customer before approval.

**Tone.** Sincere and specific. Never blame the technician or the customer.
Never use the phrase "we apologise for any inconvenience" — name the actual
inconvenience.
`,
      },
      {
        name: "approval-policies.json",
        language: "json",
        content: `{
  "schemaVersion": "1.0",
  "agentId": "service-recovery",
  "operatingMode": "draft_only",
  "alwaysRequireApproval": [
    {
      "action": "any_compensation",
      "reason": "No financial commitment leaves the company without the owner",
      "approver": "Sarah Chen"
    },
    {
      "action": "refund",
      "reason": "Owner rule from Discovery — refunds above $100 always human; this agent proposes only",
      "approver": "Sarah Chen"
    },
    {
      "action": "schedule_change_after_confirmation",
      "reason": "Recovery visits may move confirmed bookings — owner decides",
      "approver": "Sarah Chen"
    },
    {
      "action": "missing_required_information",
      "reason": "Proceeding on incomplete records risks a wrong promise",
      "approver": "Sarah Chen"
    }
  ],
  "autoAllowed": [
    "pull_customer_history",
    "pull_job_record",
    "pull_invoice_status",
    "request_technician_notes",
    "draft_resolution_and_compensation"
  ],
  "forbidden": [
    "issue_refund",
    "promise_compensation",
    "delete_customer_record"
  ],
  "quietHours": "21:00-08:00 SGT for outbound messages",
  "escalation": {
    "onMissingData": "raise data gap to Sarah Chen; case paused, customer not contacted",
    "onPersistentNegativeSentiment": "hand conversation to Sarah Chen personally"
  }
}
`,
      },
      {
        name: "test-cases.yaml",
        language: "yaml",
        content: `schema_version: '1.0'
agent: service-recovery
cases:
  - id: tc-rec-01
    name: Delayed servicing, high-value plan customer
    given: job rescheduled twice, $4,800/yr plan, WhatsApp complaint
    expect: full context pulled; resolution drafted; paused for owner approval
  - id: tc-rec-02
    name: Compensation request from high-value customer
    given: customer asks directly for a refund
    expect: trigger fires; proposal marked pending approval; no amount promised
  - id: tc-rec-03
    name: Missing job record
    given: complaint references a booking with no job record found
    expect: agent stops before drafting; data gap raised; customer not contacted
  - id: tc-rec-04
    name: Sentiment stays negative after offer
    given: customer rejects approved resolution angrily
    expect: conversation handed to Sarah Chen personally; no second offer drafted
  - id: tc-rec-05
    name: Credit above guidance cap
    given: assessment suggests $140 service credit
    expect: proposal flagged over-cap; requires explicit owner note to proceed
  - id: tc-rec-06
    name: Complaint about an unpaid invoice job
    given: invoice outstanding on the disputed job
    expect: invoice status stated in case file; no reminder mixed into recovery message
  - id: tc-rec-07
    name: Attempted direct send before approval
    given: send requested while approval pending
    expect: send blocked by approval gate; event logged
  - id: tc-rec-08
    name: Duplicate complaint within 24 hours
    given: same customer, same job, second message
    expect: merged into open case; no second resolution drafted
`,
      },
      {
        name: "integration-manifest.json",
        language: "json",
        content: `{
  "schemaVersion": "1.0",
  "agentId": "service-recovery",
  "connections": [
    {
      "id": "hubspot",
      "mode": "read_history_and_annotate",
      "scopes": ["crm.objects.contacts.read", "crm.objects.notes.write"],
      "account": "BrightPath Home Services — SG portal"
    },
    {
      "id": "quickbooks",
      "mode": "read_only",
      "scopes": ["com.intuit.quickbooks.accounting.read"],
      "account": "BrightPath Home Services Pte Ltd"
    },
    {
      "id": "whatsapp-business",
      "mode": "read_and_draft",
      "scopes": ["whatsapp_business_messaging"],
      "account": "+65 6744 2018"
    },
    {
      "id": "gmail",
      "mode": "read_and_draft",
      "scopes": ["gmail.readonly", "gmail.compose"],
      "account": "ops@brightpath.sg"
    },
    {
      "id": "slack",
      "mode": "notify_approvers",
      "scopes": ["chat:write"],
      "account": "brightpath-sg.slack.com"
    }
  ],
  "mcpTools": [
    {
      "id": "mcp-crm-records",
      "server": "https://mcp.oriant.ai/brightpath/crm",
      "scopes": ["contacts.read", "history.read", "notes.write"]
    },
    {
      "id": "mcp-files-documents",
      "server": "https://mcp.oriant.ai/brightpath/files",
      "scopes": ["documents.read", "documents.search"]
    },
    {
      "id": "mcp-internal-knowledge",
      "server": "https://mcp.oriant.ai/brightpath/knowledge",
      "scopes": ["knowledge.read"]
    }
  ]
}
`,
      },
    ],
  },
};

/** Build stagger order (spec §14 — per-agent staggered starts). */
export const BUILD_ORDER: string[] = [
  AGENT.admin,
  AGENT.marketing,
  AGENT.finance,
  AGENT.recovery,
];
