import type { NextRequest } from "next/server";
import { mutate } from "@/lib/server/api";
import { generateReport } from "@/lib/server/discovery";
import { GateError, audit } from "@/lib/server/orchestrator";
import {
  hydrateDiscoveryFromSupabase,
  hydrateOnboardingFromSupabase,
  mirrorOnboardingToSupabase,
} from "@/lib/server/onboarding-supabase";
import { nowIso } from "@/lib/server/store";

/**
 * The kickoff call finished — persist the owner's confirmed answers and run
 * Discovery to draft the CompanyReport from the live AI& provider.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    answers?: Record<string, string>;
    goals?: Record<string, boolean>;
    systems?: Record<string, boolean>;
    canvasUploaded?: boolean;
  };
  return mutate(async (db) => {
    await hydrateOnboardingFromSupabase(db);
    await hydrateDiscoveryFromSupabase(db);

    if (db.report?.status === "approved") {
      // an approved brief is the locked source of truth — replaying the call
      // must not silently replace it (§4.3); edit it on the report screen
      throw new GateError("The brief is already approved. Edit it on the report screen instead.");
    }
    db.call.answers = { ...db.call.answers, ...(body.answers ?? {}) };
    if (body.goals) db.call.goals = body.goals;
    if (body.systems) db.call.systems = body.systems;
    if (body.canvasUploaded !== undefined) db.call.canvasUploaded = body.canvasUploaded;
    db.call.completedAt = nowIso();
    audit(db, "call.completed", "Kickoff call", `${Object.keys(db.call.answers).length} answers`);
    await generateReport(db);
    await mirrorOnboardingToSupabase(db);
  });
}
