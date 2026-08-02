/**
 * components/live/build/format.ts — the words this screen puts around the
 * Factory's own vocabulary, and nothing else.
 *
 * A JOB'S `error` AND EVERY LOG LINE ARE STILL RENDERED VERBATIM. The runner's
 * own failure sentence is the one thing on a card that says why an agent cannot
 * go live, and nothing here paraphrases it. The one exception is
 * `missingReasonText` below, which restates the two reasons `runner.ts` is known
 * to emit in the product's own vocabulary and passes anything else through
 * untouched — an unfamiliar reason is still information and is never dropped.
 *
 * STATUS IS A WORD FIRST. `label` is what the badge says; the tint is
 * reinforcement and never the signal. The distinction that matters most is
 * `skipped` versus `completed` — both are green outcomes and only one of them
 * built anything today — and it has to survive being read in greyscale by
 * somebody watching over a shoulder.
 *
 * NOTHING HERE INVENTS A PERCENTAGE, AND THAT IS THE POINT OF THE FILE. The
 * screen this replaces drew a progress bar off a fixture's `duration`, so a bar
 * at 60% meant "0.6 of a number in a table" and nothing whatever about the
 * runtime. `buildPlan` reports no progress — it compiles the whole plan inside
 * one request and answers at the end — so the only honest thing to show is the
 * state it last recorded and how long the job took once it has one. (The bar
 * the screen draws is that state at a fixed per-stage position, and the mapping
 * lives in ui/stage.ts, not here, precisely so this file stays percentage-free.)
 *
 * The status map is total by type, so a word added to `BuildJobStatus` is a
 * compile error here rather than a nameless badge on a card.
 */

import type { BuildJobStatus } from "@/lib/runtime/build/types";

/* ═══════════════════════════ Status ═══════════════════════════ */

export interface StatusMeta {
  /**
   * What the badge says. The API's own status word is never shown as-is; the map
   * below is total by type, so a status added to `BuildJobStatus` fails to
   * compile here rather than leaking its raw word onto a card.
   */
  label: string;
  /** The `.oa-status--*` modifier from app/app/app.css. Never the only signal. */
  cls: string;
  /** One line for a reader who has not been told what these six states mean. */
  meaning: string;
  /** True for the two states the runner passes through while it is working. */
  inFlight: boolean;
}

export const STATUS_META = {
  queued: {
    label: "Waiting",
    cls: "pending",
    meaning:
      "This agent was lined up and nothing has been reported since. It is either being " +
      "built right now or belongs to a build that stopped before it got there.",
    inFlight: false,
  },
  generating: {
    label: "Building",
    cls: "active",
    meaning: "The agent is being built from the settings you approved.",
    inFlight: true,
  },
  validating: {
    label: "Checking",
    cls: "active",
    meaning:
      "The agent is built and is being checked against its settings. Nothing is marked " +
      "ready until it passes: an agent that would be refused never turns green.",
    inFlight: true,
  },
  completed: {
    label: "Built",
    cls: "completed",
    meaning: "Built, checked and saved. This agent is ready to go live.",
    inFlight: false,
  },
  skipped: {
    label: "Already up to date",
    cls: "neutral",
    meaning:
      "Nothing needed building. This agent already matched its settings, so it was left " +
      "as it was — a good outcome that built nothing today.",
    inFlight: false,
  },
  failed: {
    label: "Failed",
    cls: "failed",
    meaning:
      "It could not be built, or could not pass its checks. This agent is not ready and " +
      "cannot go live; the reason is on its card.",
    inFlight: false,
  },
} satisfies Record<BuildJobStatus, StatusMeta>;

/* ═══════════════════════════ Operating mode ═══════════════════════════ */

/**
 * How an agent is allowed to work, in words an owner has a use for.
 *
 * `operatingMode` arrives as an open string (see the api header), so this is a
 * lookup with a deliberate fail-loud default: a mode this build has never heard
 * of must NOT be described in reassuring language, because the reassuring
 * reading — "it will ask me first" — is the one that costs somebody something
 * if it is wrong.
 */
/* `| undefined` on purpose: without it the index signature promises a string for
   every key and the fallback below reads as dead code to anyone maintaining it. */
const OPERATING_MODE_TEXT: Record<string, string | undefined> = {
  draft_only: "Prepares the work and waits for your approval — it never acts on its own",
  act_after_approval: "Waits for your approval, then carries the work out",
  auto_within_limits: "Works on its own, within the limits you set",
};

export function operatingModeText(mode: string): string {
  return (
    OPERATING_MODE_TEXT[mode] ??
    "How this agent is allowed to work was not recognised — check it before you go live"
  );
}

/* ═══════════════════════════ Not-ready reasons ═══════════════════════════ */

/**
 * Why an agent has nothing ready, in the product's words.
 *
 * `runner.ts` emits exactly two of these today and both are restated here. An
 * unrecognised reason is returned UNTOUCHED rather than replaced by a generic
 * line: a reason this screen has not learned is still the only explanation the
 * reader is going to get, and swallowing it would leave an agent looking
 * not-ready for no stated cause.
 */
export function missingReasonText(reason: string): string {
  const noBuild = /^No package built for version (\d+)\.?$/.exec(reason);
  if (noBuild !== null) {
    return `This agent has not been built at version ${noBuild[1]}, the version your plan asks for.`;
  }
  if (reason === "The stored package no longer matches the approved spec.") {
    return "This agent's settings have changed since it was last built, so it needs building again.";
  }
  return reason;
}

/* ═══════════════════════════ Log levels ═══════════════════════════ */

/**
 * A log line's tint. Unknown levels get no class and keep their word, because
 * `level` is deliberately parsed as an open string — see the api header.
 */
export function logLevelClass(level: string): "info" | "warn" | "error" | "other" {
  if (level === "info" || level === "warn" || level === "error") return level;
  return "other";
}

/* ═══════════════════════════ Small helpers ═══════════════════════════ */

/**
 * An ISO instant as something a person can read, without pretending to know more
 * than the string does.
 *
 * A value that will not parse is returned untouched rather than replaced by a
 * dash: a timestamp this screen cannot read is still evidence, and hiding it
 * would make a runtime sending garbage look like a runtime sending nothing.
 */
export function formatInstant(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

/**
 * How long a finished job took, from the runtime's own two instants.
 *
 * Null whenever the answer would be a guess: an instant missing, an instant that
 * will not parse, or a job with no end. A running job deliberately gets nothing
 * rather than a clock counting up from `startedAt` — that number would be this
 * browser's opinion of a server's work, and inventing exactly that kind of
 * number is what the screen before this one did for a living.
 */
export function elapsed(startedAt: string | null, endedAt: string | null): string | null {
  if (startedAt === null || endedAt === null) return null;
  const from = new Date(startedAt).getTime();
  const to = new Date(endedAt).getTime();
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return null;
  const ms = to - from;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** "3 agents" / "1 agent", because "1 agents" reads as a bug in the runtime. */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
