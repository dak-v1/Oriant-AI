import { NextResponse } from "next/server";
import { withDb } from "@/lib/server/store";
import { hydrateOnboardingFromSupabase } from "@/lib/server/onboarding-supabase";
import { ensureOnboardingSession } from "@/lib/server/onboarding";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await withDb(async (db) => {
    await hydrateOnboardingFromSupabase(db);
    const session = ensureOnboardingSession(db);
    return session.handoff?.payload ?? null;
  });
  if (!payload) {
    return NextResponse.json({ error: "No Role B handoff is available yet." }, { status: 404 });
  }
  return NextResponse.json(payload);
}
