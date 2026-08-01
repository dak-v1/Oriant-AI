/**
 * Undo/redo snapshot helpers for the Person B planner backend. Shared by
 * /chat/apply, /undo, and /redo so the restore logic lives in exactly one
 * place. Independent of lib/server/orchestrator.ts and app/api/plan/* —
 * nothing here imports either.
 */
import { workforcePlans, agentConfigs, workforcePlanSnapshots } from "./db";
import type { WorkforcePlanSnapshotRow, AgentConfigExt } from "./types";
import { PlannerError } from "./errors";

/**
 * Creates a snapshot of the CURRENT plan + active agents at `version`, but
 * only if one doesn't already exist there. No confirmed unique constraint
 * on workforce_plan_snapshots(workforce_plan_id, version) to make an upsert
 * safe, and a same-version snapshot can legitimately already exist in edge
 * cases (undo, then a different fresh mutation from the same rewound
 * state) — check-then-create avoids duplicate rows either way.
 */
export async function ensureSnapshot(workforcePlanId: string, version: number): Promise<void> {
  const existing = await workforcePlanSnapshots.getByVersion(workforcePlanId, version);
  if (existing) return;

  const plan = await workforcePlans.get(workforcePlanId);
  if (!plan) throw new PlannerError(404, "Workforce plan not found.");

  const activeAgents = await agentConfigs.listActiveByPlan(workforcePlanId);

  await workforcePlanSnapshots.create({
    workforce_plan_id: workforcePlanId,
    version,
    plan_snapshot: plan.plan,
    agent_configs_snapshot: activeAgents,
  });
}

/**
 * Restores agent_configs to exactly what `snapshot` recorded: every
 * snapshotted row is upserted BY ID (ids are stable — agent removal is
 * always a soft delete, never a hard DELETE, so agent_design_sessions/turns
 * links never break), and any currently-active agent absent from the
 * snapshot gets archived. Does NOT touch workforce_plans itself — the
 * caller restores `plan`/`current_version` after this returns.
 */
export async function restoreFromSnapshot(
  workforcePlanId: string,
  snapshot: WorkforcePlanSnapshotRow
): Promise<void> {
  const currentAgents = await agentConfigs.listByPlan(workforcePlanId); // all rows, including archived
  const currentById = new Map(currentAgents.map((a) => [a.id, a]));
  const snapshotIds = new Set(snapshot.agent_configs_snapshot.map((a) => a.id));

  for (const snapAgent of snapshot.agent_configs_snapshot) {
    const restoredFields: Partial<AgentConfigExt> = {
      agent_key: snapAgent.agent_key,
      config: snapAgent.config,
      agent_type: snapAgent.agent_type,
      template_id: snapAgent.template_id,
      status: snapAgent.status,
      required_tools: snapAgent.required_tools,
      runtime_model: snapAgent.runtime_model,
      archived_at: null,
    };

    if (currentById.has(snapAgent.id)) {
      await agentConfigs.update(snapAgent.id, restoredFields);
    } else {
      // Expected to be unreachable in practice (soft-delete-only guarantees
      // ids never disappear), but implemented per spec for correctness.
      await agentConfigs.create({
        id: snapAgent.id,
        workforce_plan_id: workforcePlanId,
        created_at: snapAgent.created_at,
        ...restoredFields,
      });
    }
  }

  for (const current of currentAgents) {
    if (!snapshotIds.has(current.id) && !current.archived_at) {
      await agentConfigs.update(current.id, { archived_at: new Date().toISOString() });
    }
  }
}
