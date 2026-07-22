"use client";
/**
 * TechStack — technology & execution credibility (brief §16).
 *
 * The OPERATING STACK: five horizontal layer bars (TECHNOLOGY.layers, top to
 * bottom) with sponsor partners shown as role tags — sponsors with roles, not
 * decorative logos — joined by small centred connector arrows that read as
 * flow (Business context → AI planning → Agent build → Safe validation →
 * Deployment & operations). The "Safe validation" layer carries a teal left
 * edge + ShieldCheck — safety emphasised.
 *
 * PRIMARY MOTION CONCEPT — stack assembly, then a live downward flow:
 * layers reveal top-to-bottom (whileInView once, y+24/opacity, 0.12s
 * stagger); each connector arrow fades in only after both of its
 * neighbouring layers have settled; the teal "Safe validation" edge draws
 * in (scaleY 0 → 1) once its layer lands. After assembly, while the stack
 * is near view AND the tab is visible (`.running` — FinalCTA's pattern:
 * useInView no-once + document.hidden), an accent packet drips down the
 * invisible centre path every 5s (repeating transform/opacity CSS
 * animation, paused otherwise) and the connector circles pulse a ::after
 * glow in downward sequence on the same 5s period (staggered by --ad).
 * Hover (desktop): each bar lifts 2px, its border darkens, and its partner
 * tag slides 4px — on the STATIC inner element, never the motion wrapper.
 *
 * Reduced motion: the packet and glows sit at hidden base frames, the
 * module hides/strips them explicitly, and framer collapses the reveals to
 * opacity via MotionConfig. The render tree never branches on
 * useReducedMotion (hydration rule) — gating is CSS-only.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion, useInView } from "framer-motion";
import { ArrowDown, ShieldCheck } from "lucide-react";
import { TECHNOLOGY } from "@/lib/landing-content";
import { DUR, EASE, STAGGER } from "./motion";
import styles from "./TechStack.module.css";

/** Assembly rhythm from the section brief: 0.12s between layers. */
const LAYER_STAGGER = STAGGER * 1.5;

/** Packet period — duplicated as the 5s animations in TechStack.module.css. */
const PACKET_PERIOD_S = 5;

const layerVariants = (i: number) => ({
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DUR.card, delay: i * LAYER_STAGGER, ease: EASE },
  },
});

/**
 * Connector i sits between layer i-1 and layer i. Layer i starts at
 * i × stagger and eases over DUR.card; by 85% of that duration the ease
 * [0.22, 1, 0.36, 1] has visually settled (>99%), so delaying the connector
 * to that point means every arrow appears after both bars it connects.
 */
const connectorVariants = (i: number) => ({
  hidden: { opacity: 0, scale: 0.7 },
  show: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: DUR.card * 0.6,
      delay: i * LAYER_STAGGER + DUR.card * 0.85,
      ease: EASE,
    },
  },
});

/** Teal safety edge draws in (scaleY 0 → 1) just after its layer settles. */
const edgeVariants = (i: number) => ({
  hidden: { scaleY: 0 },
  show: {
    scaleY: 1,
    transition: {
      duration: 0.6,
      delay: i * LAYER_STAGGER + DUR.card * 0.7,
      ease: EASE,
    },
  },
});

/**
 * The connector glow (::after in the module) pulses as the packet passes its
 * gap. The packet travels the full path over the first half of each 5s
 * period, so gap i (of 5 layers) is reached ≈ (i / 5) × 2.5s in; the pulse
 * keyframe peaks 0.4s after its delayed start.
 */
const arrowDelay = (i: number) =>
  `${(((i / TECHNOLOGY.layers.length) * PACKET_PERIOD_S) / 2 - 0.4).toFixed(2)}s`;

