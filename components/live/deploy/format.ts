/**
 * components/live/deploy/format.ts — the words this screen puts AROUND the
 * runtime's own vocabulary, and nothing else.
 *
 * THE RUNTIME'S SENTENCES ARE NEVER REWRITTEN. A gate's `detail`, a blocker's
 * `message`, a lifecycle row's `note`, an agent record's `detail`, a rejected
 * trigger's `reason`, the plan's `fallbackReason` and the allowlist's `error` and
 * `hint` are all rendered verbatim wherever they appear. Every one of them was
 * written carefully in lib/runtime/schedule/activation.ts or its neighbours, and
 * several say things a paraphrase would flatten — that a wholesale provider
 * refusal "is not a disconnected tool, and reconnecting will not clear it", that
 * a verdict earned on v2 cannot authorise v3. What this file adds is the frame:
 * what each gate is FOR, and what each lifecycle tag means for the button.
 *
 * A second copy of a judgement is a second thing to keep in step, and the copy
 * that drifts is always the one on the screen.
 *
 * BOTH LOOKUPS TOLERATE A WORD THIS BUILD DOES NOT KNOW, which is the opposite of
 * the usual posture in components/live/** and is argued in ./api.ts: on this
 * screen an unrecognised gate or tag must still be RENDERED, because hiding a
 * gate from a go-live checklist is the one outcome it may never produce. Both
 * maps are still total by type, so a gate id or lifecycle tag added to the
 * runtime is a compile error here rather than a silently unframed row.
 */

import type { AgentLifecycle } from "@/lib/runtime/active-plan";
import type { ActivationGateId } from "@/lib/runtime/schedule/types";

/* ═══════════════════════════ The three gates ═══════════════════════════ */

export interface GateMeta {
  /** What this gate is asking, for somebody who has not read the runtime. */
  what: string;
  /** What a shut one means, and who opens it. Never a restatement of a blocker. */
  whenShut: string;
}

const GATE_META = {
  packages: {
    what: "Every agent in the plan has a current, runnable package stored by the Agent Factory.",
    whenShut:
      "An agent with no package cannot run, so activating would put a name live with nothing behind it. This gate also refuses a plan with no agents at all.",
  },
  sandbox: {
    what: "The scenario suite and the stress sweep have passed against THIS plan at THIS version.",
    whenShut:
      "There is no override anywhere in the runtime for this one. A verdict earned before the plan changed cannot authorise a go-live, and an agent no scenario covers has no evidence rather than a clean record.",
  },
  integrations: {
    what: "Every connection an agent marks as required is connected for the plan's own organization.",
    whenShut:
      "A required tool that is not connected means the agent goes live unable to do the job it was activated for. Optional connections are counted, never blocked.",
  },
} satisfies Record<ActivationGateId, GateMeta>;

/**
 * The framing for a gate, or null when this build has never heard of it.
 *
 * Null is rendered as no framing at all rather than as a guess: the runtime's own
 * `label`, `detail` and blockers are already on the row and are the authoritative
 * account of what it is.
 */
export function gateMeta(id: string): GateMeta | null {
  return id in GATE_META ? GATE_META[id as ActivationGateId] : null;
}

/* ═══════════════════════════ Lifecycle tags ═══════════════════════════ */

export interface LifecycleMeta {
  /** The word as the roster shows it. */
  label: string;
  /** `.oa-status--*` modifier. Reinforcement — never the only signal. */
  cls: string;
  /** What this tag means for somebody about to press the button. */
  meaning: string;
}

const LIFECYCLE_META = {
  running: {
    label: "running",
    cls: "active",
    meaning:
      "Deployed, and the current plan still asks for exactly this version. Activating again changes nothing for it.",
  },
  drifted: {
    label: "drifted",
    cls: "pending",
    meaning:
      "Deployed, but the plan has changed since. What is RUNNING is the old version until an activation replaces it.",
  },
  planned: {
    label: "planned",
    cls: "neutral",
    meaning: "In the current plan and never deployed. This activation is what would start it.",
  },
  retired: {
    label: "retired",
    cls: "failed",
    meaning:
      "Deployed once and since removed from the plan. Activation leaves it running — this is the one nobody expects.",
  },
} satisfies Record<AgentLifecycle, LifecycleMeta>;

/** The framing for a tag, or null for a word this build does not know. */
export function lifecycleMeta(tag: string): LifecycleMeta | null {
  return tag in LIFECYCLE_META ? LIFECYCLE_META[tag as AgentLifecycle] : null;
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

/** "3 agents" / "1 agent", because "1 agents" reads as a bug in the runtime. */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
