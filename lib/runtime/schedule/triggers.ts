/**
 * lib/runtime/schedule/triggers.ts — the five trigger kinds (ROLE_C_PLAN M4).
 *
 * Everything before M4 ran because a human asked. From here a trigger fires and a
 * run appears with nobody watching, so this module is where the runtime stops
 * being asked and starts deciding. Four properties carry that weight.
 *
 * THE TRIGGER ID IS DERIVED, NOT MINTED. `triggerIdFor` is a pure function of
 * (planId, agentId, workflowId), and `SchedulerDeps.newId` is deliberately unused
 * here. A generated id would look harmless: activate, get `trg_1`; re-approve the
 * plan, activate again, get `trg_9`. But every idempotency key below is built on
 * the trigger id, so the same Friday nine o'clock would then produce two different
 * keys, `RunStore.claimIdempotencyKey` would grant both, and the workforce would
 * double-send — precisely on the day someone edited the plan, which is precisely
 * the day nobody is watching for it. A derived id makes re-registration overwrite
 * in place and makes a firing's identity a function of what fired, not of when it
 * happened to be registered.
 *
 * EVERY IDEMPOTENCY KEY COMES FROM THE CAUSE. Not from a clock, not from a
 * counter, not from `newId`. A schedule firing is keyed by its fire instant, an
 * event by the integration's delivery id, a dependency by the upstream run id, a
 * threshold by the observation instant. Compute the same logical firing twice, in
 * two processes, a week apart, and the key is the same string — which is the only
 * condition under which the executor's duplicate protection is worth anything.
 * Where a cause arrives with no identity of its own, this module refuses to invent
 * one: a blank delivery id would silently collapse every future event onto one
 * key, and every enquiry after the first would vanish rather than run.
 *
 * ONLY ENABLED WORKFLOWS FIRE, AND DISABLING IS AN ACTION. A workflow switched off
 * does not merely fail to be registered — its existing registration is actively
 * stood down, because "we skipped it" leaves yesterday's trigger firing on today's
 * plan. The guard is repeated at the point a firing is minted: `buildTriggerEvent`
 * refuses a disabled trigger outright, so there is no path from a stood-down
 * record to a `TriggerEvent` that the executor would honour.
 *
 * AN UNRECOGNISED KIND IS REFUSED, NEVER REGISTERED. The five kinds are handled in
 * guarded branches with a refusing default, not as a switch with a permissive
 * fall-through. This repo has already shipped that bug once, in the enforcement
 * layer, where an unrecognised `operatingMode` fell through into the path that can
 * act on a customer unattended. A trigger kind nobody implemented has no firing
 * semantics to apply, so it does not get scheduled and activation is told why.
 */

import type { ApprovedPlan, Op, TriggerSpec } from "../../plan/types";
import type { RunStatus, TriggerEvent } from "../types";
import { CronError, nextFireAfter } from "./cron";
import type { ScheduledTrigger, SchedulerDeps } from "./types";

/* ═══════════════════════ What causes a firing ═══════════════════════ */

/**
 * One delivery from an integration's webhook or poller.
 *
 * `eventId` is REQUIRED and is the integration's own delivery id — Gmail's history
 * id, Stripe's `evt_…`, whatever the provider re-sends unchanged when it retries.
 * It is the only thing that makes a redelivery recognisable as one. A caller whose
 * integration offers nothing of the sort must synthesise an id that is stable
 * across redeliveries and distinct between genuinely different events; it must not
 * pass a timestamp, and it must not pass an empty string, which `buildTriggerEvent`
 * refuses rather than turning into a key that swallows everything after the first.
 */
export interface InboundEvent {
  integrationId: string;
  /** The integration's event name, e.g. "message.received". */
  event: string;
  eventId: string;
  payload: Record<string, unknown>;
  /** ISO 8601. Becomes the run's `firedAt`. */
  receivedAt: string;
}

