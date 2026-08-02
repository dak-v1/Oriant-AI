"use client";
/**
 * PlanList — one row per agent: name, status, monthly cost and Configure.
 * Step 9 Pass 1: the only plan view (the graph/connector canvas has no real
 * backend data to draw — see PROGRESS.md). Reads real agent fields set by
 * syncPlanFromServer (lib/mock/store.ts) instead of the AGENT_LIBRARY fixture.
 */
import Link from "next/link";
import { Settings2 } from "lucide-react";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { money } from "@/lib/mock/pricing";
import { useDemoStore } from "@/lib/mock/store";
import type { PlannerSelection } from "./planner-utils";
import styles from "./planner.module.css";

export default function PlanList({
  selection,
  onSelect,
  approved,
}: {
  selection: PlannerSelection;
  onSelect: (sel: PlannerSelection) => void;
  approved: boolean;
}) {
  const agents = useDemoStore((s) => s.plan.agents);

  return (
    <div className={styles.listRows} aria-label="Workforce plan list">
      {agents.map((agent) => {
        const name = agent.name ?? agent.agentId;
        const selected = selection?.type === "agent" && selection.agentId === agent.agentId;
        const select = () => onSelect({ type: "agent", agentId: agent.agentId });
        return (
          <div
            key={agent.agentId}
            className={`oa-row oa-row--click ${styles.listRow} ${
              selected ? styles.listRowSelected : ""
            }`}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("button, a")) return;
              select();
            }}
          >
            <div className={styles.listMain}>
              <button type="button" className={styles.listName} onClick={select}>
                {name}
              </button>
              <span className={styles.listCost}>
                {agent.requiredTools && agent.requiredTools.length > 0
                  ? `${agent.requiredTools.length} tool${agent.requiredTools.length === 1 ? "" : "s"} required`
                  : "No tools required"}
              </span>
            </div>
            <StatusBadge status={agent.status} />
            <Link
              href={`/app/planner/agents/${agent.configId ?? agent.agentId}`}
              className="oa-btn oa-btn--soft oa-btn--sm"
            >
              <Settings2 size={13} aria-hidden />
              {approved ? "View" : "Configure"}
            </Link>
          </div>
        );
      })}
      {agents.length === 0 && <p className="oa-sub">No agents in this plan yet.</p>}
    </div>
  );
}
