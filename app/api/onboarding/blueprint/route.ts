import type { NextRequest } from "next/server";
import { mutate } from "@/lib/server/api";
import {
  hydrateOnboardingFromSupabase,
  mirrorOnboardingToSupabase,
} from "@/lib/server/onboarding-supabase";
import { approveBusinessBlueprint, createRoleBHandoff, generateBusinessBlueprint } from "@/lib/server/onboarding";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: "generate" | "approve" | "handoff";
  };
  return mutate(async (db) => {
    await hydrateOnboardingFromSupabase(db);
    if (body.action === "approve") {
      approveBusinessBlueprint(db);
      await mirrorOnboardingToSupabase(db);
      return;
    }
    if (body.action === "handoff") {
      createRoleBHandoff(db);
      await mirrorOnboardingToSupabase(db);
      return;
    }
    generateBusinessBlueprint(db);
    await mirrorOnboardingToSupabase(db);
  });
}
