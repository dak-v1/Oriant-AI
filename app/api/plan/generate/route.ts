import { mutate } from "@/lib/server/api";
import { requireApprovedReport, audit } from "@/lib/server/orchestrator";
import { generatePlan } from "@/lib/server/planner";

/** Draft the workforce plan. Blocked until the brief is approved (F-05). */
export async function POST() {
  return mutate(async (db) => {
    requireApprovedReport(db);
    if (db.plan && !db.plan.stale) return; // idempotent — keep the working plan
    await generatePlan(db);
    audit(db, "plan.generated", "WorkflowPlan v1", `from report v${db.report!.version}`);
  });
}
