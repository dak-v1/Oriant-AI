/**
 * components/live/approvals/lane.ts — which Approvals screen
 * `/app/workspace/approvals` renders.
 *
 * The reasoning that used to live here now lives in `components/live/lane.ts`,
 * because M6 gave Calendar, Agents and Integrations the same scripted/live pair
 * and three copies of a subtle rule are three chances for it to drift. Read that
 * module for why the lane is chosen by something a person typed, why the default
 * is the demo, why `?live=0` wins over the environment, and why an unrecognised
 * value is refused rather than quietly resolved to the demo.
 *
 * What stays here is only what is specific to this route: the env var it reads
 * and the nouns its refusal messages use. The exported names are unchanged, so
 * the page below it did not move.
 */

import { type Lane, type LaneInput, resolveLane } from "../lane";

/** The server-side default for this route. Never `NEXT_PUBLIC_`: see the page. */
export const APPROVALS_LANE_ENV = "ORIANT_APPROVALS_LANE";

export type ApprovalsLane = Lane;
export type { LaneInput };

const SURFACE = {
  envVar: APPROVALS_LANE_ENV,
  liveLabel: "your own approvals",
  demoLabel: "the sample approvals",
} as const;

export function resolveApprovalsLane(input: LaneInput): ApprovalsLane {
  return resolveLane(SURFACE, input);
}
