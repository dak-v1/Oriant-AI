"use client";
/**
 * components/live/deploy/LiveDeployScreen.tsx — the go-live, on a screen instead
 * of behind a curl command.
 *
 * WHAT WAS HERE BEFORE. `/app/deploy` was a simulation. It read `lib/mock/store`,
 * animated agents switching on one after another, wrote `journey =
 * "active_workspace"` and never sent a request to anything. The runtime beneath
 * it has had three real gates, a real 409 and a real deployment record for weeks.
 * Every sentence on this screen now comes from `/api/runtime/activation` or
 * `/api/runtime/agents`, and where they have not answered it says so.
 *
 * SIX THINGS IT REFUSES TO GET WRONG.
 *
 * 1. A 409 IS NOT AN ERROR. The route answers a refused go-live with 409 AND THE
 *    WHOLE CHECKLIST, because "not ready" is the ordinary case this screen exists
 *    to render. It is shown as a refusal — amber, with the gate that shut named
 *    in the runtime's own words and a link to where it is opened — and never in
 *    the vocabulary of a crash. Rendering a correctly-refused activation as
 *    "something went wrong" would train a team to read the product's central
 *    safety feature as a bug report.
 *
 * 2. THE PLAN-SOURCE DISCLOSURE IS NOT A FOOTNOTE. It sits above everything, at
 *    the size of a headline, in every state including before anything has
 *    answered. This is the screen with the button that puts something live; if
 *    the workforce behind the gates is the demo fixture rather than the owner's
 *    own, that is the first thing on the page. See `PlanSourceNotice`.
 *
 * 3. THE RUNTIME'S SENTENCES ARE RENDERED VERBATIM. Gate details, blocker
 *    messages, lifecycle notes, per-agent activation details, rejected-trigger
 *    reasons, the allowlist's `error` and `hint`. Not one of them is paraphrased
 *    anywhere in this directory.
 *
 * 4. A FAILED READ DOES NOT BLANK THE LAST GOOD ANSWER. A checklist that could
 *    not be refreshed leaves the previous gates on screen under a banner naming
 *    what failed. Clearing them would read as "no gate is shut and nothing is
 *    wrong", which is two claims nobody made.
 *
 * 5. AN UNANSWERED READ IS NOT A REPORT THAT EVERYTHING IS FINE, and this is rule
 *    4 for the case where there is no last good answer to keep. `PipelineScreen`
 *    records this bug twice over: the absence of INFORMATION rendered as a
 *    statement about the world, and the world it described was always the
 *    reassuring one. So there is one latch, `heardFrom`, set only when a request
 *    comes back CARRYING A CHECKLIST — from the GET, from a 409, or from a
 *    successful go-live — and never cleared by anything. Starting a request
 *    cannot make this screen certain again, and every branch that would otherwise
 *    decide for itself what a null checklist means is handed the same predicate.
 *    Critically, the BUTTON is one of those branches: it opens on a checklist the
 *    runtime gave us, never on the absence of a reason not to.
 *
 * 6. A WRITE THAT LOST ITS REPLY IS NOT A WRITE THAT DID NOT HAPPEN. `wroteBlind`
 *    is the second way to stop knowing: a POST that went out and never came back
 *    may have registered every trigger and written a deployment. Everything this
 *    screen holds about what is LIVE predates that request, so the lifecycle list
 *    goes quiet rather than reporting the world as it was before the button was
 *    pressed. Unlike the pipeline's version this latch CAN be cleared, because
 *    there is a cheap read that settles it — a roster read started after the
 *    blind write and finished with no further write in between is a true answer
 *    about what is running now, and the sequence check below is what makes
 *    "after" mean after.
 *
 * THE ANATOMY IS THE DEMO'S; THE WORDS STAY THE RUNTIME'S. The gate rows, the
 * activate card and the result panel wear components/mock/deploy/deploy.module.css
 * — imported read-only, the way the approvals and integrations lanes wear their
 * demo shells — because the owner asked for the product the demo promised, not a
 * second design invented beside it. The reskin moved no data and removed no
 * state: every verbatim sentence, every latch and every refusal below survives
 * it, and the demo's scripted parts (the store, the activation animation, the
 * auto-redirect) were left where they were. See components/live/deploy/ui/*.
 *
 * WHAT IS AND IS NOT AUTOMATIC. The checklist GET runs once on mount and
 * otherwise only when somebody asks: it re-derives every gate, and the sandbox
 * gate runs the whole scenario library and the stress sweep before it can answer.
 * That is deliberate in the runtime — a cached "ready" is the one failure mode
 * that ships a workforce on evidence gathered before the plan changed — and it is
 * why nothing here polls it and why the change stream does NOT refresh it. The
 * ROSTER is cheap, so it is what the stream refreshes, and it is what tells this
 * screen that a workforce went live in another tab. The POST is never automatic
 * at all.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  HelpCircle,
  Loader2,
  RefreshCw,
  Rocket,
  ShieldAlert,
} from "lucide-react";
import { useRuntimeEvents } from "@/components/live/useRuntimeEvents";
import type { RuntimeEventsStatus, RuntimeTopic } from "@/components/live/useRuntimeEvents";
import type {
  ActivatedView,
  BlockerView,
  ChecklistSnapshot,
  ChecklistView,
  Failure,
  LiveCountsView,
  OrganizationRefusalView,
  RosterSnapshot,
} from "./api";
import { goLive, readChecklist, readRoster } from "./api";
import { formatInstant, plural } from "./format";
import ActivationResult from "./ActivationResult";
import ActivateCard from "./ui/ActivateCard";
import type { GoLivePermission } from "./ui/ActivateCard";
import GateChecklist from "./ui/GateChecklist";
import LifecycleList from "./LifecycleList";
import type { LifecycleSource } from "./LifecycleList";
import OrganizationRefusal from "./OrganizationRefusal";
import PlanSourceNotice from "./PlanSourceNotice";
import shell from "@/components/mock/deploy/deploy.module.css";
import styles from "./deploy.module.css";

/**
 * What the roster on this screen is derived from, and therefore what it wakes
 * for.
 *
 * `deployment` is the go-live itself; `agents` is every runtime record behind a
 * lifecycle row. `schedule` is deliberately absent: a trigger firing changes when
 * an agent next runs and changes nothing this screen shows, and waking for it
 * would refetch the roster all day to redraw the same four tags.
 *
 * THE CHECKLIST IS NOT ON THIS LIST AND MUST NEVER BE. It re-runs the sandbox to
 * answer; a screen that refetched it on a signal would re-prove the whole
 * workforce every time anything moved.
 */
