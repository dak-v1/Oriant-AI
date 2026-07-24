"use client";
/**
 * /app/discovery/report — Company report + Human Approval Gate 1 (spec §10,
 * improvement spec §11). A premium editable document: Contents + Completeness
 * left, the report with fact-level review rows centre, evidence right, and an
 * approval bar in normal flow at the end of the report (single primary action).
 */
import ReportExperience from "@/components/mock/report/ReportExperience";

export default function CompanyReportPage() {
  return (
    <main className="oa-page">
      <header className="oa-between" style={{ marginBottom: 24 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <p className="oa-eyebrow">Discovery · Approval Gate 1</p>
          <h1 className="oa-h1">Company report</h1>
          <p className="oa-lead">
            Review what Oriant learned about your business, correct anything, then approve the
            report that drives your workforce plan.
          </p>
        </div>
      </header>

      <ReportExperience />
    </main>
  );
}
