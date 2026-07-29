"use client";
/**
 * components/live/agents/LiveAgentRoster.tsx — the agent roster, over the real
 * runtime (ROLE_C_PLAN M6).
 *
 * This is the screen that answers "what is my workforce actually doing" without
 * anybody having to guess from an inbox. Everything on it is read from
 * `/api/runtime/agents`, which derives every field from the scheduler store, the
 * run store and the approved plan on each request. Nothing is scripted; the
 * scripted roster it sits beside is the same URL with the switch off, and it
 * keeps working permanently by design (ROLE_C_PLAN's integration checkpoints).
 *
 * THE STALE LIST IS KEPT WHEN A REFRESH FAILS. A read that cannot reach the
 * runtime replaces neither the cards nor the truth: they stay, a banner says the
 * view is out of date and names what failed, and the read timestamp stops
 * advancing. Blanking the roster on a transient failure would read as "you have
 * no agents", which on an operations screen is the most expensive wrong answer
 * available.
 *
 * ONE SOURCE, SO ONE FAILURE STATE — and that is a deliberate difference from the
 * Workspace, which keeps three `Loaded`s because it reads three endpoints and a
 * dead scheduler should not cost it the approvals preview. Here the route already
 * joined everything server-side, at one instant, which is what makes "waiting on
 * Sarah for 4h" and "next fires Friday 09:00" comparable on the same card. The
 * price of that join is that it fails as a unit, and pretending otherwise by
 * rendering half a card would be worse.
 *
 * A TRANSITION REFRESHES THE WHOLE ROSTER, NOT JUST ITS CARD. Pausing one agent
 * changes that agent's triggers and therefore what the plan as a whole has
 * scheduled; re-reading everything costs one request and guarantees the screen
 * agrees with the store rather than with an optimistic patch.
 *
 * ── M7: STILL NO POLL, AND NOW A PUSH ──
 *
 * M6 refused a timer here, and the reasoning is worth restating before it is
 * amended, because only half of it survives. The half that does not: "realtime
 * costs an owner nothing they want". A push is not a poll. The M6 objection was
 * to a tab left open all afternoon RE-DERIVING THE WHOLE PLAN every few seconds
 * with no evidence that anything had happened — 240 reads an hour to discover
 * that a workforce was idle, which is what it usually is. The change stream
 * inverts exactly that: `/api/runtime/events` observes the stores once per
 * process, for every screen at once, and this roster reads again only when
 * `agents`, `runs` or `schedule` actually moved. An idle afternoon costs zero
 * reads. So the roster subscribes.
 *
 * The half that survives, and is honoured rather than argued with: A BLIND TIMER
 * IS STILL A BLIND TIMER. When the hook cannot hold a stream it falls back to
 * ticking, and a tick means "something may have changed, we cannot know" — which
 * is the poll M6 declined, wearing a different name. So this screen asks for a
 * SLOWER fallback than the default: sixty seconds rather than twenty. A roster is
 * consulted rather than watched, an agent's state does not turn over in a minute,
 * and the hook prints its own interval into the sentence it hands back, so the
 * page says out loud how far behind it may be. The inbox, where a decision's
 * deadline moves under the reader, is welcome to the faster number.
 *
 * The cards do not jump under a reader either way: the list is keyed by agent id,
 * so a refetch updates text in place, an open drill-in stays open, and focus stays
 * where the reader put it.
 *
 * NOTHING HERE DEPENDS ON THE STREAM. Mount, a returning tab and the Refresh
 * button all still read, and each read aborts whatever the last one started — so
 * a burst of triggers costs one completed request, not one per trigger.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, LayoutGrid, Radio, RefreshCw, Rocket, Users, WifiOff } from "lucide-react";
import { createZone } from "@/components/live/workspace/read-model";
import type { RuntimeEventsStatus, RuntimeTopic } from "@/components/live/useRuntimeEvents";
import { useRuntimeEvents } from "@/components/live/useRuntimeEvents";
import type { ApiFailureKind, RosterView } from "./api";
import { AgentsApiError, fetchRoster } from "./api";
import AgentCard from "./AgentCard";
import { AgentStatePill } from "./pills";
import styles from "./live-agents.module.css";

/**
 * What a roster row is derived from, and therefore what it wakes for.
 *
 * `agents` is the runtime record behind every state pill; `runs` is "doing now",
 * the run history and every count on the card; `schedule` is the triggers, the
 * next-fire times and the queue the failure counts read. `approvals` is
 * deliberately absent and is not an oversight — an approval appearing or being
 * decided moves the run it belongs to, and the run digest carries
 * `pendingApprovalId`, so the roster already wakes for it through `runs`.
 */
