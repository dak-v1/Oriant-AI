/**
 * lib/runtime/persist/pg/schema.ts — the DDL, and the migration that applies it.
 *
 * A direct translation of docs/STORAGE.md §3, following the order §7 sets out.
 * Three properties are schema-level here that the file store had to enforce by
 * hand, and moving them into the database is the point of the migration:
 *
 *   idempotency_keys.key PRIMARY KEY      one run per trigger, un-raceable
 *   approval_decisions.approval_id PK     an approval is decided once, ever
 *   run_events (run_id, sequence) PK      events append instead of rewriting
 *
 * The third closes STORAGE.md §6.5: the file store embedded events in the run
 * and rewrote all of them on every step.
 *
 * Everything structured travels as `jsonb` carrying the SAME tagged encoding the
 * file store uses (persist/codec.ts). `jsonb` has no Date, Map or Set either, so
 * the codec travels with the data rather than being replaced by it — and that is
 * what lets a run written by one store be read by the other.
 *
 * SAFE TO RUN REPEATEDLY. Every statement is IF NOT EXISTS, so `migrate()` is
 * idempotent and doubles as "ensure the schema is current" on boot.
 */

import type { Sql } from "./client";

/** Bumped when the DDL below changes in a way an existing database must adopt. */
export const PG_SCHEMA_VERSION = 1;

/**
 * Table names are namespaced so the runtime can share a Supabase project with
 * anything else the team puts there without a collision.
 */
