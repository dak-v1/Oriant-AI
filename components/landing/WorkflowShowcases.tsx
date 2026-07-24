"use client";
/**
 * WorkflowShowcases — spec §3.3: credible operations.
 *
 * Three showcases, each one business problem plus ONE understandable
 * workflow rendered as a structured five-step rail with fixed labels:
 * Trigger / Agent action / Human check / Connected tool / Outcome.
 * No glowing nodes, no sparkles, no decorative gradients — a plain
 * workspace frame and an operational step list.
 *
 * Restrained animation: a deterministic timer walks the task down the rail
 * (the active step highlights, completed steps settle), and the walk PAUSES
 * at the human check — the status chip holds at "Pending" until the owner
 * approval lands, then the task continues. The walk only runs while the
 * rail is in view AND the tab is visible; timers are cleared on every
 * effect teardown. Reduced motion: a static, complete state (every step
 * done, human check "Approved") — no walking.
 *
 * Desktop (≥1024px) keeps the pinned sequence: a ~330vh scroll track with a
 * 100vh sticky stage panel; scroll progress selects the active showcase and
 * AnimatePresence mode="wait" swaps the stage in place. The stage re-themes
 * per showcase (finance is dark) via the global `lp-dark` class — a
 * post-scroll class swap only, so there is no hydration risk.
 *
 * CRITICAL sticky rule: no transformed ancestor wraps the sticky panel —
 * the track and section carry no motion; every animated element lives
 * INSIDE the sticky panel.
 *
 * Mobile/tablet (<1024px): stacked panels with the same rail. Both trees
 * are rendered and gated purely by CSS media queries.
 */
import { useEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from "framer-motion";
import type { Variants } from "framer-motion";
import {
  Calendar,
  Check,
  FileText,
  Inbox,
  PenLine,
  Plug,
  Search,
  User,
  type LucideIcon,
} from "lucide-react";
import {
  SHOWCASES,
  SHOWCASES_SECTION,
  type ShowcaseStep,
} from "@/lib/landing-content";
import { DUR, EASE } from "./motion";
import SectionReveal from "./SectionReveal";
import styles from "./WorkflowShowcases.module.css";

type Showcase = (typeof SHOWCASES)[number];

const cx = (...parts: Array<string | false | undefined>) =>
  parts.filter(Boolean).join(" ");

/* Stacked (mobile/tablet) copy column: rows stagger in from the left. */
const copyStagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};
const copyRow: Variants = {
  hidden: { opacity: 0, x: -28 },
  show: { opacity: 1, x: 0, transition: { duration: DUR.card, ease: EASE } },
};

/* Pinned swap (desktop): outgoing copy slides left under a rising clip mask;
   incoming enters from the right (0.45s, EASE); the visual crossfades and
   settles from a slight over-scale. mode="wait" sequences exit → enter. */
const SWAP_IN = { duration: 0.45, ease: EASE };
const SWAP_OUT = { duration: 0.3, ease: EASE };

const pinnedCopy: Variants = {
  enter: { opacity: 0, x: 64, clipPath: "inset(0% 0% 0% 0%)" },
  active: {
    opacity: 1,
    x: 0,
    clipPath: "inset(0% 0% 0% 0%)",
    transition: SWAP_IN,
  },
  exit: {
    opacity: 0,
    x: -56,
    clipPath: "inset(0% 0% 100% 0%)",
    transition: SWAP_OUT,
  },
};

const pinnedVisual: Variants = {
  enter: { opacity: 0, scale: 1.04 },
  active: { opacity: 1, scale: 1, transition: SWAP_IN },
  exit: { opacity: 0, transition: SWAP_OUT },
};

/** Maps pinned-track scroll progress to a clamped showcase index. */
const clampIndex = (progress: number): number => {
  const raw = Math.floor(progress * SHOWCASES.length);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(SHOWCASES.length - 1, raw));
};

/** Renders the section heading with the closing "in practice" in serif. */
function ShowcaseHeading() {
  const heading: string = SHOWCASES_SECTION.heading;
  const tail = "in practice";
  if (!heading.endsWith(tail)) return <>{heading}</>;
  return (
    <>
      {heading.slice(0, heading.length - tail.length)}
      <span className="lp-serif">{heading.slice(heading.length - tail.length)}</span>
    </>
  );
}

/* ── Mock workspace frame — deliberately NOT browser chrome; the page's
   single browser-chrome device lives in VideoRevealSection. ── */

