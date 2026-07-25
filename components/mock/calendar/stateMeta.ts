/**
 * components/mock/calendar/stateMeta.ts — the ONE source of truth for how a
 * calendar-event state looks anywhere in the product (spec §17.1, C-01):
 * month pills, day-timeline blocks, legends, event details, the approvals
 * screen's compact calendar and approval-card status accents.
 *
 * Treatments mirror the legend exactly: pending amber outline, approved
 * near-black fill, completed deep-teal fill, needs-changes blue outline,
 * failed red tint plus red border. Colour is never the only signal; every
 * use of these treatments carries a text label as well (spec §21).
 */
import type { CSSProperties } from "react";
import {
  AlertTriangle,
  CalendarCheck,
  Check,
  Hand,
  PenLine,
  type LucideIcon,
} from "lucide-react";
import type { ApprovalStatus, CalendarEventState } from "@/lib/mock/types";

export interface CalendarStateMeta {
  label: string;
  icon: LucideIcon;
  /** Text and icon colour (an --oa token). */
  fg: string;
  /** Surface fill (an --oa token). */
  bg: string;
  /** Border colour (an --oa token). */
  border: string;
  /** Plain-language description of the treatment (legend tooltips). */
  treatment: string;
}

export const STATE_META: Record<CalendarEventState, CalendarStateMeta> = {
  pending_approval: {
    label: "Pending approval",
    icon: Hand,
    fg: "var(--oa-amber-ink)",
    bg: "var(--oa-surface)",
    border: "var(--oa-amber-border)",
    treatment: "Amber outline with a hand icon: scheduled, waiting on your decision",
  },
  approved: {
    label: "Approved",
    icon: CalendarCheck,
    fg: "var(--oa-on-blue)",
    bg: "var(--oa-dark)",
    border: "var(--oa-dark)",
    treatment: "Near-black fill: approved and scheduled to run",
  },
  completed: {
    label: "Completed",
    icon: Check,
    fg: "var(--oa-on-teal)",
    bg: "var(--oa-teal-deep)",
    border: "var(--oa-teal-deep)",
    treatment: "Deep teal fill: finished successfully",
  },
  needs_changes: {
    label: "Review requested",
    icon: PenLine,
    fg: "var(--oa-blue-dark)",
    bg: "var(--oa-surface)",
    border: "var(--oa-blue)",
    treatment: "Blue outline: you asked the agent for changes",
  },
  failed: {
    label: "Failed",
    icon: AlertTriangle,
    fg: "var(--oa-red-ink)",
    bg: "var(--oa-soft-red)",
    border: "var(--oa-red)",
    treatment: "Red tint and border with an alert icon: run failed, recovery noted in the detail",
  },
};

/** Legend rendering order (lifecycle order, matches the spec §17.1 table). */
export const STATE_ORDER = Object.keys(STATE_META) as CalendarEventState[];

/**
 * Inline fill for pills, legend swatches and icon chips. Applying the same
 * three properties everywhere is what keeps C-01 true by construction.
 */
export function stateFill(state: CalendarEventState): CSSProperties {
  const meta = STATE_META[state];
  return { background: meta.bg, borderColor: meta.border, color: meta.fg };
}

/**
 * Approval statuses share the calendar's visual language (C-01): an approval
 * card's status accent uses the same treatment as its calendar-event state.
 */
export const APPROVAL_STATE: Record<ApprovalStatus, CalendarEventState> = {
  pending: "pending_approval",
  review_requested: "needs_changes",
  approved: "approved",
  completed: "completed",
  failed: "failed",
};
