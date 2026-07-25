"use client";

/**
 * TriplePlatformMarquee — brief §12. Three counter-flowing, seamless,
 * full-bleed platform rows at three speeds (row 1 left 46s, row 2 right 38s
 * via a reversed keyframe, row 3 left 54s), CSS-animation only.
 *
 * Seamlessness maths: every track renders the row's chip list six times —
 * one visible copy + five aria-hidden copies, pixel-identical, each with
 * trailing padding equal to the inter-chip gap. Translating the track by
 * calc(-100% / 6) (exactly one copy width) per cycle therefore wraps
 * invisibly. Coverage invariant: the track must stay wider than the viewport
 * plus one copy width throughout the cycle, i.e. (copies − 1) × W ≥ widest
 * supported viewport — six copies of a ~850–950px copy cover ~3840px — at
 * the identical pixel speed a two-copy / -50% loop would produce, and screen
 * readers still hear the list exactly once.
 *
 * Pausing: hovering a row pauses that row (animation-play-state, hover-capable
 * pointers only), one keyboard-accessible 44px button under the rows toggles
 * play-state on all three tracks, and useInView (no `once`) parks the loops
 * while the section is offscreen. Under prefers-reduced-motion the module CSS
 * kills the animations and unwraps each row into a static centred flex-wrap
 * grid (duplicates and the control hidden).
 *
 * The platforms are integrations Oriant is designed to connect with — never
 * labelled or presented as customers or partners (disclaimer from content).
 */

import { useRef, useState } from "react";
import { useInView } from "framer-motion";
import { Pause, Play } from "lucide-react";

import { MARQUEE_ROWS, MARQUEE_SECTION } from "@/lib/landing-content";
import SectionReveal from "./SectionReveal";
import styles from "./TriplePlatformMarquee.module.css";

/** First two letters of the platform name (decorative monogram). */
function monogram(tool: string): string {
  return tool.replace(/\s+/g, "").slice(0, 2);
}

function PlatformGroup({
  tools,
  dup = false,
}: {
  tools: string[];
  dup?: boolean;
}) {
  return (
    <ul
      className={dup ? `${styles.group} ${styles.dup}` : styles.group}
      aria-hidden={dup ? true : undefined}
    >
      {tools.map((tool) => (
        <li key={tool} className={`lp-chip ${styles.chip}`}>
          <span className={styles.monogram} aria-hidden="true">
            {monogram(tool)}
          </span>
          <span>{tool}</span>
        </li>
      ))}
    </ul>
  );
}

export default function TriplePlatformMarquee() {
  const rowsRef = useRef<HTMLDivElement | null>(null);
  /* Loops must pause offscreen (contract §21): no `once`, so the tracks
     re-park on exit. Initial value is false on the server AND on the first
     client render, so the markup hydrates cleanly. */
  const inView = useInView(rowsRef, { margin: "200px" });
  const [paused, setPaused] = useState(false);
  const running = inView && !paused;

  const speedClasses = [styles.rowA, styles.rowB, styles.rowC];

  return (
    <section id="integrations" className={`lp-section--tight ${styles.section}`}>
      <div className="lp-container">
        <SectionReveal className={styles.head}>
          <span className="lp-eyebrow">{MARQUEE_SECTION.eyebrow}</span>
          <h2 className="lp-h2-sm">{MARQUEE_SECTION.heading}</h2>
          <p className={styles.disclaimer}>{MARQUEE_SECTION.disclaimer}</p>
        </SectionReveal>
      </div>

      <div
        ref={rowsRef}
        className={running ? styles.rows : `${styles.rows} ${styles.isPaused}`}
      >
        {MARQUEE_ROWS.map((row, i) => (
          <div
            key={row.tools.join("-")}
            className={[
              styles.row,
              speedClasses[i] ?? styles.rowA,
              row.direction === "right" ? styles.rowRight : null,
              i === 1 ? styles.rowTeal : null,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className={styles.track}>
              <PlatformGroup tools={row.tools} />
              <PlatformGroup tools={row.tools} dup />
              <PlatformGroup tools={row.tools} dup />
              <PlatformGroup tools={row.tools} dup />
              <PlatformGroup tools={row.tools} dup />
              <PlatformGroup tools={row.tools} dup />
            </div>
          </div>
        ))}
      </div>

      <div className={styles.controlWrap}>
        {/* Toggle button: constant accessible name + aria-pressed state.
            Swapping the label as well reads contradictorily in VoiceOver. */}
        <button
          type="button"
          className={styles.control}
          aria-pressed={paused}
          aria-label="Pause platform marquee"
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? (
            <Play size={14} strokeWidth={2} aria-hidden="true" />
          ) : (
            <Pause size={14} strokeWidth={2} aria-hidden="true" />
          )}
        </button>
      </div>
    </section>
  );
}
