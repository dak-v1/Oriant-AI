"use client";
/**
 * LeanCanvasFlow — the /app/onboarding/lean-canvas experience (spec §8, §9).
 *
 * Three equal entry options (Upload existing / Build it with Oriant / Use
 * demo company) that all end at the same editable 9-block canvas board. The
 * demo option prefills every block and shows the completed canvas at once
 * (LC-01). On refresh with values already captured, the canvas shows
 * directly with a "change path" affordance.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Building2, Mic, RotateCcw, UploadCloud } from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import { useApCommand } from "@/lib/mock/autopilot";
import { AP } from "@/components/mock/autopilot/script";
import { LEAN_CANVAS_BLOCKS } from "@/lib/mock/fixtures/lean-canvas";
import { DUR, EASE } from "@/lib/mock/motion";
import { toast } from "@/components/mock/ui/Toaster";
import UploadPath from "./UploadPath";
import GuidedPath from "./GuidedPath";
import CanvasGrid from "./CanvasGrid";
import styles from "./onboarding.module.css";

type View = "choose" | "upload" | "guided" | "canvas";

export default function LeanCanvasFlow() {
  const router = useRouter();
  const reduced = useReducedMotion();

  const leanCanvas = useDemoStore((s) => s.leanCanvas);
  const hydrated = useDemoStore((s) => s._hydrated);
  const setCanvasSource = useDemoStore((s) => s.setCanvasSource);
  const fillCanvasFromDemo = useDemoStore((s) => s.fillCanvasFromDemo);
  const completeCanvas = useDemoStore((s) => s.completeCanvas);

  const [view, setViewRaw] = useState<View>("choose");
  const [entryChoice, setEntryChoice] = useState<"upload" | "guided" | "demo" | null>(null);
  const interacted = useRef(false);

  /* Refresh handling: with values already captured, open the canvas. */
  useEffect(() => {
    if (interacted.current) return;
    const vals = useDemoStore.getState().leanCanvas.values;
    if (Object.values(vals).some((v) => (v ?? "").trim())) setViewRaw("canvas");
  }, [hydrated]);

  const setView = (v: View) => {
    interacted.current = true;
    setViewRaw(v);
  };

  const filled = LEAN_CANVAS_BLOCKS.filter(
    (b) => (leanCanvas.values[b.id] ?? "").trim().length > 0,
  ).length;

  const finish = () => {
    completeCanvas();
    router.push("/app/discovery");
  };

  /* Auto-play: fill from the demo company, reveal the board, then continue. */
  useApCommand(AP.leancanvas, () => {
    fillCanvasFromDemo();
    setCanvasSource("guided");
    setView("canvas");
    window.setTimeout(() => {
      completeCanvas();
      router.push("/app/discovery");
    }, 1800);
  });

  const sourceLabel =
    leanCanvas.source === "upload"
      ? "Imported from upload"
      : leanCanvas.source === "guided"
        ? "Built with Oriant"
        : "Draft";

  return (
    <main className="oa-page">
      <header
        className="oa-between"
        style={{ marginBottom: 24, alignItems: "flex-start" }}
      >
        <div style={{ display: "grid", gap: 6, maxWidth: 720 }}>
          <p className="oa-eyebrow">Discovery · Lean Canvas</p>
          <h1 className="oa-h1">
            Your business on <span className="oa-serif">one page</span>
          </h1>
          <p className="oa-lead">
            Nine short blocks give Oriant the context every recommendation is
            built on. Upload what you have, build it together, or load the
            demo company.
          </p>
        </div>
        {view === "canvas" && (
          <button
            type="button"
            className="oa-btn oa-btn--primary"
            disabled={filled < LEAN_CANVAS_BLOCKS.length}
            onClick={finish}
          >
            Looks right, continue to Discovery
            <ArrowRight size={15} aria-hidden />
          </button>
        )}
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
          animate={{
            opacity: 1,
            y: 0,
            transition: { duration: DUR.card, ease: EASE },
          }}
          exit={{ opacity: 0, transition: { duration: 0.18 } }}
        >
          {view === "choose" && (
            <div className={styles.narrowCol}>
              <div
                className={styles.entryGrid}
                role="radiogroup"
                aria-label="How do you want to fill the canvas?"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={entryChoice === "upload"}
                  className="oa-selectable"
                  onClick={() => {
                    setEntryChoice("upload");
                    setView("upload");
                  }}
                >
                  <span className="oa-radio" aria-hidden />
                  <span className={styles.entryBody}>
                    <span className={styles.entryIcon} aria-hidden>
                      <UploadCloud size={18} />
                    </span>
                    <span className={styles.entryTitle}>Upload existing Lean Canvas</span>
                    <span className="oa-sub">
                      Already have one? Drop in a PDF, PNG or DOCX and Oriant
                      reads it into nine editable blocks.
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={entryChoice === "guided"}
                  className="oa-selectable"
                  onClick={() => {
                    setEntryChoice("guided");
                    setCanvasSource("guided");
                    setView("guided");
                  }}
                >
                  <span className="oa-radio" aria-hidden />
                  <span className={styles.entryBody}>
                    <span className={`${styles.entryIcon} ${styles.entryIconTeal}`} aria-hidden>
                      <Mic size={18} />
                    </span>
                    <span className={styles.entryTitle}>Build it with Oriant</span>
                    <span className="oa-sub">
                      Nine short questions, answered by voice or text. Oriant
                      guides the wording and you approve every block.
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={entryChoice === "demo"}
                  className="oa-selectable"
                  onClick={() => {
                    setEntryChoice("demo");
                    fillCanvasFromDemo();
                    setCanvasSource("guided");
                    setView("canvas");
                    toast({
                      title: "Demo company loaded",
                      detail: "All nine blocks filled with the BrightPath demo canvas.",
                      tone: "ok",
                    });
                  }}
                >
                  <span className="oa-radio" aria-hidden />
                  <span className={styles.entryBody}>
                    <span className={styles.entryIcon} aria-hidden>
                      <Building2 size={18} />
                    </span>
                    <span className={styles.entryTitle}>Use demo company</span>
                    <span className="oa-sub">
                      See the finished canvas right away, prefilled with
                      BrightPath Home Services. Every block stays editable.
                    </span>
                  </span>
                </button>
              </div>
              {filled > 0 && (
                <div className="oa-between">
                  <p className="oa-sub" style={{ margin: 0 }}>
                    Your current canvas is saved. A new path only updates the
                    blocks you change.
                  </p>
                  <button
                    type="button"
                    className="oa-btn oa-btn--ghost oa-btn--sm"
                    onClick={() => setView("canvas")}
                  >
                    Back to canvas
                  </button>
                </div>
              )}
            </div>
          )}

          {view === "upload" && (
            <div className={styles.narrowCol}>
              <UploadPath
                onBack={() => setView("choose")}
                onComplete={() => {
                  setView("canvas");
                  toast({
                    title: "Canvas imported",
                    detail: "Prepared demo canvas loaded. Review and edit any block.",
                    tone: "ok",
                  });
                }}
              />
            </div>
          )}

          {view === "guided" && (
            <div className={styles.narrowCol}>
              <GuidedPath
                onExit={() => setView("choose")}
                onFinished={() => {
                  setView("canvas");
                  toast({
                    title: "Lean Canvas complete",
                    detail: "All nine blocks captured. Edit anything directly on the canvas.",
                    tone: "ok",
                  });
                }}
              />
            </div>
          )}

          {view === "canvas" && (
            <div>
              <div className={styles.canvasTopBar}>
                <div className="oa-cluster">
                  <span className="oa-tag">{sourceLabel}</span>
                  <span className="oa-sub">
                    {filled} of {LEAN_CANVAS_BLOCKS.length} blocks filled · click
                    any block to edit
                  </span>
                </div>
                <button
                  type="button"
                  className="oa-btn oa-btn--ghost oa-btn--sm"
                  onClick={() => setView("choose")}
                >
                  <RotateCcw size={13} aria-hidden />
                  Change how it’s filled
                </button>
              </div>

              <CanvasGrid />

              <div className={styles.canvasFoot}>
                {leanCanvas.source === "upload" ? (
                  <span className="oa-sim-note">
                    Values shown are the prepared BrightPath demo canvas. Your
                    file was never parsed.
                  </span>
                ) : (
                  <span className="oa-sim-note">
                    Editable any time. Discovery keeps building on this canvas.
                  </span>
                )}
                {filled < LEAN_CANVAS_BLOCKS.length && (
                  <button
                    type="button"
                    className="oa-btn oa-btn--soft oa-btn--sm"
                    onClick={() => {
                      setCanvasSource("guided");
                      setView("guided");
                    }}
                  >
                    Fill the remaining {LEAN_CANVAS_BLOCKS.length - filled} with Oriant
                  </button>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
