/**
 * Discovery — converts the kickoff call into the CompanyReport draft
 * (blueprint §7, §9). AI& does the reasoning when configured; the fixture
 * path builds an honest deterministic report that still reflects what the
 * owner actually selected and typed on the call.
 */
import type { CompanyReport, Db } from "../contracts";
import { aiandJson } from "./providers/aiand";
import { trace } from "./orchestrator";

const selected = (m: Record<string, boolean>) => Object.keys(m).filter((k) => m[k]);

function sessionValue(db: Db, questionId: string): string {
  const sessionId = db.onboarding.activeSessionId;
  const value = sessionId ? db.onboarding.sessions[sessionId]?.answers[questionId]?.value : undefined;
  return typeof value === "string" ? value.trim() : "";
}

function answerOrMissing(value: string): string {
  return value || "Not captured yet";
}

/** Deterministic fallback built only from the owner's captured inputs. */
function fixtureReport(db: Db): Omit<CompanyReport, "version" | "status" | "history"> {
  const intro = sessionValue(db, "company_intro");
  const area = sessionValue(db, "business_area");
  const task = sessionValue(db, "repetitive_task");
  const workflow = sessionValue(db, "current_workflow");
  const answers = { ...db.call.answers, ...(db.call.clarificationAnswers ?? {}) };
  const trigger = answers.workflow_trigger || answers.clarify_trigger || "";
  const steps = answers.workflow_steps || "";
  const inputs = answers.workflow_data_inputs || "";
  const decisions = answers.human_decisions || answers.clarify_human_boundary || "";
  const outcome = answers.workflow_success || answers.clarify_success || "";
  const sessionId = db.onboarding.activeSessionId;
  const session = sessionId ? db.onboarding.sessions[sessionId] : undefined;
  const selectedTools = selected(db.call.systems);
  const owner = session?.organization.approvalOwner || db.org.owner;
  const workflowName = task || area || "Unspecified workflow";

  const systems = selectedTools.map((name) => ({
    name,
    use: "Selected during onboarding",
    status: "Ready to connect" as const,
  }));

  const base = {
    exec: answerOrMissing(intro),
    facts: [
      { k: "Organisation", v: session?.organization.shape || "Not captured yet" },
      { k: "Team size", v: session?.organization.employeeCount ? String(session.organization.employeeCount) : "Not captured yet" },
      { k: "Focus area", v: answerOrMissing(area) },
      { k: "Target workflow", v: answerOrMissing(task) },
      { k: "Current workflow", v: answerOrMissing(workflow) },
    ],
    canvas: [],
    processes: [{
      name: workflowName,
      trigger: answerOrMissing(trigger),
      systems: selectedTools.join(", ") || "No tools captured yet",
      freq: "Not captured yet",
      owner,
    }],
    systems,
    pain: area || task ? [{
      t: area || "Workflow friction",
      detail: task || workflow || "The owner has not described the bottleneck yet.",
    }] : [],
    useCases: task ? [{
      name: task,
      trigger: answerOrMissing(trigger),
      freq: "Not captured yet",
      risk: decisions ? "Medium" as const : "Low" as const,
    }] : [],
    constraints: decisions ? [decisions] : ["Human approval boundaries have not been captured yet."],
  };

  const goals = selected(db.call.goals);
  if (goals.length > 0) {
    base.facts.push({ k: "Goals", v: goals.slice(0, 3).join(" · ") });
  }
  if (steps) base.facts.push({ k: "Workflow steps", v: steps });
  if (inputs) base.facts.push({ k: "Required inputs", v: inputs });
  if (outcome) base.facts.push({ k: "Desired outcome", v: outcome });
  return base;
}

const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["exec", "facts", "canvas", "processes", "systems", "pain", "useCases", "constraints"],
  properties: {
    exec: { type: "string" },
    facts: { type: "array", items: { type: "object", additionalProperties: false, required: ["k", "v"], properties: { k: { type: "string" }, v: { type: "string" } } } },
    canvas: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "body", "dot"], properties: { label: { type: "string" }, body: { type: "string" }, dot: { type: "string", enum: ["var(--forest)", "var(--ochre)"] } } } },
    processes: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "trigger", "systems", "freq", "owner"], properties: { name: { type: "string" }, trigger: { type: "string" }, systems: { type: "string" }, freq: { type: "string" }, owner: { type: "string" } } } },
    systems: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "use", "status"], properties: { name: { type: "string" }, use: { type: "string" }, status: { type: "string", enum: ["Connected", "Ready to connect", "Needs auth", "Not connected"] } } } },
    pain: { type: "array", items: { type: "object", additionalProperties: false, required: ["t", "detail"], properties: { t: { type: "string" }, detail: { type: "string" } } } },
    useCases: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "trigger", "freq", "risk"], properties: { name: { type: "string" }, trigger: { type: "string" }, freq: { type: "string" }, risk: { type: "string", enum: ["Low", "Medium", "High"] } } } },
    constraints: { type: "array", items: { type: "string" } },
  },
};

export async function generateReport(db: Db): Promise<void> {
  const fixture = fixtureReport(db);
  const allAnswers = { ...db.call.answers, ...(db.call.clarificationAnswers ?? {}) };
  const result = await aiandJson({
    operation: "company_report_generation",
    schemaName: "company_report",
    schema: REPORT_SCHEMA,
    fixture,
    system:
      "You are the Discovery Agent for an AI-workforce platform. Convert the owner's kickoff-call answers into a structured company report. " +
      "Evidence discipline: never state a volume, cost or permission the owner did not supply — mark uncertain items in prose as needing confirmation. " +
      "Keep the tone warm, plain business language. `dot` is var(--forest) for owner-confirmed content and var(--ochre) for AI-inferred content that needs confirmation.",
    user:
      `Onboarding answers (field id → owner's answer):\n${JSON.stringify(
        db.onboarding.activeSessionId
          ? Object.fromEntries(Object.entries(db.onboarding.sessions[db.onboarding.activeSessionId]?.answers ?? {}).map(([id, answer]) => [id, answer.value]))
          : {},
        null,
        2,
      )}\n\n` +
      `Interview and clarification answers (question id → owner's answer):\n${JSON.stringify(allAnswers, null, 2)}\n\n` +
      `Goals selected: ${selected(db.call.goals).join(", ") || "none"}\n` +
      `Systems in use: ${selected(db.call.systems).join(", ") || "none"}\n` +
      `Lean Canvas uploaded: ${db.call.canvasUploaded}\n\n` +
      "Produce the full report object. Use the owner's own numbers where given; write '~' estimates only when the owner said them.",
  });

  trace(db, "aiand", "company_report_generation", "completed", result.mode, result.error);

  db.report = {
    version: 1,
    status: "draft",
    ...result.data,
    history: [{ v: "v1", t: "Draft generated from your call" }],
  };
  db.phase = "report_draft";
}
