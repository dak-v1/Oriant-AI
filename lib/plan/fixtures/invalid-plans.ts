/**
 * lib/plan/fixtures/invalid-plans.ts — one deliberately broken plan per
 * validator rule (docs/PLAN_CONTRACT.md §6).
 *
 * The validator is the entire integration risk between the two lanes reduced
 * to one green/red check, so it needs negative tests as much as it needs
 * `BRIGHTPATH_PLAN` returning `[]`. A rule nobody ever saw fire is a rule
 * nobody knows works.
 *
 * The discipline here is one defect per plan. Every case starts from the same
 * minimal valid base (one agent, one outcome, one workflow, three steps) and
 * changes exactly one thing, so a failing test names the rule directly instead
 * of pointing at a plan that is wrong in four ways at once. Where a naive
 * mutation would trip a second rule, the case is arranged to avoid it: the
 * missing-agent outcome still lists the real agent, and the unbacked
 * capability points at an operation nothing forbids.
 *
 * The base is built by factories rather than cloned, so no case can leak a
 * mutation into another. All operation strings come from lib/plan/operations.ts.
 */

import type {
  AgentPolicy,
  AgentSpec,
  ApprovedPlan,
  BusinessOutcome,
  Capability,
  StepSpec,
  ToolGrant,
  WorkflowSpec,
} from "../types";

const OWNER = "user_sarah_chen";
const AGENT_ID = "finance-followup";
const WORKFLOW_ID = "wf-overdue-sweep";

/* ═══════════════════════ The minimal valid base ═══════════════════════ */

const FETCH_INVOICES: StepSpec = {
  id: "s1",
  kind: "fetch",
  instruction: "List every invoice past its due date.",
  tool: { integrationId: "hubspot", operation: "hubspot.invoices.list" },
};

const DECIDE_WHO_TO_CHASE: StepSpec = {
  id: "s2",
  kind: "reason",
  instruction: "Decide which invoices to chase and draft a reminder for each.",
};

const SEND_REMINDER: StepSpec = {
  id: "s3",
  kind: "act",
  instruction: "Send the reminder to the customer.",
  tool: { integrationId: "gmail", operation: "gmail.messages.send" },
  risk: "medium",
};

function baseTools(): ToolGrant[] {
  return [
    {
      integrationId: "hubspot",
      operations: ["hubspot.invoices.list"],
      purpose: "Find overdue invoices",
      required: true,
    },
    {
      integrationId: "gmail",
      operations: ["gmail.messages.send"],
      purpose: "Send payment reminders",
      required: true,
    },
  ];
}

function baseCapabilities(): Capability[] {
  return [
    {
      id: "read_invoices",
      name: "Read invoices",
      description: "Look up overdue invoices and their due dates.",
      backedBy: ["hubspot.invoices.list"],
    },
  ];
}

function basePolicy(over: Partial<AgentPolicy> = {}): AgentPolicy {
  return {
    operatingMode: "auto_within_limits",
    limits: [
      {
        id: "invoice-amount",
        metric: "invoice.amount",
        op: "<=",
        value: 500,
        unit: "SGD",
        onBreach: "require_approval",
      },
    ],
    alwaysApprove: [],
    forbidden: [],
    approvalOwner: OWNER,
    escalateAfterMins: 240,
    quietHours: { start: "18:00", end: "09:00", timezone: "Asia/Singapore" },
    maxRunsPerDay: 3,
    ...over,
  };
}

function baseWorkflow(over: Partial<WorkflowSpec> = {}): WorkflowSpec {
  return {
    id: WORKFLOW_ID,
    name: "Weekly overdue-invoice sweep",
    description: "Every Friday morning, chase invoices past their due date.",
    enabled: true,
    trigger: {
      kind: "schedule",
      label: "Every Friday at 9:00am",
      cron: "0 9 * * 5",
      timezone: "Asia/Singapore",
    },
    steps: [FETCH_INVOICES, DECIDE_WHO_TO_CHASE, SEND_REMINDER],
    output: {
      kind: "message",
      successCriteria: "Every selected overdue invoice has exactly one reminder.",
    },
    onFailure: { retries: 2, backoffSeconds: 60, onExhausted: "notify_owner" },
    ...over,
  };
}

