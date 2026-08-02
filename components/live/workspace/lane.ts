/**
 * components/live/workspace/lane.ts — which Workspace `/app/workspace` renders.
 *
 * This file used to carry the second, byte-for-byte-compatible copy of the lane
 * rule, with a banner saying the right end state is one `components/live/lane.ts`
 * and one Operate-wide variable. That end state landed: the rule — why the lane
 * is chosen by something a person typed, the `ORIANT_OPERATE_LANE` /
 * `ORIANT_RUNTIME_MODE` default chain, why `?live=0` beats the environment, and
 * why an unrecognised value is refused rather than quietly resolved — now lives
 * in `../lane` alongside the other four surfaces, and this file keeps only what
 * is specific to this route: the env var it reads (its own override of the
 * Operate-wide default) and the nouns its refusal sentences use.
 *
 * The exported names are unchanged, so the page above did not move.
 */

import { type Lane, type LaneInput, resolveLane } from "../lane";

/** This route's server-side override. Never `NEXT_PUBLIC_` — see the page. */
export const WORKSPACE_LANE_ENV = "ORIANT_WORKSPACE_LANE";

export type WorkspaceLane = Lane;
export type { LaneInput };

const SURFACE = {
  envVar: WORKSPACE_LANE_ENV,
  liveLabel: "your own workspace",
  demoLabel: "the sample workspace",
} as const;

export function resolveWorkspaceLane(input: LaneInput): WorkspaceLane {
  return resolveLane(SURFACE, input);
}
