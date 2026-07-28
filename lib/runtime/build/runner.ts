/**
 * lib/runtime/build/runner.ts — the Agent Factory (ROLE_C_PLAN M2).
 *
 * Reads an approved plan and produces one validated package per agent, moving
 * each job through `queued → generating → validating → completed`, or to
 * `skipped` when nothing changed, or `failed` when generation or validation
 * cannot be satisfied.
 *
 * Three behaviours matter more than the rest:
 *
 *   REBUILD SKIPPING is keyed on AgentSpec.version AND on the spec checksum.
 *   Version alone is not enough: an author can edit a spec without bumping the
 *   version, and serving the previous package would then run yesterday's agent
 *   under today's plan. Checksum alone is not enough either, because the plan
 *   contract makes version the thing Role D bumps deliberately. Requiring both
 *   to match is the only combination that is safe in each direction.
 *
 *   VALIDATION GATES COMPLETION. A job is green only if its package passed
 *   validate-package.ts, because Activation gates on green and a package the
 *   executor would refuse is worse than an obvious failure.
 *
 *   FAILURE IS PER AGENT. One agent failing to build must not stop the other
 *   three, or a single bad spec blocks the whole workforce. The one exception
 *   is a plan that fails the handoff validator: that is not one agent's
 *   problem, so `buildPlan` refuses the whole plan before it builds anything.
 */

import type { ApprovedPlan, AgentSpec, PlanValidationError } from "../../plan/types";
import { validateApprovedPlan } from "../../plan/validate";
import type { AgentPackage } from "../types";
import { compileAgent } from "../factory";
import { validatePackage } from "./validate-package";
import type {
  BuildDeps,
  BuildJob,
  BuildLogLine,
  BuildPlanResult,
  PackageGenerator,
  PackageRecord,
} from "./types";

/* ═══════════════════════ The default generator ═══════════════════════ */

/**
 * Compiles locally and deterministically. Needs no provider key, which is why
 * it is the default: the whole of M2 works with an empty .env.
 */
export class LocalPackageGenerator implements PackageGenerator {
  readonly name = "local";
  async generate(spec: AgentSpec, options: { builtAt: string }): Promise<AgentPackage> {
    return compileAgent(spec, options);
  }
}

/* ═══════════════════════════ Logging ═══════════════════════════ */

function log(
  job: BuildJob,
  deps: BuildDeps,
  level: BuildLogLine["level"],
  message: string,
): void {
  job.logs.push({ at: deps.clock.now().toISOString(), level, message });
}

/* ═══════════════════════ Building one agent ═══════════════════════ */

export interface BuildAgentOptions {
  /** Rebuild even when the stored package is current. */
  force?: boolean;
}

