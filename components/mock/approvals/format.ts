/**
 * components/mock/approvals/format.ts — deterministic label helpers for the
 * Approval Inbox. Every date comes from a fixture ISO string inside July
 * 2026; nothing is derived from the runtime clock (spec §22).
 */
import { DEMO_TODAY } from "@/lib/mock/fixtures/ids";
import type { ApprovalItem, WorkspaceTeam } from "@/lib/mock/types";

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-07-25" → "Sat 25 Jul" (UTC-based, deterministic). */
export function dayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return `${WEEKDAYS_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

/** Due label for approval cards: "Today 14:30" or "Mon 27 Jul · 15:00". */
export function dueLabel(dueAt: string, dueTime: string): string {
  return dueAt === DEMO_TODAY ? `Today ${dueTime}` : `${dayLabel(dueAt)} · ${dueTime}`;
}

/**
 * Version/comment stamps: fixture ISO strings become "23 Jul · 17:20";
 * anything else ("Just now") passes through untouched.
 */
export function stampLabel(at: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(at)) return at;
  const day = Number(at.slice(8, 10));
  const month = MONTHS_SHORT[Number(at.slice(5, 7)) - 1] ?? "";
  return `${day} ${month} · ${at.slice(11, 16)}`;
}

export const TEAM_LABEL: Record<Exclude<WorkspaceTeam, "overview" | "agents">, string> = {
  customer_care: "Customer Care",
  admin: "Admin",
  marketing: "Marketing",
  finance: "Finance",
};

/** Risk → tag tone. Matches the calendar day-drawer treatment exactly. */
export const RISK_TAG: Record<ApprovalItem["risk"], string> = {
  low: "oa-tag--teal",
  medium: "oa-tag--neutral",
  high: "oa-tag--amber",
};

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
