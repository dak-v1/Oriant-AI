/**
 * lib/runtime/sandbox/scenarios.ts — the BrightPath scenario library (M3).
 *
 * Chosen for BRANCH COVERAGE of the policy resolver, not for looks. Between
 * them these cases reach every outcome the six-step resolution order in
 * docs/PLAN_CONTRACT.md section 3.10 can produce:
 *
 *   allow                     SC-01, SC-06
 *   limit breach → approval   SC-02, SC-03, SC-04, SC-07, SC-10
 *   unmeasured limit          SC-05
 *   alwaysApprove             SC-08, SC-09, SC-17
 *   integration unavailable   SC-11
 *   draft_only                SC-12, SC-13
 *   act_after_approval        SC-14, SC-15, SC-16
 *   forbidden (step 1)        SC-18, SC-19
 *   not granted (step 2)      SC-20
 *   limit breach → block      SC-21
 *
 * That mapping used to be maintained by hand and had drifted line for line. It
 * is now checked: M3-8 in lib/runtime/verify/m3.ts asserts the suite actually
 * reaches each refusal cause, so a wrong claim here fails the milestone rather
 * than quietly misleading the next reader.
 *
 * The last three rows exist because a VALID plan cannot express them. Rules 1
 * and 3 guarantee no approved agent has a step attempting an operation it is
 * forbidden or was never granted, so for as long as the suite ran only the
 * approved plan those branches were unreachable and the assertions guarding
 * them could not fail. SC-18 to SC-21 reach them through `specPatch`, which
 * deviates from the plan on a clone, for one run, and never touches the fixture.
 *
 * SC-22 to SC-24 are the M0 fixture table's "broken set": a tool that throws, a
 * tool that recovers on retry, and a tool that never answers. They are what
 * decides whether a real failure degrades safely or takes the workforce down.
 *
 * Each scenario states what the owner does when the run pauses, so the approve,
 * edit and reject paths are exercised rather than assumed. Every expectation is
 * checked in code; the prose here is what the owner reads, nothing more.
 */

import type { AgentSpec } from "../../plan/types";
import type { SandboxScenario } from "./types";
import type { ReasonResult, ToolResult } from "../types";

/** Deterministic reasoning: no model, and the metrics limits are judged on. */
function reason(
  summary: string,
  data: Record<string, unknown>,
  metrics: Record<string, number>,
): Record<string, ReasonResult> {
  return { __default: { summary, data, metrics } };
}

function ok(data: unknown): ToolResult {
  return { ok: true, data };
}

/* ═════════════════════════ Spec patch helpers ═════════════════════════
   Used only by the guardrail scenarios, and only ever against the clone a
   scenario is handed. Each throws rather than no-ops when its target is
   missing: a patch that silently did nothing would leave a scenario asserting
   a guardrail it never reached, which is the class of bug these cases exist to
   remove. */

/** Adds an operation to an existing grant, or opens a new one for it. */
function grant(spec: AgentSpec, integrationId: string, operation: string): void {
  const existing = spec.tools.find((t) => t.integrationId === integrationId);
  if (existing) {
    existing.operations.push(operation);
    return;
  }
  spec.tools.push({
    integrationId,
    operations: [operation],
    purpose: "Granted by a sandbox guardrail scenario so only the deny can refuse.",
    required: false,
  });
}

/** Withdraws an operation from a grant, leaving the workflow step behind. */
function revoke(spec: AgentSpec, integrationId: string, operation: string): void {
  const existing = spec.tools.find((t) => t.integrationId === integrationId);
  if (!existing || !existing.operations.includes(operation)) {
    throw new Error(`Cannot revoke ${operation}: agent ${spec.id} was never granted it.`);
  }
  existing.operations = existing.operations.filter((op) => op !== operation);
}

/** Points an existing step at a different operation. */
function retarget(
  spec: AgentSpec,
  workflowId: string,
  stepId: string,
  integrationId: string,
  operation: string,
): void {
  const step = spec.workflows
    .find((w) => w.id === workflowId)
    ?.steps.find((s) => s.id === stepId);
  if (!step) {
    throw new Error(`Cannot retarget ${workflowId}/${stepId}: no such step on ${spec.id}.`);
  }
  step.tool = { integrationId, operation };
}

