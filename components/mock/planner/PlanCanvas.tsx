"use client";
/**
 * PlanCanvas — the centre workflow canvas (spec §11.1, §11.6, improvement
 * spec §12.2, §12.4): intro block with pinned plan rules, slim agent cards
 * connected by clickable handoff connectors carrying mini-node markers
 * (Trigger / Human approval / Connected tools), Reorder.Group drag-to-reorder
 * with lift shadow (plus Move up / Move down and arrow-key paths), and a
 * visible dashed drop target while a library card is being dragged.
 */
import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  Reorder,
  useDragControls,
  useReducedMotion,
} from "framer-motion";
import { ArrowDown, Plug, Plus, ShieldCheck, UserCheck, Zap } from "lucide-react";
import { AGENT_LIBRARY } from "@/lib/mock/fixtures/agent-library";
import type { PlanAgent, TriggerKind } from "@/lib/mock/types";
import { useDemoStore } from "@/lib/mock/store";
import { toast } from "@/components/mock/ui/Toaster";
import { DUR, EASE, STAGGER } from "@/lib/mock/motion";
import AgentPlanCard from "./AgentPlanCard";
import { workflowDefById, type PlannerSelection } from "./planner-utils";
import styles from "./planner.module.css";

const TRIGGER_WORD: Record<TriggerKind, string> = {
  event: "Event trigger",
  schedule: "Scheduled",
  threshold: "Threshold",
  manual: "Manual",
  dependency: "Dependency",
  approval: "Approval",
};

/* ── Connector between two agent cards (spec §11.6, §12.4 mini-nodes) ── */

function Connector({
  fromId,
  toId,
  fromApprovals,
  toTrigger,
  toolCount,
  hidden,
  selected,
  onClick,
  reduced,
}: {
  fromId: string;
  toId: string;
  /** Count of human-approval actions on the upstream agent. */
  fromApprovals: number;
  /** Primary trigger kind of the downstream agent (first workflow). */
  toTrigger: TriggerKind | null;
  toolCount: number;
  hidden: boolean;
  selected: boolean;
  onClick: () => void;
  reduced: boolean;
}) {
  const fromName = AGENT_LIBRARY[fromId]?.name ?? fromId;
  const toName = AGENT_LIBRARY[toId]?.name ?? toId;
  return (
    <button
      type="button"
      className={`${styles.connector} ${selected ? styles.connectorSelected : ""} ${
        hidden ? styles.connectorGhost : ""
      }`}
      onClick={onClick}
      aria-label={`Inspect the handoff from ${fromName} to ${toName}`}
      aria-pressed={selected}
    >
      <svg className={styles.connectorSvg} width="24" height="64" viewBox="0 0 24 64" aria-hidden>
        <path
          d="M12 2 V62"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeDasharray="3 6"
          style={{ animation: reduced ? undefined : "oa-dash 1.6s linear infinite" }}
        />
      </svg>
      <span className={styles.miniNodes}>
        <span className={`${styles.miniNode} ${styles.miniNodeHandoff}`}>
          <ArrowDown size={11} aria-hidden />
          Handoff
        </span>
        {toTrigger && (
          <span className={`${styles.miniNode} ${styles.miniNodeTrigger}`}>
            <Zap size={11} aria-hidden />
            {TRIGGER_WORD[toTrigger]}
          </span>
        )}
        {fromApprovals > 0 && (
          <span className={`${styles.miniNode} ${styles.miniNodeApproval}`}>
            <UserCheck size={11} aria-hidden />
            Human approval
          </span>
        )}
        {toolCount > 0 && (
          <span className={`${styles.miniNode} ${styles.miniNodeTool}`}>
            <Plug size={11} aria-hidden />
            {toolCount} tools
          </span>
        )}
      </span>
    </button>
  );
}

/* ── One reorderable row: connector (from previous card) + agent card ── */

function CanvasRow({
  id,
  index,
  count,
  agent,
  prevId,
  prevAgent,
  selection,
  onSelect,
  approved,
  draggingId,
  onDragStartRow,
  onDragEndRow,
  onMove,
  reduced,
}: {
  id: string;
  index: number;
  count: number;
  agent: PlanAgent;
  prevId: string | null;
  prevAgent: PlanAgent | null;
  selection: PlannerSelection;
  onSelect: (sel: PlannerSelection) => void;
  approved: boolean;
  draggingId: string | null;
  onDragStartRow: () => void;
  onDragEndRow: () => void;
  onMove: (dir: -1 | 1) => void;
  reduced: boolean;
}) {
  const controls = useDragControls();
  const def = AGENT_LIBRARY[id];
  if (!def) return null;

  const edgeSelected =
    selection?.type === "edge" && selection.fromId === prevId && selection.toId === id;
  const agentSelected = selection?.type === "agent" && selection.agentId === id;

  const firstWorkflow = agent.workflowOrder.length
    ? workflowDefById(def, agent.workflowOrder[0])
    : null;

  return (
    <Reorder.Item
      value={id}
      as="div"
      className={`${styles.rowWrap} ${draggingId === id ? styles.rowDragging : ""}`}
      dragListener={false}
      dragControls={controls}
      layout
      initial={reduced ? false : { opacity: 0, y: 16 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: { duration: DUR.card, ease: EASE, delay: index * STAGGER },
      }}
      exit={reduced ? undefined : { opacity: 0, scale: 0.98, transition: { duration: DUR.micro } }}
      whileDrag={reduced ? undefined : { scale: 1.012 }}
      onDragStart={onDragStartRow}
      onDragEnd={onDragEndRow}
      style={{ position: "relative", zIndex: draggingId === id ? 30 : undefined }}
    >
      {prevId && (
        <Connector
          fromId={prevId}
          toId={id}
          fromApprovals={prevAgent?.config.approvalActions.length ?? 0}
          toTrigger={firstWorkflow?.trigger.kind ?? null}
          toolCount={def.integrations.length}
          hidden={draggingId !== null}
          selected={Boolean(edgeSelected)}
          onClick={() => onSelect({ type: "edge", fromId: prevId, toId: id })}
          reduced={reduced}
        />
      )}
      <AgentPlanCard
        agent={agent}
        def={def}
        selected={Boolean(agentSelected)}
        approved={approved}
        onSelect={() => onSelect({ type: "agent", agentId: id })}
        move={
          approved
            ? null
            : {
                up: () => onMove(-1),
                down: () => onMove(1),
                canUp: index > 0,
                canDown: index < count - 1,
              }
        }
        dragHandle={
          approved
            ? null
            : {
                onPointerDown: (e) => {
                  e.preventDefault();
                  controls.start(e);
                },
                onKeyDown: (e) => {
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    onMove(-1);
                  }
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    onMove(1);
                  }
                },
                position: `${index + 1} of ${count}`,
              }
        }
      />
    </Reorder.Item>
  );
}