/**
 * One observation of a metric, from whatever measures it.
 *
 * `observedAt` is the reading's identity as well as its timestamp: one firing per
 * (trigger, observation instant). Re-delivering the same reading therefore cannot
 * double-fire, and two genuinely different observations cannot collapse into one.
 */
export interface MetricReading {
  metric: string;
  value: number;
  /** ISO 8601. */
  observedAt: string;
}

/** One finished run, offered to whatever was waiting for it. */
export interface WorkflowCompletion {
  agentId: string;
  workflowId: string;
  runId: string;
  status: RunStatus;
  /** ISO 8601. */
  completedAt: string;
}

/**
 * Why a trigger is firing. Discriminated so the idempotency key for every kind is
 * derived in ONE place: a second place would be a second opportunity for the two
 * to disagree about what "the same firing" means.
 */
export type TriggerCause =
  | { kind: "schedule"; fireAt: Date }
  | { kind: "event"; event: InboundEvent }
  | { kind: "threshold"; reading: MetricReading }
  | { kind: "dependency"; completion: WorkflowCompletion }
  | {
      kind: "manual";
      /** The caller's own id for this request — one per click, or the second
          click is silently swallowed by the first one's idempotency key. */
      invocationId: string;
      requestedBy: string;
      at: Date;
    };

/** A trigger and the event it would hand the executor. */
export interface TriggerFiring {
  trigger: ScheduledTrigger;
  event: TriggerEvent;
}

/* ═══════════════════════════ Identity ═══════════════════════════ */

/**
 * The stable id for one workflow's trigger. See the header for why this is
 * derived rather than generated.
 *
 * `::` separates the three parts because plan ids are kebab-case and none of them
 * contains it; nothing ever parses the result back, so the separator only has to
 * make collisions between different triples impossible.
 */
export function triggerIdFor(planId: string, agentId: string, workflowId: string): string {
  return `trg::${planId}::${agentId}::${workflowId}`;
}

/* ═══════════════════════════ Registration ═══════════════════════════ */

/** A workflow whose trigger could not be scheduled, and what to tell the owner. */
export interface RejectedTrigger {
  agentId: string;
  workflowId: string;
  kind: TriggerSpec["kind"] | "unknown";
  reason: string;
}

export interface TriggerRegistration {
  planId: string;
  planVersion: number;
  /** Live triggers, one per enabled workflow. */
  registered: ScheduledTrigger[];
  /** Previously live triggers stood down by this registration. */
  retired: ScheduledTrigger[];
  /**
   * Enabled workflows that got no trigger. Nothing here is scheduled, so the
   * activation screen must show every entry: a workflow the owner believes is
   * live and which nothing will ever start is the worst outcome available.
   */
  rejected: RejectedTrigger[];
}

/** A collection arriving over the seam is a promise, not proof — as in policy.ts. */
function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

type ScheduleResolution =
  | { ok: true; nextFireAt: string }
  | { ok: false; reason: string };

/**
 * The first firing of a schedule trigger, or why there will not be one.
 *
 * Both failure modes are real and different. `CronError` means the expression or
 * the zone cannot be scheduled at all — validator rule 4 should have caught it at
 * the handoff gate, so reaching here means the plan was assembled around the gate.
 * `null` means the expression is perfectly well formed and simply never matches a
 * date, `0 0 30 2 *` being the canonical case. Either way the trigger is not
 * registered: a schedule trigger with no next firing is a workflow the owner will
 * watch never run.
 */
function resolveFirstFire(
  spec: Extract<TriggerSpec, { kind: "schedule" }>,
  now: Date,
): ScheduleResolution {
  let next: Date | null;
  try {
    next = nextFireAfter(spec.cron, spec.timezone, now);
  } catch (error) {
    if (!(error instanceof CronError)) throw error;
    return { ok: false, reason: error.message };
  }

  if (next === null) {
    return {
      ok: false,
      reason:
        `Cron "${spec.cron}" is well formed but matches no date in the next eight years, so ` +
        `this workflow would never run. Check the day-of-month and month fields — ` +
        `"0 0 30 2 *" asks for the 30th of February.`,
    };
  }
  return { ok: true, nextFireAt: next.toISOString() };
}

