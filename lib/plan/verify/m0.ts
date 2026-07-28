/**
 * lib/plan/verify/m0.ts — the M0 exit criteria, as an executable check.
 *
 * ROLE_C_PLAN M0 exits when `validateApprovedPlan(fixture)` returns no errors,
 * which is the moment Role C has a trustworthy input and can start M1.
 *
 * A validator that passes everything is worthless, so this also drives every
 * deliberately-broken plan through it and asserts the intended rule fires.
 * That second half is what makes the validator meaningful as the handoff gate
 * with Role D.
 *
 * Three properties of that second half are asserted rather than assumed, and
 * each one used to be left to the fixture author's care:
 *
 *   SEVERITY. Contract §6 assigns every rule an error or a warning, and errors
 *   block the handoff while warnings do not — that column is the whole
 *   difference between a plan that ships and one that does not. Asserting only
 *   that a rule fired would let rule 13 be silently downgraded to a warning
 *   with all checks still green.
 *
 *   ISOLATION. A fixture that trips five rules "catches" its own rule for the
 *   wrong reason, and would keep passing after the rule it names is deleted.
 *   Each case must therefore report its rule and nothing else.
 *
 *   COVERAGE. The per-case checks are generated from INVALID_PLANS, so the
 *   fixture table is the only thing deciding how many rules are tested. Shrink
 *   it and the harness cheerfully reports a smaller green number. M0-7 pins the
 *   rule set instead of the check count.
 *
 * Run it with: npm run verify:m0
 */

import { validateApprovedPlan } from "../validate";
import { BRIGHTPATH_PLAN } from "../fixtures/brightpath";
import { INVALID_PLANS, VALID_BASE_PLAN } from "../fixtures/invalid-plans";

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

/**
 * The severity column of PLAN_CONTRACT.md §6, plus rule 0.
 *
 * Rule 0 is Role C's own structural pass and has no row in the contract's
 * sixteen: it reports a plan that cannot be read at all, which is a blocking
 * error by nature — every rule below it is a loop over a collection and would
 * pass vacuously on a truncated hand-off.
 *
 * Kept here rather than on the fixtures because it is a statement about the
 * CONTRACT, not about any one broken plan: this table and §6 must agree, and a
 * reviewer comparing them should not have to read a fixture file to do it.
 * Doubling as the rule inventory is why M0-7 can check coverage from it.
 */
const CONTRACT_SEVERITY: Record<number, "error" | "warning"> = {
  0: "error",
  1: "error",
  2: "error",
  3: "error",
  4: "error",
  5: "error",
  6: "error",
  7: "error",
  8: "error",
  9: "error",
  10: "error",
  11: "warning",
  12: "warning",
  13: "error",
  14: "error",
  15: "warning",
  16: "warning",
};

