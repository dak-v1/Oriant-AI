"use client";

import ReportExperience from "@/components/mock/report/ReportExperience";
import { DEMO_COMPANY } from "@/lib/mock/fixtures/demo-company";

export default function CompanyReportPage() {
  return (
    <main className="oa-page">
      <header className="oa-between" style={{ marginBottom: 24 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <p className="oa-eyebrow">Discovery · Approval Gate 1</p>
          <h1 className="oa-h1">Company report</h1>
          <p className="oa-lead">
            Review what Oriant learned about {DEMO_COMPANY.name}, correct anything, then approve the
            report that drives your workforce plan.
          </p>
        </div>
      </header>

      <ReportExperience />
    </main>
  );
}
