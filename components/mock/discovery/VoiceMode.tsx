"use client";
/**
 * VoiceMode — the default live-interview surface (spec §9.1): orchestrator
 * presence, the current question with its "Why Oriant asks" line, the shared
 * VoiceAnswer capture, skip / clarify secondary controls, the fact fly-out
 * after each confirmation and a question list for returning to skipped ones.
 */
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, HelpCircle, Info, SkipForward, Sparkles } from "lucide-react";
import type { DiscoveryQuestion, KnowledgeFact } from "@/lib/mock/types";
import { DISCOVERY_QUESTIONS, KNOWLEDGE_FACTS } from "@/lib/mock/fixtures/discovery-questions";
import VoiceAnswer from "@/components/mock/ui/VoiceAnswer";
import { DUR, EASE } from "@/lib/mock/motion";
import { CLARIFICATIONS } from "./clarifications";
import FactFlyout from "./FactFlyout";
import styles from "./discovery.module.css";

function factsFor(q: DiscoveryQuestion): KnowledgeFact[] {
  return q.factIds
    .map((id) => KNOWLEDGE_FACTS[id])
    .filter((f): f is KnowledgeFact => Boolean(f));
}

export default function VoiceMode({
  q,
  qNumber,
  answeredCount,
  answers,
  skipped,
  justConfirmed,
  onConfirm,
  onSkip,
  onJump,
}: {
  /** Current unanswered question (null when the interview is complete). */
  q: DiscoveryQuestion | null;
  /** 1-based position of the displayed question. */
  qNumber: number;
  answeredCount: number;
  answers: Record<string, string>;
  skipped: string[];
  /** Set while the just-confirmed question's facts fly out. */
  justConfirmed: DiscoveryQuestion | null;
  onConfirm: (q: DiscoveryQuestion, text: string) => void;
  onSkip: () => void;
  onJump: (questionId: string) => void;
}) {
  const reduced = useReducedMotion();
  const [clarifyFor, setClarifyFor] = useState<string | null>(null);

  const total = DISCOVERY_QUESTIONS.length;
  const displayQ = justConfirmed ?? q;
  const capturing = Boolean(q) && !justConfirmed;
  const onlyOneLeft = total - answeredCount <= 1;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section className={`oa-card ${styles.callCard}`} aria-label="Live interview">
        {/* Orchestrator presence + question progress */}
        <div className={styles.orbRow}>
          <div className={styles.orbId}>
            <span
              className={`${styles.avatar} ${capturing && !reduced ? styles.avatarPulse : ""}`}
              aria-hidden
            >
              O
            </span>
            <div style={{ display: "grid", gap: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 750 }}>Oriant Orchestrator</span>
              <span className="oa-sub">Discovery call · voice-first, never voice-only</span>
            </div>
          </div>
          <div className={styles.progressBlock}>
            <div className="oa-between" style={{ gap: 8 }}>
              <span className="oa-micro">
                Question {Math.min(qNumber, total)} of {total}
              </span>
              <span className="oa-sub">{answeredCount} answered</span>
            </div>
            <div className="oa-progress" aria-hidden>
              <span style={{ width: `${(answeredCount / total) * 100}%` }} />
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {justConfirmed ? (
            <motion.div
              key={`fly-${justConfirmed.id}`}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              style={{ display: "grid", gap: 12 }}
            >
              <h2 className="oa-h2" style={{ color: "var(--oa-muted-strong)" }}>
                {justConfirmed.question}
              </h2>
              <FactFlyout facts={factsFor(justConfirmed)} />
            </motion.div>
          ) : displayQ ? (
            <motion.div
              key={displayQ.id}
              initial={reduced ? false : { opacity: 0, x: 36 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, x: -26 }}
              transition={{ duration: DUR.card, ease: EASE }}
              className={styles.question}
            >
              <h2 className="oa-h2">{displayQ.question}</h2>
              <p className={styles.reason}>
                <Info size={14} aria-hidden />
                <span>
                  <strong style={{ fontWeight: 750 }}>Why Oriant asks — </strong>
                  {displayQ.reason}
                </span>
              </p>

              <AnimatePresence initial={false}>
                {clarifyFor === displayQ.id && (
                  <motion.div
                    initial={reduced ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: DUR.micro, ease: EASE }}
                    style={{ overflow: "hidden" }}
                  >
                    <div className={styles.clarify} role="note">
                      <Sparkles size={14} aria-hidden />
                      <span>{CLARIFICATIONS[displayQ.id]}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <VoiceAnswer
                answer={displayQ.answer}
                onConfirm={(text) => onConfirm(displayQ, text)}
                confirmLabel="Confirm answer"
              />

              <div className={styles.secondaryRow}>
                <button
                  type="button"
                  className="oa-btn oa-btn--ghost oa-btn--sm"
                  onClick={onSkip}
                  disabled={onlyOneLeft}
                  title={onlyOneLeft ? "This is the last unanswered question" : undefined}
                >
                  <SkipForward size={13} aria-hidden />
                  Skip for now
                </button>
                <button
                  type="button"
                  className="oa-btn oa-btn--ghost oa-btn--sm"
                  aria-expanded={clarifyFor === displayQ.id}
                  onClick={() =>
                    setClarifyFor((v) => (v === displayQ.id ? null : displayQ.id))
                  }
                >
                  <HelpCircle size={13} aria-hidden />
                  Ask Oriant to clarify
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>

      {/* Question list — jump back to skipped questions (spec §9.1) */}
      <nav className={styles.qList} aria-label="Interview questions">
        {DISCOVERY_QUESTIONS.map((question, i) => {
          const done = Boolean(answers[question.id]);
          const isCurrent = displayQ?.id === question.id;
          const isSkipped = skipped.includes(question.id) && !done;
          const state = done
            ? "answered"
            : isCurrent
              ? "current"
              : isSkipped
                ? "skipped"
                : "upcoming";
          return (
            <button
              key={question.id}
              type="button"
              className={`${styles.qPill} ${
                isCurrent
                  ? styles.qPillCurrent
                  : done
                    ? styles.qPillDone
                    : isSkipped
                      ? styles.qPillSkipped
                      : ""
              }`}
              disabled={done || isCurrent}
              onClick={() => onJump(question.id)}
              aria-current={isCurrent ? "step" : undefined}
              aria-label={`Question ${i + 1}: ${question.question} — ${state}`}
            >
              {done ? <Check size={12} aria-hidden /> : <span aria-hidden>{i + 1}</span>}
              {isSkipped ? "Skipped" : done ? "Answered" : `Question ${i + 1}`}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
