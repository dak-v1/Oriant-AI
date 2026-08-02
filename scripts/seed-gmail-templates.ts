/**
 * scripts/seed-gmail-templates.ts — two presets the connected account can run.
 *
 * One-off dev seed, same pattern and same table as seed-agent-templates.ts:
 * additive rows in `agent_templates`, inserted through PostgREST with the
 * service key, idempotent by `key` (an existing row is left untouched and
 * reported, never overwritten — the catalogue may have been edited since).
 *
 * WHY THESE TWO EXIST. The catalogue's nearest presets could not be used for
 * the owner's spec: `support_faq_responder` requires whatsapp-business and
 * `marketing_campaign_reporter` requires google-drive + slack. The only
 * Composio connections this deployment actually has are gmail and
 * google-calendar, so a plan built from those presets wedges the integrations
 * gate on tools that can never connect — exactly the wall the owner hit. The
 * plan-chat can only add agents FROM the catalogue (a custom add lands with
 * required_tools: [], which is worse: a plan claiming its agents need nothing),
 * so the honest fix is two presets whose requirements are the truth.
 *
 * Run with:
 *   npx dotenv -e .env -- npx tsx scripts/seed-gmail-templates.ts
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment."
  );
}

const REST_URL = `${url.replace(/\/$/, "")}/rest/v1`;

async function rows<T>(table: string, query: string): Promise<T[]> {
  const res = await fetch(`${REST_URL}/${table}?${query}`, {
    headers: { apikey: serviceRoleKey!, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!res.ok) throw new Error(`Read ${table} failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as T[];
}

async function insertRow(table: string, row: Record<string, unknown>): Promise<void> {
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
  if (!res.ok) throw new Error(`Insert into ${table} failed (${res.status}): ${await res.text()}`);
}

type TemplateRow = {
  key: string;
  name: string;
  category: string;
  description: string;
  objective: string;
  default_channels: string[];
  required_tools: string[];
  est_tokens_per_task: number;
  config_schema: Record<string, unknown>;
  template_files: Record<string, string>;
  default_runtime_model: string;
};

const TEMPLATES: TemplateRow[] = [
  {
    key: "support_helpdesk_gmail",
    name: "Helpdesk Agent",
    category: "Support",
    description:
      "Watches the Gmail inbox for customer questions and prepares reply drafts for owner approval. Needs Gmail and nothing else.",
    objective:
      "Read incoming customer questions from Gmail every few minutes and draft a {{tone}} reply for each, pausing for the owner's approval before anything is sent. Escalate to {{escalation_contact}} when unsure.",
    default_channels: ["email"],
    // The whole point of this preset: gmail alone. A helpdesk that demands a
    // second channel is a helpdesk the owner cannot activate.
    required_tools: ["gmail"],
    est_tokens_per_task: 900,
    config_schema: {
      fields: [
        { key: "tone", label: "Reply tone", type: "select", options: ["friendly", "formal", "concise"], default: "friendly" },
        { key: "escalation_contact", label: "Escalate to", type: "text", default: "the owner" },
      ],
    },
    template_files: {
      "prompt.md":
        "You are {{agent_name}}, the helpdesk assistant for {{company_name}}.\n\n" +
        "Every few minutes you are handed the unread questions from the Gmail inbox.\n" +
        "For each genuine customer question:\n" +
        "1. Draft a {{tone}} reply grounded in the thread's own content.\n" +
        "2. Never send anything yourself — every reply waits for the owner's approval.\n" +
        "3. If a question is unclear or sensitive, note it for {{escalation_contact}} instead of guessing.\n" +
        "If nothing needs a reply, say so and finish.",
    },
    default_runtime_model: "deepseek-ai/deepseek-v4-pro",
  },
  {
    key: "marketing_campaign_gmail",
    name: "Marketing Agent",
    category: "Marketing",
    description:
      "Reads the campaign schedule from Google Calendar and sends the day's ad emails through Gmail, each send pausing for owner approval. Needs Gmail and Google Calendar only.",
    objective:
      "Each morning, read today's campaign entries from Google Calendar, compose the ad email for each in a {{tone}} voice, and queue it for the owner's approval before it is sent through Gmail.",
    default_channels: ["email"],
    // Gmail to send, the calendar to know what to send and when. Nothing else,
    // for the same reason as the helpdesk preset above.
    required_tools: ["gmail", "google-calendar"],
    est_tokens_per_task: 1200,
    config_schema: {
      fields: [
        { key: "tone", label: "Campaign voice", type: "select", options: ["playful", "professional", "urgent"], default: "professional" },
      ],
    },
    template_files: {
      "prompt.md":
        "You are {{agent_name}}, the marketing assistant for {{company_name}}.\n\n" +
        "Each run you are handed today's campaign entries from Google Calendar.\n" +
        "For each scheduled campaign:\n" +
        "1. Compose the ad email in a {{tone}} voice from the entry's title and notes.\n" +
        "2. Queue the send for the owner's approval — nothing goes out on your own authority.\n" +
        "If the calendar holds no campaign today, say so and finish.",
    },
    default_runtime_model: "deepseek-ai/deepseek-v4-pro",
  },
];

async function main(): Promise<void> {
  for (const template of TEMPLATES) {
    const existing = await rows<{ key: string }>(
      "agent_templates",
      `key=eq.${template.key}&select=key`
    );
    if (existing.length > 0) {
      console.log(`= ${template.key} already present — left untouched`);
      continue;
    }
    await insertRow("agent_templates", template as unknown as Record<string, unknown>);
    console.log(`+ ${template.key} inserted (${template.required_tools.join(", ")})`);
  }
  console.log("done");
}

void main();
