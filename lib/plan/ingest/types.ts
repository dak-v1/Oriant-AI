/**
 * lib/plan/ingest/types.ts — what Role B actually sends, and what we have to
 * admit we invented when turning it into an ApprovedPlan.
 *
 * THE SITUATION THIS MODULE EXISTS FOR. docs/PLAN_CONTRACT.md was a proposal;
 * Role B's backend shipped a different shape. Their handoff document names the
 * gap in its own words: *"the original business discovery interview often
 * captures real approval boundaries … but this data currently is not wired into
 * any agent's config — it's not in this payload."*
 *
 * Role C's entire product is the approval interrupt, and the approval interrupt
 * is driven by `AgentPolicy`. So the field that decides whether an agent may
 * touch a customer unattended is precisely the field that does not arrive.
 *
 * Two ways to respond. Invent a policy that looks plausible, or default to the
 * one posture that is safe when you know nothing and SAY SO. This module does
 * the second, and `IngestGap` is the saying-so: every assumption is recorded,
 * attributed to the agent it affects, and surfaced to the owner before anything
 * runs. An adapter that quietly filled in `auto_within_limits` would be the
 * single most dangerous file in the repository.
 */

/** The payload Role B's `GET /api/planner/:id/handoff` returns. */
export interface WorkforceHandoffPayload {
  handoff_type: "workforce_plan";
  generated_at: string;
  organization: { id: string; external_key: string; name: string };
  workforce_plan: {
    id: string;
    version: number;
    current_version: number;
    status: string;
    plan: Record<string, unknown>;
    approved_by?: string | null;
    approved_at?: string | null;
  };
  agents: Array<{
    agent_key: string;
    agent_type: string;
    template_id?: string | null;
    status: string;
    config: Record<string, unknown>;
    runtime_model?: string;
    required_tools: string[];
  }>;
  integrations: Array<{
    tool_key: string;
    provider: string;
    status: string;
    external_connection_id?: string;
    connected_at?: string;
  }>;
}

/**
 * The structured interview a custom agent carries in `config.spec`. Every field
 * is prose written for a human, which is exactly why none of it can become a
 * guardrail: `forbidden: "never issue a refund"` is a sentence, and a sentence
 * cannot gate a tool call. It becomes prompt guidance, and the guardrail is
 * derived from the operation registry instead.
 */
export interface CustomAgentSpec {
  objective?: string;
  trigger?: string;
  inputs?: string;
  rules?: string;
  tools?: string;
  forbidden?: string;
  success?: string;
  notes?: Record<string, string>;
}

/* ═══════════════════════════ Gaps ═══════════════════════════ */

export type GapSeverity =
  /** The workforce cannot run correctly until a human answers this. */
  | "blocking"
  /** It will run, safely, but less capably than the owner probably intends. */
  | "degraded"
  /** Worth knowing; no behavioural consequence. */
  | "note";

export type GapCode =
  | "policy_absent"
  | "steps_synthesised"
  | "trigger_not_scheduled"
  | "operations_inferred"
  | "approval_owner_unresolved"
  | "outcomes_absent"
  | "integration_not_connected"
  | "unknown_tool"
  | "template_behaviour_unavailable"
  | "plan_stale";

export interface IngestGap {
  code: GapCode;
  severity: GapSeverity;
  agentId?: string;
  /** What was assumed, in the owner's language. */
  message: string;
  /** What would remove the assumption. Always actionable, never "TODO". */
  resolution: string;
}

export interface IngestResult {
  /** Valid against lib/plan/validate.ts, or the gaps say why it is not. */
  plan: import("../types").ApprovedPlan;
  gaps: IngestGap[];
  /** True when nothing blocking was recorded. */
  runnable: boolean;
  /** Per-agent summary, for the ingest screen. */
  summary: Array<{
    agentId: string;
    sourceKey: string;
    agentType: string;
    operatingMode: string;
    grantedOperations: number;
    writeOperations: number;
  }>;
}