const ROSTER_TOPICS: RuntimeTopic[] = ["agents", "runs", "schedule"];

/** See the module header: the blind fallback is the poll M6 refused, slowed. */
const ROSTER_FALLBACK_MS = 60_000;

/** The connection, in one word, before the sentence explaining it. */
const STREAM_WORD = {
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
  unsupported: "Not live",
} satisfies Record<RuntimeEventsStatus, string>;

/**
 * Why the read failed, kept apart from the message because the three cases need
 * three different things from the reader. A transport failure is theirs to fix;
 * an HTTP status is the runtime's answer; a malformed body is a contract break
 * between this screen and the route, and saying so beats "something went wrong".
 */
interface LoadFailure {
  kind: ApiFailureKind | "unknown";
  message: string;
}

const FAILURE_ADVICE: Record<LoadFailure["kind"], string> = {
  transport:
    "The browser could not reach the runtime at all. Check that the app is running and that " +
    "/api/runtime/agents is reachable from here.",
  http: "The runtime answered, and the answer was a refusal. Its reason is above.",
  malformed:
    "The runtime answered with a shape this screen does not understand. Nothing was rendered " +
    "from it on purpose: a half-read roster is worse than none, because you cannot see what is " +
    "missing from it. This is a mismatch between the roster and /api/runtime/agents.",
  unknown: "The failure did not identify itself, which is itself worth reporting.",
};

