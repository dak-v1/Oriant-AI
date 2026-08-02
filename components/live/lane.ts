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
 * THE DEFAULT FOLLOWS WHAT A PERSON TYPED INTO THE ENVIRONMENT, in a fixed
 * order: the surface's own env var, then `ORIANT_OPERATE_LANE` for the whole
 * Operate surface, then — with neither set — `ORIANT_RUNTIME_MODE`. That last
 * step is NOT the inference this module forbids: the forbidden move is deciding
 * from whether the runtime happens to hold data, and the runtime mode is a value
 * an operator wrote into .env. It exists because the old rule ("blank means the
 * demo, always") shipped a deployment with live Composio tools, a live reasoner
 * and real pending approvals whose every default operating URL rendered a
 * scripted fiction — the owner's real workforce was reachable only by knowing to
 * type `?live=1`. A fixture-mode deployment still defaults every surface to the
 * demo, exactly as before.
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

/**
 * The Operate-wide default every surface shares. A surface's own var overrides
 * it, so one route can be rehearsed scripted while the rest of the surface runs
 * live. Never `NEXT_PUBLIC_` — see the pages.
 */
export const OPERATE_LANE_ENV = "ORIANT_OPERATE_LANE";

/**
 * `lib/runtime/session.ts`'s reasoner switch. Read here only to pick the
 * default when no lane variable is set at all: a runtime armed for live
 * reasoning defaults its Operate surface to the live screens.
 */
export const RUNTIME_MODE_ENV = "ORIANT_RUNTIME_MODE";

export interface LaneInput {
  /**
   * The `live` search parameter as Next hands it over: absent, one value, or an
   * array when the URL repeats it.
   */
  live: string | string[] | undefined;
  /** `process.env[<surface>_LANE_ENV]`, read on the server. */
  env: string | undefined;
  /** `process.env[OPERATE_LANE_ENV]` — the surface-wide default `env` overrides. */
  operateEnv: string | undefined;
  /**
   * `process.env[RUNTIME_MODE_ENV]` — consulted only when both lane variables
   * are unset. Required rather than optional so a call site cannot quietly drop
   * it and reintroduce the demo-by-default defect on a live-armed server.
   */
  runtimeModeEnv: string | undefined;
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
export function resolveLane(
  surface: LaneSurface,
  { live, env, operateEnv, runtimeModeEnv }: LaneInput,
): Lane {
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
     Reached only when the URL said nothing. The surface's own variable wins,
     then the Operate-wide one; blank falls through to the next step rather than
     meaning the demo, because "unset" and "asked for the demo" are different
     statements and only the second should override a live-armed default. */
  const configured = (env ?? "").trim().toLowerCase();
  if (configured !== "") {
    if (configured === ENV_DEMO) return { lane: "demo" };
    if (configured === ENV_LIVE) return { lane: "live" };
    return refuse(
      surface.envVar,
      configured,
      `"live" for ${surface.liveLabel}, "demo" (or blank) for ${surface.demoLabel}`,
    );
  }

  const operate = (operateEnv ?? "").trim().toLowerCase();
  if (operate !== "") {
    if (operate === ENV_DEMO) return { lane: "demo" };
    if (operate === ENV_LIVE) return { lane: "live" };
    return refuse(
      OPERATE_LANE_ENV,
      operate,
      `"live" for ${surface.liveLabel}, "demo" (or blank) for ${surface.demoLabel}`,
    );
  }

  /* ── No lane variable at all ──
     The runtime mode decides. Compared exactly the way lib/runtime/session.ts
     compares it — strict equality against "live", no trim, no lowercase — so
     the screens' default can never disagree with the runtime's own reading of
     the same variable. Anything else (unset, blank, "fixture", a typo) keeps
     the shipped default: the demo. A typo here is deliberately NOT refused,
     because the variable belongs to the runtime, which already treats every
     non-"live" value as fixture; refusing it on the screens would block a
     deployment the runtime itself accepts. */
  return runtimeModeEnv === "live" ? { lane: "live" } : { lane: "demo" };
}

/**
 * Binds a surface once so a page can call `resolve({ live, env })` without
 * restating its own nouns at every call site.
 */
export function laneResolver(surface: LaneSurface): (input: LaneInput) => Lane {
  return (input) => resolveLane(surface, input);
}