const DEPLOY_TOPICS: RuntimeTopic[] = ["deployment", "agents"];

/** The blind fallback, slowed: this screen is not a dashboard. */
const DEPLOY_FALLBACK_MS = 60_000;

/** The connection, in one word, before the sentence explaining it. */
const STREAM_WORD = {
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
  unsupported: "Not live",
} satisfies Record<RuntimeEventsStatus, string>;

/** Which request failed. The same three kinds mean opposite things on each. */
type FailurePhase = "read" | "go-live";

interface PhasedFailure extends Failure {
  phase: FailurePhase;
}

const FAILURE_TITLE = {
  read: {
    refused: "The runtime would not answer the activation checklist",
    unreachable: "The runtime could not be reached",
    malformed: "The checklist came back in a shape this screen does not understand",
  },
  "go-live": {
    refused: "The runtime refused the go-live request",
    unreachable: "The runtime could not be reached",
    malformed: "The go-live answered in a shape this screen does not understand",
  },
} satisfies Record<FailurePhase, Record<Failure["kind"], string>>;

/**
 * What an operator does next, and it cannot be one string per kind.
 *
 * The GET activates nothing: a GET that failed has taught us nothing at all, and
 * every sentence about it has to stay inside that. The POST puts a workforce
 * live: a POST that failed EN ROUTE also taught us nothing, but the thing we now
 * do not know is whether triggers were registered and a deployment written.
 *
 * And a refused POST is split by status, because "nothing was activated" is a
 * fair report of the route's own 400s — which are body checks in front of
 * `activate` — and an invention for a 500, which can be thrown from anywhere
 * including after the triggers were written.
 */
