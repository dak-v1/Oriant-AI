"use client";
/**
 * PlannerControls — the sticky header bar (spec §11.1, improvement spec
 * §12.1): plan version chip + stale tag, approval-readiness chip (opens the
 * Gate 2 review), regenerate, undo/redo and animated illustrative cost
 * totals. The screen's primary action (Confirm workforce plan) lives in the
 * approval footer. In the approved read-only state editing controls disappear.
 */
import { useEffect, useState } from "react";
import { animate, useMotionValue, useReducedMotion } from "framer-motion";
import { CircleCheckBig, PanelRight, Redo2, RefreshCw, TriangleAlert, Undo2 } from "lucide-react";
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
  unresolved,
  onUndo,
  onRedo,
  onRegenerate,
  onOpenGate,
  onOpenSummary,
}: {
  version: number;
  stale: boolean;
  approved: boolean;
  canUndo: boolean;
  canRedo: boolean;
  setup: number;
  monthly: number;
  /** Count of unresolved readiness items (planBlockers). */
  unresolved: number;
  onUndo: () => void;
  onRedo: () => void;
  onRegenerate: () => void;
  onOpenGate: () => void;
  onOpenSummary: () => void;
}) {
  const ready = unresolved === 0;
  return (
    <div className={styles.controls}>
      <span className={styles.versionChip}>
        Plan v{version}
        {stale && !approved && <span className="oa-tag oa-tag--amber">Stale</span>}
        {approved && <StatusBadge status="approved" />}
      </span>

      {!approved && (
        <button
          type="button"
          className={`${styles.readyChip} ${ready ? styles.readyChipOk : styles.readyChipWarn}`}
          onClick={onOpenGate}
          aria-label={
            ready
              ? "Approval readiness: ready. Open the readiness review."
              : `Approval readiness: ${unresolved} item${unresolved === 1 ? "" : "s"} unresolved. Open the readiness review.`
          }
        >
          {ready ? (
            <CircleCheckBig size={13} aria-hidden />
          ) : (
            <TriangleAlert size={13} aria-hidden />
          )}
          {ready ? "Ready for approval" : `${unresolved} item${unresolved === 1 ? "" : "s"} unresolved`}
        </button>
      )}

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
    </div>
  );
}
