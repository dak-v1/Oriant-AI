/**
 * lib/runtime/pipeline/run.ts — onboarding to monitoring, in one pass.
 *
 * Role A produces a discovery report. Role B turns it into an approved
 * workforce plan and deposits a handoff. Everything after that is Role C, and
 * until now it was five endpoints a human had to call in the right order while
 * remembering which gate each one reads. This is that sequence, written down.
 *
 *   collect   take the handoff Role B left in role_c_handoffs
 *   ingest    convert it to an ApprovedPlan, recording every assumption
 *   validate  check it against the contract
 *   build     compile and store one package per agent
 *   prove     run the sandbox and get a verdict
 *   activate  open the three gates, register triggers, go live
 *
 * TWO RULES THE ORDER ENFORCES.
 *
 * First, EVERY STAGE READS THE STAGE BEFORE IT FROM STORAGE, not from a
 * variable this function is holding. `prove` loads the packages `build` wrote;
 * `activate` reads the packages and the verdict rather than being told they
 * were fine. A pipeline that passed its own results forward would prove the
 * pipeline ran, not that the artefacts it produced are the ones that exist.
 *
 * Second, IT STOPS AT THE FIRST CLOSED GATE and never works around one. There
 * is no force flag. The gates are the product: a workforce that goes live
 * without a sandbox verdict is precisely the thing every check in this
 * repository was written to prevent, and an orchestrator with an override would
 * make all of them optional.
 *
 * ONE SIDE EFFECT SITS BETWEEN TWO STAGES: once `validate` passes, the plan is
 * written as the CURRENT plan (`SchedulerStore.saveCurrentPlan`) — what the
 * owner intends, as against `Deployment.plan`, what is running. It happens
 * there rather than at either end of the pass, and the comment at the write says
 * why in full; the short version is that a plan is intended from the moment it
 * is valid, so a pass that later stops at `build` still moved what we intend.
 */

import type { ApprovedPlan } from "../../plan/types";
import { validateApprovedPlan } from "../../plan/validate";
import { ingestHandoff } from "../../plan/ingest/from-handoff";
import type { IngestGap, WorkforceHandoffPayload } from "../../plan/ingest/types";
import { buildPlan, planBuildStatus } from "../build/runner";
import type { BuildDeps } from "../build/types";
import { runSuite } from "../sandbox/runner";
import { suiteForPlan } from "../sandbox/smoke";
import { runGeneratedStress } from "../sandbox/smoke-stress";
import { BRIGHTPATH_SCENARIOS } from "../sandbox/scenarios";
import type { SandboxVerdict } from "../sandbox/types";
import {
  FixedSandboxEvidence,
  activate,
  type ActivationDeps,
} from "../schedule/activation";
import type { SchedulerDeps } from "../schedule/types";
import type { IntegrationProvider } from "../types";
import { STAGE_HREF, type PipelineResult, type StageResult } from "./types";

export interface PipelineDeps {
  build: BuildDeps;
  scheduler: SchedulerDeps;
  /**
   * WHOSE CONNECTED ACCOUNTS, ASKED ONCE THE PLAN EXISTS — A RESOLVER, NOT A
   * PROVIDER, AND THE STAGE ORDER IS THE WHOLE ARGUMENT.
   *
   * A provider is scoped to one organization's Composio connections. The
   * organization is a field on `ApprovedPlan`, and this function INGESTS the
   * plan: at the moment a caller builds these deps there is a handoff payload and
   * nothing else, so a fixed `IntegrationProvider` here could only ever have been
   * chosen from something OTHER than the plan about to run. Both callers proved
   * it — they passed `session.tools`, which is the BrightPath fixture's
   * organization, so the integrations gate at stage 6 asked whether the DEMO has
   * Gmail connected and printed the answer under the customer's name. There is no
   * value that would have made the fixed field correct, because the fact it needs
   * had not been read yet. That is what makes this a resolver rather than a
   * better default.
   *
   * REJECTED: resolving inside this module by calling
   * `liveIntegrationProviderFor(plan.organizationId)` directly. It would weld the
   * live Composio path into the pipeline, and the stub-versus-live switch is
   * `ORIANT_RUNTIME_TOOLS`, read in lib/runtime/session.ts and nowhere else. The
   * sandbox and the verify targets hand this function a `StubIntegrationProvider`
   * on purpose; a pipeline that resolved its own hands would take that choice away
   * from them and put a second place to read the switch in the repository.
   *
   * FAIL CLOSED IS THE RESOLVER'S JOB, NOT THIS FILE'S, and it is already built:
   * `session.toolsFor` answers an unresolvable organization with
   * `UnresolvedOrganizationProvider`, which reports every connection as "required"
   * and refuses every call by name. So a plan whose organization cannot be
   * resolved arrives at the integrations gate SHUT, with the reason in the
   * blocker — never another organization's provider, and never the stub.
   */
  integrationsFor(organizationId: string): IntegrationProvider;
  /** Recorded on the deployment as whoever put this workforce live. */
  activatedBy: string;
  /**
   * Authored scenarios to prefer over generated ones. Defaults to the
   * BrightPath library; anything it does not cover gets smoke cover.
   */
  authoredScenarios?: typeof BRIGHTPATH_SCENARIOS;
}

