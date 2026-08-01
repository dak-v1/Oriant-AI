import { mutate } from "@/lib/server/api";
import { buildDiscoveryHandoff } from "@/lib/server/discovery-handoff";
import { approveReport } from "@/lib/server/orchestrator";
import {
  hydrateDiscoveryFromSupabase,
  hydrateOnboardingFromSupabase,
  mirrorDiscoveryHandoffToSupabase,
  mirrorOnboardingToSupabase,
} from "@/lib/server/onboarding-supabase";

/** Approve & lock this version of the brief as the only planning input. */
export async function POST() {
  return mutate(async (db) => {
    await hydrateOnboardingFromSupabase(db);
    await hydrateDiscoveryFromSupabase(db);
    approveReport(db);
    await mirrorOnboardingToSupabase(db);
    await mirrorDiscoveryHandoffToSupabase(db, buildDiscoveryHandoff(db));
  });
}
