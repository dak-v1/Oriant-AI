/**
 * lib/mock/types.ts — shared contracts for the Oriant.ai hardcoded product mock.
 *
 * Single source of truth for every fixture, service, store slice and screen
 * (spec §23). Everything here must stay JSON-serialisable for server responses:
 * no Dates, no functions, no class instances — ISO strings and plain unions only.
 */

/* ══════════════════════════════ Journey ══════════════════════════════ */

/** Linear journey states (spec §5). Per-object flags cover blocked/failed. */
export type JourneyState =
  | "not_started"
  | "onboarding"
  | "discovery"
  | "report_review"
  | "report_approved"
  | "planning"
  | "plan_review"
  | "agent_configuration"
  | "plan_approved"
  | "building"
  | "sandbox_ready"
  | "validation_review"
  | "ready_to_activate"
  | "activating"
  | "active_workspace";

/* ═══════════════════════════ Onboarding ═══════════════════════════ */

export type AutomationMode = "assist" | "operate" | "unsure";
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
export type OrganizationShape =
  | "solo"
  | "owner_with_team"
  | "multi_role_team"
  | "manager_led";

export interface DepartmentApproval {
  department: string;
  processOwner: string;
  email: string;
  approver: string;
  setupDelegate: string;
  discoveryStatus: "owner_pending" | "invited" | "completed";
}

export interface ToolChip {
  id: string;
  name: string;
  category: ToolCategory;
  iconSlug?: string;
  iconColor?: string;
}

export type ToolCategory =
  | "communication"
  | "scheduling"
  | "crm"
  | "finance"
  | "storage"
  | "marketing"
  | "collaboration"
  | "commerce"
  | "project"
  | "other";

export interface CompanyProfile {
  name: string;
  industry: string;
  location: string;
  businessModel: string;
  teamSize: number;
  monthlyVolume: string;
  teams: string[];
  primaryGoal: string;
  alwaysApprove: string[];
  neverAutomate: string[];
  painPoints: string[];
}

/** Owner-added tool that is not in the catalog (improvement spec §7.2). */
export interface CustomTool {
  id: string;
  name: string;
  category: ToolCategory | "other";
  purpose: string;
}

export interface OnboardingState {
  channel: OnboardingChannel;
  /** True while the single-call onboarding experience is in progress. */
  callInProgress: boolean;
  backendSessionId: string | null;
  mode: AutomationMode | null;
  usedDemoCompany: boolean;
  /** Owner's opening answer (voice sim or typed). */
  intro: string;
  organizationShape: OrganizationShape;
  approvalPreference: ApprovalPreference | null;
  onboardingOwnership: OnboardingOwnership | null;
  workflowBuilder: WorkflowBuilder | null;
  builderAccess: BuilderAccess | null;
  automationScope: AutomationScope | null;
  businessArea: string;
  repetitiveTask: string;
  currentWorkflow: string;
  employeeCount: string;
  approvalOwner: string;
  employeeEmails: string[];
  departmentApprovals: DepartmentApproval[];
  selectedToolIds: string[];
  /** Owner-added tools outside the catalog ("Custom" badge). */
  customTools: CustomTool[];
  /** Which onboarding summary sections have content (spec §7.2). */
  capturedSections: string[];
  consentAccepted: boolean;
  completed: boolean;
  blueprintVersion: number | null;
  blueprintStatus: "idle" | "draft" | "approved";
  handoffId: string | null;
  syncStatus: "idle" | "saving" | "saved" | "error";
  syncError: string | null;
}

/* ═══════════════════════════ Lean Canvas ═══════════════════════════ */

export type LeanCanvasBlockId =
  | "problem"
  | "customer-segments"
  | "unique-value-proposition"
  | "solution"
  | "channels"
  | "revenue-streams"
  | "cost-structure"
  | "key-metrics"
  | "unfair-advantage";

export interface LeanCanvasBlockDef {
  id: LeanCanvasBlockId;
  title: string;
  /** One focused question (spec §8.2). */
  question: string;
  guidance: string;
  /** Industry-relevant examples. */
  examples: string[];
  /** Hardcoded demo answer (BrightPath). */
  demoValue: string;
  /** Hardcoded "Improve wording with AI" suggestion for demoValue. */
  improvedValue: string;
}

export interface LeanCanvasState {
  /** How the canvas was produced. */
  source: "upload" | "guided" | null;
  /** Current values keyed by block id (start = demo fixture after upload/guided). */
  values: Partial<Record<LeanCanvasBlockId, string>>;
  completed: boolean;
}

