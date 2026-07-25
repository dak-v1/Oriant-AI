"use client";
/**
 * ApprovalsDark — human-in-the-loop dark narrative (brief §14).
 *
 * Composition: dark full-bleed band with an editorial head, then a large
 * product composition — Approval queue panel → messaging notification card
 * (docks in from the right edge) → week calendar strip — joined by dotted
 * SVG connectors.
 *
 * PRIMARY MOTION CONCEPT: an 8-step choreographed loop (~10.8s) driven by a
 * setTimeout state machine. Each beat toggles a CSS-module class; every
 * animated property is transform / opacity / clip-path only:
 *   1 new task row slides into the queue (Pending)
 *   2 a calendar block appears (amber outline, labelled)
 *   3 a packet travels the dotted path; the notification pops in and docks
 *   4 the "Review" chip highlights
 *   5 the owner comment types in (clip-path width mask, stepped)
 *   6 the agent update line appears
 *   7 the queue row's status crossfades to Approved (teal fill + label)
 *   8 the matched calendar block flips to teal "Approved" in sync
 * then the scene settles and resets.
 *
 * The machine is gated by useInView (no `once`) + document.hidden and by
 * useReducedMotion — all three park the scene at step 8, the fully-resolved
 * frame, which is also the server-rendered initial state (hydration-safe:
 * the render tree never branches on reduced motion, only the effect does).
 * The whole visual is aria-hidden; the section copy carries the meaning.
 */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useInView, useReducedMotion } from "framer-motion";
import { APPROVALS_SECTION } from "@/lib/landing-content";
import { DUR } from "./motion";
import SectionReveal from "./SectionReveal";
import s from "./ApprovalsDark.module.css";

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Parked, fully-resolved frame (static / pre-hydration / reduced motion). */
const RESOLVED: Step = 8;

/** Choreography beats in ms from cycle start. Step 8 lands in sync with 7. */
const BEATS: ReadonlyArray<{ step: Step; at: number }> = [
  { step: 1, at: DUR.card * 1000 }, // new row slides into the queue
  { step: 2, at: 1850 }, //            calendar block appears (amber outline)
  { step: 3, at: 2950 }, //            packet travels; notification docks
  { step: 4, at: 4350 }, //            "Review" chip highlights
  { step: 5, at: 5050 }, //            owner comment types in (width mask)
  { step: 6, at: 6250 }, //            agent update line appears
  { step: 7, at: 7450 }, //            queue status flips to Approved
  { step: 8, at: 7600 }, //            calendar block flips in sync
];
const CYCLE_MS = 10800; // ≈3s settle on the resolved frame, then reset

const cx = (...parts: Array<string | false | undefined>): string =>
  parts.filter(Boolean).join(" ");

/** Wraps `phrase` (sourced from the content line itself) in the serif accent. */
function withSerifAccent(line: string, phrase: string): ReactNode {
  const i = line.indexOf(phrase);
  if (i < 0) return line;
  return (
    <>
      {line.slice(0, i)}
      <span className="lp-serif">{phrase}</span>
      {line.slice(i + phrase.length)}
    </>
  );
}

const statusLabel = (id: "pending" | "approved" | "review"): string =>
  APPROVALS_SECTION.states.find((st) => st.id === id)?.label ?? id;

type CalBlockKind = "active" | "queued" | "animated" | "scheduled";

const CAL_DAYS: ReadonlyArray<{
  label: string;
  /** hidden below 768px — the mobile calendar simplifies to 3 columns */
  desktopOnly?: boolean;
  block?: CalBlockKind;
}> = [
  { label: "Mon", desktopOnly: true },
  { label: "Tue", block: "active" },
  { label: "Wed", block: "queued" },
  { label: "Thu", block: "animated" },
  { label: "Fri", desktopOnly: true, block: "scheduled" },
  { label: "Sat", desktopOnly: true },
  { label: "Sun", desktopOnly: true },
];

