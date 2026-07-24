/**
 * lib/mock/fixtures/reports.ts — universal command bar fixtures, daily digest
 * and weekly outcome report (spec §19.1, §19.3, §22; improvement spec §18).
 * All metrics are estimates on mock data and labeled as such; weekly AI cost
 * is the $292/month plan total (PRICING sum) split across four weeks.
 */

import type {
  CommandFixture,
  DailyDigestFixture,
  DailyDigestV2,
  WeeklyReportFixture,
} from "../types";
import { AGENT, AGENT_NAME, APPROVAL, DEMO_TODAY } from "./ids";

/** Legacy §19.3 daily digest for DEMO_TODAY (kept for compatibility). */
export const DAILY_DIGEST: DailyDigestFixture = {
  date: DEMO_TODAY,
  completed: [
    "Sorted 23 overnight messages into 6 job requests, 4 enquiries and 1 complaint",
    "Confirmed 9 of today's appointments by WhatsApp; all customers replied",
    "Weekly overdue invoice summary posted to Slack (8 invoices, $4,310)",
    "Payment reminders sent to 12 customers after your 09:20 approval",
    "Drafted reply to Ng Family Bakery's quarterly pest-check enquiry",
    "August \"Monsoon-Ready Home\" campaign copy drafted for review",
  ],
  reviews: [
    "Refund $180 to Daniel Tan, due today 14:30",
    "Resolution plan for Mrs Wong (goodwill visit plus $60 credit), due today 12:00",
    "Write off $95 on INV-1187, due today 16:30",
    "Move Jonathan Lim's confirmed Saturday visit, decision needed by 17:30",
  ],
  exceptions: [
    "Duplicate invoice detected in the reminder batch (INV-1179): skipped automatically",
    "One WhatsApp confirmation undelivered; customer reached by email instead",
  ],
  upcoming: [
    "Mon 27 Jul, 10:00: weekly content plan takes effect (your changes pending)",
    "Mon 27 Jul, 15:00: renewal quote to Rajesh Kumar sends on approval",
    "Tue 28 Jul, 11:00: August campaign launch decision",
    "Fri 31 Jul: next overdue invoice summary (09:00) and reminder batch (14:00)",
  ],
};

/**
 * Improvement spec §18 (DD-01): grouped daily digest for DEMO_TODAY.
 * Attention items are pre-sorted by priority then due time and deep-link to
 * the approval inbox via their APPROVAL.* ids.
 */
export const DAILY_DIGEST_V2: DailyDigestV2 = {
  date: DEMO_TODAY,
  coverage: "Covers 07:00 to 18:00 SGT",
  glance: [
    {
      label: "Workflows completed",
      value: "14",
      note: "Across Admin, Finance and Marketing today",
    },
    {
      label: "Approvals needed",
      value: "7",
      note: "4 due today, 3 early next week",
    },
    {
      label: "Exceptions",
      value: "2",
      note: "Both handled automatically, no action needed",
    },
    {
      label: "Time saved",
      value: "6.2 h (est.)",
      note: "Compared with handling today's completed work manually",
    },
    {
      label: "AI cost today",
      value: "$9.70",
      note: "Mock cost: today's share of the $292/month plan",
    },
  ],
  attention: [
    {
      title: "Resolution plan for Mrs Wong (goodwill visit plus $60 credit)",
      due: "Today 12:00",
      risk: "high",
      approvalId: APPROVAL.complaint,
    },
    {
      title: "Refund $180 to Daniel Tan for the missed plumbing appointment",
      due: "Today 14:30",
      risk: "high",
      approvalId: APPROVAL.refund,
    },
    {
      title: "Write off the $95 balance on invoice INV-1187",
      due: "Today 16:30",
      risk: "medium",
      approvalId: APPROVAL.writeoff,
    },
    {
      title: "Move Jonathan Lim's confirmed Saturday aircon servicing",
      due: "Today 17:30",
      risk: "medium",
      approvalId: APPROVAL.reschedule,
    },
  ],
  completedByTeam: [
    {
      team: "Admin",
      items: [
        "Sorted 23 overnight messages into 6 job requests, 4 enquiries and 1 complaint",
        "Confirmed 9 of today's appointments by WhatsApp; all customers replied",
        "Drafted a reply to Ng Family Bakery's quarterly pest-check enquiry",
      ],
    },
    {
      team: "Finance",
      items: [
        "Posted the weekly overdue invoice summary to Slack (8 invoices, $4,310)",
        "Sent payment reminders to 12 customers after your 09:20 approval",
        "Skipped duplicate invoice INV-1179 in the reminder batch automatically",
      ],
    },
    {
      team: "Marketing",
      items: [
        "Drafted the August \"Monsoon-Ready Home\" campaign copy for review",
        "Prepared next week's three-post content plan from engagement stats",
      ],
    },
  ],
  comingUp: [
    "Mon 27 Jul, 10:00: revised weekly content plan returns for your approval",
    "Mon 27 Jul, 15:00: renewal quote to Rajesh Kumar sends on approval",
    "Tue 28 Jul, 11:00: August campaign launch decision",
    "Fri 31 Jul: next overdue invoice summary (09:00) and reminder batch (14:00)",
  ],
  insights: [
    "Reminder batches recover most payments within 48 hours. Raising the reminder auto-approval limit would let Friday batches send without waiting on you.",
    "Both schedule conflicts this month came from Saturday morning double-bookings. A booking buffer for Saturday slots would prevent most of them.",
  ],
};

