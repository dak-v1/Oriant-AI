/**
 * /app/workspace/integrations — one URL, two connections screens, and an
 * explicit switch between them.
 *
 * THE DEFAULT IS THE SCRIPTED DEMO, AND NOTHING HERE CHANGES IT. Visiting this
 * route with no query string renders exactly what it rendered before this file
 * grew a switch: the workspace-flavoured header over
 * `components/mock/integrations/IntegrationsBody` (spec §5, §12).
 * ROLE_C_PLAN's integration checkpoints say the fixture path must keep working
 * permanently — it is the fallback, the test harness and what carries the demo
 * if another lane slips — so it keeps the URL and the live view has to be asked
 * for.
 *
 * OPTING IN, both accepted, the query string winning either way:
 *
 *   /app/workspace/integrations?live=1   the live view over the runtime's
 *                                        integration registry
 *   /app/workspace/integrations?live=0   the scripted screen, even where the
 *                                        environment defaults to live
 *   ORIANT_INTEGRATIONS_LANE=live        make live the default for this
 *                                        deployment
 *
 * Anything the switch cannot read renders a refusal rather than falling back —
 * see `components/live/lane.ts` for why guessing is the one behaviour not
 * available here, and `components/live/integrations/lane.ts` for what it costs
 * on this particular route: the scripted screen reports every tool connected and
 * offers to connect the rest, and none of that reaches the runtime.
 *
 * WHY THE ENVIRONMENT VARIABLE IS NOT `NEXT_PUBLIC_`. This page reads it on the
 * server and passes down a resolved lane, so the value never needs to reach the
 * browser. `docs/RUNTIME_SETUP.md` §3 is emphatic that nothing runtime-shaped
 * gets that prefix.
 *
 * Reading `searchParams` makes this route dynamic, which it effectively already
 * was: both screens are client components that render from a store or a fetch,
 * and neither has anything to prerender. The page itself is a server component
 * so the header below hydrates nothing.
 */
import LaneRefusal from "@/components/live/integrations/LaneRefusal";
import LiveIntegrationsScreen from "@/components/live/integrations/LiveIntegrationsScreen";
import {
  INTEGRATIONS_LANE_ENV,
  resolveIntegrationsLane,
} from "@/components/live/integrations/lane";
import { OPERATE_LANE_ENV, RUNTIME_MODE_ENV } from "@/components/live/lane";
import IntegrationsBody from "@/components/mock/integrations/IntegrationsBody";
// `IntegrationsBody` reads useSearchParams, so it needs a boundary. This
// came from the Role B side of the merge and is kept: without it Next
// refuses the route at build time.
import { Suspense } from "react";

export default async function WorkspaceIntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const lane = resolveIntegrationsLane({
    live: params.live,
    env: process.env[INTEGRATIONS_LANE_ENV],
    operateEnv: process.env[OPERATE_LANE_ENV],
    runtimeModeEnv: process.env[RUNTIME_MODE_ENV],
  });

  if (lane.lane === "refused") {
    return <LaneRefusal value={lane.value} accepted={lane.accepted} />;
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
