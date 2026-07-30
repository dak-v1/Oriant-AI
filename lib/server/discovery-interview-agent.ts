import type { Db, OnboardingSession } from "../contracts";
import { aiandJson } from "./providers/aiand";

export interface DiscoveryInterviewQuestion {
  id: string;
  question: string;
  reason: string;
  helperText: string;
  examples: string[];
}

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      minItems: 4,
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "question", "reason", "helperText", "examples"],
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          reason: { type: "string" },
          helperText: { type: "string" },
          examples: {
            type: "array",
            minItems: 0,
            maxItems: 4,
            items: { type: "string" },
          },
        },
      },
    },
  },
} as const;

function activeSession(db: Db): OnboardingSession | null {
  const id = db.onboarding.activeSessionId;
  return id ? db.onboarding.sessions[id] ?? null : null;
}

function fixtureQuestions(session: OnboardingSession): DiscoveryInterviewQuestion[] {
  const area = typeof session.answers.business_area?.value === "string"
    ? session.answers.business_area.value
    : "this part of the business";
  const task = typeof session.answers.repetitive_task?.value === "string"
    ? session.answers.repetitive_task.value
    : "this workflow";
  const tools = session.selectedToolIds;
  const withTeam = session.organization.shape !== "solo";

  const questions: DiscoveryInterviewQuestion[] = [
    {
      id: "workflow_trigger",
      question: `What usually triggers ${task}?`,
      reason: "Oriant needs to know what starts the workflow in the real world.",
      helperText: "Describe the event that kicks this off, not the whole process yet.",
      examples: ["A customer email arrives", "A WhatsApp message comes in", "An invoice becomes overdue"],
    },
    {
      id: "workflow_steps",
      question: `What are the main steps from start to finish in ${task}?`,
      reason: "Step-by-step detail shows where Oriant can remove manual effort safely.",
      helperText: "List the main steps in order, even if some of them feel obvious.",
      examples: ["Inbox checked", "Calendar updated", "Customer confirmed", "Spreadsheet amended"],
    },
    {
      id: "handoffs",
      question: withTeam
        ? `Who touches ${task} from start to finish?`
        : `Where do you usually switch between tools or checks during ${task}?`,
      reason: withTeam
        ? "Handoffs tell Oriant where work moves between people."
        : "Tool-switching and repeated checks usually reveal the manual bottleneck.",
      helperText: withTeam
        ? "Include roles or people, not just departments."
        : "Mention any moment where you copy, paste, check, or update something manually.",
      examples: withTeam
        ? ["Coordinator first, owner approves, finance updates the record"]
        : ["I check Gmail, then update the calendar, then send a reply manually"],
    },
    {
      id: "human_decisions",
      question: `Which decisions in ${task} must always stay with a person?`,
      reason: "These become approval rules and hard limits for any automation.",
      helperText: "Focus on decisions that feel sensitive, risky, customer-facing, or financial.",
      examples: ["Refunds above a limit", "Final price approval", "Schedule changes after confirmation"],
    },
    {
      id: "workflow_success",
      question: `What would a good outcome look like if ${task} worked better?`,
      reason: "Oriant needs a clear success target before recommending automation.",
      helperText: "Describe the operational result you want, not the technical solution.",
      examples: ["Faster replies", "Fewer missed follow-ups", "Less manual updating", "Same-day completion"],
    },
  ];

  if (tools.length > 0) {
    questions.splice(3, 0, {
      id: "workflow_data_inputs",
      question: `What information or documents are needed each time ${task} happens?`,
      reason: "The inputs show what Oriant must read, check, or prepare before acting.",
      helperText: `Since ${area} already uses ${tools.slice(0, 3).join(", ")}${tools.length > 3 ? " and others" : ""}, tell Oriant what it needs from those tools each time.`,
      examples: ["Customer name and address", "Booking date", "Invoice amount", "Job notes or photos"],
    });
  }

  return questions.slice(0, 6);
}

export async function generateDiscoveryInterviewQuestions(
  db: Db,
): Promise<{ mode: "live" | "fixture"; questions: DiscoveryInterviewQuestion[] }> {
  const session = activeSession(db);
  if (!session) {
    return { mode: "fixture", questions: [] };
  }

  const fixture = { questions: fixtureQuestions(session) };
  const result = await aiandJson<typeof fixture>({
    operation: "discovery_interview_questions",
    schemaName: "discovery_interview_questions",
    schema: RESPONSE_SCHEMA,
    fixture,
    system:
      "You are Oriant's Discovery Interview Agent. " +
      "The owner has already completed onboarding. Generate only the next 4 to 7 follow-up interview questions needed to understand the chosen workflow well enough to design the first automation safely. " +
      "Do not repeat onboarding questions. Use plain business language. One missing detail per question. Keep the questions specific to the workflow already selected.",
    user:
      `Organization shape: ${session.organization.shape}\n` +
      `Business summary: ${typeof session.answers.company_intro?.value === "string" ? session.answers.company_intro.value : ""}\n` +
      `Business area: ${typeof session.answers.business_area?.value === "string" ? session.answers.business_area.value : ""}\n` +
      `Repetitive task: ${typeof session.answers.repetitive_task?.value === "string" ? session.answers.repetitive_task.value : ""}\n` +
      `Current workflow summary: ${typeof session.answers.current_workflow?.value === "string" ? session.answers.current_workflow.value : ""}\n` +
      `Selected tools: ${session.selectedToolIds.join(", ")}\n` +
      "Generate tailored interview cards. Avoid generic business-strategy questions unless the workflow cannot be understood without them.",
  });

  return { mode: result.mode, questions: result.data.questions };
}
