# The Plan Contract — v2

**The single handoff between Role B (Plan) and Role C (Build + Operate).**

| | |
| --- | --- |
| **Produced by** | D — Plan phase (`/app/planner`, `/app/integrations`) |
| **Consumed by** | P — Build + Operate (`/app/build`, `/app/sandbox`, `/app/deploy`, `/app/workspace/*`) |
| **Status** | Draft for review. Nothing downstream is built until this is agreed. |

When the owner approves a workforce plan, D emits one `ApprovedPlan` object.
That object is the *entire* interface between the two lanes. D never reads
Role C's runtime objects (runs, approvals, calendar events); Role C never
reads D's planner internals (fit scores, cost deltas, NL command history).

---

## 1. The principle

Agents are LLM-driven, so plain-language description is genuinely useful —
it becomes the agent's prompt. But description alone cannot be executed,
enforced, or measured. So every part of this contract has exactly one job:

> **Prose goes into the prompt — what the agent *tries* to do.**
> **Structure goes into the runtime — what the agent is *allowed* to do.**

A limit, permission, schedule, or target must **never** live only in prose.
An LLM cannot be trusted to enforce its own constraints; the runtime enforces
them outside the model. Where a field is shown to a human *and* acted on by
the runtime, it carries both: a structured value plus a `label` for display.

The same rule applies to measurement. `"reduce response time"` cannot render a
progress bar; `{ metric, baseline, target, unit }` can.

---

## 2. Hierarchy

The plan describes **why** (outcomes), **who** (agents), **what they can do**
(capabilities), and **how** (workflows) — in that order. The Planner starts
from business outcomes, not from agents.

```
ApprovedPlan
├── BusinessOutcome[]         why the plan exists; what success means
│     └── OutcomeMetric[]     measurable targets — Role C reports against these
├── AgentSpec[]               who does the work
│     ├── Capability[]        what this agent can do (semantic, grant-backed)
│     ├── WorkflowSpec[]      how it does it
│     │     ├── TriggerSpec   when it runs
│     │     ├── StepSpec[]    the executable sequence
│     │     ├── OutputSpec    what a successful run produces
│     │     └── FailurePolicy what happens when it breaks
│     ├── ToolGrant[]         what it may call
│     ├── AgentPolicy         what it may do without asking
│     └── guidance            prose → prompt
└── globalPolicy              org-wide constraints
```

---

## 3. Types

### 3.1 Root

```ts
export type Op = "<" | "<=" | ">" | ">=" | "==";
export type RiskLevel = "low" | "medium" | "high";
export type OperatingMode =
  | "draft_only"          // prepares work, never acts; always creates an approval
  | "act_after_approval"  // creates an approval, acts once approved
  | "auto_within_limits"; // acts directly; escalates only on limit breach

export interface ApprovedPlan {
  planId: string;
  /** Whose workforce this is: the business that owns the plan, and therefore
      whose connected accounts its agents act through. REQUIRED. */
  organizationId: string;
  /** Bumps on every approval. */
  version: number;
  approvedAt: string;   // ISO 8601
  approvedBy: string;   // user id
  /** Report version this plan was derived from — lets Role C detect
      that the plan is stale relative to a re-approved report. */
  reportVersion: number;
  /** The business goals this plan exists to move. Planned FIRST. */
  businessOutcomes: BusinessOutcome[];
  agents: AgentSpec[];
  /** Applies to every agent unless the agent is stricter. */
  globalPolicy: {
    quietHours: QuietHours | null;
    forbidden: string[];   // operation ids denied org-wide
  };
}
```

> **Why the plan carries its owner.** A workforce belongs to a business, and the
> runtime has to know which one before it can execute anything: OAuth connections
> are held per organization, so `organizationId` is what decides whose Gmail a
> send comes from. D already has the value — it is the `organization.id` on the
> handoff payload and the `organization_id` on the `role_c_handoffs` row — so
> putting it on the plan costs nothing and removes the alternative, which is one
> organization per deployment configured by hand (`ORIANT_ORGANIZATION_ID`). That
> alternative is a wrong answer the moment two customers share a server. The
> environment variable survives only as the owner of the built-in BrightPath
> fixture, which genuinely has none.
>
> It is required rather than optional, and blank counts as absent: an optional
> field is one an adapter can skip, and a plan with no resolvable organization
> must refuse to execute tools rather than fall back to somebody else's
> connections.

