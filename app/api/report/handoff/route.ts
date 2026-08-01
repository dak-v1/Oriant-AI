import { NextResponse } from "next/server";
import { withDb } from "@/lib/server/store";
import { buildDiscoveryHandoff } from "@/lib/server/discovery-handoff";
import {
  hydrateDiscoveryFromSupabase,
  hydrateOnboardingFromSupabase,
} from "@/lib/server/onboarding-supabase";
import { SupabaseConfigurationError } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/** Return the canonical internal handoff generated from the Supabase snapshot. */
export async function GET() {
  try {
    const handoff = await withDb(async (db) => {
      await hydrateOnboardingFromSupabase(db);
      await hydrateDiscoveryFromSupabase(db);
      return buildDiscoveryHandoff(db);
    });
    return NextResponse.json(handoff);
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) {
      return NextResponse.json({ code: error.code, error: error.message }, { status: 503 });
    }
    console.error("[report/handoff]", error);
    return NextResponse.json({ error: "Unable to generate the Supabase-backed handoff." }, { status: 500 });
  }
}