function advice(failure: PhasedFailure): string {
  if (failure.phase === "read") {
    switch (failure.kind) {
      case "refused":
        return (
          "This was a read, which activates nothing and changes nothing — so it is not a " +
          "report about the workforce, it is this screen failing to ask. Whether the gates " +
          "are open, and whether anything is live, is unknown until it succeeds."
        );
      case "unreachable":
        return (
          "Nothing was sent but the question, and the answer never arrived. This screen " +
          "therefore knows nothing about this runtime — not that a gate is shut, not that " +
          "nothing is live. Check that the app is running and that /api/runtime/activation " +
          "is reachable from this machine, then re-check the gates."
        );
      case "malformed":
        return (
          "Nothing was rendered from it on purpose: a partly-read checklist would be missing " +
          "exactly the gate you cannot see is missing. This is a mismatch between this screen " +
          "and /api/runtime/activation, and it leaves the go-live unjudged rather than known " +
          "to be safe."
        );
    }
  }

  switch (failure.kind) {
    case "refused":
      return failure.status !== null && failure.status < 500
        ? "Nothing was activated. The request was refused in front of the gates, so no " +
            "trigger was registered and no deployment was written. The runtime's own " +
            "sentence is above."
        : "The runtime answered with a server error, and this screen cannot tell how far " +
            "the go-live got before it did. Treat it as a go-live whose result is unknown " +
            "rather than one that did not happen: re-check the gates and look at the roster " +
            "before pressing again.";
    case "unreachable":
      return (
        "The browser never got an answer, so nothing here knows whether the go-live ran. A " +
        "request that landed and lost its reply has still activated — triggers may be " +
        "registered and a deployment written. Re-check the gates first; pressing again is " +
        "safe in itself, because the runtime writes nothing when the version it is asked to " +
        "activate is already live."
      );
    case "malformed":
      return (
        "The request itself did land, so treat this as a go-live whose result is unknown " +
        "rather than one that did not happen. Re-check the gates and look at the roster " +
        "before pressing again."
      );
  }
}

/** Where the gates on screen came from, because it changes what they are. */
type GateOrigin = "read" | "refused" | "activated";

interface Gates {
  view: ChecklistView;
  origin: GateOrigin;
}

