/**
 * lib/runtime/persist/pg/scheduler-store.ts — the `SchedulerStore` on Postgres
 * (docs/STORAGE.md §7).
 *
 * ONE METHOD IS THE REASON THIS FILE EXISTS; THE REST IS BOOKKEEPING.
 * `InMemorySchedulerStore` gets its atomic claim free from the event loop and
 * says so. `FileSchedulerStore` has to buy the same guarantee with a lock file
 * and pays for it twice over: a worker that crashes holding the lock wedges the
 * queue until `staleAfterMs`, and two workers can both decide the same abandoned
 * lock is stale (STORAGE.md §6.7). Postgres owns the primitive outright, so the
 * claim here is the shape §7 names:
 *
 *   UPDATE … WHERE job_id = (SELECT … FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING …
 *
 * SKIP LOCKED is the whole of it. Two workers racing neither queue behind each
 * other nor both win: the loser's select passes over the row the winner has
 * locked and takes the next due job, or finds none. No lock to go stale, no
 * timeout to tune, and it holds across processes and machines rather than across
 * one directory.
 *
 * IT STILL TAKES TWO STATEMENTS, AND THEY ARE ONE TRANSACTION. The `record`
 * column is the source of truth on read, and claiming a job changes two fields
 * inside it — `status` and `startedAt` — exactly as the other two stores do. That
 * new record cannot be computed in SQL without hand-writing the codec's encoding
 * into a jsonb path expression, which ./util.ts exists to stop three stores from
 * doing three ways. So the claim selects and flips, JavaScript decodes and
 * applies, and the rewrite lands inside the same transaction: the row lock the
 * UPDATE took is held until commit, so no other worker can observe the row in
 * between, and a decode failure rolls the whole claim back rather than stranding
 * a job in `running`.
 *
 * COLUMNS FILTER; `record` IS THE TRUTH. Every table here denormalises the few
 * fields a WHERE or an ORDER BY needs and keeps the whole runtime object in
 * `record`. Reads decode `record` and never assemble an object out of columns,
 * so a column that drifted could only ever cost a wrong row in a filter, never a
 * subtly wrong record — and every write below sets both from the same object.
 * The entity tags are the ones `FileSchedulerStore` writes (`schedules`,
 * `queue_jobs`, `deployments`, `agent_runtime_state`, `agent_runtime_config`), so
 * a record written by one store decodes in the other, which is what makes
 * `ORIANT_RUNTIME_STORAGE` a switch rather than a fork.
 *
 * ORDERING IS DERIVED, NOT RECORDED — the same rule as the other two stores
 * (STORAGE.md §6.4): an immutable column with the id as tie-break, which is
 * exactly what the indexes in ./schema.ts are built on. Under a fixed clock a
 * whole tick's worth of jobs shares one instant, so the tie-break is the common
 * case rather than the edge case.
 *
 * WHAT IS STILL NOT SOLVED. A worker that crashes holding a CLAIMED job leaves it
 * in `running` (STORAGE.md §6.6). SKIP LOCKED does not help: the claim is
 * committed, the lock is long gone, and deciding that the job was abandoned needs
 * a heartbeat, which belongs to the worker rather than to the store.
 *
 * Time is never read here, exactly as in the other two implementations:
 * `claimNextJob` is handed the instant to compare against, so this file cannot
 * drift from the clock the worker is using and contains no `Date.now()` for the
 * determinism check to find. There is no `reset()` either — `truncateAll`
 * (./schema.ts) owns that for every table at once, and `createPostgresStores`
 * wires it.
 */

import type postgres from "postgres";
import type { AgentRuntimeConfig, TriggerSpec } from "../../../plan/types";
import { assertConcurrencyStorable } from "../../schedule/types";
import type {
  AgentRuntimeRecord,
  Deployment,
  JobStatus,
  QueuedJob,
  ScheduledTrigger,
  SchedulerStore,
} from "../../schedule/types";
import type { Sql } from "./client";
import { fromJsonb, toJsonb } from "./util";

/* ═══════════════════════════ Entity tags ═══════════════════════════ */

