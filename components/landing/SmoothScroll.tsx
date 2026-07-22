"use client";
/**
 * SmoothScroll — restrained momentum scrolling for the landing page
 * (redesign brief §22) using Lenis, wired to stay accessible:
 *
 * - skipped entirely under prefers-reduced-motion (native scrolling);
 * - touch devices keep native scrolling (syncTouch/smoothTouch off);
 * - keyboard scrolling stays native (Lenis does not intercept keys);
 * - same-page anchor links glide via lenis.scrollTo with the sticky-nav
 *   offset, and focus moves to the target for assistive tech;
 * - the global `html { scroll-behavior: smooth }` is neutralised while
 *   Lenis drives, so the two smoothing systems never fight.
 *
 * Renders nothing — mount once inside the landing page.
 */
import { useEffect } from "react";
import Lenis from "lenis";

const NAV_OFFSET = -96; // matches the `scroll-margin-top` used for anchors

export default function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      duration: 1.05,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1,
      wheelMultiplier: 1,
    });

    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = window.requestAnimationFrame(raf);
    };
    rafId = window.requestAnimationFrame(raf);

    // Lenis and CSS smooth-scroll must not both interpolate.
    const html = document.documentElement;
    const prevBehavior = html.style.scrollBehavior;
    html.style.scrollBehavior = "auto";

    // Same-page anchors glide with the nav offset; focus follows for a11y.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href^="#"]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const id = decodeURIComponent(anchor.hash.slice(1));
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      history.pushState(null, "", anchor.hash);
      lenis.scrollTo(target, { offset: NAV_OFFSET });
      // Move focus without re-scrolling so keyboard/AT users land with the view.
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    };
    document.addEventListener("click", onClick);

    return () => {
      document.removeEventListener("click", onClick);
      window.cancelAnimationFrame(rafId);
      html.style.scrollBehavior = prevBehavior;
      lenis.destroy();
    };
  }, []);

  return null;
}
