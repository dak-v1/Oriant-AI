import { NextResponse } from "next/server";
import { withPlannerErrors } from "@/lib/server/planner/http";
import { PlannerError } from "@/lib/server/planner/errors";
import { integrationConnections } from "@/lib/server/planner/db";
import { checkConnectionStatus } from "@/lib/server/planner/providers/composio";
import type { IntegrationConnection } from "@/lib/server/planner/types";

/** Poll target — no completion webhook exists, so the frontend calls this to learn when a connection finishes. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ organizationId: string; toolKey: string }> }
) {
  return withPlannerErrors(async () => {
    const { organizationId, toolKey } = await params;

    const rows = await integrationConnections.listByOrg(organizationId);
    let row = rows.find((r) => r.tool_key === toolKey);
    if (!row) throw new PlannerError(404, "No integration connection found for this org/tool.");

    if (row.status === "pending" && row.external_connection_id) {
      const result = await checkConnectionStatus(row.external_connection_id);
      if (result.mode === "live" && result.data && result.data !== row.status) {
        const patch: Partial<IntegrationConnection> = { status: result.data };
        if (result.data === "connected") patch.connected_at = new Date().toISOString();
        row = await integrationConnections.update(row.id, patch);
      }
      // fixture/null result: leave the stored status untouched rather than
      // overwriting real state with "couldn't tell."
    }

    return NextResponse.json({ status: row.status, externalConnectionId: row.external_connection_id ?? null });
  });
}
