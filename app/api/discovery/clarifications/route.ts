import { NextResponse } from "next/server";
import { withDb } from "@/lib/server/store";
import { hydrateDiscoveryFromSupabase, hydrateOnboardingFromSupabase, mirrorOnboardingToSupabase } from "@/lib/server/onboarding-supabase";
import { generateDiscoveryClarifications } from "@/lib/server/discovery-clarification-agent";

export const dynamic = "force-dynamic";

export async function POST() {
  const payload = await withDb(async (db) => {
    await hydrateOnboardingFromSupabase(db);
    await hydrateDiscoveryFromSupabase(db);
    const result = await generateDiscoveryClarifications(db);
    db.call.clarificationQuestions = result.questions;
    db.call.clarificationAnswers = db.call.clarificationAnswers ?? {};
    if (result.questions.length === 0) db.call.clarificationCompletedAt = new Date().toISOString();
    await mirrorOnboardingToSupabase(db);
    return result;
  });
  return NextResponse.json(payload);
}
