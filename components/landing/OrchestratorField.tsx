"use client";
/**
 * OrchestratorField — the signature layered agentic-system artwork
 * (redesign brief §6.2/§6.3). Mounted inside HeroSection's field layer.
 *
 * Composition (1280×440 design canvas — a WIDE BAND under the centred hero
 * text; editorial artwork, not a diagram): the Orchestrator is a dominant
 * ink-navy card at the horizontal centre; seven FIELD_NODES fan LEFT and
 * RIGHT of it at staggered heights across three depth tiers (A foreground,
 * B mid, C background — smaller, 0.85 opacity). The outermost C nodes sit
 * partially past the band edges: their cards carry an edge fade-mask so a
 * cropped card dissolves gracefully instead of truncating its label
 * mid-word. The stage height is a vh clamp (≈46–54vh) decoupled from its
 * width, so the SVG uses preserveAspectRatio="none" + non-scaling strokes —
 * %-positioned cards and user-unit paths stretch identically and stay
 * aligned at every band aspect. The Human Approval node is categorically
 * different: neutral surface, stronger neutral border, person glyph,
 * "Owner review" annotation (a person, not an agent), and it sits DIRECTLY
 * ABOVE the central Orchestrator card so escalation reads upward (§3.2).
 *
 * Primary motion concept — layered build + parallax depth:
 *  1) Build-in (whileInView once, orchestrating variants container):
 *     orchestrator scales 0.9→1, tiers pop staggered (B → A → C), then
 *     connector paths draw progressively (normalised dash, DUR.mask,
 *     staggered via the module's `.began` class — base frame is FULLY
 *     drawn, the draw is an enhancement), then packets loop along the
 *     same curves (CSS offset-path, delays start only after the last
 *     path finishes drawing).
 *  2) Depth: useScroll over the stage maps per-tier translateY
 *     (A ±26 / orchestrator ±8 / B ±16 / C ±38 — background moves most
 *     against scroll; halved on tablet). Desktop-only pointer drift
 *     shifts tiers by up to 6/3/2px through springs — the listener is
 *     effect-gated away under 1024px and under reduced motion.
 *  3) Idle: cards drift ≤4px on phase-staggered local keyframes; loops
 *     pause offscreen (useInView, no `once`) and on document.hidden via
 *     the `.running` class.
 *
 * Reduced motion: complete static scene — paths park fully drawn (module
 * @media rule + drawn base frame), packets are hidden, parallax ranges
 * collapse to [0,0] (style-only, hydration-safe), pointer/idle effects
 * never attach. All SVG and both compositions are aria-hidden; meaning
 * is carried by a visually-hidden paragraph naming every node.
 *
 * Mobile (<768): recomposed compact cluster — orchestrator card on top,
 * seven nodes in a 2-col mini-grid with straight faint connectors from a
 * central spine; no cropping, no parallax, zero overflow at 390px.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
  type Variants,
} from "framer-motion";
import {
  LayoutDashboard,
  Mic,
  PackageCheck,
  Play,
  Search,
  User,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  FIELD_NODES,
  ORCHESTRATOR,
  type FieldNodeId,
} from "@/lib/landing-content";
import { DUR, EASE } from "./motion";
import styles from "./OrchestratorField.module.css";

/* ── Design canvas (positions in these units scale with the stage) ──────── */
const W = 1280;
const H = 440;
const ORCH = { x: 640, y: 220 } as const; // horizontal centre of the band

const pct = (v: number, total: number) => `${((v / total) * 100).toFixed(3)}%`;

type Tier = "a" | "b" | "c";

/** Per-node placement, depth tier, build delay, idle-drift phase offset.
    `edge` marks the outermost band nodes: their cards fade toward that
    edge via a mask (graceful crop — never a mid-word label truncation). */
const NODE_LAYOUT: Record<
  FieldNodeId,
  {
    tier: Tier;
    x: number;
    y: number;
    delay: number;
    drift: number;
    edge?: "left" | "right";
  }
> = {
  discovery: { tier: "b", x: 248, y: 92, delay: 0.26, drift: 0 },
  executor: { tier: "b", x: 300, y: 368, delay: 0.34, drift: -2.9 },
  /* dashboard grounds the composition directly beneath the orchestrator —
     also the only bottom-row slot that stays collision-free at 768px */
  dashboard: { tier: "b", x: 640, y: 375, delay: 0.42, drift: -5.6 },
  planner: { tier: "a", x: 1008, y: 88, delay: 0.5, drift: -1.7 },
  /* approval sits DIRECTLY ABOVE the orchestrator: escalation goes upward
     to a person (§3.2), mirroring the dashboard slot below */
  approval: { tier: "a", x: 640, y: 66, delay: 0.58, drift: -4.3 },
  interview: { tier: "c", x: 52, y: 235, delay: 0.66, drift: -3.5, edge: "left" },
  deployment: { tier: "c", x: 1228, y: 205, delay: 0.74, drift: -7.1, edge: "right" },
};

