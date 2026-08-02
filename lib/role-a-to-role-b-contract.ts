export type RoleAHandoffEnvelope = {
  eventType: "role_a.business_blueprint.approved";
  eventVersion: "1.0";
  handoffId: string;
  idempotencyKey: string;
  occurredAt: string;
  blueprint: BusinessBlueprintSummary;
};

export type BusinessBlueprintSummary = {
  schemaVersion: "1.1";
  blueprintId: string;
  organizationId: string;
  onboardingSessionId: string;
  status: "draft" | "in_review" | "approved" | "ready_for_role_b";
  onboardingExperience: {
    initialChannel: "typed" | "voice";
    currentChannel: "typed" | "voice";
    channelsUsed: Array<"typed" | "voice">;
    evidenceModesUsed: Array<
      "lean_canvas" | "document" | "process_video" | "screen_recording" | "employee_input"
    >;
    lastProviderConversationId: string | null;
  };
  company: {
    name: string;
    industry: string | null;
    locations: string[];
    businessModel: string | null;
    productsOrServices: string[];
    customerSegments: string[];
    companyStage: string | null;
    approximateBusinessVolume: Array<{
      metric: string;
      value: number | null;
      rangeLabel: string | null;
      period: "day" | "week" | "month" | "year" | null;
    }>;
  };
  currentAiUsage: {
    level: "none" | "experimental" | "occasional" | "regular" | "advanced" | null;
    tools: string[];
    useCases: string[];
    successes: string[];
    concernsOrFailures: string[];
    existingPolicies: string[];
  };
  team: {
    employeeCount: number | null;
    contractorCount: number | null;
    departments: DepartmentSummary[];
    roles: RoleSummary[];
    capabilityGaps: string[];
  };
  goals: Array<{
    id: string;
    statement: string;
    priority: "low" | "medium" | "high" | null;
    desiredOutcome: string | null;
    targetMetric: string | null;
  }>;
  processes: ProcessSummary[];
  automationPreferences: AutomationPreferences;
  currentSystems: CurrentSystemSummary[];
  leanCanvas: LeanCanvasSummary;
  evidenceAssets: EvidenceAssetSummary[];
  discovery: DiscoverySummary;
  evidence: EvidenceReference[];
  languageAndCommunication: {
    preferredLanguage: string;
    additionalLanguages: string[];
    preferredDiscoveryModes: Array<"voice" | "typed" | "cards" | "documents" | "process_media">;
  };
  consent: {
    dataProcessingAccepted: boolean;
    microphoneAccepted: boolean;
    audioRecordingAccepted: boolean;
    audioRetentionAccepted: boolean;
    processMediaProcessingAccepted: boolean;
    employeeMediaAuthorizationConfirmed: boolean;
    acceptedAt: string | null;
  };
  approval: {
    approvedByUserId: string | null;
    approvedAt: string | null;
    approvalVersion: number | null;
  };
  metadata: {
    version: number;
    payloadHash: string | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
  };
};

export type DepartmentSummary = {
  id: string;
  name: string;
  isPreset: boolean;
  headcount: number | null;
  responsiblePersonOrRole: string | null;
  approvalOwnerPersonOrRole: string | null;
  responsibilities: string[];
  tools: string[];
  painPoints: string[];
  automationIntent: "yes_explore_automation" | "no_keep_human_led" | "evaluate_for_me" | "unsure";
  preferredAiOperatingMode: "assist" | "collaborate" | "operate_within_rules" | "evaluate_for_me" | null;
  restrictions: string[];
};

export type RoleSummary = {
  id: string;
  title: string;
  departmentId: string | null;
  headcount: number;
  responsibilities: string[];
  overloadedTasks: string[];
  approvalResponsibilities: string[];
};

