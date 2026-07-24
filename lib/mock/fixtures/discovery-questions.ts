/**
 * discovery-questions.ts — Discovery interview and knowledge model for BrightPath.
 * Covers spec §9 (interview + §9.2 canonical Q&A verbatim, §9.3 knowledge tab,
 * §9.4 upload/invite bonuses) and §22 (deterministic fixtures).
 */

import type { DiscoveryQuestion, KnowledgeFact, KnowledgeSection } from "../types";
import { DQ } from "./ids";

/** Spec §9.2 — the five canonical questions, answers verbatim, in interview order. */
export const DISCOVERY_QUESTIONS: DiscoveryQuestion[] = [
  {
    id: DQ.overloaded,
    question: "Which team is currently most overloaded?",
    reason: "Knowing where the load sits tells Oriant where help matters soonest.",
    answer:
      "Customer Care. Five people switch between Gmail, WhatsApp and HubSpot, and repeated questions take most of the morning.",
    factIds: [
      "fact-q1-care-load",
      "fact-q1-channel-switch",
      "fact-q1-repeat-questions",
      "fact-opp-admin",
      "fact-gap-response-target",
    ],
    sections: ["team", "systems", "processes", "opportunities", "gaps"],
  },
  {
    id: DQ.appointment,
    question: "What happens after a customer asks for an appointment?",
    reason: "Step-by-step processes show which handoffs Oriant can prepare for people.",
    answer:
      "A coordinator checks technician availability, offers times, updates Google Calendar and sends confirmation manually.",
    factIds: [
      "fact-q2-booking-flow",
      "fact-q2-calendar-updates",
      "fact-q2-manual-confirms",
      "fact-assume-utilisation",
    ],
    sections: ["processes", "systems", "assumptions"],
  },
  {
    id: DQ.decisions,
    question: "Which decisions must always stay with a person?",
    reason: "These become hard approval rules that every agent must respect.",
    answer:
      "Refunds above $100, schedule changes after customer confirmation, public campaign content and invoice write-offs.",
    factIds: [
      "fact-q3-refund-limit",
      "fact-q3-schedule-lock",
      "fact-q3-campaign-signoff",
      "fact-q3-writeoff-approval",
    ],
    sections: ["rules"],
  },
  {
    id: DQ.finance,
    question: "What finance work is repeated?",
    reason: "Repeated, scheduled work is the safest place to start automating.",
    answer:
      "Every Friday the finance team checks QuickBooks for overdue invoices and drafts reminders.",
    factIds: [
      "fact-q4-friday-check",
      "fact-q4-reminder-drafting",
      "fact-q4-quickbooks-source",
      "fact-opp-finance",
      "fact-assume-renewals",
    ],
    sections: ["processes", "systems", "opportunities", "assumptions"],
  },
  {
    id: DQ.coordination,
    question: "What is hardest to coordinate?",
    reason: "Cross-team coordination often calls for a custom-designed agent.",
    answer:
      "Serious customer complaints need information from Customer Care, Operations and Finance before I can decide what to do.",
    factIds: [
      "fact-q5-complaint-flow",
      "fact-q5-owner-decides",
      "fact-opp-recovery",
      "fact-gap-complaint-log",
    ],
    sections: ["processes", "rules", "opportunities", "gaps"],
  },
];