/** Changes what a limit does when it is breached. */
function setOnBreach(
  spec: AgentSpec,
  limitId: string,
  onBreach: "require_approval" | "block",
): void {
  const limit = spec.policy.limits.find((l) => l.id === limitId);
  if (!limit) throw new Error(`Cannot change limit ${limitId}: ${spec.id} has no such limit.`);
  limit.onBreach = onBreach;
}

/* ═══════════════════════ Finance Follow-up ═══════════════════════ */

const FINANCE: SandboxScenario[] = [
  {
    id: "sc-01-small-invoice",
    name: "Routine reminder, within limits",
    description:
      "A $95 invoice is five days overdue for a long-standing plan customer. Everything sits inside the agent's limits, so it should send without troubling Sarah.",
    category: "Finance",
    agentId: "finance-followup",
    workflowId: "payment-reminder-drafting",
    reasonScript: reason(
      "Chase one small overdue invoice with a gentle reminder.",
      { to: "daniel.tan@example.com", subject: "Reminder: invoice INV-1187" },
      { "invoice.amount": 95, "emails.per_run": 1 },
    ),
    owner: { decision: "leave_pending" },
    expect: {
      finalStatus: "completed",
      mustCall: ["gmail.messages.send"],
      approvals: 0,
    },
  },
  {
    id: "sc-02-large-invoice",
    name: "Large invoice escalates",
    description:
      "A $1,200 invoice is overdue. It exceeds the agent's $500 ceiling, so it must stop and ask Sarah rather than send.",
    category: "Finance",
    agentId: "finance-followup",
    workflowId: "payment-reminder-drafting",
    reasonScript: reason(
      "Chase a large overdue invoice.",
      { to: "ops@example.com", subject: "Overdue invoice INV-9004" },
      { "invoice.amount": 1200, "emails.per_run": 1 },
    ),
    owner: { decision: "leave_pending" },
    expect: {
      finalStatus: "awaiting_approval",
      mustNotCall: ["gmail.messages.send"],
      approvals: 1,
      minRisk: "high",
      breachedLimits: ["invoice-amount"],
      reasonContains: "invoice.amount",
    },
  },
  {
    id: "sc-03-large-invoice-approved",
    name: "Sarah approves the large reminder, with an edit",
    description:
      "The same $1,200 invoice, but Sarah softens the subject line and approves. What she edited is what must go out.",
    category: "Finance",
    agentId: "finance-followup",
    workflowId: "payment-reminder-drafting",
    reasonScript: reason(
      "Chase a large overdue invoice.",
      { to: "ops@example.com", subject: "Overdue invoice INV-9004" },
      { "invoice.amount": 1200, "emails.per_run": 1 },
    ),
    owner: {
      decision: "approve",
      editedArgs: { subject: "A quick note about invoice INV-9004" },
    },
    expect: {
      finalStatus: "completed",
      mustCall: ["gmail.messages.send"],
      approvals: 1,
    },
  },
  {
    id: "sc-04-rejected",
    name: "Sarah rejects the reminder",
    description:
      "The customer has already paid by bank transfer. Sarah rejects, and nothing may be sent.",
    category: "Finance",
    agentId: "finance-followup",
    workflowId: "payment-reminder-drafting",
    reasonScript: reason(
      "Chase a large overdue invoice.",
      { to: "ops@example.com", subject: "Overdue invoice INV-9004" },
      { "invoice.amount": 1200, "emails.per_run": 1 },
    ),
    owner: { decision: "reject", reason: "Already settled by bank transfer." },
    expect: {
      finalStatus: "refused",
      mustNotCall: ["gmail.messages.send"],
      approvals: 1,
      reasonContains: "Already settled",
    },
  },
  {
    id: "sc-05-unmeasured-amount",
    name: "Unknown amount fails closed",
    description:
      "Reasoning could not establish the invoice value. The agent must escalate rather than assume it is small.",
    category: "Finance",
    agentId: "finance-followup",
    workflowId: "payment-reminder-drafting",
    reasonScript: reason(
      "Chase an invoice whose value could not be read.",
      { to: "ops@example.com", subject: "Overdue invoice" },
      { "emails.per_run": 1 },
    ),
    owner: { decision: "leave_pending" },
    expect: {
      finalStatus: "awaiting_approval",
      mustNotCall: ["gmail.messages.send"],
      approvals: 1,
      reasonContains: "could not confirm",
    },
  },
  {
    id: "sc-06-batch-within-limits",
    name: "Friday batch inside the email ceiling",
    description:
      "Twelve small reminders go out in one run, under the twenty-email ceiling and the $500 value limit.",
    category: "Finance",
    agentId: "finance-followup",
    workflowId: "payment-reminder-drafting",
    reasonScript: reason(
      "Chase twelve small overdue invoices.",
      { to: "batch@example.com", subject: "Payment reminder batch" },
      { "invoice.amount": 220, "emails.per_run": 12 },
    ),
    owner: { decision: "leave_pending" },
    expect: {
      finalStatus: "completed",
      mustCall: ["gmail.messages.send"],
      approvals: 0,
    },
  },
  {
    id: "sc-07-batch-over-ceiling",
    name: "Oversized batch escalates",
    description:
      "A backlog produces forty reminders in one run. That breaches the twenty-email ceiling and must wait for Sarah.",
    category: "Finance",
    agentId: "finance-followup",
    workflowId: "payment-reminder-drafting",
    reasonScript: reason(
      "Chase a backlog of overdue invoices.",
      { to: "batch@example.com", subject: "Payment reminder batch" },
      { "invoice.amount": 180, "emails.per_run": 40 },
    ),
    owner: { decision: "leave_pending" },
    expect: {
      finalStatus: "awaiting_approval",
      mustNotCall: ["gmail.messages.send"],
      approvals: 1,
      breachedLimits: ["email-batch"],
    },
  },
  {
    id: "sc-17-write-off-approved",
    name: "A write-off waits for Sarah, then clears",
    description:
      "Three balances under $30 have been chased for four months. Writing one off is on the always-approve list whatever the limits say, so it waits; once Sarah agrees, the digest goes out with it.",
    category: "Finance",
    agentId: "finance-followup",
    // The only workflow in the fixture with an alwaysApprove operation on a
    // WRITE path, and until now nothing ran it. It is also the case that keeps
    // the guardrail check honest: hubspot.invoices.write_off is forbidden for
    // admin-operations but granted here, so a deny list applied across agents
    // instead of per agent reports a leak on entirely correct behaviour.
    workflowId: "overdue-invoice-summary",
    reasonScript: reason(
      "Write off three uncollectable balances and post the collections position.",
      { invoiceIds: ["INV-8801", "INV-8802", "INV-8803"], total: 64 },
      { "invoice.amount": 24, "emails.per_run": 0 },
    ),
    owner: { decision: "approve" },
    expect: {
      finalStatus: "completed",
      mustCall: ["hubspot.invoices.write_off", "slack.messages.post"],
      approvals: 1,
      minRisk: "high",
    },
  },
];

