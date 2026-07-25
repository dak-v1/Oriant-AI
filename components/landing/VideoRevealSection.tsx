"use client";
/**
 * VideoRevealSection — product-video scroll reveal (redesign brief §7).
 * `<section id="product">`.
 *
 * Primary motion concept: scroll-driven rise + settle, never frozen. A
 * ~140vh outer section holds a 100vh sticky panel (a brief pin — ~0.4
 * viewport of scroll); scroll progress (start end → end end) drives the
 * browser frame from scale 0.85 / y 90px / opacity 0.6 / radius 32px to
 * its settled state by 55% progress, then from [0.55, 1] the frame keeps
 * a continuous gentle drift (y 0 → −8px toward release) while a wide
 * ambient .lp-glow-blue sweeps translateX −12% → 12% across the WHOLE
 * sequence — so motion never fully stops while pinned, and there is no
 * dead hold. Release is smooth: progress clamps at 1, so every mapped
 * value rests exactly at its final keyframe (scale 1 / y −8 / opacity 1 /
 * radius 20px) as the panel scrolls away — no transform jump. The
 * statement block fades/slides in first (whileInView, once).
 *
 * Reduced motion / mobile (<768px): every scroll mapping collapses to the
 * settled state via conditional useTransform ranges (style-only — server
 * HTML equals the first client render; both branches are identical at
 * progress 0 on the server). The module CSS additionally drops the sticky
 * sequence back to normal document flow under prefers-reduced-motion and
 * below 768px; the frame then gets a single whileInView rise.
 *
 * Video: lazy-mounted 600px before view (useInView, once). Never autoplays.
 * The designed placeholder is the permanent underlay beneath the video
 * layer; robust missing-file detection (video onError + last-source onError
 * + a NETWORK_NO_SOURCE poll, since source errors do not always bubble)
 * unmounts the video so the placeholder shows. A missing poster paints
 * nothing (video background transparent), so the placeholder reads through
 * instead of a broken image.
 */
