"use client";
/**
 * AgentPlanCard — one slim agent card on the canvas (improvement spec
 * §12.4): source tag + status, name, role line, one-line purpose, summary
 * chips ("N workflows · M approvals" plus connected tools) and the price
 * footer with Configure / Remove. Full workflow detail and the enable
 * toggles live in the inspector. Keyboard reorder: Move up / Move down
 * buttons plus arrow keys on the drag handle (all 44px targets).
 * Read-only when the plan is approved.
 */
import Link from "next/link";
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Gauge,
  GitBranch,
  GripVertical,
  Hand,
  Plug,
  Settings2,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Workflow,
  Zap,
} from "lucide-react";
import type { AgentDef, PlanAgent, TriggerKind } from "@/lib/mock/types";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { money } from "@/lib/mock/pricing";
import { useDemoStore } from "@/lib/mock/store";
import { toast } from "@/components/mock/ui/Toaster";
import { formatCostDelta } from "./planner-utils";
import styles from "./planner.module.css";

const TRIGGER_ICON: Record<TriggerKind, typeof Zap> = {
  event: Zap,
  schedule: CalendarClock,
  threshold: Gauge,
  manual: Hand,
  dependency: GitBranch,
  approval: ShieldCheck,
};

export function TriggerGlyph({ kind }: { kind: TriggerKind }) {
  const Icon = TRIGGER_ICON[kind] ?? Zap;
  return <Icon size={12} aria-hidden />;
}

export interface DragHandleProps {
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  position: string;
}

export interface MoveProps {
  up: () => void;
  down: () => void;
  canUp: boolean;
  canDown: boolean;
}

export default function AgentPlanCard({
  agent,
  def,
  selected,
  approved,
  onSelect,
  dragHandle,
  move,
}: {
  agent: PlanAgent;
  def: AgentDef;
  selected: boolean;
  approved: boolean;
  onSelect: () => void;
  dragHandle: DragHandleProps | null;
  move: MoveProps | null;
}) {
  const workflowCount = agent.workflowOrder.length;
  const disabledCount = agent.workflowOrder.filter(
    (id) => !(agent.config.workflowsEnabled[id] ?? true),
  ).length;
  const approvalCount = Array.from(
    new Set([...def.humanApprovals, ...agent.config.approvalActions]),
  ).length;
  /** One-line purpose: the first sentence of the description. */
  const purpose = def.description.split(". ")[0];

  const remove = () => {
    useDemoStore.getState().removeAgentFromPlan(def.id);
    toast({
      title: `Removed ${def.name} from the plan.`,
      detail: formatCostDelta({ setup: -def.setupCost, monthly: -def.monthlyCost }),
      tone: "info",
      action: { label: "Undo", onClick: () => useDemoStore.getState().undoPlan() },
    });
  };

  const configureLabel = approved
    ? "View configuration"
    : def.source === "custom" && !agent.designApproved
      ? "Start design call"
      : "Configure";

  return (
    <article
      className={`oa-card ${styles.agentCard} ${selected ? "oa-card--selected" : ""}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, a, input")) return;
        onSelect();
      }}
    >
      <header className={styles.agentHead}>
        <div className={styles.agentTitleWrap}>
          <div className="oa-cluster" style={{ gap: 8 }}>
            <span className={def.source === "preset" ? "oa-tag oa-tag--neutral" : "oa-tag oa-tag--amber"}>
              {def.source === "preset" ? "Preset" : "Custom"}
            </span>
            <StatusBadge status={agent.status} />
          </div>
          <button type="button" className={styles.agentName} onClick={onSelect}>
            {def.name}
          </button>
          <p className={styles.agentRole}>{def.role}</p>
          <p className={styles.agentPurpose}>{purpose}.</p>
        </div>
        {(move || dragHandle) && (
          <div className={styles.headBtns}>
            {move && (
              <>
                <button
                  type="button"
                  className="oa-btn oa-btn--ghost oa-btn--icon"
                  onClick={move.up}
                  disabled={!move.canUp}
                  aria-label={`Move ${def.name} up`}
                >
                  <ChevronUp size={15} aria-hidden />
                </button>
                <button
                  type="button"
                  className="oa-btn oa-btn--ghost oa-btn--icon"
                  onClick={move.down}
                  disabled={!move.canDown}
                  aria-label={`Move ${def.name} down`}
                >
                  <ChevronDown size={15} aria-hidden />
                </button>
              </>
            )}
            {dragHandle && (
              <button
                type="button"
                className={`oa-btn oa-btn--ghost oa-btn--icon ${styles.dragHandle}`}
                onPointerDown={dragHandle.onPointerDown}
                onKeyDown={dragHandle.onKeyDown}
                aria-label={`Reorder ${def.name}, position ${dragHandle.position}. Use the arrow keys to move it.`}
              >
                <GripVertical size={15} aria-hidden />
              </button>
            )}
          </div>
        )}
      </header>

      <div className={styles.summaryChips}>
        <span className={styles.sumChip}>
          <Workflow size={11} aria-hidden />
          {workflowCount} workflow{workflowCount === 1 ? "" : "s"} · {approvalCount} approval
          {approvalCount === 1 ? "" : "s"}
        </span>
        {disabledCount > 0 && (
          <span className={`${styles.sumChip} ${styles.sumChipWarn}`}>
            <TriangleAlert size={11} aria-hidden />
            {disabledCount} workflow{disabledCount === 1 ? "" : "s"} off
          </span>
        )}
        <span className={styles.sumChip}>
          <Plug size={11} aria-hidden />
          {def.integrations.length} tools
        </span>
      </div>

      {agent.status === "needs_information" && !approved && (
        <p className={styles.designNote}>
          <TriangleAlert size={13} aria-hidden />
          Design call required before this agent can be built
          {def.customProposal ? ` (${def.customProposal.missingInformation.length} open questions)` : ""}.
        </p>
      )}

      <footer className={styles.agentFoot}>
        <p className={styles.price}>
          <span>
            {money(def.setupCost)} setup · {money(def.monthlyCost)}/mo
          </span>
          <span className={styles.priceNote}>Illustrative</span>
        </p>
        <div className="oa-cluster" style={{ gap: 8 }}>
          <Link href={`/app/planner/agents/${def.id}`} className="oa-btn oa-btn--soft oa-btn--sm">
            <Settings2 size={13} aria-hidden />
            {configureLabel}
          </Link>
          {!approved && (
            <button type="button" className="oa-btn oa-btn--ghost oa-btn--sm" onClick={remove}>
              <Trash2 size={13} aria-hidden />
              Remove
            </button>
          )}
        </div>
      </footer>
    </article>
  );
}
