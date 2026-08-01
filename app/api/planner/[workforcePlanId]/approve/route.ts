import { NextResponse } from "next/server";
import { withPlannerErrors } from "@/lib/server/planner/http";
import { PlannerError } from "@/lib/server/planner/errors";
import { agentConfigs, workforcePlans } from "@/lib/server/planner/db";

const READY_STATUSES = new Set(["configured", "ready"]);

/** Approve a workforce plan — blocks unless every agent is configured/ready. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ workforcePlanId: string }> }
) {
  return withPlannerErrors(async () => {
    const { workforcePlanId } = await params;

    const plan = await workforcePlans.get(workforcePlanId);
    if (!plan) throw new PlannerError(404, "Workforce plan not found.");

    const agents = await agentConfigs.listActiveByPlan(workforcePlanId);
    if (agents.length === 0) throw new PlannerError(400, "Plan has no agents.");

    const blockers = agents.filter((a) => !READY_STATUSES.has(a.status));
    if (blockers.length > 0) {
      throw new PlannerError(
        400,
        `Cannot approve — ${blockers.length} agent(s) are not ready: ` +
          blockers.map((a) => `${a.agent_key} (${a.status})`).join(", ")
      );
    }

    const updated = await workforcePlans.update(workforcePlanId, {
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: "pending-auth",
    });

    const requiredTools = Array.from(
      new Set(agents.flatMap((a) => a.required_tools ?? []))
    );

    return NextResponse.json({ plan: updated, requiredTools });
  });
}
