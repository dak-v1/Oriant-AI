/**
 * lib/runtime/persist/scheduler-store.ts — the durable `SchedulerStore`
 * (ROLE_C_PLAN M4).
 *
 * `lib/runtime/schedule/types.ts` is explicit about why the queue is a STORE
 * plus a pull-based worker rather than an in-process timer wheel: "a timer wheel
 * cannot survive a restart, and a paused run outliving the process is the whole
 * point of the approval interrupt." That reasoning only pays off if the store
 * itself survives the restart, which until this file it did not. A queue held in
 * a `Map` is a timer wheel with extra steps.
 *
 * ONE METHOD IS DIFFICULT AND THE REST ARE BOOKKEEPING. `InMemorySchedulerStore`
 * says so plainly, and it is worth quoting because it is the specification this
 * file is written against:
 *
 *   "The file-backed implementation gets no such gift: its select and its write
 *    are separated by real I/O, so it has to make the flip atomic itself — a
 *    lock file, a compare-and-swap against the row it read, or a single atomic
 *    rename. Same contract, more work."
 *
 * A lock file is the option taken, and specifically the one from atomic.ts,
 * because it is the only one of the three that is atomic across PROCESSES as
 * well as within one. A compare-and-swap on the row would need a version column
 * the type does not have, and an atomic rename can only move one file — it
 * cannot express "of all the queued jobs, take the oldest due one". The whole
 * select-and-flip happens inside the lock; nothing else in this file takes it,
 * because nothing else can double-claim a job.
 *
 * WHAT IT MEANS FOR THE FRIDAY SWEEP. Two workers polling the same directory
 * cannot both claim the same job, and a worker that crashes holding the lock
 * releases it after `staleAfterMs` rather than wedging the queue permanently.
 * A worker that crashes holding a CLAIMED JOB is a different problem, and one
 * this store deliberately does not solve: the job sits in `running` until
 * something decides it is abandoned. That decision needs a heartbeat and belongs
 * to the worker, not to the store — see STORAGE.md.
 *
 * Every write guard, error message and ordering rule below mirrors
 * `InMemorySchedulerStore`, so a caller cannot tell the two apart except where
 * STORAGE.md says it can. Time is never read here: `claimNextJob` is handed the
 * instant to compare against, so this file cannot drift from the clock the
 * worker is using and contains no `Date.now()` for the determinism check to find.
 */

import { createHash } from "node:crypto";
import path from "node:path";
import type { TriggerSpec } from "../../plan/types";
import type {
  AgentRuntimeRecord,
  Deployment,
  JobStatus,
  QueuedJob,
  ScheduledTrigger,
  SchedulerStore,
} from "../schedule/types";
import { acquireLock } from "./atomic";
import { Table, compareByInstant, compareId, compareInstant } from "./table";

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
      `FileSchedulerStore.${method}: job "${job.jobId}" has runAfter ` +
        `"${job.runAfter}", which is not a parseable ISO 8601 instant`,
    );
  }
}

/* ═══════════════════════════ Trigger file ids ═══════════════════════════ */

/**
 * A trigger id is `trg::<planId>::<agentId>::<workflowId>` and has to become a
 * filename. It cannot: `recordFileName` (./atomic.ts) allows letters, digits and
 * `. _ - @`, and `:` is not merely disallowed there but illegal on Windows,
 * where it opens an NTFS alternate data stream rather than a file.
 *
 * Neither side is wrong, so neither side moves. `triggerIdFor`
 * (lib/runtime/schedule/triggers.ts) derives that id rather than minting one so
 * that re-activating a plan overwrites the same trigger in place and the same
 * Friday nine o'clock always produces the same idempotency key — the header
 * there explains what a generated id would cost. The path guard is equally
 * load-bearing: a record id that can name a directory can name any directory.
 *
 * So the id is HASHED into a bounded, always-safe file name, exactly as
 * `FileRunStore.idempotencyFileId` does for the same reason one table over. The
 * raw `triggerId` lives inside the record, so `listTriggers` is unaffected and
 * the directory stays inspectable — and `getTrigger` compares it back, so a
 * collision is loud rather than silently returning somebody else's trigger.
 */
function triggerFileId(triggerId: string): string {
  return createHash("sha256").update(triggerId, "utf8").digest("hex");
}

/* ═══════════════════════════ Scheduler store ═══════════════════════════ */

export class FileSchedulerStore implements SchedulerStore {
  private readonly triggers: Table<ScheduledTrigger>;
  private readonly jobs: Table<QueuedJob>;
  private readonly deployments: Table<Deployment>;
  private readonly agentStates: Table<AgentRuntimeRecord>;
  private readonly claimLockFile: string;

