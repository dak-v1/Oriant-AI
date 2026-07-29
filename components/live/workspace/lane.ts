/**
 * components/live/workspace/lane.ts — which Workspace `/app/workspace` renders.
 *
 * Two screens claim this route, exactly as they do on
 * `/app/workspace/approvals`. The scripted one
 * (`components/mock/workspace/WorkspaceOverview`) is driven by `useDemoStore`
 * and the autopilot script, and ROLE_C_PLAN's integration checkpoints require it
 * to keep working PERMANENTLY. The live one reads the agent runtime. Sharing a
 * URL between them is only safe if the choice is explicit, so the choice is made
 * from something a person typed and never from whether the runtime happens to
 * have data in it.
 *
 * INFERENCE IS WHAT THIS MODULE EXISTS TO PREVENT. "Show the live Workspace if
 * the API returns anything, otherwise the demo" is the obvious design and is
 * wrong in both directions: a rehearsal would silently become a live operations
 * screen the first time somebody activated the plan, and a live Workspace would
 * silently become a scripted one the moment the runtime went quiet — which is
 * precisely when an owner most needs to be told that nothing is running. Neither
 * failure announces itself.
 *
 * ANYTHING UNRECOGNISED IS REFUSED RATHER THAN DEFAULTED. That is the one place
 * this is deliberately unfriendly, and it is worth the friction: falling back to
 * the demo would put a scripted screen, whose numbers are invented, in front of
 * somebody who asked in writing for the live one — and the scripted numbers are
 * convincing. Refusing names the setting, the value and the accepted forms,
 * which is the posture `lib/runtime/session.ts` already takes on an
 * unrecognised `ORIANT_RUNTIME_STORAGE`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS THE SECOND COPY OF THIS RULE, AND IT SHOULD NOT STAY THAT WAY.
 * `components/live/approvals/lane.ts` states the identical semantics for the
 * Approvals route, under `ORIANT_APPROVALS_LANE`. The two landed in parallel and
 * are byte-for-byte compatible on the URL — `?live=1` / `?live=0`, repeats
 * refused — because a switch that means one thing on the Workspace and another
 * on the inbox one click away is worse than either behaviour on its own. What
 * they do NOT share is the environment default: each route carries its own, so
 * neither lane can be flipped by a variable named after the other.
 *
 * The right end state is one `components/live/lane.ts` and one variable —
 * `ORIANT_OPERATE_LANE` — covering the whole Operate surface, with the two
 * route-specific variables kept as overrides or dropped. That is a change across
 * both lanes' files, so it belongs in a commit that owns both rather than in
 * either one unilaterally. Until then: change one of these files and change the
 * other in the same breath.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Pure and React-free, so the page resolves the lane on the server before either
 * screen is imported.
 */

/** This route's server-side default. Never `NEXT_PUBLIC_` — see the page. */
export const WORKSPACE_LANE_ENV = "ORIANT_WORKSPACE_LANE";

export type WorkspaceLane =
  | { lane: "demo" }
  | { lane: "live" }
  /** The caller asked for something this build does not implement. */
  | { lane: "refused"; setting: string; value: string; accepted: string };

/** Accepted spellings, lower-cased. Closed sets — nothing is pattern-matched. */
const QUERY_LIVE = ["1", "true"];
const QUERY_DEMO = ["0", "false"];
const ENV_LIVE = "live";
const ENV_DEMO = "demo";

export interface LaneInput {
  /**
   * The `live` search parameter as Next hands it over: absent, one value, or an
   * array when the URL repeats it.
   */
  live: string | string[] | undefined;
  /** `process.env[WORKSPACE_LANE_ENV]`, read on the server. */
  env: string | undefined;
}

export function resolveWorkspaceLane({ live, env }: LaneInput): WorkspaceLane {
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
      '"1" / "true" for the live Workspace, "0" / "false" for the demo',
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
    WORKSPACE_LANE_ENV,
    configured,
    '"live" for the runtime-backed Workspace, "demo" (or blank) for the scripted one',
  );
}

function refuse(setting: string, value: string, accepted: string): WorkspaceLane {
  return { lane: "refused", setting, value, accepted };
}
