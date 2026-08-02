/**
 * components/live/build/format.ts — the words this screen puts around the
 * Factory's own vocabulary, and nothing else.
 *
 * THE RUNTIME'S SENTENCES ARE NEVER REWRITTEN. A job's `error`, a missing
 * package's `reason` and every log line are rendered verbatim. What this file
 * adds is the frame around them: what each of the six status words means for
 * somebody who has not read `lib/runtime/build/runner.ts`.
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
  /** The API's own word, kept as the badge text so nothing is lost in translation. */
  label: string;
  /** The `.oa-status--*` modifier from app/app/app.css. Never the only signal. */
  cls: string;
  /** One line for a reader who has not been told what these six words mean. */
  meaning: string;
  /** True for the two states the runner passes through while it is working. */
  inFlight: boolean;
}

export const STATUS_META = {
  queued: {
    label: "queued",
    cls: "pending",
    meaning:
      "The row was written and nothing was reported after it. The runner writes this " +
      "before it starts, so a job sitting here either belongs to a build happening right " +
      "now or to one that stopped without finishing.",
    inFlight: false,
  },
  generating: {
    label: "generating",
    cls: "active",
    meaning: "The package is being compiled from the approved spec.",
    inFlight: true,
  },
  validating: {
    label: "validating",
    cls: "active",
    meaning:
      "The package is compiled and is being checked against the spec. Validation gates " +
      "completion: a package the executor would refuse never becomes green.",
    inFlight: true,
  },
  completed: {
    label: "completed",
    cls: "completed",
    meaning:
      "Compiled, validated and stored. This agent has a current package, which is what " +
      "Activation gates on.",
    inFlight: false,
  },
  skipped: {
    label: "skipped",
    cls: "neutral",
    meaning:
      "Nothing needed building. The stored package already matched this exact spec, so it " +
      "was reused — a green outcome that built nothing today.",
    inFlight: false,
  },
  failed: {
    label: "failed",
    cls: "failed",
    meaning:
      "Generation or validation could not be satisfied. The agent has no current package " +
      "and cannot be activated; the reason is on the card.",
    inFlight: false,
  },
} satisfies Record<BuildJobStatus, StatusMeta>;

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
