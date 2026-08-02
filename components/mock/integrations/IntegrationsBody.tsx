"use client";
/**
 * IntegrationsBody — the shared body of /app/integrations and
 * /app/workspace/integrations.
 *
 * Step 9 Pass 1: rewired off the real GET /api/integrations/[organizationId]
 * endpoint. Tool display content (name/purpose/permissions/reads/actions)
 * still comes from the INTEGRATIONS fixture — those are stable catalog facts
 * a real integrations manifest would carry too — but connection *status*
 * and which tools are "recommended" now come from the approved plan's real
 * required-tools + integration_connections state. Only the 7 Composio-routed
 * tools (RECOMMENDED_APP_IDS) are real; the rest stay visible with Connect
 * disabled per the earlier product decision.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Cable, LoaderCircle, Search, TriangleAlert } from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import { INTEGRATIONS, INTEGRATION_TAB_ORDER } from "@/lib/mock/fixtures/integrations";
import { RECOMMENDED_APP_IDS } from "@/lib/mock/fixtures/ids";
import type { IntegrationDef } from "@/lib/mock/types";
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

const REAL_TOOL_IDS = new Set(RECOMMENDED_APP_IDS);

interface ToolSummary {
  toolKey: string;
  status: string;
  provider: string | null;
  neededByAgents: string[];
}

export default function IntegrationsBody() {
  const [tab, setTab] = useState<string>(INTEGRATION_TAB_ORDER[0].id);
  const [query, setQuery] = useState("");
  const [wizardId, setWizardId] = useState<string | null>(null);
  const [manageId, setManageId] = useState<string | null>(null);

  const organizationId = useDemoStore((s) => s.onboarding.organizationId);
  const setOrganizationId = useDemoStore((s) => s.setOrganizationId);
  const reduced = useReducedMotion();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tools, setTools] = useState<ToolSummary[]>([]);
  const toolByKey = useMemo(() => new Map(tools.map((t) => [t.toolKey, t])), [tools]);

  const refreshTools = useCallback(async (orgId: string) => {
    const res = await fetch(`/api/integrations/${orgId}`, { cache: "no-store" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Could not load your integrations.");
    }
    const data = (await res.json()) as { tools: ToolSummary[] };
    setTools(data.tools);
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      let orgId = organizationId;
      if (!orgId) {
        const ctxRes = await fetch("/api/planner/context", { cache: "no-store" });
        if (!ctxRes.ok) throw new Error("Could not resolve your organization yet.");
        const ctx = (await ctxRes.json()) as { organizationId: string };
        orgId = ctx.organizationId;
        setOrganizationId(orgId);
      }
      await refreshTools(orgId);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load your integrations.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, refreshTools, setOrganizationId]);

  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Returning from an OAuth tab: lib/server/planner/providers/composio.ts
     builds the callback as /app/integrations?tool=<toolKey>&status=callback —
     fast-path a refresh instead of waiting for the wizard's own poll tick. */
  useEffect(() => {
    const tool = searchParams.get("tool");
    if (tool && organizationId) void refreshTools(organizationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const statusOf = (def: IntegrationDef): string => toolByKey.get(def.id)?.status ?? "not_connected";

  /* Tabs: arrow-key support with roving tabindex. */
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const ids = INTEGRATION_TAB_ORDER.map((t) => t.id);
    const idx = ids.indexOf(tab);
    const next = ids[(idx + (e.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length];
    setTab(next);
    document.getElementById(`integrations-tab-${next}`)?.focus();
  };

  const recommendedDefs = useMemo(
    () => tools.map((t) => INTEGRATIONS[t.toolKey]).filter((def): def is IntegrationDef => Boolean(def)),
    [tools],
  );
  const connectedDefs = useMemo(
    () => ALL_DEFS.filter((def) => (toolByKey.get(def.id)?.status ?? "not_connected") === "connected"),
    [toolByKey],
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

  const readyCount = tools.filter((t) => t.status === "connected").length;

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

  const renderRecommended = () => {
    const list = recommendedDefs.filter(matches);
    return (
      <>
        {tools.length > 0 && (
          <div className={`oa-panel ${styles.progressPanel}`}>
            <div className={styles.progressText}>
              <p className={styles.progressLine}>
                {readyCount} of {tools.length} plan connections ready
              </p>
              <p className="oa-sub">Connect the tools your approved plan needs.</p>
            </div>
            <div className={styles.progressBar}>
              <div
                className="oa-progress oa-progress--teal"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={tools.length}
                aria-valuenow={readyCount}
                aria-label="Plan connections ready"
              >
                <span style={{ width: `${(readyCount / Math.max(tools.length, 1)) * 100}%` }} />
              </div>
            </div>
            {/* The way out of this step, mirroring the plan page's "Continue to
                integrations". It appears only once every connection the plan
                actually requires is live: a Continue that is always available
                would walk an owner into the Factory to build agents whose tools
                cannot answer, and the Activation gate would refuse them later
                with the reason three screens behind. */}
            {readyCount === tools.length && (
              <Link href="/app/build" className="oa-btn oa-btn--primary">
                Continue to Agent Factory
                <ArrowRight size={15} aria-hidden />
              </Link>
            )}
          </div>
        )}

        {list.length === 0 ? (
          tools.length === 0 ? (
            <p className="oa-sub">This plan doesn&apos;t require any connected tools.</p>
          ) : (
            noMatches
          )
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
            Start with the connections your plan recommends.
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
            runtime={{ status: "connected", connectedAt: null }}
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
            status="not_connected"
            index={i}
            onConnect={openConnect}
            onManage={openManage}
            disabled
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
              A secure tool connection that lets an agent use a specific system or capability.
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
                status="not_connected"
                index={i}
                onConnect={openConnect}
                onManage={openManage}
                disabled
              />
            ))}
          </div>
        )}
      </>
    );
  };

  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", padding: 48 }}>
        <LoaderCircle size={22} className="oa-spin" aria-hidden />
        <p className="oa-sub" style={{ marginTop: 12 }}>Loading your integrations…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={`oa-card ${styles.empty}`} style={{ padding: 32 }}>
        <TriangleAlert size={20} aria-hidden />
        <p className={styles.emptyTitle}>Couldn&apos;t load integrations</p>
        <p className="oa-sub">{loadError}</p>
        <button type="button" className="oa-btn oa-btn--primary" onClick={() => void bootstrap()}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <section>
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

      <ConnectWizard
        defId={wizardId}
        organizationId={organizationId}
        real={wizardId ? REAL_TOOL_IDS.has(wizardId) : false}
        onClose={() => setWizardId(null)}
        onConnected={() => organizationId && void refreshTools(organizationId)}
      />
      <ManageDrawer
        defId={manageId}
        status={manageId ? statusOf(INTEGRATIONS[manageId]) : "connected"}
        neededByAgents={manageId ? toolByKey.get(manageId)?.neededByAgents ?? [] : []}
        onClose={() => setManageId(null)}
      />
    </section>
  );
}