export type ProcessSummary = {
  id: string;
  name: string;
  departmentId: string | null;
  ownerPersonOrRole: string | null;
  peopleOrRolesInvolved: string[];
  description: string | null;
  trigger: string | null;
  cadence: string | null;
  estimatedRunsPerPeriod: number | null;
  period: "day" | "week" | "month" | "year" | null;
  averageHandsOnMinutes: number | null;
  averageWaitMinutes: number | null;
  inputs: string[];
  steps: Array<{
    id: string;
    order: number;
    description: string;
    performer: string | null;
    tools: string[];
    isDecisionPoint: boolean;
    requiresApproval: boolean;
  }>;
  outputs: string[];
  tools: string[];
  businessRules: string[];
  judgementHeavySteps: string[];
  knownExceptions: string[];
  handoffs: string[];
  approvalRequirements: string[];
  painPoints: string[];
  errorOrReworkPattern: string | null;
  customerImpact: string | null;
  revenueImpactOrOpportunity: string | null;
  currentCostEstimate: {
    currency: string | null;
    minimum: number | null;
    maximum: number | null;
    period: "run" | "week" | "month" | "year" | null;
    basis: string | null;
  } | null;
  costOfDelay: string | null;
  dataSensitivity: "low" | "medium" | "high" | "unknown";
  desiredOutcome: string | null;
  evidenceIds: string[];
  preliminaryCharacteristics: {
    executionPattern: "deterministic" | "agentic" | "hybrid" | "unknown";
    rationale: string | null;
    confidence: number | null;
    missingInformation: string[];
  };
  opportunitySignals: {
    frequencyVolume: number | null;
    handsOnTimeBurden: number | null;
    waitingTimeBurden: number | null;
    costBurden: number | null;
    errorReworkBurden: number | null;
    customerImpact: number | null;
    revenueImpact: number | null;
    ownerDependency: number | null;
    ruleClarity: number | null;
    processConsistency: number | null;
    dataAvailability: number | null;
    integrationReadiness: number | null;
    outputVerifiability: number | null;
    reversibility: number | null;
    risk: number | null;
    evidenceConfidence: number | null;
  };
};

export type AutomationPreferences = {
  overallMode: "assist" | "collaborate" | "operate_within_rules" | "maximize_eligible_automation" | "evaluate_for_me" | null;
  discoveryPreference: "i_know_what_to_improve" | "evaluate_for_me" | "both" | null;
  selectedAreas: string[];
  alwaysRequireApproval: string[];
  prohibitedActions: string[];
  preferredApprovers: string[];
  preferredInitialDeploymentMode: "shadow" | "draft" | "approval" | "limited_automation" | null;
  notificationPreferences: string[];
  initialBudgetRange: { currency: string; minimum: number | null; maximum: number | null } | null;
};

export type CurrentSystemSummary = {
  id: string;
  departmentId: string | null;
  category: string;
  name: string;
  connectionStatus: "not_requested" | "requested" | "connected" | "unavailable";
  intendedUse: string | null;
};

export type LeanCanvasSummary = {
  source: "uploaded" | "guided" | "mixed" | "not_provided";
  customerSegments: string[];
  problems: string[];
  uniqueValueProposition: string | null;
  solution: string[];
  channels: string[];
  revenueStreams: string[];
  costStructure: string[];
  keyMetrics: string[];
  unfairAdvantage: string | null;
  sourceDocumentIds: string[];
};

export type EvidenceAssetSummary = {
  id: string;
  type: "lean_canvas" | "document" | "audio" | "process_video" | "screen_recording";
  label: string;
  processingStatus: "uploaded" | "queued" | "processing" | "needs_review" | "completed" | "failed";
  retentionStatus: "temporary" | "retained" | "deletion_requested" | "deleted";
  linkedDepartmentIds: string[];
  linkedProcessIds: string[];
};

export type DiscoverySummary = {
  interviewCompleted: boolean;
  interviewMode: "voice" | "typed" | "mixed" | "skipped";
  summary: string | null;
  confirmedFacts: string[];
  contradictions: Array<{
    fieldPath: string;
    description: string;
    evidenceIds: string[];
    resolution: string | null;
  }>;
  openQuestions: Array<{
    id: string;
    entityType: "company" | "department" | "process";
    entityId: string | null;
    question: string;
    importance: "low" | "medium" | "high";
  }>;
};

export type EvidenceReference = {
  id: string;
  entityType: "company" | "department" | "process";
  entityId: string | null;
  fieldPath: string;
  sourceType: "onboarding_form" | "lean_canvas" | "uploaded_document" | "voice_interview" | "text_interview" | "process_video" | "screen_recording" | "employee_input" | "user_edit";
  sourceId: string | null;
  supportingText: string | null;
  startTimeMs: number | null;
  endTimeMs: number | null;
  confidence: number | null;
  confirmationStatus: "draft" | "confirmed" | "rejected";
};
