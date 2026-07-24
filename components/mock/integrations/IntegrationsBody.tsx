"use client";
/**
 * IntegrationsBody — the shared body of /app/integrations and
 * /app/workspace/integrations (spec §12; §20 "Integrations" motion row).
 *
 * The readable answer to a dense admin panel: search + four tabs
 * (Recommended for your plan / Connected apps / Available apps / MCP and
 * internal tools), generous plan-first cards, a plain-language MCP explainer
 * and the 4-step mock connection wizard. All content is fixture-driven;
 * connection state lives in the demo store.
 */
import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Cable, Search } from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import { INTEGRATIONS, INTEGRATION_TAB_ORDER } from "@/lib/mock/fixtures/integrations";
import { RECOMMENDED_APP_IDS } from "@/lib/mock/fixtures/ids";
import type { IntegrationDef, IntegrationStatus } from "@/lib/mock/types";
import { DUR, EASE } from "@/lib/mock/motion";
import {
  AvailableCard,
  ConnectedRow,
  McpCard,
  RecommendedCard,
} from "./IntegrationCards";
import ConnectWizard from "./ConnectWizard";
import ManageDrawer from "./ManageDrawer";
import styles from "./integrations.module.css";

/** Canonical def order: the 7 plan apps first, then fixture insertion order. */
const ALL_DEFS: IntegrationDef[] = [
  ...RECOMMENDED_APP_IDS.map((id) => INTEGRATIONS[id]),
  ...Object.values(INTEGRATIONS).filter((d) => !RECOMMENDED_APP_IDS.includes(d.id)),
].filter(Boolean);

