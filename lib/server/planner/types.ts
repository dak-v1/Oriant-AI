/**
 * Types for the Person B planner/integrations backend.
 *
 * These describe tables confirmed live in Supabase via a PostgREST schema
 * introspection on 2026-08-01 (`GET {url}/rest/v1/`). None of them exist in
 * supabase/migrations/*.sql or the other supabase/*.sql files in this repo —
 * they were created directly against the database. Track that gap
 * separately; it's not addressed here.
 *
 * Deliberately independent of app/api/plan/* and lib/server/orchestrator.ts —
 * nothing here imports from either.
 */

import type { CompanyReport, DepartmentApproval } from "../../contracts";

// ── agent_templates ────────────────────────────────────────────────────────

export interface AgentTemplate {
  id: string;
  key: string;
  name: string;
  category: string;
  description?: string;
  objective?: string;
  default_channels?: string[];
  template_files: Record<string, unknown>;
  config_schema: Record<string, unknown>;
  est_tokens_per_task?: number;
  required_tools?: string[];
  /** Added to the live table in Step 2 (scripts/seed-agent-templates.ts) — was missing from this type until now. */
  default_runtime_model?: string;
  created_at: string;
}

// ── agent_configs (extended) ────────────────────────────────────────────────

/**
 * Full row shape for agent_configs. All fields below are confirmed live
 * columns (checked via PostgREST introspection, most recently while adding
 * `archived_at`). `runtime_model` was added and backfilled in an earlier
 * task — it's a real, populated column now, not a stub.
 */
export interface AgentConfigExt {
  id: string;
  workforce_plan_id: string;
  agent_key: string;
  config: Record<string, unknown>;
  created_at: string;
  agent_type: string;
  template_id?: string;
  status: string;
  required_tools?: string[];
  runtime_model?: string;
  /**
   * Soft-delete marker. Agent removal is ALWAYS a soft delete (never a hard
   * DELETE) — undo/redo and agent_design_sessions/turns depend on stable
   * row ids. `null`/absent means active; set means removed from the plan.
   */
  archived_at?: string | null;
}

// ── integration_connections ─────────────────────────────────────────────────

export interface IntegrationConnection {
  id: string;
  organization_id: string;
  tool_key: string;
  provider: string;
  external_connection_id?: string;
  status: string;
  required_by_agent_keys?: string[];
  connected_at?: string;
  created_at: string;
}

// ── role_c_handoffs ──────────────────────────────────────────────────────────

export interface RoleCHandoff {
  id: string;
  external_id?: string;
  organization_id: string;
  workforce_plan_id: string;
  idempotency_key: string;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
}

// ── agent_design_sessions / agent_design_turns ──────────────────────────────

export interface AgentDesignSession {
  id: string;
  agent_config_id: string;
  status: string;
  created_at: string;
  completed_at?: string;
}

export interface AgentDesignTurn {
  id: string;
  design_session_id: string;
  question_id: string;
  transcript?: string;
  confirmed_answer?: string;
  source: string;
  created_at: string;
}

// ── plan_change_requests ─────────────────────────────────────────────────────

/**
 * One proposed mutation from the refinement chat. `configPatch` here is the
 * final, already-parsed shape — see lib/server/planner/chat.ts for why the
 * AI& wire format carries it as a JSON string instead (strict json_schema
 * mode doesn't accommodate a genuinely free-form nested object).
 */
export interface DiffOp {
  op: "add" | "remove" | "reconfigure";
  agentKey: string;
  templateKeyOrNull?: string | null;
  configPatch?: Record<string, unknown>;
  reasoning: string;
}

export interface DiffPreviewOp extends DiffOp {
  /** Human-readable one-liner, e.g. "Remove agent \"x\"." */
  summary: string;
}

export interface PlanChangeRequest {
  id: string;
  workforce_plan_id: string;
  instruction_text: string;
  diff_preview?: { ops: DiffPreviewOp[] } | null;
  applied: boolean;
  created_at: string;
}

// ── row wrappers for existing Role A tables, needed for db.ts's return types ─

export interface OrganizationRow {
  id: string;
  external_key: string;
  name: string;
  approval_owner?: string;
  shape: string;
  employee_count?: number;
  created_at: string;
  updated_at: string;
}

