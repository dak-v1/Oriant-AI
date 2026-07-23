"use client";
/**
 * CardsMode — every interview question as a card, answerable in any order
 * (spec §9.4). One card expands at a time with the shared VoiceAnswer inline;
 * answered cards show the confirmed answer and the facts it unlocked.
 */
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Info } from "lucide-react";
import type { DiscoveryQuestion, KnowledgeFact } from "@/lib/mock/types";
import { DISCOVERY_QUESTIONS, KNOWLEDGE_FACTS } from "@/lib/mock/fixtures/discovery-questions";
import VoiceAnswer from "@/components/mock/ui/VoiceAnswer";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { DUR, EASE } from "@/lib/mock/motion";
import FactFlyout from "./FactFlyout";
import styles from "./discovery.module.css";

function factsFor(q: DiscoveryQuestion): KnowledgeFact[] {
  return q.factIds
    .map((id) => KNOWLEDGE_FACTS[id])
    .filter((f): f is KnowledgeFact => Boolean(f));
}

export default function CardsMode({
  answers,
  justConfirmed,
  onConfirm,
}: {
  answers: Record<string, string>;
  justConfirmed: DiscoveryQuestion | null;
  onConfirm: (q: DiscoveryQuestion, text: string) => void;
}) {
  const reduced = useReducedMotion();
  const firstOpen = DISCOVERY_QUESTIONS.find((q) => !answers[q.id])?.id ?? null;
  const [expandedId, setExpandedId] = useState<string | null>(firstOpen);

  return (
    <div className={styles.qCards}>
      <p className="oa-sub" style={{ margin: 0 }}>
        Answer in any order — every confirmed answer feeds What Oriant knows.
      </p>
      {DISCOVERY_QUESTIONS.map((q, i) => {
        const done = Boolean(answers[q.id]);
        const flying = justConfirmed?.id === q.id;
        const expanded = !done && expandedId === q.id;
        return (
          <section key={q.id} className={`oa-card oa-card--flat ${styles.qCard}`}>
            <button
              type="button"
              className={styles.qCardHead}
              onClick={() => !done && setExpandedId(expanded ? null : q.id)}
              disabled={done}
              aria-expanded={done ? undefined : expanded}
              style={{ cursor: done ? "default" : "pointer" }}
            >
              <span className={styles.qNum} aria-hidden>
                {i + 1}
              </span>
              <span className={styles.qCardTitle}>
                <span className="oa-h3">{q.question}</span>
                <span className="oa-sub">{q.reason}</span>
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

            {done && (
              <blockquote className={styles.answerQuote}>{answers[q.id]}</blockquote>
            )}

            <AnimatePresence mode="wait" initial={false}>
              {flying ? (
                <motion.div
                  key="fly"
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.2 } }}
                >
                  <FactFlyout facts={factsFor(q)} />
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
                  <VoiceAnswer
                    answer={q.answer}
                    onConfirm={(text) => onConfirm(q, text)}
                    confirmLabel="Confirm answer"
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>

            {done && !flying && (
              <p className="oa-sub" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                <Info size={12} aria-hidden />
                {q.factIds.length} fact{q.factIds.length === 1 ? "" : "s"} saved to What Oriant knows
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
