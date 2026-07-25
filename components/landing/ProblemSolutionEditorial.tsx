"use client";
/**
 * ProblemSolutionEditorial — problems → solution as editorial storytelling
 * (brief §17). Deliberately NOT a card grid.
 *
 * Primary motion concept — scroll emphasis, now COMPOUND so the read is
 * unmistakable: as each oversized problem line crosses the viewport centre
 * band it sharpens muted → ink, slides 14px right, and its index chip flips
 * from a muted outline to an accent fill with the number in white; every
 * non-centred line relaxes to muted at 0.55 opacity. A 2px progress spine on
 * the left of the list carries an accent cursor segment that slides to the
 * active line. One IntersectionObserver (rootMargin "-40% 0px -40% 0px")
 * drives ALL of it via data attributes (data-engaged + data-index on the
 * wrapper, data-center per line); the CSS module transitions colour /
 * opacity / transform — no per-frame JS.
 *
 * Static-first: until the observer engages — and always without JS or under
 * reduced motion — every line renders at full ink with no dimming, the chips
 * stay in their outline state and the spine cursor stays hidden, so nothing
 * on the page is ever low-contrast. Once engaged, dimmed lines use --lp-muted
 * (passes AA at this large text size, ≥24px weight 650) as a transient
 * reading state; the centred line is always full ink.
 *
 * Entrances: the two heading lines reveal through overflow-hidden clip masks
 * (translateY 112% → 0, DUR.mask — the manifesto's language); the five lines
 * cascade in with alternating slight x offsets (whileInView, once). Because
 * framer leaves inline transforms on the elements it animates, the entrance
 * runs on the <li> while the observer-driven state styles live on an inner
 * span (.lineInner) — they never fight (contract §CSS-pitfalls).
 *
 * The turn: the soft-teal band enters via a clip-path wipe —
 * inset(0 100% 0 0 round 32px) → inset(0 0% 0 0 round 32px) over DUR.mask —
 * then the ten capability index items cascade in behind the wipe front.
 */

import { useEffect, useRef } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Check } from "lucide-react";
import { PROBLEMS, SOLUTION } from "@/lib/landing-content";
import { DUR, EASE } from "./motion";
import styles from "./ProblemSolutionEditorial.module.css";

/** Phrase inside SOLUTION.heading that carries the deep-teal accent. Used as
 *  a split marker only — the rendered copy still comes from landing-content. */
const ACCENT_PHRASE = "an approved AI workforce plan";

/** Quick cascade gap for the capability index (brief §17). */
const CASCADE = 0.05;
/** Cascade gap between the five problem-line entrances. */
const LINE_STAGGER = 0.09;
/** Gap between the two heading mask rows. */
const HEAD_STAGGER = 0.12;
/** Alternating entrance x offset for the problem lines (px, slight). */
const LINE_OFFSET = 24;

const indexListVariants: Variants = {
  hidden: {},
  /* delayChildren lets the first items appear just as the wipe front has
     passed them, so the cascade reads as revealed BY the wipe. */
  show: { transition: { staggerChildren: CASCADE, delayChildren: 0.25 } },
};

const indexItemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DUR.micro * 1.6, ease: EASE },
  },
};

function SolutionHeading() {
  const heading: string = SOLUTION.heading;
  const at = heading.indexOf(ACCENT_PHRASE);
  return (
    <h3 className={`lp-h2-sm ${styles.solutionHeading}`}>
      {at === -1 ? (
        heading
      ) : (
        <>
          {heading.slice(0, at)}
          <span className={styles.solutionAccent}>{ACCENT_PHRASE}</span>
          {heading.slice(at + ACCENT_PHRASE.length)}
        </>
      )}
    </h3>
  );
}