/**
 * Register every enabled workflow's trigger for a plan. This is what go-live calls.
 *
 * Safe to call repeatedly. Trigger ids are derived, so a second activation of the
 * same plan overwrites each record in place rather than accumulating a second set
 * that fires the same workflow twice.
 *
 * `lastFiredAt` is carried forward from any existing record and `registeredAt` is
 * not: the first is history, which a re-activation has no business erasing, and
 * the second is a fact about this activation. `nextFireAt` is always recomputed,
 * because the spec may have changed underneath it and the frozen copy on the old
 * record would keep firing yesterday's schedule.
 */
export async function registerPlanTriggers(
  plan: ApprovedPlan,
  deps: Pick<SchedulerDeps, "store" | "clock">,
): Promise<TriggerRegistration> {
  const now = deps.clock.now();
  const registeredAt = now.toISOString();

  const registered: ScheduledTrigger[] = [];
  const retired: ScheduledTrigger[] = [];
  const rejected: RejectedTrigger[] = [];

  /**
   * Take a previously live trigger out of service. Called on every path that does
   * not produce a live trigger — disabled, malformed, unschedulable — because
   * merely declining to register leaves the last activation's record firing.
   */
  const standDown = async (existing: ScheduledTrigger | null): Promise<void> => {
    if (!existing || !existing.enabled) return;
    const stood: ScheduledTrigger = {
      ...existing,
      planVersion: plan.version,
      enabled: false,
      nextFireAt: null,
    };
    await deps.store.saveTrigger(stood);
    retired.push(stood);
  };

  for (const agent of asArray(plan.agents)) {
    for (const workflow of asArray(agent.workflows)) {
      const triggerId = triggerIdFor(plan.planId, agent.id, workflow.id);
      const existing = await deps.store.getTrigger(triggerId);
      const spec = workflow.trigger;

      // A workflow the owner switched off must never fire, however it was
      // registered before.
      if (!workflow.enabled) {
        await standDown(existing);
        continue;
      }

      const declaredKind = (spec as { kind?: unknown } | null | undefined)?.kind;
      const reject = async (reason: string): Promise<void> => {
        rejected.push({
          agentId: agent.id,
          workflowId: workflow.id,
          kind: isTriggerKind(declaredKind) ? declaredKind : "unknown",
          reason,
        });
        await standDown(existing);
      };

      if (!spec || typeof spec !== "object" || typeof declaredKind !== "string") {
        await reject(
          `Workflow "${workflow.id}" on agent "${agent.id}" is enabled but declares no trigger, ` +
            `so there is nothing to register and nothing would ever start it.`,
        );
        continue;
      }

      const base = {
        triggerId,
        planId: plan.planId,
        planVersion: plan.version,
        agentId: agent.id,
        workflowId: workflow.id,
        spec,
        enabled: true as const,
        // History, not configuration. Losing it on re-activation would erase the
        // record of what this trigger has already done.
        lastFiredAt: existing?.lastFiredAt ?? null,
        registeredAt,
      };

      switch (spec.kind) {
        case "schedule": {
          const resolved = resolveFirstFire(spec, now);
          if (!resolved.ok) {
            await reject(resolved.reason);
            continue;
          }
          const trigger: ScheduledTrigger = {
            ...base,
            kind: "schedule",
            nextFireAt: resolved.nextFireAt,
          };
          await deps.store.saveTrigger(trigger);
          registered.push(trigger);
          continue;
        }

        // Driven by something arriving rather than by time passing, so `nextFireAt`
        // is null — see the field's note in ./types.ts. `manual` is registered too:
        // it never becomes due on its own, but it gives a manual run the same
        // stable trigger id, and therefore the same idempotency discipline, as
        // every other way a run can start.
        case "event":
        case "threshold":
        case "dependency":
        case "manual": {
          const trigger: ScheduledTrigger = { ...base, kind: spec.kind, nextFireAt: null };
          await deps.store.saveTrigger(trigger);
          registered.push(trigger);
          continue;
        }

        default: {
          // Unreachable through the type system — the union is exhausted above —
          // but reachable at run time, because the plan is JSON: a typo, or a
          // sixth kind added to the contract before this build implemented it.
          // Refused rather than registered with some default behaviour, for the
          // reason in the module header. The `never` binding is compile-time only
          // and forces this branch to be revisited when `TriggerSpec` grows; the
          // rejection below is what actually closes the hole.
          const unhandled: never = spec;
          await reject(
            `Workflow "${workflow.id}" on agent "${agent.id}" declares trigger kind ` +
              `"${String((unhandled as { kind?: unknown }).kind)}", which this runtime does not ` +
              `implement. It has no firing semantics here, so it was not scheduled.`,
          );
          continue;
        }
      }
    }
  }

  return { planId: plan.planId, planVersion: plan.version, registered, retired, rejected };
}

