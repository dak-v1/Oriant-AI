import { mutate } from "@/lib/server/api";
import { undoPlan } from "@/lib/server/orchestrator";

/** Undo returns to the previous plan version (blueprint §13.5). */
export async function POST() {
  return mutate((db) => undoPlan(db));
}
