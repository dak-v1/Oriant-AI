/**
 * lib/runtime/current-plan.ts — what the owner INTENDS the workforce to be.
 *
 * THE BUG THIS FIXES, and it is the other half of active-plan.ts. That file
 * taught the Operate surface to read what is RUNNING from the deployment. What
 * is PLANNED was still `session.plan`, a module constant holding the BrightPath
 * demo fixture, assigned once at session construction and never written to
 * again. So `reconcileAgents` — which exists to answer "has anything changed
 * since go-live" — was comparing a real deployment against a hard-coded
 * fixture. On the demo path both sides happened to be BrightPath and every
 * agent read `running`; on a customer's path the two sides were about different
 * workforces entirely, and every row was noise. Correct reconciliation code
 * pointed at a constant.
 *
 * TWO PLANS, AND THEY MUST BE ALLOWED TO DISAGREE.
 *
 *   current      the newest plan ingested from Role B and validated here.
 *                What we intend. Written by the pipeline, read from
 *                `SchedulerStore.getCurrentPlan`.
 *   deployment   the plan frozen into the deployment record at go-live.
 *                What is running. Read from `resolveActivePlan`.
 *
 * Drift is the difference. The tempting simplification — derive the current
 * plan FROM the newest deployment — makes the two identical by construction,
 * which makes drift permanently zero and quietly deletes `drifted`, `planned`
 * and `retired` from a type that still lists them. It would also pass every
 * check that only ever exercises the happy path, which is why the trap is
 * written down here rather than left to be rediscovered.
 *
 * THE FIXTURE FALLBACK IS OBSERVABLE, NEVER SILENT. A clean clone has ingested
 * nothing, and `ROLE_C_PLAN` promises the scripted BrightPath path keeps working
 * permanently — it is the demo, the sandbox's subject and what carries a
 * presentation if another lane slips. So "nothing ingested" still shows the
 * fixture. What it must never do is show the fixture while CLAIMING to show the
 * customer's workforce, so every answer carries `source` and a fallback carries
 * a sentence saying why. A caller that renders the plan without reading the
 * source is making that claim itself, with the discriminant sitting right there.
 *
 * A STORE FAILURE IS NOT A FALLBACK, and this is the one place this module
 * deliberately behaves differently from `resolveActivePlan`. That function
 * swallows a read error and shows the fixture, because "no deployment" and
 * "cannot read the deployments" are the same fact for its purposes: nothing is
 * provably live either way. Here they are different facts. "Nothing has been
 * ingested" licenses the fixture; "the store would not answer" does not, because
 * a real plan may well be sitting in it — and substituting BrightPath for a plan
 * that exists is exactly the lie this module was written to remove. So a throw
 * propagates. An error page is a worse demo and a better truth.
 */

import type { ApprovedPlan } from "../plan/types";
import { BRIGHTPATH_PLAN } from "../plan/fixtures/brightpath";
import {
  reconcileAgents,
  resolveActivePlan,
  type ActivePlanResult,
  type AgentLifecycleRow,
} from "./active-plan";
import type { SchedulerStore } from "./schedule/types";

/**
 * `ingested` — a real plan crossed the seam from Role B and was validated.
 * `fixture` — nothing has, so this is the BrightPath demo standing in.
 */
export type CurrentPlanSource = "ingested" | "fixture";

export interface CurrentPlanResult {
  plan: ApprovedPlan;
  source: CurrentPlanSource;
  /**
   * One sentence for the surface to show, in the owner's language. Null when
   * `source` is "ingested" — there is nothing to explain about a real plan.
   *
   * Present as prose rather than left to each caller because three screens
   * writing their own version of "this is demo data" is three chances for one of
   * them to forget, and the one that forgets is the screen that lies.
   */
  fallbackReason: string | null;
}

/**
 * The plan the owner currently intends, or the fixture with a reason.
 *
 * Deliberately does NOT look at deployments. A plan that has been ingested but
 * never activated is still what the owner intends — that is what makes an agent
 * `planned` rather than invisible — and a plan that was ingested and then
 * superseded is not made current again by the fact that the old one is still
 * running.
 */
export async function resolveCurrentPlan(
  store: Pick<SchedulerStore, "getCurrentPlan">,
): Promise<CurrentPlanResult> {
  // Unguarded on purpose. See the header: a store that will not answer is not
  // evidence that nothing was ingested, and treating it as such is the failure
  // mode this module exists to remove.
  const stored = await store.getCurrentPlan();

  if (stored !== null) {
    // Returned exactly as stored, including a plan with no agents in it. That
    // shape is what an owner who removed everything actually asked for, and
    // `reconcileAgents` reports the consequence honestly as `retired` rows.
    // Falling back to the fixture on "looks empty" would replace their answer
    // with someone else's demo — the precise substitution being removed here.
    return { plan: stored, source: "ingested", fallbackReason: null };
  }

  return {
    plan: BRIGHTPATH_PLAN,
    source: "fixture",
    fallbackReason:
      "No workforce plan has been ingested yet, so this is the BrightPath demo " +
      "workforce rather than your own. Run a handoff through the pipeline to " +
      "replace it.",
  };
}

/** The common case: callers that only want the plan. */
export async function currentPlan(
  store: Pick<SchedulerStore, "getCurrentPlan">,
): Promise<ApprovedPlan> {
  return (await resolveCurrentPlan(store)).plan;
}

/* ═══════════════════════════ Both plans ═══════════════════════════ */

export interface PlanState {
  /** What we intend, and whether it is real. */
  current: CurrentPlanResult;
  /** What is running, and which deployment says so. */
  active: ActivePlanResult;
  /** One row per agent in either plan, tagged with how they differ. */
  lifecycle: AgentLifecycleRow[];
}

/**
 * Both plans and the reconciliation between them, in one read.
 *
 * Three route handlers already resolve the active plan, resolve the planned one
 * and call `reconcileAgents` on the pair, and each does it in its own five
 * lines. That is three places to get the null right — and getting it wrong is
 * silent: pass the fixture in as `deployed` and every demo agent reports as
 * live, on a runtime where nothing was ever activated.
 *
 * So the rule lives here once. When no deployment exists, `deployed` is null
 * rather than the fixture, because "nothing is running" is a fact the roster has
 * to be able to say.
 */
export async function resolvePlanState(
  store: Pick<SchedulerStore, "getCurrentPlan" | "listDeployments">,
): Promise<PlanState> {
  const [current, active] = await Promise.all([
    resolveCurrentPlan(store),
    resolveActivePlan(store),
  ]);

  return {
    current,
    active,
    lifecycle: reconcileAgents(
      active.source === "deployment" ? active.plan : null,
      current.plan,
    ),
  };
}
