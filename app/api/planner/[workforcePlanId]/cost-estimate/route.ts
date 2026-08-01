import { NextResponse } from "next/server";
import { withPlannerErrors } from "@/lib/server/planner/http";
import { estimatePlanCost } from "@/lib/server/planner/cost";

/** Cost estimate for a workforce plan. Works on draft or approved plans alike. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ workforcePlanId: string }> }
) {
  return withPlannerErrors(async () => {
    const { workforcePlanId } = await params;
    const result = await estimatePlanCost(workforcePlanId);
    return NextResponse.json(result);
  });
}