export default function IntegrationsBody() {
  const [tab, setTab] = useState<string>(INTEGRATION_TAB_ORDER[0].id);
  const [query, setQuery] = useState("");
  const [wizardId, setWizardId] = useState<string | null>(null);
  const [manageId, setManageId] = useState<string | null>(null);

  const integrations = useDemoStore((s) => s.integrations);
  const reduced = useReducedMotion();

  const statusOf = (def: IntegrationDef): IntegrationStatus =>
    integrations[def.id]?.status ?? def.defaultStatus;

  /* Tabs: arrow-key support with roving tabindex (spec §19). */
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const ids = INTEGRATION_TAB_ORDER.map((t) => t.id);
    const idx = ids.indexOf(tab);
    const next = ids[(idx + (e.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length];
    setTab(next);
    document.getElementById(`integrations-tab-${next}`)?.focus();
  };

  /* Tab memberships (unfiltered — tab counts stay stable while searching). */
  const recommendedDefs = useMemo(
    () =>
      RECOMMENDED_APP_IDS.map((id) => INTEGRATIONS[id]).filter((def) => {
        const st = integrations[def.id]?.status ?? def.defaultStatus;
        return st === "required" || st === "connected";
      }),
    [integrations],
  );
  const connectedDefs = useMemo(
    () => ALL_DEFS.filter((def) => (integrations[def.id]?.status ?? def.defaultStatus) === "connected"),
    [integrations],
  );
  const availableDefs = useMemo(
    () => ALL_DEFS.filter((def) => def.kind === "app" && !RECOMMENDED_APP_IDS.includes(def.id)),
    [],
  );
  const mcpDefs = useMemo(() => ALL_DEFS.filter((def) => def.kind === "mcp"), []);

  const counts: Record<string, number> = {
    recommended: recommendedDefs.length,
    connected: connectedDefs.length,
    available: availableDefs.length,
    mcp: mcpDefs.length,
  };

  const readyCount = RECOMMENDED_APP_IDS.filter(
    (id) => integrations[id]?.status === "connected",
  ).length;

  /* Search filters name + purpose across the ACTIVE tab (spec §12). */
  const q = query.trim().toLowerCase();
  const matches = (def: IntegrationDef) =>
    q === "" || `${def.name} ${def.purpose}`.toLowerCase().includes(q);

  const openConnect = (id: string) => setWizardId(id);
  const openManage = (id: string) => setManageId(id);

  const noMatches = (
    <div className={`oa-panel ${styles.empty}`}>
      <p className={styles.emptyTitle}>No connections match “{query.trim()}”.</p>
      <p className="oa-sub">Try a tool name, or part of what it does.</p>
      <button type="button" className="oa-btn oa-btn--ghost oa-btn--sm" onClick={() => setQuery("")}>
        Clear search
      </button>
    </div>
  );

  /* ── Tab panels ── */

  const renderRecommended = () => {
    const list = recommendedDefs.filter(matches);
    return (
      <>
        <div className={`oa-panel ${styles.progressPanel}`}>
          <div className={styles.progressText}>
            <p className={styles.progressLine}>
              {readyCount} of {RECOMMENDED_APP_IDS.length} plan connections ready
            </p>
            <p className="oa-sub">
              Connect now or during activation; nothing here blocks your plan approval.
            </p>
          </div>
          <div className={styles.progressBar}>
            <div
              className="oa-progress oa-progress--teal"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={RECOMMENDED_APP_IDS.length}
              aria-valuenow={readyCount}
              aria-label="Plan connections ready"
            >
              <span style={{ width: `${(readyCount / RECOMMENDED_APP_IDS.length) * 100}%` }} />
            </div>
          </div>
        </div>

        {list.length === 0 ? (
          noMatches
        ) : (
          <div className={styles.cardGrid}>
            {list.map((def, i) => (
              <RecommendedCard
                key={def.id}
                def={def}
                status={statusOf(def)}
                index={i}
                onConnect={openConnect}
                onManage={openManage}
              />
            ))}
          </div>
        )}
      </>
    );
  };

  const renderConnected = () => {
    const list = connectedDefs.filter(matches);
    if (connectedDefs.length === 0) {
      return (
        <div className={`oa-panel ${styles.empty}`}>
          <span className={styles.emptyIcon} aria-hidden>
            <Cable size={18} />
          </span>
          <p className={styles.emptyTitle}>Nothing is connected yet.</p>
          <p className="oa-sub" style={{ maxWidth: 420 }}>
            Start with the connections your plan recommends, or leave them for the activation
            checklist. Your plan does not wait on this screen.
          </p>
          <button
            type="button"
            className="oa-btn oa-btn--soft oa-btn--sm"
            onClick={() => setTab("recommended")}
          >
            View recommended
          </button>
        </div>
      );
    }
    if (list.length === 0) return noMatches;
    return (
      <div className={styles.rowList}>
        {list.map((def, i) => (
          <ConnectedRow
            key={def.id}
            def={def}
            runtime={integrations[def.id]}
            index={i}
            onManage={openManage}
          />
        ))}
      </div>
    );
  };

  const renderAvailable = () => {
    const list = availableDefs.filter(matches);
    if (list.length === 0) return noMatches;
    return (
      <div className={styles.availGrid}>
        {list.map((def, i) => (
          <AvailableCard
            key={def.id}
            def={def}
            status={statusOf(def)}
            index={i}
            onConnect={openConnect}
            onManage={openManage}
          />
        ))}
      </div>
    );
  };

  const renderMcp = () => {
    const list = mcpDefs.filter(matches);
    return (
      <>
        <div className={`oa-panel ${styles.callout}`}>
          <span className={styles.calloutIcon} aria-hidden>
            <Cable size={17} />
          </span>
          <div className={styles.calloutText}>
            <h3 className="oa-h3">What is an MCP connection?</h3>
            <p className={styles.purpose}>
              A secure tool connection that lets an agent use a specific system or capability. You
              approve them in plain language here; protocols, servers and scopes stay inside
              Advanced.
            </p>
          </div>
        </div>

        {list.length === 0 ? (
          noMatches
        ) : (
          <div className={styles.mcpGrid}>
            {list.map((def, i) => (
              <McpCard
                key={def.id}
                def={def}
                status={statusOf(def)}
                index={i}
                onConnect={openConnect}
                onManage={openManage}
              />
            ))}
          </div>
        )}
      </>
    );
  };

  return (
    <section>
      {/* Controls: the four tabs + search over the active tab */}
      <div className={styles.controls}>
        <div className={styles.tabsWrap}>
          <div
            className="oa-tabs"
            role="tablist"
            aria-label="Connection groups"
            onKeyDown={onTabKey}
          >
            {INTEGRATION_TAB_ORDER.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`integrations-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`integrations-panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                className={`oa-tab ${tab === t.id ? "oa-tab--active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                <span className={styles.tabCount}>{counts[t.id] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
        <div className={styles.search}>
          <Search size={15} aria-hidden />
          <input
            type="search"
            className={`oa-input ${styles.searchInput}`}
            placeholder="Search connections"
            aria-label="Search connections in the current tab"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <motion.div
        key={tab}
        role="tabpanel"
        id={`integrations-panel-${tab}`}
        aria-labelledby={`integrations-tab-${tab}`}
        initial={reduced ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.card, ease: EASE }}
      >
        {tab === "recommended" && renderRecommended()}
        {tab === "connected" && renderConnected()}
        {tab === "available" && renderAvailable()}
        {tab === "mcp" && renderMcp()}
      </motion.div>

      <ConnectWizard defId={wizardId} onClose={() => setWizardId(null)} />
      <ManageDrawer defId={manageId} onClose={() => setManageId(null)} />
    </section>
  );
}
