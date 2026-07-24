"use client";
/**
 * PlanList — the compact list alternative to the canvas (improvement spec
 * §12.4): one row per agent with name, status, cost and Configure. Default
 * view below 768px; rows select into the inspector / mobile drawer.
 */
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { AGENT_LIBRARY } from "@/lib/mock/fixtures/agent-library";
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
        const def = AGENT_LIBRARY[agent.agentId];
        if (!def) return null;
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
                {def.name}
              </button>
              <span className={styles.listCost}>
                {money(def.setupCost)} setup · {money(def.monthlyCost)}/mo
              </span>
            </div>
            <StatusBadge status={agent.status} />
            <Link
              href={`/app/planner/agents/${def.id}`}
              className="oa-btn oa-btn--soft oa-btn--sm"
            >
              <Settings2 size={13} aria-hidden />
              {approved ? "View" : "Configure"}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