### 3.2 Business outcomes

The Planner decides outcomes first, then assigns agents to achieve them. This
keeps the product outcome-focused rather than agent-focused, and it gives
Role C's Workspace something concrete to report against.

```ts
export interface BusinessOutcome {
  id: string;
  name: string;                          // "Faster follow-up on overdue invoices"
  priority: "high" | "medium" | "low";
  owner: string;                         // user id
  metrics: OutcomeMetric[];
  /** Agents contributing to this outcome. This is the ONLY direction the
      relationship is stored — agents do not carry an outcome list. */
  agentIds: string[];
}

export interface OutcomeMetric {
  id: string;
  label: string;                         // "Average days to payment"
  metric: string;                        // "invoice.days_to_payment"
  direction: "decrease" | "increase";
  /** From the approved company report where known; null if not measured yet. */
  baseline: number | null;
  target: number;
  unit: string;                          // "days" | "percent" | "minutes" | "SGD"
}
```

> **Why structured metrics.** Role C's Workspace renders progress against these
> ("42 min → target 15 min"). A `string[]` of aspirations cannot be rendered,
> compared, or trended.

### 3.3 Agent

```ts
export interface AgentSpec {
  id: string;
  /** Bump on ANY change to this agent. Role C rebuilds only the agents
      whose version changed — not the whole plan. */
  version: number;
  name: string;
  role: string;            // one-line role, e.g. "Chases overdue invoices"

  capabilities: Capability[];
  workflows: WorkflowSpec[];
  tools: ToolGrant[];
  policy: AgentPolicy;

  /** Prose only. Shapes the system prompt. Never enforced, never parsed. */
  guidance: {
    objective: string;
    businessContext: string;
    tone?: string;
    examples?: string[];
  };
}
```

### 3.4 Capabilities

A semantic index of what an agent can do, so the command bar and future
orchestration can answer *"which agent can draft marketing emails?"* without
scanning every workflow.

```ts
export interface Capability {
  id: string;              // "draft_payment_reminder"
  name: string;
  description: string;
  /** MUST be a subset of this agent's granted operations (validator rule 14).
      This is what stops a capability claiming something the runtime refuses. */
  backedBy: string[];      // ["gmail.drafts.create"]
}
```

> **Why `backedBy` is mandatory.** Without it, capabilities become a second,
> hand-maintained source of truth about what an agent can do — one the UI
> trusts and the runtime ignores. An agent could advertise `draft_email` with
> no Gmail grant, and the refusal would only surface at run time. `backedBy`
> makes the claim checkable at handoff instead.

### 3.5 Workflow

```ts
export interface WorkflowSpec {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: TriggerSpec;
  steps: StepSpec[];
  output: OutputSpec;
  onFailure: FailurePolicy;
}
```

### 3.6 Trigger — machine-readable

`label` is for D's canvas; everything else is what the scheduler actually uses.

```ts
export type TriggerSpec =
  | { kind: "schedule";   label: string; cron: string; timezone: string }
  | { kind: "event";      label: string; integrationId: string; event: string;
                          filter?: Record<string, unknown> }
  | { kind: "threshold";  label: string; metric: string; op: Op; value: number }
  | { kind: "dependency"; label: string; afterWorkflowId: string }
  | { kind: "manual";     label: string };
```

### 3.7 Step — the critical piece

`kind` tells the runtime **what to do**; `instruction` tells the LLM **how**.
The four kinds map one-to-one onto Role C's runtime events.

```ts
export interface StepSpec {
  id: string;
  kind: "fetch" | "reason" | "act" | "approve";
  /** Plain-language instruction for this step; becomes part of the prompt. */
  instruction: string;
  /** Required for `fetch` and `act`. The runtime REJECTS any call whose
      operation is not granted in the agent's `tools`. */
  tool?: { integrationId: string; operation: string };
  /** `act` steps only. Baseline risk; policy may escalate it further. */
  risk?: RiskLevel;
}
```

