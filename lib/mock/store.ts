/**
 * lib/mock/store.ts — the central typed demo store (spec §2, §5, §23).
 *
 * One zustand store holds the current UI snapshot. Authoritative onboarding,
 * discovery, and report data is loaded from the server/Supabase; Reset Demo
 * clears the in-memory view and cancels all in-flight mock timers. Screens call actions; mock services drive the
 * time-based updates via the screens (services stay UI-agnostic).
 *
 * Everything in DemoState is JSON-serialisable. Transient UI state (open
 * drawers, selected cards) lives in components, not here.
 */
"use client";

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type {
  ApprovalPreference,
  BuilderAccess,
  AgentConfig,
  AgentDesignAnswers,
  AgentWorkflowDef,
  ApprovalItem,
  AutomationMode,
  CalendarEventState,
  CompanyReportState,
  CustomTool,
  DepartmentApproval,
  DemoState,
  DiscoveryState,
  DiscoveryMode,
  IntegrationRuntime,
  IntegrationStatus,
  JourneyState,
  LeanCanvasBlockId,
  NlCommandFixture,
  OnboardingChannel,
  OnboardingOwnership,
  OnboardingState,
  OrganizationShape,
  AutomationScope,
  WorkflowBuilder,
  PlanAgent,
  ReportFactState,
  ReportSectionId,
  WorkforcePlanState,
  WorkspaceTeam,
} from "./types";
import { cancelAllMockWork } from "./services";
import { planTotals } from "./pricing";
import { atLeast } from "./state-machine";
import { AGENT, DEMO_TODAY } from "./fixtures/ids";
import { DEMO_COMPANY, DEMO_INTRO_ANSWER } from "./fixtures/demo-company";
import { LEAN_CANVAS_BLOCKS } from "./fixtures/lean-canvas";
import {
  BASE_FACT_IDS,
  DISCOVERY_QUESTIONS,
  INVITE_FACT_IDS,
  UPLOAD_FACT_IDS,
} from "./fixtures/discovery-questions";
import { REPORT_SECTION_ORDER } from "./fixtures/company-report";
import { AGENT_LIBRARY } from "./fixtures/agent-library";
import { INITIAL_PLAN_AGENTS } from "./fixtures/workflow-plan";
import { INTEGRATIONS } from "./fixtures/integrations";
import { BUILD_ORDER } from "./fixtures/build-artifacts";
import { APPROVAL_ITEMS } from "./fixtures/approvals";
import { CALENDAR_EVENTS } from "./fixtures/calendar-events";
import { ACTIVATION_BURST, ACTIVITY_FEED } from "./fixtures/activity";

/* ═══════════════════════ initial state builders ═══════════════════════ */

function initialReport(): CompanyReportState {
  const sections = {} as CompanyReportState["sections"];
  for (const id of REPORT_SECTION_ORDER) {
    sections[id] = {
      status: "draft",
      editedBody: null,
      ownerNote: "",
      processOwner: "",
      confidential: false,
    };
  }
  return { version: 1, status: "draft", approvedAt: null, stale: false, sections, facts: {} };
}

/** Default per-fact review state (facts are unreviewed until touched). */
function blankFactState(): ReportFactState {
  return { status: "unreviewed", editedValue: null, reason: "", confidential: false, reviewedAt: null };
}

function initialPlan(): WorkforcePlanState {
  return {
    version: 1,
    status: "draft",
    approvedAt: null,
    stale: false,
    agents: [],
    planRules: [],
    lastChange: null,
  };
}

function initialIntegrations(): Record<string, IntegrationRuntime> {
  const out: Record<string, IntegrationRuntime> = {};
  for (const def of Object.values(INTEGRATIONS)) {
    out[def.id] = { status: def.defaultStatus, connectedAt: null };
  }
  return out;
}

function initialState(): DemoState {
  return {
    journey: "not_started",
    onboarding: {
      channel: "typed",
      callInProgress: false,
      backendSessionId: null,
      mode: null,
      usedDemoCompany: false,
      intro: "",
      organizationShape: "solo",
      approvalPreference: null,
      onboardingOwnership: null,
      workflowBuilder: null,
      builderAccess: null,
      automationScope: null,
      businessArea: "",
      repetitiveTask: "",
      currentWorkflow: "",
      employeeCount: "",
      approvalOwner: "",
      employeeEmails: [],
      departmentApprovals: [],
      selectedToolIds: [],
      customTools: [],
      capturedSections: [],
      consentAccepted: false,
      completed: false,
      blueprintVersion: null,
      blueprintStatus: "idle",
      handoffId: null,
      syncStatus: "idle",
      syncError: null,
    },
    leanCanvas: { source: null, values: {}, completed: false },
    discovery: {
      mode: "voice",
      currentIndex: 0,
      answers: {},
      clarificationAnswers: {},
      clarificationQuestions: [],
      factIds: [],
      uploadedMore: false,
      invitedEmployee: false,
      completed: false,
    },
    report: initialReport(),
    plan: initialPlan(),
    integrations: initialIntegrations(),
    buildJobs: {},
    sandbox: {
      scenarioId: null,
      phase: "idle",
      eventCount: 0,
      editedResolution: null,
      resolutionRevised: false,
      approvedAt: null,
      stressDone: false,
    },
    deployment: { checked: {}, agentStatus: {}, activatedAt: null },
    workspace: {
      team: "overview",
      approvals: structuredClone(APPROVAL_ITEMS),
      calendarEvents: structuredClone(CALENDAR_EVENTS),
      activity: [...ACTIVITY_FEED],
      unreadNotifications: [],
    },
  };
}

/* ═══════════════════════ helpers ═══════════════════════ */

const MAX_HISTORY = 24;

function snapshotPlan(p: WorkforcePlanState): WorkforcePlanState {
  return structuredClone(p);
}

/** Map an approval status onto its linked calendar event state (spec §18.2). */
function calendarStateFor(status: ApprovalItem["status"]): CalendarEventState {
  switch (status) {
    case "pending":
      return "pending_approval";
    case "review_requested":
      return "needs_changes";
    case "approved":
      return "approved";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
  }
}

let activitySeq = 100;

