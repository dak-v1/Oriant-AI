/**
 * Workforce plan cost estimation for the Person B planner backend.
 *
 * Pure computation — no AI& calls, so the {mode, data, error} adapter
 * convention doesn't apply here. Independent of lib/server/orchestrator.ts
 * and app/api/plan/* — nothing here imports either.
 */
import { PlannerError } from "./errors";
import {
  workforcePlans,
  agentConfigs,
  agentTemplates,
  getRoleBHandoffById,
  getApprovedCompanyReport,
} from "./db";
import type { AgentConfigExt, AgentTemplate } from "./types";
import type { CompanyReport } from "../../contracts";

/** USD per 1,000,000 tokens. Confirmed live pricing, given directly for this task. */
const MODEL_RATES: Record<string, { input: number; output: number }> = {
  "deepseek-ai/deepseek-v4-flash": { input: 0.15, output: 0.25 },
  "openai/gpt-oss-120b": { input: 0.15, output: 0.6 },
  "google/gemma-4-31b-it": { input: 0.2, output: 0.5 },
  "qwen/qwen3.6-27b": { input: 0.32, output: 3.2 },
  "zai-org/glm-5.2": { input: 1.0, output: 4.0 },
  "deepseek-ai/deepseek-v4-pro": { input: 1.0, output: 2.5 },
  "moonshotai/kimi-k2.7-code": { input: 0.75, output: 3.5 },
  "moonshotai/kimi-k3": { input: 3.0, output: 12.5 },
};

/**
 * Rough proxy for workflow complexity — more required tools generally means
 * more tool-call round-trips per task. A first-pass estimate; refine with
 * real usage data once agents are actually running.
 */
export function avgToolCallsForAgent(agent: { required_tools?: string[] | null }): number {
  const n = agent.required_tools?.length ?? 0;
  if (n <= 1) return 2;
  if (n <= 3) return 4;
  return 6;
}

const CUSTOM_DEFAULT_INPUT_TOKENS = 2000;
const CUSTOM_DEFAULT_OUTPUT_TOKENS = 800;
/**
 * Ratio used to split a preset template's single combined
 * est_tokens_per_task into input/output, since the schema has no separate
 * output figure. Mirrors the custom default's own 800/2000 = 0.4 ratio —
 * there's no real per-template data to derive this from yet.
 */
const PRESET_OUTPUT_RATIO = 0.4;

export interface AgentCostEstimate {
  monthlyInputTokens: number;
  monthlyOutputTokens: number;
  monthlyLlmCostUsd: number | null;
  composioFeeUsd: null;
  pricingNote?: string;
}

/**
 * Pure, synchronous — takes the already-resolved template (or null for
 * custom agents) rather than fetching it itself, so all I/O stays in
 * estimatePlanCost below.
 */
export function estimateAgentCost(
  agentConfig: Pick<AgentConfigExt, "required_tools" | "runtime_model">,
  template: AgentTemplate | null,
  monthlyVolume: number
): AgentCostEstimate {
  const avgToolCalls = avgToolCallsForAgent(agentConfig);

  const inputTokensPerCall = template?.est_tokens_per_task ?? CUSTOM_DEFAULT_INPUT_TOKENS;
  const outputTokensPerCall = template
    ? Math.round(inputTokensPerCall * PRESET_OUTPUT_RATIO)
    : CUSTOM_DEFAULT_OUTPUT_TOKENS;

  const monthlyInputTokens = inputTokensPerCall * avgToolCalls * monthlyVolume;
  const monthlyOutputTokens = outputTokensPerCall * avgToolCalls * monthlyVolume;

  const rate = agentConfig.runtime_model ? MODEL_RATES[agentConfig.runtime_model] : undefined;
  if (!rate) {
    return {
      monthlyInputTokens,
      monthlyOutputTokens,
      monthlyLlmCostUsd: null,
      composioFeeUsd: null,
      pricingNote: `No pricing data for runtime model "${agentConfig.runtime_model ?? "(none set)"}".`,
    };
  }

  const monthlyLlmCostUsd =
    (monthlyInputTokens / 1_000_000) * rate.input + (monthlyOutputTokens / 1_000_000) * rate.output;

  return { monthlyInputTokens, monthlyOutputTokens, monthlyLlmCostUsd, composioFeeUsd: null };
}

