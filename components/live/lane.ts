/**
 * components/live/lane.ts — which screen a shared route renders, for every
 * surface that now has two.
 *
 * The Approvals inbox reached this problem first (M5) and settled it: a scripted
 * screen and a runtime-backed screen both claim one URL, the scripted one has to
 * keep working permanently per ROLE_C_PLAN's integration checkpoints, so the
 * choice between them must be something a person typed rather than something the
 * code inferred. M6 gives Calendar, Agents and Integrations the same pair, and
 * three copies of that reasoning would be three chances for it to drift — the
 * exact failure `lib/runtime/sandbox/remote/protocol.ts` exists to prevent one
 * layer down. So the rule lives here once and each surface supplies only its own
 * nouns.
 *
 * The rules, unchanged from the Approvals original:
 *
 * INFERENCE IS THE THING THIS MODULE EXISTS TO PREVENT. "Show the live screen if
 * the API returns anything, otherwise the demo" is the obvious design and it is
 * wrong twice over: a demo would silently become a live surface the first time
 * somebody activated the plan, and a live screen would silently become a scripted
 * one the moment the runtime went quiet — which is precisely when an owner most
 * needs to be told that nothing is there. Neither failure announces itself.
 *
 * THE DEFAULT IS THE DEMO, AND NOTHING HERE CAN CHANGE THAT BY ACCIDENT. Only two
 * affirmative inputs select live: `?live=1` on the URL, or the surface's own env
 * var set to `live`. Unset, blank, absent and `demo` all render exactly what
 * shipped before the live screen existed.
 *
 * THE QUERY PARAMETER WINS IN BOTH DIRECTIONS. `?live=0` forces the demo even
 * where the environment defaults to live, because a deployment that has switched
 * a route over still needs a way to open the scripted screen for a rehearsal, and
 * "clear the env var and restart the server" is not a way.
 *
 * ANYTHING ELSE IS REFUSED RATHER THAN GUESSED AT. `?live=yes` does not quietly
 * fall back: falling back would put a scripted screen, whose controls change
 * nothing, in front of somebody who asked in writing for the live one — and the
 * scripted screens are convincing. Refusing names the setting, the value and the
 * accepted forms, the same posture `lib/runtime/session.ts` takes on an
 * unrecognised `ORIANT_RUNTIME_STORAGE`.
 *
 * Pure and React-free, so a page can resolve the lane on the server before either
 * screen is imported.
 */

export type Lane =
  | { lane: "demo" }
  | { lane: "live" }
  /** The caller asked for something this build does not implement. */
  | { lane: "refused"; setting: string; value: string; accepted: string };

export interface LaneInput {
  /**
   * The `live` search parameter as Next hands it over: absent, one value, or an
   * array when the URL repeats it.
   */
  live: string | string[] | undefined;
  /** `process.env[<surface>_LANE_ENV]`, read on the server. */
  env: string | undefined;
}

/** Accepted spellings, lower-cased. Closed sets — nothing is pattern-matched. */
const QUERY_LIVE = ["1", "true"];
const QUERY_DEMO = ["0", "false"];
const ENV_LIVE = "live";
const ENV_DEMO = "demo";

export interface LaneSurface {
  /** The env var this surface reads, e.g. "ORIANT_CALENDAR_LANE". */
  envVar: string;
  /** What the live screen is, in a refusal sentence: "the live calendar". */
  liveLabel: string;
  /** What the demo screen is: "the scripted calendar". */
  demoLabel: string;
}

function refuse(setting: string, value: string, accepted: string): Lane {
  return { lane: "refused", setting, value, accepted };
}

/**
 * Resolves one surface's lane. Surface nouns are passed in rather than baked in
 * so the decision logic below has exactly one implementation.
 */
export function resolveLane(surface: LaneSurface, { live, env }: LaneInput): Lane {
  /* ── The URL ──
     A repeated parameter is refused rather than resolved to its first or last
     value. `?live=1&live=0` is a caller contradicting itself, and picking a side
     means picking one at random from the owner's point of view. */
  if (Array.isArray(live)) {
    return refuse("?live=", live.join(", "), 'a single "1" or "0"');
  }

  const asked = (live ?? "").trim().toLowerCase();
  if (asked !== "") {
    if (QUERY_LIVE.includes(asked)) return { lane: "live" };
    if (QUERY_DEMO.includes(asked)) return { lane: "demo" };
    return refuse(
      "?live=",
      asked,
      `"1" / "true" for ${surface.liveLabel}, "0" / "false" for ${surface.demoLabel}`,
    );
  }

  /* ── The environment ──
     Reached only when the URL said nothing. Blank is the shipped default and
     means the demo, so an unconfigured deployment renders exactly what it
     rendered yesterday. */
  const configured = (env ?? "").trim().toLowerCase();
  if (configured === "" || configured === ENV_DEMO) return { lane: "demo" };
  if (configured === ENV_LIVE) return { lane: "live" };

  return refuse(
    surface.envVar,
    configured,
    `"live" for ${surface.liveLabel}, "demo" (or blank) for ${surface.demoLabel}`,
  );
}

/**
 * Binds a surface once so a page can call `resolve({ live, env })` without
 * restating its own nouns at every call site.
 */
export function laneResolver(surface: LaneSurface): (input: LaneInput) => Lane {
  return (input) => resolveLane(surface, input);
}