function baseAgent(over: Partial<AgentSpec> = {}): AgentSpec {
  return {
    id: AGENT_ID,
    version: 1,
    name: "Finance Follow-up Agent",
    role: "Chases overdue invoices",
    capabilities: baseCapabilities(),
    workflows: [baseWorkflow()],
    tools: baseTools(),
    policy: basePolicy(),
    guidance: {
      objective: "Reduce time to payment without damaging the relationship.",
      businessContext: "BrightPath Home Services, Singapore. 18 staff.",
    },
    ...over,
  };
}

function baseOutcome(over: Partial<BusinessOutcome> = {}): BusinessOutcome {
  return {
    id: "outcome-faster-collections",
    name: "Faster follow-up on overdue invoices",
    priority: "high",
    owner: OWNER,
    metrics: [
      {
        id: "dso",
        label: "Average days to payment",
        metric: "invoice.days_to_payment",
        direction: "decrease",
        baseline: 34,
        target: 21,
        unit: "days",
      },
    ],
    agentIds: [AGENT_ID],
    ...over,
  };
}

function basePlan(over: Partial<ApprovedPlan> = {}): ApprovedPlan {
  return {
    planId: "plan-invalid-fixture",
    version: 1,
    approvedAt: "2026-07-24T09:30:00+08:00",
    approvedBy: OWNER,
    reportVersion: 2,
    businessOutcomes: [baseOutcome()],
    agents: [baseAgent()],
    globalPolicy: { quietHours: null, forbidden: [] },
    ...over,
  };
}

/**
 * The base itself, exported so a test can assert it returns `[]` first. If
 * this ever fails, every case below is measuring the wrong thing.
 */
export const VALID_BASE_PLAN: ApprovedPlan = basePlan();

/* ═══════════════════════════ The broken cases ═══════════════════════════ */

/** Rule 1 — the act step calls an operation the agent was never granted. */
export const STEP_OPERATION_NOT_GRANTED: ApprovedPlan = basePlan({
  agents: [
    baseAgent({
      workflows: [
        baseWorkflow({
          steps: [
            FETCH_INVOICES,
            DECIDE_WHO_TO_CHASE,
            {
              id: "s3",
              kind: "act",
              instruction: "Add a note to the customer record.",
              // Real operation, but no hubspot grant covers it.
              tool: { integrationId: "hubspot", operation: "hubspot.notes.create" },
              risk: "low",
            },
          ],
        }),
      ],
    }),
  ],
});

/** Rule 2 — `auto_within_limits` with nothing to bound it. */
export const AUTO_MODE_WITHOUT_LIMITS: ApprovedPlan = basePlan({
  agents: [baseAgent({ policy: basePolicy({ limits: [] }) })],
});

/** Rule 3 — the same operation is both granted and denied. */
export const GRANTED_AND_FORBIDDEN: ApprovedPlan = basePlan({
  agents: [
    baseAgent({
      tools: [
        {
          integrationId: "hubspot",
          operations: ["hubspot.invoices.list", "hubspot.invoices.write_off"],
          purpose: "Find overdue invoices and clear dead balances",
          required: true,
        },
        {
          integrationId: "gmail",
          operations: ["gmail.messages.send"],
          purpose: "Send payment reminders",
          required: true,
        },
      ],
      policy: basePolicy({ forbidden: ["hubspot.invoices.write_off"] }),
    }),
  ],
});

