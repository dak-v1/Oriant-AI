"use client";
/**
 * ManifestoSection — editorial manifesto + system principles (brief §9).
 *
 * Primary motion concept: the section surface SHIFTS --lp-bg → --lp-bg-alt
 * as it enters, driven by scroll progress (useScroll on the section).
 * Framer-motion cannot colour-interpolate CSS custom properties, so the
 * shift is realised as a token-coloured motion.div wash (background:
 * var(--lp-bg-alt)) whose OPACITY is the useTransform-mapped scroll value —
 * visually identical to a backgroundColor interpolation between the two
 * opaque tokens while keeping the animated property on the transform/opacity
 * whitelist (doctrine §21) and the palette 100% token-driven. The shift is
 * enter-only: once in, the section rests on bg-alt (the band in the page's
 * light/dark rhythm), matching the reduced-motion static frame.
 *
 * Statement reveal (round-2 fix for the blank-section bug): the clip-mask
 * rows previously carried their own whileInView — but a translateY(112%)
 * child inside an overflow:hidden shell is FULLY CLIPPED, and
 * IntersectionObserver computes intersection AFTER ancestor clipping, so
 * the observer never saw the rows and the reveal never fired. The trigger
 * now lives on the UNCLIPPED statement-block wrapper (~300–450px tall at
 * every target width, well under the viewport, so amount 0.35 is always
 * reachable) with initial="hidden" / whileInView="visible"; the mask rows
 * and accent marks are variant children that inherit the label. Stagger:
 * statement rows 0 / 0.1 / 0.2s, support rows 0.35 / 0.45 / 0.55s, then
 * the serif "need" and the accent control phrase land last as delayed
 * opacity fades inside their rows.
 *
 * Safety nets so the text can never stay hidden:
 * 1. Client fallback — if the observer misfires, a 1.2s timeout plus a
 *    passive rAF-coalesced scroll check on getBoundingClientRect force the
 *    "visible" variant via `animate` the moment the block is within reach;
 *    onViewportEnter sets the same state so the listeners tear down.
 * 2. Reduced motion — module @media rule parks the wash at full bg-alt and
 *    forces rows/marks visible (the static render always shows the text).
 * 3. No JS — @media (scripting: none) resolves the SSR-serialised hidden
 *    inline styles to the finished frame.
 * No render-tree branching on useReducedMotion (hydration rule).
 */
import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import type { Variants } from "framer-motion";
import type { ReactNode } from "react";
import { MANIFESTO } from "@/lib/landing-content";
import { DUR, EASE } from "./motion";
import styles from "./ManifestoSection.module.css";

/** Gap between successive mask rows / principle columns (per assignment). */
const ROW_STAGGER = 0.1;
/** Line 2 begins after line 1's rows have visibly started. */
const SUPPORT_DELAY = 0.35;
/** The serif "need" fades into its gap once the statement rows have landed. */
const SERIF_DELAY = 0.9;
/** The accent control phrase is the final beat of the sequence. */
const ACCENT_DELAY = 1.05;
/** Observer-misfire fallback: force the reveal if the block is in reach. */
const FALLBACK_MS = 1200;

/**
 * Variant children of the statement block. Dynamic "visible" variants read
 * the per-row delay from the child's own `custom` prop, so one propagated
 * label drives the whole choreography.
 */
const rowVariants: Variants = {
  hidden: { y: "112%" },
  visible: (delay: number) => ({
    y: "0%",
    transition: { duration: DUR.mask, ease: EASE, delay },
  }),
};

const markVariants: Variants = {
  hidden: { opacity: 0 },
  visible: (delay: number) => ({
    opacity: 1,
    transition: { duration: DUR.card, ease: EASE, delay },
  }),
};

/**
 * Split a copy line into mask rows at the given phrase starts so the clip
 * masks follow phrase boundaries. Purely presentational: the rendered text
 * stays verbatim from landing-content (single source of truth), and an
 * unmatched anchor simply leaves the phrase attached to the previous row.
 */
function splitRows(line: string, phraseStarts: readonly string[]): string[] {
  const rows: string[] = [];
  let rest = line;
  for (const start of phraseStarts) {
    const at = rest.indexOf(start);
    if (at <= 0) continue;
    rows.push(rest.slice(0, at).trimEnd());
    rest = rest.slice(at);
  }
  rows.push(rest);
  return rows;
}

/* "Most businesses" / "do not need" / "more AI tools." */
const STATEMENT_ROWS = splitRows(MANIFESTO.lines[0], ["do not", "more AI"]);
/* "They need a clear way to understand" /
   "where AI belongs, how it should work," /
   "and when a person should stay in control." */
const SUPPORT_ROWS = splitRows(MANIFESTO.lines[1], ["where AI", "and when"]);

/** The one serif accent word in line 1 (brief §4: max one per heading). */
const SERIF_MARK = "need";
/** The accent-coloured control phrase in line 2. */
const ACCENT_MARK = "a person should stay in control";

