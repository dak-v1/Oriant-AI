import { NextResponse } from "next/server";
import { withPlannerErrors } from "@/lib/server/planner/http";
import { PlannerError } from "@/lib/server/planner/errors";
import { roleCHandoffs } from "@/lib/server/planner/db";

/** Read the handoff Person C's system consumes for this plan — read-only, does not mutate status. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ workforcePlanId: string }> }
) {
  return withPlannerErrors(async () => {
    const { workforcePlanId } = await params;

    const [handoff] = await roleCHandoffs.listByPlan(workforcePlanId);
    if (!handoff) {
      throw new PlannerError(404, "No handoff has been finalized for this plan yet.");
    }

    return NextResponse.json({ handoff });
  });
}
