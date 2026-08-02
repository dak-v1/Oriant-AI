import { NextResponse } from "next/server";
import { withPlannerErrors } from "@/lib/server/planner/http";
import { PlannerError } from "@/lib/server/planner/errors";
import { workforcePlans, agentConfigs, workforcePlanSnapshots } from "@/lib/server/planner/db";
import { restoreFromSnapshot } from "@/lib/server/planner/snapshots";

/**
 * Redo — restores from the snapshot one version forward. That snapshot only
 * ever exists because a prior /undo preserved it (see snapshots.ts); a 404
 * here is expected right after a fresh mutation truncated the forward
 * stack, per /chat/apply's redo-stack-truncation step.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ workforcePlanId: string }> }
) {
  return withPlannerErrors(async () => {
    const { workforcePlanId } = await params;

    const plan = await workforcePlans.get(workforcePlanId);
    if (!plan) throw new PlannerError(404, "Workforce plan not found.");

    const targetVersion = plan.current_version + 1;
    const targetSnapshot = await workforcePlanSnapshots.getByVersion(workforcePlanId, targetVersion);
    if (!targetSnapshot) {
      throw new PlannerError(404, `No snapshot exists at version ${targetVersion} — nothing to redo.`);
    }

    await restoreFromSnapshot(workforcePlanId, targetSnapshot);

    const updatedPlan = await workforcePlans.update(workforcePlanId, {
      plan: targetSnapshot.plan_snapshot,
      current_version: targetVersion,
    });

    const agents = await agentConfigs.listActiveByPlan(workforcePlanId);
    return NextResponse.json({ plan: updatedPlan, agents });
  });
}
