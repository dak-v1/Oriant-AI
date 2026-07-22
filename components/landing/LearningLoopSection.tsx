"use client";
/**
 * LearningLoopSection — learning & continuous improvement (master brief §7.8).
 * Left: eyebrow + heading + lead + 2x2 proof-point grid.
 * Right: before/after improvement-loop visual on a grid stage card —
 * Draft → Review → Run → Learn chips on a line, with a dashed SVG return
 * path sweeping underneath carrying the "Improved draft" tag, and a small
 * accent dot travelling the full circuit (hidden under reduced motion via CSS).
 */
import { Fragment } from "react";
import {
  ArrowUpRight,
  GitBranch,
  History,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { LEARNING } from "@/lib/landing-content";
import SectionReveal from "./SectionReveal";
import styles from "./LearningLoopSection.module.css";

const PROOF_ICONS = [History, GitBranch, MessageSquare, ArrowUpRight] as const;

const HEADING_ACCENT = "better";

/* Loop-visual coordinate space (px — the stage area is capped at this width) */
const LOOP_W = 420;
const LOOP_H = 156;
/* Visible dashed return path: from under "Learn" back up to under "Draft". */
const RETURN_PATH = "M381 38 C412 104 312 134 210 134 C108 134 8 104 39 38";
/* Full circuit the accent dot travels: along the chip line, then the return
   sweep. The joins sit behind the end chips so transitions stay hidden. */
const CIRCUIT_PATH =
  "M39 24 L381 24 L381 38 C412 104 312 134 210 134 C108 134 8 104 39 38 Z";

/** Wraps one phrase of a heading in the shared serif accent class. */
function AccentHeading({ text, accent }: { text: string; accent: string }) {
  const idx = text.indexOf(accent);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="lp-serif">{accent}</span>
      {text.slice(idx + accent.length)}
    </>
  );
}

/** Short connector segment with a tiny arrowhead, joining loop chips. */
function Connector() {
  return (
    <svg
      className={styles.connector}
      width="24"
      height="10"
      viewBox="0 0 24 10"
      aria-hidden="true"
      focusable="false"
    >
      <line
        x1="1"
        y1="5"
        x2="16"
        y2="5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M16 1.6 L22.5 5 L16 8.4 Z" fill="currentColor" />
    </svg>
  );
}

export default function LearningLoopSection() {
  const stops = LEARNING.loop.slice(0, 4);
  const improved = LEARNING.loop[4];

  return (
    <section className="lp-section" aria-labelledby="learning-loop-heading">
      <div className="lp-container">
        <div className={styles.inner}>
          {/* ── Left: copy + proof points ── */}
          <SectionReveal className={styles.copy}>
            <span className="lp-eyebrow">Continuous improvement</span>
            <h2 id="learning-loop-heading" className="lp-h2">
              <AccentHeading text={LEARNING.heading} accent={HEADING_ACCENT} />
            </h2>
            <p className="lp-lead">{LEARNING.body}</p>
            <ul className={styles.proofGrid}>
              {LEARNING.proofPoints.map((point, i) => {
                const Icon = PROOF_ICONS[i] ?? History;
                return (
                  <li key={point} className={styles.proofRow}>
                    <Icon
                      size={16}
                      strokeWidth={2}
                      aria-hidden="true"
                      className={styles.proofIcon}
                    />
                    <span>{point}</span>
                  </li>
                );
              })}
            </ul>
          </SectionReveal>

          {/* ── Right: improvement-loop stage ── */}
          <SectionReveal delay={0.12}>
            <figure className={styles.figure}>
              <div className={`lp-card lp-stage-grid ${styles.stage}`}>
                <div className={`lp-rose-glow ${styles.glow}`} aria-hidden="true" />
                <div className={styles.stageHead}>
                  <span className="lp-micro">Improvement loop</span>
                </div>

                {/* Desktop / tablet: chips on a line + dashed return sweep */}
                <div className={styles.loopArea}>
                  <svg
                    className={styles.loopSvg}
                    viewBox={`0 0 ${LOOP_W} ${LOOP_H}`}
                    preserveAspectRatio="xMidYMid meet"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <defs>
                      <marker
                        id="lp-learning-return-arrow"
                        viewBox="0 0 10 10"
                        refX="8"
                        refY="5"
                        markerWidth="6.5"
                        markerHeight="6.5"
                        orient="auto"
                      >
                        <path d="M0 0 L10 5 L0 10 Z" fill="currentColor" />
                      </marker>
                    </defs>
                    <g className={styles.returnGroup}>
                      <path
                        d={RETURN_PATH}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeDasharray="2 7"
                        markerEnd="url(#lp-learning-return-arrow)"
                      />
                    </g>
                    <circle
                      className={styles.circuitDot}
                      r="5"
                      fill="var(--lp-accent)"
                    >
                      <animateMotion
                        dur="6s"
                        repeatCount="indefinite"
                        path={CIRCUIT_PATH}
                      />
                    </circle>
                  </svg>
                  <div className={styles.chipRow}>
                    {stops.map((stop, i) => (
                      <Fragment key={stop}>
                        {i > 0 && <Connector />}
                        <span className={`lp-chip ${styles.loopChip}`}>
                          {stop}
                        </span>
                      </Fragment>
                    ))}
                  </div>
                  <span className={`lp-tag ${styles.loopTag}`}>{improved}</span>
                </div>

                {/* Mobile: chips wrap 2x2, return path becomes an icon row */}
                <div className={styles.mobileLoop}>
                  <div className={styles.mobileChips}>
                    {stops.map((stop) => (
                      <span key={stop} className={`lp-chip ${styles.loopChip}`}>
                        {stop}
                      </span>
                    ))}
                  </div>
                  <div className={styles.mobileReturn}>
                    <RefreshCw size={16} strokeWidth={2} aria-hidden="true" />
                    <span className="lp-tag">{improved}</span>
                  </div>
                </div>
              </div>

              <figcaption className={`lp-micro ${styles.caption}`}>
                People stay responsible for every change.
              </figcaption>
            </figure>
          </SectionReveal>
        </div>
      </div>
    </section>
  );
}
