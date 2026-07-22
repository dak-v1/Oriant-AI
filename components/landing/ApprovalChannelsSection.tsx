"use client";

/**
 * ApprovalChannelsSection — master brief §7.7, the high-contrast human-control
 * section. Dark full-bleed layout: copy column on the left, and on the right an
 * original presentation-only split visual — an "Approval queue" panel connected
 * by a dashed line to a phone frame receiving an approval notification.
 *
 * A ~7s step machine loops: pending card highlights → accent dot travels the
 * connector → notification pops in on the phone → the approval returns and the
 * queue card briefly flips to approved → reset. Timers are cleaned up on
 * unmount and paused while the document is hidden or the section is
 * offscreen. Under reduced motion (and
 * before hydration / without JS) a static, complete frame renders instead.
 */

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { APPROVALS_SECTION } from "@/lib/landing-content";
import SectionReveal, { LP_EASE } from "./SectionReveal";
import styles from "./ApprovalChannelsSection.module.css";

/* Step machine: 0 idle → 1 highlight pending → 2 dot travels →
   3 notification pops in → 4 approval returns → back to 0. Sums to ~7s. */
const STEP_DURATIONS = [1000, 1100, 1300, 1900, 1700] as const;
const STEP_COUNT = STEP_DURATIONS.length;

type QueueStatus = "pending" | "changes" | "approved";

const QUEUE_ITEMS: { title: string; status: QueueStatus; label: string }[] = [
  { title: "Refund over policy — $180", status: "pending", label: "Pending" },
  { title: "New supplier email draft", status: "changes", label: "Needs changes" },
  { title: "Weekly stock reorder", status: "approved", label: "Approved" },
];

const NOTIFICATION_MESSAGE =
  "Approval request: send the supplier reorder for $1,240?";
const CAPTION = "Illustrative preview — approvals are configured per business.";

/* Cubic from the queue's top-right edge down to the phone's top edge. */
const CONNECTOR_PATH = "M 6 30 C 70 6, 120 24, 160 86";

/** Wraps a single word of an imported heading in the shared serif accent. */
function SerifWord({ text, word }: { text: string; word: string }) {
  const idx = text.indexOf(word);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="lp-serif">{word}</span>
      {text.slice(idx + word.length)}
    </>
  );
}

/** Inner content of the phone's messaging-app notification card. */
function NotificationContent({ approveActive }: { approveActive: boolean }) {
  return (
    <>
      <div className={styles.notifApp}>
        <span className={styles.notifDot} />
        <span className={styles.notifAppName}>Oriant.ai · now</span>
      </div>
      <p className={styles.notifMsg}>{NOTIFICATION_MESSAGE}</p>
      <div className={styles.notifChips}>
        <span
          className={`${styles.chip} ${approveActive ? styles.chipActive : ""}`}
        >
          {approveActive ? (
            <Check size={12} strokeWidth={3} aria-hidden="true" />
          ) : null}
          Approve
        </span>
        <span className={styles.chip}>Reject</span>
      </div>
    </>
  );
}

