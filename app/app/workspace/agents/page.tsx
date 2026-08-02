/**
 * /app/workspace/agents — the agent roster (spec §17 "Agents" tab).
 *
 * ONE ROUTE, TWO ROSTERS, ONE EXPLICIT SWITCH. This screen exists twice. The
 * scripted lane (`components/mock/workspace/AgentRoster`, driven by
 * `useDemoStore`) is what an audience sees, and ROLE_C_PLAN is explicit that the
 * fixture path keeps working permanently — it is the fallback, the test harness,
 * and what carries the demo if another lane slips. The live lane
 * (`components/live/agents/*`) reads the real agent runtime: `AgentRuntimeRecord`
 * states, registered triggers, runs, approvals, and pause/resume that actually
 * move a workforce. Neither is a staging post for the other, so neither may break
 * the other, and the route picks between them rather than one growing
 * conditionals inside it.
 *
 * The choice itself, and why an unrecognised value is refused rather than quietly
 * resolved to the demo, lives in `components/live/lane.ts` — the same rule
 * `/app/workspace` and `/app/workspace/approvals` apply, so `?live=1` means one
 * thing across the whole Operate surface. The difference matters more here than
 * on most screens: the scripted roster's "Pause agent" only raises a toast, and
 * handing that to somebody who asked in writing for the live one would let them
 * believe they had stopped a workforce that is still sending email.
 *
 *   /app/workspace/agents?live=1     the live, runtime-backed roster
 *   /app/workspace/agents?live=0     the scripted roster, even where the
 *                                    environment defaults to live
 *   ORIANT_AGENTS_LANE=live          make live the default for this deployment
 *
 * WHY THE ENVIRONMENT VARIABLE IS NOT `NEXT_PUBLIC_`. It is read here, on the
 * server, and only a resolved lane travels onward. `.env.example` and
 * `docs/RUNTIME_SETUP.md` §3 are emphatic that nothing runtime-shaped gets that
 * prefix, because it inlines the value into a bundle anyone can read and nobody
 * can change — and this switch decides whether a "Pause agent" button is real.
 *
 * `force-dynamic` is not decoration: without it a production build may try to
 * prerender this route, and reading `searchParams` at build time would freeze one
 * lane into the output.
 */
import Link from "next/link";
import LiveAgentRoster from "@/components/live/agents/LiveAgentRoster";
import { AGENTS_LANE_ENV, resolveAgentsLane } from "@/components/live/agents/lane";
import type { AgentsLane } from "@/components/live/agents/lane";
import { OPERATE_LANE_ENV, RUNTIME_MODE_ENV } from "@/components/live/lane";
import AgentRoster from "@/components/mock/workspace/AgentRoster";

export const dynamic = "force-dynamic";

export default async function WorkspaceAgentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const lane = resolveAgentsLane({
    live: params.live,
    env: process.env[AGENTS_LANE_ENV],
    operateEnv: process.env[OPERATE_LANE_ENV],
    runtimeModeEnv: process.env[RUNTIME_MODE_ENV],
  });

  if (lane.lane === "refused") return <LaneRefused lane={lane} />;
  if (lane.lane === "demo") return <AgentRoster />;

  // The live roster fetches everything it needs from /api/runtime/agents, so
  // unlike /app/workspace this page never constructs a runtime session itself —
  // a demo render cannot touch the file-backed stores either way.
  return <LiveAgentRoster live />;
}

/**
 * The screen for a lane setting this build does not implement.
 *
 * It renders INSTEAD OF a roster rather than above one, because both available
 * answers would be a guess about which screen the caller meant, and one of those
 * guesses puts a simulated pause button in front of somebody who asked for a real
 * one. Both lanes are offered as links, so recovering costs one click and nobody
 * has to know the spelling.
 */
function LaneRefused({ lane }: { lane: Extract<AgentsLane, { lane: "refused" }> }) {
  return (
    <main className="oa-page oa-page--narrow">
      <div className="oa-card oa-stack" role="alert">
        <p className="oa-eyebrow">Operate · Agents</p>
        <h1 className="oa-h2">That is not a view this app has</h1>
        <p className="oa-lead">
          This address asked for{" "}
          <strong>{lane.value === "" ? "(blank)" : lane.value}</strong>, and what is accepted
          is {lane.accepted}. Nothing was chosen for you: the sample agents&apos; controls do
          not change anything, and showing them to someone who asked for their own would let
          them believe they had paused an agent that is still running.
        </p>
        <div className="oa-cluster">
          <Link href="/app/workspace/agents?live=1" className="oa-btn oa-btn--primary oa-btn--sm">
            Open your agents
          </Link>
          <Link href="/app/workspace/agents?live=0" className="oa-btn oa-btn--ghost oa-btn--sm">
            Open the sample agents
          </Link>
        </div>
      </div>
    </main>
  );
}
