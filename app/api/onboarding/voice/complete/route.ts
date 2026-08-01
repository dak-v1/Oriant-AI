import { mutate } from "@/lib/server/api";
import { completeVoiceCall } from "@/lib/server/onboarding";
import {
  hydrateOnboardingFromSupabase,
  mirrorOnboardingToSupabase,
} from "@/lib/server/onboarding-supabase";

/** Mark the single-call discovery experience complete and unlock review. */
export async function POST() {
  return mutate(async (db) => {
    await hydrateOnboardingFromSupabase(db);
    completeVoiceCall(db);
    await mirrorOnboardingToSupabase(db);
  });
}
