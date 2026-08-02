/**
 * components/live/agents/lane.ts — which Agents screen `/app/workspace/agents`
 * renders.
 *
 * The reasoning lives in `components/live/lane.ts` and is not repeated here:
 * why the choice must be something a person typed rather than something the code
 * inferred, why the default is the scripted demo, why `?live=0` beats the
 * environment, and why an unrecognised value is refused rather than quietly
 * resolved. Three surfaces share that rule in M6, and three copies of it would be
 * three chances for it to drift.
 *
 * What stays here is only what is specific to this route: the env var it reads
 * and the nouns its refusal messages use.
 */

import { type Lane, type LaneInput, resolveLane } from "../lane";

/** The server-side default for this route. Never `NEXT_PUBLIC_`: see the page. */
export const AGENTS_LANE_ENV = "ORIANT_AGENTS_LANE";

export type AgentsLane = Lane;
export type { LaneInput };

const SURFACE = {
  envVar: AGENTS_LANE_ENV,
  liveLabel: "your own agents",
  demoLabel: "the sample agents",
} as const;

export function resolveAgentsLane(input: LaneInput): AgentsLane {
  return resolveLane(SURFACE, input);
}
