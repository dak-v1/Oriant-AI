"use client";
/**
 * GuidedPath — "Build it with Oriant" (spec §8.2, §9.2).
 *
 * One card at a time through the nine LEAN_CANVAS_BLOCKS: focused question,
 * the shared VoiceAnswer, and a collapsed "Examples and guidance" expander
 * so helper copy never crowds the input. After each confirmed answer,
 * "Improve wording with AI" shows Before vs Suggested side by side with
 * Accept / Edit / Keep original — the saved answer is NEVER replaced
 * automatically. Back navigation is pinned above the card on the page grid,
 * so card growth never moves it.
 */
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { Check, ChevronDown, ChevronLeft, Pencil, PenLine } from "lucide-react";
import VoiceAnswer from "@/components/mock/ui/VoiceAnswer";
import { useDemoStore } from "@/lib/mock/store";
import { LEAN_CANVAS_BLOCKS } from "@/lib/mock/fixtures/lean-canvas";
import { DUR, EASE } from "@/lib/mock/motion";
import styles from "./onboarding.module.css";

function cardVariants(reduced: boolean): Variants {
  if (reduced) {
    return {
      enter: { opacity: 0 },
      center: { opacity: 1, transition: { duration: 0.15 } },
      exit: { opacity: 0, transition: { duration: 0.1 } },
    };
  }
  return {
    enter: (dir: number) => ({ opacity: 0, x: 64 * dir }),
    center: { opacity: 1, x: 0, transition: { duration: DUR.page, ease: EASE } },
    exit: (dir: number) => ({
      opacity: 0,
      x: -64 * dir,
      transition: { duration: DUR.card * 0.6, ease: EASE },
    }),
  };
}

