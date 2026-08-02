/**
 * components/live/pipeline/format.ts — the words this screen puts around the
 * runtime's own vocabulary, and nothing else.
 *
 * Two rules hold everything here in place.
 *
 * THE RUNTIME'S SENTENCES ARE NEVER REWRITTEN. A stage's `summary` and its
 * `detail` lines, and a gap's `message` and `resolution`, are rendered verbatim.
 * What this file adds is the frame around them: what the stage was trying to do,
 * what each of the four status words means, and what a severity group asks of
 * whoever is reading. A second copy of a judgement is a second thing to keep in
 * step, and the copy that drifts is always the one on the screen.
 *
 * STATUS IS A WORD FIRST. `label` is what the badge says; the tint is
 * reinforcement. The distinction between `blocked` and `failed` is the whole
 * point of the stage vocabulary — one is a gate shutting on purpose and the
 * other is an engineer's problem — and it must survive being read in greyscale,
 * at a glance, by somebody watching over a shoulder.
 *
 * Both maps are total by type, so a stage or a status added to
 * `lib/runtime/pipeline/types.ts` is a compile error here rather than a blank
 * badge or a nameless row.
 */

import type { GapSeverity } from "@/lib/plan/ingest/types";
import type { StageId, StageStatus } from "@/lib/runtime/pipeline/types";

/* ═══════════════════════════ Stages ═══════════════════════════ */

export interface StageMeta {
  /** The stage, named for somebody who has not read the orchestrator. */
  title: string;
  /** What it attempts. Present before a pass runs, so the six rows mean something. */
  what: string;
  /** What a shut gate here is, and who opens it. Shown only when blocked. */
  whenBlocked: string;
}

export const STAGE_META = {
  collect: {
    title: "Collect",
    what: "Takes the handoff Role B left — the plan, its agents and its integrations — exactly as sent.",
    whenBlocked:
      "Nothing arrived that looks like a workforce handoff. That is Role B's side of the seam, not the runtime's.",
  },
  ingest: {
    title: "Ingest",
    what: "Turns the handoff into an approved plan, recording every assumption it had to make.",
    whenBlocked:
      "The handoff is missing something no safe default can stand in for. Every blocking gap is listed below with what would answer it.",
  },
  validate: {
    title: "Validate",
    what: "Checks the plan against the plan contract — limits, owners, grants, triggers.",
    whenBlocked:
      "The plan breaks a contract rule. The rule number and the agent it belongs to are in the detail; a plan that fails here would be unenforceable at run time.",
  },
  build: {
    title: "Build",
    what: "Compiles one runnable package per agent and stores it.",
    whenBlocked:
      "At least one agent has no current package. An agent without a package cannot run, so activation would put a name live with nothing behind it.",
  },
  prove: {
    title: "Prove",
    what: "Runs the sandbox suite and the stress sweep, and takes the verdict.",
    whenBlocked:
      "The sandbox will not certify this workforce. There is no override: an activation without a verdict is the exact thing every check in this repository exists to prevent.",
  },
  activate: {
    title: "Activate",
    what: "Opens the three go-live gates, registers the triggers and puts the deployment on record.",
    whenBlocked:
      "A go-live gate is shut, or a workflow got no trigger and would be live in name only. Each blocker names itself in the detail.",
  },
} satisfies Record<StageId, StageMeta>;

/* ═══════════════════════════ Status ═══════════════════════════ */

export interface StatusMeta {
  /** The API's own word. Kept as the badge text so nothing is lost in translation. */
  label: string;
  /** The `.oa-status--*` modifier from app/app/app.css. Never the only signal. */
  cls: string;
  /** One line for a reader who has not been told what these four words mean. */
  meaning: string;
}

export const STATUS_META = {
  ok: {
    label: "ok",
    cls: "completed",
    meaning: "This stage did its work.",
  },
  blocked: {
    label: "blocked",
    cls: "pending",
    meaning: "This stage refused on purpose, and a person can fix the cause.",
  },
  failed: {
    label: "failed",
    cls: "failed",
    meaning: "This stage broke. An engineer has to look at it.",
  },
  skipped: {
    label: "skipped",
    cls: "neutral",
    meaning: "The pass stopped before this stage, so it was never attempted.",
  },
} satisfies Record<StageStatus, StatusMeta>;

/* ═══════════════════════════ Gap severity ═══════════════════════════ */

export interface SeverityMeta {
  /** The heading for the group. */
  title: string;
  /** What this group asks of the reader, in the contract's own terms. */
  sentence: string;
  /** Border/tint treatment in the stylesheet. Paired with the heading, never alone. */
  tone: "blocking" | "degraded" | "note";
}

export const SEVERITY_META = {
  blocking: {
    title: "Blocking",
    sentence:
      "The workforce cannot run correctly until a human answers these. The pass stops at ingest while any of them stands.",
    tone: "blocking",
  },
  degraded: {
    title: "Degraded",
    sentence:
      "It will run, safely, but less capably than you probably intend. Every one of these is a safe default standing in for something the handoff did not carry.",
    tone: "degraded",
  },
  note: {
    title: "Worth knowing",
    sentence: "Recorded for the record. Nothing behaves differently because of these.",
    tone: "note",
  },
} satisfies Record<GapSeverity, SeverityMeta>;

/* ═══════════════════════════ Small helpers ═══════════════════════════ */

/**
 * An ISO instant as something a person can read, without pretending to know
 * more than the string does.
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

/** "3 agents" / "1 agent", because "1 agents" reads as a bug in the runtime. */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