  constructor(readonly root: string) {
    this.triggers = new Table<ScheduledTrigger>(path.join(root, "schedules"), "schedules");
    this.jobs = new Table<QueuedJob>(path.join(root, "queue-jobs"), "queue_jobs");
    this.deployments = new Table<Deployment>(path.join(root, "deployments"), "deployments");
    this.agentStates = new Table<AgentRuntimeRecord>(
      path.join(root, "agent-runtime-state"),
      "agent_runtime_state",
    );
    // Outside every table directory, so a lock can never be listed as a record
    // and `reset()` cannot delete one that is currently held.
    this.claimLockFile = path.join(root, ".locks", "queue-jobs.claim");
  }

  /* ── Triggers ── */

  /**
   * Upsert. Re-registering an id is how a re-activation adopts an edited spec,
   * and how the worker records `lastFiredAt` / `nextFireAt` after a fire, so
   * unlike the queue there is nothing here to protect against.
   */
  async saveTrigger(trigger: ScheduledTrigger): Promise<void> {
    await this.triggers.write(triggerFileId(trigger.triggerId), trigger);
  }

  /**
   * The stored record carries its own `triggerId`, so the hash is checked rather
   * than trusted. With SHA-256 the mismatch branch is unreachable in practice;
   * it costs one string comparison to make sure a collision can never hand the
   * worker a different workflow's schedule and have it look correct.
   */
  async getTrigger(triggerId: string): Promise<ScheduledTrigger | null> {
    const stored = await this.triggers.read(triggerFileId(triggerId));
    if (stored === null) return null;
    if (stored.triggerId !== triggerId) {
      throw new Error(
        `FileSchedulerStore.getTrigger: "${triggerId}" hashes to the same file as the ` +
          `already-stored trigger "${stored.triggerId}". This is a SHA-256 collision, ` +
          `which does not happen — suspect a hand-edited file in ${this.triggers.dir}.`,
      );
    }
    return stored;
  }

  /** Registration order, oldest first. Every supplied filter is AND-ed. */
  async listTriggers(filter?: {
    planId?: string;
    agentId?: string;
    enabled?: boolean;
    kind?: TriggerSpec["kind"];
  }): Promise<ScheduledTrigger[]> {
    const triggers = await this.triggers.all();
    const out = triggers.filter((trigger) => {
      if (filter?.planId !== undefined && trigger.planId !== filter.planId) return false;
      if (filter?.agentId !== undefined && trigger.agentId !== filter.agentId) return false;
      // `!== undefined` rather than a truthiness test. `enabled: false` is the
      // interesting query — "what did pausing an agent switch off" — and a
      // truthy check would drop that filter and return the whole table.
      if (filter?.enabled !== undefined && trigger.enabled !== filter.enabled) return false;
      if (filter?.kind !== undefined && trigger.kind !== filter.kind) return false;
      return true;
    });
    out.sort((a, b) =>
      compareByInstant(a.registeredAt, a.triggerId, b.registeredAt, b.triggerId),
    );
    return out;
  }

  /* ── Queue ── */

  /**
   * Insert only. A duplicate job id means the caller lost track of a job that
   * may already be running, and overwriting it would reset a claimed job to
   * whatever the caller passed — a second worker would then pick up work that is
   * already in flight, which is the one failure `claimNextJob` exists to prevent.
   *
   * The exclusive create makes that true across processes too, where the
   * in-memory `Map.has` check could only ever speak for one.
   */
  async enqueueJob(job: QueuedJob): Promise<void> {
    assertRunAfterParseable(job, "enqueueJob");
    if (!(await this.jobs.create(job.jobId, job))) {
      throw new Error(`FileSchedulerStore.enqueueJob: job "${job.jobId}" already exists`);
    }
  }

  /**
   * Update only. An unknown id is a bug in the caller rather than a request to
   * insert: a job that never went through `enqueueJob` was never ordered against
   * the rest of the queue, and inserting it here would sidestep the duplicate
   * check above.
   */
  async saveJob(job: QueuedJob): Promise<void> {
    assertRunAfterParseable(job, "saveJob");
    await this.jobs.update(
      job.jobId,
      job,
      `FileSchedulerStore.saveJob: unknown job "${job.jobId}" — call enqueueJob first`,
    );
  }

  async getJob(jobId: string): Promise<QueuedJob | null> {
    return this.jobs.read(jobId);
  }

  /**
   * Enqueue order, deliberately not due order: backoff moves `runAfter`, so a
   * due-ordered listing would reshuffle itself between two reads of a queue
   * nobody touched. `enqueuedAt` is immutable and is what enqueue order means.
   * Every supplied filter is AND-ed.
   */
  async listJobs(filter?: { status?: JobStatus; agentId?: string }): Promise<QueuedJob[]> {
    const jobs = await this.jobs.all();
    const out = jobs.filter((job) => {
      if (filter?.status !== undefined && job.status !== filter.status) return false;
      if (filter?.agentId !== undefined && job.agentId !== filter.agentId) return false;
      return true;
    });
    out.sort((a, b) => compareByInstant(a.enqueuedAt, a.jobId, b.enqueuedAt, b.jobId));
    return out;
  }

