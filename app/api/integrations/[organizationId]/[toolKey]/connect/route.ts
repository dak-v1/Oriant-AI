import { NextResponse } from "next/server";
import { withPlannerErrors } from "@/lib/server/planner/http";
import { PlannerError } from "@/lib/server/planner/errors";
import { integrationConnections } from "@/lib/server/planner/db";
import { COMPOSIO_TOOL_KEYS, initiateConnection } from "@/lib/server/planner/providers/composio";

/** Start a Composio connection for one org + tool, returning the OAuth redirect URL. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ organizationId: string; toolKey: string }> }
) {
  return withPlannerErrors(async () => {
    const { organizationId, toolKey } = await params;

    if (!COMPOSIO_TOOL_KEYS.has(toolKey)) {
      throw new PlannerError(400, `"${toolKey}" is not a Composio-routed tool in this step.`);
    }

    const existingRows = await integrationConnections.listByOrg(organizationId);
    const existing = existingRows.find((r) => r.tool_key === toolKey);

    const row = existing
      ? await integrationConnections.update(existing.id, { provider: "composio", status: "pending" })
      : await integrationConnections.create({
          organization_id: organizationId,
          tool_key: toolKey,
          provider: "composio",
          status: "pending",
        });

    const result = await initiateConnection(organizationId, toolKey);
    if (result.mode === "fixture" || !result.data) {
      throw new PlannerError(503, result.error ?? "Could not initiate the Composio connection.");
    }

    await integrationConnections.update(row.id, {
      external_connection_id: result.data.externalConnectionId,
    });

    return NextResponse.json({ redirectUrl: result.data.redirectUrl });
  });
}
