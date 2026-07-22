import type { Metadata } from "next";
import Link from "next/link";
import "../landing.css";

export const metadata: Metadata = {
  title: "Start Free Discovery — Oriant.ai",
  description:
    "Guided business discovery is where Oriant.ai learns how your business works. Early access is opening soon.",
};

/**
 * Presentation-layer placeholder for the guided discovery flow.
 * The real onboarding experience is intentionally out of scope for the
 * marketing landing page task (master brief §4).
 */
export default function OnboardingPage() {
  return (
    <div className="lp" style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <main className="lp-container" style={{ textAlign: "center", padding: "80px 24px", maxWidth: 640 }}>
        <p className="lp-eyebrow" style={{ justifyContent: "center" }}>
          Guided discovery
        </p>
        <h1 className="lp-h2" style={{ marginTop: 18 }}>
          Your discovery session is <span className="lp-serif lp-accent-text">almost&nbsp;ready</span>.
        </h1>
        <p className="lp-lead" style={{ marginTop: 20 }}>
          This is where Oriant.ai learns how your business works and drafts your
          first AI workforce plan. Early access onboarding is opening soon.
        </p>
        <div
          style={{
            display: "flex",
            gap: 14,
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: 36,
          }}
        >
          <Link href="/" className="lp-btn lp-btn--primary">
            Back to Oriant.ai
          </Link>
          <Link href="/demo" className="lp-btn lp-btn--ghost">
            Explore the interactive demo
          </Link>
        </div>
      </main>
    </div>
  );
}
