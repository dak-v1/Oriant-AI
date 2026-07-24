"use client";
/**
 * StageRail — the horizontal progress rail of the five staged frames
 * (Preparing → Running trigger → Agent action → Human checkpoint → Result)
 * shown above the step timeline (spec §14; S-01). State per stage is
 * conveyed by icon + label, never colour alone. Scrolls in its own
 * container on narrow screens.
 */
import { Check, Minus } from "lucide-react";
import type { SandboxRunState, SandboxScenario } from "@/lib/mock/types";
import { STAGE_LABEL, STAGE_ORDER, stageIndex, stageOfKind, type StageId } from "./stages";
import styles from "./sandbox.module.css";

type StageState = "pending" | "active" | "done" | "skipped";

function stageStates({
  scenario,
  traceActive,
  phase,
  displayCount,
  stopped,
}: {
  scenario: SandboxScenario;
  traceActive: boolean;
  phase: SandboxRunState["phase"];
  displayCount: number;
  stopped: boolean;
}): Record<StageId, StageState> {
  const hasCheckpoint = scenario.events.some((e) => e.kind === "approval_pause");
  const states: Record<StageId, StageState> = {
    preparing: "pending",
    trigger: "pending",
    agent: "pending",
    checkpoint: hasCheckpoint ? "pending" : "skipped",
    result: "pending",
  };

  const markDoneThrough = (idx: number) => {
    for (const s of STAGE_ORDER) {
      if (stageIndex(s) <= idx && states[s] !== "skipped") states[s] = "done";
    }
  };

  if (!traceActive || phase === "idle") return states;

  if (phase === "completed") {
    markDoneThrough(stageIndex("result"));
    return states;
  }

  const revealed = scenario.events.slice(0, displayCount);
  const maxIdx = revealed.reduce((m, e) => Math.max(m, stageIndex(stageOfKind(e.kind))), 0);

  if (stopped) {
    /* Frozen partial trace: everything reached so far reads as done. */
    markDoneThrough(maxIdx);
    return states;
  }
  if (phase === "paused_for_approval") {
    markDoneThrough(stageIndex("agent"));
    states.checkpoint = "active";
    return states;
  }
  if (phase === "resuming") {
    markDoneThrough(stageIndex("checkpoint"));
    states.result = "active";
    return states;
  }
  /* phase === "running" */
  if (revealed.length === 0) {
    states.preparing = "active";
    return states;
  }
  const latest = stageOfKind(revealed[revealed.length - 1].kind);
  markDoneThrough(stageIndex(latest) - 1);
  if (states[latest] !== "skipped") states[latest] = "active";
  return states;
}

export default function StageRail(props: {
  scenario: SandboxScenario;
  traceActive: boolean;
  phase: SandboxRunState["phase"];
  displayCount: number;
  stopped: boolean;
}) {
  const states = stageStates(props);
  return (
    <div className={styles.stageScroller}>
      <ol className={styles.stageRail} aria-label="Run stages">
        {STAGE_ORDER.map((stage, i) => {
          const state = states[stage];
          const cls =
            state === "done"
              ? styles.stageDone
              : state === "active"
                ? styles.stageActive
                : state === "skipped"
                  ? styles.stageSkipped
                  : "";
          return (
            <li key={stage} className={`${styles.stage} ${cls}`}>
              <span className={styles.stageDot} aria-hidden>
                {state === "done" ? (
                  <Check size={12} />
                ) : state === "skipped" ? (
                  <Minus size={12} />
                ) : (
                  i + 1
                )}
              </span>
              <span className={styles.stageLabel}>
                {STAGE_LABEL[stage]}
                {state === "skipped" && <span className={styles.stageSub}>Not needed here</span>}
                {state === "active" && <span className={styles.stageSub}>In progress</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
