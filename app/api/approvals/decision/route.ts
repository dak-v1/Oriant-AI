import type { NextRequest } from "next/server";
import { mutate } from "@/lib/server/api";
import { decideApproval } from "@/lib/server/orchestrator";

/** Approve or reject a proposed action; the decision is recorded and audited. */
export async function POST(req: NextRequest) {
  const { id, decision, comment } = (await req.json()) as {
    id: string; decision: "approved" | "rejected"; comment?: string;
  };
  return mutate((db) => decideApproval(db, id, decision, comment));
}