const GLYPHS: Record<FieldNodeId, LucideIcon> = {
  discovery: Search,
  interview: Mic,
  planner: Workflow,
  approval: User,
  executor: Play,
  deployment: PackageCheck,
  dashboard: LayoutDashboard,
};

/* Curved connectors fanning OUTWARD from the central orchestrator to each
   node centre (endpoints hide under the cards; curves are routed clear of
   every label box). The discovery / planner / approval strings are
   duplicated EXACTLY as the packet offset-paths in the module CSS — keep
   them in sync. */
const PATHS: Record<FieldNodeId, string> = {
  discovery: "M640 220 C530 175 380 125 248 92",
  planner: "M640 220 C765 175 895 125 1008 88",
  /* upward escalation curve — mirrors the dashboard curve below */
  approval: "M640 220 C660 170 655 115 640 66",
  interview: "M640 220 C455 235 250 232 52 235",
  executor: "M640 220 C525 275 405 330 300 368",
  deployment: "M640 220 C835 213 1040 208 1228 205",
  dashboard: "M640 220 C660 270 655 325 640 375",
};

const PATH_CLASS: Record<FieldNodeId, string> = {
  discovery: styles.cDiscovery,
  interview: styles.cInterview,
  planner: styles.cPlanner,
  approval: styles.cApproval,
  executor: styles.cExecutor,
  deployment: styles.cDeployment,
  dashboard: styles.cDashboard,
};

/* Floating micro annotations, positioned clear of every path and card. */
const FLOAT_LABELS: {
  text: string;
  x: number;
  y: number;
  delay: number;
  teal?: boolean;
}[] = [
  { text: "context in", x: 462, y: 190, delay: 2.4 },
  { text: "plan out", x: 838, y: 184, delay: 2.05 },
  { text: "your decision", x: 724, y: 136, delay: 2.55, teal: true },
];

/* ── Variants (orchestrated by the scene container's whileInView) ───────── */
const orchV: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { duration: DUR.card, ease: EASE },
  },
};

const nodeV: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.94 },
  show: (delay: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.55, ease: EASE, delay },
  }),
};

const labelV: Variants = {
  hidden: { opacity: 0 },
  show: (delay: number) => ({
    opacity: 1,
    transition: { duration: 0.5, ease: EASE, delay },
  }),
};

type FieldNode = (typeof FIELD_NODES)[number];

/* ── Node card (idle drift lives here — never on a framer wrapper) ──────── */
function NodeCard({ node, tier }: { node: FieldNode; tier: Tier }) {
  const layout = NODE_LAYOUT[node.id];
  const Glyph = GLYPHS[node.id];
  const tierClass =
    tier === "a" ? styles.cardA : tier === "b" ? styles.cardB : styles.cardC;
  /* Outermost band nodes dissolve toward the crop edge instead of
     hard-truncating their labels (owner feedback: no clipped words). */
  const edgeClass =
    layout.edge === "left"
      ? ` ${styles.fadeLeft}`
      : layout.edge === "right"
        ? ` ${styles.fadeRight}`
        : "";
  return (
    <div
      className={`${styles.card} ${tierClass}${node.human ? ` ${styles.cardHuman}` : ""}${edgeClass}`}
      style={{ "--drift-d": `${layout.drift}s` } as CSSProperties}
    >
      <span className={`${styles.glyph}${node.human ? ` ${styles.glyphHuman}` : ""}`}>
        <Glyph size={17} strokeWidth={2} aria-hidden="true" />
      </span>
      <span className={styles.cardText}>
        <span className={styles.cardLabel}>{node.label}</span>
        <span className={`lp-micro ${styles.cardNote}`}>{node.annotation}</span>
      </span>
    </div>
  );
}

