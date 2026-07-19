/**
 * Nosana adapter — GPU-hosted Whisper speech recognition (blueprint §20.3).
 *
 * NOSANA_WHISPER_URL is the service URL of a deployed Whisper workload
 * (an output of deploying Nosana's official Whisper job — not a model name).
 * The adapter posts recorded interview audio and returns the transcript.
 *
 * Typed input always remains a complete fallback (blueprint F-03): when the
 * workload is unconfigured or unreachable this returns ok:false and the UI
 * keeps the typed path.
 */
import { nosanaLive, providerEnv } from "./env";

export interface TranscribeResult {
  ok: boolean;
  mode: "live" | "fixture";
  text?: string;
  error?: string;
}

export async function transcribe(audio: Blob): Promise<TranscribeResult> {
  if (!nosanaLive()) {
    return { ok: false, mode: "fixture", error: "NOSANA_WHISPER_URL is not configured" };
  }
  const env = providerEnv().nosana;
  const base = env.whisperUrl!.replace(/\/$/, "");
  // Whisper servers commonly expose an OpenAI-compatible transcription route;
  // try the exact URL first, then the conventional path.
  const endpoints = [base, `${base}/v1/audio/transcriptions`];
  // Error strings reach the browser and the provider trace — never include the
  // endpoint URL (server-side configuration) in them; log details server-side.
  let lastErr = "";
  for (const [i, url] of endpoints.entries()) {
    try {
      const form = new FormData();
      form.append("file", audio, "answer.webm");
      form.append("model", "whisper-1");
      const res = await fetch(url, {
        method: "POST",
        headers: env.key ? { Authorization: `Bearer ${env.key}` } : undefined,
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        console.error(`[margo] nosana endpoint #${i + 1} returned ${res.status} (${url})`);
        lastErr = `whisper workload returned ${res.status}`;
        continue;
      }
      const body = (await res.json()) as { text?: string; transcription?: string };
      const text = body.text ?? body.transcription;
      if (typeof text === "string") return { ok: true, mode: "live", text };
      lastErr = "whisper workload returned an unexpected response shape";
    } catch (err) {
      console.error(`[margo] nosana endpoint #${i + 1} failed (${url}):`, err);
      lastErr = "whisper workload unreachable";
    }
  }
  return { ok: false, mode: "live", error: lastErr };
}
