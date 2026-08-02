/**
 * lib/runtime/schedule/types.ts — scheduling and activation (ROLE_C_PLAN M4).
 *
 * M4 is where "live" starts to mean something. Everything before it runs
 * because a human asked; from here a trigger fires, a worker picks the job up,
 * and a run appears with nobody watching. That inverts the risk profile, so
 * three properties are load-bearing and every type below exists to hold one of
 * them:
 *
 *   1. A TRIGGER NEVER FIRES TWICE. Cron ticks are re-delivered, workers crash
 *      mid-job, and a queue that is honest about at-least-once delivery has to
 *      be paired with idempotency at the point of effect. Every job carries the
 *      `TriggerEvent.idempotencyKey` the executor already claims through
 *      `RunStore.claimIdempotencyKey`, so a duplicate is refused at the one
 *      place that matters rather than the several places that are convenient.
 *
 *   2. POLICY GATES THE START, NOT JUST THE ACT. `resolveAct` decides whether
 *      an agent may perform one operation; `resolveRunStart` decides whether it
 *      may wake up at all — quiet hours and `maxRunsPerDay`. Until M4 nothing
 *      called the second one. A refused start is a first-class job outcome
 *      (`skipped`) rather than an error, because "correctly did nothing at 3am"
 *      is a success and must not page anyone.
 *
 *   3. ACTIVATION GATES ON EVIDENCE, NOT ON A BUTTON. The three inputs are the
 *      real ones: packages built (M2), sandbox passed (M3) and required
 *      integrations connected (Role D's registry). Each gate is re-derived on
 *      read rather than cached, because a stale "ready" is the one failure mode
 *      that ships a workforce on evidence gathered before the plan changed.
 *
 * The queue is deliberately a STORE plus a pull-based worker rather than an
 * in-process timer wheel. A timer wheel cannot survive a restart, and a paused
 * run outliving the process is the whole point of the approval interrupt.
 */

import type { AgentRuntimeConfig, ApprovedPlan, TriggerSpec } from "../../plan/types";
import type { TriggerEvent } from "../types";

/* ═══════════════════════ Agent runtime state ═══════════════════════ */

/**
 * Role C's half of the status split in PLAN_CONTRACT §4.2. This never appears
 * in an `ApprovedPlan`: the plan says what an agent SHOULD do, this says what
 * it is currently doing, and merging the two is how the old `AgentStatus` came
 * to mean nothing in particular.
 */
export type AgentRuntimeState =
  | "building"
  | "validated"
  | "active"
  | "paused"
  | "failed";

export interface AgentRuntimeRecord {
  agentId: string;
  agentVersion: number;
  state: AgentRuntimeState;
  /** Why the agent is in this state; shown in the Agents roster (M6). */
  detail: string;
  updatedAt: string;
}

/* ═══════════════════════ Agent runtime config ═══════════════════════ */

/**
 * Declared in lib/plan/types.ts because PLAN_CONTRACT §4.3 defines it there as
 * the thing an `ApprovedPlan` must NOT carry, and re-exported here so the
 * scheduler and its three stores name every type they persist from one module
 * rather than reaching into the planning lane for exactly one of them.
 *
 * CONFIG, NOT STATE, and the distinction is the reason it is a second table
 * rather than three more fields on `AgentRuntimeRecord` (STORAGE.md §3.12). The
 * record above is written by the RUNTIME on every transition; this is written by
 * an OPERATOR and read by the scheduler. Merging a thing that changes on every
 * step with a thing that changes when a human decides it should is how the old
 * `AgentStatus` came to mean nothing in particular — and it would make an
 * operator's concurrency setting something a state transition could overwrite.
 */
export type { AgentRuntimeConfig };

