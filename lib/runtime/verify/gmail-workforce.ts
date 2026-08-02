/**
 * lib/runtime/verify/gmail-workforce.ts — the workforce this account can run,
 * proved by running it.
 *
 * WHY THIS TARGET EXISTS SEPARATELY FROM e2e.ts. That file proves the JOINS on
 * BrightPath's handoff: ingest into build into sandbox into activation. It
 * cannot prove the thing this one is about, because BrightPath's plan needs
 * `hubspot.invoices.list` and `quickbooks.invoices.list`, which
 * lib/runtime/tools/capabilities.ts records as unroutable — Composio publishes
 * no such tool in either toolkit. A pass that is green on operations that could
 * never execute proves the pipeline, not the workforce.
 *
 * So this target takes the fixture in lib/plan/fixtures/meridian.ts, whose whole
 * tool surface is Gmail and Google Calendar — the two toolkits this account
 * holds live ACTIVE Composio connections for — and asks two different questions
 * about it:
 *
 *   Could it execute?   GW-2 walks every granted operation through
 *                       `resolveCapability` and requires a real published tool
 *                       for each. This is the check that would have caught the
 *                       invoice operations before they reached a demo.
 *   Does it execute?    GW-4..GW-8 run it. The handoff goes through
 *                       `runPipeline` to a live deployment, the deployed
 *                       packages are then driven through the real executor, and
 *                       the configured plan is put through the same three
 *                       activation gates.
 *
 * NOTHING HERE TOUCHES COMPOSIO, and that is a property of the wiring rather
 * than a promise: every pass builds its own `StubIntegrationProvider`,
 * `FixedClock`, seeded id factory and in-memory stores, exactly as the sandbox
 * does. `PipelineDeps.integrationsFor` is a resolver, so handing it a stub is
 * the supported way to keep a whole pass offline — see the field's own note in
 * lib/runtime/pipeline/run.ts. No environment variable is read and no network
 * call is possible.
 *
 * WHAT IT DELIBERATELY DOES NOT CLAIM. `runPipeline` ingests: its only input is
 * a handoff, and `ingestHandoff` synthesises `draft_only` agents with manual
 * triggers from it. So the plan that reaches the live deployment in GW-4 is the
 * CONVERTED one, not `MERIDIAN_PLAN`, and saying otherwise would be the kind of
 * assertion this file exists to replace. GW-6 and GW-7 close that gap the only
 * honest way available — by driving the configured plan through the same build,
 * sandbox and activation modules the pipeline itself calls, in the same order.
 *
 * Run it with: node scripts/verify.mjs gmailworkforce
 */

import { MERIDIAN_HANDOFF, MERIDIAN_PLAN } from "../../plan/fixtures/meridian";
import { isReadOnly } from "../../plan/operations";
import type { AgentSpec, ApprovedPlan } from "../../plan/types";
import { validateApprovedPlan } from "../../plan/validate";
import { LocalPackageGenerator, buildPlan, loadBundle, planBuildStatus } from "../build/runner";
import { InMemoryBuildStore } from "../build/store";
import { startRun } from "../executor";
import type { ExecutorOptions } from "../executor";
import { FixtureReasoner } from "../llm";
import { runPipeline } from "../pipeline/run";
import type { PipelineDeps } from "../pipeline/run";
import { runSuite } from "../sandbox/runner";
import { stressSweepFor, suiteForPlan } from "../sandbox/smoke";
import { runGeneratedStress } from "../sandbox/smoke-stress";
import { FixedSandboxEvidence, activate } from "../schedule/activation";
import type { ActivationDeps } from "../schedule/activation";
import { InMemorySchedulerStore } from "../schedule/store";
import type { SchedulerDeps } from "../schedule/types";
import { FixedClock, InMemoryRunStore, createIdFactory } from "../store";
import { StubIntegrationProvider } from "../tools";
import { resolveCapability, toolkitSlugFor } from "../tools/capabilities";
import type { TriggerEvent } from "../types";

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

/** 09:00 Asia/Singapore, matching e2e.ts so two targets never disagree on "now". */
const NOW = "2026-08-01T01:00:00.000Z";

/**
 * The only two integrations this plan may need.
 *
 * Written down as data rather than checked by eye, because the failure it
 * guards against is silent: a third integration added to a grant would still
 * validate, still build and still pass the sandbox against the stub — and would
 * only surface as a shut activation gate on a machine where that toolkit is not
 * connected, which is every machine this account owns.
 */
