/**
 * File-backed store. `data/db.json` is the single source of truth the
 * Orchestration Controller reads and writes. No ORM, no external DB —
 * the mock MVP persists across restarts and is trivially inspectable.
 */
import { promises as fs } from "fs";
import path from "path";
import type { Db, OnboardingQuestionDefinition } from "../contracts";
import { FIXTURE_CALENDAR, ORG } from "../fixtures";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

const ONBOARDING_QUESTIONS: OnboardingQuestionDefinition[] = [
  {
    id: "preferred_channel",
    schemaVersion: "2026-07-28",
    section: "language_consent",
    fieldPath: "preferences.channel",
    typedLabel: "How would you like to complete onboarding?",
    voicePrompt: "Would you prefer to type your answers or talk them through with me?",
    required: true,
    answerType: "single_select",
    options: [
      { value: "typed", label: "Type my answers" },
      { value: "voice", label: "Talk to the voice agent" },
    ],
  },
  {
    id: "setup_builder",
    schemaVersion: "2026-07-28",
    section: "organization",
    fieldPath: "setup.workflowBuilder",
    typedLabel: "Who's going to build your first workflow?",
    voicePrompt: "Will you build your first workflow yourself, or would you like to invite someone else to build it?",
    required: true,
    answerType: "single_select",
    options: [
      { value: "self", label: "I'll build it myself" },
      { value: "invite", label: "I want someone else to build it" },
    ],
  },
  {
    id: "setup_builder_access",
    schemaVersion: "2026-07-28",
    section: "organization",
    fieldPath: "setup.builderAccess",
    typedLabel: "What should they be able to do?",
    voicePrompt: "Should they only build workflows, or should they also manage billing, users and account settings?",
    required: false,
    answerType: "single_select",
    options: [
      { value: "workflows_only", label: "Build workflows only" },
      { value: "account_manager", label: "Build workflows + manage the account" },
    ],
  },
  {
    id: "automation_scope",
    schemaVersion: "2026-07-28",
    section: "automation_preferences",
    fieldPath: "automation.scope",
    typedLabel: "How would you like to introduce automation into your business?",
    voicePrompt: "Would you like to start with one task, improve one business area, or analyse the whole business first?",
    required: true,
    answerType: "single_select",
    options: [
      { value: "start_small", label: "Start with one task" },
      { value: "focus_area", label: "Improve one business area" },
      { value: "whole_business", label: "Analyse the whole business" },
    ],
  },
  {
    id: "automation_mode",
    schemaVersion: "2026-07-28",
    section: "automation_preferences",
    fieldPath: "automation.mode",
    typedLabel: "What AI operating mode should Oriant assume for now?",
    voicePrompt: "For now, should Oriant assume an assist mode, a more automated mode, or should it evaluate that later?",
    required: false,
    answerType: "single_select",
    options: [
      { value: "assist", label: "Assist" },
      { value: "operate", label: "Operate" },
      { value: "unsure", label: "Not sure yet" },
    ],
  },
  {
    id: "company_intro",
    schemaVersion: "2026-07-28",
    section: "company",
    fieldPath: "company.summary",
    typedLabel: "Tell us what your company does and what takes too much time.",
    voicePrompt: "Tell me what your company does and what is taking too much of your team's time.",
    required: true,
    answerType: "long_text",
  },
  {
    id: "organization_shape",
    schemaVersion: "2026-07-28",
    section: "organization",
    fieldPath: "organization.shape",
    typedLabel: "What best describes your organization today?",
    voicePrompt: "Are you running this solo, with a small team, or with managers and clearer approvals already in place?",
    required: true,
    answerType: "single_select",
    options: [
      { value: "solo", label: "Just me" },
      { value: "owner_with_team", label: "Owner with a small team" },
      { value: "multi_role_team", label: "Multi-role team" },
      { value: "manager_led", label: "Managers and delegated approvals" },
    ],
  },
  {
    id: "business_area",
    schemaVersion: "2026-07-28",
    section: "goals",
    fieldPath: "discovery.businessArea",
    typedLabel: "Which part of the business takes up the most time?",
    voicePrompt: "Which part of the business takes up the most time today?",
    required: false,
    answerType: "short_text",
  },
  {
    id: "repetitive_task",
    schemaVersion: "2026-07-28",
    section: "goals",
    fieldPath: "discovery.repetitiveTask",
    typedLabel: "Which specific task feels the most repetitive or frustrating?",
    voicePrompt: "Which specific task feels the most repetitive or frustrating right now?",
    required: false,
    answerType: "short_text",
  },
  {
    id: "current_workflow",
    schemaVersion: "2026-07-28",
    section: "systems",
    fieldPath: "discovery.currentWorkflow",
    typedLabel: "How do you handle this task today?",
    voicePrompt: "How do you currently handle that task today, step by step?",
    required: false,
    answerType: "long_text",
  },
  {
    id: "employee_count",
    schemaVersion: "2026-07-28",
    section: "team",
    fieldPath: "organization.employeeCount",
    typedLabel: "About how many people are involved in the business?",
    voicePrompt: "Roughly how many people are involved in running the business today?",
    required: false,
    answerType: "number",
  },
  {
    id: "approval_owner",
    schemaVersion: "2026-07-28",
    section: "team",
    fieldPath: "organization.approvalOwner",
    typedLabel: "Who should remain the approval owner for sensitive actions?",
    voicePrompt: "Who should remain the final approval owner for sensitive actions?",
    required: false,
    answerType: "short_text",
  },
  {
    id: "employee_emails",
    schemaVersion: "2026-07-28",
    section: "team",
    fieldPath: "organization.employeeEmails",
    typedLabel: "Who else can receive delegated approvals or setup tasks?",
    voicePrompt: "If you want to invite department owners or delegates, what are their work emails?",
    required: false,
    answerType: "structured_list",
  },
  {
    id: "department_approvals",
    schemaVersion: "2026-07-28",
    section: "team",
    fieldPath: "organization.departmentApprovals",
    typedLabel: "Which departments should be part of discovery first?",
    voicePrompt: "Which departments should be part of discovery first, and who owns each one?",
    required: false,
    answerType: "structured_list",
  },
  {
    id: "selected_tools",
    schemaVersion: "2026-07-28",
    section: "systems",
    fieldPath: "systems.selectedTools",
    typedLabel: "Which tools does your team already use?",
    voicePrompt: "Which systems does your team already work in every week?",
    required: false,
    answerType: "multi_select",
  },
  {
    id: "consent_accepted",
    schemaVersion: "2026-07-28",
    section: "language_consent",
    fieldPath: "consent.accepted",
    typedLabel: "Do you understand what Oriant may read and what always needs approval?",
    voicePrompt: "Do you understand what Oriant may read and what always needs approval?",
    required: true,
    answerType: "boolean",
  },
];

