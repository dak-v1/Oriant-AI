"use client";
/**
 * WorkflowShowcases — brief §13, revised per owner review ("fixed position,
 * the thing transitions instead").
 *
 * Desktop (≥1024px) primary motion concept: ONE PINNED SEQUENCE. The section
 * becomes a ~330vh scroll track with a 100vh `position: sticky` stage panel.
 * Scroll progress (useScroll, ["start start","end end"]) selects the active
 * showcase — clamp(floor(progress × 3), 0, 2) — via useMotionValueEvent into
 * state (set only when the index changes). On change, AnimatePresence
 * mode="wait" transitions the stage IN PLACE: the outgoing copy column
 * slides/fades left under a rising clip mask, the incoming copy enters from
 * the right (0.45s, EASE), and the workspace-frame visual crossfades while
 * settling from scale 1.04 → 1. The stage surface re-themes per showcase
 * (finance is the dark one) by swapping the global `lp-dark` class with a CSS
 * background-color transition — a post-scroll class swap only, so there is no
 * hydration risk (server and first client render both show showcase 0, light).
 * A 3-label progress indicator (category names, active in accent) shows the
 * sequence has three steps.
 *
 * CRITICAL sticky rule: no transformed ancestor wraps the sticky panel — the
 * track and section carry no motion; every animated element (SectionReveal
 * head, swapping columns) lives INSIDE the sticky panel.
 *
 * Mobile/tablet (<1024px): the original stacked panels, untouched — masked
 * visual scale-reveal + copy stagger. Both trees are rendered and gated purely
 * by CSS media queries (no JS viewport branching).
 *
 * Loops: the single held-card outline pulse per visual is play-state-gated by
 * useInView (paused offscreen), base frame reads complete under reduced
 * motion. Reduced motion: MotionConfig (reducedMotion="user") strips the
 * transform portion of the swaps (opacity swap remains, effectively instant),
 * the CSS theme transition is disabled, and the sticky sequence stays fully
 * readable via normal scrolling.
 */
import { useEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValueEvent,
  useScroll,
} from "framer-motion";
import type { Variants } from "framer-motion";
import {
  ArrowDown,
  ArrowRight,
  CalendarDays,
  FileText,
  Inbox,
  PenLine,
  Search,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { SHOWCASES, SHOWCASES_SECTION } from "@/lib/landing-content";
import { DUR, EASE } from "./motion";
import SectionReveal from "./SectionReveal";
import styles from "./WorkflowShowcases.module.css";

type Showcase = (typeof SHOWCASES)[number];

const cx = (...parts: Array<string | false | undefined>) =>
  parts.filter(Boolean).join(" ");

/**
 * Human roles in the agents row get the distinct human chip. Exact-match only:
 * SHOWCASES lists "Human Approval" and "Finance Approver" as the human seats,
 * while e.g. "Brand Review Agent" is an AI agent and must NOT match.
 */
const HUMAN_ROLE = /^(human approval|finance approver)$/i;

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

/* ── Mock workspace frame (decorative; the whole visual column is aria-hidden).
   Deliberately NOT browser chrome — no traffic dots / address pill. The page's
   single browser-chrome device lives in VideoRevealSection; showcases read as a
   product workspace with a micro-style header bar instead. ── */

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

/* Customer ops: inbox rows → agent reply drafts → escalation held at Pending */
function CustomerVisual() {
  return (
    <div className={styles.customerLanes}>
      <div className={styles.lane}>
        <div className={styles.laneHead}>
          <Inbox size={14} strokeWidth={2} aria-hidden="true" />
          <span>Inbox</span>
        </div>
        <div className={styles.laneStack}>
          {(
            [
              ["Order #1042", "Where is my delivery?", "09:12", false],
              ["Order #1029", "Refund request, item damaged", "09:37", false],
              ["Order #1051", "Change delivery address", "10:04", true],
            ] as const
          ).map(([title, snippet, time, hide]) => (
            <div
              key={title}
              className={cx(styles.inboxRow, hide && styles.hideMobile)}
            >
              <span className={styles.inboxDot} />
              <span className={styles.inboxText}>
                <span className={styles.inboxTitle}>{title}</span>
                <span className={styles.inboxSnippet}>{snippet}</span>
              </span>
              <span className={styles.inboxTime}>{time}</span>
            </div>
          ))}
        </div>
      </div>

      <span className={styles.laneArrow}>
        <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
      </span>

      <div className={styles.lane}>
        <div className={styles.laneHead}>
          <PenLine size={14} strokeWidth={2} aria-hidden="true" />
          <span>Agent drafts</span>
        </div>
        <div className={styles.laneStack}>
          {(
            [
              ["Reply · Order #1042", false],
              ["Reply · Order #1051", true],
            ] as const
          ).map(([title, hide]) => (
            <div
              key={title}
              className={cx(styles.miniCard, hide && styles.hideMobile)}
            >
              <span className={styles.cardMicro}>Customer Support Agent</span>
              <span className={styles.cardTitle}>{title}</span>
              <span className={styles.skelBar} />
              <span className={cx(styles.skelBar, styles.skelShort)} />
              <span className={styles.statusRow}>
                <span className="lp-status lp-status--active">Drafted</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <span className={styles.laneArrow}>
        <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
      </span>

      <div className={styles.lane}>
        <div className={styles.laneHead}>
          <UserCheck size={14} strokeWidth={2} aria-hidden="true" />
          <span>Escalations</span>
        </div>
        <div className={styles.laneStack}>
          <div className={cx(styles.miniCard, styles.pulseCard)}>
            <span className={styles.cardMicro}>Order Exception Agent</span>
            <span className={styles.cardTitle}>Refund · Order #1029</span>
            <span className={styles.cardNote}>Held for human sign-off</span>
            <span className={styles.statusRow}>
              <span className="lp-status lp-status--pending">Pending</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Finance ops: document chips → extracted-field rows → payment task at Review */
function FinanceVisual() {
  return (
    <div className={styles.financeFlow}>
      <div>
        <div className={styles.laneHead}>
          <FileText size={14} strokeWidth={2} aria-hidden="true" />
          <span>Documents in</span>
        </div>
        <div className={styles.docChips}>
          {["invoice-2481.pdf", "supplier-scan.pdf", "utilities-march.pdf"].map(
            (doc) => (
              <span key={doc} className={styles.docChip}>
                <FileText
                  size={14}
                  strokeWidth={2}
                  aria-hidden="true"
                  className={styles.docIcon}
                />
                {doc}
              </span>
            ),
          )}
        </div>
      </div>

      <span className={styles.flowArrow}>
        <ArrowDown size={14} strokeWidth={2} aria-hidden="true" />
      </span>

      <div>
        <div className={styles.laneHead}>
          <Search size={14} strokeWidth={2} aria-hidden="true" />
          <span>Extracted fields</span>
        </div>
        <div className={styles.fieldTable}>
          <div className={cx(styles.fieldRow, styles.fieldHead)}>
            <span className={styles.fieldCell}>Vendor</span>
            <span className={styles.fieldCell}>Invoice</span>
            <span className={cx(styles.fieldCell, styles.cellNum)}>Amount</span>
            <span className={cx(styles.fieldCell, styles.cellDue)}>Due</span>
          </div>
          {(
            [
              ["Meridian Supplies", "INV-2481", "$2,340.00", "14 Aug"],
              ["Halden Logistics", "INV-0977", "$860.50", "18 Aug"],
              ["Corio Utilities", "INV-3310", "$412.75", "21 Aug"],
            ] as const
          ).map(([vendor, inv, amount, due]) => (
            <div key={inv} className={styles.fieldRow}>
              <span className={styles.fieldCell}>{vendor}</span>
              <span className={styles.fieldCell}>{inv}</span>
              <span className={cx(styles.fieldCell, styles.cellNum)}>{amount}</span>
              <span className={cx(styles.fieldCell, styles.cellDue)}>{due}</span>
            </div>
          ))}
        </div>
      </div>

      <span className={styles.flowArrow}>
        <ArrowDown size={14} strokeWidth={2} aria-hidden="true" />
      </span>

      <div className={cx(styles.miniCard, styles.pulseCard, styles.pulseBlue)}>
        <span className={styles.cardMicro}>Invoice Preparation Agent</span>
        <span className={styles.statusRow}>
          <span className={styles.cardTitle}>Payment task · Meridian Supplies</span>
          <span className="lp-status lp-status--review">Review requested</span>
        </span>
        <span className={styles.cardNote}>$2,340.00 · due 14 Aug</span>
        <span className={styles.taskFoot}>
          <UserCheck size={14} strokeWidth={2} aria-hidden="true" />
          <span className={styles.cardNote}>Waiting on Finance Approver</span>
        </span>
      </div>
    </div>
  );
}

/* Marketing ops: research notes → draft cards → calendar row with Approved */
function MarketingVisual() {
  return (
    <div className={styles.marketingBoard}>
      <div className={styles.boardTop}>
        <div className={styles.lane}>
          <div className={styles.laneHead}>
            <Search size={14} strokeWidth={2} aria-hidden="true" />
            <span>Research notes</span>
          </div>
          <div className={styles.laneStack}>
            {(
              [
                ["Audience insight", false],
                ["Channel scan", true],
              ] as const
            ).map(([title, hide]) => (
              <div
                key={title}
                className={cx(styles.noteCard, hide && styles.hideMobile)}
              >
                <span className={styles.cardMicro}>Research Agent</span>
                <span className={styles.cardTitle}>{title}</span>
                <span className={styles.skelBar} />
                <span className={cx(styles.skelBar, styles.skelShort)} />
              </div>
            ))}
          </div>
        </div>

        <div className={styles.lane}>
          <div className={styles.laneHead}>
            <PenLine size={14} strokeWidth={2} aria-hidden="true" />
            <span>Drafts</span>
          </div>
          <div className={styles.laneStack}>
            <div className={styles.miniCard}>
              <span className={styles.cardMicro}>Content Agent</span>
              <span className={styles.cardTitle}>Spring offer post</span>
              <span className={styles.statusRow}>
                <span className="lp-status lp-status--active">Draft</span>
              </span>
            </div>
            <div className={cx(styles.miniCard, styles.pulseCard)}>
              <span className={styles.cardMicro}>Brand Review Agent</span>
              <span className={styles.cardTitle}>Product guide</span>
              <span className={styles.cardNote}>Waiting on your approval</span>
              <span className={styles.statusRow}>
                <span className="lp-status lp-status--pending">Pending</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className={styles.laneHead}>
          <CalendarDays size={14} strokeWidth={2} aria-hidden="true" />
          <span>Content calendar</span>
        </div>
        <div className={styles.calGrid}>
          {(
            [
              ["Mon", null, false],
              ["Tue", null, true],
              ["Wed", "Launch announcement", false],
              ["Thu", null, true],
              ["Fri", null, false],
            ] as const
          ).map(([day, item, hide]) => (
            <div
              key={day}
              className={cx(
                styles.calSlot,
                item !== null && styles.calFilled,
                hide && styles.hideMobile,
              )}
            >
              <span className={styles.calDay}>{day}</span>
              {item !== null && (
                <>
                  <span className={styles.calTitle}>{item}</span>
                  <span className="lp-status lp-status--approved">Approved</span>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ShowcaseVisual({ id }: { id: string }) {
  if (id === "finance") return <FinanceVisual />;
  if (id === "marketing") return <MarketingVisual />;
  return <CustomerVisual />;
}

/* ── Copy column (shared) ───────────────────────────────────────────────────
   The stacked tree wraps each row in a staggered motion.div; the pinned tree
   slides the whole column as one unit, so its rows are plain divs. The Row
   component is injected to keep one source of markup for both. ── */

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

      <dl className={styles.metaList}>
        <Row className={styles.metaBlock}>
          <dt className={cx("lp-micro", styles.metaLabel)}>Agents involved</dt>
          <dd className={styles.chipRow}>
            {showcase.agents.map((agent) =>
              HUMAN_ROLE.test(agent) ? (
                <span key={agent} className={cx(styles.chip, styles.chipHuman)}>
                  <UserCheck
                    size={15}
                    strokeWidth={2}
                    aria-hidden="true"
                    className={styles.chipHumanIcon}
                  />
                  {agent}
                </span>
              ) : (
                <span key={agent} className={styles.chip}>
                  <span className={styles.chipDot} />
                  {agent}
                </span>
              ),
            )}
          </dd>
        </Row>

        <Row className={styles.metaBlock}>
          <dt className={cx("lp-micro", styles.metaLabel)}>
            Human approval point
          </dt>
          <dd className={styles.approvalCallout}>
            <ShieldCheck
              size={18}
              strokeWidth={2}
              aria-hidden="true"
              className={styles.approvalIcon}
            />
            <p>{showcase.approvalPoint}</p>
          </dd>
        </Row>

        <Row className={styles.metaBlock}>
          <dt className={cx("lp-micro", styles.metaLabel)}>Result</dt>
          <dd className={styles.resultRow}>
            <ArrowRight
              size={18}
              strokeWidth={2}
              aria-hidden="true"
              className={styles.resultIcon}
            />
            <p>{showcase.result}</p>
          </dd>
        </Row>

        <Row className={styles.metaBlock}>
          <dt className={cx("lp-micro", styles.metaLabel)}>Integrations</dt>
          <dd className={styles.chipRow}>
            {showcase.integrations.map((tool) => (
              <span key={tool} className={styles.quietChip}>
                {tool}
              </span>
            ))}
          </dd>
        </Row>
      </dl>
    </>
  );
}

/* ── Stacked panel (mobile/tablet <1024px — unchanged behaviour) ────────── */

function ShowcasePanel({ showcase }: { showcase: Showcase }) {
  const dark = showcase.theme === "dark";
  const panelRef = useRef<HTMLElement | null>(null);
  const visualRef = useRef<HTMLDivElement | null>(null);
  /* Masked scale-reveal trigger: once, ~40% of the visual in view. */
  const revealed = useInView(visualRef, { once: true, amount: 0.4 });
  /* Loop gate: the pending-card pulse only runs while the panel is near. */
  const live = useInView(panelRef, { margin: "200px" });

  return (
    <article
      ref={panelRef}
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
          aria-hidden="true"
          className={cx(
            styles.visualCol,
            revealed && styles.isRevealed,
            live && styles.isLive,
          )}
        >
          <div
            className={cx(
              styles.visualGlow,
              dark ? "lp-glow-blue" : "lp-glow-teal",
            )}
          />
          <div className={styles.visualMask}>
            <div className={styles.visualInner}>
              <Frame category={showcase.category}>
                <ShowcaseVisual id={showcase.id} />
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
  /* Loop gate: the held-card outline pulse pauses while the track is away. */
  const live = useInView(trackRef, { margin: "200px" });
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
          <div
            className={cx(
              styles.stage,
              dark && "lp-dark",
              live && styles.isLive,
            )}
          >
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
                  aria-hidden="true"
                  className={styles.pinnedVisual}
                  variants={pinnedVisual}
                >
                  <div
                    className={cx(
                      styles.visualGlow,
                      dark ? "lp-glow-blue" : "lp-glow-teal",
                    )}
                  />
                  <Frame category={showcase.category}>
                    <ShowcaseVisual id={showcase.id} />
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

      {/* Mobile/tablet <1024px: original stacked panels (hidden ≥1024px). */}
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
