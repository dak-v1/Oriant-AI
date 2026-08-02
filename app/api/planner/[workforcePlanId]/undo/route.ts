import { NextResponse } from "next/server";
import { withPlannerErrors } from "@/lib/server/planner/http";
import { PlannerError } from "@/lib/server/planner/errors";
import { workforcePlans, agentConfigs, workforcePlanSnapshots } from "@/lib/server/planner/db";
import { ensureSnapshot, restoreFromSnapshot } from "@/lib/server/planner/snapshots";

/** Undo the last applied change — restores from the snapshot one version back. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ workforcePlanId: string }> }
) {
  return withPlannerErrors(async () => {
    const { workforcePlanId } = await params;

    const plan = await workforcePlans.get(workforcePlanId);
    if (!plan) throw new PlannerError(404, "Workforce plan not found.");

    const targetVersion = plan.current_version - 1;
    const targetSnapshot = await workforcePlanSnapshots.getByVersion(workforcePlanId, targetVersion);
    if (!targetSnapshot) {
      throw new PlannerError(404, `No snapshot exists at version ${targetVersion} — nothing to undo.`);
    }

    // Preserve the state we're undoing AWAY from, so a later /redo can find
    // it — see the plan file's note on why /undo must do this even though
    // it isn't in the literal spec: without it, redo can never succeed in
    // the common case (undo immediately after a mutation, no new mutation
    // applied since).
    await ensureSnapshot(workforcePlanId, plan.current_version);

    await restoreFromSnapshot(workforcePlanId, targetSnapshot);

    const updatedPlan = await workforcePlans.update(workforcePlanId, {
      plan: targetSnapshot.plan_snapshot,
      current_version: targetVersion,
    });

    const agents = await agentConfigs.listActiveByPlan(workforcePlanId);
    return NextResponse.json({ plan: updatedPlan, agents });
  });
}
