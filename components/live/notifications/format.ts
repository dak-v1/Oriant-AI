/**
 * components/live/notifications/format.ts — the words this surface puts on a
 * severity and on an instant (ROLE_C_PLAN M7).
 *
 * Separated from the component for the reason the Workspace separates its
 * read-model: the load-bearing content here is not layout, it is a handful of
 * definitions — what "action required" means, what an age reads as when the two
 * clocks disagree — and a definition buried in JSX cannot be argued with or found
 * again.
 *
 * EVERY SEVERITY HAS A WORD, and that is a correctness requirement rather than a
 * style one. Colour is reinforcement on this surface and never the message: a
 * reader who cannot distinguish amber from red, or who is listening rather than
 * looking, must still be able to tell an overdue approval from a refused run.
 * There is deliberately no severity here that renders as a dot alone.
 *
 * AGES ARE MEASURED AGAINST THE RUNTIME'S CLOCK, NOT THE BROWSER'S. The route
 * returns the instant it judged everything at, and `formatAge` takes it as an
 * argument rather than reaching for `Date.now()`. The difference shows exactly
 * where it matters: a laptop four minutes fast would otherwise print an age that
 * disagrees with the deadline sentence sitting beside it, both derived from the
 * same approval.
 *
 * A CLOCK THAT DISAGREES IS SAID OUT LOUD. An instant that will not parse, and an
 * instant ahead of the runtime's own `now`, are both reported as what they are
 * rather than rounded to "just now". The first is a record this build cannot
 * read; the second means two clocks in one system disagree, which is worth one
 * odd-looking line on a screen and is never worth hiding.
 */

import type { NotificationSeverity } from "./api";

/* ═══════════════════════════ Severity ═══════════════════════════ */

export interface SeverityMeta {
  /** The chip's word. Never omitted, never replaced by colour. */
  label: string;
  /** The group heading this severity collects under. */
  heading: string;
  /** One line under the heading saying what the group means. */
  blurb: string;
  /** The `.oa-status--*` modifier reused from the shared palette. */
  statusClass: string;
}

export const SEVERITY: Record<NotificationSeverity, SeverityMeta> = {
  action_required: {
    label: "Action required",
    heading: "Act now",
    blurb:
      "You are the remedy and the time you were given has run out. An agent is idle " +
      "until each of these is decided.",
    statusClass: "failed",
  },
  attention: {
    label: "Needs attention",
    heading: "Needs a look",
    blurb:
      "Something is broken or blocked and stays that way until a person looks. No " +
      "deadline is passing, and nothing here fixes itself.",
    statusClass: "pending",
  },
  waiting: {
    label: "Waiting on you",
    heading: "Waiting on you",
    blurb:
      "An agent has paused for a decision and is still inside the deadline its policy " +
      "gave you.",
    statusClass: "review",
  },
};

/** Severity groups in the order they are shown. Most urgent first. */
export const SEVERITY_ORDER: NotificationSeverity[] = [
  "action_required",
  "attention",
  "waiting",
];

/* ═══════════════════════════ Time ═══════════════════════════ */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "2h 15m", "3 days", "under a minute". Never a bare number. */
function span(ms: number): string {
  if (ms < MINUTE) return "under a minute";
  if (ms < HOUR) {
    const minutes = Math.floor(ms / MINUTE);
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }
  if (ms < DAY) {
    const hours = Math.floor(ms / HOUR);
    const minutes = Math.floor((ms % HOUR) / MINUTE);
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }
  const days = Math.floor(ms / DAY);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export interface Age {
  /** What to show. Always safe to render. */
  text: string;
  /** True when the instant could not be read or is ahead of the runtime's clock. */
  odd: boolean;
}

/**
 * How long ago something happened, according to the runtime.
 *
 * @param at   the instant on the item, or null when the item is a derivation
 * @param now  the instant the route judged everything at
 */
export function formatAge(at: string | null, now: string): Age {
  if (at === null) return { text: "no time recorded", odd: false };

  const atMs = Date.parse(at);
  if (!Number.isFinite(atMs)) {
    return { text: `at an unreadable time ("${at}")`, odd: true };
  }

  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) {
    // The route's own instant is what everything else on the card was judged
    // against, so if it is unreadable the honest answer is to show the raw
    // timestamp rather than to fall back to this browser's clock.
    return { text: at, odd: true };
  }

  const elapsed = nowMs - atMs;
  if (elapsed < 0) {
    return {
      text: `${span(-elapsed)} ahead of the runtime's clock`,
      odd: true,
    };
  }
  return { text: `${span(elapsed)} ago`, odd: false };
}

/** "3 items", "1 item" — used wherever a count is read aloud. */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
