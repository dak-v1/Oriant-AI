"use client";
/**
 * components/live/agents/AgentCard.tsx — one agent: what it is, what it is doing,
 * when it next wakes up, and the two controls an owner has over it
 * (ROLE_C_PLAN M6).
 *
 * THE CONTROLS ARE PAUSE AND RESUME. THERE IS NO STOP, AND THE SCREEN SAYS SO
 * RATHER THAN DRAWING A THIRD BUTTON. M6 lists "pause/resume/stop";
 * `AgentRuntimeState` has five values and none of them is stopped, and
 * activation.ts has two functions, not three. Pause already disables every
 * trigger the agent has — that IS stopping it — so a third control would either
 * do the same thing under a stronger name or promise a state the runtime cannot
 * hold. Either way an owner would be told something untrue about what happens
 * tomorrow morning.
 *
 * A REFUSED RESUME IS RENDERED, NOT SWALLOWED. `resumeAgent` refuses four
 * distinguishable ways — the agent is not in the plan, it was never activated,
 * its version has moved since activation, or it is in a state resume does not
 * restart — and each refusal comes back as a sentence, not a code. The button
 * therefore does NOT pre-judge those cases: it asks, and prints whatever the
 * runtime answers, because the runtime is the one implementation of that rule and
 * a second copy in the browser would be the one that goes stale. What the card
 * DOES do is warn about version drift before the click, so the refusal is
 * expected rather than surprising.
 *
 * NOBODY IS NAMED AS THE ACTOR, BECAUSE NOBODY IS SIGNED IN. `pauseAgent` takes
 * an optional `pausedBy` that it writes into the record an audit later reads.
 * There is no authentication on this surface yet, so any id sent from here would
 * be invented — and an invented actor in an audit trail is worse than an absent
 * one. The field is left off until there is a real user to put in it.
 *
 * THE DETAIL IS A DISCLOSURE, NOT A DRAWER. See AgentDetail.tsx: reading an
 * agent's configuration is a longer look at the row you are on, not a task you
 * enter, so it is a `<button aria-expanded aria-controls>` over a region rather
 * than a modal with a focus trap.
 *
 * ── M7 ──
 *
 * THE REGION `aria-controls` NAMES ALWAYS EXISTS. Through M6 the panel was
 * rendered only while open, so a collapsed button pointed `aria-controls` at an
 * element that was not in the document — which is exactly the state a screen
 * reader cannot describe, and the one an assistive technology's "jump to
 * controlled element" has nothing to jump to. The container is now permanent and
 * `hidden`; its CONTENTS are still built only when open, so a roster of four
 * agents does not construct four configuration panels nobody asked for.
 *
 * FOCUS STAYS ON THE BUTTON, which is the disclosure pattern and not an omission.
 * The button is the last control in the row and the region follows it in the
 * document, so the next Tab lands inside what just opened; moving focus for the
 * reader would take it away from the toggle they may be about to press again.
 *
 * MEMOISED. The roster above now holds a live connection whose status sentence
 * rewrites itself as the stream connects, drops and recovers. Each of those is a
 * re-render in which nothing about this agent changed, and a card is a large
 * subtree — four counts, a schedule reading, and a configuration panel if it is
 * open. `agent` is a fresh object on every genuine refetch, so this skips exactly
 * the renders that had nothing in them.
 */

import { memo, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  Pause,
  Play,
  Rocket,
} from "lucide-react";
import { approvalsHref, createZone } from "@/components/live/workspace/read-model";
import type { AgentAction, AgentView, TransitionResult } from "./api";
import { submitTransition } from "./api";
import AgentDetail from "./AgentDetail";
import { AgentStatePill, agentStateLabel } from "./pills";
import { readActivity, readCounts, readNextRun } from "./read-model";
import styles from "./live-agents.module.css";