export function runM0Verification(): Check[] {
  const checks: Check[] = [];

  /* 1. The canonical fixture must be completely clean — errors AND warnings.
        A warning here would mean the demo plan itself models bad practice. */
  const findings = validateApprovedPlan(BRIGHTPATH_PLAN);
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");

  checks.push({
    name: "M0-1 BrightPath plan has no validation errors",
    pass: errors.length === 0,
    detail:
      errors.length === 0
        ? "0 errors"
        : errors.map((e) => `rule ${e.rule} ${e.agentId ?? ""} ${e.message}`).join(" | "),
  });

  checks.push({
    name: "M0-2 BrightPath plan has no validation warnings",
    pass: warnings.length === 0,
    detail:
      warnings.length === 0
        ? "0 warnings"
        : warnings.map((w) => `rule ${w.rule} ${w.agentId ?? ""} ${w.message}`).join(" | "),
  });

  /* 2. Structural expectations the rest of Role C depends on. */
  const modes = BRIGHTPATH_PLAN.agents.map((a) => a.policy.operatingMode);
  checks.push({
    name: "M0-3 fixture covers every operating mode",
    pass:
      modes.includes("draft_only") &&
      modes.includes("act_after_approval") &&
      modes.includes("auto_within_limits"),
    detail: modes.join(", "),
  });

  const everyAgentAttached = BRIGHTPATH_PLAN.agents.every((a) =>
    BRIGHTPATH_PLAN.businessOutcomes.some((o) => o.agentIds.includes(a.id)),
  );
  checks.push({
    name: "M0-4 every agent serves a business outcome",
    pass: everyAgentAttached,
    detail: `${BRIGHTPATH_PLAN.agents.length} agents, ${BRIGHTPATH_PLAN.businessOutcomes.length} outcomes`,
  });

  const measurable = BRIGHTPATH_PLAN.businessOutcomes.every((o) =>
    o.metrics.every((m) => typeof m.target === "number" && m.unit.length > 0),
  );
  checks.push({
    name: "M0-5 every outcome metric is measurable",
    pass: measurable,
    detail: BRIGHTPATH_PLAN.businessOutcomes
      .map((o) => `${o.id}:${o.metrics.length}`)
      .join(", "),
  });

  /* 3. The shared base every negative case is built from must itself be clean.
        Each case below changes exactly one thing about this plan, so if a new
        or widened rule ever fires on the base, all of them are measuring the
        wrong thing at once — and the isolation assertion in M0-8 would report
        twenty failures without naming the cause. This check names it. */
  const baseFindings = validateApprovedPlan(VALID_BASE_PLAN);
  checks.push({
    name: "M0-6 the negative-test base plan is itself clean",
    pass: baseFindings.length === 0,
    detail:
      baseFindings.length === 0
        ? "0 findings"
        : baseFindings.map((f) => `${f.severity} rule ${f.rule}: ${f.message}`).join(" | "),
  });

  /* 4. Every rule the contract defines needs a plan that trips it. Without
        this, coverage is implied by INVALID_PLANS.length and asserted by
        nothing: drop entries and M0 reports a smaller number of passing
        checks, which reads exactly like a green run. */
  const inventory = Object.keys(CONTRACT_SEVERITY).map(Number);
  const covered = new Set(INVALID_PLANS.map((c) => c.expectedRule));
  const uncovered = inventory.filter((rule) => !covered.has(rule));
  const unknownRules = [...covered].filter((rule) => CONTRACT_SEVERITY[rule] === undefined);
  checks.push({
    name: "M0-7 every validator rule has a negative test",
    pass: uncovered.length === 0 && unknownRules.length === 0,
    detail:
      uncovered.length === 0 && unknownRules.length === 0
        ? `all ${inventory.length} rules (0 plus contract §6's sixteen) covered by ${INVALID_PLANS.length} cases`
        : [
            uncovered.length > 0 ? `no negative test for rule ${uncovered.join(", ")}` : "",
            unknownRules.length > 0
              ? `case expects rule ${unknownRules.join(", ")}, which is not in the contract table above`
              : "",
          ]
            .filter(Boolean)
            .join("; "),
  });

  /* 5. Each broken plan must trip its intended rule, at the severity the
        contract assigns it, and trip nothing else. A validator that stays
        silent on a bad plan is worse than none: it launders the problem. */
  for (const testCase of INVALID_PLANS) {
    const expectedSeverity = CONTRACT_SEVERITY[testCase.expectedRule];
    const result = validateApprovedPlan(testCase.plan);
    // Filtered, not found: two findings for the expected rule means the case is
    // no longer the single-defect plan it claims to be, and `find` would hide
    // the second one.
    const hits = result.filter((f) => f.rule === testCase.expectedRule);
    const atExpectedSeverity = hits.filter((f) => f.severity === expectedSeverity);
    // Rule 0 legitimately reports an error and a warning for the empty plan, so
    // isolation is expressed as "no OTHER rule fired" rather than "exactly one
    // finding". That still fails the moment a case stops being about one thing.
    const strays = result.filter((f) => f.rule !== testCase.expectedRule);

    checks.push({
      name: `M0-8 rule ${testCase.expectedRule} (${expectedSeverity ?? "?"}) catches "${testCase.name}"`,
      pass:
        expectedSeverity !== undefined &&
        atExpectedSeverity.length === 1 &&
        strays.length === 0,
      detail:
        expectedSeverity === undefined
          ? `rule ${testCase.expectedRule} has no severity in the contract table; add it or fix the case`
          : hits.length === 0
            ? `NOT CAUGHT. Findings: ${result.map((f) => `${f.severity}/rule ${f.rule}`).join(", ") || "none"}`
            : atExpectedSeverity.length === 0
              ? `WRONG SEVERITY: got ${hits.map((f) => f.severity).join(", ")}, contract §6 says "${expectedSeverity}"`
              : atExpectedSeverity.length > 1
                ? `${atExpectedSeverity.length} ${expectedSeverity}s for rule ${testCase.expectedRule}; expected exactly 1`
                : strays.length > 0
                  ? `NOT ISOLATED: also tripped ${strays.map((f) => `${f.severity}/rule ${f.rule}`).join(", ")}. One defect per plan, or the case proves nothing about rule ${testCase.expectedRule}`
                  : `${expectedSeverity}: ${atExpectedSeverity[0]?.message ?? ""}`,
    });
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
    // An empty result set is not a pass. `[].filter(...).length === 0` is true,
    // so the obvious two-branch version prints "MET — 0/0 checks passed" for a
    // runner that asserted nothing at all.
    results.length === 0
      ? "M0 NOT MET — the runner produced no checks."
      : failed === 0
        ? `M0 EXIT CRITERIA MET — ${results.length}/${results.length} checks passed.`
        : `M0 NOT MET — ${failed} of ${results.length} checks failed.`,
  );
  return lines.join("\n");
}
