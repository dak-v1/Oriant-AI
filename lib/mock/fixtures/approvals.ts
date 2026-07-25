/**
 * lib/mock/fixtures/approvals.ts — Approval Inbox items + filters (spec §17, §18.1).
 * Eight ApprovalItems keyed by APPROVAL.*, each cross-linked to its CAL.* calendar
 * event. Statuses: six pending, one approved (reminder batch), one
 * review_requested (content plan).
 */

import type { ApprovalItem } from "../types";
import {
  AGENT,
  AGENT_NAME,
  APPROVAL,
  CAL,
  DEMO_MONTH,
  DEMO_TODAY,
  OWNER,
  PEOPLE,
  WF,
  WF_NAME,
} from "./ids";

export const APPROVAL_ITEMS: Record<string, ApprovalItem> = {
  [APPROVAL.refund]: {
    id: APPROVAL.refund,
    team: "customer_care",
    agentId: AGENT.recovery,
    agentName: AGENT_NAME[AGENT.recovery],
    workflowId: WF.complaintResolution,
    workflowName: WF_NAME[WF.complaintResolution],
    title: "Refund $180 to Daniel Tan for missed plumbing appointment",
    decision: "Approve a $180 refund to Daniel Tan's original payment method",
    reason:
      "Two missed appointment windows in one week. The amount exceeds the $100 auto-approval limit, so this needs your decision.",
    risk: "high",
    valueLabel: "$180 refund",
    dueAt: DEMO_TODAY,
    dueTime: "14:30",
    customer: "Daniel Tan, Tampines St 45",
    source: [
      { label: "Job", value: "#J-2214: kitchen sink repair, booked 15 Jul" },
      { label: "Customer history", value: "Maintenance Plus member since 2024, 9 completed jobs" },
      { label: "Trigger", value: "Second missed window logged by Field Operations on 22 Jul" },
    ],
    versions: [
      {
        version: 1,
        content:
          "Refund the full $180 booking fee to Mr Tan's original payment method and send: \"Mr Tan, we're very sorry we missed two appointment windows this week. We have refunded your $180 booking fee in full. It will reach your card within 3–5 working days. We'd still like to complete the sink repair at a time that suits you.\"",
        at: `${DEMO_MONTH}-23T17:20:00+08:00`,
        note: "Initial draft from complaint review",
      },
    ],
    nextRevision: {
      content:
        "Refund the full $180 booking fee and send: \"Mr Tan, we're very sorry we missed two appointment windows this week. We have refunded your $180 booking fee in full (3–5 working days to your card). We've also reserved a priority slot on Monday 27 Jul at a time of your choice, and the call-out fee for that visit is waived.\"",
      note: "Added a priority Monday rebooking and waived the next call-out fee as a goodwill gesture.",
    },
    confidence: 0.86,
    approvalRule: "Refunds above $100 always require owner approval",
    status: "pending",
    comments: [
      {
        author: PEOPLE.careLead,
        at: `${DEMO_TODAY}T11:45:00+08:00`,
        text: "Daniel was understanding on the phone, but this is our second slip with him. I'd support the full refund.",
      },
    ],
    calendarEventId: CAL.refund,
    flags: ["financial", "customer_facing", "high_value", "assigned_to_me"],
  },

  [APPROVAL.campaign]: {
    id: APPROVAL.campaign,
    team: "marketing",
    agentId: AGENT.marketing,
    agentName: AGENT_NAME[AGENT.marketing],
    workflowId: WF.campaignDrafting,
    workflowName: WF_NAME[WF.campaignDrafting],
    title: "August \"Monsoon-Ready Home\" campaign copy",
    decision: "Approve the public campaign copy for the August maintenance push",
    reason:
      "Public marketing content always requires owner approval before anything is published or sent.",
    risk: "medium",
    valueLabel: "Public content",
    dueAt: `${DEMO_MONTH}-28`,
    dueTime: "11:00",
    customer: "Campaign: Monsoon-Ready Home Check",
    source: [
      { label: "Brief", value: "August push for gutter, roof and aircon checks before the wet season" },
      { label: "Audience", value: "612 past customers (Gmail list) + Facebook page followers" },
      { label: "Channels", value: "Email, Facebook, Instagram (launch Tue 28 Jul)" },
    ],
    versions: [
      {
        version: 1,
        content:
          "Headline: \"Is your home ready for the monsoon?\" Email: \"The year-end rains arrive faster than most of us expect. Our Monsoon-Ready Home Check covers gutters, roof seals, and aircon drainage in one 90-minute visit. Book in August and your report is free.\" Social: \"Leaky window sills? Musty aircon? Get monsoon-ready with one visit from BrightPath. August slots now open.\"",
        at: `${DEMO_TODAY}T15:30:00+08:00`,
        note: "First full draft: headline, email body and two social posts",
      },
    ],
    nextRevision: {
      content:
        "Headline: \"Beat the monsoon: one visit, whole home checked.\" Email: \"The year-end rains arrive faster than most of us expect. Our Monsoon-Ready Home Check covers gutters, roof seals, and aircon drainage in one 90-minute visit: $88, report included. Maintenance Plus members book free.\" Social: \"One 90-minute visit. Gutters, roof, aircon: all monsoon-ready. $88 in August, free for Maintenance Plus members.\"",
      note: "Sharper headline and added the $88 price anchor plus the Maintenance Plus member benefit.",
    },
    confidence: 0.82,
    approvalRule: "Public marketing content always requires owner approval",
    status: "pending",
    comments: [
      {
        author: PEOPLE.marketingLead,
        at: `${DEMO_TODAY}T16:05:00+08:00`,
        text: "Booking page is ready. Happy for this to go out Tuesday morning if you approve.",
      },
    ],
    calendarEventId: CAL.campaign,
    flags: ["customer_facing"],
  },

  [APPROVAL.writeoff]: {
    id: APPROVAL.writeoff,
    team: "finance",
    agentId: AGENT.finance,
    agentName: AGENT_NAME[AGENT.finance],
    workflowId: WF.invoiceSummary,
    workflowName: WF_NAME[WF.invoiceSummary],
    title: "Write off the $95 balance on invoice INV-1187",
    decision: "Approve writing off the remaining $95 on INV-1187 and closing the dispute",
    reason:
      "The customer disputes the repaint touch-up charge. The invoice is 74 days overdue and chasing it further would cost more than it recovers. Invoice write-offs always need your approval.",
    risk: "medium",
    valueLabel: "$95 write-off",
    dueAt: DEMO_TODAY,
    dueTime: "16:30",
    customer: "Grace Ho, Ang Mo Kio Ave 3",
    source: [
      { label: "Invoice", value: "INV-1187: $95 balance, issued 11 May, 74 days overdue" },
      { label: "Dispute", value: "Customer says the touch-up was included in the original repaint quote" },
      { label: "Contact log", value: "Two calls and three reminders since June; position unchanged" },
    ],
    versions: [
      {
        version: 1,
        content:
          "Write off the $95 balance on INV-1187 in QuickBooks with reason \"disputed scope (goodwill)\". Send: \"Ms Ho, thank you for your patience while we reviewed this. We've closed the remaining balance on your invoice. No further payment is due. We appreciate your business and hope to see you again.\"",
        at: `${DEMO_TODAY}T13:20:00+08:00`,
        note: "Draft after reviewing the dispute history",
      },
    ],
    nextRevision: {
      content:
        "Write off the $95 balance on INV-1187 in QuickBooks with reason \"disputed scope (goodwill)\". Send: \"Ms Ho, thank you for your patience while we reviewed this. You were right that the quote wording was unclear, so we've closed the remaining balance. Nothing further is due and your account is fully settled. We've also tightened our quotes so this doesn't happen again.\"",
      note: "Reworded the customer note to acknowledge the unclear quote and close the dispute politely.",
    },
    confidence: 0.78,
    approvalRule: "Invoice write-offs always require owner approval",
    status: "pending",
    comments: [
      {
        author: PEOPLE.financeLead,
        at: `${DEMO_TODAY}T13:40:00+08:00`,
        text: "I've called Grace twice; she's firm that the touch-up was included. Cheaper to close this out and keep the relationship.",
      },
    ],
    calendarEventId: CAL.writeoff,
    flags: ["financial"],
  },

  [APPROVAL.reschedule]: {
    id: APPROVAL.reschedule,
    team: "admin",
    agentId: AGENT.admin,
    agentName: AGENT_NAME[AGENT.admin],
    workflowId: WF.appointmentScheduling,
    workflowName: WF_NAME[WF.appointmentScheduling],
    title: "Move Jonathan Lim's confirmed Saturday aircon servicing",
    decision: "Approve moving the confirmed Sat 25 Jul 09:30 visit to 14:00 the same day",
    reason:
      "Technician Ravi is double-booked on Saturday morning. Mr Lim's slot was already confirmed with him, and schedule changes after customer confirmation always need approval.",
    risk: "medium",
    valueLabel: "Confirmed booking",
    dueAt: DEMO_TODAY,
    dueTime: "17:30",
    customer: "Jonathan Lim, Bishan St 22",
    source: [
      { label: "Booking", value: "#J-2231: quarterly aircon servicing, confirmed Wed 22 Jul" },
      { label: "Conflict", value: "Ravi assigned to an emergency water-heater job, Sat 08:30–12:30" },
      { label: "Alternative", value: "Ravi free Sat 14:00–16:00; no other technician covers Bishan on Saturday" },
    ],
    versions: [
      {
        version: 1,
        content:
          "Move the visit to Sat 25 Jul, 14:00–15:30 and send: \"Mr Lim, we're sorry, but we need to shift your aircon servicing tomorrow from 9:30am to 2pm due to an emergency job. Same technician, same price. Does 2pm still work for you? If not, we'll find a slot on Sunday or Monday.\"",
        at: `${DEMO_TODAY}T14:45:00+08:00`,
        note: "Proposed after checking all technician calendars",
      },
    ],
    nextRevision: {
      content:
        "Move the visit to Sat 25 Jul, 14:00–15:30 and send: \"Mr Lim, we're sorry, but we need to shift your aircon servicing tomorrow from 9:30am to 2pm due to an emergency job. Same technician, same price, and we'll waive the filter-cleaning add-on as an apology. Does 2pm still work? If not, we'll find a Sunday or Monday slot.\" Also schedule a WhatsApp reminder one hour before the new slot.",
      note: "Added a small apology gesture and a one-hour reminder before the new time.",
    },
    confidence: 0.91,
    approvalRule: "Schedule changes after customer confirmation always require approval",
    status: "pending",
    comments: [],
    calendarEventId: CAL.reschedule,
    flags: ["customer_facing"],
  },

  [APPROVAL.reminder]: {
    id: APPROVAL.reminder,
    team: "finance",
    agentId: AGENT.finance,
    agentName: AGENT_NAME[AGENT.finance],
    workflowId: WF.paymentReminders,
    workflowName: WF_NAME[WF.paymentReminders],
    title: "Friday payment reminder batch: 12 overdue invoices",
    decision: "Send friendly payment reminders for 12 invoices overdue by 14+ days ($4,310 total)",
    reason:
      "The weekly batch is drafted every Friday morning and held for a quick owner check before anything is sent.",
    risk: "low",
    valueLabel: "$4,310 outstanding",
    dueAt: DEMO_TODAY,
    dueTime: "14:00",
    customer: "12 customers (full list in draft)",
    source: [
      { label: "Selection", value: "QuickBooks invoices overdue 14+ days, excluding disputed INV-1187" },
      { label: "Largest", value: "INV-1201: Novena Interiors Pte Ltd, $1,240, 31 days overdue" },
      { label: "Last batch", value: "Fri 10 Jul: 10 reminders sent, 4 payments within 48 hours" },
    ],
    versions: [
      {
        version: 1,
        content:
          "Send 12 personalised reminders at 14:00 via email (WhatsApp for the 3 customers who prefer it). Template: \"Hi [name], a gentle reminder that invoice [number] for [amount] was due on [date]. You can pay via the PayNow link below. If you've already paid, please ignore this, and thank you!\"",
        at: `${DEMO_TODAY}T09:15:00+08:00`,
        note: "Friday batch drafted from this morning's QuickBooks aging report",
      },
    ],
    nextRevision: {
      content:
        "Send 12 reminders at 14:00, with tone split by age: invoices 14–30 days get the gentle template; invoices over 60 days get: \"Hi [name], invoice [number] for [amount] is now more than two months past due. Please settle via the PayNow link this week, or reply and we'll arrange a payment plan.\"",
      note: "Split the tone by overdue age: gentler under 30 days, firmer past 60 days.",
    },
    confidence: 0.95,
    approvalRule: "Reminder batches are drafted for approval; nothing sends without sign-off",
    status: "approved",
    comments: [
      {
        author: OWNER.name,
        at: `${DEMO_TODAY}T09:20:00+08:00`,
        text: "Tone is right. Approved. Send at 14:00 as planned.",
      },
    ],
    calendarEventId: CAL.reminder,
    flags: ["financial"],
  },

  [APPROVAL.complaint]: {
    id: APPROVAL.complaint,
    team: "customer_care",
    agentId: AGENT.recovery,
    agentName: AGENT_NAME[AGENT.recovery],
    workflowId: WF.complaintResolution,
    workflowName: WF_NAME[WF.complaintResolution],
    title: "Resolution plan for Mrs Wong's delayed aircon servicing",
    decision: "Approve a goodwill visit on Mon 27 Jul plus a $60 service credit",
    reason:
      "Mrs Wong is a Maintenance Plus member affected by two servicing delays this month. The plan includes a service credit, which needs owner sign-off.",
    risk: "high",
    valueLabel: "High-value customer",
    dueAt: DEMO_TODAY,
    dueTime: "12:00",
    customer: "Mrs Adeline Wong, Bukit Timah Rd",
    source: [
      { label: "Complaint", value: "WhatsApp message received 08:32 today, the second delay this month" },
      { label: "Customer history", value: "Maintenance Plus member for 6 years, $2,150 spent in 12 months" },
      { label: "Inputs gathered", value: "Job history (Field Operations), plan terms (Finance), message thread (Customer Care)" },
    ],
    versions: [
      {
        version: 1,
        content:
          "Offer a goodwill servicing visit on Mon 27 Jul, 10:00, and apply a $60 service credit to Mrs Wong's Maintenance Plus account. Send a personal apology acknowledging both delays and confirming the Monday visit is at no charge.",
        at: `${DEMO_TODAY}T10:20:00+08:00`,
        note: "Drafted after gathering inputs from three teams",
      },
    ],
    nextRevision: {
      content:
        "Offer a goodwill servicing visit on Mon 27 Jul, 10:00 with our senior technician assigned as priority, and apply a $60 service credit to Mrs Wong's account. Send a personal apology acknowledging both delays, and schedule a follow-up call on Wed 29 Jul to confirm everything is working well.",
      note: "Added a priority senior technician and a follow-up call two days after the visit.",
    },
    confidence: 0.84,
    approvalRule: "Service credits and goodwill compensation require owner approval",
    status: "pending",
    comments: [
      {
        author: PEOPLE.careLead,
        at: `${DEMO_TODAY}T10:35:00+08:00`,
        text: "Mrs Wong has been with us six years. The credit is the right call here.",
      },
      {
        author: PEOPLE.opsLead,
        at: `${DEMO_TODAY}T10:52:00+08:00`,
        text: "Confirmed: senior tech available Monday morning if this is approved.",
      },
    ],
    calendarEventId: CAL.complaint,
    flags: ["customer_facing", "high_value", "assigned_to_me"],
  },

  [APPROVAL.contentPlan]: {
    id: APPROVAL.contentPlan,
    team: "marketing",
    agentId: AGENT.marketing,
    agentName: AGENT_NAME[AGENT.marketing],
    workflowId: WF.contentPlanning,
    workflowName: WF_NAME[WF.contentPlanning],
    title: "Content plan for the week of 27 July",
    decision: "Approve next week's three-post content plan",
    reason:
      "The weekly plan was drafted this morning for next week. You asked for changes to the Wednesday post before it goes ahead.",
    risk: "low",
    valueLabel: "3 posts",
    dueAt: `${DEMO_MONTH}-27`,
    dueTime: "10:00",
    customer: "Weekly plan: 27 Jul to 2 Aug",
    source: [
      { label: "Inputs", value: "Last week's engagement stats, August campaign brief, booking trends" },
      { label: "Best performer", value: "Before/after repaint photos: reach up 18% week on week" },
      { label: "Cadence", value: "Mon tips post, Wed service spotlight, Fri customer story" },
    ],
    versions: [
      {
        version: 1,
        content:
          "Mon 27 Jul: \"5-minute checks that prevent big repair bills\" tips carousel. Wed 29 Jul: gutter-clearing service spotlight with before/after photos. Fri 31 Jul: customer story on the Serangoon family's full-home maintenance plan, with quote.",
        at: `${DEMO_TODAY}T09:30:00+08:00`,
        note: "Weekly plan drafted from engagement stats and the August campaign brief",
      },
    ],
    nextRevision: {
      content:
        "Mon 27 Jul: \"5-minute checks that prevent big repair bills\" tips carousel. Wed 29 Jul: monsoon-prep checklist post (teaser for the August campaign, no gutter overlap). Fri 31 Jul: customer story on the Serangoon family's full-home maintenance plan, with quote.",
      note: "Swapped the Wednesday gutter spotlight for a monsoon-prep checklist so it doesn't overlap the August campaign.",
    },
    confidence: 0.88,
    approvalRule: "Weekly content plans are reviewed before posts are scheduled",
    status: "review_requested",
    comments: [
      {
        author: OWNER.name,
        at: `${DEMO_TODAY}T13:10:00+08:00`,
        text: "Swap the Wednesday post; the August campaign already covers gutters. A monsoon checklist teaser would fit better.",
      },
    ],
    calendarEventId: CAL.contentPlan,
    flags: [],
  },

  [APPROVAL.quote]: {
    id: APPROVAL.quote,
    team: "admin",
    agentId: AGENT.admin,
    agentName: AGENT_NAME[AGENT.admin],
    workflowId: WF.customerResponse,
    workflowName: WF_NAME[WF.customerResponse],
    title: "Annual maintenance plan renewal quote for Rajesh Kumar",
    decision: "Approve sending the $756/year renewal quote with a 4% loyalty discount",
    reason:
      "The quote includes a discount and goes directly to the customer, so it gets a quick check before sending.",
    risk: "medium",
    valueLabel: "$756/year renewal",
    dueAt: `${DEMO_MONTH}-27`,
    dueTime: "15:00",
    customer: "Rajesh Kumar, Serangoon Gardens",
    source: [
      { label: "Plan", value: "Maintenance Plus, expires 31 Jul (currently $787/year)" },
      { label: "History", value: "3 years on the plan, 11 visits, zero missed payments" },
      { label: "Pricing basis", value: "Standard renewal $787 less 4% loyalty discount = $756" },
    ],
    versions: [
      {
        version: 1,
        content:
          "Send: \"Mr Kumar, your Maintenance Plus plan expires on 31 July. As a thank-you for three years with us, your renewal is $756/year, a 4% loyalty discount off the standard $787. Your quarterly visit schedule stays the same. Reply YES and we'll handle the rest.\"",
        at: `${DEMO_TODAY}T11:05:00+08:00`,
        note: "Renewal drafted 7 days before plan expiry, per playbook",
      },
    ],
    nextRevision: {
      content:
        "Send: \"Mr Kumar, your Maintenance Plus plan expires on 31 July. As a thank-you for three years with us, your renewal is $756/year, a 4% loyalty discount. You can also lock this price for 3 years. Included: 4 scheduled visits (Oct, Jan, Apr, Jul), priority booking and 10% off repairs. Reply YES and we'll handle the rest.\"",
      note: "Added a 3-year price-lock option and itemised what the plan includes.",
    },
    confidence: 0.9,
    approvalRule: "Discounted quotes are reviewed before they reach the customer",
    status: "pending",
    comments: [],
    calendarEventId: CAL.quote,
    flags: ["financial", "customer_facing"],
  },
};

/** §18.1 Approval Inbox filter chips, in display order. */
export const APPROVAL_FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "assigned", label: "Assigned to me" },
  { id: "financial", label: "Financial" },
  { id: "marketing", label: "Marketing" },
  { id: "admin", label: "Admin" },
  { id: "high_value", label: "High value" },
  { id: "customer_facing", label: "Customer-facing" },
  { id: "due_today", label: "Due today" },
];
