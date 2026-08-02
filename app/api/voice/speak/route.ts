import { NextResponse, type NextRequest } from "next/server";
import { elevenLabsLive, providerEnv } from "@/lib/server/providers/env";

export const dynamic = "force-dynamic";

/** Generate Oriant's spoken prompt without exposing the ElevenLabs key. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = body.text?.trim();
  if (!text) return NextResponse.json({ error: "Text is required." }, { status: 400 });
  if (!elevenLabsLive()) {
    return NextResponse.json({ error: "ElevenLabs voice is not configured." }, { status: 503 });
  }

  const env = providerEnv().elevenlabs;
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${env.voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": env.key!,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({ text, model_id: env.model }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    console.error(`[voice] ElevenLabs returned ${response.status}`);
    return NextResponse.json({ error: "ElevenLabs could not generate speech." }, { status: 502 });
  }

  return new NextResponse(await response.arrayBuffer(), {
    headers: {
      "Content-Type": response.headers.get("content-type") || "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
