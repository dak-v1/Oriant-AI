"use client";
/**
 * StageJourney — brief §10: the pinned 7-stage narrative ("How Oriant works").
 *
 * Desktop (≥1024): a tall runway ((stages + 1.5) × 55vh) with a 100vh
 * position:sticky panel. Left: eyebrow + heading + a 7-stage rail with a 2px
 * progress track (useScroll → useSpring fill). Right: one large visual panel
 * whose inner content swaps per stage via the section's primary motion
 * concept — a pinned mask-crossfade (AnimatePresence mode="wait": outgoing
 * clip-path rises away, incoming un-clips from the bottom). The panel itself
 * never animates; only the inner stage layer does.
 *
 * Mobile/tablet (<1024): no pinning — an ordinary vertical flow of stage
 * cards, each with its visual in a smaller stage box, revealed once on entry.
 *
 * Reduced motion: the sticky layout is kept, but the stage swap becomes
 * instant (nested MotionConfig duration 0 — no DOM/props difference on the
 * server, where useReducedMotion() is null on both first renders), the rail
 * fill binds the raw scroll progress instead of the spring (style-only
 * difference; both start at 0), and every CSS loop in the module parks at a
 * complete-looking base frame via its own prefers-reduced-motion rule.
 * Internal loops (flow packets, calendar pulse) are gated by useInView so
 * they pause offscreen; the one JS timer (approval flip) is a gated one-shot.
 */

import {
  AnimatePresence,
  motion,
  MotionConfig,
  useInView,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
} from "framer-motion";
import type { Transition } from "framer-motion";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  Building2,
  Calculator,
  Calendar,
  ClipboardCheck,
  FileCode,
  FileText,
  HardDrive,
  Mail,
  MessageCircle,
  Mic,
  Package,
  Plug,
  Search,
  Send,
  ShieldCheck,
  User,
  UserCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ComponentType, CSSProperties, RefObject } from "react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  BUILD_STAGE,
  STAGES,
  STAGES_SECTION,
  type StageId,
} from "@/lib/landing-content";
import { DUR, EASE, STAGGER } from "./motion";
import styles from "./StageJourney.module.css";

/* ── Shared visual hooks ──────────────────────────────────────────────────── */

/** One-shot entry gate: plays a visual's internal entrance when it first
 *  becomes visible (mobile cards) or immediately after mount (desktop, where
 *  each stage visual remounts per activation inside the pinned panel). */
function useEntry(): { ref: RefObject<HTMLDivElement | null>; entered: boolean } {
  const ref = useRef<HTMLDivElement | null>(null);
  const entered = useInView(ref, { once: true, amount: 0.3 });
  return { ref, entered };
}

/** Reduce-aware transition factory. Transitions never reach server HTML, so
 *  branching here is hydration-safe (contract §hydration: reduced-motion may
 *  gate client-side animation behaviour, never rendered output). */
function useT(): (duration: number, delay?: number) => Transition {
  const reduce = useReducedMotion();
  return useMemo(
    () =>
      (duration: number, delay = 0): Transition =>
        reduce ? { duration: 0, delay: 0 } : { duration, delay, ease: EASE },
    [reduce],
  );
}

/* ── Stage visuals (all decorative; mounted under aria-hidden wrappers) ───── */

/** Row anchors (% of height) + path sets for the two flow diagrams.
 *  ViewBox is 560×340; the container keeps that exact aspect ratio, so the
 *  percentage-positioned HTML chips stay glued to the SVG path endpoints. */
const FLOW_ROWS = [19, 50, 81] as const;
const FORWARD_PATHS = [
  "M 118 64 C 250 64, 262 170, 402 170",
  "M 118 170 C 250 170, 262 170, 402 170",
  "M 118 276 C 250 276, 262 170, 402 170",
];
const REVERSE_PATHS = [
  "M 442 64 C 310 64, 298 170, 158 170",
  "M 442 170 C 310 170, 298 170, 158 170",
  "M 442 276 C 310 276, 298 170, 158 170",
];