/** Rule 4 — a schedule trigger the scheduler cannot parse. */
export const UNPARSEABLE_CRON: ApprovedPlan = basePlan({
  agents: [
    baseAgent({
      workflows: [
        baseWorkflow({
          trigger: {
            kind: "schedule",
            label: "Every Friday at 9:00am",
            cron: "every friday",
            timezone: "Asia/Singapore",
          },
        }),
      ],
    }),
  ],
});

/** Rule 5 — a dependency trigger pointing at a workflow that does not exist. */
export const DANGLING_DEPENDENCY: ApprovedPlan = basePlan({
  agents: [
    baseAgent({
      workflows: [
        baseWorkflow({
          trigger: {
            kind: "dependency",
            label: "After the Friday sweep",
            afterWorkflowId: "wf-does-not-exist",
          },
        }),
      ],
    }),
  ],
});

/** Rule 6 — an act step with no tool, so nothing can be gated. */
export const ACT_STEP_WITHOUT_TOOL: ApprovedPlan = basePlan({
  agents: [
    baseAgent({
      workflows: [
        baseWorkflow({
          steps: [
            FETCH_INVOICES,
            DECIDE_WHO_TO_CHASE,
            {
              id: "s3",
              kind: "act",
              instruction: "Send the reminder to the customer.",
              risk: "medium",
            },
          ],
        }),
      ],
    }),
  ],
});

/**
 * Rule 7 — a fetch step pointing at a write operation. This is the one that
 * matters most: fetch is the ungated path, so a side effect hiding behind it
 * would never meet the policy resolver at all.
 */
export const FETCH_STEP_WRITES: ApprovedPlan = basePlan({
  agents: [
    baseAgent({
      workflows: [
        baseWorkflow({
          steps: [
            {
              id: "s1",
              kind: "fetch",
              instruction: "Collect the reminders that went out.",
              // Granted, so rule 1 stays quiet; it is simply not read-only.
              tool: { integrationId: "gmail", operation: "gmail.messages.send" },
            },
            DECIDE_WHO_TO_CHASE,
            SEND_REMINDER,
          ],
        }),
      ],
    }),
  ],
});

/**
 * Rule 8 — no approvalOwner, so a pending approval would have nobody to go to.
 * The agent still runs in auto_within_limits with a live `act` step, which is
 * exactly when an unowned approval becomes unreachable work.
 */
export const MISSING_APPROVAL_OWNER: ApprovedPlan = basePlan({
  agents: [baseAgent({ policy: basePolicy({ approvalOwner: "" }) })],
});

/** Rule 9 — two workflows sharing an id inside one agent. */
export const DUPLICATE_WORKFLOW_ID: ApprovedPlan = basePlan({
  agents: [baseAgent({ workflows: [baseWorkflow(), baseWorkflow()] })],
});

/** Rule 10 — an enabled workflow with nothing to run. */
export const ENABLED_WORKFLOW_WITHOUT_STEPS: ApprovedPlan = basePlan({
  agents: [baseAgent({ workflows: [baseWorkflow({ steps: [] })] })],
});

/** Rule 11 (warning) — the agent's only workflow is switched off. */
export const AGENT_WITHOUT_ENABLED_WORKFLOWS: ApprovedPlan = basePlan({
  agents: [baseAgent({ workflows: [baseWorkflow({ enabled: false })] })],
});

/** Rule 12 (warning) — a required grant for an integration nothing knows about. */
export const UNKNOWN_REQUIRED_INTEGRATION: ApprovedPlan = basePlan({
  agents: [
    baseAgent({
      tools: [
        ...baseTools(),
        {
          integrationId: "sap-erp",
          operations: [],
          purpose: "Post journals to the accounting system",
          required: true,
        },
      ],
    }),
  ],
});

/**
 * Rule 13 — an outcome naming an agent the plan does not contain. The real
 * agent stays in the list so rule 15 has nothing to say.
 */