const TRIGGER_KINDS: ReadonlyArray<TriggerSpec["kind"]> = [
  "schedule",
  "event",
  "threshold",
  "dependency",
  "manual",
];

function isTriggerKind(value: unknown): value is TriggerSpec["kind"] {
  return (TRIGGER_KINDS as readonly unknown[]).includes(value);
}

/* ═══════════════════ Reading a stored trigger ═══════════════════ */

/**
 * The spec off a STORED trigger, checked rather than trusted.
 *
 * Every scanner below dereferences `trigger.spec`, and the rows they scan come
 * out of a store that may hold records written by older code — which is exactly
 * how an undefined arrives underneath a type that promises it cannot.
 * Unguarded, that surfaces as `Cannot read properties of undefined (reading
 * "kind")` with no record named; guarded here, once, it names the trigger and
 * the fix.
 *
 * A THROW, NOT A SKIP. Skipping would leave a schedule trigger due forever and
 * firing never — the sweep that silently did not happen, the one failure this
 * module is built to avoid. The cost is accepted with eyes open: a throw out of
 * `scheduleFirings` fails that pass and every pass after it until the row is
 * repaired, but it fails NAMED and on every tick, where a skip fails one
 * workflow silently and forever. The other callers already contain the blast —
 * `advanceScheduleTrigger` throws land in the tick's per-trigger error channel,
 * and `dependencyFirings` runs inside `fireDependencies`' own catch.
 */
function storedSpecOf(trigger: ScheduledTrigger): TriggerSpec {
  const spec = (trigger as { spec?: TriggerSpec | null }).spec;
  if (spec === undefined || spec === null || typeof spec !== "object") {
    throw new Error(
      `Trigger ${trigger.triggerId} (${trigger.agentId}/${trigger.workflowId}) has no ` +
        `readable spec: the stored record's "spec" field is ${JSON.stringify(spec)}. The row ` +
        `was written by older code or edited by hand; re-activate the plan so ` +
        `registerPlanTriggers rebuilds it, or disable the trigger.`,
    );
  }
  return spec;
}

/* ═══════════════════════════ Schedule ═══════════════════════════ */

/**
 * The schedule triggers due at an instant, each with the event that would start
 * its run.
 *
 * Pure, so the worker loop is testable without a store and the sandbox can drive
 * it off a fixed clock. A trigger whose `nextFireAt` will not parse is skipped
 * rather than fired: an unreadable fire instant cannot produce a stable
 * idempotency key, and firing on a key nobody can reproduce is worse than not
 * firing at all.
 */
