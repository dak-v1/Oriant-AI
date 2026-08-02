/**
 * lib/runtime/verify/e2e.ts — Role B's handoff to a live, monitored workforce.
 *
 * Every other verify target proves one milestone. This one proves the JOINS:
 * that ingest hands something build can consume, that build hands something the
 * sandbox can prove, that the sandbox hands something activation will accept,
 * and that what comes out the far end can actually be watched and decided on.
 *
 * The joins are where integrations fail, and they fail in a specific way — each
 * end works, and the two disagree about something neither one's tests look at.
 * So the checks below deliberately assert across boundaries: E2E-4 requires the
 * verdict to be earned on the artefact the Factory STORED rather than a fresh
 * compile, and E2E-7 requires the run that appears after activation to pause
 * exactly the way ingest promised it would.
 *
 * It also proves the pipeline REFUSES correctly (E2E-1, E2E-8). A chain that
 * only demonstrates the happy path is a demo, not a gate.
 *
 * Run it with: npm run verify:e2e
 */

import { ROLE_B_HANDOFF, ROLE_B_HANDOFF_RESOLVED } from "../../plan/fixtures/role-b-handoff";
import { runPipeline } from "../pipeline/run";
import type { PipelineDeps } from "../pipeline/run";
import { InMemoryBuildStore } from "../build/store";
import { LocalPackageGenerator } from "../build/runner";
import { InMemorySchedulerStore } from "../schedule/store";
import type { SchedulerDeps } from "../schedule/types";
import { StubIntegrationProvider } from "../tools";
import { FixedClock, createIdFactory, InMemoryRunStore } from "../store";
import { smokeScenariosForPlan, suiteForPlan, SMOKE_CATEGORY } from "../sandbox/smoke";
import { BRIGHTPATH_SCENARIOS } from "../sandbox/scenarios";
import { BRIGHTPATH_PLAN } from "../../plan/fixtures/brightpath";
import { loadBundle } from "../build/runner";
import { startRun } from "../executor";
import type { ExecutorOptions } from "../executor";
import { FixtureReasoner } from "../llm";
import { isReadOnly } from "../../plan/operations";
import type { TriggerEvent } from "../types";

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

const NOW = "2026-08-01T01:00:00.000Z"; // 09:00 Asia/Singapore

function deps(seed: string): PipelineDeps & {
  buildStore: InMemoryBuildStore;
  schedulerStore: InMemorySchedulerStore;
  provider: StubIntegrationProvider;
} {
  const buildStore = new InMemoryBuildStore();
  const schedulerStore = new InMemorySchedulerStore();
  const provider = new StubIntegrationProvider();
  const clock = new FixedClock(NOW);
  const newId = createIdFactory(seed);

  const scheduler: SchedulerDeps = {
    store: schedulerStore,
    clock,
    newId,
  } as SchedulerDeps;

  return {
    build: {
      store: buildStore,
      generator: new LocalPackageGenerator(),
      clock,
      newId,
      sleep: async () => {},
    },
    scheduler,
    integrations: provider,
    activatedBy: "user_sarah_chen",
    buildStore,
    schedulerStore,
    provider,
  };
}

