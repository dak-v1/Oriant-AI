import type { NextRequest } from "next/server";
import { mutate } from "@/lib/server/api";
import { attachDiscoveryVoiceTranscript } from "@/lib/server/onboarding";
import {
  hydrateDiscoveryFromSupabase,
  hydrateOnboardingFromSupabase,
  mirrorOnboardingToSupabase,
} from "@/lib/server/onboarding-supabase";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    questionId?: string;
    transcript?: string;
    confirmedAnswer?: string;
    language?: string;
  };

  return mutate(async (db) => {
    await hydrateOnboardingFromSupabase(db);
    await hydrateDiscoveryFromSupabase(db);
    if (!body.questionId?.trim() || !body.transcript?.trim()) return;
    attachDiscoveryVoiceTranscript(db, {
      questionId: body.questionId.trim(),
      transcript: body.transcript.trim(),
      confirmedAnswer: body.confirmedAnswer?.trim() || undefined,
      language: body.language,
    });
    await mirrorOnboardingToSupabase(db);
  });
}
