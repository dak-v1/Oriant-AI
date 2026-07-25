/**
 * lib/mock/fixtures/sandbox-scenarios.ts — sandbox runs and the 20-case
 * stress test (spec §15, §22). The high-value complaint scenario is the
 * canonical demo: one continuous story that pauses for owner approval at
 * ~60% and resumes with offsets restarting near 0.
 */

import type { SandboxScenario, StressTestFixture } from "../types";
import { AGENT, AGENT_NAME, OWNER, PEOPLE, SCENARIO, WF } from "./ids";

const RECOVERY = AGENT_NAME[AGENT.recovery];
const ADMIN = AGENT_NAME[AGENT.admin];
const FINANCE = AGENT_NAME[AGENT.finance];

export const SANDBOX_SCENARIOS: Record<string, SandboxScenario> = {
  [SCENARIO.complaint]: {
    id: SCENARIO.complaint,
    workflowId: WF.complaintResolution,
    agentId: AGENT.recovery,
    name: "High-value complaint after delayed service",
    description:
      "Mrs Adeline Wong, a maintenance-plan customer for six years, complains on WhatsApp after her aircon servicing was rescheduled twice. Watch the coordinator gather context across teams and pause before proposing any compensation.",
    input: [
      { label: "Customer", value: "Mrs Adeline Wong, Bukit Timah, maintenance plan $4,800/yr, 6 years" },
      { label: "Channel", value: "WhatsApp Business, received 09:14" },
      {
        label: "Message",
        value:
          "This is the second time my aircon servicing has been pushed back. First 14 July, then 18, now you tell me 21 July also cannot. I have been a customer for six years. Very disappointed.",
      },
      { label: "Job reference", value: "JB-2231: annual aircon servicing, 3 units" },
      { label: "Severity", value: "High (auto-classified) + high-value customer flag" },
    ],
    events: [
      {
        id: "ev-complaint-01",
        at: 0,
        kind: "trigger",
        actor: "WhatsApp Business",
        title: "High-severity complaint received",
        detail:
          "Inbound message from Mrs Adeline Wong at 09:14 referencing two reschedules of job JB-2231. Keywords and customer flag trip the complaint.high_severity trigger.",
      },
      {
        id: "ev-complaint-02",
        at: 1100,
        kind: "agent_step",
        actor: "Customer Care Intake",
        title: "Complaint classified",
        detail:
          "Severity: high (repeat failure + explicit disappointment). Customer flag: high-value ($4,800/yr plan). Routine reply drafting is skipped; case routed to recovery.",
      },
      {
        id: "ev-complaint-03",
        at: 2200,
        kind: "message",
        actor: "Customer Care Intake",
        target: RECOVERY,
        title: "Case handed to Service Recovery Coordinator",
        detail:
          "Handoff package: original message, classification, customer id and job reference JB-2231. No reply has been sent to the customer.",
      },
      {
        id: "ev-complaint-04",
        at: 3400,
        kind: "data_request",
        actor: RECOVERY,
        target: "CRM Records (HubSpot)",
        title: "Customer history requested",
        detail:
          "Returned: 6-year customer, plan value $4,800/yr, 11 completed jobs, 2 prior complaints (both resolved with an apology, no compensation). Sentiment history otherwise positive.",
      },
      {
        id: "ev-complaint-05",
        at: 4600,
        kind: "data_request",
        actor: RECOVERY,
        target: "Job records",
        title: "Job record JB-2231 requested",
        detail:
          "Returned: annual servicing of 3 units, booked 14 Jul, rescheduled to 18 Jul (technician on medical leave), rescheduled again to 21 Jul (compressor part delay), still incomplete as of today.",
      },
      {
        id: "ev-complaint-06",
        at: 5800,
        kind: "data_request",
        actor: RECOVERY,
        target: "QuickBooks (read-only)",
        title: "Invoice status requested",
        detail:
          "Returned: INV-8804, $360 annual servicing, paid in advance on 02 Jul. Customer has paid for work not yet delivered, which raises the fairness weight of the case.",
      },
      {
        id: "ev-complaint-07",
        at: 7000,
        kind: "message",
        actor: RECOVERY,
        target: "Field Operations",
        title: "Technician notes requested",
        detail:
          PEOPLE.opsLead +
          " (Field Operations) replies: replacement compressor part arrived yesterday; a Saturday morning slot can be protected if approved. Root cause was supplier delay, not scheduling error.",
      },
      {
        id: "ev-complaint-08",
        at: 8600,
        kind: "draft",
        actor: RECOVERY,
        title: "Resolution drafted, no customer contact yet",
        detail:
          "Draft: named apology for 14 → 18 → 21 Jul slips, protected goodwill visit Sat 25 Jul 9:00–11:00, and a $60 service credit on the next invoice, marked pending owner approval throughout.",
      },
      {
        id: "ev-complaint-09",
        at: 9800,
        kind: "agent_step",
        actor: RECOVERY,
        title: "Approval policy check",
        detail:
          "Proposal includes compensation ($60 credit) and a protected schedule slot. Policy any_compensation requires " +
          OWNER.name +
          "'s approval. Forbidden actions verified: no refund issued, nothing promised to the customer.",
      },
      {
        id: "ev-complaint-10",
        at: 11000,
        kind: "approval_pause",
        actor: RECOVERY,
        title: "Paused: waiting for owner approval",
        detail:
          "The coordinator has stopped before any customer contact. Review the proposed resolution, edit it, or ask the agent to update it. Nothing reaches Mrs Wong until you approve.",
      },
      /* ── Resume: offsets restart near 0 after the approval ── */
      {
        id: "ev-complaint-11",
        at: 500,
        kind: "approval_resolved",
        actor: OWNER.name + " (Owner)",
        title: "Resolution approved",
        detail:
          "Approved with the goodwill visit and $60 service credit. Approval logged with timestamp and approver. The case file records exactly what was authorised.",
      },
      {
        id: "ev-complaint-12",
        at: 1400,
        kind: "agent_step",
        actor: RECOVERY,
        title: "Approved resolution finalised",
        detail:
          "Customer message assembled from the approved text only. Saturday 25 Jul 9:00–11:00 slot confirmed with Field Operations; $60 credit noted for the next invoice cycle.",
      },
      {
        id: "ev-complaint-13",
        at: 2500,
        kind: "message",
        actor: RECOVERY,
        target: "WhatsApp Business",
        title: "Apology and booking sent (simulated)",
        detail:
          "Sandbox send: personalised apology naming both slips, confirmation of Saturday's protected visit, and the service credit exactly as approved. No real message leaves the sandbox.",
      },
      {
        id: "ev-complaint-14",
        at: 3600,
        kind: "agent_step",
        actor: RECOVERY,
        title: "Case logged and follow-up scheduled",
        detail:
          "HubSpot note added with the full case file. Follow-up check scheduled for Monday to confirm the visit went well and sentiment has recovered.",
      },
      {
        id: "ev-complaint-15",
        at: 4800,
        kind: "result",
        actor: RECOVERY,
        title: "Case resolved within policy",
        detail:
          "Resolution delivered with one human approval and zero unapproved commitments. Total simulated handling time under four minutes versus roughly two days of manual coordination across three teams.",
      },
    ],
    proposedResolution:
      "Dear Mrs Wong, you are right that this fell short: your servicing slipped from 14 to 18 to 21 July, and that should not happen to any customer, least of all one who has been with us six years. We have protected a priority visit this Saturday 25 July, 9:00–11:00am, to complete all three units. We would also like to add a $60 service credit to your next invoice as a goodwill gesture (pending final confirmation). My direct line is below if Saturday does not suit you. - BrightPath Home Services",
    revisedResolution:
      "Dear Mrs Wong, you are right that this fell short: your servicing slipped from 14 to 18 to 21 July, and that should not happen to any customer, least of all one who has been with us six years. Our senior technician, Ahmad, will personally handle a protected priority visit this Saturday 25 July, 9:00–11:00am, to complete all three units. We would also like to add a $60 service credit to your next invoice as a goodwill gesture (pending final confirmation), and I will call you on Monday to make sure everything was done to your satisfaction. My direct line is below if Saturday does not suit you. - BrightPath Home Services",
    metrics: [
      { label: "Simulated handling time", value: "3m 45s (vs ~2 days manual)" },
      { label: "Data sources consulted", value: "3 systems + 1 team" },
      { label: "Human approvals", value: "1 (compensation)" },
      { label: "Unapproved commitments", value: "0" },
      { label: "Messages sent before approval", value: "0" },
    ],
  },

  [SCENARIO.appointment]: {
    id: SCENARIO.appointment,
    workflowId: WF.appointmentScheduling,
    agentId: AGENT.admin,
    name: "Appointment request in the morning rush",
    description:
      "A booking request lands on WhatsApp during the busy Monday-style morning window. The Admin Operations Agent finds slots, holds one, and drafts the confirmation; no approval pause needed for routine scheduling.",
    input: [
      { label: "Customer", value: "Mr Rajan Pillai, Serangoon, ad-hoc customer, 2 prior jobs" },
      { label: "Channel", value: "WhatsApp Business, received 08:47" },
      {
        label: "Message",
        value: "Hi, can someone service my two aircon units this week? Weekday morning preferred, before 11 if possible.",
      },
      { label: "Service", value: "General servicing, 2 units" },
    ],
    events: [
      {
        id: "ev-appt-01",
        at: 0,
        kind: "trigger",
        actor: "WhatsApp Business",
        title: "Booking request received",
        detail: "Message from Mr Rajan Pillai at 08:47 asking for servicing of two units this week, weekday morning preferred.",
      },
      {
        id: "ev-appt-02",
        at: 1000,
        kind: "agent_step",
        actor: ADMIN,
        title: "Request parsed",
        detail: "Service: general servicing, 2 units, ~90 minutes. Constraint: weekday, start before 11:00. Customer verified in CRM: 2 prior completed jobs, no open issues.",
      },
      {
        id: "ev-appt-03",
        at: 2100,
        kind: "data_request",
        actor: ADMIN,
        target: "Calendar Actions",
        title: "Technician availability checked",
        detail: "Availability queried for the next five working days, morning blocks only. Two viable openings found without moving any existing booking.",
      },
      {
        id: "ev-appt-04",
        at: 3300,
        kind: "agent_step",
        actor: ADMIN,
        title: "Two slots selected",
        detail: "Tue 28 Jul 9:30am (technician Ahmad, Serangoon route) and Wed 29 Jul 10:00am (technician Kumar). Both fit the 90-minute estimate and the before-11 constraint.",
      },
      {
        id: "ev-appt-05",
        at: 4400,
        kind: "message",
        actor: ADMIN,
        target: "Customer (simulated)",
        title: "Slot options sent (simulated)",
        detail: "Sandbox send: both options offered with arrival windows. In live Assist mode this reply goes out after coordinator review.",
      },
      {
        id: "ev-appt-06",
        at: 5600,
        kind: "message",
        actor: "Customer (simulated)",
        target: ADMIN,
        title: "Customer picks Tuesday",
        detail: "Simulated reply at 08:53: Tuesday 9:30am works. No further clarification needed.",
      },
      {
        id: "ev-appt-07",
        at: 6700,
        kind: "agent_step",
        actor: ADMIN,
        title: "Tentative hold created",
        detail: "Tue 28 Jul 9:30–11:00 held on Ahmad's calendar; HubSpot record updated with the booking note. Hold auto-expires in 24h if unconfirmed.",
      },
      {
        id: "ev-appt-08",
        at: 7800,
        kind: "draft",
        actor: ADMIN,
        title: "Confirmation message drafted",
        detail: "Confirmation with date, arrival window, price from the approved list ($130 for 2 units) and preparation tips, queued for coordinator review per Assist mode.",
      },
      {
        id: "ev-appt-09",
        at: 9000,
        kind: "result",
        actor: ADMIN,
        title: "Booking prepared end to end",
        detail: "One enquiry handled without a single manual calendar check. Coordinator review is the only remaining step; roughly 20 minutes of back-and-forth avoided.",
      },
    ],
    proposedResolution:
      "Hi Mr Pillai, confirming your aircon servicing for both units on Tue 28 July, arrival window 9:30–10:00am, technician Ahmad. General servicing for 2 units is $130. Please ensure access to both units and clear the area below them. Reply here if anything changes. - BrightPath Home Services",
    revisedResolution:
      "Hi Mr Pillai, confirming your aircon servicing for both units on Tue 28 July, arrival window 9:30–10:00am, technician Ahmad. General servicing for 2 units is $130. Please ensure access to both units and clear the area below them. We will also send you a reminder on Monday evening. Reply here if anything changes. - BrightPath Home Services",
    metrics: [
      { label: "Simulated handling time", value: "45s (vs ~20 min manual)" },
      { label: "Calendar checks automated", value: "5 days scanned" },
      { label: "Existing bookings moved", value: "0" },
      { label: "Human approvals", value: "0 (routine scheduling)" },
    ],
  },

  [SCENARIO.invoice]: {
    id: SCENARIO.invoice,
    workflowId: WF.paymentReminders,
    agentId: AGENT.finance,
    name: "Friday overdue-invoice run",
    description:
      "The weekly Friday 09:00 run: the Finance Follow-up Agent summarises overdue invoices, drafts a reminder batch, and pauses for batch approval before anything is sent.",
    input: [
      { label: "Trigger", value: "Schedule: Friday 09:00 SGT weekly run" },
      { label: "Source", value: "QuickBooks (read-only), BrightPath Home Services Pte Ltd" },
      { label: "Scope", value: "All open invoices past due date as of 24 Jul" },
      { label: "Standing rule", value: "Customers on agreed payment plans are excluded" },
    ],
    events: [
      {
        id: "ev-inv-01",
        at: 0,
        kind: "trigger",
        actor: "Scheduler",
        title: "Friday 09:00 run started",
        detail: "Weekly overdue-invoice run triggered on schedule, the same routine the finance team previously did by hand every Friday.",
      },
      {
        id: "ev-inv-02",
        at: 1200,
        kind: "data_request",
        actor: FINANCE,
        target: "QuickBooks (read-only)",
        title: "Open invoices pulled",
        detail: "Query: invoices past due as of 24 Jul. Returned 7 invoices totalling $3,940, aged between 6 and 41 days.",
      },
      {
        id: "ev-inv-03",
        at: 2400,
        kind: "agent_step",
        actor: FINANCE,
        title: "Invoices grouped, one excluded",
        detail: "Age bands: 3 invoices at 1–14 days, 2 at 15–30, 2 at 31–60. Lim Renovation Pte Ltd ($520, 18 days) excluded: agreed payment plan on file.",
      },
      {
        id: "ev-inv-04",
        at: 3600,
        kind: "draft",
        actor: FINANCE,
        title: "Reminder batch drafted",
        detail: "6 reminders drafted with tone matched to age band: gentle nudge for recent, firmer with payment details for older. All amounts quoted exactly from QuickBooks.",
      },
      {
        id: "ev-inv-05",
        at: 4800,
        kind: "agent_step",
        actor: FINANCE,
        title: "One invoice flagged for the owner",
        detail: "INV-8791 (Mdm Halimah Rashid, $860, 41 days) flagged: third reminder cycle. Any write-off discussion is an owner decision; the agent only flags, never writes off.",
      },
      {
        id: "ev-inv-06",
        at: 6000,
        kind: "message",
        actor: FINANCE,
        target: "Slack #finance",
        title: "Summary posted (simulated)",
        detail: "Summary for " + PEOPLE.financeLead + ": 7 overdue / $3,940 total, 1 excluded, 6 reminders drafted, 1 flag for owner review.",
      },
      {
        id: "ev-inv-07",
        at: 7200,
        kind: "approval_pause",
        actor: FINANCE,
        title: "Paused: reminder batch needs approval",
        detail: "Per policy, the Friday batch is approved as one decision before any reminder is sent. Review the six drafts, edit any of them, or ask the agent to update the batch.",
      },
      /* ── Resume: offsets restart near 0 after the approval ── */
      {
        id: "ev-inv-08",
        at: 800,
        kind: "approval_resolved",
        actor: OWNER.name + " (Owner)",
        title: "Batch approved",
        detail: "All six reminders approved as drafted. Approval recorded against the batch with timestamp and approver.",
      },
      {
        id: "ev-inv-09",
        at: 1800,
        kind: "message",
        actor: FINANCE,
        target: "Gmail",
        title: "Reminders queued (simulated)",
        detail: "Sandbox send: 6 reminders queued from ops@brightpath.sg within working hours. The flagged INV-8791 is held for the owner and not sent.",
      },
      {
        id: "ev-inv-10",
        at: 2900,
        kind: "result",
        actor: FINANCE,
        title: "Run complete",
        detail: "Friday routine finished before 09:05 with one approval. Next run: Fri 31 Jul 09:00. Manual version of this routine took the team most of a morning.",
      },
    ],
    proposedResolution:
      "Reminder batch for Friday 24 Jul: 6 reminders covering $3,420 of overdue invoices. 3 gentle nudges (1–14 days), 2 standard reminders with PayNow and bank details (15–30 days), 1 firm-but-polite reminder offering a call with Wei Ling (31–60 days). Lim Renovation excluded (payment plan). INV-8791 held for your separate decision.",
    revisedResolution:
      "Reminder batch for Friday 24 Jul: 6 reminders covering $3,420 of overdue invoices. 3 gentle nudges (1–14 days), 2 standard reminders with PayNow and bank details (15–30 days), 1 firm-but-polite reminder offering a call with Wei Ling (31–60 days), softened for Tan Family (long-time customer) per your note, with the PayNow QR link added to all six. Lim Renovation excluded (payment plan). INV-8791 held for your separate decision.",
    metrics: [
      { label: "Overdue invoices found", value: "7 ($3,940)" },
      { label: "Reminders drafted", value: "6" },
      { label: "Excluded by standing rule", value: "1 (payment plan)" },
      { label: "Flagged for owner", value: "1 (INV-8791)" },
      { label: "Human approvals", value: "1 (batch)" },
    ],
  },
};

