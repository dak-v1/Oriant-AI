import type { NextRequest } from "next/server";
import { mutate } from "@/lib/server/api";
import { editReport } from "@/lib/server/orchestrator";

/** Edit the brief. Editing an approved report re-opens it and marks the plan stale. */
export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as { exec?: string; constraints?: string[] };
  return mutate((db) => editReport(db, body));
}
