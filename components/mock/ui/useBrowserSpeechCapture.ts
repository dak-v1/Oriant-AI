"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SpeechError =
  | "not_supported"
  | "not_allowed"
  | "network"
  | "no_speech"
  | "aborted"
  | "audio_capture"
  | "unknown";

interface BrowserSpeechRecognitionAlternative {
  transcript: string;
}

interface BrowserSpeechRecognitionResult {
  isFinal: boolean;
  0: BrowserSpeechRecognitionAlternative;
  length: number;
}

interface BrowserSpeechRecognitionResultList {
  [index: number]: BrowserSpeechRecognitionResult;
  length: number;
}

interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: BrowserSpeechRecognitionResultList;
}

interface BrowserSpeechRecognitionErrorEvent {
  error: string;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface BrowserSpeechRecognitionConstructor {
  new (): BrowserSpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

function errorMessage(error: SpeechError): string {
  switch (error) {
    case "not_supported":
      return "Voice capture is not supported in this browser.";
    case "not_allowed":
      return "Microphone access was blocked. Please allow it and try again.";
    case "network":
      return "Speech recognition hit a network issue. Please try again.";
    case "no_speech":
      return "No speech was detected. Please try again.";
    case "audio_capture":
      return "We couldn't access your microphone audio.";
    case "aborted":
      return "Voice capture was stopped before a transcript was ready.";
    default:
      return "Voice capture failed. Please try again.";
  }
}

function normaliseError(error?: string): SpeechError {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "not_allowed";
    case "network":
      return "network";
    case "no-speech":
      return "no_speech";
    case "audio-capture":
      return "audio_capture";
    case "aborted":
      return "aborted";
    default:
      return "unknown";
  }
}

export function useBrowserSpeechCapture({
  lang = "en-US",
  onFinalTranscript,
}: {
  lang?: string;
  onFinalTranscript?: (transcript: string) => void | Promise<void>;
}) {
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const deliveredRef = useRef<string | null>(null);
  const manualStopRef = useRef(false);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const RecognitionCtor = useMemo<BrowserSpeechRecognitionConstructor | null>(() => {
    if (typeof window === "undefined") return null;
    return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
  }, []);

  const recordingSupported =
    typeof window !== "undefined"
    && typeof navigator !== "undefined"
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== "undefined";

  const supported = RecognitionCtor !== null || recordingSupported;

  const stop = useCallback(() => {
    manualStopRef.current = true;
    recognitionRef.current?.stop();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  const reset = useCallback(() => {
    setTranscript("");
    setFinalTranscript("");
    setInterimTranscript("");
    setError(null);
    deliveredRef.current = null;
  }, []);

  const transcribeRecording = useCallback(async () => {
    const blob = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType || "audio/webm" });
    if (!blob.size) {
      setProcessing(false);
      setListening(false);
      if (!transcript.trim()) setError(errorMessage("no_speech"));
      return;
    }

    setProcessing(true);
    try {
      const form = new FormData();
      form.append("audio", blob, "answer.webm");
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const body = (await res.json()) as { ok: boolean; text?: string; error?: string };
      if (body.ok && typeof body.text === "string" && body.text.trim()) {
        setTranscript(body.text.trim());
        setError(null);
      } else if (!transcript.trim()) {
        setError(body.error || "Voice transcription unavailable. Please try again or type instead.");
      }
    } catch {
      if (!transcript.trim()) {
        setError("Couldn’t transcribe that recording. Please try again or type instead.");
      }
    } finally {
      setProcessing(false);
      setListening(false);
    }
  }, [transcript]);

  const start = useCallback(() => {
    if (!RecognitionCtor && !recordingSupported) {
      setError(errorMessage("not_supported"));
      return false;
    }

    // Flip into a live state immediately so the UI can render the transcript
    // box before the browser finishes mic permission and recorder startup.
    setListening(true);
    setProcessing(false);
    setTranscript("");
    setError(null);
    deliveredRef.current = null;

    const begin = async () => {
      try {
        recognitionRef.current?.abort();
        streamRef.current?.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        streamRef.current = null;
        chunksRef.current = [];
        manualStopRef.current = false;
        setProcessing(false);

        let recognition: BrowserSpeechRecognition | null = null;
        if (RecognitionCtor) {
          recognition = new RecognitionCtor();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = lang;
          recognition.maxAlternatives = 1;

          recognition.onresult = (event) => {
            let finalText = "";
            let interimText = "";
            for (let i = 0; i < event.results.length; i += 1) {
              const text = event.results[i][0]?.transcript ?? "";
              if (event.results[i].isFinal) finalText += text;
              else interimText += text;
            }
            const cleanFinal = finalText.trim();
            const cleanInterim = interimText.trim();
            setFinalTranscript(cleanFinal);
            setInterimTranscript(cleanInterim);
            setTranscript([cleanFinal, cleanInterim].filter(Boolean).join(" "));
          };

          recognition.onerror = (event) => {
            const normalised = normaliseError(event.error);
            if (manualStopRef.current && normalised === "aborted") {
              setError(null);
              return;
            }
            if (!chunksRef.current.length) {
              setListening(false);
            }
            setError(errorMessage(normalised));
          };

          recognition.onend = () => {
            if (!processing && (!recorderRef.current || recorderRef.current.state === "inactive")) {
              manualStopRef.current = false;
              setListening(false);
            }
          };
        }

        if (recordingSupported) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamRef.current = stream;
          const recorder = new MediaRecorder(stream);
          recorderRef.current = recorder;
          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) chunksRef.current.push(event.data);
          };
          recorder.onstop = () => {
            stream.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
            void transcribeRecording();
          };
          recorder.start();
        }

        recognitionRef.current = recognition;
        recognition?.start();
        return true;
      } catch {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setListening(false);
        setProcessing(false);
        setError(errorMessage("unknown"));
        return false;
      }
    };

    void begin();
    return true;
  }, [RecognitionCtor, lang, recordingSupported, processing, transcribeRecording]);

  useEffect(() => {
    const clean = transcript.trim();
    if (!listening && !processing && clean && deliveredRef.current !== clean) {
      deliveredRef.current = clean;
      void onFinalTranscript?.(clean);
    }
  }, [listening, onFinalTranscript, processing, transcript]);

  useEffect(
    () => () => {
      manualStopRef.current = false;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          // ignore teardown stop errors
        }
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
      streamRef.current = null;
    },
    [],
  );

  return {
    supported,
    liveTranscriptSupported: RecognitionCtor !== null,
    listening,
    processing,
    transcript,
    finalTranscript,
    interimTranscript,
    error,
    start,
    stop,
    reset,
  };
}
