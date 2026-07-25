"use client";
/**
 * ToolsStep — onboarding step 3 (spec §7.3, improvement spec §7).
 *
 * "Your tools" first (selected + custom, custom carries a Custom badge and
 * Remove), then search + business-function filter chips, then the catalog
 * grouped by function. Every row/card shows a tool mark, name, category and
 * one-line purpose. "+ Add app" is clearly outlined in the step header AND at
 * the end of the list; it opens a four-tab drawer (catalog / MCP / custom /
 * connected). Selection ≠ connection; a quiet note makes that explicit.
 */
import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Info, Plus, Search, X } from "lucide-react";
import type { ToolCategory } from "@/lib/mock/types";
import {
  TOOL_CATALOG,
  TOOL_CATEGORY_LABELS,
  TOOL_CATEGORY_ORDER,
  type CatalogTool,
} from "@/lib/mock/fixtures/demo-company";
import { useDemoStore } from "@/lib/mock/store";
import { DUR, EASE } from "@/lib/mock/motion";
import AddAppDrawer, { type AddAppTab } from "./AddAppDrawer";
import ToolMark from "./ToolMark";
import styles from "./onboarding.module.css";

const BY_ID = new Map(TOOL_CATALOG.map((t) => [t.id, t]));

/** Categories that actually have catalog tools (filter chips). */
const CHIP_CATEGORIES = TOOL_CATEGORY_ORDER.filter((cat) =>
  TOOL_CATALOG.some((t) => t.category === cat),
);

