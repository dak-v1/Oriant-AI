import { NextResponse } from "next/server";
import { withPlannerErrors } from "@/lib/server/planner/http";
import { PlannerError } from "@/lib/server/planner/errors";
import {
  agentConfigs,
  workforcePlans,
  getRoleBHandoffById,
  getApprovedCompanyReport,
  agentDesignSessions,
} from "@/lib/server/planner/db";
import { proposeOpeningQuestions } from "@/lib/server/planner/design-call";
import type { CompanyReport } from "@/lib/contracts";

/** Best-effort — every hop here can legitimately come back empty (no FK backs any of it). */
async function gatherAgentContext(
  workforcePlanId: string,
  agentKey: string
): Promise<{ name?: string; reasoning?: string; report?: CompanyReport | null }> {
  const plan = await workforcePlans.get(workforcePlanId);
  if (!plan) return {};

  const agents = (plan.plan as { agents?: unknown[] } | null)?.agents;
  const proposal = Array.isArray(agents)
    ? (agents.find((a) => (a as { agentKey?: string }).agentKey === agentKey) as
        | { name?: string; reasoning?: string }
        | undefined)
    : undefined;

  const handoff = await getRoleBHandoffById(plan.role_b_handoff_id);
  if (!handoff) return { name: proposal?.name, reasoning: proposal?.reasoning };

  const reportRow = await getApprovedCompanyReport(handoff.session_id);
  return { name: proposal?.name, reasoning: proposal?.reasoning, report: reportRow?.report ?? null };
}

/** Begin a design call for a custom agent: creates the session, returns opening questions. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ agentConfigId: string }> }
) {
  return withPlannerErrors(async () => {
    const { agentConfigId } = await params;

    const agent = await agentConfigs.get(agentConfigId);
    if (!agent) throw new PlannerError(404, "Agent config not found.");

    if (agent.agent_type !== "custom") {
      throw new PlannerError(
        400,
        `Agent "${agent.agent_key}" is a preset agent — design calls are only for custom agents.`
      );
    }
    if (agent.status !== "needs_information") {
      throw new PlannerError(
        400,
        `Agent "${agent.agent_key}" is not awaiting a design call (current status: ${agent.status}).`
      );
    }

    const inProgress = (await agentDesignSessions.listByAgentConfig(agentConfigId)).find(
      (s) => s.status === "in_progress"
    );
    if (inProgress) {
      throw new PlannerError(
        409,
        `A design call is already in progress for this agent (session id: ${inProgress.id}).`
      );
    }

    const session = await agentDesignSessions.create({
      agent_config_id: agentConfigId,
      status: "in_progress",
    });

    const context = await gatherAgentContext(agent.workforce_plan_id, agent.agent_key);

    const questions = await proposeOpeningQuestions({
      agentConfigId,
      agentName: context.name ?? agent.agent_key,
      agentKey: agent.agent_key,
      proposalReasoning: context.reasoning,
      report: context.report,
    });

    return NextResponse.json({ sessionId: session.id, questions });
  });
}
