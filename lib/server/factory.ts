/**
 * Agent Factory (blueprint §15) — turns an approved AgentSpec into the
 * implementation artifact bundle: prompt, YAML, policies, tests and docs.
 *
 * The deterministic templates below are both the fixture output and the
 * canonical shape live Doubleword generations must match. Generated files
 * reference credentials by name (credential_ref) and NEVER contain secrets.
 */
import type { AgentDef, ArtifactBundle, ArtifactFile } from "../contracts";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const credRef = (system: string) => system.toLowerCase().replace(/[^a-z]/g, "") + "_api";

export function renderArtifacts(agent: AgentDef, planVersion: number): ArtifactBundle {
  const id = slug(agent.name);
  const cfg = agent.config;
  const spec = agent.spec;
  const approvals = cfg ? Object.keys(cfg.approvals).filter((k) => cfg.approvals[k]) : ["Refunds", "Sensitive cases"];
  const channels = cfg ? Object.keys(cfg.channels).filter((k) => cfg.channels[k]) : ["Email"];
  const knowledge = cfg ? Object.keys(cfg.knowledge).filter((k) => cfg.knowledge[k]) : ["Company brief"];

  const files: ArtifactFile[] = [
    {
      path: "agent.yaml", type: "configuration",
      content: `schema_version: "1.0"
agent:
  id: ${id}
  name: ${agent.name}
  source: ${agent.tag.toLowerCase()}
  role: ${agent.role}
  objective: >-
    ${spec?.objective ?? agent.desc}
runtime:
  mode: event_driven
  operating_mode: ${cfg?.mode ?? "approval"}
  working_hours: ${JSON.stringify(cfg?.hours ?? "Business hours")}
  response_target: ${JSON.stringify(cfg?.target ?? "< 1 hour")}
  retry_policy: ${JSON.stringify(cfg?.retry ?? "3 retries")}
  timeout_seconds: 30
success_metrics:
  - ${spec?.success ?? "resolution_time and correct_escalation_rate"}
source_plan_version: ${planVersion}
`,
    },
    {
      path: "workflow.yaml", type: "workflow",
      content: `trigger:
  ${spec?.trigger ? `description: ${JSON.stringify(spec.trigger)}` : `event_type: ${id}.task.received`}
channels:
${channels.map((c) => `  - ${JSON.stringify(c)}`).join("\n")}
inputs:
${(spec?.inputs ? [spec.inputs] : ["incoming_message", "approved_company_knowledge"]).map((i) => `  - ${JSON.stringify(i)}`).join("\n")}
decision: >-
  ${spec?.rules ?? "Follow the approved playbook; escalate anything outside policy to " + (cfg?.escalation ?? "Founder") + "."}
outputs:
  - drafted_response
  - escalation_request
failure_behavior:
  on_missing_data: escalate_to_human
  on_integration_error: retry_then_escalate
escalation_owner: ${JSON.stringify(cfg?.escalation ?? "Founder")}
`,
    },
    {
      path: "prompt.md", type: "prompt",
      content: `# ${agent.name} — system prompt

You are **${agent.name}**, the ${agent.role.toLowerCase()} agent for {{company_name}}.

## Objective
${spec?.objective ?? agent.desc}

## Knowledge boundaries
Use ONLY these approved sources: ${knowledge.join(", ")}.
Never state a volume, price or permission as fact unless it appears in the approved company brief.

## Behavior rules
${spec?.rules ?? "Follow the approved playbook for routine cases. Anything unusual, financial or emotionally charged is escalated."}

## Hard limits
${spec?.forbidden ?? "Never send final pricing, issue refunds or commit stock without explicit human approval."}
The following always require human approval first: ${approvals.join(", ")}.

## Output
Return a single JSON object matching the agent output schema in workflow.yaml. Do not free-write outside it.
`,
    },
    {
      path: "tools.yaml", type: "tools",
      content: `tools:
${agent.integ.map((s) => `  - id: ${slug(s)}_connector
    system: ${s}
    credential_ref: ${credRef(s)}
    actions: [read, draft]`).join("\n")}
  - id: create_response_draft
    system: internal
    actions: [create]
  - id: request_human_approval
    system: internal
    actions: [create]
`,
    },
    {
      path: "permissions.yaml", type: "policy",
      content: `read:
${agent.integ.map((s) => `  - ${slug(s)}_records`).join("\n")}
write:
  - response_drafts
  - escalation_queue
forbidden:
  - issue_refund
  - modify_payment
  - access_banking
${spec?.forbidden ? `  # owner-stated: ${spec.forbidden.replace(/\n/g, " ")}` : ""}
human_approval:
  required_for:
${approvals.map((a) => `    - ${slug(a)}`).join("\n")}
`,
    },
    {
      path: "test-cases.yaml", type: "tests",
      content: `cases:
  - name: routine_task_produces_draft
    given: a normal ${agent.covers.toLowerCase()} event
    expect: a drafted response and no external send
  - name: sensitive_case_escalates
    given: input matching an approval category (${approvals[0] ?? "Refunds"})
    expect: an ApprovalRequest, no autonomous action
  - name: missing_data_asks_human
    given: required input is absent
    expect: escalation with a plain-language question
  - name: integration_failure_is_safe
    given: the ${agent.integ[0] ?? "primary"} connector errors
    expect: retry per policy then escalate, no invented data
  - name: forbidden_action_blocked
    given: a request to perform a forbidden action
    expect: refusal recorded and surfaced to the owner
  - name: output_schema_valid
    given: any completed task
    expect: output validates against the declared schema
`,
    },
    {
      path: "required-integrations.json", type: "integrations",
      content: JSON.stringify(
        {
          integrations: agent.integ.map((s) => ({
            id: slug(s), system: s, credential_ref: credRef(s),
            scopes: ["read", "draft"],
            note: "Credential supplied by the owner in Margo's vault — never embedded here.",
          })),
        },
        null, 2,
      ),
    },
    {
      path: "README.md", type: "docs",
      content: `# ${agent.name}

${agent.desc}

- **Source**: ${agent.tag} ${agent.tag === "Custom" ? "(designed in a focused interview)" : "template"}
- **Covers**: ${agent.covers}
- **Approval policy**: ${agent.approval}
- **Integrations**: ${agent.integ.join(", ")} (referenced by credential name only)

## Operating guidance
Activate only after sandbox validation passes. Pause any time — configuration
and history are preserved. Editing the configuration creates a new draft spec;
the active version keeps running until the new one is validated.
`,
    },
  ];

  return {
    agentId: agent.id,
    artifactVersion: `build_${planVersion}_${id}`,
    sourcePlanVersion: planVersion,
    files,
    requiredIntegrations: agent.integ.map(credRef),
    warnings: [],
    mode: "fixture",
  };
}

/** Prompt pair for live Doubleword generation — must return the same bundle shape. */
export function generationPrompt(agent: AgentDef, planVersion: number): { system: string; user: string } {
  const reference = renderArtifacts(agent, planVersion);
  return {
    system:
      "You are the Agent Factory for Margo, an AI-workforce platform. Generate the implementation artifact bundle for ONE agent. " +
      "Return STRICT JSON: {\"files\":[{\"path\":string,\"type\":string,\"content\":string}]} with exactly these paths: " +
      reference.files.map((f) => f.path).join(", ") + ". " +
      "Rules: never include real credentials or API keys — reference credentials by name (credential_ref). " +
      "Do not add tools, permissions or integrations beyond the approved spec. Keep YAML valid.",
    user:
      `Approved AgentSpec:\n${JSON.stringify(
        {
          id: agent.id, name: agent.name, role: agent.role, source: agent.tag,
          description: agent.desc, covers: agent.covers, integrations: agent.integ,
          approvalPolicy: agent.approval, config: agent.config ?? null, spec: agent.spec ?? null,
          sourcePlanVersion: planVersion,
        },
        null, 2,
      )}\n\nGenerate the full artifact bundle now.`,
  };
}

/** Parse + guard a live generation; fall back to templates on any violation. */
export function parseLiveBundle(
  agent: AgentDef, planVersion: number, content: string,
): { bundle: ArtifactBundle; usedLive: boolean; warning?: string } {
  const reference = renderArtifacts(agent, planVersion);
  try {
    const parsed = JSON.parse(content) as { files?: ArtifactFile[] };
    const files = parsed.files ?? [];
    const wantPaths = new Set(reference.files.map((f) => f.path));
    const gotPaths = new Set(files.map((f) => f.path));
    const missing = [...wantPaths].filter((p) => !gotPaths.has(p));
    if (missing.length > 0) {
      return { bundle: reference, usedLive: false, warning: `Live generation missing ${missing.join(", ")} — used validated templates instead.` };
    }
    // no privilege expansion: drop unexpected extra files (blueprint §16.2)
    const filtered = files.filter((f) => wantPaths.has(f.path));
    return {
      bundle: { ...reference, files: filtered, mode: "live" },
      usedLive: true,
      warning: files.length !== filtered.length ? "Unrequested extra files were discarded." : undefined,
    };
  } catch {
    return { bundle: reference, usedLive: false, warning: "Live generation was not valid JSON — used validated templates instead." };
  }
}
