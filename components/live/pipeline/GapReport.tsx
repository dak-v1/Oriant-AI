"use client";
/**
 * components/live/pipeline/GapReport.tsx — everything the ingest had to assume
 * about somebody's business, and what would let it stop assuming.
 *
 * THE RESOLUTION IS THE POINT, AND IT IS NEVER BEHIND A TOGGLE. `IngestGap`
 * carries two sentences: `message`, which says what was assumed, and
 * `resolution`, which says what would remove the assumption. The first one alone
 * is a complaint. Hiding the second behind a disclosure — the obvious way to
 * make this list shorter — would turn the only actionable half of the report
 * into something a reader has to go looking for, on a screen whose entire
 * subject is what nobody has told the runtime yet. So every resolution is
 * rendered, always, in its own labelled block so it cannot be misread as a
 * continuation of the sentence above it.
 *
 * GROUPED BY SEVERITY, MOST CONSEQUENTIAL FIRST, because the three severities
 * ask completely different things. `blocking` means a human must answer before
 * anything runs at all — the pass stops at ingest. `degraded` means it will run,
 * safely, but less capably than the owner probably intends. `note` means nothing
 * behaves differently. Flattening them into one list would put "the plan is
 * stale" next to "no approval boundaries exist" and let a reader take them for
 * equals.
 *
 * NO SENTENCE HERE IS THIS SCREEN'S OWN. Messages and resolutions are the
 * ingest's words, verbatim. The group headings say what a severity means, and
 * that is the whole of this component's editorial content.
 */

import { AlertTriangle, ArrowRight, Info, ShieldAlert } from "lucide-react";
import type { GapSeverity } from "@/lib/plan/ingest/types";
import type { GapView } from "./api";
import { SEVERITY_ORDER } from "./api";
import { SEVERITY_META, plural } from "./format";
import styles from "./pipeline.module.css";

const GROUP_ICON = {
  blocking: ShieldAlert,
  degraded: AlertTriangle,
  note: Info,
} satisfies Record<GapSeverity, typeof Info>;

const GROUP_CLASS = {
  blocking: styles.gapBlocking,
  degraded: styles.gapDegraded,
  note: styles.gapNote,
} satisfies Record<GapSeverity, string>;

/**
 * The `.oa-status--*` badge each severity wears on the gap itself.
 *
 * A gap carries its severity as a word even though it sits under a heading that
 * says the same thing, because these lists are read by scrolling and a gap that
 * has scrolled away from its heading must still be legible on its own.
 */
const SEVERITY_PILL = {
  blocking: "failed",
  degraded: "pending",
  note: "neutral",
} satisfies Record<GapSeverity, string>;

export default function GapReport({
  gaps,
  /** False before any pass — the difference between "none" and "not asked yet". */
  ran,
}: {
  gaps: GapView[];
  ran: boolean;
}) {
  const grouped = new Map<GapSeverity, GapView[]>();
  for (const gap of gaps) {
    const bucket = grouped.get(gap.severity);
    if (bucket === undefined) grouped.set(gap.severity, [gap]);
    else bucket.push(gap);
  }

  return (
    <section aria-labelledby="oa-pipe-gaps" className={styles.gapReport}>
      <div className={styles.gapGroupHead}>
        <h2 className={`oa-h2 ${styles.sectionTitle}`} id="oa-pipe-gaps">
          What the ingest had to assume
        </h2>
        <p className="oa-sub">
          Role B&apos;s handoff does not carry everything an enforceable plan needs. Where
          it is silent the ingest takes the safe answer and records it here, attributed to
          the agent it affects, with what would replace the guess with a decision. Nothing
          in this list is a defect in the runtime; every line is a question nobody has been
          asked yet.
        </p>
      </div>

      {!ran && (
        <div className={styles.stateBox}>
          <p className={styles.stateTitle}>
            <Info size={17} aria-hidden />
            No pass has been run, so nothing has been assumed yet.
          </p>
          <p>
            The gap report is produced by the ingest stage. Run a pass and every assumption
            it makes appears here, grouped by how much it costs you.
          </p>
        </div>
      )}

      {ran && gaps.length === 0 && (
        <div className={styles.stateBox}>
          <p className={styles.stateTitle}>
            <AlertTriangle size={17} aria-hidden />
            This pass recorded no assumptions at all.
          </p>
          <p>
            That is worth a second look rather than a sigh of relief. A Role B handoff
            carries no operating mode, no limits and no approval owner, so an ingest of one
            normally records several assumptions — starting with the one that makes every
            agent <code>draft_only</code>. An empty report usually means the pass did not
            reach the ingest stage, not that the handoff was complete.
          </p>
        </div>
      )}

      {SEVERITY_ORDER.map((severity) => {
        const list = grouped.get(severity) ?? [];
        if (list.length === 0) return null;
        const meta = SEVERITY_META[severity];
        const Icon = GROUP_ICON[severity];

        return (
          <section
            key={severity}
            className={styles.gapGroup}
            aria-labelledby={`oa-pipe-gaps-${severity}`}
          >
            <div className={styles.gapGroupHead}>
              <h3 className={styles.gapGroupTitle} id={`oa-pipe-gaps-${severity}`}>
                <Icon size={17} aria-hidden />
                {meta.title}
                <span className={styles.gapCount}>{list.length}</span>
              </h3>
              <p className="oa-sub">{meta.sentence}</p>
            </div>

            <ul className={styles.gapList}>
              {list.map((gap, index) => (
                <li
                  key={`${gap.code}-${gap.agentId ?? "plan"}-${index}`}
                  className={`${styles.gap} ${GROUP_CLASS[severity]}`}
                >
                  <div className={styles.gapMeta}>
                    <span className={`oa-status oa-status--${SEVERITY_PILL[severity]}`}>
                      {severity}
                    </span>
                    <span className={styles.gapCode}>{gap.code}</span>
                    {gap.agentId !== null && (
                      <span className={styles.mono}>agent {gap.agentId}</span>
                    )}
                  </div>

                  <p className={styles.gapMessage}>{gap.message}</p>

                  <div className={styles.gapResolution}>
                    <span className={styles.gapResolutionLabel}>
                      <ArrowRight size={12} aria-hidden />
                      What would remove this assumption
                    </span>
                    <p className={styles.gapResolutionText}>{gap.resolution}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {ran && gaps.length > 0 && (
        <p className="oa-sub">
          {plural(gaps.length, "assumption", "assumptions")} recorded. None of them are
          guesses about what an agent may do unattended — that question has one answer for
          every agent here, and it is <code>draft_only</code>.
        </p>
      )}
    </section>
  );
}