/**
 * The names `FileSchedulerStore` passes to its `Table`s, reused verbatim. The
 * codec writes the tag into every envelope and checks it on read, so changing one
 * here would make a record written by the file store unreadable by this one while
 * looking like an ordinary rename.
 */
const ENTITY_TRIGGERS = "schedules";
const ENTITY_JOBS = "queue_jobs";
const ENTITY_DEPLOYMENTS = "deployments";
const ENTITY_AGENT_STATES = "agent_runtime_state";
const ENTITY_AGENT_CONFIGS = "agent_runtime_config";

/**
 * The denormalised copy of `ScheduledTrigger.spec` gets its own tag rather than
 * the table's. Nothing reads that column — `record` is the trigger — and a
 * distinct tag means a future reader that mistakes it for a whole trigger is told
 * so by the codec instead of receiving a `TriggerSpec` typed as a trigger.
 */
const ENTITY_TRIGGER_SPEC = "trigger_spec";

/* ═══════════════════════════ Row shapes ═══════════════════════════ */

/**
 * Only the id and the record are ever selected: the id names the row in a decode
 * failure, the record is the row. `unknown` because postgres.js has already
 * parsed the `jsonb` column and `fromJsonb` is what gives it a type.
 */
interface TriggerRow {
  trigger_id: string;
  record: unknown;
}

interface JobRow {
  job_id: string;
  record: unknown;
}

interface DeploymentRow {
  deployment_id: string;
  record: unknown;
}

interface AgentStateRow {
  agent_id: string;
  record: unknown;
}

interface AgentConfigRow {
  agent_id: string;
  record: unknown;
}

/** A statement that returns no columns; only `count` is read from it. */
type WriteResult = Record<string, never>[];

/* ═══════════════════════════ Write guards ═══════════════════════════ */

/**
 * `runAfter` is the only field this store's own correctness depends on: it
 * decides whether a job is claimable at all. An unparseable value would make a
 * job silently unclaimable — sitting in the queue, reading as `queued`, never
 * running — so it is refused at the write rather than discovered at 9am on a
 * Friday when the sweep does not fire. Both write paths check it, because backoff
 * rewrites `runAfter` through `saveJob`.
 */
function assertRunAfterParseable(job: QueuedJob, method: string): void {
  if (Number.isNaN(Date.parse(job.runAfter))) {
    throw new Error(
      `PostgresSchedulerStore.${method}: job "${job.jobId}" has runAfter ` +
        `"${job.runAfter}", which is not a parseable ISO 8601 instant`,
    );
  }
}

/**
 * An ISO instant on its way into a `timestamptz` column.
 *
 * A column cannot hold "not a date". postgres.js would turn an Invalid Date into
 * a bare RangeError raised inside its serialiser, naming neither the field nor
 * the record it came from, so the refusal happens here where both are known. The
 * file store has no equivalent because a JSON string will hold anything — this is
 * the one place the two stores are allowed to differ, and it differs by being
 * stricter.
 */
function instantColumn(iso: string, what: string): Date {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(
      `PostgresSchedulerStore: ${what} is "${iso}", which is not a parseable ISO 8601 ` +
        `instant and cannot be stored in a timestamptz column.`,
    );
  }
  return new Date(ms);
}

/**
 * A JavaScript number on its way into an `integer` column.
 *
 * Same reasoning as `instantColumn`, one type over: a column cannot hold 1.5,
 * NaN or 2^40, and postgres.js would either round silently or raise an error
 * naming neither the field nor the record. `AgentRuntimeConfig.concurrency` is
 * how many runs of an agent may be in flight, so a value that arrives as 2.7 and
 * lands as 2 or 3 is a limit nobody set — the refusal happens here, where the
 * agent it belongs to is still known.
 *
 * The file store has no equivalent because JSON will hold any number. That is
 * the second place the two stores are allowed to differ, and like the first it
 * differs by being stricter.
 */
