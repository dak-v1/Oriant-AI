"use client";

/**
 * IntegrationMarquee — quiet connected-platform trust strip directly below
 * the hero (master brief §7.2). Ten integration chips loop in a seamless
 * CSS marquee (translateX(-50%) over a duplicated track); pauses on hover
 * and via an always-visible keyboard-focusable pause/play toggle (WCAG
 * 2.2.2). Under prefers-reduced-motion the duplicate copy and the toggle
 * are hidden and the chips render as a static centred flex-wrap row.
 * These are integrations — never labelled as customers or partners.
 */
import { useState } from "react";
import { Pause, Play } from "lucide-react";
import SectionReveal from "./SectionReveal";
import { MARQUEE } from "@/lib/landing-content";
import styles from "./IntegrationMarquee.module.css";

function ToolChip({ tool }: { tool: string }) {
  return (
    <li className={styles.item}>
      <span className={`lp-chip ${styles.chip}`}>
        <span className={styles.monogram} aria-hidden="true">
          {tool.slice(0, 2)}
        </span>
        {tool}
      </span>
    </li>
  );
}

/**
 * One full copy of the chip list. Rendered twice back-to-back inside the
 * track; the second copy is aria-hidden and display:none under reduced
 * motion. The list carries the inter-chip gap AND a matching padding-right,
 * so the seam between copy 1 and copy 2 equals the inter-chip gap and the
 * -50% translate loops seamlessly.
 */
function ChipList({ duplicate = false }: { duplicate?: boolean }) {
  return (
    <ul
      className={duplicate ? `${styles.list} ${styles.duplicate}` : styles.list}
      aria-hidden={duplicate || undefined}
    >
      {MARQUEE.tools.map((tool) => (
        <ToolChip key={tool} tool={tool} />
      ))}
    </ul>
  );
}

export default function IntegrationMarquee() {
  const [paused, setPaused] = useState(false);

  return (
    <section className="lp-section--tight">
      <SectionReveal>
        <div className="lp-container">
          <div className={styles.head}>
            <h2 className={styles.heading}>{MARQUEE.heading}</h2>
            <p className={`lp-micro ${styles.microline}`}>
              Connect your existing tools
            </p>
          </div>
        </div>

        <div
          className={
            paused
              ? `${styles.viewport} ${styles.viewportPaused}`
              : styles.viewport
          }
        >
          <div className={styles.track}>
            <ChipList />
            <ChipList duplicate />
          </div>
        </div>

        <button
          type="button"
          className={styles.toggle}
          aria-pressed={paused}
          aria-label={
            paused ? "Play integrations marquee" : "Pause integrations marquee"
          }
          onClick={() => setPaused((prev) => !prev)}
        >
          {paused ? (
            <Play size={14} aria-hidden="true" />
          ) : (
            <Pause size={14} aria-hidden="true" />
          )}
        </button>
      </SectionReveal>
    </section>
  );
}
