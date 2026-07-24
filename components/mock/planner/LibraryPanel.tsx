"use client";
/**
 * LibraryPanel — the "Add more agents" tray beneath the command bar
 * (improvement spec §12.1): search + Preset/Custom filters, fit-score
 * meters, prices, covered-outcome counts, and two paths into the plan.
 * Drag a card up onto the canvas drop target, or use the 44px Add button.
 * Adding a duplicate is a friendly no-op. The tray scrolls horizontally so
 * the canvas above stays the visual primary.
 */
import { useRef, useState } from "react";
import { motion, type PanInfo } from "framer-motion";
import { Check, Plus, Search } from "lucide-react";
import { AGENT_LIBRARY, LIBRARY_ORDER } from "@/lib/mock/fixtures/agent-library";
import type { AgentDef } from "@/lib/mock/types";
import { money } from "@/lib/mock/pricing";
import { useDemoStore } from "@/lib/mock/store";
import { toast } from "@/components/mock/ui/Toaster";
import { formatCostDelta } from "./planner-utils";
import styles from "./planner.module.css";

type Filter = "all" | "preset" | "custom";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "preset", label: "Preset" },
  { id: "custom", label: "Custom" },
];

function addAgent(def: AgentDef) {
  const st = useDemoStore.getState();
  if (st.plan.agents.some((a) => a.agentId === def.id)) {
    toast({
      title: `${def.name} is already in the plan.`,
      detail: "Each agent appears once. Adjust its workflows from the inspector instead.",
      tone: "info",
    });
    return;
  }
  st.addAgentToPlan(def.id);
  toast({
    title: `Added ${def.name} to the plan.`,
    detail: formatCostDelta({ setup: def.setupCost, monthly: def.monthlyCost }),
    tone: "ok",
    action: { label: "Undo", onClick: () => useDemoStore.getState().undoPlan() },
  });
}

function LibraryCard({
  def,
  inPlan,
  dragEnabled,
  dropRef,
  onDropHover,
  onDragStateChange,
}: {
  def: AgentDef;
  inPlan: boolean;
  dragEnabled: boolean;
  dropRef: React.RefObject<HTMLDivElement | null>;
  onDropHover: (over: boolean) => void;
  onDragStateChange: (dragging: boolean) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const rectRef = useRef<{ left: number; top: number; right: number; bottom: number } | null>(null);
  const draggable = dragEnabled && !inPlan;

  const cacheRect = () => {
    const el = dropRef.current;
    if (!el) {
      rectRef.current = null;
      return;
    }
    const r = el.getBoundingClientRect();
    rectRef.current = {
      left: r.left + window.scrollX,
      top: r.top + window.scrollY,
      right: r.right + window.scrollX,
      bottom: r.bottom + window.scrollY,
    };
  };

  const isOver = (info: PanInfo) => {
    const r = rectRef.current;
    if (!r) return false;
    return (
      info.point.x >= r.left &&
      info.point.x <= r.right &&
      info.point.y >= r.top &&
      info.point.y <= r.bottom
    );
  };

  return (
    <motion.div
      className={`${styles.libCard} ${def.source === "custom" ? styles.libCardCustom : ""} ${
        draggable ? styles.libCardDraggable : ""
      }`}
      style={{ position: "relative", zIndex: dragging ? 70 : undefined }}
      drag={draggable}
      dragSnapToOrigin
      dragMomentum={false}
      dragElastic={0.18}
      whileDrag={{ scale: 1.04, boxShadow: "var(--oa-shadow-pop)" }}
      onDragStart={() => {
        cacheRect();
        setDragging(true);
        onDragStateChange(true);
      }}
      onDrag={(_e, info) => onDropHover(isOver(info))}
      onDragEnd={(_e, info) => {
        setDragging(false);
        onDragStateChange(false);
        onDropHover(false);
        if (isOver(info)) addAgent(def);
      }}
    >
      <div className={styles.libTags}>
        <span className={def.source === "preset" ? "oa-tag oa-tag--neutral" : "oa-tag oa-tag--amber"}>
          {def.source === "preset" ? "Preset" : "Custom"}
        </span>
        {inPlan && (
          <span className="oa-tag oa-tag--teal">
            <Check size={10} aria-hidden />
            In plan
          </span>
        )}
      </div>

      <p className={styles.libName}>{def.name}</p>
      <p className={styles.libRole}>{def.role}</p>

      {def.source === "preset" ? (
        <div className={styles.fitRow} aria-label={`Fit score ${def.fitScore} percent`}>
          <span className={styles.fitLabel}>Fit</span>
          <span className={styles.fitBar} aria-hidden>
            <span style={{ width: `${def.fitScore}%` }} />
          </span>
          <span className={styles.fitPct}>{def.fitScore}%</span>
        </div>
      ) : (
        <>
          <p className={styles.tierNote}>Tier 2 · designed from your discovery</p>
          {def.customProposal && <p className={styles.whyCustom}>{def.customProposal.whyCustom}</p>}
        </>
      )}

      <p className={styles.libMeta}>Covers {def.coveredOutcomes.length} outcomes</p>

      <div className={styles.libFoot}>
        <p className={styles.libPrice}>
          {money(def.setupCost)} setup · {money(def.monthlyCost)}/mo
        </p>
        {!inPlan && (
          <button
            type="button"
            className="oa-btn oa-btn--soft oa-btn--sm"
            onClick={() => addAgent(def)}
            aria-label={`Add ${def.name} to the plan`}
          >
            <Plus size={13} aria-hidden />
            Add
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default function LibraryPanel({
  dropRef,
  onDropHover,
  onDragStateChange,
  dragEnabled,
}: {
  dropRef: React.RefObject<HTMLDivElement | null>;
  onDropHover: (over: boolean) => void;
  onDragStateChange: (dragging: boolean) => void;
  dragEnabled: boolean;
}) {
  const agents = useDemoStore((s) => s.plan.agents);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const q = query.trim().toLowerCase();
  const defs = LIBRARY_ORDER.map((id) => AGENT_LIBRARY[id])
    .filter((def): def is AgentDef => Boolean(def))
    .filter((def) => filter === "all" || def.source === filter)
    .filter(
      (def) => !q || def.name.toLowerCase().includes(q) || def.role.toLowerCase().includes(q),
    );

  return (
    <section className={styles.tray} aria-label="Agent library">
      <div className={`oa-card oa-card--flat ${styles.trayPanel}`}>
        <div className={styles.trayHead}>
          <div style={{ display: "grid", gap: 4 }}>
            <h2 className="oa-h3">Add more agents</h2>
            <p className="oa-sub">
              {dragEnabled
                ? "Drag a card onto the plan above, or use Add."
                : "Use Add to place an agent in the plan."}
            </p>
          </div>

          <div className={styles.trayTools}>
            <div className={styles.libSearch}>
              <Search size={14} className={styles.libSearchIcon} aria-hidden />
              <input
                type="search"
                className="oa-input"
                placeholder="Search agents"
                aria-label="Search agents"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className={styles.libFilters} role="group" aria-label="Filter agents by source">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`oa-chip ${filter === f.id ? "oa-chip--selected" : ""}`}
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.trayList}>
          {defs.map((def) => (
            <LibraryCard
              key={def.id}
              def={def}
              inPlan={agents.some((a) => a.agentId === def.id)}
              dragEnabled={dragEnabled}
              dropRef={dropRef}
              onDropHover={onDropHover}
              onDragStateChange={onDragStateChange}
            />
          ))}
          {defs.length === 0 && <p className={styles.libEmpty}>No agents match your search.</p>}
        </div>
      </div>
    </section>
  );
}
