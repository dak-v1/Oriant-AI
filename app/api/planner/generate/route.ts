import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withPlannerErrors } from "@/lib/server/planner/http";
import { PlannerError } from "@/lib/server/planner/errors";
import {
  getOnboardingSession,
  getOrganization,
  getApprovedCompanyReport,
  getRoleBHandoff,
  getCanonicalToolIds,
  agentTemplates,
  agentConfigs,
  workforcePlans,
} from "@/lib/server/planner/db";
import { proposeAgentPlan } from "@/lib/server/planner/generate";

interface GenerateBody {
  sessionId: string;
}

/** Draft a workforce plan: match report use cases against agent templates via AI&. */
export async function POST(req: NextRequest) {
  return withPlannerErrors(async () => {
    const body = (await req.json()) as GenerateBody;
    if (!body.sessionId) throw new PlannerError(400, "sessionId is required.");

    const session = await getOnboardingSession(body.sessionId);
    if (!session) throw new PlannerError(404, "Session not found.");

    const org = await getOrganization(session.organization_id);
    if (!org) throw new PlannerError(404, "Organization not found.");

    const reportRow = await getApprovedCompanyReport(body.sessionId);
    if (!reportRow) throw new PlannerError(404, "No approved company report for this session.");

    const handoff = await getRoleBHandoff(body.sessionId);
    if (!handoff) throw new PlannerError(404, "No role_b_handoffs row for this session.");

    const existing = await workforcePlans.listByHandoff(handoff.id);
    if (existing.length > 0) {
      throw new PlannerError(
        409,
        `A workforce plan already exists for this handoff (id: ${existing[0].id}, version: ${existing[0].version}).`
      );
    }

    const toolIds = getCanonicalToolIds(handoff.payload);
    const templates = await agentTemplates.list();

    const proposals = await proposeAgentPlan({
      report: reportRow.report,
      toolIds,
      templates,
    });

    const plan = await workforcePlans.create({
      role_b_handoff_id: handoff.id,
      organization_id: org.id,
      version: 1,
      status: "draft",
      plan: { agents: proposals },
    });

    const templateIdByKey = new Map(templates.map((t) => [t.key, t.id]));

    const agents = await Promise.all(
      proposals.map((proposal) =>
        agentConfigs.create({
          workforce_plan_id: plan.id,
          agent_key: proposal.agentKey,
          agent_type: proposal.templateKeyOrNull ? "preset" : "custom",
          template_id: proposal.templateKeyOrNull
            ? templateIdByKey.get(proposal.templateKeyOrNull)
            : undefined,
          status: proposal.templateKeyOrNull ? "needs_configuration" : "needs_information",
          required_tools: proposal.requiredTools,
          config: {},
        })
      )
    );

    return NextResponse.json({ plan, agents });
  });
}
