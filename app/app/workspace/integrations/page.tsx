"use client";
/**
 * /app/workspace/integrations — the Operate-phase view of the same
 * connections screen (spec §5, §12). Same body component as
 * /app/integrations with a workspace-flavoured header.
 */
import IntegrationsBody from "@/components/mock/integrations/IntegrationsBody";

export default async function WorkspaceIntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const lane = resolveIntegrationsLane({
    live: params.live,
    env: process.env[INTEGRATIONS_LANE_ENV],
  });

  if (lane.lane === "refused") {
    return <LaneRefusal setting={lane.setting} value={lane.value} accepted={lane.accepted} />;
  }

  if (lane.lane === "live") {
    return <LiveIntegrationsScreen />;
  }

  return (
    <main className="oa-page">
      <header className="oa-between" style={{ marginBottom: 24, alignItems: "flex-start" }}>
        <div style={{ display: "grid", gap: 6, maxWidth: 760 }}>
          <p className="oa-eyebrow">Operate · Integrations</p>
          <h1 className="oa-h1">Workspace connections</h1>
          <p className="oa-lead">
            The connections your live agents use day to day. Manage or disconnect any tool at any
            time; your approval rules stay exactly as you set them.
          </p>
        </div>
      </header>
      <Suspense fallback={null}>
        <IntegrationsBody />
      </Suspense>
    </main>
  );
}