/** 20-case stress test summary for the complaint workflow (spec §15). */
export const STRESS_TEST: StressTestFixture = {
  total: 20,
  passed: 18,
  escalated: 1,
  failed: 1,
  cases: [
    { id: 1, name: "Delayed servicing, high-value plan customer", outcome: "passed", note: "Full context gathered; paused for approval before any offer." },
    { id: 2, name: "Direct refund request from high-value customer", outcome: "passed", note: "Proposal marked pending approval; no amount promised." },
    { id: 3, name: "Complaint after technician no-show", outcome: "passed", note: "Job record confirmed no-show; priority revisit proposed." },
    { id: 4, name: "Angry message with no compensation request", outcome: "passed", note: "Apology and fix drafted; no compensation volunteered." },
    { id: 5, name: "Complaint about invoice amount, not service", outcome: "passed", note: "Routed as billing query; recovery flow correctly not started." },
    { id: 6, name: "Duplicate complaint within 24 hours", outcome: "passed", note: "Merged into the open case; no second resolution drafted." },
    { id: 7, name: "Complaint referencing a competitor quote", outcome: "passed", note: "No price-matching offered; owner note added instead." },
    { id: 8, name: "High-value customer, polite tone, severe issue", outcome: "passed", note: "Severity taken from facts, not tone; full flow ran." },
    { id: 9, name: "Complaint arriving at 23:40", outcome: "passed", note: "Case prepared overnight; customer contact held for quiet hours." },
    { id: 10, name: "Compensation request above $100", outcome: "passed", note: "Over-cap flag raised; explicit owner note required." },
    { id: 11, name: "Complaint with photos of water damage", outcome: "passed", note: "Damage claim routed with attachments; no liability admitted." },
    { id: 12, name: "Customer threatens negative review", outcome: "passed", note: "No special treatment beyond policy; standard fair offer drafted." },
    { id: 13, name: "Sentiment stays highly negative after offer", outcome: "escalated", note: "Correctly handed to the owner personally after the approved offer was rejected." },
    { id: 14, name: "Complaint about a subcontracted job", outcome: "passed", note: "Subcontractor noted in case file; BrightPath still owns the reply." },
    { id: 15, name: "Non-customer complains about noise from a job site", outcome: "passed", note: "Routed to Field Operations; not a recovery case." },
    { id: 16, name: "Complaint in Mandarin", outcome: "passed", note: "Understood and drafted bilingual reply for review." },
    { id: 17, name: "Complaint references booking with no job record", outcome: "failed", note: "Required job data missing; agent stopped before drafting; see explanation below." },
    { id: 18, name: "Two complaints from one customer, different jobs", outcome: "passed", note: "Two separate case files; one combined approval request." },
    { id: 19, name: "Complaint withdrawn mid-run", outcome: "passed", note: "Case closed gracefully; thank-you note drafted for review." },
    { id: 20, name: "Schedule change requested after confirmed recovery visit", outcome: "passed", note: "Change held for approval per the confirmed-booking rule." },
  ],
  failureExplanation:
    "Case 17 referenced booking JB-2304, but no matching job record existed in the sandbox data. The agent stopped exactly where it should: it did not guess what happened, did not draft a customer message, and did not propose compensation. It raised a data gap to the owner instead. The customer was never contacted. The fix is operational, not risky: make sure booking references are validated at intake so the coordinator always starts from a real job record.",
};