export function scheduleFirings(triggers: ScheduledTrigger[], at: Date): TriggerFiring[] {
  const atMs = at.getTime();
  if (!Number.isFinite(atMs)) return [];

  const due: { firing: TriggerFiring; fireMs: number }[] = [];
  for (const trigger of triggers) {
    if (!trigger.enabled) continue;
    if (storedSpecOf(trigger).kind !== "schedule") continue;
    if (trigger.nextFireAt === null) continue;

    const fireMs = Date.parse(trigger.nextFireAt);
    if (!Number.isFinite(fireMs) || fireMs > atMs) continue;

    due.push({
      firing: {
        trigger,
        event: buildTriggerEvent(trigger, { kind: "schedule", fireAt: new Date(fireMs) }),
      },
      fireMs,
    });
  }

  // Oldest first, ties broken by id: a worker draining the queue must process a
  // week-old missed sweep before this minute's, and two runs of the same tick
  // must produce the same order.
  due.sort((a, b) => a.fireMs - b.fireMs || compareIds(a.firing, b.firing));
  return due.map((entry) => entry.firing);
}

/** The store-backed form, which is what the worker actually calls. */
export async function dueScheduleTriggers(
  at: Date,
  deps: Pick<SchedulerDeps, "store">,
  filter: { planId?: string } = {},
): Promise<TriggerFiring[]> {
  const query: { kind: "schedule"; enabled: boolean; planId?: string } = {
    kind: "schedule",
    enabled: true,
  };
  // Set only when present: a store that compares against an explicit `undefined`
  // would filter everything out rather than nothing.
  if (filter.planId !== undefined) query.planId = filter.planId;

  return scheduleFirings(await deps.store.listTriggers(query), at);
}

/**
 * Move a schedule trigger on after it has fired.
 *
 * The next firing is searched from `now`, NOT from `firedAt`, and that difference
 * is the catch-up policy: missed occurrences are NOT backfilled. A worker that was
 * down for a week runs the most recent missed sweep once and then resumes on
 * today's schedule. Searching from `firedAt` instead would queue every occurrence
 * the outage covered — one extra invoice sweep, or fourteen hundred runs of a
 * minute cron, depending on the expression, and the owner did not ask for either.
 *
 * A null `nextFireAt` afterwards means the expression is exhausted: it fired, and
 * it has no further occurrence inside the search bound. The trigger stays on the
 * roster and simply never becomes due again.
 */
export function advanceScheduleTrigger(
  trigger: ScheduledTrigger,
  firedAt: Date,
  now: Date,
): ScheduledTrigger {
  const spec = storedSpecOf(trigger);
  if (spec.kind !== "schedule") {
    throw new Error(
      `Trigger ${trigger.triggerId} is a "${spec.kind}" trigger and has no schedule to advance. ` +
        `Only schedule triggers carry a nextFireAt.`,
    );
  }

  const from = firedAt.getTime() > now.getTime() ? firedAt : now;
  const next = nextFireAfter(spec.cron, spec.timezone, from);

  return {
    ...trigger,
    lastFiredAt: firedAt.toISOString(),
    nextFireAt: next === null ? null : next.toISOString(),
  };
}

/* ═══════════════════════════ Event ═══════════════════════════ */

/**
 * The event triggers waiting for one inbound delivery.
 *
 * THE FILTER IS SHALLOW EQUALITY, and saying so precisely matters more than the
 * three lines it takes to implement. Every key in `TriggerSpec.filter` must be
 * present on the payload as an own property, holding an identical value by
 * `Object.is`. That covers the strings, numbers and booleans plans actually use —
 * `{ label: "enquiries", isReply: false }` — and it deliberately does NOT cover a
 * nested object or array, which compares by identity and therefore never matches.
 *
 * That is fail-closed on purpose. The alternative is a deep comparison nobody
 * specified, where the plan's author believes they wrote a filter and the runtime
 * quietly applies a different one. A filter this module cannot honestly evaluate
 * must stop the trigger, not wave it through: the cost of the strict reading is a
 * workflow that visibly never fires, and the cost of the loose one is a workflow
 * that fires on events it was written to exclude.
 */
