import type { Db, DiscoveryClarificationQuestion, OnboardingSession } from "../contracts";
import { aiandJson } from "./providers/aiand";

type ClarificationResult = {
  mode: "live" | "fixture";
  questions: DiscoveryClarificationQuestion[];
  error?: string;
};

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      minItems: 0,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "question", "reason", "helperText", "examples"],
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          reason: { type: "string" },
          helperText: { type: "string" },
          examples: { type: "array", maxItems: 4, items: { type: "string" } },
        },
      },
    },
  },
} as const;

function activeSession(db: Db): OnboardingSession | null {
  const id = db.onboarding.activeSessionId;
  return id ? db.onboarding.sessions[id] ?? null : null;
}

function fallbackQuestions(db: Db): DiscoveryClarificationQuestion[] {
  const session = activeSession(db);
  const onboarding = session?.answers ?? {};
  const interview = db.call.answers;
  const questions: DiscoveryClarificationQuestion[] = [];
  if (!interview.workflow_trigger) questions.push({
    id: "clarify_trigger",
    question: "What is the first real-world event that starts this work?",
    reason: "The workflow needs a reliable starting point before it can be automated.",
    helperText: "Think about what arrives or changes first.",
    examples: ["A customer email arrives", "A booking is requested", "An invoice becomes overdue"],
  });
  if (!interview.human_decisions) questions.push({
    id: "clarify_human_boundary",
    question: "Which part should always wait for your approval?",
    reason: "This defines the safety boundary for automation.",
    helperText: "Name a decision, threshold, or exception that should not happen automatically.",
    examples: ["Refunds over $200", "Changing a confirmed booking", "Sending a sensitive customer response"],
  });
  if (!interview.workflow_success) questions.push({
    id: "clarify_success",
    question: "What would make this workflow noticeably better for you?",
    reason: "A measurable human outcome helps Oriant recommend the right level of automation.",
    helperText: "Describe the improvement in everyday business terms.",
    examples: ["Fewer follow-ups", "Same-day replies", "Less copying between tools"],
  });
  if (!onboarding.automation_mode?.value && !interview.automation_level) questions.push({
    id: "clarify_automation_level",
    question: "How much should Oriant handle without asking you each time?",
    reason: "The desired automation level changes the workflow design and approval rules.",
    helperText: "It is fine to choose a cautious starting point.",
    examples: ["Suggest and prepare only", "Act after my approval", "Handle routine cases automatically"],
  });
  return questions.slice(0, 4);
}

export async function generateDiscoveryClarifications(db: Db): Promise<ClarificationResult> {
  const session = activeSession(db);
  if (!session) return { mode: "fixture", questions: [], error: "No active onboarding session was found." };
  const fixture = { questions: fallbackQuestions(db) };
  const result = await aiandJson<typeof fixture>({
    operation: "discovery_clarification_review",
    schemaName: "discovery_clarifications",
    schema: RESPONSE_SCHEMA,
    fixture,
    responseFormat: "json_schema",
    reasoningEffort: "none",
    timeoutMs: 12_000,
    system:
      "You are Oriant's final Discovery Review Agent. Read all onboarding answers and all interview answers. Decide whether the workflow evidence is clear enough to draft a useful company report. Ask zero to four follow-up questions only when an unclear or conflicting detail would materially affect the workflow, pain point, automation scope, trigger, inputs, outcome, or human approval boundary. Do not ask for information already present. Do not ask generic company questions. Return only JSON.",
    user:
      `Onboarding answers:\n${JSON.stringify(Object.fromEntries(Object.entries(session.answers).map(([id, answer]) => [id, answer.value])), null, 2)}\n\n` +
      `Interview answers:\n${JSON.stringify(db.call.answers, null, 2)}\n\n` +
      "If the evidence is sufficient, return {\"questions\":[]}. Otherwise ask only the highest-value clarifications.",
  });
  const questions = Array.isArray(result.data.questions) ? result.data.questions : [];
  const valid = questions.length <= 4 && questions.every((q) => q && q.id && q.question && q.reason && q.helperText && Array.isArray(q.examples));
  if (!valid) return { mode: "fixture", questions: fixture.questions, error: "AI& returned an invalid clarification review." };
  return { mode: result.mode, questions, ...(result.error ? { error: result.error } : {}) };
}
