"use client";

import { Loader2, SearchCheck, Sparkles } from "lucide-react";
import styles from "./discovery.module.css";

/** Live waiting state for the Discovery Agent's evidence check. */
export default function DiscoveryReviewOverlay() {
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Discovery Agent reviewing answers">
      <div className={styles.overlayScrim} aria-hidden />
      <section className={`oa-card ${styles.overlayCard}`} aria-busy="true" aria-live="polite">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "var(--oa-soft-blue)",
              color: "var(--oa-blue-dark)",
              display: "grid",
              placeItems: "center",
              flex: "none",
            }}
            aria-hidden
          >
            <SearchCheck size={19} />
          </span>
          <div style={{ display: "grid", gap: 4 }}>
            <p className={styles.loadingEyebrow} style={{ margin: 0 }}>Discovery Agent</p>
            <h2 className="oa-h3" style={{ margin: 0 }}>Checking what is still unclear</h2>
            <p className="oa-sub" style={{ margin: 0 }}>
              Oriant is reading your onboarding and interview answers to find the most useful follow-up questions.
            </p>
          </div>
          <Loader2 size={20} className={styles.loadingSpinner} aria-label="Review in progress" />
        </div>
        <div className={styles.loadingProgress} aria-hidden>
          <span className={styles.loadingProgressActive} />
        </div>
        <div className={styles.loadingStages} aria-hidden>
          <span className={styles.loadingStageActive}><Sparkles size={13} /> Reading your answers</span>
          <span>Checking workflow gaps</span>
          <span>Preparing review questions</span>
        </div>
      </section>
    </div>
  );
}