function integerColumn(value: number, what: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error(
      `PostgresSchedulerStore: ${what} is ${String(value)}, which is not a safe integer and ` +
        `cannot be stored in an integer column.`,
    );
  }
  // 32-bit, because that is what `integer` is. A value outside it would fail in
  // the driver with a message that names neither the agent nor the field.
  if (value < -2147483648 || value > 2147483647) {
    throw new Error(
      `PostgresSchedulerStore: ${what} is ${String(value)}, which is outside the range of ` +
        `a 32-bit integer column.`,
    );
  }
  return value;
}

/** Names the row a decode failure came from, for `fromJsonb`'s `where`. */
function rowRef(table: string, id: string): string {
  return `${table} row "${id}"`;
}

/* ═══════════════════════════ Scheduler store ═══════════════════════════ */

export class PostgresSchedulerStore implements SchedulerStore {
  constructor(private readonly sql: Sql) {}

  /**
   * A record on its way into a `jsonb` column.
   *
   * `toJsonb` returns `unknown` because the codec accepts anything the runtime can
   * store; what it hands back is `JSON.parse` output, which is JSON-safe by
   * construction. The assertion states that rather than widening the helper.
   */
  private jsonb(entity: string, record: unknown): postgres.Parameter {
    return this.sql.json(toJsonb(entity, record) as postgres.JSONValue);
  }

  /* ── Triggers ── */

  /**
   * Upsert. Re-registering an id is how a re-activation adopts an edited spec,
   * and how the worker records `lastFiredAt` / `nextFireAt` after a fire, so
   * unlike the queue there is nothing here to protect against.
   */
  async saveTrigger(trigger: ScheduledTrigger): Promise<void> {
    await this.sql<WriteResult>`
      INSERT INTO oriant_schedules
        (trigger_id, plan_id, agent_id, workflow_id, kind, enabled, spec, record, registered_at)
      VALUES (
        ${trigger.triggerId},
        ${trigger.planId},
        ${trigger.agentId},
        ${trigger.workflowId},
        ${trigger.kind},
        ${trigger.enabled},
        ${this.jsonb(ENTITY_TRIGGER_SPEC, trigger.spec)},
        ${this.jsonb(ENTITY_TRIGGERS, trigger)},
        ${instantColumn(trigger.registeredAt, `trigger "${trigger.triggerId}" registeredAt`)}
      )
      ON CONFLICT (trigger_id) DO UPDATE SET
        plan_id       = EXCLUDED.plan_id,
        agent_id      = EXCLUDED.agent_id,
        workflow_id   = EXCLUDED.workflow_id,
        kind          = EXCLUDED.kind,
        enabled       = EXCLUDED.enabled,
        spec          = EXCLUDED.spec,
        record        = EXCLUDED.record,
        registered_at = EXCLUDED.registered_at
    `;
  }

  /**
   * The stored record carries its own `triggerId`, so the key is checked rather
   * than trusted. Where the file store is defending against a hash collision, the
   * primary key here IS the id — so a mismatch means the record was edited to
   * disagree with the row it sits in, and one string comparison is what keeps that
   * loud instead of handing the worker a different workflow's schedule.
   */
  async getTrigger(triggerId: string): Promise<ScheduledTrigger | null> {
    const rows = await this.sql<TriggerRow[]>`
      SELECT trigger_id, record FROM oriant_schedules WHERE trigger_id = ${triggerId}
    `;

    const row = rows.at(0);
    if (row === undefined) return null;

    const stored = fromJsonb<ScheduledTrigger>(
      ENTITY_TRIGGERS,
      row.record,
      rowRef("oriant_schedules", row.trigger_id),
    );
    if (stored.triggerId !== triggerId) {
      throw new Error(
        `PostgresSchedulerStore.getTrigger: the row keyed "${triggerId}" holds a record for ` +
          `"${stored.triggerId}". The record and its primary key disagree, which this store ` +
          `never writes — suspect a hand-edited row in oriant_schedules.`,
      );
    }
    return stored;
  }