| `kind` | Runtime behaviour | Emits |
| --- | --- | --- |
| `fetch` | Read-only tool call. Never needs approval. | `tool_call` |
| `reason` | LLM call — decide, draft, classify. No side effects. | `step` |
| `act` | Side-effecting tool call. Gated by `policy`. | `tool_call` or `needs_approval` |
| `approve` | Explicit checkpoint regardless of policy. | `needs_approval` |

### 3.8 Output & failure

```ts
export interface OutputSpec {
  kind: "draft" | "message" | "record_update" | "booking" | "report";
  /** Prose. Becomes the sandbox assertion for "did this run succeed?" */
  successCriteria: string;
}

export interface FailurePolicy {
  retries: number;
  backoffSeconds: number;
  onExhausted: "escalate" | "notify_owner" | "fail_silent";
}
```

### 3.9 Tools — grants with scopes

One field doing three jobs: D requests the right OAuth scopes, Role C's
Activation checklist knows what must be connected, and Role C's runtime
rejects undeclared calls.

```ts
export interface ToolGrant {
  integrationId: string;        // "gmail", "google_calendar", "hubspot"
  /** Whitelist of callable operations. Anything not listed is refused
      at runtime, even if the LLM tries it. */
  operations: string[];         // ["gmail.threads.read", "gmail.drafts.create"]
  purpose: string;              // prose, shown in D's integrations screen
  /** true  → missing connection BLOCKS activation
      false → agent degrades gracefully without it */
  required: boolean;
}
```

### 3.10 Policy — the enforcement layer

```ts
export interface QuietHours {
  start: string;      // "18:00"
  end: string;        // "09:00"
  timezone: string;   // "Asia/Singapore"
}

export interface PolicyLimit {
  id: string;
  metric: string;     // "invoice.amount", "emails.per_run", "discount.percent"
  op: Op;
  value: number;
  unit?: string;      // "SGD", "count", "percent"
  onBreach: "require_approval" | "block";
}

export interface AgentPolicy {
  operatingMode: OperatingMode;
  /** REQUIRED and non-empty when operatingMode is "auto_within_limits".
      Meaningless otherwise. */
  limits: PolicyLimit[];
  /** Operation ids that ALWAYS create an approval, whatever the mode. */
  alwaysApprove: string[];
  /** Hard denies. Refused outright — never escalated to a human. */
  forbidden: string[];
  approvalOwner: string;        // user id, not a display name
  /** Minutes before a pending approval is flagged overdue. */
  escalateAfterMins: number;
  quietHours: QuietHours | null;
  maxRunsPerDay: number | null;
}
```

**How the runtime resolves an `act` step** (this is the whole behavioural
contract, in order):

1. Operation in `policy.forbidden` or `globalPolicy.forbidden` → **refuse**, log, end run.
2. Operation not granted in `tools[].operations` → **refuse**, log, end run.
3. Operation in `policy.alwaysApprove` → **create approval**, pause.
4. `operatingMode === "draft_only"` → **create approval**, pause.
5. `operatingMode === "act_after_approval"` → **create approval**, pause.
6. `operatingMode === "auto_within_limits"` → evaluate `limits`:
   - all satisfied → **act immediately**
   - any breached with `onBreach: "require_approval"` → **create approval**, pause
   - any breached with `onBreach: "block"` → **refuse**, log, end run.

---

## 4. What does NOT cross the seam

### 4.1 D keeps these (planner UI concerns, no runtime meaning)

`fitScore`, `fitReason`, `setupCost`, `monthlyCost`, `customProposal`,
`designQuestions`, `PlanChange`, `NlCommandFixture`, free-text `planRules`,
`AgentDesignAnswers`.

**`coveredOutcomes` is removed from the agent.** The outcome → agent
relationship is stored once, on `BusinessOutcome.agentIds`. Storing it in both
directions guarantees they eventually disagree.

### 4.2 Role C owns runtime status

The current `AgentStatus` mixes both lanes and must be split:

