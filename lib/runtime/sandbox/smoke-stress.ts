/**
 * lib/runtime/sandbox/smoke-stress.ts — running a generated sweep.
 *
 * Split from `smoke.ts` so that file stays a pure scenario generator with no
 * dependency on the runner, which `stress.ts` also imports. Two modules
 * importing each other through the runner is the shape that turns a small
 * circular import into a module that is `undefined` at call time.
 *
 * The sweep has two halves and they are executed differently, which is the whole
 * reason this file is longer than a loop:
 *
 *   scenarios   run end to end through the real executor, every dependency
 *               pinned, exactly like an authored case.
 *   run gates   evaluated against `resolveRunStart` — the function the SCHEDULER
 *               calls before it starts anything. The executor never consults
 *               quiet hours or the daily cap, so a scenario cannot reach them;
 *               `startRun` would run at 3am and the case would pass without
 *               having tested a thing. Both halves land in the same
 *               `StressResult`, because both are evidence about the same plan
 *               and Activation gates on the total.
 *
 * A THIRD KIND OF ROW LANDS THERE TOO, and it is not a run: one per case the
 * generator's ceilings refused to emit. `coverageCases` explains why the
 * shortfall is reported through `StressResult.cases` rather than a field of its
 * own, and why a sweep that dropped cases must not be able to open the gate.
 */

import type { ApprovedPlan } from "../../plan/types";
import { resolveRunStart } from "../policy";
import { runScenario } from "./runner";
import type { SandboxDeps } from "./runner";
import type { StressCaseResult, StressResult } from "./types";
import { stressSweepFor } from "./smoke";
import type { GeneratedSweep, RunGateCase, SweepOmission } from "./smoke";

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
 *
 * WHAT THE CEILINGS REFUSED IS REPORTED AS A CASE, NOT LOGGED AND FORGOTTEN.
 * This used to be a `console.warn` and nothing else, which meant a sweep that
 * walked 40 of the 300 cases a plan implies came back in the same shape as one
 * that walked all 300 and opened the same activation gate. `coverageCases`
 * below turns every shortfall into a `StressCaseResult`, which is the only
 * channel that reaches all three places a person actually looks — see its
 * header for why it is that channel and what it costs.
 */