import { useEffect, useRef, useState } from "react";
import {
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import {
  ArrowRight,
  ClipboardList,
  Lock,
  Play,
  Rocket,
  Search,
  ShieldCheck,
} from "lucide-react";
import { DEMO_VIDEO } from "@/lib/landing-content";
import { DUR, EASE, STAGGER } from "./motion";
import styles from "./VideoRevealSection.module.css";

/** HTMLMediaElement.NETWORK_NO_SOURCE — resource selection exhausted. */
const NETWORK_NO_SOURCE = 3;

/** Mock-UI journey chips inside the designed placeholder (decorative). */
const JOURNEY = [
  { label: "Discover", icon: Search, tone: "accent" },
  { label: "Plan", icon: ClipboardList, tone: "accent" },
  { label: "Approve", icon: ShieldCheck, tone: "accent" },
  { label: "Deploy", icon: Rocket, tone: "teal" },
] as const;

export default function VideoRevealSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  /* Starts false on server AND first client render (hydration-safe);
     flips in an effect only. */
  const [isMobile, setIsMobile] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  const reduce = useReducedMotion();
  /* Collapse the scroll choreography for reduced motion and mobile flow.
     Style-only difference fed into useTransform ranges — the render tree
     never branches on it. */
  const still = Boolean(reduce) || isMobile;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  /* Lazy-mount the video element well before it scrolls into view. */
  const nearView = useInView(stageRef, { once: true, margin: "600px" });
  const showVideo = nearView && !videoFailed;

  /* Autoplay: the video is lazy-mounted only once the frame is near view
     (nearView, 600px margin), so mounting + muted autoplay effectively starts
     it as the user scrolls to the section. The `autoPlay` attribute is the
     primary trigger; this play() call is a belt-and-braces retry. Muted +
     playsInline keeps it within browser autoplay policy. */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !showVideo) return;
    const p = video.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }, [showVideo]);

  /* Source-element error events do not always bubble to the video element —
     belt and braces: also poll networkState after the load attempt. */
  useEffect(() => {
    if (!showVideo) return;
    const video = videoRef.current;
    if (!video) return;
    if (video.networkState === NETWORK_NO_SOURCE) {
      setVideoFailed(true);
      return;
    }
    const timer = window.setTimeout(() => {
      if (video.networkState === NETWORK_NO_SOURCE) setVideoFailed(true);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [showVideo]);

  const markVideoFailed = () => setVideoFailed(true);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end end"],
  });

  /* Rise + settle by 55% progress; then continuous life — a gentle −8px
     upward drift toward release so the frame never freezes while pinned.
     Progress clamps at 1 after release, so −8px IS the resting value the
     frame keeps as it scrolls away: no jump at the section boundary. */
  const frameScale = useTransform(
    scrollYProgress,
    [0, 0.55, 1],
    still ? [1, 1, 1] : [0.85, 1, 1],
  );
  const frameY = useTransform(
    scrollYProgress,
    [0, 0.55, 1],
    still ? [0, 0, 0] : [90, 0, -8],
  );
  const frameOpacity = useTransform(
    scrollYProgress,
    [0, 0.55, 1],
    still ? [1, 1, 1] : [0.6, 1, 1],
  );
  /* Border-radius via a motion value: transform-adjacent and cheap at this
     cadence (single element, no layout dependents — overflow:hidden clips). */
  const frameRadius = useTransform(
    scrollYProgress,
    [0, 0.55, 1],
    still ? ["20px", "20px", "20px"] : ["32px", "20px", "20px"],
  );
  const glowX = useTransform(
    scrollYProgress,
    [0, 1],
    still ? ["0%", "0%"] : ["-12%", "12%"],
  );

  return (
    <section
      id="product"
      ref={sectionRef}
      aria-labelledby="product-heading"
      className={styles.section}
    >
      <div className={styles.panel}>
        <div className={`lp-container ${styles.inner}`}>
          <div className={styles.statement}>
            <motion.h2
              id="product-heading"
              className="lp-h2-sm"
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px 0px -80px 0px" }}
              transition={{ duration: DUR.card, ease: EASE }}
            >
              {DEMO_VIDEO.heading}
            </motion.h2>
            <motion.p
              className="lp-lead"
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px 0px -80px 0px" }}
              transition={{ duration: DUR.card, delay: STAGGER, ease: EASE }}
            >
              {DEMO_VIDEO.body}
            </motion.p>
          </div>
        </div>

        <div ref={stageRef} className={styles.stage}>
            {/* Ambient light sweeping behind the frame across the sequence */}
            <motion.div
              className={`lp-glow-blue ${styles.glow}`}
              style={{ x: glowX }}
              aria-hidden="true"
            />

            {/* Entrance layer — the single whileInView rise on mobile;
                a soft arrival fade beneath the scroll mapping on desktop. */}
            <motion.div
              className={styles.frameIntro}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px 0px -60px 0px" }}
              transition={{ duration: DUR.card, delay: STAGGER * 2, ease: EASE }}
            >
              {/* Scroll-driven layer — scale / y / opacity / border-radius */}
              <motion.div
                className={styles.frame}
                style={{
                  scale: frameScale,
                  y: frameY,
                  opacity: frameOpacity,
                  borderRadius: frameRadius,
                }}
              >
                <div className={styles.chrome} aria-hidden="true">
                  <div className={styles.dots}>
                    <span className={styles.dot} />
                    <span className={styles.dot} />
                    <span className={styles.dot} />
                  </div>
                  <span className={styles.address}>
                    <Lock
                      size={14}
                      strokeWidth={2}
                      aria-hidden="true"
                      className={styles.addressIcon}
                    />
                    oriant.ai/workspace
                  </span>
                  <span />
                </div>

                <div className={styles.screen}>
                  {/* Designed product preview — permanent underlay */}
                  <div className={styles.placeholder} aria-hidden="true">
                    <div className={styles.wash} />
                    <div className={`lp-stage-grid ${styles.gridLayer}`} />
                    <div className={styles.previewContent}>
                      <div className={styles.playBadge}>
                        <Play size={20} strokeWidth={2} aria-hidden="true" />
                      </div>
                      <div className={styles.journey}>
                        {JOURNEY.map((step, i) => {
                          const Icon = step.icon;
                          return (
                            <span key={step.label} className={styles.journeyStep}>
                              {i > 0 && (
                                <span className={styles.jArrow}>
                                  <ArrowRight
                                    size={14}
                                    strokeWidth={2}
                                    aria-hidden="true"
                                  />
                                </span>
                              )}
                              <span className={styles.jChip}>
                                <Icon
                                  size={15}
                                  strokeWidth={2}
                                  aria-hidden="true"
                                  className={
                                    step.tone === "teal"
                                      ? styles.jIconTeal
                                      : styles.jIconAccent
                                  }
                                />
                                {step.label}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Fallback note — outside the aria-hidden placeholder so
                      screen-reader users get it too; the video layer below
                      overlays it whenever the video is mounted. */}
                  <p className={`lp-micro ${styles.note}`}>
                    {DEMO_VIDEO.fallbackNote}
                  </p>

                  {/* Video layer — mounted lazily; autoplays muted when the
                      frame scrolls into view (see the inView effect above) */}
                  {showVideo && (
                    <div className={styles.videoLayer}>
                      <video
                        ref={videoRef}
                        className={styles.video}
                        autoPlay
                        controls
                        muted
                        loop
                        playsInline
                        preload="auto"
                        poster={DEMO_VIDEO.poster}
                        title={DEMO_VIDEO.title}
                        onError={markVideoFailed}
                      >
                        <source src={DEMO_VIDEO.src} type="video/mp4" />
                        {/* Last source: attach onError here too — source
                            errors do not reliably reach the video element. */}
                        <source
                          src={DEMO_VIDEO.legacySrc}
                          type="video/mp4"
                          onError={markVideoFailed}
                        />
                      </video>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
    </section>
  );
}