```ts
// D — plan-time only, lives inside the planner
type PlanAgentStatus =
  | "recommended" | "needs_information"
  | "needs_configuration" | "ready_to_build";

// Role C — runtime only, never appears in ApprovedPlan
type AgentRuntimeState =
  | "building" | "validated" | "active" | "paused" | "failed";
```

An `ApprovedPlan` must never carry runtime status.

### 4.3 Role C owns runtime/infrastructure configuration

Concurrency, queue assignment, worker sizing and similar knobs are **not** in
the plan. They are operational decisions belonging to the lane that runs the
agents, and surfacing them in the Planner would put infrastructure controls in
front of a small-business owner — contrary to *"without technical expertise."*

```ts
// Role C's own domain, keyed by agent id. Never in ApprovedPlan.
interface AgentRuntimeConfig {
  agentId: string;
  concurrency: number;
  queue: string;
}
```

If the plan ever needs to hint at scale, it should do so as a business fact
(e.g. an `OutcomeMetric` for expected volume), never as an infra parameter.

---

## 5. Worked example

One outcome and one complete agent, so the shape is unambiguous. Matches the
BrightPath demo fixtures.

```ts
const fasterCollections: BusinessOutcome = {
  id: "outcome-faster-collections",
  name: "Faster follow-up on overdue invoices",
  priority: "high",
  owner: "user_sarah_chen",
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
    {
      id: "chase-rate",
      label: "Overdue invoices chased within 7 days",
      metric: "invoice.chased_within_7d_pct",
      direction: "increase",
      baseline: 40,
      target: 95,
      unit: "percent",
    },
  ],
  agentIds: ["finance-followup"],
};

const financeFollowUp: AgentSpec = {
  id: "finance-followup",
  version: 3,
  name: "Finance Follow-up Agent",
  role: "Chases overdue invoices and prepares payment reminders",

  guidance: {
    objective:
      "Reduce time-to-payment on overdue invoices without damaging customer " +
      "relationships. Prefer a polite reminder over an aggressive one.",
    businessContext:
      "BrightPath Home Services, Singapore. 18 staff, ~650 requests/month. " +
      "Most customers are on recurring maintenance plans and pay on terms.",
    tone: "Warm, direct, never threatening. Always offer a way to query the bill.",
    examples: [
      "A 5-day-late $95 invoice from a 6-year customer → gentle nudge, no escalation.",
    ],
  },

  capabilities: [
    {
      id: "read_invoices",
      name: "Read invoices",
      description: "Look up overdue invoices, amounts and due dates.",
      backedBy: ["hubspot.invoices.list"],
    },
    {
      id: "draft_payment_reminder",
      name: "Draft payment reminder",
      description: "Compose a reminder email for an overdue invoice.",
      backedBy: ["gmail.drafts.create"],
    },
    {
      id: "send_payment_reminder",
      name: "Send payment reminder",
      description: "Send an approved reminder to the customer.",
      backedBy: ["gmail.messages.send"],
    },
  ],

  tools: [
    {
      integrationId: "hubspot",
      operations: ["hubspot.invoices.list", "hubspot.contacts.read"],
      purpose: "Find overdue invoices and the customer's history",
      required: true,
    },
    {
      integrationId: "gmail",
      operations: ["gmail.drafts.create", "gmail.messages.send"],
      purpose: "Prepare and send payment reminders",
      required: true,
    },
  ],

  policy: {
    operatingMode: "auto_within_limits",
    limits: [
      { id: "amt",   metric: "invoice.amount", op: "<=", value: 500,
        unit: "SGD",   onBreach: "require_approval" },
      { id: "batch", metric: "emails.per_run", op: "<=", value: 20,
        unit: "count", onBreach: "require_approval" },
    ],
    alwaysApprove: ["hubspot.invoices.write_off"],
    forbidden: ["hubspot.refunds.issue"],
    approvalOwner: "user_sarah_chen",
    escalateAfterMins: 240,
    quietHours: { start: "18:00", end: "09:00", timezone: "Asia/Singapore" },
    maxRunsPerDay: 3,
  },

  workflows: [
    {
      id: "overdue-sweep",
      name: "Weekly overdue-invoice sweep",
      description: "Every Friday morning, chase invoices past their due date.",
      enabled: true,
      trigger: {
        kind: "schedule",
        label: "Every Friday at 9:00am",
        cron: "0 9 * * 5",
        timezone: "Asia/Singapore",
      },
      steps: [
        {
          id: "s1",
          kind: "fetch",
          instruction: "List all invoices more than 3 days past due.",
          tool: { integrationId: "hubspot", operation: "hubspot.invoices.list" },
        },
        {
          id: "s2",
          kind: "fetch",
          instruction: "Load each customer's plan value and payment history.",
          tool: { integrationId: "hubspot", operation: "hubspot.contacts.read" },
        },
        {
          id: "s3",
          kind: "reason",
          instruction:
            "Decide which invoices to chase this week and draft a reminder " +
            "for each. Soften the tone for long-standing customers. Skip " +
            "anyone already chased in the last 7 days.",
        },
        {
          id: "s4",
          kind: "act",
          instruction: "Send the approved reminder to the customer.",
          tool: { integrationId: "gmail", operation: "gmail.messages.send" },
          risk: "medium",
        },
      ],
      output: {
        kind: "message",
        successCriteria:
          "Every selected overdue invoice has exactly one reminder sent or " +
          "queued for approval, and no customer received more than one email.",
      },
      onFailure: { retries: 2, backoffSeconds: 60, onExhausted: "notify_owner" },
    },
  ],
};
```

