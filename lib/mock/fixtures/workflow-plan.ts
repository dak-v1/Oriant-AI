/**
 * lib/mock/fixtures/workflow-plan.ts — initial planner output and NL
 * reconfiguration fixtures (spec §11.1, §11.6, §11.7, §22, Appendix A).
 * The initial plan places all four agents: presets need configuration,
 * the custom coordinator needs its design cycle first.
 */

import type { AgentWorkflowDef, NlCommandFixture, PlanAgent } from "../types";
import { AGENT, WF, WF_NAME } from "./ids";
import { AGENT_LIBRARY } from "./agent-library";

/** The four agents exactly as the planner first recommends them (Appendix A). */
export const INITIAL_PLAN_AGENTS: PlanAgent[] = [
  {
    agentId: AGENT.admin,
    status: "needs_configuration",
    config: AGENT_LIBRARY[AGENT.admin].defaultConfig,
    designAnswers: null,
    designApproved: false,
    workflowOrder: AGENT_LIBRARY[AGENT.admin].workflows.map((w) => w.id),
  },
  {
    agentId: AGENT.marketing,
    status: "needs_configuration",
    config: AGENT_LIBRARY[AGENT.marketing].defaultConfig,
    designAnswers: null,
    designApproved: false,
    workflowOrder: AGENT_LIBRARY[AGENT.marketing].workflows.map((w) => w.id),
  },
  {
    agentId: AGENT.finance,
    status: "needs_configuration",
    config: AGENT_LIBRARY[AGENT.finance].defaultConfig,
    designAnswers: null,
    designApproved: false,
    workflowOrder: AGENT_LIBRARY[AGENT.finance].workflows.map((w) => w.id),
  },
  {
    agentId: AGENT.recovery,
    status: "needs_information",
    config: AGENT_LIBRARY[AGENT.recovery].defaultConfig,
    designAnswers: null,
    designApproved: false,
    workflowOrder: AGENT_LIBRARY[AGENT.recovery].workflows.map((w) => w.id),
  },
];

/** Five visible planner generation stages, shown over 7–9s (spec §22). */
export const PLANNER_STAGES: string[] = [
  "Reading the approved company report",
  "Matching confirmed needs against the preset agent library",
  "Marking covered outcomes and remaining gaps",
  "Designing a custom proposal for the complaint process",
  "Assembling the workforce plan and illustrative pricing",
];

/** Four visible discovery analysis stages, shown over 5–7s (spec §22). */
export const DISCOVERY_STAGES: string[] = [
  "Organising everything you shared",
  "Mapping teams, tools and processes",
  "Separating confirmed facts from assumptions",
  "Preparing your company report",
];

/** Workflow added by the "weekly overdue-invoice summary" NL command. */
const WEEKLY_DIGEST_WORKFLOW: AgentWorkflowDef = {
  id: WF.weeklyInvoiceDigest,
  name: WF_NAME[WF.weeklyInvoiceDigest],
  description:
    "A Monday-morning digest for Sarah: every invoice still overdue after the Friday run, reminder outcomes, and anything flagged for a write-off decision.",
  trigger: { kind: "schedule", label: "Every Monday 08:30" },
  steps: [
    "Collect invoices still overdue after Friday's reminder batch",
    "Summarise reminder outcomes and payments received over the weekend",
    "Highlight items awaiting a write-off decision",
    "Deliver the digest to Sarah Chen in Slack",
  ],
  handoff: "Flagged write-off candidates link straight into the approval queue.",
  onFailure: "If weekend payment data is unavailable, the digest is sent with a clearly marked data gap.",
  humanApprovals: [],
};

/** The four §11.7 NL reconfiguration commands with deterministic effects. */
export const NL_COMMANDS: NlCommandFixture[] = [
  {
    id: "nl-campaign-approval",
    example: "Keep campaign publishing human-approved.",
    keywords: ["campaign"],
    reasoning: [
      "Checking the Marketing Agent's current approval settings",
      "Campaign publishing is already gated — making the rule explicit and locked",
      "No workflow structure changes needed",
    ],
    summary:
      "Locked 'Publish campaign content' as a human-approved action on the Marketing Agent. Publishing can never be switched to automatic.",
    costDelta: { setup: 0, monthly: 0 },
    effect: {
      kind: "set_approval",
      agentId: AGENT.marketing,
      action: "Publish campaign content",
    },
  },
  {
    id: "nl-weekly-invoice-digest",
    example: "Add a weekly overdue-invoice summary.",
    keywords: ["overdue"],
    reasoning: [
      "The Finance Follow-up Agent already reads QuickBooks aging data on Fridays",
      "Adding a Monday digest workflow that reuses the same data access",
      "Estimating the incremental setup and monthly cost",
    ],
    summary:
      "Added the Weekly Invoice Digest workflow to the Finance Follow-up Agent — a Monday 08:30 summary of remaining overdue invoices and reminder outcomes for Sarah.",
    costDelta: { setup: 40, monthly: 8 },
    effect: {
      kind: "add_workflow",
      agentId: AGENT.finance,
      workflow: WEEKLY_DIGEST_WORKFLOW,
    },
  },
  {
    id: "nl-move-appointment-reminders",
    example: "Move appointment reminders to the Admin Agent.",
    keywords: ["appointment"],
    reasoning: [
      "Appointment reminders sit inside Appointment Scheduling, already owned by the Admin Operations Agent",
      "Recording an explicit routing rule so no other agent drafts appointment reminders",
      "No cost change — the capability already exists in the plan",
    ],
    summary:
      "Appointment reminders are now explicitly owned by the Admin Operations Agent. No other agent will draft or send appointment reminders.",
    costDelta: { setup: 0, monthly: 0 },
    effect: {
      kind: "add_rule",
      rule: "Appointment reminders are drafted and sent only by the Admin Operations Agent, within its Appointment Scheduling workflow.",
    },
  },
  {
    id: "nl-protect-high-value",
    example: "Do not let any agent contact a high-value customer automatically.",
    keywords: ["high-value"],
    reasoning: [
      "This rule spans all four agents, not one workflow",
      "Adding a plan-wide guardrail checked before any customer-facing send",
      "Messages to high-value customers will always queue for human approval",
    ],
    summary:
      "Added a plan-wide rule: any message to a high-value customer requires human approval before sending, regardless of agent or workflow.",
    costDelta: { setup: 0, monthly: 0 },
    effect: {
      kind: "add_rule",
      rule: "No agent may contact a high-value customer automatically — every such message queues for human approval first.",
    },
  },
];
