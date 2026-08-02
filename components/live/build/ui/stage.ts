/**
 * components/live/build/ui/stage.ts — the only place a build state becomes a
 * bar position.
 *
 * THE RUNTIME REPORTS STATES, NOT PERCENTAGES. `buildPlan` walks
 * `queued → generating → validating → completed` (or `skipped`/`failed`) and
 * publishes nothing between those words, so the old mock's animated bar — a
 * width tweened out of a fixture's `duration` — was a number about a table, not
 * about the build. The owner still wants the bar, so it means the one thing the
 * runtime does report: WHICH STAGE the runner last wrote, drawn at a fixed
 * position per stage. The bar never moves unless the runtime writes a new
 * state, and it never animates toward a completion nobody has reported.
 *
 * THE POSITIONS ARE LABELS, NOT MEASUREMENTS. 5 / 40 / 75 / 100 were chosen so
 * the four stages read as distinct marks on a track; the screen says so out
 * loud (see the overview strip's legend) and every bar's aria-valuetext names
 * the stage rather than pretending the number was measured.
 *
 * A FAILED BAR STAYS WHERE THE BUILD DIED. The store keeps no "stage it failed
 * in" field, so two sources are used, in order of honesty:
 *
 *   1. What this tab SAW: while our own POST is open the job store is re-read
 *      every two seconds, and the screen remembers the highest in-flight stage
 *      each jobId reached. A job observed `validating` that comes back `failed`
 *      froze at 75.
 *   2. What the row itself proves: `attempt >= 1` means the runner logged
 *      "generating" before anything could fail, so 40 is a floor the data
 *      supports. `attempt === 0` means it died before generating — 5.
 *
 *   Matching the error string ("Package failed validation…") would pin the
 *   stage exactly, and was rejected: those sentences are the runner's prose,
 *   not a contract, and a reworded message would silently move every old bar.
 */

import type { BuildJobStatus } from "@/lib/runtime/build/types";
import type { JobView } from "../api";

/** Fixed track positions per reported state. `failed` is derived — see below. */
export const STAGE_PCT = {
  queued: 5,
  generating: 40,
  validating: 75,
  completed: 100,
  /** A skipped agent's stored package IS current — the outcome is "done". */
  skipped: 100,
  failed: 0, // placeholder; stagePercent replaces it with where the job died
} satisfies Record<BuildJobStatus, number>;

export interface StageView {
  /** Bar width. A fixed stage position, never a measurement. */
  pct: number;
  /** What the number means, for aria-valuetext and the pct slot's title. */
  label: string;
}

/**
 * The bar for one card. `observedPct` is the highest in-flight position this
 * tab saw for the job while polling its own build — null when the tab never
 * watched it run (page opened after the fact).
 */
export function stagePercent(job: JobView | null, observedPct: number | null): StageView {
  if (job === null) {
    return { pct: 0, label: "No build has ever been recorded for this agent." };
  }
  if (job.status === "failed") {
    // Where it died: what we saw beats what the row implies; see the header.
    const pct = observedPct ?? (job.attempt >= 1 ? STAGE_PCT.generating : STAGE_PCT.queued);
    return { pct, label: `Failed — the bar is frozen where the build died (${pct}%).` };
  }
  const pct = STAGE_PCT[job.status];
  const suffix =
    job.status === "skipped"
      ? "the stored package was already current"
      : `stage position ${pct}%, not a measured percentage`;
  return { pct, label: `${job.status} — ${suffix}.` };
}
