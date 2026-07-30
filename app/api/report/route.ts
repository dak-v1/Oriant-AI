import type { NextRequest } from "next/server";
import { mutate } from "@/lib/server/api";
import { editReport } from "@/lib/server/orchestrator";
import {
  hydrateDiscoveryFromSupabase,
  hydrateOnboardingFromSupabase,
  mirrorOnboardingToSupabase,
} from "@/lib/server/onboarding-supabase";

/** Edit the brief. Editing an approved report re-opens it and marks the plan stale. */
export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as { exec?: string; constraints?: string[] };
  return mutate(async (db) => {
    await hydrateOnboardingFromSupabase(db);
    await hydrateDiscoveryFromSupabase(db);
    editReport(db, body);
    await mirrorOnboardingToSupabase(db);
  });
}
