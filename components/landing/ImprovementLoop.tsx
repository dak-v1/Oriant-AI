"use client";

/**
 * ImprovementLoop — continuous improvement (redesign brief §15).
 *
 * Primary motion concept (one animated entry cycle, then a live ambient loop):
 *   settled → primed  (instant pre-animation frame; mount effect,
 *                      motion-allowed clients only)
 *           → drawing (ring stroke draws over DUR.mask; the six loop
 *                      chips pop in clockwise with a 0.12s stagger)
 *           → dotting (an accent dot rides ONE full revolution via SMIL
 *                      animateMotion, 4s, begun from the entry effect)
 *           → done    (dot settles at "Improve": the chip gains its teal
 *                      fill and the agent card's tag crossfades v2 → v3)
 *   …then AMBIENT: while the stage is near view AND the tab is visible
 *   (`.stageRun`, FinalCTA's `.running` pattern — useInView no-once +
 *   document.hidden), a CSS offset-path dot repeats a slow revolution
 *   every 8s, each chip pulses a ::after glow as the dot passes it
 *   (staggered CSS animation synced to the same 8s period), and the
 *   central agent card breathes (scale 1 → 1.012, 6s alternate).
 *
 * Base render = the settled/final frame, so no-JS and reduced-motion
 * visitors see the finished, already-approved diagram: ambient loops are
 * `animation-play-state: paused` at their complete base frame, and the
 * reduced-motion media block hides both dots outright. Reduced-motion
 * clients also never leave "settled", so `.stageRun` is never applied.
 * useReducedMotion is never used to branch the render tree — the media
 * query gates the priming effect only (contract hydration rule).
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useInView } from "framer-motion";
import { Check, RefreshCw } from "lucide-react";
import { IMPROVEMENT } from "@/lib/landing-content";
import SectionReveal from "./SectionReveal";
import { DUR } from "./motion";
import styles from "./ImprovementLoop.module.css";

type Phase = "settled" | "primed" | "drawing" | "dotting" | "done";
type SmilElement = SVGElement & { beginElement: () => void };

/* ── Circle geometry (module-level: deterministic, hydration-safe) ────── */

const VB = 460;
const CENTER = VB / 2;
const RADIUS = 184;
const CHIP_RADIUS_PCT = (RADIUS / VB) * 100; // chips sit exactly on the ring

const pointAt = (deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return {
    x: Number((CENTER + RADIUS * Math.cos(rad)).toFixed(2)),
    y: Number((CENTER + RADIUS * Math.sin(rad)).toFixed(2)),
  };
};

/* Ambient revolution period + glow-pulse peak offset. BOTH are duplicated in
   ImprovementLoop.module.css (8s animations; chip pulse peaks at 5% = 0.4s)
   — keep them in sync. */
const AMBIENT_S = 8;
const GLOW_PEAK_S = 0.4;

/* Six stops clockwise from 12 o'clock: Run at the top. The ambient dot departs
   from "Improve", so it reaches stop i at (i+1)/6 of each 8s revolution — each
   chip's ::after glow is delayed to peak exactly as the dot passes. */
const STOPS = IMPROVEMENT.loop.map((label, i) => {
  const rad = ((-90 + i * 60) * Math.PI) / 180;
  return {
    label,
    left: `${(50 + CHIP_RADIUS_PCT * Math.cos(rad)).toFixed(2)}%`,
    top: `${(50 + CHIP_RADIUS_PCT * Math.sin(rad)).toFixed(2)}%`,
    teal: label === "Approve",
    improve: label === "Improve",
    /* clockwise pop: 0.12s stagger on a 0.3s lead-in */
    delay: `${(0.3 + i * 0.12).toFixed(2)}s`,
    /* ambient glow delay: dot arrival minus the keyframe peak offset */
    glow: `${(((i + 1) / 6) * AMBIENT_S - GLOW_PEAK_S).toFixed(2)}s`,
  };
});

/* Direction arrowheads at segment midpoints, rotated to the clockwise tangent. */
const ARROWS = Array.from({ length: 6 }, (_, i) => {
  const deg = -60 + i * 60;
  const { x, y } = pointAt(deg);
  return { x, y, rot: deg + 90 };
});

const TOP_PT = pointAt(-90); // "Run"
const BOTTOM_PT = pointAt(90);
const IMPROVE_PT = pointAt(210); // "Improve"
const IMPROVE_OPP_PT = pointAt(30);

/* Ring draws clockwise starting at "Run". */
const RING_D = `M ${TOP_PT.x} ${TOP_PT.y} A ${RADIUS} ${RADIUS} 0 0 1 ${BOTTOM_PT.x} ${BOTTOM_PT.y} A ${RADIUS} ${RADIUS} 0 0 1 ${TOP_PT.x} ${TOP_PT.y}`;
/* Dot path: one full clockwise revolution starting AND settling at "Improve".
   The SAME path string is duplicated as the ambient dot's CSS offset-path in
   ImprovementLoop.module.css — keep them in sync. */
