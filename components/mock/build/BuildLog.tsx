"use client";
/**
 * BuildLog — the streaming per-job build log on the dark .oa-code surface
 * (spec §14). Lines are fixture content revealed up to logCount; tones map
 * to ok (teal) / warn (amber) / info (default). aria-live announces new
 * lines; the container auto-scrolls (jump-scroll under reduced motion).
 */
import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { BuildLogLine } from "@/lib/mock/types";
import { EASE } from "@/lib/mock/motion";
import styles from "./build.module.css";

export default function BuildLog({
  lines,
  running,
  agentName,
}: {
  lines: BuildLogLine[];
  running: boolean;
  agentName: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();

  /* Follow the newest line. Reduced motion: instant jump, no smooth travel. */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) el.scrollTop = el.scrollHeight;
    else el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [lines.length, running, reduced]);

  return (
    <div
      ref={ref}
      role="log"
      aria-live="polite"
      aria-label={`${agentName} build log`}
      tabIndex={0}
      className={`oa-code ${styles.log}`}
    >
      {lines.length === 0 && (
        <div className={`${styles.logLine} ${styles.logIdle}`}>
          <span className={styles.logTime} aria-hidden>
            --
          </span>
          <span>Queued, waiting for a build slot…</span>
        </div>
      )}
      {lines.map((line, i) => (
        <motion.div
          key={i}
          className={styles.logLine}
          initial={reduced ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: EASE }}
        >
          <span className={styles.logTime} aria-hidden>
            {(line.at / 1000).toFixed(1)}s
          </span>
          <span className={line.tone === "ok" ? "tok-s" : line.tone === "warn" ? styles.logWarn : undefined}>
            {line.text}
          </span>
        </motion.div>
      ))}
      {running && !reduced && (
        <div className={styles.logLine} aria-hidden>
          <span className={styles.logTime} />
          <span className={styles.cursor}>▍</span>
        </div>
      )}
    </div>
  );
}
