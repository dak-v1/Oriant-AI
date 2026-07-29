/**
 * components/live/workspace/plan-facts.ts — the half of the Workspace that is
 * plan, not runtime (ROLE_C_PLAN M5).
 *
 * The Workspace answers two different kinds of question and they come from two
 * different places. "What is waiting on me, what fired, what broke" is runtime
 * state and arrives over /api/runtime/*. "What is this workforce FOR, which
 * agent serves which outcome, what does success look like" is the `ApprovedPlan`
 * itself — the contract's §3.2 `BusinessOutcome[]`, which no runtime endpoint
 * carries because no runtime table holds it.
 *
 * SO THE PLAN IS READ ON THE SERVER AND HANDED DOWN AS PROPS, rather than
 * fetched. Three reasons, in order of how much they matter:
 *
 *   1. There is no endpoint to fetch it from, and inventing one would put a
 *      second definition of the plan's shape on the wire for a value that never
 *      changes between renders. The page already runs on the server; the plan is
 *      already in `getRuntimeSession()`.
 *   2. Outcome targets must render even when nothing is activated. A workforce
 *      that has never run still has goals, and an empty Workspace that cannot
 *      say what it was built to achieve is the least useful version of this
 *      screen.
 *   3. It keeps the client component free of `lib/runtime` imports. Everything
 *      below is plain JSON — strings, numbers, arrays — so it crosses the
 *      server/client boundary without a serialiser and without dragging the
 *      executor into the browser bundle.
 *
 * NOTHING HERE IS DERIVED FROM A CLOCK, and that is deliberate rather than
 * incidental. The plan describes intent; every "is this overdue / is this today"
 * judgement belongs to the runtime's own instant, which the routes return as
 * `now` precisely so a client never has to trust its own clock. This module has
 * no opinion about time beyond naming the zone the owner's day is measured in.
 *
 * `OutcomeMetric` is re-exported verbatim rather than copied into a view model.
 * The contract exists so the Workspace can render progress honestly (§1, §3.2);
 * a parallel shape here would be exactly the second source of truth §3.4 warns
 * about, and the first thing it would drift on is `baseline: number | null` —
 * the one field the honest rendering hinges on.
 */

import type {
  ApprovedPlan,
  BusinessOutcome,
  OperatingMode,
  OutcomeMetric,
  TriggerSpec,
} from "@/lib/plan/types";

export type { OutcomeMetric };

/* ═══════════════════════════ The shape ═══════════════════════════ */

export interface PlanAgentFacts {
  id: string;
  name: string;
  /** One line, e.g. "Chases overdue invoices". */
  role: string;
  operatingMode: OperatingMode;
  /** User id the plan sends this agent's approvals to. */
  approvalOwner: string;
  /** Minutes before a pending approval is flagged overdue (contract §3.10). */
  escalateAfterMins: number;
}

export interface PlanWorkflowFacts {
  agentId: string;
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  triggerKind: TriggerSpec["kind"];
  /** The owner's words for when it runs — "Every Friday at 9:00am". */
  triggerLabel: string;
  /**
   * Only a `schedule` trigger names a zone. Null for the other four, and the
   * distinction is load-bearing: a null here is why the Workspace groups the day
   * by ONE business zone rather than pretending each row knows its own.
   */
  timezone: string | null;
}

export interface PlanOutcomeFacts {
  id: string;
  name: string;
  priority: BusinessOutcome["priority"];
  owner: string;
  /**
   * The only direction the outcome↔agent relationship is stored (contract
   * §3.2). Ids, not names — resolved against `agents` at render time so an
   * outcome pointing at an agent the plan no longer has is visible as a gap
   * rather than silently dropped.
   */
  agentIds: string[];
  metrics: OutcomeMetric[];
}

export interface WorkspacePlanFacts {
  planId: string;
  planVersion: number;
  approvedAt: string;
  /** IANA zone the owner's working day is expressed in — see `businessZone`. */
  timezone: string;
  /** Where that zone came from, so a wrong-looking "today" is explicable. */
  timezoneSource: BusinessZoneSource;
  agents: PlanAgentFacts[];
  workflows: PlanWorkflowFacts[];
  outcomes: PlanOutcomeFacts[];
}

