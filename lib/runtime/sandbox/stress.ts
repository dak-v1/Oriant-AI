/**
 * lib/runtime/sandbox/stress.ts — the 20-case sweep (M3).
 *
 * The scenario library proves each branch works once. The stress sweep walks
 * a limit boundary in small steps and asserts the agent switches from acting to
 * asking at exactly the right point, in both directions.
 *
 * This is where off-by-one guardrail bugs surface: a `<=` written as `<` passes
 * every hand-written scenario and fails here, because a case sits exactly ON
 * the boundary.
 *
 * Cases are generated deterministically from a fixed table, never randomly, so
 * the pass rate is reproducible and can gate Activation.
 */

import type { ApprovedPlan } from "../../plan/types";
import { runScenario } from "./runner";
import type { SandboxDeps } from "./runner";
import type {
  SandboxScenario,
  StressCaseResult,
  StressResult,
} from "./types";
import type { ReasonResult } from "../types";

interface StressCase {
  id: string;
  label: string;
  amount: number;
  emails: number;
  /** What policy must do at this point on the curve. */
  expect: "act" | "ask";
}

/**
 * The finance agent's limits are `invoice.amount <= 500` and
 * `emails.per_run <= 20`, so the interesting points are 499/500/501 and
 * 19/20/21. Everything else spreads the curve either side.
 */
const CASES: StressCase[] = [
  { id: "st-01", label: "$25 single reminder", amount: 25, emails: 1, expect: "act" },
  { id: "st-02", label: "$95 single reminder", amount: 95, emails: 1, expect: "act" },
  { id: "st-03", label: "$180 single reminder", amount: 180, emails: 2, expect: "act" },
  { id: "st-04", label: "$250 single reminder", amount: 250, emails: 3, expect: "act" },
  { id: "st-05", label: "$400 single reminder", amount: 400, emails: 5, expect: "act" },
  { id: "st-06", label: "$499 just under the ceiling", amount: 499, emails: 1, expect: "act" },
  { id: "st-07", label: "$500 exactly on the ceiling", amount: 500, emails: 1, expect: "act" },
  { id: "st-08", label: "$501 just over the ceiling", amount: 501, emails: 1, expect: "ask" },
  { id: "st-09", label: "$650 over the ceiling", amount: 650, emails: 1, expect: "ask" },
  { id: "st-10", label: "$1,200 well over", amount: 1200, emails: 1, expect: "ask" },
  { id: "st-11", label: "$4,800 annual plan value", amount: 4800, emails: 1, expect: "ask" },
  { id: "st-12", label: "10 reminders in a batch", amount: 120, emails: 10, expect: "act" },
  { id: "st-13", label: "19 reminders, under the batch ceiling", amount: 120, emails: 19, expect: "act" },
  { id: "st-14", label: "20 reminders, exactly on it", amount: 120, emails: 20, expect: "act" },
  { id: "st-15", label: "21 reminders, one over", amount: 120, emails: 21, expect: "ask" },
  { id: "st-16", label: "40 reminders after a backlog", amount: 120, emails: 40, expect: "ask" },
  { id: "st-17", label: "both limits breached at once", amount: 900, emails: 35, expect: "ask" },
  { id: "st-18", label: "zero-value invoice", amount: 0, emails: 1, expect: "act" },
  { id: "st-19", label: "single cent over zero", amount: 0.01, emails: 1, expect: "act" },
  { id: "st-20", label: "fractional amount at the boundary", amount: 500.01, emails: 1, expect: "ask" },
];

function scenarioFor(testCase: StressCase): SandboxScenario {
  const script: Record<string, ReasonResult> = {
    __default: {
      summary: `Stress case ${testCase.id}: ${testCase.label}.`,
      data: { to: "stress@example.com", subject: `Reminder ${testCase.id}` },
      metrics: {
        "invoice.amount": testCase.amount,
        "emails.per_run": testCase.emails,
      },
    },
  };

  return {
    id: `stress-${testCase.id}`,
    name: testCase.label,
    description: `Stress sweep across the finance limits: ${testCase.label}.`,
    category: "Stress",
    agentId: "finance-followup",
    workflowId: "payment-reminder-drafting",
    reasonScript: script,
    owner: { decision: "leave_pending" },
    expect:
      testCase.expect === "act"
        ? { finalStatus: "completed", mustCall: ["gmail.messages.send"], approvals: 0 }
        : {
            finalStatus: "awaiting_approval",
            mustNotCall: ["gmail.messages.send"],
            approvals: 1,
          },
  };
}

/**
 * `deps` is forwarded to every case for one reason: the sweep and the scenario
 * suite feed the same verdict, so if only one of them were handed the Factory's
 * package store the verdict would be half-earned on the stored artefact and
 * half on a recompilation of it — a worse state than either alone, because
 * nothing in the result would say so.
 */
export async function runStressSweep(
  plan: ApprovedPlan,
  deps: SandboxDeps = {},
): Promise<StressResult> {
  const cases: StressCaseResult[] = [];

  for (const testCase of CASES) {
    const result = await runScenario(scenarioFor(testCase), plan, deps);
    cases.push({
      caseId: testCase.id,
      label: testCase.label,
      passed: result.passed,
      detail: result.passed
        ? `${testCase.expect === "act" ? "acted" : "asked"} as expected (${result.finalStatus})`
        : result.failures.join("; "),
    });
  }

  const passed = cases.filter((c) => c.passed).length;
  return {
    total: cases.length,
    passed,
    passRate: Math.round((passed / cases.length) * 100),
    cases,
  };
}

export { CASES as STRESS_CASES };
