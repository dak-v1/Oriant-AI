"use client";
/**
 * JourneySection — §7.5 "How it works" scroll narrative.
 *
 * Desktop (≥1024px): sticky left narrative column with a giant crossfading
 * step indicator; right column is a vertical rail of six step cards with an
 * accent fill that tracks scroll progress through the list. One
 * IntersectionObserver picks whichever card crosses the viewport's centre
 * band — exactly one step is highlighted at a time. No pinning, no
 * scroll-jacking.
 *
 * Static-first: until the observer fires (or with JS/motion disabled) every
 * card renders in its neutral state — the active-card emphasis (and the
 * softened step number on inactive cards) only applies once `data-engaged`
 * is set from the effect. Card text is never dimmed (WCAG 1.4.3). Below
 * 1024px it is an ordinary stacked list with a small per-card number rail.
 */
import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
} from "framer-motion";
import { JOURNEY_STEPS } from "@/lib/landing-content";
import SectionReveal, { LP_EASE } from "./SectionReveal";
import styles from "./JourneySection.module.css";

export default function JourneySection() {
  const reduced = useReducedMotion();
  const listRef = useRef<HTMLOListElement | null>(null);
  const cardRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [engaged, setEngaged] = useState(false);

  /* Accent rail fill: scroll progress through the card list. */
  const { scrollYProgress } = useScroll({
    target: listRef,
    offset: ["start center", "end center"],
  });
  const springProgress = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 30,
    mass: 0.4,
  });
  const fillProgress = reduced ? scrollYProgress : springProgress;

  /* Single observer over the cards: highlight the one crossing the centre
     band. `engaged` flips once so the active/inactive styling never applies
     before JS runs. */
  useEffect(() => {
    const cards = cardRefs.current.filter(
      (card): card is HTMLLIElement => card !== null,
    );
    if (cards.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let best: { index: number; distance: number } | null = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.index);
          if (Number.isNaN(index)) continue;
          const rect = entry.boundingClientRect;
          const rootMid = entry.rootBounds
            ? entry.rootBounds.top + entry.rootBounds.height / 2
            : window.innerHeight / 2;
          const distance = Math.abs(rect.top + rect.height / 2 - rootMid);
          if (best === null || distance < best.distance) {
            best = { index, distance };
          }
        }
        if (best !== null) {
          setActiveIndex(best.index);
          setEngaged(true);
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );

    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, []);

  const activeStep = JOURNEY_STEPS[activeIndex];

  return (
    <section id="how-it-works" className="lp-section">
      <div className="lp-container">
        <div className={styles.grid}>
          {/* Left column: sticky head + giant crossfading step indicator */}
          <div className={styles.stickyCol}>
            <SectionReveal>
              <div className="lp-section-head">
                <span className="lp-eyebrow">How it works</span>
                <h2 className="lp-h2">
                  A guided path from <span className="lp-serif">discovery</span>{" "}
                  to daily operations.
                </h2>
                <p className="lp-lead">
                  Six steps. You approve every important decision along the way.
                </p>
              </div>
              <div className={styles.indicator} aria-hidden="true">
                <AnimatePresence initial={false}>
                  <motion.div
                    key={activeStep.n}
                    className={styles.indicatorItem}
                    initial={reduced ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, y: -14 }}
                    transition={{ duration: reduced ? 0 : 0.3, ease: LP_EASE }}
                  >
                    <span className={styles.indicatorNumber}>
                      {activeStep.n}
                    </span>
                    <span className={styles.indicatorTitle}>
                      {activeStep.title}
                    </span>
                  </motion.div>
                </AnimatePresence>
              </div>
            </SectionReveal>
          </div>

          {/* Right column: vertical rail + six step cards */}
          <SectionReveal delay={0.08}>
            <div className={styles.rail}>
              <div className={styles.railTrack} aria-hidden="true" />
              <motion.div
                className={styles.railFill}
                style={{ scaleY: fillProgress }}
                aria-hidden="true"
              />
              <ol
                ref={listRef}
                className={styles.list}
                data-engaged={engaged ? "true" : undefined}
              >
                {JOURNEY_STEPS.map((step, index) => (
                  <li
                    key={step.n}
                    ref={(card) => {
                      cardRefs.current[index] = card;
                    }}
                    data-index={index}
                    data-active={
                      engaged && index === activeIndex ? "true" : undefined
                    }
                    className={styles.card}
                  >
                    <span className={`lp-micro ${styles.cardNum}`}>
                      <span className={styles.cardNumWord}>{"Step "}</span>
                      {step.n}
                    </span>
                    <div className={styles.cardBody}>
                      <h3 className="lp-h3">{step.title}</h3>
                      <p className={styles.cardText}>{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </SectionReveal>
        </div>
      </div>
    </section>
  );
}
