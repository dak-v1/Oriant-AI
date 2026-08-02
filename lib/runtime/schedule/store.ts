/**
 * lib/runtime/schedule/store.ts — the reference `SchedulerStore` (ROLE_C_PLAN M4).
 *
 * The queue has to be a store plus a pull-based worker rather than an
 * in-process timer wheel (see the header of ./types.ts), and until the M0
 * storage decision lands this is the only implementation of that store. Every
 * other M4 piece — the cron planner, the worker loop, the activation checklist
 * — is exercised through this object, so a subtle bug here would present as a
 * bug everywhere else. It is kept deliberately small for exactly that reason.
 *
 * It inherits the disciplines `InMemoryRunStore` documents, for the same
 * reasons:
 *
 *   1. NOTHING IS SHARED BY REFERENCE. Every write clones its input and every
 *      read clones its output. A job is mutated in place by its owner as it
 *      moves queued → running → succeeded, and a caller holding an alias of the
 *      stored row could rewrite `status` or `runAfter` after the fact. Under a
 *      queue that means a job a worker believes it owns quietly becoming
 *      claimable again, and the Friday sweep running twice. A real database
 *      gives us this isolation for free, so the test double must too, otherwise
 *      M4 passes against behaviour production will not have.
 *
 *   2. INSERTION-ORDERED MAPS. `Map` preserves the order in which keys were
 *      first set, including across an update, which is what makes every list
 *      method reproducible without sorting anything. Determinism is an M3 exit
 *      criterion and M4 must not regress it.
 *
 * ORDERING, stated once so each method below only has to name its key: every
 * list method returns insertion order — the order things were registered,
 * enqueued or activated. `listJobs` in particular does NOT order by `runAfter`:
 * backoff moves that field, so a due-ordered listing would reshuffle itself
 * between two reads of a queue nobody touched. There are two exceptions:
 * `claimNextJob`, which is a priority read rather than a listing and orders by
 * due time, and `listAgentConfigs`, which orders by agent id — see there for
 * why that one is worth breaking the rule for.
 *
 * Time is never read here. `claimNextJob` is handed the instant to compare
 * against, so this file needs no `Clock`, cannot drift from the one the worker
 * is using, and contains no `Date.now()` for the determinism check to find.
 */

import type { AgentRuntimeConfig, ApprovedPlan, TriggerSpec } from "../../plan/types";
import { assertConcurrencyStorable, assertCurrentPlanStorable } from "./types";
import type {
  AgentRuntimeRecord,
  Deployment,
  JobStatus,
  QueuedJob,
  ScheduledTrigger,
  SchedulerStore,
} from "./types";

/* ═══════════════════════════ Cloning ═══════════════════════════ */

/**
 * `structuredClone` rather than a JSON round-trip: `TriggerEvent.payload` is
 * arbitrary caller data and may legitimately hold Dates, Maps or Sets, all of
 * which JSON would flatten or drop on the way through.
 */
function clone<T>(value: T): T {
  return structuredClone(value);
}

/* ═══════════════════════════ Write guards ═══════════════════════════ */

/**
 * `runAfter` is the only field this store's own correctness depends on: it
 * decides whether a job is claimable at all. An unparseable value would make a
 * job silently unclaimable — sitting in the queue, reading as `queued`, never
 * running — so it is refused at the write rather than discovered at 9am on a
 * Friday when the sweep does not fire. Both write paths check it, because
 * backoff rewrites `runAfter` through `saveJob`.
 */
function assertRunAfterParseable(job: QueuedJob, method: string): void {
  if (Number.isNaN(Date.parse(job.runAfter))) {
    throw new Error(
      `InMemorySchedulerStore.${method}: job "${job.jobId}" has runAfter ` +
        `"${job.runAfter}", which is not a parseable ISO 8601 instant`,
    );
  }
}

/* ═══════════════════════════ Scheduler store ═══════════════════════════ */

export class InMemorySchedulerStore implements SchedulerStore {
  /** Insertion-ordered, which is what makes list ordering reproducible. */
  private readonly triggers = new Map<string, ScheduledTrigger>();
  private readonly jobs = new Map<string, QueuedJob>();
  private readonly deployments = new Map<string, Deployment>();
  private readonly agentStates = new Map<string, AgentRuntimeRecord>();
  private readonly agentConfigs = new Map<string, AgentRuntimeConfig>();
  /**
   * Not a Map, because "current" is one fact rather than a keyed collection.
   * Null until something is ingested, and that null is the ordinary state of a
   * fresh clone rather than a missing row.
   */
  private currentPlan: ApprovedPlan | null = null;

