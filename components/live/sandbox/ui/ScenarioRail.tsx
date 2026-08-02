"use client";
/**
 * ScenarioRail — the test list down the left of the workspace.
 *
 * ADAPTED FROM components/mock/sandbox/ScenarioRail.tsx. The rows are the
 * mock's: `.oa-selectable` + `.oa-radio`, the name, the category tag, and a
 * status conveyed by icon + label and never by colour alone. Three differences,
 * all of them consequences of the list being real:
 *
 * 1. THE ENTRIES ARE THE RUNTIME'S. The mock listed three fixture scenarios by
 *    id, hard-coded, plus a fourth synthetic row for a 20-case stress test whose
 *    result was a constant. These come from `GET /api/runtime/sandbox`, which
 *    generates the scenario library for whatever plan the runtime holds. There
 *    may be one; there may be twenty; there is exactly one row per case the
 *    plan will actually be judged by.
 *
 * 2. A ROW SAYS WHICH AGENT IT PROVES. With a generated suite, two rows can
 *    carry near-identical names for different agents, and "which agent is this
 *    about" is the question `byAgent` turns into a blocker. The mock never
 *    needed it because its three cases were about one demo business.
 *
 * 3. THERE IS NO "NEEDS REVIEW" STATUS. The mock used amber for a run paused at
 *    its checkpoint — a state its timeline could sit in. The runtime judges a
 *    scenario `passed` or not, in code, and a run that stopped at an approval
 *    because its scenario expected exactly that is a PASS. Colouring it amber
 *    would invent a third verdict the runtime does not have. What the row does
 *    carry is the final status word, in `note`, so the shape of the pass is
 *    visible without being re-judged here.
 *
 * The stress sweep keeps its place as the last row, as in the mock, because it
 * is the other half of what Activation gates on and a person looking for it
 * looks in the list of tests.
 */

import {
  CheckCircle2,
  Circle,
  CircleHelp,
  Loader2,
  Square,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import styles from "./sandbox.module.css";

export type EntryStatus =
  /** No result has been read for this test in this tab. */
  | "not_run"
  /** A request for it is in flight right now. */
  | "running"
  | "passed"
  | "failed"
  /** This tab stopped waiting for the answer. Not a verdict; see the screen. */
  | "abandoned"
  /** A result exists but this screen cannot say what it means. */
  | "unknown";

export interface RailEntry {
  id: string;
  name: string;
  category: string;
  /** Null on the stress sweep, which is about the whole plan rather than one agent. */
  agentId: string | null;
  status: EntryStatus;
  /** e.g. "awaiting_approval" or "41 of 41 cases". Never a judgement of its own. */
  note?: string;
}

const STATUS_META: Record<
  EntryStatus,
  { icon: LucideIcon; label: string; cls: string; spin?: boolean }
> = {
  not_run: { icon: Circle, label: "Not run", cls: styles.stNeutral },
  running: { icon: Loader2, label: "Running", cls: styles.stActive, spin: true },
  passed: { icon: CheckCircle2, label: "Passed", cls: styles.stTeal },
  failed: { icon: XCircle, label: "Failed", cls: styles.stRed },
  abandoned: { icon: Square, label: "Answer not received", cls: styles.stNeutral },
  unknown: { icon: CircleHelp, label: "Unreadable", cls: styles.stAmber },
};

export default function ScenarioRail({
  entries,
  selectedId,
  onSelect,
  locked,
  headNote,
}: {
  entries: RailEntry[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** True while a run is in flight — no switching mid-request. */
  locked: boolean;
  /** What the count above the list means, in one short phrase. */
  headNote: string;
}) {
  /* Grouped by the category the RUNTIME published, in the order it published
     them — `GET /api/runtime/sandbox` groups the library itself, and re-sorting
     here would present a different shape of suite than the endpoint reports. */
  const groups: { category: string; rows: RailEntry[] }[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.category === entry.category) last.rows.push(entry);
    else groups.push({ category: entry.category, rows: [entry] });
  }

  return (
    <nav className={styles.rail} aria-label="Sandbox tests">
      <div className={styles.railHead}>
        <p className="oa-micro">Tests</p>
        <span className="oa-sub" style={{ fontSize: 11.5 }}>
          {headNote}
        </span>
      </div>
      {groups.map((group) => (
        <div key={group.category} style={{ display: "grid", gap: 10 }}>
          <p className={styles.railGroup}>{group.category}</p>
          {group.rows.map((entry) => {
            const isSelected = entry.id === selectedId;
            const meta = STATUS_META[entry.status];
            const Icon = meta.icon;
            return (
              <button
                key={entry.id}
                type="button"
                className={`oa-selectable ${styles.railRow} ${isSelected ? "oa-selectable--selected" : ""}`}
                aria-pressed={isSelected}
                disabled={locked && !isSelected}
                onClick={() => onSelect(entry.id)}
              >
                <span className="oa-radio" aria-hidden />
                <span className={styles.railBody}>
                  <span className={styles.railName}>{entry.name}</span>
                  {entry.agentId !== null && (
                    <span className={styles.railAgent}>{entry.agentId}</span>
                  )}
                  <span className={`${styles.railStatus} ${meta.cls}`}>
                    <Icon size={13} aria-hidden className={meta.spin ? "oa-spin" : undefined} />
                    {meta.label}
                    {entry.note !== undefined ? ` · ${entry.note}` : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
