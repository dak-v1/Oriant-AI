/**
 * lib/plan/fixtures/role-b-handoff.ts — Role B's real handoff, verbatim.
 *
 * Copied from the payload Role B actually returned for BrightPath on
 * 1 Aug 2026, not a shape invented to be convenient. That distinction is the
 * point: the ingest adapter has to survive what the other lane really sends,
 * including the parts that are inconvenient — a plan at version 1 while the
 * current version is 2, `plan.stale: true`, an approval owner recorded as the
 * display name "Sarah Tan" who is not in this runtime's user registry, and two
 * preset agents in `workforce_plan.plan.agents` that never appear in the
 * top-level `agents[]` because they were never configured.
 *
 * Every one of those trips a gap in ingest, which is why the fixture is kept
 * exactly as received.
 */

import type { WorkforceHandoffPayload } from "../ingest/types";

export const ROLE_B_HANDOFF: WorkforceHandoffPayload = {
  handoff_type: "workforce_plan",
  generated_at: "2026-08-01T14:06:02.894Z",
  organization: {
    id: "1647df28-64de-4c69-b681-d20c3170b88b",
    external_key: "seed:brightpath-home-services",
    name: "BrightPath Home Services",
  },
  workforce_plan: {
    id: "f5f51ce7-edfb-408e-af67-6a5946665cb3",
    version: 1,
    current_version: 2,
    status: "approved",
    approved_at: "2026-08-01T14:05:04.61+00:00",
    approved_by: "pending-auth",
    plan: {
      stale: true,
      agents: [
        {
          name: "Appointment Rescheduler",
          agentKey: "ops_appointment_rescheduler",
          reasoning:
            "Directly matches the 'Automated appointment rescheduling' use case. The template requires gmail, google-calendar, and whatsapp-business, all of which are in the connected tools list.",
          requiredTools: ["gmail", "google-calendar", "whatsapp-business"],
          templateKeyOrNull: "ops_appointment_rescheduler",
        },
        {
          name: "Invoice Follow-up Agent",
          agentKey: "finance_invoice_followup",
          reasoning:
            "Addresses the pain point of manual invoice review. The template requires quickbooks and gmail, both available in the connected tools list.",
          requiredTools: ["quickbooks", "gmail"],
          templateKeyOrNull: "finance_invoice_followup",
        },
        {
          name: "Marketing Content Approval Agent",
          agentKey: "marketing_content_approval_agent",
          reasoning:
            "Addresses the pain point of delays in marketing content approval. No existing template matches this specific workflow, so a custom agent is proposed. It will use google-drive and slack for content review and approval notifications.",
          requiredTools: ["google-drive", "slack"],
          templateKeyOrNull: null,
        },
      ],
    },
  },
  agents: [
    {
      agent_key: "marketing_content_approval_agent",
      agent_type: "custom",
      template_id: null,
      status: "configured",
      runtime_model: "zai-org/glm-5.2",
      required_tools: ["google-drive", "slack"],
      config: {
        approvalOwner: "Sarah Tan",
        channels: ["slack"],
        spec: {
          objective:
            "Route new marketing content to the right approver and track sign-off before publishing.",
          trigger:
            "A new content draft is uploaded to the shared Google Drive marketing folder.",
          inputs: "The content file itself and the name of the requester.",
          rules:
            "Social posts go to the social media manager first, brochures go to Sarah Tan.",
          tools: "Google Drive and Slack.",
          forbidden:
            "Never edit the content itself, never approve on someone else's behalf.",
          success:
            "Approval status is updated in Slack and the file is moved to the Publish Ready folder.",
          notes: {
            q1: "Unlisted content types default to Sarah Tan for review.",
            q2: "Taken from the Google Drive upload event metadata (file owner).",
            q3: "If an approver is out of office, escalate to Sarah Tan after 24 hours.",
            q4: "Post a status update in the #marketing Slack channel naming the requester and approval state.",
          },
        },
      },
    },
  ],
  integrations: [
    {
      tool_key: "google-drive",
      provider: "composio",
      status: "connected",
      external_connection_id: "ca_RPnE5UPV7rSl",
      connected_at: "2026-08-01T13:58:20.025+00:00",
    },
    {
      tool_key: "slack",
      provider: "composio",
      status: "connected",
      external_connection_id: "ca__Ww2Zs7Y8nYH",
      connected_at: "2026-08-01T11:50:58.342+00:00",
    },
  ],
};

/**
 * The same payload with the two things that block a build repaired: the plan
 * rebuilt against its current version, and the approval owner named as somebody
 * this runtime knows. Used to prove ingest produces a genuinely runnable plan
 * once Role B's side is correct, rather than only proving it refuses.
 */
export const ROLE_B_HANDOFF_RESOLVED: WorkforceHandoffPayload = {
  ...ROLE_B_HANDOFF,
  workforce_plan: {
    ...ROLE_B_HANDOFF.workforce_plan,
    version: 2,
    current_version: 2,
    plan: { ...ROLE_B_HANDOFF.workforce_plan.plan, stale: false },
  },
  agents: ROLE_B_HANDOFF.agents.map((agent) => ({
    ...agent,
    config: { ...agent.config, approvalOwner: "Sarah Chen" },
  })),
};
