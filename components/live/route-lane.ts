/**
 * components/live/route-lane.ts — "is the screen at this URL the SCRIPTED one?",
 * asked from the shell rather than from inside a page.
 *
 * Every live Operate screen already resolves its own lane on the server, and
 * that is where the decision belongs. But one thing OUTSIDE the pages needs the
 * same answer: `components/mock/shell/AppShell.tsx` guards `/app/workspace/*`
 * behind the scripted demo journey and redirects to `/app/onboarding` until that
 * journey reaches `active_workspace`. That gate is the SCRIPTED lane's — it
 * exists so a demo cannot be deep-linked past its own narrative — and it was
 * firing on every lane, where it makes no sense: an owner whose workforce is
 * genuinely activated was being bounced to onboarding because a localStorage key
 * from a demo they never ran said "not_started". The live screens were
 * effectively unreachable in a browser.
 *
 * The question this module answers is therefore "does the scripted guard apply",
 * not "is this live" — a distinction that is not pedantry: the refusal screens
 * are neither, and asking the wrong question sent them to onboarding too. See
 * `demoJourneyGuardApplies` below.
 *
 * So the shell needs to know the lane, and it is a client component that cannot
 * read `process.env`. The split below follows from that:
 *
 *   - the QUERY parameter is visible to the client and is read there;
 *   - the ENV default is read by the server layout and passed down as plain
 *     lane names ("live" / "demo" / unset). These are configuration, not
 *     secrets — they say which screen to render and nothing else — but they are
 *     still passed explicitly rather than via `NEXT_PUBLIC_`, so the set of
 *     values that can reach the browser stays enumerated in one place.
 *
 * The resolution itself is delegated to `resolveLane`, so the shell and the
 * pages cannot disagree about what `?live=0` means.
 */

import { AGENTS_LANE_ENV } from "./agents/lane";
import { APPROVALS_LANE_ENV } from "./approvals/lane";
import { CALENDAR_LANE_ENV } from "./calendar/lane";
import { INTEGRATIONS_LANE_ENV } from "./integrations/lane";
import { type LaneSurface, OPERATE_LANE_ENV, RUNTIME_MODE_ENV, resolveLane } from "./lane";
import { WORKSPACE_LANE_ENV } from "./workspace/lane";

/**
 * Longest prefix wins, so `/app/workspace/approvals` is not claimed by the
 * `/app/workspace` entry. Ordered accordingly rather than sorted at call time.
 */
const ROUTE_SURFACES: ReadonlyArray<{ prefix: string; surface: LaneSurface }> = [
  {
    prefix: "/app/workspace/approvals",
    surface: { envVar: APPROVALS_LANE_ENV, liveLabel: "the live inbox", demoLabel: "the demo" },
  },
  {
    prefix: "/app/workspace/calendar",
    surface: { envVar: CALENDAR_LANE_ENV, liveLabel: "the live calendar", demoLabel: "the scripted calendar" },
  },
  {
    prefix: "/app/workspace/agents",
    surface: { envVar: AGENTS_LANE_ENV, liveLabel: "the live roster", demoLabel: "the scripted roster" },
  },
  {
    prefix: "/app/workspace/integrations",
    surface: { envVar: INTEGRATIONS_LANE_ENV, liveLabel: "the live connections", demoLabel: "the scripted connections" },
  },
  {
    prefix: "/app/workspace",
    surface: { envVar: WORKSPACE_LANE_ENV, liveLabel: "the live workspace", demoLabel: "the scripted workspace" },
  },
];

/**
 * Routes with NO scripted lane at all, so the journey guard never applies.
 *
 * Distinct from ROUTE_SURFACES above, and the distinction is the whole point:
 * those are surfaces that can be EITHER lane depending on an env var, so the
 * guard has to resolve which one is showing. These have only one. The Agent
 * Factory and the Activation screen were rewritten to read the runtime and
 * nothing else — there is no fixture timeline left in them to deep-link past —
 * so a journey gate on them guards a narrative that no longer exists.
 *
 * IT WAS NOT MERELY USELESS, IT WAS FATAL. `lib/mock/state-machine.ts` gates
 * /app/build at "plan_approved" and /app/deploy at "ready_to_activate", and
 * nothing the SERVER knows can lift `journey` that far — only walking the
 * scripted demo can. So both pages were unreachable in a browser: they rendered
 * and were redirected to /app/onboarding within the same tick. The owner who
 * reported the Factory "stuck at Queued" could not have reached the rewritten
 * screen at all, and neither could the agent sent to screenshot it.
 *
 * /app/sandbox JOINS THEM FOR THE SAME REASON AND WITH THE SAME URGENCY. It was
 * the last scripted page in the Build section: a fixture script over
 * lib/mock/fixtures/sandbox-scenarios.ts whose cases named a BrightPath customer
 * and whose "1 of 4 passed" counters were demo state, on the screen an owner
 * reads to decide whether a workforce is safe to activate. It now renders
 * components/live/sandbox/SandboxScreen, which generates its suite from the plan
 * the runtime holds — so there is no scripted lane left to guard, and
 * `lib/mock/state-machine.ts` gates this URL at "validation_review", further
 * along the demo journey than either of the two above. Left out of this list the
 * rewritten screen would render and be redirected to /app/onboarding within the
 * same tick, exactly as the Factory was.
 */
