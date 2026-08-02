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
 *
 * AN EMPTY REPORT HAS THREE CAUSES AND THEY ARE NOT INTERCHANGEABLE. A pass ran
 * and recorded nothing; no pass has ever run here; or nobody has managed to ask.
 * `known` and `ran` are two booleans rather than one because the first two are
 * conclusions the runtime handed us and the third is the absence of any handing
 * over at all. Collapsing the third into "no pass has been run, so nothing has
 * been assumed yet" — which this component used to do, on the strength of an
 * empty array and a false `ran` — states as fact the one thing a failed read
 * cannot establish. `known` is checked first and wins, so the pair cannot render
 * a claim it has no basis for even if a caller passes a contradiction.
 *
 * AND THE SECOND CAUSE HAS A TENSE. "No pass has been run" was true when the read
 * came back and stops being true somewhere inside the pass that is running now;
 * a reader watching an ingest stage they cannot see should not be told nothing
 * has been assumed. `running` puts that one sentence in the past — see the prop.
 */

import { AlertTriangle, ArrowRight, HelpCircle, Info, ShieldAlert } from "lucide-react";
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
  /**
   * False while the runtime has not answered at all. Outranks `ran`: nothing
   * below may report on a pass, or on the absence of one, until this is true.
   */
  known,
  /**
   * True while a pass is in flight, and it changes exactly one branch: the one
   * that reports there is nothing here because no pass has run. That sentence is
   * a claim about the ABSENCE of a pass, and the request now running is the one
   * thing that can be falsifying it as it is read — the ingest stage may already
   * have recorded every assumption below. The branches that report on a pass we
   * hold need nothing here: they are the previous answer, kept and labelled as
   * such by the running banner above, which is rule 4 on `PipelineScreen`.
   */
  running,
}: {
  gaps: GapView[];
  ran: boolean;
  known: boolean;
  running: boolean;
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
          What had to be assumed
        </h2>
        <p className="oa-sub">
          Your plan does not carry everything a workable setup needs. Where it is silent the
          safe answer is taken and recorded here, against the agent it affects, with what
          would replace the guess with a decision. Nothing in this list is a fault; every
          line is a question nobody has been asked yet.
        </p>
      </div>

      {!known && (
        <div className={`${styles.stateBox} ${styles.stateUnknown}`}>
          <p className={styles.stateTitle}>
            <HelpCircle size={17} aria-hidden />
            Whether anything has been assumed here is not known.
          </p>
          <p>
            This list is recorded as your plan is read in, and nothing has answered. That is
            not the same as nothing having been assumed, and it is not the same as nothing
            having been run here — this list is blank because nobody has been able to ask,
            and it will stay blank until somebody can.
          </p>
        </div>
      )}

      {known && !ran && (
        <div className={styles.stateBox}>
          <p className={styles.stateTitle}>
            <Info size={17} aria-hidden />
            {running
              ? "Nothing had been assumed here when this screen last asked."
              : "Nothing has been run, so nothing has been assumed yet."}
          </p>
          <p>
            {running
              ? "This list is produced as a plan is read in, and a run is in the middle of doing that right now. Whatever it assumes appears here when the run answers; until then this list is empty because of a question asked before it started."
              : "This list is produced as your plan is read in. Bring a plan through and every assumption made about it appears here, grouped by how much it costs you."}
          </p>
        </div>
      )}

      {known && ran && gaps.length === 0 && (
        <div className={styles.stateBox}>
          <p className={styles.stateTitle}>
            <AlertTriangle size={17} aria-hidden />
            This run recorded no assumptions at all.
          </p>
          <p>
            That is worth a second look rather than a sigh of relief. A plan carries no
            operating mode, no limits and no approval owner, so reading one in normally
            records several assumptions — starting with the one that makes every agent wait
            for your approval. An empty list usually means the run did not get as far as
            reading your plan, not that your plan was complete.
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
                    {/* The heading's word, not the raw severity: these lists are
                        read by scrolling, and a gap that has scrolled away from
                        its heading must still be legible on its own. */}
                    <span className={`oa-status oa-status--${SEVERITY_PILL[severity]}`}>
                      {SEVERITY_META[severity].title}
                    </span>
                    {gap.agentId !== null && (
                      <span className={styles.mono}>Agent: {gap.agentId}</span>
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

      {known && ran && gaps.length > 0 && (
        <p className="oa-sub">
          {plural(gaps.length, "assumption", "assumptions")} recorded. None of them are
          guesses about what an agent may do unattended — that question has one answer for
          every agent here: it waits for your approval.
        </p>
      )}
    </section>
  );
}
