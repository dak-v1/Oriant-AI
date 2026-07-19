/**
 * Discovery — converts the kickoff call into the CompanyReport draft
 * (blueprint §7, §9). AI& does the reasoning when configured; the fixture
 * path builds an honest deterministic report that still reflects what the
 * owner actually selected and typed on the call.
 */
import type { CompanyReport, Db } from "../contracts";
import { FIXTURE_REPORT } from "../fixtures";
import { aiandJson } from "./providers/aiand";
import { trace } from "./orchestrator";

const selected = (m: Record<string, boolean>) => Object.keys(m).filter((k) => m[k]);

/** Deterministic fixture: prepared demo prose + the owner's real selections. */
function fixtureReport(db: Db): Omit<CompanyReport, "version" | "status" | "history"> {
  const base = JSON.parse(JSON.stringify(FIXTURE_REPORT)) as typeof FIXTURE_REPORT;
  const sys = selected(db.call.systems);
  if (sys.length > 0) {
    // keep only systems the owner actually selected; keep known metadata
    const known = new Map(base.systems.map((s) => [s.name, s]));
    base.systems = sys.map(
      (name) => known.get(name) ?? { name, use: "Selected on the call", status: "Ready to connect" as const },
    );
  }
  const goals = selected(db.call.goals);
  if (goals.length > 0) {
    base.facts = base.facts.map((f) => f);
    base.facts.push({ k: "Goals", v: goals.slice(0, 3).join(" · ") });
  }
  const constraints = db.call.answers["constraints"];
  if (constraints && !base.constraints.some((c) => c.includes(constraints.slice(0, 24)))) {
    base.constraints = [constraints, ...base.constraints.slice(0, 3)];
  }
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
      `Call answers (question id → owner's answer):\n${JSON.stringify(db.call.answers, null, 2)}\n\n` +
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