function Frame({
  category,
  children,
}: {
  category: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.frame}>
      <div className={styles.frameBar}>
        <span className={styles.frameLabel}>Oriant workspace · {category}</span>
      </div>
      <div className={cx(styles.frameBody, "lp-stage-grid")}>{children}</div>
    </div>
  );
}

/* ── The structured workflow rail (the one visual per showcase) ─────────── */

const STEP_ICONS: Record<ShowcaseStep["icon"], LucideIcon> = {
  inbox: Inbox,
  file: FileText,
  calendar: Calendar,
  pen: PenLine,
  search: Search,
  user: User,
  plug: Plug,
  check: Check,
};

/** Deterministic dwell (ms) per step kind — the walk pauses at the human
 *  check and rests on the outcome before looping. */
const DWELL_MS: Record<ShowcaseStep["kind"], number> = {
  trigger: 1500,
  agent: 1700,
  human: 3400,
  tool: 1500,
  outcome: 2600,
};

/** Within the human dwell: how long the task waits before approval lands. */
const HUMAN_WAIT_MS = 2400;

/**
 * WorkflowRail — meaningful content (not aria-hidden): five labelled steps.
 * The walking highlight and the Pending → Approved chip flip are decorative
 * (chips are aria-hidden; each step's detail sentence carries the meaning).
 */
