import { mutate } from "@/lib/server/api";
import { startBuild } from "@/lib/server/builder";

/** Send the approved plan to the factory — async jobs, one per agent. */
export async function POST() {
  return mutate((db) => startBuild(db));
}
