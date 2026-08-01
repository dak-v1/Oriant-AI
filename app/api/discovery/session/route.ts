import { NextResponse } from "next/server";
import { withDb } from "@/lib/server/store";
import {
  hydrateDiscoveryFromSupabase,
  hydrateOnboardingFromSupabase,
} from "@/lib/server/onboarding-supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await withDb(async (db) => {
    await hydrateOnboardingFromSupabase(db);
    await hydrateDiscoveryFromSupabase(db);
    return {
      answers: db.call.answers,
      clarificationQuestions: db.call.clarificationQuestions ?? [],
      clarificationAnswers: db.call.clarificationAnswers ?? {},
      clarificationCompletedAt: db.call.clarificationCompletedAt ?? null,
      report: db.report,
      completedAt: db.call.completedAt ?? null,
    };
  });
  return NextResponse.json(payload);
}