export async function buildAgent(
  spec: AgentSpec,
  plan: Pick<ApprovedPlan, "planId" | "version">,
  deps: BuildDeps,
  options: BuildAgentOptions = {},
): Promise<BuildJob> {
  const startedAt = deps.clock.now().toISOString();
  const job: BuildJob = {
    jobId: deps.newId("job"),
    planId: plan.planId,
    planVersion: plan.version,
    agentId: spec.id,
    agentVersion: spec.version,
    status: "queued",
    attempt: 0,
    logs: [],
    checksum: null,
    error: null,
    startedAt,
    endedAt: null,
  };

  log(job, deps, "info", `Queued build for ${spec.name} (v${spec.version}).`);
  await deps.store.saveJob(job);

  /* ── Skip when the stored package is genuinely current ── */
  if (!options.force) {
    const existing = await deps.store.getPackage(spec.id, spec.version);
    if (existing) {
      const { checksumOf } = await import("../factory");
      if (existing.checksum === checksumOf(spec)) {
        job.status = "skipped";
        job.checksum = existing.checksum;
        job.endedAt = deps.clock.now().toISOString();
        log(
          job,
          deps,
          "info",
          `Unchanged since ${existing.builtAt}; reusing package ${existing.checksum}.`,
        );
        await deps.store.saveJob(job);
        return job;
      }
      log(
        job,
        deps,
        "warn",
        `Version ${spec.version} was built before but the spec has changed since. Rebuilding.`,
      );
    }
  }

  const maxAttempts = Math.max(1, deps.maxAttempts ?? 2);
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    job.attempt = attempt;
    job.status = "generating";
    log(
      job,
      deps,
      "info",
      `Generating with the "${deps.generator.name}" generator (attempt ${attempt} of ${maxAttempts}).`,
    );
    await deps.store.saveJob(job);

    let pkg: AgentPackage;
    try {
      pkg = await deps.generator.generate(spec, { builtAt: startedAt });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(job, deps, "error", `Generation failed: ${message}`);
      if (attempt < maxAttempts) {
        await sleep(250 * attempt);
        continue;
      }
      return fail(job, deps, `Generation failed after ${maxAttempts} attempt(s): ${message}`);
    }

    log(
      job,
      deps,
      "info",
      `Generated ${pkg.workflows.length} workflow(s) and ${pkg.allowedOperations.length} permitted operation(s).`,
    );

    /* ── Validation gates completion ── */
    job.status = "validating";
    await deps.store.saveJob(job);

    const findings = validatePackage(pkg, spec);
    for (const finding of findings) {
      const where = [finding.workflowId, finding.stepId].filter(Boolean).join("/");
      log(
        job,
        deps,
        finding.severity === "error" ? "error" : "warn",
        where ? `${where}: ${finding.message}` : finding.message,
      );
    }

    const errors = findings.filter((f) => f.severity === "error");
    if (errors.length > 0) {
      // Retrying a deterministic compiler cannot help, but a model-driven
      // generator may well produce a valid package on a second pass.
      if (attempt < maxAttempts && deps.generator.name !== "local") {
        log(job, deps, "warn", "Package failed validation; regenerating.");
        await sleep(250 * attempt);
        continue;
      }
      return fail(
        job,
        deps,
        `Package failed validation with ${errors.length} error(s): ${errors[0]?.message ?? ""}`,
      );
    }

    const record: PackageRecord = {
      agentId: spec.id,
      agentVersion: spec.version,
      checksum: pkg.checksum,
      pkg,
      builtAt: startedAt,
      planId: plan.planId,
      planVersion: plan.version,
    };
    await deps.store.savePackage(record);

    job.status = "completed";
    job.checksum = pkg.checksum;
    job.endedAt = deps.clock.now().toISOString();
    log(job, deps, "info", `Validated and stored package ${pkg.checksum}.`);
    await deps.store.saveJob(job);
    return job;
  }

  return fail(job, deps, "Exhausted every build attempt.");
}

async function fail(job: BuildJob, deps: BuildDeps, error: string): Promise<BuildJob> {
  job.status = "failed";
  job.error = error;
  job.endedAt = deps.clock.now().toISOString();
  log(job, deps, "error", error);
  await deps.store.saveJob(job);
  return job;
}

/* ═══════════════════════ Building a whole plan ═══════════════════════ */

/**
 * `BuildPlanResult` plus the one thing that only exists at plan scope. Per-agent
 * outcomes live in `jobs`; a plan refused as a whole has no job to hang off, so
 * the refusal needs its own channel. Empty on every path where the plan itself
 * was acceptable, which lets a caller tell "the plan was rejected" apart from
 * "the agents failed to build" — two very different things to show an owner.
 */
export interface PlanBuildOutcome extends BuildPlanResult {
  planErrors: PlanValidationError[];
}

