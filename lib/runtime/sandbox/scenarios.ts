/**
 * lib/runtime/sandbox/scenarios.ts — the BrightPath scenario library (M3).
 *
 * Chosen for BRANCH COVERAGE of the policy resolver, not for looks. Between
 * them these cases reach every outcome the six-step resolution order in
 * docs/PLAN_CONTRACT.md section 3.10 can produce:
 *
 *   allow                    SC-01, SC-06
 *   alwaysApprove            SC-04, SC-07
 *   draft_only               SC-08, SC-09
 *   act_after_approval       SC-10, SC-11
 *   limit breach             SC-02, SC-03
 *   unmeasured limit         SC-05
 *   forbidden                SC-12
 *   integration unavailable  SC-13
 *
 * Each scenario states what the owner does when the run pauses, so the approve,
 * edit and reject paths are exercised rather than assumed. Every expectation is
 * checked in code; the prose here is what the owner reads, nothing more.
 */

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

export const BRIGHTPATH_SCENARIOS: SandboxScenario[] = [
  ...FINANCE,
  ...ADMIN,
  ...MARKETING,
  ...RECOVERY,
];

export { FINANCE, ADMIN, MARKETING, RECOVERY, ok };