/* ── One depth tier: scroll parallax (outer) + pointer drift (inner) ────── */
function TierLayer({
  tier,
  layerClass,
  y,
  dx,
  dy,
}: {
  tier: Tier;
  layerClass: string;
  y: MotionValue<number>;
  dx: MotionValue<number>;
  dy: MotionValue<number>;
}) {
  return (
    <motion.div className={`${styles.layer} ${layerClass}`} style={{ y }}>
      <motion.div className={styles.drifter} style={{ x: dx, y: dy }}>
        {FIELD_NODES.filter((n) => NODE_LAYOUT[n.id].tier === tier).map((n) => {
          const l = NODE_LAYOUT[n.id];
          return (
            <div
              key={n.id}
              className={styles.pos}
              style={{ left: pct(l.x, W), top: pct(l.y, H) }}
            >
              <motion.div variants={nodeV} custom={l.delay}>
                <NodeCard node={n} tier={tier} />
              </motion.div>
            </div>
          );
        })}
      </motion.div>
    </motion.div>
  );
}

export default function OrchestratorField() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const figRef = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const still = Boolean(reduced);

  /* Build-in trigger for the CSS path-draw + packet clock (same viewport
     threshold as the scene container's whileInView, so both stay in step). */
  const seen = useInView(figRef, { once: true, amount: 0.25 });

  /* Loop gate: near-view (no `once`) AND tab visible → `.running`. */
  const nearView = useInView(rootRef, { margin: "200px" });
  const [docVisible, setDocVisible] = useState(true);
  useEffect(() => {
    const onVis = () => setDocVisible(!document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  const running = nearView && docVisible;

  /* Desktop flag — tablet halves parallax travel; initial `false` matches
     the server render and only ever changes inline style bindings. */
  const [desk, setDesk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesk(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  /* Scroll parallax — per-tier ranges, collapsed to static under reduced
     motion (conditional-ranges pattern: style-only, hydration-safe). */
  const { scrollYProgress } = useScroll({
    target: rootRef,
    offset: ["start end", "end start"],
  });
  const range = (v: number): [number, number] => {
    if (still) return [0, 0];
    const t = desk ? v : v * 0.5;
    return [t, -t];
  };
  const yA = useTransform(scrollYProgress, [0, 1], range(26));
  const yO = useTransform(scrollYProgress, [0, 1], range(8));
  const yB = useTransform(scrollYProgress, [0, 1], range(16));
  const yC = useTransform(scrollYProgress, [0, 1], range(38));

  /* Pointer drift — desktop only, spring-smoothed, ≤6px. The listeners are
     attached/removed entirely inside this effect (≥1024px, motion allowed). */
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 110, damping: 22, mass: 0.4 });
  const sy = useSpring(py, { stiffness: 110, damping: 22, mass: 0.4 });
  const dxA = useTransform(sx, (v) => v * 6);
  const dyA = useTransform(sy, (v) => v * 6);
  const dxB = useTransform(sx, (v) => v * 3);
  const dyB = useTransform(sy, (v) => v * 3);
  const dxC = useTransform(sx, (v) => v * 2);
  const dyC = useTransform(sy, (v) => v * 2);
  useEffect(() => {
    if (reduced) return;
    const el = figRef.current;
    if (!el) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      px.set(((e.clientX - r.left) / r.width - 0.5) * 2);
      py.set(((e.clientY - r.top) / r.height - 0.5) * 2);
    };
    const reset = () => {
      px.set(0);
      py.set(0);
    };
    const attach = () => {
      el.addEventListener("mousemove", onMove);
      el.addEventListener("mouseleave", reset);
    };
    const detach = () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", reset);
      reset();
    };
    const sync = () => (mq.matches ? attach() : detach());
    sync();
    mq.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
      detach();
    };
  }, [reduced, px, py]);

  return (
    <div
      ref={rootRef}
      className={`${styles.root}${running ? ` ${styles.running}` : ""}`}
    >
      {/* Meaning of the aria-hidden artwork, for assistive technology */}
      <p className={styles.srOnly}>
        {ORCHESTRATOR.label} ({ORCHESTRATOR.caption.toLowerCase()}) sits at
        the centre of seven connected roles. Escalation flows upward: Human
        Approval, the owner review step, sits directly above the
        Orchestrator. The roles are{" "}
        {FIELD_NODES.map((n) => `${n.label} (${n.annotation.toLowerCase()})`).join(
          "; ",
        )}
        .
      </p>

      {/* ── Desktop / tablet stage (≥768) ── */}
      <div
        ref={figRef}
        className={`${styles.fig}${seen ? ` ${styles.began}` : ""}`}
        aria-hidden="true"
      >
        <div className={`lp-glow-blue ${styles.glow} ${styles.glowBlue}`} />
        <div className={`lp-glow-teal ${styles.glow} ${styles.glowTeal}`} />

        <motion.div
          className={styles.scene}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.25 }}
        >
          {/* preserveAspectRatio="none": the stage height is a vh clamp
              decoupled from its width, so the SVG stretches WITH the stage —
              user-unit paths and %-positioned cards scale identically and
              never drift apart (strokes stay crisp via non-scaling-stroke). */}
          <svg
            className={styles.svg}
            viewBox={`0 0 ${W} ${H}`}
            fill="none"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            {FIELD_NODES.map((n) => (
              <path
                key={n.id}
                className={`${styles.connector} ${PATH_CLASS[n.id]}`}
                d={PATHS[n.id]}
                pathLength={1}
              />
            ))}
            {/* Accent packets — travel the discovery / planner / approval
                curves via CSS offset-path; hidden until paths finish */}
            <circle className={`${styles.packet} ${styles.packetContext}`} r={4} />
            <circle className={`${styles.packet} ${styles.packetPlan}`} r={4} />
            <circle className={`${styles.packet} ${styles.packetDecide}`} r={4.5} />
          </svg>

          {/* Background tier (edge-cropped, recessed) */}
          <TierLayer tier="c" layerClass={styles.layerC} y={yC} dx={dxC} dy={dyC} />

          {/* Mid tier */}
          <TierLayer tier="b" layerClass={styles.layerB} y={yB} dx={dxB} dy={dyB} />

          {/* Orchestrator + floating annotations (steadiest layer) */}
          <motion.div className={`${styles.layer} ${styles.layerO}`} style={{ y: yO }}>
            <div
              className={styles.pos}
              style={{ left: pct(ORCH.x, W), top: pct(ORCH.y, H) }}
            >
              <motion.div variants={orchV}>
                <div className={styles.orchCard}>
                  <span className={styles.orchTop}>
                    <span className={styles.pulseDot} />
                    <span className={styles.orchMicro}>Active</span>
                  </span>
                  <span className={styles.orchLabel}>{ORCHESTRATOR.label}</span>
                  <span className={styles.orchCaption}>
                    {ORCHESTRATOR.caption}
                  </span>
                </div>
              </motion.div>
            </div>
            {FLOAT_LABELS.map((f) => (
              <div
                key={f.text}
                className={styles.pos}
                style={{ left: pct(f.x, W), top: pct(f.y, H) }}
              >
                <motion.span
                  className={`lp-micro ${styles.floatLabel}${f.teal ? ` ${styles.floatLabelTeal}` : ""}`}
                  variants={labelV}
                  custom={f.delay}
                >
                  {f.text}
                </motion.span>
              </div>
            ))}
          </motion.div>

          {/* Foreground tier (largest, sharpest) */}
          <TierLayer tier="a" layerClass={styles.layerA} y={yA} dx={dxA} dy={dyA} />
        </motion.div>
      </div>

      {/* ── Mobile recomposition (<768): compact cluster. Human Approval
            sits ABOVE the orchestrator (escalation reads upward, §3.2);
            the remaining six roles form the 2-col grid below. ── */}
      <div className={styles.cluster} aria-hidden="true">
        <div className={styles.clusterInner}>
          {FIELD_NODES.filter((n) => n.human).map((n) => {
            const Glyph = GLYPHS[n.id];
            return (
              <div key={n.id} className={styles.mEsc}>
                <div className={`${styles.mNode} ${styles.mHuman} ${styles.mEscCard}`}>
                  <span className={`${styles.glyph} ${styles.glyphHuman}`}>
                    <Glyph size={15} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span className={styles.cardText}>
                    <span className={styles.cardLabel}>{n.label}</span>
                    <span className={`lp-micro ${styles.cardNote}`}>
                      {n.annotation}
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
          <div className={styles.mOrch}>
            <span className={styles.orchTop}>
              <span className={styles.pulseDot} />
              <span className={styles.orchMicro}>Active</span>
            </span>
            <span className={styles.orchLabel}>{ORCHESTRATOR.label}</span>
            <span className={styles.orchCaption}>{ORCHESTRATOR.caption}</span>
          </div>
          <ul className={styles.mGrid}>
            {FIELD_NODES.filter((n) => !n.human).map((n) => {
              const Glyph = GLYPHS[n.id];
              return (
                <li key={n.id} className={styles.mNode}>
                  <span className={styles.glyph}>
                    <Glyph size={15} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span className={styles.cardText}>
                    <span className={styles.cardLabel}>{n.label}</span>
                    <span className={`lp-micro ${styles.cardNote}`}>
                      {n.annotation}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
