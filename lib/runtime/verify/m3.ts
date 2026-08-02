/**
 * lib/runtime/verify/m3.ts — the M3 exit criteria, as an executable check.
 *
 * ROLE_C_PLAN M3 exits when all four agents pass their scenarios AND the same
 * scenario yields an identical verdict across five consecutive runs. The plan
 * is emphatic about the second half: Activation gates on this verdict, and a
 * flaky gate is no gate. So determinism is asserted here, not assumed.
 *
 * A gate that cannot fail is no gate either, which is the other thing this file
 * is now careful about. Several checks below exist specifically to prove the
 * ones above them can go red: M3-6 sabotages a scenario, M3-9 withholds the
 * stress sweep, M3-10 drives the guardrail predicate at a real leak, and M3-14
 * hands the generator a plan too big for its own ceiling. Where a check asserts
 * an absence — "no forbidden operation was called" — something in the suite has
 * to be genuinely trying, or the assertion is a coverage report wearing a gate's
 * clothes.
 *
 * M3-1 to M3-11 judge the AUTHORED evidence: BrightPath's twenty-four scenarios
 * and the twenty-case sweep hand-written against its finance limits. M3-12 to
 * M3-17 judge the GENERATED sweep instead — the one an ingested plan is actually
 * held to, since nothing authored here applies to a workforce that arrived over
 * the seam ten minutes ago. It is checked against BrightPath because that is the
 * only plan whose correct answers are independently known: if the generator is
 * wrong about a workforce four hand-written agents deep, it is wrong about
 * everyone's.
 *
 * The workforce is BUILT before it is proved. Compiling from the spec here
 * would attest to an artefact equivalent to the one Activation deploys rather
 * than to that artefact itself, and "equivalent" is exactly the assumption a
 * pluggable PackageGenerator invalidates.
 *
 * Run it with: npm run verify:m3
 */

import { BRIGHTPATH_PLAN } from "../../plan/fixtures/brightpath";
import type { AgentSpec, ApprovedPlan, PolicyLimit } from "../../plan/types";
import { BRIGHTPATH_SCENARIOS } from "../sandbox/scenarios";
import { runSuite, verdictFingerprint } from "../sandbox/runner";
import type { SandboxDeps } from "../sandbox/runner";
import { runStressSweep } from "../sandbox/stress";
import { stressSweepFor, suiteForPlan } from "../sandbox/smoke";
import { runGeneratedStress } from "../sandbox/smoke-stress";
import type {
  SandboxScenario,
  SandboxVerdict,
  ScenarioResult,
  StressResult,
} from "../sandbox/types";
// A PURE FUNCTION FROM THE COMPOSITION ROOT, and the only thing this file takes
// from it. `reasonerToolsMismatch` reads no environment and constructs no
// session — it is handed both switch values — so importing it does not violate
// the rule in this file's header that the sandbox never comes through
// `getRuntimeSession()`. Restating the rule here instead would give the check a
// second copy to agree with, which is the failure sweep.ts was written to end.
import { reasonerToolsMismatch } from "../session";
import { InMemoryBuildStore } from "../build/store";
import { LocalPackageGenerator, buildPlan, planBuildStatus } from "../build/runner";
import type { BuildDeps } from "../build/types";
import { FixedClock, createIdFactory } from "../store";

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

/** Matches the sandbox's own instant, so nothing in the build wanders. */
const NOW = "2026-07-24T01:00:00.000Z"; // 09:00 Asia/Singapore

function buildDeps(): BuildDeps & { store: InMemoryBuildStore } {
  const store = new InMemoryBuildStore();
  return {
    store,
    generator: new LocalPackageGenerator(),
    clock: new FixedClock(NOW),
    newId: createIdFactory("m3-build"),
    sleep: async () => {},
  };
}

/**
 * Operations denied to `agentId`: the org-wide list plus that agent's own.
 *
 * `AgentPolicy.forbidden` is PER AGENT (contract section 3.10 step 1), so a
 * single union across the workforce is wrong in a way that only shows up as
 * coverage improves: `hubspot.invoices.write_off` is forbidden for
 * admin-operations but granted to finance-followup and routed through
 * `alwaysApprove`, so a union reports a leak on entirely correct behaviour the
 * first time a scenario exercises that path — which SC-17 now does.
 *
 * An agent the plan does not contain falls back to the org-wide list rather
 * than throwing. A verifier that crashes tells the reader less than one that
 * fails a check, and `ScenarioResult.agentId` survives even when the lookup
 * that produced the result did not.
 */