export default function ApprovalsDark() {
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(stageRef, { margin: "200px" });
  const reduce = useReducedMotion();
  const [step, setStep] = useState<Step>(RESOLVED);

  useEffect(() => {
    if (!inView || reduce) {
      setStep(RESOLVED);
      return;
    }
    let timers: number[] = [];
    const clearAll = () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
    };
    const runCycle = () => {
      clearAll();
      setStep(0);
      BEATS.forEach(({ step: st, at }) => {
        timers.push(window.setTimeout(() => setStep(st), at));
      });
      timers.push(window.setTimeout(runCycle, CYCLE_MS));
    };
    const onVisibility = () => {
      if (document.hidden) {
        clearAll();
        setStep(RESOLVED);
      } else {
        runCycle();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    if (document.hidden) setStep(RESOLVED);
    else runCycle();
    return () => {
      clearAll();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [inView, reduce]);

  return (
    <section id="approvals" className="lp-dark lp-section">
      <div className="lp-container">
        <SectionReveal className="lp-section-head">
          <span className="lp-eyebrow">{APPROVALS_SECTION.eyebrow}</span>
          <h2 className="lp-h2">
            <span className={s.hLine}>{APPROVALS_SECTION.headingLines[0]}</span>
            <span className={s.hLine}>
              {withSerifAccent(APPROVALS_SECTION.headingLines[1], "important calls")}
            </span>
          </h2>
          <p className={cx("lp-lead", s.lead)}>{APPROVALS_SECTION.body}</p>
        </SectionReveal>

        <SectionReveal delay={0.1}>
          <div ref={stageRef} className={s.stage} aria-hidden="true">
            <div className={cx("lp-glow-blue", s.glowA)} />
            <div className={cx("lp-glow-teal", s.glowB)} />

            {/* ── Approval queue ─────────────────────────────────────── */}
            <div className={s.queue}>
              <div className={s.queueHead}>
                <span className="lp-micro">Approval queue</span>
                <span className={s.queueCount}>3 open</span>
              </div>
              <div className={s.rows}>
                <div className={s.row}>
                  <div className={s.rowMain}>
                    <span className={s.rowTitle}>Refund over policy: $180</span>
                    <span className={s.rowMeta}>Customer Support Agent</span>
                  </div>
                  <span className="lp-status lp-status--pending">
                    {statusLabel("pending")}
                  </span>
                </div>

                <div className={s.rowGroup}>
                  <div className={s.row}>
                    <div className={s.rowMain}>
                      <span className={s.rowTitle}>Supplier email draft</span>
                      <span className={s.rowMeta}>Procurement Agent</span>
                    </div>
                    <span className="lp-status lp-status--review">
                      {statusLabel("review")}
                    </span>
                  </div>
                  <div className={s.thread}>
                    <div className={cx(s.tLine, s.tYou, step >= 5 && s.tYouIn)}>
                      <span className={s.tWho}>You:</span>
                      <span className={s.tText}>
                        tighten the tone before it goes out.
                      </span>
                    </div>
                    <div className={cx(s.tLine, s.tAgent, step >= 6 && s.tAgentIn)}>
                      <span className={cx(s.tWho, s.tWhoAgent)}>Agent:</span>
                      <span>updated draft attached.</span>
                    </div>
                  </div>
                </div>

                <div
                  className={cx(
                    s.row,
                    s.rowNew,
                    step >= 1 && s.rowIn,
                    step >= 7 && s.rowApproved,
                  )}
                >
                  <div className={s.rowMain}>
                    <span className={s.rowTitle}>Weekly stock reorder</span>
                    <span className={s.rowMeta}>Inventory Agent · $1,240</span>
                  </div>
                  <span className={s.statusSwap}>
                    <span className={cx("lp-status", "lp-status--pending", s.swapPending)}>
                      {statusLabel("pending")}
                    </span>
                    <span className={cx("lp-status", "lp-status--approved", s.swapApproved)}>
                      {statusLabel("approved")}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* ── Dotted connector: queue → notification ─────────────── */}
            <div className={s.conn}>
              <svg className={s.connH} viewBox="0 0 54 36" fill="none">
                <path
                  d="M2 18 C 16 11, 38 25, 52 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="0.5 6.5"
                />
                <circle
                  className={cx(s.packet, step >= 3 && s.packetGo)}
                  cx="3"
                  cy="18"
                  r="3.2"
                />
              </svg>
              <svg className={s.connV} viewBox="0 0 24 44" fill="none">
                <path
                  d="M12 2 C 7 14, 17 30, 12 42"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="0.5 6.5"
                />
              </svg>
            </div>

            {/* ── Messaging notification (docks in from the right) ───── */}
            <div
              className={cx(
                s.notif,
                step >= 3 && s.notifIn,
                step >= 4 && step < 7 && s.hotReview,
                step >= 7 && s.hotApprove,
              )}
            >
              <div className={s.notifTop}>
                <span className={s.notifAvatar}>O</span>
                <div className={s.notifBody}>
                  <span className={s.notifFromRow}>
                    <span className={s.notifFrom}>Oriant</span>
                    <span className={s.notifTime}>· now</span>
                    <span className={s.notifChannel}>WhatsApp</span>
                  </span>
                  <span className={s.notifMsg}>
                    Approval request: send the supplier reorder for $1,240?
                  </span>
                </div>
              </div>
              <div className={s.notifChips}>
                <span className={cx(s.chip, s.chipApprove)}>
                  <span>Approve</span>
                </span>
                <span className={cx(s.chip, s.chipReview)}>
                  <span>Review</span>
                </span>
              </div>
            </div>

            {/* ── Dotted connector: notification → calendar ──────────── */}
            <div className={s.conn}>
              <svg className={s.connH} viewBox="0 0 54 36" fill="none">
                <path
                  d="M2 18 C 16 25, 38 11, 52 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="0.5 6.5"
                />
                {/* the approval propagating outward — teal, like the state it delivers */}
                <circle
                  className={cx(s.packet, s.packetTeal, step >= 7 && s.packetGoAlt)}
                  cx="3"
                  cy="18"
                  r="3.2"
                />
              </svg>
              <svg className={s.connV} viewBox="0 0 24 44" fill="none">
                <path
                  d="M12 2 C 17 14, 7 30, 12 42"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="0.5 6.5"
                />
              </svg>
            </div>

            {/* ── Week calendar strip ────────────────────────────────── */}
            <div className={s.calendar}>
              <div className={s.calHead}>
                <span className="lp-micro">Team calendar</span>
                <span className={s.calRange}>This week</span>
              </div>
              <div className={s.calGrid}>
                {CAL_DAYS.map((d) => (
                  <div
                    key={d.label}
                    className={cx(s.day, d.desktopOnly && s.dayDesktopOnly)}
                  >
                    <span className={s.dayLabel}>{d.label}</span>
                    <div className={s.daySlots}>
                      {d.block === "active" && (
                        <div className={cx(s.block, s.blockActive, s.slotA)}>
                          <span className={s.blockTitle}>Support triage</span>
                          <span className={s.blockState}>Active</span>
                        </div>
                      )}
                      {d.block === "queued" && (
                        <div className={cx(s.block, s.slotB)}>
                          <span className={s.blockTitle}>Invoice batch</span>
                          <span className={s.blockState}>Queued</span>
                        </div>
                      )}
                      {d.block === "animated" && (
                        <div
                          className={cx(
                            s.calBlock,
                            step >= 2 && s.calBlockIn,
                            step >= 8 && s.calBlockDone,
                          )}
                        >
                          <div className={cx(s.calLayer, s.calPendingLayer)}>
                            <span className={s.blockTitle}>Stock reorder</span>
                            <span className={s.blockState}>
                              {statusLabel("pending")}
                            </span>
                          </div>
                          <div className={cx(s.calLayer, s.calApprovedLayer)}>
                            <span className={s.blockTitle}>Stock reorder</span>
                            <span className={s.blockState}>
                              {statusLabel("approved")}
                            </span>
                          </div>
                        </div>
                      )}
                      {d.block === "scheduled" && (
                        <div className={cx(s.block, s.slotD)}>
                          <span className={s.blockTitle}>Weekly report</span>
                          <span className={s.blockState}>Scheduled</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className={cx("lp-micro", s.caption)}>
            Illustrative preview. Approval rules are configured per business.
          </p>
        </SectionReveal>
      </div>
    </section>
  );
}