  /* ── Triggers ── */

  /**
   * Upsert. Re-registering an id is how a re-activation adopts an edited spec,
   * and how the worker records `lastFiredAt` / `nextFireAt` after a fire, so
   * unlike the queue there is nothing here to protect against.
   */
  async saveTrigger(trigger: ScheduledTrigger): Promise<void> {
    this.triggers.set(trigger.triggerId, clone(trigger));
  }

  async getTrigger(triggerId: string): Promise<ScheduledTrigger | null> {
    const found = this.triggers.get(triggerId);
    return found === undefined ? null : clone(found);
  }

  /** Registration order. Every supplied filter is AND-ed. */
  async listTriggers(filter?: {
    planId?: string;
    agentId?: string;
    enabled?: boolean;
    kind?: TriggerSpec["kind"];
  }): Promise<ScheduledTrigger[]> {
    const out: ScheduledTrigger[] = [];
    for (const trigger of this.triggers.values()) {
      if (filter?.planId !== undefined && trigger.planId !== filter.planId) continue;
      if (filter?.agentId !== undefined && trigger.agentId !== filter.agentId) continue;
      // `!== undefined` rather than a truthiness test. `enabled: false` is the
      // interesting query — "what did pausing an agent switch off" — and a
      // truthy check would drop that filter and return the whole table.
      if (filter?.enabled !== undefined && trigger.enabled !== filter.enabled) continue;
      if (filter?.kind !== undefined && trigger.kind !== filter.kind) continue;
      out.push(clone(trigger));
    }
    return out;
  }

  /* ── Queue ── */

  /**
   * Insert only. A duplicate job id means the caller lost track of a job that
   * may already be running, and overwriting it would reset a claimed job to
   * whatever the caller passed — a second worker would then pick up work that
   * is already in flight, which is the one failure `claimNextJob` exists to
   * prevent.
   */
  async enqueueJob(job: QueuedJob): Promise<void> {
    if (this.jobs.has(job.jobId)) {
      throw new Error(
        `InMemorySchedulerStore.enqueueJob: job "${job.jobId}" already exists`,
      );
    }
    assertRunAfterParseable(job, "enqueueJob");
    this.jobs.set(job.jobId, clone(job));
  }

  /**
   * Update only. An unknown id is a bug in the caller rather than a request to
   * insert: a job that never went through `enqueueJob` was never ordered
   * against the rest of the queue, and inserting it here would sidestep the
   * duplicate check above.
   */
  async saveJob(job: QueuedJob): Promise<void> {
    if (!this.jobs.has(job.jobId)) {
      throw new Error(
        `InMemorySchedulerStore.saveJob: unknown job "${job.jobId}" — call enqueueJob first`,
      );
    }
    assertRunAfterParseable(job, "saveJob");
    this.jobs.set(job.jobId, clone(job));
  }

  async getJob(jobId: string): Promise<QueuedJob | null> {
    const found = this.jobs.get(jobId);
    return found === undefined ? null : clone(found);
  }

  /**
   * Enqueue order, deliberately not due order — see the header. Every supplied
   * filter is AND-ed.
   */
  async listJobs(filter?: {
    status?: JobStatus;
    agentId?: string;
  }): Promise<QueuedJob[]> {
    const out: QueuedJob[] = [];
    for (const job of this.jobs.values()) {
      if (filter?.status !== undefined && job.status !== filter.status) continue;
      if (filter?.agentId !== undefined && job.agentId !== filter.agentId) continue;
      out.push(clone(job));
    }
    return out;
  }