/* ═══════════════════════════ Knowledge model ═══════════════════════════ */

export type Provenance =
  | "owner_confirmed"
  | "uploaded_document"
  | "selected_tool"
  | "employee_response"
  | "oriant_assumption";

export type KnowledgeSection =
  | "company"
  | "team"
  | "goals"
  | "processes"
  | "systems"
  | "rules"
  | "assumptions"
  | "gaps"
  | "opportunities";

export interface KnowledgeFact {
  id: string;
  section: KnowledgeSection;
  label: string;
  value: string;
  provenance: Provenance;
  /** 0–1. Render as subtle indicator, never as false certainty. */
  confidence: number;
  confirmed: boolean;
}

/* ═══════════════════════════ Discovery interview ═══════════════════════════ */

export interface DiscoveryQuestion {
  id: string;
  question: string;
  /** "Why Oriant asks" helper line. */
  reason: string;
  /** Hardcoded owner answer revealed word-by-word. */
  answer: string;
  /** Facts unlocked when this answer is confirmed. */
  factIds: string[];
  /** Knowledge sections that pulse when confirmed. */
  sections: KnowledgeSection[];
  helperText?: string;
  examples?: string[];
}

export type DiscoveryMode = "voice" | "text" | "cards" | "upload" | "invite";

export interface DiscoveryState {
  mode: DiscoveryMode;
  /** Index of the next unanswered question. */
  currentIndex: number;
  /** questionId → confirmed answer text (possibly owner-edited). */
  answers: Record<string, string>;
  clarificationAnswers?: Record<string, string>;
  clarificationQuestions?: Array<{ id: string; question: string }>;
  /** ids of facts added so far (accumulates via confirmations + uploads). */
  factIds: string[];
  /** Simulated SOP upload done (adds bonus facts). */
  uploadedMore: boolean;
  /** Simulated employee invite done (adds bonus facts). */
  invitedEmployee: boolean;
  completed: boolean;
}

/* ═══════════════════════════ Company report ═══════════════════════════ */

export type ReportSectionId =
  | "company-overview"
  | "lean-canvas-summary"
  | "team-structure"
  | "current-processes"
  | "business-goals"
  | "bottlenecks"
  | "existing-systems"
  | "automation-preference"
  | "approval-restrictions"
  | "assumptions"
  | "missing-information"
  | "potential-opportunities";

export type ReportSectionStatus = "draft" | "confirmed" | "rejected";

export interface ReportEvidence {
  /** e.g. "Interview answer 3" / "Uploaded canvas". */
  source: string;
  provenance: Provenance;
  quote: string;
}

export interface ReportSectionDef {
  id: ReportSectionId;
  title: string;
  /** Paragraphs (markdown-free plain text; render as <p>s). */
  body: string[];
  /** Optional bullet list under the body. */
  bullets: string[];
  evidence: ReportEvidence[];
  /** Count of confirmed facts vs assumptions feeding this section. */
  confirmedFacts: number;
  assumptions: number;
}

export interface ReportSectionState {
  status: ReportSectionStatus;
  /** Owner-edited body override (null = fixture body). */
  editedBody: string[] | null;
  ownerNote: string;
  processOwner: string;
  confidential: boolean;
}

/* Fact-level review (improvement spec §11.2): every individual fact carries its
 * own review state so one wrong fact never forces a whole-section rejection. */

export type FactSource = "owner" | "document" | "interview" | "inference";

export type FactReviewStatus = "unreviewed" | "confirmed" | "edited" | "rejected";

export interface ReportFactDef {
  id: string;
  sectionId: ReportSectionId;
  label: string;
  value: string;
  source: FactSource;
}

export interface ReportFactState {
  status: FactReviewStatus;
  /** Owner-edited value (null = fixture value). */
  editedValue: string | null;
  /** Reason captured when a fact is rejected. */
  reason: string;
  confidential: boolean;
  /** Display timestamp label, e.g. "Confirmed 10:42". */
  reviewedAt: string | null;
}

export interface CompanyReportState {
  version: number;
  status: "draft" | "approved";
  approvedAt: string | null;
  /** Set when an approved report is edited → downstream stale. */
  stale: boolean;
  sections: Record<ReportSectionId, ReportSectionState>;
  /** Fact-level review states, keyed by ReportFactDef id. Absent = unreviewed. */
  facts: Record<string, ReportFactState>;
}

/* ═══════════════════════════ Planner ═══════════════════════════ */

export type AgentSource = "preset" | "custom";

export type AgentStatus =
  | "recommended"
  | "needs_information"
  | "needs_configuration"
  | "ready_to_build"
  | "building"
  | "validated"
  | "active";

