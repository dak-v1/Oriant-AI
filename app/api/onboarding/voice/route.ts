import type { NextRequest } from "next/server";
import { mutate } from "@/lib/server/api";
import { mirrorOnboardingToSupabase } from "@/lib/server/onboarding-supabase";
import { attachVoiceTranscript } from "@/lib/server/onboarding";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    questionId: string;
    transcript: string;
    confirmedAnswer?: string;
    language?: string;
  };
  return mutate((db) => {
    attachVoiceTranscript(db, body);
    return mirrorOnboardingToSupabase(db).then(() => {});
  });
}
