/**
 * components/live/agents/pills.tsx — the two badges this surface turns a runtime
 * word into, and the one place either mapping lives (ROLE_C_PLAN M6).
 *
 * They are together in one small file because the reason they belong together is
 * a single one: both are the point where a state the runtime owns becomes
 * something an owner reads, and split across the card and the drill-in each would
 * have grown its own answer — the roster showing a refused run in one colour and
 * the history showing it in another.
 *
 * BOTH MAPS ARE TOTAL AND CHECKED WITH `satisfies`. A sixth `AgentRuntimeState`
 * or a seventh `RunStatus` fails to compile here rather than rendering as a blank
 * badge. That is the guarantee `app/api/runtime/scheduler/route.ts` gives its
 * `?status=` filter and `components/live/workspace/ui.tsx` gives its pills, and
 * it matters more on this screen than on either: the roster is where somebody
 * decides whether to intervene, and a state with no word attached reads as
 * "nothing to see".
 *
 * EVERY BADGE CARRIES ITS WORD. There is no dot-only variant. Colour is
 * reinforcement, never the message — for contrast and colour-vision reasons, and
 * because "paused" and "failed" are the distinction this whole screen exists to
 * make legible.
 *
 * THE ABSENT STATE IS ITS OWN BADGE, not a sixth member of the union. An agent
 * with no `AgentRuntimeRecord` has never been through activation, which is a
 * different fact from any state the runtime can be in, and it asks something
 * different of an owner: activate the plan, rather than resume the agent.
 */

import type { AgentRuntimeState, RunStatus } from "./api";

interface Pill {
  /** The `.oa-status--*` modifier from app/app/app.css. */
  cls: string;
  label: string;
}

/**
 * `validated` and `building` are the Factory's states and are shown as neutral
 * on purpose: they mean work is in hand somewhere else, and dressing them as
 * warnings would put an amber badge on every agent during a normal build.
 */
const AGENT_PILL = {
  building: { cls: "neutral", label: "Building" },
  validated: { cls: "review", label: "Validated" },
  active: { cls: "active", label: "Active" },
  paused: { cls: "pending", label: "Paused" },
  failed: { cls: "failed", label: "Failed" },
} satisfies Record<AgentRuntimeState, Pill>;

const NEVER_ACTIVATED: Pill = { cls: "neutral", label: "Never activated" };

export function AgentStatePill({ state }: { state: AgentRuntimeState | null }) {
  const pill: Pill = state === null ? NEVER_ACTIVATED : AGENT_PILL[state];
  return <span className={`oa-status oa-status--${pill.cls}`}>{pill.label}</span>;
}

/**
 * Matches `components/live/workspace/ui.tsx` word for word. The Workspace feed
 * and this roster show the same runs, and two vocabularies for one status would
 * read as two different things having happened.
 */
const RUN_PILL = {
  running: { cls: "active", label: "Running" },
  awaiting_approval: { cls: "pending", label: "Waiting on you" },
  completed: { cls: "completed", label: "Completed" },
  failed: { cls: "failed", label: "Failed" },
  refused: { cls: "failed", label: "Refused" },
  cancelled: { cls: "neutral", label: "Cancelled" },
} satisfies Record<RunStatus, Pill>;

export function RunStatusPill({ status }: { status: RunStatus }) {
  const pill: Pill = RUN_PILL[status];
  return <span className={`oa-status oa-status--${pill.cls}`}>{pill.label}</span>;
}
