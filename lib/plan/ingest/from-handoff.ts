/**
 * lib/plan/ingest/from-handoff.ts — Role B's handoff becomes an ApprovedPlan.
 *
 * This is the seam the two lanes actually meet at, and it is written on one
 * principle: WHERE ROLE B IS SILENT, ASSUME THE SAFE THING AND RECORD THE
 * ASSUMPTION. Never the plausible thing, never the capable thing.
 *
 * The four decisions that matter, and why each is the safe direction:
 *
 *  1. EVERY AGENT IS `draft_only`. Role B ships no `operatingMode`, no limits
 *     and no approval boundaries; their own handoff note says the discovery
 *     interview captures them but nothing wires them through. `draft_only` is
 *     the only mode that is correct under ignorance, because it is the only one
 *     where being wrong costs a delay rather than a customer. The alternative —
 *     inferring `auto_within_limits` from an agent's name or its tools — would
 *     let an agent send, book or write off unattended on the strength of a
 *     guess.
 *
 *  2. WRITE OPERATIONS ARE GRANTED BUT NEVER UNATTENDED. A granted write is
 *     what makes the agent useful; `draft_only` is what makes it safe. The
 *     runtime pauses on every act, so the owner sees each one before it
 *     happens. Withholding the grants instead would produce agents that refuse
 *     their own workflow, which reads as broken rather than cautious.
 *
 *  3. TRIGGERS ARE `manual`. Role B's trigger is a sentence — "A new content
 *     draft is uploaded to the shared Google Drive marketing folder." Turning
 *     that into a cron would be inventing a schedule nobody chose, and a wrong
 *     schedule fires real work at the wrong time. Manual is honest: it runs
 *     when somebody asks, and the sentence survives in `guidance` so the
 *     scheduler can be configured later against what was actually meant.
 *
 *  4. HIGH-RISK OPERATIONS ARE FORBIDDEN OUTRIGHT. Refunds and publishing are
 *     denied at plan level, not merely gated. `draft_only` already stops them,
 *     so this is defence in depth against the day somebody relaxes the mode
 *     without revisiting the grants.
 *
 * Nothing here parses prose into behaviour. `spec.forbidden` says "never issue
 * a refund"; the deny that enforces it comes from the operation registry, and
 * the sentence goes into the prompt. A guardrail derived from a regex over
 * English is a guardrail that fails silently on the sentence nobody tested.
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
import { getOperation, isReadOnly, operationsFor } from "../operations";
import { USERS, isKnownUser } from "../users";
import type {
  CustomAgentSpec,
  IngestGap,
  IngestResult,
  WorkforceHandoffPayload,
} from "./types";

/**
 * Denied at plan level regardless of mode. Money leaving the business and
 * anything published to the public are the two actions whose consequences a
 * later mode change must not silently unlock.
 */
const ALWAYS_FORBIDDEN = ["hubspot.refunds.issue", "mailchimp.campaigns.publish"];

/** Writes that stay owner-only even if an agent is later moved off draft_only. */
const ALWAYS_APPROVE = [
  "hubspot.invoices.write_off",
  "google-calendar.events.update",
  "gmail.messages.send",
  "whatsapp-business.messages.send",
];

/* ═══════════════════════════ Helpers ═══════════════════════════ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** `marketing_content_approval_agent` → `marketing-content-approval-agent`. */
function toAgentId(agentKey: string): string {
  return agentKey.trim().toLowerCase().replace(/[_\s]+/g, "-").replace(/[^a-z0-9-]/g, "");
}

/**
 * Role B carries an approval owner as a DISPLAY NAME ("Sarah Tan"); the
 * contract requires a stable user id, because a display name is not an
 * identity and two people can share one. Matched case-insensitively against
 * the known users, and reported as a gap when it does not resolve rather than
 * being invented.
 */
function resolveApprovalOwner(displayName: string | undefined): string | null {
  if (!displayName) return null;
  const wanted = displayName.trim().toLowerCase();
  const hit = USERS.find((u) => u.name.toLowerCase() === wanted);
  return hit ? hit.id : null;
}

function customSpecOf(config: Record<string, unknown>): CustomAgentSpec {
  return isRecord(config.spec) ? (config.spec as CustomAgentSpec) : {};
}

/* ═══════════════════════════ Tools ═══════════════════════════ */

/**
 * `required_tools: ["gmail"]` becomes every operation the registry knows for
 * gmail. Role B scopes at the TOOL level (`scope: read_write` in a template);
 * the contract scopes at the OPERATION level, and there is no information in
 * the payload to narrow it further.
 *
 * Granting the whole tool is therefore the honest reading of what Role B said,
 * and it is safe only because `draft_only` gates every write. Both halves are
 * load-bearing: narrow the grants and the agent cannot do its job, relax the
 * mode without narrowing the grants and it can do anything the tool can.
 */
