import { mutate } from "@/lib/server/api";
import { GateError, audit, trace } from "@/lib/server/orchestrator";
import { validateInSandbox } from "@/lib/server/providers/daytona";
import { createHash } from "crypto";

/**
 * Run every generated package through sandbox validation (blueprint §16).
 * Live: an isolated Daytona sandbox per agent. Fixture: the same checks run
 * locally and are labeled as such — never presented as a sandbox run.
 */
export async function POST() {
  return mutate(async (db) => {
    const planned = db.plan?.team.filter((a) => a.inPlan) ?? [];
    if (planned.length === 0) throw new GateError("No agents in the plan.");
    const missing = planned.filter((a) => !db.artifacts[a.id]);
    if (missing.length > 0) {
      throw new GateError(`Build first — no package yet for: ${missing.map((a) => a.name).join(", ")}`);
    }
    db.phase = "validating";
    for (const agent of planned) {
      const bundle = db.artifacts[agent.id];
      const result = await validateInSandbox(bundle);
      const hash = createHash("sha256")
        .update(bundle.files.map((f) => f.path + f.content).join("\n"))
        .digest("hex");
      db.validations[agent.id] = {
        agentId: agent.id,
        sandboxId: result.sandboxId,
        status: result.ok ? "validated" : "failed",
        tests: result.tests,
        securityChecks: result.securityChecks,
        artifactHash: `sha256:${hash.slice(0, 8)}…${hash.slice(-2)}`,
        warnings: [...bundle.warnings, ...result.warnings],
        mode: result.mode,
      };
      trace(db, "daytona", `sandbox_validation:${agent.id}`,
        result.ok ? "completed" : "failed", result.mode, result.error);
    }
    const allOk = planned.every((a) => db.validations[a.id]?.status === "validated");
    db.phase = allOk ? "validated" : "built";
    audit(db, allOk ? "validation.passed" : "validation.failed",
      `plan v${db.plan!.version}`, `${planned.length} packages`);
  });
}
