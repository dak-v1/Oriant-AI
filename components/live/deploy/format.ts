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
import type { ActivationGateId, AgentRuntimeState } from "@/lib/runtime/schedule/types";

/* ═══════════════════════════ The three gates ═══════════════════════════ */

export interface GateMeta {
  /** What this gate is asking, for somebody who has not read the runtime. */
  what: string;
  /** What a shut one means, and who opens it. Never a restatement of a blocker. */
  whenShut: string;
}

const GATE_META = {
  packages: {
    what: "Every agent in your plan has been built and is up to date.",
    whenShut:
      "An agent that has not been built cannot run, so going live would put a name live with nothing behind it. This check also refuses a plan with no agents in it at all.",
  },
  sandbox: {
    what: "Your agents have been tested against THIS plan at THIS version.",
    whenShut:
      "There is no way to override this one. Results earned before the plan changed cannot clear a go-live, and an agent no test covers has no evidence rather than a clean record.",
  },
  integrations: {
    what: "Every tool an agent marks as required is connected for your business.",
    whenShut:
      "A required tool that is not connected means the agent goes live unable to do the job you switched it on for. Optional tools are counted, never held against you.",
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
    label: "live and up to date",
    cls: "active",
    meaning:
      "Live, and your current plan still asks for exactly this version. Going live again changes nothing for it.",
  },
  drifted: {
    label: "live but out of date",
    cls: "pending",
    meaning:
      "Live, but your plan has changed since. The older version is what is RUNNING until you go live again.",
  },
  planned: {
    label: "waiting to start",
    cls: "neutral",
    meaning: "In your current plan and never put live. Going live is what would start it.",
  },
  retired: {
    label: "live, dropped from your plan",
    cls: "failed",
    meaning:
      "Put live once and since taken out of your plan. Going live leaves it running — this is the one nobody expects.",
  },
} satisfies Record<AgentLifecycle, LifecycleMeta>;

/** The framing for a tag, or null for a word this build does not know. */
export function lifecycleMeta(tag: string): LifecycleMeta | null {
  return tag in LIFECYCLE_META ? LIFECYCLE_META[tag as AgentLifecycle] : null;
}

/* ═══════════════════════════ Agent states ═══════════════════════════ */

/**
 * The five runtime states as an owner would say them.
 *
 * Total by type — a sixth state added to the runtime is a compile error here
 * rather than a raw word appearing on a row — and safe to index because
 * ./api.ts refuses any state outside this union before it reaches a component.
 */
const AGENT_STATE_LABEL = {
  building: "being built",
  validated: "tested and ready",
  active: "running",
  paused: "paused",
  failed: "failed",
} satisfies Record<AgentRuntimeState, string>;

/** How an agent's current state reads on screen. */
export function agentStateLabel(state: AgentRuntimeState): string {
  return AGENT_STATE_LABEL[state];
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
