/**
 * components/live/calendar/state-meta.ts — how each runtime state looks on the
 * live calendar, in one place (ROLE_C_PLAN M6).
 *
 * WHY THIS IS NOT `components/mock/calendar/stateMeta.ts`. The scripted calendar
 * has five states — pending approval, approved, completed, review requested,
 * failed — which are the demo's vocabulary, not the runtime's. The runtime
 * distinguishes ten: a firing the scheduler holds from one this build worked out;
 * a run refused by policy from one that broke; an approval still in time from one
 * past its `escalateAfterMins` deadline. Forcing ten into five would mean
 * labelling at least four of them wrongly, and "approved" would end up on things
 * nobody has approved. So the treatments are rebuilt here from the same
 * ingredients — the `--oa-*` tokens, an icon, a word — and the two screens look
 * like one product without either pretending to be the other.
 *
 * COLOUR IS NEVER THE SIGNAL. Every treatment below pairs a fill with an icon
 * AND a word, and every place they are used renders the word — in the pill, in
 * the legend, and in the summary a screen reader hears when a day takes focus.
 * The states most easily confused at a glance are deliberately separated by more
 * than hue: `projected` carries a DASHED border against `scheduled`'s solid one,
 * and `overdue` is a tint against `awaiting_decision`'s outline.
 *
 * NO TWO STATES SHARE AN ICON, and that is a rule rather than an accident of
 * picking. M7 found two collisions here and both mattered: `failed` and `overdue`
 * were both `AlertTriangle`, and `refused` and `cancelled` were `Ban` and
 * `CircleSlash`, which lucide draws as the same circle with the same diagonal
 * through it. Rendered at 11px in a month cell, an icon that is the only thing
 * distinguishing two states from four feet away has to actually differ, or the
 * word underneath is carrying the whole load on its own and the icon is
 * decoration pretending to be a signal.
 *
 * `pressing` is the one judgement this file makes, and it is the same one
 * `deadlineTone` makes in the inbox: an overdue decision belongs in front of
 * somebody now. Nothing else on a calendar is urgent by virtue of its state —
 * a failed run yesterday needs diagnosis, not a red month.
 */
