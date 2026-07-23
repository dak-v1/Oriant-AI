"use client";
/**
 * PlannerExperience — the AI Workforce Planner + Human Approval Gate 2
 * (spec §11.1–§11.8, §13, §20 "Planner", §22 planner timings).
 *
 * Orchestrates: the full-canvas generation state (5 stages over ~8s, with
 * Skip), the three-column layout (library / operations narrative /
 * inspector), the sticky controls bar with animated totals + undo/redo,
 * the NL command bar, the Gate 2 readiness drawer, the stale "Rebuild
 * required" banner and the approved read-only confirmation state.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CircleCheckBig, RefreshCw, TriangleAlert } from "lucide-react";
import { useDemoStore, usePlanTotals } from "@/lib/mock/store";
import { atLeast } from "@/lib/mock/state-machine";
import { mockPlannerService } from "@/lib/mock/services";
import type { TimelineHandle } from "@/lib/mock/services/timeline";
import { PLANNER_STAGES } from "@/lib/mock/fixtures/workflow-plan";
import { AGENT_LIBRARY } from "@/lib/mock/fixtures/agent-library";
import { DUR, EASE } from "@/lib/mock/motion";
import Drawer from "@/components/mock/ui/Drawer";
import GenerationOverlay from "./GenerationOverlay";
import PlannerControls from "./PlannerControls";
import LibraryPanel from "./LibraryPanel";
import PlanCanvas from "./PlanCanvas";
import PlanInspector from "./PlanInspector";
import CommandBar from "./CommandBar";
import GateDrawer from "./GateDrawer";
import { useMinWidth, type PlannerSelection } from "./planner-utils";
import styles from "./planner.module.css";

export default function PlannerExperience() {
  const journey = useDemoStore((s) => s.journey);
  const plan = useDemoStore((s) => s.plan);
  const reportVersion = useDemoStore((s) => s.report.version);
  const canUndo = useDemoStore((s) => s.planPast.length > 0);
  const canRedo = useDemoStore((s) => s.planFuture.length > 0);
  const totals = usePlanTotals();
  const reduced = useReducedMotion();
  const isWide = useMinWidth(1024);

  const [generating, setGenerating] = useState(false);
  const [stagesDone, setStagesDone] = useState(0);
  const [selection, setSelection] = useState<PlannerSelection>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const dropRef = useRef<HTMLDivElement | null>(null);
  const genHandle = useRef<TimelineHandle | null>(null);

  const approved = plan.status === "approved";

  /* ── Generation (spec §11 GENERATION, §22: 5 stages over ~8s) ── */

  const startGeneration = useCallback(() => {
    genHandle.current?.cancel();
    setStagesDone(0);
    setGenerating(true);
    setSelection(null);
    setGateOpen(false);
    const st = useDemoStore.getState();
    if (st.journey === "report_approved") st.setJourney("planning");
    const handle = mockPlannerService.generate(
      PLANNER_STAGES,
      (_stage, i) => setStagesDone(i + 1),
      { instant: Boolean(reduced) },
    );
    genHandle.current = handle;
    void handle.done.then((finished) => {
      if (!finished) return;
      useDemoStore.getState().setPlanGenerated();
      setGenerating(false);
    });
  }, [reduced]);

  const skipGeneration = useCallback(() => {
    genHandle.current?.cancel();
    setStagesDone(PLANNER_STAGES.length);
    useDemoStore.getState().setPlanGenerated();
    setGenerating(false);
  }, []);

  /* Auto-run on first arrival: fresh from the approved report, or a deep
     link / refresh in the planning range with no plan yet. */
  useEffect(() => {
    if (generating) return;
    const inPlanningRange = atLeast(journey, "planning") && !atLeast(journey, "plan_approved");
    if (journey === "report_approved" || (plan.agents.length === 0 && inPlanningRange)) {
      startGeneration();
    }
  }, [journey, plan.agents.length, generating, startGeneration]);

  /* Cancel the generation timeline on unmount — no stale updates. */
  useEffect(() => () => genHandle.current?.cancel(), []);

  /* Selection hygiene: drop selections that no longer exist on the canvas. */
  useEffect(() => {
    if (!selection) return;
    const ids = plan.agents.map((a) => a.agentId);
    if (selection.type === "agent" && !ids.includes(selection.agentId)) {
      setSelection(null);
    } else if (selection.type === "edge") {
      const i = ids.indexOf(selection.fromId);
      if (i === -1 || ids[i + 1] !== selection.toId) setSelection(null);
    }
  }, [plan.agents, selection]);

  const closeMobileInspector = () => {
    setSelection(null);
    setSummaryOpen(false);
  };

  const drawerTitle =
    selection?.type === "agent"
      ? AGENT_LIBRARY[selection.agentId]?.name ?? "Agent detail"
      : selection?.type === "edge"
        ? "Connection handoff"
        : "Plan summary";

  return (
    <main className="oa-page" style={{ paddingBottom: 96 }}>
      <header className="oa-between" style={{ marginBottom: 20, alignItems: "flex-end" }}>
        <div style={{ display: "grid", gap: 6, maxWidth: 720 }}>
          <p className="oa-eyebrow">Phase 2 · Workforce plan</p>
          <h1 className="oa-h1">
            Your AI <span className="oa-serif">workforce</span> plan
          </h1>
          <p className="oa-lead">
            Drafted from Company Report v{reportVersion}. Review how each agent will run, adjust
            anything, then approve the plan to start the build.
          </p>
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        {generating ? (
          <motion.div
            key="generation"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? undefined : { opacity: 0, y: -10 }}
            transition={{ duration: DUR.card, ease: EASE }}
          >
            <GenerationOverlay
              stages={PLANNER_STAGES}
              done={stagesDone}
              reportVersion={reportVersion}
              onSkip={skipGeneration}
            />
          </motion.div>
        ) : (
          <motion.div
            key="plan"
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.card, ease: EASE }}
          >
            {plan.stale && !approved && (
              <div className={styles.staleBanner} role="status">
                <TriangleAlert size={17} aria-hidden />
                <div className={styles.bannerText}>
                  <p className={styles.bannerTitle}>Rebuild required</p>
                  <p className={styles.bannerSub}>
                    The company report changed after this plan was generated — regenerate to bring
                    it up to date.
                  </p>
                </div>
                <button
                  type="button"
                  className="oa-btn oa-btn--ghost oa-btn--sm"
                  onClick={startGeneration}
                >
                  <RefreshCw size={13} aria-hidden />
                  Regenerate plan
                </button>
              </div>
            )}

            {approved && (
              <div className={styles.approvedBanner} role="status">
                <CircleCheckBig size={20} aria-hidden />
                <div className={styles.bannerText}>
                  <p className={styles.bannerTitle} style={{ color: "var(--oa-ink)" }}>
                    Workforce plan approved
                  </p>
                  <p className={styles.bannerSub} style={{ color: "var(--oa-muted-strong)" }}>
                    Version {plan.version} is locked for the build
                    {plan.approvedAt ? ` — approved at ${plan.approvedAt.slice(11, 16)}` : ""}. The
                    plan below is read-only.
                  </p>
                </div>
                <Link href="/app/build" className="oa-btn oa-btn--primary">
                  Continue to build
                  <ArrowRight size={15} aria-hidden />
                </Link>
              </div>
            )}

            <PlannerControls
              version={plan.version}
              stale={plan.stale}
              approved={approved}
              canUndo={canUndo}
              canRedo={canRedo}
              setup={totals.setup}
              monthly={totals.monthly}
              onUndo={() => useDemoStore.getState().undoPlan()}
              onRedo={() => useDemoStore.getState().redoPlan()}
              onRegenerate={startGeneration}
              onConfirm={() => setGateOpen(true)}
              onOpenSummary={() => setSummaryOpen(true)}
            />

            <div className={`${styles.grid} ${approved ? styles.gridApproved : ""}`}>
              {!approved && (
                <LibraryPanel dropRef={dropRef} onDropHover={setDropActive} dragEnabled={isWide} />
              )}

              <section className={styles.canvasCol} aria-label="Workforce plan canvas">
                <PlanCanvas
                  selection={selection}
                  onSelect={setSelection}
                  approved={approved}
                  dropActive={dropActive}
                  dropRef={dropRef}
                />
                {!approved && <CommandBar />}
              </section>

              <aside className={styles.inspectorCol} aria-label="Plan inspector">
                <PlanInspector selection={selection} approved={approved} />
              </aside>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isWide && (
        <Drawer
          open={!generating && (selection !== null || summaryOpen)}
          onClose={closeMobileInspector}
          title={drawerTitle}
          eyebrow="Plan inspector"
        >
          <PlanInspector selection={selection} approved={approved} bare />
        </Drawer>
      )}

      <GateDrawer open={gateOpen} onClose={() => setGateOpen(false)} />
    </main>
  );
}
