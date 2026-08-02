"use client";
/**
 * components/live/deploy/ActivationResult.tsx — what the go-live actually did.
 *
 * THREE OUTCOMES SHARE THIS COMPONENT AND ONLY ONE OF THEM IS A GO-LIVE.
 * `activate` answers `activated`, `superseded` or `unchanged`, and the third
 * WROTE NOTHING: this exact plan version was already live, so re-registering
 * would have recomputed every `nextFireAt` from now and pushed a sweep that was
 * due into next week — "the Friday run would silently not happen, on the day
 * someone pressed a button that promised nothing would change". A screen that
 * celebrated all three identically would report a second go-live that never
 * happened, so `unchanged` gets its own quiet card and its own sentence.
 *
 * REJECTED TRIGGERS ARE THE LOUDEST THING IN A SUCCESSFUL ACTIVATION. Both
 * `activate` and `TriggerRegistration` say callers MUST render them: they are
 * enabled workflows that got no trigger, and "a workflow the owner believes is
 * live which nothing will ever start is the worst outcome available". They are
 * never collapsed, never counted-and-hidden, and each one carries the runtime's
 * own reason.
 *
 * A ZERO IS NOT SILENCE. `0 triggers registered` on a first go-live means the
 * workforce is live in name only; on an `unchanged` re-activation it is exactly
 * correct. The card knows which outcome it is looking at and says so, rather than
 * printing a number and leaving the reader to decide which of those it means.
 *
 * THE EVIDENCE IS SHOWN BECAUSE IT IS FROZEN. `Deployment.evidence` records which
 * gates authorised this go-live and which sandbox verdict did — not that one
 * existed, WHICH one. It is the answer to "what exactly was live, and on what
 * proof" on the day somebody asks, and it costs three lines to surface.
 */

import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleAlert, Info } from "lucide-react";
import type { ActivatedView } from "./api";
import { formatInstant, plural } from "./format";
import styles from "./deploy.module.css";

/** The one outcome that wrote nothing at all. */
const UNCHANGED = "unchanged";

function headline(outcome: string): string {
  switch (outcome) {
    case "activated":
      return "The workforce is live";
    case "superseded":
      return "The workforce is live, replacing the previous deployment";
    case UNCHANGED:
      return "Already live — nothing was written";
    default:
      // Read open, for the reason ./api.ts gives: this arrives after a write has
      // already happened, and refusing the word would leave the screen unable to
      // report a go-live that occurred.
      return `The runtime reported the outcome "${outcome}"`;
  }
}

