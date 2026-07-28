/**
 * lib/runtime/build/validate-package.ts — the gate between "compiled" and
 * "completed".
 *
 * The plan validator (lib/plan/validate.ts) checks what Role D handed over.
 * This checks what the Factory produced from it. They are different questions:
 * a valid plan compiled by a buggy or model-driven generator can still yield a
 * package the executor would refuse at run time, and Activation gates on a
 * green build. So no job reaches `completed` until its package passes here.
 *
 * Every rule below mirrors a refusal the executor or policy engine would
 * actually perform, so a clean package means "this will run", not "this looks
 * plausible".
 */

import type { AgentSpec } from "../../plan/types";
import { getOperation, isReadOnly } from "../../plan/operations";
import type { AgentPackage } from "../types";
import { checksumOf } from "../factory";

export interface PackageValidationError {
  severity: "error" | "warning";
  workflowId?: string;
  stepId?: string;
  message: string;
}

/**
 * @param pkg  the compiled package
 * @param spec the AgentSpec it was compiled from, used to prove the package
 *             did not widen or drift from what the plan authorised
 */
export function validatePackage(
  pkg: AgentPackage,
  spec: AgentSpec,
): PackageValidationError[] {
  const errors: PackageValidationError[] = [];

  /* ── Identity ── */

  if (pkg.agentId !== spec.id) {
    errors.push({
      severity: "error",
      message: `Package is for agent "${pkg.agentId}" but was compiled from spec "${spec.id}".`,
    });
  }

  if (pkg.agentVersion !== spec.version) {
    errors.push({
      severity: "error",
      message: `Package version ${pkg.agentVersion} does not match spec version ${spec.version}. Rebuild skipping is keyed on this, so a mismatch would serve a stale package forever.`,
    });
  }

  // Recomputing is what catches a generator that mutated the spec on the way
  // through, or a package restored from a store that drifted.
  const expected = checksumOf(spec);
  if (pkg.checksum !== expected) {
    errors.push({
      severity: "error",
      message: `Package checksum ${pkg.checksum} does not match the spec's ${expected}. The package was not compiled from this spec.`,
    });
  }

  if (pkg.systemPrompt.trim().length === 0) {
    errors.push({
      severity: "error",
      message: "Package has an empty system prompt, so every reason step would run with no instructions.",
    });
  }

  /* ── Allowlist ── */

  const granted = new Set(spec.tools.flatMap((t) => t.operations));
  const allowed = new Set(pkg.allowedOperations);

  for (const operation of allowed) {
    if (!granted.has(operation)) {
      // The single most dangerous possible defect: the executor checks acts
      // against this list, so a widened allowlist silently defeats the plan.
      errors.push({
        severity: "error",
        message: `Package allows "${operation}", which the plan never granted. The allowlist must never widen the plan.`,
      });
    }
  }

  for (const operation of spec.policy.forbidden) {
    if (allowed.has(operation)) {
      errors.push({
        severity: "error",
        message: `Package allows "${operation}", which the agent's policy forbids.`,
      });
    }
  }

  /* ── Workflows ── */

  const specWorkflows = new Map(spec.workflows.map((w) => [w.id, w]));

  if (pkg.workflows.length !== spec.workflows.length) {
    errors.push({
      severity: "error",
      message: `Package has ${pkg.workflows.length} workflows but the spec has ${spec.workflows.length}.`,
    });
  }

  for (const compiled of pkg.workflows) {
    const source = specWorkflows.get(compiled.workflowId);
    if (!source) {
      errors.push({
        severity: "error",
        workflowId: compiled.workflowId,
        message: `Package contains workflow "${compiled.workflowId}", which is not in the spec.`,
      });
      continue;
    }

    if (compiled.enabled !== source.enabled) {
      errors.push({
        severity: "error",
        workflowId: compiled.workflowId,
        message: `Workflow "${compiled.workflowId}" is ${compiled.enabled ? "enabled" : "disabled"} in the package but ${source.enabled ? "enabled" : "disabled"} in the plan.`,
      });
    }

    if (!compiled.enabled) continue;

    if (compiled.steps.length === 0) {
      errors.push({
        severity: "error",
        workflowId: compiled.workflowId,
        message: `Enabled workflow "${compiled.workflowId}" compiled to zero steps and could never do anything.`,
      });
    }

    if (compiled.prompt.trim().length === 0) {
      errors.push({
        severity: "warning",
        workflowId: compiled.workflowId,
        message: `Workflow "${compiled.workflowId}" has an empty prompt, so reason steps lose their workflow context.`,
      });
    }

    if (compiled.output.successCriteria.trim().length === 0) {
      errors.push({
        severity: "warning",
        workflowId: compiled.workflowId,
        message: `Workflow "${compiled.workflowId}" has no success criteria, so the sandbox has nothing to assert against.`,
      });
    }

    // Steps must still be executable: same checks the executor performs, run
    // now rather than in front of a customer.
    const seenStepIds = new Set<string>();
    for (const step of compiled.steps) {
      if (seenStepIds.has(step.id)) {
        errors.push({
          severity: "error",
          workflowId: compiled.workflowId,
          stepId: step.id,
          message: `Duplicate step id "${step.id}"; run context is keyed by step id and would be overwritten.`,
        });
      }
      seenStepIds.add(step.id);

      if (step.kind === "act" || step.kind === "fetch") {
        if (!step.tool) {
          errors.push({
            severity: "error",
            workflowId: compiled.workflowId,
            stepId: step.id,
            message: `${step.kind} step "${step.id}" has no tool, so the executor cannot resolve a client.`,
          });
          continue;
        }

        const def = getOperation(step.tool.operation);
        if (!def) {
          errors.push({
            severity: "error",
            workflowId: compiled.workflowId,
            stepId: step.id,
            message: `Step "${step.id}" calls unknown operation "${step.tool.operation}".`,
          });
          continue;
        }

        if (def.integrationId !== step.tool.integrationId) {
          errors.push({
            severity: "error",
            workflowId: compiled.workflowId,
            stepId: step.id,
            message: `Step "${step.id}" routes "${step.tool.operation}" through "${step.tool.integrationId}", but it belongs to "${def.integrationId}". The executor resolves the client by integrationId.`,
          });
        }

        if (!allowed.has(step.tool.operation)) {
          errors.push({
            severity: "error",
            workflowId: compiled.workflowId,
            stepId: step.id,
            message: `Step "${step.id}" calls "${step.tool.operation}", which is not in the package allowlist. The executor would refuse it at run time.`,
          });
        }

        if (step.kind === "fetch" && !isReadOnly(step.tool.operation)) {
          errors.push({
            severity: "error",
            workflowId: compiled.workflowId,
            stepId: step.id,
            message: `Fetch step "${step.id}" calls the side-effecting operation "${step.tool.operation}", which would bypass policy.`,
          });
        }
      }
    }
  }

  /* ── Policy coherence ── */

  if (spec.policy.operatingMode === "auto_within_limits" && spec.policy.limits.length === 0) {
    errors.push({
      severity: "error",
      message: "Agent runs unattended but declares no limits, so nothing could ever escalate.",
    });
  }

  return errors;
}

export function isPackageRunnable(
  pkg: AgentPackage,
  spec: AgentSpec,
): boolean {
  return validatePackage(pkg, spec).every((e) => e.severity !== "error");
}
