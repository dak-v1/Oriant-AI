/**
 * lib/runtime/verify/plan-state.ts — the two plans, and the gap between them.
 *
 * WHAT WAS WRONG. `session.plan` was `const plan = BRIGHTPATH_PLAN` — a module
 * constant, assigned once at session construction. Every consumer that compares
 * "what is planned" against "what is running" was therefore comparing a
 * deployment against a demo fixture, so `reconcileAgents` could not report
 * anything true: on the scripted path both sides happened to be BrightPath and
 * everything read `running`; on a customer's path the two sides described
 * different workforces and every row was noise. The lifecycle machinery was
 * correct code pointed at a constant.
 *
 * WHAT THIS TARGET PROVES, and it is four claims rather than one:
 *
 *   1. A fresh store falls back to the MERIDIAN fixture AND SAYS SO BY NAME.
 *      The fallback itself must survive — a clean clone has ingested nothing and
 *      still has to render something — but WHICH plan it serves changed, and the
 *      sentence it serves alongside has to have changed with it. What must not
 *      survive is a screen showing fixture data while claiming to show the
 *      customer's workforce, or naming a workforce the runtime is not serving.
 *      So every answer carries a source discriminant, the reason names the
 *      substituted plan, and a store that will not answer is not allowed to
 *      become a fallback.
 *   2. After a handoff runs the pipeline, the current plan IS the ingested one.
 *      Asserted by planId, against a fixture with a different one, so "the
 *      fixture is still there" cannot pass.
 *   3. THE CURRENT PLAN AND THE DEPLOYMENT PLAN CAN DIFFER, and when they do
 *      `reconcileAgents` says `drifted`. This is the check the whole change
 *      exists for. The tempting simplification — derive the current plan from
 *      the newest deployment — makes the two identical by construction and
 *      makes drift permanently zero, and it would pass a check that only ever
 *      looked at a freshly activated workforce. So PS-3 measures drift twice on
 *      one runtime: zero the moment the workforce goes live, and one after a
 *      revision is ingested that never reaches go-live.
 *   4. The fallback never masks a real plan — including the adversarial case, a
 *      stored plan with no agents in it. `resolveActivePlan` deliberately skips
 *      a deployment whose plan has no agents; copying that habit into the
 *      current-plan resolver would silently replace an owner's answer ("I
 *      removed everything") with someone else's demo.
 *
 * NOTHING IS HAND-BUILT WHERE THE PIPELINE CAN BUILD IT. Every current plan
 * asserted below was written by `runPipeline` from a Role B handoff, through
 * ingest and validation, exactly as the product writes it. The two constructed
 * payloads are named where they appear and are both situations rather than
 * answers: a revision Role B finalised at a later version, and a handoff whose
 * two agent keys collapse to one agent id.
 *
 * A CHECK THAT CANNOT FAIL IS NOT A CHECK, so each is paired with its control:
 * PS-3 asserts drift zero before it asserts drift one; PS-4 asserts the refused
 * pass got PAST ingest, so a write placed one stage too early would have
 * happened and been caught; PS-6 asserts both stores refuse the same plan as
 * well as storing the same one.
 *
 * DETERMINISM IS AN M3 EXIT CRITERION. Clock, ids, tools and reasoner are pinned
 * exactly as in M4-M7. PS-6 is the one check that touches a disk — it is the
 * only way the file-backed implementation is ever executed rather than merely
 * typechecked — and it does so in a fresh temp directory that is removed again,
 * asserting nothing about the path.
 *
 * Run it with: node scripts/verify.mjs planstate — or `npm run verify`, which
 * sweeps it with the rest. There is no `verify:planstate` npm alias for the same
 * reason `collect` has none: package.json carries one per milestone target and
 * this is not a milestone.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/*
 * BOTH FIXTURES, AND THE TARGET NEEDS BOTH.
 *
 * MERIDIAN_PLAN is what the resolver falls back to and is therefore what every
 * positive assertion below is written against. BRIGHTPATH_PLAN is kept as the
 * NEGATIVE control: it is the plan the fallback used to be, so "not this one" is
 * the direction a regression would travel, and a check that only knew the new
 * answer could not tell a revert from a rename.
 */
