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
 * Run it with: npm run verify:m0
 */

import { validateApprovedPlan } from "../validate";
import { BRIGHTPATH_PLAN } from "../fixtures/brightpath";
import { INVALID_PLANS } from "../fixtures/invalid-plans";

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

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

  /* 3. Each broken plan must trip its intended rule. A validator that stays
        silent on a bad plan is worse than none: it launders the problem. */
  for (const testCase of INVALID_PLANS) {
    const result = validateApprovedPlan(testCase.plan);
    const hit = result.find((f) => f.rule === testCase.expectedRule);
    checks.push({
      name: `M0-6 rule ${testCase.expectedRule} catches "${testCase.name}"`,
      pass: Boolean(hit),
      detail: hit
        ? `${hit.severity}: ${hit.message}`
        : `NOT CAUGHT. Findings: ${result.map((f) => f.rule).join(",") || "none"}`,
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
    failed === 0
      ? `M0 EXIT CRITERIA MET — ${results.length}/${results.length} checks passed.`
      : `M0 NOT MET — ${failed} of ${results.length} checks failed.`,
  );
  return lines.join("\n");
}
