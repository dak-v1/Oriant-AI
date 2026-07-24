"use client";
/**
 * UploadPath — Lean Canvas upload simulation (spec §8.1).
 *
 * Polished drag-and-drop zone (PDF/PNG/DOCX). Selecting or dropping ANY file
 * — or clicking "Use sample file" — plays a 3-stage "Reading your business
 * canvas" sequence (~2.5s via runTimeline/stageSteps), then fills the canvas
 * from the demo fixture. The file is NEVER uploaded or parsed; only its name
 * is shown. Honest sim labels throughout.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronLeft, FileText, Loader2, UploadCloud } from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import { runTimeline, stageSteps, type TimelineHandle } from "@/lib/mock/services/timeline";
import { DUR, EASE } from "@/lib/mock/motion";
import styles from "./onboarding.module.css";

const SAMPLE_FILE = "BrightPath-lean-canvas.pdf";

const readStages = (name: string) => [
  `Opening ${name}`,
  "Reading the nine canvas blocks",
  "Matching content to your business profile",
];

export default function UploadPath({
  onBack,
  onComplete,
}: {
  onBack: () => void;
  onComplete: () => void;
}) {
  const reduced = useReducedMotion();
  const fillCanvasFromDemo = useDemoStore((s) => s.fillCanvasFromDemo);
  const setCanvasSource = useDemoStore((s) => s.setCanvasSource);

  const [fileName, setFileName] = useState<string | null>(null);
  const [lineCount, setLineCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const handleRef = useRef<TimelineHandle | null>(null);

  useEffect(() => () => handleRef.current?.cancel(), []);

  const startReading = (name: string) => {
    if (handleRef.current) return; // one run per visit
    setFileName(name);
    const stages = readStages(name);
    const handle = runTimeline(
      stageSteps(stages, 2500),
      (_line, i) => setLineCount(i + 1),
      { instant: Boolean(reduced) },
    );
    handleRef.current = handle;
    handle.done.then((finished) => {
      if (!finished) return;
      fillCanvasFromDemo();
      setCanvasSource("upload");
      onComplete();
    });
  };

  const stages = readStages(fileName ?? SAMPLE_FILE);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <AnimatePresence mode="wait" initial={false}>
        {!fileName ? (
          <motion.div
            key="zone"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.card, ease: EASE }}
            style={{ display: "grid", gap: 14 }}
          >
            <div
              className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                startReading(file ? file.name : SAMPLE_FILE);
              }}
            >
              <span className={styles.pathIcon} aria-hidden>
                <UploadCloud size={19} />
              </span>
              <h2 className="oa-h3">Drag and drop your Lean Canvas</h2>
              <p className="oa-sub">One file is enough. Oriant reads it into nine editable blocks.</p>
              <div className={styles.fileChips} aria-hidden>
                {["PDF", "PNG", "DOCX"].map((ext) => (
                  <span key={ext} className="oa-chip">
                    <FileText size={12} aria-hidden />
                    {ext}
                  </span>
                ))}
              </div>
              <div className="oa-cluster" style={{ justifyContent: "center" }}>
                <label className="oa-btn oa-btn--ghost oa-btn--sm">
                  Browse files
                  <input
                    type="file"
                    accept=".pdf,.png,.docx"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) startReading(file.name);
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="oa-btn oa-btn--soft oa-btn--sm"
                  onClick={() => startReading(SAMPLE_FILE)}
                >
                  Use sample file ({SAMPLE_FILE})
                </button>
              </div>
            </div>
            <div className="oa-between">
              <button type="button" className="oa-btn oa-btn--ghost oa-btn--sm" onClick={onBack}>
                <ChevronLeft size={13} aria-hidden />
                Choose a different path
              </button>
              <span className="oa-sim-note">
                Simulated import. Your file is never uploaded or parsed.
              </span>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="reading"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.card, ease: EASE }}
            className={`oa-card ${styles.readingCard}`}
          >
            <div className="oa-between">
              <span className="oa-chip">
                <FileText size={13} aria-hidden />
                {fileName}
              </span>
              <span className="oa-status oa-status--active">Reading</span>
            </div>
            <h2 className="oa-h3">Reading your business canvas</h2>
            <ul className={styles.readingLines} aria-live="polite">
              {stages.map((s, i) => {
                const state = i < lineCount ? "done" : i === lineCount ? "current" : "todo";
                return (
                  <li key={s} data-state={state}>
                    {state === "done" ? (
                      <Check size={14} aria-hidden style={{ color: "var(--oa-teal-deep)" }} />
                    ) : state === "current" ? (
                      <Loader2
                        size={14}
                        aria-hidden
                        className={reduced ? undefined : "oa-spin"}
                      />
                    ) : (
                      <span className={styles.lineDot} aria-hidden />
                    )}
                    {s}
                  </li>
                );
              })}
            </ul>
            <div className="oa-progress" aria-hidden>
              <span style={{ width: `${(lineCount / stages.length) * 100}%` }} />
            </div>
            <span className="oa-sim-note">
              Simulated reading. The prepared BrightPath demo canvas will load;
              your file is never parsed.
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
