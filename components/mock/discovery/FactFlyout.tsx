"use client";
/**
 * FactFlyout — after an answer is confirmed, the extracted facts appear as
 * chips and then fly up toward the "What Oriant knows" tab (spec §9.1 step 4).
 * Render inside an AnimatePresence block; the exit animation is the fly-out.
 */
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import type { KnowledgeFact } from "@/lib/mock/types";
import { DUR, EASE } from "@/lib/mock/motion";
import styles from "./discovery.module.css";

export default function FactFlyout({ facts }: { facts: KnowledgeFact[] }) {
  const reduced = useReducedMotion();
  return (
    <div className={styles.flyout}>
      <p className={styles.flyNote} aria-live="polite">
        <ArrowUpRight size={14} aria-hidden />
        {facts.length} fact{facts.length === 1 ? "" : "s"} saved to What Oriant knows
      </p>
      <div className={styles.flyChips}>
        {facts.map((f, i) => (
          <motion.span
            key={f.id}
            className={styles.flyChip}
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { duration: DUR.card, ease: EASE, delay: reduced ? 0 : i * 0.08 },
            }}
            exit={
              reduced
                ? { opacity: 0, transition: { duration: 0.1 } }
                : {
                    opacity: 0,
                    y: -36,
                    x: 28,
                    scale: 0.92,
                    transition: { duration: 0.4, ease: EASE, delay: i * 0.05 },
                  }
            }
          >
            <span className={styles.flyChipLabel}>{f.label}</span>
            <span className={styles.flyChipValue}>{f.value}</span>
          </motion.span>
        ))}
      </div>
    </div>
  );
}
