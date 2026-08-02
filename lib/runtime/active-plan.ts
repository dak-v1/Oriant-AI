/**
 * lib/runtime/active-plan.ts — which workforce is the Operate surface looking at?
 *
 * THE BUG THIS FIXES. `session.plan` was the BrightPath fixture, hard-coded at
 * session construction, and eleven routes read it. So after a handoff had been
 * ingested, built, proved and ACTIVATED, `/api/runtime/agents` still listed the
 * four demo agents and `/api/runtime/run` answered 400 for the agent that had
 * just gone live. Every stage of the pipeline was correct and the surface that
 * watches it was pointed somewhere else.
 *
 * The fix is to read what is live rather than to be told: the active deployment
 * carries the plan it deployed (`Deployment.plan`), so the answer comes from the
 * same record that says a deployment happened at all. Nothing can activate one
 * workforce and display another, because both now come from one row.
 *
 * THE FIXTURE REMAINS THE FALLBACK, deliberately. With nothing deployed there is
 * no live workforce, and `ROLE_C_PLAN` promises the scripted path keeps working
 * permanently — it is the demo, the test harness, and what carries a
 * presentation if another lane slips. So "nothing ingested yet" shows the
 * fixture, exactly as it did before, and the moment something real is activated
 * the surface follows it.
 */

import type { ApprovedPlan } from "../plan/types";
import { BRIGHTPATH_PLAN } from "../plan/fixtures/brightpath";
import type { SchedulerStore } from "./schedule/types";

export interface ActivePlanResult {
  plan: ApprovedPlan;
  /** "deployment" when a real workforce is live; "fixture" when none is. */
  source: "deployment" | "fixture";
  deploymentId: string | null;
}

/**
 * The plan behind whatever is currently deployed.
 *
 * Deployments are scanned newest-first and the first ACTIVE one wins. A
 * deployment written before this field existed carries no plan; those are
 * skipped rather than crashing the surface, which keeps a store that predates
 * the change readable instead of turning it into an outage.
 */
export async function resolveActivePlan(
  store: Pick<SchedulerStore, "listDeployments">,
): Promise<ActivePlanResult> {
  let deployments;
  try {
    deployments = await store.listDeployments();
  } catch {
    // The Operate surface showing the fixture is a great deal better than the
    // Operate surface showing an error page.
    return { plan: BRIGHTPATH_PLAN, source: "fixture", deploymentId: null };
  }

  for (let i = deployments.length - 1; i >= 0; i--) {
    const deployment = deployments[i];
    if (!deployment) continue;
    const plan = (deployment as { plan?: ApprovedPlan }).plan;
    if (plan && Array.isArray(plan.agents) && plan.agents.length > 0) {
      return { plan, source: "deployment", deploymentId: deployment.deploymentId };
    }
  }

  return { plan: BRIGHTPATH_PLAN, source: "fixture", deploymentId: null };
}

/** The common case: callers that only want the plan. */
export async function activePlan(
  store: Pick<SchedulerStore, "listDeployments">,
): Promise<ApprovedPlan> {
  return (await resolveActivePlan(store)).plan;
}
