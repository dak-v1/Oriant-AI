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
 *
 * THE ANATOMY IS THE DEMO'S, AND WHAT WAS NOT TAKEN FROM IT IS THE POINT. This
 * card wears components/mock/deploy/ActivationPanel.tsx — the panel head, the
 * numbered agent rows, the handoff row at the foot — from the same imported,
 * read-only stylesheet the gate rows wear, so a real go-live looks like the
 * product the demo promised. What was refused: the sequential Ready →
 * Activating → Active animation (the runtime answers once, when the write has
 * finished; nothing here invents an order it never reported), the progress bar
 * (no number exists for it to draw), and the auto-redirect to the workspace
 * (this report is the thing worth reading, and nothing navigates away from it
 * on its own).
 */

import Link from "next/link";
import { ArrowRight, CircleAlert } from "lucide-react";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import type { ActivatedView } from "./api";
import { agentStateLabel, formatInstant, plural } from "./format";
import shell from "@/components/mock/deploy/deploy.module.css";
import styles from "./deploy.module.css";

/** The one outcome that wrote nothing at all. */
const UNCHANGED = "unchanged";

function headline(outcome: string): string {
  switch (outcome) {
    case "activated":
      return "Your workforce is live";
    case "superseded":
      return "Your workforce is live, replacing what was live before";
    case UNCHANGED:
      return "Already live — nothing changed";
    default:
      /* Read open, for the reason ./api.ts gives: this arrives after a write has
         already happened, and refusing the word would leave the screen unable to
         report a go-live that occurred. The word itself is no longer printed —
         it is an internal one and reads as a label rather than as the warning it
         is — but the fact that this screen cannot vouch for what happened is
         said here and again in full below. */
      return "This go-live finished with a result this screen does not recognise";
  }
}

