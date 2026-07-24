"use client";
/**
 * VoiceAnswer — the signature voice-first capture interaction (spec §9.1):
 *
 *   idle → [Start speaking] → listening (waveform + timer)
 *        → transcript reveals word-by-word → editable → [Confirm]
 *
 * Voice-first, never voice-only: a typed fallback is always present, no
 * microphone permission is ever requested, and under reduced motion the
 * transcript appears instantly. Used by onboarding, the guided Lean Canvas,
 * the discovery interview and the custom-agent design cycle.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Keyboard, Mic, Pencil, RotateCcw, Square } from "lucide-react";
import { mockVoiceService } from "@/lib/mock/services";
import { DUR, EASE } from "@/lib/mock/motion";
import Waveform from "./Waveform";

type Stage = "idle" | "listening" | "revealing" | "editable" | "typing";

export default function VoiceAnswer({
  answer,
  onConfirm,
  confirmLabel = "Confirm answer",
  placeholder = "Or type your answer instead…",
  autoFocusMic = false,
}: {
  /** The hardcoded transcript revealed by the simulated voice capture. */
  answer: string;
  onConfirm: (finalText: string) => void;
  confirmLabel?: string;
  placeholder?: string;
  autoFocusMic?: boolean;
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [words, setWords] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const cancelRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reduced = useReducedMotion();

  /* Reset whenever the question (answer fixture) changes. */
  useEffect(() => {
    cancelRef.current?.();
    stopTimer();
    setStage("idle");
    setWords([]);
    setText("");
    setElapsed(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer]);

  useEffect(() => () => {
    cancelRef.current?.();
    stopTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const start = () => {
    setStage("listening");
    setWords([]);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

    const handle = mockVoiceService.startAnswer(
      answer,
      (e) => {
        if (e.type === "word") {
          setStage("revealing");
          setWords((prev) => [...prev, e.word]);
        } else if (e.type === "done") {
          stopTimer();
          setText(answer);
          setStage("editable");
        }
      },
      { instant: Boolean(reduced) },
    );
    cancelRef.current = handle.cancel;
    if (reduced) {
      stopTimer();
      setText(answer);
      setStage("editable");
    }
  };

  const stopEarly = () => {
    cancelRef.current?.();
    stopTimer();
    setText(words.length ? words.join(" ") : answer);
    setStage("editable");
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(1, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <AnimatePresence mode="wait" initial={false}>
        {stage === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ display: "grid", gap: 12, justifyItems: "center", padding: "10px 0" }}
          >
            <button
              type="button"
              className="oa-btn oa-btn--primary oa-btn--lg"
              onClick={start}
              autoFocus={autoFocusMic}
            >
              <Mic size={17} aria-hidden />
              Start speaking
            </button>
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--sm"
              onClick={() => {
                setText("");
                setStage("typing");
              }}
            >
              <Keyboard size={13} aria-hidden />
              Prefer to type? Answer with text
            </button>
            <p className="oa-sub" style={{ textAlign: "center", maxWidth: 420 }}>
              Simulated voice capture; this demo never accesses your microphone.
            </p>
          </motion.div>
        )}

        {(stage === "listening" || stage === "revealing") && (
          <motion.div
            key="listening"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.card, ease: EASE }}
            className="oa-card oa-card--flat"
            style={{ padding: "18px 20px", display: "grid", gap: 14 }}
          >
            <div className="oa-between">
              <span
                className="oa-status oa-status--active"
                style={{ animation: reduced ? undefined : "oa-pulse-soft 1.4s ease-in-out infinite" }}
              >
                {stage === "listening" ? "Listening" : "Transcribing"}
              </span>
              <span className="oa-micro" aria-live="off">
                {mm}:{ss}
              </span>
            </div>
            <Waveform active={stage === "listening"} height={40} bars={21} />
            <p aria-live="polite" style={{ margin: 0, fontSize: 15.5, lineHeight: 1.6, minHeight: 26 }}>
              {words.map((w, i) => (
                <motion.span
                  key={`${i}-${w}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.18 }}
                >
                  {w}{" "}
                </motion.span>
              ))}
              {stage === "listening" && (
                <span className="oa-sub" style={{ fontStyle: "italic" }}>
                  Speak naturally. Oriant is listening…
                </span>
              )}
            </p>
            <div>
              <button type="button" className="oa-btn oa-btn--ghost oa-btn--sm" onClick={stopEarly}>
                <Square size={12} aria-hidden />
                Stop
              </button>
            </div>
          </motion.div>
        )}

        {(stage === "editable" || stage === "typing") && (
          <motion.div
            key="edit"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.card, ease: EASE }}
            style={{ display: "grid", gap: 10 }}
          >
            <div className="oa-between">
              <span className="oa-micro">
                <Pencil size={11} aria-hidden style={{ verticalAlign: -1, marginRight: 5 }} />
                {stage === "typing" ? "Type your answer" : "Review and edit before saving"}
              </span>
              {stage === "editable" && (
                <button type="button" className="oa-btn oa-btn--ghost oa-btn--sm" onClick={start}>
                  <RotateCcw size={12} aria-hidden />
                  Re-record
                </button>
              )}
            </div>
            <textarea
              className="oa-textarea"
              value={text}
              placeholder={placeholder}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              aria-label="Your answer"
            />
            <div className="oa-cluster" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="oa-btn oa-btn--primary"
                disabled={!text.trim()}
                onClick={() => onConfirm(text.trim())}
              >
                <Check size={15} aria-hidden />
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