export interface PipelineInput {
  /** The handoff to run. Supplied by the caller; `source.ts` fetches it. */
  payload: WorkforceHandoffPayload;
}

function stage(
  id: StageResult["stage"],
  status: StageResult["status"],
  summary: string,
  detail: string[] = [],
): StageResult {
  return {
    stage: id,
    status,
    summary,
    detail,
    ...(status === "blocked" || status === "failed" ? { href: STAGE_HREF[id] } : {}),
  };
}

export async function runPipeline(
  input: PipelineInput,
  deps: PipelineDeps,
): Promise<PipelineResult> {
  const stages: StageResult[] = [];
  let plan: ApprovedPlan | null = null;
  let gaps: IngestGap[] = [];

  const stop = (stoppedAt: StageResult["stage"]): PipelineResult => {
    // Everything after the stopping point is reported as skipped rather than
    // omitted, so the shape of the response does not change with the outcome
    // and a UI can render six rows every time.
    const order: StageResult["stage"][] = [
      "collect",
      "ingest",
      "validate",
      "build",
      "prove",
      "activate",
    ];
    const reached = new Set(stages.map((s) => s.stage));
    for (const id of order.slice(order.indexOf(stoppedAt) + 1)) {
      if (!reached.has(id)) {
        stages.push(stage(id, "skipped", "Not reached."));
      }
    }
    return { completed: false, stoppedAt, stages, plan, gaps, live: null };
  };

  /* ── 1. Collect ── */
  const payload = input.payload;
  stages.push(
    stage("collect", "ok", `Handoff for plan ${payload.workforce_plan.id} received.`, [
      `${payload.agents.length} configured agent(s)`,
      `${payload.integrations.length} integration(s)`,
      `generated ${payload.generated_at}`,
    ]),
  );

  /* ── 2. Ingest ── */
  let ingest;
  try {
    ingest = ingestHandoff(payload);
  } catch (err) {
    stages.push(
      stage("ingest", "failed", "The handoff could not be converted.", [
        err instanceof Error ? err.message : String(err),
      ]),
    );
    return stop("ingest");
  }

  plan = ingest.plan;
  gaps = ingest.gaps;
  const blocking = gaps.filter((g) => g.severity === "blocking");

  if (blocking.length > 0) {
    stages.push(
      stage(
        "ingest",
        "blocked",
        `The handoff cannot be built: ${blocking.length} blocking gap(s).`,
        blocking.map((g) => `${g.message} → ${g.resolution}`),
      ),
    );
    return stop("ingest");
  }

  stages.push(
    stage("ingest", "ok", `Converted to a plan with ${plan.agents.length} agent(s).`, [
      ...ingest.summary.map(
        (s) =>
          `${s.agentId}: ${s.operatingMode}, ${s.grantedOperations} operation(s), ${s.writeOperations} write(s)`,
      ),
      `${gaps.filter((g) => g.severity === "degraded").length} assumption(s) recorded`,
    ]),
  );

  /* ── 3. Validate ── */
  const findings = validateApprovedPlan(plan);
  const errors = findings.filter((f) => f.severity === "error");
  if (errors.length > 0) {
    stages.push(
      stage("validate", "blocked", `The plan fails ${errors.length} contract rule(s).`,
        errors.map((e) => `rule ${e.rule}${e.agentId ? ` (${e.agentId})` : ""}: ${e.message}`)),
    );
    return stop("validate");
  }
  /*
   * THE PLAN BECOMES THE CURRENT PLAN HERE, AND THIS IS THE ONLY WRITE OF IT.
   *
   * "Current" means WHAT WE INTEND, as against `Deployment.plan`, which is what
   * is actually running. Everything that reports drift compares the two
   * (lib/runtime/current-plan.ts), so the instant chosen for this write decides
   * what drift can ever mean.
   *
   * AFTER VALIDATE, NOT AFTER INGEST. Ingest succeeding only means the handoff
   * converted into something plan-shaped; `validateApprovedPlan` is what says it
   * is a plan. A conversion carrying a rule-0 or rule-9 error can never be
   * built, so recording it as what we intend would put an unrunnable workforce
   * in front of the owner as the current one and make every drift row a
   * comparison against something no deployment could ever match.
   *
   * BEFORE BUILD, PROVE AND ACTIVATE, equally deliberately, and this is the
   * half that is easy to get backwards. A plan is intended from the moment it is
   * approved and valid — whether or not the Factory can compile it today,
   * whether or not the sandbox passes, and whether or not anyone has activated
   * it yet. Writing it only on a completed pass would make the current plan a
   * copy of the deployment, which makes drift permanently zero and deletes
   * `planned` and `drifted` from a lifecycle that still lists them. An agent
   * that is planned but not yet live is precisely the state this ordering
   * exists to make visible.
   *
   * A FAILED WRITE STOPS THE PASS. There is no "carry on and activate anyway":
   * the surface would then compare a fresh deployment against the PREVIOUS
   * current plan and report drift that was already resolved, or none where there
   * is some. It is reported on the validate stage rather than as a seventh one,
   * so the six-row shape every caller renders does not change with the outcome.
   */
  try {
    await deps.scheduler.store.saveCurrentPlan(plan);
  } catch (err) {
    stages.push(
      stage("validate", "failed", "The plan is valid but could not be recorded as current.", [
        err instanceof Error ? err.message : String(err),
        "Nothing was built or activated: a workforce whose intended plan cannot be " +
          "stored is one the Operate surface would report drift against wrongly.",
      ]),
    );
    return stop("validate");
  }

  stages.push(
    stage("validate", "ok", "The plan satisfies the contract.", [
      `0 errors, ${findings.length} warning(s)`,
      `recorded as the current plan (${plan.planId} v${plan.version})`,
    ]),
  );

  /* ── 4. Build ── */
  let buildResult;
  try {
    buildResult = await buildPlan(plan, deps.build);
  } catch (err) {
    stages.push(
      stage("build", "failed", "The Agent Factory threw.", [
        err instanceof Error ? err.message : String(err),
      ]),
    );
    return stop("build");
  }

  if (buildResult.failed > 0) {
    stages.push(
      stage("build", "blocked", `${buildResult.failed} agent(s) failed to build.`,
        buildResult.jobs
          .filter((j) => j.status === "failed")
          .map((j) => `${j.agentId}: ${j.error ?? "unknown"}`)),
    );
    return stop("build");
  }

  // Read the gate rather than trusting the counters: a package is what can run.
  const buildStatus = await planBuildStatus(plan, deps.build);
  if (!buildStatus.ready) {
    stages.push(
      stage("build", "blocked", "Not every agent has a current package.",
        buildStatus.missing.map((m) => `${m.agentId}: ${m.reason}`)),
    );
    return stop("build");
  }

  stages.push(
    stage("build", "ok",
      `${buildResult.built} built, ${buildResult.skipped} unchanged.`,
      buildResult.jobs.map((j) => `${j.agentId}: ${j.status}${j.checksum ? ` (${j.checksum})` : ""}`)),
  );

  /* ── 5. Prove ── */
  let verdict: SandboxVerdict;
  try {
    // Authored scenarios where they exist, generated smoke cover elsewhere.
    // An ingested plan has no authored cover at all, and an agent with no
    // scenario is treated as NOT ready — so without this the gate could never
    // open for anything that came over the seam.
    const suite = suiteForPlan(plan, deps.authoredScenarios ?? BRIGHTPATH_SCENARIOS);
    // The sweep is not optional. `runSuite` refuses a verdict without one,
    // deliberately: it is the only check that walks a decision boundary, so a
    // caller who skipped it could otherwise ask for a green verdict and be
    // handed one. The authored sweep is BrightPath-specific, so a plan that
    // arrived over the seam gets a generated one — for a draft_only agent that
    // means proving it asks at EVERY magnitude, which no single case can show.
    const stress = await runGeneratedStress(plan, { packages: deps.build });
    verdict = await runSuite(suite, plan, { packages: deps.build, stress });
  } catch (err) {
    stages.push(
      stage("prove", "failed", "The sandbox threw.", [
        err instanceof Error ? err.message : String(err),
      ]),
    );
    return stop("prove");
  }

  if (!verdict.ready) {
    stages.push(
      stage(
        "prove",
        "blocked",
        verdict.blockers[0] ?? "The sandbox verdict is not ready.",
        [
          // `blockers` first: the verdict can be shut for reasons no scenario
          // failure explains, and printing only failures produced an empty
          // detail that said nothing at all.
          ...verdict.blockers,
          ...verdict.results
            .filter((r) => !r.passed)
            .map((r) => `${r.scenarioId}: ${r.failures.join("; ")}`),
        ],
      ),
    );
    return stop("prove");
  }

  stages.push(
    stage("prove", "ok", `${verdict.passed}/${verdict.total} scenario(s) passed.`,
      verdict.byAgent.map((a) => `${a.agentId}: ${a.passed}/${a.total}`)),
  );

  /* ── 6. Activate ── */
  const activationDeps: ActivationDeps = {
    scheduler: deps.scheduler,
    packages: deps.build,
    // Resolved HERE and not a line earlier, because here is the first point in
    // the pass where `plan.organizationId` exists at all — stage 2 is what
    // produces it. The gate about to run asks "has this business connected
    // Gmail", and the only plan it may ask that about is the one it is gating.
    integrations: deps.integrationsFor(plan.organizationId),
    // The verdict just produced, pinned. Re-running the suite inside activation
    // would prove a second workforce and gate on the first.
    sandbox: new FixedSandboxEvidence(verdict),
  };

  let activation;
  try {
    activation = await activate(plan, activationDeps, { activatedBy: deps.activatedBy });
  } catch (err) {
    stages.push(
      stage("activate", "failed", "Activation threw.", [
        err instanceof Error ? err.message : String(err),
      ]),
    );
    return stop("activate");
  }

  if (!activation.activated) {
    stages.push(
      stage("activate", "blocked", "One or more activation gates are shut.",
        activation.blockers.map((b) => b.message)),
    );
    return stop("activate");
  }

  // `registration` is null on `unchanged` — nothing was written because this
  // exact plan version was already live.
  const registered = activation.registration?.registered.length ?? 0;
  const rejected = activation.registration?.rejected ?? [];

  stages.push(
    stage(
      "activate",
      // An enabled workflow that got no trigger is live in name only, so a
      // rejection is reported as a block rather than buried in the detail of a
      // green stage.
      rejected.length > 0 ? "blocked" : "ok",
      rejected.length > 0
        ? `Live, but ${rejected.length} workflow(s) got no trigger and will never start.`
        : `Live: ${activation.outcome}.`,
      [
        `deployment ${activation.deployment.deploymentId}`,
        `${registered} trigger(s) registered`,
        ...rejected.map((r) => `no trigger: ${JSON.stringify(r)}`),
      ],
    ),
  );

  if (rejected.length > 0) return stop("activate");

  return {
    completed: true,
    stoppedAt: null,
    stages,
    plan,
    gaps,
    live: {
      deploymentId: activation.deployment.deploymentId,
      agents: plan.agents.length,
      triggersRegistered: registered,
    },
  };
}
