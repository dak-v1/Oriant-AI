/**
 * lib/runtime/persist/pg/build-store.ts — `BuildStore` on Postgres (STORAGE.md
 * §7 step 2), mirroring lib/runtime/persist/build-store.ts method for method.
 *
 * WHY THIS TABLE PAIR IS WORTH THE MIGRATION. Runs are the urgent case for
 * durability; packages are the expensive one. A lost run costs one re-trigger. A
 * lost package set costs a full rebuild of every agent, and from M4 onwards it
 * costs more than that, because `planBuildStatus()` is one of the three gates
 * Activation reads: an owner who restarted the server would find a workforce
 * that passed the sandbox an hour ago reporting "no package built", with no way
 * to tell that from a plan that genuinely never built.
 *
 * WHAT THE DATABASE TAKES OVER. Two tables replace two directories. The
 * composite key `(agent_id, agent_version)` replaces the `agentId@version`
 * filename, so history is still kept — that is what makes rebuild-skipping
 * correct and what would let a rollback serve a previous version without
 * recompiling. `ON CONFLICT DO UPDATE` replaces the atomic file rewrite, because
 * a build job is mutated in place rather than created once.
 *
 * WHAT IT MUST NOT CHANGE: THE ORDER A LISTING COMES BACK IN. The file store
 * derives order from immutable fields (STORAGE.md §6.4) and M2 verification
 * asserts that behaviour, so every ORDER BY below is a transcription of
 * `comparePackageRecency` / `compareByInstant` rather than of the matching index
 * in schema.ts. Two details that transcription turns on, both of which decide
 * real fixture lists rather than corner cases:
 *
 *   1. `COLLATE "C"` on every id tie-break. JavaScript compares strings by code
 *      unit; the database's default collation does not, and the two disagree
 *      exactly on the punctuation these ids are built from ("admin-operations"
 *      sorts before "administration" by code unit and after it under en_US).
 *      When a fixture plan builds four v1 agents from one fixed clock, the
 *      tie-break IS the whole order.
 *   2. `agent_id || '@' || agent_version` rather than `agent_id`, because the
 *      file store's last key is the record id, and `@` (0x40) sorts ABOVE a
 *      digit (0x30-0x39): `agent-1@1` and `agent-12@1` resolve the other way
 *      round from the bare ids they contain.
 *
 * Deep-clone semantics come free. Every read decodes fresh rows out of jsonb, so
 * no caller can hold a reference to stored state, and no cloning is layered on
 * top of that.
 *
 * Determinism: no clock, no ids. Everything is inside the records handed in.
 */

import type {
  BuildJob,
  BuildJobStatus,
  BuildLogLine,
  BuildStore,
  PackageRecord,
} from "../../build/types";
import type { AgentPackage } from "../../types";
import type { Sql } from "./client";
import { fromJsonb, isoFrom, isoRequired, toJsonb } from "./util";

/**
 * The envelope label on a `jsonb` column names the PAYLOAD, not the row. A column
 * holds one field where a file held the whole record, so reusing the table name
 * would claim more than the value is — and the label travels into the decode
 * error, where "build_job_logs" points at the column that failed.
 */
const LOGS_ENTITY = "build_job_logs";
const PACKAGE_ENTITY = "agent_package";

/** The `jsonb` parameter type postgres.js accepts, derived from its own signature. */
type JsonValue = Parameters<Sql["json"]>[0];
type JsonParameter = ReturnType<Sql["json"]>;

/**
 * Columns as postgres.js hands them back: `integer` is a number, `timestamptz` is
 * a Date, `jsonb` is already parsed. `status` is typed as the union because
 * `saveJob` is the only writer of that column, which is the same trust the file
 * store places in its own files.
 */
interface BuildJobRow {
  job_id: string;
  plan_id: string;
  plan_version: number;
  agent_id: string;
  agent_version: number;
  status: BuildJobStatus;
  attempt: number;
  logs: unknown;
  checksum: string | null;
  error: string | null;
  started_at: Date;
  ended_at: Date | null;
}

interface PackageRow {
  agent_id: string;
  agent_version: number;
  checksum: string;
  pkg: unknown;
  built_at: Date;
  plan_id: string;
  plan_version: number;
}

function rowToJob(row: BuildJobRow): BuildJob {
  const where = `oriant_build_jobs(${row.job_id})`;
  return {
    jobId: row.job_id,
    planId: row.plan_id,
    planVersion: row.plan_version,
    agentId: row.agent_id,
    agentVersion: row.agent_version,
    status: row.status,
    attempt: row.attempt,
    // Order is part of the data: the UI reads the log as a narrative.
    logs: fromJsonb<BuildLogLine[]>(LOGS_ENTITY, row.logs, `${where}.logs`),
    checksum: row.checksum,
    error: row.error,
    startedAt: isoRequired(row.started_at, `${where}.started_at`),
    endedAt: isoFrom(row.ended_at),
  };
}

function rowToPackage(row: PackageRow): PackageRecord {
  const where = `oriant_packages(${row.agent_id}@${row.agent_version})`;
  return {
    agentId: row.agent_id,
    agentVersion: row.agent_version,
    checksum: row.checksum,
    pkg: fromJsonb<AgentPackage>(PACKAGE_ENTITY, row.pkg, `${where}.pkg`),
    builtAt: isoRequired(row.built_at, `${where}.built_at`),
    planId: row.plan_id,
    planVersion: row.plan_version,
  };
}

export class PostgresBuildStore implements BuildStore {
  constructor(private readonly sql: Sql) {}

