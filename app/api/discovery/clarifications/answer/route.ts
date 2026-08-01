import type { NextRequest } from "next/server";
import { mutate } from "@/lib/server/api";
import { hydrateDiscoveryFromSupabase, hydrateOnboardingFromSupabase, mirrorOnboardingToSupabase } from "@/lib/server/onboarding-supabase";
import { nowIso } from "@/lib/server/store";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { questionId?: string; answer?: string };
  return mutate(async (db) => {
    await hydrateOnboardingFromSupabase(db);
    await hydrateDiscoveryFromSupabase(db);
    const questionId = body.questionId?.trim();
    const answer = typeof body.answer === "string" ? body.answer.trim() : "";
    if (!questionId) return;
    const answers = { ...(db.call.clarificationAnswers ?? {}) };
    if (answer) answers[questionId] = answer;
    else delete answers[questionId];
    db.call.clarificationAnswers = answers;
    const required = db.call.clarificationQuestions ?? [];
    if (required.length > 0 && required.every((question) => answers[question.id]?.trim())) {
      db.call.clarificationCompletedAt = nowIso();
    } else if (required.length === 0) {
      db.call.clarificationCompletedAt = nowIso();
    } else {
      db.call.clarificationCompletedAt = undefined;
    }
    await mirrorOnboardingToSupabase(db);
  });
}