export function eventFirings(
  triggers: ScheduledTrigger[],
  inbound: InboundEvent,
): TriggerFiring[] {
  const firings: TriggerFiring[] = [];

  for (const trigger of triggers) {
    if (!trigger.enabled) continue;
    const spec = storedSpecOf(trigger);
    if (spec.kind !== "event") continue;
    if (spec.integrationId !== inbound.integrationId) continue;
    if (spec.event !== inbound.event) continue;
    if (!matchesFilter(spec.filter, inbound.payload)) continue;

    firings.push({ trigger, event: buildTriggerEvent(trigger, { kind: "event", event: inbound }) });
  }

  return firings.sort(compareIds);
}

function matchesFilter(
  filter: Record<string, unknown> | undefined,
  payload: Record<string, unknown>,
): boolean {
  if (!filter) return true;

  for (const key of Object.keys(filter)) {
    // Own properties only: a value inherited from a prototype is not something the
    // integration sent.
    if (!Object.prototype.hasOwnProperty.call(payload, key)) return false;
    if (!Object.is(payload[key], filter[key])) return false;
  }
  return true;
}

/* ═══════════════════════════ Threshold ═══════════════════════════ */

/**
 * The threshold triggers satisfied by one metric reading.
 *
 * LEVEL-CHECKED, NOT EDGE-DETECTED, and the distinction is worth stating because
 * the two behave very differently in an incident. Every reading that satisfies
 * `metric op value` produces a firing, so a metric that sits over the line fires
 * once per reading rather than once when it crosses. Firing only on the crossing
 * would need the previous reading, which is state this function does not have and
 * should not invent — and it would also mean a threshold breached before the
 * workforce was activated never fires at all, which is the wrong failure for a
 * trigger whose whole job is to notice trouble.
 *
 * What stops that becoming a flood is the reading's own identity: the idempotency
 * key is the observation instant, so the rate of firings is the rate at which the
 * caller supplies genuinely new readings, and a re-delivered reading is refused.
 * A caller that polls every second and wants an edge should compare against
 * `ScheduledTrigger.lastFiredAt` before enqueuing.
 */
export function thresholdFirings(
  triggers: ScheduledTrigger[],
  reading: MetricReading,
): TriggerFiring[] {
  // A reading that is not a finite number is not a measurement. Nothing fires on
  // it, and nothing is judged against it.
  if (typeof reading.value !== "number" || !Number.isFinite(reading.value)) return [];

  const firings: TriggerFiring[] = [];
  for (const trigger of triggers) {
    if (!trigger.enabled) continue;
    const spec = storedSpecOf(trigger);
    if (spec.kind !== "threshold") continue;
    if (spec.metric !== reading.metric) continue;
    if (!satisfiesOp(reading.value, spec.op, spec.value)) continue;

    firings.push({ trigger, event: buildTriggerEvent(trigger, { kind: "threshold", reading }) });
  }

  return firings.sort(compareIds);
}

/**
 * The same five comparisons as `satisfies` in lib/runtime/policy.ts, which is
 * private to that module. The duplication is deliberate rather than accidental —
 * the enforcement layer's copy must not grow a dependency on the scheduler — but
 * the two must always agree about what `<=` means.
 */
function satisfiesOp(value: number, op: Op, threshold: number): boolean {
  switch (op) {
    case "<":
      return value < threshold;
    case "<=":
      return value <= threshold;
    case ">":
      return value > threshold;
    case ">=":
      return value >= threshold;
    case "==":
      return value === threshold;
  }

  // Unreachable through the type system, reachable at run time: a plan is JSON, so
  // `op` is whatever string crossed the seam. An operator this runtime does not
  // implement cannot be evaluated, and a comparison that cannot be evaluated must
  // not fire — the same posture policy.ts takes on an unrecognised operating mode.
  // It returns rather than throws so one malformed trigger cannot take down the
  // tick for every other trigger in the plan; registration is where a bad spec is
  // meant to be reported, and it reports this one too.
  return false;
}

/* ═══════════════════════════ Dependency ═══════════════════════════ */

