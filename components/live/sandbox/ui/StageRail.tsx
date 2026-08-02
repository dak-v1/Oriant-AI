"use client";
/**
 * StageRail — the numbered step rail along the bottom of the scenario panel.
 *
 * ADAPTED FROM components/mock/sandbox/StageRail.tsx. Same markup, same class
 * names, same five frames, same "state is conveyed by icon + label, never colour
 * alone" rule. Two things are different, and both are the point of this lane:
 *
 * 1. THE STATES COME FROM A FINISHED RUN, NOT A PLAYING TIMELINE. The mock's
 *    rail had an `active` frame with an "In progress" sub-label, because a
 *    fixture was being revealed over four seconds. `POST /api/runtime/sandbox`
 *    executes the whole scenario inside one request and answers once, so by the
 *    time this component has anything to draw, every frame has already happened
 *    or already been passed over. There is no `active` here and there is nothing
 *    to animate. See ui/stages.ts.
 *
 * 2. A FRAME THE RUN NEVER REACHED SAYS SO. The mock had one grey state and one
 *    word for it — "Not needed here" — which is true of a workflow that raised
 *    no approval and false of a run that died at step two. `unreached` is drawn
 *    dotted rather than dashed and carries its own word, so a red verdict is not
 *    accompanied by three frames claiming everything after the failure was
 *    simply unnecessary.
 *
 * THE CAPTION IS PART OF THE COMPONENT, not decoration. A five-step rail is the
 * single most animation-shaped thing on this page, and the one sentence under it
 * is what stops it being read as a live trace.
 */

import { Check, Minus } from "lucide-react";
import { STAGE_LABEL, STAGE_ORDER, type StageState } from "./stages";
import styles from "./sandbox.module.css";

const SUB_LABEL: Record<StageState, string | null> = {
  done: null,
  // The mock's own wording, kept: this frame was passed over by a run that went
  // on past it, which for "Human checkpoint" is the ordinary safe case.
  skipped: "Not needed here",
  unreached: "Not reached",
  none: "Not run",
};

export default function StageRail({
  states,
  /** Null when no run has been read; drives the caption, never the frames. */
  caption,
}: {
  states: Record<(typeof STAGE_ORDER)[number], StageState>;
  caption: string;
}) {
  return (
    <div>
      <div className={styles.stageScroller}>
        <ol className={styles.stageRail} aria-label="Run stages">
          {STAGE_ORDER.map((stage, index) => {
            const state = states[stage];
            const cls =
              state === "done"
                ? styles.stageDone
                : state === "skipped"
                  ? styles.stageSkipped
                  : state === "unreached"
                    ? styles.stageUnreached
                    : "";
            const sub = SUB_LABEL[state];
            return (
              <li key={stage} className={`${styles.stage} ${cls}`}>
                <span className={styles.stageDot} aria-hidden>
                  {state === "done" ? (
                    <Check size={12} />
                  ) : state === "skipped" ? (
                    <Minus size={12} />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className={styles.stageLabel}>
                  {STAGE_LABEL[stage]}
                  {sub !== null && <span className={styles.stageSub}>{sub}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <p className={styles.railNote}>{caption}</p>
    </div>
  );
}