**What the runtime does with it:** a \$95 invoice in a batch of 12 satisfies
both limits → sends immediately. A \$1,200 invoice breaches `amt` → pauses and
creates an approval for Sarah. A write-off is in `alwaysApprove` → always
pauses. A refund is `forbidden` → refused outright, even if the model asks.

**What the Workspace shows:** progress on *Faster follow-up on overdue
invoices* — days-to-payment trending 34 → 21, chase rate 40% → 95% — attributed
to the one agent listed in `agentIds`.

---

## 6. The validator

D runs this before handing anything over. It is the entire integration risk,
reduced to one green/red check.

```ts
export interface PlanValidationError {
  severity: "error" | "warning";
  agentId?: string;
  workflowId?: string;
  stepId?: string;
  outcomeId?: string;
  message: string;
}

/** Returns [] when the plan is safe to build. Any "error" blocks handoff. */
export function validateApprovedPlan(plan: ApprovedPlan): PlanValidationError[];
```

| # | Rule | Severity |
| --- | --- | --- |
| 1 | Every `step.tool.operation` is granted in that agent's `tools[].operations` | error |
| 2 | `operatingMode: "auto_within_limits"` has at least one `PolicyLimit` | error |
| 3 | No operation appears in both a `ToolGrant` and `forbidden` | error |
| 4 | Every `schedule` trigger has a parseable cron and a valid IANA timezone | error |
| 5 | Every `dependency` trigger points at a workflow that exists and is enabled | error |
| 6 | Every `act` step declares a `tool` | error |
| 7 | Every `fetch` step's operation is read-only per the integration registry | error |
| 8 | `approvalOwner` resolves to a real user | error |
| 9 | Agent ids, workflow ids, outcome ids and capability ids are unique in scope | error |
| 10 | Every enabled workflow has ≥1 step and exactly one `output` | error |
| 11 | An agent with no enabled workflows | warning |
| 12 | A `required: true` tool grant with no matching integration in the registry | warning |
| 13 | Every `outcome.agentIds` entry references an agent in the plan | error |
| 14 | Every `capability.backedBy` operation is granted in that agent's `tools` | error |
| 15 | Every agent is referenced by at least one outcome | warning |
| 16 | Every outcome has ≥1 metric with a numeric `target` | warning |

---

## 7. Migration

This is **additive** — no existing planner field is removed except
`coveredOutcomes`, which is superseded by `BusinessOutcome.agentIds`. D is not
blocked rewriting screens.