export default function ApprovalChannelsSection() {
  const reducedMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { margin: "200px 0px 200px 0px" });
  const [mounted, setMounted] = useState(false);
  /* Start on step 4 so the first animated frame matches the static SSR frame
     (notification delivered, Approve chosen) before the loop resets. */
  const [step, setStep] = useState(4);

  useEffect(() => {
    setMounted(true);
  }, []);

  /* Pause the loop entirely while the section is offscreen. */
  const animating = mounted && !reducedMotion && inView;

  useEffect(() => {
    /* Offscreen: park on the static composed frame (step 4) so re-entering
       the viewport resumes cleanly instead of popping mid-loop. */
    if (!inView) setStep(4);
  }, [inView]);

  useEffect(() => {
    if (!animating) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const clear = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };
    const arm = () => {
      clear();
      timer = setTimeout(
        () => setStep((s) => (s + 1) % STEP_COUNT),
        STEP_DURATIONS[step] ?? 1200,
      );
    };
    const onVisibility = () => {
      if (document.hidden) {
        clear();
      } else {
        arm();
      }
    };

    if (!document.hidden) arm();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [animating, step]);

  /* Derived frame state. When not animating (no JS yet, or reduced motion)
     the scene is a complete story: all three queue statuses visible and the
     notification delivered with Approve chosen. */
  const highlightPending = animating && (step === 1 || step === 2);
  const traveling = animating && step === 2;
  const notifVisible = !animating || step === 3 || step === 4;
  const approveChosen = !animating || step === 4;
  const queueResolved = animating && step === 4;

  return (
    <section
      id="approvals"
      ref={sectionRef}
      className={`lp-dark lp-section ${styles.section}`}
    >
      <div className="lp-container">
        <SectionReveal>
          <div className={styles.grid}>
            {/* ── Copy column ── */}
            <div className={styles.copyCol}>
              <p className="lp-eyebrow">{APPROVALS_SECTION.eyebrow}</p>
              <h2 className="lp-h2">
                <SerifWord text={APPROVALS_SECTION.heading} word="control" />
              </h2>
              <p className="lp-lead">{APPROVALS_SECTION.body}</p>
              <div className={styles.callout}>
                <ShieldCheck
                  size={18}
                  strokeWidth={2}
                  aria-hidden="true"
                  className={styles.calloutIcon}
                />
                <p className={styles.calloutText}>
                  {APPROVALS_SECTION.supporting}
                </p>
              </div>
              <a
                href={APPROVALS_SECTION.cta.href}
                className={`lp-link-arrow ${styles.ctaLink}`}
              >
                {APPROVALS_SECTION.cta.label}
                <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
              </a>
            </div>

            {/* ── Visual column (decorative mock UI) ── */}
            <div className={styles.visualWrap}>
              <div className={styles.visual} aria-hidden="true">
                <div className={`${styles.glow} lp-rose-glow`} />

                {/* Approval queue panel */}
                <div className={styles.queuePanel}>
                  <span className={`lp-micro ${styles.panelTitle}`}>
                    Approval queue
                  </span>
                  <div className={styles.queueList}>
                    {QUEUE_ITEMS.map((item, i) => {
                      const resolved = i === 0 && queueResolved;
                      const status: QueueStatus = resolved
                        ? "approved"
                        : item.status;
                      const active = i === 0 && highlightPending;
                      return (
                        <div
                          key={item.title}
                          className={`${styles.queueCard} ${
                            active ? styles.queueCardActive : ""
                          }`}
                        >
                          <span className={styles.queueTitle}>{item.title}</span>
                          <span className={`lp-status lp-status--${status}`}>
                            {resolved ? "Approved" : item.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Dashed connector + travelling accent dot */}
                <svg
                  className={styles.connector}
                  viewBox="0 0 170 110"
                  width="170"
                  height="110"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d={CONNECTOR_PATH}
                    stroke="rgba(255, 255, 255, 0.28)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeDasharray="5 7"
                  />
                  {animating ? (
                    <motion.circle
                      r={4.5}
                      fill="var(--lp-accent)"
                      stroke="rgba(255, 255, 255, 0.35)"
                      strokeWidth={1}
                      initial={false}
                      animate={
                        traveling
                          ? {
                              cx: [6, 65, 115, 160],
                              cy: [30, 20, 38, 86],
                              opacity: [0, 1, 1, 0],
                            }
                          : { cx: 6, cy: 30, opacity: 0 }
                      }
                      transition={
                        traveling
                          ? {
                              duration: 1.25,
                              times: [0, 0.35, 0.7, 1],
                              ease: "easeInOut",
                            }
                          : { duration: 0.2 }
                      }
                    />
                  ) : null}
                </svg>

                {/* Phone frame */}
                <div className={styles.phone}>
                  <span className={styles.phoneNotch} />
                  <div className={styles.phoneScreen}>
                    <span className={styles.screenTime}>09:41</span>
                    {animating ? (
                      <motion.div
                        className={styles.notification}
                        initial={false}
                        animate={
                          notifVisible
                            ? { opacity: 1, scale: 1, y: 0 }
                            : { opacity: 0, scale: 0.9, y: 10 }
                        }
                        transition={{ duration: 0.5, ease: LP_EASE }}
                      >
                        <NotificationContent approveActive={approveChosen} />
                      </motion.div>
                    ) : (
                      <div className={styles.notification}>
                        <NotificationContent approveActive />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <span className={`lp-micro ${styles.caption}`}>{CAPTION}</span>
            </div>
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}