/**
 * Rejects a config no store could hold, BEFORE any store is asked to hold it.
 *
 * This lives here rather than in a store because the three implementations
 * disagreed about it, and disagreed in the worst direction: `concurrency` is an
 * `integer` column in Postgres, so 2.5 or 1e12 threw there, while the in-memory
 * and file stores took them happily. Every check in `npm run verify` runs
 * in-memory, so the strict implementation was the one nothing exercised — a
 * value that passed the whole suite would fail in production and nowhere else.
 * A shared guard is what makes the suite's verdict mean something about the
 * store the product actually runs on.
 *
 * `>= 1` rather than `>= 0` because this is a worker count. Zero is not a
 * quieter agent, it is a stopped one, and an agent is stopped by its state
 * (`AgentRuntimeRecord`) rather than by a config value that would leave the
 * roster reporting it as running while it never picked up a job.
 */
export function assertConcurrencyStorable(config: AgentRuntimeConfig, method: string): void {
  const { concurrency } = config;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 2147483647) {
    throw new Error(
      `${method}: agent "${config.agentId}" has concurrency ${String(concurrency)}, which is ` +
        `not a whole number of workers between 1 and 2147483647. Every store rejects this, ` +
        `so it fails the same way in memory, on disk and in Postgres.`,
    );
  }
}

/* ═══════════════════════ The current plan ═══════════════════════ */

/**
 * Rejects a plan no store could hold, BEFORE any store is asked to hold it.
 *
 * Same reasoning as `assertConcurrencyStorable` above, one entity over, and the
 * same three-way disagreement waiting to happen: `oriant_current_plan` gives
 * `plan_version` an `integer` column and `approved_at` a `timestamptz`, so a
 * version of 2.5 and an `approvedAt` of "soon" throw in Postgres and are written
 * happily by a `Map` and by JSON. Every check in `npm run verify` runs
 * in-memory, so without this the strict implementation is again the one nothing
 * exercises, and a plan that passed the whole suite would fail on the store the
 * product deploys on.
 *
 * The three fields are the ones a store DENORMALISES, not the ones the contract
 * cares about — plan validity is `validateApprovedPlan`'s question and answering
 * it here would put two gates in disagreement. `version >= 1` because an
 * `ApprovedPlan` has been approved at least once; a version of 0 or below sorts
 * beneath every real version and would make a drift row read backwards, claiming
 * the plan asks for something older than what is running.
 */
export function assertCurrentPlanStorable(plan: ApprovedPlan, method: string): void {
  if (typeof plan.planId !== "string" || plan.planId.trim() === "") {
    throw new Error(
      `${method}: the plan has planId ${JSON.stringify(plan.planId)}, which is not a ` +
        `non-empty string. Every store denormalises it into a NOT NULL text column, and a ` +
        `current plan nothing can name is one nobody can match against a deployment.`,
    );
  }
  if (!Number.isSafeInteger(plan.version) || plan.version < 1 || plan.version > 2147483647) {
    throw new Error(
      `${method}: plan "${plan.planId}" has version ${String(plan.version)}, which is not a ` +
        `whole approval count between 1 and 2147483647. Every store rejects this, so it ` +
        `fails the same way in memory, on disk and in Postgres.`,
    );
  }
  if (Number.isNaN(Date.parse(plan.approvedAt))) {
    throw new Error(
      `${method}: plan "${plan.planId}" has approvedAt "${plan.approvedAt}", which is not a ` +
        `parseable ISO 8601 instant and cannot be stored in a timestamptz column.`,
    );
  }
}

/* ═══════════════════════════ Triggers ═══════════════════════════ */

/**
 * A trigger registered at activation. The `spec` is FROZEN at go-live: the
 * scheduler must keep firing what the owner activated even if the plan is
 * edited underneath it, and a re-activation is what adopts the new spec. That
 * is the same reasoning as the frozen `ApprovalRequest.invocation`.
 */
export interface ScheduledTrigger {
  triggerId: string;
  planId: string;
  planVersion: number;
  agentId: string;
  workflowId: string;
  kind: TriggerSpec["kind"];
  spec: TriggerSpec;
  /** Pausing an agent disables its triggers without forgetting them. */
  enabled: boolean;
  /**
   * `schedule` triggers only: the next UTC instant this cron is due, computed
   * in the trigger's own timezone. Null for every other kind — event,
   * threshold and dependency triggers are driven by something arriving, not by
   * time passing.
   */
  nextFireAt: string | null;
  lastFiredAt: string | null;
  registeredAt: string;
}

