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
  if (plan === null) {
    return (
      <section className={`${styles.sourceNotice} ${styles.sourceNoticeCalm}`}>
        <span className={styles.sourceIcon} aria-hidden>
          <ShieldQuestion size={21} />
        </span>
        <div className={styles.sourceText}>
          <h2 className={styles.sourceTitle}>
            Which workforce this would activate is not known yet
          </h2>
          <p className={styles.sourceBody}>
            The runtime has not told this screen whether the plan behind the gates below
            is the one ingested from your handoff or the demo workforce standing in for
            it. Until it does, nothing here says which — and the button will not send,
            because the whole point of this notice is that the two are not
            interchangeable.
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
            ? "This is the workforce ingested from your handoff"
            : "This is NOT your workforce — the button below would put the demo live"}
        </h2>

        {/* The runtime's sentence, verbatim. It is the one written to explain
            the fallback, and a paraphrase would lose the instruction at the end
            of it. Shown only when the runtime sent one — it sends none for a
            real plan, and inventing a reassuring sentence to fill the space is
            the failure this component exists to prevent. */}
        {plan.fallbackReason !== null && (
          <p className={styles.sourceBody}>{plan.fallbackReason}</p>
        )}

        {!own && plan.fallbackReason === null && (
          <p className={styles.sourceBody}>
            The runtime reports the plan source as{" "}
            <code>{plan.source}</code>, which this build does not recognise as an
            ingested workforce, and it sent no explanation with it. Treat the plan
            below as unidentified rather than as yours.
          </p>
        )}

        {own && (
          <p className={styles.sourceBody}>
            The gates below are judging this plan, and activating writes a deployment
            for it. What is already RUNNING can be a different version — that is what
            the lifecycle tags further down are for.
          </p>
        )}

        <div className={styles.sourceFacts}>
          <span className={styles.sourceChip}>
            <span className={styles.sourceChipLabel}>Plan</span>
            <span className={styles.sourceChipValue}>{plan.planId}</span>
          </span>
          <span className={styles.sourceChip}>
            <span className={styles.sourceChipLabel}>Version</span>
            <span className={styles.sourceChipValue}>v{plan.version}</span>
          </span>
          <span className={styles.sourceChip}>
            <span className={styles.sourceChipLabel}>Source</span>
            <span className={styles.sourceChipValue}>{plan.source}</span>
          </span>
          {/* What is RUNNING, which is a different question from which plan is
              being gated — and the gap between them is the whole of the go-live
              decision. Omitted rather than guessed when the read did not carry
              it. */}
          {live !== null && (
            <span className={styles.sourceChip}>
              <span className={styles.sourceChipLabel}>Deployed now</span>
              <span className={styles.sourceChipValue}>
                {deployed && live.deploymentId !== null
                  ? live.deploymentId
                  : deployed
                    ? "a deployment the runtime did not name"
                    : "nothing"}
              </span>
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
