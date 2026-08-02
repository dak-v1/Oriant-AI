"use client";

import { LoaderCircle, Mic, Square } from "lucide-react";
import { useBrowserSpeechCapture } from "./useBrowserSpeechCapture";

export default function VoiceFieldButton({
  label = "Answer with voice",
  onTranscript,
}: {
  label?: string;
  onTranscript: (transcript: string) => void | Promise<void>;
}) {
  const { supported, listening, processing, transcript, error, start, stop, reset } = useBrowserSpeechCapture({
    onFinalTranscript: async (next) => {
      if (next.trim()) await onTranscript(next.trim());
    },
  });

  return (
    <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
      <button
        type="button"
        className={listening ? "oa-btn oa-btn--soft oa-btn--sm" : "oa-btn oa-btn--ghost oa-btn--sm"}
        onClick={() => {
          if (listening) stop();
          else {
            reset();
            start();
          }
        }}
        disabled={!supported}
        aria-label={listening ? "Stop voice capture" : label}
        style={{ minHeight: 40, paddingInline: 14, borderRadius: 14 }}
      >
        {listening || processing ? (
          <>
            <Square size={13} aria-hidden />
            {processing ? "Transcribing…" : "Stop voice"}
          </>
        ) : (
          <>
            <Mic size={13} aria-hidden />
            {label}
          </>
        )}
      </button>

      {(listening || processing) && (
        <span className="oa-sub" aria-live="polite">
          <LoaderCircle size={12} aria-hidden className="oa-spin" style={{ verticalAlign: -2, marginRight: 6 }} />
          {processing ? "Transcribing" : "Listening"}{transcript ? `: “${transcript}”` : "…"}
        </span>
      )}

      {!supported && <span className="oa-sub">Voice capture is unavailable in this browser.</span>}
      {error && <span className="oa-sub" style={{ color: "var(--oa-red-ink)" }}>{error}</span>}
    </div>
  );
}
