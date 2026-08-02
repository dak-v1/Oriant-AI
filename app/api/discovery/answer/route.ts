import type { NextRequest } from "next/server";
import { mutate } from "@/lib/server/api";
import { audit } from "@/lib/server/orchestrator";
import {
  hydrateDiscoveryFromSupabase,
  hydrateOnboardingFromSupabase,
  mirrorOnboardingToSupabase,
} from "@/lib/server/onboarding-supabase";
import { nowIso } from "@/lib/server/store";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    questionId?: string;
    answer?: string;
  };

  return mutate(async (db) => {
    await hydrateOnboardingFromSupabase(db);
    await hydrateDiscoveryFromSupabase(db);

    const questionId = body.questionId?.trim();
    const answer = typeof body.answer === "string" ? body.answer.trim() : undefined;
    if (!questionId || answer === undefined) return;

    if (!answer) {
      const nextAnswers = { ...db.call.answers };
      delete nextAnswers[questionId];
      db.call.answers = nextAnswers;
      audit(db, "discovery.answer_cleared", questionId, "Answer removed");
    } else {
      db.call.answers = { ...db.call.answers, [questionId]: answer };
      audit(db, "discovery.answer_saved", questionId, answer.slice(0, 120));
    }

    const activeId = db.onboarding.activeSessionId;
    if (activeId && db.onboarding.sessions[activeId]) {
      db.onboarding.sessions[activeId].updatedAt = nowIso();
    }

    await mirrorOnboardingToSupabase(db);
  });
}
