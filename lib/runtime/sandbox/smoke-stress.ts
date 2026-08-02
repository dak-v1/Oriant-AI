/**
 * lib/runtime/sandbox/smoke-stress.ts — running a generated sweep.
 *
 * Split from `smoke.ts` so that file stays a pure scenario generator with no
 * dependency on the runner, which `stress.ts` also imports. Two modules
 * importing each other through the runner is the shape that turns a small
 * circular import into a module that is `undefined` at call time.
 */

import type { ApprovedPlan } from "../../plan/types";
import { runScenario } from "./runner";
import type { SandboxDeps } from "./runner";
import type { StressCaseResult, StressResult } from "./types";
import { stressScenariosForPlan } from "./smoke";

/**
 * Runs the generated sweep for a plan and reports it in the same shape the
 * authored sweep uses, so `runSuite` cannot tell them apart and the verdict
 * treats both as real evidence.
 *
 * A plan with nothing to sweep — every agent read-only, or no enabled workflow
 * with an action — returns zero cases and a pass rate of 100. That is honest
 * rather than convenient: there is no boundary, so there is nothing that could
 * have failed. `runSuite` still refuses a NULL sweep, which is the case that
 * matters (the caller never ran one).
 */
export async function runGeneratedStress(
  plan: ApprovedPlan,
  deps: SandboxDeps = {},
): Promise<StressResult> {
  const scenarios = stressScenariosForPlan(plan);
  const cases: StressCaseResult[] = [];

  for (const scenario of scenarios) {
    const result = await runScenario(scenario, plan, deps);
    cases.push({
      caseId: scenario.id,
      label: scenario.name,
      passed: result.passed,
      detail: result.passed
        ? `behaved as expected (${result.finalStatus})`
        : result.failures.join("; "),
    });
  }

  const passed = cases.filter((c) => c.passed).length;
  return {
    total: cases.length,
    passed,
    passRate: cases.length === 0 ? 100 : Math.round((passed / cases.length) * 100),
    cases,
  };
}