/* ═══════════════════════ Admin Operations ═══════════════════════ */

const ADMIN: SandboxScenario[] = [
  {
    id: "sc-08-booking-within-limits",
    name: "Routine booking proceeds",
    description:
      "Three appointments with more than a day's notice. Inside both limits, so the agent books them and moves on.",
    category: "Scheduling",
    agentId: "admin-operations",
    workflowId: "appointment-scheduling",
    reasonScript: reason(
      "Book three routine appointments for next week.",
      { slots: 3, customer: "Mrs Adeline Wong" },
      { "bookings.per_run": 3, "booking.notice_hours": 72 },
    ),
    owner: { decision: "leave_pending" },
    expect: {
      finalStatus: "awaiting_approval",
      mustCall: ["google-calendar.events.create"],
      // events.update is on alwaysApprove, so the second act must pause even
      // though every limit is satisfied.
      mustNotCall: ["google-calendar.events.update"],
      approvals: 1,
    },
  },
  {
    id: "sc-09-move-confirmed-booking",
    name: "Moving a confirmed booking always asks",
    description:
      "A confirmed Saturday service has to move. Rescheduling a confirmed booking is on the always-approve list whatever the limits say.",
    category: "Scheduling",
    agentId: "admin-operations",
    workflowId: "appointment-scheduling",
    reasonScript: reason(
      "Move one confirmed booking to Monday.",
      { slots: 1, customer: "Jonathan Lim" },
      { "bookings.per_run": 1, "booking.notice_hours": 96 },
    ),
    owner: { decision: "approve" },
    expect: {
      finalStatus: "completed",
      mustCall: ["google-calendar.events.create", "google-calendar.events.update"],
      // Only one pause: creating is inside both limits and proceeds
      // unattended, and it is the update that is on alwaysApprove.
      approvals: 1,
    },
  },
  {
    id: "sc-10-short-notice",
    name: "Short-notice booking escalates",
    description:
      "A same-day request leaves four hours' notice, under the 24-hour floor, so the agent asks before committing a technician.",
    category: "Scheduling",
    agentId: "admin-operations",
    workflowId: "appointment-scheduling",
    reasonScript: reason(
      "Book an urgent same-day repair.",
      { slots: 1, customer: "Mr Rajesh Kumar" },
      { "bookings.per_run": 1, "booking.notice_hours": 4 },
    ),
    owner: { decision: "leave_pending" },
    expect: {
      finalStatus: "awaiting_approval",
      mustNotCall: ["google-calendar.events.create"],
      approvals: 1,
      breachedLimits: ["booking-notice"],
    },
  },
  {
    id: "sc-11-calendar-disconnected",
    name: "Missing connection fails safely",
    description:
      "Google Calendar has been disconnected. The run must fail cleanly and say so, never guess at availability.",
    category: "Scheduling",
    agentId: "admin-operations",
    workflowId: "appointment-scheduling",
    disconnected: ["google-calendar"],
    reasonScript: reason(
      "Book appointments.",
      { slots: 1 },
      { "bookings.per_run": 1, "booking.notice_hours": 48 },
    ),
    owner: { decision: "leave_pending" },
    expect: {
      finalStatus: "failed",
      mustNotCall: ["google-calendar.events.create"],
      approvals: 0,
      reasonContains: "not connected",
    },
  },
];