function AgentCardImpl({
  agent,
  globalForbidden,
  now,
  live,
  onChanged,
}: {
  agent: AgentView;
  globalForbidden: string[];
  /** The server's instant, so "due now" is judged against its clock, not ours. */
  now: string;
  live: boolean;
  /** Re-reads the roster after a transition, so the card shows what the store holds. */
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<AgentAction | null>(null);
  const [result, setResult] = useState<TransitionResult | null>(null);

  /* The agent's OWN timezone, not one shared business day. This card is about a
     single agent, and its schedule was written in that zone; the Workspace groups
     a day across agents and therefore has to pick one. */
  const zone = useMemo(() => createZone(agent.counts.dayTimezone), [agent.counts.dayTimezone]);

  const activity = readActivity(agent);
  const next = readNextRun(agent, zone, now);
  const counts = readCounts(agent);

  const transition = useCallback(
    async (action: AgentAction) => {
      setBusy(action);
      setResult(null);
      // No `by`: see the module header. An invented actor is worse than none.
      const outcome = await submitTransition({ agentId: agent.agentId, action });
      setResult(outcome);
      setBusy(null);
      onChanged();
    },
    [agent.agentId, onChanged],
  );

  const state = agent.runtime?.state ?? null;
  /* Pausing is never the unsafe direction, so it is offered whenever it could do
     anything at all — including for an agent whose record says paused but whose
     triggers are somehow still enabled, which is exactly the state pause exists
     to clean up. */
  const canPause = agent.counts.enabledTriggers > 0 || (state !== null && state !== "paused");
  const canResume = state === "paused";

  const headingId = `live-agent-${agent.agentId}`;
  const detailId = `live-agent-detail-${agent.agentId}`;

  return (
    <article className={`oa-card ${styles.agentCard}`} aria-labelledby={headingId}>
      <div className={styles.agentHead}>
        <div className={styles.agentTitles}>
          <h2 className={styles.agentName} id={headingId}>
            {agent.name}
          </h2>
          <p className="oa-sub">{agent.role}</p>
          <p className={styles.rowSub}>
            Version {agent.version} in your plan
            {agent.runtime !== null && ` · running version ${agent.runtime.agentVersion}`}
          </p>
        </div>
        <div className={styles.agentSide}>
          <AgentStatePill state={state} />
        </div>
      </div>

      {/* The runtime's own sentence about why it is in this state, verbatim. It
          is written by `activate`, `pauseAgent` and `resumeAgent` and says things
          no derivation here could — how many workflows came back, which ones got
          no trigger, that missed runs are not backfilled. */}
      <p className={styles.stateDetail}>
        {agent.runtime === null
          ? "This agent has never been put live, so nothing is scheduled for it and nothing " +
            "will start it."
          : agent.runtime.detail}
      </p>

      {agent.versionDrift && agent.runtime !== null && (
        <p className={`${styles.note} ${styles.noteWarn}`}>
          <AlertTriangle size={14} className={styles.noteIcon} aria-hidden />
          <span>
            This agent went live at version {agent.runtime.agentVersion} and your plan now
            carries version {agent.version}. Resume restarts the version that was checked, not
            the changes made since, so it will refuse — put the plan live again so the new
            version goes through the checks.
          </span>
        </p>
      )}

      {/* ── Doing now · next run ── */}
      <dl className={styles.nowGrid}>
        <div className={styles.nowCell}>
          <dt className={styles.nowTerm}>Doing now</dt>
          <dd className={styles.nowValue}>{activity.headline}</dd>
          <dd className={styles.nowSub}>{activity.detail}</dd>
          {activity.extra !== null && <dd className={styles.nowSub}>{activity.extra}</dd>}
          {activity.needsDecision && activity.approvalId !== null && (
            <dd className={styles.nowSub}>
              <Link href={approvalsHref(activity.approvalId, live)} className={styles.inlineLink}>
                Review the decision it is waiting on
              </Link>
            </dd>
          )}
        </div>

        <div className={styles.nowCell}>
          <dt className={styles.nowTerm}>Next run</dt>
          <dd className={next.scheduled ? styles.nowValue : styles.unknown}>{next.headline}</dd>
          <dd className={styles.nowSub}>{next.detail}</dd>
          {next.scheduled && (
            <dd className={styles.nowSub}>
              Times in {zone.id}
              {zone.ok
                ? ""
                : ` — the plan asked for "${zone.requested}", which this browser does not know`}
            </dd>
          )}
        </div>
      </dl>

      {/* ── Counts ──
          A missing value is an em dash plus its reason, never a nought: zero
          failures and zero approvals is also exactly what healthy looks like, so
          a count that could not be taken must not be rendered as good news. The
          reason is in the visible text rather than a `title`, because a tooltip
          reaches neither a keyboard nor a screen reader. */}
      <div className={styles.statRow}>
        {counts.map((count) => (
          <div key={count.id} className={styles.stat}>
            <span
              className={`${styles.statNum} ${
                count.value === null
                  ? styles.statMissing
                  : count.attention && count.value > 0
                    ? styles.statAttention
                    : ""
              }`}
            >
              {count.value === null ? "—" : count.value}
              {count.suffix}
            </span>
            <span className={styles.statLabel}>{count.label}</span>
            <span className={styles.statSub}>{count.sub}</span>
          </div>
        ))}
      </div>

      {/* ── Would a run start right now? ──
          `resolveRunStart` itself answered this, on the server, at the instant
          the roster was read — the same function the scheduler gates on. Shown
          only when the answer is no, because "yes" is the ordinary case and does
          not need a line. */}
      {agent.startGate !== null && agent.startGate.action !== "allow" && (
        <p className={styles.note}>
          <Info size={14} className={styles.noteIcon} aria-hidden />
          <span>
            A run could not have started at the moment this was loaded: {agent.startGate.reason}{" "}
            That is recorded as a skipped run with its reason, never as a failure.
          </span>
        </p>
      )}

      {/* ── Controls ── */}
      <div className={styles.controls}>
        {canPause && (
          <button
            type="button"
            className="oa-btn oa-btn--ghost oa-btn--sm"
            onClick={() => void transition("pause")}
            disabled={busy !== null}
          >
            <Pause size={13} aria-hidden />
            {busy === "pause" ? "Pausing…" : "Pause agent"}
          </button>
        )}

        {canResume && (
          <button
            type="button"
            className="oa-btn oa-btn--primary oa-btn--sm"
            onClick={() => void transition("resume")}
            disabled={busy !== null}
          >
            <Play size={13} aria-hidden />
            {busy === "resume" ? "Resuming…" : "Resume agent"}
          </button>
        )}

        {agent.runtime === null && (
          <Link href="/app/deploy" className="oa-btn oa-btn--primary oa-btn--sm">
            <Rocket size={13} aria-hidden />
            Put the plan live
          </Link>
        )}

        {agent.counts.pendingApprovals > 0 && (
          <Link href={approvalsHref(null, live)} className="oa-btn oa-btn--soft oa-btn--sm">
            {agent.counts.pendingApprovals} waiting on you
          </Link>
        )}

        <button
          type="button"
          className="oa-btn oa-btn--ghost oa-btn--sm"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <ChevronUp size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />}
          {open ? "Hide detail" : "Workflows, runs and settings"}
        </button>

        {!canPause && !canResume && agent.runtime !== null && (
          <span className={styles.controlNote}>
            Resume only restarts an agent that was paused; this one reads &ldquo;
            {agentStateLabel(state)}&rdquo;. Put the plan live again once whatever left it in
            that state is fixed.
          </span>
        )}
      </div>

      {result !== null && <TransitionReport result={result} />}

      {/* Permanent, so `aria-controls` above always resolves; empty until opened,
          so a collapsed card costs nothing to render. See the module header. */}
      <div id={detailId} hidden={!open}>
        {open && (
          <AgentDetail
            agent={agent}
            globalForbidden={globalForbidden}
            zone={zone}
            live={live}
          />
        )}
      </div>
    </article>
  );
}

