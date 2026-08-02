"use client";
/**
 * PlannerExperience — the AI Workforce Planner + Human Approval Gate 2.
 *
 * Step 9 Pass 1: rewired off the real planner backend. Bootstraps via
 * GET /api/planner/context (resolves real org/session ids + any existing
 * plan), generates via POST /api/planner/generate only when no plan exists
 * yet, and fetches the real cost estimate. Plan composition (add/remove/
 * reorder) and the workflow-graph canvas have no real backend support yet —
 * both are out of scope for this pass; see PROGRESS.md.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CircleCheckBig, LoaderCircle, TriangleAlert } from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import { ensurePlanLoaded } from "@/lib/mock/planner-bootstrap";
import { DUR, EASE } from "@/lib/mock/motion";
import Drawer from "@/components/mock/ui/Drawer";
import PlannerControls from "./PlannerControls";
import PlanList from "./PlanList";
import PlanInspector from "./PlanInspector";
import GateDrawer from "./GateDrawer";
import { useMinWidth, type PlannerSelection } from "./planner-utils";
import styles from "./planner.module.css";

interface CostEstimateResponse {
  perAgent: Array<{ agentConfigId: string; monthlyCostUsd: number | null }>;
  totalMonthlyLlmCostUsd: number | null;
  note?: string;
}

export default function PlannerExperience() {
  const plan = useDemoStore((s) => s.plan);
  const reduced = useReducedMotion();
  const isWide = useMinWidth(1024);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selection, setSelection] = useState<PlannerSelection>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [cost, setCost] = useState<CostEstimateResponse | null>(null);

  const approved = plan.status === "approved";

  const fetchCost = useCallback(async (planId: string) => {
    try {
      const res = await fetch(`/api/planner/${planId}/cost-estimate`, { cache: "no-store" });
      if (res.ok) setCost(await res.json());
    } catch {
      // Non-fatal — cost display just falls back to "—".
    }
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await ensurePlanLoaded();
    if (!result.ok) {
      setLoadError(result.error);
    } else {
      const planId = useDemoStore.getState().plan.id;
      if (planId) void fetchCost(planId);
    }
    setLoading(false);
  }, [fetchCost]);

  useEffect(() => {
    void bootstrap();
    // Re-bootstrap on every mount (e.g. returning from an agent config page)
    // so agent/plan status changes made server-side are always reflected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Selection hygiene: drop selections that no longer exist in the plan. */
  useEffect(() => {
    if (!selection) return;
    const ids = plan.agents.map((a) => a.agentId);
    if (selection.type === "agent" && !ids.includes(selection.agentId)) {
      setSelection(null);
    } else if (selection.type === "edge") {
      setSelection(null);
    }
  }, [plan.agents, selection]);

  const closeMobileInspector = () => {
    setSelection(null);
    setSummaryOpen(false);
  };

  const selectedAgent = selection?.type === "agent" ? plan.agents.find((a) => a.agentId === selection.agentId) : null;
  const drawerTitle = selectedAgent ? selectedAgent.name ?? selectedAgent.agentId : "Plan summary";

  const totalMonthly = cost?.totalMonthlyLlmCostUsd ?? 0;
  const costByAgentKey = new Map(
    (cost?.perAgent ?? []).map((a) => [a.agentConfigId, a.monthlyCostUsd ?? 0]),
  );

  const readyStatuses = new Set(["ready_to_build"]);
  const unresolved = plan.agents.filter((a) => !readyStatuses.has(a.status)).length;

  return (
    <main className="oa-page" style={{ paddingBottom: 96 }}>
      <header className="oa-between" style={{ marginBottom: 20, alignItems: "flex-end" }}>
        <div style={{ display: "grid", gap: 6, maxWidth: 720 }}>
          <p className="oa-eyebrow">Phase 2 · Workforce plan</p>
          <h1 className="oa-h1">
            Your <span className="oa-serif">workforce</span> plan
          </h1>
          <p className="oa-lead">
            Review how each agent will run, configure the ones that need it, then approve the plan
            to move on to connecting tools.
          </p>
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <motion.div
            key="loading"
            className={`oa-card ${styles.genWrap}`}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={{ duration: DUR.card, ease: EASE }}
            style={{ display: "grid", placeItems: "center", padding: 48 }}
          >
            <LoaderCircle size={22} className="oa-spin" aria-hidden />
            <p className="oa-sub" style={{ marginTop: 12 }}>Loading your workforce plan…</p>
          </motion.div>
        ) : loadError ? (
          <motion.div
            key="error"
            className="oa-card"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ padding: 32, display: "grid", gap: 12, justifyItems: "start" }}
          >
            <p className={styles.bannerTitle}>
              <TriangleAlert size={16} aria-hidden style={{ marginRight: 6, verticalAlign: "-2px" }} />
              Couldn&apos;t load the plan
            </p>
            <p className="oa-sub">{loadError}</p>
            <button type="button" className="oa-btn oa-btn--primary" onClick={() => void bootstrap()}>
              Try again
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="plan"
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.card, ease: EASE }}
          >
            {approved && (
              <div className={styles.approvedBanner} role="status">
                <CircleCheckBig size={20} aria-hidden />
                <div className={styles.bannerText}>
                  <p className={styles.bannerTitle} style={{ color: "var(--oa-ink)" }}>
                    Workforce plan approved
                  </p>
                  <p className={styles.bannerSub} style={{ color: "var(--oa-muted-strong)" }}>
                    Version {plan.version} is locked. Next, connect the tools your agents need.
                  </p>
                </div>
                <Link href="/app/integrations" className="oa-btn oa-btn--primary">
                  Continue to integrations
                  <ArrowRight size={15} aria-hidden />
                </Link>
              </div>
            )}

            <PlannerControls
              version={plan.version}
              stale={plan.stale}
              approved={approved}
              canUndo={false}
              canRedo={false}
              setup={0}
              monthly={totalMonthly}
              unresolved={unresolved}
              onUndo={() => {}}
              onRedo={() => {}}
              onRegenerate={() => {}}
              onOpenGate={() => setGateOpen(true)}
              onOpenSummary={() => setSummaryOpen(true)}
              editingDisabled
            />

            <div className={styles.grid}>
              <section className={styles.canvasCol} aria-label="Workforce plan">
                <div className={styles.canvasHead}>
                  <p className="oa-micro">Agents in this plan</p>
                </div>

                <PlanList selection={selection} onSelect={setSelection} approved={approved} />

                {!approved && (
                  <p className="oa-sub" style={{ marginTop: 12 }}>
                    Adding, removing, and reordering agents via chat is coming in a future update —
                    for now, configure each agent below and approve when ready.
                  </p>
                )}
              </section>

              <aside className={styles.inspectorCol} aria-label="Plan inspector">
                <PlanInspector
                  selection={selection}
                  approved={approved}
                  costByAgentKey={costByAgentKey}
                />
              </aside>
            </div>

            {!approved && (
              <footer className={styles.footerBar} aria-label="Plan approval">
                <p
                  className={`${styles.footerStatus} ${
                    unresolved === 0 ? styles.footerStatusOk : styles.footerStatusWarn
                  }`}
                >
                  {unresolved === 0 ? (
                    <CircleCheckBig size={16} aria-hidden />
                  ) : (
                    <TriangleAlert size={16} aria-hidden />
                  )}
                  {unresolved === 0
                    ? "All agents configured. The plan is ready for your approval."
                    : `${unresolved} agent${unresolved === 1 ? "" : "s"} still need${
                        unresolved === 1 ? "s" : ""
                      } configuration before you can approve.`}
                </p>
                <button
                  type="button"
                  className="oa-btn oa-btn--primary"
                  onClick={() => setGateOpen(true)}
                >
                  Confirm workforce plan
                  <ArrowRight size={15} aria-hidden />
                </button>
              </footer>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {!isWide && (
        <Drawer
          open={!loading && (selection !== null || summaryOpen)}
          onClose={closeMobileInspector}
          title={drawerTitle}
          eyebrow="Plan inspector"
        >
          <PlanInspector selection={selection} approved={approved} costByAgentKey={costByAgentKey} bare />
        </Drawer>
      )}

      <GateDrawer open={gateOpen} onClose={() => setGateOpen(false)} cost={cost} />
    </main>
  );
}