/**
 * The dependency triggers waiting on one finished run.
 *
 * SUCCESSFULLY means `completed` and nothing else. A workflow chained behind
 * another is chained behind its RESULT — the BrightPath collections summary is
 * meaningless if the reminder sweep refused, failed or is still sitting in the
 * approvals inbox — so anything other than a clean completion fires nothing.
 *
 * Validator rule 5 guarantees the referenced workflow exists, is enabled, and
 * belongs to the same agent, so the match is a plain comparison. The agent id is
 * still compared: two agents may legitimately own workflows with the same id, and
 * a cross-agent match would be orchestration the contract does not model.
 */
export function dependencyFirings(
  triggers: ScheduledTrigger[],
  completion: WorkflowCompletion,
): TriggerFiring[] {
  if (completion.status !== "completed") return [];

  const firings: TriggerFiring[] = [];
  for (const trigger of triggers) {
    if (!trigger.enabled) continue;
    const spec = storedSpecOf(trigger);
    if (spec.kind !== "dependency") continue;
    if (trigger.agentId !== completion.agentId) continue;
    if (spec.afterWorkflowId !== completion.workflowId) continue;
    // Rule 5 already refuses a self-dependency at the gate; refused again here
    // because a workflow that triggers itself on completion runs forever.
    if (trigger.workflowId === completion.workflowId) continue;

    firings.push({
      trigger,
      event: buildTriggerEvent(trigger, { kind: "dependency", completion }),
    });
  }

  return firings.sort(compareIds);
}

/* ═══════════════════════ Building the firing ═══════════════════════ */

/**
 * The `TriggerEvent` one firing hands the executor, including the idempotency key
 * the executor claims.
 *
 * The single place a key is derived, for every kind. Two guards run before any of
 * them: a disabled trigger cannot produce a firing at all, and a cause whose kind
 * does not match the trigger's throws rather than minting a key from the wrong
 * shape — a mismatched pair is a bug in the caller, and letting it through would
 * produce a plausible-looking key that no second computation could reproduce.
 */