export default memo(AgentCardImpl);

/**
 * What the runtime said, in the runtime's words.
 *
 * Three outcomes and three treatments, because they need three different things
 * from the reader. A change that landed is confirmation; a refusal is a reason
 * they can act on; an unknown outcome is an admission that the screen cannot
 * tell — and it is announced as an alert for the same reason the other two are
 * not: it is the only one where doing nothing is the wrong response.
 *
 * `changed: false` from a PAUSE is not a failure and is not dressed as one. It
 * means the agent was already stopped with nothing enabled — a success, and the
 * runtime says so in a sentence.
 */
function TransitionReport({ result }: { result: TransitionResult }) {
  if (result.kind === "applied") {
    const { outcome } = result;
    return (
      <div
        className={`${styles.result} ${outcome.changed ? styles.resultApplied : ""}`}
        role="status"
      >
        <p className={styles.resultTitle}>
          <CheckCircle2 size={15} aria-hidden />
          {outcome.changed ? "Done" : "Nothing to change"}
        </p>
        <p className={styles.resultBody}>{outcome.detail}</p>
        {outcome.rejected.length > 0 && (
          <p className={styles.resultBody}>
            {outcome.rejected.length} enabled{" "}
            {outcome.rejected.length === 1 ? "workflow has" : "workflows have"} no usable
            trigger and will not start: {outcome.rejected.join(", ")}.
          </p>
        )}
      </div>
    );
  }

  if (result.kind === "refused") {
    return (
      <div className={`${styles.result} ${styles.resultRefused}`} role="alert">
        <p className={styles.resultTitle}>
          <AlertTriangle size={15} aria-hidden />
          This was refused
        </p>
        <p className={styles.resultBody}>{result.message}</p>
        <p className={styles.resultBody}>
          Nothing changed. This is a rule your workspace enforces, not something this screen
          decided, so the same answer would come back from anywhere else in the product.
        </p>
      </div>
    );
  }

  return (
    <div className={`${styles.result} ${styles.resultRefused}`} role="alert">
      <p className={styles.resultTitle}>
        <AlertTriangle size={15} aria-hidden />
        This screen cannot tell what happened
      </p>
      <p className={styles.resultBody}>{result.message}</p>
    </div>
  );
}
