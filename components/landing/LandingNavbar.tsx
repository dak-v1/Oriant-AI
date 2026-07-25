"use client";
/**
 * LandingNavbar — two-state navigation (redesign brief §5).
 *
 * STATE 1 (hero on screen): full-width transparent row on the hero surface —
 * wordmark left, six links centred, primary CTA right (~72px tall).
 * STATE 2 (past ~85% of the viewport): the row contracts into a horizontally
 * centred floating capsule (translucent surface, blur, border, nav shadow)
 * holding wordmark + Contact + CTA + menu button.
 *
 * PRIMARY MOTION CONCEPT: the integrated-row → floating-capsule contraction,
 * driven by a framer-motion layout animation (~0.4s, shared EASE). The header
 * is position: fixed, so the page never jumps; leaving/entering content
 * crossfades via AnimatePresence popLayout while the capsule morphs.
 *
 * Hydration: server + first client render are always state 1 (compact=false,
 * menu closed); scroll/media effects only update state after mount. Reduced
 * motion is handled without any render branching: <MotionConfig
 * reducedMotion="user"> disables the layout/transform animations and the
 * global landing.css kill-switch zeroes the CSS transitions, so the state
 * switch is instant while the tree stays identical.
 *
 * Focus safety: if focus is inside the desktop link row (or the menu panel)
 * when a state morph or breakpoint flip removes it, focus moves to the
 * wordmark link with { preventScroll: true }. Escape closes the menu and
 * refocuses the toggle. The scroll listener is rAF-throttled and passive.
 */

/* eslint-disable @next/next/no-img-element -- the animated brand mark uses
   motion.img on fixed-size local PNGs; next/image can't drive the reveal. */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { CTA, NAV_LINKS } from "@/lib/landing-content";
import { DUR, EASE } from "./motion";
import styles from "./LandingNavbar.module.css";

/** Capsule morph duration (assignment: ~0.4s with the shared easing). */
const MORPH = 0.4;
const morphLayout = { layout: { duration: MORPH, ease: EASE } };

/* Brand mark geometry. The mark is ONE cohesive image (lockup.png = the
   "ORIANT" wordmark with the compass star as the letter A). A fixed-height
   window with overflow:hidden reveals it: expanded the window is the full
   logo width; collapsed it narrows to just the star and the image slides so
   the star (which sits at 44.8%-67.9% of the width) fills the window. The
   image itself is never split. */
const MARK_H = 26;
const LOCKUP_W = Math.round(MARK_H * (982 / 260)); // full ORIANT width
const STAR_FRAC_L = 0.4484; // star left edge, fraction of lockup width
const STAR_FRAC_R = 0.6788; // star right edge
const STAR_W = Math.round((STAR_FRAC_R - STAR_FRAC_L) * LOCKUP_W); // collapsed window
const STAR_SHIFT = Math.round(STAR_FRAC_L * LOCKUP_W); // image slide to reveal star