export const OUTCOME_REFERENCES_MISSING_AGENT: ApprovedPlan = basePlan({
  businessOutcomes: [baseOutcome({ agentIds: [AGENT_ID, "ghost-agent"] })],
});

/** Rule 14 — a capability claiming an operation the agent cannot call. */
export const CAPABILITY_NOT_BACKED: ApprovedPlan = basePlan({
  agents: [
    baseAgent({
      capabilities: [
        {
          id: "read_payment_history",
          name: "Read payment history",
          description: "Check what has actually been paid before chasing anything.",
          // A real operation, ungranted and unforbidden: only rule 14 fires.
          backedBy: ["quickbooks.payments.read"],
        },
      ],
    }),
  ],
});

/** Rule 15 (warning) — the agent is in the plan but no outcome claims it. */
export const AGENT_WITHOUT_OUTCOME: ApprovedPlan = basePlan({
  businessOutcomes: [baseOutcome({ agentIds: [] })],
});

/** Rule 16 (warning) — an outcome with nothing measurable attached. */
export const OUTCOME_WITHOUT_METRICS: ApprovedPlan = basePlan({
  businessOutcomes: [baseOutcome({ metrics: [] })],
});

/* ═══════════════════════════ The test table ═══════════════════════════ */

/**
 * `expectedRule` is the rule number a validation error must carry for the case
 * to count as caught. Tests assert presence of that rule, not the total error
 * count, so a validator that reports extra detail is not punished for it.
 */
export const INVALID_PLANS: {
  name: string;
  expectedRule: number;
  plan: ApprovedPlan;
}[] = [
  {
    name: "step calls an operation the agent was not granted",
    expectedRule: 1,
    plan: STEP_OPERATION_NOT_GRANTED,
  },
  {
    name: "auto_within_limits agent has no limits",
    expectedRule: 2,
    plan: AUTO_MODE_WITHOUT_LIMITS,
  },
  {
    name: "operation is both granted and forbidden",
    expectedRule: 3,
    plan: GRANTED_AND_FORBIDDEN,
  },
  {
    name: "schedule trigger has an unparseable cron",
    expectedRule: 4,
    plan: UNPARSEABLE_CRON,
  },
  {
    name: "dependency trigger points at a workflow that does not exist",
    expectedRule: 5,
    plan: DANGLING_DEPENDENCY,
  },
  {
    name: "act step declares no tool",
    expectedRule: 6,
    plan: ACT_STEP_WITHOUT_TOOL,
  },
  {
    name: "fetch step points at a write operation",
    expectedRule: 7,
    plan: FETCH_STEP_WRITES,
  },
  {
    name: "agent declares no approvalOwner",
    expectedRule: 8,
    plan: MISSING_APPROVAL_OWNER,
  },
  {
    name: "two workflows share an id",
    expectedRule: 9,
    plan: DUPLICATE_WORKFLOW_ID,
  },
  {
    name: "enabled workflow has no steps",
    expectedRule: 10,
    plan: ENABLED_WORKFLOW_WITHOUT_STEPS,
  },
  {
    name: "agent has no enabled workflows",
    expectedRule: 11,
    plan: AGENT_WITHOUT_ENABLED_WORKFLOWS,
  },
  {
    name: "required grant names an unknown integration",
    expectedRule: 12,
    plan: UNKNOWN_REQUIRED_INTEGRATION,
  },
  {
    name: "outcome references an agent that is not in the plan",
    expectedRule: 13,
    plan: OUTCOME_REFERENCES_MISSING_AGENT,
  },
  {
    name: "capability claims an operation the agent cannot call",
    expectedRule: 14,
    plan: CAPABILITY_NOT_BACKED,
  },
  {
    name: "agent is referenced by no outcome",
    expectedRule: 15,
    plan: AGENT_WITHOUT_OUTCOME,
  },
  {
    name: "outcome has no metrics",
    expectedRule: 16,
    plan: OUTCOME_WITHOUT_METRICS,
  },
];
