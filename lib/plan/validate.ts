/**
 * lib/plan/validate.ts — the handoff gate (contract §6).
 *
 * The entire integration risk between the two lanes is "D emitted something
 * Role C cannot run". This file reduces that risk to one green/red check, run
 * before a plan is ever built into agent packages.
 *
 * Two principles shape it:
 *
 *   1. Fail closed. Anything the registry does not recognise is treated as
 *      unsafe, never as harmless. An unknown operation is not read-only, so a
 *      `fetch` step cannot smuggle a side effect through the ungated path.
 *   2. Report everything. The validator never short-circuits on the first
 *      failure: D wants the whole list, not a game of whack-a-mole. Errors
 *      block the handoff, warnings are advisory and do not.
 *
 * Determinism matters as much here as in the runtime (M3): no clock, no
 * randomness, no I/O. The same plan always yields the same list, in the same
 * order (plan order: outcomes, then agents, then workflows, then steps).
 */

import {
  getOperation,
  isKnownOperation,
  isReadOnly,
  operationsFor,
} from "./operations";
import type {
  AgentSpec,
  ApprovedPlan,
  BusinessOutcome,
  PlanValidationError,
  WorkflowSpec,
} from "./types";

/* ═══════════════════════ Structural helpers ═══════════════════════ */

/**
 * Plans arrive as JSON over the seam (and later over the wire in M4), so the
 * declared types are a promise, not a guarantee. Missing collections degrade
 * to empty rather than throwing part-way through validation.
 */
function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/* ═══════════════════════ Cron and timezone ═══════════════════════ */

/**
 * minute, hour, day-of-month, month, day-of-week.
 * Day-of-week allows 7 as well as 0 because both spell Sunday in crontab.
 */
const CRON_FIELD_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];

const NUMERIC = /^\d+$/;

/** One comma-separated term: a star, a star-slash step, a number, or a range. */
function isCronTerm(term: string, min: number, max: number): boolean {
  if (term === "*") return true;

  if (term.startsWith("*/")) {
    const stepText = term.slice(2);
    if (!NUMERIC.test(stepText)) return false;
    const step = Number(stepText);
    // A step of 0 never advances, and a step wider than the field is a typo.
    return step >= 1 && step <= max;
  }

  // indexOf > 0 so a leading "-" is rejected rather than read as a range.
  const dash = term.indexOf("-");
  if (dash > 0) {
    const fromText = term.slice(0, dash);
    const toText = term.slice(dash + 1);
    if (!NUMERIC.test(fromText) || !NUMERIC.test(toText)) return false;
    const from = Number(fromText);
    const to = Number(toText);
    return from >= min && to <= max && from <= to;
  }

  if (!NUMERIC.test(term)) return false;
  const value = Number(term);
  return value >= min && value <= max;
}

function isCronField(field: string, min: number, max: number): boolean {
  if (field.length === 0) return false;
  return field.split(",").every((term) => isCronTerm(term, min, max));
}

/**
 * A deliberately small 5-field cron parser: no dependency, no seconds field,
 * no named months or weekdays. The scheduler (M4) only ever emits numeric
 * crons, so accepting more here would let unschedulable plans through.
 */
export function isValidCron(expression: string): boolean {
  if (typeof expression !== "string") return false;
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== CRON_FIELD_RANGES.length) return false;
  return fields.every((field, index) => {
    const range = CRON_FIELD_RANGES[index];
    if (!range) return false; // unreachable, but keeps the index access honest
    return isCronField(field, range[0], range[1]);
  });
}

/**
 * The platform's own tz database is the only authority worth trusting here,
 * so ask Intl and treat a throw as "not an IANA zone".
 */