export function forbiddenLeaks(
  plan: ApprovedPlan,
  results: Array<Pick<ScenarioResult, "scenarioId" | "agentId" | "operationsCalled">>,
): string[] {
  const orgWide = plan.globalPolicy.forbidden;
  const denied = new Map(
    plan.agents.map((agent) => [
      agent.id,
      new Set<string>([...orgWide, ...agent.policy.forbidden]),
    ]),
  );
  const fallback = new Set<string>(orgWide);

  return results.flatMap((result) => {
    const deny = denied.get(result.agentId) ?? fallback;
    return result.operationsCalled
      .filter((operation) => deny.has(operation))
      .map((operation) => `${result.scenarioId}(${result.agentId}):${operation}`);
  });
}

export async function runM3Verification(): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean, detail: string) =>
    checks.push({ name, pass, detail });

  /* 0. Build the workforce, once. Every suite below runs the stored packages,
        so the sweep and the scenarios can never end up attesting to different
        artefacts. Built outside the determinism loop on purpose: rebuilding
        inside it would prove the build repeats, not that the sandbox does. */
  const build = buildDeps();
  const built = await buildPlan(BRIGHTPATH_PLAN, build);
  const buildStatus = await planBuildStatus(BRIGHTPATH_PLAN, build);
  const sandbox: SandboxDeps = { packages: build };

  /* 1. Every scenario passes. */
  const stress = await runStressSweep(BRIGHTPATH_PLAN, sandbox);
  const verdict: SandboxVerdict = await runSuite(BRIGHTPATH_SCENARIOS, BRIGHTPATH_PLAN, {
    ...sandbox,
    stress,
  });

  add(
    "M3-1 every scenario passes",
    verdict.failed === 0,
    verdict.failed === 0
      ? `${verdict.passed}/${verdict.total} scenarios`
      : verdict.results
          .filter((r) => !r.passed)
          .map((r) => `${r.scenarioId}: ${r.failures.join("; ")}`)
          .join(" | "),
  );

  /* 2. Every agent is covered and green. An agent with no scenarios must not
        read as ready: absence of evidence is not evidence of safety. */
  add(
    "M3-2 every agent has passing coverage",
    verdict.byAgent.every((a) => a.ready),
    verdict.byAgent.map((a) => `${a.agentId}:${a.passed}/${a.total}`).join(", "),
  );

  /* 3. The stress sweep walks the limit boundary in both directions. */
  add(
    "M3-3 stress sweep passes at 100%",
    stress.passed === stress.total,
    stress.passed === stress.total
      ? `${stress.passed}/${stress.total} cases, pass rate ${stress.passRate}%`
      : stress.cases.filter((c) => !c.passed).map((c) => `${c.caseId}: ${c.detail}`).join(" | "),
  );

  /* 4. THE EXIT CRITERION — five consecutive runs must agree exactly. */
  {
    const fingerprints: string[] = [];
    for (let i = 0; i < 5; i++) {
      const pass = await runSuite(BRIGHTPATH_SCENARIOS, BRIGHTPATH_PLAN, {
        ...sandbox,
        stress: await runStressSweep(BRIGHTPATH_PLAN, sandbox),
      });
      fingerprints.push(verdictFingerprint(pass));
    }
    const unique = new Set(fingerprints);
    add(
      "M3-4 five consecutive runs produce an identical verdict",
      unique.size === 1,
      unique.size === 1
        ? "all 5 runs byte-identical, including every event timestamp and id"
        : `${unique.size} distinct verdicts across 5 runs — the gate is not deterministic`,
    );
  }

  /* 5. The verdict is what Activation reads, so it must be honest. */
  add(
    "M3-5 the sandbox verdict opens only when everything is green",
    verdict.ready === (verdict.failed === 0 && stress.passed === stress.total) &&
      // The flag and the explanation are one thing, not two that can disagree.
      verdict.ready === (verdict.blockers.length === 0),
    `ready=${verdict.ready} scenarioFailures=${verdict.failed} stressFailures=${stress.total - stress.passed} blockers=${verdict.blockers.length}`,
  );

  /* 6. A failing scenario must close the gate. Proven by running a suite that
        deliberately expects the wrong thing. */
  {
    const sabotaged = BRIGHTPATH_SCENARIOS.map((s) =>
      s.id === "sc-01-small-invoice"
        ? { ...s, expect: { ...s.expect, finalStatus: "refused" as const } }
        : s,
    );
    const bad = await runSuite(sabotaged, BRIGHTPATH_PLAN, { ...sandbox, stress });
    add(
      "M3-6 a single failing scenario closes the gate",
      !bad.ready && bad.failed === 1,
      `ready=${bad.ready} failed=${bad.failed} blockers=${bad.blockers.join(" | ")}`,
    );
  }

  /* 7. Guardrail coverage: no run may have called an operation forbidden for
        THE AGENT THAT RAN IT. Per agent, because that is what the executor
        enforces — see forbiddenLeaks. This is a real assertion rather than a
        coverage report only because SC-18 to SC-21 actually drive an agent at a
        deny; M3-10 below proves the predicate itself can fire. */
  {
    const leaked = forbiddenLeaks(BRIGHTPATH_PLAN, verdict.results);
    add(
      "M3-7 no scenario invoked an operation forbidden for the agent that ran it",
      leaked.length === 0,
      leaked.length === 0
        ? `${verdict.results.length} run(s) checked against their own deny lists`
        : leaked.join(", "),
    );
  }

  /* 8. Coverage of the RESOLVER, not of the status field. `refused` is produced
        both by a guardrail firing and by Sarah saying no, so a status-only
        check reads green on coverage it does not have — which is how the
        hard-deny, ungranted and blocked-limit branches stayed unexercised while
        this check reported success. Causes are read off the run's own failure
        text, which is the sentence the owner would be shown. */
  {
    const statuses = new Set(verdict.results.map((r) => r.finalStatus));
    const reasons = verdict.results.map((r) => r.failureReason ?? "");
    const saw = (needle: string) => reasons.some((r) => r.includes(needle));

    const causes: Record<string, boolean> = {
      "forbidden (step 1)": saw("is forbidden"),
      "not granted (step 2)": saw("was not granted"),
      "limit blocked (step 6)": saw("Blocked by limit"),
      // Read structurally rather than from the rejection text: a guardrail
      // refuses without ever raising an approval, so "refused after the owner
      // was asked" is exactly and only a human saying no.
      "owner rejected": verdict.results.some(
        (r) => r.finalStatus === "refused" && r.approvalsRaised > 0,
      ),
      "tool disconnected": saw("is not connected"),
      "tool failed": saw("503 Service Unavailable"),
      "tool timed out": saw("Timed out after"),
    };
    const missing = Object.entries(causes)
      .filter(([, hit]) => !hit)
      .map(([name]) => name);

    const sawApprovals = verdict.results.some((r) => r.approvalsRaised > 0);
    const sawAuto = verdict.results.some(
      (r) => r.approvalsRaised === 0 && r.finalStatus === "completed",
    );
    const sawEveryStatus =
      statuses.has("completed") &&
      statuses.has("awaiting_approval") &&
      statuses.has("refused") &&
      statuses.has("failed");

    add(
      "M3-8 the suite reaches every acted, asked, refused and failed CAUSE",
      sawEveryStatus && sawApprovals && sawAuto && missing.length === 0,
      missing.length === 0
        ? `${Object.keys(causes).length} causes covered, statuses=${[...statuses].sort().join(",")}, unattended=${sawAuto}, approvals=${sawApprovals}`
        : `uncovered: ${missing.join(", ")}`,
    );
  }

  /* 9. A skipped sweep must close the gate. The HTTP caller chooses whether to
        run the sweep, so an absent sweep reading as a pass would let a caller
        ask for a green verdict and be handed one. This is the path the M3
        checks never walked, which is why the hole survived. */
  {
    const noSweep = await runSuite(BRIGHTPATH_SCENARIOS, BRIGHTPATH_PLAN, {
      ...sandbox,
      stress: null,
    });
    add(
      "M3-9 a skipped stress sweep closes the gate",
      !noSweep.ready &&
        noSweep.failed === 0 &&
        noSweep.blockers.some((b) => b.includes("stress sweep did not run")),
      `ready=${noSweep.ready} scenarioFailures=${noSweep.failed} blockers=[${noSweep.blockers.join(" | ")}]`,
    );
  }

  /* 10. NEGATIVE CONTROL for M3-7. The suite is meant to produce no leaks, so a
         green M3-7 says nothing until the predicate is shown to fire. Driven at
         constructed input, the way M3-6 sabotages a suite copy, and it pins the
         per-agent semantics at the same time — a union would fail the third
         case below on behaviour the plan explicitly permits. */
  {
    const probe = (agentId: string, operation: string) =>
      forbiddenLeaks(BRIGHTPATH_PLAN, [
        { scenarioId: "probe", agentId, operationsCalled: [operation] },
      ]);

    const catchesOrgWide = probe("finance-followup", "hubspot.refunds.issue").length === 1;
    const catchesAgentOwn = probe("marketing", "mailchimp.campaigns.publish").length === 1;
    // Forbidden for admin-operations, granted and always-approved for finance.
    const allowsGranted = probe("finance-followup", "hubspot.invoices.write_off").length === 0;
    const stillCatchesIt = probe("admin-operations", "hubspot.invoices.write_off").length === 1;
    const unknownAgentUsesOrgWide =
      probe("not-in-this-plan", "hubspot.refunds.issue").length === 1;

    add(
      "M3-10 the guardrail check fires on a leak and stays silent on a granted operation",
      catchesOrgWide &&
        catchesAgentOwn &&
        allowsGranted &&
        stillCatchesIt &&
        unknownAgentUsesOrgWide,
      `orgWide=${catchesOrgWide} agentOwn=${catchesAgentOwn} noFalsePositive=${allowsGranted} perAgent=${stillCatchesIt} unknownAgent=${unknownAgentUsesOrgWide}`,
    );
  }

  /* 11. The verdict must attest to the packages Activation will deploy. A
         guardrail scenario patches the spec for one run, so no stored package
         corresponds to it and it compiles — but every other scenario must have
         run the stored artefact, and none may have run no package at all. */
  {
    const patched = new Set(
      BRIGHTPATH_SCENARIOS.filter((s) => s.specPatch !== undefined).map((s) => s.id),
    );
    const wrong = verdict.results.filter((r) =>
      patched.has(r.scenarioId) ? r.packageSource !== "compiled" : r.packageSource !== "stored",
    );
    add(
      "M3-11 the verdict was earned on the packages the Factory built",
      buildStatus.ready && built.failed === 0 && wrong.length === 0,
      wrong.length === 0
        ? `${built.built} built, ${built.skipped} skipped, ${built.failed} failed; ${verdict.results.length - patched.size} scenario(s) on stored packages, ${patched.size} on patched specs`
        : wrong.map((r) => `${r.scenarioId}:${r.packageSource}`).join(", "),
    );
  }

  /* ═════════════ The generated sweep — what an ingested plan is held to ═════════════ */

  const sweep = stressSweepFor(BRIGHTPATH_PLAN);
  const generated = await runGeneratedStress(BRIGHTPATH_PLAN, sandbox);
  const generatedById = new Map(generated.cases.map((c) => [c.caseId, c]));

  /* 12. THE DEFECT THIS SET OF CHECKS EXISTS FOR. The generator used to take
         `agent.workflows.find((w) => w.enabled)` and move on, so an agent with
         three enabled workflows had one swept and two reported as covered. The
         route comments claimed the broader cover; nothing measured it. */
  {
    const unswept: string[] = [];
    for (const agent of BRIGHTPATH_PLAN.agents) {
      for (const workflow of agent.workflows) {
        if (!workflow.enabled) continue;
        const covered = sweep.scenarios.some(
          (s) => s.agentId === agent.id && s.workflowId === workflow.id,
        );
        if (!covered) unswept.push(`${agent.id}/${workflow.id}`);
      }
    }
    const enabled = BRIGHTPATH_PLAN.agents.flatMap((a) =>
      a.workflows.filter((w) => w.enabled),
    ).length;

    add(
      "M3-12 the generated sweep covers every enabled workflow, not the first one",
      unswept.length === 0 && enabled > BRIGHTPATH_PLAN.agents.length,
      unswept.length === 0
        ? `${enabled} enabled workflow(s) across ${BRIGHTPATH_PLAN.agents.length} agent(s), all swept, ${sweep.scenarios.length} scenario(s) + ${sweep.runGates.length} run-start case(s)`
        : `never swept: ${unswept.join(", ")}`,
    );
  }

  /* 13. The generated sweep has to be RIGHT about a plan whose behaviour is
         known, or it is a machine for producing false alarms. It was: the old
         generator assumed an unattended agent inside its limits acts, and
         reported four guardrail failures against admin-operations for obeying
         its own alwaysApprove list. Four red cases nobody can act on is how a
         gate stops being read.

         "All green" is only half of it. A sweep that expected the same thing at
         every point on the ladder would also be all green, and could not catch
         the off-by-one it exists for — so every unattended agent must have at
         least one workflow whose expected outcome CHANGES as the numbers cross
         its own declared limit. */
  {
    const failures = generated.cases.filter((c) => !c.passed);

    const signature = (s: SandboxScenario): string =>
      `${s.expect.finalStatus}|${s.expect.reasonContains ?? ""}`;
    const blunt: string[] = [];
    for (const agent of BRIGHTPATH_PLAN.agents) {
      if (agent.policy.operatingMode !== "auto_within_limits") continue;
      if (agent.policy.limits.length === 0) continue;
      const discriminates = agent.workflows
        .filter((w) => w.enabled)
        .some((workflow) => {
          const ladder = sweep.scenarios.filter(
            (s) =>
              s.agentId === agent.id &&
              s.workflowId === workflow.id &&
              s.specPatch === undefined,
          );
          return new Set(ladder.map(signature)).size > 1;
        });
      if (!discriminates) blunt.push(agent.id);
    }

    add(
      "M3-13 the generated sweep is correct about this plan and changes answer at the boundary",
      generated.total > 0 && failures.length === 0 && blunt.length === 0,
      failures.length === 0 && blunt.length === 0
        ? `${generated.passed}/${generated.total} generated case(s), pass rate ${generated.passRate}%; every unattended agent's ladder crosses at least one boundary`
        : `${failures.map((c) => `${c.caseId}: ${c.detail}`).join(" | ")}${blunt.length ? ` | expects the same outcome at every magnitude: ${blunt.join(", ")}` : ""}`,
    );
  }

  /* 14. BOUNDED, AND HONEST ABOUT THE BOUND. Every case is a full stubbed run,
         so an unbounded generator makes the gate something nobody waits for.
         BrightPath must drop nothing; a plan built to exceed the ceiling must
         drop and NAME what it dropped. Both halves matter — the ceiling is only
         safe because the omission is visible.

         The shortfall is now COUNTED as well as named: `implied` and `emitted`
         are what a caller puts in front of a person, and a sentence they would
         have to parse instead is what let this defect sit for as long as it
         did. So the arithmetic is asserted too — implied minus emitted, summed
         over every omission, must be exactly the plan-level shortfall. */
  const crowded = withCrowdedLimits(BRIGHTPATH_PLAN);
  const crowdedSweep = stressSweepFor(crowded);
  {
    const target = crowded.agents[0];
    const perWorkflow = target
      ? crowdedSweep.scenarios.filter(
          (s) => s.agentId === target.id && s.workflowId === target.workflows[0]?.id,
        ).length
      : 0;
    const shortfall = crowdedSweep.dropped.reduce((n, o) => n + o.implied - o.emitted, 0);
    const arithmetic =
      crowdedSweep.impliedCases === crowdedSweep.emittedCases + shortfall &&
      crowdedSweep.emittedCases ===
        crowdedSweep.scenarios.length + crowdedSweep.runGates.length &&
      sweep.impliedCases === sweep.emittedCases;

    add(
      "M3-14 the sweep is bounded and counts every case the bound refused",
      sweep.dropped.length === 0 &&
        crowdedSweep.dropped.length > 0 &&
        crowdedSweep.dropped.some((o) => o.kind === "ceiling" && o.reducesCover) &&
        arithmetic &&
        shortfall > 0 &&
        perWorkflow > 0 &&
        crowdedSweep.scenarios.length < 4 * sweep.scenarios.length,
      `BrightPath walked ${sweep.emittedCases}/${sweep.impliedCases} implied case(s) and dropped ${sweep.dropped.length}; a plan with ${target?.policy.limits.length ?? 0} limits on one agent walked ${crowdedSweep.emittedCases}/${crowdedSweep.impliedCases}, emitted ${perWorkflow} case(s) for its first workflow, and reported: ${crowdedSweep.dropped.map((o) => `${o.kind} ${o.scope} ${o.emitted}/${o.implied}`).join(" | ") || "nothing"}`,
    );
  }

  /* 15. EVERY DENY IS DRIVEN AT, AND EVERY ONE REFUSES. M3-7 asserts no scenario
         called a forbidden operation, which a suite that never attempts one
         satisfies trivially. This is the other half: for each agent, each
         operation its own list or the org-wide list denies is attempted
         outright, and the run must REFUSE it — never route it to Sarah, because
         a hard deny that becomes an approval card is a deny the owner can click
         through. */
  {
    const attempted = new Set(
      sweep.scenarios
        .filter(
          (s) =>
            s.expect.finalStatus === "refused" &&
            s.expect.approvals === 0 &&
            s.expect.reasonContains === "is forbidden for this agent",
        )
        .flatMap((s) => (s.expect.mustNotCall ?? []).map((op) => `${s.agentId}:${op}`)),
    );

    const required: string[] = [];
    for (const agent of BRIGHTPATH_PLAN.agents) {
      for (const operation of new Set([
        ...agent.policy.forbidden,
        ...BRIGHTPATH_PLAN.globalPolicy.forbidden,
      ])) {
        required.push(`${agent.id}:${operation}`);
      }
    }

    const missing = required.filter((pair) => !attempted.has(pair));
    const wentRed = sweep.scenarios
      .filter((s) => s.expect.reasonContains === "is forbidden for this agent")
      .filter((s) => generatedById.get(s.id)?.passed !== true)
      .map((s) => s.id);

    add(
      "M3-15 every forbidden operation is attempted and every attempt is refused",
      required.length > 0 && missing.length === 0 && wentRed.length === 0,
      missing.length === 0 && wentRed.length === 0
        ? `${required.length} agent/operation deny pair(s) driven at directly, all refused with 0 approvals`
        : `never attempted: ${missing.join(", ") || "none"}; did not refuse: ${wentRed.join(", ") || "none"}`,
    );
  }

  /* 16. FAIL CLOSED ON A METRIC NOBODY ESTABLISHED. This is the whole point of
         the six-step order's last branch, and it is the branch a real workforce
         lands in constantly — nothing instruments `emails.per_run` on day one.
         A case that leaves one limit unmeasured must never be expected to
         complete, and must not complete when run. */
  {
    const unattended = BRIGHTPATH_PLAN.agents.filter(
      (a) => a.policy.operatingMode === "auto_within_limits" && a.policy.limits.length > 0,
    );
    const leaks: string[] = [];
    const covered = new Set<string>();

    for (const scenario of sweep.scenarios) {
      // A probe replaces the workflow's steps, so its metrics say nothing about
      // the limits; only the metric families are evidence here.
      if (scenario.specPatch !== undefined) continue;
      const agent = unattended.find((a) => a.id === scenario.agentId);
      if (!agent) continue;
      const metrics = scenario.reasonScript?.["__default"]?.metrics ?? {};
      const blind = agent.policy.limits.filter((limit) => !measured(limit, metrics));
      if (blind.length === 0) continue;
      covered.add(agent.id);
      const ran = generatedById.get(scenario.id);
      if (scenario.expect.finalStatus === "completed" || ran?.passed !== true) {
        leaks.push(`${scenario.id} (${blind.map((l) => l.metric).join(", ")})`);
      }
    }

    add(
      "M3-16 an unmeasured metric fails closed rather than acting on missing data",
      unattended.length > 0 && covered.size === unattended.length && leaks.length === 0,
      leaks.length === 0
        ? `${covered.size} of ${unattended.length} unattended agent(s) driven at an unmeasured limit; none acted`
        : `acted or failed on missing data: ${leaks.join(", ")}`,
    );
  }

  /* 17. THE RUN-START GATE, which the executor never consults — the scheduler
         does, so no sandbox scenario can reach it and it had no generated cover
         at all. Both edges of every declared quiet window, and the daily cap at
         just-under, exactly-at and just-over. Asserted in both directions on
         purpose: a window that refuses everything is not a working guardrail,
         it is an agent that never runs. */
  {
    const gates = sweep.runGates;
    const failed = gates.filter((g) => generatedById.get(g.id)?.passed !== true).map((g) => g.id);

    const missing: string[] = [];
    for (const agent of BRIGHTPATH_PLAN.agents) {
      const mine = gates.filter((g) => g.agentId === agent.id && g.kind === "gate");
      const window = agent.policy.quietHours ?? BRIGHTPATH_PLAN.globalPolicy.quietHours;
      if (window && !mine.some((g) => g.kind === "gate" && g.expect === "refuse")) {
        missing.push(`${agent.id}: no quiet minute proved`);
      }
      if (window && !mine.some((g) => g.kind === "gate" && g.expect === "allow")) {
        missing.push(`${agent.id}: no open minute proved`);
      }
      const cap = agent.policy.maxRunsPerDay;
      if (cap !== null && !mine.some((g) => g.kind === "gate" && g.runsToday === cap)) {
        missing.push(`${agent.id}: cap of ${cap} never walked`);
      }
    }

    add(
      "M3-17 the run-start gate is walked at both quiet-hours edges and at the day cap",
      gates.length > 0 && missing.length === 0 && failed.length === 0,
      missing.length === 0 && failed.length === 0
        ? `${gates.length} run-start case(s) across ${BRIGHTPATH_PLAN.agents.length} agent(s), all as the plan declares`
        : `uncovered: ${missing.join(", ") || "none"}; disagreed: ${failed.join(", ") || "none"}`,
    );
  }

  /* 18. THE SHORTFALL IS EVIDENCE, AND IT CLOSES THE GATE.

         M3-14 proves the generator COUNTS what its ceilings refused. That was
         already true in spirit before this check existed and it changed nothing,
         because the count reached one `console.warn` inside the server process
         and stopped there. A sweep that walked 40 of a plan's 300 cases came
         back with the same `total`, the same `passRate` and the same shape as
         one that walked all 300, and Activation opened on it. This is the check
         that makes the difference observable.

         THE NEGATIVE CONTROL IS THE POINT. The same suite, on the same plan,
         with the same sweep — run twice, differing only in whether the coverage
         rows are present. `stripped` is literally what this sweep reported
         before this change: the runs, with the shortfall removed. If the gate
         opens on `stripped` and shuts on `truncated`, then the rows are doing
         the work and nothing else is. If it shut on both, this check would be
         passing on a scenario failure and proving nothing. */
  {
    const crowdedOne: ApprovedPlan = { ...crowded, agents: crowded.agents.slice(0, 1) };
    // No `packages`: the crowded agent's policy exists only for this check, so
    // the Factory stored nothing that corresponds to it. Compiling is the
    // weaker claim `runScenario` records, and it is the honest one here.
    const truncated = await runGeneratedStress(crowdedOne);
    const coverage = truncated.cases.filter((c) => c.caseId.startsWith("coverage-"));
    const lost = stressSweepFor(crowdedOne).dropped.filter((o) => o.reducesCover);

    // Every real case still passed, so the sweep is red for exactly one reason:
    // it does not cover the plan. Anything else red here would mean this check
    // is measuring a broken generator instead of a reported shortfall.
    const onlyCoverageIsRed =
      truncated.cases.filter((c) => !c.passed).length === coverage.length;

    const stripped: StressResult = (() => {
      const runs = truncated.cases.filter((c) => !c.caseId.startsWith("coverage-"));
      const passed = runs.filter((c) => c.passed).length;
      return {
        total: runs.length,
        passed,
        passRate: runs.length === 0 ? 100 : Math.round((passed / runs.length) * 100),
        cases: runs,
      };
    })();

    // Generated cover only. BrightPath's authored scenarios assert the limits
    // this agent HAD; `withCrowdedLimits` replaced them, so handing them in
    // would fail three cases on a policy that no longer exists and the control
    // below would be measuring that instead of the coverage rows.
    const suite = suiteForPlan(crowdedOne);
    const before = await runSuite(suite, crowdedOne, { stress: stripped });
    const after = await runSuite(suite, crowdedOne, { stress: truncated });

    const namedAtTheGate = after.blockers.some((b) => b.includes("stress case(s) failed"));
    const generatedIsClean =
      generated.cases.every((c) => !c.caseId.startsWith("coverage-")) &&
      generated.passed === generated.total;

    add(
      "M3-18 a sweep that dropped cases says so, and cannot open the gate",
      coverage.length === lost.length + 1 &&
        coverage.every((c) => !c.passed) &&
        onlyCoverageIsRed &&
        before.ready &&
        !after.ready &&
        namedAtTheGate &&
        generatedIsClean,
      before.ready && !after.ready && namedAtTheGate && onlyCoverageIsRed
        ? `${lost.length} scope(s) short: hidden → ready=${before.ready}, reported → ready=${after.ready} ("${after.blockers.find((b) => b.includes("stress case(s) failed")) ?? ""}"); BrightPath's own generated sweep adds no coverage row and stays ${generated.passed}/${generated.total}`
        : `coverageRows=${coverage.length} lostScopes=${lost.length} onlyCoverageRed=${onlyCoverageIsRed} hiddenReady=${before.ready} reportedReady=${after.ready} namedAtGate=${namedAtTheGate} brightPathClean=${generatedIsClean}; blockers=${after.blockers.join(" | ") || "none"}`,
    );
  }

  /* 19. THE COMBINATION THAT REFUSED EVERY SEND WITHOUT SAYING WHY, and it
         belongs in M3 because the sandbox is the one place where a fixture
         reasoner is the RIGHT reasoner — `runner.ts` pins `FixtureReasoner`
         alongside `StubToolClient` and `FixedClock`, and the fixture is honest
         there precisely because the hands are stubbed too. The server can come
         apart in a way the sandbox cannot: `ORIANT_RUNTIME_TOOLS=composio` with
         the mode left alone mounts real Composio clients behind that same
         fixture reasoner, and the schema gate then refuses every act step while
         blaming "the model" for answering in its own vocabulary.

         BOTH DIRECTIONS ARE ASSERTED. A warning that fires on everything is a
         warning nobody reads, and live+stub in particular must stay silent: that
         is the documented way to try a real model without sending. Driven
         through the pure function rather than through `process.env`, because
         this suite caches a process-wide session and a check that mutated the
         environment would change what the checks after it see. */
  {
    const trap = reasonerToolsMismatch("fixture", true);
    const silent = [
      ["fixture", false],
      ["live", true],
      ["live", false],
    ] as const;
    const noisy = silent
      .filter(([mode, tools]) => reasonerToolsMismatch(mode, tools) !== null)
      .map(([mode, tools]) => `${mode}+${tools ? "composio" : "stub"}`);

    const namesBoth =
      trap !== null &&
      trap.includes("ORIANT_RUNTIME_TOOLS") &&
      trap.includes("ORIANT_RUNTIME_MODE");

    add(
      "M3-19 fixture reasoning with live tools explains itself, and the other three stay quiet",
      namesBoth && noisy.length === 0,
      namesBoth && noisy.length === 0
        ? `fixture+composio warns and names both variables; fixture+stub, live+composio and live+stub are silent`
        : `warned=${trap !== null} namesBothVariables=${namesBoth} falsePositives=${noisy.join(", ") || "none"}`,
    );
  }

  return checks;
}

