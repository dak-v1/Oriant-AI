import { NextResponse, type NextRequest } from "next/server";
import { withDb } from "@/lib/server/store";
import { hydrateOnboardingFromSupabase } from "@/lib/server/onboarding-supabase";
import {
  generateTailoredQuestion,
  type TailoredQuestionTarget,
} from "@/lib/server/onboarding-discovery-agent";

export const dynamic = "force-dynamic";

function isTarget(value: string): value is TailoredQuestionTarget {
  return [
    "business_area",
    "repetitive_task",
    "current_workflow",
    "selected_tools",
  ].includes(value);
}

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("target");
  if (!target || !isTarget(target)) {
    return NextResponse.json({ error: "Invalid discovery-agent target." }, { status: 400 });
  }

  const payload = await withDb(async (db) => {
    await hydrateOnboardingFromSupabase(db);
    return generateTailoredQuestion(db, target);
  });

  return NextResponse.json(payload);
}
