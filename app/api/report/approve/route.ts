import { mutate } from "@/lib/server/api";
import { approveReport } from "@/lib/server/orchestrator";

/** Approve & lock this version of the brief as the only planning input. */
export async function POST() {
  return mutate((db) => approveReport(db));
}
