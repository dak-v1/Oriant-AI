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
 * stress sweep, and M3-10 drives the guardrail predicate at a real leak. Where
 * a check asserts an absence — "no forbidden operation was called" — something
 * in the suite has to be genuinely trying, or the assertion is a coverage
 * report wearing a gate's clothes.
 *
 * The workforce is BUILT before it is proved. Compiling from the spec here
 * would attest to an artefact equivalent to the one Activation deploys rather
 * than to that artefact itself, and "equivalent" is exactly the assumption a
 * pluggable PackageGenerator invalidates.
 *
 * Run it with: npm run verify:m3
 */

import { BRIGHTPATH_PLAN } from "../../plan/fixtures/brightpath";
import type { ApprovedPlan } from "../../plan/types";
import { BRIGHTPATH_SCENARIOS } from "../sandbox/scenarios";
import { runSuite, verdictFingerprint } from "../sandbox/runner";
import type { SandboxDeps } from "../sandbox/runner";
import { runStressSweep } from "../sandbox/stress";
import type { SandboxVerdict, ScenarioResult } from "../sandbox/types";
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
      ? `M3 EXIT CRITERIA MET — ${results.length}/${results.length} checks passed.`
      : `M3 NOT MET — ${failed} of ${results.length} checks failed.`,
  );
  return lines.join("\n");
}
