"use client";
/**
 * components/live/deploy/PlanSourceNotice.tsx — WHICH workforce this button
 * would put live.
 *
 * The activation route carries `plan.source` and `plan.fallbackReason` for
 * exactly this, and its own header says why: "a deploy screen that renders a
 * plan without saying where it came from is the screen that lets a demo be
 * mistaken for the owner's own workforce". Every Operate surface owes that
 * disclosure; this one owes it most, because this is the screen with the button.
 *
 * IT IS RENDERED IN EVERY STATE, INCLUDING BEFORE ANYTHING HAS ANSWERED. A
 * notice that appears only when something is wrong has to be noticed to work,
 * and its absence then becomes a claim of its own — one nobody made deliberately.
 * So there are three shapes and never zero:
 *
 *   unknown    the runtime has not answered. It says that, and nothing else. It
 *              does NOT say the plan is real and it does NOT say it is a
 *              fixture, because a screen that has not been told cannot know.
 *   ingested   the owner's own workforce, stated quietly as a receipt.
 *   otherwise  disclosed loudly, with the runtime's own `fallbackReason`.
 *
 * WHICH fixture is standing in is never named here, only by the runtime. The
 * sentence in `resolveCurrentPlan` names it — the demo has been renamed at least
 * once — and a second copy of that name in a component would be a caption that
 * eventually describes a different workforce than the one on screen.
 *
 * "OTHERWISE", NOT "FIXTURE", and that is the load-bearing word. The source is
 * compared by equality against the one value that suppresses the warning rather
 * than by membership of a union, so a source this build has never heard of
 * discloses instead of quietly passing as the owner's own. See ./api.ts.
 */

import { Info, ShieldQuestion, TriangleAlert } from "lucide-react";
import type { LiveCountsView, PlanSourceView } from "./api";
import styles from "./deploy.module.css";

/** The one source value that means "this is really theirs". */
const OWN_PLAN = "ingested";
/** The one `live.source` value that means something is genuinely deployed. */
const DEPLOYED = "deployment";

export default function PlanSourceNotice({
  plan,
  live,
}: {
  /**
   * Null while nothing has answered — never a stand-in, and never cleared by a
   * refresh: the screen holds the last plan a read confirmed, so this does not
   * go back to saying "unknown" for the length of every re-check.
   */
  plan: PlanSourceView | null;
  /** What is RUNNING, when a read said. Null when nobody has been told. */
  live: LiveCountsView | null;
}) {
  /* NOT HIDEABLE — see components/live/build/PlanSourceNotice.tsx, and doubly
     so here, because this is the screen with the go-live button. The argument
     for hiding it was that doing so "does not change what the button does",
     which is true and beside the point: it changes what the person pressing it
     believes they are putting live. Of every screen in the product, this is the
     last one that may keep quiet about whose workforce it is showing. */
  if (plan === null) {
    return (
      <section className={`${styles.sourceNotice} ${styles.sourceNoticeCalm}`}>
        <span className={styles.sourceIcon} aria-hidden>
          <ShieldQuestion size={21} />
        </span>
        <div className={styles.sourceText}>
          <h2 className={styles.sourceTitle}>
            Which workforce this would put live is not known yet
          </h2>
          <p className={styles.sourceBody}>
            Nothing has told this screen yet whether the plan behind the checks below is
            your own imported plan or the sample workforce standing in for it. Until it
            does, nothing here says which — and the button will not send, because the whole
            point of this notice is that the two are not interchangeable.
          </p>
        </div>
      </section>
    );
  }

  const own = plan.source === OWN_PLAN;
  const deployed = live !== null && live.source === DEPLOYED;

  return (
    <section
      className={`${styles.sourceNotice} ${own ? styles.sourceNoticeCalm : ""}`}
      role={own ? undefined : "alert"}
    >
      <span className={styles.sourceIcon} aria-hidden>
        {own ? <Info size={21} /> : <TriangleAlert size={21} />}
      </span>
      <div className={styles.sourceText}>
        <h2 className={styles.sourceTitle}>
          {own
            ? "This is your own workforce, from the plan you imported"
            : "This is NOT your workforce — the button below would put a sample workforce live"}
        </h2>

        {/* THE DISCLOSURE, IN THIS SCREEN'S WORDS RATHER THAN THE SERVER'S.
            The sentence that arrives with a stand-in plan is written for
            whoever runs the machine — it talks about ingests, handoffs and the
            pipeline — so it is no longer quoted here. What it is FOR survives
            whole and at headline size: these are not your agents, and importing
            your own plan is what replaces them. It is still gated on the server
            having sent that sentence, because inventing this claim when nobody
            made it is the failure this component exists to prevent. */}
        {!own && plan.fallbackReason !== null && (
          <p className={styles.sourceBody}>
            Your own plan has not been imported yet, so these are example agents standing
            in for it. Everything below — the checks, the versions, the counts — describes
            them and not your business.
          </p>
        )}

        {/* Where the replacement actually happens, and the warning that the
            obvious button there is not it: the example on the import page is a
            demonstration that stops partway on purpose, so an owner sent there
            without this sentence presses the one control that cannot replace
            the sample. */}
        {!own && plan.fallbackReason !== null && (
          <p className={styles.sourceBody}>
            Replacing it means importing a <em>real</em> plan of your own — pasted on the
            import page, or brought over from your planning step. The example on that page
            is a demonstration and stops partway by design; running it does not change
            which workforce this button would put live.
          </p>
        )}

        {!own && plan.fallbackReason === null && (
          <p className={styles.sourceBody}>
            This screen does not recognise where the plan below came from, and nothing
            explained it. Treat the plan below as unidentified rather than as yours.
          </p>
        )}

        {own && (
          <p className={styles.sourceBody}>
            The checks below are judging this plan, and going live records it. What is
            already RUNNING can be a different version — that is what the labels further
            down are for.
          </p>
        )}

        <div className={styles.sourceFacts}>
          <span className={styles.sourceChip}>
            <span className={styles.sourceChipLabel}>Version</span>
            <span className={styles.sourceChipValue}>v{plan.version}</span>
          </span>
          {/* The disclosure again, in two words, for somebody who scans chips
              instead of reading. Never the raw value: an unfamiliar one reads
              as a label rather than as a warning, which is the opposite of what
              this chip is for. */}
          <span className={styles.sourceChip}>
            <span className={styles.sourceChipLabel}>Whose workforce</span>
            <span className={styles.sourceChipValue}>
              {own ? "yours" : "a sample, not yours"}
            </span>
          </span>
          {/* What is RUNNING, which is a different question from which plan is
              being checked — and the gap between them is the whole of the
              go-live decision. Omitted rather than guessed when the read did
              not carry it. */}
          {live !== null && (
            <span className={styles.sourceChip}>
              <span className={styles.sourceChipLabel}>Live now</span>
              <span className={styles.sourceChipValue}>
                {deployed ? "a workforce is live" : "nothing"}
              </span>
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
