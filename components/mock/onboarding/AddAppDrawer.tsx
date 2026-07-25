"use client";
/**
 * AddAppDrawer — the "+ Add app" drawer for the onboarding tools step
 * (improvement spec §7.2). Four tabs:
 *   1. App catalog: searchable hardcoded catalog, add/remove directly.
 *   2. MCP connections: the five MCP fixtures, read-only, plain language.
 *   3. Custom app: name + category + purpose -> addCustomTool (no credentials).
 *   4. Connected apps: selected + custom tools with status chips + Remove.
 * Everything is deterministic and persists through the store (§7.3).
 */
import { useMemo, useState } from "react";
import { Check, Plug, Plus, Search, X } from "lucide-react";
import Drawer from "@/components/mock/ui/Drawer";
import { toast } from "@/components/mock/ui/Toaster";
import { useDemoStore } from "@/lib/mock/store";
import type { CustomTool } from "@/lib/mock/types";
import { INTEGRATIONS } from "@/lib/mock/fixtures/integrations";
import {
  TOOL_CATALOG,
  TOOL_CATEGORY_LABELS,
  TOOL_CATEGORY_ORDER,
} from "@/lib/mock/fixtures/demo-company";
import ToolMark from "./ToolMark";
import styles from "./onboarding.module.css";

export type AddAppTab = "catalog" | "mcp" | "custom" | "connected";

const TABS: { id: AddAppTab; label: string }[] = [
  { id: "catalog", label: "App catalog" },
  { id: "mcp", label: "MCP connections" },
  { id: "custom", label: "Custom app" },
  { id: "connected", label: "Connected apps" },
];

const MCP_TOOLS = Object.values(INTEGRATIONS).filter((d) => d.kind === "mcp");