/** A metric the runtime would accept as established. Mirrors evaluateLimits. */
function measured(limit: PolicyLimit, metrics: Record<string, number>): boolean {
  const value = metrics[limit.metric];
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * BRIGHTPATH_PLAN with one agent given more limits than the generator's
 * per-workflow ceiling allows cases for — the negative control M3-14 needs.
 *
 * Built here rather than kept as a fixture because it is not a plan anybody
 * should be able to run: it exists for exactly one assertion, that the ceiling
 * bites and says so. Cloned rather than mutated, so the shared fixture the other
 * sixteen checks are measured against survives untouched.
 */
function withCrowdedLimits(plan: ApprovedPlan): ApprovedPlan {
  const [first, ...rest] = plan.agents;
  if (!first) return plan;
  const crowded: AgentSpec = {
    ...first,
    policy: {
      ...first.policy,
      operatingMode: "auto_within_limits",
      limits: Array.from({ length: 8 }, (_, i) => ({
        id: `crowded-${i}`,
        metric: `crowded.metric_${i}`,
        op: "<=" as const,
        value: 10 + i,
        onBreach: "require_approval" as const,
      })),
    },
  };
  return { ...plan, agents: [crowded, ...rest] };
}

export function formatResults(results: Check[]): string {
  const lines = results.map(
    (r) => `${r.pass ? "PASS" : "FAIL"}  ${r.name}\n        ${r.detail}`,
  );
  const failed = results.filter((r) => !r.pass).length;
  lines.push("");
  lines.push(
    failed === 0
      ? `M3 EXIT CRITERIA MET — ${results.length}/${results.length} checks passed.`
      : `M3 NOT MET — ${failed} of ${results.length} checks failed.`,
  );
  return lines.join("\n");
}