export function buildTriggerEvent(trigger: ScheduledTrigger, cause: TriggerCause): TriggerEvent {
  const spec = storedSpecOf(trigger);

  if (trigger.kind !== spec.kind) {
    throw new Error(
      `Trigger ${trigger.triggerId} is recorded as kind "${trigger.kind}" but carries a ` +
        `"${spec.kind}" spec. The record is inconsistent and no firing can be built from it; ` +
        `re-register the plan to rebuild it.`,
    );
  }

  if (!trigger.enabled) {
    throw new Error(
      `Trigger ${trigger.triggerId} (${trigger.agentId}/${trigger.workflowId}) is disabled and ` +
        `must not fire. A disabled workflow has no path to a run.`,
    );
  }

  const identity = { agentId: trigger.agentId, workflowId: trigger.workflowId };

  switch (spec.kind) {
    case "schedule": {
      if (cause.kind !== "schedule") return mismatch(trigger, cause);
      const fireMs = cause.fireAt.getTime();
      if (!Number.isFinite(fireMs)) {
        throw new Error(
          `Trigger ${trigger.triggerId} was asked to fire at an invalid instant ` +
            `(${String(cause.fireAt)}). The fire instant is the idempotency key, so it must be ` +
            `a real time.`,
        );
      }
      // Canonical ISO, from the instant rather than from whatever string the caller
      // held: the key must not depend on how the same moment was spelled.
      const firedAt = new Date(fireMs).toISOString();
      return {
        kind: "schedule",
        ...identity,
        firedAt,
        payload: { cron: spec.cron, timezone: spec.timezone, scheduledFor: firedAt },
        idempotencyKey: `${trigger.triggerId}#schedule@${firedAt}`,
      };
    }

    case "event": {
      if (cause.kind !== "event") return mismatch(trigger, cause);
      const inbound = cause.event;
      const eventId = requireCauseIdentity(
        inbound.eventId,
        `delivery id for the ${inbound.integrationId} event "${inbound.event}"`,
        trigger,
      );
      return {
        kind: "event",
        ...identity,
        firedAt: inbound.receivedAt,
        payload: {
          integrationId: inbound.integrationId,
          event: inbound.event,
          eventId,
          data: inbound.payload,
        },
        idempotencyKey: `${trigger.triggerId}#event@${eventId}`,
      };
    }

    case "threshold": {
      if (cause.kind !== "threshold") return mismatch(trigger, cause);
      const reading = cause.reading;
      const observedAt = requireCauseIdentity(
        reading.observedAt,
        `observation instant for "${reading.metric}"`,
        trigger,
      );
      return {
        kind: "threshold",
        ...identity,
        firedAt: observedAt,
        payload: {
          metric: spec.metric,
          op: spec.op,
          threshold: spec.value,
          observed: reading.value,
          observedAt,
        },
        idempotencyKey: `${trigger.triggerId}#threshold@${observedAt}`,
      };
    }

    case "dependency": {
      if (cause.kind !== "dependency") return mismatch(trigger, cause);
      const completion = cause.completion;
      const runId = requireCauseIdentity(
        completion.runId,
        `id of the completed "${completion.workflowId}" run`,
        trigger,
      );
      return {
        kind: "dependency",
        ...identity,
        firedAt: completion.completedAt,
        payload: {
          afterWorkflowId: spec.afterWorkflowId,
          upstreamRunId: runId,
          upstreamStatus: completion.status,
          completedAt: completion.completedAt,
        },
        idempotencyKey: `${trigger.triggerId}#dependency@${runId}`,
      };
    }

    case "manual": {
      if (cause.kind !== "manual") return mismatch(trigger, cause);
      const invocationId = requireCauseIdentity(
        cause.invocationId,
        "manual invocation id",
        trigger,
      );
      const at = cause.at.getTime();
      if (!Number.isFinite(at)) {
        throw new Error(
          `Manual run of ${trigger.agentId}/${trigger.workflowId} was given an invalid ` +
            `instant (${String(cause.at)}).`,
        );
      }
      return {
        kind: "manual",
        ...identity,
        firedAt: new Date(at).toISOString(),
        payload: { requestedBy: cause.requestedBy, invocationId },
        idempotencyKey: `${trigger.triggerId}#manual@${invocationId}`,
      };
    }

    default: {
      // As in registerPlanTriggers: unreachable through the types, reachable
      // through JSON. A firing cannot be built for semantics that do not exist,
      // and inventing a key for one would be worse than refusing.
      const unhandled: never = spec;
      throw new Error(
        `Trigger ${trigger.triggerId} declares kind ` +
          `"${String((unhandled as { kind?: unknown }).kind)}", which this runtime does not ` +
          `implement. No firing can be built for it.`,
      );
    }
  }
}

function mismatch(trigger: ScheduledTrigger, cause: TriggerCause): never {
  throw new Error(
    `Trigger ${trigger.triggerId} is a "${trigger.kind}" trigger but was handed a ` +
      `"${cause.kind}" cause. The idempotency key is derived from the cause, so a mismatched ` +
      `pair would produce a key nothing else could reproduce.`,
  );
}

/**
 * A cause with no identity of its own cannot be deduplicated, and a key built from
 * an empty string would be identical for every future firing of the same trigger —
 * so the first one would run and every one after it would be silently swallowed by
 * the executor's duplicate check. Loud beats silent.
 */
function requireCauseIdentity(value: string, what: string, trigger: ScheduledTrigger): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error(
    `Cannot fire ${trigger.agentId}/${trigger.workflowId}: the ${what} is missing. It is the ` +
      `firing's idempotency key, and without it a redelivery is indistinguishable from a new ` +
      `event. Supply an id that is stable across redeliveries and distinct between events.`,
  );
}

/** Total and stable, so two runs of the same tick enqueue in the same order. */
function compareIds(a: TriggerFiring, b: TriggerFiring): number {
  if (a.trigger.triggerId < b.trigger.triggerId) return -1;
  if (a.trigger.triggerId > b.trigger.triggerId) return 1;
  return 0;
}
