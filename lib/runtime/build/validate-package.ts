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
 *
 * One deliberate omission: `globalPolicy.forbidden` is org-wide and lives on
 * the plan, not on the AgentSpec, so nothing here can see it. That is not a
 * hole — `buildPlan` runs `validateApprovedPlan` before it builds anything
 * (rule 3 refuses a grant that contradicts either forbidden list), so by the
 * time a package reaches this file the org-wide denies have already been
 * checked. If the Factory ever gains an entry point that bypasses buildPlan,
 * this becomes a hole and the plan's forbidden list has to be passed in.
 */

import type { AgentSpec } from "../../plan/types";
import { isOperatingMode } from "../../plan/types";
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

    /* ── The executable shape must not drift from the plan ──
       The package may enrich PROSE — systemPrompt and workflow.prompt are the
       compiler's own work — but it may never restate the steps. The executor
       reads its step list from the PACKAGE, not from the spec, so a generator
       that drops an `approve` checkpoint or rewrites an act's `risk` changes
       what the owner is asked to sign off (contract §3.7) while every check
       above still passes. Since a model-driven generator is an explicit seam
       (build/types.ts PackageGenerator), this is the rule that keeps it
       honest, and it runs for disabled workflows too: a workflow enabled later
       must not have been quietly rewritten in the meantime. */
    if (compiled.steps.length !== source.steps.length) {
      errors.push({
        severity: "error",
        workflowId: compiled.workflowId,
        message: `Workflow "${compiled.workflowId}" compiled to ${compiled.steps.length} step(s) but the plan declares ${source.steps.length}. The package may enrich prompts, never the executable shape.`,
      });
    }

    for (let i = 0; i < Math.max(compiled.steps.length, source.steps.length); i++) {
      const got = compiled.steps[i];
      const want = source.steps[i];
      // The length mismatch is already reported once; do not repeat it per step.
      if (!got || !want) continue;

      const drift: string[] = [];
      if (got.id !== want.id) drift.push(`id "${got.id}" is not "${want.id}"`);
      if (got.kind !== want.kind) drift.push(`kind "${got.kind}" is not "${want.kind}"`);
      // An unset risk is legitimate on anything but an act, so only a CHANGE is
      // drift. A downgrade here would flow straight into ApprovalRequest.risk,
      // which is what the Approvals inbox filters and triages on.
      if (got.risk !== want.risk) {
        drift.push(`risk ${got.risk ?? "unset"} is not ${want.risk ?? "unset"}`);
      }
      if (got.tool?.integrationId !== want.tool?.integrationId) {
        drift.push(
          `integration "${got.tool?.integrationId ?? "none"}" is not "${want.tool?.integrationId ?? "none"}"`,
        );
      }
      // Worth its own line: finance-followup is granted both
      // gmail.drafts.create and gmail.messages.send, so swapping one act's
      // operation for the other satisfies the allowlist check above and turns
      // drafting into sending with nothing else changed.
      if (got.tool?.operation !== want.tool?.operation) {
        drift.push(
          `operation "${got.tool?.operation ?? "none"}" is not "${want.tool?.operation ?? "none"}"`,
        );
      }
      // An approve step's instruction IS the text the owner reads in the
      // inbox (the executor uses it verbatim as ApprovalRequest.reason), so it
      // is part of the shape rather than prose the package may reword.
      if (want.kind === "approve" && got.instruction !== want.instruction) {
        drift.push("the approve-step instruction was rewritten");
      }

      if (drift.length > 0) {
        errors.push({
          severity: "error",
          workflowId: compiled.workflowId,
          stepId: want.id,
          message: `Step ${i + 1} drifted from the plan: ${drift.join("; ")}.`,
        });
      }
    }

    // Same reasoning one level up: the sandbox grades every scenario against
    // output.successCriteria, so a package free to rewrite it marks its own
    // homework and the M3 verdict stops meaning anything.
    if (
      compiled.output.kind !== source.output.kind ||
      compiled.output.successCriteria !== source.output.successCriteria
    ) {
      errors.push({
        severity: "error",
        workflowId: compiled.workflowId,
        message: `Workflow "${compiled.workflowId}" restated its output contract. The sandbox grades runs against successCriteria, so it must reach the package unchanged.`,
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

  // Membership, not a typo check: a handoff that omits the field entirely is
  // the likelier failure and `undefined` has to fail this too — which is why
  // this uses the shared guard rather than an exact-match comparison. An
  // unrecognised mode is not cosmetic: the runtime cannot enforce a policy it
  // cannot interpret, so it refuses every act, and an agent that refuses
  // everything must never reach a green build that Activation gates on.
  if (!isOperatingMode(spec.policy.operatingMode)) {
    errors.push({
      severity: "error",
      message: `Agent declares operatingMode "${String(spec.policy.operatingMode)}", which the runtime does not implement. Every act would be refused.`,
    });
  }

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