function grantsFor(
  requiredTools: string[],
  agentId: string,
  gaps: IngestGap[],
): ToolGrant[] {
  const grants: ToolGrant[] = [];

  for (const toolKey of requiredTools) {
    const operations = operationsFor(toolKey)
      .map((o) => o.id)
      .filter((id) => !ALWAYS_FORBIDDEN.includes(id));

    if (operations.length === 0) {
      gaps.push({
        code: "unknown_tool",
        severity: "degraded",
        agentId,
        message: `The plan requires "${toolKey}", which this runtime has no operations for, so the agent cannot use it.`,
        resolution: `Add "${toolKey}" operations to lib/plan/operations.ts, or remove the tool from the agent in Role B's planner.`,
      });
      continue;
    }

    grants.push({
      integrationId: toolKey,
      operations,
      purpose: `Granted from the handoff's required_tools for ${toolKey}.`,
      required: true,
    });
  }

  return grants;
}

function capabilitiesFrom(grants: ToolGrant[]): Capability[] {
  return grants.map((grant) => ({
    id: `use_${grant.integrationId.replace(/-/g, "_")}`,
    name: `Use ${grant.integrationId}`,
    description: `Read from and prepare work in ${grant.integrationId}.`,
    // Backed by exactly what was granted, so validator rule 14 holds by
    // construction rather than by hope.
    backedBy: [...grant.operations],
  }));
}

/* ═══════════════════════════ Steps ═══════════════════════════ */

/**
 * Role B ships no steps. Preset behaviour lives in `template_files` inside
 * their database and never crosses the seam; custom behaviour is prose.
 *
 * So a workflow is synthesised in the shape every one of these agents actually
 * has: gather what you need, decide, then do one thing. Reads become `fetch`
 * steps, the decision becomes `reason`, and the single most consequential write
 * becomes `act`. That last choice matters — emitting an `act` per write would
 * ask the owner to approve the same job three times.
 */
function stepsFor(
  grants: ToolGrant[],
  spec: CustomAgentSpec,
  agentId: string,
  gaps: IngestGap[],
): StepSpec[] {
  const steps: StepSpec[] = [];

  const reads = grants.flatMap((g) => g.operations.filter(isReadOnly));
  const writes = grants.flatMap((g) => g.operations.filter((op) => !isReadOnly(op)));

  reads.forEach((operation, index) => {
    const def = getOperation(operation);
    steps.push({
      id: `fetch-${index + 1}`,
      kind: "fetch",
      instruction: def?.description ?? `Read ${operation}.`,
      tool: { integrationId: def?.integrationId ?? operation.split(".")[0] ?? "", operation },
    });
  });

  steps.push({
    id: "decide",
    kind: "reason",
    instruction:
      spec.rules ??
      spec.objective ??
      "Decide what to do with what you have gathered, and prepare it for review.",
  });

  const primaryWrite = writes[0];
  if (primaryWrite) {
    const def = getOperation(primaryWrite);
    steps.push({
      id: "act",
      kind: "act",
      instruction: spec.success ?? def?.description ?? `Perform ${primaryWrite}.`,
      tool: {
        integrationId: def?.integrationId ?? primaryWrite.split(".")[0] ?? "",
        operation: primaryWrite,
      },
      risk: def?.baselineRisk ?? "medium",
    });
  } else {
    // No write at all means the agent can only look. Better to say so than to
    // ship a workflow whose last step does nothing.
    gaps.push({
      code: "steps_synthesised",
      severity: "degraded",
      agentId,
      message:
        "None of this agent's tools can perform an action, so it can gather and summarise but never do anything.",
      resolution:
        "Give the agent a tool with a write operation in Role B's planner, or accept it as a read-only reporter.",
    });
  }

  return steps;
}

/* ═══════════════════════════ One agent ═══════════════════════════ */

