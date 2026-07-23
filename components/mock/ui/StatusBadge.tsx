"use client";
/**
 * StatusBadge — the one canonical mapping from any mock status to a
 * `.oa-status` badge. Colour is never the only signal: every badge carries
 * its text label (spec §3, §18.2, §21).
 */

const MAP: Record<string, { cls: string; label: string }> = {
  /* approvals + calendar (spec §18.2) */
  pending: { cls: "pending", label: "Pending approval" },
  pending_approval: { cls: "pending", label: "Pending approval" },
  review_requested: { cls: "review", label: "Review requested" },
  needs_changes: { cls: "review", label: "Review requested" },
  approved: { cls: "approved", label: "Approved" },
  completed: { cls: "completed", label: "Completed" },
  failed: { cls: "failed", label: "Failed" },
  /* agents */
  recommended: { cls: "neutral", label: "Recommended" },
  needs_information: { cls: "pending", label: "Needs information" },
  needs_configuration: { cls: "review", label: "Needs configuration" },
  ready_to_build: { cls: "ready", label: "Ready to build" },
  building: { cls: "active", label: "Building" },
  validated: { cls: "completed", label: "Validated" },
  active: { cls: "active", label: "Active" },
  /* integrations */
  connected: { cls: "connected", label: "Connected" },
  required: { cls: "required", label: "Required" },
  optional: { cls: "optional", label: "Optional" },
  needs_approval: { cls: "pending", label: "Needs approval" },
  /* build jobs */
  queued: { cls: "neutral", label: "Queued" },
  generating: { cls: "active", label: "Generating" },
  validating: { cls: "review", label: "Validating" },
  /* deploy */
  ready: { cls: "ready", label: "Ready" },
  activating: { cls: "active", label: "Activating" },
};

export default function StatusBadge({
  status,
  label,
}: {
  status: string;
  /** Optional label override (e.g. "Approved · v2"). */
  label?: string;
}) {
  const entry = MAP[status] ?? { cls: "neutral", label: status.replace(/_/g, " ") };
  return <span className={`oa-status oa-status--${entry.cls}`}>{label ?? entry.label}</span>;
}