const DOT_PATH = `M ${IMPROVE_PT.x} ${IMPROVE_PT.y} A ${RADIUS} ${RADIUS} 0 0 1 ${IMPROVE_OPP_PT.x} ${IMPROVE_OPP_PT.y} A ${RADIUS} ${RADIUS} 0 0 1 ${IMPROVE_PT.x} ${IMPROVE_PT.y}`;

/* Ring draw (DUR.mask) + clockwise chip pops finish before the dot departs. */
const DRAW_MS = Math.round((DUR.mask + 0.35) * 1000);
const DOT_SECONDS = 4;

/* Heading accent — copy comes from landing-content; only the split is local. */
const SERIF_WORD = "improve";
const serifIdx = IMPROVEMENT.heading.indexOf(SERIF_WORD);
const headStart =
  serifIdx >= 0 ? IMPROVEMENT.heading.slice(0, serifIdx) : IMPROVEMENT.heading;
const headEnd =
  serifIdx >= 0 ? IMPROVEMENT.heading.slice(serifIdx + SERIF_WORD.length) : "";

/* The six learning inputs (tiny UI labels, brief §15). */
const SIGNALS = [
  "Completed tasks",
  "Owner edits",
  "Approval outcomes",
  "Failures",
  "Escalations",
  "Operational context",
] as const;

/* Central agent card. The animated variant carries the v2 → v3 crossfade, the
   "Improved" tag reveal, and the ambient breathing loop; the mobile-fallback
   variant is statically final. */
function AgentCard({ animated }: { animated: boolean }) {
  return (
    <div
      className={
        animated
          ? `${styles.agentCard} ${styles.centerCard}`
          : `${styles.agentCard} ${styles.fallbackCard}`
      }
    >
      <span className={`lp-micro ${styles.centerMicro}`}>Deployed agent</span>
      <span className={styles.agentRow}>
        <span className={styles.agentName}>Support Agent</span>
        {animated ? (
          <span className={styles.versionStack}>
            <span className={`${styles.vChip} ${styles.vPrev}`} aria-hidden="true">
              v2
            </span>
            <span className={`${styles.vChip} ${styles.vNext}`}>v3</span>
          </span>
        ) : (
          <span className={styles.vChip}>v3</span>
        )}
      </span>
      <span
        className={
          animated
            ? `lp-tag lp-tag--teal ${styles.improvedTag}`
            : "lp-tag lp-tag--teal"
        }
      >
        <Check size={14} strokeWidth={2} aria-hidden="true" />
        Improved
      </span>
    </div>
  );
}

