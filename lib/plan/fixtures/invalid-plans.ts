/**
 * lib/plan/fixtures/invalid-plans.ts — one deliberately broken plan per
 * validator rule (docs/PLAN_CONTRACT.md §6, plus the structural rule 0).
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
 * A few cases below need a cast or a `delete`, and that is the point rather
 * than a shortcut: they model a plan arriving as JSON, where a field can be
 * misspelled or simply absent. Typed source cannot express those states, which
 * is exactly why they went unnoticed until they reached the runtime.
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
  OperatingMode,
  StepSpec,
  ToolGrant,
  WorkflowSpec,
} from "../types";

const OWNER = "user_sarah_chen";
const AGENT_ID = "finance-followup";
const WORKFLOW_ID = "wf-overdue-sweep";

/**
 * The base plan's owning organization. Named like `planId` above so it reads as
 * test data at a glance: `organizationId` decides whose connected accounts a
 * plan's agents act through, and a fixture value that looked like a real one
 * would be the wrong thing to copy out of this file.
 */
const ORGANIZATION_ID = "org-validator-fixture";

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
    organizationId: ORGANIZATION_ID,
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

/**
 * Rule 0 — a plan with nothing in it.
 *
 * Every rule in the validator is a loop over a collection, so an empty plan
 * satisfies all sixteen vacuously and used to return `[]`. Worse than merely
 * useless: the build gate derives readiness from packages-per-agent, so a plan
 * with no agents has no missing packages and would reach Activation reporting
 * ready — a fully activated workforce with nobody in it.
 *
 * Both collections are emptied together on purpose. Clearing only `agents`
 * would leave the outcome pointing at an agent that is no longer there and trip
 * rule 13 as well, which is the sort of double-fault this file avoids.
 */
export const EMPTY_PLAN: ApprovedPlan = basePlan({
  agents: [],
  businessOutcomes: [],
});

/**
 * Rule 0 — the plan does not say which business it belongs to.
 *
 * `organizationId` is what resolves credentials: it decides whose Gmail the
 * `act` step below actually sends from. A plan that reaches the runtime without
 * one has exactly two possible behaviours, and both are defects — refuse every
 * tool call, or act through whichever organization the process was configured
 * with, which is another customer's connected accounts.
 *
 * Blank rather than deleted, because blank is the shape the ingest adapter
 * produces: it records a blocking gap and leaves the field empty, the same way
 * MISSING_APPROVAL_OWNER models an owner that would not resolve. The gate has to
 * catch the empty string, not just the absent key.
 */
export const MISSING_ORGANIZATION_ID: ApprovedPlan = basePlan({
  organizationId: "",
});

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

/**
 * Rule 2 — one character wrong in the operating mode.
 *
 * The sharpest case in this file. The cast is deliberate: TypeScript will not
 * let a typo through inside the repo, but a plan crosses the seam as JSON, and
 * on the other side of that seam "draft_onlyy" is just a string. It used to
 * pass the gate completely clean — the mode is not `auto_within_limits`, so the
 * empty-limits test below skipped it too — and then the runtime read step 6 as
 * a fall-through and let a draft-only agent send email unattended.
 */
export const MISSPELLED_OPERATING_MODE: ApprovedPlan = basePlan({
  agents: [
    baseAgent({
      policy: basePolicy({
        operatingMode: "draft_onlyy" as OperatingMode,
        // Empty, as a draft-only agent's limits legitimately are. Nothing but
        // the membership check stands between this plan and an unattended send.
        limits: [],
      }),
    }),
  ],
});

/**
 * Rule 2 — the field is not misspelled, it is absent.
 *
 * The likelier of the two failures: a truncated hand-off or a renamed field
 * drops the key entirely. Deleted rather than set to `undefined`, because that
 * is the shape `JSON.parse` produces and the shape a membership test has to
 * catch.
 */
function policyWithoutOperatingMode(): AgentPolicy {
  const policy = basePolicy();
  delete (policy as Partial<AgentPolicy>).operatingMode;
  return policy;
}

export const MISSING_OPERATING_MODE: ApprovedPlan = basePlan({
  agents: [baseAgent({ policy: policyWithoutOperatingMode() })],
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

/**
 * Rule 8, the other half — a well-formed owner id that resolves to nobody.
 *
 * This is the failure the presence check could never see, and the more
 * dangerous of the two because nothing downstream looks wrong: the agent pauses
 * as designed, the approval is created as designed, and it sits in an inbox
 * that belongs to no one. Catching it needs the user directory
 * (lib/plan/users.ts), which is why the fixture and the registry landed
 * together — before it existed there was no way to express "unknown user".
 */
export const UNKNOWN_APPROVAL_OWNER: ApprovedPlan = basePlan({
  agents: [baseAgent({ policy: basePolicy({ approvalOwner: "user_not_in_directory" }) })],
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
    name: "plan contains no agents",
    expectedRule: 0,
    plan: EMPTY_PLAN,
  },
  {
    name: "plan names no owning organization",
    expectedRule: 0,
    plan: MISSING_ORGANIZATION_ID,
  },
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
    name: "operatingMode is misspelled",
    expectedRule: 2,
    plan: MISSPELLED_OPERATING_MODE,
  },
  {
    name: "operatingMode is absent",
    expectedRule: 2,
    plan: MISSING_OPERATING_MODE,
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
    name: "agent declares an empty approvalOwner",
    expectedRule: 8,
    plan: MISSING_APPROVAL_OWNER,
  },
  {
    name: "approvalOwner is well-formed but resolves to nobody",
    expectedRule: 8,
    plan: UNKNOWN_APPROVAL_OWNER,
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
