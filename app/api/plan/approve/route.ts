import { mutate } from "@/lib/server/api";
import { approvePlan } from "@/lib/server/orchestrator";

/** Confirm Workflow — blocked until every selected agent is ready (F-10). */
export async function POST() {
  return mutate((db) => approvePlan(db));
}