export default function ToolsStep({
  selectedToolIds,
  onToggle,
}: {
  selectedToolIds: string[];
  onToggle: (toolId: string) => void;
}) {
  const reduced = useReducedMotion();
  const customTools = useDemoStore((s) => s.onboarding.customTools);
  const removeCustomTool = useDemoStore((s) => s.removeCustomTool);

  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<ToolCategory | "all">("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<AddAppTab>("catalog");

  const openDrawer = (tab: AddAppTab) => {
    setDrawerTab(tab);
    setDrawerOpen(true);
  };

  const selectedTools = selectedToolIds
    .map((id) => BY_ID.get(id))
    .filter((t): t is CatalogTool => Boolean(t));
  const yourToolCount = selectedTools.length + customTools.length;

  const q = query.trim().toLowerCase();
  const groups = useMemo(
    () =>
      TOOL_CATEGORY_ORDER.filter((cat) => activeCat === "all" || cat === activeCat)
        .map((cat) => ({
          cat,
          label: TOOL_CATEGORY_LABELS[cat],
          tools: TOOL_CATALOG.filter(
            (t) =>
              t.category === cat &&
              (!q ||
                t.name.toLowerCase().includes(q) ||
                t.purpose.toLowerCase().includes(q)),
          ),
        }))
        .filter((g) => g.tools.length > 0),
    [q, activeCat],
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className={styles.toolsHead}>
        <div style={{ display: "grid", gap: 6, minWidth: 220, flex: 1 }}>
          <h2 className="oa-h3">Which tools does your team already use?</h2>
          <p className="oa-sub">
            Pick everything the team touches in a normal week. It tells Oriant
            where work already lives.
          </p>
        </div>
        <button
          type="button"
          className="oa-btn oa-btn--ghost"
          onClick={() => openDrawer("catalog")}
        >
          <Plus size={15} aria-hidden />
          Add app
        </button>
      </div>

      <div className={styles.yourTools}>
        <div className="oa-between">
          <span className="oa-micro">Your tools</span>
          <span className="oa-sub" aria-live="polite">
            {yourToolCount} selected
          </span>
        </div>
        <div className={styles.yourToolList}>
          <AnimatePresence initial={false}>
            {selectedTools.map((t) => (
              <motion.div
                key={t.id}
                layout={!reduced}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: DUR.micro, ease: EASE }}
                className={styles.yourToolRow}
              >
                <ToolMark name={t.name} />
                <div className={styles.yourToolMeta}>
                  <span className={styles.yourToolName}>{t.name}</span>
                  <span className={styles.yourToolSub}>
                    {TOOL_CATEGORY_LABELS[t.category]} · {t.purpose}
                  </span>
                </div>
                <button
                  type="button"
                  className="oa-btn oa-btn--ghost oa-btn--icon"
                  aria-label={`Remove ${t.name} from your tools`}
                  onClick={() => onToggle(t.id)}
                >
                  <X size={14} aria-hidden />
                </button>
              </motion.div>
            ))}
            {customTools.map((t) => (
              <motion.div
                key={t.id}
                layout={!reduced}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: DUR.micro, ease: EASE }}
                className={styles.yourToolRow}
              >
                <ToolMark name={t.name} />
                <div className={styles.yourToolMeta}>
                  <span className={styles.yourToolName}>
                    {t.name}
                    <span className="oa-tag oa-tag--amber">Custom</span>
                  </span>
                  <span className={styles.yourToolSub}>
                    {TOOL_CATEGORY_LABELS[t.category]} · {t.purpose}
                  </span>
                </div>
                <button
                  type="button"
                  className="oa-btn oa-btn--ghost oa-btn--icon"
                  aria-label={`Remove ${t.name} from your tools`}
                  onClick={() => removeCustomTool(t.id)}
                >
                  <X size={14} aria-hidden />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
          {yourToolCount === 0 && (
            <p className="oa-sub" style={{ fontStyle: "italic", margin: 0 }}>
              Select tools below, or use Add app for anything not listed. They
              gather here.
            </p>
          )}
        </div>
        <span className="oa-sim-note">
          <Info size={12} aria-hidden />
          Selecting a tool connects nothing. Connections happen later, with
          your approval.
        </span>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <div className={styles.searchWrap}>
          <Search size={15} aria-hidden />
          <input
            type="search"
            className={`oa-input ${styles.searchInput}`}
            placeholder="Search tools: Gmail, HubSpot, Xero…"
            aria-label="Search tools"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className={styles.filterChips} role="group" aria-label="Filter by category">
          <button
            type="button"
            className={`oa-chip ${activeCat === "all" ? "oa-chip--selected" : ""}`}
            aria-pressed={activeCat === "all"}
            onClick={() => setActiveCat("all")}
          >
            All
          </button>
          {CHIP_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`oa-chip ${activeCat === cat ? "oa-chip--selected" : ""}`}
              aria-pressed={activeCat === cat}
              onClick={() => setActiveCat(activeCat === cat ? "all" : cat)}
            >
              {TOOL_CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.catList}>
        {groups.map((g) => (
          <div key={g.cat} className={styles.catGroup}>
            <span className="oa-micro">{g.label}</span>
            <div className={styles.toolGrid}>
              {g.tools.map((t) => {
                const selected = selectedToolIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`oa-selectable ${styles.toolCard} ${
                      selected ? "oa-selectable--selected" : ""
                    }`}
                    aria-pressed={selected}
                    onClick={() => onToggle(t.id)}
                  >
                    <ToolMark name={t.name} />
                    <span className={styles.toolCardMeta}>
                      <span className={styles.toolCardName}>{t.name}</span>
                      <span className={styles.toolCardPurpose}>{t.purpose}</span>
                      <span className={styles.toolCardCat}>
                        {TOOL_CATEGORY_LABELS[t.category]}
                      </span>
                    </span>
                    <span className="oa-check-badge" aria-hidden>
                      <Check size={13} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <div style={{ display: "grid", gap: 10, justifyItems: "start" }}>
            <p className="oa-sub" style={{ margin: 0 }}>
              No tools match &ldquo;{query.trim()}&rdquo;. Add it as a custom
              app instead.
            </p>
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--sm"
              onClick={() => openDrawer("custom")}
            >
              <Plus size={13} aria-hidden />
              Add custom app
            </button>
          </div>
        )}
      </div>

      <div className={styles.addRowEnd}>
        <button
          type="button"
          className="oa-btn oa-btn--ghost"
          onClick={() => openDrawer("catalog")}
        >
          <Plus size={15} aria-hidden />
          Add app
        </button>
      </div>

      <AddAppDrawer
        open={drawerOpen}
        tab={drawerTab}
        onTabChange={setDrawerTab}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
