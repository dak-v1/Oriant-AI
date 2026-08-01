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

import type { CompanyReport } from "../../contracts";

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
  created_at: string;
}

// ── agent_configs (extended) ────────────────────────────────────────────────

/**
 * Full current+planned row shape for agent_configs. `agent_type`,
 * `template_id`, `status`, and `required_tools` are confirmed live columns
 * (checked via PostgREST introspection). `runtime_model` is NOT a real
 * column yet — it's stubbed here so downstream code can be written against
 * it now, but a migration
 *   ALTER TABLE agent_configs ADD COLUMN runtime_model text;
 * is required before it can actually be persisted or read from Supabase.
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
  /** NOT YET a real column on agent_configs — see doc comment above. */
  runtime_model?: string;
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

export interface PlanChangeRequest {
  id: string;
  workforce_plan_id: string;
  instruction_text: string;
  diff_preview?: Record<string, unknown>;
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
 * DB row for role_b_handoffs. Column names are snake_case (unlike
 * lib/contracts.ts's RoleBHandoff, which is the camelCase in-memory shape
 * used by the file store). `payload` is typed `unknown` rather than reusing
 * RoleAHandoffEnvelope: the real createRoleBHandoff() pipeline produces a
 * RoleAHandoffEnvelope-shaped payload, but rows can also be seeded (or
 * produced by other paths) with a different ad-hoc shape — e.g. the
 * "internal handoff json" format (`handoff_type`, `raw_inputs`,
 * `structured_findings`, `workflow`) used by
 * components/mock/report/report-data.ts. Callers must narrow/validate
 * before trusting a specific shape.
 */
export interface RoleBHandoffRow {
  id: string;
  external_id: string;
  session_id: string;
  blueprint_version: number;
  idempotency_key: string;
  occurred_at: string;
  status: string;
  payload: unknown;
  created_at: string;
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
