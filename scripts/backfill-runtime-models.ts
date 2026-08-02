/**
 * One-off dev backfill script. NOT part of the app — nothing imports this
 * file, and it does not import from app/api/plan/* or
 * lib/server/orchestrator.ts. Standalone raw-fetch pattern, same as
 * scripts/seed-test-org.ts / scripts/seed-agent-templates.ts.
 *
 * Run with:
 *   npx dotenv -e .env.local -- npx tsx scripts/backfill-runtime-models.ts
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment."
  );
}

const REST_URL = `${url.replace(/\/$/, "")}/rest/v1`;
const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json",
};

const DEFAULT_CUSTOM_RUNTIME_MODEL = "zai-org/glm-5.2";

interface AgentConfigRow {
  id: string;
  agent_key: string;
  agent_type: string;
  template_id: string | null;
  runtime_model: string | null;
}

interface AgentTemplateRow {
  id: string;
  default_runtime_model: string | null;
}

async function get<T>(path: string): Promise<T[]> {
  const res = await fetch(`${REST_URL}/${path}`, { headers });
  if (!res.ok) throw new Error(`GET ${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function patchRuntimeModel(id: string, runtimeModel: string): Promise<void> {
  const res = await fetch(`${REST_URL}/agent_configs?id=eq.${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ runtime_model: runtimeModel }),
  });
  if (!res.ok) throw new Error(`PATCH agent_configs ${id} failed (${res.status}): ${await res.text()}`);
}

async function main() {
  const nullRows = await get<AgentConfigRow>("agent_configs?runtime_model=is.null&select=*");
  const templates = await get<AgentTemplateRow>("agent_templates?select=id,default_runtime_model");
  const templateById = new Map(templates.map((t) => [t.id, t]));

  const updated: { id: string; agentKey: string; runtimeModel: string }[] = [];

  for (const row of nullRows) {
    const template = row.template_id ? templateById.get(row.template_id) : undefined;
    const runtimeModel = template?.default_runtime_model ?? DEFAULT_CUSTOM_RUNTIME_MODEL;
    await patchRuntimeModel(row.id, runtimeModel);
    updated.push({ id: row.id, agentKey: row.agent_key, runtimeModel });
  }

  console.log(JSON.stringify({ count: updated.length, updated }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
