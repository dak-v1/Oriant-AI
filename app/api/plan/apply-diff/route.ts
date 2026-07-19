import type { NextRequest } from "next/server";
import { mutate } from "@/lib/server/api";
import { applyDiff } from "@/lib/server/orchestrator";
import type { PlanDiff } from "@/lib/contracts";

/** Apply a reviewed diff. Creates a new plan version (undoable). */
export async function POST(req: NextRequest) {
  const { diff } = (await req.json()) as { diff: PlanDiff };
  return mutate((db) => applyDiff(db, diff));
}