/** Mirrors the id derivation in store.addCustomTool for duplicate checks. */
const customId = (name: string) =>
  `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

export default function AddAppDrawer({
  open,
  tab,
  onTabChange,
  onClose,
}: {
  open: boolean;
  tab: AddAppTab;
  onTabChange: (tab: AddAppTab) => void;
  onClose: () => void;
}) {
  const selectedToolIds = useDemoStore((s) => s.onboarding.selectedToolIds);
  const customTools = useDemoStore((s) => s.onboarding.customTools);
  const toggleTool = useDemoStore((s) => s.toggleTool);
  const addCustomTool = useDemoStore((s) => s.addCustomTool);
  const removeCustomTool = useDemoStore((s) => s.removeCustomTool);

  const [query, setQuery] = useState("");
  const [customName, setCustomName] = useState("");
  const [customCategory, setCustomCategory] = useState<CustomTool["category"]>("other");
  const [customPurpose, setCustomPurpose] = useState("");

  const q = query.trim().toLowerCase();
  const filteredCatalog = useMemo(
    () =>
      TOOL_CATALOG.filter(
        (t) =>
          !q ||
          t.name.toLowerCase().includes(q) ||
          t.purpose.toLowerCase().includes(q),
      ),
    [q],
  );

  const selectedCatalog = selectedToolIds
    .map((id) => TOOL_CATALOG.find((t) => t.id === id))
    .filter((t): t is (typeof TOOL_CATALOG)[number] => Boolean(t));

  const canSubmitCustom =
    customName.trim().length > 0 && customPurpose.trim().length > 0;

  /* Tabs: arrow-key support with roving tabindex (spec §19). */
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const ids = TABS.map((t) => t.id);
    const idx = ids.indexOf(tab);
    const next = ids[(idx + (e.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length];
    onTabChange(next);
    document.getElementById(`addapp-tab-${next}`)?.focus();
  };

  const submitCustom = () => {
    const name = customName.trim();
    const purpose = customPurpose.trim();
    if (!name || !purpose) return;
    if (customTools.some((t) => t.id === customId(name))) {
      toast({
        title: "Already in your tools",
        detail: `${name} was added earlier. Manage it under Connected apps.`,
        tone: "info",
      });
      return;
    }
    addCustomTool({ name, category: customCategory, purpose });
    toast({
      title: "Custom app added",
      detail: `${name} now appears in Your tools with a Custom badge.`,
      tone: "ok",
    });
    setCustomName("");
    setCustomPurpose("");
    setCustomCategory("other");
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="Tools"
      title="Add app"
      footer={
        <button type="button" className="oa-btn oa-btn--ghost" onClick={onClose}>
          Done
        </button>
      }
    >
      <div className={styles.drawerTabsWrap}>
        <div
          className="oa-tabs"
          role="tablist"
          aria-label="Add app sections"
          onKeyDown={onTabKey}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`addapp-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`addapp-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className={`oa-tab ${tab === t.id ? "oa-tab--active" : ""}`}
              onClick={() => onTabChange(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "catalog" && (
        <div
          role="tabpanel"
          id="addapp-panel-catalog"
          aria-labelledby="addapp-tab-catalog"
          className={styles.drawerStack}
        >
          <div className={styles.searchWrap}>
            <Search size={15} aria-hidden />
            <input
              type="search"
              className={`oa-input ${styles.searchInput}`}
              placeholder="Search the app catalog"
              aria-label="Search the app catalog"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className={styles.drawerList}>
            {filteredCatalog.map((t) => {
              const selected = selectedToolIds.includes(t.id);
              return (
                <div key={t.id} className={styles.drawerRow}>
                  <ToolMark name={t.name} />
                  <div className={styles.yourToolMeta}>
                    <span className={styles.yourToolName}>{t.name}</span>
                    <span className={styles.yourToolSub}>
                      {TOOL_CATEGORY_LABELS[t.category]} · {t.purpose}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`oa-btn oa-btn--sm ${selected ? "oa-btn--ghost" : "oa-btn--soft"}`}
                    onClick={() => toggleTool(t.id)}
                  >
                    {selected ? (
                      <>
                        <X size={13} aria-hidden />
                        Remove
                      </>
                    ) : (
                      <>
                        <Plus size={13} aria-hidden />
                        Add
                      </>
                    )}
                  </button>
                </div>
              );
            })}
            {filteredCatalog.length === 0 && (
              <p className="oa-sub">
                Nothing in the catalog matches &ldquo;{query.trim()}&rdquo;.
                Add it as a custom app instead.
              </p>
            )}
          </div>
        </div>
      )}

      {tab === "mcp" && (
        <div
          role="tabpanel"
          id="addapp-panel-mcp"
          aria-labelledby="addapp-tab-mcp"
          className={styles.drawerStack}
        >
          <p className="oa-sub">
            Secure tool connections that Oriant manages for your agents. They
            become available during activation, with your approval. Nothing
            connects while you are onboarding.
          </p>
          <div className={styles.drawerList}>
            {MCP_TOOLS.map((m) => (
              <div key={m.id} className={styles.drawerRow}>
                <span className={styles.toolMark} aria-hidden>
                  <Plug size={14} />
                </span>
                <div className={styles.yourToolMeta}>
                  <span className={styles.yourToolName}>{m.name}</span>
                  <span className={styles.yourToolSubWrap}>{m.purpose}</span>
                </div>
                <span className="oa-status oa-status--neutral">
                  Available during activation
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "custom" && (
        <div
          role="tabpanel"
          id="addapp-panel-custom"
          aria-labelledby="addapp-tab-custom"
          className={styles.customForm}
        >
          <p className="oa-sub">
            Tell Oriant about a tool that is not in the catalog. No credentials
            or setup needed; this only records that the tool exists.
          </p>
          <div className="oa-field">
            <label className="oa-label" htmlFor="addapp-custom-name">
              App name
            </label>
            <input
              id="addapp-custom-name"
              className="oa-input"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g. ServiceM8"
            />
          </div>
          <div className="oa-field">
            <label className="oa-label" htmlFor="addapp-custom-category">
              Category
            </label>
            <select
              id="addapp-custom-category"
              className="oa-select"
              value={customCategory}
              onChange={(e) =>
                setCustomCategory(e.target.value as CustomTool["category"])
              }
            >
              {TOOL_CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {TOOL_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="oa-field">
            <label className="oa-label" htmlFor="addapp-custom-purpose">
              What is it used for?
            </label>
            <input
              id="addapp-custom-purpose"
              className="oa-input"
              value={customPurpose}
              onChange={(e) => setCustomPurpose(e.target.value)}
              placeholder="e.g. Job scheduling for field technicians"
            />
          </div>
          <div>
            <button
              type="button"
              className="oa-btn oa-btn--dark"
              disabled={!canSubmitCustom}
              onClick={submitCustom}
            >
              <Plus size={14} aria-hidden />
              Add custom app
            </button>
          </div>
        </div>
      )}

      {tab === "connected" && (
        <div
          role="tabpanel"
          id="addapp-panel-connected"
          aria-labelledby="addapp-tab-connected"
          className={styles.drawerStack}
        >
          <p className="oa-sub">
            Everything you selected or added so far. Nothing is connected yet;
            you approve every real connection during activation.
          </p>
          <div className={styles.drawerList}>
            {selectedCatalog.map((t) => (
              <div key={t.id} className={styles.drawerRow}>
                <ToolMark name={t.name} />
                <div className={styles.yourToolMeta}>
                  <span className={styles.yourToolName}>{t.name}</span>
                  <span className={styles.yourToolSub}>
                    {TOOL_CATEGORY_LABELS[t.category]} · {t.purpose}
                  </span>
                </div>
                <span className="oa-status oa-status--neutral">Selected</span>
                <button
                  type="button"
                  className="oa-btn oa-btn--ghost oa-btn--icon"
                  aria-label={`Remove ${t.name}`}
                  onClick={() => toggleTool(t.id)}
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            ))}
            {customTools.map((t) => (
              <div key={t.id} className={styles.drawerRow}>
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
                <span className="oa-status oa-status--neutral">Selected</span>
                <button
                  type="button"
                  className="oa-btn oa-btn--ghost oa-btn--icon"
                  aria-label={`Remove ${t.name}`}
                  onClick={() => removeCustomTool(t.id)}
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            ))}
            {selectedCatalog.length === 0 && customTools.length === 0 && (
              <p className="oa-sub">
                No tools yet. Add them from the App catalog or as a custom app.
              </p>
            )}
          </div>
          <span className="oa-sim-note">
            <Check size={12} aria-hidden />
            Saved automatically. Your list is kept for Discovery and planning.
          </span>
        </div>
      )}
    </Drawer>
  );
}