export default function TechStack() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pathRef = useRef<HTMLDivElement | null>(null);
  const [assembled, setAssembled] = useState(false);

  /* `.running` gate — near view (no `once`) AND document visible, same
     pattern as FinalCTA. False on the server and the first client render. */
  const nearView = useInView(wrapRef, { margin: "200px" });
  const [docVisible, setDocVisible] = useState(true);
  useEffect(() => {
    const onVis = () => setDocVisible(!document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  const running = assembled && nearView && docVisible;

  /* Measure the packet's travel distance once assembled (and keep it fresh
     across resizes) — the repeating CSS animation reads --packet-travel. */
  useEffect(() => {
    if (!assembled) return;
    const measure = () => {
      const path = pathRef.current;
      if (path) {
        path.style.setProperty(
          "--packet-travel",
          `${Math.max(path.offsetHeight - 12, 0)}px`,
        );
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [assembled]);

  return (
    <section
      id="technology"
      className="lp-section lp-section--alt"
      aria-labelledby="technology-heading"
    >
      <div className="lp-container">
        <div className="lp-section-head">
          <span className="lp-eyebrow">{TECHNOLOGY.eyebrow}</span>
          <h2 id="technology-heading" className="lp-h2-sm">
            {TECHNOLOGY.heading}
          </h2>
          <p className="lp-lead">{TECHNOLOGY.body}</p>
        </div>

        <div
          ref={wrapRef}
          className={
            running ? `${styles.stackWrap} ${styles.running}` : styles.stackWrap
          }
        >
          {/* Invisible vertical path the accent packet drips down every 5s;
              it runs beneath the bars and surfaces only in the connector
              gaps. The animation exists only once assembled, and only
              advances while `.running`. */}
          <div className={styles.packetPath} ref={pathRef} aria-hidden="true">
            <span
              className={
                assembled
                  ? `${styles.packet} ${styles.packetRun}`
                  : styles.packet
              }
            />
          </div>

          <motion.ol
            className={styles.stack}
            role="list"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "0px 0px -80px 0px" }}
          >
            {TECHNOLOGY.layers.map((layer, i) => {
              const isSafety = layer.name === "Safe validation";
              const isLast = i === TECHNOLOGY.layers.length - 1;
              return (
                <li key={layer.name} className={styles.layerItem}>
                  {i > 0 && (
                    <motion.div
                      className={styles.connector}
                      variants={connectorVariants(i)}
                      aria-hidden="true"
                      style={{ "--ad": arrowDelay(i) } as CSSProperties}
                      onAnimationComplete={
                        isLast
                          ? (definition) => {
                              /* The final connector finishes last in the
                                 assembly choreography — it hands over to the
                                 repeating packet drip. */
                              if (definition === "show") setAssembled(true);
                            }
                          : undefined
                      }
                    >
                      <span className={styles.connectorCircle}>
                        <ArrowDown
                          size={14}
                          strokeWidth={2}
                          aria-hidden="true"
                        />
                      </span>
                    </motion.div>
                  )}
                  {/* Motion wrapper and hover surface are SEPARATE elements:
                      framer leaves inline transforms on the wrapper, so the
                      CSS hover lift lives on the static inner .layer. */}
                  <motion.div
                    className={styles.layerMotion}
                    variants={layerVariants(i)}
                  >
                    <div className={styles.layer}>
                      {isSafety && (
                        <motion.span
                          className={styles.safeEdge}
                          variants={edgeVariants(i)}
                          aria-hidden="true"
                        />
                      )}
                      <div className={styles.layerName}>
                        {isSafety && (
                          <ShieldCheck
                            size={16}
                            strokeWidth={2}
                            className={styles.shield}
                            aria-hidden="true"
                          />
                        )}
                        <span>{layer.name}</span>
                      </div>
                      {layer.partner !== null && (
                        <span className={`lp-tag ${styles.layerTag}`}>
                          {layer.partner}
                        </span>
                      )}
                      <p className={styles.layerRole}>{layer.role}</p>
                    </div>
                  </motion.div>
                </li>
              );
            })}
          </motion.ol>
        </div>
      </div>
    </section>
  );
}