function normalizeOnboardingArrays(payload: Partial<OnboardingState>): Partial<OnboardingState> {
  return {
    ...payload,
    ...(payload.callInProgress !== undefined ? { callInProgress: Boolean(payload.callInProgress) } : {}),
    ...(payload.intro !== undefined
      ? { intro: typeof payload.intro === "string" ? payload.intro : "" }
      : {}),
    ...(payload.employeeCount !== undefined
      ? { employeeCount: typeof payload.employeeCount === "string" ? payload.employeeCount : "" }
      : {}),
    ...(payload.approvalOwner !== undefined
      ? { approvalOwner: typeof payload.approvalOwner === "string" ? payload.approvalOwner : "" }
      : {}),
    ...(payload.approvalPreference !== undefined
      ? { approvalPreference: payload.approvalPreference ?? null }
      : {}),
    ...(payload.onboardingOwnership !== undefined
      ? { onboardingOwnership: payload.onboardingOwnership ?? null }
      : {}),
    ...(payload.workflowBuilder !== undefined
      ? { workflowBuilder: payload.workflowBuilder ?? null }
      : {}),
    ...(payload.builderAccess !== undefined
      ? { builderAccess: payload.builderAccess ?? null }
      : {}),
    ...(payload.automationScope !== undefined
      ? { automationScope: payload.automationScope ?? null }
      : {}),
    ...(payload.businessArea !== undefined
      ? { businessArea: typeof payload.businessArea === "string" ? payload.businessArea : "" }
      : {}),
    ...(payload.repetitiveTask !== undefined
      ? { repetitiveTask: typeof payload.repetitiveTask === "string" ? payload.repetitiveTask : "" }
      : {}),
    ...(payload.currentWorkflow !== undefined
      ? { currentWorkflow: typeof payload.currentWorkflow === "string" ? payload.currentWorkflow : "" }
      : {}),
    ...(payload.employeeEmails !== undefined
      ? { employeeEmails: Array.isArray(payload.employeeEmails) ? payload.employeeEmails : [] }
      : {}),
    ...(payload.departmentApprovals !== undefined
      ? {
          departmentApprovals: Array.isArray(payload.departmentApprovals)
            ? payload.departmentApprovals
            : [],
        }
      : {}),
  };
}

/* ═══════════════════════ store ═══════════════════════ */

export interface DemoActions {
  /* hydration */
  _hydrated: boolean;
  /* plan undo/redo (kept outside DemoState; rebuilt from history stack) */
  planPast: WorkforcePlanState[];
  planFuture: WorkforcePlanState[];

  /* global */
  setJourney: (j: JourneyState) => void;
  resetDemo: () => void;
  fastForwardTo: (target: JourneyState) => void;

  /* onboarding */
  beginJourney: () => void;
  syncOnboardingFromServer: (payload: Partial<OnboardingState>) => void;
  setBackendSession: (sessionId: string) => void;
  setOnboardingSync: (status: OnboardingState["syncStatus"], error?: string | null) => void;
  setChannel: (channel: OnboardingChannel) => void;
  setCallInProgress: (inProgress: boolean) => void;
  setMode: (m: AutomationMode) => void;
  setIntro: (text: string) => void;
  setOrganizationShape: (shape: OrganizationShape) => void;
  setApprovalPreference: (preference: ApprovalPreference) => void;
  setOnboardingOwnership: (ownership: OnboardingOwnership) => void;
  setWorkflowBuilder: (builder: WorkflowBuilder) => void;
  setBuilderAccess: (access: BuilderAccess | null) => void;
  setAutomationScope: (scope: AutomationScope) => void;
  setBusinessArea: (area: string) => void;
  setRepetitiveTask: (task: string) => void;
  setCurrentWorkflow: (workflow: string) => void;
  setEmployeeCount: (count: string) => void;
  setApprovalOwner: (name: string) => void;
  setEmployeeEmails: (emails: string[]) => void;
  setDepartmentApprovals: (items: DepartmentApproval[]) => void;
  useDemoCompany: () => void;
  toggleTool: (toolId: string) => void;
  addCustomTool: (tool: Omit<CustomTool, "id">) => void;
  removeCustomTool: (id: string) => void;
  captureSection: (sectionId: string) => void;
  acceptConsent: () => void;
  completeOnboarding: () => void;

  /* lean canvas */
  setCanvasSource: (s: "upload" | "guided") => void;
  setCanvasValue: (id: LeanCanvasBlockId, value: string) => void;
  fillCanvasFromDemo: () => void;
  completeCanvas: () => void;

  /* discovery */
  setDiscoveryMode: (m: DiscoveryMode) => void;
  syncDiscoveryFromServer: (payload: Partial<DiscoveryState>) => void;
  replaceDiscoveryAnswers: (answers: Record<string, string>, completed?: boolean) => void;
  confirmAnswer: (questionId: string, text: string) => void;
  addFacts: (ids: string[]) => void;
  simulateUploadMore: () => void;
  simulateInvite: () => void;
  completeDiscovery: () => void;

  /* report — fact-level review (improvement spec §11.2) */
  confirmFact: (factId: string) => void;
  confirmFacts: (factIds: string[]) => void;
  editFact: (factId: string, value: string) => void;
  rejectFact: (factId: string, reason: string) => void;
  undoFactReview: (factId: string) => void;
  toggleFactConfidential: (factId: string) => void;

  /* report */
  editReportSection: (id: ReportSectionId, body: string[]) => void;
  setSectionStatus: (id: ReportSectionId, status: "draft" | "confirmed" | "rejected") => void;
  setSectionNote: (id: ReportSectionId, note: string) => void;
  setSectionOwner: (id: ReportSectionId, owner: string) => void;
  toggleSectionConfidential: (id: ReportSectionId) => void;
  approveReport: () => void;

  /* planner */
  setPlanGenerated: () => void;
  addAgentToPlan: (agentId: string) => void;
  removeAgentFromPlan: (agentId: string) => void;
  reorderPlanAgents: (orderedAgentIds: string[]) => void;
  toggleAgentWorkflow: (agentId: string, workflowId: string) => void;
  reorderAgentWorkflows: (agentId: string, order: string[]) => void;
  updateAgentConfig: (agentId: string, patch: Partial<AgentConfig>) => void;
  markAgentConfigured: (agentId: string) => void;
  submitDesignAnswers: (agentId: string, answers: AgentDesignAnswers) => void;
  approveAgentDesign: (agentId: string) => void;
  addWorkflowToAgent: (agentId: string, wf: AgentWorkflowDef) => void;
  applyNlCommand: (cmd: NlCommandFixture) => void;
  undoPlan: () => void;
  redoPlan: () => void;
  approvePlan: () => void;

