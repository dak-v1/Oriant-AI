"use client";
/**
 * /app/workspace/agents — the agent roster (spec §17 "Agents" tab).
 * Thin route; all logic lives in components/mock/workspace/.
 */
import AgentRoster from "@/components/mock/workspace/AgentRoster";

export default function WorkspaceAgentsPage() {
  return <AgentRoster />;
}