  /**
   * Registration order, oldest first. Every supplied filter is AND-ed, as a
   * fragment per filter so an absent one contributes no predicate at all rather
   * than a `column IS NOT DISTINCT FROM NULL` the planner has to reason about.
   */
  async listTriggers(filter?: {
    planId?: string;
    agentId?: string;
    enabled?: boolean;
    kind?: TriggerSpec["kind"];
  }): Promise<ScheduledTrigger[]> {
    // Each filter is tested with `!== undefined` rather than for truthiness.
    // `enabled: false` is the interesting query — "what did pausing an agent
    // switch off" — and a truthy check would drop that filter and return the
    // whole table.
    const rows = await this.sql<TriggerRow[]>`
      SELECT trigger_id, record FROM oriant_schedules
       WHERE ${filter?.planId === undefined ? this.sql`TRUE` : this.sql`plan_id = ${filter.planId}`}
         AND ${filter?.agentId === undefined ? this.sql`TRUE` : this.sql`agent_id = ${filter.agentId}`}
         AND ${filter?.enabled === undefined ? this.sql`TRUE` : this.sql`enabled = ${filter.enabled}`}
         AND ${filter?.kind === undefined ? this.sql`TRUE` : this.sql`kind = ${filter.kind}`}
       ORDER BY registered_at, trigger_id COLLATE "C"
    `;

    return rows.map((row) =>
      fromJsonb<ScheduledTrigger>(
        ENTITY_TRIGGERS,
        row.record,
        rowRef("oriant_schedules", row.trigger_id),
      ),
    );
  }

  /* ── Queue ── */

  /**
   * Insert only. A duplicate job id means the caller lost track of a job that may
   * already be running, and overwriting it would reset a claimed job to whatever
   * the caller passed — a second worker would then pick up work that is already in
   * flight, which is the one failure `claimNextJob` exists to prevent.
   *
   * `ON CONFLICT DO NOTHING` plus the row count is STORAGE.md §7's translation of
   * the file store's exclusive create, and it is atomic against every other writer
   * rather than only the ones in this process.
   */
  async enqueueJob(job: QueuedJob): Promise<void> {
    assertRunAfterParseable(job, "enqueueJob");

    const inserted = await this.sql<WriteResult>`
      INSERT INTO oriant_queue_jobs (job_id, agent_id, status, run_after, enqueued_at, record)
      VALUES (
        ${job.jobId},
        ${job.agentId},
        ${job.status},
        ${instantColumn(job.runAfter, `job "${job.jobId}" runAfter`)},
        ${instantColumn(job.enqueuedAt, `job "${job.jobId}" enqueuedAt`)},
        ${this.jsonb(ENTITY_JOBS, job)}
      )
      ON CONFLICT (job_id) DO NOTHING
    `;

    if (inserted.count === 0) {
      throw new Error(`PostgresSchedulerStore.enqueueJob: job "${job.jobId}" already exists`);
    }
  }

  /**
   * Update only. An unknown id is a bug in the caller rather than a request to
   * insert: a job that never went through `enqueueJob` was never ordered against
   * the rest of the queue, and inserting it here would sidestep the duplicate
   * check above. The affected row count is the existence check, so there is no
   * read-then-write window for a concurrent delete to fall into.
   */
  async saveJob(job: QueuedJob): Promise<void> {
    assertRunAfterParseable(job, "saveJob");

    const updated = await this.sql<WriteResult>`
      UPDATE oriant_queue_jobs SET
        agent_id    = ${job.agentId},
        status      = ${job.status},
        run_after   = ${instantColumn(job.runAfter, `job "${job.jobId}" runAfter`)},
        enqueued_at = ${instantColumn(job.enqueuedAt, `job "${job.jobId}" enqueuedAt`)},
        record      = ${this.jsonb(ENTITY_JOBS, job)}
      WHERE job_id = ${job.jobId}
    `;

    if (updated.count === 0) {
      throw new Error(
        `PostgresSchedulerStore.saveJob: unknown job "${job.jobId}" — call enqueueJob first`,
      );
    }
  }

  async getJob(jobId: string): Promise<QueuedJob | null> {
    const rows = await this.sql<JobRow[]>`
      SELECT job_id, record FROM oriant_queue_jobs WHERE job_id = ${jobId}
    `;

    const row = rows.at(0);
    if (row === undefined) return null;
    return fromJsonb<QueuedJob>(
      ENTITY_JOBS,
      row.record,
      rowRef("oriant_queue_jobs", row.job_id),
    );
  }

