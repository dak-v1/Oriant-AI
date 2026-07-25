"use client";
/**
 * PlannerExperience — the AI Workforce Planner + Human Approval Gate 2
 * (spec §11, §13, improvement spec §12.1–§12.4).
 *
 * Structure top to bottom: header (plan name, version, costs, readiness) →
 * outcome summary strip → workflow canvas (with Canvas / List toggle) with
 * the inspector beside it → compact command bar → "Add more agents" library
 * tray → approval footer. The library lives in a horizontal tray beneath
 * the command bar at every width (rather than a left rail) so the canvas is
 * always the single visual primary and the drop target sits directly above
 * the cards being dragged. Also orchestrates the generation overlay, stale
 * banner, undo/redo, the Gate 2 drawer and the approved read-only state.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  CircleCheckBig,
  List,
  RefreshCw,
  TriangleAlert,
  Workflow,
} from "lucide-react";
import { planBlockers, useDemoStore, usePlanTotals } from "@/lib/mock/store";
import { atLeast } from "@/lib/mock/state-machine";
import { mockPlannerService } from "@/lib/mock/services";
import type { TimelineHandle } from "@/lib/mock/services/timeline";
import { PLANNER_STAGES } from "@/lib/mock/fixtures/workflow-plan";
import { AGENT_LIBRARY } from "@/lib/mock/fixtures/agent-library";
import { DUR, EASE } from "@/lib/mock/motion";
import Drawer from "@/components/mock/ui/Drawer";
import GenerationOverlay from "./GenerationOverlay";
import PlannerControls from "./PlannerControls";
import OutcomeStrip from "./OutcomeStrip";
import LibraryPanel from "./LibraryPanel";
import PlanCanvas from "./PlanCanvas";
import PlanList from "./PlanList";
import PlanInspector from "./PlanInspector";
import CommandBar from "./CommandBar";
import GateDrawer from "./GateDrawer";
import { useMinWidth, type PlannerSelection } from "./planner-utils";
import styles from "./planner.module.css";

type CanvasView = "canvas" | "list";

export default function PlannerExperience() {
  const journey = useDemoStore((s) => s.journey);
  const plan = useDemoStore((s) => s.plan);
  const reportVersion = useDemoStore((s) => s.report.version);
  const canUndo = useDemoStore((s) => s.planPast.length > 0);
  const canRedo = useDemoStore((s) => s.planFuture.length > 0);
  const totals = usePlanTotals();
  const reduced = useReducedMotion();
  const isWide = useMinWidth(1024);
  const isTablet = useMinWidth(768);

  const [generating, setGenerating] = useState(false);
  const [stagesDone, setStagesDone] = useState(0);
  const [selection, setSelection] = useState<PlannerSelection>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [libraryDragging, setLibraryDragging] = useState(false);
  /** Explicit user choice; null = responsive default (List below 768px). */
  const [viewChoice, setViewChoice] = useState<CanvasView | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);
  const genHandle = useRef<TimelineHandle | null>(null);

  const approved = plan.status === "approved";
  const view: CanvasView = viewChoice ?? (isTablet ? "canvas" : "list");
  const blockers = planBlockers(plan.agents);
  const unresolved = blockers.length;

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
            BrightPath <span className="oa-serif">workforce</span> plan
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
                    The company report changed after this plan was generated. Regenerate to bring
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
                    {plan.approvedAt ? `, approved at ${plan.approvedAt.slice(11, 16)}` : ""}. The
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
              unresolved={unresolved}
              onUndo={() => useDemoStore.getState().undoPlan()}
              onRedo={() => useDemoStore.getState().redoPlan()}
              onRegenerate={startGeneration}
              onOpenGate={() => setGateOpen(true)}
              onOpenSummary={() => setSummaryOpen(true)}
            />

            <OutcomeStrip />

            <div className={styles.grid}>
              <section className={styles.canvasCol} aria-label="Workforce plan canvas">
                <div className={styles.canvasHead}>
                  <p className="oa-micro">Workflow canvas</p>
                  <div className="oa-tabs" role="group" aria-label="Plan view">
                    <button
                      type="button"
                      className={`oa-tab ${view === "canvas" ? "oa-tab--active" : ""}`}
                      aria-pressed={view === "canvas"}
                      onClick={() => setViewChoice("canvas")}
                    >
                      <Workflow size={13} aria-hidden style={{ marginRight: 6, verticalAlign: "-2px" }} />
                      Canvas
                    </button>
                    <button
                      type="button"
                      className={`oa-tab ${view === "list" ? "oa-tab--active" : ""}`}
                      aria-pressed={view === "list"}
                      onClick={() => setViewChoice("list")}
                    >
                      <List size={13} aria-hidden style={{ marginRight: 6, verticalAlign: "-2px" }} />
                      List
                    </button>
                  </div>
                </div>

                {view === "canvas" ? (
                  <PlanCanvas
                    selection={selection}
                    onSelect={setSelection}
                    approved={approved}
                    dropActive={dropActive}
                    libraryDragging={libraryDragging}
                    dropRef={dropRef}
                  />
                ) : (
                  <PlanList selection={selection} onSelect={setSelection} approved={approved} />
                )}

                {!approved && <CommandBar />}
              </section>

              <aside className={styles.inspectorCol} aria-label="Plan inspector">
                <PlanInspector selection={selection} approved={approved} />
              </aside>
            </div>

            {!approved && (
              <LibraryPanel
                dropRef={dropRef}
                onDropHover={setDropActive}
                onDragStateChange={setLibraryDragging}
                dragEnabled={isWide && view === "canvas"}
              />
            )}

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
                    ? "All items resolved. The plan is ready for your approval."
                    : `${unresolved} item${unresolved === 1 ? "" : "s"} unresolved. You can review ${
                        unresolved === 1 ? "it" : "them"
                      } in the readiness check before approving.`}
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
