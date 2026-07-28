/**
 * lib/runtime/factory.ts — the deterministic spec compiler.
 *
 * The Agent Factory (ROLE_C_PLAN M2) turns an approved `AgentSpec` into a
 * runnable `AgentPackage`. Because the runtime interprets the plan's steps
 * rather than executing generated code, "compiling" means:
 *
 *   - assembling the prompts a `reason` step will run against,
 *   - flattening every ToolGrant into one allowlist the executor checks,
 *   - producing a stable checksum over the inputs.
 *
 * This local compiler is the DEFAULT and needs no provider key. A
 * model-driven compiler (Doubleword) can later produce richer prompts, but it
 * must emit the same structure and satisfy the same equivalence test: the same
 * spec compiled twice yields the same checksum, and a package built either way
 * must produce identical runtime behaviour (M2 exit criterion).
 *
 * Nothing here calls a clock or a random source: `builtAt` is supplied by the
 * caller so sandbox builds are reproducible.
 */

import type { AgentSpec, WorkflowSpec } from "../plan/types";
import { getOperation } from "../plan/operations";
import type { AgentBundle, AgentPackage, CompiledWorkflow } from "./types";

/* ═══════════════════════════ Prompts ═══════════════════════════ */

/**
 * The system prompt is assembled from `guidance` — the contract's prose half.
 * The structural half (limits, grants, forbidden operations) is deliberately
 * NOT restated as instructions: those are enforced by policy.ts outside the
 * model, and telling the model about them invites it to believe it is the one
 * enforcing them.
 *
 * The operations are listed because the model needs to know what it may
 * propose; the wording makes clear that permission is checked elsewhere.
 */
export function buildSystemPrompt(spec: AgentSpec): string {
  const lines: string[] = [
    `You are ${spec.name}, an AI agent working for a small business.`,
    `Your role: ${spec.role}`,
    "",
    `Objective: ${spec.guidance.objective}`,
    "",
    `Business context: ${spec.guidance.businessContext}`,
  ];

  if (spec.guidance.tone) {
    lines.push("", `Tone: ${spec.guidance.tone}`);
  }

  if (spec.guidance.examples?.length) {
    lines.push("", "Worked examples:");
    for (const example of spec.guidance.examples) lines.push(`- ${example}`);
  }

  if (spec.capabilities.length) {
    lines.push("", "You are able to:");
    for (const capability of spec.capabilities) {
      lines.push(`- ${capability.name}: ${capability.description}`);
    }
  }

  const operations = flattenOperations(spec);
  if (operations.length) {
    lines.push("", "Actions you may propose:");
    for (const id of operations) {
      const def = getOperation(id);
      lines.push(`- ${id}${def ? ` (${def.description})` : ""}`);
    }
  }

  lines.push(
    "",
    "Every action you propose is checked against the owner's approval rules",
    "before it happens. Some actions will be paused for the owner to approve.",
    "That is expected: propose the right action and explain your reasoning.",
    "Never claim an action has been performed. Report only what you decided.",
  );

  return lines.join("\n");
}

/** Per-workflow prompt fragment prepended to each of its `reason` steps. */
export function buildWorkflowPrompt(workflow: WorkflowSpec): string {
  const lines = [
    `Workflow: ${workflow.name}`,
    workflow.description,
    "",
    `Trigger: ${workflow.trigger.label}`,
    "",
    "Steps in this workflow:",
  ];
  workflow.steps.forEach((step, index) => {
    lines.push(`${index + 1}. [${step.kind}] ${step.instruction}`);
  });
  lines.push(
    "",
    `A successful run means: ${workflow.output.successCriteria}`,
  );
  return lines.join("\n");
}

/* ═══════════════════════════ Compilation ═══════════════════════════ */

export function flattenOperations(spec: AgentSpec): string[] {
  const seen = new Set<string>();
  for (const grant of spec.tools) {
    for (const operation of grant.operations) seen.add(operation);
  }
  // Sorted so the allowlist and checksum are order-independent.
  return [...seen].sort();
}

export interface CompileOptions {
  /** Supplied by the caller so builds are reproducible. */
  builtAt: string;
}

export function compileAgent(spec: AgentSpec, options: CompileOptions): AgentPackage {
  const workflows: CompiledWorkflow[] = spec.workflows.map((workflow) => ({
    workflowId: workflow.id,
    name: workflow.name,
    enabled: workflow.enabled,
    prompt: buildWorkflowPrompt(workflow),
    steps: workflow.steps,
    output: workflow.output,
  }));

  const allowedOperations = flattenOperations(spec);

  return {
    agentId: spec.id,
    agentVersion: spec.version,
    builtAt: options.builtAt,
    systemPrompt: buildSystemPrompt(spec),
    workflows,
    allowedOperations,
    checksum: checksumOf(spec),
  };
}

/** Compile a spec and pair it with the spec for the executor. */
export function bundleAgent(spec: AgentSpec, options: CompileOptions): AgentBundle {
  return { spec, pkg: compileAgent(spec, options) };
}

/* ═══════════════════════════ Checksum ═══════════════════════════ */

/**
 * FNV-1a over a canonical serialisation. Deliberately dependency-free and
 * runtime-agnostic (no node:crypto), so the same checksum is produced in a
 * route handler, an edge function or a test.
 *
 * `builtAt` is excluded: two builds of the same spec at different times must
 * agree, otherwise the M2 equivalence test can never pass.
 */
export function checksumOf(spec: AgentSpec): string {
  const canonical = stableStringify({
    id: spec.id,
    version: spec.version,
    role: spec.role,
    guidance: spec.guidance,
    capabilities: spec.capabilities,
    tools: spec.tools,
    policy: spec.policy,
    workflows: spec.workflows,
  });

  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    // 32-bit FNV prime multiply, kept in range with Math.imul.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a-${hash.toString(16).padStart(8, "0")}`;
}

/** Key-sorted JSON so property order can never change the checksum. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}
