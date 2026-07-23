"use client";
/**
 * EventTimeline — the animated vertical feed of sandbox events (spec §15,
 * §20 "event packets travel between agents, pause at human approval").
 *
 * Renders the revealed slice of scenario events as cards on a rail; the
 * approval_pause event renders as the amber ApprovalCard inline. Auto-scrolls
 * as events land (instant when reduced motion) and marks the resume point
 * after the owner approves.
 */
import { Fragment, useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Database,
  FileText,
  FlaskConical,
  Hand,
  Mail,
  UserCheck,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SandboxEvent, SandboxEventKind, SandboxScenario, SandboxRunState } from "@/lib/mock/types";
import { DUR, EASE } from "@/lib/mock/motion";
import ApprovalCard from "./ApprovalCard";
import styles from "./sandbox.module.css";

const KIND_META: Record<SandboxEventKind, { icon: LucideIcon; cls: string; label: string }> = {
  trigger: { icon: Zap, cls: styles.iconBlue, label: "Trigger" },
  agent_step: { icon: Bot, cls: styles.iconNeutral, label: "Agent step" },
  message: { icon: Mail, cls: styles.iconBlue, label: "Message" },
  data_request: { icon: Database, cls: styles.iconNeutral, label: "Data request" },
  draft: { icon: FileText, cls: styles.iconNeutral, label: "Draft" },
  approval_pause: { icon: Hand, cls: styles.iconAmber, label: "Approval pause" },
  approval_resolved: { icon: UserCheck, cls: styles.iconTeal, label: "Approval resolved" },
  result: { icon: CheckCircle2, cls: styles.iconResult, label: "Result" },
};

function fmtOffset(ms: number): string {
  return `+${(ms / 1000).toFixed(1)}s`;
}

function EventCard({ ev, animate }: { ev: SandboxEvent; animate: boolean }) {
  const meta = KIND_META[ev.kind];
  const Icon = meta.icon;
  return (
    <motion.div
      className={styles.event}
      initial={animate ? { opacity: 0, y: 14 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.card, ease: EASE }}
    >
      <span className={`${styles.eventIcon} ${meta.cls}`} aria-hidden>
        <Icon size={17} />
      </span>
      <div className={`oa-card oa-card--flat ${styles.eventCard}`}>
        <div className={styles.eventHead}>
          <span className={styles.actorChip}>{ev.actor}</span>
          {ev.target && (
            <>
              <span className={styles.targetArrow} aria-hidden>
                <ArrowRight size={12} />
              </span>
              <span className={styles.actorChip}>{ev.target}</span>
            </>
          )}
          <span className={styles.eventTime}>{fmtOffset(ev.at)}</span>
        </div>
        <p className={styles.eventTitle}>{ev.title}</p>
        <p className="oa-sub">{ev.detail}</p>
      </div>
    </motion.div>
  );
}

export default function EventTimeline({
  scenario,
  displayCount,
  phase,
  pauseIdx,
}: {
  scenario: SandboxScenario | null;
  displayCount: number;
  phase: SandboxRunState["phase"];
  pauseIdx: number;
}) {
  const reduced = useReducedMotion();
  const endRef = useRef<HTMLDivElement | null>(null);
  const prevCount = useRef(displayCount);
  const live = phase === "running" || phase === "resuming" || phase === "paused_for_approval";

  /* Auto-scroll as new events land (and to the approval card on pause). */
  useEffect(() => {
    const grew = displayCount > prevCount.current;
    prevCount.current = displayCount;
    if (!live || (!grew && phase !== "paused_for_approval")) return;
    endRef.current?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "nearest",
    });
  }, [displayCount, phase, live, reduced]);

  if (!scenario || phase === "idle") {
    return (
      <div className={`oa-card ${styles.empty}`}>
        <span className={styles.emptyIcon} aria-hidden>
          <FlaskConical size={22} />
        </span>
        <div style={{ display: "grid", gap: 6 }}>
          <h2 className="oa-h3">Watch a workflow rehearse, step by step</h2>
          <p className="oa-sub" style={{ maxWidth: 460 }}>
            The sandbox replays a realistic BrightPath case through your generated agents so you
            can see exactly what each one does — and where it stops for you.
          </p>
        </div>
        <div className={styles.emptySteps}>
          <div className={styles.emptyStep}>
            <span className={styles.stepNum} aria-hidden>1</span>
            <span>Pick a scenario on the left and review its input.</span>
          </div>
          <div className={styles.emptyStep}>
            <span className={styles.stepNum} aria-hidden>2</span>
            <span>Run the test and follow every trigger, hand-off and draft in this timeline.</span>
          </div>
          <div className={styles.emptyStep}>
            <span className={styles.stepNum} aria-hidden>3</span>
            <span>When a risky action is proposed, the run pauses until you approve it.</span>
          </div>
        </div>
        <span className="oa-sim-note">
          Simulated environment — no real customers, messages or refunds are involved.
        </span>
      </div>
    );
  }

  const events = scenario.events.slice(0, Math.min(displayCount, scenario.events.length));

  return (
    <div>
      <div className={styles.feed} aria-live="polite">
        {events.map((ev, i) => {
          const showResume = pauseIdx >= 0 && i === pauseIdx + 1;
          const isNewest = live && i === events.length - 1;
          return (
            <Fragment key={ev.id}>
              {showResume && (
                <div className={styles.resumeDivider} role="separator">
                  Resumed after your approval
                </div>
              )}
              {ev.kind === "approval_pause" ? (
                <motion.div
                  className={styles.event}
                  initial={isNewest && !reduced ? { opacity: 0, y: 14 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: DUR.card, ease: EASE }}
                >
                  <span className={`${styles.eventIcon} ${styles.iconAmber}`} aria-hidden>
                    <Hand size={17} />
                  </span>
                  <ApprovalCard scenario={scenario} pauseEvent={ev} />
                </motion.div>
              ) : (
                <EventCard ev={ev} animate={isNewest && !reduced} />
              )}
            </Fragment>
          );
        })}
        {(phase === "running" || phase === "resuming") && (
          <div className={styles.workingRow}>
            <span className={styles.dots} aria-hidden>
              <span />
              <span />
              <span />
            </span>
            Agents working — next step arriving…
          </div>
        )}
      </div>
      <div ref={endRef} aria-hidden />
    </div>
  );
}