const CONNECTED_INTEGRATIONS: readonly string[] = ["gmail", "google-calendar"];

/** Whoever pressed go-live. `activate` refuses a blank one, and rightly. */
const CLINIC_ACTIVATOR = "user_sarah_chen";

/**
 * One pass's worth of wiring, all of it in memory and none of it shared.
 *
 * Per-pass rather than module-level for the reason `runScenario` builds its own:
 * a store that survived between checks would let one pass's packages open the
 * next one's build gate, and the gate would then be proved by an artefact the
 * check under test never produced.
 */
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

  const scheduler: SchedulerDeps = { store: schedulerStore, clock, newId };

  return {
    build: {
      store: buildStore,
      generator: new LocalPackageGenerator(),
      clock,
      newId,
      sleep: async () => {},
    },
    scheduler,
    // Mirrors the not-live branch of `toolsFor` in lib/runtime/session.ts: with
    // tools off, every organization resolves to the one stub. The resolver's
    // argument is ignored on purpose — a simulated send is not attributable to
    // anybody, so splitting the stub per organization would only split the call
    // log the checks below read.
    integrationsFor: () => provider,
    activatedBy: CLINIC_ACTIVATOR,
    buildStore,
    schedulerStore,
    provider,
  };
}

/** Every operation the plan grants any agent, deduplicated, in plan order. */
function grantedOperations(plan: ApprovedPlan): string[] {
  const seen = new Set<string>();
  for (const agent of plan.agents) {
    for (const grant of agent.tools) {
      for (const operation of grant.operations) seen.add(operation);
    }
  }
  return [...seen];
}

/** The first workflow an agent would actually run, or null when it has none. */
function firstEnabledWorkflowId(agent: AgentSpec): string | null {
  return agent.workflows.find((workflow) => workflow.enabled)?.id ?? null;
}

