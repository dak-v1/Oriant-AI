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

    let plan;
    try {
      plan = await workforcePlans.create({
        role_b_handoff_id: handoff.id,
        organization_id: org.id,
        version: 1,
        status: "draft",
        plan: { agents: proposals },
      });
    } catch (err) {
      // The listByHandoff check above is a check-then-insert race — a
      // concurrent request (e.g. two rapid page loads) can pass it before
      // either insert lands. workforce_plans_role_b_handoff_id_key (added
      // in 20260802_workforce_plans_unique_handoff.sql) is the real guard;
      // this just turns that DB-level rejection into the same clean 409
      // instead of a raw 500.
      const message = err instanceof Error ? err.message : "";
      if (message.includes("workforce_plans_role_b_handoff_id_key") || message.includes("duplicate key")) {
        throw new PlannerError(409, "A workforce plan already exists for this handoff.");
      }
      throw err;
    }

    const DEFAULT_CUSTOM_RUNTIME_MODEL = "zai-org/glm-5.2";
    const templateByKey = new Map(templates.map((t) => [t.key, t]));

    const agents = await Promise.all(
      proposals.map((proposal) => {
        const template = proposal.templateKeyOrNull ? templateByKey.get(proposal.templateKeyOrNull) : undefined;
        return agentConfigs.create({
          workforce_plan_id: plan.id,
          agent_key: proposal.agentKey,
          agent_type: proposal.templateKeyOrNull ? "preset" : "custom",
          template_id: template?.id,
          status: proposal.templateKeyOrNull ? "needs_configuration" : "needs_information",
          required_tools: proposal.requiredTools,
          config: {},
          runtime_model: template?.default_runtime_model ?? DEFAULT_CUSTOM_RUNTIME_MODEL,
        });
      })
    );

    return NextResponse.json({ plan, agents });
  });
}
