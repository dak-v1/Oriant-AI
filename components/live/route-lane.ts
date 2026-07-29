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
import { type LaneSurface, resolveLane } from "./lane";
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

/** The lane env values the server layout hands to the shell, keyed by var name. */
export type LaneEnvDefaults = Readonly<Record<string, string | undefined>>;

/** Every lane variable, so the layout enumerates them once. */
export const LANE_ENV_VARS: readonly string[] = [
  APPROVALS_LANE_ENV,
  CALENDAR_LANE_ENV,
  AGENTS_LANE_ENV,
  INTEGRATIONS_LANE_ENV,
  WORKSPACE_LANE_ENV,
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
  const match = ROUTE_SURFACES.find((entry) => pathname.startsWith(entry.prefix));
  if (!match) return true;
  return resolveLane(match.surface, { live, env: env[match.surface.envVar] }).lane === "demo";
}
