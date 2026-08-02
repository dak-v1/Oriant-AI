/**
 * One-off dev seed script. NOT part of the app — nothing imports this file,
 * and it does not import from app/api/plan/* or lib/server/orchestrator.ts.
 *
 * PREREQUISITE (must be run manually first, in the Supabase SQL editor —
 * PostgREST has no DDL path, so this script cannot run it for you):
 *   ALTER TABLE agent_templates ADD COLUMN IF NOT EXISTS default_runtime_model text;
 *
 * Run with:
 *   npx dotenv -e .env.local -- npx tsx scripts/seed-agent-templates.ts
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment."
  );
}

const REST_URL = `${url.replace(/\/$/, "")}/rest/v1`;

async function insertRow<T = Record<string, unknown>>(
  table: string,
  row: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${REST_URL}/${table}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey!,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Insert into ${table} failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as T[];
  return data[0];
}

/**
 * A type alias rather than an interface on purpose. `insertRow` takes
 * `Record<string, unknown>`, and only a type alias carries the implicit index
 * signature that makes it assignable; an interface does not, so declaring this
 * with `interface` fails at the call site below.
 */
type TemplateRow = {
  key: string;
  name: string;
  category: string;
  description: string;
  objective: string;
  default_channels: string[];
  template_files: Record<string, string>;
  config_schema: Record<string, unknown>;
  est_tokens_per_task: number;
  required_tools: string[];
  default_runtime_model: string;
};

function toolsYaml(tools: string[]): string {
  return ["tools:", ...tools.map((t) => `  - id: ${t}\n    scope: read_write`)].join("\n");
}