export async function buildPlan(
  plan: ApprovedPlan,
  deps: BuildDeps,
  options: BuildAgentOptions = {},
): Promise<PlanBuildOutcome> {
  /* ── The handoff gate, standing in front of the Factory ──
     PLAN_CONTRACT §6 calls the plan validator "the entire integration risk
     between the two lanes, reduced to one green/red check". A gate nothing
     calls is decoration, and this is the boundary the contract names: the
     Agent Factory entry point. Building agents out of a plan the validator has
     already judged unrunnable would bury the real error under four build logs
     and hand Activation a workforce assembled from an invalid plan.

     validateApprovedPlan rather than assertValidPlan: the caller needs the
     structured list to show, not an exception to catch and flatten into a
     string. Errors only — warnings are advisory by definition and must not
     block a build. */
  const planErrors = validateApprovedPlan(plan).filter((e) => e.severity === "error");
  if (planErrors.length > 0) {
    return {
      planId: plan.planId,
      planVersion: plan.version,
      jobs: [],
      built: 0,
      skipped: 0,
      failed: 0,
      // Not `isPlanBuilt`: a previous run may have left current packages
      // behind, but a plan that fails the gate must never read as ready.
      ready: false,
      planErrors,
    };
  }

  const jobs: BuildJob[] = [];

  // Sequential on purpose: build logs are read as a narrative in the UI, and a
  // deterministic order keeps sandbox runs reproducible. Agents are independent,
  // so this can become concurrent once the UI can present interleaved logs.
  for (const spec of plan.agents) {
    // One agent's failure must never abort the rest of the workforce.
    try {
      jobs.push(await buildAgent(spec, plan, deps, options));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const now = deps.clock.now().toISOString();
      jobs.push({
        jobId: deps.newId("job"),
        planId: plan.planId,
        planVersion: plan.version,
        agentId: spec.id,
        agentVersion: spec.version,
        status: "failed",
        attempt: 1,
        logs: [{ at: now, level: "error", message }],
        checksum: null,
        error: message,
        startedAt: now,
        endedAt: now,
      });
    }
  }

  const built = jobs.filter((j) => j.status === "completed").length;
  const skipped = jobs.filter((j) => j.status === "skipped").length;
  const failed = jobs.filter((j) => j.status === "failed").length;

  return {
    planId: plan.planId,
    planVersion: plan.version,
    jobs,
    built,
    skipped,
    failed,
    ready: await isPlanBuilt(plan, deps),
    planErrors: [],
  };
}

/* ═══════════════════════════ The gate ═══════════════════════════ */

export interface PlanBuildStatus {
  ready: boolean;
  /** Agents with no current package, and why. */
  missing: { agentId: string; reason: string }[];
}

/**
 * What Sandbox and Activation gate on. Deliberately re-derived from stored
 * packages rather than from job rows: a job row says what happened, a package
 * says what is actually available to run.
 */
export async function planBuildStatus(
  plan: ApprovedPlan,
  deps: Pick<BuildDeps, "store">,
): Promise<PlanBuildStatus> {
  const missing: { agentId: string; reason: string }[] = [];

  for (const spec of plan.agents) {
    const record = await deps.store.getPackage(spec.id, spec.version);
    if (!record) {
      missing.push({
        agentId: spec.id,
        reason: `No package built for version ${spec.version}.`,
      });
      continue;
    }
    const { checksumOf } = await import("../factory");
    if (record.checksum !== checksumOf(spec)) {
      missing.push({
        agentId: spec.id,
        reason: "The stored package no longer matches the approved spec.",
      });
    }
  }

  return { ready: missing.length === 0, missing };
}

export async function isPlanBuilt(
  plan: ApprovedPlan,
  deps: Pick<BuildDeps, "store">,
): Promise<boolean> {
  return (await planBuildStatus(plan, deps)).ready;
}

/* ═══════════════════ Loading a bundle for the executor ═══════════════════ */

/**
 * The bridge from M2 to M1: hand the executor the stored, validated package
 * rather than compiling on the fly. If this returns null the agent has not been
 * built for its current version and must not run.
 */
export async function loadBundle(
  spec: AgentSpec,
  deps: Pick<BuildDeps, "store">,
): Promise<{ spec: AgentSpec; pkg: AgentPackage } | null> {
  const record = await deps.store.getPackage(spec.id, spec.version);
  if (!record) return null;
  return { spec, pkg: record.pkg };
}
