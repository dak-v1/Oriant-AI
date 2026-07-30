import type {
  ApprovalPreference,
  AnswerSource,
  AutomationScope,
  BusinessBlueprint,
  BusinessBlueprintVersion,
  BuilderAccess,
  DepartmentApproval,
  Db,
  OnboardingAnswer,
  OnboardingChannel,
  OnboardingQuestionDefinition,
  OnboardingSession,
  OrganizationShape,
  OnboardingOwnership,
  RoleBHandoff,
  VoiceSession,
  WorkflowBuilder,
} from "../contracts";
import type { BusinessBlueprintSummary, CurrentSystemSummary, DepartmentSummary, RoleAHandoffEnvelope } from "../role-a-to-role-b-contract";
import { audit, GateError } from "./orchestrator";
import { nowIso, uid } from "./store";
import { createHash } from "crypto";

const SCHEMA_VERSION = "2026-07-28";
const ROLE_B_SCHEMA_VERSION = "1.1" as const;

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function slugId(prefix: string, raw: string): string {
  const clean = raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${prefix}_${clean || "item"}`;
}

function operatingMode(mode?: string): "assist" | "collaborate" | "operate_within_rules" | "evaluate_for_me" | null {
  if (mode === "assist") return "assist";
  if (mode === "operate") return "operate_within_rules";
  if (mode === "unsure") return "evaluate_for_me";
  return null;
}

function approvalModeLabel(preference?: ApprovalPreference): "collaborate" | "evaluate_for_me" | null {
  if (preference === "recommend") return "evaluate_for_me";
  if (preference) return "collaborate";
  return null;
}

function buildDepartmentSummaries(session: OnboardingSession): DepartmentSummary[] {
  return session.organization.departmentApprovals.map((item) => ({
    id: slugId("dept", item.department),
    name: item.department,
    isPreset: ["finance", "admin", "marketing", "operations", "sales", "customer support"].includes(item.department.toLowerCase()),
    headcount: null,
    responsiblePersonOrRole: item.processOwner || item.setupDelegate || item.approver || null,
    approvalOwnerPersonOrRole: item.approver || session.organization.approvalOwner || null,
    responsibilities: [],
    tools: [],
    painPoints: [],
    automationIntent: "evaluate_for_me",
    preferredAiOperatingMode: operatingMode(typeof session.answers.automation_mode?.value === "string" ? session.answers.automation_mode.value : undefined),
    restrictions: [],
  }));
}

function buildCurrentSystems(session: OnboardingSession): CurrentSystemSummary[] {
  return session.selectedToolIds.map((toolId) => ({
    id: slugId("sys", toolId),
    departmentId: null,
    category: "general",
    name: toolId,
    connectionStatus: "not_requested",
    intendedUse: null,
  }));
}

function buildBlueprintSummary(db: Db, session: OnboardingSession, approved: BusinessBlueprintVersion): BusinessBlueprintSummary {
  const companySummary = approved.blueprint.companySummary.trim();
  const channelsUsed: Array<"typed" | "voice"> = session.voice
    ? Array.from(new Set([session.preferredChannel, "voice"])) as Array<"typed" | "voice">
    : [session.preferredChannel];
  const evidenceModesUsed: Array<"lean_canvas" | "document" | "process_video" | "screen_recording" | "employee_input"> = [];
  const departments = buildDepartmentSummaries(session);
  const blueprintId = `bp_${session.id}_v${approved.version}`;
  const organizationId = `org_${db.org.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;

  return {
    schemaVersion: ROLE_B_SCHEMA_VERSION,
    blueprintId,
    organizationId,
    onboardingSessionId: session.id,
    status: "ready_for_role_b",
    onboardingExperience: {
      initialChannel: channelsUsed[0],
      currentChannel: session.preferredChannel,
      channelsUsed,
      evidenceModesUsed,
      lastProviderConversationId: session.voice?.id ?? null,
    },
    company: {
      name: db.org.name,
      industry: null,
      locations: [],
      businessModel: null,
      productsOrServices: [],
      customerSegments: [],
      companyStage: null,
      approximateBusinessVolume: [],
    },
    currentAiUsage: {
      level: null,
      tools: [],
      useCases: [],
      successes: [],
      concernsOrFailures: [],
      existingPolicies: [],
    },
    team: {
      employeeCount: session.organization.employeeCount ?? null,
      contractorCount: null,
      departments,
      roles: [],
      capabilityGaps: [],
    },
    goals: [],
    processes: [],
    automationPreferences: {
      overallMode: approvalModeLabel(approved.blueprint.organization.approvalPreference) ?? operatingMode(approved.blueprint.automationMode),
      discoveryPreference: null,
      selectedAreas: departments.map((item) => item.name),
      alwaysRequireApproval: approved.blueprint.organization.departmentApprovals.map((item) => `${item.department}: ${item.approver}`),
      prohibitedActions: [],
      preferredApprovers: Array.from(new Set([
        ...(approved.blueprint.organization.approvalOwner ? [approved.blueprint.organization.approvalOwner] : []),
        ...approved.blueprint.organization.departmentApprovals.map((item) => item.approver).filter(Boolean),
      ])),
      preferredInitialDeploymentMode: "approval",
      notificationPreferences: [],
      initialBudgetRange: null,
    },
    currentSystems: buildCurrentSystems(session),
    leanCanvas: {
      source: "not_provided",
      customerSegments: [],
      problems: [],
      uniqueValueProposition: null,
      solution: [],
      channels: [],
      revenueStreams: [],
      costStructure: [],
      keyMetrics: [],
      unfairAdvantage: null,
      sourceDocumentIds: [],
    },
    evidenceAssets: [],
    discovery: {
      interviewCompleted: companySummary.length > 0,
      interviewMode: session.voice ? (session.preferredChannel === "voice" ? "voice" : "mixed") : "typed",
      summary: companySummary || null,
      confirmedFacts: Object.keys(session.answers),
      contradictions: [],
      openQuestions: [],
    },
    evidence: [
      {
        id: slugId("evi", "company_summary"),
        entityType: "company",
        entityId: null,
        fieldPath: "company.summary",
        sourceType: session.voice ? "voice_interview" : "onboarding_form",
        sourceId: session.voice?.id ?? null,
        supportingText: companySummary || null,
        startTimeMs: null,
        endTimeMs: null,
        confidence: 1,
        confirmationStatus: "confirmed",
      },
    ],
    languageAndCommunication: {
      preferredLanguage: approved.blueprint.language || "en",
      additionalLanguages: [],
      preferredDiscoveryModes: session.voice ? ["voice", "typed"] : ["typed"],
    },
    consent: {
      dataProcessingAccepted: approved.blueprint.consentAccepted,
      microphoneAccepted: session.preferredChannel === "voice",
      audioRecordingAccepted: session.preferredChannel === "voice",
      audioRetentionAccepted: false,
      processMediaProcessingAccepted: false,
      employeeMediaAuthorizationConfirmed: false,
      acceptedAt: approved.approvedAt ?? null,
    },
    approval: {
      approvedByUserId: approved.approvedBy ? `owner:${approved.approvedBy}` : null,
      approvedAt: approved.approvedAt ?? null,
      approvalVersion: approved.version,
    },
    metadata: {
      version: approved.version,
      payloadHash: null,
      createdAt: approved.createdAt,
      updatedAt: session.updatedAt,
      completedAt: session.completedAt ?? null,
    },
  };
}

function buildRoleBHandoffEnvelope(db: Db, session: OnboardingSession, handoffId: string): RoleAHandoffEnvelope {
  if (!session.blueprint || session.blueprint.status !== "approved") {
    throw new GateError("Approved blueprint required for Role B handoff.");
  }
  const blueprint = buildBlueprintSummary(db, session, session.blueprint);
  const payloadHash = `sha256:${createHash("sha256").update(stableStringify(blueprint)).digest("hex")}`;
  const blueprintWithHash: BusinessBlueprintSummary = {
    ...blueprint,
    metadata: { ...blueprint.metadata, payloadHash },
  };
  return {
    eventType: "role_a.business_blueprint.approved",
    eventVersion: "1.0",
    handoffId,
    idempotencyKey: `${blueprint.blueprintId}:v${blueprint.metadata.version}:${payloadHash.slice(7, 19)}`,
    occurredAt: nowIso(),
    blueprint: blueprintWithHash,
  };
}

function activeSession(db: Db): OnboardingSession | null {
  const id = db.onboarding.activeSessionId;
  return id ? db.onboarding.sessions[id] ?? null : null;
}

export function logSystem(
  db: Db,
  scope: "onboarding" | "voice" | "storage" | "integration" | "handoff",
  event: string,
  status: "info" | "completed" | "failed",
  detail?: string,
  sessionId?: string,
  questionId?: string,
) {
  db.systemEvents.unshift({
    id: uid("sys"),
    at: nowIso(),
    scope,
    event,
    status,
    detail,
    sessionId,
    questionId,
  });
  db.systemEvents = db.systemEvents.slice(0, 250);
}

function questionById(db: Db, id: string): OnboardingQuestionDefinition {
  const q = db.onboarding.questions.find((item) => item.id === id);
  if (!q) throw new GateError(`Unknown onboarding question: ${id}`);
  return q;
}

function answeredRequired(session: OnboardingSession, questions: OnboardingQuestionDefinition[]) {
  return questions
    .filter((q) => q.required)
    .every((q) => {
      const answer = session.answers[q.id];
      if (!answer) return false;
      if (typeof answer.value === "string") return answer.value.trim().length > 0;
      return true;
    });
}

function progressPercent(session: OnboardingSession, questions: OnboardingQuestionDefinition[]): number {
  const required = questions.filter((q) => q.required);
  const answered = required.filter((q) => session.answers[q.id]).length;
  return Math.max(5, Math.round((answered / required.length) * 100));
}

function buildBlueprint(session: OnboardingSession): BusinessBlueprint {
  const intro = session.answers.company_intro;
  const tools = session.answers.selected_tools;
  const consent = session.answers.consent_accepted;
  const mode = session.answers.automation_mode;
  return {
    companySummary: typeof intro?.value === "string" ? intro.value : "",
    automationMode: typeof mode?.value === "string" ? mode.value : undefined,
    organization: {
      shape: session.organization.shape,
      employeeCount: session.organization.employeeCount,
      approvalOwner: session.organization.approvalOwner,
      approvalPreference: session.organization.approvalPreference,
      onboardingOwnership: session.organization.onboardingOwnership,
      employeeEmails: session.organization.employeeEmails,
      departmentApprovals: session.organization.departmentApprovals,
    },
    tools: Array.isArray(tools?.value) && tools.value.every((item) => typeof item === "string")
      ? tools.value
      : [],
    language: "en",
    consentAccepted: consent?.value === true,
  };
}

export function ensureOnboardingSession(db: Db, preferredChannel: OnboardingChannel = "typed") {
  const existing = activeSession(db);
  if (existing) return existing;
  const now = nowIso();
  const session: OnboardingSession = {
    id: uid("onb"),
    schemaVersion: SCHEMA_VERSION,
    status: "not_started",
    preferredChannel,
    currentStep: "welcome",
    progress: 5,
    organization: {
      shape: "solo",
      approvalPreference: "owner_all",
      onboardingOwnership: "owner_only",
      employeeEmails: [],
      departmentApprovals: [],
    },
    answers: {},
    selectedToolIds: [],
    consentAccepted: false,
    transcriptReviewRequired: false,
    startedAt: now,
    updatedAt: now,
  };
  db.onboarding.activeSessionId = session.id;
  db.onboarding.sessions[session.id] = session;
  audit(db, "onboarding.session_created", session.id);
  logSystem(db, "onboarding", "session_created", "completed", undefined, session.id);
  return session;
}

export function getOnboardingState(db: Db) {
  const session = ensureOnboardingSession(db);
  return { session, questions: db.onboarding.questions };
}

export function updateOnboardingSession(
  db: Db,
  patch: {
    preferredChannel?: OnboardingChannel;
    currentStep?: OnboardingSession["currentStep"];
    mode?: string;
    intro?: string;
    organizationShape?: OrganizationShape;
    workflowBuilder?: WorkflowBuilder;
    builderAccess?: BuilderAccess | null;
    automationScope?: AutomationScope;
    businessArea?: string;
    repetitiveTask?: string;
    currentWorkflow?: string;
    approvalPreference?: ApprovalPreference;
    onboardingOwnership?: OnboardingOwnership;
    employeeCount?: number | null;
    approvalOwner?: string;
    employeeEmails?: string[];
    departmentApprovals?: DepartmentApproval[];
    selectedToolIds?: string[];
    consentAccepted?: boolean;
  },
) {
  const session = ensureOnboardingSession(db, patch.preferredChannel);
  const now = nowIso();

  if (patch.preferredChannel) {
    session.preferredChannel = patch.preferredChannel;
    audit(db, "onboarding.channel_switched", session.id, patch.preferredChannel);
  }
  if (patch.currentStep) session.currentStep = patch.currentStep;
  if (patch.organizationShape) session.organization.shape = patch.organizationShape;
  if (patch.approvalPreference) session.organization.approvalPreference = patch.approvalPreference;
  if (patch.onboardingOwnership) session.organization.onboardingOwnership = patch.onboardingOwnership;
  if (patch.employeeCount !== undefined && patch.employeeCount !== null) {
    session.organization.employeeCount = patch.employeeCount;
  }
  if (patch.approvalOwner !== undefined) session.organization.approvalOwner = patch.approvalOwner.trim();
  if (patch.employeeEmails) session.organization.employeeEmails = patch.employeeEmails;
  if (patch.departmentApprovals) session.organization.departmentApprovals = patch.departmentApprovals;
  if (patch.selectedToolIds) session.selectedToolIds = patch.selectedToolIds;
  if (patch.consentAccepted !== undefined) session.consentAccepted = patch.consentAccepted;

  const saveAnswer = (
    questionId: string,
    value: OnboardingAnswer["value"],
    source: AnswerSource,
    confidence = 1,
  ) => {
    const question = questionById(db, questionId);
    session.answers[questionId] = {
      questionId,
      fieldPath: question.fieldPath,
      value,
      source,
      confirmed: true,
      confidence,
      updatedAt: now,
    };
    audit(db, "onboarding.answer_saved", questionId, session.id);
  };

  if (patch.preferredChannel) saveAnswer("preferred_channel", patch.preferredChannel, "typed");
  if (patch.workflowBuilder) saveAnswer("setup_builder", patch.workflowBuilder, "typed");
  if (patch.builderAccess !== undefined) {
    if (patch.builderAccess) saveAnswer("setup_builder_access", patch.builderAccess, "typed");
    else delete session.answers.setup_builder_access;
  }
  if (patch.automationScope) saveAnswer("automation_scope", patch.automationScope, "typed");
  if (patch.approvalPreference) saveAnswer("approval_preference", patch.approvalPreference, "typed");
  if (patch.onboardingOwnership) saveAnswer("onboarding_owner_mode", patch.onboardingOwnership, "typed");
  if (patch.mode) saveAnswer("automation_mode", patch.mode, "typed");
  if (patch.intro !== undefined) {
    if (patch.intro.trim()) saveAnswer("company_intro", patch.intro.trim(), "typed");
    else delete session.answers.company_intro;
  }
  if (patch.businessArea !== undefined) {
    if (patch.businessArea.trim()) saveAnswer("business_area", patch.businessArea.trim(), "typed");
    else delete session.answers.business_area;
  }
  if (patch.repetitiveTask !== undefined) {
    if (patch.repetitiveTask.trim()) saveAnswer("repetitive_task", patch.repetitiveTask.trim(), "typed");
    else delete session.answers.repetitive_task;
  }
  if (patch.currentWorkflow !== undefined) {
    if (patch.currentWorkflow.trim()) saveAnswer("current_workflow", patch.currentWorkflow.trim(), "typed");
    else delete session.answers.current_workflow;
  }
  if (patch.organizationShape) saveAnswer("organization_shape", patch.organizationShape, "typed");
  if (patch.employeeCount !== undefined && patch.employeeCount !== null) {
    saveAnswer("employee_count", patch.employeeCount, "typed");
  }
  if (patch.approvalOwner !== undefined) {
    if (patch.approvalOwner.trim()) saveAnswer("approval_owner", patch.approvalOwner.trim(), "typed");
    else delete session.answers.approval_owner;
  }
  if (patch.employeeEmails) {
    saveAnswer("employee_emails", patch.employeeEmails, "typed");
  }
  if (patch.departmentApprovals) {
    saveAnswer("department_approvals", patch.departmentApprovals, "typed");
  }
  if (patch.selectedToolIds) saveAnswer("selected_tools", patch.selectedToolIds, "typed");
  if (patch.consentAccepted !== undefined) saveAnswer("consent_accepted", patch.consentAccepted, "typed");

  session.progress = progressPercent(session, db.onboarding.questions);
  session.status = answeredRequired(session, db.onboarding.questions) ? "review_pending" : "in_progress";
  session.updatedAt = now;
  logSystem(db, "onboarding", "session_updated", "completed", undefined, session.id);
  return session;
}

export function attachVoiceTranscript(
  db: Db,
  input: { questionId: string; transcript: string; confirmedAnswer?: string; language?: string },
) {
  const session = ensureOnboardingSession(db, "voice");
  const now = nowIso();
  const voice: VoiceSession = session.voice ?? {
    id: uid("voice"),
    provider: "nosana",
    language: input.language ?? "en",
    startedAt: now,
    lastTurnAt: now,
    turns: [],
  };
  voice.lastTurnAt = now;
  voice.turns.unshift({
    id: uid("turn"),
    questionId: input.questionId,
    transcript: input.transcript,
    confirmedAnswer: input.confirmedAnswer,
    status: input.confirmedAnswer ? "confirmed" : "captured",
    createdAt: now,
  });
  session.voice = voice;
  session.transcriptReviewRequired = !input.confirmedAnswer;
  session.preferredChannel = "voice";
  session.status = input.confirmedAnswer ? "in_progress" : "voice_in_progress";

  if (input.confirmedAnswer?.trim()) {
    const question = questionById(db, input.questionId);
    session.answers[input.questionId] = {
      questionId: input.questionId,
      fieldPath: question.fieldPath,
      value: input.confirmedAnswer.trim(),
      source: "transcript_review",
      confirmed: true,
      confidence: 0.9,
      updatedAt: now,
    };
    audit(db, "voice.transcript_confirmed", input.questionId, session.id);
  } else {
    audit(db, "voice.turn_captured", input.questionId, session.id);
  }

  session.updatedAt = now;
  session.progress = progressPercent(session, db.onboarding.questions);
  logSystem(db, "voice", "transcript_attached", "completed", undefined, session.id, input.questionId);
  return session;
}

export function generateBusinessBlueprint(db: Db): BusinessBlueprintVersion {
  const session = ensureOnboardingSession(db);
  if (!answeredRequired(session, db.onboarding.questions)) {
    throw new GateError("Finish the required onboarding answers before generating the Business Blueprint.");
  }
  const version = (session.blueprint?.version ?? 0) + 1;
  const blueprint: BusinessBlueprintVersion = {
    version,
    status: "draft",
    createdAt: nowIso(),
    blueprint: buildBlueprint(session),
  };
  session.blueprint = blueprint;
  session.status = "review_pending";
  session.updatedAt = nowIso();
  audit(db, "blueprint.generated", `BusinessBlueprint v${version}`, session.id);
  logSystem(db, "onboarding", "blueprint_generated", "completed", undefined, session.id);
  return blueprint;
}

export function approveBusinessBlueprint(db: Db) {
  const session = ensureOnboardingSession(db);
  if (!session.blueprint) {
    throw new GateError("Generate the Business Blueprint before approval.");
  }
  session.blueprint.status = "approved";
  session.blueprint.approvedAt = nowIso();
  session.blueprint.approvedBy = db.org.owner;
  session.status = "approved";
  session.completedAt = nowIso();
  session.updatedAt = nowIso();
  audit(db, "blueprint.approved", `BusinessBlueprint v${session.blueprint.version}`, session.id);
  logSystem(db, "onboarding", "blueprint_approved", "completed", undefined, session.id);
  return session.blueprint;
}

export function createRoleBHandoff(db: Db): RoleBHandoff {
  const session = ensureOnboardingSession(db);
  if (!session.blueprint || session.blueprint.status !== "approved") {
    throw new GateError("Approve the Business Blueprint before handing off to Role B.");
  }
  if (session.handoff) return session.handoff;
  const id = uid("handoff");
  const payload = buildRoleBHandoffEnvelope(db, session, id);
  const handoff: RoleBHandoff = {
    id,
    idempotencyKey: payload.idempotencyKey,
    occurredAt: payload.occurredAt,
    blueprintVersion: session.blueprint.version,
    status: "ready",
    createdAt: nowIso(),
    payload,
  };
  session.handoff = handoff;
  session.status = "handed_off";
  session.updatedAt = nowIso();
  audit(db, "role_b.handoff_created", handoff.id, session.id);
  logSystem(db, "handoff", "role_b_handoff_created", "completed", undefined, session.id);
  return handoff;
}