/* ═══════════════════════ Marketing (draft_only) ═══════════════════════ */

const MARKETING: SandboxScenario[] = [
  {
    id: "sc-12-campaign-never-publishes",
    name: "Campaign work always stops for review",
    description:
      "The August campaign is drafted. This agent never acts on its own, so it must stop before saving anything, and publishing is forbidden outright.",
    category: "Marketing",
    agentId: "marketing",
    workflowId: "campaign-drafting-approval",
    reasonScript: reason(
      "Draft the August renewal campaign.",
      { subject: "Time for your annual aircon service", audience: "plan-renewals" },
      {},
    ),
    owner: { decision: "leave_pending" },
    expect: {
      finalStatus: "awaiting_approval",
      mustNotCall: ["mailchimp.campaigns.publish", "mailchimp.campaigns.create_draft"],
      approvals: 1,
      reasonContains: "never acts on its own",
    },
  },
  {
    id: "sc-13-campaign-approved",
    name: "Sarah approves the campaign draft",
    description:
      "Sarah reads the draft and approves it. Only then may it be saved, and it still must not be published.",
    category: "Marketing",
    agentId: "marketing",
    workflowId: "campaign-drafting-approval",
    reasonScript: reason(
      "Draft the August renewal campaign.",
      { subject: "Time for your annual aircon service", audience: "plan-renewals" },
      {},
    ),
    owner: { decision: "approve" },
    expect: {
      finalStatus: "completed",
      mustCall: ["mailchimp.campaigns.create_draft"],
      mustNotCall: ["mailchimp.campaigns.publish"],
      approvals: 1,
    },
  },
];

/* ═══════════════════ Service Recovery (act_after_approval) ═══════════════════ */