function agentFrom(
  source: WorkforceHandoffPayload["agents"][number],
  planVersion: number,
  gaps: IngestGap[],
): AgentSpec {
  const agentId = toAgentId(source.agent_key);
  const spec = customSpecOf(source.config);
  const grants = grantsFor(source.required_tools, agentId, gaps);
  const steps = stepsFor(grants, spec, agentId, gaps);

  const granted = new Set(grants.flatMap((g) => g.operations));
  const ownerDisplay = asString(source.config.approvalOwner);
  const resolvedOwner = resolveApprovalOwner(ownerDisplay);

  if (!resolvedOwner) {
    gaps.push({
      code: "approval_owner_unresolved",
      severity: "blocking",
      agentId,
      message: ownerDisplay
        ? `The approval owner is recorded as "${ownerDisplay}", which is a name rather than a user, and no known user matches it. Nobody would receive this agent's approvals.`
        : "This agent names no approval owner, so its approvals would have no recipient.",
      resolution:
        "Add the person to lib/plan/users.ts with a stable id, or set the agent's approvalOwner in Role B's planner to a name that matches one.",
    });
  }

  gaps.push({
    code: "policy_absent",
    severity: "degraded",
    agentId,
    message:
      "The handoff carries no operating mode, limits or approval rules, so this agent is set to prepare work and stop. It will ask before every single action.",
    resolution:
      "Have Role B wire the discovery interview's approval boundaries into the agent config, then re-ingest. Until then this is the intended behaviour, not a fault.",
  });

  const workflow: WorkflowSpec = {
    id: `${agentId}-workflow`,
    name: source.agent_key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description: spec.objective ?? `Work carried out by ${source.agent_key}.`,
    enabled: source.status !== "disabled",
    trigger: {
      kind: "manual",
      label: spec.trigger ? `Described as: ${spec.trigger}` : "Run on request",
    },
    steps,
    output: {
      kind: "draft",
      successCriteria:
        spec.success ?? "The prepared work is ready for the owner to review.",
    },
    onFailure: { retries: 1, backoffSeconds: 30, onExhausted: "notify_owner" },
  };

  const policy: AgentPolicy = {
    // The whole safety argument for this adapter, in one field.
    operatingMode: "draft_only",
    // Meaningless under draft_only, and validator rule 2 only requires them for
    // auto_within_limits. Left empty rather than invented.
    limits: [],
    alwaysApprove: ALWAYS_APPROVE.filter((op) => granted.has(op)),
    forbidden: [...ALWAYS_FORBIDDEN],
    approvalOwner: resolvedOwner ?? "",
    escalateAfterMins: 240,
    quietHours: null,
    maxRunsPerDay: null,
  };

  return {
    id: agentId,
    // Role B versions the PLAN, not the agent. Deriving from the plan version
    // means every agent rebuilds when the plan does — coarser than the contract
    // intends, but never stale, which is the direction that matters.
    version: planVersion,
    name: workflow.name,
    role: spec.objective ?? `Agent generated from Role B's plan (${source.agent_type}).`,
    capabilities: capabilitiesFrom(grants),
    workflows: [workflow],
    tools: grants,
    policy,
    guidance: {
      objective: spec.objective ?? `Carry out the work of ${source.agent_key}.`,
      businessContext: [
        spec.inputs ? `Inputs: ${spec.inputs}` : "",
        spec.rules ? `Rules: ${spec.rules}` : "",
        // The prose deny is prompt material, never a guardrail. The guardrail
        // is `policy.forbidden`, which the runtime enforces outside the model.
        spec.forbidden ? `Never: ${spec.forbidden}` : "",
        spec.trigger ? `Runs when: ${spec.trigger}` : "",
      ]
        .filter(Boolean)
        .join("\n") || "No further context was supplied with this agent.",
      ...(spec.notes && Object.keys(spec.notes).length > 0
        ? { examples: Object.values(spec.notes) }
        : {}),
    },
  };
}

/* ═══════════════════════════ The plan ═══════════════════════════ */

/**
 * One business outcome per agent, deliberately unmeasured.
 *
 * The contract wants baseline and target so the Workspace can show progress,
 * and Role B supplies neither. A `target: 0` would render as a met goal on day
 * one, so `baseline: null` and a target of 1 "run reviewed" is used instead: it
 * counts something real, claims nothing, and validator rule 15 stays satisfied
 * so every agent is attributable.
 */
function outcomesFor(agents: AgentSpec[]): BusinessOutcome[] {
  return agents.map((agent) => ({
    id: `outcome-${agent.id}`,
    name: `Work handled by ${agent.name}`,
    priority: "medium" as const,
    owner: agent.policy.approvalOwner,
    metrics: [
      {
        id: `${agent.id}-reviewed`,
        label: "Prepared items reviewed",
        metric: "agent.items_reviewed",
        direction: "increase" as const,
        baseline: null,
        target: 1,
        unit: "count",
      },
    ],
    agentIds: [agent.id],
  }));
}

