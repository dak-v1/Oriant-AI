/**
 * Builds the payload handed off to Person C's downstream system once a
 * workforce plan is approved and every required tool is connected.
 *
 * Deliberately independent of lib/server/discovery-handoff.ts — that file
 * assembles role_b_handoffs.payload from the legacy orchestrator-adjacent
 * Db type, which this backend never imports from.
 */
import type {
  AgentConfigExt,
  IntegrationConnection,
  OrganizationRow,
  WorkforcePlanRow,
} from "./types";

/** Union of every tool a plan's active agents require, deduped. */
export function dedupeRequiredTools(agents: AgentConfigExt[]): string[] {
  return Array.from(new Set(agents.flatMap((a) => a.required_tools ?? [])));
}

export interface WorkforceHandoffPayload {
  handoff_type: "workforce_plan";
  generated_at: string;
  organization: { id: string; external_key: string; name: string };
  workforce_plan: {
    id: string;
    version: number;
    current_version: number;
    status: string;
    plan: Record<string, unknown>;
    approved_by?: string | null;
    approved_at?: string | null;
  };
  agents: Array<{
    agent_key: string;
    agent_type: string;
    template_id?: string;
    status: string;
    config: Record<string, unknown>;
    runtime_model?: string;
    required_tools: string[];
  }>;
  integrations: Array<{
    tool_key: string;
    provider: string;
    status: string;
    external_connection_id?: string;
    connected_at?: string;
  }>;
}

export function buildWorkforceHandoffPayload(params: {
  organization: OrganizationRow;
  plan: WorkforcePlanRow;
  agents: AgentConfigExt[];
  connections: IntegrationConnection[];
}): WorkforceHandoffPayload {
  const { organization, plan, agents, connections } = params;

  return {
    handoff_type: "workforce_plan",
    generated_at: new Date().toISOString(),
    organization: {
      id: organization.id,
      external_key: organization.external_key,
      name: organization.name,
    },
    workforce_plan: {
      id: plan.id,
      version: plan.version,
      current_version: plan.current_version,
      status: plan.status,
      plan: plan.plan,
      approved_by: plan.approved_by,
      approved_at: plan.approved_at,
    },
    agents: agents.map((a) => ({
      agent_key: a.agent_key,
      agent_type: a.agent_type,
      template_id: a.template_id,
      status: a.status,
      config: a.config,
      runtime_model: a.runtime_model,
      required_tools: a.required_tools ?? [],
    })),
    integrations: connections.map((c) => ({
      tool_key: c.tool_key,
      provider: c.provider,
      status: c.status,
      external_connection_id: c.external_connection_id,
      connected_at: c.connected_at,
    })),
  };
}
