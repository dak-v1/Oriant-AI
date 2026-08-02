/**
 * Per-agent "design call" question generation for the Person B planner
 * backend. Adapts the batch-then-clarify pattern found in
 * lib/server/discovery-interview-agent.ts / discovery-clarification-agent.ts,
 * scoped to one agent_config_id instead of one global onboarding session.
 *
 * Independent of lib/server/orchestrator.ts and lib/server/discovery-*.ts —
 * nothing here imports either. Uses the aiandJson adapter, which already
 * implements the {mode, data, error} live/fixture convention.
 */
import { aiandJson } from "../providers/aiand";
import { PlannerError } from "./errors";
import type { AgentSpec } from "./types";
import type { CompanyReport } from "../../contracts";

export interface DesignCallQuestion {
  id: string;
  question: string;
  reason: string;
  helperText: string;
  examples: string[];
}

interface QuestionsResponse {
  questions: DesignCallQuestion[];
}

function questionsItemSchema(idEnum?: readonly string[]): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "question", "reason", "helperText", "examples"],
    properties: {
      id: idEnum ? { type: "string", enum: [...idEnum] } : { type: "string" },
      question: { type: "string" },
      reason: { type: "string" },
      helperText: { type: "string" },
      examples: { type: "array", items: { type: "string" } },
    },
  };
}

/**
 * `idEnum`, when given, constrains the model to those exact id strings at
 * the schema level rather than relying on prose instructions — verified
 * against a live AI& call that otherwise substituted its own ids (e.g.
 * "decision_rules" instead of the requested "rules") for 3 of 7 fields.
 */
function questionsSchema(
  minItems: number,
  maxItems: number,
  idEnum?: readonly string[]
): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["questions"],
    properties: {
      questions: {
        type: "array",
        minItems,
        maxItems,
        items: questionsItemSchema(idEnum),
      },
    },
  };
}

function isDesignCallQuestion(value: unknown): value is DesignCallQuestion {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    v.id.trim().length > 0 &&
    typeof v.question === "string" &&
    v.question.trim().length > 0 &&
    typeof v.reason === "string" &&
    typeof v.helperText === "string" &&
    Array.isArray(v.examples) &&
    v.examples.every((e) => typeof e === "string")
  );
}

function validateQuestions(
  data: unknown,
  minItems: number,
  maxItems: number
): DesignCallQuestion[] | null {
  if (!data || typeof data !== "object") return null;
  const questions = (data as Record<string, unknown>).questions;
  if (!Array.isArray(questions)) return null;
  if (questions.length < minItems || questions.length > maxItems) return null;
  if (!questions.every(isDesignCallQuestion)) return null;
  const typed = questions as DesignCallQuestion[];
  const texts = new Set(typed.map((q) => q.question.trim().toLowerCase()));
  if (texts.size !== typed.length) return null;
  const ids = new Set(typed.map((q) => q.id));
  if (ids.size !== typed.length) return null;
  return typed;
}

/**
 * These 7 ids double as AgentSpec's field names — synthesizeAgentSpec below
 * maps a turn straight onto the matching spec field when its question_id is
 * one of these.
 */
const OPENING_FIELDS = ["objective", "trigger", "inputs", "rules", "tools", "forbidden", "success"] as const;

function openingFixture(agentName: string): DesignCallQuestion[] {
  const copy: Record<
    (typeof OPENING_FIELDS)[number],
    { question: string; reason: string; helperText: string }
  > = {
    objective: {
      question: `In one or two sentences, what should "${agentName}" actually accomplish?`,
      reason: "A clear objective anchors every other design decision for this agent.",
      helperText: "Describe the outcome, not the steps.",
    },
    trigger: {
      question: `What starts "${agentName}"'s work?`,
      reason: "Every agent needs a reliable trigger to act on.",
      helperText: "Describe the event or schedule that kicks this off.",
    },
    inputs: {
      question: `What information does "${agentName}" need each time it runs?`,
      reason: "This defines what the agent must read or be given before acting.",
      helperText: "List the specific details it needs.",
    },
    rules: {
      question: `Are there any rules "${agentName}" should always follow?`,
      reason: "Rules shape how the agent behaves in edge cases.",
      helperText: "Describe any conditions or exceptions.",
    },
    tools: {
      question: `Which tools or systems does "${agentName}" need access to?`,
      reason: "This determines what integrations must be connected.",
      helperText: "Name the specific tools.",
    },
    forbidden: {
      question: `What should "${agentName}" never do without a person approving first?`,
      reason: "This sets the safety boundary for automation.",
      helperText: "Name any action that should always stay with a human.",
    },
    success: {
      question: `What does a good outcome look like for "${agentName}"?`,
      reason: "A measurable success criterion helps judge whether this agent is working.",
      helperText: "Describe the result you'd want to see.",
    },
  };
  return OPENING_FIELDS.map((id) => ({ id, examples: [], ...copy[id] }));
}

/**
 * Per-key in-flight dedup — keyed by agentConfigId / designSessionId, NOT a
 * module-level singleton, since multiple agents' design calls (and multiple
 * design-call sessions) can be in progress at once. A second concurrent call
 * for the SAME key awaits the same promise; different keys never block each
 * other.
 */