/* ═══════════════════════════ The business day ═══════════════════════════ */

export type BusinessZoneSource =
  | "global-quiet-hours"
  | "schedule-trigger"
  | "fallback";

/** Last resort only. Named rather than inlined so the UI can say so out loud. */
const FALLBACK_ZONE = "UTC";

/**
 * The one timezone the Workspace groups a day by.
 *
 * A schedule fires in its own zone and the API returns `nextFireAt` as a UTC
 * instant, so "today" is not a property of any single row — it is a question
 * about whose day is being asked about. Answering it per row would let two
 * triggers eleven minutes apart land under different headings, which is worse
 * than one zone applied consistently and named on screen.
 *
 * Preference order, and the reasoning behind it:
 *
 *   1. `globalPolicy.quietHours.timezone`. This is the only field in the whole
 *      contract that states, org-wide, when the business is awake. If the plan
 *      knows when nobody may be contacted, it knows what day the owner is in.
 *   2. The first `schedule` trigger's zone, in plan order. A plan with no quiet
 *      hours still schedules work somewhere, and that somewhere is a far better
 *      guess than the server's locale.
 *   3. UTC, reported as a fallback so the screen can label it rather than
 *      quietly grouping a Singapore morning under the previous day.
 *
 * The server's own zone is deliberately NOT in that list. It is a deployment
 * accident, and a workforce's working day must not move when the app is
 * redeployed to a different region.
 */
export function businessZone(plan: ApprovedPlan): {
  timezone: string;
  source: BusinessZoneSource;
} {
  const declared = plan.globalPolicy.quietHours?.timezone;
  if (typeof declared === "string" && declared.trim() !== "") {
    return { timezone: declared.trim(), source: "global-quiet-hours" };
  }

  for (const agent of plan.agents) {
    for (const workflow of agent.workflows) {
      if (workflow.trigger.kind !== "schedule") continue;
      const zone = workflow.trigger.timezone;
      if (typeof zone === "string" && zone.trim() !== "") {
        return { timezone: zone.trim(), source: "schedule-trigger" };
      }
    }
  }

  return { timezone: FALLBACK_ZONE, source: "fallback" };
}

/* ═══════════════════════════ The flattening ═══════════════════════════ */

/**
 * Flattens one `ApprovedPlan` into the facts the Workspace renders.
 *
 * Everything is copied rather than referenced — `metrics` included — so nothing
 * the client does can reach back into the session's plan object. That matters
 * more than it looks: `getRuntimeSession()` caches the plan on `globalThis` for
 * the life of the process, so a shared array mutated by a render would stay
 * mutated for every later request.
 */
export function planFacts(plan: ApprovedPlan): WorkspacePlanFacts {
  const zone = businessZone(plan);

  const agents: PlanAgentFacts[] = plan.agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    role: agent.role,
    operatingMode: agent.policy.operatingMode,
    approvalOwner: agent.policy.approvalOwner,
    escalateAfterMins: agent.policy.escalateAfterMins,
  }));

  const workflows: PlanWorkflowFacts[] = plan.agents.flatMap((agent) =>
    agent.workflows.map((workflow) => ({
      agentId: agent.id,
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      enabled: workflow.enabled,
      triggerKind: workflow.trigger.kind,
      triggerLabel: workflow.trigger.label,
      timezone:
        workflow.trigger.kind === "schedule" ? workflow.trigger.timezone : null,
    })),
  );

  const outcomes: PlanOutcomeFacts[] = plan.businessOutcomes.map((outcome) => ({
    id: outcome.id,
    name: outcome.name,
    priority: outcome.priority,
    owner: outcome.owner,
    agentIds: [...outcome.agentIds],
    metrics: outcome.metrics.map((metric) => ({ ...metric })),
  }));

  return {
    planId: plan.planId,
    planVersion: plan.version,
    approvedAt: plan.approvedAt,
    timezone: zone.timezone,
    timezoneSource: zone.source,
    agents,
    workflows,
    outcomes,
  };
}