export type OperatingMode = "draft_only" | "act_after_approval" | "auto_within_limits";

export type TriggerKind =
  | "event"
  | "schedule"
  | "threshold"
  | "manual"
  | "dependency"
  | "approval";

export interface AgentWorkflowDef {
  id: string;
  name: string;
  description: string;
  trigger: { kind: TriggerKind; label: string };
  /** Steps rendered on the plan canvas narrative + connection inspector. */
  steps: string[];
  /** What data flows to the next node (connection inspector). */
  handoff: string;
  /** What happens on failure (connection inspector). */
  onFailure: string;
  humanApprovals: string[];
}

export interface IntegrationRequirement {
  integrationId: string;
  /** Why this agent needs it, in plain language. */
  purpose: string;
}

export interface AgentConfig {
  operatingMode: OperatingMode;
  triggers: TriggerKind[];
  /** Plain-language configuration per selected trigger (improvement spec §12.5),
   *  e.g. { event: "Runs when a new customer enquiry arrives" }. */
  triggerDetails?: Partial<Record<TriggerKind, string>>;
  channels: string[];
  /** workflowId → enabled. */
  workflowsEnabled: Record<string, boolean>;
  approvalActions: string[];
  processOwner: string;
  approvalOwner: string;
  quietHours: string;
  runFrequency: string;
  dataAccess: string[];
  forbiddenActions: string[];
}

/** Custom-agent design cycle output (spec §11.5). */
export interface AgentDesignAnswers {
  objective: string;
  trigger: string;
  inputs: string;
  decisions: string;
  permittedActions: string;
  escalation: string;
  systems: string;
  successCriteria: string;
}

export interface AgentDef {
  id: string;
  name: string;
  source: AgentSource;
  /** Short role line, e.g. "Handles routine customer replies and scheduling". */
  role: string;
  description: string;
  /** 0–100 match against the approved report (presets only). */
  fitScore: number;
  fitReason: string;
  coveredOutcomes: string[];
  workflows: AgentWorkflowDef[];
  integrations: IntegrationRequirement[];
  autonomyNote: string;
  humanApprovals: string[];
  setupCost: number;
  monthlyCost: number;
  /** Default config used when the agent is added to the plan. */
  defaultConfig: AgentConfig;
  /** Custom agents: the rough proposal shown before the design cycle. */
  customProposal?: {
    whyCustom: string;
    objective: string;
    trigger: string;
    requiredInputs: string[];
    teamsInvolved: string[];
    decisions: string[];
    allowedActions: string[];
    prohibitedActions: string[];
    approvalPoints: string[];
    missingInformation: string[];
  };
  /** Custom agents: design-cycle questions (mini discovery). */
  designQuestions?: DiscoveryQuestion[];
}

/** One agent as placed in the live plan (fixture def + runtime state). */
export interface PlanAgent {
  agentId: string;
  status: AgentStatus;
  config: AgentConfig;
  /** Custom agents only — filled by the design cycle. */
  designAnswers: AgentDesignAnswers | null;
  designApproved: boolean;
  /** Order of workflows (ids) within this agent (reorderable). */
  workflowOrder: string[];
}

export interface PlanChange {
  /** Human summary shown after NL reconfigure / structural edits. */
  summary: string;
  costDelta: { setup: number; monthly: number };
}

export interface WorkforcePlanState {
  version: number;
  status: "draft" | "approved";
  approvedAt: string | null;
  stale: boolean;
  /** Ordered agents on the canvas. */
  agents: PlanAgent[];
  /** Extra one-off plan notes added by NL commands (e.g. new approval rules). */
  planRules: string[];
  lastChange: PlanChange | null;
}

/** NL command fixture: matches input → deterministic plan mutation description. */
export interface NlCommandFixture {
  id: string;
  /** Example shown as a suggestion chip. */
  example: string;
  /** Keywords — first fixture whose every keyword appears (case-insens) wins. */
  keywords: string[];
  /** Reasoning steps shown during the 2–3s "thinking" state. */
  reasoning: string[];
  summary: string;
  costDelta: { setup: number; monthly: number };
  /** Store applies by id (see store.applyNlCommand). */
  effect:
    | { kind: "add_rule"; rule: string }
    | { kind: "add_workflow"; agentId: string; workflow: AgentWorkflowDef }
    | { kind: "move_workflow"; fromAgentId: string; toAgentId: string; workflowId: string }
    | { kind: "set_approval"; agentId: string; action: string };
}

/* ═══════════════════════════ Integrations ═══════════════════════════ */