/* ═══════════════════════════ Queue ═══════════════════════════ */

/**
 * `skipped` is not a failure. It is the recorded outcome of `resolveRunStart`
 * refusing a start — quiet hours, or the daily cap — and it must be visible in
 * the Workspace so an owner can tell "the agent decided not to" apart from
 * "the agent broke".
 *
 * `dead_letter` is terminal after `maxAttempts`. Nothing retries out of it
 * automatically; it exists so a poison job stops consuming workers while
 * staying visible instead of vanishing.
 */
export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "dead_letter"
  | "skipped";

export interface QueuedJob {
  jobId: string;
  /** Null for a manual run, which has no registered trigger behind it. */
  triggerId: string | null;
  agentId: string;
  workflowId: string;
  /** Carries the idempotency key the executor claims. */
  trigger: TriggerEvent;
  status: JobStatus;
  /** 1-based. */
  attempt: number;
  maxAttempts: number;
  /**
   * Earliest instant a worker may claim this job. Backoff is expressed by
   * moving this forward rather than by sleeping, so a restart does not lose
   * the delay and a worker never blocks a slot while waiting.
   */
  runAfter: string;
  enqueuedAt: string;
  startedAt: string | null;
  endedAt: string | null;
  /** Set once the executor produced a run. */
  runId: string | null;
  /** Populated on `failed` / `dead_letter`. */
  error: string | null;
  /** Populated on `skipped` — the policy reason, in the owner's language. */
  skipReason: string | null;
}

/* ═══════════════════════════ Deployment ═══════════════════════════ */

/** The audited record of one go-live. */
export interface Deployment {
  deploymentId: string;
  planId: string;
  planVersion: number;
  activatedAt: string;
  activatedBy: string;
  /** Agent versions as activated — what is actually live, not what is planned. */
  agents: { agentId: string; agentVersion: number }[];
  /**
   * The plan exactly as deployed, frozen.
   *
   * Recorded because a deployment is the answer to "what is running", and
   * planId plus a version cannot answer it: an ingested plan is derived from a
   * handoff that lives in another lane's database and may since have changed.
   * Without this, the Operate surface has to be TOLD which plan is live, which
   * is how it ended up serving the demo fixture while an ingested workforce was
   * the thing actually deployed. It is also the audit record — what exactly was
   * live on the day someone asks.
   */
  plan: ApprovedPlan;
  triggerIds: string[];
  /** The evidence the checklist was satisfied by, frozen for audit. */
  evidence: {
    packagesReady: boolean;
    sandboxReady: boolean;
    sandboxFingerprint: string | null;
    integrationsReady: boolean;
  };
}

/* ═══════════════════════ Activation checklist ═══════════════════════ */

export type ActivationGateId = "packages" | "sandbox" | "integrations";

export interface ActivationBlocker {
  /** What is missing, in the owner's language. */
  message: string;
  /** Where to go and fix it. */
  href: string;
  agentId?: string;
  integrationId?: string;
}

export interface ActivationGate {
  id: ActivationGateId;
  label: string;
  satisfied: boolean;
  /** One-line status shown next to the gate whether or not it is satisfied. */
  detail: string;
  blockers: ActivationBlocker[];
}

export interface ActivationChecklist {
  planId: string;
  planVersion: number;
  /** True only when every gate is satisfied. Never cached — see the header. */
  ready: boolean;
  gates: ActivationGate[];
  /** Set when this plan version is already live. */
  activeDeployment: Deployment | null;
}

/* ═══════════════════════════ Persistence ═══════════════════════════ */

/**
 * Narrow on purpose, exactly like `RunStore`: the in-memory implementation is
 * the test double and a durable one swaps in without the scheduler changing.
 *
 * `claimNextJob` is the concurrency primitive. It must atomically select one
 * job whose `runAfter` has passed and flip it to `running`, so two workers
 * polling the same queue can never claim the same job. Returning the claimed
 * job rather than a lock handle keeps the worker loop honest: a worker that
 * holds a job it did not claim has no way to express that.
 */