  /**
   * Enqueue order, deliberately not due order: backoff moves `runAfter`, so a
   * due-ordered listing would reshuffle itself between two reads of a queue nobody
   * touched. `enqueuedAt` is immutable and is what enqueue order means. Every
   * supplied filter is AND-ed.
   */
  async listJobs(filter?: { status?: JobStatus; agentId?: string }): Promise<QueuedJob[]> {
    const rows = await this.sql<JobRow[]>`
      SELECT job_id, record FROM oriant_queue_jobs
       WHERE ${filter?.status === undefined ? this.sql`TRUE` : this.sql`status = ${filter.status}`}
         AND ${filter?.agentId === undefined ? this.sql`TRUE` : this.sql`agent_id = ${filter.agentId}`}
       ORDER BY enqueued_at, job_id COLLATE "C"
    `;

    return rows.map((row) =>
      fromJsonb<QueuedJob>(ENTITY_JOBS, row.record, rowRef("oriant_queue_jobs", row.job_id)),
    );
  }

  /**
   * The concurrency primitive: claim the job that has been due longest and flip it
   * to `running`, or return null when nothing is claimable. See the header for why
   * this is one transaction of two statements and what SKIP LOCKED buys.
   *
   * The inner select is what makes the claim exclusive; the outer UPDATE only has
   * to name the row it returned, because the select's row lock is held for the
   * rest of the transaction and no concurrent claimer can be looking at it.
   *
   * `attempt` is left untouched. Retry accounting belongs to the worker, the only
   * component that knows whether a claim is a first try or a re-delivery.
   */
  async claimNextJob(now: Date): Promise<QueuedJob | null> {
    if (!Number.isFinite(now.getTime())) {
      // An Invalid Date compares false against everything, so the queue would
      // simply stop — no error, no claims, jobs piling up. Say so instead.
      throw new Error(
        `PostgresSchedulerStore.claimNextJob: "now" is not a valid Date (${String(now)})`,
      );
    }

    return this.sql.begin<QueuedJob | null>(async (tx) => {
      // Anything not `queued` belongs to somebody else: `running` is claimed, and
      // succeeded / failed / dead_letter / skipped are terminal. Written as an
      // equality test rather than a list of exclusions, so a status added to
      // `JobStatus` later is unclaimable until someone decides otherwise.
      const claimed = await tx<JobRow[]>`
        UPDATE oriant_queue_jobs SET status = 'running'
         WHERE job_id = (
           SELECT job_id FROM oriant_queue_jobs
            WHERE status = 'queued' AND run_after <= ${now}
            ORDER BY run_after, enqueued_at, job_id COLLATE "C"
            FOR UPDATE SKIP LOCKED
            LIMIT 1
         )
        RETURNING job_id, record
      `;

      const row = claimed.at(0);
      if (row === undefined) return null;

      const job = fromJsonb<QueuedJob>(
        ENTITY_JOBS,
        row.record,
        rowRef("oriant_queue_jobs", row.job_id),
      );
      // The same two fields the other two stores set on a claim. A shallow copy is
      // enough: `job` was decoded from this row for this call alone, so no other
      // holder of the objects it shares can exist.
      const claimedJob: QueuedJob = {
        ...job,
        status: "running",
        startedAt: now.toISOString(),
      };

      const rewritten = await tx<WriteResult>`
        UPDATE oriant_queue_jobs SET record = ${this.jsonb(ENTITY_JOBS, claimedJob)}
         WHERE job_id = ${row.job_id}
      `;

      // Unreachable while the row lock from the statement above is held, and
      // checked anyway for the same reason `saveJob` checks: a rewrite that hit
      // nothing would leave the `status` column reading `running` and the record
      // it was decoded from still reading `queued`, and nothing downstream looks
      // at both. Throwing rolls the claim back rather than committing that row.
      if (rewritten.count !== 1) {
        throw new Error(
          `PostgresSchedulerStore.claimNextJob: claimed job "${row.job_id}" but its record ` +
            `rewrite affected ${rewritten.count} rows; the claim was rolled back`,
        );
      }

      return claimedJob;
    });
  }

