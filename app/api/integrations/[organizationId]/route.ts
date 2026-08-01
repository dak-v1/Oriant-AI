import { NextResponse } from "next/server";
import { withPlannerErrors } from "@/lib/server/planner/http";
import { PlannerError } from "@/lib/server/planner/errors";
import { workforcePlans, agentConfigs, integrationConnections } from "@/lib/server/planner/db";

interface ToolSummary {
  toolKey: string;
  status: string;
  provider: string | null;
  neededByAgents: string[];
}

/** What this org's approved plan needs connected, and the current status of each. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ organizationId: string }> }
) {
  return withPlannerErrors(async () => {
    const { organizationId } = await params;

    const plans = await workforcePlans.listByOrganization(organizationId);
    const plan = plans.find((p) => p.status === "approved");
    if (!plan) {
      throw new PlannerError(404, "No approved workforce plan for this organization.");
    }

    const activeAgents = await agentConfigs.listActiveByPlan(plan.id);
    const connections = await integrationConnections.listByOrg(organizationId);
    const connectionByTool = new Map(connections.map((c) => [c.tool_key, c]));

    // Best-effort display-name lookup — plan.plan.agents is the static
    // snapshot from the original /generate call; agents added later via the
    // refinement chat's "add" diffOp never get an entry appended there, so
    // those fall back to their raw agent_key rather than a friendly name.
    const proposals = (plan.plan as { agents?: unknown[] } | null)?.agents ?? [];
    const nameByAgentKey = new Map(
      (proposals as { agentKey?: string; name?: string }[])
        .filter((p) => p.agentKey && p.name)
        .map((p) => [p.agentKey as string, p.name as string])
    );

    const toolMap = new Map<string, ToolSummary>();
    for (const agent of activeAgents) {
      const agentName = nameByAgentKey.get(agent.agent_key) ?? agent.agent_key;
      for (const toolKey of agent.required_tools ?? []) {
        let summary = toolMap.get(toolKey);
        if (!summary) {
          const connection = connectionByTool.get(toolKey);
          summary = {
            toolKey,
            status: connection?.status ?? "not_connected",
            provider: connection?.provider ?? null,
            neededByAgents: [],
          };
          toolMap.set(toolKey, summary);
        }
        summary.neededByAgents.push(agentName);
      }
    }

    return NextResponse.json({ plan, tools: Array.from(toolMap.values()) });
  });
}