/** §19.3 weekly outcome report — seven metrics, all estimates on mock data. */
export const WEEKLY_REPORT: WeeklyReportFixture = {
  weekLabel: "Week of 20–26 July 2026",
  metrics: [
    {
      label: "Hours saved",
      value: "31 h (est.)",
      note: "Time your team did not spend sorting messages, drafting replies and chasing invoices",
    },
    {
      label: "Response-time improvement",
      value: "4.1 h → 38 min (est.)",
      note: "Average first reply to customer messages, June baseline vs this week",
    },
    {
      label: "Revenue impact",
      value: "$2,840 (est.)",
      note: "Overdue invoices collected sooner following reminder batches",
    },
    {
      label: "Workflow success rate",
      value: "94%",
      note: "127 of 135 runs completed without intervention or error",
    },
    {
      label: "Human intervention rate",
      value: "18%",
      note: "Runs that paused for a decision from you or a team lead, by design for financial and customer-facing work",
    },
    {
      label: "Total AI cost (illustrative)",
      value: "$73",
      note: "This week's share of the $292/month workforce subscription",
    },
    {
      label: "Cost per successful outcome",
      value: "$0.57 (est.)",
      note: "$73 spread across 127 successful runs this week",
    },
  ],
  highlights: [
    "Reminder batches recovered $2,840 across 11 invoices: the best collection week this month.",
    "Mrs Wong's complaint went from first message to a full resolution plan in under four hours.",
    "Zero missed appointment confirmations for the second week running.",
    "One failed reminder run on 17 Jul (expired QuickBooks connection); reconnected and resent within a day.",
  ],
};

/** §19.1 universal command bar fixtures — keywords match each example to its own fixture. */
export const COMMANDS: CommandFixture[] = [
  {
    id: "cmd-overdue-summary",
    example: "Prepare a summary of overdue invoices.",
    keywords: ["overdue"],
    agentId: AGENT.finance,
    agentName: AGENT_NAME[AGENT.finance],
    routingSteps: [
      "Reading your request…",
      "Matched to Finance Follow-up Agent: overdue invoice reporting",
      "Pulling the latest aging data from QuickBooks…",
    ],
    resultTitle: "Overdue invoices, Friday 24 July 2026",
    resultLines: [
      "8 invoices overdue by 14+ days: $4,310 outstanding in total",
      "Oldest: INV-1187, Grace Ho, 74 days ($95); write-off pending your approval",
      "Largest: INV-1201, Novena Interiors Pte Ltd, 31 days ($1,240)",
      "12 reminders went out today at 14:00 after your approval",
      "2 payments received this week following earlier reminders ($640)",
      "Suggested next step: approve the INV-1187 write-off, then call Novena Interiors on Monday",
    ],
    resultKind: "summary",
  },
  {
    id: "cmd-new-campaign",
    example: "Create a campaign for our new service.",
    keywords: ["campaign"],
    agentId: AGENT.marketing,
    agentName: AGENT_NAME[AGENT.marketing],
    routingSteps: [
      "Reading your request…",
      "Matched to Marketing Agent: campaign drafting",
      "Drafting copy from your service catalogue and past campaign results…",
    ],
    resultTitle: "Draft: Gutter & Roof Check launch campaign",
    resultLines: [
      "Headline: \"New from BrightPath: the 60-minute Gutter & Roof Check\"",
      "Email subject: \"Your roof has been through a lot this year\"",
      "Email lead: \"Blocked gutters cause most of the water damage we repair. Our new 60-minute check catches problems early. Launch price $68.\"",
      "WhatsApp blast: \"New service: Gutter & Roof Check, $68 launch price for existing customers. Reply BOOK and we'll arrange a slot.\"",
      "Social post: before/after photo set from the Toa Payoh gutter clean, with launch offer",
      "Note: public content. This draft will be held for your approval before anything is published",
    ],
    resultKind: "draft",
  },
  {
    id: "cmd-waiting-enquiries",
    example: "Show all customer enquiries waiting for a reply.",
    keywords: ["enquiries"],
    agentId: AGENT.admin,
    agentName: AGENT_NAME[AGENT.admin],
    routingSteps: [
      "Reading your request…",
      "Matched to Admin Operations Agent: inbox triage",
      "Checking Gmail and WhatsApp threads without a reply…",
    ],
    resultTitle: "Enquiries waiting for a reply: 4",
    resultLines: [
      "Ng Family Bakery: quarterly pest checks for two outlets (draft reply ready for review)",
      "Melissa Chua, Pasir Ris: quote request for balcony waterproofing (needs a site-visit slot)",
      "Kavitha R., Jurong West: asked if aircon servicing covers chemical wash (draft reply ready)",
      "Bedok Community Centre: bulk booking enquiry for 8 units (flagged: commercial pricing needs your input)",
      "All four received within the last 24 hours; average wait so far is 5 h 10 min",
    ],
    resultKind: "list",
  },
  {
    id: "cmd-pause-holiday",
    example: "Pause marketing posts during the public holiday.",
    keywords: ["pause", "holiday"],
    agentId: AGENT.marketing,
    agentName: AGENT_NAME[AGENT.marketing],
    routingSteps: [
      "Reading your request…",
      "Matched to Marketing Agent: schedule management",
      "Checking scheduled posts against Singapore public holidays…",
    ],
    resultTitle: "Marketing posts paused for National Day",
    resultLines: [
      "2 scheduled posts on Sun 9 Aug and Mon 10 Aug (National Day weekend) moved to Tue 11 Aug",
      "The weekly content plan for that week will re-space around the new dates",
      "Payment reminders and appointment confirmations are not affected by this pause",
      "\"Exclude public holidays\" can be set permanently from the Marketing calendar. Want me to queue that for your approval?",
    ],
    resultKind: "action",
  },
];
