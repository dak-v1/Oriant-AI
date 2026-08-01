import { NextResponse } from "next/server";
import { mutate, statePayload } from "@/lib/server/api";
import { tickBuilds } from "@/lib/server/builder";
import { withDb } from "@/lib/server/store";
import { hydrateDiscoveryFromSupabase, hydrateOnboardingFromSupabase } from "@/lib/server/onboarding-supabase";
import { SupabaseConfigurationError } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/** Full state read. Also advances/polls any running build jobs. */
export async function GET() {
  try {
    const payload = await withDb(async (db) => {
      await hydrateOnboardingFromSupabase(db);
      await hydrateDiscoveryFromSupabase(db);
      await tickBuilds(db);
      return statePayload(db);
    });
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof SupabaseConfigurationError) {
      return NextResponse.json({ code: err.code, error: err.message }, { status: 503 });
    }
    return NextResponse.json({ code: "SUPABASE_UNAVAILABLE", error: "Supabase connection failed." }, { status: 503 });
  }
}

export async function POST() {
  // POST /api/state is an explicit no-op sync (used after client-only steps)
  return mutate(() => {});
}