import { BRIGHTPATH_PLAN } from "../../plan/fixtures/brightpath";
import { MERIDIAN_PLAN } from "../../plan/fixtures/meridian";
import { ROLE_B_HANDOFF, ROLE_B_HANDOFF_RESOLVED } from "../../plan/fixtures/role-b-handoff";
import { ingestHandoff } from "../../plan/ingest/from-handoff";
import type { WorkforceHandoffPayload } from "../../plan/ingest/types";
import type { ApprovedPlan } from "../../plan/types";
import { reconcileAgents, resolveActivePlan } from "../active-plan";
import type { AgentLifecycle } from "../active-plan";
import { LocalPackageGenerator } from "../build/runner";
import { InMemoryBuildStore } from "../build/store";
import type { BuildDeps } from "../build/types";
import { currentPlan, resolveCurrentPlan, resolvePlanState } from "../current-plan";
import { FileSchedulerStore } from "../persist";
import { runPipeline } from "../pipeline/run";
import type { PipelineDeps } from "../pipeline/run";
import { InMemorySchedulerStore } from "../schedule/store";
import type { SchedulerDeps, SchedulerStore } from "../schedule/types";
import { FixedClock, createIdFactory } from "../store";
import { StubIntegrationProvider } from "../tools";

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

/** 09:00 Asia/Singapore, the same instant the E2E target pins. */
const NOW = "2026-08-01T01:00:00.000Z";

const OWNER = "user_sarah_chen";

/** The plan Role B's corrected handoff converts to. Used where no pass is needed. */
const INGESTED_PLAN: ApprovedPlan = ingestHandoff(ROLE_B_HANDOFF_RESOLVED).plan;

/* ═══════════════════════════ The payloads ═══════════════════════════ */

/**
 * The same workforce, re-finalised by Role B at a later version.
 *
 * `ingestHandoff` derives every agent version from the plan version, so bumping
 * the plan is exactly how a real revision arrives: same agent id, higher
 * version. That is the shape drift is made of, and it is why PS-3 needs no
 * hand-edited agent.
 */
const REVISED_HANDOFF: WorkforceHandoffPayload = {
  ...ROLE_B_HANDOFF_RESOLVED,
  workforce_plan: {
    ...ROLE_B_HANDOFF_RESOLVED.workforce_plan,
    version: 3,
    current_version: 3,
  },
};

/**
 * A handoff whose two agent keys collapse to ONE agent id.
 *
 * `toAgentId` lowercases and turns runs of underscores and spaces into hyphens,
 * so `marketing_content_approval_agent` and `marketing content approval agent`
 * are the same agent to Role C and two different agents to Role B. Nothing in
 * ingest notices — there is no blocking gap for it — so this payload converts
 * cleanly and then fails contract rule 9 at validation, twice: duplicate agent
 * id and duplicate outcome id.
 *
 * It is the one payload that reaches validation and does not survive it, which
 * is what makes it the right instrument for PS-4. A plan Role C cannot build is
 * not a plan anyone intends, and it must not become the thing drift is measured
 * against.
 */
const COLLIDING_HANDOFF: WorkforceHandoffPayload = {
  ...ROLE_B_HANDOFF_RESOLVED,
  agents: [
    ...ROLE_B_HANDOFF_RESOLVED.agents,
    ...ROLE_B_HANDOFF_RESOLVED.agents.map((agent) => ({
      ...agent,
      agent_key: agent.agent_key.replace(/_/g, " "),
    })),
  ],
};

/* ═══════════════════════════ Small helpers ═══════════════════════════ */

