"use client";
/**
 * PlanCanvas — the centre operations narrative (spec §11.1, §11.6): intro
 * block with expected outcomes and pinned plan rules, agent cards connected
 * by animated, clickable handoff connectors, Reorder.Group drag-to-reorder
 * (with a keyboard path on each drag handle) and the library drop zone.
 */
import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  Reorder,
  useDragControls,
  useReducedMotion,
} from "framer-motion";
import { ArrowDown, Check, ShieldCheck } from "lucide-react";
import { AGENT_LIBRARY, PLAN_OUTCOMES } from "@/lib/mock/fixtures/agent-library";
import type { PlanAgent } from "@/lib/mock/types";
import { useDemoStore } from "@/lib/mock/store";
import { toast } from "@/components/mock/ui/Toaster";
import { DUR, EASE, STAGGER } from "@/lib/mock/motion";
import AgentPlanCard from "./AgentPlanCard";
import type { PlannerSelection } from "./planner-utils";
import styles from "./planner.module.css";

/* ── Connector between two agent cards (spec §11.6) ── */

function Connector({
  fromId,
  toId,
  hidden,
  selected,
  onClick,
  reduced,
}: {
  fromId: string;
  toId: string;
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
      <svg className={styles.connectorSvg} width="24" height="56" viewBox="0 0 24 56" aria-hidden>
        <path
          d="M12 2 V54"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeDasharray="3 6"
          style={{ animation: reduced ? undefined : "oa-dash 1.6s linear infinite" }}
        />
      </svg>
      <span className={styles.connectorPill}>
        <ArrowDown size={11} aria-hidden />
        Handoff
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

  return (
    <Reorder.Item
      value={id}
      as="div"
      className={styles.rowWrap}
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
      onDragStart={onDragStartRow}
      onDragEnd={onDragEndRow}
      style={{ position: "relative", zIndex: draggingId === id ? 30 : undefined }}
    >
      {prevId && (
        <Connector
          fromId={prevId}
          toId={id}
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
  dropRef,
}: {
  selection: PlannerSelection;
  onSelect: (sel: PlannerSelection) => void;
  approved: boolean;
  dropActive: boolean;
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
        <h2 className={`oa-h2 ${styles.introTitle}`}>How your AI workforce will run</h2>
        <p className="oa-sub">
          Work flows top to bottom: each agent hands its output to the next step, and anything
          sensitive pauses for a person. Select a card or a handoff connector to inspect it.
        </p>
        <div className="oa-cluster" style={{ gap: 6 }}>
          {PLAN_OUTCOMES.map((outcome) => (
            <span key={outcome} className={styles.outcomeChip}>
              <Check size={11} aria-hidden />
              {outcome}
            </span>
          ))}
        </div>
        {planRules.length > 0 && (
          <div className={styles.ruleList}>
            <p className="oa-micro">Plan rules — human approval</p>
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

      <AnimatePresence initial={false}>
        {dropActive && (
          <motion.p
            className={styles.dropHint}
            initial={reduced ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.micro, ease: EASE }}
          >
            Release to add the agent to your plan
          </motion.p>
        )}
      </AnimatePresence>

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
            return (
              <CanvasRow
                key={id}
                id={id}
                index={index}
                count={order.length}
                agent={agent}
                prevId={index > 0 ? order[index - 1] : null}
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
    </div>
  );
}
