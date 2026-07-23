"use client";
/**
 * ToolsStep — onboarding step 3 (spec §7.3): searchable tool chips grouped by
 * category. Selected tools animate into the "Existing systems" summary panel
 * (framer-motion layout animations). Selection ≠ connection — a quiet note
 * makes that explicit.
 */
import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Info, Plus, Search, X } from "lucide-react";
import type { ToolCategory, ToolChip } from "@/lib/mock/types";
import {
  TOOL_CATALOG,
  TOOL_CATEGORY_LABELS,
} from "@/lib/mock/fixtures/demo-company";
import { DUR, EASE } from "@/lib/mock/motion";
import styles from "./onboarding.module.css";

const CATEGORY_ORDER = Object.keys(TOOL_CATEGORY_LABELS) as ToolCategory[];
const BY_ID = new Map(TOOL_CATALOG.map((t) => [t.id, t]));

export default function ToolsStep({
  selectedToolIds,
  onToggle,
}: {
  selectedToolIds: string[];
  onToggle: (toolId: string) => void;
}) {
  const reduced = useReducedMotion();
  const [query, setQuery] = useState("");

  const selectedTools = selectedToolIds
    .map((id) => BY_ID.get(id))
    .filter((t): t is ToolChip => Boolean(t));

  const q = query.trim().toLowerCase();
  const groups = useMemo(
    () =>
      CATEGORY_ORDER.map((cat) => ({
        cat,
        label: TOOL_CATEGORY_LABELS[cat],
        tools: TOOL_CATALOG.filter(
          (t) => t.category === cat && (!q || t.name.toLowerCase().includes(q)),
        ),
      })).filter((g) => g.tools.length > 0),
    [q],
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <h2 className="oa-h3">Which tools does your team already use?</h2>
        <p className="oa-sub">
          Pick everything the team touches in a normal week — it tells Oriant
          where work already lives.
        </p>
      </div>

      <div className={styles.systemsPanel}>
        <div className="oa-between">
          <span className="oa-micro">Existing systems</span>
          <span className="oa-sub" aria-live="polite">
            {selectedTools.length} selected
          </span>
        </div>
        <div className={styles.systemsChips}>
          <AnimatePresence initial={false}>
            {selectedTools.map((t) => (
              <motion.button
                key={t.id}
                type="button"
                layout={!reduced}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.85 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
                transition={{ duration: DUR.micro, ease: EASE }}
                className="oa-chip oa-chip--selected"
                onClick={() => onToggle(t.id)}
                aria-label={`Remove ${t.name} from existing systems`}
              >
                {t.name}
                <X size={12} aria-hidden />
              </motion.button>
            ))}
          </AnimatePresence>
          {selectedTools.length === 0 && (
            <p className="oa-sub" style={{ fontStyle: "italic", margin: 0 }}>
              Tap tools below — they gather here as your existing systems.
            </p>
          )}
        </div>
        <span className="oa-sim-note">
          <Info size={12} aria-hidden />
          Selecting a tool doesn’t connect it — connections happen later, with
          your approval.
        </span>
      </div>

      <div className={styles.searchWrap}>
        <Search size={15} aria-hidden />
        <input
          type="search"
          className={`oa-input ${styles.searchInput}`}
          placeholder="Search tools — Gmail, HubSpot, Xero…"
          aria-label="Search tools"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className={styles.catList}>
        {groups.map((g) => (
          <div key={g.cat} className={styles.catGroup}>
            <span className="oa-micro">{g.label}</span>
            <div className={styles.chipRow}>
              {g.tools.map((t) => {
                const selected = selectedToolIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`oa-chip ${selected ? "oa-chip--selected" : ""}`}
                    aria-pressed={selected}
                    onClick={() => onToggle(t.id)}
                  >
                    {selected ? (
                      <Check size={13} aria-hidden />
                    ) : (
                      <Plus size={13} aria-hidden />
                    )}
                    {t.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="oa-sub">
            No tools match “{query.trim()}” — Discovery can capture anything
            missing from this list.
          </p>
        )}
      </div>
    </div>
  );
}