export default function LiveAgentRoster({ live }: { live: boolean }) {
  const [roster, setRoster] = useState<RosterView | null>(null);
  const [error, setError] = useState<LoadFailure | null>(null);
  const [loading, setLoading] = useState(true);
  /** Browser clock — when this tab last got an answer, not a runtime instant. */
  const [readAt, setReadAt] = useState<Date | null>(null);

  const abort = useRef<AbortController | null>(null);
  const stream = useRuntimeEvents(ROSTER_TOPICS, { fallbackPollMs: ROSTER_FALLBACK_MS });

  const load = useCallback(async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);

    try {
      const next = await fetchRoster(controller.signal);
      if (controller.signal.aborted) return;
      setRoster(next);
      setReadAt(new Date());
      setError(null);
    } catch (err) {
      // An abort is a navigation or a superseded refresh, not a failure to
      // report — and it must not blank the list a newer read is about to fill.
      if (controller.signal.aborted) return;
      // Deliberately does NOT clear `roster`; see the module header.
      setError({
        kind: err instanceof AgentsApiError ? err.kind : "unknown",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  /* Mount, and every time the runtime tells us one of ROSTER_TOPICS moved.
     `load` aborts its predecessor, so a signal arriving mid-read supersedes it
     rather than racing it. */
  useEffect(() => {
    void load();
    return () => abort.current?.abort();
  }, [load, stream.revision]);

  /* Coming back to the tab is the ordinary way this page is re-read: pause an
     agent, go and look at the schedule, come back. The stream catches up on
     return too; this stays because nothing here may depend on the stream being
     there at all. */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  /* Stable across renders, so a card only re-renders when its own agent changed
     — not every time the connection banner above rewords itself. `AgentCard` is
     memoised and an inline arrow here would defeat it on every render. */
  const reload = useCallback(() => {
    void load();
  }, [load]);

  /* The header's clock is stamped in the plan's ORG-WIDE zone —
     `globalPolicy.quietHours.timezone` is the only field in the whole contract
     that states, org-wide, when the business is awake. Each card stamps its own
     times in its own agent's zone instead, because a card is about one agent and
     its schedule was written in that zone. Both are named on screen, so the two
     can never be silently mistaken for each other. */
  const zone = createZone(roster?.globalQuietHours?.timezone ?? "UTC");
  const stamp = roster === null ? null : zone.stamp(roster.now);
  const mode = roster?.mode ?? null;

  return (
    <main className="oa-page">
      <header className={`oa-between ${styles.head}`}>
        <div className={styles.headTitles}>
          <p className="oa-eyebrow">Operate · Agents · live runtime</p>
          <h1 className="oa-h1">
            Agent <span className="oa-serif">roster</span>
          </h1>
          <p className="oa-lead">
            Every agent on the approved plan, with the state the runtime actually holds for
            it: what it is doing now, when it next wakes up, what it has done, and the
            configuration it is running under.
          </p>
        </div>

        <div className={styles.headActions}>
          {mode !== null && (
            <span className={styles.modeBadge}>
              <LayoutGrid size={12} aria-hidden />
              {mode === "live" ? "Live runtime" : `${mode} runtime`}
            </span>
          )}
          <div className={styles.headMeta}>
            <span className={styles.headStamp}>
              {stamp === null ? "Server time unknown" : `Server time ${stamp} · ${zone.id}`}
            </span>
            <span className={styles.headZone}>
              {readAt === null
                ? "Not read yet"
                : `This tab last read at ${readAt.toLocaleTimeString()}`}
            </span>
          </div>
          <button
            type="button"
            className="oa-btn oa-btn--ghost oa-btn--sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={13} aria-hidden className={loading ? "oa-spin" : undefined} />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <div className={styles.headNotes}>
        {/* The live region is the CONNECTION and nothing else: `role="status"` is
            atomic, and folding the read stamp in would have a screen reader
            recite the whole line every time the roster reloaded — which, now
            that reloading is what the stream is for, is the common case. */}
        <p className={styles.stream}>
          <span className={styles.streamState} role="status">
            <StreamIcon status={stream.status} />
            <span className={styles.streamWord}>{STREAM_WORD[stream.status]}</span>
            <span className={styles.streamDetail}>{stream.detail}</span>
          </span>
          <span className={styles.streamRead}>
            {loading
              ? "Reading the runtime now."
              : roster === null
                ? "Nothing has been read yet."
                : "It also re-reads when you come back to this tab, and on the button above."}
          </span>
        </p>

        {!zone.ok && (
          <p className={styles.footNote}>
            The plan&apos;s org-wide quiet hours name the timezone{" "}
            <code>{zone.requested}</code>, which this browser does not know, so the server
            clock above is shown in UTC instead. Each agent&apos;s own times are stamped in
            its own zone and say which.
          </p>
        )}

        {mode !== null && mode !== "live" && (
          <p className={styles.footNote}>
            The runtime is in {mode} mode: reason steps and tool calls are stubbed, so no
            email is sent and no record is written. States, triggers, runs, approvals,
            pauses and resumes are real, and are what this page shows.
          </p>
        )}
      </div>

      {error !== null && (
        <div className={styles.errorBox} role="alert">
          <p className={styles.errorTitle}>
            <AlertTriangle size={15} aria-hidden />
            {roster === null ? "The roster could not be read" : "This roster is out of date"}
          </p>
          <p className={styles.errorBody}>{error.message}</p>
          <p className={styles.errorBody}>{FAILURE_ADVICE[error.kind]}</p>
          {roster !== null && (
            <p className={styles.errorBody}>
              The cards below are what the runtime last confirmed, at{" "}
              {readAt === null ? "an earlier point" : readAt.toLocaleTimeString()}. States may
              have changed since.
            </p>
          )}
          <div>
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--sm"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw size={13} aria-hidden className={loading ? "oa-spin" : undefined} />
              Try again
            </button>
          </div>
        </div>
      )}

      {roster === null && loading && (
        <div className={styles.roster} aria-busy="true" aria-label="Loading the roster">
          {[0, 1, 2].map((index) => (
            <div key={index} className={`oa-card ${styles.skelCard}`}>
              <div className={styles.skelLine} style={{ width: "38%" }} />
              <div className={styles.skelLine} style={{ width: "70%" }} />
              <div className={styles.skelLine} style={{ width: "54%" }} />
            </div>
          ))}
        </div>
      )}

      {roster !== null && (
        <>
          {!roster.activated && <NotActivated planVersion={roster.planVersion} />}

          {roster.agents.length === 0 ? (
            <div className={styles.stateBox}>
              <p className={styles.stateTitle}>
                <Users size={17} aria-hidden />
                This plan has no agents
              </p>
              <p>
                Plan {roster.planId} version {roster.planVersion} contains no agents, so there
                is no workforce to run. Nothing failed and nothing is blocked — there is simply
                nothing here. Activation refuses a plan in this state at its first gate rather
                than putting an empty workforce live.
              </p>
            </div>
          ) : (
            <div className={styles.roster}>
              {roster.agents.map((agent) => (
                <AgentCard
                  key={agent.agentId}
                  agent={agent}
                  globalForbidden={roster.globalForbidden}
                  now={roster.now}
                  live={live}
                  onChanged={reload}
                />
              ))}
            </div>
          )}

          {roster.unplanned.length > 0 && <Unplanned roster={roster} />}

          <p className={styles.footNote}>
            Plan {roster.planId} version {roster.planVersion}, approved {roster.approvedAt}.
            {roster.deployment !== null &&
              ` Live deployment ${roster.deployment.deploymentId} (plan v${roster.deployment.planVersion}), activated by ${roster.deployment.activatedBy} at ${roster.deployment.activatedAt}.`}{" "}
            <Link href="/app/workspace/agents?live=0" className={styles.inlineLink}>
              Switch to the scripted roster
            </Link>
            .
          </p>
        </>
      )}
    </main>
  );
}

/* ═══════════════════════════ Notices ═══════════════════════════ */

/**
 * The connection's own state, as an icon that differs per state.
 *
 * Beside a word, never instead of one. Three icons rather than four: connecting
 * and reconnecting are the same picture doing the same thing, and the word beside
 * it is what tells them apart.
 */
function StreamIcon({ status }: { status: RuntimeEventsStatus }) {
  if (status === "live") return <Radio size={13} aria-hidden />;
  if (status === "unsupported") return <WifiOff size={13} aria-hidden />;
  return <RefreshCw size={13} aria-hidden className="oa-spin" />;
}

/**
 * BLOCKED, and distinct from empty.
 *
 * The cards below it still render, and that is the point: a plan that has never
 * been activated still HAS agents, with roles, modes, limits and grants worth
 * reading. Hiding them behind "nothing to see" would make this screen useless
 * exactly when an owner is deciding whether to go live. What the notice adds is
 * the fact the cards cannot show on their own — that nothing will start any of
 * them until one named gate has been passed, and where that gate lives.
 *
 * Judged from the triggers rather than from a stored flag, and "registered" not
 * "enabled": an owner who has paused every agent has an activated plan with
 * nothing running, and telling them to go and activate it would be wrong.
 */
function NotActivated({ planVersion }: { planVersion: number }) {
  return (
    <section className={styles.blockedBox} role="alert" aria-labelledby="live-agents-activation">
      <div className={styles.blockedHead}>
        <p className={styles.blockedTitle} id="live-agents-activation">
          <Rocket size={16} aria-hidden />
          Blocked: none of these agents is live yet
        </p>
        <Link href="/app/deploy" className="oa-btn oa-btn--primary oa-btn--sm">
          Open activation
        </Link>
      </div>
      <p>
        No triggers are registered for plan version {planVersion}, which means activation has
        not run. The agents below are real — their roles, modes, limits and tool grants are
        what the approved plan says — but nothing is scheduled, nothing will fire, and pausing
        or resuming has nothing to act on. Refreshing will not change that; passing the gate
        will.
      </p>
      <p>
        The gate is <strong>activation</strong>. It checks that every agent is built, that the
        sandbox passed and that the required integrations are connected, then registers the
        triggers and flips each agent to active. Any one of the three can be the one holding
        it up, and the checklist names which.
      </p>
    </section>
  );
}

/**
 * Runtime records for agents the plan no longer contains.
 *
 * The runtime outlives plan edits by design — a trigger is frozen at activation —
 * so a record for a departed agent is a real thing that may still be firing.
 * Nowhere else in the product would show it, and an agent nobody can find is an
 * agent nobody can stop. Pause is reachable for exactly this case through
 * `POST /api/runtime/agents`, which deliberately does not check the plan first.
 */
function Unplanned({ roster }: { roster: RosterView }) {
  return (
    <section className={`oa-card ${styles.notice}`} aria-labelledby="live-agents-unplanned">
      <div className={styles.noticeHead}>
        <div className={styles.noticeTitle}>
          <Users size={16} className={styles.noticeIcon} aria-hidden />
          <h2 className="oa-h3" id="live-agents-unplanned">
            Runtime state for agents this plan no longer contains
          </h2>
        </div>
      </div>
      <div className={styles.noticeBody}>
        <p className="oa-sub">
          These agent ids have a runtime record but no entry in plan {roster.planId} version{" "}
          {roster.planVersion}. Triggers are frozen at activation, so any that are still
          enabled will keep firing until the plan is re-activated or the agent is paused.
        </p>
      </div>
      <div className={styles.list}>
        {roster.unplanned.map((entry) => (
          <div key={entry.agentId} className={styles.row}>
            <div className={styles.rowMain}>
              <span className={`${styles.rowTitle} ${styles.mono}`}>{entry.agentId}</span>
              <span className={styles.rowSub}>{entry.detail}</span>
              <span className={styles.rowSub}>
                Activated at version {entry.agentVersion} · last changed {entry.updatedAt}
              </span>
            </div>
            <div className={styles.rowSide}>
              <span className={styles.rowSub}>
                {entry.enabledTriggers} enabled{" "}
                {entry.enabledTriggers === 1 ? "trigger" : "triggers"}
              </span>
              <AgentStatePill state={entry.state} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
