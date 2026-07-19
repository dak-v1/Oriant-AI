import { NextResponse } from "next/server";
import { mutate, statePayload } from "@/lib/server/api";
import { tickBuilds } from "@/lib/server/builder";
import { withDb } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** Full state read. Also advances/polls any running build jobs. */
export async function GET() {
  const payload = await withDb(async (db) => {
    await tickBuilds(db);
    return statePayload(db);
  });
  return NextResponse.json(payload);
}

export async function POST() {
  // POST /api/state is an explicit no-op sync (used after client-only steps)
  return mutate(() => {});
}
