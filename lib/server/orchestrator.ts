/**
 * Orchestration Controller — deterministic application logic (blueprint §5).
 *
 * AI models draft reports, plans and artifacts; THIS module owns lifecycle
 * state, allowed transitions, version rules, approval gates and audit. A
 * model may propose; only code applied here changes authoritative state.
 */
import type {
  AgentConfig, AgentDef, AgentSpecAnswers, ApprovalRequest, AuditEvent, Db,
  PlanDiff, ProviderMode, ProviderName, WorkflowPlan,
} from "../contracts";
import {
  BASE_FEE, DEFAULT_CONFIG, FIXTURE_APPROVALS, FIXTURE_EVENTS,
} from "../fixtures";
import { nowIso, uid } from "./store";

/* ── audit + provider trace ──────────────────────────────────────────────── */

export function audit(db: Db, action: string, subject: string, detail?: string) {
  const e: AuditEvent = { id: uid("aud"), at: nowIso(), actor: db.org.owner, action, subject, detail };
  db.audit.unshift(e);
  db.audit = db.audit.slice(0, 200);
}

export function trace(
  db: Db, provider: ProviderName, operation: string,
  status: "completed" | "failed" | "running", mode: ProviderMode, detail?: string,
) {
  db.providerRuns.unshift({ id: uid("run"), provider, operation, status, mode, at: nowIso(), detail });
  db.providerRuns = db.providerRuns.slice(0, 100);
}

/* ── guards ──────────────────────────────────────────────────────────────── */

export class GateError extends Error {
  status = 409;
  constructor(msg: string) { super(msg); }
}

export function requireApprovedReport(db: Db) {
  if (!db.report || db.report.status !== "approved") {
    throw new GateError("The company brief must be approved before planning can start.");
  }
}

export function requireApprovedPlan(db: Db) {
  if (!db.plan || db.plan.status !== "approved") {
    throw new GateError("The workflow plan must be confirmed before building.");
  }
  if (db.plan.stale) {
    throw new GateError("The plan is stale — the brief changed after it was approved. Re-approve the plan first.");
  }
}

/* ── report lifecycle ────────────────────────────────────────────────────── */

export function approveReport(db: Db) {
  if (!db.report) throw new GateError("No report to approve yet — finish the call first.");
  db.report.status = "approved";
  db.report.approvedBy = db.org.owner;
  db.report.approvedAt = nowIso();
  db.phase = "report_approved";
  audit(db, "report.approved", `CompanyReport v${db.report.version}`);
}

/** Any edit to an approved report re-opens it and marks the plan stale (§4.3). */
export function editReport(db: Db, patch: { exec?: string; constraints?: string[] }) {
  if (!db.report) throw new GateError("No report yet.");
  const wasApproved = db.report.status === "approved";
  if (patch.exec !== undefined) db.report.exec = patch.exec;
  if (patch.constraints !== undefined) db.report.constraints = patch.constraints;
  db.report.version += 1;
  db.report.status = "draft";
  db.report.history.unshift({ v: `v${db.report.version}`, t: "You edited the brief" });
  if (wasApproved && db.plan) {
    db.plan.stale = true;
    audit(db, "plan.marked_stale", `WorkflowPlan v${db.plan.version}`, "Source report changed");
  }
  db.phase = "report_draft";
  audit(db, "report.edited", `CompanyReport v${db.report.version}`);
}

/* ── plan lifecycle ──────────────────────────────────────────────────────── */

function snapshotPlan(db: Db) {
  if (!db.plan) return;
  db.planHistory.push(JSON.parse(JSON.stringify(db.plan)));
  db.planHistory = db.planHistory.slice(-30);
}

/**
 * Every mutation = snapshot + version bump + back to draft. Per §4.3, editing
 * a WorkflowPlan invalidates generated artifacts and workflow tests — builds
 * and validations from the previous version are discarded so nothing built
 * from an older plan can be presented (or activated) as current.
 */
