/**
 * Shared route plumbing for the Person B planner backend. A style-alike to
 * lib/server/api.ts's mutate() — same shape of idea (wrap a handler, map
 * known errors to status codes) — but zero shared code with it, and no
 * import from orchestrator.ts.
 */
import { NextResponse } from "next/server";
import { PlannerError } from "./errors";

export async function withPlannerErrors(
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (err) {
    if (err instanceof PlannerError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[margo:planner]", err);
    return NextResponse.json({ error: "Something went wrong on the server." }, { status: 500 });
  }
}