/**
 * Wraps `mark` (if present in `text`) in a variant-driven span that fades
 * in after `markDelay` — the "lands last" beat; no-op when absent.
 */
function MarkedText({
  text,
  mark,
  markClass,
  markDelay,
}: {
  text: string;
  mark: string;
  markClass: string;
  markDelay: number;
}) {
  const at = text.indexOf(mark);
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <motion.span
        className={markClass}
        variants={markVariants}
        custom={markDelay}
      >
        {mark}
      </motion.span>
      {text.slice(at + mark.length)}
    </>
  );
}

/**
 * One clip-mask row: overflow-hidden shell, inner span slides 112% → 0.
 * Deliberately NOT its own viewport trigger (a clipped element never
 * intersects); it inherits hidden/visible from the statement block.
 */
function MaskRow({ delay, children }: { delay: number; children: ReactNode }) {
  return (
    <span className={styles.maskRow}>
      <motion.span
        className={styles.maskInner}
        variants={rowVariants}
        custom={delay}
      >
        {children}
      </motion.span>
    </span>
  );
}

export default function ManifestoSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const statementRef = useRef<HTMLDivElement | null>(null);
  /** Fallback switch: forces the "visible" label if the observer misfires. */
  const [revealed, setRevealed] = useState(false);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "start center"],
  });
  /* Enter-only shift: the wash resolves to full bg-alt by the time the
     section top reaches mid-viewport, then holds — the section rests on
     bg-alt as the page's tonal band (audit: "#E9EDE8 shift in manifesto").
     Scroll-driven binding — no loop, nothing to pause offscreen. */
  const washOpacity = useTransform(scrollYProgress, [0.05, 0.95], [0, 1]);

  /* Belt-and-braces reveal: whileInView is the primary trigger, but if the
     observer never fires this effect measures the block directly (once at
     1.2s for already-in-view loads, then per scroll frame, rAF-coalesced)
     and force-sets the visible state. One-shot — everything tears down as
     soon as `revealed` flips (onViewportEnter flips it too). Not a loop /
     interval, so there is nothing to pause offscreen. */
  useEffect(() => {
    if (revealed) return;
    const isReached = () => {
      const el = statementRef.current;
      if (!el) return false;
      /* Top edge past 85% of the viewport ≈ the amount-0.35 threshold;
         also true when the user has scrolled past the block entirely. */
      return el.getBoundingClientRect().top < window.innerHeight * 0.85;
    };
    const timer = window.setTimeout(() => {
      if (isReached()) setRevealed(true);
    }, FALLBACK_MS);
    let raf = 0;
    const onScroll = () => {
      if (raf !== 0) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        if (isReached()) setRevealed(true);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      if (raf !== 0) window.cancelAnimationFrame(raf);
    };
  }, [revealed]);

  return (
    <section ref={sectionRef} className={`lp-section ${styles.section}`}>
      <motion.div
        className={styles.bgShift}
        style={{ opacity: washOpacity }}
        aria-hidden="true"
      />
      <div className={`lp-container ${styles.inner}`}>
        {/* Viewport trigger lives HERE — an unclipped block shorter than the
            viewport at 1440/1280/768/390, so amount 0.35 is always
            satisfiable. Children inherit hidden/visible via variants. */}
        <motion.div
          ref={statementRef}
          initial="hidden"
          animate={revealed ? "visible" : "hidden"}
          whileInView="visible"
          viewport={{ once: true, amount: 0.35 }}
          onViewportEnter={() => setRevealed(true)}
        >
          <h2 className={`lp-h2 ${styles.statement}`}>
            {STATEMENT_ROWS.map((row, i) => (
              <MaskRow key={row} delay={i * ROW_STAGGER}>
                <MarkedText
                  text={row}
                  mark={SERIF_MARK}
                  markClass={`lp-serif ${styles.serifWord}`}
                  markDelay={SERIF_DELAY}
                />
              </MaskRow>
            ))}
          </h2>
          <p className={`lp-h2-sm ${styles.support}`}>
            {SUPPORT_ROWS.map((row, i) => (
              <MaskRow key={row} delay={SUPPORT_DELAY + i * ROW_STAGGER}>
                <MarkedText
                  text={row}
                  mark={ACCENT_MARK}
                  markClass={styles.accentPhrase}
                  markDelay={ACCENT_DELAY}
                />
              </MaskRow>
            ))}
          </p>
        </motion.div>

        <ul className={styles.principles} role="list">
          {MANIFESTO.principles.map((principle, i) => (
            <motion.li
              key={principle.keyword}
              className={styles.principle}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px 0px -60px 0px" }}
              transition={{
                duration: DUR.card,
                ease: EASE,
                delay: i * ROW_STAGGER,
              }}
            >
              <span className={styles.numeral} aria-hidden="true">
                {principle.numeral}
              </span>
              <h3 className={styles.keyword}>{principle.keyword}</h3>
              <p className={styles.caption}>{principle.caption}</p>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