export type IntegrationStatus = "connected" | "required" | "optional" | "needs_approval";

export interface IntegrationDef {
  id: string;
  name: string;
  category: string;
  kind: "app" | "mcp";
  /** One-sentence purpose in plain language. */
  purpose: string;
  /** Agent ids that need this connection. */
  neededBy: string[];
  reads: string[];
  actions: string[];
  defaultStatus: IntegrationStatus;
  /** Behind the Advanced accordion. */
  advanced: { protocol: string; server: string; scopes: string[] };
  /** Plain-language scope lines for the connect wizard. */
  permissionSummary: string[];
  /** Mock account label, e.g. "ops@brightpath.sg". */
  account: string;
}

export interface IntegrationRuntime {
  status: IntegrationStatus;
  connectedAt: string | null;
}

/* ═══════════════════════════ Build / Agent Factory ═══════════════════════════ */

export type BuildJobStatus = "queued" | "generating" | "validating" | "completed" | "failed";

export interface ArtifactFile {
  name: string;
  language: "yaml" | "json" | "markdown";
  content: string;
}

export interface BuildLogLine {
  /** Offset ms from job start (deterministic). */
  at: number;
  text: string;
  tone: "info" | "ok" | "warn";
}

export interface BuildFixture {
  agentId: string;
  /** Total simulated duration ms (8–15s, staggered per agent). */
  duration: number;
  log: BuildLogLine[];
  artifacts: ArtifactFile[];
}

export interface BuildJobState {
  agentId: string;
  status: BuildJobStatus;
  /** 0–100. */
  progress: number;
  /** Indices into fixture log revealed so far. */
  logCount: number;
}

/* ═══════════════════════════ Sandbox ═══════════════════════════ */

export type SandboxEventKind =
  | "trigger"
  | "agent_step"
  | "message"
  | "data_request"
  | "draft"
  | "approval_pause"
  | "approval_resolved"
  | "result";

export interface SandboxEvent {
  id: string;
  /** Offset ms from run start. Events after an approval_pause offset from resume. */
  at: number;
  kind: SandboxEventKind;
  /** Actor label, e.g. "Customer Care Intake" / "Service Recovery Coordinator". */
  actor: string;
  /** Target for message/data_request arrows. */
  target?: string;
  title: string;
  detail: string;
}

export interface SandboxScenario {
  id: string;
  workflowId: string;
  agentId: string;
  name: string;
  description: string;
  /** The input scenario panel content. */
  input: { label: string; value: string }[];
  events: SandboxEvent[];
  /** Editable resolution presented at the approval pause. */
  proposedResolution: string;
  /** Hardcoded revision when the owner asks the agent to update. */
  revisedResolution: string;
  metrics: { label: string; value: string }[];
}

export interface StressCase {
  id: number;
  name: string;
  outcome: "passed" | "escalated" | "failed";
  note: string;
}

export interface StressTestFixture {
  total: number;
  passed: number;
  escalated: number;
  failed: number;
  cases: StressCase[];
  /** Explanation of the failed case, understandable and safe. */
  failureExplanation: string;
}

export interface SandboxRunState {
  scenarioId: string | null;
  phase: "idle" | "running" | "paused_for_approval" | "resuming" | "completed";
  /** Count of events revealed. */
  eventCount: number;
  /** Owner-edited resolution at the pause (null = fixture proposal). */
  editedResolution: string | null;
  resolutionRevised: boolean;
  approvedAt: string | null;
  stressDone: boolean;
}

/* ═══════════════════════════ Deployment ═══════════════════════════ */

export interface DeployChecklistItem {
  id: string;
  title: string;
  detail: string;
  /** auto = confirmed from state; choice = owner picks; ack = owner ticks. */
  kind: "auto" | "ack" | "choice";
  options?: string[];
}

export interface DeploymentState {
  checked: Record<string, boolean | string>;
  /** agentId → "ready" | "activating" | "active" during the activation animation. */
  agentStatus: Record<string, "ready" | "activating" | "active">;
  activatedAt: string | null;
}

/* ═══════════════════════════ Workspace / operations ═══════════════════════════ */

export type WorkspaceTeam =
  | "overview"
  | "customer_care"
  | "admin"
  | "marketing"
  | "finance"
  | "agents";

export type ApprovalStatus =
  | "pending"
  | "review_requested"
  | "approved"
  | "completed"
  | "failed";

export type RiskLevel = "low" | "medium" | "high";

export interface ApprovalVersion {
  version: number;
  content: string;
  at: string;
  note: string;
}