import type { CSSProperties } from "react";
import {
  AlarmClock,
  AlertTriangle,
  Ban,
  CalendarClock,
  CalendarDays,
  Check,
  Hand,
  Hourglass,
  Play,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { CalendarEventKind, CalendarEventState } from "./api";

export interface StateMeta {
  /** The word shown beside the icon. Always rendered somewhere visible. */
  label: string;
  icon: LucideIcon;
  /** Text and icon colour (an `--oa-*` token). */
  fg: string;
  /** Surface fill. */
  bg: string;
  /** Border colour. */
  border: string;
  /** Solid unless the state is an extrapolation rather than a fact. */
  borderStyle: "solid" | "dashed";
  /** True when this belongs in front of a person now. */
  pressing: boolean;
  /** What the state means, in the owner's language. Used by the legend. */
  description: string;
}

export const STATE_META: Record<CalendarEventState, StateMeta> = {
  scheduled: {
    label: "Scheduled",
    icon: CalendarClock,
    fg: "var(--oa-blue-dark)",
    bg: "var(--oa-surface)",
    border: "var(--oa-blue)",
    borderStyle: "solid",
    pressing: false,
    description:
      "The next firing the scheduler is holding for this workflow. This instant is stored, not worked out here.",
  },
  projected: {
    label: "Projected",
    icon: CalendarDays,
    fg: "var(--oa-muted-strong)",
    bg: "var(--oa-surface)",
    border: "var(--oa-border-strong)",
    borderStyle: "dashed",
    pressing: false,
    description:
      "A later occurrence worked out from the schedule the workflow was activated with. It happens only if the agent stays live and something turns the scheduler.",
  },
  running: {
    label: "Running",
    icon: Play,
    fg: "var(--oa-blue-dark)",
    bg: "var(--oa-soft-blue)",
    border: "var(--oa-blue)",
    borderStyle: "solid",
    pressing: false,
    description: "A run that started and has not finished.",
  },
  awaiting_approval: {
    label: "Paused for you",
    icon: Hand,
    fg: "var(--oa-amber-ink)",
    bg: "var(--oa-surface)",
    border: "var(--oa-amber-border)",
    borderStyle: "solid",
    pressing: false,
    description:
      "A run that stopped mid-flight because a step needs your decision. Shown at the time it started.",
  },
  completed: {
    label: "Completed",
    icon: Check,
    fg: "var(--oa-on-teal)",
    bg: "var(--oa-teal-deep)",
    border: "var(--oa-teal-deep)",
    borderStyle: "solid",
    pressing: false,
    description: "A run that finished with no decision outstanding.",
  },
  failed: {
    label: "Failed",
    icon: AlertTriangle,
    fg: "var(--oa-red-ink)",
    bg: "var(--oa-soft-red)",
    border: "var(--oa-red)",
    borderStyle: "solid",
    pressing: false,
    description: "A run that ended in failure. The reason is on the event.",
  },
  refused: {
    label: "Refused by policy",
    icon: Ban,
    fg: "var(--oa-red-ink)",
    bg: "var(--oa-surface)",
    border: "var(--oa-red)",
    borderStyle: "solid",
    pressing: false,
    description:
      "Policy stopped the operation and ended the run. The guardrail worked; the workflow still did not happen.",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    fg: "var(--oa-muted-strong)",
    bg: "var(--oa-bg-alt)",
    border: "var(--oa-border)",
    borderStyle: "solid",
    pressing: false,
    description: "A run cancelled before it finished.",
  },
  awaiting_decision: {
    label: "Decision due",
    icon: Hourglass,
    fg: "var(--oa-amber-ink)",
    bg: "var(--oa-surface)",
    border: "var(--oa-amber-border)",
    borderStyle: "solid",
    pressing: false,
    description:
      "An approval waiting on you, shown at its deadline — created plus the agent's escalateAfterMins.",
  },
  overdue: {
    label: "Overdue",
    icon: AlarmClock,
    fg: "var(--oa-amber-ink)",
    bg: "var(--oa-soft-amber)",
    border: "var(--oa-amber-border)",
    borderStyle: "solid",
    pressing: true,
    description: "An approval past its deadline. The runtime judged this, not the browser.",
  },
};

/** Legend order: what is coming, what happened, what is waiting. */
export const STATE_ORDER: CalendarEventState[] = [
  "scheduled",
  "projected",
  "running",
  "awaiting_approval",
  "completed",
  "failed",
  "refused",
  "cancelled",
  "awaiting_decision",
  "overdue",
];

export interface KindMeta {
  /** The legend heading — what this group of events IS. */
  label: string;
  /** One word for a row tag, where the heading would not fit. */
  tag: string;
  /** One line about where this kind of event comes from. */
  source: string;
  states: CalendarEventState[];
}

export const KIND_META: Record<CalendarEventKind, KindMeta> = {
  scheduled: {
    label: "Going to happen",
    tag: "Schedule",
    source: "Registered triggers, at the time they are due to fire.",
    states: ["scheduled", "projected"],
  },
  run: {
    label: "Happened",
    tag: "Run",
    source: "Runs, at the time they started.",
    states: ["running", "awaiting_approval", "completed", "failed", "refused", "cancelled"],
  },
  approval: {
    label: "Waiting on you",
    tag: "Approval",
    source: "Pending approvals, at the deadline they must be decided by.",
    states: ["awaiting_decision", "overdue"],
  },
};

export const KIND_ORDER: CalendarEventKind[] = ["scheduled", "run", "approval"];

/**
 * The inline fill for a pill, a legend swatch or an icon chip. Applying the same
 * properties everywhere is what keeps the legend and the grid honest about
 * meaning the same thing.
 *
 * `borderWidth` is set here rather than left to the stylesheet, and that is not
 * housekeeping. `app/app/app.css` resets `.oa button { border: none }`, which is
 * MORE specific than a CSS-module class — so a pill rendered as a button would
 * take the reset's `medium` width and draw a 3px border, while the same pill
 * rendered as a link took 1px. Since the dashed border is what separates a
 * projection from a committed firing without relying on colour, it has to be the
 * same on both. An inline width beats the reset in every case.
 */
export function stateFill(state: CalendarEventState): CSSProperties {
  const meta = STATE_META[state];
  return {
    background: meta.bg,
    borderWidth: 1,
    borderColor: meta.border,
    borderStyle: meta.borderStyle,
    color: meta.fg,
  };
}
