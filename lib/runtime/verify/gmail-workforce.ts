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
 * holds live ACTIVE Composio connections for. The workforce under test is the
 * pair the owner actually asked for: `helpdesk-agent` (Gmail only — polls the
 * shared inbox every five minutes and pauses every send behind alwaysApprove,
 * the decided draft-and-approve flow) and `marketing-agent` (Gmail plus Google
 * Calendar — reads the campaign schedule, composes the ad, and its send pauses
 * the same way). It asks two different questions about them:
 *
 *   Could it execute?   GW-2 walks every granted operation through
 *                       `resolveCapability` and requires a real published tool
 *                       for each. This is the check that would have caught the
 *                       invoice operations before they reached a demo.
 *   Does it execute?    GW-4..GW-8 run it. The handoff goes through
 *                       `runPipeline` to a live deployment, the deployed
 *                       packages are then driven through the real executor, and
 *                       the configured plan is put through the same three
 *                       activation gates. GW-9 and GW-10 then drive the
 *                       empty-batch contract (`StepSpec.emptyBatch`) in both
 *                       directions: a sweep that prepared nothing completes
 *                       with the batch-empty record and no approval card, and
 *                       a sweep with one prepared reply still pauses its send.
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

import {
  MERIDIAN_HANDOFF,
  MERIDIAN_HELPDESK,
  MERIDIAN_PLAN,
} from "../../plan/fixtures/meridian";
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
 * connected, which is every machine this account owns. Keeping the demand at
 * exactly these two is the entire point of the fixture: they are what the
 * owner can connect, so an integrations gate asking for anything else is a
 * gate the owner can never open.
 */
const CONNECTED_INTEGRATIONS: readonly string[] = ["gmail", "google-calendar"];

/**
 * The exact operation surface the plan may grant, sorted. Asserted as a SET in
 * GW-2, not just routed one by one, because the two failures it pins are both
 * quiet: an operation dropped from a grant still routes everything that
 * remains, and an operation added (a calendar write, say) still routes too —
 * the roster only stops being "the five mapped capabilities the owner signed
 * off" when somebody compares it to the signed-off list.
 */
const GRANTED_SURFACE: readonly string[] = [
  "gmail.drafts.create",
  "gmail.messages.read",
  "gmail.messages.send",
  "gmail.threads.read",
  "google-calendar.events.list",
];