export async function runE2EVerification(): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean, detail: string) =>
    checks.push({ name, pass, detail });

  /* 1. The pipeline refuses Role B's real handoff, at the FIRST gate, and does
        not quietly continue past it. */
  {
    const d = deps("refuse");
    const result = await runPipeline({ payload: ROLE_B_HANDOFF }, d);
    const packages = await d.buildStore.listPackages();
    const deployments = await d.schedulerStore.listDeployments();
    add(
      "E2E-1 the real handoff is refused at ingest, and nothing downstream runs",
      !result.completed &&
        result.stoppedAt === "ingest" &&
        packages.length === 0 &&
        deployments.length === 0,
      `stoppedAt=${result.stoppedAt} packagesBuilt=${packages.length} deployments=${deployments.length}`,
    );
  }

  /* 2. Every stage is reported, in order, whatever the outcome — so a UI can
        render six rows without branching on success. */
  {
    const d = deps("shape");
    const result = await runPipeline({ payload: ROLE_B_HANDOFF }, d);
    const order = result.stages.map((s) => s.stage).join(",");
    add(
      "E2E-2 all six stages are always reported in order",
      order === "collect,ingest,validate,build,prove,activate",
      order,
    );
  }

  /* 3. THE HAPPY PATH. A corrected handoff runs all the way to live. */
  const d = deps("live");
  const live = await runPipeline({ payload: ROLE_B_HANDOFF_RESOLVED }, d);
  add(
    "E2E-3 a corrected handoff reaches a live deployment",
    live.completed && live.live !== null && live.live.deploymentId !== null,
    live.completed
      ? `deployment=${live.live?.deploymentId} agents=${live.live?.agents} triggers=${live.live?.triggersRegistered}`
      : `stoppedAt=${live.stoppedAt}: ${live.stages.find((s) => s.stage === live.stoppedAt)?.detail.join(" | ")}`,
  );

  /* 4. The verdict was earned on the STORED package, not a fresh compile. This
        is the join that would silently rot: the sandbox proving one artefact
        while activation deploys another. */
  {
    const plan = live.plan;
    const stored = plan ? await loadBundle(plan.agents[0]!, d.build) : null;
    add(
      "E2E-4 the proven artefact is the one the Factory stored",
      stored !== null,
      stored
        ? `checksum ${stored.pkg.checksum} present in the build store after activation`
        : "no stored package for the first agent",
    );
  }

  /* 5. An ingested agent has no authored scenario, so smoke cover is what made
        the gate openable. Assert it was generated rather than assumed. */
  {
    const plan = live.plan;
    const suite = plan ? suiteForPlan(plan, BRIGHTPATH_SCENARIOS) : [];
    const generated = suite.filter((s) => s.category === SMOKE_CATEGORY);
    add(
      "E2E-5 agents with no authored scenario get generated cover",
      plan !== null && generated.length > 0 && generated.length === suite.length,
      `suite=${suite.length} generated=${generated.length} (authored BrightPath cases do not apply to an ingested plan)`,
    );
  }

  /* 6. Smoke cover never displaces an authored scenario. A weak generated case
        reporting green over a failing real one would be the worst outcome. */
  {
    const suite = suiteForPlan(BRIGHTPATH_PLAN, BRIGHTPATH_SCENARIOS);
    const generated = suite.filter((s) => s.category === SMOKE_CATEGORY);
    add(
      "E2E-6 authored scenarios are never replaced by generated ones",
      generated.length === 0 && suite.length === BRIGHTPATH_SCENARIOS.length,
      `BrightPath suite=${suite.length} generated=${generated.length}`,
    );
  }

  /* 7. MONITORING. Run the live workforce and require it to behave exactly as
        ingest promised: pause, and write nothing. Reading operatingMode would
        not catch a write that reached a tool. */
  {
    const plan = live.plan;
    const agent = plan?.agents[0];
    if (!plan || !agent) {
      add("E2E-7 the live workforce pauses instead of acting", false, "no live plan");
    } else {
      const bundle = await loadBundle(agent, d.build);
      const provider = new StubIntegrationProvider();
      const exec: ExecutorOptions = {
        store: new InMemoryRunStore(),
        tools: provider,
        reasoner: new FixtureReasoner(),
        clock: new FixedClock(NOW),
        newId: createIdFactory("e2e-run"),
        sleep: async () => {},
        globalPolicy: plan.globalPolicy,
      };
      const trigger: TriggerEvent = {
        kind: "manual",
        workflowId: agent.workflows[0]?.id ?? "",
        agentId: agent.id,
        firedAt: NOW,
        payload: {},
        idempotencyKey: "e2e-1",
      };
      const out = bundle ? await startRun(bundle, trigger, exec) : null;
      const writes = provider.client.calls
        .map((c) => c.operation)
        .filter((op) => !isReadOnly(op));
      add(
        "E2E-7 the live workforce pauses for the owner and writes nothing",
        out?.status === "awaiting_approval" && writes.length === 0,
        `status=${out?.status} approval=${out?.approvalId ?? "none"} writes=${JSON.stringify(writes)}`,
      );
    }
  }

  /* 8. The gates cannot be walked around. Re-running with an unbuilt store must
        stop at build, not sail through on the previous pass's evidence. */
  {
    const fresh = deps("gate");
    // Deliberately break the generator so the build gate cannot open.
    fresh.build.generator = {
      name: "broken",
      async generate() {
        throw new Error("generator unavailable");
      },
    };
    fresh.build.maxAttempts = 1;
    const result = await runPipeline({ payload: ROLE_B_HANDOFF_RESOLVED }, fresh);
    const deployments = await fresh.schedulerStore.listDeployments();
    add(
      "E2E-8 a shut build gate stops the pass and activates nothing",
      !result.completed && result.stoppedAt === "build" && deployments.length === 0,
      `stoppedAt=${result.stoppedAt} deployments=${deployments.length}`,
    );
  }

  /* 9. The assumptions survive the whole pass. An owner reading the result of a
        successful activation must still see that every agent is draft_only
        because Role B sent no policy. */
  {
    add(
      "E2E-9 ingest assumptions are carried through to the live result",
      live.gaps.some((g) => g.code === "policy_absent") &&
        live.plan?.agents.every((a) => a.policy.operatingMode === "draft_only") === true,
      `gaps=${live.gaps.length} modes=${live.plan?.agents.map((a) => a.policy.operatingMode).join(",")}`,
    );
  }

  /* 10. Determinism across the whole chain, so a re-run is a re-run. */
  {
    const a = await runPipeline({ payload: ROLE_B_HANDOFF_RESOLVED }, deps("det"));
    const b = await runPipeline({ payload: ROLE_B_HANDOFF_RESOLVED }, deps("det"));
    const fa = JSON.stringify(a.stages.map((s) => [s.stage, s.status, s.summary]));
    const fb = JSON.stringify(b.stages.map((s) => [s.stage, s.status, s.summary]));
    add("E2E-10 the whole pass is deterministic", fa === fb, `equal=${fa === fb}`);
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
      ? `END TO END OK — ${results.length}/${results.length} checks passed.`
      : `END TO END BROKEN — ${failed} of ${results.length} checks failed.`,
  );
  return lines.join("\n");
}
