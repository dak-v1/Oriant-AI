import { NextResponse } from "next/server";
import { withPlannerErrors } from "@/lib/server/planner/http";
import { PlannerError } from "@/lib/server/planner/errors";
import { withDb } from "@/lib/server/store";
import { hydrateOnboardingFromSupabase, resolveSessionRecord } from "@/lib/server/onboarding-supabase";
import { agentConfigs, agentTemplates, getRoleBHandoff, workforcePlans } from "@/lib/server/planner/db";

export const dynamic = "force-dynamic";

/**
 * Bootstraps the frontend for the planner: resolves the real Supabase
 * organization_id/onboarding_sessions.id UUIDs behind the active in-memory
 * session (nothing under app/app/planner currently has access to them —
 * only the old orchestrator-adjacent synthetic session id), and returns any
 * existing workforce plan for that session so the client never has to
 * blind-call generate.
 */
export async function GET() {
  return withPlannerErrors(async () => {
    const record = await withDb(async (db) => {
      await hydrateOnboardingFromSupabase(db);
      return resolveSessionRecord(db);
    });
    if (!record) throw new PlannerError(404, "No onboarding session found yet.");

    const handoff = await getRoleBHandoff(record.sessionId);
    const templates = await agentTemplates.list();

    if (!handoff) {
      return NextResponse.json({
        organizationId: record.orgId,
        sessionId: record.sessionId,
        roleBHandoffId: null,
        plan: null,
        agents: null,
        templates,
      });
    }

    const plans = await workforcePlans.listByHandoff(handoff.id);
    const plan = plans[0] ?? null;
    const agents = plan ? await agentConfigs.listActiveByPlan(plan.id) : null;

    return NextResponse.json({
      organizationId: record.orgId,
      sessionId: record.sessionId,
      roleBHandoffId: handoff.id,
      plan,
      agents,
      templates,
    });
  });
}
