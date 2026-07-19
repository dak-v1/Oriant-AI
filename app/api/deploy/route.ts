import { mutate } from "@/lib/server/api";
import { activate } from "@/lib/server/orchestrator";

/** Activate the team — only after validation passed and the owner says go. */
export async function POST() {
  return mutate((db) => activate(db));
}
