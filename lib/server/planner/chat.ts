/**
 * Workflow refinement chat — intent classification + diff-op proposal for
 * the Person B planner backend. Independent of lib/server/orchestrator.ts
 * and app/api/plan/* — nothing here imports either. Uses the aiandJson
 * adapter, which already implements the {mode, data, error} convention.
 */
import { aiandJson } from "../providers/aiand";
import { PlannerError } from "./errors";
import type { AgentConfigExt, AgentTemplate, DiffOp } from "./types";

interface WireDiffOp {
  op: string;
  agentKey: string;
  templateKeyOrNull: string | null;
  configPatchJson: string | null;
  reasoning: string;
}

interface WireChatResponse {
  answer: string | null;
  diffOps: WireDiffOp[];
}

/**
 * `configPatch` is a genuinely free-form object (arbitrary config keys),
 * which doesn't fit OpenAI-style strict json_schema mode
 * (additionalProperties:false + a fixed required list). Rather than guess
 * at AI&'s tolerance for a schema-less nested object, the wire format
 * carries it as a JSON-stringified string instead, parsed back into a real
 * object immediately after validation (resolveDiffOps below). Callers only
 * ever see the real DiffOp shape — this is purely a wire-format workaround.
 */
const DIFF_OP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["op", "agentKey", "templateKeyOrNull", "configPatchJson", "reasoning"],
  properties: {
    op: { type: "string", enum: ["add", "remove", "reconfigure"] },
    agentKey: { type: "string" },
    templateKeyOrNull: { type: ["string", "null"] },
    configPatchJson: { type: ["string", "null"] },
    reasoning: { type: "string" },
  },
} as const;

const CHAT_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "diffOps"],
  properties: {
    answer: { type: ["string", "null"] },
    diffOps: { type: "array", items: DIFF_OP_SCHEMA },
  },
};

function isWireDiffOp(value: unknown): value is WireDiffOp {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.op === "string" &&
    ["add", "remove", "reconfigure"].includes(v.op) &&
    typeof v.agentKey === "string" &&
    v.agentKey.trim().length > 0 &&
    (v.templateKeyOrNull === null || typeof v.templateKeyOrNull === "string") &&
    (v.configPatchJson === null || typeof v.configPatchJson === "string") &&
    typeof v.reasoning === "string"
  );
}

function validateWireResponse(data: unknown): WireChatResponse | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.answer !== null && typeof d.answer !== "string") return null;
  if (!Array.isArray(d.diffOps)) return null;
  if (!d.diffOps.every(isWireDiffOp)) return null;
  return { answer: d.answer as string | null, diffOps: d.diffOps as WireDiffOp[] };
}

/**
 * Referential validation (agent/template keys must be real, per the
 * context actually given) + parsing configPatchJson into a real object.
 * Any single bad op invalidates the whole batch — consistent with
 * generate.ts/design-call.ts's existing whole-response validation.
 */
function resolveDiffOps(
  wireOps: WireDiffOp[],
  activeAgents: AgentConfigExt[],
  templates: AgentTemplate[]
): DiffOp[] | null {
  const activeKeys = new Set(activeAgents.map((a) => a.agent_key));
  const templateKeys = new Set(templates.map((t) => t.key));

  const resolved: DiffOp[] = [];
  for (const wireOp of wireOps) {
    if ((wireOp.op === "remove" || wireOp.op === "reconfigure") && !activeKeys.has(wireOp.agentKey)) {
      return null;
    }
    if (wireOp.templateKeyOrNull !== null && !templateKeys.has(wireOp.templateKeyOrNull)) {
      return null;
    }

    let configPatch: Record<string, unknown> | undefined;
    if (wireOp.configPatchJson !== null) {
      try {
        const parsed = JSON.parse(wireOp.configPatchJson);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
        configPatch = parsed as Record<string, unknown>;
      } catch {
        return null;
      }
    }

    resolved.push({
      op: wireOp.op as DiffOp["op"],
      agentKey: wireOp.agentKey,
      templateKeyOrNull: wireOp.templateKeyOrNull,
      configPatch,
      reasoning: wireOp.reasoning,
    });
  }
  return resolved;
}

export async function classifyChatMessage(input: {
  message: string;
  activeAgents: AgentConfigExt[];
  templates: AgentTemplate[];
}): Promise<{ answer: string | null; diffOps: DiffOp[] }> {
  const fixture: WireChatResponse = {
    answer: "AI& is not configured, so I can't process free-form requests right now.",
    diffOps: [],
  };

  const agentsContext =
    input.activeAgents
      .map(
        (a) =>
          `- ${a.agent_key} (${a.agent_type}, status: ${a.status}, tools: ${
            (a.required_tools ?? []).join(", ") || "none"
          }, config: ${JSON.stringify(a.config)})`
      )
      .join("\n") || "(none)";

  const templatesContext =
    input.templates
      .map((t) => `- ${t.key} (${t.category}): requires ${(t.required_tools ?? []).join(", ") || "no tools"}`)
      .join("\n") || "(none)";

  const system = [
    "You help refine an AI workforce plan through natural-language chat.",
    "Classify the user's message and, if it requests a change, propose diff",
    "operations (add/remove/reconfigure). Always answer any question in",
    '`answer` (null only if the message is purely a mutation with no',
    'question). For a CONDITIONAL mutation (e.g. "if it just sends emails,',
    'remove it"), evaluate the condition against the ACTUAL current agent',
    "data given below — only include a diffOp if the condition is genuinely",
    "true for that agent's real config/tools. If you cannot tell from the",
    "data given, do NOT guess: return an empty diffOps array and ask a",
    "clarifying question in `answer` instead. Only reference real agent keys",
    "and template keys from the lists given — never invent one. For",
    "reconfigure, put the patch as a JSON-stringified object in",
    "configPatchJson (null for add/remove). Return only JSON.",
  ].join(" ");

  const user = [
    `User message: ${input.message}`,
    "Active agents in this plan:",
    agentsContext,
    "Available agent templates:",
    templatesContext,
  ].join("\n");

  const call = () =>
    aiandJson<WireChatResponse>({
      operation: "plan_refinement_chat",
      system,
      user,
      schemaName: "chat_response",
      schema: CHAT_RESPONSE_SCHEMA,
      fixture,
    });

  const first = await call();
  let validated = validateWireResponse(first.data);
  let resolved = validated ? resolveDiffOps(validated.diffOps, input.activeAgents, input.templates) : null;

  if (!validated || !resolved) {
    if (first.mode === "live") {
      const retry = await call();
      validated = validateWireResponse(retry.data);
      resolved = validated ? resolveDiffOps(validated.diffOps, input.activeAgents, input.templates) : null;
    }
    if (!validated || !resolved) {
      throw new PlannerError(502, "AI& returned an invalid chat response after retry.");
    }
  }

  return { answer: validated.answer, diffOps: resolved };
}
