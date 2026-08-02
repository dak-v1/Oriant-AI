import type { NextRequest } from "next/server";
import { mutate } from "@/lib/server/api";
import {
  hydrateOnboardingFromSupabase,
  mirrorOnboardingToSupabase,
} from "@/lib/server/onboarding-supabase";
import { attachVoiceTranscript } from "@/lib/server/onboarding";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    questionId: string;
    transcript: string;
    confirmedAnswer?: string;
    language?: string;
  };
  return mutate(async (db) => {
    await hydrateOnboardingFromSupabase(db);
    attachVoiceTranscript(db, body);
    await mirrorOnboardingToSupabase(db);
  });
}
