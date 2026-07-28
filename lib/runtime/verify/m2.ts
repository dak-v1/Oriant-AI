/**
 * lib/runtime/verify/m2.ts — the M2 exit criteria, as an executable check.
 *
 * ROLE_C_PLAN M2 exits when the fixture plan produces four generated packages
 * AND the runtime executes them with identical results to the HAND-WRITTEN
 * reference packages from M1. The plan is explicit that "the job turned green"
 * is NOT the acceptance criterion: a build pipeline that quietly alters
 * behaviour is worse than one that fails, because Activation gates on green.
 *
 * So the centrepiece here is EQUIVALENCE (M2-3): every agent's pipeline-built
 * package is compared against the frozen literal in
 * lib/runtime/build/reference-packages.ts — structurally, field by field, and
 * behaviourally, by executing both and diffing the event streams.
 *
 * The reference side deliberately does not come from the compiler. This check
 * used to compare `compileAgent(spec)` against `compileAgent(spec)`, which
 * could not fail: `compileAgent` is pure in (spec, builtAt) and the built
 * package's own builtAt was handed back to the reference, so both sides were
 * the same function. It proved determinism, which M1 already proves, and it
 * would have passed unchanged had the compiler emitted a wrong package.
 *
 * Run it with: npm run verify:m2
 */

import { BRIGHTPATH_PLAN } from "../../plan/fixtures/brightpath";
import { DUPLICATE_WORKFLOW_ID } from "../../plan/fixtures/invalid-plans";
import type { AgentPolicy, AgentSpec, ApprovedPlan } from "../../plan/types";
import { bundleAgent } from "../factory";
import { startRun } from "../executor";
import type { ExecutorOptions } from "../executor";
import { FixtureReasoner } from "../llm";
import { InMemoryRunStore, FixedClock, createIdFactory } from "../store";
import { StubIntegrationProvider } from "../tools";
import type { AgentPackage, RunEvent, TriggerEvent } from "../types";
import { InMemoryBuildStore } from "../build/store";
import {
  LocalPackageGenerator,
  buildPlan,
  loadBundle,
  planBuildStatus,
} from "../build/runner";
import type { BuildDeps, PackageGenerator } from "../build/types";
import { validatePackage } from "../build/validate-package";
import { referencePackage } from "../build/reference-packages";

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
async function eventsFor(spec: AgentSpec, pkg: AgentPackage): Promise<RunEvent[]> {
  const out = await startRun({ spec, pkg }, triggerFor(spec), execDeps("eq"));
  return out.run.events;
}

/* ═══════════════════════ Readable structural diff ═══════════════════════ */

/**
 * `JSON.stringify(a) !== JSON.stringify(b)` answers the question but tells the
 * author nothing. When the reference packages disagree with a build, someone
 * has to decide whether the compiler changed on purpose, and they can only do
 * that if the failure names the field — which line of a forty-line prompt
 * moved, which step's risk was rewritten. So this walks both values and
 * reports paths.
 */
function diff(expected: unknown, actual: unknown, path = "", found: string[] = []): string[] {
  // A wall of diff is as unreadable as none. Six is enough to characterise the
  // change; the author reads the file for the rest.
  if (found.length >= 6) return found;
  const where = path === "" ? "package" : path;

  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      found.push(`${where}: expected ${describe(expected)}, found ${describe(actual)}`);
      return found;
    }
    if (expected.length !== actual.length) {
      found.push(`${where}: ${expected.length} entr(ies) expected, ${actual.length} found`);
    }
    for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
      diff(expected[i], actual[i], `${where}[${i}]`, found);
    }
    return found;
  }

  if (isRecord(expected) && isRecord(actual)) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    for (const key of keys) {
      diff(expected[key], actual[key], path === "" ? key : `${path}.${key}`, found);
    }
    return found;
  }

  if (expected === actual) return found;

  // Prompts are the field most likely to move, and quoting two 2,000-character
  // strings at each other helps nobody.
  if (
    typeof expected === "string" &&
    typeof actual === "string" &&
    (expected.includes("\n") || actual.includes("\n"))
  ) {
    found.push(`${where}: ${firstLineDifference(expected, actual)}`);
    return found;
  }

  found.push(`${where}: expected ${describe(expected)}, found ${describe(actual)}`);
  return found;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  if (value === undefined) return "nothing";
  if (typeof value === "string") {
    const flat = value.replace(/\n/g, "\\n");
    return flat.length > 72 ? `"${flat.slice(0, 72)}…"` : `"${flat}"`;
  }
  return JSON.stringify(value);
}

