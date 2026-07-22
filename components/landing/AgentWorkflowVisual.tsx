"use client";

/**
 * AgentWorkflowVisual — the hero's signature agentic-operations diagram.
 *
 * An "Orchestrator" pill sits top-centre, connected by a faint dashed line to
 * five workflow nodes arranged in a vertical zig-zag and joined in sequence by
 * curved SVG paths. Small accent packets travel the full chain on a seamless
 * 5s SMIL loop while the active node steps through the stages on the same
 * rhythm. Hovering or focusing a node reveals its description tooltip
 * (wired via aria-describedby).
 *
 * Reduced motion: the same tree renders (packets are hidden via the module's
 * prefers-reduced-motion rule, MotionConfig handles motion props) with no
 * cycling and no float, plus a visually-hidden summary for screen readers.
 * Below 768px the zig-zag becomes a single-column stack with short straight
 * connectors (cycling kept).
 */

import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import {
  LayoutDashboard,
  Rocket,
  Search,
  ShieldCheck,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  ORCHESTRATOR_LABEL,
  WORKFLOW_NODES,
  type WorkflowNodeId,
} from "@/lib/landing-content";
import { LP_EASE } from "./SectionReveal";
import styles from "./AgentWorkflowVisual.module.css";

const NODE_ICONS: Record<WorkflowNodeId, LucideIcon> = {
  discovery: Search,
  planner: Workflow,
  approval: ShieldCheck,
  deployment: Rocket,
  dashboard: LayoutDashboard,
};

/* ── Stage geometry (viewBox units; the stage keeps a 520 × 560 ratio) ──── */

const STAGE_W = 520;
const STAGE_H = 560;
const CURVE = 62; // vertical bezier-handle length for each hop

type Point = { x: number; y: number };

const ORCH_POS: Point = { x: 260, y: 34 };

const NODE_POS: Record<WorkflowNodeId, Point & { side: "left" | "right" }> = {
  discovery: { x: 150, y: 132, side: "left" },
  planner: { x: 370, y: 226, side: "right" },
  approval: { x: 150, y: 320, side: "left" },
  deployment: { x: 370, y: 414, side: "right" },
  dashboard: { x: 150, y: 508, side: "left" },
};

/* Orchestrator → node 1 → … → node 5. Path endpoints sit at card centres and
   hide underneath the opaque cards, so curves stay attached at every scale. */
const CHAIN: Point[] = [ORCH_POS, ...WORKFLOW_NODES.map((n) => NODE_POS[n.id])];

const hopPath = (a: Point, b: Point) =>
  `M ${a.x} ${a.y} C ${a.x} ${a.y + CURVE}, ${b.x} ${b.y - CURVE}, ${b.x} ${b.y}`;

/* HOPS[i] is the curve arriving at WORKFLOW_NODES[i] */
const HOPS = CHAIN.slice(1).map((point, i) => hopPath(CHAIN[i], point));

/* One continuous path the travelling packets follow end-to-end */
const PACKET_PATH = CHAIN.slice(1).reduce(
  (d, point, i) =>
    `${d} C ${CHAIN[i].x} ${CHAIN[i].y + CURVE}, ${point.x} ${
      point.y - CURVE
    }, ${point.x} ${point.y}`,
  `M ${CHAIN[0].x} ${CHAIN[0].y}`,
);

const STEP_MS = 1000; // active-node cadence: one stage per second
const LOOP_S = (STEP_MS * WORKFLOW_NODES.length) / 1000; // 5s packet loop
const PACKET_BEGINS = [
  "0s",
  `-${(LOOP_S / 3).toFixed(2)}s`,
  `-${((LOOP_S * 2) / 3).toFixed(2)}s`,
];

/* Anchor positions land in CSS custom props so they only apply on desktop,
   where the media query reads them (mobile flow layout ignores them). */
const pos = (p: Point): CSSProperties =>
  ({
    "--wf-x": `${((p.x / STAGE_W) * 100).toFixed(3)}%`,
    "--wf-y": `${((p.y / STAGE_H) * 100).toFixed(3)}%`,
  }) as CSSProperties;

