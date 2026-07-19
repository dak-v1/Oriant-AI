import { NextResponse } from "next/server";
import { statePayload } from "@/lib/server/api";
import { resetDb } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** Start over from a clean session (demo rehearsal — blueprint §25.2). */
export async function POST() {
  const db = await resetDb();
  return NextResponse.json(statePayload(db));
}