  /* ── Deployments ── */

  /**
   * Upsert, keyed by deployment id.
   *
   * `active` is a denormalisation of "latest go-live for this plan", which is the
   * only thing active can mean: `Deployment` records an activation and has no
   * deactivation counterpart. It is recomputed for the whole plan in the same
   * transaction rather than set on the inserted row alone, because re-saving an
   * older deployment must not promote it — the flag then agrees with
   * `getActiveDeployment` by construction instead of by convention.
   */
  async saveDeployment(deployment: Deployment): Promise<void> {
    const activatedAt = instantColumn(
      deployment.activatedAt,
      `deployment "${deployment.deploymentId}" activatedAt`,
    );

    await this.sql.begin(async (tx) => {
      await tx<WriteResult>`
        INSERT INTO oriant_deployments (deployment_id, plan_id, active, activated_at, record)
        VALUES (
          ${deployment.deploymentId},
          ${deployment.planId},
          TRUE,
          ${activatedAt},
          ${this.jsonb(ENTITY_DEPLOYMENTS, deployment)}
        )
        ON CONFLICT (deployment_id) DO UPDATE SET
          plan_id      = EXCLUDED.plan_id,
          active       = EXCLUDED.active,
          activated_at = EXCLUDED.activated_at,
          record       = EXCLUDED.record
      `;

      await tx<WriteResult>`
        UPDATE oriant_deployments AS d
           SET active = (d.deployment_id = latest.deployment_id)
          FROM (
            SELECT deployment_id FROM oriant_deployments
             WHERE plan_id = ${deployment.planId}
             ORDER BY activated_at DESC, deployment_id COLLATE "C" DESC
             LIMIT 1
          ) AS latest
         WHERE d.plan_id = ${deployment.planId}
      `;
    });
  }

  /**
   * The most recent go-live for this plan. Re-activating supersedes the previous
   * record rather than closing it.
   *
   * Latest is DERIVED here rather than read off the `active` flag, for the reason
   * §6.4 gives about ordering generally: the derivation is what the other two
   * stores mean by active, so deriving it is what stops the three disagreeing —
   * and a stale flag can then cost an inspection query a wrong row, never the
   * scheduler a wrong deployment.
   *
   * `planVersion` is deliberately not consulted — a caller asking "is THIS version
   * live" compares it themselves, because a store that filtered on it would report
   * a rollback to an earlier version as no deployment at all.
   */
  async getActiveDeployment(planId: string): Promise<Deployment | null> {
    const rows = await this.sql<DeploymentRow[]>`
      SELECT deployment_id, record FROM oriant_deployments
       WHERE plan_id = ${planId}
       ORDER BY activated_at DESC, deployment_id COLLATE "C" DESC
       LIMIT 1
    `;

    const row = rows.at(0);
    if (row === undefined) return null;
    return fromJsonb<Deployment>(
      ENTITY_DEPLOYMENTS,
      row.record,
      rowRef("oriant_deployments", row.deployment_id),
    );
  }

  /** Go-live order, oldest first — this list is read as an audit trail. */
  async listDeployments(): Promise<Deployment[]> {
    const rows = await this.sql<DeploymentRow[]>`
      SELECT deployment_id, record FROM oriant_deployments
       ORDER BY activated_at, deployment_id COLLATE "C"
    `;

    return rows.map((row) =>
      fromJsonb<Deployment>(
        ENTITY_DEPLOYMENTS,
        row.record,
        rowRef("oriant_deployments", row.deployment_id),
      ),
    );
  }

  /* ── Agent runtime state ── */

  /** Upsert, keyed by agent id: this is current state, not a history. */
  async saveAgentState(record: AgentRuntimeRecord): Promise<void> {
    await this.sql<WriteResult>`
      INSERT INTO oriant_agent_runtime_state (agent_id, state, record)
      VALUES (
        ${record.agentId},
        ${record.state},
        ${this.jsonb(ENTITY_AGENT_STATES, record)}
      )
      ON CONFLICT (agent_id) DO UPDATE SET
        state  = EXCLUDED.state,
        record = EXCLUDED.record
    `;
  }

