"use client";
/**
 * components/live/workspace/ActivationNotice.tsx — what the Workspace says when
 * there is no workforce yet (ROLE_C_PLAN M5, blocked states M7).
 *
 * An operations screen with nothing in it has exactly one job: say why, and say
 * where to go. Four zeroes and a set of empty cards is technically accurate and
 * completely useless — it looks identical to a quiet Tuesday, and an owner
 * cannot tell "nothing happened today" from "nothing will ever happen because
 * this was never put live".
 *
 * NOT-ACTIVATED IS JUDGED FROM THE TRIGGERS, NOT FROM THE CHECKLIST.
 * `activate()` writes triggers before anything else, so their absence is the
 * cheapest sound evidence that no go-live has happened — and it comes free with
 * the scheduler read this page already makes. The test is "registered", not
 * "enabled": an owner who has paused every agent has an activated plan with
 * nothing running, and telling them to go and activate it would be wrong.
 *
 * WHICH GATE IS SHUT IS A SEPARATE, EXPENSIVE QUESTION, and it is asked by
 * `ActivationGates` — shared with the Approvals inbox's empty state so both
 * screens name the three gates the same way. Its header carries the reasoning
 * for the button: `GET /api/runtime/activation` re-runs the sandbox suite to
 * answer, which is the right cost on the deploy screen and the wrong one on a
 * dashboard that now refetches itself whenever the runtime moves.
 *
 * The blockers each carry their own `href` from `ActivationBlocker`, so the
 * runtime decides where a missing package or a disconnected integration is
 * fixed and this screen never invents a second route table.
 */

import Link from "next/link";
import { ArrowRight, Rocket } from "lucide-react";
import ActivationGates from "./ActivationGates";
import styles from "./live-workspace.module.css";

/** Where a go-live is performed. Kept next to the copy that points at it. */
const ACTIVATION_HREF = "/app/deploy";

export default function ActivationNotice({ planVersion }: { planVersion: number }) {
  return (
    <section
      aria-labelledby="live-ws-activation"
      className={`oa-card ${styles.card} ${styles.notice}`}
    >
      <div className={styles.cardHead}>
        <div className={styles.cardTitle}>
          <Rocket size={16} className={styles.cardIcon} aria-hidden />
          <h2 className="oa-h3" id="live-ws-activation">
            This plan is not live yet
          </h2>
        </div>
        <Link href={ACTIVATION_HREF} className="oa-btn oa-btn--primary oa-btn--sm">
          Go to activation
          <ArrowRight size={13} aria-hidden />
        </Link>
      </div>

      <div className={styles.noticeBody}>
        <p className="oa-lead">
          No triggers are registered for plan version {planVersion}, which means
          activation has not run. Nothing is scheduled, nothing will fire, and no
          approval can appear — the workforce exists as a plan and as built
          packages, but not as anything that starts on its own.
        </p>
        <p className="oa-sub">
          Three gates stand in front of go-live and each one blocks on its own:
          every agent&apos;s package built, the sandbox passed, and the
          integrations the plan marks required actually connected. Activation
          checks all three, then registers the triggers and flips the agents
          live.
        </p>
      </div>

      <ActivationGates />
    </section>
  );
}
