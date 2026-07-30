import type { NextRequest } from "next/server";
import { mutate } from "@/lib/server/api";
import { mirrorOnboardingToSupabase } from "@/lib/server/onboarding-supabase";
import { approveBusinessBlueprint, createRoleBHandoff, generateBusinessBlueprint } from "@/lib/server/onboarding";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: "generate" | "approve" | "handoff";
  };
  return mutate((db) => {
    if (body.action === "approve") {
      approveBusinessBlueprint(db);
      return mirrorOnboardingToSupabase(db).then(() => {});
    }
    if (body.action === "handoff") {
      createRoleBHandoff(db);
      return mirrorOnboardingToSupabase(db).then(() => {});
    }
    generateBusinessBlueprint(db);
    return mirrorOnboardingToSupabase(db).then(() => {});
  });
}
