/**
 * lib/runtime/verify/m3.ts — the M3 exit criteria, as an executable check.
 *
 * ROLE_C_PLAN M3 exits when all four agents pass their scenarios AND the same
 * scenario yields an identical verdict across five consecutive runs. The plan
 * is emphatic about the second half: Activation gates on this verdict, and a
 * flaky gate is no gate. So determinism is asserted here, not assumed.
 *
 * Run it with: npm run verify:m3
 */

import { BRIGHTPATH_PLAN } from "../../plan/fixtures/brightpath";
import { BRIGHTPATH_SCENARIOS } from "../sandbox/scenarios";
import { runSuite, verdictFingerprint } from "../sandbox/runner";
import { runStressSweep } from "../sandbox/stress";
import type { SandboxVerdict } from "../sandbox/types";

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

export async function runM3Verification(): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean, detail: string) =>
    checks.push({ name, pass, detail });

  /* 1. Every scenario passes. */
  const stress = await runStressSweep(BRIGHTPATH_PLAN);
  const verdict: SandboxVerdict = await runSuite(BRIGHTPATH_SCENARIOS, BRIGHTPATH_PLAN, {
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
        stress: await runStressSweep(BRIGHTPATH_PLAN),
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
    verdict.ready === (verdict.failed === 0 && stress.passed === stress.total),
    `ready=${verdict.ready} scenarioFailures=${verdict.failed} stressFailures=${stress.total - stress.passed}`,
  );

  /* 6. A failing scenario must close the gate. Proven by running a suite that
        deliberately expects the wrong thing. */
  {
    const sabotaged = BRIGHTPATH_SCENARIOS.map((s) =>
      s.id === "sc-01-small-invoice"
        ? { ...s, expect: { ...s.expect, finalStatus: "refused" as const } }
        : s,
    );
    const bad = await runSuite(sabotaged, BRIGHTPATH_PLAN, { stress });
    add(
      "M3-6 a single failing scenario closes the gate",
      !bad.ready && bad.failed === 1,
      `ready=${bad.ready} failed=${bad.failed}`,
    );
  }

  /* 7. Guardrail coverage: across the whole suite, no run may ever have called
        an operation the plan forbids. This is the assertion that would catch a
        policy regression anywhere in the system. */
  {
    const forbidden = new Set<string>(BRIGHTPATH_PLAN.globalPolicy.forbidden);
    for (const agent of BRIGHTPATH_PLAN.agents) {
      for (const operation of agent.policy.forbidden) forbidden.add(operation);
    }
    const leaked = verdict.results.flatMap((r) =>
      r.operationsCalled.filter((op) => forbidden.has(op)).map((op) => `${r.scenarioId}:${op}`),
    );
    add(
      "M3-7 no scenario ever invoked a forbidden operation",
      leaked.length === 0,
      leaked.length === 0
        ? `${forbidden.size} forbidden operation(s), none reached`
        : leaked.join(", "),
    );
  }

  /* 8. Every branch of the policy resolver is exercised somewhere. Coverage of
        the guard is what makes the suite meaningful, not the scenario count. */
  {
    const statuses = new Set(verdict.results.map((r) => r.finalStatus));
    const sawApprovals = verdict.results.some((r) => r.approvalsRaised > 0);
    const sawAuto = verdict.results.some(
      (r) => r.approvalsRaised === 0 && r.finalStatus === "completed",
    );
    add(
      "M3-8 the suite covers acted, asked, refused and failed outcomes",
      statuses.has("completed") &&
        statuses.has("awaiting_approval") &&
        statuses.has("refused") &&
        statuses.has("failed") &&
        sawApprovals &&
        sawAuto,
      `statuses=${[...statuses].join(",")} sawApprovals=${sawApprovals} sawUnattended=${sawAuto}`,
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
