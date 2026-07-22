"use client";
/**
 * FeatureBento — feature bento grid (master brief §7.6).
 * Six capability cards, each topped by an original mock-UI mini-visual with a
 * slow ambient CSS loop and a hover response. Visuals are decorative
 * (aria-hidden); every fact lives in the card text. Static frames read as
 * complete under prefers-reduced-motion (loops resolve to their end state).
 */
import { motion } from "framer-motion";
import { Check, Mail, MessageCircle, Plus, Send } from "lucide-react";
import type { ComponentType } from "react";
import { FEATURES } from "@/lib/landing-content";
import SectionReveal, { LP_EASE } from "./SectionReveal";
import styles from "./FeatureBento.module.css";

type FeatureCardData = (typeof FEATURES.cards)[number];
type FeatureId = FeatureCardData["id"];

const SERIF_PHRASE = "operating system";
const WIDE_CARDS: ReadonlySet<FeatureId> = new Set<FeatureId>([
  "discovery",
  "channels",
]);

/* ── 1. Discovery: Lean Canvas cards flowing into a company report ──────── */

const CANVAS_LABELS = ["Problem", "Customers", "Channels"] as const;

function DiscoveryVisual() {
  return (
    <div className={styles.discoveryScene}>
      <div className={styles.canvasStack}>
        {CANVAS_LABELS.map((label) => (
          <div key={label} className={`${styles.miniCard} ${styles.canvasCard}`}>
            <span className={`lp-micro ${styles.microSm}`}>{label}</span>
            <span className={styles.skelLine} />
          </div>
        ))}
      </div>
      <svg className={styles.discoveryArrow} viewBox="0 0 40 14">
        <line
          x1="1"
          y1="7"
          x2="30"
          y2="7"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeDasharray="3 4"
          strokeLinecap="round"
        />
        <path
          d="M29 2.5 35.5 7 29 11.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className={`${styles.miniCard} ${styles.reportCard}`}>
        <div className={styles.reportHead}>
          <span className={styles.accentDot} />
          <span className={`lp-micro ${styles.microSm}`}>Company report</span>
        </div>
        <div className={styles.reportLines}>
          <span className={styles.skelLine} />
          <span className={styles.skelLine} />
          <span className={styles.skelLine} />
          <span className={styles.skelLine} />
        </div>
        <span className={styles.reportSweep} />
      </div>
    </div>
  );
}

/* ── 2. Planning: agent cards joined by typed workflow lines ────────────── */

function PlanningVisual() {
  return (
    <div className={styles.planScene}>
      <svg
        className={styles.planLines}
        viewBox="0 0 240 150"
        preserveAspectRatio="none"
      >
        <path className={styles.planPath} d="M60,32 C118,22 158,30 198,46" />
        <path className={styles.planPath} d="M196,60 C166,98 122,116 74,121" />
      </svg>
      <span
        className={`lp-micro ${styles.microSm} ${styles.pathLabel} ${styles.labelHandoff}`}
      >
        Handoff
      </span>
      <span
        className={`lp-micro ${styles.microSm} ${styles.pathLabel} ${styles.labelReview}`}
      >
        Review
      </span>
      <div
        className={`${styles.miniCard} ${styles.agentCard} ${styles.agentSupport}`}
      >
        <span className={styles.accentDot} />
        <span className={`lp-micro ${styles.microSm}`}>Support</span>
      </div>
      <div
        className={`${styles.miniCard} ${styles.agentCard} ${styles.agentInvoices}`}
      >
        <span className={styles.accentDot} />
        <span className={`lp-micro ${styles.microSm}`}>Invoices</span>
      </div>
      <div
        className={`${styles.miniCard} ${styles.agentCard} ${styles.agentCustom}`}
      >
        <span className={`lp-micro ${styles.microSm}`}>Wholesale</span>
        <span className={styles.agentTag}>Custom</span>
      </div>
      <div className={styles.ghostCard}>
        <Plus size={11} strokeWidth={2.5} aria-hidden="true" />
        <span className={`lp-micro ${styles.microSm} ${styles.ghostLabel}`}>
          Reports
        </span>
      </div>
    </div>
  );
}

