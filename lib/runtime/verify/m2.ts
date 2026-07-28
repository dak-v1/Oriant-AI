/**
 * lib/runtime/verify/m2.ts — the M2 exit criteria, as an executable check.
 *
 * ROLE_C_PLAN M2 exits when the fixture plan produces four generated packages
 * AND the runtime executes them with identical results to a directly-compiled
 * reference. The plan is explicit that "the job turned green" is NOT the
 * acceptance criterion: a build pipeline that quietly alters behaviour is worse
 * than one that fails, because Activation gates on green.
 *
 * So the centrepiece here is EQUIVALENCE (M2-3): every agent is run twice, once
 * on a package that went through the full Factory pipeline and once on a package
 * compiled directly, and the two event streams must match byte for byte.
 *
 * Run it with: npm run verify:m2
 */

import { BRIGHTPATH_PLAN } from "../../plan/fixtures/brightpath";
import type { AgentSpec, ApprovedPlan } from "../../plan/types";
import { bundleAgent } from "../factory";
import { startRun } from "../executor";
import type { ExecutorOptions } from "../executor";
import { FixtureReasoner } from "../llm";
import { InMemoryRunStore, FixedClock, createIdFactory } from "../store";
import { StubIntegrationProvider } from "../tools";
import type { AgentPackage, TriggerEvent } from "../types";
import { InMemoryBuildStore } from "../build/store";
import {
  LocalPackageGenerator,
  buildPlan,
  loadBundle,
  planBuildStatus,
} from "../build/runner";
import type { BuildDeps, PackageGenerator } from "../build/types";
import { validatePackage } from "../build/validate-package";

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

const NOW = "2026-07-24T01:00:00.000Z"; // 09:00 Asia/Singapore

function buildDeps(seed = "b"): BuildDeps & { store: InMemoryBuildStore } {
  const store = new InMemoryBuildStore();
  return {
    store,
    generator: new LocalPackageGenerator(),
    clock: new FixedClock(NOW),
    newId: createIdFactory(seed),
    sleep: async () => {},
  };
}

function execDeps(seed: string): ExecutorOptions {
  return {
    store: new InMemoryRunStore(),
    tools: new StubIntegrationProvider(),
    reasoner: new FixtureReasoner(),
    clock: new FixedClock(NOW),
    newId: createIdFactory(seed),
    sleep: async () => {},
    globalPolicy: BRIGHTPATH_PLAN.globalPolicy,
  };
}

function triggerFor(spec: AgentSpec): TriggerEvent {
  const workflow = spec.workflows[0];
  if (!workflow) throw new Error(`Agent ${spec.id} has no workflows.`);
  return {
    kind: workflow.trigger.kind === "schedule" ? "schedule" : "manual",
    workflowId: workflow.id,
    agentId: spec.id,
    firedAt: NOW,
    payload: {},
    idempotencyKey: `${spec.id}:eq`,
  };
}

/** Same seed both times, so any difference is the package, not the harness. */
async function eventsFor(spec: AgentSpec, pkg: AgentPackage): Promise<string> {
  const out = await startRun({ spec, pkg }, triggerFor(spec), execDeps("eq"));
  return JSON.stringify(out.run.events);
}

/** A plan with one agent's version bumped, to prove selective rebuilds. */
function bumpAgent(plan: ApprovedPlan, agentId: string): ApprovedPlan {
  const next = structuredClone(plan);
  const agent = next.agents.find((a) => a.id === agentId);
  if (!agent) throw new Error(`No agent ${agentId}`);
  agent.version += 1;
  agent.guidance.tone = `${agent.guidance.tone ?? ""} Be concise.`.trim();
  return next;
}

