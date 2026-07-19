/**
 * Planner Agent (blueprint §10–§13) — turns the approved CompanyReport into
 * the workforce plan, and converts natural-language change requests into
 * reviewable plan diffs. AI& proposes; the Orchestration Controller applies.
 */
import type { Db, PlanDiff, WorkflowPlan } from "../contracts";
import { FIXTURE_TEAM } from "../fixtures";
import { aiandJson } from "./providers/aiand";
import { newPlanFromTeam, trace } from "./orchestrator";

/* ── plan generation ─────────────────────────────────────────────────────── */

const SELECTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["selections"],
  properties: {
    selections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "inPlan", "fit"],
        properties: {
          id: { type: "string" },
          inPlan: { type: "boolean" },
          fit: { type: "string" },
        },
      },
    },
  },
};

export async function generatePlan(db: Db): Promise<void> {
  if (!db.report) return;
  const catalog = FIXTURE_TEAM.map((a) => ({
    id: a.id, name: a.name, role: a.role, tag: a.tag, desc: a.desc,
    price: a.price, covers: a.covers, integrations: a.integ,
  }));
  const fixture = {
    selections: FIXTURE_TEAM.map((a) => ({ id: a.id, inPlan: a.inPlan, fit: a.fit })),
  };

  const result = await aiandJson({
    operation: "workflow_planning",
    schemaName: "workforce_selection",
    schema: SELECTION_SCHEMA,
    fixture,
    system:
      "You are the Planner Agent for an AI-workforce platform. Given the approved company report and the preset agent catalog, " +
      "select which agents belong in the initial workforce plan (inPlan) and write a one-line company-specific `fit` justification for each. " +
      "Match agents to the report's use cases; do not select agents without a clear matching use case. The catalog's `wholesale` entry is the Tier-2 custom agent.",
    user:
      `Approved company report:\n${JSON.stringify(
        { exec: db.report.exec, useCases: db.report.useCases, processes: db.report.processes, systems: db.report.systems, constraints: db.report.constraints },
        null, 2,
      )}\n\nAgent catalog:\n${JSON.stringify(catalog, null, 2)}\n\nReturn a selection for EVERY catalog id.`,
  });

  trace(db, "aiand", "workflow_planning", "completed", result.mode, result.error);

  // deterministic merge — the model only chooses membership + wording
  const byId = new Map(result.data.selections.map((s) => [s.id, s]));
  const team = FIXTURE_TEAM.map((a) => {
    const sel = byId.get(a.id);
    if (!sel) return { ...a };
    return {
      ...a,
      inPlan: sel.inPlan,
      fit: sel.fit || a.fit,
      // keep the catalog's curated status for its default members (e.g. the
      // Subscriptions preset starts ready); newly selected agents need setup
      status: sel.inPlan ? (a.inPlan ? a.status : a.base) : ("recommended" as const),
    };
  });
  // the custom wholesale agent always starts needing its design call
  const plan: WorkflowPlan = newPlanFromTeam(team, db.report.version);
  db.plan = plan;
  db.planHistory = [];
  db.phase = "plan_draft";
}

/* ── natural-language reconfiguration (§13.4) ────────────────────────────── */

const DIFF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "price", "risk", "kind", "id"],
  properties: {
    title: { type: "string" },
    price: { type: "string" },
    risk: { type: "string" },
    kind: { type: "string", enum: ["add", "remove", "note", "addboth"] },
    id: { type: "string" },
  },
};

/** The design's deterministic keyword fallback — also the fixture. */
function keywordDiff(instruction: string): PlanDiff {
  const v = instruction.toLowerCase();
  if (/report|monday/.test(v)) return { title: "Add the Monday Report agent", price: "+ $70/mo", risk: "No new risk — informational only", kind: "add", id: "report" };
  if (/review/.test(v)) return { title: "Add the Reviews agent", price: "+ $90/mo", risk: "Low — every reply is held for approval", kind: "add", id: "reviews" };
  if (/invoice|billing|cash/.test(v)) return { title: "Add the Cash Desk agent", price: "+ $130/mo", risk: "Drafts invoices for your approval", kind: "add", id: "invoices" };
  if (/booking|appointment|schedule/.test(v)) return { title: "Add the Bookings agent", price: "+ $110/mo", risk: "Reversible — reviews after action", kind: "add", id: "bookings" };
  if (/lead/.test(v)) return { title: "Add the Lead Qualifier agent", price: "+ $100/mo", risk: "Routing only — decisions stay with you", kind: "add", id: "leads" };
  if (/remove|drop|cut/.test(v)) return { title: "Remove Restock Radar", price: "− $120/mo", risk: "You would lose stock alerts", kind: "remove", id: "restock" };
  if (/approv|refund/.test(v)) return { title: "Require approval before any refund", price: "No price change", risk: "Adds an approval step on Front Desk", kind: "note", id: "" };
  return { title: "Add the recommended agents", price: "+ $160/mo", risk: "Low", kind: "addboth", id: "" };
}

export async function proposeDiff(db: Db, instruction: string): Promise<PlanDiff> {
  const fixture = keywordDiff(instruction);
  // empty input falls straight to the design's default suggestion — no AI call
  if (!instruction.trim()) return fixture;
  const known = (db.plan?.team ?? FIXTURE_TEAM).map((a) => `${a.id} (${a.name}, $${a.price}/mo, inPlan=${a.inPlan})`);

  const result = await aiandJson({
    operation: "plan_change_request",
    schemaName: "plan_diff",
    schema: DIFF_SCHEMA,
    fixture,
    system:
      "Convert the owner's natural-language request into ONE reviewable plan diff. " +
      "kind=add/remove takes an agent id from the list; kind=note is a policy note with id=''; kind=addboth adds reviews+report. " +
      "price is a short human string like '+ $70/mo'; risk is one plain sentence. Nothing is applied until the owner approves the diff.",
    user: `Current team:\n${known.join("\n")}\n\nOwner's request: ${JSON.stringify(instruction)}`,
  });

  trace(db, "aiand", "plan_change_request", "completed", result.mode, result.error);

  // validate the model's id against the catalog — bad ids fall back to fixture
  const d = result.data;
  if ((d.kind === "add" || d.kind === "remove") && !(db.plan?.team ?? FIXTURE_TEAM).some((a) => a.id === d.id)) {
    return fixture;
  }
  return d;
}
