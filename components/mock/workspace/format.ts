/**
 * components/mock/workspace/format.ts — tiny deterministic label helpers for
 * the workspace screens. Fixture dates are ISO strings inside July 2026;
 * formatting derives only from those strings (UTC), never from the runtime
 * clock (spec §22).
 */
import { DEMO_TODAY } from "@/lib/mock/fixtures/ids";
import type { OperatingMode, WorkspaceTeam } from "@/lib/mock/types";

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-07-27" → "Mon 27 Jul" (deterministic, UTC-based). */
export function dayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return `${WEEKDAYS_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

/** Due label for approvals: "Today 14:30" or "Mon 27 Jul · 15:00". */
export function dueLabel(dueAt: string, dueTime: string): string {
  return dueAt === DEMO_TODAY ? `Today ${dueTime}` : `${dayLabel(dueAt)} · ${dueTime}`;
}

export const TEAM_LABEL: Record<Exclude<WorkspaceTeam, "overview" | "agents">, string> = {
  customer_care: "Customer Care",
  admin: "Admin",
  marketing: "Marketing",
  finance: "Finance",
};

export const MODE_LABEL: Record<OperatingMode, string> = {
  draft_only: "Draft only",
  act_after_approval: "Acts after approval",
  auto_within_limits: "Automatic within limits",
};