function mutatePlan(db: Db, action: string, detail: string, fn: (plan: WorkflowPlan) => void) {
  if (!db.plan) throw new GateError("No plan yet — generate one from the approved brief.");
  snapshotPlan(db);
  fn(db.plan);
  db.plan.version += 1;
  db.plan.status = "draft";
  db.phase = "plan_draft";
  if (Object.keys(db.buildJobs).length || Object.keys(db.validations).length) {
    db.buildJobs = {};
    db.artifacts = {};
    db.validations = {};
    audit(db, "build.invalidated", `WorkflowPlan v${db.plan.version}`, "Plan changed — packages must be rebuilt");
  }
  audit(db, action, `WorkflowPlan v${db.plan.version}`, detail);
}

export function undoPlan(db: Db) {
  if (db.plan?.status === "approved") {
    throw new GateError("The approved plan is locked — make a change to create a new draft first.");
  }
  const prev = db.planHistory.pop();
  if (!prev || !db.plan) throw new GateError("Nothing to undo.");
  db.plan = prev;
  db.plan.status = "draft"; // restoring is itself a change — it needs re-approval
  db.phase = "plan_draft";
  db.buildJobs = {};
  db.artifacts = {};
  db.validations = {};
  audit(db, "plan.undo", `WorkflowPlan v${db.plan.version}`, "Restored previous version");
}

export function findAgent(db: Db, id: string): AgentDef {
  const a = db.plan?.team.find((x) => x.id === id);
  if (!a) throw new GateError(`Unknown agent: ${id}`);
  return a;
}

export function addAgent(db: Db, id: string) {
  mutatePlan(db, "plan.agent_added", id, (plan) => {
    const a = plan.team.find((x) => x.id === id);
    if (a) { a.inPlan = true; a.status = a.base; }
  });
}

export function removeAgent(db: Db, id: string) {
  mutatePlan(db, "plan.agent_removed", id, (plan) => {
    const a = plan.team.find((x) => x.id === id);
    if (a) { a.inPlan = false; a.status = "recommended"; }
  });
}

export function renameAgent(db: Db, id: string, name: string) {
  if (!db.plan) throw new GateError("No plan yet.");
  const a = findAgent(db, id);
  a.name = name.slice(0, 60) || a.name;
  // renames don't bump versions — they're cosmetic, not structural
}

export function reorderAgent(db: Db, fromId: string, toId: string) {
  mutatePlan(db, "plan.reordered", `${fromId} → ${toId}`, (plan) => {
    const from = plan.team.findIndex((a) => a.id === fromId);
    const to = plan.team.findIndex((a) => a.id === toId);
    if (from < 0 || to < 0) return;
    const [m] = plan.team.splice(from, 1);
    plan.team.splice(to, 0, m);
  });
}

export function addCustomAgent(db: Db): string {
  const n = (db.plan?.team.filter((a) => a.tag === "Custom").length ?? 0) + 1;
  const id = `custom_${n}`;
  mutatePlan(db, "plan.custom_added", id, (plan) => {
    plan.team.push({
      id, name: "New custom agent", role: "Custom agent", tag: "Custom",
      desc: "Describe what this agent should do — Margo will design it.",
      price: 190, integ: ["Gmail"], approval: "Decision required",
      covers: "Custom workflow", fit: "Built from your design call",
      inPlan: true, status: "needs-info", base: "needs-info",
    });
  });
  return id;
}

export function configureAgent(db: Db, id: string, config: AgentConfig) {
  mutatePlan(db, "plan.agent_configured", id, (plan) => {
    const a = plan.team.find((x) => x.id === id);
    if (a) { a.config = { ...DEFAULT_CONFIG, ...config }; a.status = "ready"; }
  });
}

