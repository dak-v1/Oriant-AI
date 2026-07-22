"use client";
/**
 * HeroSection — landing hero (master brief §7.1).
 * Left: eyebrow, H1 (with the single serif accent on "Consultant"),
 * subheadline, CTA row, trust microcopy. Right: the visual stage that
 * hosts <AgentWorkflowVisual />. Above the fold, so entrance animation
 * runs on mount (initial/animate); MotionConfig reducedMotion="user"
 * suppresses transforms under reduced motion.
 */
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { CTA, HERO } from "@/lib/landing-content";
import { LP_EASE } from "./SectionReveal";
import AgentWorkflowVisual from "./AgentWorkflowVisual";
import styles from "./HeroSection.module.css";

const SERIF_WORD = "Consultant";

/** Renders the heading verbatim, wrapping the serif accent word. */
function SerifHeading({ text }: { text: string }) {
  const at = text.indexOf(SERIF_WORD);
  if (at === -1) {
    return <>{text}</>;
  }
  return (
    <>
      {text.slice(0, at)}
      <span className="lp-serif">{SERIF_WORD}</span>
      {text.slice(at + SERIF_WORD.length)}
    </>
  );
}

const copyContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const copyItem: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: LP_EASE },
  },
};

export default function HeroSection() {
  return (
    <section className={styles.hero}>
      <div className="lp-container">
        <div className={styles.grid}>
          {/* ── Left column: copy ── */}
          <motion.div
            className={styles.copy}
            variants={copyContainer}
            initial="hidden"
            animate="show"
          >
            <motion.p className="lp-eyebrow" variants={copyItem}>
              {HERO.eyebrow}
            </motion.p>

            <motion.h1 className="lp-h1" variants={copyItem}>
              <SerifHeading text={HERO.heading} />
            </motion.h1>

            <motion.p
              className={`lp-lead ${styles.lead}`}
              variants={copyItem}
            >
              {HERO.subheadline}
            </motion.p>

            <motion.div className={styles.ctaRow} variants={copyItem}>
              <Link
                href={CTA.primary.href}
                className="lp-btn lp-btn--primary"
              >
                {CTA.primary.label}
              </Link>
              <a href={CTA.secondary.href} className="lp-btn lp-btn--ghost">
                {CTA.secondary.label}
              </a>
            </motion.div>

            <motion.p className={styles.microcopy} variants={copyItem}>
              <ShieldCheck
                size={16}
                strokeWidth={2}
                aria-hidden="true"
                className={styles.microIcon}
              />
              {HERO.microcopy}
            </motion.p>
          </motion.div>

          {/* ── Right column: visual stage ── */}
          <motion.div
            className={styles.stageWrap}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: LP_EASE, delay: 0.2 }}
          >
            <div className={`${styles.stage} lp-stage-grid`}>
              <div
                className={`${styles.glow} lp-rose-glow`}
                aria-hidden="true"
              />
              <div className={styles.stageInner}>
                <AgentWorkflowVisual />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
