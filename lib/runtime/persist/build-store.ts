/**
 * lib/runtime/persist/build-store.ts — the durable `BuildStore` (ROLE_C_PLAN M0
 * storage decision).
 *
 * Runs are the urgent case for durability; packages are the expensive one. A
 * lost run costs one re-trigger. A lost package set costs a full rebuild of
 * every agent — and from M4 onwards it costs more than that, because
 * `planBuildStatus()` is one of the three gates Activation reads. An owner who
 * restarted the server would find a workforce that had passed the sandbox an
 * hour ago reporting "no package built", with no way to tell that from a plan
 * that genuinely never built.
 *
 * PACKAGES ARE ADDRESSED BY (agentId, agentVersion), exactly as the in-memory
 * store does, so history is kept. That is what makes rebuild-skipping correct
 * and what would let a future rollback serve a previous version without
 * recompiling. On disk that becomes one file per pair, named `agentId@version`.
 *
 * ORDERING. `InMemoryBuildStore` keeps an explicit `packageOrder` array so
 * "latest" means latest BUILT rather than highest version, and that distinction
 * is worth preserving: a hotfix rebuild of v2 after v3 was compiled is the case
 * where the two answers differ. A directory has no insertion order, so this
 * store reads the same intent off `PackageRecord.builtAt` — an immutable field
 * written by the Factory from its injected clock — and breaks ties on the
 * version, then the id. Same meaning, derived from the record instead of from
 * the container.
 *
 * Determinism: no clock, no ids. Everything is inside the records handed in.
 */

import path from "node:path";
import type { BuildJob, BuildStore, PackageRecord } from "../build/types";
import { Table, compareByInstant, compareId, compareInstant } from "./table";

/**
 * `@` is a legal filename character everywhere this runs and is rejected inside
 * an agent id by `recordFileName`, so splitting on it is unambiguous — but
 * nothing here parses the name back. Lookups filter on the record's own fields,
 * which keeps the filename a convenience for a human reading the directory
 * rather than a second, weaker copy of the data.
 */
function packageFileId(agentId: string, agentVersion: number): string {
  return `${agentId}@${agentVersion}`;
}

export class FileBuildStore implements BuildStore {
  private readonly jobs: Table<BuildJob>;
  private readonly packages: Table<PackageRecord>;

  constructor(readonly root: string) {
    this.jobs = new Table<BuildJob>(path.join(root, "build-jobs"), "build_jobs");
    this.packages = new Table<PackageRecord>(path.join(root, "packages"), "packages");
  }

  /* ── Jobs ── */

  /**
   * Upsert, matching the in-memory store. A build job is mutated in place as it
   * moves `queued → generating → validating → completed`, and `buildAgent` saves
   * it at every transition; an insert-only write would fail on the second one.
   */
  async saveJob(job: BuildJob): Promise<void> {
    await this.jobs.write(job.jobId, job);
  }

  async getJob(jobId: string): Promise<BuildJob | null> {
    return this.jobs.read(jobId);
  }

  /** Start order, oldest first. */
  async listJobs(filter?: { planId?: string; agentId?: string }): Promise<BuildJob[]> {
    const jobs = await this.jobs.all();
    const out = jobs.filter((job) => {
      if (filter?.planId !== undefined && job.planId !== filter.planId) return false;
      if (filter?.agentId !== undefined && job.agentId !== filter.agentId) return false;
      return true;
    });
    out.sort((a, b) => compareByInstant(a.startedAt, a.jobId, b.startedAt, b.jobId));
    return out;
  }

  /* ── Packages ── */

  async savePackage(record: PackageRecord): Promise<void> {
    await this.packages.write(packageFileId(record.agentId, record.agentVersion), record);
  }

  async getPackage(agentId: string, agentVersion: number): Promise<PackageRecord | null> {
    return this.packages.read(packageFileId(agentId, agentVersion));
  }

  /**
   * The most recently BUILT package for an agent, whatever its version.
   *
   * `>=` keeps the last of a tie rather than the first, which is what the
   * in-memory store's backwards scan through `packageOrder` does: two packages
   * stamped by the same fixed clock resolve to the one saved second. With
   * `builtAt` equal, the higher version wins, and the file id settles the rest so
   * the answer never depends on directory order.
   */
  async getLatestPackage(agentId: string): Promise<PackageRecord | null> {
    const records = (await this.packages.all()).filter((r) => r.agentId === agentId);
    let latest: PackageRecord | null = null;
    for (const record of records) {
      if (latest === null || comparePackageRecency(record, latest) >= 0) latest = record;
    }
    return latest;
  }

  /** Build order, oldest first. */
  async listPackages(): Promise<PackageRecord[]> {
    const records = await this.packages.all();
    records.sort(comparePackageRecency);
    return records;
  }

  /* ── Development helper ── */

  /** Drops every build job and package on disk. See `RuntimeSession.reset()`. */
  async reset(): Promise<void> {
    await Promise.all([this.jobs.clear(), this.packages.clear()]);
  }
}

function comparePackageRecency(left: PackageRecord, right: PackageRecord): number {
  return (
    compareInstant(left.builtAt, right.builtAt) ||
    left.agentVersion - right.agentVersion ||
    compareId(
      packageFileId(left.agentId, left.agentVersion),
      packageFileId(right.agentId, right.agentVersion),
    )
  );
}