export default function ActivationResult({ result }: { result: ActivatedView }) {
  const unchanged = result.outcome === UNCHANGED;
  const known = ["activated", "superseded", UNCHANGED].includes(result.outcome);
  const registration = result.registration;
  const deployment = result.deployment;
  const evidence = deployment.evidence;

  return (
    <section
      className={`${styles.liveCard} ${unchanged ? styles.liveCardQuiet : ""}`}
      aria-labelledby="oa-deploy-result"
    >
      <h2 className={styles.liveTitle} id="oa-deploy-result">
        {unchanged ? <Info size={18} aria-hidden /> : <CheckCircle2 size={18} aria-hidden />}
        {headline(result.outcome)}
      </h2>

      {!known && (
        <p className="oa-sub">
          This build does not know what that outcome means, so nothing here interprets
          it. The deployment below is what the runtime returned with it, and the roster
          is the place to confirm what is actually running.
        </p>
      )}

      <div className={styles.liveGrid}>
        <div className={styles.liveStat}>
          <span className={styles.liveLabel}>Deployment</span>
          <span className={`${styles.liveValue} ${styles.liveValueId}`}>
            {deployment.deploymentId}
          </span>
        </div>

        <div className={styles.liveStat}>
          <span className={styles.liveLabel}>Agents activated</span>
          {/* `result.agents` is the runtime records WRITTEN by this call, which
              is empty on `unchanged` — and that is not the same number as the
              agents the deployment covers. Both are shown rather than one
              standing in for the other. */}
          <span className={styles.liveValue}>{result.agents.length}</span>
        </div>

        <div className={styles.liveStat}>
          <span className={styles.liveLabel}>Triggers registered</span>
          {registration === null ? (
            <span className={styles.liveMissing}>
              {unchanged
                ? "nothing was registered — this version was already live"
                : "not reported"}
            </span>
          ) : (
            <span className={styles.liveValue}>{registration.registered}</span>
          )}
        </div>

        <div className={styles.liveStat}>
          <span className={styles.liveLabel}>Agents in this deployment</span>
          <span className={styles.liveValue}>{deployment.agents.length}</span>
        </div>
      </div>

      <p className="oa-sub">
        Plan <code>{deployment.planId}</code> at version {deployment.planVersion}, activated
        by {deployment.activatedBy} at {formatInstant(deployment.activatedAt)}.{" "}
        {plural(deployment.triggerIds.length, "trigger", "triggers")} are recorded against
        it.
      </p>

      {/* The one number on this card that can quietly mean "nothing will ever
          run". Said out loud, in both directions. */}
      {registration !== null && registration.registered === 0 && (
        <p className="oa-sub">
          No trigger was registered by this activation. If this workforce has scheduled
          workflows, nothing will start them on its own and it is live in name only —
          check the roster before treating it as running.
        </p>
      )}

      {registration !== null && registration.retired > 0 && (
        <p className="oa-sub">
          {plural(registration.retired, "trigger", "triggers")} previously live{" "}
          {registration.retired === 1 ? "was" : "were"} stood down by this registration.
          That is what a disabled workflow looks like after a plan edit.
        </p>
      )}

      {/* MUST be rendered in full. See the module header. */}
      {registration !== null && registration.rejected.length > 0 && (
        <div className={styles.rejectedBox} role="alert">
          <p className={styles.errorTitle}>
            <CircleAlert size={16} aria-hidden />
            {plural(registration.rejected.length, "enabled workflow", "enabled workflows")}{" "}
            got no trigger and will never start
          </p>
          <p>
            These are switched on in the plan and nothing will ever fire them. The
            activation succeeded around them; this is the part of it that did not.
          </p>
          <ul className={styles.rejectedList}>
            {registration.rejected.map((row) => (
              <li key={`${row.agentId}-${row.workflowId}`} className={styles.rejectedItem}>
                <strong>
                  {row.agentId} · {row.workflowId} ({row.kind})
                </strong>
                {/* The runtime's own reason, verbatim. */}
                <span>{row.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.supersedes !== null && (
        <p className="oa-sub">
          This replaces deployment <code>{result.supersedes.deploymentId}</code> (plan
          version {result.supersedes.planVersion}, activated by{" "}
          {result.supersedes.activatedBy} at {formatInstant(result.supersedes.activatedAt)}).
          The old record is kept rather than rewritten — deployments are an audit trail.
        </p>
      )}

      {result.agents.length > 0 && (
        <ul className={styles.recordList}>
          {result.agents.map((agent) => (
            <li key={agent.agentId} className={styles.recordItem}>
              <span className={styles.recordHead}>
                {agent.agentId} v{agent.agentVersion}
                <span className="oa-status oa-status--active">{agent.state}</span>
              </span>
              {/* The runtime's sentence for this agent's go-live, which names any
                  workflow of its own that got no trigger. */}
              <span>{agent.detail}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Null only on a record written before this field existed. Reported as
          the absence it is rather than as three green words nobody stored. */}
      {evidence === null ? (
        <p className="oa-sub">
          This deployment record carries no evidence block, so it cannot say which gates
          authorised it or which sandbox verdict proved it. That is a gap in the record
          rather than a gate that was skipped — the gates ran, this row just does not
          remember them.
        </p>
      ) : (
        <p className="oa-sub">
          Evidence frozen on this deployment: packages{" "}
          {evidence.packagesReady ? "ready" : "NOT ready"}, sandbox{" "}
          {evidence.sandboxReady ? "ready" : "NOT ready"}, integrations{" "}
          {evidence.integrationsReady ? "ready" : "NOT ready"}
          {evidence.sandboxFingerprint === null
            ? ", and no sandbox verdict was recorded against it"
            : `, proved by ${evidence.sandboxFingerprint}`}
          .
        </p>
      )}

      <div className={styles.linkRow}>
        <Link href="/app/workspace/agents?live=1" className="oa-btn oa-btn--ghost oa-btn--sm">
          Live agent roster
          <ArrowRight size={13} aria-hidden />
        </Link>
        <Link href="/app/workspace?live=1" className="oa-btn oa-btn--ghost oa-btn--sm">
          Workspace
          <ArrowRight size={13} aria-hidden />
        </Link>
      </div>
    </section>
  );
}
