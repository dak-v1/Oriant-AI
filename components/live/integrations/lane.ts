/**
 * components/live/integrations/lane.ts — which Integrations screen
 * `/app/workspace/integrations` renders.
 *
 * The reasoning lives in `components/live/lane.ts` and is not repeated here: why
 * the lane is chosen by something a person typed rather than inferred, why the
 * default is the scripted screen, why `?live=0` beats the environment, and why a
 * value the switch cannot read is refused instead of quietly resolved.
 *
 * What is specific to this route is only the env var it reads and the nouns its
 * refusal sentence uses. The stakes of guessing are the same shape as the
 * Approvals inbox's and differ in direction: the scripted screen offers Connect
 * buttons that walk a convincing four-step wizard and change nothing outside the
 * demo store, so somebody who asked in writing for the live view and was handed
 * the demo could come away believing they had connected a tool.
 */

import { type Lane, type LaneInput, resolveLane } from "../lane";

/** The server-side default for this route. Never `NEXT_PUBLIC_`: see the page. */
export const INTEGRATIONS_LANE_ENV = "ORIANT_INTEGRATIONS_LANE";

export type IntegrationsLane = Lane;
export type { LaneInput };

const SURFACE = {
  envVar: INTEGRATIONS_LANE_ENV,
  liveLabel: "the live connections view",
  demoLabel: "the scripted connections screen",
} as const;

export function resolveIntegrationsLane(input: LaneInput): IntegrationsLane {
  return resolveLane(SURFACE, input);
}
