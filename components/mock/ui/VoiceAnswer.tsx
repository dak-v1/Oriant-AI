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
import { DUR, EASE } from "@/lib/mock/motion";
import Waveform from "./Waveform";
import { useBrowserSpeechCapture } from "./useBrowserSpeechCapture";

type Stage = "idle" | "listening" | "revealing" | "editable" | "typing";

export default function VoiceAnswer({
  answer,
  initialText = "",
  onConfirm,
  onVoiceConfirm,
  confirmLabel = "Confirm answer",
  placeholder = "Or type your answer instead…",
  autoFocusMic = false,
  variant = "default",
  startMode = "idle",
}: {
  /** The hardcoded transcript revealed by the simulated voice capture. */
  answer: string;
  initialText?: string;
  onConfirm: (finalText: string) => void;
  onVoiceConfirm?: (finalText: string) => void | Promise<void>;
  confirmLabel?: string;
  placeholder?: string;
  autoFocusMic?: boolean;
  variant?: "default" | "embedded";
  startMode?: Stage;
}) {
  const [stage, setStage] = useState<Stage>(startMode);
  const [text, setText] = useState(initialText);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceCaptureRef = useRef(false);
  const reduced = useReducedMotion();
  const {
    supported,
    liveTranscriptSupported,
    listening,
    processing,
    transcript,
    finalTranscript,
    interimTranscript,
    error,
    start: startVoice,
    stop: stopVoice,
    reset: resetVoice,
  } = useBrowserSpeechCapture({});

  /* Reset whenever the question (answer fixture) changes. */
  useEffect(() => {
    stopTimer();
    resetVoice();
    setStage(startMode);
    setText(initialText);
    voiceCaptureRef.current = false;
    setElapsed(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer, initialText, startMode]);

  useEffect(() => () => {
    stopTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if ((stage === "listening" || stage === "revealing") && transcript.trim()) {
      setStage("revealing");
    }
  }, [stage, transcript]);

  useEffect(() => {
    if ((stage === "listening" || stage === "revealing") && transcript !== text) {
      setText(transcript);
    }
  }, [stage, text, transcript]);

  useEffect(() => {
    if (!listening && !processing && (stage === "listening" || stage === "revealing")) {
      stopTimer();
      if (transcript.trim()) {
        setText(transcript.trim());
        setStage("editable");
      } else if (error) {
        setStage("typing");
      } else {
        setStage("idle");
      }
    }
  }, [error, listening, processing, stage, transcript]);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const start = () => {
    if (!supported) {
      setStage("typing");
      return;
    }
    setStage("listening");
    voiceCaptureRef.current = true;
    setElapsed(0);
    resetVoice();
    const started = startVoice();
    if (!started) {
      voiceCaptureRef.current = false;
      setStage("typing");
      return;
    }
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  };

  const stopEarly = () => {
    stopVoice();
    stopTimer();
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(1, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const embedded = variant === "embedded";
  const primaryBtnClass = embedded ? "oa-btn oa-btn--soft" : "oa-btn oa-btn--primary oa-btn--lg";
  const secondaryBtnClass = embedded ? "oa-btn oa-btn--ghost oa-btn--sm" : "oa-btn oa-btn--ghost oa-btn--sm";
  const showComposer = stage !== "idle" || Boolean(text.trim()) || Boolean(error);
  const isVoiceActive = stage === "listening" || stage === "revealing";
  const isEditable = stage === "editable" || stage === "typing";

  return (
    <div
      style={{
        display: "grid",
        gap: 14,
        padding: embedded ? "16px" : 0,
        border: embedded ? "1px solid var(--oa-border)" : undefined,
        borderRadius: embedded ? "18px" : undefined,
        background: embedded ? "var(--oa-bg-alt)" : undefined,
      }}
    >
      <div
        style={{
          display: "grid",
          gap: 12,
          justifyItems: embedded ? "stretch" : "center",
          padding: embedded ? 0 : "10px 0",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            justifyContent: embedded ? "flex-start" : "center",
            alignItems: "center",
            width: "100%",
          }}
        >
          {isVoiceActive ? (
            <button
              type="button"
              className={primaryBtnClass}
              onClick={stopEarly}
              style={embedded ? { minHeight: 44, paddingInline: 16, borderRadius: 14 } : undefined}
            >
              <Square size={14} aria-hidden />
              Stop speaking
            </button>
          ) : (
            <button
              type="button"
              className={primaryBtnClass}
              onClick={start}
              autoFocus={autoFocusMic}
              disabled={!supported}
              style={embedded ? { minHeight: 44, paddingInline: 16, borderRadius: 14 } : undefined}
            >
              <Mic size={17} aria-hidden />
              Start speaking
            </button>
          )}
          <button
            type="button"
            className={secondaryBtnClass}
            onClick={() => {
              if (!showComposer) setText("");
              voiceCaptureRef.current = false;
              setStage("typing");
            }}
            style={embedded ? { minHeight: 44, paddingInline: 16, borderRadius: 14 } : undefined}
          >
            <Keyboard size={13} aria-hidden />
            Prefer to type
          </button>
          {stage === "editable" && (
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--sm"
              onClick={start}
              style={embedded ? { minHeight: 44, paddingInline: 16, borderRadius: 14 } : undefined}
            >
              <RotateCcw size={12} aria-hidden />
              Re-record
            </button>
          )}
        </div>

        <p
          className="oa-sub"
          style={{
            textAlign: embedded ? "left" : "center",
            maxWidth: embedded ? "none" : 420,
            margin: 0,
            width: "100%",
          }}
        >
          {supported
            ? liveTranscriptSupported
              ? "Your browser will ask for microphone access, then transcribe your answer live."
              : "Your browser can record your answer here, then transcribe it after you stop speaking."
            : "Live voice capture is unavailable here, but you can still type your answer."}
        </p>

        <AnimatePresence initial={false}>
          {showComposer ? (
            <motion.div
              key="composer"
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: DUR.card, ease: EASE }}
              style={{
                display: "grid",
                gap: 10,
                width: "100%",
              }}
            >
              <div className="oa-between">
                <span className="oa-micro">
                  {isVoiceActive ? (
                    <>
                      <Mic size={11} aria-hidden style={{ verticalAlign: -1, marginRight: 5 }} />
                      Listening {processing ? "and transcribing" : "live"}
                    </>
                  ) : (
                    <>
                      <Pencil size={11} aria-hidden style={{ verticalAlign: -1, marginRight: 5 }} />
                      {isEditable ? "Review and edit before saving" : "Type your answer"}
                    </>
                  )}
                </span>
                {isVoiceActive ? (
                  <span className="oa-micro" aria-live="off">
                    {mm}:{ss}
                  </span>
                ) : null}
              </div>

              {isVoiceActive ? <Waveform active={stage === "listening"} height={40} bars={21} /> : null}

              <textarea
                className="oa-textarea"
                value={text}
                placeholder={isVoiceActive ? "Start speaking and your words will appear here…" : placeholder}
                onChange={(e) => setText(e.target.value)}
                rows={isVoiceActive ? 4 : 3}
                aria-label={isVoiceActive ? "Live transcript" : "Your answer"}
              />

              <p className="oa-sub" aria-live="polite" style={{ margin: 0 }}>
                {isVoiceActive
                  ? transcript.trim()
                    ? "Oriant is transcribing as you speak. You can also correct the text here before saving."
                    : processing
                      ? "Processing your recording now…"
                      : liveTranscriptSupported
                        ? "Speak naturally. Your transcript will appear here as capture comes in."
                        : "Speak naturally. In this browser, the words will appear after you stop speaking and transcription finishes."
                  : stage === "typing"
                    ? "You can type your answer directly here."
                    : "Review the transcript, make any edits you want, then save it."}
              </p>

              <div className="oa-cluster" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="oa-btn oa-btn--primary"
                  disabled={!text.trim() || isVoiceActive}
                  onClick={() => {
                    const finalText = text.trim();
                    onConfirm(finalText);
                    if (stage === "editable" && voiceCaptureRef.current) void onVoiceConfirm?.(finalText);
                  }}
                >
                  <Check size={15} aria-hidden />
                  {confirmLabel}
                </button>
              </div>

              {isVoiceActive && (finalTranscript || interimTranscript) ? (
                <div
                  aria-live="polite"
                  style={{
                    border: "1px solid var(--oa-border)",
                    borderRadius: 12,
                    padding: "10px 12px",
                    lineHeight: 1.5,
                    background: "var(--oa-bg)",
                  }}
                >
                  <span>{finalTranscript}</span>{finalTranscript && interimTranscript ? " " : null}
                  <span style={{ color: "var(--oa-muted, #8a93a3)" }}>{interimTranscript}</span>
                </div>
              ) : null}

              {error ? <p className="oa-sub" style={{ color: "var(--oa-red-ink)", margin: 0 }}>{error}</p> : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