export async function runGeneratedStress(
  plan: ApprovedPlan,
  deps: SandboxDeps = {},
): Promise<StressResult> {
  const sweep = stressSweepFor(plan);
  const cases: StressCaseResult[] = [];

  for (const scenario of sweep.scenarios) {
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

  for (const gate of sweep.runGates) {
    cases.push(runGateResult(gate, plan));
  }

  // Appended last so the evidence reads before the accounting of what is
  // missing from it, and in the sweep's own generation order, which is plan
  // order — the ids have to repeat across runs or `verdictFingerprint` stops
  // agreeing with itself and M3's determinism criterion fails.
  cases.push(...coverageCases(sweep));

  if (sweep.dropped.length > 0) {
    console.warn(
      `[sandbox] generated sweep for plan ${plan.planId} walked ${sweep.emittedCases} of the ` +
        `${sweep.impliedCases} case(s) it implies; ${sweep.dropped.length} omission(s): ` +
        sweep.dropped.map((omission) => omission.detail).join(" | "),
    );
  }

  const passed = cases.filter((c) => c.passed).length;
  return {
    total: cases.length,
    passed,
    passRate: cases.length === 0 ? 100 : Math.round((passed / cases.length) * 100),
    cases,
  };
}

/**
 * THE SHORTFALL, AS CASES A HUMAN READS AT THE POINT OF DECIDING.
 *
 * WHY `cases` AND NOT A NEW FIELD. `StressResult` is `{ total, passed, passRate,
 * cases }` and lives in sandbox/types.ts. A `dropped` field there would be the
 * obvious home and would reach nobody: `runSuite` derives its blockers from
 * `passed`/`total`, `schedule/activation.ts` re-derives the activation
 * checklist from the same two numbers, `verdictFingerprint` digests
 * `cases.map(c => [c.caseId, c.passed])`, and POST /api/runtime/sandbox
 * serialises `{ total, passed, passRate }` only. A new field would have to be
 * threaded through five modules before one person saw it, and until the last of
 * them landed the gate would still open. `cases` is the ONE structure every one
 * of those already reads. Putting the shortfall there makes it arrive at all
 * three surfaces in the same edit that creates it.
 *
 * WHAT THAT COSTS, stated rather than hidden: these rows are not runs. They
 * inflate `total` and they drag `passRate` down, so a plan with 20 real cases
 * and 2 shortfalls reports 22. That is the honest direction — the alternative is
 * a rate computed over a denominator the sweep chose for itself — but it does
 * mean `passRate` is "of everything this sweep has to say", not "of the runs".
 * The ids are prefixed `coverage-` so a caller that wants only runs can tell
 * them apart, and every detail opens by saying it is not a guardrail failure,
 * because the blocker line `activation.ts` writes for a red stress case says
 * "a failure there is a guardrail that does not hold" — true of the runs, wrong
 * about these, and that file is not this change's to edit.
 *
 * SHOULD A TRUNCATED SWEEP BE ABLE TO SATISFY THE GATE AT ALL? No, and the
 * argument is not "fail closed" on its own:
 *
 *   IT IS NOT A SIZE PENALTY. The ceilings are per workflow and per agent, so a
 *   hundred-agent plan with ordinary policies drops nothing. A ceiling bites
 *   only when one agent declares more guardrails than the sandbox walks, and
 *   then the cases it refused ARE that agent's unproven boundaries. There is no
 *   class of legitimate plan this permanently walls off — only plans carrying
 *   guardrails nobody crossed.
 *
 *   THE TRIM IS NOT A SAMPLE. `capped` keeps the first N in generation order,
 *   and the boundary ladder is generated per limit after every limit's
 *   fail-closed case. So the limits at the end of the array get no boundary walk
 *   whatsoever. "We proved 13% of it" would still be describing the wrong thing:
 *   some guardrails were proved fully and others not at all.
 *
 *   A THRESHOLD WOULD BE A NUMBER NOBODY COULD DEFEND. Any "80% is enough" line
 *   is this file deciding, on the operator's behalf, which of their declared
 *   guardrails do not need proving — and it would be read as the sandbox
 *   endorsing the remainder.
 *
 * REJECTED, EXPLICITLY: an environment variable or a `deps` flag to accept a
 * truncated sweep. A switch that opens an activation gate on cover the sweep
 * admits it does not have is the audited defect with a toggle bolted to it. The
 * ceilings are constants in smoke.ts; raising one is a code change that leaves a
 * diff and a reason, which is where a decision like that belongs.
 */
function coverageCases(sweep: GeneratedSweep): StressCaseResult[] {
  const lost = sweep.dropped.filter((omission) => omission.reducesCover);
  if (lost.length === 0) return [];

  const percent =
    sweep.impliedCases === 0 ? 100 : Math.round((sweep.emittedCases / sweep.impliedCases) * 100);

  return [
    {
      caseId: "coverage-shortfall",
      label: "Sweep coverage",
      // The line that closes the gate. Everything below it explains this.
      passed: false,
      detail:
        `NOT A GUARDRAIL FAILURE — MISSING EVIDENCE. This sweep walked ${sweep.emittedCases} of ` +
        `the ${sweep.impliedCases} case(s) this plan implies (${percent}%), across ` +
        `${lost.length} scope(s) listed below. The boundaries in the remainder were never ` +
        `crossed, so this verdict is not evidence about them and must not be read as one.`,
    },
    ...lost.map(coverageCase),
  ];
}

/** One shortfall, with the scope in the id so the fingerprint stays stable. */
function coverageCase(omission: SweepOmission): StressCaseResult {
  return {
    caseId: `coverage-${omission.kind}-${omission.scope}`,
    label: `Coverage: ${omission.scope}`,
    passed: false,
    detail: `NOT A GUARDRAIL FAILURE — MISSING EVIDENCE. ${omission.detail}`,
  };
}

/**
 * One run-start case, judged.
 *
 * `unprovable` fails. It means the plan declared a window nothing can enforce —
 * a timezone this runtime cannot resolve, a time that is not HH:MM, or quiet
 * hours covering every minute of the day — and the runtime's own answer to all
 * three is to quietly decide the agent is never quiet. An unenforceable
 * guardrail reported as absent evidence would let exactly that through the gate,
 * so it is reported as a failure with the reason named.
 */
function runGateResult(gate: RunGateCase, plan: ApprovedPlan): StressCaseResult {
  if (gate.kind === "unprovable") {
    return { caseId: gate.id, label: gate.label, passed: false, detail: gate.reason };
  }

  const agent = plan.agents.find((candidate) => candidate.id === gate.agentId);
  if (!agent) {
    // Unreachable: the case was generated from this plan's own agents. Reported
    // rather than thrown, because a generator bug must not take the verdict down
    // with it — and must not read as a pass either.
    return {
      caseId: gate.id,
      label: gate.label,
      passed: false,
      detail: `Agent "${gate.agentId}" is not in the plan the sweep was generated from.`,
    };
  }

  const decision = resolveRunStart({
    at: new Date(gate.at),
    policy: agent.policy,
    globalQuietHours: plan.globalPolicy.quietHours,
    runsToday: gate.runsToday,
  });
  const actual = decision.action === "allow" ? "allow" : "refuse";

  return {
    caseId: gate.id,
    label: gate.label,
    passed: actual === gate.expect,
    detail:
      actual === gate.expect
        ? `${gate.at}: ${decision.reason}`
        : `expected the run-start gate to ${gate.expect} at ${gate.at} but it answered ` +
          `"${decision.action}" (${decision.reason})`,
  };
}
