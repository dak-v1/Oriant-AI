/**
 * lib/mock/fixtures/company-report.ts — Company report content for Human
 * Approval Gate 1 (spec §10). All 12 sections in outline order, with
 * evidence drawn from the onboarding conversation, uploaded Lean Canvas,
 * selected tools and the five discovery interview answers (spec §9.2).
 */

import type { ReportSectionDef, ReportSectionId } from "../types";

export const REPORT_SECTIONS: ReportSectionDef[] = [
  {
    id: "company-overview",
    title: "Company overview",
    body: [
      "BrightPath Home Services is a residential maintenance and home services company based in Singapore. The business runs on an appointment model: customers book one-off repairs or subscribe to recurring maintenance plans covering aircon servicing, plumbing, electrical checks and general upkeep.",
      "The company employs 18 people and handles roughly 650 customer requests per month, of which about 420 become completed jobs. Sarah Chen owns and manages the business day to day, and is personally involved in most non-routine decisions.",
    ],
    bullets: [],
    evidence: [
      {
        source: "Onboarding conversation",
        provenance: "owner_confirmed",
        quote: "We run residential maintenance across Singapore — about 650 requests a month, 18 of us in total.",
      },
      {
        source: "Uploaded canvas",
        provenance: "uploaded_document",
        quote: "Appointment-based services with recurring maintenance plans.",
      },
    ],
    confirmedFacts: 5,
    assumptions: 0,
  },
  {
    id: "lean-canvas-summary",
    title: "Lean Canvas summary",
    body: [
      "The uploaded Lean Canvas describes a business built on reliability for busy homeowners: BrightPath wins on showing up on time and fixing things on the first visit, not on being the cheapest option in the market.",
    ],
    bullets: [
      "Problem — homeowners juggle unreliable contractors and repeat visits for the same fault.",
      "Customer segments — HDB and condo households on recurring plans; landlords managing multiple units.",
      "Unique value proposition — one trusted team for the whole home, with punctuality guarantees.",
      "Revenue streams — per-job fees plus monthly and annual maintenance plan subscriptions.",
      "Key metrics — jobs completed per month, plan renewal rate, first-visit fix rate.",
    ],
    evidence: [
      {
        source: "Uploaded canvas",
        provenance: "uploaded_document",
        quote: "One trusted team for the whole home — punctual, transparent, fixed right the first time.",
      },
    ],
    confirmedFacts: 4,
    assumptions: 1,
  },
  {
    id: "team-structure",
    title: "Team structure",
    body: [
      "The 18 staff are organised into five teams. Customer Care is the most stretched: five people rotate between Gmail, WhatsApp Business and HubSpot, and repeated customer questions consume most of their mornings.",
    ],
    bullets: [
      "Customer Care — 5 people, led by Priya Nair. Enquiries, bookings and complaints.",
      "Field Operations — technicians and crew scheduling, led by Marcus Tan.",
      "Marketing — coordinated part-time by Dana Lim alongside customer projects.",
      "Finance — 2 people led by Wei Ling Goh. Invoicing, collections, supplier payments.",
      "Management — Sarah Chen, covering approvals, escalations and planning.",
    ],
    evidence: [
      {
        source: "Interview answer 1",
        provenance: "owner_confirmed",
        quote: "Customer Care. Five people switch between Gmail, WhatsApp and HubSpot, and repeated questions take most of the morning.",
      },
    ],
    confirmedFacts: 3,
    assumptions: 2,
  },
  {
    id: "current-processes",
    title: "Current processes",
    body: [
      "Four processes account for most of the coordination effort inside BrightPath today. All four are manual, and three of them route through a single person before anything can move.",
    ],
    bullets: [
      "Customer responses — messages are sorted by hand across Gmail and WhatsApp; the same questions are answered from scratch each time.",
      "Appointment scheduling — a coordinator checks technician availability, offers times, updates Google Calendar and sends the confirmation manually.",
      "Invoice follow-up — every Friday the finance team checks QuickBooks for overdue invoices and drafts reminders one by one.",
      "Complaint handling — serious complaints need input from Customer Care, Operations and Finance before Sarah can decide what to do.",
    ],
    evidence: [
      {
        source: "Interview answer 2",
        provenance: "owner_confirmed",
        quote: "A coordinator checks technician availability, offers times, updates Google Calendar and sends confirmation manually.",
      },
      {
        source: "Interview answer 4",
        provenance: "owner_confirmed",
        quote: "Every Friday the finance team checks QuickBooks for overdue invoices and drafts reminders.",
      },
    ],
    confirmedFacts: 5,
    assumptions: 1,
  },
  {
    id: "business-goals",
    title: "Business goals",
    body: [
      "Sarah's primary goal is to reduce manual coordination across teams while keeping every customer-facing and financial decision in human hands. Speed matters, but not at the cost of control.",
    ],
    bullets: [
      "Cut the time Customer Care spends on repeated questions and manual sorting.",
      "Respond to new enquiries faster without adding headcount.",
      "Make marketing output steady instead of dependent on Sarah's availability.",
      "Keep refunds, public content, write-offs and confirmed-schedule changes under human approval.",
    ],
    evidence: [
      {
        source: "Onboarding conversation",
        provenance: "owner_confirmed",
        quote: "I want less coordination work, but customer-facing and money decisions stay with people.",
      },
    ],
    confirmedFacts: 3,
    assumptions: 1,
  },
  {
    id: "bottlenecks",
    title: "Bottlenecks",
    body: [
      "Five recurring bottlenecks came up across the interview. Each one is a coordination problem rather than a skills problem — information exists, but it sits in different tools and different teams.",
    ],
    bullets: [
      "Customer Care mornings are consumed by repeated questions across Gmail and WhatsApp.",
      "Appointments are repeatedly rescheduled over phone and calendar, with manual confirmations.",
      "Marketing is planned inconsistently and waits on Sarah before anything ships.",
      "Overdue invoices are only caught in the manual Friday check.",
      "High-value complaints stall while information is gathered from three teams.",
    ],
    evidence: [
      {
        source: "Interview answer 1",
        provenance: "owner_confirmed",
        quote: "Repeated questions take most of the morning.",
      },
      {
        source: "Interview answer 5",
        provenance: "owner_confirmed",
        quote: "Serious customer complaints need information from Customer Care, Operations and Finance before I can decide what to do.",
      },
    ],
    confirmedFacts: 5,
    assumptions: 0,
  },
  {
    id: "existing-systems",
    title: "Existing systems",
    body: [
      "BrightPath already runs on seven established tools. None of them are changing — the goal is to coordinate across them, not replace them.",
    ],
    bullets: [
      "Gmail — main customer email channel and internal mail.",
      "WhatsApp Business — highest-volume customer messaging channel.",
      "Google Calendar — technician schedules and appointment slots.",
      "HubSpot — customer records, job history and enquiry pipeline.",
      "QuickBooks — invoicing, payments and overdue tracking.",
      "Google Drive — SOPs, job photos, quotes and marketing assets.",
      "Slack — internal coordination between Customer Care, Operations and Finance.",
    ],
    evidence: [
      {
        source: "Selected tools",
        provenance: "selected_tool",
        quote: "Gmail, Google Calendar, HubSpot, WhatsApp Business, QuickBooks, Google Drive, Slack selected during onboarding.",
      },
    ],
    confirmedFacts: 7,
    assumptions: 0,
  },
  {
    id: "automation-preference",
    title: "Automation preference",
    body: [
      "Sarah chose Assist mode: AI prepares, recommends and handles routine work alongside the current team of 18. Important actions stay reviewable, and nothing customer-facing or financial happens without a named person approving it.",
      "This preference shapes every recommendation in this report — agents are proposed as drafters and coordinators first, with autonomy expanded only where explicit limits exist.",
    ],
    bullets: [],
    evidence: [
      {
        source: "Onboarding conversation",
        provenance: "owner_confirmed",
        quote: "Assist — AI works with current employees.",
      },
    ],
    confirmedFacts: 2,
    assumptions: 0,
  },
  {
    id: "approval-restrictions",
    title: "Approval restrictions",
    body: [
      "Sarah defined a clear approval boundary. Four action types must always be approved by a person, and four are never to be automated under any configuration.",
    ],
    bullets: [
      "Always approve — refunds above $100.",
      "Always approve — public marketing content.",
      "Always approve — invoice write-offs.",
      "Always approve — schedule changes after customer confirmation.",
      "Never automate — employee termination, bank transfers, legal commitments, deletion of customer records.",
    ],
    evidence: [
      {
        source: "Interview answer 3",
        provenance: "owner_confirmed",
        quote: "Refunds above $100, schedule changes after customer confirmation, public campaign content and invoice write-offs.",
      },
    ],
    confirmedFacts: 6,
    assumptions: 0,
  },
  {
    id: "assumptions",
    title: "Assumptions",
    body: [
      "Three working assumptions were made where the interview did not provide confirmed facts. Each is marked in the knowledge model and can be corrected here without re-running discovery.",
    ],
    bullets: [
      "WhatsApp Business carries the majority of inbound customer messages, estimated at around 60% of volume.",
      "Technician availability lives only in Google Calendar — there is no separate rostering tool.",
      "Most overdue invoices are small recurring-plan payments under $500 rather than large project bills.",
    ],
    evidence: [
      {
        source: "Oriant analysis",
        provenance: "oriant_assumption",
        quote: "Inferred from tool selection and interview context; not yet confirmed by the owner.",
      },
    ],
    confirmedFacts: 0,
    assumptions: 3,
  },
  {
    id: "missing-information",
    title: "Missing information",
    body: [
      "These gaps are non-blocking — planning can proceed — but filling them will sharpen agent configuration and approval thresholds.",
    ],
    bullets: [
      "Exact message volume split between Gmail and WhatsApp Business.",
      "How a complaint is currently judged 'serious' — no written severity criteria exist.",
      "Invoice aging thresholds — when a late invoice becomes a follow-up versus a write-off candidate.",
      "Seasonal demand peaks and how technician capacity flexes to meet them.",
    ],
    evidence: [
      {
        source: "Oriant analysis",
        provenance: "oriant_assumption",
        quote: "No confirmed data captured for these items during onboarding or the interview.",
      },
    ],
    confirmedFacts: 0,
    assumptions: 0,
  },
  {
    id: "potential-opportunities",
    title: "Potential opportunities",
    body: [
      "Four automation opportunities follow directly from the confirmed bottlenecks. Three map to existing preset agents; the complaint process needs a custom-designed coordinator because it spans three teams and carries financial guardrails.",
    ],
    bullets: [
      "Draft customer responses and coordinate appointment scheduling across Gmail, WhatsApp and Google Calendar.",
      "Plan weekly marketing content and route every campaign draft through owner approval.",
      "Automate the Friday overdue-invoice summary and draft payment reminders for batch approval.",
      "Coordinate high-value complaints — gather records from three teams and present one decision-ready case file.",
    ],
    evidence: [
      {
        source: "Interview answer 5",
        provenance: "owner_confirmed",
        quote: "Serious customer complaints need information from Customer Care, Operations and Finance before I can decide what to do.",
      },
      {
        source: "Interview answer 4",
        provenance: "owner_confirmed",
        quote: "Every Friday the finance team checks QuickBooks for overdue invoices and drafts reminders.",
      },
    ],
    confirmedFacts: 2,
    assumptions: 2,
  },
];

export const REPORT_SECTION_ORDER: ReportSectionId[] = REPORT_SECTIONS.map(
  (section) => section.id
);
