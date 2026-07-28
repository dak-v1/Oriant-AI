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

import type { TriggerSpec } from "../../plan/types";
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

  /* Deployments */
  saveDeployment(deployment: Deployment): Promise<void>;
  getActiveDeployment(planId: string): Promise<Deployment | null>;
  listDeployments(): Promise<Deployment[]>;

  /* Agent runtime state */
  saveAgentState(record: AgentRuntimeRecord): Promise<void>;
  getAgentState(agentId: string): Promise<AgentRuntimeRecord | null>;
  listAgentStates(): Promise<AgentRuntimeRecord[]>;
}

/* ═══════════════════════════ Wiring ═══════════════════════════ */

export interface SchedulerDeps {
  store: SchedulerStore;
  clock: { now(): Date };
  newId(prefix: string): string;
}
