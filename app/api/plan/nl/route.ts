import { NextResponse, type NextRequest } from "next/server";
import { withDb } from "@/lib/server/store";
import { proposeDiff } from "@/lib/server/planner";

/**
 * Natural-language reconfiguration — preview only (blueprint §13.4).
 * Returns a proposed diff; nothing changes until the owner applies it.
 */
export async function POST(req: NextRequest) {
  const { instruction } = (await req.json()) as { instruction?: string };
  // empty input is fine — the planner proposes the default recommendation,
  // matching the design's behavior
  const diff = await withDb((db) => proposeDiff(db, instruction ?? ""));
  return NextResponse.json({ diff });
}
