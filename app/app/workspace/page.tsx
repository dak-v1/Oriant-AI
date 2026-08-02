/**
 * /app/workspace — the owner's daily operating overview.
 *
 * ONE ROUTE, TWO LANES, ONE EXPLICIT SWITCH. This screen exists twice. The
 * scripted demo lane (`components/mock/workspace/*`, driven by `useDemoStore`
 * and the autopilot script) is what an audience sees, and ROLE_C_PLAN is
 * explicit that the fixture path keeps working permanently — it is the fallback,
 * the test harness, and what carries the demo if another lane slips. The live
 * lane (`components/live/workspace/*`) reads the real agent runtime. Neither is
 * a staging post for the other, so neither may break the other, and the route
 * picks between them rather than one growing conditionals inside it.
 *
 * The choice itself, and the reasoning for refusing rather than defaulting on an
 * unrecognised value, lives in `components/live/workspace/lane.ts` — the same
 * rule `/app/workspace/approvals` applies through
 * `components/live/approvals/lane.ts`, so `?live=1` means one thing across the
 * whole Operate surface. `ORIANT_WORKSPACE_LANE` is read on the SERVER and
 * carries no `NEXT_PUBLIC_` prefix, deliberately: `.env.example` states that no
 * variable in this project may carry that prefix, because it inlines the value
 * into the browser bundle.
 *
 * WHY THIS PAGE IS A SERVER COMPONENT. The live lane needs two things a client
 * cannot get for itself: the lane setting (an environment variable), and the
 * `ApprovedPlan`'s business outcomes, which no /api/runtime endpoint carries
 * because no runtime table holds them. Both are free here — the plan is already
 * in `getRuntimeSession()` — so both are resolved once, on the server, and
 * handed down as plain JSON. The alternative, a client component reading
 * `?live` with `useSearchParams` and fetching a new plan endpoint, would need a
 * Suspense boundary, a new route, and a second definition of the plan's shape on
 * the wire.
 *
 * `force-dynamic` is not decoration. Without it a production build may try to
 * prerender this route, which on the live lane would construct the runtime
 * session — and its file-backed stores — at build time.
 */
import Link from "next/link";
import LiveWorkspace from "@/components/live/workspace/LiveWorkspace";
import { OPERATE_LANE_ENV, RUNTIME_MODE_ENV } from "@/components/live/lane";
import { WORKSPACE_LANE_ENV, resolveWorkspaceLane } from "@/components/live/workspace/lane";
import type { WorkspaceLane } from "@/components/live/workspace/lane";
import { planFacts } from "@/components/live/workspace/plan-facts";
import WorkspaceOverview from "@/components/mock/workspace/WorkspaceOverview";
import { getRuntimeSession } from "@/lib/runtime/session";

export const dynamic = "force-dynamic";

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const lane = resolveWorkspaceLane({
    live: params.live,
    env: process.env[WORKSPACE_LANE_ENV],
    operateEnv: process.env[OPERATE_LANE_ENV],
    runtimeModeEnv: process.env[RUNTIME_MODE_ENV],
  });

  if (lane.lane === "refused") return <LaneRefused lane={lane} />;
  if (lane.lane === "demo") return <WorkspaceOverview />;

  // Reached only on the live lane, so a demo render never constructs a runtime
  // session or touches the file-backed stores.
  const session = getRuntimeSession();
  // The CURRENT plan, not `seedPlan`. This screen is the roster an owner reads,
  // and the construction seed is always BrightPath — rendering it here is the
  // precise "showing the demo as though it were theirs" substitution that
  // lib/runtime/current-plan.ts exists to remove.
  const plan = await session.currentPlan();
  return <LiveWorkspace plan={planFacts(plan)} live />;
}

/**
 * The screen for a lane setting this build does not implement.
 *
 * It renders instead of a Workspace rather than above one, because both
 * available answers would be a guess about which screen the caller meant, and
 * one of those guesses puts scripted numbers in front of somebody who asked for
 * live ones. Both lanes are offered as links, so recovering costs one click and
 * nobody has to know the spelling.
 */
function LaneRefused({ lane }: { lane: Extract<WorkspaceLane, { lane: "refused" }> }) {
  return (
    <main className="oa-page oa-page--narrow">
      <div className="oa-card oa-stack" role="alert">
        <p className="oa-eyebrow">Operate · Workspace</p>
        <h1 className="oa-h2">That is not a workspace this app has</h1>
        <p className="oa-lead">
          This address asked for{" "}
          <strong>{lane.value === "" ? "(blank)" : lane.value}</strong>, and what is
          accepted is {lane.accepted}. Nothing was chosen for you: showing the
          sample workspace to someone who asked for their own would put made-up
          numbers where real ones were requested.
        </p>
        <div className="oa-cluster">
          <Link href="/app/workspace?live=1" className="oa-btn oa-btn--primary oa-btn--sm">
            Open your workspace
          </Link>
          <Link href="/app/workspace?live=0" className="oa-btn oa-btn--ghost oa-btn--sm">
            Open the sample workspace
          </Link>
        </div>
      </div>
    </main>
  );
}