export default function AgentWorkflowVisual({
  className,
}: {
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const [tipsDismissed, setTipsDismissed] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(stageRef, { margin: "200px" });

  useEffect(() => {
    if (reduced || !inView) return;
    let interval: number | null = null;
    const start = () => {
      if (interval === null) {
        interval = window.setInterval(
          () => setActive((i) => (i + 1) % WORKFLOW_NODES.length),
          STEP_MS,
        );
      }
    };
    const stop = () => {
      if (interval !== null) {
        window.clearInterval(interval);
        interval = null;
      }
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) start();
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced, inView]);

  return (
    <div
      ref={stageRef}
      className={className ? `${styles.stage} ${className}` : styles.stage}
      onKeyDown={(event) => {
        if (event.key === "Escape") setTipsDismissed(true);
      }}
    >
      <p className={styles.srOnly}>
        An orchestrator coordinates five stages: Discovery, Planner, Approval,
        Deployment, Dashboard.
      </p>

      <svg
        className={styles.paths}
        viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        {HOPS.map((d, i) => (
          <path
            key={WORKFLOW_NODES[i].id}
            d={d}
            className={[
              styles.hop,
              i === 0 ? styles.hopDashed : "",
              i === active ? styles.hopActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
          />
        ))}
        {/* Always rendered so server and client trees match; the module's
            prefers-reduced-motion rule hides them for reduced users. */}
        {PACKET_BEGINS.map((begin) => (
          <circle key={begin} className={styles.packet} r={3.5}>
            <animateMotion
              dur={`${LOOP_S}s`}
              begin={begin}
              repeatCount="indefinite"
              path={PACKET_PATH}
            />
            <animate
              attributeName="opacity"
              values="0;1;1;0"
              keyTimes="0;0.05;0.95;1"
              dur={`${LOOP_S}s`}
              begin={begin}
              repeatCount="indefinite"
            />
          </circle>
        ))}
      </svg>

      <div className={styles.pill} style={pos(ORCH_POS)}>
        <span className={styles.pillDot} aria-hidden="true" />
        {ORCHESTRATOR_LABEL}
      </div>

      {WORKFLOW_NODES.map((node, i) => {
        const Icon = NODE_ICONS[node.id];
        const { side, ...point } = NODE_POS[node.id];
        const isActive = active === i;
        const tipId = `lp-wf-tip-${node.id}`;
        return (
          <Fragment key={node.id}>
            <span
              aria-hidden="true"
              className={
                i === 0
                  ? `${styles.connector} ${styles.connectorDashed}`
                  : styles.connector
              }
            />
            <div className={styles.node} style={pos(point)}>
              <div
                className={styles.floater}
                style={{ animationDelay: `${-i * 1.15}s` }}
              >
                <span
                  aria-hidden="true"
                  className={`lp-rose-glow ${styles.halo} ${
                    isActive ? styles.haloOn : ""
                  }`}
                />
                <button
                  type="button"
                  className={
                    isActive ? `${styles.card} ${styles.cardActive}` : styles.card
                  }
                  aria-describedby={tipId}
                  onClick={() => setActive(i)}
                  onFocus={() => setTipsDismissed(false)}
                  onMouseEnter={() => setTipsDismissed(false)}
                >
                  <span className={styles.iconBox} aria-hidden="true">
                    <Icon size={17} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span className={styles.meta}>
                    <span className={styles.label}>{node.label}</span>
                    <span className={styles.statusRow}>
                      <motion.span
                        className={`lp-status lp-status--active ${styles.statusChip}`}
                        initial={false}
                        animate={{
                          opacity: isActive ? 1 : 0,
                          y: isActive ? 0 : 4,
                        }}
                        transition={{ duration: 0.35, ease: LP_EASE }}
                      >
                        {node.status}
                      </motion.span>
                    </span>
                  </span>
                </button>
                <span
                  role="tooltip"
                  id={tipId}
                  className={[
                    styles.tooltip,
                    side === "left" ? styles.tipRight : styles.tipLeft,
                    tipsDismissed ? styles.tooltipDismissed : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {node.description}
                </span>
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
