"use client";
/**
 * AgentPlanCard — one agent in the operations narrative (spec §11.1, §11.6):
 * header with source tag + status + fit reason, workflow rows with enable
 * switches, human-approval chips, integration chips, illustrative price
 * footer and Configure / Remove actions. Read-only when the plan is approved.
 */
import Link from "next/link";
import {
  CalendarClock,
  Gauge,
  GitBranch,
  GripVertical,
  Hand,
  Lightbulb,
  Plug,
  Settings2,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Zap,
} from "lucide-react";
import type { AgentDef, AgentWorkflowDef, PlanAgent, TriggerKind } from "@/lib/mock/types";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { INTEGRATIONS } from "@/lib/mock/fixtures/integrations";
import { money } from "@/lib/mock/pricing";
import { useDemoStore } from "@/lib/mock/store";
import { toast } from "@/components/mock/ui/Toaster";
import { formatCostDelta, workflowDefById } from "./planner-utils";
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

export default function AgentPlanCard({
  agent,
  def,
  selected,
  approved,
  onSelect,
  dragHandle,
}: {
  agent: PlanAgent;
  def: AgentDef;
  selected: boolean;
  approved: boolean;
  onSelect: () => void;
  dragHandle: DragHandleProps | null;
}) {
  const workflows = agent.workflowOrder
    .map((id) => workflowDefById(def, id))
    .filter((w): w is AgentWorkflowDef => Boolean(w));

  const toggle = (wf: AgentWorkflowDef) => {
    const st = useDemoStore.getState();
    const current = st.plan.agents.find((a) => a.agentId === agent.agentId);
    const wasEnabled = current?.config.workflowsEnabled[wf.id] ?? true;
    st.toggleAgentWorkflow(agent.agentId, wf.id);
    toast({
      title: wasEnabled ? `Disabled ${wf.name}.` : `Enabled ${wf.name}.`,
      detail: wasEnabled ? "Kept in the plan — it will not run until re-enabled." : undefined,
      tone: "info",
      action: { label: "Undo", onClick: () => useDemoStore.getState().undoPlan() },
    });
  };

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
          <p className={styles.fitReason}>
            <Lightbulb size={13} aria-hidden />
            {def.fitReason}
          </p>
        </div>
        {dragHandle && (
          <button
            type="button"
            className={styles.dragHandle}
            onPointerDown={dragHandle.onPointerDown}
            onKeyDown={dragHandle.onKeyDown}
            aria-label={`Reorder ${def.name} — position ${dragHandle.position}. Use the arrow keys to move it.`}
          >
            <GripVertical size={15} aria-hidden />
          </button>
        )}
      </header>

      <div className={styles.wfList}>
        {workflows.map((wf) => {
          const enabled = agent.config.workflowsEnabled[wf.id] ?? true;
          return (
            <div key={wf.id} className={`${styles.wfRow} ${enabled ? "" : styles.wfRowOff}`}>
              <div className={styles.wfText}>
                <p className={styles.wfName}>{wf.name}</p>
                <p className={styles.wfTrigger}>
                  <TriggerGlyph kind={wf.trigger.kind} />
                  {wf.trigger.label}
                </p>
                {!enabled && <p className={styles.wfOffNote}>Disabled — kept in plan</p>}
              </div>
              {!approved ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`${wf.name} enabled`}
                  className="oa-switch"
                  onClick={() => toggle(wf)}
                />
              ) : (
                <span className={`oa-switch ${enabled ? "oa-switch--on" : ""}`} aria-hidden />
              )}
            </div>
          );
        })}
      </div>

      {agent.config.approvalActions.length > 0 && (
        <div className={styles.metaBlock}>
          <p className="oa-micro">Human approval required</p>
          <div className="oa-cluster" style={{ gap: 6 }}>
            {agent.config.approvalActions.map((a) => (
              <span key={a} className={styles.approvalChip}>
                <ShieldCheck size={11} aria-hidden />
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={styles.metaBlock}>
        <p className="oa-micro">Connects to</p>
        <div className="oa-cluster" style={{ gap: 6 }}>
          {def.integrations.map((req) => (
            <span key={req.integrationId} className={styles.intChip} title={req.purpose}>
              <Plug size={11} aria-hidden />
              {INTEGRATIONS[req.integrationId]?.name ?? req.integrationId}
            </span>
          ))}
        </div>
      </div>

      {agent.status === "needs_information" && !approved && (
        <p className={styles.designNote}>
          <TriangleAlert size={13} aria-hidden />
          Design call required before this agent can be built
          {def.customProposal ? ` — ${def.customProposal.missingInformation.length} open questions` : ""}.
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