type VolumeSource = "facts" | "processes" | "useCases" | "default";

const CADENCE_PER_MONTH: Record<string, number> = {
  daily: 30,
  weekly: 4,
  biweekly: 2,
  monthly: 1,
  quarterly: 1 / 3,
  annually: 1 / 12,
  yearly: 1 / 12,
};

function extractNumber(text: string): number | null {
  const match = text.replace(/,/g, "").match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

/**
 * Looks for an explicit volume/frequency figure in the report, in order of
 * confidence: a fact literally about volume, then process/use-case
 * frequency fields (either a bare number or a recognizable cadence word).
 * Falls back to 100/month if genuinely nothing is found.
 */
function resolveMonthlyVolume(report: CompanyReport | null): { volume: number; source: VolumeSource } {
  if (report) {
    const volumeFact = report.facts.find((f) => /volume/i.test(f.k));
    if (volumeFact) {
      const n = extractNumber(volumeFact.v);
      if (n !== null) return { volume: n, source: "facts" };
    }

    for (const process of report.processes) {
      const n = extractNumber(process.freq);
      if (n !== null) return { volume: n, source: "processes" };
      const cadence = CADENCE_PER_MONTH[process.freq.trim().toLowerCase()];
      if (cadence !== undefined) return { volume: Math.round(cadence), source: "processes" };
    }

    for (const useCase of report.useCases) {
      const n = extractNumber(useCase.freq);
      if (n !== null) return { volume: n, source: "useCases" };
      const cadence = CADENCE_PER_MONTH[useCase.freq.trim().toLowerCase()];
      if (cadence !== undefined) return { volume: Math.round(cadence), source: "useCases" };
    }
  }

  return { volume: 100, source: "default" };
}

export interface AgentCostRow extends AgentCostEstimate {
  agentConfigId: string;
  agentKey: string;
  runtimeModel: string | null;
}

export interface PlanCostEstimate {
  perAgent: AgentCostRow[];
  totalMonthlyLlmCostUsd: number;
  monthlyVolume: number;
  volumeSource: VolumeSource;
  note: string;
}

export async function estimatePlanCost(workforcePlanId: string): Promise<PlanCostEstimate> {
  const plan = await workforcePlans.get(workforcePlanId);
  if (!plan) throw new PlannerError(404, "Workforce plan not found.");

  const agents = await agentConfigs.listActiveByPlan(workforcePlanId);
  const templates = await agentTemplates.list();
  const templateById = new Map(templates.map((t) => [t.id, t]));

  // Best-effort — no FK backs workforce_plans.role_b_handoff_id, so any hop
  // here can legitimately come back empty; volume just falls back to 100.
  let report: CompanyReport | null = null;
  const handoff = await getRoleBHandoffById(plan.role_b_handoff_id);
  if (handoff) {
    const reportRow = await getApprovedCompanyReport(handoff.session_id);
    report = reportRow?.report ?? null;
  }

  const { volume, source } = resolveMonthlyVolume(report);

  const perAgent: AgentCostRow[] = agents.map((agent) => {
    const template = agent.template_id ? templateById.get(agent.template_id) ?? null : null;
    const estimate = estimateAgentCost(agent, template, volume);
    return {
      agentConfigId: agent.id,
      agentKey: agent.agent_key,
      runtimeModel: agent.runtime_model ?? null,
      ...estimate,
    };
  });

  const totalMonthlyLlmCostUsd = perAgent.reduce((sum, a) => sum + (a.monthlyLlmCostUsd ?? 0), 0);

  return {
    perAgent,
    totalMonthlyLlmCostUsd,
    monthlyVolume: volume,
    volumeSource: source,
    note: "Excludes Composio tool-execution fees and compute-credit buffer — LLM token cost only.",
  };
}