export const TABLES = [
  "oriant_runs",
  "oriant_run_events",
  "oriant_approvals",
  "oriant_approval_decisions",
  "oriant_idempotency_keys",
  "oriant_build_jobs",
  "oriant_packages",
  "oriant_schedules",
  "oriant_queue_jobs",
  "oriant_deployments",
  "oriant_agent_runtime_state",
] as const;

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS oriant_runs (
     run_id              text PRIMARY KEY,
     agent_id            text NOT NULL,
     agent_version       integer NOT NULL,
     workflow_id         text NOT NULL,
     status              text NOT NULL,
     cursor              integer NOT NULL,
     trigger             jsonb NOT NULL,
     context             jsonb NOT NULL,
     pending_approval_id text,
     started_at          timestamptz NOT NULL,
     ended_at            timestamptz,
     failure             text
   )`,
  `CREATE INDEX IF NOT EXISTS oriant_runs_agent_idx  ON oriant_runs (agent_id)`,
  `CREATE INDEX IF NOT EXISTS oriant_runs_status_idx ON oriant_runs (status)`,
  // Listing order is derived, exactly as the file store derives it: an immutable
  // field with the id as tie-break, so two runs stamped by the same fixed clock
  // still resolve identically.
  `CREATE INDEX IF NOT EXISTS oriant_runs_order_idx  ON oriant_runs (started_at, run_id COLLATE "C")`,

  // Events append. `sequence` is the run-local index, so the pair is unique and
  // ordering never depends on a timestamp two events can share.
  `CREATE TABLE IF NOT EXISTS oriant_run_events (
     run_id   text NOT NULL REFERENCES oriant_runs (run_id) ON DELETE CASCADE,
     sequence integer NOT NULL,
     event    jsonb NOT NULL,
     PRIMARY KEY (run_id, sequence)
   )`,

  `CREATE TABLE IF NOT EXISTS oriant_approvals (
     approval_id     text PRIMARY KEY,
     run_id          text NOT NULL,
     agent_id        text NOT NULL,
     workflow_id     text NOT NULL,
     step_id         text NOT NULL,
     invocation      jsonb NOT NULL,
     reason          text NOT NULL,
     risk            text NOT NULL,
     breached_limits jsonb NOT NULL,
     approval_owner  text NOT NULL,
     created_at      timestamptz NOT NULL,
     due_at          timestamptz NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS oriant_approvals_due_idx ON oriant_approvals (due_at, created_at, approval_id COLLATE "C")`,
  `CREATE INDEX IF NOT EXISTS oriant_approvals_run_idx ON oriant_approvals (run_id)`,

  // The primary key IS the write-once guarantee. Two workers racing to decide
  // the same approval cannot both win, and the loser gets a unique violation
  // rather than a silently overwritten decision.
  `CREATE TABLE IF NOT EXISTS oriant_approval_decisions (
     approval_id text PRIMARY KEY REFERENCES oriant_approvals (approval_id) ON DELETE CASCADE,
     decision    text NOT NULL,
     decided_by  text NOT NULL,
     decided_at  timestamptz NOT NULL,
     reason      text,
     edited_args jsonb
   )`,

  // One row per trigger delivery. The primary key is the whole mechanism.
  `CREATE TABLE IF NOT EXISTS oriant_idempotency_keys (
     key        text PRIMARY KEY,
     claimed_at timestamptz NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS oriant_build_jobs (
     job_id        text PRIMARY KEY,
     plan_id       text NOT NULL,
     plan_version  integer NOT NULL,
     agent_id      text NOT NULL,
     agent_version integer NOT NULL,
     status        text NOT NULL,
     attempt       integer NOT NULL,
     logs          jsonb NOT NULL,
     checksum      text,
     error         text,
     started_at    timestamptz NOT NULL,
     ended_at      timestamptz
   )`,
  `CREATE INDEX IF NOT EXISTS oriant_build_jobs_plan_idx  ON oriant_build_jobs (plan_id)`,
  `CREATE INDEX IF NOT EXISTS oriant_build_jobs_agent_idx ON oriant_build_jobs (agent_id)`,
  `CREATE INDEX IF NOT EXISTS oriant_build_jobs_order_idx ON oriant_build_jobs (started_at, job_id COLLATE "C")`,

  // Addressed by (agent, version) so history is kept and a rebuild can skip.
  `CREATE TABLE IF NOT EXISTS oriant_packages (
     agent_id      text NOT NULL,
     agent_version integer NOT NULL,
     checksum      text NOT NULL,
     pkg           jsonb NOT NULL,
     built_at      timestamptz NOT NULL,
     plan_id       text NOT NULL,
     plan_version  integer NOT NULL,
     PRIMARY KEY (agent_id, agent_version)
   )`,
  `CREATE INDEX IF NOT EXISTS oriant_packages_order_idx ON oriant_packages (built_at, agent_id COLLATE "C", agent_version)`,

  `CREATE TABLE IF NOT EXISTS oriant_schedules (
     trigger_id    text PRIMARY KEY,
     plan_id       text NOT NULL,
     agent_id      text NOT NULL,
     workflow_id   text NOT NULL,
     kind          text NOT NULL,
     enabled       boolean NOT NULL,
     spec          jsonb NOT NULL,
     record        jsonb NOT NULL,
     registered_at timestamptz NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS oriant_schedules_plan_idx  ON oriant_schedules (plan_id)`,
  `CREATE INDEX IF NOT EXISTS oriant_schedules_agent_idx ON oriant_schedules (agent_id)`,
  `CREATE INDEX IF NOT EXISTS oriant_schedules_order_idx ON oriant_schedules (registered_at, trigger_id COLLATE "C")`,

  `CREATE TABLE IF NOT EXISTS oriant_queue_jobs (
     job_id      text PRIMARY KEY,
     agent_id    text NOT NULL,
     status      text NOT NULL,
     run_after   timestamptz NOT NULL,
     enqueued_at timestamptz NOT NULL,
     record      jsonb NOT NULL
   )`,
  // The claim query orders by (run_after, enqueued_at, job_id) under
  // FOR UPDATE SKIP LOCKED; this index is what keeps that a seek.
  `CREATE INDEX IF NOT EXISTS oriant_queue_claim_idx ON oriant_queue_jobs (status, run_after, enqueued_at, job_id COLLATE "C")`,
  `CREATE INDEX IF NOT EXISTS oriant_queue_agent_idx ON oriant_queue_jobs (agent_id)`,

  `CREATE TABLE IF NOT EXISTS oriant_deployments (
     deployment_id text PRIMARY KEY,
     plan_id       text NOT NULL,
     active        boolean NOT NULL,
     activated_at  timestamptz NOT NULL,
     record        jsonb NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS oriant_deployments_plan_idx  ON oriant_deployments (plan_id, active)`,
  `CREATE INDEX IF NOT EXISTS oriant_deployments_order_idx ON oriant_deployments (activated_at, deployment_id COLLATE "C")`,

  `CREATE TABLE IF NOT EXISTS oriant_agent_runtime_state (
     agent_id text PRIMARY KEY,
     state    text NOT NULL,
     record   jsonb NOT NULL
   )`,
];

/**
 * Creates every table and index. Idempotent, so it is safe on every boot and
 * safe to run concurrently from two instances starting at once.
 */
export async function migrate(sql: Sql): Promise<void> {
  for (const statement of DDL) {
    await sql.unsafe(statement);
  }
}

/** Drops every table. Development only; `RuntimeSession.reset()` reaches it. */
export async function dropAll(sql: Sql): Promise<void> {
  // Reverse order is not enough on its own because of the foreign keys, so the
  // cascade does the work and the ordering just keeps the log readable.
  for (const table of [...TABLES].reverse()) {
    await sql.unsafe(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }
}

/** Deletes every row but keeps the schema. Faster than a drop-and-migrate. */
export async function truncateAll(sql: Sql): Promise<void> {
  await sql.unsafe(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
}