  /**
   * `toJsonb` returns `unknown` because the codec cannot promise more than that
   * in a type, but its result is `JSON.parse` output and so is a JSON value by
   * construction. The assertion lives here, once, instead of at four call sites.
   */
  private jsonb(entity: string, value: unknown): JsonParameter {
    return this.sql.json(toJsonb(entity, value) as JsonValue);
  }

  /* ── Jobs ── */

  /**
   * Upsert, matching the file store's `Table.write`. A build job is mutated in
   * place as it moves `queued → generating → validating → completed`, and
   * `buildAgent` saves it at every transition; an insert-only write would fail on
   * the second one.
   */
  async saveJob(job: BuildJob): Promise<void> {
    await this.sql`
      INSERT INTO oriant_build_jobs (
        job_id, plan_id, plan_version, agent_id, agent_version,
        status, attempt, logs, checksum, error, started_at, ended_at
      ) VALUES (
        ${job.jobId}, ${job.planId}, ${job.planVersion}, ${job.agentId}, ${job.agentVersion},
        ${job.status}, ${job.attempt}, ${this.jsonb(LOGS_ENTITY, job.logs)},
        ${job.checksum}, ${job.error}, ${job.startedAt}, ${job.endedAt}
      )
      ON CONFLICT (job_id) DO UPDATE SET
        plan_id       = EXCLUDED.plan_id,
        plan_version  = EXCLUDED.plan_version,
        agent_id      = EXCLUDED.agent_id,
        agent_version = EXCLUDED.agent_version,
        status        = EXCLUDED.status,
        attempt       = EXCLUDED.attempt,
        logs          = EXCLUDED.logs,
        checksum      = EXCLUDED.checksum,
        error         = EXCLUDED.error,
        started_at    = EXCLUDED.started_at,
        ended_at      = EXCLUDED.ended_at
    `;
  }

  async getJob(jobId: string): Promise<BuildJob | null> {
    const rows = await this.sql<BuildJobRow[]>`
      SELECT * FROM oriant_build_jobs WHERE job_id = ${jobId}
    `;
    const row = rows.at(0);
    return row === undefined ? null : rowToJob(row);
  }

  /**
   * Start order, oldest first, ties settled by job id — `compareByInstant` in SQL.
   *
   * Both filters are optional, and one static statement covers all four
   * combinations rather than four assembled ones. A parameter compared only with
   * `IS NULL` gives Postgres nothing to infer a type from, hence the `::text`.
   */
  async listJobs(filter?: { planId?: string; agentId?: string }): Promise<BuildJob[]> {
    const planId = filter?.planId ?? null;
    const agentId = filter?.agentId ?? null;
    const rows = await this.sql<BuildJobRow[]>`
      SELECT * FROM oriant_build_jobs
      WHERE (${planId}::text IS NULL OR plan_id = ${planId}::text)
        AND (${agentId}::text IS NULL OR agent_id = ${agentId}::text)
      ORDER BY started_at, job_id COLLATE "C"
    `;
    return rows.map(rowToJob);
  }

  /* ── Packages ── */

  /**
   * Upsert on the composite key. A rebuild of the same agent version replaces its
   * package rather than duplicating it, exactly as rewriting `agentId@version`
   * does on disk.
   */
  async savePackage(record: PackageRecord): Promise<void> {
    await this.sql`
      INSERT INTO oriant_packages (
        agent_id, agent_version, checksum, pkg, built_at, plan_id, plan_version
      ) VALUES (
        ${record.agentId}, ${record.agentVersion}, ${record.checksum},
        ${this.jsonb(PACKAGE_ENTITY, record.pkg)}, ${record.builtAt},
        ${record.planId}, ${record.planVersion}
      )
      ON CONFLICT (agent_id, agent_version) DO UPDATE SET
        checksum     = EXCLUDED.checksum,
        pkg          = EXCLUDED.pkg,
        built_at     = EXCLUDED.built_at,
        plan_id      = EXCLUDED.plan_id,
        plan_version = EXCLUDED.plan_version
    `;
  }

  async getPackage(agentId: string, agentVersion: number): Promise<PackageRecord | null> {
    const rows = await this.sql<PackageRow[]>`
      SELECT * FROM oriant_packages
      WHERE agent_id = ${agentId} AND agent_version = ${agentVersion}
    `;
    const row = rows.at(0);
    return row === undefined ? null : rowToPackage(row);
  }

  /**
   * The most recently BUILT package for an agent, whatever its version — the
   * reverse of `comparePackageRecency`, limited to one.
   *
   * Latest built rather than highest version is the whole point of the ordering:
   * a hotfix rebuild of v2 after v3 was compiled is the case where the two
   * answers differ, and the in-memory store's backwards scan through
   * `packageOrder` means the same thing. With `built_at` tied the higher version
   * wins, and the file store's third key cannot fire here, because every row
   * already shares one `agent_id` and, by then, one `agent_version`.
   */
  async getLatestPackage(agentId: string): Promise<PackageRecord | null> {
    const rows = await this.sql<PackageRow[]>`
      SELECT * FROM oriant_packages
      WHERE agent_id = ${agentId}
      ORDER BY built_at DESC, agent_version DESC
      LIMIT 1
    `;
    const row = rows.at(0);
    return row === undefined ? null : rowToPackage(row);
  }

  /**
   * Build order, oldest first. The last key is the file store's `packageFileId`
   * spelled in SQL rather than the bare `agent_id` the index in schema.ts is
   * built on — see the header for why the difference is not cosmetic.
   */
  async listPackages(): Promise<PackageRecord[]> {
    const rows = await this.sql<PackageRow[]>`
      SELECT * FROM oriant_packages
      ORDER BY built_at,
               agent_version,
               (agent_id || '@' || agent_version::text) COLLATE "C"
    `;
    return rows.map(rowToPackage);
  }
}