export interface OnboardingSessionRow {
  id: string;
  external_id: string;
  organization_id: string;
  preferred_channel: string;
  status: string;
  current_step: string;
  progress: number;
  consent_accepted: boolean;
  transcript_review_required: boolean;
  schema_version: string;
  blueprint_version?: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

/**
 * A single entry in raw_inputs.onboarding.answers, as built by
 * onboardingAnswerPayload() in lib/server/discovery-handoff.ts.
 */
export interface DiscoveryHandoffAnswerEntry {
  field_path: string;
  value: unknown;
  source: string;
  confirmed: boolean;
  confidence: number;
  updated_at: string;
}

/**
 * Exact shape produced by buildDiscoveryHandoff() in
 * lib/server/discovery-handoff.ts — confirmed by reading that function
 * directly (not from a secondhand description). This is what's written
 * unchanged into role_b_handoffs.payload by mirrorDiscoveryHandoffToSupabase()
 * (lib/server/onboarding-supabase.ts).
 *
 * There is deliberately no top-level `workflow` key — that field only
 * appears on ad-hoc/manually-seeded rows and is not part of the real output.
 *
 * NOTE: this is a compile-time contract, not a runtime validator. Legacy
 * rows (written before this shape existed) or manually-seeded test rows may
 * not actually conform — code reading `payload` should still narrow/guard
 * defensively (see getCanonicalToolIds in db.ts).
 */
export interface DiscoveryHandoffPayload {
  handoff_type: "discovery_findings";
  generated_at: string;
  raw_inputs: {
    company_name: string;
    onboarding: {
      session_id: string | null;
      answers: Record<string, DiscoveryHandoffAnswerEntry>;
      intro: string | null;
      organization_shape: string | null;
      employee_count: number | string | null;
      workflow_builder: unknown;
      builder_access: unknown;
      approval_preference: string | null;
      onboarding_ownership: string | null;
      automation_scope: unknown;
      automation_mode: unknown;
      business_area: string | null;
      repetitive_task: string | null;
      current_workflow: string | null;
      /**
       * Always present as an array (possibly empty) — built from the
       * selected_tools + custom_tools onboarding answers combined, NOT the
       * raw selected_tools answer alone. The exact same array is reused for
       * structured_findings.workflow_summary.tools below, so the two are
       * always identical to each other.
       */
      selected_tools: string[];
      employee_emails: string[];
      department_approvals: DepartmentApproval[];
      /** Present only when organization.shape !== "solo". */
      approval_owner?: string | null;
    };
    interview: {
      answered_count: number;
      completed: boolean;
      answers: Record<string, string>;
      clarification_answers: Record<string, string>;
      clarification_questions: unknown[];
      clarification_completed_at: string | null;
    };
    voice: { provider: string; language: string; turns: unknown[] } | null;
    report_meta: {
      version: number | null;
      status: string;
      server_report: CompanyReport | null;
    };
  };
  structured_findings: {
    business_context: {
      company_name: string;
      company_intro: string | null;
      organization_shape: string | null;
      employee_count: number | null;
      focus_area: string | null;
    };
    workflow_summary: {
      workflow_name: string | null;
      current_workflow_summary: string | null;
      trigger: string | null;
      ordered_steps: string[];
      inputs: string[];
      outputs: string[];
      handoffs: string[];
      /** Same array as raw_inputs.onboarding.selected_tools — see note there. */
      tools: string[];
      human_only_decisions: string[];
    };
    missing_information: string[];
    clarification_answers: Record<string, string>;
    confidence: number;
  };
}

/**
 * DB row for role_b_handoffs. Column names are snake_case (unlike
 * lib/contracts.ts's RoleBHandoff, which is the camelCase in-memory shape
 * used by the file store).
 *
 * `report_version` is the real, currently-used version column — confirmed
 * via the live write path (mirrorDiscoveryHandoffToSupabase in
 * lib/server/onboarding-supabase.ts), which sets `report_version:
 * db.report.version` and explicitly `blueprint_version: null` on every new
 * insert. `blueprint_version` is legacy: kept nullable on the table for
 * pre-existing rows, but no longer populated.
 */
export interface RoleBHandoffRow {
  id: string;
  external_id: string;
  session_id: string;
  handoff_type: string;
  report_version?: number | null;
  /** Legacy column — deliberately null on every current insert. See doc comment above. */
  blueprint_version?: number | null;
  idempotency_key: string;
  occurred_at: string;
  status: string;
  payload: DiscoveryHandoffPayload;
  payload_hash?: string | null;
  consumed_at?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * DB row for company_reports. `report` reuses lib/contracts.ts's
 * CompanyReport type — a pure data-shape import, not orchestrator logic —
 * since that's what's actually stored in the jsonb column.
 */
export interface CompanyReportRow {
  id: string;
  session_id: string;
  version: number;
  status: string;
  approved_by?: string;
  approved_at?: string;
  report: CompanyReport;
  created_at: string;
  updated_at: string;
}

// ── workforce_plans ──────────────────────────────────────────────────────────

/**
 * DB row for workforce_plans. Confirmed live via PostgREST introspection —
 * note organization_id and role_b_handoff_id have NO foreign key constraints
 * (checked separately; see the FK audit elsewhere in this plan file), so
 * nothing here enforces referential integrity beyond application code.
 */
export interface WorkforcePlanRow {
  id: string;
  role_b_handoff_id: string;
  organization_id: string;
  version: number;
  status: string;
  plan: Record<string, unknown>;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at: string;
  /**
   * Undo/redo pointer — separate from `version` above (which is set once at
   * creation and never changes for this plan's lifetime so far). Starts at
   * 1; bumped by /chat/apply, moved by /undo and /redo.
   */
  current_version: number;
}

// ── workforce_plan_snapshots ─────────────────────────────────────────────────

/**
 * A point-in-time checkpoint for undo/redo. `agent_configs_snapshot` holds
 * full AgentConfigExt rows (active agents only, at the moment of
 * snapshotting) — reusing the structured type here since we control the
 * jsonb contents, same reasoning as CompanyReportRow.report elsewhere.
 */
export interface WorkforcePlanSnapshotRow {
  id: string;
  workforce_plan_id: string;
  version: number;
  plan_snapshot: Record<string, unknown>;
  agent_configs_snapshot: AgentConfigExt[];
  created_at: string;
}

// ── agent design-call spec ──────────────────────────────────────────────────

/**
 * Synthesized answer set from a custom agent's design call, stored under
 * agent_configs.config.spec. Deliberately NOT imported from
 * lib/contracts.ts's AgentSpecAnswers (even though the field names match
 * what was asked for) — keeps this backend's config shape self-defined
 * rather than coupled to the old orchestrator-adjacent type.
 */
export interface AgentSpec {
  objective?: string;
  trigger?: string;
  inputs?: string;
  rules?: string;
  tools?: string;
  forbidden?: string;
  success?: string;
  /** Answers from extra clarification-round questions that aren't one of the 7 known fields. */
  notes?: Record<string, string>;
}
