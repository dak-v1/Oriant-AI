"use client";
/**
 * TextMode — the same interview as a chat-style thread (spec §9.4): identical
 * questions and answers, typed input with the suggested answer prefilled,
 * no waveform. Confirming routes through the same confirm flow as voice.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { HelpCircle, Send, SkipForward } from "lucide-react";
import type { DiscoveryQuestion, KnowledgeFact } from "@/lib/mock/types";
import { DISCOVERY_QUESTIONS, KNOWLEDGE_FACTS } from "@/lib/mock/fixtures/discovery-questions";
import { DUR, EASE } from "@/lib/mock/motion";
import { CLARIFICATIONS } from "./clarifications";
import FactFlyout from "./FactFlyout";
import styles from "./discovery.module.css";

function factsFor(q: DiscoveryQuestion): KnowledgeFact[] {
  return q.factIds
    .map((id) => KNOWLEDGE_FACTS[id])
    .filter((f): f is KnowledgeFact => Boolean(f));
}

export default function TextMode({
  q,
  answers,
  justConfirmed,
  onConfirm,
  onSkip,
}: {
  q: DiscoveryQuestion | null;
  answers: Record<string, string>;
  justConfirmed: DiscoveryQuestion | null;
  onConfirm: (q: DiscoveryQuestion, text: string) => void;
  onSkip: () => void;
}) {
  const reduced = useReducedMotion();
  const [text, setText] = useState("");
  const [clarifyOpen, setClarifyOpen] = useState(false);

  /* Prefill the suggested (fixture) answer whenever the question changes. */
  useEffect(() => {
    setText(q?.answer ?? "");
    setClarifyOpen(false);
  }, [q?.id, q?.answer]);

  const answered = DISCOVERY_QUESTIONS.filter((question) => answers[question.id]);
  const current = justConfirmed ?? q;
  const remaining = DISCOVERY_QUESTIONS.length - answered.length;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className={styles.thread} aria-label="Interview conversation">
        {answered.map((question) => (
          <div key={question.id} style={{ display: "grid", gap: 10 }}>
            <div className={`${styles.bubble} ${styles.bubbleAi}`}>
              <span className={styles.bubbleMeta}>Oriant</span>
              {question.question}
            </div>
            <div className={`${styles.bubble} ${styles.bubbleOwner}`}>
              <span className={styles.bubbleMeta}>You</span>
              {answers[question.id]}
            </div>
            <div className={styles.miniFacts} aria-label="Facts captured from this answer">
              {factsFor(question).map((f) => (
                <span key={f.id} className={styles.miniFact}>
                  {f.label}
                </span>
              ))}
            </div>
          </div>
        ))}

        {current && !justConfirmed && (
          <motion.div
            key={current.id}
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.card, ease: EASE }}
            className={`${styles.bubble} ${styles.bubbleAi}`}
          >
            <span className={styles.bubbleMeta}>Oriant</span>
            {current.question}
            <span className="oa-sub" style={{ display: "block", marginTop: 6 }}>
              {current.reason}
            </span>
          </motion.div>
        )}

        {clarifyOpen && current && !justConfirmed && (
          <div className={`${styles.bubble} ${styles.bubbleAi}`}>
            <span className={styles.bubbleMeta}>
              <HelpCircle size={10} aria-hidden style={{ verticalAlign: -1, marginRight: 4 }} />
              Oriant clarifies
            </span>
            {CLARIFICATIONS[current.id]}
          </div>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {justConfirmed ? (
          <motion.div
            key={`fly-${justConfirmed.id}`}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            className={`oa-card oa-card--flat ${styles.composer}`}
          >
            <FactFlyout facts={factsFor(justConfirmed)} />
          </motion.div>
        ) : q ? (
          <motion.div
            key={q.id}
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.card, ease: EASE }}
            className={`oa-card oa-card--flat ${styles.composer}`}
          >
            <label className="oa-label" htmlFor="discovery-text-answer">
              Your answer (suggested wording prefilled, edit freely)
            </label>
            <textarea
              id="discovery-text-answer"
              className="oa-textarea"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type your answer…"
            />
            <div className="oa-between">
              <div className="oa-cluster">
                <button
                  type="button"
                  className="oa-btn oa-btn--ghost oa-btn--sm"
                  onClick={onSkip}
                  disabled={remaining <= 1}
                >
                  <SkipForward size={13} aria-hidden />
                  Skip for now
                </button>
                <button
                  type="button"
                  className="oa-btn oa-btn--ghost oa-btn--sm"
                  aria-expanded={clarifyOpen}
                  onClick={() => setClarifyOpen((v) => !v)}
                >
                  <HelpCircle size={13} aria-hidden />
                  Ask Oriant to clarify
                </button>
              </div>
              <button
                type="button"
                className="oa-btn oa-btn--primary"
                disabled={!text.trim()}
                onClick={() => onConfirm(q, text.trim())}
              >
                <Send size={14} aria-hidden />
                Send answer
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