  /**
   * The concurrency primitive: select the job that has been due longest and flip
   * it to `running`, or return null when nothing is claimable.
   *
   * ATOMICITY. The scan and the write are separated by real I/O, so the whole
   * sequence runs under `acquireLock`. Two workers — in this process or in
   * another — serialise on that file, and the second one sees a job that is no
   * longer `queued`. The lock is released in a `finally` so a decode failure
   * mid-scan cannot wedge the queue for the full stale timeout.
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
        `FileSchedulerStore.claimNextJob: "now" is not a valid Date (${String(now)})`,
      );
    }

    const lock = await acquireLock(this.claimLockFile, now);
    try {
      const jobs = await this.jobs.all();

      const claimable = jobs.filter((job) => {
        // Anything not `queued` belongs to somebody else: `running` is claimed,
        // and succeeded / failed / dead_letter / skipped are terminal. Written as
        // an equality test rather than a list of exclusions, so a status added to
        // `JobStatus` later is unclaimable until someone decides otherwise.
        if (job.status !== "queued") return false;
        // NaN compares false either way, so an unparseable instant lands on "not
        // claimable" instead of being claimed by accident. The write guards make
        // that unreachable; this is the direction to fail in if it ever stops
        // being.
        return Date.parse(job.runAfter) <= nowMs;
      });

      if (claimable.length === 0) return null;

      // Due longest first; ties resolved by enqueue order, then by id so the
      // order is total. Under a fixed clock a whole tick's worth of jobs shares
      // one `runAfter`, so that tie is the common case rather than the edge case.
      claimable.sort(
        (a, b) =>
          compareInstant(a.runAfter, b.runAfter) ||
          compareInstant(a.enqueuedAt, b.enqueuedAt) ||
          compareId(a.jobId, b.jobId),
      );

      const next = claimable[0];
      if (!next) return null;

      // A shallow copy is enough: `next` was decoded from disk for this call
      // alone, so no other holder of the objects it shares can exist.
      const claimed: QueuedJob = { ...next, status: "running", startedAt: now.toISOString() };
      // Written through the table rather than `saveJob`, whose update-only guard
      // would cost a second existence check for a row this method just read.
      await this.jobs.write(claimed.jobId, claimed);
      return claimed;
    } finally {
      await lock.release();
    }
  }

  /* ── Deployments ── */

  /** Upsert, keyed by deployment id. */
  async saveDeployment(deployment: Deployment): Promise<void> {
    await this.deployments.write(deployment.deploymentId, deployment);
  }

  /**
   * The most recent go-live for this plan. `Deployment` records an activation
   * and has no deactivation counterpart, so "active" can only mean "latest":
   * re-activating supersedes the previous record rather than closing it.
   *
   * `planVersion` is deliberately not consulted — a caller asking "is THIS
   * version live" compares it themselves, because a store that filtered on it
   * would report a rollback to an earlier version as no deployment at all.
   */
  async getActiveDeployment(planId: string): Promise<Deployment | null> {
    const deployments = (await this.deployments.all()).filter((d) => d.planId === planId);
    let latest: Deployment | null = null;
    for (const deployment of deployments) {
      // `>=` keeps the LAST of a tie — the opposite of the claim scan above, and
      // for the opposite reason: there the oldest wins, here the newest.
      if (latest === null || compareDeploymentRecency(deployment, latest) >= 0) {
        latest = deployment;
      }
    }
    return latest;
  }

  /** Go-live order, oldest first — this list is read as an audit trail. */
  async listDeployments(): Promise<Deployment[]> {
    const deployments = await this.deployments.all();
    deployments.sort(compareDeploymentRecency);
    return deployments;
  }

  /* ── Agent runtime state ── */

  /** Upsert, keyed by agent id: this is current state, not a history. */
  async saveAgentState(record: AgentRuntimeRecord): Promise<void> {
    await this.agentStates.write(record.agentId, record);
  }

  async getAgentState(agentId: string): Promise<AgentRuntimeRecord | null> {
    return this.agentStates.read(agentId);
  }

  /**
   * Agent id order.
   *
   * The in-memory store lists first-registered order and notes that an agent
   * flipping active → paused must not jump to the end of the roster. `updatedAt`
   * is the only instant on this record and it changes on every such flip, so
   * sorting by it would do exactly what that note forbids. The agent id never
   * changes, which buys the same stability from a different field.
   */
  async listAgentStates(): Promise<AgentRuntimeRecord[]> {
    const records = await this.agentStates.all();
    records.sort((a, b) => compareId(a.agentId, b.agentId));
    return records;
  }

  /* ── Development helper ── */

  /**
   * Drops every trigger, job, deployment and agent state on disk. The claim lock
   * is left alone: it lives outside these tables and may be held right now.
   */
  async reset(): Promise<void> {
    await Promise.all([
      this.triggers.clear(),
      this.jobs.clear(),
      this.deployments.clear(),
      this.agentStates.clear(),
    ]);
  }
}

function compareDeploymentRecency(left: Deployment, right: Deployment): number {
  return (
    compareInstant(left.activatedAt, right.activatedAt) ||
    compareId(left.deploymentId, right.deploymentId)
  );
}
