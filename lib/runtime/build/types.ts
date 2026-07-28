/**
 * lib/runtime/build/types.ts — the Agent Factory's vocabulary (ROLE_C_PLAN M2).
 *
 * The Factory turns an approved plan into runnable agent packages. Because the
 * runtime interprets `StepSpec[]` rather than executing generated code,
 * "building" means compiling prompts and bindings, validating the result, and
 * storing it against the agent version it was built from.
 *
 * Two properties this file exists to guarantee:
 *
 *   1. A package is only ever marked `completed` after it has been VALIDATED
 *      as runnable. A green job that yields a package the executor would
 *      refuse is worse than a red one, because Activation gates on green.
 *
 *   2. Rebuilds are keyed on `AgentSpec.version`. Changing one agent must
 *      rebuild one agent, not the whole workforce.
 */

import type { AgentPackage } from "../types";
import type { AgentSpec } from "../../plan/types";

export type BuildJobStatus =
  | "queued"
  | "generating"
  | "validating"
  | "completed"
  | "skipped"
  | "failed";

export interface BuildLogLine {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface BuildJob {
  jobId: string;
  planId: string;
  planVersion: number;
  agentId: string;
  agentVersion: number;
  status: BuildJobStatus;
  /** 1-based; incremented on each retry of a failed generation. */
  attempt: number;
  logs: BuildLogLine[];
  /** Set once the package is stored. */
  checksum: string | null;
  error: string | null;
  startedAt: string;
  endedAt: string | null;
}

/** A built package, addressed by agent AND version so history is kept. */
export interface PackageRecord {
  agentId: string;
  agentVersion: number;
  checksum: string;
  pkg: AgentPackage;
  builtAt: string;
  planId: string;
  planVersion: number;
}

export interface BuildStore {
  saveJob(job: BuildJob): Promise<void>;
  getJob(jobId: string): Promise<BuildJob | null>;
  listJobs(filter?: { planId?: string; agentId?: string }): Promise<BuildJob[]>;

  savePackage(record: PackageRecord): Promise<void>;
  /** The package built for this exact agent version, if any. */
  getPackage(agentId: string, agentVersion: number): Promise<PackageRecord | null>;
  /** The most recently built package for an agent, whatever its version. */
  getLatestPackage(agentId: string): Promise<PackageRecord | null>;
  listPackages(): Promise<PackageRecord[]>;
}

/**
 * The seam where a model-driven compiler can replace the local one. Any
 * implementation must satisfy the same package validation and produce a
 * deterministic checksum for an unchanged spec, otherwise rebuild-skipping
 * and the M2 equivalence test both break.
 */
export interface PackageGenerator {
  readonly name: string;
  generate(spec: AgentSpec, options: { builtAt: string }): Promise<AgentPackage>;
}

export interface BuildDeps {
  store: BuildStore;
  generator: PackageGenerator;
  clock: { now(): Date };
  newId(prefix: string): string;
  /** Injected so retry backoff never really waits in tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Generation attempts per agent before the job fails. Default 2. */
  maxAttempts?: number;
}

export interface BuildPlanResult {
  planId: string;
  planVersion: number;
  jobs: BuildJob[];
  built: number;
  skipped: number;
  failed: number;
  /** True when every agent in the plan has a current, validated package. */
  ready: boolean;
}
