"use client";
/**
 * HeroSection — editorial hero (brief §6), CENTRED composition.
 *
 * Composition: the text block (eyebrow, two display lines, lead, CTAs,
 * supporting word-dots) is centred at the top of the hero; the orchestrator
 * field (built by OrchestratorField) is a WIDE BAND below it — full
 * container width, bleeding slightly past the container edges so the
 * outermost nodes crop against the section. Nothing overlaps the text;
 * the ~110–125vh total still reads as one composition (shared glow seam,
 * shared entrance clock, both layers moving together on scroll-out).
 * On <768px the field recomposes as the compact cluster below the text.
 *
 * Primary motion concept:
 *  1) Entrance (~DUR.hero budget): eyebrow fades; each headline line reveals
 *     through an overflow-hidden clip mask (inner span translateY 110%→0,
 *     DUR.mask, 0.14s stagger); sub / CTAs / supporting line stagger in at
 *     STAGGER; the band wrapper fades+scales 0.97→1 after a ~0.5s delay
 *     (the field runs its own internal build).
 *  2) Scroll-out (brief §6.4): useScroll over ["start start","end start"]
 *     drives the centred text y 0→-60 / opacity 1→0.25, band scale 1→1.12
 *     (origin 50% 30%, set in the module) and y 0→-30, and a full-hero
 *     veil that crossfades toward the video-section backdrop. Springless
 *     useTransform only.
 *
 * Reduced motion / stacked layouts: every scroll mapping collapses to a
 * static range (conditional-ranges pattern — style-only, hydration-safe;
 * server HTML equals the first client render at progress 0). Entrance
 * transforms are suppressed by <MotionConfig reducedMotion="user">; the
 * opacity fades still run, so all content is always present.
 */
import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { CTA, HERO } from "@/lib/landing-content";
import { DUR, EASE, STAGGER } from "./motion";
import OrchestratorField from "./OrchestratorField";
import styles from "./HeroSection.module.css";

/** Single editorial serif accent inside heading line 1 (brief §6). */
const SERIF_WORD = "Consultant";

function AccentedLine({ line }: { line: string }) {
  return (
    <>
      {line.split(/(Consultant)/).map((part, i) =>
        part === SERIF_WORD ? (
          <span key={`${part}-${i}`} className="lp-serif">
            {part}
          </span>
        ) : (
          <Fragment key={`${part}-${i}`}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** Delay at which the sub / CTA / supporting tail begins staggering in. */
const TAIL_DELAY = 0.48;

export default function HeroSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const reduced = useReducedMotion();

  /* Stacked (tablet/mobile) layout drops all scroll-out transforms.
     Initial `false` matches the server render; the matchMedia effect only
     changes inline style bindings afterwards — never the render tree. */
  const [stacked, setStacked] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setStacked(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const still = Boolean(reduced) || stacked;

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

  /* Scroll-out choreography — all springless, all collapsing to static
     under reduced motion or stacked layout (identical at progress 0). */
  const copyY = useTransform(scrollYProgress, [0, 0.62], still ? [0, 0] : [0, -60]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.62], still ? [1, 1] : [1, 0.25]);
  const fieldScale = useTransform(scrollYProgress, [0, 1], still ? [1, 1] : [1, 1.12]);
  const fieldY = useTransform(scrollYProgress, [0, 1], still ? [0, 0] : [0, -30]);
  const veilOpacity = useTransform(scrollYProgress, [0.45, 0.95], still ? [0, 0] : [0, 1]);

  const supportWords = HERO.supportingLine
    .split(".")
    .map((w) => w.trim())
    .filter(Boolean);

  return (
    <section ref={sectionRef} className={styles.hero}>
      {/* Ambient light behind the field — subtle glow only (brief §3). */}
      <div className={`lp-glow-blue ${styles.glow}`} aria-hidden="true" />

      <div className={`lp-container ${styles.inner}`}>
        <motion.div
          className={styles.copy}
          style={{ y: copyY, opacity: copyOpacity }}
        >
          <motion.p
            className={`lp-eyebrow ${styles.eyebrow}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.55, ease: EASE }}
          >
            {HERO.eyebrow}
          </motion.p>

          <h1 className={`lp-display ${styles.heading}`}>
            {HERO.headingLines.map((line, i) => (
              <span key={line} className={styles.lineMask}>
                <motion.span
                  className={styles.lineInner}
                  initial={{ y: "110%" }}
                  animate={{ y: "0%" }}
                  transition={{
                    duration: DUR.mask,
                    ease: EASE,
                    delay: 0.1 + i * 0.14,
                  }}
                >
                  <AccentedLine line={line} />
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.p
            className={`lp-lead ${styles.lead}`}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.card, ease: EASE, delay: TAIL_DELAY }}
          >
            {HERO.subheadline}
          </motion.p>

          <motion.div
            className={styles.ctaRow}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: DUR.card,
              ease: EASE,
              delay: TAIL_DELAY + STAGGER,
            }}
          >
            <Link href={CTA.primary.href} className="lp-btn lp-btn--primary">
              {CTA.primary.label}
              <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
            </Link>
            <a href={CTA.secondary.href} className="lp-btn lp-btn--ghost">
              {CTA.secondary.label}
            </a>
          </motion.div>

          <motion.p
            className={styles.supporting}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: DUR.card,
              ease: EASE,
              delay: TAIL_DELAY + STAGGER * 2,
            }}
          >
            {supportWords.map((word, i) => (
              <Fragment key={word}>
                {i > 0 && <span className={styles.dot} aria-hidden="true" />}
                <span className={`lp-micro ${styles.supportWord}`}>{word}</span>
              </Fragment>
            ))}
          </motion.p>
        </motion.div>

        {/* Orchestrator band below the text — scroll transforms on the outer
            wrapper, entrance fade/scale on the inner (no style/animate clash). */}
        <motion.div
          className={styles.fieldLayer}
          style={{ scale: fieldScale, y: fieldY }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: DUR.mask, ease: EASE, delay: 0.5 }}
          >
            <OrchestratorField />
          </motion.div>
        </motion.div>
      </div>

      {/* Full-hero veil crossfading toward the video-section backdrop. */}
      <motion.div
        className={styles.exitVeil}
        style={{ opacity: veilOpacity }}
        aria-hidden="true"
      />
    </section>
  );
}