/** Spec §9.3 — every fact in the knowledge model, keyed by id. */
export const KNOWLEDGE_FACTS: Record<string, KnowledgeFact> = {
  /* ── Base facts (onboarding + Lean Canvas + selected tools) ── */
  "fact-base-industry": {
    id: "fact-base-industry",
    section: "company",
    label: "Industry",
    value: "Residential maintenance and home services",
    provenance: "owner_confirmed",
    confidence: 1,
    confirmed: true,
  },
  "fact-base-location": {
    id: "fact-base-location",
    section: "company",
    label: "Location",
    value: "Singapore, island-wide coverage",
    provenance: "owner_confirmed",
    confidence: 1,
    confirmed: true,
  },
  "fact-base-volume": {
    id: "fact-base-volume",
    section: "company",
    label: "Monthly volume",
    value: "~650 customer requests, 420 completed jobs",
    provenance: "owner_confirmed",
    confidence: 0.95,
    confirmed: true,
  },
  "fact-base-model": {
    id: "fact-base-model",
    section: "company",
    label: "Business model",
    value: "Appointment services with recurring maintenance plans",
    provenance: "uploaded_document",
    confidence: 0.9,
    confirmed: true,
  },
  "fact-base-revenue-mix": {
    id: "fact-base-revenue-mix",
    section: "company",
    label: "Revenue mix",
    value: "Plans ($89–$249/month) are ~60% of revenue",
    provenance: "uploaded_document",
    confidence: 0.85,
    confirmed: true,
  },
  "fact-base-team-size": {
    id: "fact-base-team-size",
    section: "team",
    label: "Team size",
    value: "18 employees across five teams",
    provenance: "owner_confirmed",
    confidence: 1,
    confirmed: true,
  },
  "fact-base-teams": {
    id: "fact-base-teams",
    section: "team",
    label: "Teams",
    value: "Customer Care, Field Operations, Marketing, Finance, Management",
    provenance: "owner_confirmed",
    confidence: 1,
    confirmed: true,
  },
  "fact-base-goal": {
    id: "fact-base-goal",
    section: "goals",
    label: "Primary goal",
    value: "Less manual coordination; key decisions stay human",
    provenance: "owner_confirmed",
    confidence: 0.95,
    confirmed: true,
  },
  "fact-base-mode": {
    id: "fact-base-mode",
    section: "rules",
    label: "Automation mode",
    value: "Assist: AI works alongside current employees",
    provenance: "owner_confirmed",
    confidence: 1,
    confirmed: true,
  },
  "fact-base-tools": {
    id: "fact-base-tools",
    section: "systems",
    label: "Core tools",
    value: "Gmail, Google Calendar, HubSpot, WhatsApp, QuickBooks, Drive, Slack",
    provenance: "selected_tool",
    confidence: 0.9,
    confirmed: true,
  },

  /* ── Q1 — most overloaded team ── */
  "fact-q1-care-load": {
    id: "fact-q1-care-load",
    section: "team",
    label: "Most overloaded",
    value: "Customer Care: five people on front-line replies",
    provenance: "owner_confirmed",
    confidence: 0.95,
    confirmed: true,
  },
  "fact-q1-channel-switch": {
    id: "fact-q1-channel-switch",
    section: "systems",
    label: "Channel switching",
    value: "Staff juggle Gmail, WhatsApp and HubSpot per enquiry",
    provenance: "owner_confirmed",
    confidence: 0.95,
    confirmed: true,
  },
  "fact-q1-repeat-questions": {
    id: "fact-q1-repeat-questions",
    section: "processes",
    label: "Repeated questions",
    value: "Routine enquiries consume most of each morning",
    provenance: "owner_confirmed",
    confidence: 0.9,
    confirmed: true,
  },

  /* ── Q2 — appointment flow ── */
  "fact-q2-booking-flow": {
    id: "fact-q2-booking-flow",
    section: "processes",
    label: "Booking flow",
    value: "Coordinator checks availability, offers times, confirms manually",
    provenance: "owner_confirmed",
    confidence: 0.95,
    confirmed: true,
  },
  "fact-q2-calendar-updates": {
    id: "fact-q2-calendar-updates",
    section: "systems",
    label: "Calendar updates",
    value: "Google Calendar updated by hand for every job",
    provenance: "owner_confirmed",
    confidence: 0.95,
    confirmed: true,
  },
  "fact-q2-manual-confirms": {
    id: "fact-q2-manual-confirms",
    section: "processes",
    label: "Manual confirmations",
    value: "Every appointment confirmation is sent one by one",
    provenance: "owner_confirmed",
    confidence: 0.9,
    confirmed: true,
  },

  /* ── Q3 — human-only decisions ── */
  "fact-q3-refund-limit": {
    id: "fact-q3-refund-limit",
    section: "rules",
    label: "Refund limit",
    value: "Refunds above $100 always need owner approval",
    provenance: "owner_confirmed",
    confidence: 1,
    confirmed: true,
  },
  "fact-q3-schedule-lock": {
    id: "fact-q3-schedule-lock",
    section: "rules",
    label: "Schedule changes",
    value: "Changes after customer confirmation stay human-approved",
    provenance: "owner_confirmed",
    confidence: 1,
    confirmed: true,
  },
  "fact-q3-campaign-signoff": {
    id: "fact-q3-campaign-signoff",
    section: "rules",
    label: "Campaign sign-off",
    value: "Public campaign content is reviewed before publishing",
    provenance: "owner_confirmed",
    confidence: 1,
    confirmed: true,
  },
  "fact-q3-writeoff-approval": {
    id: "fact-q3-writeoff-approval",
    section: "rules",
    label: "Invoice write-offs",
    value: "Write-offs are always approved by a person",
    provenance: "owner_confirmed",
    confidence: 1,
    confirmed: true,
  },

  /* ── Q4 — repeated finance work ── */
  "fact-q4-friday-check": {
    id: "fact-q4-friday-check",
    section: "processes",
    label: "Friday invoice check",
    value: "Finance reviews overdue invoices in QuickBooks weekly",
    provenance: "owner_confirmed",
    confidence: 0.95,
    confirmed: true,
  },
  "fact-q4-reminder-drafting": {
    id: "fact-q4-reminder-drafting",
    section: "processes",
    label: "Reminder drafting",
    value: "Payment reminders drafted manually every Friday",
    provenance: "owner_confirmed",
    confidence: 0.95,
    confirmed: true,
  },
  "fact-q4-quickbooks-source": {
    id: "fact-q4-quickbooks-source",
    section: "systems",
    label: "Finance system",
    value: "QuickBooks is the source of truth for invoices",
    provenance: "owner_confirmed",
    confidence: 0.9,
    confirmed: true,
  },

  /* ── Q5 — hardest coordination ── */
  "fact-q5-complaint-flow": {
    id: "fact-q5-complaint-flow",
    section: "processes",
    label: "Complaint handling",
    value: "Serious complaints gather facts from Care, Operations and Finance",
    provenance: "owner_confirmed",
    confidence: 0.95,
    confirmed: true,
  },
  "fact-q5-owner-decides": {
    id: "fact-q5-owner-decides",
    section: "rules",
    label: "Final decision",
    value: "Sarah decides the outcome of every serious complaint",
    provenance: "owner_confirmed",
    confidence: 0.95,
    confirmed: true,
  },

  /* ── Upload bonus (simulated SOP / org-chart upload, §9.4) ── */
  "fact-upload-job-sop": {
    id: "fact-upload-job-sop",
    section: "processes",
    label: "Job SOP",
    value: "Confirm → dispatch → complete → invoice within 24 hours",
    provenance: "uploaded_document",
    confidence: 0.85,
    confirmed: true,
  },
  "fact-upload-escalation": {
    id: "fact-upload-escalation",
    section: "processes",
    label: "Escalation path",
    value: "Complaints route Care → Ops lead → owner within one day",
    provenance: "uploaded_document",
    confidence: 0.85,
    confirmed: true,
  },
  "fact-upload-org-chart": {
    id: "fact-upload-org-chart",
    section: "team",
    label: "Org structure",
    value: "Care 5, Field Ops 8, Marketing 2, Finance 2, Management 1",
    provenance: "uploaded_document",
    confidence: 0.9,
    confirmed: true,
  },

  /* ── Invite bonus (Priya Nair, Customer Care lead, §9.4) ── */
  "fact-invite-templates": {
    id: "fact-invite-templates",
    section: "processes",
    label: "Reply templates",
    value: "Care team keeps 12 saved replies in a shared doc",
    provenance: "employee_response",
    confidence: 0.85,
    confirmed: true,
  },
  "fact-invite-peak-hours": {
    id: "fact-invite-peak-hours",
    section: "team",
    label: "Enquiry peak",
    value: "WhatsApp enquiries peak between 9 and 11 each morning",
    provenance: "employee_response",
    confidence: 0.85,
    confirmed: true,
  },

  /* ── Assumptions (unconfirmed, shown honestly) ── */
  "fact-assume-response-time": {
    id: "fact-assume-response-time",
    section: "assumptions",
    label: "First-reply time",
    value: "Assumed 2–4 hours to first reply during business hours",
    provenance: "oriant_assumption",
    confidence: 0.6,
    confirmed: false,
  },
  "fact-assume-utilisation": {
    id: "fact-assume-utilisation",
    section: "assumptions",
    label: "Technician utilisation",
    value: "Assumed ~75% of weekday slots are booked",
    provenance: "oriant_assumption",
    confidence: 0.55,
    confirmed: false,
  },
  "fact-assume-renewals": {
    id: "fact-assume-renewals",
    section: "assumptions",
    label: "Plan renewals",
    value: "Assumed maintenance plans renew annually unless cancelled",
    provenance: "oriant_assumption",
    confidence: 0.65,
    confirmed: false,
  },

  /* ── Knowledge gaps ── */
  "fact-gap-peak-season": {
    id: "fact-gap-peak-season",
    section: "gaps",
    label: "Seasonal demand",
    value: "No data yet on seasonal peaks in job volume",
    provenance: "oriant_assumption",
    confidence: 0.7,
    confirmed: false,
  },
  "fact-gap-response-target": {
    id: "fact-gap-response-target",
    section: "gaps",
    label: "Service targets",
    value: "No documented response-time target for enquiries",
    provenance: "oriant_assumption",
    confidence: 0.75,
    confirmed: false,
  },
  "fact-gap-complaint-log": {
    id: "fact-gap-complaint-log",
    section: "gaps",
    label: "Complaint history",
    value: "Past complaint volumes and outcomes not yet shared",
    provenance: "oriant_assumption",
    confidence: 0.75,
    confirmed: false,
  },

  /* ── Potential opportunities (foreshadow the four agents) ── */
  "fact-opp-admin": {
    id: "fact-opp-admin",
    section: "opportunities",
    label: "Routine admin relief",
    value: "Draft routine replies and prepare bookings for human review",
    provenance: "oriant_assumption",
    confidence: 0.8,
    confirmed: false,
  },
  "fact-opp-marketing": {
    id: "fact-opp-marketing",
    section: "opportunities",
    label: "Steady marketing rhythm",
    value: "Plan and draft campaigns weekly instead of waiting on the owner",
    provenance: "oriant_assumption",
    confidence: 0.75,
    confirmed: false,
  },
  "fact-opp-finance": {
    id: "fact-opp-finance",
    section: "opportunities",
    label: "Invoice follow-up",
    value: "Prepare Friday overdue summaries and reminder drafts automatically",
    provenance: "oriant_assumption",
    confidence: 0.8,
    confirmed: false,
  },
  "fact-opp-recovery": {
    id: "fact-opp-recovery",
    section: "opportunities",
    label: "Complaint coordination",
    value: "Gather cross-team facts so the owner can decide faster",
    provenance: "oriant_assumption",
    confidence: 0.75,
    confirmed: false,
  },
};