export async function runM2Verification(): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean, detail: string) =>
    checks.push({ name, pass, detail });

  /* 1. A cold build produces one validated package per agent. */
  const deps = buildDeps("cold");
  {
    const result = await buildPlan(BRIGHTPATH_PLAN, deps);
    const packages = await deps.store.listPackages();
    add(
      "M2-1 cold build produces a package for every agent",
      result.built === BRIGHTPATH_PLAN.agents.length &&
        result.failed === 0 &&
        packages.length === BRIGHTPATH_PLAN.agents.length,
      `built=${result.built} skipped=${result.skipped} failed=${result.failed} packages=${packages.length}`,
    );

    add(
      "M2-2 every job carries a readable log trail",
      result.jobs.every((j) => j.logs.length >= 2 && j.endedAt !== null),
      result.jobs.map((j) => `${j.agentId}:${j.status}/${j.logs.length} lines`).join(", "),
    );
  }

  /* 3. THE EXIT CRITERION — a pipeline-built package must behave exactly like a
        directly-compiled one. Any divergence means the Factory changed the
        agent, which is precisely what must never happen. */
  {
    const divergent: string[] = [];
    for (const spec of BRIGHTPATH_PLAN.agents) {
      const built = await loadBundle(spec, deps);
      if (!built) {
        divergent.push(`${spec.id}:no package`);
        continue;
      }
      const reference = bundleAgent(spec, { builtAt: built.pkg.builtAt });

      if (built.pkg.checksum !== reference.pkg.checksum) {
        divergent.push(`${spec.id}:checksum`);
        continue;
      }

      const builtEvents = await eventsFor(spec, built.pkg);
      const referenceEvents = await eventsFor(spec, reference.pkg);
      if (builtEvents !== referenceEvents) divergent.push(`${spec.id}:events`);
    }

    add(
      "M2-3 built packages execute identically to directly-compiled ones",
      divergent.length === 0,
      divergent.length === 0
        ? `all ${BRIGHTPATH_PLAN.agents.length} agents byte-identical`
        : `divergent: ${divergent.join(", ")}`,
    );
  }

  /* 4. Rebuilding an unchanged plan must do no work. */
  {
    const result = await buildPlan(BRIGHTPATH_PLAN, deps);
    add(
      "M2-4 rebuilding an unchanged plan skips every agent",
      result.skipped === BRIGHTPATH_PLAN.agents.length && result.built === 0,
      `built=${result.built} skipped=${result.skipped}`,
    );
  }

  /* 5. Bumping one agent rebuilds one agent. */
  {
    const bumped = bumpAgent(BRIGHTPATH_PLAN, "finance-followup");
    const result = await buildPlan(bumped, deps);
    const rebuilt = result.jobs.filter((j) => j.status === "completed").map((j) => j.agentId);
    add(
      "M2-5 a version bump rebuilds only that agent",
      result.built === 1 && rebuilt[0] === "finance-followup" && result.skipped === 3,
      `built=${JSON.stringify(rebuilt)} skipped=${result.skipped}`,
    );
  }

  /* 6. An edited spec that forgot its version bump must NOT serve the old
        package. Version alone would let yesterday's agent run under today's
        plan; the checksum is what catches it. */
  {
    const sneaky = structuredClone(BRIGHTPATH_PLAN);
    const agent = sneaky.agents.find((a) => a.id === "marketing");
    if (agent) agent.guidance.objective += " Also post on Fridays.";
    const result = await buildPlan(sneaky, deps);
    const marketingJob = result.jobs.find((j) => j.agentId === "marketing");
    add(
      "M2-6 an edited spec with no version bump is still rebuilt",
      marketingJob?.status === "completed",
      `marketing job status=${marketingJob?.status} (skipped would mean a stale package)`,
    );
  }

  /* 7. Validation gates completion: a generator that widens the allowlist must
        fail the build, not produce a green job. */
  {
    class WideningGenerator implements PackageGenerator {
      readonly name = "widening";
      private local = new LocalPackageGenerator();
      async generate(spec: AgentSpec, options: { builtAt: string }) {
        const pkg = await this.local.generate(spec, options);
        // The single most dangerous possible defect.
        return { ...pkg, allowedOperations: [...pkg.allowedOperations, "hubspot.refunds.issue"] };
      }
    }
    const bad = buildDeps("wide");
    bad.generator = new WideningGenerator();
    bad.maxAttempts = 1;
    const result = await buildPlan(BRIGHTPATH_PLAN, bad);
    const packages = await bad.store.listPackages();
    add(
      "M2-7 a widened allowlist fails the build and stores nothing",
      result.failed === BRIGHTPATH_PLAN.agents.length && packages.length === 0,
      `failed=${result.failed} storedPackages=${packages.length}`,
    );
  }

  /* 8. A throwing generator retries, then fails cleanly without blocking peers. */
  {
    class FlakyGenerator implements PackageGenerator {
      readonly name = "flaky";
      private local = new LocalPackageGenerator();
      private seen = new Map<string, number>();
      async generate(spec: AgentSpec, options: { builtAt: string }) {
        const n = (this.seen.get(spec.id) ?? 0) + 1;
        this.seen.set(spec.id, n);
        // Marketing fails once then succeeds; service-recovery always fails.
        if (spec.id === "marketing" && n === 1) throw new Error("transient generator error");
        if (spec.id === "service-recovery") throw new Error("permanent generator error");
        return this.local.generate(spec, options);
      }
    }
    const flaky = buildDeps("flaky");
    flaky.generator = new FlakyGenerator();
    flaky.maxAttempts = 2;
    const result = await buildPlan(BRIGHTPATH_PLAN, flaky);
    const marketing = result.jobs.find((j) => j.agentId === "marketing");
    const recovery = result.jobs.find((j) => j.agentId === "service-recovery");
    add(
      "M2-8 generation retries, and one agent's failure spares the others",
      marketing?.status === "completed" &&
        marketing.attempt === 2 &&
        recovery?.status === "failed" &&
        result.built === 3,
      `marketing=${marketing?.status}@attempt${marketing?.attempt} recovery=${recovery?.status} built=${result.built}`,
    );
  }

  /* 9. The gate Sandbox and Activation read must be honest. */
  {
    const fresh = buildDeps("gate");
    const before = await planBuildStatus(BRIGHTPATH_PLAN, fresh);
    await buildPlan(BRIGHTPATH_PLAN, fresh);
    const after = await planBuildStatus(BRIGHTPATH_PLAN, fresh);

    const bumped = bumpAgent(BRIGHTPATH_PLAN, "admin-operations");
    const afterBump = await planBuildStatus(bumped, fresh);

    add(
      "M2-9 the build gate is closed before, open after, and reopens on change",
      !before.ready &&
        before.missing.length === BRIGHTPATH_PLAN.agents.length &&
        after.ready &&
        !afterBump.ready &&
        afterBump.missing[0]?.agentId === "admin-operations",
      `before=${before.ready} after=${after.ready} afterBump=${afterBump.ready} missing=${JSON.stringify(afterBump.missing.map((m) => m.agentId))}`,
    );
  }

  /* 10. Package validation independently rejects a tampered package. */
  {
    const spec = BRIGHTPATH_PLAN.agents[0];
    if (!spec) {
      add("M2-10 package validation rejects tampering", false, "no agents in plan");
    } else {
      const good = bundleAgent(spec, { builtAt: NOW }).pkg;
      const tampered: AgentPackage = { ...good, systemPrompt: "" };
      const wrongVersion: AgentPackage = { ...good, agentVersion: good.agentVersion + 5 };

      const cleanFindings = validatePackage(good, spec);
      const tamperedErrors = validatePackage(tampered, spec).filter((f) => f.severity === "error");
      const versionErrors = validatePackage(wrongVersion, spec).filter((f) => f.severity === "error");

      add(
        "M2-10 package validation passes a good package and rejects tampering",
        cleanFindings.filter((f) => f.severity === "error").length === 0 &&
          tamperedErrors.length > 0 &&
          versionErrors.length > 0,
        `clean=${cleanFindings.length} emptyPrompt=${tamperedErrors.length} wrongVersion=${versionErrors.length}`,
      );
    }
  }

  /* 11. Loading a bundle for an unbuilt version must refuse, not fall back. */
  {
    const fresh = buildDeps("load");
    const spec = BRIGHTPATH_PLAN.agents[0];
    if (!spec) {
      add("M2-11 loadBundle refuses an unbuilt agent", false, "no agents in plan");
    } else {
      const beforeBuild = await loadBundle(spec, fresh);
      await buildPlan(BRIGHTPATH_PLAN, fresh);
      const afterBuild = await loadBundle(spec, fresh);
      const bumpedSpec: AgentSpec = { ...spec, version: spec.version + 1 };
      const afterBump = await loadBundle(bumpedSpec, fresh);

      add(
        "M2-11 loadBundle refuses unbuilt versions instead of serving a stale one",
        beforeBuild === null && afterBuild !== null && afterBump === null,
        `before=${beforeBuild === null ? "null" : "bundle"} after=${afterBuild ? "bundle" : "null"} afterBump=${afterBump === null ? "null" : "STALE BUNDLE"}`,
      );
    }
  }

  return checks;
}

export function formatResults(results: Check[]): string {
  const lines = results.map(
    (r) => `${r.pass ? "PASS" : "FAIL"}  ${r.name}\n        ${r.detail}`,
  );
  const failed = results.filter((r) => !r.pass).length;
  lines.push("");
  lines.push(
    failed === 0
      ? `M2 EXIT CRITERIA MET — ${results.length}/${results.length} checks passed.`
      : `M2 NOT MET — ${failed} of ${results.length} checks failed.`,
  );
  return lines.join("\n");
}