export default function GuidedPath({
  onExit,
  onFinished,
}: {
  onExit: () => void;
  onFinished: () => void;
}) {
  const reduced = useReducedMotion();
  const values = useDemoStore((s) => s.leanCanvas.values);
  const setCanvasValue = useDemoStore((s) => s.setCanvasValue);

  const [index, setIndex] = useState(() => {
    const vals = useDemoStore.getState().leanCanvas.values;
    const firstMissing = LEAN_CANVAS_BLOCKS.findIndex(
      (b) => !(vals[b.id] ?? "").trim(),
    );
    return firstMissing === -1 ? 0 : firstMissing;
  });
  const [dir, setDir] = useState(1);
  const [phase, setPhase] = useState<"answer" | "improve">("answer");
  const [editingSuggestion, setEditingSuggestion] = useState(false);
  const [suggestionDraft, setSuggestionDraft] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);

  const block = LEAN_CANVAS_BLOCKS[index];
  const answered = LEAN_CANVAS_BLOCKS.filter((b) => (values[b.id] ?? "").trim()).length;

  const advance = () => {
    setEditingSuggestion(false);
    setGuideOpen(false);
    if (index >= LEAN_CANVAS_BLOCKS.length - 1) {
      onFinished();
    } else {
      setDir(1);
      setIndex(index + 1);
      setPhase("answer");
    }
  };

  const goBack = () => {
    if (index === 0) return;
    setEditingSuggestion(false);
    setGuideOpen(false);
    setDir(-1);
    setIndex(index - 1);
    setPhase("answer");
  };

  const variants = cardVariants(Boolean(reduced));

  return (
    <div className={styles.guidedTop}>
      <div className="oa-between">
        <div className="oa-cluster">
          <button type="button" className="oa-btn oa-btn--ghost oa-btn--sm" onClick={onExit}>
            <ChevronLeft size={13} aria-hidden />
            Paths
          </button>
          <button
            type="button"
            className="oa-btn oa-btn--ghost oa-btn--sm"
            onClick={goBack}
            disabled={index === 0}
          >
            Previous block
          </button>
        </div>
        <span className="oa-micro" aria-live="polite">
          Block {index + 1} of {LEAN_CANVAS_BLOCKS.length}
        </span>
      </div>
      <div className="oa-progress" aria-hidden>
        <span style={{ width: `${(answered / LEAN_CANVAS_BLOCKS.length) * 100}%` }} />
      </div>

      <div className={styles.viewport}>
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.section
            key={block.id}
            className={`oa-card ${styles.stepCard} ${styles.guidedCard}`}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            aria-label={`${block.title}, block ${index + 1} of ${LEAN_CANVAS_BLOCKS.length}`}
          >
            <div style={{ display: "grid", gap: 8 }}>
              <p className="oa-eyebrow">{block.title}</p>
              <h2 className="oa-h2">{block.question}</h2>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {phase === "answer" ? (
                <motion.div
                  key="answer"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ display: "grid", gap: 14 }}
                >
                  <div>
                    <button
                      type="button"
                      className={styles.guideToggle}
                      aria-expanded={guideOpen}
                      onClick={() => setGuideOpen((v) => !v)}
                    >
                      <ChevronDown
                        size={14}
                        aria-hidden
                        style={{
                          transform: guideOpen ? "rotate(180deg)" : "none",
                          transition: "transform 0.2s var(--oa-ease)",
                        }}
                      />
                      Examples and guidance
                    </button>
                    <AnimatePresence initial={false}>
                      {guideOpen && (
                        <motion.div
                          initial={reduced ? false : { opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={
                            reduced
                              ? { opacity: 0, transition: { duration: 0.1 } }
                              : { opacity: 0, height: 0 }
                          }
                          transition={{ duration: DUR.micro, ease: EASE }}
                          style={{ overflow: "hidden" }}
                        >
                          <div className={styles.guidePanel}>
                            <p className="oa-sub" style={{ margin: 0 }}>
                              {block.guidance}
                            </p>
                            <div className={styles.exampleChips}>
                              <span className="oa-micro">Examples</span>
                              {block.examples.map((ex) => (
                                <span key={ex} className={`oa-chip ${styles.exampleChip}`}>
                                  {ex}
                                </span>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <VoiceAnswer
                    answer={block.demoValue}
                    confirmLabel="Save and continue"
                    onConfirm={(text) => {
                      setCanvasValue(block.id, text);
                      setPhase("improve");
                    }}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="improve"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ display: "grid", gap: 16 }}
                >
                  <div className={styles.improveHead}>
                    <span className={styles.improveIcon} aria-hidden>
                      <PenLine size={16} />
                    </span>
                    <div style={{ display: "grid", gap: 3 }}>
                      <h3 className="oa-h3">Improve wording with AI</h3>
                      <p className="oa-sub">
                        Compare and choose. Your saved answer is never replaced
                        unless you pick it.
                      </p>
                    </div>
                  </div>

                  <div className={styles.improveGrid}>
                    <div className={styles.improvePanel}>
                      <span className="oa-micro">Before: your answer</span>
                      <p>{values[block.id]}</p>
                    </div>
                    <div className={`${styles.improvePanel} ${styles.improvePanelSuggested}`}>
                      <div className="oa-between">
                        <span className="oa-micro oa-blue-text">Suggested</span>
                        <span className="oa-sim-note">Prepared demo suggestion</span>
                      </div>
                      {editingSuggestion ? (
                        <textarea
                          className="oa-textarea"
                          rows={5}
                          value={suggestionDraft}
                          onChange={(e) => setSuggestionDraft(e.target.value)}
                          aria-label="Edit the suggested wording"
                          autoFocus
                        />
                      ) : (
                        <p>{block.improvedValue}</p>
                      )}
                    </div>
                  </div>

                  <div className="oa-cluster" style={{ justifyContent: "flex-end" }}>
                    <button type="button" className="oa-btn oa-btn--ghost" onClick={advance}>
                      Keep my wording
                    </button>
                    {editingSuggestion ? (
                      <>
                        <button
                          type="button"
                          className="oa-btn oa-btn--ghost"
                          onClick={() => setEditingSuggestion(false)}
                        >
                          Cancel edit
                        </button>
                        <button
                          type="button"
                          className="oa-btn oa-btn--primary"
                          disabled={!suggestionDraft.trim()}
                          onClick={() => {
                            setCanvasValue(block.id, suggestionDraft.trim());
                            advance();
                          }}
                        >
                          <Check size={15} aria-hidden />
                          Save edited version
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="oa-btn oa-btn--ghost"
                          onClick={() => {
                            setSuggestionDraft(block.improvedValue);
                            setEditingSuggestion(true);
                          }}
                        >
                          <Pencil size={13} aria-hidden />
                          Edit suggestion
                        </button>
                        <button
                          type="button"
                          className="oa-btn oa-btn--primary"
                          onClick={() => {
                            setCanvasValue(block.id, block.improvedValue);
                            advance();
                          }}
                        >
                          <Check size={15} aria-hidden />
                          Use suggested wording
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        </AnimatePresence>
      </div>
    </div>
  );
}
