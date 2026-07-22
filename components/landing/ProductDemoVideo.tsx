"use client";
/**
 * ProductDemoVideo — §7.3 / §12: the product walkthrough video inside a
 * browser-style frame, lazy-mounted as it approaches the viewport, with a
 * fully designed pure-CSS journey placeholder that renders whenever the
 * video asset is missing or fails to load (no image assets required).
 */
import { Fragment, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import {
  ArrowRight,
  Play,
  Rocket,
  Search,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DEMO_VIDEO, WORKFLOW_NODES } from "@/lib/landing-content";
import SectionReveal, { LP_EASE } from "./SectionReveal";
import styles from "./ProductDemoVideo.module.css";

/* ── Placeholder data: the four journey chips (copy from WORKFLOW_NODES) ── */

const PLACEHOLDER_IDS = [
  "discovery",
  "planner",
  "approval",
  "deployment",
] as const;

type PlaceholderId = (typeof PLACEHOLDER_IDS)[number];

const PLACEHOLDER_ICONS: Record<PlaceholderId, LucideIcon> = {
  discovery: Search,
  planner: Workflow,
  approval: ShieldCheck,
  deployment: Rocket,
};

const JOURNEY = PLACEHOLDER_IDS.flatMap((id) => {
  const node = WORKFLOW_NODES.find((n) => n.id === id);
  return node ? [{ ...node, Icon: PLACEHOLDER_ICONS[id] }] : [];
});

/* ── Heading with one serif phrase ── */

function HeadingWithSerif({ text, serif }: { text: string; serif: string }) {
  const at = text.indexOf(serif);
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="lp-serif">{serif}</span>
      {text.slice(at + serif.length)}
    </>
  );
}

/* ── Designed fallback: pure CSS/React journey mock inside the 16:9 stage ── */

function ProductJourneyPlaceholder({ covered }: { covered: boolean }) {
  return (
    <div
      className={styles.placeholder}
      aria-hidden={covered ? true : undefined}
    >
      <div
        className={`lp-stage-grid ${styles.placeholderGrid}`}
        aria-hidden="true"
      />
      <div className={styles.placeholderTop}>
        <span className={styles.playBadge} aria-hidden="true">
          <Play size={15} strokeWidth={2} fill="currentColor" />
        </span>
        <span className={`lp-micro ${styles.placeholderKicker}`}>
          Product walkthrough preview
        </span>
      </div>
      <div className={styles.flow}>
        {JOURNEY.map((step, i) => (
          <Fragment key={step.id}>
            {i > 0 ? (
              <ArrowRight
                className={styles.flowArrow}
                size={16}
                strokeWidth={2}
                aria-hidden="true"
              />
            ) : null}
            <div className={styles.flowChip}>
              <span
                className={
                  step.id === "approval"
                    ? `${styles.chipIcon} ${styles.chipIconAccent}`
                    : styles.chipIcon
                }
              >
                <step.Icon size={17} strokeWidth={2} aria-hidden="true" />
              </span>
              <span className={styles.chipText}>
                <span className={styles.chipLabel}>{step.label}</span>
                <span className={`lp-micro ${styles.chipStatus}`}>
                  {step.status}
                </span>
              </span>
            </div>
          </Fragment>
        ))}
      </div>
      <p className={`lp-micro ${styles.note}`}>{DEMO_VIDEO.fallbackNote}</p>
    </div>
  );
}

/* ── Section ── */

export default function ProductDemoVideo() {
  const frameWrapRef = useRef<HTMLDivElement>(null);
  const nearViewport = useInView(frameWrapRef, {
    once: true,
    margin: "600px 0px 600px 0px",
  });
  const [videoFailed, setVideoFailed] = useState(false);

  const showVideo = nearViewport && !videoFailed;

  const frame = (
    <div className={styles.card}>
      <div className={styles.chrome}>
        <span className={styles.dots} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className={`lp-micro ${styles.addressPill}`}>
          oriant.ai/workspace
        </span>
      </div>
      <div className={styles.stage}>
        <ProductJourneyPlaceholder covered={showVideo} />
        {showVideo ? (
          <video
            className={styles.video}
            src={DEMO_VIDEO.src}
            poster={DEMO_VIDEO.poster}
            muted
            loop
            playsInline
            controls
            preload="metadata"
            onError={() => setVideoFailed(true)}
          >
            Your browser cannot play this video.
          </video>
        ) : null}
      </div>
    </div>
  );

  return (
    <section className="lp-section" aria-label={DEMO_VIDEO.label}>
      <div className="lp-container">
        <SectionReveal className={`lp-section-head ${styles.head}`}>
          <span className="lp-eyebrow">{DEMO_VIDEO.label}</span>
          <h2 className="lp-h2">
            <HeadingWithSerif text={DEMO_VIDEO.heading} serif="working" />
          </h2>
          <p className="lp-lead">{DEMO_VIDEO.body}</p>
        </SectionReveal>

        <div ref={frameWrapRef} className={styles.frameWrap}>
          <div className={`lp-rose-glow ${styles.glow}`} aria-hidden="true" />
          <motion.div
            className={styles.frameLayer}
            initial={{ opacity: 0, y: 48, scale: 0.94 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "0px 0px -110px 0px" }}
            transition={{ duration: 0.8, ease: LP_EASE }}
          >
            {frame}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
