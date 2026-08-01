/**
 * One-off smoke test for lib/server/planner/db.ts. NOT part of the app —
 * nothing imports this file. Run with:
 *   npx dotenv -e .env.local -- npx tsx scripts/verify-step1.ts
 */

import {
  getOrganization,
  getOnboardingSession,
  getRoleBHandoff,
  getApprovedCompanyReport,
} from "../lib/server/planner/db";

const SESSION_ID = "6648850b-a9d7-42ca-928a-613e71e37a41";

async function main() {
  const summary: Record<string, unknown> = {};
  let organizationId: string | undefined;

  try {
    const session = await getOnboardingSession(SESSION_ID);
    if (session) {
      organizationId = session.organization_id;
      summary.onboardingSession = {
        ok: true,
        status: session.status,
        organization_id: session.organization_id,
      };
    } else {
      summary.onboardingSession = { ok: false, reason: "not found" };
    }
  } catch (err) {
    summary.onboardingSession = { ok: false, error: String(err) };
  }

  let companyName: string | undefined;
  if (organizationId) {
    try {
      const org = await getOrganization(organizationId);
      companyName = org?.name;
      summary.organization = org ? { ok: true, name: org.name } : { ok: false, reason: "not found" };
    } catch (err) {
      summary.organization = { ok: false, error: String(err) };
    }
  } else {
    summary.organization = { ok: false, reason: "skipped: no organization_id from session" };
  }

  try {
    const handoff = await getRoleBHandoff(SESSION_ID);
    if (handoff) {
      // payload is typed `unknown` (see types.ts) since its real shape
      // varies by how the row was produced; narrow defensively here.
      const payload = handoff.payload as { workflow?: { name?: string } } | null;
      summary.roleBHandoff = {
        ok: true,
        status: handoff.status,
        workflowName: payload?.workflow?.name ?? null,
      };
    } else {
      summary.roleBHandoff = { ok: false, reason: "not found" };
    }
  } catch (err) {
    summary.roleBHandoff = { ok: false, error: String(err) };
  }

  try {
    const report = await getApprovedCompanyReport(SESSION_ID);
    summary.approvedCompanyReport = report
      ? { ok: true, status: report.status, version: report.version }
      : { ok: false, reason: "not found" };
  } catch (err) {
    summary.approvedCompanyReport = { ok: false, error: String(err) };
  }

  console.log(JSON.stringify({ companyName, ...summary }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
