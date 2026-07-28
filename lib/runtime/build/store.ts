/**
 * lib/runtime/build/store.ts — in-memory persistence for build jobs and
 * packages.
 *
 * The real database lands with the M0 storage decision; this is the reference
 * implementation the Factory and every M2 check run against. Deep-cloning on
 * both read and write is not ceremony: a build job is mutated in place as it
 * moves through its states, and an aliased row would let a later mutation
 * rewrite history that the UI has already rendered.
 *
 * Packages are addressed by (agentId, agentVersion) so history is kept. That
 * is what lets a rebuild skip correctly, and what would let a future rollback
 * serve a previous version without recompiling.
 */

import type { BuildJob, BuildStore, PackageRecord } from "./types";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function packageKey(agentId: string, agentVersion: number): string {
  return `${agentId}@${agentVersion}`;
}

export class InMemoryBuildStore implements BuildStore {
  private jobs = new Map<string, BuildJob>();
  private packages = new Map<string, PackageRecord>();
  /** Insertion order per agent, so "latest" means latest built, not highest id. */
  private packageOrder: string[] = [];

  async saveJob(job: BuildJob): Promise<void> {
    this.jobs.set(job.jobId, clone(job));
  }

  async getJob(jobId: string): Promise<BuildJob | null> {
    const found = this.jobs.get(jobId);
    return found ? clone(found) : null;
  }

  async listJobs(filter?: { planId?: string; agentId?: string }): Promise<BuildJob[]> {
    return [...this.jobs.values()]
      .filter((j) => !filter?.planId || j.planId === filter.planId)
      .filter((j) => !filter?.agentId || j.agentId === filter.agentId)
      .map(clone);
  }

  async savePackage(record: PackageRecord): Promise<void> {
    const key = packageKey(record.agentId, record.agentVersion);
    if (!this.packages.has(key)) this.packageOrder.push(key);
    this.packages.set(key, clone(record));
  }

  async getPackage(agentId: string, agentVersion: number): Promise<PackageRecord | null> {
    const found = this.packages.get(packageKey(agentId, agentVersion));
    return found ? clone(found) : null;
  }

  async getLatestPackage(agentId: string): Promise<PackageRecord | null> {
    for (let i = this.packageOrder.length - 1; i >= 0; i--) {
      const key = this.packageOrder[i];
      if (!key) continue;
      const record = this.packages.get(key);
      if (record?.agentId === agentId) return clone(record);
    }
    return null;
  }

  async listPackages(): Promise<PackageRecord[]> {
    return this.packageOrder
      .map((key) => this.packages.get(key))
      .filter((r): r is PackageRecord => Boolean(r))
      .map(clone);
  }

  /* ── Test helpers ── */

  reset(): void {
    this.jobs.clear();
    this.packages.clear();
    this.packageOrder = [];
  }

  snapshotJobs(): BuildJob[] {
    return [...this.jobs.values()].map(clone);
  }
}
