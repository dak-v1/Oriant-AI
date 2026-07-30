import { NextResponse } from "next/server";
import { withDb } from "@/lib/server/store";
import { hydrateOnboardingFromSupabase } from "@/lib/server/onboarding-supabase";
import { generateDiscoveryInterviewQuestions } from "@/lib/server/discovery-interview-agent";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await withDb(async (db) => {
    await hydrateOnboardingFromSupabase(db);
    return generateDiscoveryInterviewQuestions(db);
  });
  return NextResponse.json(payload);
}
