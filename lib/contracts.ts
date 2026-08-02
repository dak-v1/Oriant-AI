import type { RoleAHandoffEnvelope } from "./role-a-to-role-b-contract";

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

export interface SystemEvent {
  id: string;
  at: string;
  scope: "onboarding" | "voice" | "storage" | "integration" | "handoff";
  event: string;
  status: "info" | "completed" | "failed";
  detail?: string;
  sessionId?: string;
  questionId?: string;
}

export type OnboardingChannel = "typed" | "voice";
export type ApprovalPreference =
  | "owner_all"
  | "department_leads"
  | "mixed"
  | "recommend";
export type OnboardingOwnership = "owner_only" | "invite_contributors";
export type WorkflowBuilder = "self" | "invite";
export type BuilderAccess = "workflows_only" | "account_manager";
export type AutomationScope = "start_small" | "focus_area" | "whole_business";
export type OnboardingStatus =
  | "not_started"
  | "in_progress"
  | "awaiting_voice"
  | "voice_in_progress"
  | "review_pending"
  | "approved"
  | "handed_off";
export type OrganizationShape =
  | "solo"
  | "owner_with_team"
  | "multi_role_team"
  | "manager_led";
export type AnswerSource = "typed" | "voice" | "transcript_review" | "system_extract";

export interface DepartmentApproval {
  department: string;
  processOwner: string;
  email: string;
  approver: string;
  setupDelegate: string;
  discoveryStatus: "owner_pending" | "invited" | "completed";
}

export interface OnboardingQuestionDefinition {
  id: string;
  schemaVersion: string;
  section:
    | "company"
    | "organization"
    | "team"
    | "goals"
    | "automation_preferences"
    | "systems"
    | "lean_canvas"
    | "language_consent";
  fieldPath: string;
  typedLabel: string;
  voicePrompt: string;
  helpText?: string;
  required: boolean;
  answerType:
    | "short_text"
    | "long_text"
    | "number"
    | "single_select"
    | "multi_select"
    | "boolean"
    | "structured_list";
  options?: Array<{ value: string; label: string }>;
}

export interface OnboardingAnswer {
  questionId: string;
  fieldPath: string;
  value: string | string[] | boolean | number | DepartmentApproval[];
  source: AnswerSource;
  confirmed: boolean;
  confidence: number;
  updatedAt: string;
}

export interface VoiceTurn {
  id: string;
  questionId: string;
  transcript: string;
  confirmedAnswer?: string;
  status: "captured" | "confirmed";
  createdAt: string;
}

export interface VoiceSession {
  id: string;
  provider: "elevenlabs" | "nosana" | "fixture";
  language: string;
  startedAt: string;
  lastTurnAt: string;
  turns: VoiceTurn[];
}

export interface BusinessBlueprint {
  companySummary: string;
  automationMode?: string;
  organization: {
    shape: OrganizationShape;
    employeeCount?: number;
    approvalOwner?: string;
    approvalPreference?: ApprovalPreference;
    onboardingOwnership?: OnboardingOwnership;
    employeeEmails: string[];
    departmentApprovals: DepartmentApproval[];
  };
  tools: string[];
  language: string;
  consentAccepted: boolean;
}

export interface BusinessBlueprintVersion {
  version: number;
  status: "draft" | "approved";
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  blueprint: BusinessBlueprint;
}

export interface RoleBHandoff {
  id: string;
  idempotencyKey: string;
  occurredAt: string;
  blueprintVersion: number;
  status: "pending" | "ready";
  createdAt: string;
  payload: RoleAHandoffEnvelope;
}

export interface OnboardingSession {
  id: string;
  schemaVersion: string;
  status: OnboardingStatus;
  preferredChannel: OnboardingChannel;
  currentStep: "welcome" | "intro" | "focus" | "tools" | "review";
  progress: number;
  organization: {
    shape: OrganizationShape;
    employeeCount?: number;
    approvalOwner?: string;
    approvalPreference?: ApprovalPreference;
    onboardingOwnership?: OnboardingOwnership;
    employeeEmails: string[];
    departmentApprovals: DepartmentApproval[];
  };
  answers: Record<string, OnboardingAnswer>;
  selectedToolIds: string[];
  consentAccepted: boolean;
  transcriptReviewRequired: boolean;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  voice?: VoiceSession;
  blueprint?: BusinessBlueprintVersion;
  handoff?: RoleBHandoff;
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
  onboarding: {
    activeSessionId: string | null;
    sessions: Record<string, OnboardingSession>;
    questions: OnboardingQuestionDefinition[];
  };
  call: {
    answers: Record<string, string>;
    goals: Record<string, boolean>;
    systems: Record<string, boolean>;
    canvasUploaded: boolean;
    completedAt?: string;
    /**
     * The generated interview, kept for the life of the onboarding session it
     * was written for. `answers` above is keyed by these question ids, so the
     * set must stay stable once anything references it — regenerating on a
     * revisit produced a different set (different ids, another 15–20s LLM
     * wait) and orphaned every saved answer.
     */
    interviewQuestions?: DiscoveryInterviewQuestionSet;
    clarificationQuestions?: DiscoveryClarificationQuestion[];
    clarificationAnswers?: Record<string, string>;
    clarificationCompletedAt?: string;
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
  systemEvents: SystemEvent[];
  providerRuns: ProviderRun[];
}

export interface DiscoveryClarificationQuestion {
  id: string;
  question: string;
  reason: string;
  helperText: string;
  examples: string[];
}

/** One generated interview, bound to the session whose onboarding shaped it. */
export interface DiscoveryInterviewQuestionSet {
  /** The onboarding session id; a new session regenerates, nothing else does. */
  sessionId: string;
  /** Whether AI& wrote the set or the workflow-specific backup stood in. */
  mode: "live" | "fixture";
  /** Same shape as the clarification cards — id, question, reason, helper, examples. */
  questions: DiscoveryClarificationQuestion[];
  /** The provider notice shown when the backup stood in. */
  error?: string;
}

/** Everything the browser is allowed to see (never secrets). */
export type ClientState = Db;
