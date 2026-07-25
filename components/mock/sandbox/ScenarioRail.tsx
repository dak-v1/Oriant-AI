"use client";
/**
 * ScenarioRail — the left rail of the sandbox validation workspace (spec
 * §14; S-01): the 3 scenarios plus the 20-case stress test as a 4th entry.
 * Each row: name, business-function category tag, and a status (icon +
 * label, never colour alone). Rows adopt the shared .oa-selectable +
 * .oa-radio affordance; selection never changes a row's height.
 */
import {
  CheckCircle2,
  Circle,
  Loader2,
  Square,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { EntryStatus } from "./stages";
import styles from "./sandbox.module.css";

export interface RailEntry {
  id: string;
  name: string;
  category: string;
  status: EntryStatus;
  /** e.g. "18 of 20 passed" on the stress entry after a run. */
  passNote?: string;
}

const STATUS_META: Record<EntryStatus, { icon: LucideIcon; label: string; cls: string; spin?: boolean }> = {
  not_run: { icon: Circle, label: "Not run", cls: styles.stNeutral },
  running: { icon: Loader2, label: "Running", cls: styles.stActive, spin: true },
  needs_review: { icon: TriangleAlert, label: "Needs review", cls: styles.stAmber },
  passed: { icon: CheckCircle2, label: "Passed", cls: styles.stTeal },
  failed: { icon: XCircle, label: "Failed", cls: styles.stRed },
  stopped: { icon: Square, label: "Stopped", cls: styles.stNeutral },
};

export default function ScenarioRail({
  entries,
  selectedId,
  onSelect,
  locked,
}: {
  entries: RailEntry[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** True while a run or the stress test is active — no switching mid-run. */
  locked: boolean;
}) {
  return (
    <nav className={styles.rail} aria-label="Validation tests">
      <div className={styles.railHead}>
        <p className="oa-micro">Tests</p>
        <span className="oa-sub" style={{ fontSize: 11.5 }}>
          {entries.length} of {entries.length} shown
        </span>
      </div>
      {entries.map((entry) => {
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
              <span className={styles.railMeta}>
                <span className="oa-tag oa-tag--neutral">{entry.category}</span>
              </span>
              <span className={`${styles.railStatus} ${meta.cls}`}>
                <Icon size={13} aria-hidden className={meta.spin ? "oa-spin" : undefined} />
                {meta.label}
                {entry.passNote ? ` · ${entry.passNote}` : ""}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