export default function LandingNavbar() {
  const [compact, setCompact] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const reduced = useReducedMotion();

  /* Intro: the mark mounts showing just the star, then expands to the full
     ORIANT logo shortly after load. The mark is ALWAYS visible (opacity is
     never gated on JS) so it can never get stuck blank; only the expand is
     timed. From then on the wordmark follows the scroll state, compressing
     back to the star. A self-contained CSS entrance adds the fade/scale. */
  const [introDone, setIntroDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setIntroDone(true), reduced ? 0 : 520);
    return () => clearTimeout(t);
  }, [reduced]);

  const wordShown = introDone && !compact;
  const markEase = reduced ? "none" : "var(--lp-ease)";

  const wordmarkRef = useRef<HTMLAnchorElement>(null);
  const linksRowRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const prevCompactRef = useRef(false);

  /* rAF-throttled scroll listener: capsule past ~85% of the viewport height,
     back to the integrated row below ~78% (small hysteresis, no flicker). */
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      const vh = window.innerHeight;
      setCompact((prev) => (prev ? y > vh * 0.78 : y > vh * 0.85));
    };
    const request = () => {
      if (raf === 0) raf = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request);
    return () => {
      window.removeEventListener("scroll", request);
      window.removeEventListener("resize", request);
      if (raf !== 0) window.cancelAnimationFrame(raf);
    };
  }, []);

  /* Focus safety on the state morph: if focus sits inside UI that the morph
     removes (desktop link row, menu panel), park it on the wordmark link. */
  useEffect(() => {
    if (prevCompactRef.current === compact) return;
    prevCompactRef.current = compact;
    const active = document.activeElement;
    const inLinks =
      linksRowRef.current !== null && linksRowRef.current.contains(active);
    const inPanel =
      panelRef.current !== null && panelRef.current.contains(active);
    setMenuOpen(false);
    if (inLinks || inPanel) {
      wordmarkRef.current?.focus({ preventScroll: true });
    }
  }, [compact]);

  /* A desktop/mobile breakpoint flip closes the panel; if focus was inside,
     it moves to the wordmark link (the toggle may no longer be visible). */
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (
        panelRef.current !== null &&
        panelRef.current.contains(document.activeElement)
      ) {
        wordmarkRef.current?.focus({ preventScroll: true });
      }
      setMenuOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  /* While the menu is open: Escape closes and refocuses the toggle;
     pointer-down outside the panel/toggle dismisses. */
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      toggleRef.current?.focus({ preventScroll: true });
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current !== null && panelRef.current.contains(target)) return;
      if (toggleRef.current !== null && toggleRef.current.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen]);

  return (
    <motion.header
      layoutRoot
      className={styles.root}
      data-compact={compact ? "" : undefined}
    >
      <nav aria-label="Main" className={`lp-container ${styles.inner}`}>
        <motion.div
          layout
          className={styles.shell}
          style={{ borderRadius: 999 }}
          transition={morphLayout}
        >
          <motion.div
            layout="position"
            transition={morphLayout}
            className={styles.wordmarkWrap}
          >
            <Link
              href="/"
              ref={wordmarkRef}
              className={styles.wordmark}
              aria-label="Oriant home"
            >
              {/* A fixed-height window over the single ORIANT image. Collapsed:
                  narrow to the star and slide the image so the star fills the
                  window. Expanded: widen to the full logo and slide back. The
                  image is one piece (never split); only the window width and
                  its offset animate, via plain CSS transitions. */}
              <span
                className={styles.brandMark}
                style={{
                  height: MARK_H,
                  width: wordShown ? LOCKUP_W : STAR_W,
                  transition: `width 0.5s ${markEase}`,
                }}
              >
                <img
                  src="/brand/lockup.png"
                  alt=""
                  aria-hidden
                  width={LOCKUP_W}
                  height={MARK_H}
                  className={styles.brandLockup}
                  style={{
                    width: LOCKUP_W,
                    height: MARK_H,
                    transform: `translateX(${wordShown ? 0 : -STAR_SHIFT}px)`,
                    transition: `transform 0.5s ${markEase}`,
                  }}
                />
              </span>
            </Link>
          </motion.div>

          {/* Desktop link row — unmounts into the capsule state. */}
          <AnimatePresence initial={false} mode="popLayout">
            {!compact && (
              <motion.div
                key="links"
                ref={linksRowRef}
                className={styles.linksWrap}
                layout="position"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 1,
                  transition: { duration: DUR.micro, delay: 0.1, ease: EASE },
                }}
                exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE } }}
                transition={morphLayout}
              >
                {NAV_LINKS.map((link) => (
                  <a key={link.href} href={link.href} className={styles.navLink}>
                    {/* CSS-only y-swap: two stacked copies in a clipped span */}
                    <span className={styles.swap}>
                      <span className={styles.swapLine}>{link.label}</span>
                      <span className={styles.swapClone} aria-hidden="true">
                        {link.label}
                      </span>
                    </span>
                  </a>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            layout="position"
            transition={morphLayout}
            className={styles.rightZone}
          >
            {/* Contact link joins the capsule (desktop only). */}
            <AnimatePresence initial={false} mode="popLayout">
              {compact && (
                <motion.div
                  key="contact"
                  className={styles.contactWrap}
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: 1,
                    transition: { duration: DUR.micro, delay: 0.12, ease: EASE },
                  }}
                  exit={{
                    opacity: 0,
                    transition: { duration: 0.12, ease: EASE },
                  }}
                >
                  <a href={CTA.contact.href} className={styles.contactLink}>
                    <span className={styles.contactLabel}>
                      {CTA.contact.label}
                    </span>
                  </a>
                </motion.div>
              )}
            </AnimatePresence>

            <a
              href={CTA.primary.href}
              className="lp-btn lp-btn--primary lp-btn--sm"
            >
              <span className={styles.ctaFull}>{CTA.primary.label}</span>
              <span className={styles.ctaShort}>Start Free</span>
            </a>

            <div className={styles.menuWrap}>
              <button
                ref={toggleRef}
                type="button"
                className={styles.menuBtn}
                aria-label="Menu"
                aria-expanded={menuOpen}
                aria-controls="lp-nav-menu"
                onClick={() => setMenuOpen((open) => !open)}
              >
                {menuOpen ? (
                  <X size={18} strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Menu size={18} strokeWidth={2} aria-hidden="true" />
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>

        {/* Menu panel: full-width surface sheet on mobile, centred dropdown
            under the capsule on desktop. */}
        <AnimatePresence initial={false}>
          {menuOpen && (
            <motion.div
              key="panel"
              id="lp-nav-menu"
              ref={panelRef}
              className={styles.panel}
              initial={{ opacity: 0, y: -8 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { duration: DUR.micro, ease: EASE },
              }}
              exit={{
                opacity: 0,
                y: -6,
                transition: { duration: 0.15, ease: EASE },
              }}
            >
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className={styles.panelLink}
                  onClick={() => setMenuOpen(false)}
                >
                  <span className={styles.panelLabel}>{link.label}</span>
                </a>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </motion.header>
  );
}