  /**
   * The concurrency primitive: select the job that has been due longest and
   * flip it to `running`, or return null when nothing is claimable.
   *
   * Sort key: `runAfter` ascending, ties resolved by enqueue order — map
   * iteration is insertion order and the scan below keeps the first of any tie.
   * Under a fixed clock a whole tick's worth of jobs shares one `runAfter`, so
   * that tie is the common case rather than the edge case.
   *
   * ATOMICITY. There is no `await` between reading the map and writing the
   * claimed row back, and that is deliberate rather than incidental. A turn of
   * the event loop cannot be interrupted, so two workers calling this
   * concurrently run one body strictly after the other, and the second sees a
   * job that is no longer `queued`. Adding an await anywhere inside the scan —
   * for a lookup, a log line, anything — reopens exactly the window this method
   * exists to close, and the Friday sweep fires twice.
   *
   * The file-backed implementation gets no such gift: its select and its write
   * are separated by real I/O, so it has to make the flip atomic itself — a
   * lock file, a compare-and-swap against the row it read, or a single atomic
   * rename. Same contract, more work.
   *
   * `attempt` is left untouched. Retry accounting belongs to the worker, the
   * only component that knows whether a claim is a first try or a re-delivery.
   */
  async claimNextJob(now: Date): Promise<QueuedJob | null> {
    const nowMs = now.getTime();
    if (!Number.isFinite(nowMs)) {
      // An Invalid Date compares false against everything, so the queue would
      // simply stop — no error, no claims, jobs piling up. Say so instead.
      throw new Error(
        `InMemorySchedulerStore.claimNextJob: "now" is not a valid Date (${String(now)})`,
      );
    }

    let candidate: QueuedJob | null = null;
    let candidateDueMs = 0;

    for (const job of this.jobs.values()) {
      // Anything not `queued` belongs to somebody else: `running` is claimed,
      // and succeeded / failed / dead_letter / skipped are terminal. Written as
      // an equality test rather than a list of exclusions, so a status added to
      // `JobStatus` later is unclaimable until someone decides otherwise.
      if (job.status !== "queued") continue;

      const dueMs = Date.parse(job.runAfter);
      // Negated `<=` rather than `>`, so an unparseable instant (NaN, which
      // compares false either way) lands on "not claimable" instead of being
      // claimed by accident. The write guards make that unreachable; this is
      // the direction to fail in if it ever stops being.
      if (!(dueMs <= nowMs)) continue;

      // Strictly-less keeps the FIRST of any tie, which with insertion-ordered
      // iteration means the earliest enqueued.
      if (candidate === null || dueMs < candidateDueMs) {
        candidate = job;
        candidateDueMs = dueMs;
      }
    }

    if (candidate === null) return null;

    // A shallow copy is enough: the row it copies from is dropped from the map
    // in the next statement and every read hands out a clone, so no other
    // holder of the nested objects it shares can exist. `Map.set` on an
    // existing key keeps that key's original position, so claiming a job does
    // not reorder the queue.
    const claimed: QueuedJob = {
      ...candidate,
      status: "running",
      startedAt: now.toISOString(),
    };
    this.jobs.set(claimed.jobId, claimed);
    return clone(claimed);
  }

  /* ── The current plan ── */

  /**
   * Upsert of the single "what we intend" row. The newest write wins, including
   * one that lowers the version — see `SchedulerStore.saveCurrentPlan`.
   *
   * Cloned on the way in like everything else here, and for a sharper reason
   * than usual: the caller's plan is the same object the pipeline is about to
   * hand to `buildPlan` and `activate`, and an alias stored here would let a
   * later stage mutate the record drift is measured against. The two plans would
   * then agree by accident rather than by fact.
   */
  async saveCurrentPlan(plan: ApprovedPlan): Promise<void> {
    // Same guard as the file and Postgres stores. A field a Map would hold and
    // an integer column would not is how a green suite lies about production.
    assertCurrentPlanStorable(plan, "InMemorySchedulerStore.saveCurrentPlan");
    this.currentPlan = clone(plan);
  }

  /** Null means nothing has been ingested yet. Never the fixture; see the interface. */
  async getCurrentPlan(): Promise<ApprovedPlan | null> {
    return this.currentPlan === null ? null : clone(this.currentPlan);
  }

  /* ── Deployments ── */

  /** Upsert, keyed by deployment id. Insertion order is go-live order. */
  async saveDeployment(deployment: Deployment): Promise<void> {
    this.deployments.set(deployment.deploymentId, clone(deployment));
  }