const openingInFlight = new Map<string, Promise<DesignCallQuestion[]>>();
const clarifyInFlight = new Map<string, Promise<DesignCallQuestion[]>>();

export async function proposeOpeningQuestions(input: {
  agentConfigId: string;
  agentName: string;
  agentKey: string;
  proposalReasoning?: string;
  report?: CompanyReport | null;
}): Promise<DesignCallQuestion[]> {
  const existing = openingInFlight.get(input.agentConfigId);
  if (existing) return existing;

  const run = (async () => {
    const fixture: QuestionsResponse = { questions: openingFixture(input.agentName) };

    const reportContext = input.report
      ? [
          `Executive summary: ${input.report.exec}`,
          `Pain points: ${input.report.pain.map((p) => `${p.t}: ${p.detail}`).join("; ") || "none recorded"}`,
          `Use cases: ${input.report.useCases.map((u) => `${u.name} (trigger: ${u.trigger})`).join("; ") || "none recorded"}`,
          `Facts: ${input.report.facts.map((f) => `${f.k}: ${f.v}`).join("; ")}`,
        ].join("\n")
      : "No company report context available.";

    const system = [
      "You run a design-call interview for one specific custom AI agent within a workforce plan.",
      "Ask 4 to 7 questions that together cover exactly these categories: objective, trigger,",
      "inputs, decision rules, tools/systems needed, forbidden actions requiring human approval,",
      'and success criteria. Use short, specific question ids matching the category they cover',
      '(e.g. "objective", "trigger", "tools"). Ground every question in the specific agent',
      "and company context given, not generic best practices. Return only JSON.",
    ].join(" ");

    const user = [
      `Agent name: ${input.agentName}`,
      `Agent key: ${input.agentKey}`,
      `Why this agent was proposed: ${input.proposalReasoning ?? "unknown"}`,
      reportContext,
    ].join("\n");

    const call = () =>
      aiandJson<QuestionsResponse>({
        operation: "agent_design_call_opening",
        system,
        user,
        schemaName: "design_call_questions",
        schema: questionsSchema(4, 7, OPENING_FIELDS),
        fixture,
      });

    const first = await call();
    let validated = validateQuestions(first.data, 4, 7);
    if (!validated) {
      if (first.mode === "live") {
        const retry = await call();
        validated = validateQuestions(retry.data, 4, 7);
      }
      if (!validated) {
        throw new PlannerError(502, "AI& returned invalid design-call questions after retry.");
      }
    }
    return validated;
  })();

  openingInFlight.set(input.agentConfigId, run);
  try {
    return await run;
  } finally {
    openingInFlight.delete(input.agentConfigId);
  }
}

export async function proposeClarifyingQuestions(input: {
  designSessionId: string;
  agentName: string;
  turns: { questionId: string; answer: string }[];
}): Promise<DesignCallQuestion[]> {
  const existing = clarifyInFlight.get(input.designSessionId);
  if (existing) return existing;

  const run = (async () => {
    const fixture: QuestionsResponse = { questions: [] };

    const system = [
      "You review a completed design-call Q&A for one custom AI agent.",
      "Decide whether the answers are clear enough to configure the agent.",
      "Ask zero to four follow-up questions only when an unclear or missing",
      'answer would materially change the agent\'s behavior. If the answers',
      'are sufficient, return {"questions":[]}. Return only JSON.',
    ].join(" ");

    const user = [
      `Agent name: ${input.agentName}`,
      "Answers so far:",
      JSON.stringify(Object.fromEntries(input.turns.map((t) => [t.questionId, t.answer])), null, 2),
    ].join("\n");

    const call = () =>
      aiandJson<QuestionsResponse>({
        operation: "agent_design_call_clarify",
        system,
        user,
        schemaName: "design_call_clarifications",
        schema: questionsSchema(0, 4),
        fixture,
      });

    const first = await call();
    let validated = validateQuestions(first.data, 0, 4);
    if (!validated) {
      if (first.mode === "live") {
        const retry = await call();
        validated = validateQuestions(retry.data, 0, 4);
      }
      if (!validated) {
        // Safe default: treat an unrecoverable response as "nothing further
        // to clarify" rather than blocking the whole design call.
        validated = [];
      }
    }
    return validated;
  })();

  clarifyInFlight.set(input.designSessionId, run);
  try {
    return await run;
  } finally {
    clarifyInFlight.delete(input.designSessionId);
  }
}

const KNOWN_SPEC_FIELDS = new Set<string>(OPENING_FIELDS);

/** Maps turns onto AgentSpec's known fields by question_id; anything else goes into `notes`. */
export function synthesizeAgentSpec(turns: { questionId: string; answer: string }[]): AgentSpec {
  const spec: AgentSpec = {};
  const notes: Record<string, string> = {};
  for (const turn of turns) {
    if (KNOWN_SPEC_FIELDS.has(turn.questionId)) {
      spec[turn.questionId as keyof Omit<AgentSpec, "notes">] = turn.answer;
    } else {
      notes[turn.questionId] = turn.answer;
    }
  }
  if (Object.keys(notes).length > 0) spec.notes = notes;
  return spec;
}