/**
 * Facts seeded before the interview starts: onboarding + canvas + tools, plus
 * the marketing opportunity, first assumption and first gap Oriant already
 * noted from Sarah's intro (marketing waits on the owner).
 */
export const BASE_FACT_IDS: string[] = [
  "fact-base-industry",
  "fact-base-location",
  "fact-base-volume",
  "fact-base-model",
  "fact-base-revenue-mix",
  "fact-base-team-size",
  "fact-base-teams",
  "fact-base-goal",
  "fact-base-mode",
  "fact-base-tools",
  "fact-opp-marketing",
  "fact-assume-response-time",
  "fact-gap-peak-season",
];

/** Added by the simulated "Upload more information" SOP/org-chart upload. */
export const UPLOAD_FACT_IDS: string[] = [
  "fact-upload-job-sop",
  "fact-upload-escalation",
  "fact-upload-org-chart",
];

/** Added when the invited employee (Priya Nair) responds. */
export const INVITE_FACT_IDS: string[] = [
  "fact-invite-templates",
  "fact-invite-peak-hours",
];

/** Spec §9.3 — section headings for the "What Oriant Knows" tab. */
export const KNOWLEDGE_SECTION_LABELS: Record<KnowledgeSection, string> = {
  company: "Company",
  team: "Teams",
  goals: "Goals",
  processes: "Processes",
  systems: "Systems",
  rules: "Rules",
  assumptions: "Assumptions",
  gaps: "Knowledge gaps",
  opportunities: "Potential opportunities",
};
