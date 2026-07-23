"use client";
/**
 * PlannerControls — the sticky bar under the shell progress (spec §11.1):
 * plan version + stale tag, regenerate, undo/redo, animated illustrative
 * cost totals, and the screen's ONE primary action (Confirm workforce plan).
 * In the approved read-only state the editing controls disappear.
 */
import { useEffect, useState } from "react";
import { animate, useMotionValue, useReducedMotion } from "framer-motion";
import { ArrowRight, PanelRight, Redo2, RefreshCw, Undo2 } from "lucide-react";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { money } from "@/lib/mock/pricing";
import { EASE } from "@/lib/mock/motion";
import styles from "./planner.module.css";

/** Animated money value — counts between totals when the plan changes. */
function AnimatedMoney({ value, suffix = "" }: { value: number; suffix?: string }) {
  const reduced = useReducedMotion();
  const mv = useMotionValue(value);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (reduced) {
      mv.set(value);
      setShown(value);
      return;
    }
    const controls = animate(mv, value, {
      duration: 0.55,
      ease: EASE,
      onUpdate: (v) => setShown(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, reduced, mv]);

  return (
    <span className={styles.costValue}>
      {money(shown)}
      {suffix}
    </span>
  );
}

export default function PlannerControls({
  version,
  stale,
  approved,
  canUndo,
  canRedo,
  setup,
  monthly,
  onUndo,
  onRedo,
  onRegenerate,
  onConfirm,
  onOpenSummary,
}: {
  version: number;
  stale: boolean;
  approved: boolean;
  canUndo: boolean;
  canRedo: boolean;
  setup: number;
  monthly: number;
  onUndo: () => void;
  onRedo: () => void;
  onRegenerate: () => void;
  onConfirm: () => void;
  onOpenSummary: () => void;
}) {
  return (
    <div className={styles.controls}>
      <span className={styles.versionChip}>
        Plan v{version}
        {stale && !approved && <span className="oa-tag oa-tag--amber">Stale</span>}
        {approved && <StatusBadge status="approved" />}
      </span>

      {!approved && (
        <>
          <button
            type="button"
            className="oa-btn oa-btn--ghost oa-btn--sm"
            onClick={onRegenerate}
          >
            <RefreshCw size={13} aria-hidden />
            Regenerate
          </button>
          <div className={styles.historyBtns}>
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--icon"
              onClick={onUndo}
              disabled={!canUndo}
              aria-label="Undo the last plan change"
            >
              <Undo2 size={15} aria-hidden />
            </button>
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--icon"
              onClick={onRedo}
              disabled={!canRedo}
              aria-label="Redo the last undone plan change"
            >
              <Redo2 size={15} aria-hidden />
            </button>
          </div>
        </>
      )}

      <button
        type="button"
        className={`oa-btn oa-btn--ghost oa-btn--icon ${styles.summaryBtn}`}
        onClick={onOpenSummary}
        aria-label="Open the plan summary panel"
      >
        <PanelRight size={15} aria-hidden />
      </button>

      <div className={styles.controlsSpacer} />

      <div className={styles.costBlock} aria-live="polite">
        <div className={styles.costItem}>
          <AnimatedMoney value={setup} />
          <span className={styles.costLabel}>Setup</span>
        </div>
        <div className={styles.costItem}>
          <AnimatedMoney value={monthly} suffix="/mo" />
          <span className={styles.costLabel}>Monthly</span>
        </div>
        <span className={styles.costNote}>Illustrative pricing</span>
      </div>

      {!approved && (
        <button type="button" className="oa-btn oa-btn--primary" onClick={onConfirm}>
          Confirm workforce plan
          <ArrowRight size={15} aria-hidden />
        </button>
      )}
    </div>
  );
}
