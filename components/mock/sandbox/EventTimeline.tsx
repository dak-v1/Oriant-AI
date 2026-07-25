"use client";
/**
 * EventTimeline — the step timeline of a sandbox run (spec §14; S-01).
 *
 * Fixture events are grouped under the staged frame labels (Running trigger
 * / Agent action / Human checkpoint / Result); a divider marks each stage
 * change. The approval_pause event renders as the ApprovalCard inside the
 * Human checkpoint stage. Auto-scrolls as events land (instant when reduced
 * motion is on).
 */
import { Fragment, useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Database,
  FileText,
  Hand,
  Inbox,
  Mail,
  Square,
  UserCheck,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  SandboxEvent,
  SandboxEventKind,
  SandboxScenario,
  SandboxRunState,
} from "@/lib/mock/types";
import { DUR, EASE } from "@/lib/mock/motion";
import { STAGE_LABEL, stageOfKind, type StageId } from "./stages";
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

function StageDivider({ stage, resumed }: { stage: StageId; resumed?: boolean }) {
  const cls =
    stage === "checkpoint"
      ? styles.stageDividerCheckpoint
      : stage === "result"
        ? styles.stageDividerResult
        : "";
  return (
    <div className={`${styles.stageDivider} ${cls}`} role="separator">
      {STAGE_LABEL[stage]}
      {resumed ? " · resumed after your approval" : ""}
    </div>
  );
}

export default function EventTimeline({
  scenario,
  displayCount,
  phase,
  pauseIdx,
  stopped,
}: {
  scenario: SandboxScenario;
  /** Events revealed so far; 0 when this scenario has not been run. */
  displayCount: number;
  phase: SandboxRunState["phase"];
  pauseIdx: number;
  /** True when the owner stopped the run early; the partial trace freezes. */
  stopped: boolean;
}) {
  const reduced = useReducedMotion();
  const endRef = useRef<HTMLDivElement | null>(null);
  const prevCount = useRef(displayCount);
  const live =
    !stopped && (phase === "running" || phase === "resuming" || phase === "paused_for_approval");

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

  const events = scenario.events.slice(0, Math.min(displayCount, scenario.events.length));

  /* ── Not run yet: quiet prompt in place of the feed ── */
  if (events.length === 0 && phase !== "running") {
    return (
      <div className={`oa-card oa-card--flat ${styles.empty}`}>
        <span className={styles.emptyIcon} aria-hidden>
          <Inbox size={20} />
        </span>
        <div style={{ display: "grid", gap: 6 }}>
          <h3 className="oa-h3">The step timeline appears here</h3>
          <p className="oa-sub" style={{ maxWidth: 460 }}>
            Run this test to follow every trigger, hand-off and draft step by step. If a risky
            action is proposed, the run pauses at a human checkpoint until you approve it.
          </p>
        </div>
        <span className="oa-sim-note">
          Simulated environment. No real customers, messages or refunds are involved.
        </span>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.feed} aria-live="polite">
        {/* Preparing frame while the run spins up, before the first event. */}
        {events.length === 0 && phase === "running" && !stopped && (
          <StageDivider stage="preparing" />
        )}

        {events.map((ev, i) => {
          const stage = stageOfKind(ev.kind);
          const prevStage = i > 0 ? stageOfKind(events[i - 1].kind) : null;
          const newStage = stage !== prevStage;
          const resumed = newStage && pauseIdx >= 0 && i === pauseIdx + 2 && stage === "agent";
          const isNewest = live && i === events.length - 1;
          return (
            <Fragment key={ev.id}>
              {newStage && <StageDivider stage={stage} resumed={resumed} />}
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

        {(phase === "running" || phase === "resuming") && !stopped && (
          <div className={styles.workingRow}>
            <span className={styles.dots} aria-hidden>
              <span />
              <span />
              <span />
            </span>
            Agents working, next step arriving…
          </div>
        )}

        {stopped && (
          <div className={styles.stoppedRow} role="status">
            <Square size={13} aria-hidden />
            Run stopped by you. Partial trace shown; run again to start over.
          </div>
        )}
      </div>
      <div ref={endRef} aria-hidden />
    </div>
  );
}