export function ingestHandoff(payload: WorkforceHandoffPayload): IngestResult {
  const gaps: IngestGap[] = [];

  if (payload.workforce_plan.status !== "approved") {
    gaps.push({
      code: "plan_stale",
      severity: "blocking",
      message: `The plan's status is "${payload.workforce_plan.status}", not "approved". Only an approved plan may be built.`,
      resolution: "Approve the plan in Role B's planner, then re-fetch the handoff.",
    });
  }

  if (payload.workforce_plan.version !== payload.workforce_plan.current_version) {
    // Role B's own example payload carries version 1 against current_version 2
    // with `plan.stale: true`, so this is a live condition rather than a
    // hypothetical.
    gaps.push({
      code: "plan_stale",
      severity: "blocking",
      message: `This handoff was built from plan version ${payload.workforce_plan.version}, but the current version is ${payload.workforce_plan.current_version}. Building it would deploy a workforce the owner has already changed.`,
      resolution:
        "POST /api/planner/:id/finalize-handoff to rebuild against the current version, then re-ingest.",
    });
  }

  const connected = new Set(
    payload.integrations.filter((i) => i.status === "connected").map((i) => i.tool_key),
  );
  for (const integration of payload.integrations) {
    if (integration.status !== "connected") {
      gaps.push({
        code: "integration_not_connected",
        severity: "blocking",
        message: `"${integration.tool_key}" reports status "${integration.status}". Role B's finalize step refuses to build unless every tool is connected, so this payload is stale.`,
        resolution: "Re-fetch the handoff; reconnect the tool if it is still not connected.",
      });
    }
  }

  const agents = payload.agents.map((source) =>
    agentFrom(source, payload.workforce_plan.version, gaps),
  );

  // A required tool that nobody connected fails Activation later; saying so
  // here costs one check and saves a confusing gate.
  for (const agent of agents) {
    for (const grant of agent.tools) {
      if (grant.required && !connected.has(grant.integrationId)) {
        gaps.push({
          code: "integration_not_connected",
          severity: "blocking",
          agentId: agent.id,
          message: `"${grant.integrationId}" is required by this agent but is not in the handoff's connected integrations.`,
          resolution: "Connect the tool in Role B's integrations screen and re-fetch the handoff.",
        });
      }
    }
  }

  gaps.push({
    code: "steps_synthesised",
    severity: "degraded",
    message:
      "The handoff carries no workflow steps, so each agent's workflow was synthesised as gather, decide, then one action.",
    resolution:
      "Have Role B emit structured steps (docs/PLAN_CONTRACT.md §3.7), or confirm the synthesised shape matches what each agent should do.",
  });

  gaps.push({
    code: "trigger_not_scheduled",
    severity: "degraded",
    message:
      "Triggers arrive as sentences rather than schedules, so every workflow runs on request. Nothing fires on its own.",
    resolution:
      "Add a cron or event trigger per workflow (docs/PLAN_CONTRACT.md §3.6) once the intended schedule is confirmed.",
  });

  gaps.push({
    code: "outcomes_absent",
    severity: "note",
    message:
      "The handoff carries no business outcomes or targets, so one placeholder outcome per agent was created and the Workspace cannot show real progress.",
    resolution: "Supply outcome metrics with baselines and targets from the discovery report.",
  });

  const plan: ApprovedPlan = {
    planId: payload.workforce_plan.id,
    version: payload.workforce_plan.version,
    approvedAt: payload.workforce_plan.approved_at ?? payload.generated_at,
    // "pending-auth" is Role B's placeholder while they have no auth system.
    approvedBy: asString(payload.workforce_plan.approved_by) ?? "pending-auth",
    reportVersion: payload.workforce_plan.current_version,
    businessOutcomes: outcomesFor(agents),
    agents,
    globalPolicy: {
      quietHours: null,
      forbidden: [...ALWAYS_FORBIDDEN],
    },
  };

  return {
    plan,
    gaps,
    runnable: !gaps.some((g) => g.severity === "blocking"),
    summary: agents.map((agent) => {
      const ops = agent.tools.flatMap((t) => t.operations);
      return {
        agentId: agent.id,
        sourceKey: payload.agents.find((a) => toAgentId(a.agent_key) === agent.id)?.agent_key ?? agent.id,
        agentType:
          payload.agents.find((a) => toAgentId(a.agent_key) === agent.id)?.agent_type ?? "unknown",
        operatingMode: agent.policy.operatingMode,
        grantedOperations: ops.length,
        writeOperations: ops.filter((op) => !isReadOnly(op)).length,
      };
    }),
  };
}

/** Exported for the ingest screen and for tests that assert on identity. */
export { toAgentId, resolveApprovalOwner, isKnownUser };