export default function LiveDeployScreen() {
  /** The last successful GET. Carries the plan, the live counts and the gates. */
  const [snapshot, setSnapshot] = useState<ChecklistSnapshot | null>(null);
  /** The newest checklist from ANY answer — the GET, a 409, or a go-live. */
  const [gates, setGates] = useState<Gates | null>(null);
  /** The 409's flattened blockers, kept beside the checklist that carried them. */
  const [refusedBlockers, setRefusedBlockers] = useState<BlockerView[] | null>(null);
  const [refusedOutcome, setRefusedOutcome] = useState<string | null>(null);
  const [result, setResult] = useState<ActivatedView | null>(null);
  const [roster, setRoster] = useState<RosterSnapshot | null>(null);

  /**
   * Whether this tab has ever been handed a checklist by this runtime.
   *
   * A latch, set by exactly three outcomes — the GET answering, a 409 carrying
   * the checklist, a go-live carrying the one that authorised it — and never
   * cleared. The near misses are the point: a read the runtime refused, a 403, a
   * request that never arrived, a body this screen could not parse. Every one of
   * them leaves the question as unanswered as it was, and the 403 most obviously
   * of all: it proves the runtime is up and says nothing whatever about the
   * gates.
   *
   * It is a flag of its own rather than a shape read off `gates`, `reading` and
   * `failure` because those three describe the request happening NOW, and this
   * has to outlive every request that has already finished.
   */
  const [heardFrom, setHeardFrom] = useState(false);
  /** A go-live went out from this tab and never said what it did. See rule 6. */
  const [wroteBlind, setWroteBlind] = useState(false);
  /** A go-live landed, so everything read BEFORE it describes the old world. */
  const [liveStale, setLiveStale] = useState(false);

  const [reading, setReading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [failure, setFailure] = useState<PhasedFailure | null>(null);
  const [forbidden, setForbidden] = useState<{
    phase: FailurePhase;
    refusal: OrganizationRefusalView;
  } | null>(null);
  const [rosterFailure, setRosterFailure] = useState<string | null>(null);
  const [readAt, setReadAt] = useState<Date | null>(null);

  /**
   * The in-flight read, and the guard against a second one. Null means nothing is
   * on the wire; a controller whose signal is already aborted means the same. See
   * `loadChecklist`.
   */
  const checklistAbort = useRef<AbortController | null>(null);
  const rosterAbort = useRef<AbortController | null>(null);
  /* Read by the guard rather than the state, so a second press is refused on the
     value as of this instant and not as of the render that made the callback.
     This POST puts a workforce live; a double press is not cosmetic. */
  const activatingNow = useRef(false);
  /**
   * How many go-lives have completed from this tab, blind or otherwise.
   *
   * A roster read stamps this when it STARTS and compares on success: an equal
   * stamp means the read began after every write we know about and no new one
   * landed while it was in flight, which is exactly the condition under which its
   * answer describes the world after the write. Anything else and the latches
   * stay set — see rule 6.
   */
  const writes = useRef(0);

  const stream = useRuntimeEvents(DEPLOY_TOPICS, { fallbackPollMs: DEPLOY_FALLBACK_MS });

  /* ── The roster ──
     Cheap, safe to repeat, and the only thing on this screen that refreshes on
     its own. It is what notices that somebody activated this workforce from the
     pipeline screen, from another tab, or by curl. */
  const loadRoster = useCallback(async () => {
    rosterAbort.current?.abort();
    const controller = new AbortController();
    rosterAbort.current = controller;
    const stamp = writes.current;

    const outcome = await readRoster(controller.signal);
    if (controller.signal.aborted) return;

    if (outcome.kind === "roster") {
      setRoster(outcome.snapshot);
      setRosterFailure(null);
      // See `writes`: this read began after every completed go-live and none
      // landed while it was in flight, so it is a true answer about what is
      // running now — which is the one thing a blind write took away.
      if (stamp === writes.current) {
        setWroteBlind(false);
        setLiveStale(false);
      }
      return;
    }

    /* Deliberately does NOT clear `roster`; the last good answer stays on screen
       under the note. And it does not touch `heardFrom`: the roster is not the
       checklist, and no roster read has ever said anything about the gates. */
    setRosterFailure(
      outcome.kind === "forbidden"
        ? outcome.refusal.error
        : outcome.failure.message,
    );
  }, []);

  /* ── The checklist ──
     Expensive by design. Once on mount and then only when asked. */
  const loadChecklist = useCallback(async () => {
    /* A read already on the wire is not duplicated, and the guard is the
       CONTROLLER rather than a boolean. Aborting the browser's copy of this
       request does not stop the server finishing the sandbox suite it started,
       so a second one is real work nobody asked for — and a boolean flag would
       have to be cleared by whichever of the two paths out of an aborted request
       happened to run first. React's development double-mount is exactly that
       race: it aborts between the two effect passes, and a flag still set would
       refuse the second read and leave this screen saying "reading the gates"
       forever. An aborted signal answers "is one in flight?" with no bookkeeping
       at all. */
    const inFlight = checklistAbort.current;
    if (inFlight !== null && !inFlight.signal.aborted) return;

    const controller = new AbortController();
    checklistAbort.current = controller;
    setReading(true);
    /* Clears the BANNER, not the memory. The old failure describes a finished
       attempt and must not be read as this one's result; what it may not take
       with it is what this screen KNOWS — `heardFrom` and `wroteBlind` are
       latches for that reason. */
    setFailure(null);
    setForbidden(null);

    const outcome = await readChecklist(controller.signal);
    // Released only by the request that owns it, so a slow abort cannot clear a
    // guard a newer read is holding.
    if (checklistAbort.current === controller) checklistAbort.current = null;
    if (controller.signal.aborted) return;

    if (outcome.kind === "checklist") {
      setSnapshot(outcome.snapshot);
      setGates({ view: outcome.snapshot.checklist, origin: "read" });
      /* The 409's own record is cleared here and only here: this checklist is
         newer than the refusal, so keeping the old blockers beside it would show
         two answers to one question. */
      setRefusedBlockers(null);
      setRefusedOutcome(null);
      setHeardFrom(true);
      setReadAt(new Date());
    } else if (outcome.kind === "forbidden") {
      setForbidden({ phase: "read", refusal: outcome.refusal });
    } else {
      setFailure({ ...outcome.failure, phase: "read" });
    }

    setReading(false);
  }, []);

  /* The one automatic request that costs something, made once. */
  useEffect(() => {
    void loadChecklist();
    return () => checklistAbort.current?.abort();
  }, [loadChecklist]);

  /* The roster on mount and on every push. `revision` starts at 0, so this is
     also the mount read and there is no duplicate. */
  useEffect(() => {
    void loadRoster();
  }, [loadRoster, stream.revision]);

  useEffect(() => () => rosterAbort.current?.abort(), []);

  /* ── The write ── */
  const activate = useCallback(
    async (activatedBy: string) => {
      if (activatingNow.current) return;
      activatingNow.current = true;
      setActivating(true);
      setFailure(null);
      setForbidden(null);

      /* Note what is deliberately missing: no AbortController is stored and this
         request is NOT aborted on unmount. Navigating away from a write cannot
         un-write it, and dropping the reply would leave a workforce that may
         have gone live with nobody holding the report saying so. */
      const outcome = await goLive(activatedBy);
      activatingNow.current = false;
      writes.current += 1;

      if (outcome.kind === "activated") {
        setResult(outcome.result);
        setGates({ view: outcome.result.checklist, origin: "activated" });
        setRefusedBlockers(null);
        setRefusedOutcome(null);
        setHeardFrom(true);
        // Everything read before this describes the previous world. The roster
        // read below is what settles it; until it lands, the lifecycle list says
        // it does not know.
        setLiveStale(true);
        void loadRoster();
      } else if (outcome.kind === "blocked") {
        /* A 409 is a RESULT. Its checklist is the newest and most specific
           answer available — it is the one `activate` derived at the instant it
           refused — so it replaces the gates on screen rather than sitting
           beside them. Nothing was written, so no latch moves. */
        setGates({ view: outcome.checklist, origin: "refused" });
        setRefusedBlockers(outcome.blockers);
        setRefusedOutcome(outcome.outcome);
        setHeardFrom(true);
      } else if (outcome.kind === "forbidden") {
        // Refused for want of authority. Nothing was activated and nothing this
        // screen was told has stopped being true.
        setForbidden({ phase: "go-live", refusal: outcome.refusal });
      } else if (outcome.failure.kind === "refused" && (outcome.failure.status ?? 0) < 500) {
        // The route's own 400s are body checks in front of `activate`: nothing
        // ran, so no latch moves either.
        setFailure({ ...outcome.failure, phase: "go-live" });
      } else {
        /* Unreachable, unreadable, or a 5xx from inside the go-live. All three
           mean a write may have landed unseen. */
        setFailure({ ...outcome.failure, phase: "go-live" });
        setWroteBlind(true);
        setLiveStale(true);
        void loadRoster();
      }

      setActivating(false);
    },
    [loadRoster],
  );

  /* ═══════════ What this screen is allowed to say ═══════════ */

  /**
   * The runtime has not handed this tab a checklist, so nothing here may report
   * on the gates — and the button may not open. One predicate, derived once, for
   * every branch that would otherwise decide for itself what a null checklist
   * means. See rule 5.
   */
  const unheard = !heardFrom || gates === null;

  /**
   * Whether what this screen holds about the LIVE workforce is still true.
   *
   * Separate from `unheard` because they come apart in both directions: the gates
   * can be known while a blind write has put what is running in doubt, and a
   * successful go-live answers "what is live" while making every count read
   * before it stale.
   */
  const liveKnown = !wroteBlind && !liveStale;

  const checklist = gates?.view ?? null;
  const satisfied = checklist === null ? 0 : checklist.gates.filter((g) => g.satisfied).length;
  const blockerCount =
    checklist === null ? 0 : checklist.gates.reduce((total, g) => total + g.blockers.length, 0);
  /* `ready` is trusted only alongside a non-empty gate list. `[].every(...)` is
     `true`, so a response with no gates arrives claiming to be ready with
     nothing behind it — and this button is not opened by an empty array. */
  const open = checklist !== null && checklist.ready && checklist.gates.length > 0;

  const permission: GoLivePermission = activating
    ? { kind: "inFlight" }
    : unheard || checklist === null
      ? { kind: "unknown" }
      : checklist.gates.length === 0
        ? { kind: "empty" }
        : open
          ? { kind: "open" }
          : { kind: "blocked", blockers: Math.max(blockerCount, 1) };

  const liveCounts: LiveCountsView | null = !liveKnown
    ? null
    : (roster?.live ?? snapshot?.live ?? null);

  /**
   * Where the lifecycle rows come from, in preference order, and the honest
   * answer when there is no order left.
   *
   * The roster is preferred over the checklist for the rows as well as the names:
   * both carry the same reconciliation, but the roster is the one the change
   * stream refreshes, so its copy is the newer of the two whenever they differ.
   * Neither is used at all while `liveKnown` is false — both were read before a
   * write whose effect nobody has confirmed.
   */
  const lifecycleSource: LifecycleSource = !liveKnown
    ? {
        kind: "unknown",
        why: wroteBlind
          ? "A go-live was sent from this tab and its reply never arrived, so everything " +
            "this screen knows about what is running was read before it. A request that " +
            "landed and lost its reply has still activated."
          : "A go-live has just been accepted, so every tag read before it describes the " +
            "previous deployment. The roster is being re-read.",
      }
    : roster !== null
      ? {
          kind: "rows",
          rows: roster.lifecycle,
          detail: new Map(roster.agents.map((agent) => [agent.agentId, agent])),
          unnamed: null,
        }
      : snapshot !== null
        ? {
            kind: "rows",
            rows: snapshot.lifecycle,
            // No lookup at all, rather than a half-filled one. Every row renders
            // by id and says why, which is better than some rows having names.
            detail: new Map(),
            unnamed:
              rosterFailure ??
              "the roster has not answered yet, and these tags came with the checklist instead.",
          }
        : {
            kind: "unknown",
            why:
              "Neither the checklist nor the roster has answered, so this tab has not been " +
              "told what is deployed — which is not the same as being told that nothing is.",
          };

  /**
   * Which workforce this is, from whichever read answered.
   *
   * The checklist first because it is the plan the GATES judged, which is the one
   * the button would activate. The roster second because it resolves the same
   * `planState()` and is the cheap read that still answers when the expensive one
   * did not — a checklist that failed to read must not take the disclosure down
   * with it, since "we could not check the gates" is no reason to stop saying
   * that the plan behind them is the demo.
   */
  const plan = snapshot?.plan ?? roster?.plan ?? null;

  return (
    <main className="oa-page">
      <header className={`oa-between ${styles.head}`}>
        <div className={styles.headTitles}>
          <p className="oa-eyebrow">Runtime · Activation</p>
          <h1 className="oa-h1">
            Three gates, then <span className="oa-serif">live</span>
          </h1>
          <p className="oa-lead">
            Packages built, sandbox passed, required integrations connected. Every one is
            re-derived from scratch on every read — there is no stored &ldquo;ready&rdquo;
            anywhere in the runtime — and the button below sends the same request a
            terminal would.
          </p>
        </div>
        <div className={styles.headSide}>
          {/* Four tags, not two. "Every gate satisfied" is a fact the runtime
              told us; it must never be what a silent runtime looks like. */}
          <span
            className={`oa-tag ${
              unheard ? "oa-tag--neutral" : open ? "oa-tag--teal" : "oa-tag--amber"
            }`}
          >
            {unheard
              ? reading
                ? "Reading the gates"
                : "Gates not known"
              : checklist !== null && checklist.gates.length === 0
                ? "No gate was reported"
                : open
                  ? "Every gate satisfied"
                  : `${satisfied} of ${checklist === null ? 0 : checklist.gates.length} gates satisfied`}
          </span>
          <span className="oa-tag oa-tag--neutral">
            {!liveKnown
              ? "What is live: not known"
              : liveCounts === null
                ? "What is live: not read"
                : liveCounts.source === "deployment"
                  ? `Live: ${liveCounts.deploymentId ?? "a deployment the runtime did not name"}`
                  : "Nothing is deployed"}
          </span>
        </div>
      </header>

      {/* Above everything, in every state, at the size it deserves. */}
      <PlanSourceNotice plan={plan} live={liveCounts} />

      <div className={styles.split}>
        <div className={styles.mainPane}>
          {forbidden !== null && (
            <OrganizationRefusal refusal={forbidden.refusal} attempt={forbidden.phase} />
          )}

          {failure !== null && (
            <div className={styles.errorBox} role="alert">
              <p className={styles.errorTitle}>
                <AlertTriangle size={16} aria-hidden />
                {FAILURE_TITLE[failure.phase][failure.kind]}
              </p>
              <p className={styles.errorDetail}>{failure.message}</p>
              {failure.hint !== null && <p>{failure.hint}</p>}
              <p>{advice(failure)}</p>
              {checklist !== null && (
                <p>
                  The gates below are the last ones the runtime confirmed
                  {readAt === null ? "" : `, read at ${readAt.toLocaleTimeString()}`}. They are
                  kept on screen on purpose: an empty checklist would read as &ldquo;no gate
                  is shut and nothing is wrong&rdquo;.
                </p>
              )}
            </div>
          )}

          {activating && (
            /* The demo activation panel's head, without its body: the mock
               animated agents switching on one by one, and the runtime reports
               nothing per-agent until the POST answers — so there is no row to
               draw and no bar to fill, and saying so is the content. */
            <section
              className={`oa-card ${shell.panel}`}
              aria-busy="true"
              aria-label="Workforce activation"
            >
              <header className={shell.panelHead}>
                <div style={{ display: "grid", gap: 4 }}>
                  <p className="oa-micro">Activation in progress</p>
                  <h2 className="oa-h2">Bringing your workforce online</h2>
                </div>
                <Loader2 size={18} className="oa-spin" aria-hidden />
              </header>
              <p className="oa-sub">
                The three gates are being re-derived inside this request before anything is
                written — the sandbox suite and the stress sweep run again, against the plan
                as it is right now. There is no per-agent progress to draw: the runtime
                answers once, when the go-live has finished or refused. Nothing below
                reports on this request.
              </p>
            </section>
          )}

          {refusedBlockers !== null && (
            <div className={styles.blockedBox} role="alert">
              <p className={styles.blockedTitle}>
                <ShieldAlert size={17} aria-hidden />
                The go-live was refused — this is a normal result
              </p>
              <p>
                A gate shut, which is the checklist doing its job rather than failing at it.
                The endpoint answers this with <code>409</code> and the whole checklist: the
                request was well formed, the plan is not live-able yet, and nothing was
                written — no trigger was registered and no deployment was recorded. There is
                no override on this screen and none in the endpoint.
              </p>
              <p>
                {refusedBlockers.length === 0
                  ? "The refusal carried no blockers, which should not happen — a gate shut with nothing to say about why. Re-check the gates, and treat the checklist below as incomplete rather than as a clean bill of health."
                  : `${plural(refusedBlockers.length, "blocker", "blockers")} came back with it, and every one is shown in full below in the runtime's own words. The outcome it reported was "${refusedOutcome ?? "blocked"}".`}
              </p>
            </div>
          )}

          {result !== null && <ActivationResult result={result} />}

          <section aria-labelledby="oa-deploy-gates" className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={`oa-h2 ${styles.sectionTitle}`} id="oa-deploy-gates">
                The three gates
              </h2>
              <p className="oa-sub">
                {unheard
                  ? "Re-derived on every read: the packages gate asks the package store what exists for the current agent versions, the sandbox gate re-runs the suite, and the integrations gate asks the registry now."
                  : gates?.origin === "refused"
                    ? "These are the gates as they were at the instant the go-live was refused — the most specific answer available, and the one that decided it."
                    : gates?.origin === "activated"
                      ? "These are the gates that authorised the activation above. They are not a fresh reading; re-check them to see the workforce as it is now."
                      : "Read on arrival. Each one is judged against the plan below, and each blocks on its own."}
              </p>
            </div>

            {unheard || checklist === null ? (
              <div className={`${styles.stateBox} ${styles.stateUnknown}`} aria-busy={reading}>
                <p className={styles.stateTitle}>
                  {reading ? (
                    <Loader2 size={17} className="oa-spin" aria-hidden />
                  ) : (
                    <HelpCircle size={17} aria-hidden />
                  )}
                  {reading
                    ? "Reading the three gates…"
                    : "Whether this workforce may go live is not known"}
                </p>
                <p>
                  The three rows stay empty. Showing them as satisfied, or as blocked, before
                  the runtime has said so would be an answer, and this is the absence of one.
                </p>
                {reading && (
                  <p>
                    This is slow on purpose. The sandbox gate runs the whole scenario library
                    and the stress sweep before it can answer, and nothing anywhere caches the
                    verdict — a cached &ldquo;ready&rdquo; is the one failure that ships a
                    workforce on evidence gathered before the plan changed.
                  </p>
                )}
                {!reading && (
                  <p>
                    The banner above says which request went unanswered. Until one answers,
                    this tab cannot tell a workforce that is one press from live apart from
                    one that three gates are refusing.
                  </p>
                )}
              </div>
            ) : (
              /* A newer request in flight dims the PREVIOUS answer rather than
                 blanking it — an empty checklist mid-request reads as "no gate
                 is shut", which is the reassuring version of a state nobody has
                 confirmed. */
              <div className={activating || reading ? styles.superseded : undefined}>
                <GateChecklist checklist={checklist} />
              </div>
            )}

            {checklist !== null && checklist.activeDeployment !== null && (
              <p className="oa-sub">
                Plan version {checklist.planVersion} is already live in deployment{" "}
                <code>{checklist.activeDeployment.deploymentId}</code>, activated by{" "}
                {checklist.activeDeployment.activatedBy} at{" "}
                {formatInstant(checklist.activeDeployment.activatedAt)}. Activating again
                writes nothing while the plan and every agent version still match.
              </p>
            )}

            {/* The button sits after the gates, where the demo checklist put
                its activate card: the review reads top to bottom and the one
                primary action is at the end of it. Its permission is derived
                above, from an answer the runtime actually gave — moving the
                card moved nothing about when it opens. */}
            <ActivateCard
              permission={permission}
              checklist={checklist}
              onGoLive={(by) => void activate(by)}
            />
          </section>

          <section aria-labelledby="oa-deploy-lifecycle" className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={`oa-h2 ${styles.sectionTitle}`} id="oa-deploy-lifecycle">
                What this would change
              </h2>
              <p className="oa-sub">
                The checklist says whether this plan CAN go live; it never said what is live
                already. These are the same four tags the agent roster uses, reconciled from
                the deployed plan and the current one in one read.
              </p>
            </div>
            <LifecycleList source={lifecycleSource} counts={liveCounts} />
          </section>
        </div>

        <div className={styles.railPane}>
          <section className={`oa-card ${styles.railCard}`} aria-label="This checklist">
            <p className="oa-micro">This checklist</p>
            <div className={styles.railRows}>
              <RailRow
                label="Verdict"
                value={
                  unheard
                    ? reading
                      ? "reading…"
                      : "not known"
                    : open
                      ? "ready"
                      : "blocked"
                }
              />
              <RailRow
                label="Gates satisfied"
                value={
                  checklist === null ? "—" : `${satisfied} of ${checklist.gates.length}`
                }
              />
              <RailRow label="Blockers" value={checklist === null ? "—" : String(blockerCount)} />
              <RailRow
                label="Plan version"
                value={checklist === null ? "—" : `v${checklist.planVersion}`}
              />
              <RailRow label="Runtime mode" value={snapshot?.mode ?? "—"} />
              <RailRow
                label="Running"
                value={liveCounts === null ? "—" : String(liveCounts.running)}
              />
              <RailRow
                label="Drifted"
                value={liveCounts === null ? "—" : String(liveCounts.drifted)}
              />
              <RailRow
                label="Planned"
                value={liveCounts === null ? "—" : String(liveCounts.planned)}
              />
              <RailRow
                label="Retired"
                value={liveCounts === null ? "—" : String(liveCounts.retired)}
              />
            </div>

            {/* A column of dashes reads as a runtime that answered zero rather
                than as a question nobody answered. The dashes stay — nine rows of
                "not known" is unreadable — so the sentence carries it. */}
            {unheard ? (
              <p className="oa-sub">
                {reading
                  ? "Being read now: every dash above is a value this screen has not been given yet."
                  : "The runtime has not answered, so every dash above is a value this screen does not have — not a zero, and not a gate that passed."}
              </p>
            ) : (
              !liveKnown && (
                <p className="oa-sub">
                  The four lifecycle rows are dashes because a go-live has changed what they
                  describe and nothing has confirmed the new picture yet.
                </p>
              )
            )}

            <div className={styles.linkRow}>
              <button
                type="button"
                className="oa-btn oa-btn--ghost oa-btn--sm"
                onClick={() => void loadChecklist()}
                aria-busy={reading}
              >
                <RefreshCw size={13} aria-hidden className={reading ? "oa-spin" : undefined} />
                {reading ? "Re-checking…" : "Re-check the gates"}
              </button>
            </div>
            <p className="oa-sub">
              Takes a moment: the check re-runs the sandbox rather than trusting an old
              verdict. Nothing on this screen does it on a timer.
            </p>
          </section>

          <section className={`oa-card ${styles.railCard}`} aria-label="Live updates">
            <p className="oa-micro">Live updates</p>
            <p className="oa-sub">
              <strong>{STREAM_WORD[stream.status]}.</strong> {stream.detail}
            </p>
            <p className="oa-sub">
              The stream refreshes the roster below, never the gates — reading the gates
              re-proves the whole workforce, and nothing should do that on a signal.
              {stream.changedAt === null
                ? ""
                : ` Last change seen at ${stream.changedAt.toLocaleTimeString()}.`}
            </p>
            {rosterFailure !== null && (
              <p className="oa-sub">
                The roster did not answer: {rosterFailure} The lifecycle rows fall back to
                the tags the checklist carried, by agent id.
              </p>
            )}
          </section>

          <section className={`oa-card ${styles.railCard}`} aria-label="What the button does">
            <p className="oa-micro">What the button does</p>
            <ol className={styles.steps}>
              <li>
                One <code>POST /api/runtime/activation</code> with the actor you typed. The
                three gates are re-derived inside that request before anything is written.
              </li>
              <li>
                Triggers first, then agent states, then the deployment record — in that order
                so an interruption leaves work to finish rather than a record claiming work
                that never happened.
              </li>
              <li>
                A refusal is answered <code>409</code> with the whole checklist. Nothing is
                written, and this screen shows which gate shut rather than a generic error.
              </li>
              <li>
                Activating a plan version that is already live writes nothing at all and says
                so, rather than reporting a second go-live.
              </li>
            </ol>
          </section>

          <section className={`oa-card ${styles.railCard}`} aria-label="Where to go next">
            <p className="oa-micro">Where to go next</p>
            <div className={styles.linkRow}>
              <Link href="/app/pipeline" className="oa-btn oa-btn--ghost oa-btn--sm">
                <Rocket size={13} aria-hidden />
                Full pipeline pass
              </Link>
              <Link
                href="/app/workspace/agents?live=1"
                className="oa-btn oa-btn--ghost oa-btn--sm"
              >
                Live agent roster
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function RailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.railRow}>
      <span className={styles.railLabel}>{label}</span>
      <span className={styles.railValue}>{value}</span>
    </div>
  );
}
