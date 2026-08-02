import { NextResponse, type NextRequest } from "next/server";
import { transcribe } from "@/lib/server/providers/nosana";
import { trace } from "@/lib/server/orchestrator";
import { attachVoiceTranscript, logSystem } from "@/lib/server/onboarding";
import { mirrorOnboardingToSupabase } from "@/lib/server/onboarding-supabase";
import { withDb } from "@/lib/server/store";

/**
 * Voice → text via the Nosana-hosted Whisper workload. When the workload is
 * not configured or fails, the client keeps the typed path (F-03) — the
 * transcript the owner confirms on screen is what gets submitted, never audio.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("audio");
  const questionId = form.get("questionId");
  const confirmedAnswer = form.get("confirmedAnswer");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ ok: false, error: "No audio received." }, { status: 400 });
  }
  const result = await transcribe(file);
  await withDb((db) => {
    const transcript = result.ok && typeof result.text === "string" ? result.text : "";
    trace(db, "nosana", "voice_transcription",
      result.ok ? "completed" : "failed", result.mode, result.error);
    logSystem(
      db,
      "voice",
      "voice_transcription",
      result.ok ? "completed" : "failed",
      result.error,
      db.onboarding.activeSessionId ?? undefined,
      typeof questionId === "string" ? questionId : undefined,
    );
    if (result.ok && typeof questionId === "string" && transcript.trim()) {
      attachVoiceTranscript(db, {
        questionId,
        transcript,
        confirmedAnswer: typeof confirmedAnswer === "string" && confirmedAnswer.trim()
          ? confirmedAnswer
          : undefined,
      });
    }
    return mirrorOnboardingToSupabase(db).then(() => {});
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
