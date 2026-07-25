/**
 * report-utils — tiny pure helpers shared by the report components.
 * Dates come from fixture ISO strings and are formatted by string parsing
 * (never `new Date`) so output stays deterministic in every timezone.
 */
import { OWNER, PEOPLE } from "@/lib/mock/fixtures/ids";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-07-24" (or full ISO) → "24 July 2026". */
export function formatDemoDate(iso: string): string {
  const [date] = iso.split("T");
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "2026-07-24T09:30:00+08:00" → "24 July 2026, 09:30". */
export function formatDemoDateTime(iso: string): string {
  const time = iso.split("T")[1]?.slice(0, 5);
  return time ? `${formatDemoDate(iso)}, ${time}` : formatDemoDate(iso);
}

/** "Priya Nair" → "PN". */
export function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Process-owner options for "Assign process owner" (owner + team leads). */
export const PROCESS_OWNER_OPTIONS: { name: string; role: string }[] = [
  { name: OWNER.name, role: "Owner" },
  { name: PEOPLE.careLead, role: "Customer Care lead" },
  { name: PEOPLE.opsLead, role: "Field Operations lead" },
  { name: PEOPLE.marketingLead, role: "Marketing coordinator" },
  { name: PEOPLE.financeLead, role: "Finance lead" },
];

export function roleFor(name: string): string {
  return PROCESS_OWNER_OPTIONS.find((p) => p.name === name)?.role ?? "Team member";
}
