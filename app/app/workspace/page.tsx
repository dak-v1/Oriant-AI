"use client";
/**
 * /app/workspace — the owner's daily operating overview (spec §17, §19).
 * Thin route; all logic lives in components/mock/workspace/.
 */
import WorkspaceOverview from "@/components/mock/workspace/WorkspaceOverview";

export default function WorkspacePage() {
  return <WorkspaceOverview />;
}
