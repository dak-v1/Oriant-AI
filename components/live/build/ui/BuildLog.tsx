"use client";
/**
 * components/live/build/ui/BuildLog.tsx — the mock's dark terminal (spec §14),
 * adapted to show the RUNTIME'S OWN log lines instead of fixture script.
 *
 * ADAPTED FROM components/mock/build/BuildLog.tsx. Same surface (`.oa-code` +
 * the copied module's `.log`), same line anatomy (offset column, tinted text),
 * same blinking cursor, same aria-live/auto-scroll behaviour. What changed is
 * only what the data forced:
 *
 *   LINES ARE `job.logs` FROM /api/runtime/build, VERBATIM. The mock revealed
 *   fixture prose up to `logCount`; here every line is one the runner wrote,
 *   and nothing is reworded, reordered or dropped. The offset column is
 *   computed from the runtime's own instants (line.at − job.startedAt) instead
 *   of the fixture's scripted offsets; a line whose instant will not parse
 *   shows "--" rather than a guess.
 *
 *   REPLAY IS DECLARED, NOT DISGUISED. Real builds finish in milliseconds, so
 *   a terminal that dumped the transcript at once would read as nothing having
 *   happened. When a build THIS TAB ran has just answered (`replayKey` moved),
 *   the real lines are revealed at reading pace — and the card places a
 *   one-line note under this terminal saying the pacing is presentational and
 *   the lines are real. Every other path (page load, polling during a build,
 *   reduced motion) shows every line it has immediately: replaying a log the
 *   user did not just produce would be theatre, which is what got the old
 *   screen replaced.
 *
 *   TONES COME FROM THE RUNTIME'S `level`. info renders plain, warn amber
 *   (the mock's own class), error in the added `.logErr` — the mock's fixtures
 *   never failed, the runtime does. An unknown level renders untinted with its
 *   text intact, same policy as the api layer's open `level` string.
 */

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { EASE } from "@/lib/mock/motion";
import type { LogLineView } from "../api";
import { logLevelClass } from "../format";
import styles from "./build.module.css";

/** Reading pace for a declared replay. Slow enough to follow, short overall. */
const PACE_MS = 320;

/** The offset column: seconds since the job started, from the runtime's clocks. */
function offsetLabel(lineAt: string, baseAt: string | null): string {
  if (baseAt === null) return "--";
  const base = new Date(baseAt).getTime();
  const at = new Date(lineAt).getTime();
  if (Number.isNaN(base) || Number.isNaN(at) || at < base) return "--";
  return `${((at - base) / 1000).toFixed(1)}s`;
}

function toneClass(level: string): string | undefined {
  const tone = logLevelClass(level);
  if (tone === "warn") return styles.logWarn;
  if (tone === "error") return styles.logErr;
  return undefined; // info and unknown levels keep the surface's default ink
}

export default function BuildLog({
  lines,
  startedAt,
  running,
  replayKey,
  agentName,
  emptyText,
}: {
  lines: LogLineView[];
  /** The job's own start instant; offsets fall back to the first line's `at`. */
  startedAt: string | null;
  /** A build of ours is open — show the cursor, follow new lines. */
  running: boolean;
  /**
   * Bumped once per build THIS tab ran, 0 before any. A new value replays the
   * lines at reading pace; an unchanged value shows everything immediately.
   */
  replayKey: number;
  agentName: string;
  /** What an empty terminal means HERE — never the mock's "waiting for a slot". */
  emptyText: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();

  const [shown, setShown] = useState(lines.length);
  /** The last replayKey fully revealed, so a re-render cannot restart the show. */
  const doneKey = useRef(0);

  useEffect(() => {
    // No fresh build from this tab (or reduced motion): every line, at once.
    // This is also the polling path — while our POST is open the store rows
    // grow, and those arrivals are real-time, not a replay.
    if (replayKey === 0 || replayKey === doneKey.current || reduced === true) {
      doneKey.current = replayKey;
      setShown(lines.length);
      return;
    }
    setShown(0);
    let revealed = 0;
    const timer = window.setInterval(() => {
      revealed += 1;
      setShown(revealed);
      if (revealed >= lines.length) {
        doneKey.current = replayKey;
        window.clearInterval(timer);
      }
    }, PACE_MS);
    return () => window.clearInterval(timer);
  }, [replayKey, lines.length, reduced]);

  const visible = lines.slice(0, Math.min(shown, lines.length));
  const replaying = shown < lines.length;
  const base = startedAt ?? lines[0]?.at ?? null;

  /* Follow the newest line. Reduced motion: instant jump, no smooth travel. */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced === true) el.scrollTop = el.scrollHeight;
    else el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [visible.length, running, reduced]);

  return (
    <div
      ref={ref}
      role="log"
      aria-live="polite"
      aria-label={`${agentName} build log`}
      tabIndex={0}
      className={`oa-code ${styles.log}`}
    >
      {visible.length === 0 && !replaying && (
        <div className={`${styles.logLine} ${styles.logIdle}`}>
          <span className={styles.logTime} aria-hidden>
            --
          </span>
          <span>{emptyText}</span>
        </div>
      )}
      {visible.map((line, i) => (
        <motion.div
          key={i}
          className={styles.logLine}
          initial={reduced === true ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: EASE }}
        >
          <span className={styles.logTime} aria-hidden>
            {offsetLabel(line.at, base)}
          </span>
          <span className={toneClass(line.level)}>{line.message}</span>
        </motion.div>
      ))}
      {(running || replaying) && reduced !== true && (
        <div className={styles.logLine} aria-hidden>
          <span className={styles.logTime} />
          <span className={styles.cursor}>▍</span>
        </div>
      )}
    </div>
  );
}
