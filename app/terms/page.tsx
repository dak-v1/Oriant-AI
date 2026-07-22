import type { Metadata } from "next";
import Link from "next/link";
import "../landing.css";

export const metadata: Metadata = {
  title: "Terms — Oriant.ai",
  description:
    "The Oriant.ai terms of service will be published here before launch.",
};

/**
 * Holding page for the terms of service. The actual legal text is intentionally
 * out of scope for the marketing landing page task — no terms are fabricated
 * here.
 */
export default function TermsPage() {
  return (
    <div className="lp" style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <main className="lp-container" style={{ textAlign: "center", padding: "80px 24px", maxWidth: 640 }}>
        <p className="lp-eyebrow" style={{ justifyContent: "center" }}>
          Terms
        </p>
        <h1 className="lp-h2" style={{ marginTop: 18 }}>
          Terms of service <span className="lp-serif lp-accent-text">coming&nbsp;soon</span>.
        </h1>
        <p className="lp-lead" style={{ marginTop: 20 }}>
          The terms of service will be published here before launch.
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
          <Link href="/privacy" className="lp-btn lp-btn--ghost">
            Privacy policy
          </Link>
        </div>
      </main>
    </div>
  );
}
