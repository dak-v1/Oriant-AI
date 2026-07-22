/**
 * motion.ts — shared motion constants for the Oriant.ai landing page
 * (redesign brief §21). One easing, one duration scale, used everywhere.
 */

export const EASE = [0.22, 1, 0.36, 1] as const;

/** Durations in seconds. */
export const DUR = {
  /** micro interaction: hovers, chips, toggles */
  micro: 0.22,
  /** card / block reveal */
  card: 0.75,
  /** major mask / clip transition */
  mask: 1.1,
  /** hero entrance sequence total budget */
  hero: 1.5,
} as const;

/** Stagger gap between sibling reveals. */
export const STAGGER = 0.08;
