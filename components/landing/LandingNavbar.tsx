"use client";
/**
 * LandingNavbar — the global morphing navigation capsule (master brief §6).
 *
 * A fixed, centred floating pill with three scroll-keyed states:
 *  - default:  wordmark · five NAV_LINKS · primary CTA
 *  - compact:  after ~120px scroll — tighter padding/gap, stronger blur+shadow
 *  - end:      desktop only, scroll progress ≥ 75% — centre links collapse
 *              away and a Contact link takes their place
 * Mobile (<1024px) swaps the centre links for a Menu button that opens a
 * card panel below the capsule. The primary CTA is never hidden.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { CTA, NAV_LINKS } from "@/lib/landing-content";
import { LP_EASE } from "./SectionReveal";
import styles from "./LandingNavbar.module.css";

const COMPACT_SCROLL_PX = 120;
const END_STATE_PROGRESS = 0.75;
const MOBILE_MENU_ID = "lp-mobile-menu";

export default function LandingNavbar() {
  const reduced = useReducedMotion();
  const [compact, setCompact] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const wordmarkRef = useRef<HTMLAnchorElement>(null);
  const navLinksRef = useRef<HTMLElement>(null);
  const contactRef = useRef<HTMLAnchorElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const ticking = useRef(false);

  /* Latest-value mirror so the media-query listener can read menu state
     without re-subscribing. */
  const menuOpenRef = useRef(menuOpen);
  menuOpenRef.current = menuOpen;

  /* One rAF-throttled scroll/resize listener drives both thresholds. */
  useEffect(() => {
    const measure = () => {
      ticking.current = false;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setCompact(y > COMPACT_SCROLL_PX);
      setAtEnd(max > 0 && y / max >= END_STATE_PROGRESS);
    };
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  /* Gate the end-state morph to desktop; close the panel if we leave mobile.
     The panel and menu button are display:none on desktop, so if focus is in
     either when the viewport crosses 1024px it would silently drop to <body>
     — rescue it onto the always-visible wordmark first. */
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      setIsDesktop(mq.matches);
      if (!mq.matches) return;
      if (menuOpenRef.current) {
        const active = document.activeElement;
        if (
          (panelRef.current && active && panelRef.current.contains(active)) ||
          active === menuBtnRef.current
        ) {
          wordmarkRef.current?.focus({ preventScroll: true });
        }
      }
      setMenuOpen(false);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  /* Escape closes the mobile menu and returns focus to the toggle. */
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuBtnRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const showEndState = isDesktop && atEnd;

  /* When the end-state morph swaps the centre links for the Contact link (or
     back), AnimatePresence unmounts the outgoing element after its exit
     animation — keyboard focus inside it would silently drop to <body>.
     The exiting element is still mounted when this effect runs, so the
     containment check is reliable; rescue focus onto the always-mounted
     wordmark. preventScroll avoids fighting the in-progress scroll. */
  const prevShowEndState = useRef(showEndState);
  useEffect(() => {
    if (prevShowEndState.current === showEndState) return;
    prevShowEndState.current = showEndState;
    const outgoing = showEndState ? navLinksRef.current : contactRef.current;
    const active = document.activeElement;
    if (outgoing && active && outgoing.contains(active)) {
      wordmarkRef.current?.focus({ preventScroll: true });
    }
  }, [showEndState]);

  const morph = reduced
    ? { duration: 0 }
    : { duration: 0.35, ease: LP_EASE };

  return (
    <header className={styles.wrap}>
      <motion.div
        layout={!reduced}
        className={`${styles.capsule} ${compact ? styles.capsuleCompact : ""}`}
        animate={{
          paddingTop: compact ? 8 : 12,
          paddingBottom: compact ? 8 : 12,
          columnGap: compact ? 16 : 24,
        }}
        transition={morph}
      >
        <Link ref={wordmarkRef} href="/" className={styles.wordmark}>
          Oriant<span className={styles.wordmarkAi}>.ai</span>
        </Link>

        <AnimatePresence initial={false}>
          {!showEndState ? (
            <motion.nav
              key="nav-links"
              ref={navLinksRef}
              aria-label="Primary"
              className={styles.links}
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={morph}
            >
              {NAV_LINKS.map((link) => (
                <a key={link.href} href={link.href} className={styles.navLink}>
                  {link.label}
                </a>
              ))}
            </motion.nav>
          ) : (
            <motion.a
              key="contact-link"
              ref={contactRef}
              href={CTA.contact.href}
              className={styles.contactLink}
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={morph}
            >
              {CTA.contact.label}
            </motion.a>
          )}
        </AnimatePresence>

        <Link
          href={CTA.primary.href}
          className={`lp-btn lp-btn--primary lp-btn--sm ${styles.cta}`}
        >
          <span className={styles.ctaFull}>{CTA.primary.label}</span>
          <span className={styles.ctaShort}>Start Free</span>
        </Link>

        <button
          ref={menuBtnRef}
          type="button"
          className={styles.menuBtn}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls={MOBILE_MENU_ID}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? (
            <X size={18} strokeWidth={2} aria-hidden="true" />
          ) : (
            <Menu size={18} strokeWidth={2} aria-hidden="true" />
          )}
        </button>
      </motion.div>

      <AnimatePresence>
        {menuOpen ? (
          <motion.nav
            key="mobile-menu"
            ref={panelRef}
            id={MOBILE_MENU_ID}
            aria-label="Mobile"
            className={`lp-card ${styles.panel}`}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={morph}
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={styles.panelLink}
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <a
              href={CTA.contact.href}
              className={styles.panelLink}
              onClick={() => setMenuOpen(false)}
            >
              {CTA.contact.label}
            </a>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
