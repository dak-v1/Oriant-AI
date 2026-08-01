import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withPlannerErrors } from "@/lib/server/planner/http";
import { PlannerError } from "@/lib/server/planner/errors";
import {
  workforcePlans,
  agentConfigs,
  agentTemplates,
  planChangeRequests,
  workforcePlanSnapshots,
} from "@/lib/server/planner/db";
import { ensureSnapshot } from "@/lib/server/planner/snapshots";
import type { AgentConfigExt, DiffPreviewOp, WorkforcePlanRow } from "@/lib/server/planner/types";

interface ApplyBody {
  changeRequestId: string;
}

const DEFAULT_CUSTOM_RUNTIME_MODEL = "zai-org/glm-5.2";

/** Apply a previously-previewed diff: mutates agent_configs, snapshots, and versions the plan. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workforcePlanId: string }> }
) {
  return withPlannerErrors(async () => {
    const { workforcePlanId } = await params;
    const body = (await req.json()) as Partial<ApplyBody>;
    if (!body.changeRequestId) throw new PlannerError(400, "changeRequestId is required.");

    const changeRequest = await planChangeRequests.get(body.changeRequestId);
    if (!changeRequest) throw new PlannerError(404, "Change request not found.");
    if (changeRequest.workforce_plan_id !== workforcePlanId) {
      throw new PlannerError(400, "This change request does not belong to this plan.");
    }
    if (changeRequest.applied) {
      throw new PlannerError(409, "This change request has already been applied.");
    }

    const plan = await workforcePlans.get(workforcePlanId);
    if (!plan) throw new PlannerError(404, "Workforce plan not found.");

    // Pre-mutation snapshot, at the current (not-yet-incremented) version.
    await ensureSnapshot(workforcePlanId, plan.current_version);

    const ops: DiffPreviewOp[] = changeRequest.diff_preview?.ops ?? [];
    const templates = await agentTemplates.list();
    const templateByKey = new Map(templates.map((t) => [t.key, t]));

    const allAgents = await agentConfigs.listByPlan(workforcePlanId); // all rows, including archived
    const byKey = new Map(allAgents.map((a) => [a.agent_key, a]));

    for (const op of ops) {
      if (op.op === "remove") {
        const agent = byKey.get(op.agentKey);
        if (agent && !agent.archived_at) {
          const updated = await agentConfigs.update(agent.id, { archived_at: new Date().toISOString() });
          byKey.set(op.agentKey, updated);
        }
      } else if (op.op === "add") {
        const existing = byKey.get(op.agentKey);
        if (existing?.archived_at) {
          const updated = await agentConfigs.update(existing.id, { archived_at: null });
          byKey.set(op.agentKey, updated);
        } else if (!existing) {
          const template = op.templateKeyOrNull ? templateByKey.get(op.templateKeyOrNull) : undefined;
          const created = await agentConfigs.create({
            workforce_plan_id: workforcePlanId,
            agent_key: op.agentKey,
            agent_type: op.templateKeyOrNull ? "preset" : "custom",
            template_id: template?.id,
            status: op.templateKeyOrNull ? "needs_configuration" : "needs_information",
            required_tools: template?.required_tools ?? [],
            config: {},
            runtime_model: template?.default_runtime_model ?? DEFAULT_CUSTOM_RUNTIME_MODEL,
          });
          byKey.set(op.agentKey, created);
        }
        // else: already active — idempotent no-op.
      } else if (op.op === "reconfigure") {
        const agent = byKey.get(op.agentKey);
        if (agent && !agent.archived_at && op.configPatch) {
          const updated = await agentConfigs.update(agent.id, {
            config: { ...(agent.config ?? {}), ...op.configPatch },
          });
          byKey.set(op.agentKey, updated);
        }
      }
      // An op whose agentKey resolves to nothing at all (stale between
      // preview-time and apply-time) is skipped rather than fatal.
    }

    const activeAfter: AgentConfigExt[] = await agentConfigs.listActiveByPlan(workforcePlanId);
    const requiredTools = Array.from(new Set(activeAfter.flatMap((a) => a.required_tools ?? [])));

    const planPatch: Partial<WorkforcePlanRow> = {};
    if (plan.status === "approved") {
      planPatch.status = "draft";
      // No dedicated `stale` column exists yet — nested inside the plan
      // jsonb per the constraint not to add one in this step. Flagging
      // this as a real schema gap worth a proper column later.
      planPatch.plan = { ...(plan.plan as Record<string, unknown>), stale: true };
    }

    // Redo-stack truncation — uses the PRE-increment version.
    await workforcePlanSnapshots.deleteVersionsGreaterThan(workforcePlanId, plan.current_version);

    const updatedPlan = await workforcePlans.update(workforcePlanId, {
      ...planPatch,
      current_version: plan.current_version + 1,
    });

    await planChangeRequests.update(changeRequest.id, { applied: true });

    return NextResponse.json({ plan: updatedPlan, agents: activeAfter, requiredTools });
  });
}