/* ── The canvas ── */

export default function PlanCanvas({
  selection,
  onSelect,
  approved,
  dropActive,
  libraryDragging,
  dropRef,
}: {
  selection: PlannerSelection;
  onSelect: (sel: PlannerSelection) => void;
  approved: boolean;
  /** A library card is hovering over the drop zone. */
  dropActive: boolean;
  /** A library card is being dragged anywhere (shows the drop target). */
  libraryDragging: boolean;
  dropRef: React.RefObject<HTMLDivElement | null>;
}) {
  const agents = useDemoStore((s) => s.plan.agents);
  const planRules = useDemoStore((s) => s.plan.planRules);
  const reduced = Boolean(useReducedMotion());

  const ids = agents.map((a) => a.agentId);
  const idsKey = ids.join("|");
  const [order, setOrder] = useState<string[]>(ids);
  const orderRef = useRef(order);
  orderRef.current = order;
  const [draggingId, setDraggingId] = useState<string | null>(null);

  /* Keep the local reorder buffer in sync with the store. */
  useEffect(() => {
    setOrder(useDemoStore.getState().plan.agents.map((a) => a.agentId));
  }, [idsKey]);

  const commitOrder = () => {
    setDraggingId(null);
    const next = orderRef.current;
    const current = useDemoStore.getState().plan.agents.map((a) => a.agentId);
    if (next.join("|") !== current.join("|")) {
      useDemoStore.getState().reorderPlanAgents(next);
      toast({
        title: "Plan order updated.",
        tone: "info",
        action: { label: "Undo", onClick: () => useDemoStore.getState().undoPlan() },
      });
    }
  };

  const moveByKeyboard = (id: string, dir: -1 | 1) => {
    const next = [...orderRef.current];
    const i = next.indexOf(id);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    useDemoStore.getState().reorderPlanAgents(next);
    toast({
      title: "Plan order updated.",
      tone: "info",
      action: { label: "Undo", onClick: () => useDemoStore.getState().undoPlan() },
    });
  };

  return (
    <div
      ref={dropRef}
      className={`${styles.dropZone} ${dropActive ? styles.dropZoneActive : ""}`}
    >
      <div className={`oa-card oa-card--flat ${styles.intro}`}>
        <p className="oa-eyebrow">Operations narrative</p>
        <h2 className={`oa-h3 ${styles.introTitle}`}>How your AI workforce will run</h2>
        <p className="oa-sub">
          Work flows top to bottom: each agent hands its output to the next step, and anything
          sensitive pauses for a person. Select a card or a handoff connector to inspect it.
        </p>
        {planRules.length > 0 && (
          <div className={styles.ruleList}>
            <p className="oa-micro">Plan rules: human approval</p>
            <AnimatePresence initial={false}>
              {planRules.map((rule) => (
                <motion.p
                  key={rule}
                  className={styles.ruleChip}
                  initial={reduced ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: DUR.micro, ease: EASE }}
                >
                  <ShieldCheck size={13} aria-hidden />
                  {rule}
                </motion.p>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <Reorder.Group
        axis="y"
        values={order}
        onReorder={setOrder}
        as="div"
        className={styles.canvasList}
      >
        <AnimatePresence initial={false}>
          {order.map((id, index) => {
            const agent = agents.find((a) => a.agentId === id);
            if (!agent) return null;
            const prevId = index > 0 ? order[index - 1] : null;
            return (
              <CanvasRow
                key={id}
                id={id}
                index={index}
                count={order.length}
                agent={agent}
                prevId={prevId}
                prevAgent={prevId ? agents.find((a) => a.agentId === prevId) ?? null : null}
                selection={selection}
                onSelect={onSelect}
                approved={approved}
                draggingId={draggingId}
                onDragStartRow={() => setDraggingId(id)}
                onDragEndRow={commitOrder}
                onMove={(dir) => moveByKeyboard(id, dir)}
                reduced={reduced}
              />
            );
          })}
        </AnimatePresence>
      </Reorder.Group>

      <AnimatePresence initial={false}>
        {!approved && libraryDragging && (
          <motion.p
            className={`${styles.placeholder} ${dropActive ? styles.placeholderActive : ""}`}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.micro, ease: EASE }}
            role="status"
          >
            <Plus size={15} aria-hidden />
            {dropActive ? "Release to add to your plan" : "Drop to add to plan"}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