export function attachSpec(db: Db, id: string, spec: AgentSpecAnswers) {
  mutatePlan(db, "plan.spec_attached", id, (plan) => {
    const a = plan.team.find((x) => x.id === id);
    if (a) { a.spec = spec; a.status = "ready"; }
  });
}

export function applyDiff(db: Db, diff: PlanDiff) {
  mutatePlan(db, "plan.change_applied", diff.title, (plan) => {
    const setIn = (id: string, inPlan: boolean) => {
      const a = plan.team.find((x) => x.id === id);
      if (a) { a.inPlan = inPlan; a.status = inPlan ? a.base : "recommended"; }
    };
    if (diff.kind === "add") setIn(diff.id, true);
    else if (diff.kind === "remove") setIn(diff.id, false);
    else if (diff.kind === "addboth") { setIn("reviews", true); setIn("report", true); }
    // kind "note" → policy note only; no structural change
  });
}

export function planBlockers(plan: WorkflowPlan): { name: string; why: string }[] {
  return plan.team
    .filter((a) => a.inPlan && a.status !== "ready")
    .map((a) => ({ name: a.name, why: a.status }));
}

/** Confirm Workflow — hard gate: every selected agent must be ready (F-10). */
export function approvePlan(db: Db) {
  if (!db.plan) throw new GateError("No plan to confirm.");
  if (db.plan.stale) throw new GateError("The plan is stale — regenerate it from the current brief.");
  const blockers = planBlockers(db.plan);
  if (db.plan.team.filter((a) => a.inPlan).length === 0) {
    throw new GateError("Select at least one agent.");
  }
  if (blockers.length > 0) {
    throw new GateError(`Not every agent is ready: ${blockers.map((b) => b.name).join(", ")}`);
  }
  db.plan.status = "approved";
  db.plan.approvedAt = nowIso();
  db.phase = "plan_approved";
  audit(db, "plan.approved", `WorkflowPlan v${db.plan.version}`);
}

/* ── activation + operations ─────────────────────────────────────────────── */

export function activate(db: Db) {
  // the plan itself must be approved and current — validation results alone
  // are not permission to ship (F-10/F-12, §4.3)
  requireApprovedPlan(db);
  const planned = db.plan!.team.filter((a) => a.inPlan);
  const allValidated = planned.length > 0 && planned.every(
    (a) => db.validations[a.id]?.status === "validated",
  );
  if (!allValidated) {
    throw new GateError("Every agent must pass sandbox validation before activation.");
  }
  db.deployment = {
    id: uid("deploy"), status: "active",
    sourcePlanVersion: db.plan!.version, activatedAt: nowIso(),
  };
  db.phase = "active";
  // seed the operations floor (fixture data, labeled as such in the UI)
  if (db.events.length === 0) db.events = FIXTURE_EVENTS;
  if (db.approvals.length === 0) db.approvals = FIXTURE_APPROVALS;
  audit(db, "deployment.activated", db.deployment.id, `plan v${db.plan!.version}`);
}

export function decideApproval(db: Db, id: string, decision: "approved" | "rejected", comment?: string) {
  const ap = db.approvals.find((a) => a.id === id);
  if (!ap) throw new GateError(`Unknown approval: ${id}`);
  if (ap.status !== "required") throw new GateError("This approval was already decided.");
  ap.status = decision === "approved" ? "approved" : "rejected";
  if (comment) ap.comments.push(comment);
  audit(db, `approval.${decision}`, ap.title, comment);
  db.events.unshift({
    t: "now", who: ap.agent,
    msg: `${decision === "approved" ? "Approved" : "Rejected"}: ${ap.title}`,
    tone: decision === "approved" ? "done" : "ember",
  });
}

export function newPlanFromTeam(team: AgentDef[], sourceReportVersion: number): WorkflowPlan {
  return {
    version: 1, status: "draft", sourceReportVersion, stale: false,
    baseFee: BASE_FEE, team: JSON.parse(JSON.stringify(team)),
  };
}

export type { ApprovalRequest };
