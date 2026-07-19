/**
 * Shared data contracts — the objects that keep every phase versioned,
 * asynchronous and independently testable (blueprint §21).
 *
 * Rule of the house: AI drafts, code controls the lifecycle. These shapes are
 * what the deterministic Orchestration Controller stores and validates;
 * model output is parsed into them and never trusted raw.
 */

export type ProviderName = "aiand" | "nosana" | "doubleword" | "daytona";
export type ProviderMode = "live" | "fixture";

export interface ProviderRun {
  id: string;
  provider: ProviderName;
  operation: string;
  status: "completed" | "failed" | "running";
  mode: ProviderMode;
  at: string;
  detail?: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  subject: string;
  detail?: string;
}

/* ── Phase 1 — the company brief ─────────────────────────────────────────── */

export interface ReportFact { k: string; v: string }
export interface CanvasBlock { label: string; body: string; dot: string }
export interface ReportProcess { name: string; trigger: string; systems: string; freq: string; owner: string }
export interface ReportSystem { name: string; use: string; status: "Connected" | "Ready to connect" | "Needs auth" | "Not connected" }
export interface PainPoint { t: string; detail: string }
export interface UseCase { name: string; trigger: string; freq: string; risk: "Low" | "Medium" | "High" }
export interface HistoryEntry { v: string; t: string }

export interface CompanyReport {
  version: number;
  status: "draft" | "approved";
  approvedBy?: string;
  approvedAt?: string;
  exec: string;
  facts: ReportFact[];
  canvas: CanvasBlock[];
  processes: ReportProcess[];
  systems: ReportSystem[];
  pain: PainPoint[];
  useCases: UseCase[];
  constraints: string[];
  history: HistoryEntry[];
}

/* ── Phase 2 — the workforce plan ────────────────────────────────────────── */

export type AgentStatus =
  | "recommended"       // suggested, not in the plan
  | "needs-info"        // custom agent awaiting its design call
  | "needs-config"      // preset awaiting configuration
  | "needs-integration" // required system not connected
  | "ready";            // ready to build

export interface AgentConfig {
  mode: "draft" | "routine" | "approval";
  channels: Record<string, boolean>;
  knowledge: Record<string, boolean>;
  approvals: Record<string, boolean>;
  target: string;
  hours: string;
  escalation: string;
  retry: string;
}

/** Answers captured by the Tier-2 custom design call — becomes the AgentSpec. */
export interface AgentSpecAnswers {
  objective: string;
  trigger: string;
  inputs: string;
  rules: string;
  tools: string;
  forbidden: string;
  success: string;
  materials: string[];
}

export interface AgentDef {
  id: string;
  name: string;
  role: string;
  tag: "Preset" | "Custom";
  desc: string;
  price: number;
  integ: string[];
  approval: string;
  covers: string;
  fit: string;
  inPlan: boolean;
  status: AgentStatus;
  /** the status this agent returns to when (re-)added to the plan */
  base: AgentStatus;
  config?: AgentConfig;
  spec?: AgentSpecAnswers;
}

export interface PlanDiff {
  title: string;
  price: string;
  risk: string;
  kind: "add" | "remove" | "note" | "addboth";
  id: string;
}

export interface WorkflowPlan {
  version: number;
  status: "draft" | "approved";
  sourceReportVersion: number;
  stale: boolean;
  baseFee: number;
  team: AgentDef[];
  approvedAt?: string;
}

/* ── Build, validation, deployment ───────────────────────────────────────── */

export interface BuildJob {
  agentId: string;
  status: "queued" | "running" | "completed" | "failed";
  pct: number;
  wave: number;
  /** the approved plan version this job was started from */
  sourcePlanVersion: number;
  providerJobId?: string;
  mode: ProviderMode;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export interface ArtifactFile { path: string; type: string; content: string }

export interface ArtifactBundle {
  agentId: string;
  artifactVersion: string;
  sourcePlanVersion: number;
  files: ArtifactFile[];
  requiredIntegrations: string[];
  warnings: string[];
  mode: ProviderMode;
}

export interface ValidationRun {
  agentId: string;
  sandboxId: string;
  status: "validated" | "failed" | "running";
  tests: { passed: number; failed: number };
  securityChecks: Record<string, "passed" | "failed">;
  artifactHash: string;
  warnings: string[];
  mode: ProviderMode;
}

export interface Deployment {
  id: string;
  status: "ready" | "active";
  sourcePlanVersion: number;
  activatedAt?: string;
}

/* ── Operations ──────────────────────────────────────────────────────────── */

export interface ApprovalRequest {
  id: string;
  agent: string;
  title: string;
  summary: string;
  risk: "Low" | "Medium" | "High";
  due: string;
  status: "required" | "approved" | "done" | "rejected";
  amount: string;
  comments: string[];
}

export interface FeedEvent { t: string; who: string; msg: string; tone: "done" | "wait" | "ember" }

export interface CalendarMark { day: number; today?: boolean; color?: "ember" | "ochre" | "forest" | "done" }

/* ── The whole persisted world ───────────────────────────────────────────── */

export type Phase =
  | "onboarding"     // call in progress
  | "report_draft"
  | "report_approved"
  | "plan_draft"
  | "plan_approved"
  | "building"
  | "built"
  | "validating"
  | "validated"
  | "active";

export interface Db {
  org: { name: string; owner: string; initials: string };
  phase: Phase;
  call: {
    answers: Record<string, string>;
    goals: Record<string, boolean>;
    systems: Record<string, boolean>;
    canvasUploaded: boolean;
    completedAt?: string;
  };
  report: CompanyReport | null;
  plan: WorkflowPlan | null;
  /** previous plan snapshots, newest last — powers server-side undo (§13.5) */
  planHistory: WorkflowPlan[];
  buildJobs: Record<string, BuildJob>;
  artifacts: Record<string, ArtifactBundle>;
  validations: Record<string, ValidationRun>;
  deployment: Deployment | null;
  approvals: ApprovalRequest[];
  events: FeedEvent[];
  calendar: { month: string; marks: CalendarMark[] };
  audit: AuditEvent[];
  providerRuns: ProviderRun[];
}

/** Everything the browser is allowed to see (never secrets). */
export type ClientState = Db;
