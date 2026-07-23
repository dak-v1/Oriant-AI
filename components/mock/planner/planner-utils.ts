"use client";
/**
 * planner-utils — shared helpers for the planner experience (spec §11).
 * Selection model, viewport hook, cost-delta formatting and workflow-def
 * resolution (workflowOrder can contain NL-added or moved workflow ids that
 * are not on the owning agent's fixture).
 */
import { useEffect, useState } from "react";
import type { AgentDef, AgentWorkflowDef } from "@/lib/mock/types";
import { AGENT_LIBRARY } from "@/lib/mock/fixtures/agent-library";
import { NL_COMMANDS } from "@/lib/mock/fixtures/workflow-plan";
import { money } from "@/lib/mock/pricing";

export type PlannerSelection =
  | { type: "agent"; agentId: string }
  | { type: "edge"; fromId: string; toId: string }
  | null;

/** True while the viewport is at least `px` wide (client-only components). */
export function useMinWidth(px: number): boolean {
  const [wide, setWide] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia(`(min-width: ${px}px)`).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${px}px)`);
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [px]);
  return wide;
}

/** "+$40 setup · +$8/mo", zeros omitted (spec §11.7). */
export function formatCostDelta(delta: { setup: number; monthly: number }): string {
  const part = (n: number, suffix: string) =>
    `${n > 0 ? "+" : "-"}${money(Math.abs(n))}${suffix}`;
  const parts: string[] = [];
  if (delta.setup !== 0) parts.push(part(delta.setup, " setup"));
  if (delta.monthly !== 0) parts.push(part(delta.monthly, "/mo"));
  return parts.length ? `${parts.join(" · ")} — illustrative` : "No cost change";
}

/**
 * Resolve a workflow definition by id: the agent's own fixture list first,
 * then workflows introduced by NL commands, then any other library agent
 * (covers moved workflows).
 */
export function workflowDefById(def: AgentDef, workflowId: string): AgentWorkflowDef | null {
  const own = def.workflows.find((w) => w.id === workflowId);
  if (own) return own;
  for (const cmd of NL_COMMANDS) {
    if (cmd.effect.kind === "add_workflow" && cmd.effect.workflow.id === workflowId) {
      return cmd.effect.workflow;
    }
  }
  for (const other of Object.values(AGENT_LIBRARY)) {
    const w = other.workflows.find((x) => x.id === workflowId);
    if (w) return w;
  }
  return null;
}

export const OPERATING_MODE_LABEL: Record<string, string> = {
  draft_only: "Draft only",
  act_after_approval: "Act after approval",
  auto_within_limits: "Auto within limits",
};
