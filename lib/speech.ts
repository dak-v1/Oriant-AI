"use client";
/**
 * Margo's voice — browser speech synthesis (Web Speech API).
 *
 * No provider or API key involved: this runs entirely in the browser, so the
 * call feels like a call even with every sponsor key unset. Per blueprint §8.5
 * it is optional, never auto-plays without a user action (entering the call is
 * the gesture), and can be switched off from the call controls at any time.
 */

let voicePreference = true;

/** Voices Margo sounds right in, best first — matched loosely by name. */
const PREFERRED = [
  "google uk english female",
  "microsoft sonia",
  "microsoft aria",
  "samantha",
  "google us english",
  "microsoft zira",
  "karen",
  "moira",
];

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Runtime-only preference. Persistent product data belongs in Supabase. */
export function loadVoicePref(): boolean {
  return voicePreference;
}

export function saveVoicePref(on: boolean): void {
  voicePreference = on;
}

let cachedVoice: SpeechSynthesisVoice | null = null;
let activeAudio: HTMLAudioElement | null = null;
let activeAudioUrl: string | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  if (!speechSupported()) return null;
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null; // not loaded yet; caller retries
  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  const pool = english.length ? english : voices;
  for (const want of PREFERRED) {
    const hit = pool.find((v) => v.name.toLowerCase().includes(want));
    if (hit) { cachedVoice = hit; return hit; }
  }
  // otherwise prefer a local (higher quality, no network) English voice
  cachedVoice = pool.find((v) => v.localService) ?? pool[0] ?? null;
  return cachedVoice;
}

/** Warm the voice list — Chrome populates it asynchronously. */
export function primeVoices(): void {
  if (!speechSupported()) return;
  pickVoice();
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    cachedVoice = null;
    pickVoice();
  }, { once: true });
}

export function cancelSpeech(): void {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }
  if (activeAudioUrl) {
    URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = null;
  }
  if (!speechSupported()) return;
  try { window.speechSynthesis.cancel(); } catch { /* nothing to cancel */ }
}

/** Prefer ElevenLabs when configured, with browser speech as a safe fallback. */
export async function speakAgent(text: string, onEnd?: () => void): Promise<void> {
  if (!text.trim()) return;
  cancelSpeech();
  try {
    const response = await fetch("/api/voice/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error("ElevenLabs unavailable");
    const blob = await response.blob();
    activeAudioUrl = URL.createObjectURL(blob);
    activeAudio = new Audio(activeAudioUrl);
    activeAudio.onended = () => {
      if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl);
      activeAudio = null;
      activeAudioUrl = null;
      onEnd?.();
    };
    await activeAudio.play();
  } catch {
    speak(text, onEnd);
  }
}

/**
 * Speak one line as Margo. Cancels anything already in flight so questions
 * never overlap when the user skips ahead.
 */
export function speak(text: string, onEnd?: () => void): void {
  if (!speechSupported() || !text.trim()) return;
  cancelSpeech();
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) { u.voice = voice; u.lang = voice.lang; }
  u.rate = 1.02;   // conversational, not clipped
  u.pitch = 1.0;
  u.volume = 1.0;
  if (onEnd) u.onend = () => onEnd();
  try {
    window.speechSynthesis.speak(u);
  } catch {
    /* speech unavailable — the caption still carries the question */
  }
}