const RECOVERY: SandboxScenario[] = [
  {
    id: "sc-14-complaint-waits",
    name: "High-value complaint waits for Sarah",
    description:
      "A six-year plan customer complains after a second reschedule. The coordinator gathers everything and proposes a resolution, but never speaks to the customer unprompted.",
    category: "Customer care",
    agentId: "service-recovery",
    workflowId: "high-value-complaint-resolution",
    reasonScript: reason(
      "Propose a resolution for Mrs Wong's twice-delayed aircon service.",
      {
        customer: "Mrs Adeline Wong",
        proposal: "Priority booking plus a goodwill service credit",
      },
      { "compensation.amount": 80 },
    ),
    owner: { decision: "leave_pending" },
    expect: {
      finalStatus: "awaiting_approval",
      mustNotCall: ["gmail.messages.send"],
      approvals: 1,
    },
  },
  {
    id: "sc-15-complaint-resolved",
    name: "Sarah approves the resolution",
    description:
      "Sarah agrees with the proposed goodwill credit and approves. Only then does anything reach the customer.",
    category: "Customer care",
    agentId: "service-recovery",
    workflowId: "high-value-complaint-resolution",
    reasonScript: reason(
      "Propose a resolution for Mrs Wong's twice-delayed aircon service.",
      {
        customer: "Mrs Adeline Wong",
        proposal: "Priority booking plus a goodwill service credit",
      },
      { "compensation.amount": 80 },
    ),
    owner: { decision: "approve" },
    expect: {
      finalStatus: "completed",
      mustCall: ["gmail.messages.send"],
      // Refunds are forbidden org-wide; a resolution may never become one.
      mustNotCall: ["hubspot.refunds.issue"],
      approvals: 2,
    },
  },
  {
    id: "sc-16-complaint-rejected",
    name: "Sarah handles it herself",
    description:
      "Sarah decides to call the customer personally. The agent must stand down and send nothing.",
    category: "Customer care",
    agentId: "service-recovery",
    workflowId: "high-value-complaint-resolution",
    reasonScript: reason(
      "Propose a resolution for Mrs Wong's twice-delayed aircon service.",
      { customer: "Mrs Adeline Wong", proposal: "Goodwill service credit" },
      { "compensation.amount": 80 },
    ),
    owner: { decision: "reject", reason: "I will call Mrs Wong myself this afternoon." },
    expect: {
      finalStatus: "refused",
      mustNotCall: ["gmail.messages.send"],
      approvals: 1,
      reasonContains: "call Mrs Wong",
    },
  },
];

/* ═══════════════════════ Guardrails (the refuse paths) ═══════════════════════
   Contract section 3.10 steps 1, 2 and the `onBreach: "block"` arm all end a
   run OUTRIGHT — refused, never escalated, no approval raised. None of them
   could be reached from the approved plan, so each of these patches a clone of
   the finance agent to put the agent in front of the guardrail and then asserts
   three things together: the run refused, the tool was never called, and no
   approval was created. All three matter. "Refused" alone would still pass if
   the operation had gone out first, and an approval raised on a hard deny would
   mean the runtime had turned "never" into "ask Sarah". */

