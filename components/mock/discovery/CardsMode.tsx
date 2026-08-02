"use client";
/**
 * CardsMode — every interview question as a card, answerable in any order
 * (spec §9.4). One card expands at a time with the shared VoiceAnswer inline;
 * answered cards show the confirmed answer and a short saved state.
 */
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Info } from "lucide-react";
import type { DiscoveryQuestion } from "@/lib/mock/types";
import VoiceAnswer from "@/components/mock/ui/VoiceAnswer";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { DUR, EASE } from "@/lib/mock/motion";
import styles from "./discovery.module.css";

export default function CardsMode({
  questions,
  answers,
  justConfirmed,
  onConfirm,
  onVoiceConfirm,
}: {
  questions: DiscoveryQuestion[];
  answers: Record<string, string>;
  justConfirmed: DiscoveryQuestion | null;
  onConfirm: (q: DiscoveryQuestion, text: string) => void;
  onVoiceConfirm?: (q: DiscoveryQuestion, text: string) => void;
}) {
  const reduced = useReducedMotion();
  const firstOpen = questions.find((q) => !answers[q.id])?.id ?? questions[0]?.id ?? null;
  const [expandedId, setExpandedId] = useState<string | null>(firstOpen);

  return (
    <div className={styles.qCards}>
      {questions.map((q, i) => {
        const done = Boolean(answers[q.id]);
        const saved = justConfirmed?.id === q.id;
        const expanded = expandedId === q.id;
        return (
          <section key={q.id} className={`oa-card oa-card--flat ${styles.qCard}`}>
            <div className={styles.qCardHead}>
              <button
                type="button"
                className={styles.qCardToggle}
                onClick={() => setExpandedId(expanded ? null : q.id)}
                aria-expanded={expanded}
                style={{ cursor: "pointer" }}
              >
                <span className={styles.qNum} aria-hidden>
                  {i + 1}
                </span>
                <span className={styles.qCardTitle}>
                  <span className={styles.qTitleRow}>
                    <span className="oa-h3">{q.question}</span>
                  </span>
                </span>
                {done ? (
                  <StatusBadge status="completed" label="Answered" />
                ) : (
                  <ChevronDown
                    size={16}
                    aria-hidden
                    style={{
                      flex: "none",
                      marginTop: 4,
                      color: "var(--oa-muted)",
                      transform: expanded ? "rotate(180deg)" : "none",
                      transition: "transform 0.25s var(--oa-ease)",
                    }}
                  />
                )}
              </button>
            </div>

            {done && !expanded && (
              <blockquote className={styles.answerQuote}>{answers[q.id]}</blockquote>
            )}

            <AnimatePresence mode="wait" initial={false}>
              {saved ? (
                <motion.div
                  key="saved"
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.2 } }}
                >
                  <div className={styles.savedNote} aria-live="polite">
                    <Info size={14} aria-hidden />
                    Answer saved. Oriant will use this in the company report and planning brief.
                  </div>
                </motion.div>
              ) : expanded ? (
                <motion.div
                  key="answer"
                  initial={reduced ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: DUR.card, ease: EASE }}
                  style={{ overflow: "hidden" }}
                >
                  <div className={styles.qCardBody}>
                    <VoiceAnswer
                      answer={q.answer ?? ""}
                      initialText={answers[q.id] ?? ""}
                      onConfirm={(text) => onConfirm(q, text)}
                      onVoiceConfirm={(text) => onVoiceConfirm?.(q, text)}
                      confirmLabel={done ? "Save answer" : "Confirm answer"}
                      placeholder={q.helperText ?? "Type your answer here…"}
                      variant="embedded"
                      startMode={done ? "editable" : "idle"}
                    />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {done && !saved && (
              <p className="oa-sub" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                <Info size={12} aria-hidden />
                Saved for the discovery report
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