/* ── 3. Approvals: Pending → Approved crossfade on a request card ───────── */

function ApprovalsVisual() {
  return (
    <div className={`${styles.miniCard} ${styles.approvalCard}`}>
      <div className={styles.approvalHead}>
        <span className={`lp-micro ${styles.microSm}`}>Approval</span>
        <span className={styles.badgeStack}>
          <span
            className={`lp-status lp-status--pending ${styles.statusSm} ${styles.badgePending}`}
          >
            Pending
          </span>
          <span
            className={`lp-status lp-status--approved ${styles.statusSm} ${styles.badgeApproved}`}
          >
            Approved
          </span>
        </span>
      </div>
      <p className={styles.approvalTitle}>Publish supplier reorder</p>
      <p className={styles.approvalMeta}>Requested by Inventory agent</p>
      <div className={styles.approvalActions}>
        <span className={`${styles.pill} ${styles.pillApprove}`}>Approve</span>
        <span className={`${styles.pill} ${styles.pillReject}`}>Reject</span>
      </div>
    </div>
  );
}

/* ── 4. Deployment: agent pill stepping Validate → Test → Active ────────── */

const DEPLOY_SLOTS = ["Validate", "Test", "Active"] as const;

function DeploymentVisual() {
  return (
    <div className={styles.deployScene}>
      <div className={styles.deploySlots}>
        {DEPLOY_SLOTS.map((label) => (
          <div
            key={label}
            className={`${styles.deploySlot}${
              label === "Active" ? ` ${styles.deploySlotActive}` : ""
            }`}
          >
            <span className={styles.slotCheck}>
              <Check size={10} strokeWidth={3} aria-hidden="true" />
            </span>
            <span className={`lp-micro ${styles.microSm} ${styles.slotLabel}`}>
              {label}
            </span>
          </div>
        ))}
        <div className={styles.deployPillTrack}>
          <span className={styles.deployPill}>
            <span className={styles.accentDot} />
            Agent
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── 5. Dashboard: mini month calendar beside an approval queue ─────────── */

const CAL_MARKED: ReadonlySet<number> = new Set([3, 10, 17, 24]);
const CAL_EXTRA_DAY = 26;

function DashboardVisual() {
  return (
    <div className={styles.dashScene}>
      <div className={`${styles.miniCard} ${styles.calendar}`}>
        <span className={`lp-micro ${styles.microSm}`}>July</span>
        <div className={styles.calGrid}>
          {Array.from({ length: 35 }, (_, i) => (
            <span
              key={i}
              className={`${styles.calDay}${
                CAL_MARKED.has(i) ? ` ${styles.calDayMarked}` : ""
              }${i === CAL_EXTRA_DAY ? ` ${styles.calDayExtra}` : ""}`}
            />
          ))}
        </div>
      </div>
      <div className={styles.queue}>
        <div className={`${styles.miniCard} ${styles.queueRow}`}>
          <span className={styles.queueLine} />
          <span className={`lp-status lp-status--approved ${styles.statusSm}`}>
            Approved
          </span>
        </div>
        <div
          className={`${styles.miniCard} ${styles.queueRow} ${styles.queueRowPending}`}
        >
          <span className={styles.queueLine} />
          <span className={`lp-status lp-status--pending ${styles.statusSm}`}>
            Pending
          </span>
        </div>
        <div className={`${styles.miniCard} ${styles.queueRow}`}>
          <span className={styles.queueLine} />
          <span className={`lp-status lp-status--changes ${styles.statusSm}`}>
            Changes
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── 6. Channels: chips converging into one approval card ───────────────── */

const CHANNEL_CHIPS = [
  { label: "WhatsApp", Icon: MessageCircle },
  { label: "Telegram", Icon: Send },
  { label: "Email", Icon: Mail },
] as const;

function ChannelsVisual() {
  return (
    <div className={styles.channelsScene}>
      <div className={styles.channelChips}>
        {CHANNEL_CHIPS.map(({ label, Icon }) => (
          <span key={label} className={`lp-chip ${styles.chipSm}`}>
            <Icon
              size={14}
              strokeWidth={2}
              aria-hidden="true"
              className={styles.chipIcon}
            />
            {label}
          </span>
        ))}
      </div>
      <div className={styles.channelMid}>
        <svg className={styles.channelLines} viewBox="0 0 96 140">
          <path className={styles.channelPath} d="M2,25 C46,25 60,66 94,68" />
          <path className={styles.channelPath} d="M2,70 C40,70 60,70 94,70" />
          <path className={styles.channelPath} d="M2,115 C46,115 60,74 94,72" />
        </svg>
        <span className={`${styles.travelDot} ${styles.travelDot1}`} />
        <span className={`${styles.travelDot} ${styles.travelDot2}`} />
        <span className={`${styles.travelDot} ${styles.travelDot3}`} />
      </div>
      <div className={`${styles.miniCard} ${styles.channelCard}`}>
        <div className={styles.channelCardHead}>
          <span className={`lp-micro ${styles.microSm}`}>Approval request</span>
          <span className={`lp-status lp-status--pending ${styles.statusSm}`}>
            Pending
          </span>
        </div>
        <span className={styles.skelLine} />
        <span className={`${styles.skelLine} ${styles.skelLineShort}`} />
      </div>
    </div>
  );
}

/* ── Card shell ─────────────────────────────────────────────────────────── */

const CARD_VISUALS: Record<FeatureId, ComponentType> = {
  discovery: DiscoveryVisual,
  planning: PlanningVisual,
  approvals: ApprovalsVisual,
  deployment: DeploymentVisual,
  dashboard: DashboardVisual,
  channels: ChannelsVisual,
};

function BentoCard({
  card,
  index,
}: {
  card: FeatureCardData;
  index: number;
}) {
  const Visual = CARD_VISUALS[card.id];
  const cellClass = WIDE_CARDS.has(card.id)
    ? `${styles.cell} ${styles.cellWide}`
    : styles.cell;

  return (
    <motion.div
      className={cellClass}
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -80px 0px" }}
      transition={{ duration: 0.6, delay: index * 0.06, ease: LP_EASE }}
    >
      <article className={`lp-card ${styles.card}`}>
        <div className={`lp-stage-grid ${styles.stage}`} aria-hidden="true">
          <Visual />
        </div>
        <div className={styles.body}>
          <h3 className={`lp-h3 ${styles.title}`}>{card.title}</h3>
          <p className={styles.copy}>{card.body}</p>
        </div>
      </article>
    </motion.div>
  );
}

function BentoHeading() {
  const heading: string = FEATURES.heading;
  const idx = heading.indexOf(SERIF_PHRASE);
  if (idx === -1) {
    return <h2 className="lp-h2">{heading}</h2>;
  }
  return (
    <h2 className="lp-h2">
      {heading.slice(0, idx)}
      <span className="lp-serif">{SERIF_PHRASE}</span>
      {heading.slice(idx + SERIF_PHRASE.length)}
    </h2>
  );
}

/* ── Section ────────────────────────────────────────────────────────────── */

export default function FeatureBento() {
  return (
    <section id="features" className="lp-section">
      <div className="lp-container">
        <SectionReveal className="lp-section-head">
          <span className="lp-eyebrow">Platform</span>
          <BentoHeading />
          <p className="lp-lead">Six capabilities, one connected workspace.</p>
        </SectionReveal>
        <div className={styles.grid}>
          {FEATURES.cards.map((card, index) => (
            <BentoCard key={card.id} card={card} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