function canonical(value: unknown): string {
  return JSON.stringify(value);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function countOf(rows: { lifecycle: AgentLifecycle }[], lifecycle: AgentLifecycle): number {
  return rows.filter((row) => row.lifecycle === lifecycle).length;
}

/**
 * The ninth-check habit from M6, kept: the last result is about the harness
 * rather than the product, and it fails naming the error when a check threw and
 * took the ones after it with it.
 */
const COMPLETED = "PS-7 every check above reached its own verdict";

/* ═══════════════════════════ The world ═══════════════════════════ */

interface World {
  deps: PipelineDeps;
  build: BuildDeps & { store: InMemoryBuildStore };
  schedulerStore: InMemorySchedulerStore;
}

/**
 * One deterministic pipeline, wired exactly as `verify/e2e.ts` wires it.
 *
 * Each check builds its own. Sharing one across checks would be cheaper and
 * would hide the class of fault this target can have — a current plan surviving
 * a boundary it should not have, which is indistinguishable from the fallback
 * working until the day it is the customer's data leaking between runs.
 */
function makeWorld(seed: string): World {
  const clock = new FixedClock(NOW);
  const newId = createIdFactory(seed);
  const build: BuildDeps & { store: InMemoryBuildStore } = {
    store: new InMemoryBuildStore(),
    generator: new LocalPackageGenerator(),
    clock,
    newId,
    sleep: async () => {},
  };
  const schedulerStore = new InMemorySchedulerStore();
  const scheduler: SchedulerDeps = { store: schedulerStore, clock, newId };
  // One stub per world, not one per resolution. Mirrors the not-live branch of
  // `toolsFor` in lib/runtime/session.ts: with tools off every organization gets
  // the same stub, because a simulated send is not attributable to anybody.
  const integrations = new StubIntegrationProvider();

  return {
    build,
    schedulerStore,
    deps: {
      build,
      scheduler,
      integrationsFor: () => integrations,
      activatedBy: OWNER,
    },
  };
}

/**
 * The same world with a generator that cannot compile anything.
 *
 * This is how PS-3 gets a pass that ingests and validates but never reaches
 * go-live — the ordinary shape of a revision an owner has approved and nobody
 * has activated yet. Borrowed from E2E-8, which uses it to prove the build gate
 * cannot be walked around; here it proves the current plan moves anyway.
 */
function withBrokenFactory(world: World): PipelineDeps {
  return {
    ...world.deps,
    build: {
      ...world.build,
      generator: {
        name: "broken",
        async generate() {
          throw new Error("generator unavailable");
        },
      },
      maxAttempts: 1,
    },
  };
}

/* ═══════════════════════════ The checks ═══════════════════════════ */

export async function runPLANSTATEVerification(): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean, detail: string) =>
    checks.push({ name, pass, detail });

  try {
    /* ═══ 1. NOTHING INGESTED SHOWS THE FIXTURE, AND SAYS WHICH ONE ═══
       Four separate claims, because the fallback is only safe if all four hold:
       the STORE invents nothing, the RESOLVER substitutes the fixture, it
       labels that fixture BY NAME, and a store that throws is not treated as an
       empty one. The last is the one that would rot silently —
       `resolveActivePlan` swallows a read error by design, and copying that
       here would show a demo over the top of a customer plan that exists and
       could not be read.

       THE NAMING CLAIM IS NEW AND IT IS NOT DECORATION. This check used to
       require only that `fallbackReason` was a non-empty string, which is a
       check the exact defect walks straight through: change which plan the
       resolver returns, leave the sentence alone, and every screen goes on
       telling an owner it is showing BrightPath while it renders a
       physiotherapy clinic. So the sentence is asserted in BOTH directions —
       it must name Meridian and must no longer name BrightPath — because a
       sentence naming both is as wrong as one naming only the other. */
    {
      const name =
        "PS-1 a fresh store falls back to the Meridian fixture, names it in the sentence it shows, and refuses to invent one when the store fails";
      const store = new InMemorySchedulerStore();

      const storedIsNull = (await store.getCurrentPlan()) === null;

      const resolved = await resolveCurrentPlan(store);
      const saysFixture =
        resolved.source === "fixture" &&
        resolved.plan.planId === MERIDIAN_PLAN.planId &&
        resolved.plan.version === MERIDIAN_PLAN.version &&
        // The plan that used to stand in here needs HubSpot and QuickBooks
        // invoice operations Composio does not publish, so serving it was
        // serving a workforce that could not act. Asserted as an inequality
        // rather than left implied by the equality above: a revert has to fail
        // this target, not merely rename what it reports.
        resolved.plan.planId !== BRIGHTPATH_PLAN.planId;

      const reason = resolved.fallbackReason ?? "";
      const reasonNamesTheFixture =
        reason.trim() !== "" && reason.includes("Meridian") && !reason.includes("BrightPath");

      const convenienceAgrees = (await currentPlan(store)).planId === MERIDIAN_PLAN.planId;

      // Nothing is deployed either, so no agent may read as running. The fixture
      // standing in for the plan must never stand in for a deployment.
      const state = await resolvePlanState(store);
      const nothingRunning =
        state.active.source === "fixture" &&
        state.active.deploymentId === null &&
        state.lifecycle.length === MERIDIAN_PLAN.agents.length &&
        state.lifecycle.every((row) => row.lifecycle === "planned") &&
        countOf(state.lifecycle, "running") === 0;

      /* ── The store that will not answer ── */
      const refusing: Pick<SchedulerStore, "getCurrentPlan"> = {
        async getCurrentPlan(): Promise<ApprovedPlan | null> {
          throw new Error("the store is unreachable");
        },
      };
      let failureIsLoud = false;
      let failureDetail = "a failing store was quietly answered with the fixture";
      try {
        const smuggled = await resolveCurrentPlan(refusing);
        failureDetail = `resolved to ${smuggled.plan.planId} as "${smuggled.source}"`;
      } catch (error) {
        failureIsLoud = true;
        failureDetail = messageOf(error);
      }

      const pass =
        storedIsNull &&
        saysFixture &&
        reasonNamesTheFixture &&
        convenienceAgrees &&
        nothingRunning &&
        failureIsLoud;
      add(
        name,
        pass,
        pass
          ? `an empty store answers getCurrentPlan() with null; the resolver turns that into ` +
              `${MERIDIAN_PLAN.planId} v${MERIDIAN_PLAN.version} — the gmail + calendar ` +
              `workforce, not ${BRIGHTPATH_PLAN.planId} — tagged "fixture" and carrying a ` +
              `sentence that names it ("${reason}"), with all ${state.lifecycle.length} agents ` +
              `reading "planned" because nothing is deployed. A store that throws propagates ` +
              `instead of degrading into a fixture: "${failureDetail}"`
          : `storedIsNull=${storedIsNull} saysFixture=${saysFixture} (source=${resolved.source}, ` +
              `plan=${resolved.plan.planId}) reasonNamesTheFixture=${reasonNamesTheFixture} ` +
              `(reason=${canonical(resolved.fallbackReason)}) ` +
              `convenienceAgrees=${convenienceAgrees} nothingRunning=${nothingRunning} ` +
              `(active=${state.active.source}, lifecycle=${canonical(
                state.lifecycle.map((row) => row.lifecycle),
              )}) failureIsLoud=${failureIsLoud} (${failureDetail})`,
      );
    }

    /* ═══ 2. AFTER A PASS, THE CURRENT PLAN IS THE INGESTED ONE ═══
       Asserted by planId against a fixture whose planId is different, so a
       resolver that never stopped returning BrightPath fails on the first
       comparison rather than on a subtle one. The lifecycle is asserted too:
       immediately after go-live the two plans agree, every agent reads
       `running`, and drift is zero — which is the control PS-3 needs. */
    {
      const name =
        "PS-2 a handoff that runs the pipeline becomes the current plan, and the fixture is gone";
      const world = makeWorld("ps-live");
      const result = await runPipeline({ payload: ROLE_B_HANDOFF_RESOLVED }, world.deps);

      const stored = await world.schedulerStore.getCurrentPlan();
      const resolved = await resolveCurrentPlan(world.schedulerStore);
      const expectedPlanId = ROLE_B_HANDOFF_RESOLVED.workforce_plan.id;

      const isTheIngestedPlan =
        result.completed &&
        stored !== null &&
        stored.planId === expectedPlanId &&
        // The FALLBACK's planId, which is Meridian's — re-pointed when the
        // served fixture changed. Left on BrightPath this clause would still
        // have passed, and would have been asserting nothing: BrightPath is no
        // longer a plan this resolver can return, so "not BrightPath" stopped
        // being evidence that the fixture did not leak.
        stored.planId !== MERIDIAN_PLAN.planId &&
        resolved.source === "ingested" &&
        resolved.fallbackReason === null &&
        resolved.plan.planId === expectedPlanId &&
        resolved.plan.version === ROLE_B_HANDOFF_RESOLVED.workforce_plan.version &&
        // The whole plan, not a header: this is what every downstream comparison
        // walks agent by agent.
        canonical(resolved.plan) === canonical(result.plan);

      const state = await resolvePlanState(world.schedulerStore);
      const agreesAtGoLive =
        state.active.source === "deployment" &&
        state.active.plan.planId === expectedPlanId &&
        state.lifecycle.length === (result.plan?.agents.length ?? -1) &&
        state.lifecycle.every((row) => row.lifecycle === "running") &&
        countOf(state.lifecycle, "drifted") === 0;

      add(
        name,
        isTheIngestedPlan && agreesAtGoLive,
        isTheIngestedPlan && agreesAtGoLive
          ? `the pass stored plan ${expectedPlanId} v${resolved.plan.version} as current — not ` +
              `${MERIDIAN_PLAN.planId} — and the resolver reports it as "ingested" with no ` +
              `fallback reason. Immediately after go-live the current plan and the deployment's ` +
              `frozen plan agree, so all ${state.lifecycle.length} agent(s) read "running" and ` +
              `drift is 0`
          : `isTheIngestedPlan=${isTheIngestedPlan} (completed=${result.completed}, ` +
              `stopped=${result.stoppedAt}, stored=${stored?.planId ?? "null"}, ` +
              `source=${resolved.source}) agreesAtGoLive=${agreesAtGoLive} ` +
              `(active=${state.active.source}, lifecycle=${canonical(
                state.lifecycle.map((row) => [row.agentId, row.lifecycle]),
              )})`,
      );
    }

    /* ═══ 3. THE TWO PLANS CAN DIFFER, AND THAT IS REPORTED AS DRIFT ═══
       The check the change exists for. One runtime, two passes: the first goes
       live at v2, the second ingests Role B's v3 revision and stops at the build
       gate, which is what an approved-but-not-yet-activated plan looks like from
       here.

       Drift is measured BEFORE and AFTER on the same runtime. Measuring only
       after would pass against an implementation that hard-coded "drifted", and
       measuring only before would pass against the collapse this guards: derive
       the current plan from the newest deployment and the second measurement
       reads zero, exactly like the first. */
    {
      const name =
        "PS-3 a revision that never reaches go-live moves the current plan, leaves the deployment alone, and reads as drift";
      const world = makeWorld("ps-drift");
      const first = await runPipeline({ payload: ROLE_B_HANDOFF_RESOLVED }, world.deps);
      const before = await resolvePlanState(world.schedulerStore);

      const second = await runPipeline({ payload: REVISED_HANDOFF }, withBrokenFactory(world));
      const after = await resolvePlanState(world.schedulerStore);
      const deployments = await world.schedulerStore.listDeployments();

      const wentLiveThenStopped =
        first.completed && !second.completed && second.stoppedAt === "build";

      // The deployment did not move: one go-live, still holding v2's plan.
      const deployed = deployments[0];
      const deploymentIsUntouched =
        deployments.length === 1 &&
        deployed?.planVersion === 2 &&
        after.active.source === "deployment" &&
        after.active.deploymentId === deployed.deploymentId &&
        after.active.plan.version === 2 &&
        after.active.plan.agents.every((agent) => agent.version === 2);

      // The current plan did: v3, from a pass that never activated anything.
      const currentMoved =
        after.current.source === "ingested" &&
        after.current.plan.version === 3 &&
        after.current.plan.agents.every((agent) => agent.version === 3) &&
        // …and it is genuinely a different object from the deployed one, which is
        // the collapse this whole target is about.
        canonical(after.current.plan) !== canonical(after.active.plan);

      const driftRow = after.lifecycle[0];
      const driftIsReported =
        countOf(before.lifecycle, "drifted") === 0 &&
        countOf(before.lifecycle, "running") === before.lifecycle.length &&
        after.lifecycle.length === before.lifecycle.length &&
        countOf(after.lifecycle, "drifted") === after.lifecycle.length &&
        driftRow?.runningVersion === 2 &&
        driftRow.plannedVersion === 3 &&
        driftRow.note.includes("Re-activate");

      const pass = wentLiveThenStopped && deploymentIsUntouched && currentMoved && driftIsReported;
      add(
        name,
        pass,
        pass
          ? `the first pass put v2 live and reconciliation reported 0 drifted; Role B's v3 ` +
              `revision then ingested and validated, stopped at the build gate, and became the ` +
              `current plan without touching the single deployment. The same runtime now reports ` +
              `${countOf(after.lifecycle, "drifted")} of ${after.lifecycle.length} agent(s) as ` +
              `drifted — running v${driftRow?.runningVersion ?? "?"}, planned v` +
              `${driftRow?.plannedVersion ?? "?"} — which is only expressible because the two ` +
              `plans are stored separately`
          : `wentLiveThenStopped=${wentLiveThenStopped} (first=${first.completed}, ` +
              `secondStoppedAt=${second.stoppedAt}) deploymentIsUntouched=${deploymentIsUntouched} ` +
              `(deployments=${deployments.length}, activeVersion=${after.active.plan.version}) ` +
              `currentMoved=${currentMoved} (source=${after.current.source}, ` +
              `version=${after.current.plan.version}) driftIsReported=${driftIsReported} ` +
              `(before=${canonical(before.lifecycle.map((r) => r.lifecycle))}, ` +
              `after=${canonical(after.lifecycle.map((r) => r.lifecycle))})`,
      );
    }

    /* ═══ 4. AN INVALID PLAN NEVER BECOMES WHAT WE INTEND ═══
       Two refusals, and the second one carries the check's teeth. A handoff that
       fails ingest never produces a plan at all, so nothing could have been
       written; a handoff that INGESTS CLEANLY and then fails validation would
       have been written by any implementation that saved on ingest success. The
       assertion that the pass reached `validate` rather than `ingest` is what
       makes "nothing was stored" evidence about the ordering rather than about
       the payload. */
    {
      const name =
        "PS-4 a handoff that converts but fails the contract does not become the current plan";
      const blocked = makeWorld("ps-invalid");
      const invalid = await runPipeline({ payload: COLLIDING_HANDOFF }, blocked.deps);
      const afterInvalid = await blocked.schedulerStore.getCurrentPlan();
      const resolvedAfterInvalid = await resolveCurrentPlan(blocked.schedulerStore);

      const gotPastIngestAndStopped =
        !invalid.completed &&
        invalid.stoppedAt === "validate" &&
        // Ingest genuinely succeeded — the plan exists, it is simply not one the
        // contract admits.
        invalid.plan !== null &&
        invalid.stages.find((s) => s.stage === "ingest")?.status === "ok" &&
        afterInvalid === null &&
        resolvedAfterInvalid.source === "fixture";

      const refused = makeWorld("ps-refused");
      const unrunnable = await runPipeline({ payload: ROLE_B_HANDOFF }, refused.deps);
      const afterRefused = await refused.schedulerStore.getCurrentPlan();
      const ingestRefusalWritesNothing =
        !unrunnable.completed && unrunnable.stoppedAt === "ingest" && afterRefused === null;

      const pass = gotPastIngestAndStopped && ingestRefusalWritesNothing;
      add(
        name,
        pass,
        pass
          ? `a handoff whose two agent keys collapse to one agent id converts cleanly (ingest ` +
              `"ok") and then fails contract rule 9 at validation; the pass stops there and the ` +
              `store still holds no current plan, so the resolver is back on the fixture. The ` +
              `real handoff, which is refused at ingest, likewise writes nothing`
          : `gotPastIngestAndStopped=${gotPastIngestAndStopped} (stopped=${invalid.stoppedAt}, ` +
              `ingest=${invalid.stages.find((s) => s.stage === "ingest")?.status ?? "missing"}, ` +
              `stored=${afterInvalid === null ? "null" : afterInvalid.planId}) ` +
              `ingestRefusalWritesNothing=${ingestRefusalWritesNothing} ` +
              `(stopped=${unrunnable.stoppedAt}, stored=${afterRefused === null ? "null" : "written"})`,
      );
    }

    /* ═══ 5. THE FALLBACK NEVER MASKS A REAL PLAN ═══
       The adversarial shape: a stored plan with no agents in it.
       `resolveActivePlan` skips a DEPLOYMENT whose plan has no agents, and
       copying that rule one module over is the plausible mistake — it looks
       defensive and it silently replaces an owner's "I removed everything" with
       a demo workforce that is nobody's. The honest report is that the deployed
       agents are now `retired`, and that is what is asserted. */
    {
      const name =
        "PS-5 a stored plan with no agents reads as the ingested plan, not as the fixture";
      const world = makeWorld("ps-empty");
      const live = await runPipeline({ payload: ROLE_B_HANDOFF_RESOLVED }, world.deps);

      // Written straight to the store rather than through the pipeline on
      // purpose: rule 0 refuses an agentless plan at validation, so the pipeline
      // cannot produce this state and the resolver still has to be honest about
      // it if anything else ever does.
      const emptied: ApprovedPlan = { ...INGESTED_PLAN, agents: [], businessOutcomes: [] };
      await world.schedulerStore.saveCurrentPlan(emptied);
      const state = await resolvePlanState(world.schedulerStore);

      const notTheFixture =
        state.current.source === "ingested" &&
        state.current.fallbackReason === null &&
        state.current.plan.agents.length === 0 &&
        state.current.plan.planId === INGESTED_PLAN.planId &&
        // Re-pointed with PS-2's clause and for the same reason: the substitution
        // this check exists to catch is the FALLBACK replacing an owner's empty
        // plan, and the fallback is Meridian now.
        state.current.plan.planId !== MERIDIAN_PLAN.planId;

      const deployedAgentsRetired =
        live.completed &&
        state.active.source === "deployment" &&
        state.lifecycle.length === state.active.plan.agents.length &&
        state.lifecycle.every((row) => row.lifecycle === "retired") &&
        state.lifecycle.every((row) => row.plannedVersion === null);

      add(
        name,
        notTheFixture && deployedAgentsRetired,
        notTheFixture && deployedAgentsRetired
          ? `an empty-but-real current plan comes back tagged "ingested" with 0 agents and no ` +
              `fallback reason, and the ${state.lifecycle.length} agent(s) still deployed read ` +
              `"retired" rather than "running". Nothing substituted ${MERIDIAN_PLAN.planId}`
          : `notTheFixture=${notTheFixture} (source=${state.current.source}, ` +
              `plan=${state.current.plan.planId}, agents=${state.current.plan.agents.length}) ` +
              `deployedAgentsRetired=${deployedAgentsRetired} (${canonical(
                state.lifecycle.map((row) => [row.agentId, row.lifecycle]),
              )})`,
      );
    }

    /* ═══ 6. THE STORES AGREE, INCLUDING ABOUT WHAT THEY REFUSE ═══
       `ORIANT_RUNTIME_STORAGE` is a switch rather than a fork only for as long
       as the implementations behave identically, and everything else in
       `npm run verify` runs in memory — so the file-backed one is a store the
       product deploys on and nothing executes. This check executes it, in a temp
       directory it removes again.

       The REFUSAL half matters as much as the round trip: `assertCurrentPlanStorable`
       exists because a `Map` and a JSON file will hold a version of 0 and an
       `integer` column will not, and a guard only one store calls is a guard
       that lets the suite pass on behaviour production does not have. */
    {
      const name =
        "PS-6 the in-memory and file stores round-trip the same current plan and refuse the same one";
      const root = mkdtempSync(path.join(tmpdir(), "oriant-planstate-"));
      try {
        const memory = new InMemorySchedulerStore();
        const file = new FileSchedulerStore(root);

        const bothStartEmpty =
          (await memory.getCurrentPlan()) === null && (await file.getCurrentPlan()) === null;

        await memory.saveCurrentPlan(INGESTED_PLAN);
        await file.saveCurrentPlan(INGESTED_PLAN);
        const fromMemory = await memory.getCurrentPlan();
        const fromFile = await file.getCurrentPlan();

        // JSON is a sound comparison for exactly this type: an `ApprovedPlan` is
        // plain data by contract, and the codec refuses anything that is not, so
        // there is no Date or Map here for a stringify to flatten on both sides.
        const roundTripsIdentically =
          fromMemory !== null &&
          fromFile !== null &&
          canonical(fromMemory) === canonical(INGESTED_PLAN) &&
          canonical(fromFile) === canonical(INGESTED_PLAN);

        // Not the same object as the one handed in: a store that returned its
        // input would let a later pipeline stage rewrite what drift is measured
        // against.
        const nothingIsShared = fromMemory !== INGESTED_PLAN && fromFile !== INGESTED_PLAN;

        /* ── The plan no store can hold ── */
        const unstorable: ApprovedPlan = { ...INGESTED_PLAN, version: 0 };
        const refusals: string[] = [];
        for (const [label, store] of [
          ["memory", memory],
          ["file", file],
        ] as const) {
          try {
            await store.saveCurrentPlan(unstorable);
            refusals.push(`${label}: accepted it`);
          } catch (error) {
            refusals.push(`${label}: ${messageOf(error)}`);
          }
        }
        const bothRefuse =
          refusals.length === 2 &&
          refusals.every(
            (line) => line.includes(INGESTED_PLAN.planId) && line.includes("version 0"),
          );
        // And the refusal left the good plan in place in both.
        const refusalWroteNothing =
          canonical(await memory.getCurrentPlan()) === canonical(INGESTED_PLAN) &&
          canonical(await file.getCurrentPlan()) === canonical(INGESTED_PLAN);

        // Development reset drops it, so a cleared runtime is back to "nothing
        // ingested" rather than to an intended workforce with nothing behind it.
        memory.reset();
        await file.reset();
        const resetClears =
          (await memory.getCurrentPlan()) === null && (await file.getCurrentPlan()) === null;

        const pass =
          bothStartEmpty &&
          roundTripsIdentically &&
          nothingIsShared &&
          bothRefuse &&
          refusalWroteNothing &&
          resetClears;
        add(
          name,
          pass,
          pass
            ? `both stores answer null before anything is written, return ` +
                `${INGESTED_PLAN.planId} v${INGESTED_PLAN.version} byte-identically afterwards ` +
                `without sharing the caller's object, refuse a version of 0 with the same ` +
                `sentence from the shared guard while leaving the stored plan intact, and go ` +
                `back to null on reset(). The Postgres store calls that same guard first, so it ` +
                `refuses identically; its SQL needs a database and is not executed here`
            : `bothStartEmpty=${bothStartEmpty} roundTripsIdentically=${roundTripsIdentically} ` +
                `nothingIsShared=${nothingIsShared} bothRefuse=${bothRefuse} ` +
                `(${refusals.join(" | ")}) refusalWroteNothing=${refusalWroteNothing} ` +
                `resetClears=${resetClears}`,
        );
      } finally {
        // Removed whatever happened above; the directory is this check's only
        // trace outside the process.
        rmSync(root, { recursive: true, force: true });
      }
    }

    add(
      COMPLETED,
      true,
      `all six checks above ran to the end: every pipeline pass, store read and reconciliation ` +
        `they make was answered`,
    );
  } catch (error) {
    /*
     * A pipeline pass, a store read or the temp directory can throw, and without
     * this the first such failure ends the process on a stack trace that says
     * nothing about which claim broke. The count is deliberately short by one
     * when this fires, so the `expectedChecks` tripwire in scripts/verify.mjs
     * reports the truncation too: a suite that stopped early must not be able to
     * look like a suite that had fewer checks to run.
     */
    add(
      COMPLETED,
      false,
      `the run stopped at check ${checks.length + 1} of 6: ${messageOf(error)}. Every check ` +
        `after it was skipped, so this result is a floor rather than a verdict.`,
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
      ? `PLAN STATE OK — ${results.length}/${results.length} checks passed.`
      : `PLAN STATE BROKEN — ${failed} of ${results.length} checks failed.`,
  );
  return lines.join("\n");
}
