"use client";
/**
 * /app/integrations — Tools, integrations and MCP connections (spec §12).
 * Plan-phase flavour: guided, plain-language, plan-first. The body is shared
 * with the workspace variant.
 */
import { Suspense } from "react";
import IntegrationsBody from "@/components/mock/integrations/IntegrationsBody";

export default function IntegrationsPage() {
  return (
    <main className="oa-page">
      <header className="oa-between" style={{ marginBottom: 24, alignItems: "flex-start" }}>
        <div style={{ display: "grid", gap: 6, maxWidth: 760 }}>
          <p className="oa-eyebrow">Plan · Integrations</p>
          <h1 className="oa-h1">Tools and connections</h1>
          <p className="oa-lead">
            Connect the systems your plan relies on. Every card shows what agents can read, what
            they may request, and what always waits for your approval.
          </p>
        </div>
      </header>
      {/* IntegrationsBody reads ?tool=&status=callback via useSearchParams
          (the Composio OAuth return trip) — needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <IntegrationsBody />
      </Suspense>
    </main>
  );
}