export default function ProblemSolutionEditorial() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const reduce = useReducedMotion();

  /* Scroll emphasis. Effect-only (never branches the render tree): under
     reduced motion the observer is never created and every line stays at the
     static ink frame with the spine cursor hidden. No timers or loops run,
     so there is nothing further to pause offscreen — the observer is
     passive. */
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || reduce || typeof IntersectionObserver === "undefined") {
      return;
    }

    const lines = Array.from(
      wrap.querySelectorAll<HTMLElement>("[data-problem-line]"),
    );
    /* Indices currently inside the centre band; the spine cursor tracks the
       topmost. When the band sits momentarily between lines the cursor holds
       its last stop instead of vanishing — a reading cursor, not a blinker. */
    const centred = new Set<number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const idx = lines.indexOf(el);
          el.dataset.center = entry.isIntersecting ? "true" : "false";
          if (entry.isIntersecting) {
            centred.add(idx);
          } else {
            centred.delete(idx);
          }
        }
        if (centred.size > 0) {
          wrap.dataset.index = String(Math.min(...centred));
        }
        /* Relax non-centre lines to muted only after centre states are
           known, so the static ink render never flashes. */
        wrap.dataset.engaged = "true";
      },
      { rootMargin: "-40% 0px -40% 0px", threshold: 0 },
    );

    lines.forEach((line) => observer.observe(line));

    return () => {
      observer.disconnect();
      delete wrap.dataset.engaged;
      delete wrap.dataset.index;
      lines.forEach((line) => {
        delete line.dataset.center;
      });
    };
  }, [reduce]);

  return (
    <section className={`lp-section ${styles.section}`}>
      <div className="lp-container">
        {/* Part 1 — the problems, as an editorial statement. The two heading
            lines rise through overflow-hidden clip masks. */}
        <h2 className="lp-h2">
          {PROBLEMS.headingLines.map((line, i) => (
            <span key={line} className={styles.headMask}>
              <motion.span
                className={`${styles.headMaskInner} ${
                  i === 1 ? styles.headLineMuted : ""
                }`}
                initial={{ y: "112%" }}
                whileInView={{ y: "0%" }}
                viewport={{ once: true, margin: "0px 0px -90px 0px" }}
                transition={{
                  duration: DUR.mask,
                  ease: EASE,
                  delay: i * HEAD_STAGGER,
                }}
              >
                {line}
              </motion.span>
            </span>
          ))}
        </h2>

        <div ref={wrapRef} className={styles.problemsWrap}>
          {/* Progress spine: 2px track + accent cursor segment that slides to
              the active line via data-index (pure CSS transform transition). */}
          <div className={styles.spine} aria-hidden="true">
            <div className={styles.spineFill} />
          </div>

          <ul className={styles.problems} role="list">
            {PROBLEMS.items.map((item, i) => (
              <motion.li
                key={item}
                data-problem-line=""
                className={styles.problemLine}
                initial={{
                  opacity: 0,
                  x: i % 2 === 0 ? -LINE_OFFSET : LINE_OFFSET,
                }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "0px 0px -70px 0px" }}
                transition={{
                  duration: DUR.card,
                  ease: EASE,
                  delay: i * LINE_STAGGER,
                }}
              >
                {/* Observer-driven state styles live here, NOT on the
                    framer-animated li (inline transform would win). */}
                <span className={styles.lineInner}>
                  <span
                    className={`lp-micro ${styles.problemIndex}`}
                    aria-hidden="true"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className={styles.problemText}>{item}</span>
                </span>
              </motion.li>
            ))}
          </ul>
        </div>

        {/* Part 2 — the turn: solution statement + capability index on a
            teal band that enters via a left-to-right clip-path wipe. */}
        <div className={styles.turn}>
          <motion.div
            className={styles.panel}
            initial={{ clipPath: "inset(0 100% 0 0 round 32px)" }}
            whileInView={{ clipPath: "inset(0 0% 0 0 round 32px)" }}
            viewport={{ once: true, margin: "0px 0px -120px 0px" }}
            transition={{ duration: DUR.mask, ease: EASE }}
          >
            <SolutionHeading />
            <motion.ul
              className={styles.solutionList}
              role="list"
              variants={indexListVariants}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "0px 0px -60px 0px" }}
            >
              {SOLUTION.items.map((item) => (
                <motion.li
                  key={item}
                  className={styles.solutionItem}
                  variants={indexItemVariants}
                >
                  <Check
                    size={16}
                    strokeWidth={2}
                    aria-hidden="true"
                    className={styles.solutionCheck}
                  />
                  <span>{item}</span>
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
