import type { Db, OnboardingSession } from "../contracts";
import { aiandJson } from "./providers/aiand";

export type TailoredQuestionTarget =
  | "business_area"
  | "repetitive_task"
  | "current_workflow"
  | "selected_tools";

export interface TailoredQuestionPayload {
  question: string;
  helper: string;
  voicePrompt: string;
  suggestions: string[];
}

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["question", "helper", "voicePrompt", "suggestions"],
  properties: {
    question: { type: "string" },
    helper: { type: "string" },
    voicePrompt: { type: "string" },
    suggestions: {
      type: "array",
      items: { type: "string" },
      minItems: 0,
      maxItems: 4,
    },
  },
} as const;

function areaSuggestions(scope?: string | null): string[] {
  switch (scope) {
    case "start_small":
      return [
        "Customer messages",
        "Scheduling and calendar work",
        "Lead follow-up",
        "Invoices and payment chasing",
      ];
    case "whole_business":
      return [
        "Operations",
        "Customer service",
        "Finance",
        "Sales",
      ];
    default:
      return [
        "Operations",
        "Marketing",
        "Finance",
        "Customer service",
      ];
  }
}

function taskSuggestions(area?: string): string[] {
  switch ((area ?? "").toLowerCase()) {
    case "marketing":
      return ["Scheduling posts", "Preparing reports", "Repurposing content", "Collecting content"];
    case "operations":
      return ["Scheduling appointments", "Rescheduling bookings", "Updating job sheets", "Coordinating technicians"];
    case "finance":
      return ["Sending invoices", "Chasing payment", "Reconciling payments", "Checking overdue accounts"];
    case "sales":
      return ["Following up with leads", "Preparing proposals", "Updating CRM records", "Booking sales calls"];
    case "customer service":
      return ["Responding to enquiries", "Following up with customers", "Preparing replies", "Routing requests"];
    default:
      return ["The task repeated every day", "The task with the most manual checking", "The task causing delays", "The task most likely to be automated first"];
  }
}

function fixtureFor(session: OnboardingSession, target: TailoredQuestionTarget): TailoredQuestionPayload {
  const intro = typeof session.answers.company_intro?.value === "string"
    ? session.answers.company_intro.value
    : "";
  const scope = typeof session.answers.automation_scope?.value === "string"
    ? session.answers.automation_scope.value
    : null;
  const area = typeof session.answers.business_area?.value === "string"
    ? session.answers.business_area.value
    : "";
  const task = typeof session.answers.repetitive_task?.value === "string"
    ? session.answers.repetitive_task.value
    : "";

  switch (target) {
    case "business_area":
      return {
        question: scope === "start_small"
          ? "Which part of the business feels the most manual right now?"
          : "Which part of the business should we focus on first?",
        helper: intro
          ? "Pick the area where the repetitive work or bottleneck shows up most clearly."
          : "Choose the area that would create the most relief if it worked better.",
        voicePrompt: "Which part of the business should Oriant focus on first?",
        suggestions: areaSuggestions(scope),
      };
    case "repetitive_task":
      return {
        question: area
          ? `Inside ${area}, which task feels the most repetitive or frustrating?`
          : "Which specific task feels the most repetitive or frustrating?",
        helper: "Choose one task that repeats often enough to become your best first automation candidate.",
        voicePrompt: area
          ? `Inside ${area}, which task is the most repetitive or frustrating today?`
          : "Which task feels the most repetitive or frustrating right now?",
        suggestions: taskSuggestions(area),
      };
    case "current_workflow":
      return {
        question: task
          ? `Walk us through how “${task}” works today.`
          : "Walk us through how the task works today.",
        helper: "A simple step-by-step explanation is enough. We want to see the current handoffs, checks, and tools involved.",
        voicePrompt: task
          ? `Please walk me through how ${task} works today, step by step.`
          : "Please walk me through the task today, step by step.",
        suggestions: [
          "What triggers the task",
          "Who touches it",
          "Which apps are used",
          "Where delays or manual checks happen",
        ],
      };
    case "selected_tools":
      return {
        question: task
          ? `Which tools are used during “${task}”?`
          : "Which tools are part of this workflow?",
        helper: "Select only the apps that are actually involved in the current process.",
        voicePrompt: "Which systems or apps are used in this workflow today?",
        suggestions: [
          "Email",
          "Calendar",
          "CRM",
          "Accounting or file storage",
        ],
      };
  }
}

export async function generateTailoredQuestion(
  db: Db,
  target: TailoredQuestionTarget,
): Promise<TailoredQuestionPayload & { mode: "live" | "fixture" }> {
  const sessionId = db.onboarding.activeSessionId;
  const session = sessionId ? db.onboarding.sessions[sessionId] : null;
  if (!session) {
    const fallback = fixtureFor({
      id: "fixture",
      schemaVersion: "2026-07-29",
      status: "in_progress",
      preferredChannel: "typed",
      currentStep: "intro",
      progress: 0,
      organization: { shape: "solo", employeeEmails: [], departmentApprovals: [] },
      answers: {},
      selectedToolIds: [],
      consentAccepted: false,
      transcriptReviewRequired: false,
      startedAt: "",
      updatedAt: "",
    }, target);
    return { ...fallback, mode: "fixture" };
  }

  const fixture = fixtureFor(session, target);
  const result = await aiandJson<TailoredQuestionPayload>({
    operation: `onboarding_tailored_question_${target}`,
    schemaName: `onboarding_tailored_question_${target}`,
    schema: RESPONSE_SCHEMA,
    fixture,
    system:
      "You are Oriant's onboarding discovery agent. Return the next best single onboarding question for the owner based on the answers already captured. " +
      "Keep it short, plain-English, and business-first. Do not mention AI internals or ask multiple questions at once. " +
      "Suggestions must be concise examples, not exhaustive lists.",
    user:
      `Target question: ${target}\n` +
      `Organization shape: ${session.organization.shape}\n` +
      `Automation scope: ${typeof session.answers.automation_scope?.value === "string" ? session.answers.automation_scope.value : ""}\n` +
      `Business summary: ${typeof session.answers.company_intro?.value === "string" ? session.answers.company_intro.value : ""}\n` +
      `Business area: ${typeof session.answers.business_area?.value === "string" ? session.answers.business_area.value : ""}\n` +
      `Repetitive task: ${typeof session.answers.repetitive_task?.value === "string" ? session.answers.repetitive_task.value : ""}\n` +
      `Current workflow: ${typeof session.answers.current_workflow?.value === "string" ? session.answers.current_workflow.value : ""}\n` +
      `Selected tools: ${session.selectedToolIds.join(", ")}`,
  });

  return { ...result.data, mode: result.mode };
}
