import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withPlannerErrors } from "@/lib/server/planner/http";
import { PlannerError } from "@/lib/server/planner/errors";
import { workforcePlans, agentConfigs, agentTemplates, planChangeRequests } from "@/lib/server/planner/db";
import { classifyChatMessage } from "@/lib/server/planner/chat";
import type { DiffOp, DiffPreviewOp } from "@/lib/server/planner/types";

interface ChatBody {
  message: string;
}

function summarizeDiffOp(op: DiffOp): string {
  switch (op.op) {
    case "add":
      return op.templateKeyOrNull
        ? `Add a new preset ("${op.templateKeyOrNull}") agent "${op.agentKey}".`
        : `Add a new custom agent "${op.agentKey}".`;
    case "remove":
      return `Remove agent "${op.agentKey}".`;
    case "reconfigure":
      return `Update configuration for agent "${op.agentKey}"${
        op.configPatch ? ": " + Object.keys(op.configPatch).join(", ") : ""
      }.`;
  }
}

/** Natural-language plan refinement: classify intent, propose a diff preview (no mutation yet). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workforcePlanId: string }> }
) {
  return withPlannerErrors(async () => {
    const { workforcePlanId } = await params;
    const body = (await req.json()) as Partial<ChatBody>;
    if (!body.message?.trim()) throw new PlannerError(400, "message is required.");

    const plan = await workforcePlans.get(workforcePlanId);
    if (!plan) throw new PlannerError(404, "Workforce plan not found.");

    const activeAgents = await agentConfigs.listActiveByPlan(workforcePlanId);
    const templates = await agentTemplates.list();

    const { answer, diffOps } = await classifyChatMessage({
      message: body.message,
      activeAgents,
      templates,
    });

    if (diffOps.length === 0) {
      return NextResponse.json({ answer, changeRequestId: null, diffPreview: null });
    }

    const diffPreview: { ops: DiffPreviewOp[] } = {
      ops: diffOps.map((op) => ({ ...op, summary: summarizeDiffOp(op) })),
    };

    const changeRequest = await planChangeRequests.create({
      workforce_plan_id: workforcePlanId,
      instruction_text: body.message,
      diff_preview: diffPreview,
      applied: false,
    });

    return NextResponse.json({ answer, changeRequestId: changeRequest.id, diffPreview });
  });
}
