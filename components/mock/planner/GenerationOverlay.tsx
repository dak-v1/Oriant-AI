"use client";
/**
 * GenerationOverlay — the full-canvas planner generation state (spec §11,
 * §22): five visible stages over ~8s, a staged checklist, honest sim label
 * and a Skip animation escape hatch that is never gated behind the motion.
 */
import { motion, useReducedMotion } from "framer-motion";
import { Check, ListChecks, LoaderCircle } from "lucide-react";
import { DUR, EASE } from "@/lib/mock/motion";
import styles from "./planner.module.css";

export default function GenerationOverlay({
  stages,
  done,
  reportVersion,
  onSkip,
}: {
  stages: string[];
  /** Count of completed stages (0..stages.length). */
  done: number;
  reportVersion: number;
  onSkip: () => void;
}) {
  const reduced = useReducedMotion();
  const pct = Math.round((done / stages.length) * 100);

  return (
    <section className={styles.genWrap} aria-label="Planner is generating the workforce plan">
      <motion.div
        className={`oa-card ${styles.genCard}`}
        initial={reduced ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.page, ease: EASE }}
      >
        <span className={styles.genOrb} aria-hidden>
          <ListChecks size={22} />
        </span>
        <p className="oa-eyebrow">AI Workforce Planner</p>
        <h2 className="oa-h2">Planner is reading Company Report v{reportVersion}…</h2>
        <p className="oa-sub">
          Matching your confirmed needs to preset agents, and designing what no preset covers.
        </p>

        <div className="oa-progress" aria-hidden>
          <span style={{ width: `${pct}%` }} />
        </div>

        <ol className={styles.genStages} aria-live="polite">
          {stages.map((stage, i) => {
            const state = i < done ? "done" : i === done ? "active" : "todo";
            return (
              <li
                key={stage}
                className={`${styles.genStage} ${
                  state === "done" ? styles.genStageDone : state === "active" ? styles.genStageActive : ""
                }`}
              >
                <span className={styles.genIcon} aria-hidden>
                  {state === "done" ? (
                    <Check size={12} />
                  ) : state === "active" ? (
                    <LoaderCircle size={12} className="oa-spin" />
                  ) : null}
                </span>
                {stage}
                {state === "done" && (
                  <span className={`oa-micro ${styles.genDoneTag}`}>Done</span>
                )}
              </li>
            );
          })}
        </ol>

        <div className={styles.genFoot}>
          <span className="oa-sim-note">Simulated planning run: a prepared demo plan</span>
          <button type="button" className="oa-btn oa-btn--ghost oa-btn--sm" onClick={onSkip}>
            Skip animation
          </button>
        </div>
      </motion.div>
    </section>
  );
}