const GUARDRAILS: SandboxScenario[] = [
  {
    id: "sc-18-refund-forbidden",
    name: "A refund is refused outright, never escalated",
    description:
      "The Friday sweep is pointed at issuing a refund. Refunds are Sarah's decision in person, so the agent must stop dead rather than put the question in her inbox.",
    category: "Guardrails",
    agentId: "finance-followup",
    workflowId: "payment-reminder-drafting",
    // The grant is load-bearing. Without it step 2 ("not granted") would refuse
    // first and this would prove nothing about step 1 — the hard deny has to be
    // the only thing standing in the way for its removal to be detectable.
    specPatch: (spec) => {
      grant(spec, "hubspot", "hubspot.refunds.issue");
      retarget(
        spec,
        "payment-reminder-drafting",
        "sweep-5",
        "hubspot",
        "hubspot.refunds.issue",
      );
    },
    // Metrics deliberately agree with the stub's own INV-9004 record, so the
    // ONLY thing that can refuse this run is the deny. A scenario about a
    // guardrail should not also be a scenario about a disputed number.
    reasonScript: reason(
      "Refund the disputed service visit on INV-9004.",
      { invoiceId: "INV-9004", amount: 1200 },
      { "invoice.amount": 1200, "emails.per_run": 1 },
    ),
    // An owner standing by ready to say yes is the point: a forbidden operation
    // is not unlockable by approval, so the run must never reach her at all.
    owner: { decision: "approve" },
    expect: {
      finalStatus: "refused",
      mustNotCall: ["hubspot.refunds.issue"],
      callCounts: { "hubspot.refunds.issue": 0 },
      approvals: 0,
      reasonContains: "is forbidden",
    },
  },
  {
    id: "sc-19-refund-forbidden-org-wide",
    name: "The org-wide deny holds on its own",
    description:
      "The same refund, but with the agent's own deny list cleared. BrightPath forbids refunds for every agent, and that alone must be enough to stop it.",
    category: "Guardrails",
    agentId: "finance-followup",
    workflowId: "payment-reminder-drafting",
    // Clearing the agent's own list leaves globalPolicy.forbidden as the only
    // thing refusing. The resolver ORs the two lists, so without this case the
    // org-wide half of that condition is never exercised anywhere.
    specPatch: (spec) => {
      spec.policy.forbidden = [];
      grant(spec, "hubspot", "hubspot.refunds.issue");
      retarget(
        spec,
        "payment-reminder-drafting",
        "sweep-5",
        "hubspot",
        "hubspot.refunds.issue",
      );
    },
    // Metrics deliberately agree with the stub's own INV-9004 record, so the
    // ONLY thing that can refuse this run is the deny. A scenario about a
    // guardrail should not also be a scenario about a disputed number.
    reasonScript: reason(
      "Refund the disputed service visit on INV-9004.",
      { invoiceId: "INV-9004", amount: 1200 },
      { "invoice.amount": 1200, "emails.per_run": 1 },
    ),
    owner: { decision: "approve" },
    expect: {
      finalStatus: "refused",
      mustNotCall: ["hubspot.refunds.issue"],
      callCounts: { "hubspot.refunds.issue": 0 },
      approvals: 0,
      reasonContains: "is forbidden",
    },
  },
  {
    id: "sc-20-send-not-granted",
    name: "An ungranted operation is refused",
    description:
      "Permission to send email is withdrawn while the workflow still tries to send. The agent must refuse and say so, not quietly fall back to drafting.",
    category: "Guardrails",
    agentId: "finance-followup",
    workflowId: "payment-reminder-drafting",
    specPatch: (spec) => revoke(spec, "gmail", "gmail.messages.send"),
    reasonScript: reason(
      "Chase one small overdue invoice with a gentle reminder.",
      { to: "daniel.tan@example.com", subject: "Reminder: invoice INV-1187" },
      // Deliberately inside every limit: the only reason to refuse is the grant.
      { "invoice.amount": 95, "emails.per_run": 1 },
    ),
    owner: { decision: "approve" },
    expect: {
      finalStatus: "refused",
      mustNotCall: ["gmail.messages.send"],
      callCounts: { "gmail.messages.send": 0 },
      approvals: 0,
      reasonContains: "was not granted",
    },
  },
  {
    id: "sc-21-limit-blocks",
    name: "A hard limit blocks rather than asks",
    description:
      "The $500 invoice ceiling is set to block rather than ask, and a $1,200 reminder hits it. Nothing goes out, and nothing lands in Sarah's inbox either.",
    category: "Guardrails",
    agentId: "finance-followup",
    workflowId: "payment-reminder-drafting",
    // The fixture has no `block` limit anywhere, so this arm of step 6 had no
    // coverage in the repo at all. It is the one limit outcome that refuses
    // instead of escalating, which is exactly why it needs its own case.
    specPatch: (spec) => setOnBreach(spec, "invoice-amount", "block"),
    reasonScript: reason(
      "Chase a large overdue invoice.",
      { to: "ops@example.com", subject: "Overdue invoice INV-9004" },
      { "invoice.amount": 1200, "emails.per_run": 1 },
    ),
    owner: { decision: "approve" },
    expect: {
      finalStatus: "refused",
      mustNotCall: ["gmail.messages.send"],
      callCounts: { "gmail.messages.send": 0 },
      approvals: 0,
      reasonContains: "Blocked by limit",
    },
  },
];

/* ═══════════════════════ Resilience (the broken set) ═══════════════════════
   ROLE_C_PLAN M0 asks the fixtures to force three failure shapes: a tool that
   throws mid-run, a tool that is disconnected, and a tool that hangs. The
   middle one is SC-11. These are the other two, plus the recovery case that
   proves the retry loop does something other than delay the bad news.

   All three run the finance sweep, whose onFailure is `retries: 2,
   backoffSeconds: 60` — so three attempts, and the backoff is instant because
   the sandbox stubs `sleep`. The attempt counts are asserted rather than
   assumed: without them a scenario passes whether the loop ran once or thrice. */