const TEMPLATES: TemplateRow[] = [
  {
    key: "hr_resume_screener",
    name: "Resume Screener",
    category: "HR",
    description: "Screens and scores incoming resumes against role criteria, flagging top candidates for review.",
    objective:
      "Read resumes arriving via {{intake_source}} for the {{role_title}} role, score each against {{scoring_criteria}}, and forward strong matches to {{hiring_manager}}.",
    default_channels: ["email"],
    required_tools: ["gmail", "google-drive"],
    default_runtime_model: "google/gemma-4-31b-it",
    est_tokens_per_task: 2000,
    template_files: {
      "agent.yaml": `name: "{{agent_name}}"
role: HR — Resume Screening
objective: >
  Read resumes arriving via {{intake_source}} for the {{role_title}} role,
  score each against {{scoring_criteria}}, and forward candidates meeting
  {{min_experience_years}}+ years of experience to {{hiring_manager}}.
runtime_model: google/gemma-4-31b-it
channels: [email]
tools: [gmail, google-drive]`,
      "prompt.md": `You are {{agent_name}}, the resume screening assistant for {{company_name}}.

For each resume received via {{intake_source}} for the {{role_title}} role:
1. Extract candidate name, years of experience, and key skills.
2. Score the resume against: {{scoring_criteria}}.
3. If experience is at least {{min_experience_years}} years and the score
   clears the bar, summarize the match and forward it to {{hiring_manager}}.
4. Never reject a candidate outright — always route borderline cases to
   {{hiring_manager}} for a human decision.`,
      "tools.yaml": toolsYaml(["gmail", "google-drive"]),
    },
    config_schema: {
      type: "object",
      required: ["agent_name", "role_title", "scoring_criteria", "hiring_manager"],
      properties: {
        agent_name: { type: "string", description: "Display name for this agent" },
        company_name: { type: "string" },
        intake_source: { type: "string", description: "Where resumes arrive, e.g. a shared inbox or Drive folder" },
        role_title: { type: "string" },
        scoring_criteria: { type: "array", items: { type: "string" }, description: "Criteria to score resumes against" },
        min_experience_years: { type: "integer", default: 2 },
        hiring_manager: { type: "string", description: "Who receives strong-match summaries" },
      },
    },
  },
  {
    key: "hr_interview_scheduler",
    name: "Interview Scheduler",
    category: "HR",
    description: "Coordinates interview scheduling between candidates and interviewers.",
    objective:
      "Propose interview slots across {{interviewer_calendars}} and confirm with candidates via {{communication_channel}}.",
    default_channels: ["email", "calendar"],
    required_tools: ["google-calendar", "gmail"],
    default_runtime_model: "deepseek-ai/deepseek-v4-flash",
    est_tokens_per_task: 2500,
    template_files: {
      "agent.yaml": `name: "{{agent_name}}"
role: HR — Interview Scheduling
objective: >
  Propose interview slots across {{interviewer_calendars}} within
  {{business_hours}}, each lasting {{interview_duration_minutes}} minutes,
  and confirm with candidates via {{communication_channel}}.
runtime_model: deepseek-ai/deepseek-v4-flash
channels: [email, calendar]
tools: [google-calendar, gmail]
escalation_contact: "{{escalation_contact}}"`,
      "prompt.md": `You are {{agent_name}}, the interview scheduling coordinator for {{company_name}}.

When a candidate is ready to be scheduled:
1. Check availability across {{interviewer_calendars}} within {{business_hours}}.
2. Propose interview slots of {{interview_duration_minutes}} minutes to the
   candidate via {{communication_channel}}.
3. Confirm the booked slot on all interviewers' calendars once the candidate
   accepts.
4. If no mutually available slot exists within 5 business days, escalate to
   {{escalation_contact}}.`,
      "tools.yaml": toolsYaml(["google-calendar", "gmail"]),
    },
    config_schema: {
      type: "object",
      required: ["agent_name", "interviewer_calendars", "communication_channel"],
      properties: {
        agent_name: { type: "string" },
        company_name: { type: "string" },
        interviewer_calendars: { type: "array", items: { type: "string" } },
        interview_duration_minutes: { type: "integer", default: 45 },
        communication_channel: { type: "string", description: "How candidates are contacted, e.g. email" },
        business_hours: { type: "string", default: "9am-6pm Mon-Fri" },
        escalation_contact: { type: "string" },
      },
    },
  },
  {
    key: "marketing_trend_tracker",
    name: "Trend Tracker",
    category: "Marketing",
    description: "Monitors social channels for emerging trends relevant to the business.",
    objective:
      "Track {{trend_keywords}} across {{monitored_platforms}} and post {{summary_frequency}} summaries to {{report_channel}}.",
    default_channels: ["chat"],
    required_tools: ["slack"],
    default_runtime_model: "moonshotai/kimi-k2.7-code",
    est_tokens_per_task: 1200,
    template_files: {
      "agent.yaml": `name: "{{agent_name}}"
role: Marketing — Trend Tracking
objective: >
  Track {{trend_keywords}} across {{monitored_platforms}} and post
  {{summary_frequency}} summaries to {{report_channel}}.
runtime_model: moonshotai/kimi-k2.7-code
channels: [chat]
tools: [slack]`,
      "prompt.md": `You are {{agent_name}}, the trend tracking assistant for {{company_name}}.

On a {{summary_frequency}} basis:
1. Scan {{monitored_platforms}} for activity related to {{trend_keywords}}.
2. Summarize notable trends, volume changes, and any risks or opportunities.
3. Post the summary to {{report_channel}}. Keep it under 200 words unless
   asked for more detail.`,
      "tools.yaml": toolsYaml(["slack"]),
    },
    config_schema: {
      type: "object",
      required: ["agent_name", "trend_keywords", "monitored_platforms", "report_channel"],
      properties: {
        agent_name: { type: "string" },
        trend_keywords: { type: "array", items: { type: "string" } },
        monitored_platforms: { type: "array", items: { type: "string" } },
        report_channel: { type: "string", description: "Slack channel to post summaries to" },
        summary_frequency: { type: "string", default: "daily" },
      },
    },
  },
  {
    key: "marketing_campaign_reporter",
    name: "Campaign Reporter",
    category: "Marketing",
    description: "Compiles campaign performance reports from marketing tools.",
    objective:
      "Pull metrics from {{data_sources}} for {{campaign_name}} and publish a summary to {{report_channel}} on {{report_cadence}}.",
    default_channels: ["chat", "dashboard"],
    required_tools: ["google-drive", "slack"],
    default_runtime_model: "moonshotai/kimi-k2.7-code",
    est_tokens_per_task: 2500,
    template_files: {
      "agent.yaml": `name: "{{agent_name}}"
role: Marketing — Campaign Reporting
objective: >
  Pull {{key_metrics}} from {{data_sources}} for {{campaign_name}} and
  publish a summary to {{report_channel}} on a {{report_cadence}} cadence.
runtime_model: moonshotai/kimi-k2.7-code
channels: [chat, dashboard]
tools: [google-drive, slack]`,
      "prompt.md": `You are {{agent_name}}, the campaign reporting assistant for {{company_name}}.

On a {{report_cadence}} basis, for {{campaign_name}}:
1. Pull {{key_metrics}} from {{data_sources}}.
2. Compile a concise performance summary, highlighting notable changes since
   the last report.
3. Publish the summary to {{report_channel}}.`,
      "tools.yaml": toolsYaml(["google-drive", "slack"]),
    },
    config_schema: {
      type: "object",
      required: ["agent_name", "campaign_name", "data_sources", "report_channel"],
      properties: {
        agent_name: { type: "string" },
        company_name: { type: "string" },
        campaign_name: { type: "string" },
        data_sources: { type: "array", items: { type: "string" } },
        key_metrics: { type: "array", items: { type: "string" }, default: ["impressions", "clicks", "conversions"] },
        report_channel: { type: "string" },
        report_cadence: { type: "string", default: "weekly" },
      },
    },
  },
  {
    key: "marketing_content_repurposer",
    name: "Content Repurposer",
    category: "Marketing",
    description: "Reformats existing content into variants for other channels.",
    objective:
      "Take source content from {{content_source}} and repurpose it into {{target_formats}} matching {{brand_voice}}.",
    default_channels: ["dashboard"],
    required_tools: ["google-drive"],
    default_runtime_model: "moonshotai/kimi-k2.7-code",
    est_tokens_per_task: 1500,
    template_files: {
      "agent.yaml": `name: "{{agent_name}}"
role: Marketing — Content Repurposing
objective: >
  Take source content from {{content_source}} and repurpose it into
  {{target_formats}}, matching a {{brand_voice}} voice.
runtime_model: moonshotai/kimi-k2.7-code
channels: [dashboard]
tools: [google-drive]`,
      "prompt.md": `You are {{agent_name}}, the content repurposing assistant for {{company_name}}.

For each piece of source content in {{content_source}}:
1. Identify the core message and key points.
2. Rewrite it into each of {{target_formats}}, matching a {{brand_voice}} voice.
3. If {{approval_required}} is true, save drafts for review rather than
   publishing directly.`,
      "tools.yaml": toolsYaml(["google-drive"]),
    },
    config_schema: {
      type: "object",
      required: ["agent_name", "content_source", "target_formats"],
      properties: {
        agent_name: { type: "string" },
        company_name: { type: "string" },
        content_source: { type: "string", description: "Where source content lives, e.g. a Drive folder" },
        target_formats: { type: "array", items: { type: "string" }, description: "e.g. ['LinkedIn post', 'newsletter blurb']" },
        brand_voice: { type: "string", default: "friendly and concise" },
        approval_required: { type: "boolean", default: true },
      },
    },
  },
  {
    key: "ops_appointment_rescheduler",
    name: "Appointment Rescheduler",
    category: "Operations",
    description: "Reads incoming reschedule requests, checks calendar availability, and proposes new appointment times.",
    objective:
      "Read incoming reschedule requests from {{request_channels}}, check {{calendar_source}} for availability, and propose new appointment times within {{business_hours}}.",
    default_channels: ["email", "chat"],
    required_tools: ["gmail", "google-calendar", "whatsapp-business"],
    default_runtime_model: "deepseek-ai/deepseek-v4-flash",
    est_tokens_per_task: 3000,
    template_files: {
      "agent.yaml": `name: "{{agent_name}}"
role: Operations — Appointment Rescheduling
objective: >
  Read incoming reschedule requests from {{request_channels}}, check
  {{calendar_source}} for availability, and propose new appointment times
  within {{business_hours}}.
runtime_model: deepseek-ai/deepseek-v4-flash
channels: [email, chat]
tools: [gmail, google-calendar, whatsapp-business]
escalation_contact: "{{escalation_contact}}"`,
      "prompt.md": `You are {{agent_name}}, the scheduling coordinator for {{company_name}}.

When a customer asks to reschedule via {{request_channels}}, check
{{calendar_source}} and propose up to {{max_options}} alternative times
inside {{business_hours}}. Never confirm a change without the customer's
explicit reply. Escalate to {{escalation_contact}} if no slot is found
within {{lookahead_days}} days.`,
      "tools.yaml": toolsYaml(["gmail", "google-calendar", "whatsapp-business"]),
    },
    config_schema: {
      type: "object",
      required: ["agent_name", "company_name", "calendar_source", "business_hours"],
      properties: {
        agent_name: { type: "string", description: "Display name for this agent" },
        company_name: { type: "string" },
        request_channels: { type: "array", items: { type: "string" }, description: "Where reschedule requests arrive" },
        calendar_source: { type: "string", description: "Calendar to check for availability" },
        business_hours: { type: "string", description: "e.g. '9am-6pm Mon-Fri'" },
        max_options: { type: "integer", default: 3 },
        lookahead_days: { type: "integer", default: 5 },
        escalation_contact: { type: "string" },
      },
    },
  },
  {
    key: "ops_inventory_alert",
    name: "Inventory Alert",
    category: "Operations",
    description: "Flags low stock items before they run out.",
    objective:
      "Check {{inventory_source}} against {{reorder_thresholds}} and alert {{alert_channel}} when stock falls below threshold.",
    default_channels: ["chat"],
    required_tools: ["google-drive", "slack"],
    default_runtime_model: "deepseek-ai/deepseek-v4-flash",
    est_tokens_per_task: 800,
    template_files: {
      "agent.yaml": `name: "{{agent_name}}"
role: Operations — Inventory Alerts
objective: >
  Check {{inventory_source}} against {{reorder_thresholds}} on a
  {{check_frequency}} basis and alert {{alert_channel}} when stock falls
  below threshold.
runtime_model: deepseek-ai/deepseek-v4-flash
channels: [chat]
tools: [google-drive, slack]`,
      "prompt.md": `You are {{agent_name}}, the inventory monitoring assistant for {{company_name}}.

On a {{check_frequency}} basis:
1. Read current stock levels from {{inventory_source}}.
2. Compare each item against {{reorder_thresholds}}.
3. If any item is below its threshold, post an alert to {{alert_channel}}
   naming the item and current quantity.`,
      "tools.yaml": toolsYaml(["google-drive", "slack"]),
    },
    config_schema: {
      type: "object",
      required: ["agent_name", "inventory_source", "reorder_thresholds", "alert_channel"],
      properties: {
        agent_name: { type: "string" },
        company_name: { type: "string" },
        inventory_source: { type: "string", description: "Where stock levels are tracked" },
        reorder_thresholds: { type: "object", description: "Map of item name to reorder threshold quantity" },
        alert_channel: { type: "string" },
        check_frequency: { type: "string", default: "daily" },
      },
    },
  },
  {
    key: "finance_invoice_followup",
    name: "Invoice Follow-Up",
    category: "Finance",
    description: "Chases overdue invoices with polite reminders.",
    objective:
      "Identify invoices overdue by {{overdue_days_threshold}} days in {{accounting_system}} and send reminders via {{reminder_channel}}.",
    default_channels: ["email"],
    required_tools: ["quickbooks", "gmail"],
    default_runtime_model: "deepseek-ai/deepseek-v4-flash",
    est_tokens_per_task: 2000,
    template_files: {
      "agent.yaml": `name: "{{agent_name}}"
role: Finance — Invoice Follow-Up
objective: >
  Identify invoices overdue by {{overdue_days_threshold}} days in
  {{accounting_system}} and send reminders via {{reminder_channel}}, up to
  {{max_reminders}} times before escalating.
runtime_model: deepseek-ai/deepseek-v4-flash
channels: [email]
tools: [quickbooks, gmail]
escalation_contact: "{{escalation_contact}}"`,
      "prompt.md": `You are {{agent_name}}, the invoice follow-up assistant for {{company_name}}.

On a regular basis:
1. Check {{accounting_system}} for invoices overdue by at least
   {{overdue_days_threshold}} days.
2. Send a polite reminder via {{reminder_channel}} referencing the invoice
   number and amount due.
3. After {{max_reminders}} reminders with no response, escalate to
   {{escalation_contact}} rather than sending further reminders.`,
      "tools.yaml": toolsYaml(["quickbooks", "gmail"]),
    },
    config_schema: {
      type: "object",
      required: ["agent_name", "accounting_system", "overdue_days_threshold", "reminder_channel"],
      properties: {
        agent_name: { type: "string" },
        company_name: { type: "string" },
        accounting_system: { type: "string" },
        overdue_days_threshold: { type: "integer", default: 14 },
        reminder_channel: { type: "string" },
        max_reminders: { type: "integer", default: 2 },
        escalation_contact: { type: "string" },
      },
    },
  },
  {
    key: "finance_expense_categorizer",
    name: "Expense Categorizer",
    category: "Finance",
    description: "Sorts expenses into the right categories automatically.",
    objective:
      "Classify transactions from {{accounting_system}} into {{category_list}}, flagging anything uncertain for {{reviewer}}.",
    default_channels: ["dashboard"],
    required_tools: ["quickbooks"],
    default_runtime_model: "deepseek-ai/deepseek-v4-flash",
    est_tokens_per_task: 700,
    template_files: {
      "agent.yaml": `name: "{{agent_name}}"
role: Finance — Expense Categorization
objective: >
  Classify transactions from {{accounting_system}} into {{category_list}},
  flagging anything uncertain for {{reviewer}}.
runtime_model: deepseek-ai/deepseek-v4-flash
channels: [dashboard]
tools: [quickbooks]`,
      "prompt.md": `You are {{agent_name}}, the expense categorization assistant for {{company_name}}.

For each new transaction in {{accounting_system}}:
1. Assign it to the best-matching category in {{category_list}}.
2. If no category is a confident match, leave it uncategorized and flag it
   for {{reviewer}} rather than guessing.`,
      "tools.yaml": toolsYaml(["quickbooks"]),
    },
    config_schema: {
      type: "object",
      required: ["agent_name", "accounting_system", "category_list", "reviewer"],
      properties: {
        agent_name: { type: "string" },
        company_name: { type: "string" },
        accounting_system: { type: "string" },
        category_list: { type: "array", items: { type: "string" } },
        reviewer: { type: "string" },
      },
    },
  },
  {
    key: "support_faq_responder",
    name: "FAQ Responder",
    category: "Support",
    description: "Answers common customer questions automatically.",
    objective:
      "Answer incoming questions via {{support_channels}} using {{faq_source}}, matching a {{tone}} tone, escalating to {{escalation_contact}} when unsure.",
    default_channels: ["email", "chat"],
    required_tools: ["gmail", "whatsapp-business"],
    default_runtime_model: "openai/gpt-oss-120b",
    est_tokens_per_task: 600,
    template_files: {
      "agent.yaml": `name: "{{agent_name}}"
role: Support — FAQ Responses
objective: >
  Answer incoming questions via {{support_channels}} using {{faq_source}},
  matching a {{tone}} tone, escalating to {{escalation_contact}} when
  unsure.
runtime_model: openai/gpt-oss-120b
channels: [email, chat]
tools: [gmail, whatsapp-business]
escalation_contact: "{{escalation_contact}}"`,
      "prompt.md": `You are {{agent_name}}, the customer support assistant for {{company_name}}.

For each incoming question via {{support_channels}}:
1. Check {{faq_source}} for a matching answer.
2. Reply in a {{tone}} tone, using the customer's own wording where helpful.
3. If no confident match exists, do not guess — escalate to
   {{escalation_contact}} instead.`,
      "tools.yaml": toolsYaml(["gmail", "whatsapp-business"]),
    },
    config_schema: {
      type: "object",
      required: ["agent_name", "faq_source", "escalation_contact"],
      properties: {
        agent_name: { type: "string" },
        company_name: { type: "string" },
        support_channels: { type: "array", items: { type: "string" } },
        faq_source: { type: "string", description: "Where FAQ content lives" },
        tone: { type: "string", default: "friendly and concise" },
        escalation_contact: { type: "string" },
      },
    },
  },
];

async function main() {
  const insertedKeys: string[] = [];

  for (const template of TEMPLATES) {
    const row = await insertRow<{ key: string }>("agent_templates", template);
    insertedKeys.push(row.key);
  }

  console.log(JSON.stringify({ count: insertedKeys.length, keys: insertedKeys }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// A standalone script, not a module — but tsconfig includes **/*.ts, so
// without this the top-level `const url`, `serviceRoleKey` and `REST_URL` in
// each seed script land in one shared global scope and collide with each
// other. `export {}` makes the file a module and gives it its own scope.
export {};