function WorkflowRail({ steps }: { steps: ReadonlyArray<ShowcaseStep> }) {
  const listRef = useRef<HTMLOListElement | null>(null);
  const reduce = useReducedMotion();
  /* Walk gate: near view (no `once`) AND tab visible AND motion allowed. */
  const inView = useInView(listRef, { margin: "-40px" });
  const [docVisible, setDocVisible] = useState(true);
  useEffect(() => {
    const onVis = () => setDocVisible(!document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  const running = inView && docVisible && !reduce;

  const [active, setActive] = useState(0);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    if (!running) return;
    const step = steps[active];
    if (!step) return;
    const timers: number[] = [];
    if (step.kind === "human") {
      /* The pause: hold at Pending, then the owner approval lands. */
      timers.push(window.setTimeout(() => setApproved(true), HUMAN_WAIT_MS));
    }
    timers.push(
      window.setTimeout(() => {
        const next = (active + 1) % steps.length;
        if (next === 0) setApproved(false);
        setActive(next);
      }, DWELL_MS[step.kind]),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [running, active, steps]);

  /* Reduced motion: static complete state (spec §3.3). useReducedMotion is
     null on the server and the first client render, so hydration matches. */
  const complete = Boolean(reduce);

  return (
    <ol ref={listRef} className={styles.rail}>
      {steps.map((step, i) => {
        const Icon = STEP_ICONS[step.icon];
        const state = complete
          ? "done"
          : i < active
            ? "done"
            : i === active
              ? "active"
              : "todo";
        const chip =
          step.kind !== "human"
            ? null
            : complete || state === "done" || (state === "active" && approved)
              ? "approved"
              : state === "active"
                ? "pending"
                : "waiting";
        return (
          <li key={step.label} className={styles.railStep} data-state={state}>
            <span className={styles.railIcon}>
              <Icon size={15} strokeWidth={2} aria-hidden="true" />
            </span>
            <span className={styles.railText}>
              <span className={styles.railHead}>
                <span className={`lp-micro ${styles.railLabel}`}>
                  {step.label}
                </span>
                {chip === "waiting" && (
                  <span className={styles.railChipQuiet} aria-hidden="true">
                    Owner review
                  </span>
                )}
                {chip === "pending" && (
                  <span
                    className="lp-status lp-status--pending"
                    aria-hidden="true"
                  >
                    Pending
                  </span>
                )}
                {chip === "approved" && (
                  <span
                    className="lp-status lp-status--approved"
                    aria-hidden="true"
                  >
                    Approved
                  </span>
                )}
              </span>
              <span className={styles.railDetail}>{step.detail}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ── Copy column (shared by both trees) ─────────────────────────────────── */

type RowProps = { className?: string; children: ReactNode };

function StaggerRow({ className, children }: RowProps) {
  return (
    <motion.div variants={copyRow} className={className}>
      {children}
    </motion.div>
  );
}

function PlainRow({ className, children }: RowProps) {
  return <div className={className}>{children}</div>;
}

function ShowcaseCopy({
  showcase,
  dark,
  Row,
}: {
  showcase: Showcase;
  dark: boolean;
  Row: (props: RowProps) => ReactElement;
}) {
  return (
    <>
      <Row>
        <span className={cx("lp-tag", !dark && "lp-tag--teal")}>
          {showcase.category}
        </span>
      </Row>

      <Row>
        <h3 className={cx("lp-h2-sm", styles.title)}>{showcase.title}</h3>
      </Row>

      <Row>
        <p className={cx("lp-lead", styles.problem)}>{showcase.problem}</p>
      </Row>
    </>
  );
}

/* ── Stacked panel (mobile/tablet <1024px) ──────────────────────────────── */

function ShowcasePanel({ showcase }: { showcase: Showcase }) {
  const dark = showcase.theme === "dark";
  const visualRef = useRef<HTMLDivElement | null>(null);
  /* Masked scale-reveal trigger: once, ~40% of the visual in view. */
  const revealed = useInView(visualRef, { once: true, amount: 0.4 });

  return (
    <article
      className={cx(
        styles.panel,
        dark ? styles.panelDark : styles.panelLight,
        dark && "lp-dark",
      )}
    >
      <div className={styles.panelGrid}>
        <motion.div
          className={styles.copyCol}
          variants={copyStagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
        >
          <ShowcaseCopy showcase={showcase} dark={dark} Row={StaggerRow} />
        </motion.div>

        <div
          ref={visualRef}
          className={cx(styles.visualCol, revealed && styles.isRevealed)}
        >
          <div className={styles.visualMask}>
            <div className={styles.visualInner}>
              <Frame category={showcase.category}>
                <WorkflowRail steps={showcase.steps} />
              </Frame>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ── Pinned sequence (desktop ≥1024px) ──────────────────────────────────── */

function PinnedSequence() {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    const next = clampIndex(value);
    /* Functional update: React bails out when the index has not changed. */
    setActive((prev) => (prev === next ? prev : next));
  });

  /* Sync once after mount — anchor jumps / reloads can land mid-track. */
  useEffect(() => {
    const next = clampIndex(scrollYProgress.get());
    setActive((prev) => (prev === next ? prev : next));
  }, [scrollYProgress]);

  const showcase = SHOWCASES[active];
  const dark = showcase.theme === "dark";

  return (
    <div ref={trackRef} className={styles.track}>
      {/* Sticky panel — MUST NOT gain a transformed ancestor; all motion
          elements live inside it. */}
      <div className={styles.sticky}>
        <div className={cx("lp-container", styles.stickyInner)}>
          <SectionReveal className={cx("lp-section-head", styles.stickyHead)}>
            <span className="lp-eyebrow">{SHOWCASES_SECTION.eyebrow}</span>
            <h2 className={cx("lp-h2", styles.headTitle)}>
              <ShowcaseHeading />
            </h2>
            <ol className={styles.progress} aria-label="Showcase progress">
              {SHOWCASES.map((item, index) => (
                <li
                  key={item.id}
                  className={cx(
                    styles.progressItem,
                    index === active && styles.progressActive,
                  )}
                  aria-current={index === active ? "step" : undefined}
                >
                  <span className={styles.progressDot} aria-hidden="true" />
                  {item.category}
                </li>
              ))}
            </ol>
          </SectionReveal>

          {/* The one showcase surface: lp-dark swaps per active showcase
              (post-scroll only), background-color transitions in CSS. */}
          <div className={cx(styles.stage, dark && "lp-dark")}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={showcase.id}
                className={styles.stageGrid}
                initial="enter"
                animate="active"
                exit="exit"
              >
                <motion.div className={styles.copyCol} variants={pinnedCopy}>
                  <ShowcaseCopy showcase={showcase} dark={dark} Row={PlainRow} />
                </motion.div>

                <motion.div
                  className={styles.pinnedVisual}
                  variants={pinnedVisual}
                >
                  <Frame category={showcase.category}>
                    <WorkflowRail steps={showcase.steps} />
                  </Frame>
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Section ────────────────────────────────────────────────────────────── */

export default function WorkflowShowcases() {
  return (
    <section id="showcases" className={cx("lp-section", styles.section)}>
      {/* Desktop ≥1024px: pinned sequence (hidden below via CSS). */}
      <PinnedSequence />

      {/* Mobile/tablet <1024px: stacked panels (hidden ≥1024px). */}
      <div className={cx("lp-container", styles.stackedWrap)}>
        <SectionReveal className="lp-section-head">
          <span className="lp-eyebrow">{SHOWCASES_SECTION.eyebrow}</span>
          <h2 className="lp-h2">
            <ShowcaseHeading />
          </h2>
        </SectionReveal>

        {SHOWCASES.map((showcase) => (
          <ShowcasePanel key={showcase.id} showcase={showcase} />
        ))}
      </div>
    </section>
  );
}
