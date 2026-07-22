"use client";
/**
 * FinalCTA — closing call-to-action (master brief §7.11, upper half).
 * One confident rose-gradient panel: oversized heading, lead, CTA pair.
 * Decorative grid wash + two floating accent dots echo the hero workflow.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import SectionReveal from "./SectionReveal";
import { CTA, FINAL_CTA } from "@/lib/landing-content";
import styles from "./FinalCTA.module.css";

const SERIF_PHRASE = "already works";

function HeadingWithSerif({ text }: { text: string }) {
  const index = text.indexOf(SERIF_PHRASE);
  if (index === -1) {
    return <>{text}</>;
  }
  return (
    <>
      {text.slice(0, index)}
      <span className="lp-serif">{SERIF_PHRASE}</span>
      {text.slice(index + SERIF_PHRASE.length)}
    </>
  );
}

export default function FinalCTA() {
  return (
    <section className="lp-section" aria-labelledby="final-cta-heading">
      <div className="lp-container">
        <SectionReveal>
          <div className={styles.panel}>
            <div
              className={`lp-stage-grid ${styles.gridWash}`}
              aria-hidden="true"
            />
            <span
              className={`${styles.dot} ${styles.dotTopRight}`}
              aria-hidden="true"
            />
            <span
              className={`${styles.dot} ${styles.dotBottomLeft}`}
              aria-hidden="true"
            />

            <div className={styles.content}>
              <h2 id="final-cta-heading" className={styles.heading}>
                <HeadingWithSerif text={FINAL_CTA.heading} />
              </h2>
              <p className={`lp-lead ${styles.body}`}>{FINAL_CTA.body}</p>
              <div className={styles.ctaRow}>
                <Link
                  href={CTA.primary.href}
                  className={`lp-btn lp-btn--primary ${styles.primaryBtn}`}
                >
                  {CTA.primary.label}
                  <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
                </Link>
                <a
                  href={FINAL_CTA.secondary.href}
                  className="lp-btn lp-btn--ghost"
                >
                  {FINAL_CTA.secondary.label}
                </a>
              </div>
            </div>
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}
