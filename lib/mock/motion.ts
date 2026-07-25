/**
 * lib/mock/motion.ts — motion constants for the Oriant.ai product mock (spec §20).
 * One easing, one duration scale — shared with the landing (components/landing/motion.ts).
 */

export const EASE = [0.22, 1, 0.36, 1] as const;
export const EASE_CSS = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Durations in seconds (spec §20 timing guidance). */
export const DUR = {
  /** micro-interactions: hovers, chips, toggles (180–280ms) */
  micro: 0.22,
  /** cards and drawers (320–550ms) */
  card: 0.42,
  /** major page transitions (450–700ms) */
  page: 0.55,
} as const;

export const STAGGER = 0.07;

/** Shared fade-up variant used by most cards/sections. */
export const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: DUR.card, ease: EASE, delay: i * STAGGER },
  }),
};

/** Drawer slide (right rail / config drawers). */
export const drawerSlide = {
  hidden: { x: "104%" },
  show: { x: 0, transition: { duration: DUR.card, ease: EASE } },
  exit: { x: "104%", transition: { duration: DUR.card * 0.8, ease: EASE } },
};
