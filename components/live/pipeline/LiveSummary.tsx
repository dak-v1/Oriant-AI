"use client";
/**
 * components/live/pipeline/LiveSummary.tsx — what exists now that the pass ran
 * to the end.
 *
 * Three facts, and they are the three an owner needs before they will believe a
 * green pass: the deployment that is on record, how many agents it covers, and
 * how many triggers were actually registered. The third is the one that catches
 * the failure nobody looks for — an activation that recorded a deployment and
 * registered nothing is live in name only, and the workforce will sit there
 * forever waiting for a trigger that does not exist. The orchestrator already
 * refuses to call that a completed pass; showing the count is how somebody
 * watching can see it for themselves rather than trusting that it was checked.
 *
 * A NULL DEPLOYMENT ID IS RENDERED AS ABSENT, NOT AS BLANK. The type allows it,
 * so the screen has to have an answer for it, and "—" would read as a dash
 * somebody forgot to fill in. A deployment that cannot name itself is not
 * evidence of anything, and the words say so.
 *
 * The route's own top-level `notice` is quoted rather than paraphrased. It is
 * the runtime's sentence about draft_only; `DraftOnlyNotice` above makes the
 * same point at the size it deserves, and this is the receipt.
 */

import { CheckCircle2 } from "lucide-react";
import type { LiveView, PlanView } from "./api";
import { plural } from "./format";
import styles from "./pipeline.module.css";

export default function LiveSummary({
  live,
  plan,
  notice,
}: {
  live: LiveView;
  plan: PlanView | null;
  /** The route's own sentence, when it sent one. Quoted, never rewritten. */
  notice: string | null;
}) {
  return (
    <section className={styles.liveCard} aria-labelledby="oa-pipe-live">
      <h2 className={styles.liveTitle} id="oa-pipe-live">
        <CheckCircle2 size={18} aria-hidden />
        The pass completed and this is what is live
      </h2>

      <div className={styles.liveGrid}>
        <div className={styles.liveStat}>
          <span className={styles.liveLabel}>Deployment</span>
          {live.deploymentId === null ? (
            <span className={styles.liveMissing}>
              not reported — treat this activation as unproven
            </span>
          ) : (
            <span className={`${styles.liveValue} ${styles.liveValueId}`}>
              {live.deploymentId}
            </span>
          )}
        </div>

        <div className={styles.liveStat}>
          <span className={styles.liveLabel}>Agents</span>
          <span className={styles.liveValue}>{live.agents}</span>
        </div>

        <div className={styles.liveStat}>
          <span className={styles.liveLabel}>Triggers registered</span>
          <span className={styles.liveValue}>{live.triggersRegistered}</span>
        </div>
      </div>

      {live.triggersRegistered === 0 && (
        <p className="oa-sub">
          No trigger was registered. That happens legitimately when this exact plan
          version was already live and activation had nothing to write — but if this was a
          first go-live, nothing will ever start on its own and the workforce is live in
          name only.
        </p>
      )}

      {plan !== null && (
        <p className="oa-sub">
          Plan <code>{plan.planId}</code>, version {plan.version},{" "}
          {plural(plan.agents.length, "agent", "agents")} ingested.
        </p>
      )}

      {notice !== null && <p className="oa-sub">{notice}</p>}
    </section>
  );
}
