import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withPlannerErrors } from "@/lib/server/planner/http";
import { PlannerError } from "@/lib/server/planner/errors";
import { agentConfigs } from "@/lib/server/planner/db";

/** Personalize a proposed agent: merges arbitrary config fields, marks it configured. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentConfigId: string }> }
) {
  return withPlannerErrors(async () => {
    const { agentConfigId } = await params;
    const patch = (await req.json()) as Record<string, unknown>;

    const agent = await agentConfigs.get(agentConfigId);
    if (!agent) throw new PlannerError(404, "Agent config not found.");
    if (agent.archived_at) throw new PlannerError(404, "This agent has been removed from the plan.");

    if (agent.status !== "needs_configuration") {
      if (agent.status === "needs_information") {
        throw new PlannerError(
          400,
          `Agent "${agent.agent_key}" is a custom agent awaiting a design call, not configuration yet (current status: needs_information).`
        );
      }
      throw new PlannerError(
        400,
        `Agent "${agent.agent_key}" is not awaiting configuration (current status: ${agent.status}).`
      );
    }

    const mergedConfig = { ...(agent.config ?? {}), ...patch };
    const updated = await agentConfigs.update(agentConfigId, {
      config: mergedConfig,
      status: "configured",
    });

    return NextResponse.json({ agent: updated });
  });
}