export interface SchedulerStore {
  /* Triggers */
  saveTrigger(trigger: ScheduledTrigger): Promise<void>;
  getTrigger(triggerId: string): Promise<ScheduledTrigger | null>;
  listTriggers(filter?: {
    planId?: string;
    agentId?: string;
    enabled?: boolean;
    kind?: TriggerSpec["kind"];
  }): Promise<ScheduledTrigger[]>;

  /* Queue */
  enqueueJob(job: QueuedJob): Promise<void>;
  /** Atomically claim one runnable job, or null when none is due. */
  claimNextJob(now: Date): Promise<QueuedJob | null>;
  saveJob(job: QueuedJob): Promise<void>;
  getJob(jobId: string): Promise<QueuedJob | null>;
  listJobs(filter?: { status?: JobStatus; agentId?: string }): Promise<QueuedJob[]>;

  /* The current plan */
  /**
   * The newest plan ingested from Role B: WHAT WE INTEND.
   *
   * This is deliberately NOT `Deployment.plan`, which is what is RUNNING, and
   * keeping the two apart is the entire point of the pair. Drift is the
   * difference between them — `reconcileAgents` (../active-plan.ts) reads both
   * and can only report `drifted`, `planned` or `retired` when they are allowed
   * to disagree. Deriving one from the other, in either direction, makes every
   * agent read `running` forever and quietly deletes the lifecycle.
   *
   * ONE ROW, OVERWRITTEN. "Current" is a single fact, so this is an upsert
   * rather than an append and the newest write wins outright — including a write
   * that lowers the version, which is what a rollback in Role B's planner looks
   * like from here. A versioned table was the alternative and was rejected: the
   * history of what was intended already exists in `role_c_handoffs` on Role B's
   * side, and the history of what actually went live is `listDeployments()`. A
   * third log would be a third thing to keep in step with those two.
   *
   * The write is the pipeline's (../pipeline/run.ts), and it happens once
   * validation passes — see there for why that instant and not another.
   */
  saveCurrentPlan(plan: ApprovedPlan): Promise<void>;
  /**
   * Null is the ordinary answer on a fresh clone, not the error one: nothing has
   * been ingested, so there is no plan the customer intends yet. Nothing here
   * substitutes the demo fixture — that decision belongs to
   * `resolveCurrentPlan` (../current-plan.ts), which returns a source
   * discriminant with it, because a store that quietly handed back BrightPath
   * would make "this is your workforce" a lie no caller could detect.
   */
  getCurrentPlan(): Promise<ApprovedPlan | null>;

  /* Deployments */
  saveDeployment(deployment: Deployment): Promise<void>;
  getActiveDeployment(planId: string): Promise<Deployment | null>;
  listDeployments(): Promise<Deployment[]>;

  /* Agent runtime state */
  saveAgentState(record: AgentRuntimeRecord): Promise<void>;
  getAgentState(agentId: string): Promise<AgentRuntimeRecord | null>;
  listAgentStates(): Promise<AgentRuntimeRecord[]>;

  /* Agent runtime config */
  saveAgentConfig(config: AgentRuntimeConfig): Promise<void>;
  /**
   * Null is the ordinary answer, not the error one: no operator has set this
   * agent's knobs, so the caller's defaults apply. Returning null rather than a
   * default record is what keeps the defaults in ONE place — `DEFAULT_CONCURRENCY`
   * in ./worker.ts is the worker's decision to make, and three stores each
   * inventing a fallback would be three chances for them to disagree about what
   * "unconfigured" means.
   */
  getAgentConfig(agentId: string): Promise<AgentRuntimeConfig | null>;
  /** Every agent an operator has configured — never every agent in the plan. */
  listAgentConfigs(): Promise<AgentRuntimeConfig[]>;
}

/* ═══════════════════════════ Wiring ═══════════════════════════ */

export interface SchedulerDeps {
  store: SchedulerStore;
  clock: { now(): Date };
  newId(prefix: string): string;
}