export default function ActivationResult({ result }: { result: ActivatedView }) {
  const unchanged = result.outcome === UNCHANGED;
  const known = ["activated", "superseded", UNCHANGED].includes(result.outcome);
  const registration = result.registration;
  const deployment = result.deployment;
  const evidence = deployment.evidence;

  /* The demo panel's one-word state above its headline. `unchanged` is kept
     deliberately un-celebratory: a green "workforce online" over a write that
     wrote nothing is the reassuring lie this screen exists to stop. */
  const micro = unchanged
    ? "Nothing changed"
    : known
      ? "Workforce online"
      : "Result not recognised";

  return (
    <section className={`oa-card ${shell.panel}`} aria-labelledby="oa-deploy-result">
      <header className={shell.panelHead}>
        <div style={{ display: "grid", gap: 4 }}>
          <p className="oa-micro">{micro}</p>
          <h2 className="oa-h2" id="oa-deploy-result">
            {headline(result.outcome)}
          </h2>
        </div>
      </header>

      {!known && (
        <p className="oa-sub">
          This screen does not recognise that result, so nothing here interprets it. The
          details below are what came back with it, and your agent list is the place to
          confirm what is actually running.
        </p>
      )}

      <div className={styles.liveGrid}>
        <div className={styles.liveStat}>
          <span className={styles.liveLabel}>Agents switched on</span>
          {/* `result.agents` is the runtime records WRITTEN by this call, which
              is empty on `unchanged` — and that is not the same number as the
              agents the deployment covers. Both are shown rather than one
              standing in for the other. */}
          <span className={styles.liveValue}>{result.agents.length}</span>
        </div>

        <div className={styles.liveStat}>
          <span className={styles.liveLabel}>Scheduled runs set up</span>
          {registration === null ? (
            <span className={styles.liveMissing}>
              {unchanged
                ? "nothing was scheduled — this version was already live"
                : "not reported"}
            </span>
          ) : (
            <span className={styles.liveValue}>{registration.registered}</span>
          )}
        </div>

        <div className={styles.liveStat}>
          <span className={styles.liveLabel}>Agents covered</span>
          <span className={styles.liveValue}>{deployment.agents.length}</span>
        </div>
      </div>

      <p className="oa-sub">
        Version {deployment.planVersion} of your plan, put live by {deployment.activatedBy}{" "}
        at {formatInstant(deployment.activatedAt)}.{" "}
        {plural(deployment.triggerIds.length, "scheduled run is", "scheduled runs are")}{" "}
        recorded against it.
      </p>

      {/* The one number on this card that can quietly mean "nothing will ever
          run". Said out loud, in both directions. */}
      {registration !== null && registration.registered === 0 && (
        <p className="oa-sub">
          Nothing was scheduled by this go-live. If any of this work is meant to run on a
          schedule, nothing will start it and this workforce is live in name only — check
          your agents before treating it as running.
        </p>
      )}

      {registration !== null && registration.retired > 0 && (
        <p className="oa-sub">
          {plural(registration.retired, "scheduled run", "scheduled runs")} that{" "}
          {registration.retired === 1 ? "was" : "were"} live{" "}
          {registration.retired === 1 ? "has" : "have"} been stopped. That is what a
          switched-off task looks like after a change to your plan.
        </p>
      )}

      {/* MUST be rendered in full. See the module header. */}
      {registration !== null && registration.rejected.length > 0 && (
        <div className={styles.rejectedBox} role="alert">
          <p className={styles.errorTitle}>
            <CircleAlert size={16} aria-hidden />
            {plural(registration.rejected.length, "switched-on task", "switched-on tasks")}{" "}
            got no schedule and will never start
          </p>
          <p>
            These are switched on in your plan and nothing will ever start them. Going live
            worked around them; this is the part of it that did not.
          </p>
          <ul className={styles.rejectedList}>
            {registration.rejected.map((row) => (
              <li key={`${row.agentId}-${row.workflowId}`} className={styles.rejectedItem}>
                {/* Named, not labelled. These two are the only handle anyone has
                    on WHICH task will never start, so they stay — as a sentence
                    rather than as a run of raw values. */}
                <strong>
                  Agent {row.agentId}, task {row.workflowId}
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
          This replaces what was live before: version {result.supersedes.planVersion}, put
          live by {result.supersedes.activatedBy} at{" "}
          {formatInstant(result.supersedes.activatedAt)}. The old record is kept rather
          than overwritten, so there is a history.
        </p>
      )}

      {result.agents.length > 0 && (
        /* The demo's roster rows — index chip, name, status pill — carrying the
           runtime records this call wrote. `rowActive` (the teal tint) goes only
           to the one state that means running; the other four keep the neutral
           row, so the tint never says more than the word on the pill. */
        <ul className={shell.agentList}>
          {result.agents.map((agent, index) => (
            <li
              key={agent.agentId}
              className={`${shell.agentRow} ${agent.state === "active" ? shell.rowActive : ""}`}
            >
              <span className={shell.agentIdx} aria-hidden>
                {index + 1}
              </span>
              <div className={shell.agentInfo}>
                <p className={shell.agentName}>
                  {agent.agentId} — version {agent.agentVersion}
                </p>
                {/* The runtime's sentence for this agent's go-live, which names
                    any workflow of its own that got no trigger. The demo clamps
                    this slot to one ellipsized line; a runtime sentence is
                    evidence and is never truncated, so `.wraps` undoes the
                    clamp while keeping the type ramp. */}
                <p className={`${shell.agentRole} ${styles.wraps}`}>{agent.detail}</p>
              </div>
              <StatusBadge status={agent.state} label={agentStateLabel(agent.state)} />
            </li>
          ))}
        </ul>
      )}

      {/* Null only on a record written before this field existed. Reported as
          the absence it is rather than as three green words nobody stored. */}
      {evidence === null ? (
        <p className="oa-sub">
          This record does not say which checks cleared it or which test results proved it.
          That is a gap in the record rather than a check that was skipped — the checks did
          run, this record just does not remember them.
        </p>
      ) : (
        <p className="oa-sub">
          Recorded with this go-live: agents built —{" "}
          {evidence.packagesReady ? "yes" : "NO"}, testing passed —{" "}
          {evidence.sandboxReady ? "yes" : "NO"}, tools connected —{" "}
          {evidence.integrationsReady ? "yes" : "NO"}
          {evidence.sandboxFingerprint === null
            ? ", and no test result was recorded against it"
            : ", and the test results behind it were kept"}
          .
        </p>
      )}

      {/* The demo's handoff row, minus its auto-redirect: nothing navigates on
          its own, because this report is the thing worth reading. */}
      <div className={shell.handoff}>
        <p className="oa-sub">
          Your agent list is where you confirm what is actually running.
        </p>
        <div className={styles.linkRow}>
          <Link href="/app/workspace/agents?live=1" className="oa-btn oa-btn--primary">
            Your agents
            <ArrowRight size={15} aria-hidden />
          </Link>
          <Link href="/app/workspace?live=1" className="oa-btn oa-btn--ghost oa-btn--sm">
            Workspace
            <ArrowRight size={13} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