  /**
   * The most recent go-live for this plan. `Deployment` records an activation
   * and has no deactivation counterpart, so "active" can only mean "latest":
   * re-activating supersedes the previous record rather than closing it.
   *
   * Latest is decided by `activatedAt`, falling back to insertion order on a
   * tie so two deployments stamped by the same fixed clock resolve to the one
   * saved second. `planVersion` is deliberately not consulted — a caller asking
   * "is THIS version live" compares it themselves, because a store that
   * filtered on it would report a rollback to an earlier version as no
   * deployment at all.
   */
  async getActiveDeployment(planId: string): Promise<Deployment | null> {
    let latest: Deployment | null = null;
    let latestMs = 0;

    for (const deployment of this.deployments.values()) {
      if (deployment.planId !== planId) continue;
      const parsed = Date.parse(deployment.activatedAt);
      // An unreadable stamp sorts older than everything readable rather than
      // winning by accident. It can still be returned when it is all there is.
      const ms = Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
      // `>=` keeps the LAST of a tie — the opposite of the claim scan above,
      // and for the opposite reason: there the oldest wins, here the newest.
      if (latest === null || ms >= latestMs) {
        latest = deployment;
        latestMs = ms;
      }
    }

    return latest === null ? null : clone(latest);
  }

  /** Go-live order, oldest first — this list is read as an audit trail. */
  async listDeployments(): Promise<Deployment[]> {
    return Array.from(this.deployments.values(), (d) => clone(d));
  }

  /* ── Agent runtime state ── */

  /**
   * Upsert, keyed by agent id: this is current state, not a history. `Map.set`
   * on an existing key keeps its original position, so an agent flipping
   * active → paused does not jump to the end of the roster.
   */
  async saveAgentState(record: AgentRuntimeRecord): Promise<void> {
    this.agentStates.set(record.agentId, clone(record));
  }

  async getAgentState(agentId: string): Promise<AgentRuntimeRecord | null> {
    const found = this.agentStates.get(agentId);
    return found === undefined ? null : clone(found);
  }

  /** First-registered order, which for an activation is plan order. */
  async listAgentStates(): Promise<AgentRuntimeRecord[]> {
    return Array.from(this.agentStates.values(), (r) => clone(r));
  }

  /* ── Agent runtime config ── */

  /**
   * Upsert, keyed by agent id: an operator setting a knob replaces the previous
   * setting rather than appending to a history nobody reads.
   */
  async saveAgentConfig(config: AgentRuntimeConfig): Promise<void> {
    // Same guard as the file and Postgres stores. A Map would hold anything;
    // accepting what the production store rejects is how a green suite lies.
    assertConcurrencyStorable(config, "InMemorySchedulerStore.saveAgentConfig");
    this.agentConfigs.set(config.agentId, clone(config));
  }

  /**
   * Null means unconfigured, which is not an error — the caller's defaults
   * apply. Nothing here invents one, for the reason `SchedulerStore` gives.
   */
  async getAgentConfig(agentId: string): Promise<AgentRuntimeConfig | null> {
    const found = this.agentConfigs.get(agentId);
    return found === undefined ? null : clone(found);
  }

  /**
   * Agent id order, and the one listing here that is not insertion order.
   *
   * `AgentRuntimeRecord` has an `updatedAt` the durable stores could have sorted
   * on and deliberately did not; `AgentRuntimeConfig` has no instant at all, so
   * a file listing has nothing to derive an order from except the id. Sorting by
   * it HERE too is what makes the three implementations return the same list in
   * the same order — which matters more than this file's insertion-order habit,
   * because the in-memory store is what every verify target runs against and the
   * other two are what production uses.
   */
  async listAgentConfigs(): Promise<AgentRuntimeConfig[]> {
    const out = Array.from(this.agentConfigs.values(), (c) => clone(c));
    // Code-unit order, matching `compareId` in persist/table.ts and Postgres's
    // COLLATE "C". A locale-aware comparison would order the same ids
    // differently on a machine with a different locale.
    out.sort((a, b) => (a.agentId === b.agentId ? 0 : a.agentId < b.agentId ? -1 : 1));
    return out;
  }

  /* ── Test helpers ── */

  /** Drops all state. Used between tests so cases cannot leak into each other. */
  reset(): void {
    this.triggers.clear();
    this.jobs.clear();
    this.deployments.clear();
    this.agentStates.clear();
    this.agentConfigs.clear();
    // Back to null rather than back to the fixture: "nothing ingested" is the
    // state a fresh store is in, and it is the resolver's job to say so.
    this.currentPlan = null;
  }

  /** Every job in enqueue order, finished ones included. */
  snapshotJobs(): QueuedJob[] {
    return Array.from(this.jobs.values(), (job) => clone(job));
  }

  /** Every trigger in registration order. */
  snapshotTriggers(): ScheduledTrigger[] {
    return Array.from(this.triggers.values(), (t) => clone(t));
  }
}