1. The structured types live in **`lib/plan/types.ts`**, and both lanes import
   them from there. `lib/plan` may not import from `lib/mock` or `lib/runtime`:
   the contract is the boundary, so each side depends on it rather than on the
   other. **Depends on D** — the planner side of that import does not exist
   yet, and adding it is D's step, not Role C's.
2. D's planner keeps its prose shapes in `lib/mock/types.ts` for the canvas and
   **additionally** emits an `ApprovedPlan` imported from `lib/plan/types`. It
   is a new root object handed across the seam, not a field bolted onto an
   existing planner type. **Depends on D.**
3. Role C's Agent Factory reads only the structured fields.
4. Once Role C consumes the real plan, retire any prose field that no longer
   appears in a rendered screen.

The canonical `ApprovedPlan` is **`lib/plan/fixtures/brightpath.ts`** — the four
BrightPath agents and the outcomes they serve, chosen for runtime path coverage
rather than looks. That fixture is Role C's entire input until D's real planner
lands.

> **Do not rewrite `lib/mock/fixtures/workflow-plan.ts`.** An earlier draft of
> this section named it as the fixture to convert; that instruction is
> superseded. Its `INITIAL_PLAN_AGENTS`, `PLANNER_STAGES`, `DISCOVERY_STAGES`
> and `NL_COMMANDS` exports are consumed by `lib/mock/store.ts`,
> `components/mock/planner/{PlannerExperience,CommandBar,planner-utils}` and
> `components/mock/discovery/CompileOverlay.tsx`. `lib/mock/*` is the separate
> scripted demo lane and stays that way — the two lanes share the contract
> types, not fixtures.

The operation vocabulary lives in **`lib/plan/operations.ts`**, Role C-maintained
until §8 Q2 is answered. Every operation string in a plan must come from that
registry, and rule 7's read-only check is evaluated against it.

---

## 8. Open questions for D

1. **Who authors the structured steps?** Expectation is the LLM plan-generator
   emits `StepSpec[]`, and the agent-config screen lets the owner adjust
   triggers, limits and approval rules. This is the one place the contract adds
   real work on D's side — confirm it is feasible.
2. **Where does the operation vocabulary live?** `"gmail.drafts.create"` must
   come from a shared registry both lanes import, not free-typed strings.
   Proposal: D owns it next to the integration registry; Role C imports it.
   *Interim answer in code:* `lib/plan/operations.ts`, Role C-maintained, ready
   for D to import today and to take over whenever the registry moves.
3. **`getToolClient(integrationId)` / `getIntegrationStatus(integrationId)`** —
   the two functions Role C calls into D's integration layer. Signatures needed
   before Role C's tool-mediation layer is built.
4. **Metric vocabulary** — `"invoice.amount"`, `"invoice.days_to_payment"`.
   Fixed enum or open string? Fixed is safer and makes Workspace reporting
   trivial; open is more flexible for custom agents. Recommend: fixed set for
   `OutcomeMetric.metric`, open for `PolicyLimit.metric`.
5. **Where do outcome baselines come from?** Ideally the approved company
   report supplies them (YJ's lane). If not available, `baseline: null` and
   Role C measures from activation onward.

---

## 9. Changes from v1

| Change | Reason |
| --- | --- |
| Added `businessOutcomes` to `ApprovedPlan` | Plan describes *why* before *who*; gives Workspace something to report against |
| Added `OutcomeMetric` (structured, not `string[]`) | Prose targets cannot be rendered, compared or trended |
| Added `capabilities` to `AgentSpec` | Command-bar routing without scanning every workflow |
| `Capability.backedBy` is mandatory | Prevents a second source of truth about what an agent can do |
| Removed `coveredOutcomes` from the agent | Relationship stored once, on the outcome |
| Explicitly excluded runtime/infra config (§4.3) | Wrong owner — belongs to the lane that runs agents |
| Validator rules 13–16 | Cover the new structures |

---

## 10. Sign-off

| Role | Owner | Agreed |
| --- | --- | --- |
| Plan (producer) | D | ☐ |
| Build + Operate (consumer) | P | ☐ |
| Discovery (upstream, FYI) | YJ | ☐ |

Once both producer and consumer sign, this file is the source of truth.
Changes to it are a pull request that both sides review.