export default function ImprovementLoop() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dotAnimRef = useRef<SmilElement | null>(null);
  const [phase, setPhase] = useState<Phase>("settled");
  const [dotLive, setDotLive] = useState(false);
  const stageInView = useInView(stageRef, {
    once: true,
    margin: "0px 0px -140px 0px",
  });

  /* Ambient gate — FinalCTA's `.running` pattern: near view (no `once`) AND
     document visible. Both resolve false/true only after mount, so the class
     is absent on the server AND the first client render (hydration-safe). */
  const nearView = useInView(stageRef, { margin: "200px" });
  const [docVisible, setDocVisible] = useState(true);
  useEffect(() => {
    const onVis = () => setDocVisible(!document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  /* Only after the entry cycle has fully completed does the loop go ambient.
     Reduced-motion clients never leave "settled", so this stays false and
     nothing ever moves for them. */
  const ambient = phase === "done" && nearView && docVisible;

  /* Prime the hidden pre-animation frame — motion-allowed clients only.
     Reduced-motion and no-JS visitors keep the settled base frame. */
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setPhase((p) => (p === "settled" ? "primed" : p));
  }, []);

  /* Entry trigger: play the single cycle when the stage first enters view. */
  useEffect(() => {
    if (stageInView) setPhase((p) => (p === "primed" ? "drawing" : p));
  }, [stageInView]);

  /* One-shot entry sequence: drawing → dotting → done. The repeating ambient
     revolution afterwards is pure CSS, gated by `.stageRun` above. */
  useEffect(() => {
    if (phase === "drawing") {
      const t = window.setTimeout(() => setPhase("dotting"), DRAW_MS);
      return () => window.clearTimeout(t);
    }
    if (phase === "dotting") {
      const anim = dotAnimRef.current;
      if (anim && typeof anim.beginElement === "function") {
        try {
          anim.beginElement();
          setDotLive(true);
        } catch {
          /* SMIL unavailable — the dot simply stays hidden */
        }
      }
      const t = window.setTimeout(
        () => setPhase("done"),
        DOT_SECONDS * 1000 + 80,
      );
      return () => window.clearTimeout(t);
    }
    if (phase === "done") setDotLive(false);
    return undefined;
  }, [phase]);

  return (
    <section className="lp-section">
      <div className="lp-container">
        <div className={styles.grid}>
          <SectionReveal className={styles.copy}>
            <span className="lp-eyebrow">{IMPROVEMENT.eyebrow}</span>
            <h2 className="lp-h2-sm">
              {headStart}
              <span className="lp-serif">{SERIF_WORD}</span>
              {headEnd}
            </h2>
            <p className="lp-lead">{IMPROVEMENT.body}</p>
            <div className={styles.note}>
              <RefreshCw
                size={16}
                strokeWidth={2}
                aria-hidden="true"
                className={styles.noteIcon}
              />
              <p>{IMPROVEMENT.note}</p>
            </div>
          </SectionReveal>

          <div className={styles.stageCol}>
            <div
              ref={stageRef}
              className={`lp-card lp-stage-grid ${styles.stage}${
                ambient ? ` ${styles.stageRun}` : ""
              }`}
              data-phase={phase}
            >
              {/* Desktop / tablet: the circular loop */}
              <div className={styles.loopArea}>
                <div className={`lp-glow-teal ${styles.glow}`} aria-hidden="true" />
                <svg
                  className={styles.ringSvg}
                  viewBox={`0 0 ${VB} ${VB}`}
                  aria-hidden="true"
                  focusable="false"
                >
                  <path className={styles.ring} d={RING_D} pathLength={1} />
                  <g className={styles.arrows}>
                    {ARROWS.map((a) => (
                      <path
                        key={`${a.x}:${a.y}`}
                        d="M -4.5 -3.4 L 5 0 L -4.5 3.4 Z"
                        transform={`translate(${a.x} ${a.y}) rotate(${a.rot})`}
                      />
                    ))}
                  </g>
                  <g
                    className={`${styles.dotWrap} ${dotLive ? styles.dotOn : ""}`.trim()}
                  >
                    <circle className={styles.dotHalo} r="13" />
                    <circle className={styles.dot} r="6.5" />
                    <animateMotion
                      ref={(el) => {
                        dotAnimRef.current = el as SmilElement | null;
                      }}
                      dur={`${DOT_SECONDS}s`}
                      begin="indefinite"
                      fill="freeze"
                      calcMode="spline"
                      keyTimes="0;1"
                      keySplines="0.45 0 0.2 1"
                      path={DOT_PATH}
                    />
                  </g>
                  {/* Ambient dot: repeats the revolution every 8s via CSS
                      offset-path while .stageRun; hidden at its base frame. */}
                  <circle className={styles.ambientDot} r="6.5" />
                </svg>
                <ol
                  className={styles.stops}
                  role="list"
                  aria-label="Improvement cycle"
                >
                  {STOPS.map((s) => (
                    <li
                      key={s.label}
                      className={styles.stop}
                      style={
                        {
                          left: s.left,
                          top: s.top,
                          "--d": s.delay,
                          "--gd": s.glow,
                        } as CSSProperties
                      }
                    >
                      <span className={styles.stopInner}>
                        <span
                          className={`${styles.chip} ${s.teal ? styles.chipTeal : ""}`.trim()}
                        >
                          {s.label}
                        </span>
                        {s.improve ? (
                          <span
                            className={`${styles.chip} ${styles.chipTealOverlay}`}
                            aria-hidden="true"
                          >
                            {s.label}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ol>
                <AgentCard animated />
              </div>

              {/* Mobile (<600px): 2×3 chip grid with a curved return arrow */}
              <div className={styles.fallback}>
                <AgentCard animated={false} />
                <div className={styles.fallbackLoop}>
                  <ol
                    className={styles.fallbackGrid}
                    role="list"
                    aria-label="Improvement cycle"
                  >
                    {IMPROVEMENT.loop.map((label) => (
                      <li
                        key={label}
                        className={`${styles.cellChip} ${
                          label === "Approve" || label === "Improve"
                            ? styles.cellChipTeal
                            : ""
                        }`.trim()}
                      >
                        {label}
                      </li>
                    ))}
                  </ol>
                  <svg
                    className={styles.returnArrow}
                    viewBox="0 0 26 170"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path className={styles.returnDash} d="M4 164 C 24 132, 24 42, 7 12" />
                    <path d="M12.5 18 L7 8.5 L2.5 19" />
                  </svg>
                </div>
              </div>

              {/* The six inputs feeding the loop */}
              <div className={styles.signals}>
                <span className={`lp-micro ${styles.signalsLabel}`}>
                  Signals the loop learns from
                </span>
                <ul className={styles.signalList} role="list">
                  {SIGNALS.map((s) => (
                    <li key={s} className={`lp-micro ${styles.signalChip}`}>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
