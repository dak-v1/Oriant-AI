"use client";
/**
 * CompileOverlay — the "Compile company report" moment: the four discovery
 * analysis stages play over ~6s (spec §22) as a staged checklist, then the
 * journey advances to report review. Skippable, honest about being simulated,
 * instant under reduced motion.
 */
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, FileText, Loader2 } from "lucide-react";
import { DISCOVERY_STAGES } from "@/lib/mock/fixtures/workflow-plan";
import { mockDiscoveryService } from "@/lib/mock/services";
import type { TimelineHandle } from "@/lib/mock/services/timeline";
import { DUR, EASE } from "@/lib/mock/motion";
import styles from "./discovery.module.css";

export default function CompileOverlay({ onFinished }: { onFinished: () => void }) {
  const reduced = useReducedMotion();
  const [stageIdx, setStageIdx] = useState(-1);
  const handleRef = useRef<TimelineHandle | null>(null);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneRef = useRef(false);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useEffect(() => {
    const instant = Boolean(reduced);
    const handle = mockDiscoveryService.analyse(
      DISCOVERY_STAGES,
      (_stage, i) => setStageIdx(i),
      { instant },
    );
    handleRef.current = handle;
    handle.done.then((finished) => {
      if (!finished || doneRef.current) return;
      doneRef.current = true;
      // brief settle so the completed checklist is readable
      settleRef.current = setTimeout(() => onFinishedRef.current(), instant ? 0 : 650);
    });
    return () => {
      handle.cancel();
      if (settleRef.current) clearTimeout(settleRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skip = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    handleRef.current?.cancel();
    if (settleRef.current) clearTimeout(settleRef.current);
    setStageIdx(DISCOVERY_STAGES.length - 1);
    onFinishedRef.current();
  };

  const done = stageIdx >= DISCOVERY_STAGES.length - 1;

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Compiling your company report"
      onKeyDown={(e) => {
        if (e.key === "Escape") skip();
      }}
    >
      <motion.div
        className={styles.overlayScrim}
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DUR.micro }}
        aria-hidden
      />
      <motion.div
        className={`oa-card ${styles.overlayCard}`}
        initial={reduced ? false : { opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: DUR.card, ease: EASE }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "var(--oa-soft-blue)",
              color: "var(--oa-blue-dark)",
              display: "grid",
              placeItems: "center",
              flex: "none",
            }}
            aria-hidden
          >
            <FileText size={18} />
          </span>
          <div style={{ display: "grid", gap: 2 }}>
            <h2 className="oa-h3">Compiling your company report</h2>
            <p className="oa-sub">
              Everything you confirmed becomes an editable report you approve before planning.
            </p>
          </div>
        </div>

        <ol className={styles.stageList} aria-live="polite" style={{ gap: 4 }}>
          {DISCOVERY_STAGES.map((stage, i) => {
            const isDone = i < stageIdx || done;
            const isActive = i === stageIdx && !done;
            return (
              <li
                key={stage}
                className={`${styles.stageRow} ${
                  isActive ? styles.stageRowActive : isDone ? styles.stageRowDone : ""
                }`}
              >
                <span
                  className={`${styles.stageDot} ${
                    isDone ? styles.stageDotDone : isActive ? styles.stageDotActive : ""
                  }`}
                  aria-hidden
                >
                  {isDone ? (
                    <Check size={13} />
                  ) : isActive ? (
                    <Loader2 size={13} className="oa-spin" />
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 800 }}>{i + 1}</span>
                  )}
                </span>
                {stage}
              </li>
            );
          })}
        </ol>

        <div className="oa-progress" aria-hidden>
          <span
            style={{
              width: `${Math.max(6, ((stageIdx + 1) / DISCOVERY_STAGES.length) * 100)}%`,
            }}
          />
        </div>

        <div className="oa-between">
          <span className="oa-sim-note">Simulated analysis — a prepared demo report is assembled.</span>
          <button type="button" className="oa-btn oa-btn--ghost oa-btn--sm" onClick={skip} autoFocus>
            Skip animation
          </button>
        </div>
      </motion.div>
    </div>
  );
}
