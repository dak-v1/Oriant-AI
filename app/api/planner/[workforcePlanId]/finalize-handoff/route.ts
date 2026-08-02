import { NextResponse } from "next/server";
import { withPlannerErrors } from "@/lib/server/planner/http";
import { PlannerError } from "@/lib/server/planner/errors";
import {
  agentConfigs,
  getOrganization,
  integrationConnections,
  roleCHandoffs,
  workforcePlans,
} from "@/lib/server/planner/db";
import { buildWorkforceHandoffPayload, dedupeRequiredTools } from "@/lib/server/planner/handoff";

/**
 * Hand an approved workforce plan off to Person C's downstream system.
 * Only callable once every required tool is actually connected — approval
 * happens before integrations are connected in the real flow (approve →
 * connect tools → build), so this can't be folded into the approve route.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ workforcePlanId: string }> }
) {
  return withPlannerErrors(async () => {
    const { workforcePlanId } = await params;

    const plan = await workforcePlans.get(workforcePlanId);
    if (!plan) throw new PlannerError(404, "Workforce plan not found.");
    if (plan.status !== "approved") {
      throw new PlannerError(400, "Plan must be approved before it can be handed off.");
    }

    const agents = await agentConfigs.listActiveByPlan(workforcePlanId);
    if (agents.length === 0) throw new PlannerError(400, "Plan has no agents.");

    const requiredTools = dedupeRequiredTools(agents);
    const connections = await integrationConnections.listByOrg(plan.organization_id);
    const connectionByTool = new Map(connections.map((c) => [c.tool_key, c]));

    const missing = requiredTools.filter((t) => connectionByTool.get(t)?.status !== "connected");
    if (missing.length > 0) {
      throw new PlannerError(
        400,
        `Cannot hand off — ${missing.length} tool(s) not yet connected: ${missing.join(", ")}`
      );
    }

    const organization = await getOrganization(plan.organization_id);
    if (!organization) throw new PlannerError(404, "Organization not found.");

    // role_c_handoffs.payload is a generic jsonb column (RoleCHandoff.payload:
    // Record<string, unknown>) — cast the concrete shape through unknown, same
    // as any other structured value written into a jsonb column here.
    const payload = buildWorkforceHandoffPayload({
      organization,
      plan,
      agents,
      connections: requiredTools.map((t) => connectionByTool.get(t)!),
    }) as unknown as Record<string, unknown>;

    const externalId = `workforce:${workforcePlanId}`;
    const idempotencyKey = `workforce:${workforcePlanId}:v${plan.current_version}`;

    const [existing] = await roleCHandoffs.listByPlan(workforcePlanId);
    const handoff = existing
      ? await roleCHandoffs.update(existing.id, {
          payload,
          status: "ready",
          idempotency_key: idempotencyKey,
          updated_at: new Date().toISOString(),
        })
      : await roleCHandoffs.create({
          organization_id: plan.organization_id,
          workforce_plan_id: workforcePlanId,
          external_id: externalId,
          idempotency_key: idempotencyKey,
          payload,
          status: "ready",
        });

    return NextResponse.json({ handoff });
  });
}