function freshDb(): Db {
  return {
    org: { ...ORG },
    phase: "onboarding",
    onboarding: {
      activeSessionId: null,
      sessions: {},
      questions: ONBOARDING_QUESTIONS,
    },
    call: { answers: {}, goals: {}, systems: {}, canvasUploaded: false },
    report: null,
    plan: null,
    planHistory: [],
    buildJobs: {},
    artifacts: {},
    validations: {},
    deployment: null,
    approvals: [],
    events: [],
    calendar: FIXTURE_CALENDAR,
    audit: [],
    systemEvents: [],
    providerRuns: [],
  };
}

// survive Next.js dev-server module reloads
const g = globalThis as unknown as { __margoDb?: Db; __margoLock?: Promise<unknown> };

export async function loadDb(): Promise<Db> {
  if (g.__margoDb) return g.__margoDb;
  try {
    const raw = await fs.readFile(DB_PATH, "utf-8");
    g.__margoDb = JSON.parse(raw) as Db;
  } catch {
    g.__margoDb = freshDb();
  }
  return g.__margoDb!;
}

export async function saveDb(db: Db): Promise<void> {
  g.__margoDb = db;
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

export async function resetDb(): Promise<Db> {
  const db = freshDb();
  await saveDb(db);
  return db;
}

/** Serialize mutations so concurrent API calls can't interleave writes. */
export async function withDb<T>(fn: (db: Db) => Promise<T> | T): Promise<T> {
  const prev = g.__margoLock ?? Promise.resolve();
  let release!: (value?: unknown) => void;
  g.__margoLock = new Promise((r) => (release = r));
  await prev;
  try {
    const db = await loadDb();
    const result = await fn(db);
    await saveDb(db);
    return result;
  } finally {
    release();
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

let counter = 0;
export function uid(prefix: string): string {
  counter = (counter + 1) % 10000;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}