function firstLineDifference(expected: string, actual: string): string {
  const want = expected.split("\n");
  const got = actual.split("\n");
  for (let i = 0; i < Math.max(want.length, got.length); i++) {
    if (want[i] === got[i]) continue;
    return `line ${i + 1} expected ${describe(want[i] ?? "(nothing)")}, found ${describe(got[i] ?? "(nothing)")}`;
  }
  // Equal line by line but not equal as strings — a trailing newline, almost
  // always. Worth naming, because it is invisible in any other report.
  return `same ${want.length} lines but different string length (${expected.length} vs ${actual.length}); trailing whitespace?`;
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

  /* 3. THE EXIT CRITERION — every pipeline-built package must match the frozen
        hand-written reference, in shape and in behaviour. Any divergence means
        either the Factory changed the agent, or the compiler changed and
        somebody has to decide whether that was intended. See the file header
        for why the reference must not come from the compiler. */
  {
    const divergent: string[] = [];
    const details: string[] = [];

    for (const spec of BRIGHTPATH_PLAN.agents) {
      const built = await loadBundle(spec, deps);
      if (!built) {
        divergent.push(`${spec.id}:no package`);
        continue;
      }

      const reference = referencePackage(spec.id, spec.version);
      if (!reference) {
        // Never fall back to compiling one. An absent reference is a hole in
        // the exit criterion — adding a fifth agent must widen the frozen set,
        // not quietly narrow this check's scope.
        divergent.push(`${spec.id}:no frozen reference`);
        details.push(
          `${spec.id}: nothing frozen for v${spec.version} — add it to lib/runtime/build/reference-packages.ts deliberately`,
        );
        continue;
      }

      /* builtAt is the one field that legitimately differs: the build stamps
         it from the build clock, the reference carries the instant it was
         frozen at. Rebase that single field and require everything else —
         prompt text, compiled steps, allowlist, checksum — to be identical.
         The checksum comparison is live coverage of checksumOf itself, because
         the reference holds a literal rather than a call to it. */
      const expected: AgentPackage = { ...reference, builtAt: built.pkg.builtAt };
      const structural = diff(expected, built.pkg);
      if (structural.length > 0) {
        divergent.push(`${spec.id}:structure`);
        details.push(`${spec.id} — ${structural.join(" · ")}`);
      }

      /* Structural equality is not enough on its own: the plan's wording is
         "executes them with identical results", and a package can be shaped
         right and still run differently once the executor interprets it. Same
         seed both sides, so any difference is the package. */
      const behavioural = diff(
        await eventsFor(spec, expected),
        await eventsFor(spec, built.pkg),
        "events",
      );
      if (behavioural.length > 0) {
        divergent.push(`${spec.id}:events`);
        details.push(`${spec.id} events — ${behavioural.join(" · ")}`);
      }
    }

    // The build clock stamps builtAt, and the rebase above deliberately hides
    // that field from the comparison. Assert it separately so the rebase can
    // never mask a package built with a clock nobody injected.
    const stamped = await Promise.all(
      BRIGHTPATH_PLAN.agents.map(async (spec) => (await loadBundle(spec, deps))?.pkg.builtAt),
    );
    const clockHonoured = stamped.every((at) => at === NOW);
    if (!clockHonoured) details.push(`builtAt should be ${NOW} everywhere, found ${JSON.stringify(stamped)}`);

    add(
      "M2-3 built packages match the hand-written references, in shape and behaviour",
      divergent.length === 0 && clockHonoured,
      divergent.length === 0 && clockHonoured
        ? `all ${BRIGHTPATH_PLAN.agents.length} agents identical to their frozen reference`
        : `divergent: ${divergent.join(", ")}\n        ${details.join("\n        ")}`,
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

  /* 7b. The same gate one level deeper. A generator may enrich prompts; it may
         never restate the steps. This one drops every `approve` checkpoint and
         downgrades every act to low risk — two changes the allowlist check in
         M2-7 cannot see, because no operation is added and nothing is granted
         that the plan did not grant. */
  {
    class DriftingGenerator implements PackageGenerator {
      readonly name = "drifting";
      private local = new LocalPackageGenerator();
      async generate(spec: AgentSpec, options: { builtAt: string }) {
        const pkg = await this.local.generate(spec, options);
        return {
          ...pkg,
          workflows: pkg.workflows.map((workflow) => ({
            ...workflow,
            steps: workflow.steps
              .filter((step) => step.kind !== "approve")
              .map((step) => (step.kind === "act" ? { ...step, risk: "low" as const } : step)),
          })),
        };
      }
    }

    // Derived, not hardcoded: marketing already drafts at low risk and holds no
    // checkpoint, so this mutation genuinely does not change its package and it
    // must still build. That is FAILURE IS PER AGENT working, not a miss.
    const touched = BRIGHTPATH_PLAN.agents
      .filter((agent) =>
        agent.workflows.some((workflow) =>
          workflow.steps.some(
            (step) => step.kind === "approve" || (step.kind === "act" && step.risk !== "low"),
          ),
        ),
      )
      .map((agent) => agent.id)
      .sort();

    const drifting = buildDeps("drift");
    drifting.generator = new DriftingGenerator();
    drifting.maxAttempts = 1;
    const result = await buildPlan(BRIGHTPATH_PLAN, drifting);
    const failedIds = result.jobs.filter((j) => j.status === "failed").map((j) => j.agentId).sort();
    const stored = (await drifting.store.listPackages()).map((p) => p.agentId).sort();

    add(
      "M2-7b dropped checkpoints and rewritten risk levels fail the build",
      JSON.stringify(failedIds) === JSON.stringify(touched) &&
        touched.every((id) => !stored.includes(id)),
      `failed=${JSON.stringify(failedIds)} expected=${JSON.stringify(touched)} stored=${JSON.stringify(stored)}`,
    );
  }

  /* 7c. The handoff gate in front of the Factory. A plan the validator refuses
         must produce no jobs and no packages at all — not four failed builds,
         because the fault is the plan's, not any agent's. */
  {
    const refused = buildDeps("refuse");
    const result = await buildPlan(DUPLICATE_WORKFLOW_ID, refused);
    const packages = await refused.store.listPackages();
    const jobs = await refused.store.listJobs();

    add(
      "M2-7c an invalid plan is refused before any agent is built",
      result.planErrors.length > 0 &&
        result.jobs.length === 0 &&
        result.built === 0 &&
        !result.ready &&
        packages.length === 0 &&
        jobs.length === 0,
      `planErrors=${result.planErrors.length} jobs=${result.jobs.length} storedJobs=${jobs.length} packages=${packages.length} ready=${result.ready}`,
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

      /* An operating mode this build does not implement. The cast is the
         point: a plan arriving as JSON is not bound by the union, and the
         runtime refuses every act under a mode it cannot interpret, so a
         package built from one must never reach a green job. */
      const badModeSpec: AgentSpec = {
        ...spec,
        policy: { ...spec.policy, operatingMode: "draft_onlyy" as AgentPolicy["operatingMode"] },
      };
      const badModePkg = bundleAgent(badModeSpec, { builtAt: NOW }).pkg;

      const cleanFindings = validatePackage(good, spec);
      const tamperedErrors = validatePackage(tampered, spec).filter((f) => f.severity === "error");
      const versionErrors = validatePackage(wrongVersion, spec).filter((f) => f.severity === "error");
      const modeErrors = validatePackage(badModePkg, badModeSpec).filter(
        (f) => f.severity === "error",
      );

      add(
        "M2-10 package validation passes a good package and rejects tampering",
        cleanFindings.filter((f) => f.severity === "error").length === 0 &&
          tamperedErrors.length > 0 &&
          versionErrors.length > 0 &&
          modeErrors.some((f) => f.message.includes("operatingMode")),
        `clean=${cleanFindings.length} emptyPrompt=${tamperedErrors.length} wrongVersion=${versionErrors.length} badMode=${modeErrors.length}`,
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
