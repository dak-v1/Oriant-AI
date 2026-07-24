/**
 * LandingFooter — dark footer + contact anchor (redesign brief §20).
 * The page's calm full stop after the dark FinalCTA: a hairline top border
 * separates the two #111827 surfaces. Three-zone grid (brand / link columns /
 * contact block), then a © row with a "Back to top" link. No motion beyond
 * link hover colour shifts, so this stays a server component (no hooks).
 * The footer itself carries id="contact"; the grid uses named areas so the
 * contact block sits in the footer's first viewport at every breakpoint
 * (on mobile it moves above the link columns).
 */
import Link from "next/link";
import { ArrowUp } from "lucide-react";
import { CTA, FOOTER } from "@/lib/landing-content";
import BrandLogo from "@/components/brand/BrandLogo";
import styles from "./LandingFooter.module.css";

type FooterLink = { readonly label: string; readonly href: string };

/** Route links get next/link; in-page anchors stay plain <a>. */
function FooterAnchor({
  link,
  className,
}: {
  link: FooterLink;
  className: string;
}) {
  if (link.href.startsWith("#")) {
    return (
      <a href={link.href} className={className}>
        {link.label}
      </a>
    );
  }
  return (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  );
}

export default function LandingFooter() {
  return (
    <footer id="contact" className={`lp-dark ${styles.footer}`}>
      <div className="lp-container">
        <div className={styles.grid}>
          {/* ── Zone 1: brand ── */}
          <div className={styles.brand}>
            <BrandLogo variant="lockup" tone="light" size={28} className={styles.wordmark} />
            <p className={styles.descriptor}>{FOOTER.descriptor}</p>
          </div>

          {/* ── Zone 2: link columns ── */}
          <nav className={styles.cols} aria-label="Footer">
            <div className={styles.col}>
              <h2 className={`lp-micro ${styles.colHead}`}>Product</h2>
              <ul className={styles.colList}>
                {FOOTER.productLinks.map((link) => (
                  <li key={link.href}>
                    <FooterAnchor link={link} className={styles.link} />
                  </li>
                ))}
              </ul>
            </div>
            <div className={styles.col}>
              <h2 className={`lp-micro ${styles.colHead}`}>Company</h2>
              <ul className={styles.colList}>
                {FOOTER.companyLinks.map((link) => (
                  <li key={link.href}>
                    <FooterAnchor link={link} className={styles.link} />
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          {/* ── Zone 3: contact block (the #contact destination) ── */}
          <div className={styles.contact}>
            <h2 className={`lp-micro ${styles.colHead}`}>Contact</h2>
            <p className={styles.contactNote}>{FOOTER.contactNote}</p>
            <Link
              href={CTA.primary.href}
              className="lp-btn lp-btn--primary lp-btn--sm"
            >
              {CTA.primary.label}
            </Link>
          </div>
        </div>

        {/* ── Bottom row (incl. the single subtle sponsor note, spec §3.4) ── */}
        <div className={styles.bottom}>
          <p className={styles.copyright}>© 2026 Oriant.ai</p>
          <p className={styles.attribution}>{FOOTER.attribution}</p>
          <a href="#top" className={styles.toTop}>
            Back to top
            <ArrowUp size={14} strokeWidth={2} aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  );
}
