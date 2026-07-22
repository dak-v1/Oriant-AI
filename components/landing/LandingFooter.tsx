/**
 * LandingFooter — footer + contact anchor (master brief §7.11, lower half).
 * Static, server-rendered: no hooks or motion beyond CSS link hovers.
 */
import Link from "next/link";
import { ArrowUp } from "lucide-react";
import { CTA, FOOTER, NAV_LINKS } from "@/lib/landing-content";
import styles from "./LandingFooter.module.css";

type FooterLink = { label: string; href: string };

const EXPLORE_LINKS: FooterLink[] = FOOTER.links.filter((link) =>
  NAV_LINKS.some((nav) => nav.href === link.href),
);

const COMPANY_LINKS: FooterLink[] = FOOTER.links.filter(
  (link) => !NAV_LINKS.some((nav) => nav.href === link.href),
);

function FooterNavLink({ label, href }: FooterLink) {
  if (href.startsWith("#")) {
    return (
      <a href={href} className={styles.link}>
        {label}
      </a>
    );
  }
  return (
    <Link href={href} className={styles.link}>
      {label}
    </Link>
  );
}

function LinkColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div className={styles.linkCol}>
      <p className={`lp-micro ${styles.colHead}`}>{title}</p>
      <ul className={styles.linkList}>
        {links.map((link) => (
          <li key={link.href}>
            <FooterNavLink label={link.label} href={link.href} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function LandingFooter() {
  return (
    <footer id="contact" className={styles.footer}>
      <div className="lp-container">
        <div className={styles.grid}>
          <div className={styles.brand}>
            <p className={styles.wordmark}>
              Oriant<span className={styles.wordmarkAccent}>.ai</span>
            </p>
            <p className={styles.descriptor}>{FOOTER.descriptor}</p>
          </div>

          <nav className={styles.linkColumns} aria-label="Footer">
            <LinkColumn title="Explore" links={EXPLORE_LINKS} />
            <LinkColumn title="Company" links={COMPANY_LINKS} />
          </nav>

          <div className={styles.contact}>
            <p className={`lp-micro ${styles.colHead}`}>Contact</p>
            <p className={styles.contactNote}>{FOOTER.contactNote}</p>
            <Link
              href={CTA.primary.href}
              className="lp-btn lp-btn--primary lp-btn--sm"
            >
              {CTA.primary.label}
            </Link>
          </div>
        </div>

        <div className={styles.bottomRow}>
          <p className={styles.copyright}>&copy; 2026 Oriant.ai</p>
          <a href="#top" className={styles.backToTop}>
            Back to top
            <ArrowUp size={14} strokeWidth={2} aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  );
}