/** The two agents the owner asked for, by the ids both plan versions carry. */
const HELPDESK_AGENT = "helpdesk-agent";
const MARKETING_AGENT = "marketing-agent";

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

    // The surface is pinned as a set, both directions: nothing missing (the
    // helpdesk lost its send, say) and nothing extra (a calendar write crept
    // in). Routing alone proves neither — see GRANTED_SURFACE.
    const surface = [...operations].sort();
    const surfaceExact =
      surface.length === GRANTED_SURFACE.length &&
      surface.every((operation, index) => operation === GRANTED_SURFACE[index]);

    add(
      "GW-2 the plan grants exactly the five mapped operations, each routed to a published tool in a connected toolkit",
      problems.length === 0 &&
        routed.length === operations.length &&
        slugsAgree &&
        surfaceExact,
      problems.length > 0
        ? problems.join(" | ")
        : `${routed.length}/${operations.length} routed: ${routed.join(", ")}; ` +
            `surface=[${surface.join(", ")}] ` +
            `${surfaceExact ? "matches" : "DOES NOT match"} the signed-off set; ` +
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
        actually catch it: the helpdesk carries BOTH enabled workflows (the
        five-minute inbox sweep ending in a gated send, and the twice-daily
        nudge ending in an unattended-within-limits draft), and the sweep must
        cover the marketing agent's campaign-send as well. The multi-workflow
        agent and the enabled roster are pinned BY NAME, because "some agent
        has two workflows" would stay green while the workforce quietly became
        a different one. The boundary the sweep needs to be worth running is
        asserted too: a limit it lands both sides of (the nudge's draft acts
        within `replies.per_run` and its floor, and pauses over them), and an
        act step to interrupt.

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

    // Pinned by name — see the block comment. The helpdesk is the agent whose
    // second workflow makes GW-3 able to catch a one-workflow sweep at all,
    // and the enabled roster is the three workflows the owner configured.
    const helpdeskIsMulti = multiWorkflow.some((agent) => agent.id === HELPDESK_AGENT);
    const expectedEnabled = ["campaign-send", "inbox-sweep", "unanswered-nudge"];
    const sortedEnabled = [...enabledWorkflowIds].sort();
    const rosterExact =
      sortedEnabled.length === expectedEnabled.length &&
      sortedEnabled.every((id, index) => id === expectedEnabled[index]);

    add(
      "GW-3 every enabled workflow of both agents is swept, and the sweep lands both sides of the helpdesk's limits",
      helpdeskIsMulti &&
        rosterExact &&
        acts.length > 0 &&
        unswept.length === 0 &&
        breaches > 0 &&
        withins > 0 &&
        sweep.dropped.length === 0,
      `agents with >1 enabled workflow: ${multiWorkflow.map((a) => `${a.id}(${a.workflows.filter((w) => w.enabled).length})`).join(", ") || "none"}; ` +
        `enabled=[${sortedEnabled.join(", ")}] ${rosterExact ? "as configured" : "NOT the configured roster"}; ` +
        `act steps writing to a tool: ${acts.length}; ` +
        `swept ${swept.size}, unswept=${JSON.stringify(unswept)}; ` +
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
        out of the build store and driven through the real executor. Three
        things have to hold at once: the deployed roster is exactly
        helpdesk-agent and marketing-agent (the ingested plan derives the same
        ids the configured plan carries, which is what lets the two versions be
        read as one story), every agent stops at its first action having
        written nothing — the ingested form of the draft-and-approve promise —
        and every tool call it did make went to Gmail or Google Calendar.
        Reading `operatingMode` would prove the pause and none of the rest;
        only the roster and the call log can say what was actually deployed
        and reached. */
  {
    const plan = live.plan;
    const gwFiveName =
      "GW-5 helpdesk-agent and marketing-agent both pause at their action, write nothing, and reach only the two connected tools";
    if (plan === null) {
      add(gwFiveName, false, "no live plan");
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

      // Sorted so the assertion is about membership, not about the order Role
      // B happened to list the agents in.
      const roster = plan.agents.map((agent) => agent.id).sort();
      const rosterExact =
        roster.length === 2 && roster[0] === HELPDESK_AGENT && roster[1] === MARKETING_AGENT;

      add(
        gwFiveName,
        rosterExact &&
          statuses.every((s) => s.endsWith(":awaiting_approval")) &&
          writes.length === 0 &&
          foreign.length === 0,
        `deployed roster=[${roster.join(", ")}]; ${statuses.join(" ")}; ` +
          `${calls.length} tool call(s) ` +
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
        enabled workflow — the helpdesk's five-minute sweep and twice-daily
        nudge, the marketing agent's daily campaign-send — and the disabled
        campaign-recap still switched off. A workflow the owner believes is
        live and which nothing will ever start is the worst outcome the
        scheduler can produce, so `rejected` is asserted empty rather than
        reported. */
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

  /* 9 & 10. THE EMPTY-BATCH CONTRACT, both directions, on the stored packages.
        The live defect this pins: the five-minute sweep often prepares ZERO
        replies, and the send — alwaysApprove — paused anyway, so the approvals
        queue filled with "Send an email to the customer" cards whose approval
        would send nothing (~12/hour on the armed server). `StepSpec.emptyBatch`
        on sweep-3 declares the batch; these two checks prove the executor
        honours BOTH sides of it, because either alone has no teeth. A runtime
        that skipped every sweep would pass GW-9; one that never skipped would
        pass GW-10; only the pair says the skip fires on exactly `= 0`.

        Driven through the SAME stored packages GW-6 proved, with a scripted
        reasoner whose only variable is the reported `replies.per_run` — so the
        two runs differ in one number and nothing else. The reasoner's `data`
        carries no string values, deliberately: auditMetrics matches string
        arguments against fetched record ids, and a match would escalate for a
        metric dispute instead of the branch under test (the same reason the
        generated sweep's NEUTRAL_ACTION exists). */
  {
    const helpdeskBundle = await loadBundle(MERIDIAN_HELPDESK, configured.build);

    const sweepRun = async (label: string, replies: number) => {
      if (helpdeskBundle === null) return null;
      const provider = new StubIntegrationProvider();
      const exec: ExecutorOptions = {
        store: new InMemoryRunStore(),
        tools: provider,
        reasoner: new FixtureReasoner({
          __default: {
            summary: `Swept the inbox and prepared ${replies} reply(ies).`,
            data: { generated: true, prepared: replies },
            metrics: { "replies.per_run": replies },
          },
        }),
        clock: new FixedClock(NOW),
        newId: createIdFactory(`gmail-empty-${label}`),
        sleep: async () => {},
        globalPolicy: MERIDIAN_PLAN.globalPolicy,
      };
      const trigger: TriggerEvent = {
        kind: "schedule",
        workflowId: "inbox-sweep",
        agentId: HELPDESK_AGENT,
        firedAt: NOW,
        payload: {},
        idempotencyKey: `gmail-empty:${label}`,
      };
      const outcome = await startRun(helpdeskBundle, trigger, exec);
      return {
        outcome,
        pending: await exec.store.listPendingApprovals(),
        calls: provider.client.calls,
      };
    };

    const empty = await sweepRun("zero", 0);
    const single = await sweepRun("one", 1);

    {
      const name =
        "GW-9 a sweep that prepared nothing completes with the batch-empty record and no approval card";
      if (empty === null) {
        add(name, false, "helpdesk-agent has no stored package to run");
      } else {
        const record = empty.outcome.run.events.find(
          (event) => event.kind === "batch_empty",
        );
        // The read must have happened: a run that died before sweeping would
        // also raise no approval, and that pass would be about the wrong thing.
        const swept = empty.calls.some((c) => c.operation === "gmail.threads.read");
        const sends = empty.calls.filter((c) => c.operation === "gmail.messages.send");
        add(
          name,
          empty.outcome.status === "completed" &&
            empty.outcome.approvalId === null &&
            empty.pending.length === 0 &&
            record !== undefined &&
            record.stepId === "sweep-3" &&
            record.metric === "replies.per_run" &&
            swept &&
            sends.length === 0,
          `status=${empty.outcome.status} approvalId=${String(empty.outcome.approvalId)} ` +
            `pending=${empty.pending.length}; batch_empty=` +
            (record ? `{step=${record.stepId} metric=${record.metric}}` : "MISSING") +
            `; swept=${swept} sends=${sends.length}; ` +
            `events=[${empty.outcome.run.events.map((e) => e.kind).join(",")}]`,
        );
      }
    }

    {
      const name =
        "GW-10 a sweep with one prepared reply still pauses its send behind the owner";
      if (single === null) {
        add(name, false, "helpdesk-agent has no stored package to run");
      } else {
        const card = single.pending[0];
        const skipped = single.outcome.run.events.some(
          (event) => event.kind === "batch_empty",
        );
        const sends = single.calls.filter((c) => c.operation === "gmail.messages.send");
        add(
          name,
          single.outcome.status === "awaiting_approval" &&
            single.outcome.approvalId !== null &&
            single.pending.length === 1 &&
            card !== undefined &&
            card.stepId === "sweep-3" &&
            card.invocation.operation === "gmail.messages.send" &&
            !skipped &&
            sends.length === 0,
          `status=${single.outcome.status} pending=${single.pending.length}` +
            (card ? ` at ${card.stepId} proposing ${card.invocation.operation}` : "") +
            `; batch_empty event present=${skipped} (must be false); ` +
            `sends performed=${sends.length} (the pause holds the send, it does not make it)`,
        );
      }
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
      ? `GMAIL WORKFORCE OK — ${results.length}/${results.length} checks passed.`
      : `GMAIL WORKFORCE BROKEN — ${failed} of ${results.length} checks failed.`,
  );
  return lines.join("\n");
}
