"use client";
/**
 * /app/planner/agents/[agentId] — per-agent configuration (spec §11.4) and
 * the custom-agent design cycle (spec §11.5). Thin route: all logic lives in
 * components/mock/agents. Next 15: dynamic params are a Promise, unwrapped
 * with React.use().
 */
import { use } from "react";
import AgentConfigPage from "@/components/mock/agents/AgentConfigPage";

export default function AgentRoute({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = use(params);
  return <AgentConfigPage agentId={agentId} />;
}
