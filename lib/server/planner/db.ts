/**
 * Data-access layer for the Person B planner/integrations backend.
 *
 * Raw fetch() against the PostgREST API — same pattern as
 * scripts/seed-test-org.ts — rather than @supabase/supabase-js. That SDK's
 * createClient() unconditionally spins up a realtime client that requires a
 * native WebSocket global, which isn't available in this repo's Node
 * version; we only need plain REST calls, so raw fetch avoids that
 * dependency entirely.
 *
 * Deliberately independent of app/api/plan/* and lib/server/orchestrator.ts —
 * nothing here imports from either, and there's no lifecycle/versioning/gate
 * logic here (that's out of scope for this layer).
 */

import type {
  AgentTemplate,
  AgentConfigExt,
  IntegrationConnection,
  RoleCHandoff,
  AgentDesignSession,
  AgentDesignTurn,
  PlanChangeRequest,
  OrganizationRow,
  OnboardingSessionRow,
  RoleBHandoffRow,
  CompanyReportRow,
  WorkforcePlanRow,
  WorkforcePlanSnapshotRow,
} from "./types";

function restConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment."
    );
  }
  return {
    baseUrl: `${url.replace(/\/$/, "")}/rest/v1`,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
  };
}

async function pgGet<T>(path: string): Promise<T[]> {
  const { baseUrl, headers } = restConfig();
  const res = await fetch(`${baseUrl}/${path}`, { headers });
  if (!res.ok) {
    throw new Error(`GET ${path} failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

async function pgInsert<T>(table: string, row: Record<string, unknown>): Promise<T> {
  const { baseUrl, headers } = restConfig();
  const res = await fetch(`${baseUrl}/${table}`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(`Insert into ${table} failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as T[];
  return data[0];
}

async function pgUpdate<T>(
  table: string,
  id: string,
  patch: Record<string, unknown>
): Promise<T> {
  const { baseUrl, headers } = restConfig();
  const res = await fetch(`${baseUrl}/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(`Update ${table} failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as T[];
  return data[0];
}

async function pgDelete(table: string, id: string): Promise<void> {
  const { baseUrl, headers } = restConfig();
  const res = await fetch(`${baseUrl}/${table}?id=eq.${id}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) {
    throw new Error(`Delete from ${table} failed (${res.status}): ${await res.text()}`);
  }
}

/** Delete-by-filter, for cases where the condition isn't a single id (e.g. redo-stack truncation). */
async function pgDeleteWhere(path: string): Promise<void> {
  const { baseUrl, headers } = restConfig();
  const res = await fetch(`${baseUrl}/${path}`, { method: "DELETE", headers });
  if (!res.ok) {
    throw new Error(`Delete ${path} failed (${res.status}): ${await res.text()}`);
  }
}

// ── targeted getters ─────────────────────────────────────────────────────────

export async function getOrganization(id: string): Promise<OrganizationRow | null> {
  const rows = await pgGet<OrganizationRow>(`organizations?id=eq.${id}&select=*`);
  return rows[0] ?? null;
}

export async function getOnboardingSession(
  id: string
): Promise<OnboardingSessionRow | null> {
  const rows = await pgGet<OnboardingSessionRow>(
    `onboarding_sessions?id=eq.${id}&select=*`
  );
  return rows[0] ?? null;
}

export async function getRoleBHandoff(sessionId: string): Promise<RoleBHandoffRow | null> {
  const rows = await pgGet<RoleBHandoffRow>(
    `role_b_handoffs?session_id=eq.${sessionId}&select=*`
  );
  return rows[0] ?? null;
}

/** Reverse lookup by the handoff's own id — getRoleBHandoff() above looks up by session_id instead. */
export async function getRoleBHandoffById(id: string): Promise<RoleBHandoffRow | null> {
  const rows = await pgGet<RoleBHandoffRow>(`role_b_handoffs?id=eq.${id}&select=*`);
  return rows[0] ?? null;
}

/**
 * Latest APPROVED company report for a session. Same read pattern as
 * hydrateDiscoveryFromSupabase in lib/server/onboarding-supabase.ts (order
 * by version desc, limit 1), plus an explicit status=approved filter since
 * that function itself takes the latest version regardless of status and we
 * specifically want the approved one here.
 */
export async function getApprovedCompanyReport(
  sessionId: string
): Promise<CompanyReportRow | null> {
  const rows = await pgGet<CompanyReportRow>(
    `company_reports?session_id=eq.${sessionId}&status=eq.approved&order=version.desc&limit=1&select=*`
  );
  return rows[0] ?? null;
}

/**
 * Reads the canonical tool-id list off a role_b_handoffs payload. In the
 * real buildDiscoveryHandoff() output (lib/server/discovery-handoff.ts),
 * structured_findings.workflow_summary.tools and
 * raw_inputs.onboarding.selected_tools are the exact same array — but since
 * `payload` is a jsonb blob that may also hold legacy or manually-seeded
 * rows, this reads defensively rather than trusting the type alone.
 */
export function getCanonicalToolIds(payload: unknown): string[] {
  const p = payload as {
    structured_findings?: { workflow_summary?: { tools?: unknown } };
    raw_inputs?: { onboarding?: { selected_tools?: unknown } };
  } | null | undefined;

  const fromStructured = p?.structured_findings?.workflow_summary?.tools;
  if (Array.isArray(fromStructured)) return fromStructured;

  const fromRaw = p?.raw_inputs?.onboarding?.selected_tools;
  if (Array.isArray(fromRaw)) return fromRaw;

  return [];
}

export const workforcePlans = {
  get: (id: string) =>
    pgGet<WorkforcePlanRow>(`workforce_plans?id=eq.${id}&select=*`).then((r) => r[0] ?? null),
  listByHandoff: (roleBHandoffId: string) =>
    pgGet<WorkforcePlanRow>(
      `workforce_plans?role_b_handoff_id=eq.${roleBHandoffId}&select=*&order=version.desc`
    ),
  create: (row: Partial<WorkforcePlanRow>) => pgInsert<WorkforcePlanRow>("workforce_plans", row),
  update: (id: string, patch: Partial<WorkforcePlanRow>) =>
    pgUpdate<WorkforcePlanRow>("workforce_plans", id, patch),
  remove: (id: string) => pgDelete("workforce_plans", id),
};

// ── basic CRUD stubs for the 6 new tables ───────────────────────────────────

export const agentTemplates = {
  get: (id: string) =>
    pgGet<AgentTemplate>(`agent_templates?id=eq.${id}&select=*`).then((r) => r[0] ?? null),
  list: () => pgGet<AgentTemplate>("agent_templates?select=*"),
  create: (row: Partial<AgentTemplate>) => pgInsert<AgentTemplate>("agent_templates", row),
  update: (id: string, patch: Partial<AgentTemplate>) =>
    pgUpdate<AgentTemplate>("agent_templates", id, patch),
  remove: (id: string) => pgDelete("agent_templates", id),
};

export const agentConfigs = {
  get: (id: string) =>
    pgGet<AgentConfigExt>(`agent_configs?id=eq.${id}&select=*`).then((r) => r[0] ?? null),
  /** ALL rows for a plan, including archived — needed by undo/redo restoration and /chat/apply's "un-archive on add" lookup. */
  listByPlan: (workforcePlanId: string) =>
    pgGet<AgentConfigExt>(`agent_configs?workforce_plan_id=eq.${workforcePlanId}&select=*`),
  /** Active (non-archived) rows only — the "current agents for a plan" getter used by generate/configure/approve/cost-estimate/chat. */
  listActiveByPlan: (workforcePlanId: string) =>
    pgGet<AgentConfigExt>(
      `agent_configs?workforce_plan_id=eq.${workforcePlanId}&archived_at=is.null&select=*`
    ),
  create: (row: Partial<AgentConfigExt>) => pgInsert<AgentConfigExt>("agent_configs", row),
  update: (id: string, patch: Partial<AgentConfigExt>) =>
    pgUpdate<AgentConfigExt>("agent_configs", id, patch),
  remove: (id: string) => pgDelete("agent_configs", id),
};

export const integrationConnections = {
  get: (id: string) =>
    pgGet<IntegrationConnection>(`integration_connections?id=eq.${id}&select=*`).then(
      (r) => r[0] ?? null
    ),
  listByOrg: (organizationId: string) =>
    pgGet<IntegrationConnection>(
      `integration_connections?organization_id=eq.${organizationId}&select=*`
    ),
  create: (row: Partial<IntegrationConnection>) =>
    pgInsert<IntegrationConnection>("integration_connections", row),
  update: (id: string, patch: Partial<IntegrationConnection>) =>
    pgUpdate<IntegrationConnection>("integration_connections", id, patch),
  remove: (id: string) => pgDelete("integration_connections", id),
};

export const roleCHandoffs = {
  get: (id: string) =>
    pgGet<RoleCHandoff>(`role_c_handoffs?id=eq.${id}&select=*`).then((r) => r[0] ?? null),
  listByPlan: (workforcePlanId: string) =>
    pgGet<RoleCHandoff>(`role_c_handoffs?workforce_plan_id=eq.${workforcePlanId}&select=*`),
  create: (row: Partial<RoleCHandoff>) => pgInsert<RoleCHandoff>("role_c_handoffs", row),
  update: (id: string, patch: Partial<RoleCHandoff>) =>
    pgUpdate<RoleCHandoff>("role_c_handoffs", id, patch),
  remove: (id: string) => pgDelete("role_c_handoffs", id),
};

export const agentDesignSessions = {
  get: (id: string) =>
    pgGet<AgentDesignSession>(`agent_design_sessions?id=eq.${id}&select=*`).then(
      (r) => r[0] ?? null
    ),
  listByAgentConfig: (agentConfigId: string) =>
    pgGet<AgentDesignSession>(
      `agent_design_sessions?agent_config_id=eq.${agentConfigId}&select=*`
    ),
  create: (row: Partial<AgentDesignSession>) =>
    pgInsert<AgentDesignSession>("agent_design_sessions", row),
  update: (id: string, patch: Partial<AgentDesignSession>) =>
    pgUpdate<AgentDesignSession>("agent_design_sessions", id, patch),
  remove: (id: string) => pgDelete("agent_design_sessions", id),
};

export const agentDesignTurns = {
  get: (id: string) =>
    pgGet<AgentDesignTurn>(`agent_design_turns?id=eq.${id}&select=*`).then(
      (r) => r[0] ?? null
    ),
  listBySession: (designSessionId: string) =>
    pgGet<AgentDesignTurn>(
      `agent_design_turns?design_session_id=eq.${designSessionId}&select=*&order=created_at.asc`
    ),
  create: (row: Partial<AgentDesignTurn>) =>
    pgInsert<AgentDesignTurn>("agent_design_turns", row),
  update: (id: string, patch: Partial<AgentDesignTurn>) =>
    pgUpdate<AgentDesignTurn>("agent_design_turns", id, patch),
  remove: (id: string) => pgDelete("agent_design_turns", id),
};

export const workforcePlanSnapshots = {
  getByVersion: (workforcePlanId: string, version: number) =>
    pgGet<WorkforcePlanSnapshotRow>(
      `workforce_plan_snapshots?workforce_plan_id=eq.${workforcePlanId}&version=eq.${version}&select=*`
    ).then((r) => r[0] ?? null),
  create: (row: Partial<WorkforcePlanSnapshotRow>) =>
    pgInsert<WorkforcePlanSnapshotRow>("workforce_plan_snapshots", row),
  /** Redo-stack truncation: delete every snapshot past a given version, not a single row. */
  deleteVersionsGreaterThan: (workforcePlanId: string, version: number) =>
    pgDeleteWhere(`workforce_plan_snapshots?workforce_plan_id=eq.${workforcePlanId}&version=gt.${version}`),
};

export const planChangeRequests = {
  get: (id: string) =>
    pgGet<PlanChangeRequest>(`plan_change_requests?id=eq.${id}&select=*`).then(
      (r) => r[0] ?? null
    ),
  listByPlan: (workforcePlanId: string) =>
    pgGet<PlanChangeRequest>(
      `plan_change_requests?workforce_plan_id=eq.${workforcePlanId}&select=*&order=created_at.desc`
    ),
  create: (row: Partial<PlanChangeRequest>) =>
    pgInsert<PlanChangeRequest>("plan_change_requests", row),
  update: (id: string, patch: Partial<PlanChangeRequest>) =>
    pgUpdate<PlanChangeRequest>("plan_change_requests", id, patch),
  remove: (id: string) => pgDelete("plan_change_requests", id),
};