const RUNTIME_ONLY_PREFIXES: readonly string[] = [
  "/app/build",
  "/app/deploy",
  "/app/pipeline",
  "/app/sandbox",
];

/** The lane env values the server layout hands to the shell, keyed by var name. */
export type LaneEnvDefaults = Readonly<Record<string, string | undefined>>;

/**
 * Every variable the lane resolution reads, so the layout enumerates them once.
 * The last two are not per-route overrides: `ORIANT_OPERATE_LANE` is the
 * surface-wide default and `ORIANT_RUNTIME_MODE` decides the unconfigured
 * default — both are configuration words ("live"/"demo"/"fixture"), never
 * secrets, and they must reach the client-side guard or it would resolve a
 * different lane than the server-rendered page it is guarding.
 */
export const LANE_ENV_VARS: readonly string[] = [
  APPROVALS_LANE_ENV,
  CALENDAR_LANE_ENV,
  AGENTS_LANE_ENV,
  INTEGRATIONS_LANE_ENV,
  WORKSPACE_LANE_ENV,
  OPERATE_LANE_ENV,
  RUNTIME_MODE_ENV,
];

/**
 * Does the scripted demo journey guard apply to this URL?
 *
 * The question is deliberately NOT "is this the live screen?". The guard belongs
 * to the SCRIPTED lane and to nothing else, so it applies when — and only when —
 * the resolved lane is `demo`. The two other outcomes both fall outside it:
 *
 *   - `live`: the M6 defect. An owner whose workforce is genuinely activated was
 *     bounced to onboarding because a demo they never ran left `journey` at
 *     "not_started".
 *   - `refused`: the same swallow, one step quieter. The page renders a refusal
 *     naming the setting, the value and the accepted forms — the whole point of
 *     `lane.ts` — and a guard that redirects away from it puts onboarding in
 *     front of somebody who typed `?live=yes` and never tells them what was
 *     wrong with what they typed. `curl` sees the refusal; a browser with a
 *     journey below `active_workspace` never does.
 *
 * An unrecognised route keeps the guard on, which is the safe direction: a guard
 * that wrongly stays on is a redirect, a guard that wrongly turns off is a
 * scripted demo deep-linked past its own narrative.
 */
export function demoJourneyGuardApplies(
  pathname: string,
  live: string | string[] | undefined,
  env: LaneEnvDefaults,
): boolean {
  // Checked before the surface table: these routes have no scripted lane to
  // resolve, so there is nothing for the guard to be right or wrong about.
  if (RUNTIME_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return false;

  const match = ROUTE_SURFACES.find((entry) => pathname.startsWith(entry.prefix));
  if (!match) return true;
  return resolveLane(match.surface, laneInput(match.surface, live, env)).lane === "demo";
}

/** One place builds the input, so the guard and the shell cannot drift. */
function laneInput(
  surface: LaneSurface,
  live: string | string[] | undefined,
  env: LaneEnvDefaults,
) {
  return {
    live,
    env: env[surface.envVar],
    operateEnv: env[OPERATE_LANE_ENV],
    runtimeModeEnv: env[RUNTIME_MODE_ENV],
  };
}

/** What the shell chrome may claim about the screen at this URL. */
export type ShellLane = "demo" | "live" | "refused";

/**
 * Which lane the shell is currently wrapped around, for the chrome's own labels
 * — the sidebar's "Interactive demo" disclaimer and the top bar badge.
 *
 * This exists because the shell used to assert "Every screen uses prepared demo
 * data. No live systems are connected." unconditionally, on the same pages that
 * displayed a real deployment and real approvals. A claim about the screen has
 * to be resolved the way the screen itself was resolved:
 *
 *   - the runtime-only routes have no scripted lane at all, so they are live;
 *   - the dual-lane Operate routes answer whatever `resolveLane` answers;
 *   - everything else is the scripted journey, so it is the demo.
 *
 * `refused` is kept distinct rather than folded into either: a refusal screen
 * is neither prepared demo data nor a live runtime read, and the chrome saying
 * either would contradict the page explaining the refusal beside it.
 */
export function shellLaneFor(
  pathname: string,
  live: string | string[] | undefined,
  env: LaneEnvDefaults,
): ShellLane {
  if (RUNTIME_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return "live";
  const match = ROUTE_SURFACES.find((entry) => pathname.startsWith(entry.prefix));
  if (!match) return "demo";
  return resolveLane(match.surface, laneInput(match.surface, live, env)).lane;
}