  async getAgentState(agentId: string): Promise<AgentRuntimeRecord | null> {
    const rows = await this.sql<AgentStateRow[]>`
      SELECT agent_id, record FROM oriant_agent_runtime_state WHERE agent_id = ${agentId}
    `;

    const row = rows.at(0);
    if (row === undefined) return null;
    return fromJsonb<AgentRuntimeRecord>(
      ENTITY_AGENT_STATES,
      row.record,
      rowRef("oriant_agent_runtime_state", row.agent_id),
    );
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
    const rows = await this.sql<AgentStateRow[]>`
      SELECT agent_id, record FROM oriant_agent_runtime_state ORDER BY agent_id COLLATE "C"
    `;

    return rows.map((row) =>
      fromJsonb<AgentRuntimeRecord>(
        ENTITY_AGENT_STATES,
        row.record,
        rowRef("oriant_agent_runtime_state", row.agent_id),
      ),
    );
  }

  /* ── Agent runtime config ── */

  /**
   * Upsert, keyed by agent id: an operator setting a knob replaces the previous
   * setting rather than appending to a history nobody reads.
   *
   * `concurrency` and `queue` are denormalised out of the record for the reason
   * the header gives — a column an operator can read with `SELECT agent_id,
   * concurrency, queue` and a future worker pool can filter `queue` on, while
   * `record` stays the thing every read decodes.
   */
  async saveAgentConfig(config: AgentRuntimeConfig): Promise<void> {
    // The shared guard first, so the message names the agent and the field and
    // reads identically whichever store is mounted. `integerColumn` below stays
    // as the column's own last line of defence.
    assertConcurrencyStorable(config, "PostgresSchedulerStore.saveAgentConfig");
    await this.sql<WriteResult>`
      INSERT INTO oriant_agent_runtime_config (agent_id, concurrency, queue, record)
      VALUES (
        ${config.agentId},
        ${integerColumn(config.concurrency, `agent "${config.agentId}" concurrency`)},
        ${config.queue},
        ${this.jsonb(ENTITY_AGENT_CONFIGS, config)}
      )
      ON CONFLICT (agent_id) DO UPDATE SET
        concurrency = EXCLUDED.concurrency,
        queue       = EXCLUDED.queue,
        record      = EXCLUDED.record
    `;
  }

  /**
   * Null means no operator has configured this agent, so the caller's defaults
   * apply. It is the ordinary answer rather than the error one, exactly as in the
   * other two stores — nothing here invents a default, because a default invented
   * in three places is three chances to disagree about what "unconfigured" means.
   */
  async getAgentConfig(agentId: string): Promise<AgentRuntimeConfig | null> {
    const rows = await this.sql<AgentConfigRow[]>`
      SELECT agent_id, record FROM oriant_agent_runtime_config WHERE agent_id = ${agentId}
    `;

    const row = rows.at(0);
    if (row === undefined) return null;
    return fromJsonb<AgentRuntimeConfig>(
      ENTITY_AGENT_CONFIGS,
      row.record,
      rowRef("oriant_agent_runtime_config", row.agent_id),
    );
  }

  /**
   * Agent id order.
   *
   * Unlike every other listing in this file there is no immutable instant to sort
   * on and the id is not a tie-break but the whole key — `AgentRuntimeConfig`
   * carries no timestamp at all. `COLLATE "C"` for the usual reason: a
   * locale-aware collation orders the same ids differently on a differently
   * configured database, and the other two stores compare code units.
   */
  async listAgentConfigs(): Promise<AgentRuntimeConfig[]> {
    const rows = await this.sql<AgentConfigRow[]>`
      SELECT agent_id, record FROM oriant_agent_runtime_config ORDER BY agent_id COLLATE "C"
    `;

    return rows.map((row) =>
      fromJsonb<AgentRuntimeConfig>(
        ENTITY_AGENT_CONFIGS,
        row.record,
        rowRef("oriant_agent_runtime_config", row.agent_id),
      ),
    );
  }
}
