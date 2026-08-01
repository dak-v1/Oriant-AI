import { elevenLabsLive, providerEnv } from "./env";

export async function transcribeWithElevenLabs(audio: Blob): Promise<{ ok: boolean; text?: string; error?: string }> {
  if (!elevenLabsLive()) return { ok: false, error: "ElevenLabs speech-to-text is not configured" };
  const env = providerEnv().elevenlabs;
  const form = new FormData();
  form.append("file", audio, "answer.webm");
  form.append("model_id", "scribe_v2");
  try {
    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": env.key! },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      console.error(`[voice] ElevenLabs speech-to-text returned ${response.status}`);
      return { ok: false, error: "ElevenLabs speech-to-text failed" };
    }
    const body = await response.json() as { text?: string };
    return typeof body.text === "string" && body.text.trim()
      ? { ok: true, text: body.text.trim() }
      : { ok: false, error: "ElevenLabs returned an empty transcript" };
  } catch (error) {
    console.error("[voice] ElevenLabs speech-to-text failed", error);
    return { ok: false, error: "ElevenLabs speech-to-text unreachable" };
  }
}
