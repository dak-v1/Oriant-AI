"use client";
/**
 * CanvasGrid — the editable 9-block Lean Canvas (spec §8).
 *
 * Classic Lean Canvas layout on desktop (grid-template-areas), two columns
 * at ≤1024px, stacked at ≤768px. Every block is inline-editable on click.
 * Both intake paths (upload + guided) end here.
 */
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Pencil } from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import { LEAN_CANVAS_BLOCKS } from "@/lib/mock/fixtures/lean-canvas";
import type { LeanCanvasBlockId } from "@/lib/mock/types";
import { DUR, EASE, STAGGER } from "@/lib/mock/motion";
import styles from "./onboarding.module.css";

const AREA_CLASS: Record<LeanCanvasBlockId, string> = {
  problem: styles.areaProblem,
  "customer-segments": styles.areaSegments,
  "unique-value-proposition": styles.areaUvp,
  solution: styles.areaSolution,
  channels: styles.areaChannels,
  "revenue-streams": styles.areaRevenue,
  "cost-structure": styles.areaCost,
  "key-metrics": styles.areaMetrics,
  "unfair-advantage": styles.areaUnfair,
};

export default function CanvasGrid() {
  const values = useDemoStore((s) => s.leanCanvas.values);
  const setCanvasValue = useDemoStore((s) => s.setCanvasValue);
  const reduced = useReducedMotion();

  const [editingId, setEditingId] = useState<LeanCanvasBlockId | null>(null);
  const [draft, setDraft] = useState("");

  const startEdit = (id: LeanCanvasBlockId, current: string) => {
    setEditingId(id);
    setDraft(current);
  };

  const save = () => {
    if (editingId && draft.trim()) setCanvasValue(editingId, draft.trim());
    setEditingId(null);
  };

  return (
    <motion.div
      className={styles.canvasGrid}
      initial={reduced ? false : "hidden"}
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: STAGGER * 0.6 } } }}
    >
      {LEAN_CANVAS_BLOCKS.map((b, i) => {
        const value = (values[b.id] ?? "").trim();
        const editing = editingId === b.id;
        return (
          <motion.section
            key={b.id}
            className={`oa-card oa-card--flat ${styles.canvasBlock} ${AREA_CLASS[b.id]}`}
            variants={{
              hidden: { opacity: 0, y: 14 },
              show: { opacity: 1, y: 0, transition: { duration: DUR.card, ease: EASE } },
            }}
            aria-label={b.title}
          >
            <header className={styles.blockHead}>
              <span className={styles.blockNum} aria-hidden>
                {i + 1}
              </span>
              <h3 className={styles.blockTitle}>{b.title}</h3>
              {!editing && (
                <button
                  type="button"
                  className={styles.blockIconBtn}
                  aria-label={`Edit ${b.title}`}
                  onClick={() => startEdit(b.id, value)}
                >
                  <Pencil size={13} aria-hidden />
                </button>
              )}
            </header>

            {editing ? (
              <div className={styles.blockEdit}>
                <textarea
                  className="oa-textarea"
                  rows={4}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  aria-label={`${b.title} text`}
                  autoFocus
                />
                <div className="oa-cluster" style={{ justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="oa-btn oa-btn--ghost oa-btn--sm"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="oa-btn oa-btn--soft oa-btn--sm"
                    disabled={!draft.trim()}
                    onClick={save}
                  >
                    <Check size={13} aria-hidden />
                    Save block
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className={styles.blockTextBtn}
                onClick={() => startEdit(b.id, value)}
              >
                {value || (
                  <span className="oa-sub" style={{ fontStyle: "italic" }}>
                    Add {b.title.toLowerCase()}…
                  </span>
                )}
              </button>
            )}
          </motion.section>
        );
      })}
    </motion.div>
  );
}