  /* integrations */
  setIntegrationStatus: (id: string, status: IntegrationStatus) => void;
  markConnected: (id: string) => void;

  /* build */
  startBuilds: () => void;
  updateBuildJob: (
    agentId: string,
    patch: Partial<{ status: DemoState["buildJobs"][string]["status"]; progress: number; logCount: number }>,
  ) => void;
  finishBuildPhase: () => void;

  /* sandbox */
  startSandboxRun: (scenarioId: string) => void;
  setSandboxEventCount: (n: number) => void;
  pauseSandboxForApproval: () => void;
  setEditedResolution: (text: string) => void;
  reviseSandboxResolution: () => void;
  approveSandboxAction: () => void;
  completeSandboxRun: () => void;
  markStressDone: () => void;
  finishValidation: () => void;

  /* deploy */
  setChecklistValue: (id: string, value: boolean | string) => void;
  beginActivation: () => void;
  setAgentActivation: (agentId: string, status: "ready" | "activating" | "active") => void;
  completeActivation: () => void;

  /* workspace */
  setTeam: (t: WorkspaceTeam) => void;
  approveItem: (approvalId: string) => void;
  askAgentToUpdate: (approvalId: string) => void;
  addApprovalComment: (approvalId: string, text: string) => void;
  markNotificationsRead: () => void;
}

export type DemoStore = DemoState & DemoActions;