export async function runGMAILWORKFORCEVerification(): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean, detail: string): void => {
    checks.push({ name, pass, detail });
  };

  /* 1. The configured plan satisfies the contract — warnings included, as M0
        requires of BrightPath. A fixture that only clears the errors would put
        a plan in the repository that the gate grumbles about forever, and the
        grumbles are how a real drift gets noticed. */
  {
    const findings = validateApprovedPlan(MERIDIAN_PLAN);
    add(
      "GW-1 the configured plan passes every contract rule, warnings included",
      findings.length === 0,
      findings.length === 0
        ? `0 findings across ${MERIDIAN_PLAN.agents.length} agent(s), ` +
            `organizationId="${MERIDIAN_PLAN.organizationId}"`
        : findings
            .map((f) => `${f.severity} rule ${f.rule}${f.agentId ? ` (${f.agentId})` : ""}: ${f.message}`)
            .join(" | "),
    );
  }

  /* 2. THE CHECK THAT DECIDES WHETHER ANY OF THIS COULD BE REAL. Every granted
        operation must resolve to a published Composio tool, and every one of
        them must belong to an integration this account has connected. An
        `unroutable` route here is the BrightPath situation reproduced — a plan
        that validates, builds and proves, and then refuses by name the first
        time somebody runs it live. */
  {
    const operations = grantedOperations(MERIDIAN_PLAN);
    const routed: string[] = [];
    const problems: string[] = [];

    for (const operation of operations) {
      const route = resolveCapability(operation);
      if (route.kind !== "tool") {
        problems.push(
          `${operation}: ${route.kind}${route.kind === "unroutable" ? ` — ${route.reason}` : ""}`,
        );
        continue;
      }
      if (!CONNECTED_INTEGRATIONS.includes(route.integrationId)) {
        problems.push(
          `${operation} needs "${route.integrationId}", which this account has no live connection for`,
        );
        continue;
      }
      routed.push(`${operation} -> ${route.toolkitSlug}/${route.toolSlug}`);
    }

    // Asserted rather than assumed: the runtime looks a connection up under the
    // TOOLKIT slug, and "google-calendar" is not "googlecalendar". A table that
    // drifted here would report every calendar operation as unconnected.
    const slugsAgree =
      toolkitSlugFor("gmail") === "gmail" &&
      toolkitSlugFor("google-calendar") === "googlecalendar";

    add(
      "GW-2 every granted operation maps to a published Composio tool in a connected toolkit",
      problems.length === 0 && routed.length === operations.length && slugsAgree,
      problems.length > 0
        ? problems.join(" | ")
        : `${routed.length}/${operations.length} routed: ${routed.join(", ")}; ` +
            `toolkit slugs gmail->${String(toolkitSlugFor("gmail"))}, ` +
            `google-calendar->${String(toolkitSlugFor("google-calendar"))}`,
    );
  }

  /* 3. The shape the rest of the system needs from this fixture, and the one
        claim it exists to underwrite: EVERY enabled workflow is swept, not just
        the first one each agent happens to list. `stressSweepFor` used to take
        `workflows.find(w => w.enabled)`, which is invisible on a plan whose
        agents carry one workflow each — every fixture in the repository until
        this one. So the property is asserted here against the plan that can
        actually catch it, together with the boundary the sweep needs to be
        worth running: a limit it lands both sides of, and an act step to
        interrupt.

        `dropped` is asserted empty as well. It names cases the plan implies and
        the sweep's own ceilings refused to emit, and a fixture big enough to be
        truncated would be one whose gate quietly covers less than it claims.

        The run-gate count is REPORTED AND NOT ASSERTED, deliberately. It is a
        property of the generator rather than of this fixture, so requiring it
        would turn a refactor in lib/runtime/sandbox/smoke.ts into a red check
        about workflow coverage — a false alarm under somebody else's name, which
        is how people learn to ignore a gate. It is printed because the plan's
        quiet hours and daily caps are what those cases are walking. */
  {
    const multiWorkflow = MERIDIAN_PLAN.agents.filter(
      (agent) => agent.workflows.filter((workflow) => workflow.enabled).length > 1,
    );
    const acts = MERIDIAN_PLAN.agents.flatMap((agent) =>
      agent.workflows
        .filter((workflow) => workflow.enabled)
        .flatMap((workflow) =>
          workflow.steps.filter(
            (step) =>
              step.kind === "act" &&
              step.tool !== undefined &&
              !isReadOnly(step.tool.operation),
          ),
        ),
    );
    const enabledWorkflowIds = MERIDIAN_PLAN.agents.flatMap((agent) =>
      agent.workflows.filter((workflow) => workflow.enabled).map((workflow) => workflow.id),
    );

    const sweep = stressSweepFor(MERIDIAN_PLAN);
    const swept = new Set(
      sweep.scenarios
        .map((scenario) => scenario.workflowId)
        .filter((id): id is string => typeof id === "string"),
    );
    const unswept = enabledWorkflowIds.filter((id) => !swept.has(id));

    const tally = new Map<string, number>();
    for (const scenario of sweep.scenarios) {
      const status = scenario.expect.finalStatus;
      tally.set(status, (tally.get(status) ?? 0) + 1);
    }
    const breaches = tally.get("awaiting_approval") ?? 0;
    const withins = tally.get("completed") ?? 0;

    add(
      "GW-3 every enabled workflow is swept, and the sweep lands both sides of a limit",
      multiWorkflow.length > 0 &&
        acts.length > 0 &&
        unswept.length === 0 &&
        breaches > 0 &&
        withins > 0 &&
        sweep.dropped.length === 0,
      `agents with >1 enabled workflow: ${multiWorkflow.map((a) => `${a.id}(${a.workflows.filter((w) => w.enabled).length})`).join(", ") || "none"}; ` +
        `act steps writing to a tool: ${acts.length}; ` +
        `enabled workflows ${enabledWorkflowIds.length}, swept ${swept.size}, unswept=${JSON.stringify(unswept)}; ` +
        `${sweep.scenarios.length} scenario(s) [${[...tally].map(([k, v]) => `${k}:${v}`).join(" ")}] ` +
        `+ ${sweep.runGates.length} run-gate case(s); dropped=${JSON.stringify(sweep.dropped)}`,
    );
  }

  /* ── The live path ──
     One pass, reused by GW-4 and GW-5, because GW-5 is about the artefacts THIS
     pass deployed. Building a second pass for it would prove a second
     workforce and inspect the first. */
  const d = deps("gmail-live");
  const live = await runPipeline({ payload: MERIDIAN_HANDOFF }, d);

  /* 4. All six stages green, and a deployment at the end of them.
        Every stage's own summary goes into the detail whatever the outcome,
        because "which stage" is only half of what a reader needs — a green pass
        that ingested nothing and a green pass that ingested two agents look
        identical when only the statuses are printed. */
  {
    const order = live.stages.map((s) => s.stage).join(",");
    const walk = live.stages.map((s) => `${s.stage}:${s.status} (${s.summary})`).join(" | ");
    const allOk = live.stages.every((s) => s.status === "ok");
    add(
      "GW-4 the handoff reaches a live deployment with all six stages ok",
      live.completed &&
        live.live !== null &&
        allOk &&
        order === "collect,ingest,validate,build,prove,activate",
      live.completed && live.live !== null
        ? `${walk}; deployment=${live.live.deploymentId} agents=${live.live.agents} ` +
            `triggers=${live.live.triggersRegistered}; ${live.gaps.length} ingest gap(s) recorded`
        : `stoppedAt=${live.stoppedAt}: ${walk} || ` +
            (live.stages.find((s) => s.stage === live.stoppedAt)?.detail.join(" | ") ?? "no detail"),
    );
  }

  /* 5. MONITORING, AND THE OFFLINE CLAIM. The deployed packages are loaded back
        out of the build store and driven through the real executor. Two things
        have to hold at once: every agent stops at its first action having
        written nothing, and every tool call it did make went to Gmail or Google
        Calendar. Reading `operatingMode` would prove the first and none of the
        second — only the call log can say what was actually reached. */
  {
    const plan = live.plan;
    if (plan === null) {
      add("GW-5 the live workforce pauses, writes nothing, and reaches only the two connected tools", false, "no live plan");
    } else {
      const provider = new StubIntegrationProvider();
      const exec: ExecutorOptions = {
        store: new InMemoryRunStore(),
        tools: provider,
        reasoner: new FixtureReasoner(),
        clock: new FixedClock(NOW),
        newId: createIdFactory("gmail-live-run"),
        sleep: async () => {},
        globalPolicy: plan.globalPolicy,
      };

      const statuses: string[] = [];
      for (const agent of plan.agents) {
        const workflowId = firstEnabledWorkflowId(agent);
        const bundle = await loadBundle(agent, d.build);
        if (bundle === null || workflowId === null) {
          statuses.push(`${agent.id}:unrunnable`);
          continue;
        }
        const trigger: TriggerEvent = {
          kind: "manual",
          workflowId,
          agentId: agent.id,
          firedAt: NOW,
          payload: {},
          idempotencyKey: `gmail-workforce:${agent.id}`,
        };
        const outcome = await startRun(bundle, trigger, exec);
        statuses.push(`${agent.id}:${outcome.status}`);
      }

      const calls = provider.client.calls;
      const writes = calls.map((c) => c.operation).filter((op) => !isReadOnly(op));
      const foreign = calls
        .map((c) => c.integrationId)
        .filter((id) => !CONNECTED_INTEGRATIONS.includes(id));

      add(
        "GW-5 the live workforce pauses, writes nothing, and reaches only the two connected tools",
        plan.agents.length > 0 &&
          statuses.every((s) => s.endsWith(":awaiting_approval")) &&
          writes.length === 0 &&
          foreign.length === 0,
        `${statuses.join(" ")}; ${calls.length} tool call(s) ` +
          `[${[...new Set(calls.map((c) => c.operation))].join(", ")}]; ` +
          `writes=${JSON.stringify(writes)} foreignIntegrations=${JSON.stringify([...new Set(foreign)])}`,
      );
    }
  }

  /* ── The configured plan ──
     Its own stores, because it is a different plan version and must not open a
     gate with the pass above's packages. */
  const configured = deps("gmail-configured");
  const built = await buildPlan(MERIDIAN_PLAN, configured.build);
  const buildStatus = await planBuildStatus(MERIDIAN_PLAN, configured.build);

  // Authored scenarios are passed as an empty list rather than BrightPath's:
  // `suiteForPlan` would drop them all anyway (they name agents this plan does
  // not contain), and saying so explicitly keeps the suite's provenance obvious
  // — everything below is generated cover for an agent nobody wrote cases for.
  const suite = suiteForPlan(MERIDIAN_PLAN, []);
  const stress = await runGeneratedStress(MERIDIAN_PLAN, { packages: configured.build });
  const verdict = await runSuite(suite, MERIDIAN_PLAN, {
    packages: configured.build,
    stress,
  });

  /* 6. Proved, on the artefacts the Factory stored. Both halves are asserted:
        the scenarios AND the sweep, because a verdict can be ready-looking with
        a sweep that never ran — the defect activation.ts re-derives around. */
  {
    const compiled = verdict.results.filter((r) => r.packageSource !== "stored");
    add(
      "GW-6 the configured plan proves clean in the sandbox, sweep included, on the stored packages",
      built.failed === 0 &&
        buildStatus.ready &&
        verdict.ready &&
        verdict.passed === verdict.total &&
        verdict.total > 0 &&
        stress.total > 0 &&
        stress.passed === stress.total &&
        compiled.length === 0,
      built.failed === 0 && buildStatus.ready
        ? `built ${built.built}/${MERIDIAN_PLAN.agents.length}; ` +
            `scenarios ${verdict.passed}/${verdict.total}; sweep ${stress.passed}/${stress.total}; ` +
            `per agent ${verdict.byAgent.map((a) => `${a.agentId} ${a.passed}/${a.total}`).join(", ")}; ` +
            `blockers=${JSON.stringify(verdict.blockers)}` +
            (compiled.length > 0 ? `; ${compiled.length} scenario(s) ran on a fresh compile` : "")
        : `build failed ${built.failed}; missing ${JSON.stringify(buildStatus.missing)}`,
    );
  }

  /* 7. Go-live for the configured plan: three gates open, one trigger per
        enabled workflow, and the disabled one still switched off. A workflow
        the owner believes is live and which nothing will ever start is the
        worst outcome the scheduler can produce, so `rejected` is asserted
        empty rather than reported. */
  {
    const activationDeps: ActivationDeps = {
      scheduler: configured.scheduler,
      packages: configured.build,
      integrations: configured.integrationsFor(MERIDIAN_PLAN.organizationId),
      sandbox: new FixedSandboxEvidence(verdict),
    };

    const result = await activate(MERIDIAN_PLAN, activationDeps, {
      activatedBy: CLINIC_ACTIVATOR,
    });

    const enabled = MERIDIAN_PLAN.agents.flatMap((agent) =>
      agent.workflows.filter((workflow) => workflow.enabled).map((workflow) => workflow.id),
    );
    const disabled = MERIDIAN_PLAN.agents.flatMap((agent) =>
      agent.workflows.filter((workflow) => !workflow.enabled).map((workflow) => workflow.id),
    );
    const registered = result.activated
      ? (result.registration?.registered ?? []).map((trigger) => trigger.workflowId)
      : [];

    add(
      "GW-7 the configured plan activates: every enabled workflow gets a trigger, the disabled one gets none",
      result.activated &&
        (result.registration?.rejected.length ?? 0) === 0 &&
        enabled.every((id) => registered.includes(id)) &&
        disabled.every((id) => !registered.includes(id)) &&
        registered.length === enabled.length,
      result.activated
        ? `outcome=${result.outcome} deployment=${result.deployment.deploymentId}; ` +
            `registered=[${registered.join(", ")}] expected=[${enabled.join(", ")}]; ` +
            `not registered (disabled)=[${disabled.join(", ")}]; ` +
            `rejected=${JSON.stringify(result.registration?.rejected ?? [])}; ` +
            `gates=${result.checklist.gates.map((g) => `${g.id}:${g.satisfied ? "open" : "shut"}`).join(" ")}`
        : `blocked: ${result.blockers.map((b) => b.message).join(" | ")}`,
    );
  }

  /* 8. The whole pass is a re-run, not a fresh roll of the dice. Activation
        gates on the sandbox verdict, so a pipeline whose outcome moved between
        two identical inputs would make every gate above advisory. */
  {
    const a = await runPipeline({ payload: MERIDIAN_HANDOFF }, deps("det"));
    const b = await runPipeline({ payload: MERIDIAN_HANDOFF }, deps("det"));
    const fa = JSON.stringify(a.stages.map((s) => [s.stage, s.status, s.summary, s.detail]));
    const fb = JSON.stringify(b.stages.map((s) => [s.stage, s.status, s.summary, s.detail]));
    add(
      "GW-8 two identical passes produce identical stages",
      fa === fb && a.completed && b.completed,
      `equal=${fa === fb} completed=${a.completed}/${b.completed}`,
    );
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
      ? `GMAIL WORKFORCE OK — ${results.length}/${results.length} checks passed.`
      : `GMAIL WORKFORCE BROKEN — ${failed} of ${results.length} checks failed.`,
  );
  return lines.join("\n");
}