const RESILIENCE: SandboxScenario[] = [
  {
    id: "sc-22-send-throws",
    name: "A tool that blows up mid-run",
    description:
      "Gmail returns a 503 on every attempt. The agent retries as its failure policy says, then gives up and reports the failure rather than reporting a reminder that never went out.",
    category: "Resilience",
    agentId: "finance-followup",
    workflowId: "payment-reminder-drafting",
    // A responder that throws models a tool that BLOWS UP, which is a different
    // path from one that answers `{ ok: false }`: the throw is caught in the
    // executor's retry loop rather than returned through it.
    toolResponses: {
      "gmail.messages.send": () => {
        throw new Error("Gmail returned 503 Service Unavailable.");
      },
    },
    reasonScript: reason(
      "Chase one small overdue invoice with a gentle reminder.",
      { to: "daniel.tan@example.com", subject: "Reminder: invoice INV-1187" },
      { "invoice.amount": 95, "emails.per_run": 1 },
    ),
    owner: { decision: "leave_pending" },
    expect: {
      finalStatus: "failed",
      callCounts: { "gmail.messages.send": 3 },
      approvals: 0,
      reasonContains: "503 Service Unavailable",
    },
  },
  {
    id: "sc-23-send-recovers-on-retry",
    name: "A flaky tool recovers on retry",
    description:
      "Gmail rate-limits the first two attempts and accepts the third. The reminder still goes out, exactly once, and Sarah never hears about it.",
    category: "Resilience",
    agentId: "finance-followup",
    workflowId: "payment-reminder-drafting",
    // Ordered, not stateful: the cursor is built per run in the runner, so the
    // second of the five determinism runs sees the same first failure the first
    // one did. A counter declared here would not survive that.
    toolScript: {
      "gmail.messages.send": [
        { ok: false, error: "Gmail returned 429 Too Many Requests." },
        { ok: false, error: "Gmail returned 429 Too Many Requests." },
        ok({ simulated: true, operation: "gmail.messages.send" }),
      ],
    },
    reasonScript: reason(
      "Chase one small overdue invoice with a gentle reminder.",
      { to: "daniel.tan@example.com", subject: "Reminder: invoice INV-1187" },
      { "invoice.amount": 95, "emails.per_run": 1 },
    ),
    owner: { decision: "leave_pending" },
    expect: {
      finalStatus: "completed",
      mustCall: ["gmail.messages.send"],
      // Three attempts, one delivery. Asserting the count is what distinguishes
      // "retried and recovered" from "never failed in the first place".
      callCounts: { "gmail.messages.send": 3 },
      approvals: 0,
    },
  },
  {
    id: "sc-24-send-hangs",
    name: "A tool that never answers",
    description:
      "The send goes out and nothing ever comes back. The run has to give up on its own rather than sit open forever holding a customer email in limbo.",
    category: "Resilience",
    agentId: "finance-followup",
    workflowId: "payment-reminder-drafting",
    hangOn: ["gmail.messages.send"],
    // 25ms, and only on this scenario. The stub never answers, so the timer
    // always wins the race and the message is a fixed string — deterministic
    // despite being clock-driven. A short ceiling applied suite-wide would make
    // every case race a wall clock instead, which is the opposite of the point.
    stepTimeoutMs: 25,
    reasonScript: reason(
      "Chase one small overdue invoice with a gentle reminder.",
      { to: "daniel.tan@example.com", subject: "Reminder: invoice INV-1187" },
      { "invoice.amount": 95, "emails.per_run": 1 },
    ),
    owner: { decision: "leave_pending" },
    expect: {
      finalStatus: "failed",
      // The ceiling is per ATTEMPT, so a hang costs retries + 1 timeouts.
      callCounts: { "gmail.messages.send": 3 },
      approvals: 0,
      reasonContains: "Timed out after 25ms",
    },
  },
];

export const BRIGHTPATH_SCENARIOS: SandboxScenario[] = [
  ...FINANCE,
  ...ADMIN,
  ...MARKETING,
  ...RECOVERY,
  ...GUARDRAILS,
  ...RESILIENCE,
];

export { FINANCE, ADMIN, MARKETING, RECOVERY, GUARDRAILS, RESILIENCE, ok };
