"use client";
/**
 * CapabilityComposition — brief §11, <section id="features">.
 * A dense, varied capability composition on a 4-column editorial grid
 * (desktop ≥1280, 20px gap): discovery large 2×2 · col 3 stacks
 * planning + approvals · col 4 stacks deployment + channels · row 3 is
 * dashboard wide (cols 1–3) + improve compact. Every card sits at natural
 * height (no bottom-pinned filler), 2 columns on tablet, 1 on mobile.
 *
 * PRIMARY MOTION CONCEPT — varied reveal directions + internal masked
 * micro-animations: cards enter whileInView-once from DIFFERENT directions
 * by role (large y+40 · planning x+40 · mediums y+28 with alternating x ·
 * wide scale 0.97 · compacts x±32) with a 0.07s stagger, and each card
 * carries a small aria-hidden product loop built from local CSS keyframes
 * animating ONLY transform / opacity / clip-path / SVG stroke-dashoffset.
 *
 * All loops are gated by ONE shared useInView on the section root (no
 * `once`): the `.playing` class applies the animations; offscreen, base
 * styles show a complete-looking static tableau — which is also exactly
 * what prefers-reduced-motion visitors see (module-level media rule).
 * Desktop fine pointers get a ≤4px spring translate on the INNER card div
 * (never the entrance motion wrapper); hover darkens border / deepens
 * shadow only — text never moves.
 */