export function isValidTimezone(timezone: string): boolean {
  if (!isNonEmptyString(timezone)) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/* ═══════════════════════════ The validator ═══════════════════════════ */

/** Returns [] when the plan is safe to build. Any "error" blocks handoff. */
export function validateApprovedPlan(plan: ApprovedPlan): PlanValidationError[] {
  const errors: PlanValidationError[] = [];

  // Widened deliberately: the declared type is a promise about the shape, not
  // proof of it, and the gate must survive a malformed hand-off.
  const candidate: unknown = plan;
  if (candidate === null || typeof candidate !== "object") {
    errors.push({
      severity: "error",
      rule: 0,
      message: "Plan is missing or is not an object.",
    });
    return errors;
  }

  const agents = asArray<AgentSpec>(plan.agents);
  const outcomes = asArray<BusinessOutcome>(plan.businessOutcomes);
  const globalForbidden = new Set(
    plan.globalPolicy ? asArray<string>(plan.globalPolicy.forbidden) : [],
  );

  const agentIds = new Set<string>();
  for (const agent of agents) {
    // Rule 9 — agent ids unique across the whole plan.
    if (agentIds.has(agent.id)) {
      errors.push({
        severity: "error",
        rule: 9,
        agentId: agent.id,
        message: `Duplicate agent id "${agent.id}". Agent ids must be unique across the plan.`,
      });
    }
    agentIds.add(agent.id);
  }

  /* ── Business outcomes (rules 9, 13, 16) ── */

  const outcomeIds = new Set<string>();
  /** Agents named by at least one outcome, for rule 15. */
  const referencedAgentIds = new Set<string>();

  for (const outcome of outcomes) {
    if (outcomeIds.has(outcome.id)) {
      errors.push({
        severity: "error",
        rule: 9,
        outcomeId: outcome.id,
        message: `Duplicate outcome id "${outcome.id}". Outcome ids must be unique across the plan.`,
      });
    }
    outcomeIds.add(outcome.id);

    for (const agentId of asArray<string>(outcome.agentIds)) {
      referencedAgentIds.add(agentId);
      if (!agentIds.has(agentId)) {
        errors.push({
          severity: "error",
          rule: 13,
          outcomeId: outcome.id,
          agentId,
          message: `Outcome "${outcome.id}" references agent "${agentId}", which is not in the plan.`,
        });
      }
    }

    const metrics = asArray(outcome.metrics);
    const hasNumericTarget = metrics.some(
      (metric) => typeof metric.target === "number" && Number.isFinite(metric.target),
    );
    if (!hasNumericTarget) {
      errors.push({
        severity: "warning",
        rule: 16,
        outcomeId: outcome.id,
        message: `Outcome "${outcome.id}" has no metric with a numeric target, so the Workspace has nothing to report progress against.`,
      });
    }
  }

  /* ── Agents ── */

  for (const agent of agents) {
    const agentId = agent.id;
    const grants = asArray(agent.tools);

    /** Flattened allowlist: the runtime refuses anything outside it. */
    const granted = new Set<string>();
    for (const grant of grants) {
      for (const operation of asArray<string>(grant.operations)) {
        granted.add(operation);
      }
    }

    // Same posture as globalPolicy above: the declared type promises a policy,
    // a hand-off arriving as JSON does not. A missing one is reported as a
    // rule 8 error, never allowed to throw part-way through the gate.
    const policy = agent.policy;
    const agentForbidden = new Set(policy ? asArray<string>(policy.forbidden) : []);

    // Rule 2 — auto mode with no limits means nothing would ever escalate.
    if (
      policy &&
      policy.operatingMode === "auto_within_limits" &&
      asArray(policy.limits).length === 0
    ) {
      errors.push({
        severity: "error",
        rule: 2,
        agentId,
        message: `Agent "${agentId}" runs in "auto_within_limits" but declares no limits, so nothing could ever escalate.`,
      });
    }

    // Rule 3 — a grant must never contradict a hard deny.
    for (const operation of granted) {
      const sources: string[] = [];
      if (agentForbidden.has(operation)) sources.push("the agent's policy.forbidden");
      if (globalForbidden.has(operation)) sources.push("globalPolicy.forbidden");
      if (sources.length > 0) {
        errors.push({
          severity: "error",
          rule: 3,
          agentId,
          message: `Operation "${operation}" is granted in tools but also listed in ${sources.join(" and ")}. A grant can never override a hard deny.`,
        });
      }
    }

    // Rule 8 — approvals need an owner. Resolving the id against a real user
    // directory lands in M4; at handoff we can only prove the field is set.
    if (!policy || !isNonEmptyString(policy.approvalOwner)) {
      errors.push({
        severity: "error",
        rule: 8,
        agentId,
        message: `Agent "${agentId}" has no approvalOwner, so a pending approval would have nobody to go to.`,
      });
    }

    // Rule 12 — a required integration the registry knows nothing about
    // cannot be checked by the Activation checklist.
    for (const grant of grants) {
      if (grant.required && operationsFor(grant.integrationId).length === 0) {
        errors.push({
          severity: "warning",
          rule: 12,
          agentId,
          message: `Agent "${agentId}" requires integration "${grant.integrationId}", which has no operations in the registry.`,
        });
      }
    }

    /* ── Capabilities (rules 9, 14) ── */

    const capabilityIds = new Set<string>();
    for (const capability of asArray(agent.capabilities)) {
      if (capabilityIds.has(capability.id)) {
        errors.push({
          severity: "error",
          rule: 9,
          agentId,
          capabilityId: capability.id,
          message: `Duplicate capability id "${capability.id}" on agent "${agentId}". Capability ids must be unique within an agent.`,
        });
      }
      capabilityIds.add(capability.id);

      for (const operation of asArray<string>(capability.backedBy)) {
        if (!granted.has(operation)) {
          errors.push({
            severity: "error",
            rule: 14,
            agentId,
            capabilityId: capability.id,
            message: `Capability "${capability.id}" claims operation "${operation}", which agent "${agentId}" has no grant for. The runtime would refuse it.`,
          });
        }
      }
    }

    /* ── Workflows ── */

    const workflows = asArray<WorkflowSpec>(agent.workflows);

    // Rule 11 — an agent with nothing enabled will never do any work.
    if (!workflows.some((workflow) => workflow.enabled)) {
      errors.push({
        severity: "warning",
        rule: 11,
        agentId,
        message: `Agent "${agentId}" has no enabled workflows, so it will never run.`,
      });
    }

    const workflowIds = new Set<string>();
    for (const workflow of workflows) {
      const workflowId = workflow.id;

      // Rule 9 — workflow ids unique within the agent.
      if (workflowIds.has(workflowId)) {
        errors.push({
          severity: "error",
          rule: 9,
          agentId,
          workflowId,
          message: `Duplicate workflow id "${workflowId}" on agent "${agentId}". Workflow ids must be unique within an agent.`,
        });
      }
      workflowIds.add(workflowId);

      const steps = asArray(workflow.steps);

      // Rule 10 — an enabled workflow must actually be executable.
      if (workflow.enabled) {
        if (steps.length === 0) {
          errors.push({
            severity: "error",
            rule: 10,
            agentId,
            workflowId,
            message: `Enabled workflow "${workflowId}" has no steps.`,
          });
        }

        const output = workflow.output;
        if (!output) {
          errors.push({
            severity: "error",
            rule: 10,
            agentId,
            workflowId,
            message: `Enabled workflow "${workflowId}" declares no output, so a run has no definition of success.`,
          });
        } else if (!isNonEmptyString(output.successCriteria)) {
          errors.push({
            severity: "error",
            rule: 10,
            agentId,
            workflowId,
            message: `Enabled workflow "${workflowId}" has an output with no successCriteria, so the sandbox has nothing to assert against.`,
          });
        }
      }

      /* ── Triggers (rules 4, 5) ── */

      const trigger = workflow.trigger;
      if (trigger && trigger.kind === "schedule") {
        if (!isValidCron(trigger.cron)) {
          errors.push({
            severity: "error",
            rule: 4,
            agentId,
            workflowId,
            message: `Workflow "${workflowId}" has an unparseable cron "${String(trigger.cron)}". Expected 5 numeric fields, for example "0 9 * * 5".`,
          });
        }
        if (!isValidTimezone(trigger.timezone)) {
          errors.push({
            severity: "error",
            rule: 4,
            agentId,
            workflowId,
            message: `Workflow "${workflowId}" has an invalid IANA timezone "${String(trigger.timezone)}".`,
          });
        }
      } else if (trigger && trigger.kind === "dependency") {
        // A dependency may only chain within one agent: cross-agent ordering
        // is orchestration, which the contract does not model.
        const target = workflows.find((other) => other.id === trigger.afterWorkflowId);
        if (trigger.afterWorkflowId === workflowId) {
          // A workflow waiting on itself can never fire.
          errors.push({
            severity: "error",
            rule: 5,
            agentId,
            workflowId,
            message: `Workflow "${workflowId}" depends on itself, so it could never be triggered.`,
          });
        } else if (!target) {
          errors.push({
            severity: "error",
            rule: 5,
            agentId,
            workflowId,
            message: `Workflow "${workflowId}" depends on "${trigger.afterWorkflowId}", which does not exist on agent "${agentId}".`,
          });
        } else if (!target.enabled) {
          errors.push({
            severity: "error",
            rule: 5,
            agentId,
            workflowId,
            message: `Workflow "${workflowId}" depends on "${trigger.afterWorkflowId}", which is disabled and would never fire it.`,
          });
        }
      }

      /* ── Steps (rules 1, 6, 7, 9) ── */

      // Rule 9 — the executor keys accumulated run state by step id
      // (state.context[step.id]), so a duplicate silently overwrites an
      // earlier step's output and a later step reads the wrong data.
      const seenStepIds = new Set<string>();
      for (const step of steps) {
        if (seenStepIds.has(step.id)) {
          errors.push({
            severity: "error",
            rule: 9,
            agentId,
            workflowId,
            stepId: step.id,
            message: `Duplicate step id "${step.id}" in workflow "${workflowId}". The runtime keys step output by id, so a duplicate would overwrite earlier results.`,
          });
        }
        seenStepIds.add(step.id);
      }

      for (const step of steps) {
        const stepId = step.id;
        const tool = step.tool;

        // Rule 6 — an act step with no tool has nothing to gate.
        if (step.kind === "act" && !tool) {
          errors.push({
            severity: "error",
            rule: 6,
            agentId,
            workflowId,
            stepId,
            message: `Act step "${stepId}" declares no tool. Every act step must name the operation it calls.`,
          });
        }

        // Closest rule to "a fetch that cannot be proven read-only" is 7.
        if (step.kind === "fetch" && !tool) {
          errors.push({
            severity: "error",
            rule: 7,
            agentId,
            workflowId,
            stepId,
            message: `Fetch step "${stepId}" declares no tool, so its read-only status cannot be established.`,
          });
        }

        if (!tool) continue;

        const operation = tool.operation;

        // Rule 1 — the operation must exist, then be granted.
        if (!isKnownOperation(operation)) {
          errors.push({
            severity: "error",
            rule: 1,
            agentId,
            workflowId,
            stepId,
            message: `Step "${stepId}" calls unknown operation "${String(operation)}", which is not in the operation registry.`,
          });
        } else if (getOperation(operation)?.integrationId !== tool.integrationId) {
          // The executor resolves the client by `integrationId`
          // (executor.ts, performTool) but gates on `operation`. If the two
          // disagree, a plan that reads clean here dies at run time: either the
          // stub rejects the mismatch outright, or the wrong integration is not
          // connected and the run is refused. Catching it at the seam is the
          // entire point of the gate.
          errors.push({
            severity: "error",
            rule: 1,
            agentId,
            workflowId,
            stepId,
            message: `Step "${stepId}" calls "${operation}" through integration "${tool.integrationId}", but that operation belongs to "${getOperation(operation)?.integrationId}". The runtime resolves the tool client by integrationId and would refuse it.`,
          });
        } else if (!granted.has(operation)) {
          errors.push({
            severity: "error",
            rule: 1,
            agentId,
            workflowId,
            stepId,
            message: `Step "${stepId}" calls "${operation}", which agent "${agentId}" does not grant in tools[].operations. The runtime would refuse it.`,
          });
        }

        // Rule 7, mirrored — an act step calling a read-only operation is not
        // dangerous, but it is wrong: it pays the approval-gating cost for a
        // read and hides a genuine side effect's absence from anyone auditing
        // the workflow. Warning rather than error because nothing unsafe
        // follows from it.
        if (step.kind === "act" && isReadOnly(operation)) {
          errors.push({
            severity: "warning",
            rule: 7,
            agentId,
            workflowId,
            stepId,
            message: `Act step "${stepId}" calls the read-only operation "${operation}". Reads belong in fetch steps; an act implies a side effect that policy must gate.`,
          });
        }

        // Rule 7 — fetch is the ungated path, so it must be provably read-only.
        // isReadOnly fails closed: an unknown operation is never read-only.
        if (step.kind === "fetch" && !isReadOnly(operation)) {
          errors.push({
            severity: "error",
            rule: 7,
            agentId,
            workflowId,
            stepId,
            message: `Fetch step "${stepId}" calls "${String(operation)}", which is not read-only. Side-effecting operations must be act steps so policy can gate them.`,
          });
        }
      }
    }

    // Rule 15 — an agent no outcome claims cannot be reported on.
    if (!referencedAgentIds.has(agentId)) {
      errors.push({
        severity: "warning",
        rule: 15,
        agentId,
        message: `Agent "${agentId}" is not referenced by any business outcome, so the Workspace cannot attribute its work.`,
      });
    }
  }

  return errors;
}

/* ═══════════════════════════ Convenience ═══════════════════════════ */

/** Broadest scope first, so a line reads agent → workflow → step. */
function describeScope(error: PlanValidationError): string {
  const parts: string[] = [];
  if (error.agentId) parts.push(error.agentId);
  if (error.workflowId) parts.push(error.workflowId);
  if (error.stepId) parts.push(error.stepId);
  if (error.capabilityId) parts.push(error.capabilityId);
  if (error.outcomeId) parts.push(error.outcomeId);
  return parts.length > 0 ? `${parts.join(" / ")}: ` : "";
}

/**
 * Throws on any blocking error. Use at the boundaries that must not proceed
 * with an unbuildable plan (fixture loading, the Agent Factory entry point);
 * use validateApprovedPlan directly wherever warnings should be shown too.
 */
export function assertValidPlan(plan: ApprovedPlan): void {
  const blocking = validateApprovedPlan(plan).filter(
    (error) => error.severity === "error",
  );
  if (blocking.length === 0) return;

  const lines = blocking.map(
    (error) => `  [rule ${error.rule}] ${describeScope(error)}${error.message}`,
  );
  throw new Error(
    `Plan failed validation with ${blocking.length} error${blocking.length === 1 ? "" : "s"}:\n${lines.join("\n")}`,
  );
}