function FlowDiagram({
  sources,
  targetMicro,
  targetLabel,
  targetIcon: TargetIcon,
  tone,
  reverse = false,
}: {
  sources: { label: string; icon: LucideIcon }[];
  targetMicro: string;
  targetLabel: string;
  targetIcon: LucideIcon;
  tone: "agent" | "human";
  reverse?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  /* Loop gate: packets only travel while the diagram is (near) on screen. */
  const looping = useInView(ref, { margin: "200px" });
  const paths = reverse ? REVERSE_PATHS : FORWARD_PATHS;

  return (
    <div
      ref={ref}
      className={`${styles.vis} ${styles.flow}`}
      data-anim={looping ? "on" : "off"}
      data-reverse={reverse ? "true" : undefined}
    >
      <svg
        className={styles.flowSvg}
        viewBox="0 0 560 340"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        {paths.map((d, i) => (
          <g key={d}>
            <path d={d} className={styles.flowDots} />
            {/* Packet = short dash travelling via stroke-dashoffset; its CSS
                base frame parks it at the destination (reads as delivered). */}
            <path
              d={d}
              className={styles.flowComet}
              pathLength={100}
              style={{ animationDelay: `${i * 0.55}s` }}
            />
          </g>
        ))}
      </svg>
      {sources.map((source, i) => {
        const Icon = source.icon;
        return (
          <span
            key={source.label}
            className={styles.flowChip}
            style={{ top: `${FLOW_ROWS[i]}%` }}
          >
            <Icon size={14} strokeWidth={2} aria-hidden="true" />
            {source.label}
          </span>
        );
      })}
      <div className={styles.flowTarget} data-tone={tone}>
        <span className={styles.flowTargetIcon}>
          <TargetIcon size={16} strokeWidth={2} aria-hidden="true" />
        </span>
        <span className={styles.flowTargetText}>
          <span className="lp-micro">{targetMicro}</span>
          <span className={styles.flowTargetLabel}>{targetLabel}</span>
        </span>
      </div>
    </div>
  );
}

/* 01 · Discover — business fragments flow into the Discovery Agent. */
function DiscoverVisual() {
  return (
    <FlowDiagram
      sources={[
        { label: "Lean Canvas", icon: FileText },
        { label: "Voice transcript", icon: Mic },
        { label: "Company info", icon: Building2 },
      ]}
      targetMicro="Agent"
      targetLabel="Discovery Agent"
      targetIcon={Search}
      tone="agent"
    />
  );
}

/* 02 · Plan — tier columns snap into a connected workflow row on entry. */
const TIER1 = ["Support", "Invoices", "Scheduling"];
const TIER2 = ["Brand review", "Site audit"];

function PlanVisual() {
  const { ref, entered } = useEntry();
  const t = useT();
  const rowChips = [
    ...TIER1.map((label) => ({ label, tier: "T1" })),
    ...TIER2.map((label) => ({ label, tier: "T2" })),
  ];
  return (
    <div ref={ref} className={`${styles.vis} ${styles.plan}`}>
      <div className={styles.planCols}>
        <div className={styles.planCol}>
          <span className="lp-micro">Tier 1 · Presets</span>
          <div className={styles.planColChips}>
            {TIER1.map((label) => (
              <span key={label} className={styles.ghostChip}>
                {label}
              </span>
            ))}
          </div>
        </div>
        <div className={styles.planCol}>
          <span className="lp-micro">Tier 2 · Custom</span>
          <div className={styles.planColChips}>
            {TIER2.map((label) => (
              <span key={label} className={styles.ghostChip}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <ArrowDown size={15} strokeWidth={2} className={styles.planArrow} aria-hidden="true" />
      <div className={styles.planRow}>
        <motion.span
          className={styles.planLine}
          initial={{ scaleX: 0 }}
          animate={entered ? { scaleX: 1 } : undefined}
          transition={t(0.5, 0.1)}
        />
        {rowChips.map((chip, i) => (
          <motion.span
            key={chip.label}
            className={styles.planChip}
            data-tier={chip.tier}
            initial={{ opacity: 0, y: -22, scale: 0.9 }}
            animate={entered ? { opacity: 1, y: 0, scale: 1 } : undefined}
            transition={t(0.5, 0.28 + i * STAGGER)}
          >
            <span className={styles.tierTag}>{chip.tier}</span>
            {chip.label}
          </motion.span>
        ))}
      </div>
    </div>
  );
}

/* 03 · Approve — pending flips to approved once per entry. */
function ApproveVisual() {
  const { ref, entered } = useEntry();
  const reduce = useReducedMotion();
  const t = useT();
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    if (!entered) return;
    /* Reduced motion (or a hidden tab) gets the finished frame immediately. */
    if (reduce || document.hidden) {
      setApproved(true);
      return;
    }
    const id = window.setTimeout(() => setApproved(true), 1400);
    return () => window.clearTimeout(id);
  }, [entered, reduce]);

  return (
    <div ref={ref} className={`${styles.vis} ${styles.approve}`}>
      <div className={styles.approveCard}>
        <div className={styles.approveHead}>
          <span className={styles.approveGlyph}>
            <UserCheck size={16} strokeWidth={2} aria-hidden="true" />
          </span>
          <span className={styles.approveTitles}>
            <span className="lp-micro">Human approval</span>
            <span className={styles.approveName}>Workforce plan · v1</span>
          </span>
          <span className={styles.badgeSlot}>
            {approved ? (
              <motion.span
                className="lp-status lp-status--approved"
                initial={{ opacity: 0, scale: 0.75 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={t(DUR.micro)}
              >
                Approved
              </motion.span>
            ) : (
              <span className="lp-status lp-status--pending">Pending</span>
            )}
          </span>
        </div>
        <p className={styles.approveNote}>
          Sensitive actions wait for your sign-off.
        </p>
        <div className={styles.approveActions}>
          <span className={styles.mockPill}>Review</span>
          <span className={styles.mockPill}>Edit</span>
          <span className={`${styles.mockPill} ${styles.mockPillPrimary}`}>Approve</span>
        </div>
      </div>
    </div>
  );
}

/* 04 · Build (spec §3.1) — the approved plan enters the build, becomes
   generated configuration, and the workflow is connected to external tools
   with owner approval; a five-step sequence rail reads underneath. */
const BUILD_TOOL_ICONS: Record<string, LucideIcon> = {
  email: Mail,
  calendar: Calendar,
  crm: Users,
  accounting: Calculator,
  storage: HardDrive,
  messaging: MessageCircle,
  mcp: Plug,
};

function BuildVisual() {
  const { ref, entered } = useEntry();
  const t = useT();
  return (
    <div ref={ref} className={`${styles.vis} ${styles.buildFlow}`}>
      {/* Approved plan → generated configuration */}
      <div className={styles.buildTop}>
        <motion.div
          className={styles.buildPlanChip}
          initial={{ opacity: 0, x: -14 }}
          animate={entered ? { opacity: 1, x: 0 } : undefined}
          transition={t(0.4, 0.05)}
        >
          <ClipboardCheck size={14} strokeWidth={2} aria-hidden="true" />
          <span>{BUILD_STAGE.input}</span>
        </motion.div>
        <ArrowRight
          size={15}
          strokeWidth={2}
          className={styles.buildArrow}
          aria-hidden="true"
        />
        <motion.div
          className={styles.buildGenCard}
          initial={{ opacity: 0, y: 14 }}
          animate={entered ? { opacity: 1, y: 0 } : undefined}
          transition={t(0.45, 0.2)}
        >
          <div className={styles.buildCardHead}>
            <FileCode size={14} strokeWidth={2} aria-hidden="true" />
            <span className="lp-micro">{BUILD_STAGE.outputsTitle}</span>
          </div>
          <div className={styles.buildOutputs}>
            {BUILD_STAGE.outputs.map((output, i) => (
              <motion.span
                key={output}
                className={styles.buildOutputRow}
                initial={{ opacity: 0, x: -10 }}
                animate={entered ? { opacity: 1, x: 0 } : undefined}
                transition={t(0.35, 0.34 + i * 0.1)}
              >
                <FileText size={13} strokeWidth={2} aria-hidden="true" />
                {output}
              </motion.span>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Connect tools — owner-approved connections */}
      <motion.div
        className={styles.buildToolsCard}
        initial={{ opacity: 0, y: 14 }}
        animate={entered ? { opacity: 1, y: 0 } : undefined}
        transition={t(0.45, 0.55)}
      >
        <div className={styles.buildCardHead}>
          <Plug size={14} strokeWidth={2} aria-hidden="true" />
          <span className="lp-micro">{BUILD_STAGE.connectTitle}</span>
          <span className={styles.buildApproveNote}>
            <UserCheck size={13} strokeWidth={2} aria-hidden="true" />
            {BUILD_STAGE.connectNote}
          </span>
        </div>
        <div className={styles.buildToolChips}>
          {BUILD_STAGE.tools.map((tool, i) => {
            const Icon = BUILD_TOOL_ICONS[tool.id] ?? Plug;
            return (
              <motion.span
                key={tool.id}
                className={styles.buildToolChip}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={entered ? { opacity: 1, scale: 1 } : undefined}
                transition={t(0.3, 0.65 + i * 0.07)}
              >
                <Icon size={13} strokeWidth={2} aria-hidden="true" />
                {tool.label}
              </motion.span>
            );
          })}
        </div>
      </motion.div>

      {/* Five-step build sequence (arrows are icons, never copy) */}
      <div className={styles.buildSeq}>
        {BUILD_STAGE.sequence.map((step, i) => (
          <Fragment key={step}>
            {i > 0 && (
              <ArrowRight
                size={12}
                strokeWidth={2}
                className={styles.buildSeqArrow}
                aria-hidden="true"
              />
            )}
            <motion.span
              className={`${styles.buildSeqStep}${
                i === BUILD_STAGE.sequence.length - 1
                  ? ` ${styles.buildSeqDone}`
                  : ""
              }`}
              initial={{ opacity: 0 }}
              animate={entered ? { opacity: 1 } : undefined}
              transition={t(0.3, 1.1 + i * 0.12)}
            >
              {step}
            </motion.span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/* 05 · Deploy — the agent package slides into the isolated sandbox. */
function DeployVisual() {
  const { ref, entered } = useEntry();
  const t = useT();
  return (
    <div ref={ref} className={`${styles.vis} ${styles.deploy}`}>
      <div className={styles.deployGhost}>
        <Package size={14} strokeWidth={2} aria-hidden="true" />
        <span>Agent package</span>
      </div>
      <ArrowRight size={15} strokeWidth={2} className={styles.deployArrow} aria-hidden="true" />
      <div className={styles.sandbox}>
        <div className={styles.sandboxHead}>
          <ShieldCheck size={15} strokeWidth={2} aria-hidden="true" />
          <span className="lp-micro">Isolated sandbox</span>
        </div>
        <motion.div
          className={styles.deployPill}
          initial={{ x: -150, opacity: 0.4 }}
          animate={entered ? { x: 0, opacity: 1 } : undefined}
          transition={t(0.7, 0.15)}
        >
          <Package size={14} strokeWidth={2} aria-hidden="true" />
          <span>Support Agent · v1</span>
        </motion.div>
        <motion.span
          className={`lp-status lp-status--active ${styles.sandboxStatus}`}
          initial={{ opacity: 0 }}
          animate={entered ? { opacity: 1 } : undefined}
          transition={t(0.35, 0.9)}
        >
          Active
        </motion.span>
      </div>
    </div>
  );
}

/* 06 · Manage — mini workspace: calendar, activity feed, approvals counter. */
const SCHEDULED_CELLS = new Set([2, 5, 9, 12, 16, 23, 26]);
const TODAY_CELL = 17;
const FEED_ROWS = [
  { tone: "teal", a: 34, b: 52 },
  { tone: "blue", a: 44, b: 40 },
  { tone: "teal", a: 28, b: 58 },
  { tone: "blue", a: 38, b: 46 },
];

function ManageVisual() {
  const { ref, entered } = useEntry();
  const looping = useInView(ref, { margin: "200px" });
  const t = useT();
  return (
    <div
      ref={ref}
      className={`${styles.vis} ${styles.manage}`}
      data-anim={looping ? "on" : "off"}
    >
      <div className={styles.manageGrid}>
        <div className={styles.manageCard}>
          <div className={styles.manageHead}>
            <Calendar size={14} strokeWidth={2} aria-hidden="true" />
            <span className="lp-micro">Schedule</span>
          </div>
          <div className={styles.calGrid}>
            {Array.from({ length: 28 }, (_, i) => (
              <span
                key={i}
                className={styles.calCell}
                data-on={SCHEDULED_CELLS.has(i) ? "true" : undefined}
                data-today={i === TODAY_CELL ? "true" : undefined}
              />
            ))}
          </div>
        </div>
        <div className={styles.manageCard}>
          <div className={styles.manageHead}>
            <Activity size={14} strokeWidth={2} aria-hidden="true" />
            <span className="lp-micro">Activity</span>
          </div>
          <div className={styles.feed}>
            {FEED_ROWS.map((row, i) => (
              <motion.div
                key={i}
                className={styles.feedRow}
                data-tone={row.tone}
                initial={{ opacity: 0, x: -14 }}
                animate={entered ? { opacity: 1, x: 0 } : undefined}
                transition={t(0.4, 0.15 + i * 0.1)}
              >
                <span className={styles.feedDot} />
                <span className={styles.feedBarA} style={{ width: `${row.a}%` }} />
                <span className={styles.feedBarB} style={{ width: `${row.b}%` }} />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.approvalsChip}>
        <UserCheck size={14} strokeWidth={2} aria-hidden="true" />
        <span>Approvals</span>
        <span className={styles.approvalsCount}>3</span>
      </div>
    </div>
  );
}

/* 07 · Stay Connected — channels converge on the owner. */
function ConnectedVisual() {
  return (
    <FlowDiagram
      sources={[
        { label: "WhatsApp", icon: MessageCircle },
        { label: "Telegram", icon: Send },
        { label: "Email", icon: Mail },
      ]}
      targetMicro="Human"
      targetLabel="Owner"
      targetIcon={User}
      tone="human"
      reverse
    />
  );
}

const VISUALS: Record<StageId, ComponentType> = {
  discover: DiscoverVisual,
  plan: PlanVisual,
  approve: ApproveVisual,
  build: BuildVisual,
  deploy: DeployVisual,
  manage: ManageVisual,
  connected: ConnectedVisual,
};

function StageVisual({ id }: { id: StageId }) {
  const Visual = VISUALS[id];
  return <Visual />;
}

/* ── Section ──────────────────────────────────────────────────────────────── */

export default function StageJourney() {
  const runwayRef = useRef<HTMLDivElement | null>(null);
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);

  const { scrollYProgress } = useScroll({
    target: runwayRef,
    offset: ["start start", "end end"],
  });
  const springFill = useSpring(scrollYProgress, {
    stiffness: 110,
    damping: 26,
    mass: 0.4,
  });

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (!Number.isFinite(v)) return;
    setActive(
      Math.min(STAGES.length - 1, Math.max(0, Math.floor(v * STAGES.length))),
    );
  });

  const stage = STAGES[active];

  return (
    <section id="how-it-works" className={styles.section}>
      {/* Desktop: tall runway + 100vh sticky panel (native sticky pinning). */}
      <div
        ref={runwayRef}
        className={styles.runway}
        style={{ "--stage-count": STAGES.length } as CSSProperties}
      >
        <div className={styles.pin}>
          <div className={`lp-container ${styles.pinGrid}`}>
            <div className={styles.left}>
              <span className="lp-eyebrow">{STAGES_SECTION.eyebrow}</span>
              <h2 className={`lp-h2-sm ${styles.heading}`}>
                {STAGES_SECTION.heading}
              </h2>
              <div className={styles.railWrap}>
                <div className={styles.track} aria-hidden="true">
                  {/* Under reduced motion the fill binds raw progress (no
                      spring). Both motion values start at 0 → identical
                      server/client first paint. */}
                  <motion.div
                    className={styles.trackFill}
                    style={{ scaleY: reduce ? scrollYProgress : springFill }}
                  />
                </div>
                {/* role="list" restores list semantics WebKit drops on
                    list-style:none. */}
                <ol className={styles.rail} role="list">
                  {STAGES.map((s, i) => (
                    <li
                      key={s.id}
                      className={styles.railItem}
                      data-active={i === active ? "true" : undefined}
                      aria-current={i === active ? "step" : undefined}
                    >
                      <span className={`lp-micro ${styles.railNum}`}>{s.n}</span>
                      <div className={styles.railText}>
                        <h3 className={styles.railTitle}>
                          <span className={styles.railDot} aria-hidden="true" />
                          {s.title}
                        </h3>
                        <div className={styles.railBodyWrap}>
                          <div className={styles.railBodyInner}>
                            <p className={styles.railBody}>{s.body}</p>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {/* Right visual panel — decorative; the rail carries meaning. */}
            <div className={styles.right} aria-hidden="true">
              <div className={styles.panel}>
                <div className={`lp-stage-grid ${styles.panelWash}`} />
                <div className={`lp-glow-blue ${styles.panelGlow}`} />
                <div className={styles.stageViewport}>
                  <MotionConfig
                    transition={
                      reduce ? { duration: 0 } : { duration: 0.45, ease: EASE }
                    }
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={stage.id}
                        className={styles.stageLayer}
                        initial={{ opacity: 0, clipPath: "inset(100% 0 0 0)" }}
                        animate={{ opacity: 1, clipPath: "inset(0 0 0 0)" }}
                        exit={{ clipPath: "inset(0 0 100% 0)" }}
                      >
                        <span className={`lp-micro ${styles.stageTag}`}>
                          {`Stage ${stage.n} · ${stage.title}`}
                        </span>
                        <div className={styles.visHolder}>
                          <StageVisual id={stage.id} />
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </MotionConfig>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile / tablet: plain vertical stage cards, no pinning. */}
      <div className={`lp-section ${styles.mobileWrap}`}>
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-eyebrow">{STAGES_SECTION.eyebrow}</span>
            <h2 className="lp-h2-sm">{STAGES_SECTION.heading}</h2>
          </div>
          <ol className={styles.cardList} role="list">
            {STAGES.map((s) => (
              <motion.li
                key={s.id}
                className={styles.card}
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "0px 0px -70px 0px" }}
                transition={{ duration: DUR.card, ease: EASE, delay: STAGGER }}
              >
                <div className={styles.cardMeta}>
                  <span className={`lp-micro ${styles.cardNum}`}>{s.n}</span>
                  <h3 className={styles.cardTitle}>{s.title}</h3>
                </div>
                <p className={styles.cardBody}>{s.body}</p>
                <div
                  className={`lp-stage-grid ${styles.cardVisual}`}
                  aria-hidden="true"
                >
                  <StageVisual id={s.id} />
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
