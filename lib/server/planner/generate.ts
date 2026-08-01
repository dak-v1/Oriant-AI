/**
 * Workforce plan proposal generation for the Person B planner backend.
 *
 * Independent of lib/server/planner.ts (the existing orchestrator-adjacent
 * planner) and lib/server/orchestrator.ts — nothing here imports either.
 * Uses the aiandJson adapter from lib/server/providers/aiand.ts, which
 * already implements the {mode, data, error} live/fixture convention; this
 * module just consumes that honestly rather than re-implementing it.
 */
import { aiandJson } from "../providers/aiand";
import { PlannerError } from "./errors";
import type { AgentTemplate } from "./types";
import type { CompanyReport } from "../../contracts";

export interface AgentProposal {
  templateKeyOrNull: string | null;
  agentKey: string;
  name: string;
  reasoning: string;
  requiredTools: string[];
}

interface AgentPlanResponse {
  agents: AgentProposal[];
}

/**
 * Strict JSON schema for the AI& call. Wrapped in a top-level object
 * (`{agents: [...]}`) rather than a bare array — OpenAI-compatible strict
 * json_schema mode requires an object at the root. Unwrapped immediately
 * after parsing. Every object level uses additionalProperties:false with
 * every property in `required`, matching the convention already used by
 * lib/server/discovery.ts's REPORT_SCHEMA.
 */
const AGENT_PLAN_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["agents"],
  properties: {
    agents: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["templateKeyOrNull", "agentKey", "name", "reasoning", "requiredTools"],
        properties: {
          templateKeyOrNull: { type: ["string", "null"] },
          agentKey: { type: "string" },
          name: { type: "string" },
          reasoning: { type: "string" },
          requiredTools: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

function isAgentProposal(value: unknown): value is AgentProposal {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.templateKeyOrNull === null || typeof v.templateKeyOrNull === "string") &&
    typeof v.agentKey === "string" &&
    v.agentKey.length > 0 &&
    typeof v.name === "string" &&
    v.name.length > 0 &&
    typeof v.reasoning === "string" &&
    Array.isArray(v.requiredTools) &&
    v.requiredTools.every((t) => typeof t === "string")
  );
}

/** Validates structure AND cross-references templateKeyOrNull against real template keys. */
function validateAgentPlanResponse(
  data: unknown,
  templateKeys: Set<string>
): AgentProposal[] | null {
  if (!data || typeof data !== "object") return null;
  const agents = (data as Record<string, unknown>).agents;
  if (!Array.isArray(agents) || agents.length === 0) return null;
  if (!agents.every(isAgentProposal)) return null;
  const proposals = agents as AgentProposal[];
  if (proposals.some((p) => p.templateKeyOrNull !== null && !templateKeys.has(p.templateKeyOrNull))) {
    return null;
  }
  return proposals;
}

function dedupeAgentKeys(proposals: AgentProposal[]): AgentProposal[] {
  const seen = new Map<string, number>();
  return proposals.map((p) => {
    const count = seen.get(p.agentKey) ?? 0;
    seen.set(p.agentKey, count + 1);
    return count === 0 ? p : { ...p, agentKey: `${p.agentKey}_${count + 1}` };
  });
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "agent"
  );
}

/**
 * Deterministic fallback used whenever aiandJson runs in fixture mode
 * (AI& unconfigured, or the live call failed). For each report use case,
 * scores every template by category-keyword overlap with the use case's
 * name/trigger text plus how many of the template's required_tools are in
 * the canonical tool list; best score >= 1 wins as a preset match, else the
 * use case becomes a custom agent stub.
 */
function buildFixtureProposals(
  report: CompanyReport,
  toolIds: string[],
  templates: AgentTemplate[]
): AgentProposal[] {
  const toolSet = new Set(toolIds);
  const useCases = report.useCases.length > 0 ? report.useCases : [{ name: "General automation", trigger: "", freq: "", risk: "Low" as const }];

  return useCases.map((useCase) => {
    const haystack = `${useCase.name} ${useCase.trigger}`.toLowerCase();
    let best: { template: AgentTemplate; score: number } | null = null;

    for (const template of templates) {
      const categoryMatch = haystack.includes(template.category.toLowerCase()) ? 2 : 0;
      const toolOverlap = (template.required_tools ?? []).filter((t) => toolSet.has(t)).length;
      const score = categoryMatch + toolOverlap;
      if (!best || score > best.score) best = { template, score };
    }

    if (best && best.score >= 1) {
      return {
        templateKeyOrNull: best.template.key,
        agentKey: slugify(useCase.name),
        name: useCase.name,
        reasoning: `Matched to template "${best.template.key}" (category "${best.template.category}", ${best.score} points of category/tool overlap).`,
        requiredTools: best.template.required_tools ?? [],
      };
    }

    return {
      templateKeyOrNull: null,
      agentKey: slugify(useCase.name),
      name: useCase.name,
      reasoning: "No preset template scored a confident match — proposed as a custom agent pending a design call.",
      requiredTools: [],
    };
  });
}

export async function proposeAgentPlan(input: {
  report: CompanyReport;
  toolIds: string[];
  templates: AgentTemplate[];
}): Promise<AgentProposal[]> {
  const templateKeys = new Set(input.templates.map((t) => t.key));
  const fixture: AgentPlanResponse = { agents: buildFixtureProposals(input.report, input.toolIds, input.templates) };

  const templateSummary = input.templates
    .map((t) => `- ${t.key} (${t.category}): requires ${(t.required_tools ?? []).join(", ") || "no tools"}`)
    .join("\n");

  const system = [
    "You design a workforce plan for an AI operations platform.",
    "Given a company's use cases, processes, pain points, and connected tools,",
    "propose one agent per use case. If an existing agent template is a good",
    "match (by category and required-tools overlap with the connected tool",
    "list), propose that template by its exact key. Otherwise propose a",
    "custom agent with templateKeyOrNull set to null.",
    "Only use template keys from the provided list — never invent one.",
  ].join(" ");

  const user = [
    `Executive summary: ${input.report.exec}`,
    `Facts: ${input.report.facts.map((f) => `${f.k}: ${f.v}`).join("; ")}`,
    `Processes: ${input.report.processes.map((p) => `${p.name} (trigger: ${p.trigger}, systems: ${p.systems})`).join("; ")}`,
    `Pain points: ${input.report.pain.map((p) => `${p.t}: ${p.detail}`).join("; ")}`,
    `Use cases: ${input.report.useCases.map((u) => `${u.name} (trigger: ${u.trigger}, risk: ${u.risk})`).join("; ")}`,
    `Connected tool IDs: ${input.toolIds.join(", ") || "none"}`,
    "Available templates:",
    templateSummary,
  ].join("\n");

  const call = () =>
    aiandJson<AgentPlanResponse>({
      operation: "workforce_plan_generation",
      system,
      user,
      schemaName: "agent_plan_proposals",
      schema: AGENT_PLAN_SCHEMA,
      fixture,
    });

  const first = await call();
  let validated = validateAgentPlanResponse(first.data, templateKeys);

  if (!validated) {
    if (first.mode === "live") {
      const retry = await call();
      validated = validateAgentPlanResponse(retry.data, templateKeys);
    }
    if (!validated) {
      throw new PlannerError(502, "AI& returned an invalid plan proposal after retry.");
    }
  }

  return dedupeAgentKeys(validated);
}
