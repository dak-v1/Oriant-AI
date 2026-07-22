"use client";
/**
 * FinalCTA — the closing statement (redesign brief §19).
 *
 * Dark #111827 full-bleed closer with ~80vh presence. Primary motion
 * concept: restrained workflow ambience — an aria-hidden full-section
 * SVG layer of five soft node dots and two long curved paths at ~8%
 * white, drifting on very slow transform-only local keyframes
 * (31–40s, ±14px), with one slow packet (16s / 22s) travelling each
 * path via CSS offset-path. All ambient loops are gated by a
 * `.running` class — near-view (useInView, no `once`) AND document
 * visible, same pattern as OrchestratorField — so nothing animates
 * offscreen or on a hidden tab; the module's reduced-motion rule
 * parks the drift at its complete base frame and hides the packets.
 * A faint .lp-glow-blue blob sits behind the heading.
 *
 * Entrance: hero-style clip-mask heading reveal (lines translate
 * 110% -> 0 inside overflow-hidden wrappers, DUR.mask, staggered),
 * then body and CTA row stagger in. whileInView, once.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useInView, type Variants } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { CTA, FINAL_CTA } from "@/lib/landing-content";
import { DUR, EASE, STAGGER } from "./motion";
import styles from "./FinalCTA.module.css";

const SERIF_PHRASE = "with you";

/** Wraps the serif accent phrase where it occurs; copy stays in landing-content. */
function renderLine(line: string) {
  const at = line.indexOf(SERIF_PHRASE);
  if (at === -1) return line;
  return (
    <>
      {line.slice(0, at)}
      <span className="lp-serif">{SERIF_PHRASE}</span>
      {line.slice(at + SERIF_PHRASE.length)}
    </>
  );
}

const lineVariants: Variants = {
  hidden: { y: "110%" },
  show: (i: number) => ({
    y: "0%",
    transition: { duration: DUR.mask, ease: EASE, delay: i * (STAGGER * 1.75) },
  }),
};

const fadeVariants: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: DUR.card, ease: EASE, delay },
  }),
};

/** Decorative ambient workflow layer — CSS drift + offset-path packets,
 *  all paused unless the section carries the `.running` class. */
function Ambience() {
  return (
    <svg
      className={styles.bg}
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      {/* Both path `d` strings are duplicated EXACTLY as the packet
          offset-paths in FinalCTA.module.css — keep them in sync. */}
      <g className={styles.driftA}>
        <path
          className={styles.path}
          d="M -60 180 C 260 90 520 250 780 190 C 1040 130 1240 240 1500 160"
        />
        <circle className={styles.nodeHalo} cx="330" cy="168" r="14" />
        <circle className={styles.node} cx="330" cy="168" r="5" />
        <circle className={styles.node} cx="1140" cy="182" r="4" />
        <circle className={`${styles.packet} ${styles.packetA}`} r="3" />
      </g>
      <g className={styles.driftB}>
        <path
          className={styles.path}
          d="M -60 706 C 300 640 560 786 860 712 C 1140 648 1320 764 1500 692"
        />
        <circle className={styles.nodeHalo} cx="422" cy="712" r="14" />
        <circle className={styles.node} cx="422" cy="712" r="5" />
        <circle className={styles.node} cx="1218" cy="705" r="4" />
        <circle className={`${styles.packet} ${styles.packetB}`} r="3" />
      </g>
      <g className={styles.driftC}>
        <circle className={styles.nodeHalo} cx="150" cy="428" r="12" />
        <circle className={styles.node} cx="150" cy="428" r="4.5" />
      </g>
    </svg>
  );
}

export default function FinalCTA() {
  const rootRef = useRef<HTMLElement | null>(null);

  /* Ambience gate: near-view (no `once`) AND tab visible → `.running`
     (same pattern as OrchestratorField). Both are false/true in a way
     that leaves the class absent on the server AND the first client
     render, so hydration stays consistent. */
  const nearView = useInView(rootRef, { margin: "200px" });
  const [docVisible, setDocVisible] = useState(true);
  useEffect(() => {
    const onVis = () => setDocVisible(!document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  const running = nearView && docVisible;

  return (
    <section
      ref={rootRef}
      className={`lp-section lp-dark ${styles.section}${running ? ` ${styles.running}` : ""}`}
    >
      <Ambience />
      <div className={`lp-glow-blue ${styles.glow}`} aria-hidden="true" />
      <div className={`lp-container ${styles.container}`}>
        <motion.div
          className={styles.inner}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "0px 0px -100px 0px" }}
        >
          <h2 className={`lp-display ${styles.heading}`}>
            {FINAL_CTA.headingLines.map((line, i) => (
              <span key={line} className={styles.lineMask}>
                <motion.span className={styles.line} variants={lineVariants} custom={i}>
                  {renderLine(line)}
                </motion.span>
              </span>
            ))}
          </h2>
          <motion.p
            className={`lp-lead ${styles.body}`}
            variants={fadeVariants}
            custom={0.55}
          >
            {FINAL_CTA.body}
          </motion.p>
          <motion.div className={styles.ctaRow} variants={fadeVariants} custom={0.7}>
            <Link
              href={CTA.primary.href}
              className={`lp-btn lp-btn--primary ${styles.btn}`}
            >
              {CTA.primary.label}
              <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
            </Link>
            <a
              href={FINAL_CTA.secondary.href}
              className={`lp-btn lp-btn--ghost ${styles.btn}`}
            >
              {FINAL_CTA.secondary.label}
            </a>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