export const useDemoStore = create<DemoStore>()((set, get) => ({
      ...initialState(),
      _hydrated: false,
      planPast: [],
      planFuture: [],

      /* ── global ── */
      setJourney: (j) => set({ journey: j }),

      resetDemo: () => {
        cancelAllMockWork();
        set({ ...initialState(), planPast: [], planFuture: [] });
      },

      fastForwardTo: (target) => {
        cancelAllMockWork();
        const s = initialState();
        const done = (min: JourneyState) => atLeast(target, min);

        if (done("onboarding")) {
          s.onboarding = {
            channel: "voice",
            callInProgress: false,
            backendSessionId: null,
            mode: "assist",
            usedDemoCompany: true,
            organizationShape: "solo",
            approvalPreference: "owner_all",
            onboardingOwnership: "owner_only",
            workflowBuilder: "self",
            builderAccess: "workflows_only",
            automationScope: "focus_area",
            businessArea: "Operations",
            repetitiveTask: "Rescheduling customer appointments over the phone",
            currentWorkflow: "Messages come in through Gmail and WhatsApp, the coordinator checks the calendar manually, then calls customers one by one to shift appointments and update the spreadsheet.",
            employeeCount: String(DEMO_COMPANY.teamSize),
            approvalOwner: "Sarah Tan",
            employeeEmails: ["marcus@brightpath.sg", "jolene@brightpath.sg"],
            departmentApprovals: [
              {
                department: "Finance",
                processOwner: "Marcus Lim",
                email: "marcus@brightpath.sg",
                approver: "marcus@brightpath.sg",
                setupDelegate: "marcus@brightpath.sg",
                discoveryStatus: "completed",
              },
              {
                department: "Operations",
                processOwner: "Sarah Tan",
                email: "sarah@brightpath.sg",
                approver: "Sarah Tan",
                setupDelegate: "Sarah Tan",
                discoveryStatus: "completed",
              },
              {
                department: "Marketing",
                processOwner: "Jolene Ng",
                email: "jolene@brightpath.sg",
                approver: "jolene@brightpath.sg",
                setupDelegate: "jolene@brightpath.sg",
                discoveryStatus: "invited",
              },
            ],
            customTools: [],
            intro: DEMO_INTRO_ANSWER,
            selectedToolIds: [...DEMO_COMPANY.painPoints.slice(0, 0), "gmail", "google-calendar", "hubspot", "whatsapp-business", "quickbooks", "google-drive", "slack"],
            capturedSections: ["company", "team", "goals", "automation-preference", "tools", "business-info", "consent"],
            consentAccepted: true,
            completed: true,
            blueprintVersion: 1,
            blueprintStatus: "approved",
            handoffId: "handoff_demo",
            syncStatus: "idle",
            syncError: null,
          };
        }
        if (done("discovery")) {
          s.leanCanvas = {
            source: "guided",
            values: Object.fromEntries(LEAN_CANVAS_BLOCKS.map((b) => [b.id, b.demoValue])),
            completed: true,
          };
          s.discovery.factIds = [...BASE_FACT_IDS];
        }
        if (done("report_review")) {
          s.discovery = {
            mode: "voice",
            currentIndex: DISCOVERY_QUESTIONS.length,
            answers: Object.fromEntries(DISCOVERY_QUESTIONS.map((q) => [q.id, q.answer])),
            factIds: [...BASE_FACT_IDS, ...DISCOVERY_QUESTIONS.flatMap((q) => q.factIds)],
            uploadedMore: false,
            invitedEmployee: false,
            completed: true,
          };
        }
        if (done("report_approved")) {
          for (const id of REPORT_SECTION_ORDER) s.report.sections[id].status = "confirmed";
          s.report.version = 2;
          s.report.status = "approved";
          s.report.approvedAt = `${DEMO_TODAY}T09:30:00+08:00`;
        }
        if (done("plan_review")) {
          s.plan.agents = structuredClone(INITIAL_PLAN_AGENTS);
        }
        if (done("plan_approved")) {
          s.plan.agents = s.plan.agents.map((a) => ({
            ...a,
            status: "ready_to_build",
            designApproved: true,
            designAnswers:
              a.agentId === AGENT.recovery
                ? {
                    objective: "Coordinate high-value complaint resolution without financial commitments.",
                    trigger: "Complaint marked high severity, or a high-value customer requests compensation.",
                    inputs: "HubSpot customer history, job record, invoice status, technician notes.",
                    decisions: "Draft resolution and proposed compensation for owner review.",
                    permittedActions: "Gather context, draft resolutions, request technician information.",
                    escalation: "Escalate when information is missing or sentiment remains highly negative.",
                    systems: "HubSpot, Gmail, QuickBooks, Slack.",
                    successCriteria: "Owner receives a complete, approvable resolution within one business day.",
                  }
                : a.designAnswers,
          }));
          s.plan.status = "approved";
          s.plan.version = 2;
          s.plan.approvedAt = `${DEMO_TODAY}T11:00:00+08:00`;
        }
        if (done("sandbox_ready")) {
          for (const id of BUILD_ORDER) {
            s.buildJobs[id] = { agentId: id, status: "completed", progress: 100, logCount: 99 };
          }
          s.plan.agents = s.plan.agents.map((a) => ({ ...a, status: "validated" }));
        }
        if (done("ready_to_activate")) {
          s.sandbox = {
            scenarioId: "scenario-high-value-complaint",
            phase: "completed",
            eventCount: 99,
            editedResolution: null,
            resolutionRevised: false,
            approvedAt: `${DEMO_TODAY}T14:05:00+08:00`,
            stressDone: true,
          };
        }
        if (done("active_workspace")) {
          for (const id of BUILD_ORDER) s.deployment.agentStatus[id] = "active";
          s.deployment.activatedAt = `${DEMO_TODAY}T15:00:00+08:00`;
          s.plan.agents = s.plan.agents.map((a) => ({ ...a, status: "active" }));
          s.workspace.activity = [...ACTIVATION_BURST, ...s.workspace.activity];
          s.workspace.unreadNotifications = Object.values(s.workspace.approvals)
            .filter((a) => a.status === "pending")
            .map((a) => a.id)
            .slice(0, 3);
        }
        s.journey = target;
        set({ ...s, planPast: [], planFuture: [] });
      },

      /* ── onboarding ── */
      beginJourney: () => {
        if (get().journey === "not_started") set({ journey: "onboarding" });
      },
      syncOnboardingFromServer: (payload) =>
        set((st) => ({
          onboarding: { ...st.onboarding, ...normalizeOnboardingArrays(payload) },
        })),
      setBackendSession: (backendSessionId) =>
        set((st) => ({ onboarding: { ...st.onboarding, backendSessionId } })),
      setOnboardingSync: (syncStatus, syncError = null) =>
        set((st) => ({ onboarding: { ...st.onboarding, syncStatus, syncError } })),
      setChannel: (channel) =>
        set((st) => ({ onboarding: { ...st.onboarding, channel } })),
      setCallInProgress: (callInProgress) =>
        set((st) => ({ onboarding: { ...st.onboarding, callInProgress } })),
      setMode: (mode) =>
        set((st) => ({ onboarding: { ...st.onboarding, mode } })),
      setIntro: (intro) =>
        set((st) => ({ onboarding: { ...st.onboarding, intro } })),
      setOrganizationShape: (organizationShape) =>
        set((st) => ({ onboarding: { ...st.onboarding, organizationShape } })),
      setApprovalPreference: (approvalPreference) =>
        set((st) => ({ onboarding: { ...st.onboarding, approvalPreference } })),
      setOnboardingOwnership: (onboardingOwnership) =>
        set((st) => ({ onboarding: { ...st.onboarding, onboardingOwnership } })),
      setWorkflowBuilder: (workflowBuilder) =>
        set((st) => ({ onboarding: { ...st.onboarding, workflowBuilder } })),
      setBuilderAccess: (builderAccess) =>
        set((st) => ({ onboarding: { ...st.onboarding, builderAccess } })),
      setAutomationScope: (automationScope) =>
        set((st) => ({ onboarding: { ...st.onboarding, automationScope } })),
      setBusinessArea: (businessArea) =>
        set((st) => ({ onboarding: { ...st.onboarding, businessArea } })),
      setRepetitiveTask: (repetitiveTask) =>
        set((st) => ({ onboarding: { ...st.onboarding, repetitiveTask } })),
      setCurrentWorkflow: (currentWorkflow) =>
        set((st) => ({ onboarding: { ...st.onboarding, currentWorkflow } })),
      setEmployeeCount: (employeeCount) =>
        set((st) => ({ onboarding: { ...st.onboarding, employeeCount } })),
      setApprovalOwner: (approvalOwner) =>
        set((st) => ({ onboarding: { ...st.onboarding, approvalOwner: approvalOwner ?? "" } })),
      setEmployeeEmails: (employeeEmails) =>
        set((st) => ({ onboarding: { ...st.onboarding, employeeEmails } })),
      setDepartmentApprovals: (departmentApprovals) =>
        set((st) => ({ onboarding: { ...st.onboarding, departmentApprovals } })),
      useDemoCompany: () =>
        set((st) => ({
          journey: st.journey === "not_started" ? "onboarding" : st.journey,
          onboarding: {
            ...st.onboarding,
            usedDemoCompany: true,
            intro: st.onboarding.intro || DEMO_INTRO_ANSWER,
            organizationShape: "solo",
            approvalPreference: "owner_all",
            onboardingOwnership: "owner_only",
            workflowBuilder: "self",
            builderAccess: "workflows_only",
            automationScope: "focus_area",
            businessArea: "Operations",
            repetitiveTask: "Rescheduling customer appointments over the phone",
            currentWorkflow: "Messages come in through Gmail and WhatsApp, the coordinator checks the calendar manually, then calls customers one by one to shift appointments and update the spreadsheet.",
            employeeCount: String(DEMO_COMPANY.teamSize),
            approvalOwner: "Sarah Tan",
            employeeEmails: ["marcus@brightpath.sg", "jolene@brightpath.sg"],
            departmentApprovals: [
              {
                department: "Finance",
                processOwner: "Marcus Lim",
                email: "marcus@brightpath.sg",
                approver: "marcus@brightpath.sg",
                setupDelegate: "marcus@brightpath.sg",
                discoveryStatus: "completed",
              },
              {
                department: "Operations",
                processOwner: "Sarah Tan",
                email: "sarah@brightpath.sg",
                approver: "Sarah Tan",
                setupDelegate: "Sarah Tan",
                discoveryStatus: "completed",
              },
              {
                department: "Marketing",
                processOwner: "Jolene Ng",
                email: "jolene@brightpath.sg",
                approver: "jolene@brightpath.sg",
                setupDelegate: "jolene@brightpath.sg",
                discoveryStatus: "invited",
              },
            ],
            selectedToolIds: [
              "gmail",
              "google-calendar",
              "hubspot",
              "whatsapp-business",
              "quickbooks",
              "google-drive",
              "slack",
            ],
            capturedSections: ["company", "team", "goals", "tools"],
          },
        })),
      toggleTool: (toolId) =>
        set((st) => ({
          onboarding: {
            ...st.onboarding,
            selectedToolIds: st.onboarding.selectedToolIds.includes(toolId)
              ? st.onboarding.selectedToolIds.filter((t) => t !== toolId)
              : [...st.onboarding.selectedToolIds, toolId],
          },
        })),
      addCustomTool: (tool) =>
        set((st) => {
          const id = `custom-${tool.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
          if (st.onboarding.customTools.some((t) => t.id === id)) return {};
          return {
            onboarding: {
              ...st.onboarding,
              customTools: [...st.onboarding.customTools, { ...tool, id }],
            },
          };
        }),
      removeCustomTool: (id) =>
        set((st) => ({
          onboarding: {
            ...st.onboarding,
            customTools: st.onboarding.customTools.filter((t) => t.id !== id),
          },
        })),
      captureSection: (sectionId) =>
        set((st) => ({
          onboarding: {
            ...st.onboarding,
            capturedSections: st.onboarding.capturedSections.includes(sectionId)
              ? st.onboarding.capturedSections
              : [...st.onboarding.capturedSections, sectionId],
          },
        })),
      acceptConsent: () =>
        set((st) => ({ onboarding: { ...st.onboarding, consentAccepted: true } })),
      completeOnboarding: () =>
        set((st) => ({
          journey: atLeast(st.journey, "discovery") ? st.journey : "discovery",
          onboarding: { ...st.onboarding, completed: true },
        })),

      /* ── lean canvas ── */
      setCanvasSource: (source) =>
        set((st) => ({ leanCanvas: { ...st.leanCanvas, source } })),
      setCanvasValue: (id, value) =>
        set((st) => ({
          leanCanvas: { ...st.leanCanvas, values: { ...st.leanCanvas.values, [id]: value } },
        })),
      fillCanvasFromDemo: () =>
        set((st) => ({
          leanCanvas: {
            ...st.leanCanvas,
            values: Object.fromEntries(LEAN_CANVAS_BLOCKS.map((b) => [b.id, b.demoValue])),
          },
        })),
      completeCanvas: () =>
        set((st) => ({
          leanCanvas: { ...st.leanCanvas, completed: true },
          discovery: { ...st.discovery, factIds: Array.from(new Set([...st.discovery.factIds, ...BASE_FACT_IDS])) },
          journey: atLeast(st.journey, "discovery") ? st.journey : "discovery",
        })),

      /* ── discovery ── */
      setDiscoveryMode: (mode) =>
        set((st) => ({ discovery: { ...st.discovery, mode } })),
      syncDiscoveryFromServer: (payload) =>
        set((st) => {
          const answers = payload.answers ? { ...st.discovery.answers, ...payload.answers } : st.discovery.answers;
          const answeredCount = Object.keys(answers).length;
          return {
            discovery: {
              ...st.discovery,
              ...payload,
              answers,
              currentIndex: Math.max(st.discovery.currentIndex, answeredCount),
              completed: payload.completed ?? st.discovery.completed ?? false,
            },
          };
        }),
      replaceDiscoveryAnswers: (answers, completed) =>
        set((st) => {
          const factIds = Array.from(
            new Set(
              Object.keys(answers).flatMap((questionId) => {
                const q = DISCOVERY_QUESTIONS.find((item) => item.id === questionId);
                return q?.factIds ?? [];
              }),
            ),
          );
          return {
            discovery: {
              ...st.discovery,
              answers,
              factIds,
              currentIndex: Math.max(0, Object.keys(answers).length),
              completed: completed ?? Object.keys(answers).length >= DISCOVERY_QUESTIONS.length,
            },
          };
        }),
      confirmAnswer: (questionId, text) =>
        set((st) => {
          const q = DISCOVERY_QUESTIONS.find((x) => x.id === questionId);
          const answers = { ...st.discovery.answers, [questionId]: text };
          const answeredCount = Object.keys(answers).length;
          return {
            discovery: {
              ...st.discovery,
              answers,
              currentIndex: Math.max(st.discovery.currentIndex, answeredCount),
              factIds: q
                ? Array.from(new Set([...st.discovery.factIds, ...q.factIds]))
                : st.discovery.factIds,
              completed: answeredCount >= DISCOVERY_QUESTIONS.length,
            },
          };
        }),
      addFacts: (ids) =>
        set((st) => ({
          discovery: {
            ...st.discovery,
            factIds: Array.from(new Set([...st.discovery.factIds, ...ids])),
          },
        })),
      simulateUploadMore: () =>
        set((st) => ({
          discovery: {
            ...st.discovery,
            uploadedMore: true,
            factIds: Array.from(new Set([...st.discovery.factIds, ...UPLOAD_FACT_IDS])),
          },
        })),
      simulateInvite: () =>
        set((st) => ({
          discovery: {
            ...st.discovery,
            invitedEmployee: true,
            factIds: Array.from(new Set([...st.discovery.factIds, ...INVITE_FACT_IDS])),
          },
        })),
      completeDiscovery: () =>
        set((st) => ({
          journey: atLeast(st.journey, "report_review") ? st.journey : "report_review",
        })),

      /* ── report: fact-level review ── */
      confirmFact: (factId) =>
        set((st) => ({
          report: {
            ...st.report,
            facts: {
              ...st.report.facts,
              [factId]: {
                ...(st.report.facts[factId] ?? blankFactState()),
                status: "confirmed",
                reason: "",
                reviewedAt: "Just now",
              },
            },
          },
        })),
      confirmFacts: (factIds) =>
        set((st) => {
          const facts = { ...st.report.facts };
          for (const id of factIds) {
            const prev = facts[id] ?? blankFactState();
            if (prev.status === "rejected") continue; // Confirm all never overrides an explicit rejection
            facts[id] = { ...prev, status: "confirmed", reason: "", reviewedAt: "Just now" };
          }
          return { report: { ...st.report, facts } };
        }),
      editFact: (factId, value) =>
        set((st) => {
          const wasApproved = st.report.status === "approved";
          return {
            report: {
              ...st.report,
              status: wasApproved ? "draft" : st.report.status,
              stale: wasApproved ? true : st.report.stale,
              facts: {
                ...st.report.facts,
                [factId]: {
                  ...(st.report.facts[factId] ?? blankFactState()),
                  status: "edited",
                  editedValue: value,
                  reviewedAt: "Just now",
                },
              },
            },
            plan: wasApproved && st.plan.agents.length > 0 ? { ...st.plan, stale: true } : st.plan,
          };
        }),
      rejectFact: (factId, reason) =>
        set((st) => ({
          report: {
            ...st.report,
            facts: {
              ...st.report.facts,
              [factId]: {
                ...(st.report.facts[factId] ?? blankFactState()),
                status: "rejected",
                reason,
                reviewedAt: "Just now",
              },
            },
          },
        })),
      undoFactReview: (factId) =>
        set((st) => ({
          report: {
            ...st.report,
            facts: {
              ...st.report.facts,
              [factId]: {
                ...(st.report.facts[factId] ?? blankFactState()),
                status: "unreviewed",
                editedValue: null,
                reason: "",
                reviewedAt: null,
              },
            },
          },
        })),
      toggleFactConfidential: (factId) =>
        set((st) => {
          const prev = st.report.facts[factId] ?? blankFactState();
          return {
            report: {
              ...st.report,
              facts: {
                ...st.report.facts,
                [factId]: { ...prev, confidential: !prev.confidential },
              },
            },
          };
        }),

      /* ── report ── */
      editReportSection: (id, body) =>
        set((st) => {
          const wasApproved = st.report.status === "approved";
          return {
            report: {
              ...st.report,
              status: wasApproved ? "draft" : st.report.status,
              stale: wasApproved ? true : st.report.stale,
              sections: {
                ...st.report.sections,
                [id]: { ...st.report.sections[id], editedBody: body, status: "draft" },
              },
            },
            plan: wasApproved && st.plan.agents.length > 0 ? { ...st.plan, stale: true } : st.plan,
          };
        }),
      setSectionStatus: (id, status) =>
        set((st) => ({
          report: {
            ...st.report,
            sections: { ...st.report.sections, [id]: { ...st.report.sections[id], status } },
          },
        })),
      setSectionNote: (id, ownerNote) =>
        set((st) => ({
          report: {
            ...st.report,
            sections: { ...st.report.sections, [id]: { ...st.report.sections[id], ownerNote } },
          },
        })),
      setSectionOwner: (id, processOwner) =>
        set((st) => ({
          report: {
            ...st.report,
            sections: { ...st.report.sections, [id]: { ...st.report.sections[id], processOwner } },
          },
        })),
      toggleSectionConfidential: (id) =>
        set((st) => ({
          report: {
            ...st.report,
            sections: {
              ...st.report.sections,
              [id]: { ...st.report.sections[id], confidential: !st.report.sections[id].confidential },
            },
          },
        })),
      approveReport: () =>
        set((st) => ({
          report: {
            ...st.report,
            version: st.report.stale ? st.report.version + 1 : 2,
            status: "approved",
            stale: false,
            approvedAt: `${DEMO_TODAY}T09:30:00+08:00`,
          },
          journey: atLeast(st.journey, "report_approved") ? st.journey : "report_approved",
        })),

      /* ── planner ── */
      setPlanGenerated: () =>
        set((st) => ({
          plan: st.plan.agents.length
            ? { ...st.plan, stale: false }
            : { ...st.plan, agents: structuredClone(INITIAL_PLAN_AGENTS), stale: false },
          journey: atLeast(st.journey, "plan_review") ? st.journey : "plan_review",
        })),

      addAgentToPlan: (agentId) =>
        set((st) => {
          if (st.plan.agents.some((a) => a.agentId === agentId)) return {};
          const def = AGENT_LIBRARY[agentId];
          if (!def) return {};
          const agent: PlanAgent = {
            agentId,
            status: def.source === "custom" ? "needs_information" : "needs_configuration",
            config: structuredClone(def.defaultConfig),
            designAnswers: null,
            designApproved: false,
            workflowOrder: def.workflows.map((w) => w.id),
          };
          const nextAgents = [...st.plan.agents, agent];
          return {
            planPast: [...st.planPast, snapshotPlan(st.plan)].slice(-MAX_HISTORY),
            planFuture: [],
            plan: {
              ...st.plan,
              agents: nextAgents,
              lastChange: {
                summary: `Added ${def.name} to the plan.`,
                costDelta: { setup: def.setupCost, monthly: def.monthlyCost },
              },
            },
          };
        }),

      removeAgentFromPlan: (agentId) =>
        set((st) => {
          const def = AGENT_LIBRARY[agentId];
          if (!st.plan.agents.some((a) => a.agentId === agentId)) return {};
          return {
            planPast: [...st.planPast, snapshotPlan(st.plan)].slice(-MAX_HISTORY),
            planFuture: [],
            plan: {
              ...st.plan,
              agents: st.plan.agents.filter((a) => a.agentId !== agentId),
              lastChange: def
                ? {
                    summary: `Removed ${def.name} from the plan.`,
                    costDelta: { setup: -def.setupCost, monthly: -def.monthlyCost },
                  }
                : st.plan.lastChange,
            },
          };
        }),

      reorderPlanAgents: (orderedAgentIds) =>
        set((st) => {
          const byId = new Map(st.plan.agents.map((a) => [a.agentId, a]));
          const agents = orderedAgentIds
            .map((id) => byId.get(id))
            .filter((a): a is PlanAgent => Boolean(a));
          if (agents.length !== st.plan.agents.length) return {};
          return {
            planPast: [...st.planPast, snapshotPlan(st.plan)].slice(-MAX_HISTORY),
            planFuture: [],
            plan: { ...st.plan, agents },
          };
        }),

      toggleAgentWorkflow: (agentId, workflowId) =>
        set((st) => ({
          planPast: [...st.planPast, snapshotPlan(st.plan)].slice(-MAX_HISTORY),
          planFuture: [],
          plan: {
            ...st.plan,
            agents: st.plan.agents.map((a) =>
              a.agentId === agentId
                ? {
                    ...a,
                    config: {
                      ...a.config,
                      workflowsEnabled: {
                        ...a.config.workflowsEnabled,
                        [workflowId]: !(a.config.workflowsEnabled[workflowId] ?? true),
                      },
                    },
                  }
                : a,
            ),
          },
        })),

      reorderAgentWorkflows: (agentId, order) =>
        set((st) => ({
          planPast: [...st.planPast, snapshotPlan(st.plan)].slice(-MAX_HISTORY),
          planFuture: [],
          plan: {
            ...st.plan,
            agents: st.plan.agents.map((a) =>
              a.agentId === agentId ? { ...a, workflowOrder: order } : a,
            ),
          },
        })),

      updateAgentConfig: (agentId, patch) =>
        set((st) => ({
          plan: {
            ...st.plan,
            agents: st.plan.agents.map((a) =>
              a.agentId === agentId ? { ...a, config: { ...a.config, ...patch } } : a,
            ),
          },
        })),

      markAgentConfigured: (agentId) =>
        set((st) => ({
          plan: {
            ...st.plan,
            agents: st.plan.agents.map((a) =>
              a.agentId === agentId && a.status === "needs_configuration"
                ? { ...a, status: "ready_to_build" }
                : a,
            ),
          },
          journey: atLeast(st.journey, "agent_configuration") ? st.journey : "agent_configuration",
        })),

      submitDesignAnswers: (agentId, answers) =>
        set((st) => ({
          plan: {
            ...st.plan,
            agents: st.plan.agents.map((a) =>
              a.agentId === agentId ? { ...a, designAnswers: answers } : a,
            ),
          },
        })),

      approveAgentDesign: (agentId) =>
        set((st) => ({
          plan: {
            ...st.plan,
            agents: st.plan.agents.map((a) =>
              a.agentId === agentId
                ? { ...a, designApproved: true, status: "ready_to_build" }
                : a,
            ),
          },
          journey: atLeast(st.journey, "agent_configuration") ? st.journey : "agent_configuration",
        })),

      addWorkflowToAgent: (agentId, wf) =>
        set((st) => ({
          planPast: [...st.planPast, snapshotPlan(st.plan)].slice(-MAX_HISTORY),
          planFuture: [],
          plan: {
            ...st.plan,
            agents: st.plan.agents.map((a) =>
              a.agentId === agentId && !a.workflowOrder.includes(wf.id)
                ? {
                    ...a,
                    workflowOrder: [...a.workflowOrder, wf.id],
                    config: {
                      ...a.config,
                      workflowsEnabled: { ...a.config.workflowsEnabled, [wf.id]: true },
                    },
                  }
                : a,
            ),
          },
        })),

      applyNlCommand: (cmd) =>
        set((st) => {
          const past = [...st.planPast, snapshotPlan(st.plan)].slice(-MAX_HISTORY);
          let plan = { ...st.plan };
          switch (cmd.effect.kind) {
            case "add_rule":
              plan = { ...plan, planRules: [...plan.planRules, cmd.effect.rule] };
              break;
            case "add_workflow": {
              const { agentId, workflow } = cmd.effect;
              plan = {
                ...plan,
                agents: plan.agents.map((a) =>
                  a.agentId === agentId && !a.workflowOrder.includes(workflow.id)
                    ? {
                        ...a,
                        workflowOrder: [...a.workflowOrder, workflow.id],
                        config: {
                          ...a.config,
                          workflowsEnabled: { ...a.config.workflowsEnabled, [workflow.id]: true },
                        },
                      }
                    : a,
                ),
              };
              break;
            }
            case "move_workflow": {
              const { fromAgentId, toAgentId, workflowId } = cmd.effect;
              plan = {
                ...plan,
                agents: plan.agents.map((a) => {
                  if (a.agentId === fromAgentId)
                    return { ...a, workflowOrder: a.workflowOrder.filter((w) => w !== workflowId) };
                  if (a.agentId === toAgentId && !a.workflowOrder.includes(workflowId))
                    return {
                      ...a,
                      workflowOrder: [...a.workflowOrder, workflowId],
                      config: {
                        ...a.config,
                        workflowsEnabled: { ...a.config.workflowsEnabled, [workflowId]: true },
                      },
                    };
                  return a;
                }),
              };
              break;
            }
            case "set_approval": {
              const { agentId, action } = cmd.effect;
              plan = {
                ...plan,
                agents: plan.agents.map((a) =>
                  a.agentId === agentId && !a.config.approvalActions.includes(action)
                    ? { ...a, config: { ...a.config, approvalActions: [...a.config.approvalActions, action] } }
                    : a,
                ),
              };
              break;
            }
          }
          plan.lastChange = { summary: cmd.summary, costDelta: cmd.costDelta };
          // Every applied change is a new mock plan version (improvement spec §12.3);
          // undo restores the previous snapshot including its version.
          plan.version = plan.version + 1;
          return { planPast: past, planFuture: [], plan };
        }),

      undoPlan: () =>
        set((st) => {
          const past = [...st.planPast];
          const prev = past.pop();
          if (!prev) return {};
          return {
            planPast: past,
            planFuture: [snapshotPlan(st.plan), ...st.planFuture].slice(0, MAX_HISTORY),
            plan: { ...prev, lastChange: { summary: "Restored the previous plan.", costDelta: { setup: 0, monthly: 0 } } },
          };
        }),

      redoPlan: () =>
        set((st) => {
          const future = [...st.planFuture];
          const next = future.shift();
          if (!next) return {};
          return {
            planPast: [...st.planPast, snapshotPlan(st.plan)].slice(-MAX_HISTORY),
            planFuture: future,
            plan: next,
          };
        }),

      approvePlan: () =>
        set((st) => ({
          plan: {
            ...st.plan,
            status: "approved",
            version: st.plan.version + 1,
            approvedAt: `${DEMO_TODAY}T11:00:00+08:00`,
            stale: false,
          },
          journey: atLeast(st.journey, "plan_approved") ? st.journey : "plan_approved",
        })),

      /* ── integrations ── */
      setIntegrationStatus: (id, status) =>
        set((st) => ({
          integrations: {
            ...st.integrations,
            [id]: { ...(st.integrations[id] ?? { connectedAt: null }), status },
          },
        })),
      markConnected: (id) =>
        set((st) => ({
          integrations: {
            ...st.integrations,
            [id]: { status: "connected", connectedAt: `${DEMO_TODAY}T10:15:00+08:00` },
          },
        })),

      /* ── build ── */
      startBuilds: () =>
        set((st) => {
          const jobs: DemoState["buildJobs"] = {};
          for (const a of st.plan.agents) {
            jobs[a.agentId] = { agentId: a.agentId, status: "queued", progress: 0, logCount: 0 };
          }
          return {
            buildJobs: jobs,
            journey: atLeast(st.journey, "building") ? st.journey : "building",
            plan: {
              ...st.plan,
              agents: st.plan.agents.map((a) => ({ ...a, status: "building" })),
            },
          };
        }),
      updateBuildJob: (agentId, patch) =>
        set((st) => ({
          buildJobs: {
            ...st.buildJobs,
            [agentId]: { ...st.buildJobs[agentId], ...patch },
          },
        })),
      finishBuildPhase: () =>
        set((st) => ({
          journey: atLeast(st.journey, "sandbox_ready") ? st.journey : "sandbox_ready",
          plan: {
            ...st.plan,
            agents: st.plan.agents.map((a) => ({ ...a, status: "validated" })),
          },
        })),

      /* ── sandbox ── */
      startSandboxRun: (scenarioId) =>
        set((st) => ({
          sandbox: {
            ...st.sandbox,
            scenarioId,
            phase: "running",
            eventCount: 0,
            editedResolution: null,
            resolutionRevised: false,
            approvedAt: null,
          },
        })),
      setSandboxEventCount: (n) =>
        set((st) => ({ sandbox: { ...st.sandbox, eventCount: n } })),
      pauseSandboxForApproval: () =>
        set((st) => ({ sandbox: { ...st.sandbox, phase: "paused_for_approval" } })),
      setEditedResolution: (text) =>
        set((st) => ({ sandbox: { ...st.sandbox, editedResolution: text } })),
      reviseSandboxResolution: () =>
        set((st) => ({ sandbox: { ...st.sandbox, resolutionRevised: true } })),
      approveSandboxAction: () =>
        set((st) => ({
          sandbox: {
            ...st.sandbox,
            phase: "resuming",
            approvedAt: `${DEMO_TODAY}T14:05:00+08:00`,
          },
        })),
      completeSandboxRun: () =>
        set((st) => ({
          sandbox: { ...st.sandbox, phase: "completed" },
          journey: atLeast(st.journey, "validation_review") ? st.journey : "validation_review",
        })),
      markStressDone: () =>
        set((st) => ({ sandbox: { ...st.sandbox, stressDone: true } })),
      finishValidation: () =>
        set((st) => ({
          journey: atLeast(st.journey, "ready_to_activate") ? st.journey : "ready_to_activate",
        })),

      /* ── deploy ── */
      setChecklistValue: (id, value) =>
        set((st) => ({
          deployment: { ...st.deployment, checked: { ...st.deployment.checked, [id]: value } },
        })),
      beginActivation: () =>
        set((st) => ({
          journey: atLeast(st.journey, "activating") ? st.journey : "activating",
          deployment: {
            ...st.deployment,
            agentStatus: Object.fromEntries(st.plan.agents.map((a) => [a.agentId, "ready" as const])),
          },
        })),
      setAgentActivation: (agentId, status) =>
        set((st) => ({
          deployment: {
            ...st.deployment,
            agentStatus: { ...st.deployment.agentStatus, [agentId]: status },
          },
        })),
      completeActivation: () =>
        set((st) => ({
          journey: "active_workspace",
          deployment: { ...st.deployment, activatedAt: `${DEMO_TODAY}T15:00:00+08:00` },
          plan: {
            ...st.plan,
            agents: st.plan.agents.map((a) => ({ ...a, status: "active" })),
          },
          workspace: {
            ...st.workspace,
            activity: [...ACTIVATION_BURST, ...st.workspace.activity],
            unreadNotifications: Object.values(st.workspace.approvals)
              .filter((a) => a.status === "pending")
              .map((a) => a.id)
              .slice(0, 3),
          },
        })),

      /* ── workspace ── */
      setTeam: (team) => set((st) => ({ workspace: { ...st.workspace, team } })),

      approveItem: (approvalId) =>
        set((st) => {
          const item = st.workspace.approvals[approvalId];
          if (!item || (item.status !== "pending" && item.status !== "review_requested")) return {};
          const approved: ApprovalItem = { ...item, status: "approved" };
          const calendarEvents = { ...st.workspace.calendarEvents };
          if (item.calendarEventId && calendarEvents[item.calendarEventId]) {
            calendarEvents[item.calendarEventId] = {
              ...calendarEvents[item.calendarEventId],
              state: calendarStateFor("approved"),
            };
          }
          activitySeq += 1;
          return {
            workspace: {
              ...st.workspace,
              approvals: { ...st.workspace.approvals, [approvalId]: approved },
              calendarEvents,
              activity: [
                {
                  id: `act-approve-${activitySeq}`,
                  at: "Just now",
                  agentId: item.agentId,
                  agentName: item.agentName,
                  team: item.team,
                  message: `Approved: ${item.title}`,
                  tone: "done" as const,
                },
                ...st.workspace.activity,
              ],
              unreadNotifications: st.workspace.unreadNotifications.filter((id) => id !== approvalId),
            },
          };
        }),

      askAgentToUpdate: (approvalId) =>
        set((st) => {
          const item = st.workspace.approvals[approvalId];
          if (!item) return {};
          const nextVersion = {
            version: item.versions.length + 1,
            content: item.nextRevision.content,
            at: "Just now",
            note: item.nextRevision.note,
          };
          activitySeq += 1;
          return {
            workspace: {
              ...st.workspace,
              approvals: {
                ...st.workspace.approvals,
                [approvalId]: {
                  ...item,
                  versions: [...item.versions, nextVersion],
                  status: "pending",
                },
              },
              activity: [
                {
                  id: `act-update-${activitySeq}`,
                  at: "Just now",
                  agentId: item.agentId,
                  agentName: item.agentName,
                  team: item.team,
                  message: `Updated draft for: ${item.title}`,
                  tone: "info" as const,
                },
                ...st.workspace.activity,
              ],
            },
          };
        }),

      addApprovalComment: (approvalId, text) =>
        set((st) => {
          const item = st.workspace.approvals[approvalId];
          if (!item || !text.trim()) return {};
          return {
            workspace: {
              ...st.workspace,
              approvals: {
                ...st.workspace.approvals,
                [approvalId]: {
                  ...item,
                  comments: [...item.comments, { author: "You", at: "Just now", text: text.trim() }],
                },
              },
            },
          };
        }),

      markNotificationsRead: () =>
        set((st) => ({ workspace: { ...st.workspace, unreadNotifications: [] } })),
}));

/** Selector: plan cost totals (illustrative). useShallow caches the derived
 *  object so the snapshot stays referentially stable between renders. */
export function usePlanTotals() {
  return useDemoStore(useShallow((s) => planTotals(s.plan.agents)));
}

/** Blockers preventing plan approval (spec §13). */
export function planBlockers(agents: PlanAgent[]): string[] {
  const blockers: string[] = [];
  for (const a of agents) {
    const def = AGENT_LIBRARY[a.agentId];
    if (!def) continue;
    if (a.status === "needs_information" || (def.source === "custom" && !a.designApproved)) {
      blockers.push(`${def.name}: complete the design call and approve its design.`);
    } else if (a.status === "needs_configuration") {
      blockers.push(`${def.name}: review its configuration and mark it ready.`);
    }
  }
  return blockers;
}