export interface ApprovalItem {
  id: string;
  team: Exclude<WorkspaceTeam, "overview" | "agents">;
  agentId: string;
  agentName: string;
  workflowId: string;
  workflowName: string;
  title: string;
  /** Decision required, one line. */
  decision: string;
  reason: string;
  risk: RiskLevel;
  /** Value/importance tag, e.g. "High value" / "$180 refund". */
  valueLabel: string;
  dueAt: string;   // ISO date
  dueTime: string; // "14:30"
  customer: string;
  /** Source information lines for the review drawer. */
  source: { label: string; value: string }[];
  /** Proposed content versions, latest last. v1 comes from the fixture. */
  versions: ApprovalVersion[];
  /** Hardcoded next revision used by "Ask Agent to Update". */
  nextRevision: { content: string; note: string };
  confidence: number;
  approvalRule: string;
  status: ApprovalStatus;
  comments: { author: string; at: string; text: string }[];
  /** Linked calendar event (keeps card + calendar in sync). */
  calendarEventId: string | null;
  flags: ("financial" | "customer_facing" | "high_value" | "assigned_to_me")[];
}

export type CalendarEventState =
  | "pending_approval"
  | "approved"
  | "completed"
  | "needs_changes"
  | "failed";

export interface CalendarEvent {
  id: string;
  /** ISO date "2026-07-24". Fixture dates are relative to a fixed demo month. */
  date: string;
  time: string;
  durationMin: number;
  title: string;
  agentId: string;
  agentName: string;
  workflowName: string;
  team: Exclude<WorkspaceTeam, "overview" | "agents">;
  state: CalendarEventState;
  approvalId: string | null;
  detail: string;
}

export interface ActivityEvent {
  id: string;
  /** Display time, e.g. "09:42". */
  at: string;
  agentId: string;
  agentName: string;
  team: Exclude<WorkspaceTeam, "overview" | "agents">;
  message: string;
  tone: "done" | "wait" | "info" | "alert";
}

export interface CommandFixture {
  id: string;
  example: string;
  keywords: string[];
  /** Agent the orchestrator routes to. */
  agentId: string;
  agentName: string;
  routingSteps: string[];
  /** Result panel: heading + lines (rendered as a drafted result). */
  resultTitle: string;
  resultLines: string[];
  resultKind: "summary" | "draft" | "list" | "action";
}

export interface DailyDigestFixture {
  date: string;
  completed: string[];
  reviews: string[];
  exceptions: string[];
  upcoming: string[];
}

/** Grouped owner-friendly digest (improvement spec §18). */
export interface DailyDigestV2 {
  date: string;
  /** Coverage period label, e.g. "Covers today, 07:00 to 18:00 SGT". */
  coverage: string;
  /** Today at a glance stat rows. */
  glance: { label: string; value: string; note?: string }[];
  /** Needs your attention, sorted by priority + due time. */
  attention: {
    title: string;
    due: string;
    risk: RiskLevel;
    approvalId: string | null;
  }[];
  /** Completed automatically, grouped by team. */
  completedByTeam: { team: string; items: string[] }[];
  comingUp: string[];
  /** One or two concise recommendations. */
  insights: string[];
}

export interface WeeklyReportFixture {
  weekLabel: string;
  metrics: { label: string; value: string; note: string }[];
  highlights: string[];
}

export interface WorkspaceState {
  team: WorkspaceTeam;
  approvals: Record<string, ApprovalItem>;
  calendarEvents: Record<string, CalendarEvent>;
  activity: ActivityEvent[];
  /** ids of approvals surfaced as unread notifications. */
  unreadNotifications: string[];
}

/* ═══════════════════════════ Services ═══════════════════════════ */

/** One visible step of a simulated async job. */
export interface TimelineStep<T = unknown> {
  /** Delay ms after previous step (deterministic). */
  delay: number;
  /** Payload delivered to the subscriber. */
  emit: T;
}

export interface RunHandle {
  /** Resolves when the timeline finishes (or is cancelled → resolves false). */
  done: Promise<boolean>;
  cancel: () => void;
}

/* ═══════════════════════════ Store root ═══════════════════════════ */

export interface DemoState {
  journey: JourneyState;
  onboarding: OnboardingState;
  leanCanvas: LeanCanvasState;
  discovery: DiscoveryState;
  report: CompanyReportState;
  plan: WorkforcePlanState;
  integrations: Record<string, IntegrationRuntime>;
  buildJobs: Record<string, BuildJobState>;
  sandbox: SandboxRunState;
  deployment: DeploymentState;
  workspace: WorkspaceState;
}