import {
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { Check, Mail, MessageCircle, Pencil, Send } from "lucide-react";
import { useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { CAPABILITIES, CAPABILITIES_SECTION } from "@/lib/landing-content";
import { DUR, EASE } from "./motion";
import SectionReveal from "./SectionReveal";
import styles from "./CapabilityComposition.module.css";

type Capability = (typeof CAPABILITIES)[number];

/* Varied entrance directions by card (brief §21: never fade-up-everything). */
const ENTRY_FROM: Record<string, { x?: number; y?: number; scale?: number }> = {
  discovery: { y: 40 },
  planning: { x: 40 },
  approvals: { y: 28, x: 24 },
  deployment: { y: 28, x: -24 },
  dashboard: { scale: 0.97 },
  channels: { x: -32 },
  improve: { x: 32 },
};

/* 0.07s stagger inside each visual band of the grid: the top band is
   discovery → planning → deployment → approvals → channels (reading
   order of the stacked columns), row 3 is dashboard → improve. */
const ENTRY_DELAY: Record<string, number> = {
  discovery: 0,
  planning: 0.07,
  deployment: 0.14,
  approvals: 0.21,
  channels: 0.28,
  dashboard: 0,
  improve: 0.07,
};

const CELL_CLASS: Record<string, string> = {
  discovery: styles.cellDiscovery,
  planning: styles.cellPlanning,
  approvals: styles.cellApprovals,
  deployment: styles.cellDeployment,
  dashboard: styles.cellDashboard,
  channels: styles.cellChannels,
  improve: styles.cellImprove,
};

const FOLLOW_SPRING = { stiffness: 220, damping: 24, mass: 0.6 } as const;

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

/* Serif accent on the final two words of the section heading only. */
const HEADING_WORDS = CAPABILITIES_SECTION.heading.split(" ");
const HEADING_LEAD = HEADING_WORDS.slice(0, -2).join(" ");
const HEADING_ACCENT = HEADING_WORDS.slice(-2).join(" ");

export default function CapabilityComposition() {
  const sectionRef = useRef<HTMLElement | null>(null);
  /* ONE shared inView gate for every CSS loop in the section (no `once`). */
  const playing = useInView(sectionRef, { margin: "200px" });

  return (
    <section
      id="features"
      ref={sectionRef}
      className={`lp-section ${styles.section}`}
    >
      <div className="lp-container">
        <SectionReveal className="lp-section-head">
          <span className="lp-eyebrow">{CAPABILITIES_SECTION.eyebrow}</span>
          <h2 className="lp-h2">
            {HEADING_LEAD} <span className="lp-serif">{HEADING_ACCENT}</span>
          </h2>
        </SectionReveal>

        <div className={`${styles.grid}${playing ? ` ${styles.playing}` : ""}`}>
          {CAPABILITIES.map((cap) => (
            <CapabilityCard key={cap.id} cap={cap}>
              <CapabilityStage id={cap.id} />
            </CapabilityCard>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Card shell: role-based entrance + desktop pointer-follow spring ────── */

function CapabilityCard({
  cap,
  children,
}: {
  cap: Capability;
  children: ReactNode;
}) {
  /* Read ONLY inside callbacks — render output never branches on it. */
  const reduce = useReducedMotion();
  const finePointer = useRef(false);
  const dx = useMotionValue(0);
  const dy = useMotionValue(0);
  const sx = useSpring(dx, FOLLOW_SPRING);
  const sy = useSpring(dy, FOLLOW_SPRING);

  useEffect(() => {
    const mq = window.matchMedia(
      "(min-width: 1024px) and (hover: hover) and (pointer: fine)",
    );
    const update = () => {
      finePointer.current = mq.matches;
      if (!mq.matches) {
        dx.set(0);
        dy.set(0);
      }
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [dx, dy]);

  const handleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (reduce || !finePointer.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const nx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const ny = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    dx.set(clamp1(nx) * 4);
    dy.set(clamp1(ny) * 4);
  };

  const handleLeave = () => {
    dx.set(0);
    dy.set(0);
  };

  return (
    <motion.div
      className={`${styles.cell} ${CELL_CLASS[cap.id] ?? ""}`}
      initial={{ opacity: 0, ...(ENTRY_FROM[cap.id] ?? { y: 28 }) }}
      whileInView={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "0px 0px -70px 0px" }}
      transition={{
        duration: DUR.card,
        ease: EASE,
        delay: ENTRY_DELAY[cap.id] ?? 0,
      }}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      {/* Pointer-follow + hover chrome live here, never on the wrapper. */}
      <motion.div className={`lp-card ${styles.card}`} style={{ x: sx, y: sy }}>
        <h3 className="lp-h3">{cap.title}</h3>
        <p className={styles.body}>{cap.body}</p>
        {children}
      </motion.div>
    </motion.div>
  );
}

/* ── Per-card decorative loops (aria-hidden; title + body carry meaning) ── */

function CapabilityStage({ id }: { id: string }) {
  switch (id) {
    case "discovery":
      return <DiscoveryStage />;
    case "planning":
      return <PlanningStage />;
    case "approvals":
      return <ApprovalsStage />;
    case "deployment":
      return <DeploymentStage />;
    case "dashboard":
      return <DashboardStage />;
    case "channels":
      return <ChannelsStage />;
    case "improve":
      return <ImproveStage />;
    default:
      return null;
  }
}

/* Large: question chips slide into an analysing bar; a report assembles
   from masked rows — one gentle 8s cycle. */
function DiscoveryStage() {
  return (
    <div
      className={`${styles.stage} ${styles.stageDiscovery} lp-stage-grid`}
      aria-hidden="true"
    >
      <div className={styles.discLeft}>
        <span className={`${styles.qchip} ${styles.qchip1}`}>
          What do you sell?
        </span>
        <span className={`${styles.qchip} ${styles.qchip2}`}>
          Where do orders pile up?
        </span>
        <div className={styles.scanBar}>
          <span className="lp-micro">Analysing</span>
          <span className={styles.scanTrack}>
            <span className={styles.scanFill} />
          </span>
        </div>
      </div>
      <div className={`${styles.miniCard} ${styles.reportCard}`}>
        <span className="lp-micro">Company report</span>
        <div className={styles.reportRows}>
          <span className={`${styles.reportRow} ${styles.rr1}`}>
            Channels: online storefront
          </span>
          <span className={`${styles.reportRow} ${styles.rr2}`}>
            Bottleneck: order questions
          </span>
          <span className={`${styles.reportRow} ${styles.rr3}`}>
            Opportunity: support agent
          </span>
          <span className={`${styles.reportRow} ${styles.rr4}`}>
            Opportunity: invoice prep
          </span>
        </div>
      </div>
    </div>
  );
}

/* Medium: preset + custom chips snap vertically onto a workflow spine,
   connector ticks appearing as each lands — visual sits directly under
   the text at natural height. */
const PLAN_ROWS = [
  { label: "Preset · Support", custom: false },
  { label: "Preset · Invoices", custom: false },
  { label: "Preset · Scheduling", custom: false },
  { label: "Custom · Outreach", custom: true },
];

function PlanningStage() {
  return (
    <div
      className={`${styles.stage} ${styles.stagePlanning}`}
      aria-hidden="true"
    >
      <span className={`lp-micro ${styles.stageLabel}`}>Workflow plan</span>
      <div className={styles.planRows}>
        <span className={styles.spine} />
        {PLAN_ROWS.map((row, i) => (
          <div key={row.label} className={styles.planRow}>
            <span
              className={`${styles.planTick} ${styles[`planTick${i + 1}`]}`}
            >
              <Check size={14} strokeWidth={2} aria-hidden="true" />
            </span>
            <span
              className={`${styles.planChip} ${styles[`planChip${i + 1}`]}${
                row.custom ? ` ${styles.planChipCustom}` : ""
              }`}
            >
              {row.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Medium: one decision row cycles Pending → Edited → Approved (labelled). */
function ApprovalsStage() {
  return (
    <div
      className={`${styles.stage} ${styles.stageApprovals}`}
      aria-hidden="true"
    >
      <div className={styles.miniCard}>
        <span className="lp-micro">Approval queue</span>
        <div className={styles.decisionRow}>
          <span className={styles.decisionLabel}>Refund request</span>
          <span className={styles.badgeStack}>
            <span className={`lp-status lp-status--pending ${styles.stPend}`}>
              Pending
            </span>
            <span className={`${styles.editNote} ${styles.stEdit}`}>
              <Pencil size={14} strokeWidth={2} aria-hidden="true" />
              Edited
            </span>
            <span className={`lp-status lp-status--approved ${styles.stDone}`}>
              Approved
            </span>
          </span>
        </div>
        <div className={styles.decisionRow}>
          <span className={styles.decisionLabel}>Reply drafts</span>
          <span className="lp-status lp-status--active">Active</span>
        </div>
      </div>
    </div>
  );
}

/* Medium: file chips slide through a Validate gate, gaining teal ticks,
   into an Active pill. */
const DEPLOY_FILES = ["config.yml", "prompts.md", "flows.json"];

function DeploymentStage() {
  return (
    <div
      className={`${styles.stage} ${styles.stageDeployment}`}
      aria-hidden="true"
    >
      <div className={styles.deployTrack}>
        <span className={styles.gate} />
        <span className={`lp-micro ${styles.gateLabel}`}>Validate</span>
        {DEPLOY_FILES.map((name, i) => (
          <div key={name} className={styles.deployLane}>
            <span
              className={`${styles.fileChip} ${styles[`fileChip${i + 1}`]}`}
            >
              {name}
              <span className={styles.fileTick}>
                <Check size={14} strokeWidth={2} aria-hidden="true" />
              </span>
            </span>
          </div>
        ))}
        <div className={styles.deployFoot}>
          <span className={`lp-status lp-status--active ${styles.activePill}`}>
            Active
          </span>
        </div>
      </div>
    </div>
  );
}

/* Wide: mini workspace strip — calendar dots, a CSS-only 3→2→1 counter
   crossfade (no JS), two activity rows sliding in. */
function DashboardStage() {
  return (
    <div
      className={`${styles.stage} ${styles.stageDashboard}`}
      aria-hidden="true"
    >
      <div className={`${styles.miniCard} ${styles.dashPanel}`}>
        <span className="lp-micro">Schedule</span>
        <div className={styles.calGrid}>
          {Array.from({ length: 21 }, (_, i) => {
            const accent =
              i === 4
                ? styles.calDotBlue
                : i === 10
                  ? styles.calDotTeal
                  : i === 16
                    ? styles.calDotBlue2
                    : "";
            return (
              <span
                key={i}
                className={`${styles.calDot}${accent ? ` ${accent}` : ""}`}
              />
            );
          })}
        </div>
      </div>
      <div className={`${styles.miniCard} ${styles.dashPanel}`}>
        <span className="lp-micro">Approvals waiting</span>
        <span className={styles.numStack}>
          <span className={`${styles.num} ${styles.num3}`}>3</span>
          <span className={`${styles.num} ${styles.num2}`}>2</span>
          <span className={`${styles.num} ${styles.num1}`}>1</span>
        </span>
      </div>
      <div className={`${styles.miniCard} ${styles.dashPanel}`}>
        <span className="lp-micro">Activity</span>
        <div className={styles.actRows}>
          <span className={`${styles.actRow} ${styles.actRow1}`}>
            <span className={styles.actDotBlue} />
            Support agent · reply drafted
          </span>
          <span className={`${styles.actRow} ${styles.actRow2}`}>
            <span className={styles.actDotTeal} />
            Invoice agent · task ready
          </span>
        </div>
      </div>
    </div>
  );
}

/* Compact: one approval chip fans out along three dotted lines (marching
   dots) to WhatsApp / Telegram / Email glyph chips. */
function ChannelsStage() {
  return (
    <div
      className={`${styles.stage} ${styles.stageChannels}`}
      aria-hidden="true"
    >
      <div className={styles.chanLeft}>
        <span className="lp-micro">Approval</span>
        <span className="lp-status lp-status--pending">Pending</span>
      </div>
      <svg
        className={styles.fanSvg}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          className={styles.fanPath}
          d="M 2 50 C 40 50 58 12 96 12"
          pathLength={100}
          vectorEffect="non-scaling-stroke"
        />
        <path
          className={styles.fanPath}
          d="M 2 50 C 40 50 58 50 96 50"
          pathLength={100}
          vectorEffect="non-scaling-stroke"
        />
        <path
          className={styles.fanPath}
          d="M 2 50 C 40 50 58 88 96 88"
          pathLength={100}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className={styles.chanChips}>
        <span className={`${styles.chanChip} ${styles.chanChip1}`}>
          <MessageCircle size={14} strokeWidth={2} aria-hidden="true" />
          WhatsApp
        </span>
        <span className={`${styles.chanChip} ${styles.chanChip2}`}>
          <Send size={14} strokeWidth={2} aria-hidden="true" />
          Telegram
        </span>
        <span className={`${styles.chanChip} ${styles.chanChip3}`}>
          <Mail size={14} strokeWidth={2} aria-hidden="true" />
          Email
        </span>
      </div>
    </div>
  );
}

/* Compact: a circular arrow draws itself around a teal Reviewed tag. */
function ImproveStage() {
  return (
    <div
      className={`${styles.stage} ${styles.stageImprove}`}
      aria-hidden="true"
    >
      <div className={styles.ringWrap}>
        <svg
          className={styles.ringSvg}
          viewBox="0 0 100 100"
          aria-hidden="true"
          focusable="false"
        >
          <path
            className={styles.ringPath}
            d="M 50 16 A 34 34 0 1 1 20.6 33"
            pathLength={1}
          />
          <g transform="translate(20.6 33) rotate(-60)">
            <path
              className={styles.ringArrow}
              d="M 5.5 0 L -3.5 4.5 L -3.5 -4.5 Z"
            />
          </g>
        </svg>
        <span className={`lp-tag lp-tag--teal ${styles.reviewTag}`}>
          <Check size={14} strokeWidth={2} aria-hidden="true" />
          Reviewed
        </span>
      </div>
    </div>
  );
}
