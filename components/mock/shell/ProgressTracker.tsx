"use client";
/**
 * ProgressTracker — Discovery → Report → Plan → Configure → Test → Activate.
 * Always tells the owner where they are; never a vague spinner (spec §4).
 */
import { Check, ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { useRouter } from "next/navigation";
import { useDemoStore } from "@/lib/mock/store";
import { PROGRESS_PHASES, phaseStatus } from "@/lib/mock/state-machine";
import styles from "./shell.module.css";

export default function ProgressTracker({ ready }: { ready: boolean }) {
  const journey = useDemoStore((s) => s.journey);
  const router = useRouter();

  return (
    <div className={styles.progress} role="list" aria-label="Journey progress">
      {PROGRESS_PHASES.map((phase, i) => {
        const status = ready ? phaseStatus(phase, journey) : i === 0 ? "active" : "upcoming";
        const cls =
          status === "done"
            ? styles.progressDone
            : status === "active"
              ? styles.progressActive
              : "";
        const clickable = status === "done";
        return (
          <Fragment key={phase.id}>
            {i > 0 && <ChevronRight size={13} className={styles.progressArrow} aria-hidden />}
            <button
              type="button"
              role="listitem"
              className={`${styles.progressStep} ${cls}`}
              onClick={clickable ? () => router.push(phase.route) : undefined}
              disabled={!clickable && status !== "active"}
              style={{ cursor: clickable ? "pointer" : "default" }}
              aria-current={status === "active" ? "step" : undefined}
            >
              {status === "done" && <Check size={12} aria-hidden />}
              {phase.label}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
