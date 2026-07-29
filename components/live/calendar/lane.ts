/**
 * components/live/calendar/lane.ts — which Calendar `/app/workspace/calendar`
 * renders.
 *
 * The rule itself lives in `components/live/lane.ts` and is not restated here:
 * why the lane is chosen from something a person typed rather than inferred from
 * whether the runtime has data, why the default is the scripted demo, why
 * `?live=0` beats the environment, and why an unrecognised value is refused
 * rather than quietly resolved. Three surfaces now share that reasoning, and
 * three copies of it would be three chances for it to drift.
 *
 * What is specific to this route: the env var it reads, and the nouns its
 * refusal sentences use. Never `NEXT_PUBLIC_` — the page reads it on the server
 * and hands down a resolved lane, so the value has no business in a browser
 * bundle.
 */

import { type Lane, type LaneInput, resolveLane } from "../lane";

/** The server-side default for this route. */
export const CALENDAR_LANE_ENV = "ORIANT_CALENDAR_LANE";

export type CalendarLane = Lane;
export type { LaneInput };

const SURFACE = {
  envVar: CALENDAR_LANE_ENV,
  liveLabel: "the live calendar",
  demoLabel: "the scripted calendar",
} as const;

export function resolveCalendarLane(input: LaneInput): CalendarLane {
  return resolveLane(SURFACE, input);
}
