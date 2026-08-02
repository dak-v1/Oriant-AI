"use client";
/**
 * components/live/pipeline/StageList.tsx — the six stages of one pass, in the
 * order the orchestrator attempts them.
 *
 * ALWAYS SIX ROWS. `runPipeline` reports a stage it never reached as `skipped`
 * rather than omitting it, and the route's header says that is so a UI renders
 * the same six rows whatever happened. This component holds up that end of the
 * bargain from the other side: it iterates the stage order and looks each one
 * up, so the list cannot be reordered by a response and cannot silently lose a
 * row. A stage the pass did not report at all — which should be impossible —
 * gets a row saying exactly that, because a missing row would be indistinguishable
 * from a stage that passed.
 *
 * BEFORE ANY PASS, THE SIX ROWS STILL MEAN SOMETHING. They render as "not run
 * yet", each with what that stage attempts. An empty page would make the run
 * button a leap of faith, and the shape of the pass is the thing somebody
 * demoing it most needs to have seen before pressing anything.
 *
 * WHICH MAKES `stages === null` A CLAIM, AND THE CALLER'S TO MAKE. Six rows
 * saying "not run yet" is this component reporting that the runtime has run no
 * pass — an answer, and the wrong one if the runtime has said nothing at all.
 * `PipelineScreen` therefore renders its own absence-of-information state
 * instead of mounting this one while its `unheard` predicate holds, and only
 * passes null once the runtime has confirmed there is nothing. Nothing here can
 * enforce that from the inside: null cannot tell the two apart, which is exactly
 * why the distinction lives one level up and is written down in both places.
 *
 * NOT-RUN AND SKIPPED ARE NOT ALLOWED TO LOOK ALIKE. One is "this pass has not
 * happened", the other is "this pass stopped before here" — different facts,
 * different next actions, and the second one is a report about a workforce that
 * did not go live. They get different shapes, different words and different
 * badges, for the same reason `components/live/workspace/ui.tsx` splits loading
 * from empty.
 *
 * THE RUNTIME'S OWN SENTENCES ARE RENDERED VERBATIM. `summary` and every
 * `detail` line come through untouched, and the link on a blocked stage uses the
 * `href` the runtime attached rather than a route table kept here — a second
 * copy of where a package or a verdict gets fixed would drift from the one the
 * go-live button enforces.
 */

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  MinusCircle,
  ShieldAlert,
} from "lucide-react";
import type { StageId, StageStatus } from "@/lib/runtime/pipeline/types";
import type { StageView } from "./api";
import { STAGE_ORDER } from "./api";
import { STAGE_META, STATUS_META } from "./format";
import styles from "./pipeline.module.css";

/** Reinforcement for the badge word, never a replacement for it. */
const STATUS_ICON = {
  ok: CheckCircle2,
  blocked: ShieldAlert,
  failed: AlertTriangle,
  skipped: MinusCircle,
} satisfies Record<StageStatus, typeof CheckCircle2>;

/** Blocked and failed both tint; skipped recedes; ok keeps the plain surface. */
const STATUS_CLASS = {
  ok: "",
  blocked: styles.stageBlocked,
  failed: styles.stageFailed,
  skipped: styles.stageSkipped,
} satisfies Record<StageStatus, string>;

export default function StageList({
  stages,
  stoppedAt,
  superseded,
}: {
  /**
   * Null ONLY when the runtime has answered and said no pass has run — the six
   * rows then render as "not run yet". Never null merely because a read failed;
   * see the header.
   */
  stages: StageView[] | null;
  /** The stage that stopped the pass, marked in place as well as named above. */
  stoppedAt: StageId | null;
  /**
   * True while a newer pass is in flight, which makes everything here the
   * previous answer — six "not run yet" rows included. Those are a report the
   * runtime made too, and the pass on the wire is busy replacing it.
   */
  superseded: boolean;
}) {
  const byId = new Map((stages ?? []).map((stage) => [stage.stage, stage]));

  return (
    <ol className={`${styles.stageList} ${superseded ? styles.superseded : ""}`}>
      {STAGE_ORDER.map((id, index) => {
        const meta = STAGE_META[id];
        const result = byId.get(id);

        if (stages === null) {
          return (
            <li key={id} className={`${styles.stage} ${styles.stageIdle}`}>
              <span className={styles.stageIndex} aria-hidden>
                {index + 1}
              </span>
              <div className={styles.stageHead}>
                <CircleDashed size={15} className={styles.stageIcon} aria-hidden />
                <h3 className={styles.stageTitle}>{meta.title}</h3>
                <span className={styles.notRun}>not run yet</span>
              </div>
              <p className={styles.stageWhat}>{meta.what}</p>
            </li>
          );
        }

        if (result === undefined) {
          /* Should be unreachable: the orchestrator pads every unreached stage
             with `skipped`. Rendered rather than skipped so that if it ever
             happens it is visible instead of looking like a stage that passed. */
          return (
            <li key={id} className={`${styles.stage} ${styles.stageFailed}`}>
              <span className={styles.stageIndex} aria-hidden>
                {index + 1}
              </span>
              <div className={styles.stageHead}>
                <AlertTriangle size={15} className={styles.stageIcon} aria-hidden />
                <h3 className={styles.stageTitle}>{meta.title}</h3>
                <span className="oa-status oa-status--failed">not reported</span>
              </div>
              <p className={styles.stageSummary}>
                This run did not report this step at all. All six are supposed to be
                reported every time, so treat the whole result as unproven rather than
                reading the silence as success.
              </p>
            </li>
          );
        }

        const status = STATUS_META[result.status];
        const Icon = STATUS_ICON[result.status];

        return (
          <li key={id} className={`${styles.stage} ${STATUS_CLASS[result.status]}`}>
            <span className={styles.stageIndex} aria-hidden>
              {index + 1}
            </span>

            <div className={styles.stageHead}>
              <Icon size={15} className={styles.stageIcon} aria-hidden />
              <h3 className={styles.stageTitle}>{meta.title}</h3>
              <span className={`oa-status oa-status--${status.cls}`}>{status.label}</span>
              {stoppedAt === id && <span className={styles.stopMark}>stopped here</span>}
            </div>

            <div className={styles.stageBody}>
              <p className={styles.stageSummary}>{result.summary}</p>
              <p className={styles.stageWhat}>{meta.what}</p>

              {result.detail.length > 0 && (
                <ul className={styles.detailList}>
                  {result.detail.map((line, lineIndex) => (
                    <li key={`${id}-${lineIndex}`} className={styles.detailItem}>
                      {line}
                    </li>
                  ))}
                </ul>
              )}

              {(result.status === "blocked" || result.status === "failed") && (
                <p className={styles.stageFix}>{meta.whenBlocked}</p>
              )}

              {result.href !== null && (
                <div className={styles.stageActions}>
                  <Link href={result.href} className="oa-btn oa-btn--ghost oa-btn--sm">
                    Take me there
                    <ArrowRight size={13} aria-hidden />
                  </Link>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
