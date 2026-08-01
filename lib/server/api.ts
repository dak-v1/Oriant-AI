/**
 * Shared API plumbing. Every mutating route runs inside the store lock and
 * returns the full client state, so the browser store can simply replace.
 */
import { NextResponse } from "next/server";
import type { Db } from "../contracts";
import { GateError } from "./orchestrator";
import { withDb } from "./store";
import { providerStatus } from "./providers/env";
import { assertSupabaseConfigured, SupabaseConfigurationError } from "./supabase";

export interface StatePayload {
  state: Db;
  providers: ReturnType<typeof providerStatus>;
}

export function statePayload(db: Db): StatePayload {
  return { state: db, providers: providerStatus() };
}

/** Run a mutation against the db and answer with the fresh full state. */
export async function mutate(fn: (db: Db) => Promise<void> | void): Promise<NextResponse> {
  try {
    assertSupabaseConfigured();
    const payload = await withDb(async (db) => {
      await fn(db);
      return statePayload(db);
    });
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof SupabaseConfigurationError) {
      return NextResponse.json({ code: err.code, error: err.message }, { status: 503 });
    }
    if (err instanceof GateError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[margo]", err);
    return NextResponse.json({ error: "Something went wrong on the server." }, { status: 500 });
  }
}
