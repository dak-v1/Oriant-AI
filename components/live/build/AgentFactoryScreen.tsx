"use client";
/**
 * AgentFactoryScreen — the Agent Factory, reporting on the Factory, wearing the
 * mock's clothes.
 *
 * WHAT THIS IS. /app/build was a simulation that never called the runtime; its
 * first replacement reported only the truth but threw the mock's look away —
 * no terminal, no bar, panels of prose — and the owner rejected that too: "ui
 * should look like the mock up page with terminal view and nice progress bar,
 * dont make ur own ui". This file is the reconciliation. The DATA layer is the
 * honest one (api.ts and everything it refuses to invent); the LOOK is the
 * mock's card grid, dark terminal and progress bar, reused via
 * components/live/build/ui/** — the mock's own CSS module copied verbatim, its
 * card/log/drawer adapted only where the runtime's facts differ from fixtures.
 *
 * SIX THINGS IT STILL REFUSES TO GET WRONG.
 *
 * 1. THE BAR IS A STAGE, NOT A MEASUREMENT. `POST /api/runtime/build` compiles
 *    the whole plan inside one request; there is no percentage anywhere in the
 *    runtime. So the bar marks the state the runner last WROTE at a fixed
 *    position — queued 5, generating 40, validating 75, done 100 — the legend
 *    in the overview strip says so, and a failed bar freezes where the build
 *    died (ui/stage.ts). It never animates toward a completion the runtime has
 *    not reported. While our POST is open the job store is re-read every two
 *    seconds (`BUILD_POLL_MS`) and the bars move only when the runner's own
 *    rows do.
 *
 * 2. THE TERMINAL IS THE RUNNER'S TRANSCRIPT. Every line is `job.logs` from
 *    the API, verbatim. Builds finish in milliseconds, so when a build THIS
 *    tab ran has just answered, the real lines are replayed at reading pace
 *    with a printed note that the pacing is presentational (ui/BuildLog.tsx).
 *    Any log the user did not just produce renders at once — replaying it
 *    would be theatre, which is what got the first screen deleted.
 *
 * 3. WHOSE PLAN THIS IS, ABOVE EVERYTHING. `lib/runtime/current-plan.ts`
 *    serves a built-in demo fixture when nothing has been ingested, and the
 *    build endpoint reports it exactly as it reports a real plan.
 *    `PlanSourceNotice` carries that distinction in all four of its states —
 *    including the state where the provenance read failed, which must never
 *    render as silence.
 *
 * 4. A FAILED READ DOES NOT BLANK THE LAST GOOD ANSWER, and does not get to
 *    speak for the write either. Read failures and build failures are held in
 *    two separate slots: a successful re-read clears the read banner and
 *    deliberately leaves the build banner standing, because a read cannot
 *    un-fail a write.
 *
 * 5. AN UNANSWERED READ IS NOT AN EMPTY FACTORY. Until `/api/runtime/build`
 *    has answered once, this screen does not know which agents exist —
 *    `heardFrom` is a latch, set only when a read comes back carrying an
 *    answer and never cleared. This discipline has been reintroduced by
 *    accident twice in this repository; the reskin must not make a third.
 *
 * 6. A BUILD WHOSE REPLY WAS LOST IS NOT A BUILD THAT DID NOT HAPPEN. The POST
 *    writes packages as it goes; `lostReply` latches and says so, and the
 *    follow-up read settles it.
 *
 * WHAT THE CHANGE STREAM CAN AND CANNOT DO FOR THIS SCREEN is stated on
 * `FACTORY_TOPICS` and on screen: the build store is not in the events route's
 * vocabulary, so a build somebody else starts does not push a frame here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Hammer,
  HelpCircle,
  Info,
  Loader2,
  Radio,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import type { RuntimeEventsStatus, RuntimeTopic } from "@/components/live/useRuntimeEvents";
import { useRuntimeEvents } from "@/components/live/useRuntimeEvents";
import type { ApiFailure, BuildReport, FactoryView } from "./api";
import {
  fetchBuildStatus,
  fetchPlanSource,
  latestJobByAgent,
  packageKey,
  packagesByAgentVersion,
  runBuild,
} from "./api";
import { STATUS_META, formatInstant, plural } from "./format";
import PlanSourceNotice, { type SourceState } from "./PlanSourceNotice";
import BuildJobCard from "./ui/BuildJobCard";
import PackageDrawer from "./ui/PackageDrawer";
import { STAGE_PCT } from "./ui/stage";
import styles from "./build.module.css";
import ui from "./ui/build.module.css";

/**
 * What this screen wakes for — and, more to the point, what it cannot.
 *
 * THE BUILD STORE IS NOT ON THE STREAM. `/api/runtime/events` fingerprints
 * runs, approvals, schedule, agent runtime states and the active deployment.
 * Jobs and packages are in none of them, so a build started by curl or by a
 * pipeline pass in another tab pushes nothing here. These two topics are the
 * honest adjacent facts: an activation changes `deployment`, and a pass that
 * ends in one also writes agent state records. Both mean "the workforce moved,
 * re-read the Factory" — but neither is a build signal, so the screen also
 * refetches when the tab comes back, offers Refresh, and says all of this in
 * the status line rather than implying a liveness it does not have.
 */
const FACTORY_TOPICS: RuntimeTopic[] = ["deployment", "agents"];

/**
 * How often the job store is re-read WHILE A BUILD OF OURS IS OPEN, and no
 * other time. Not the blind polling the change stream exists to replace: it
 * runs only between pressing Build and that request answering, it reads the
 * rows the runner is writing as it walks the plan, and it stops the moment the
 * POST lands. It is also what lets a failed bar freeze where the build died —
 * the in-flight states pass through these reads.
 */
const BUILD_POLL_MS = 2_000;

/** The connection, in one word, before the sentence explaining it. */
const STREAM_WORD = {
  connecting: "Connecting",
  live: "Updating automatically",
  reconnecting: "Reconnecting",
  unsupported: "Manual refresh",
} satisfies Record<RuntimeEventsStatus, string>;

/**
 * What each connection state means for the person reading the page.
 *
 * The hook's own `detail` sentence is NOT rendered here. It is written in the
 * vocabulary of the transport that produced it, and this screen is the one the
 * owner reads; what survives is its meaning — whether the page keeps itself up
 * to date, and what to do when it does not. `unsupported` in particular must
 * keep saying that what is on screen can be behind, because a page that is
 * quietly stale is the failure this line exists to prevent.
 */
const STREAM_MEANING = {
  connecting:
    "Setting up automatic updates. Until that finishes, press Refresh to be sure you " +
    "are looking at the latest.",
  live: "This page updates itself when something in your workspace changes.",
  reconnecting:
    "The connection dropped and is being set up again, so what you are looking at may " +
    "be behind. Press Refresh for the latest.",
  unsupported:
    "This page is not being updated automatically, so what you are looking at can be " +
    "out of date. Press Refresh to see anything newer.",
} satisfies Record<RuntimeEventsStatus, string>;

/**
 * WHICH REQUEST FAILED, because the same three kinds mean opposite things on
 * the two verbs. The GET is free and writes nothing: a GET that fails has
 * taught us nothing at all. The POST compiles and stores packages: a POST that
 * fails has taught us nothing either, but what we now do not know is whether
 * some of the workforce was built. One advice string covering both cannot be
 * true twice.
 */
type FailurePhase = "read" | "run";

interface Failure {
  kind: ApiFailure["kind"];
  phase: FailurePhase;
  message: string;
  hint: string | null;
}

const FAILURE_TITLE = {
  read: {
    refused: "This page could not load what has been built",
    unreachable: "The app could not be reached",
    malformed: "The answer came back in a form this page does not understand",
  },
  run: {
    refused: "The build was turned down",
    unreachable: "The build never came back with an answer",
    malformed: "The build replied in a form this page does not understand",
  },
} satisfies Record<FailurePhase, Record<ApiFailure["kind"], string>>;

const FAILURE_ADVICE = {
  read: {
    refused:
      "This was only a check — it built nothing and changed nothing — so it is not a " +
      "report about your workforce, it is this page failing to ask. What is built, and for " +
      "which plan, is unknown until it loads. The exact wording that came back is above.",
    unreachable:
      "Only the question went out, and no answer came back. So this page knows nothing " +
      "about your workforce — not that it is empty, not that nothing is built. Check that " +
      "the app is running and reachable from this computer, then try again.",
    malformed:
      "Nothing was shown from it on purpose: a half-read answer would be missing exactly " +
      "the failure you would have no way of noticing was missing. This leaves the state of " +
      "your agents unread, rather than known to be fine.",
  },
  run: {
    refused:
      "Do not read this as “nothing was built”. Each agent is saved the moment it " +
      "finishes, so a build turned down part-way through can still have left some agents " +
      "built. The refresh that follows this message is the only thing that says what is " +
      "actually there now.",
    unreachable:
      "Your browser never got an answer, so nothing here knows whether the build ran. A " +
      "build that arrived and lost its reply has still built and saved agents. Check that " +
      "the app is running, then read the cards below rather than pressing Build again on " +
      "the assumption that nothing happened.",
    malformed:
      "The request itself arrived, so treat this as a build whose result is unknown rather " +
      "than one that never happened. Nothing was shown from the reply on purpose: a " +
      "half-read report would be missing exactly the agent that failed.",
  },
} satisfies Record<FailurePhase, Record<ApiFailure["kind"], string>>;

export default function AgentFactoryScreen() {
  const [view, setView] = useState<FactoryView | null>(null);
  /**
   * Whether this tab has ever been told ANYTHING about this runtime's Factory.
   * A latch, set only when a read comes back carrying a status and never
   * cleared. See rule 5 in the header.
   */
  const [heardFrom, setHeardFrom] = useState(false);
  /** A build of ours went out and we never learned what it did. See rule 6. */
  const [lostReply, setLostReply] = useState(false);
  const [reading, setReading] = useState(true);
  const [building, setBuilding] = useState(false);
  /** Cleared by a successful read. */
  const [readFailure, setReadFailure] = useState<Failure | null>(null);
  /** Cleared only by starting another build — a read cannot un-fail a write. */
  const [runFailure, setRunFailure] = useState<Failure | null>(null);
  const [report, setReport] = useState<BuildReport | null>(null);
  /**
   * The last build's own answer is newer than the last read's. True from the
   * moment a POST lands until a read completes; the POST handler aborts any
   * read in flight before setting this, so there is no race to arbitrate.
   */
  const [reportFresh, setReportFresh] = useState(false);
  /**
   * Counts the builds THIS TAB has run to completion (the POST answered with a
   * report). It drives the terminals' declared replay and nothing else — a
   * separate counter rather than `reportFresh`, because the automatic re-read
   * after every build clears `reportFresh` within milliseconds and the replay
   * has to outlive it.
   */
  const [buildSeq, setBuildSeq] = useState(0);
  const [source, setSource] = useState<SourceState>({ kind: "unread" });
  const [sourceChecking, setSourceChecking] = useState(true);
  /** Browser clock — when this tab last got an answer, not a runtime instant. */
  const [readAt, setReadAt] = useState<Date | null>(null);
  const [force, setForce] = useState(false);
  /** Which agent's stored package is open in the drawer. */
  const [reviewId, setReviewId] = useState<string | null>(null);
  /* Keep the last reviewed agent so drawer content survives the exit animation
     — the mock page's own pattern. */
  const lastReviewRef = useRef<string | null>(null);
  if (reviewId !== null) lastReviewRef.current = reviewId;

  const readAbort = useRef<AbortController | null>(null);
  const sourceAbort = useRef<AbortController | null>(null);
  /* Read by the guard rather than `building`, so a second press is refused on
     the value as of this instant and not as of the render that made the
     callback. */
  const busy = useRef(false);
  /**
   * The highest in-flight bar position this tab has seen, per jobId — how a
   * failed bar knows where the build died (rule 1). Fed by the poll reads while
   * our POST is open; a job that fails without this tab ever seeing it run
   * falls back to what its own row proves (ui/stage.ts). A ref, not state:
   * every write happens alongside `setView`, which re-renders anyway.
   */
  const observedPct = useRef(new Map<string, number>());

  const stream = useRuntimeEvents(FACTORY_TOPICS);

  /* One read in flight at a time. A newer trigger — the stream, the button, a
     returning tab, the build poll — aborts the older one rather than racing it. */
  const load = useCallback(async () => {
    readAbort.current?.abort();
    const controller = new AbortController();
    readAbort.current = controller;
    setReading(true);

    const outcome = await fetchBuildStatus(controller.signal);
    // An abort is a superseded read, not a failure to report — and it must not
    // blank a view a newer read is about to fill.
    if (controller.signal.aborted) return;

    if (outcome.kind === "view") {
      // Remember every in-flight stage before it is overwritten by a terminal
      // one; this is the only record of where a failed build died.
      for (const job of outcome.view.jobs) {
        if (job.status === "generating" || job.status === "validating") {
          const pct = STAGE_PCT[job.status];
          const held = observedPct.current.get(job.jobId) ?? 0;
          if (pct > held) observedPct.current.set(job.jobId, pct);
        }
      }
      setView(outcome.view);
      setHeardFrom(true);
      setReadAt(new Date());
      setReadFailure(null);
      // The store has now spoken more recently than the build report did.
      setReportFresh(false);
    } else {
      // Deliberately does NOT clear `view`; see rule 4 in the header.
      setReadFailure({
        kind: outcome.kind,
        phase: "read",
        message: outcome.message,
        hint: outcome.kind === "refused" ? outcome.hint : null,
      });
    }
    setReading(false);
  }, []);

  const loadSource = useCallback(async () => {
    sourceAbort.current?.abort();
    const controller = new AbortController();
    sourceAbort.current = controller;
    setSourceChecking(true);

    const outcome = await fetchPlanSource(controller.signal);
    if (controller.signal.aborted) return;

    if (outcome.kind === "source") {
      setSource({ kind: "known", source: outcome.source });
    } else {
      /* Note what this does NOT do: fall back to the previous answer or to
         silence. A provenance that was true a minute ago is not evidence now,
         and the whole point of this notice is that the reassuring reading —
         "these agents are yours" — must never be what a failure looks like. */
      setSource({
        kind: "unknown",
        message: outcome.message,
        advice: FAILURE_ADVICE.read[outcome.kind],
      });
    }
    setSourceChecking(false);
  }, []);

  /* The two automatic requests on this screen, and both are reads. The build is
     never made on the screen's own initiative — see `runBuild`. */
  useEffect(() => {
    void load();
    void loadSource();
  }, [load, loadSource, stream.revision]);

  useEffect(
    () => () => {
      readAbort.current?.abort();
      sourceAbort.current?.abort();
    },
    [],
  );

  /* Somebody may have ingested a plan or run a pass in the tab they just came
     from, and neither of those pushes a build signal. See `FACTORY_TOPICS`. */
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) {
        void load();
        void loadSource();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load, loadSource]);

  /* The one timer on this screen, alive only while our own build is open. See
     `BUILD_POLL_MS` for why this is not the blind polling M7 removed. */
  useEffect(() => {
    if (!building) return;
    const timer = window.setInterval(() => {
      void load();
    }, BUILD_POLL_MS);
    return () => window.clearInterval(timer);
  }, [building, load]);

  const build = useCallback(
    async (rebuildEverything: boolean) => {
      if (busy.current) return;
      busy.current = true;
      setBuilding(true);
      /* Clears the BANNER, not the memory: the old failure describes a finished
         attempt and must not be read as this one's result. `lostReply` is a
         latch of its own precisely so this line cannot take it. */
      setRunFailure(null);

      /* Deliberately not aborted on unmount. Navigating away from a write
         cannot un-write it, and dropping the reply would leave packages that
         may have been stored with nobody holding the report saying so. */
      const controller = new AbortController();
      const outcome = await runBuild({ force: rebuildEverything }, controller.signal);
      busy.current = false;

      if (outcome.kind === "report") {
        // No read may now resolve claiming to be newer than this answer.
        readAbort.current?.abort();
        setReport(outcome.report);
        setReportFresh(true);
        // A build this tab ran has answered: the terminals may replay its real
        // lines once, declared as a replay.
        setBuildSeq((seq) => seq + 1);
        // The write answered. Nothing of ours is outstanding any more.
        setLostReply(false);
      } else if (outcome.kind === "refused") {
        /* The runtime answered, so this tab is not blind — it simply does not
           know how far the build got. `lostReply` stays as it was. */
        setRunFailure({
          kind: "refused",
          phase: "run",
          message: outcome.message,
          hint: outcome.hint,
        });
      } else {
        setLostReply(true);
        setRunFailure({
          kind: outcome.kind,
          phase: "run",
          message: outcome.message,
          hint: null,
        });
      }

      setBuilding(false);
      /* After every outcome including the failures, because the store is the
         authority on what exists and a refused or unanswered build may still
         have written packages. */
      void load();
    },
    [load],
  );

  const refresh = useCallback(() => {
    void load();
    void loadSource();
  }, [load, loadSource]);

  /**
   * The runtime has not been heard from, and so nothing on this screen may say
   * what it has or has not built. See rule 5 in the header.
   */
  const unheard = !heardFrom;

  /* The newest job per agent, from the store, with the build report's rows laid
     over the top while they are the fresher answer. Merged rather than swapped:
     a report with no rows at all is a real outcome (see `PLAN_REFUSED_NOTE`)
     and must not blank the history the store still holds. */
  const jobsByAgent = useMemo(() => {
    const merged = latestJobByAgent(view?.jobs ?? []);
    if (reportFresh && report !== null) {
      for (const job of latestJobByAgent(report.jobs).values()) merged.set(job.agentId, job);
    }
    return merged;
  }, [view, report, reportFresh]);

  const packages = useMemo(() => packagesByAgentVersion(view?.packages ?? []), [view]);
  const missing = useMemo(
    () => new Map((view?.missing ?? []).map((row) => [row.agentId, row.reason])),
    [view],
  );

  /* Memoised for identity rather than for cost: `view?.agents ?? []` is a fresh
     array on every render while there is no view, and `strays` below depends on
     it. */
  const agents = useMemo(() => view?.agents ?? [], [view]);

  /* Job rows for agent ids the plan no longer contains. Named rather than
     dropped: they are real records of real work, and silently hiding them is
     how a workforce comes to look fully built when part of what was built is
     not in the plan any more. */
  const strays = useMemo(() => {
    const planned = new Set(agents.map((agent) => agent.id));
    return [...jobsByAgent.values()].filter((job) => !planned.has(job.agentId));
  }, [agents, jobsByAgent]);

  const emptyPlan = view !== null && agents.length === 0;
  const canBuild = view !== null && !building && !emptyPlan;

  /* The overview strip's numbers: package coverage from the store, which is
     what the go-live gate reads — deliberately not an average of bar positions,
     because the bars are stage labels and averaging labels would mint exactly
     the kind of fake percentage this screen exists to refuse. */
  const withPackage = view === null ? 0 : agents.length - view.missing.length;
  const coveragePct =
    view === null || agents.length === 0
      ? 0
      : Math.round((withPackage / agents.length) * 100);

  const reviewAgentId = reviewId ?? lastReviewRef.current;
  const reviewAgent = agents.find((agent) => agent.id === reviewAgentId) ?? null;
  const reviewPkg =
    reviewAgent === null
      ? null
      : packages.get(packageKey(reviewAgent.id, reviewAgent.version)) ?? null;

  return (
    <main className="oa-page">
      <header className={`oa-between ${styles.head}`}>
        <div className={styles.headTitles}>
          <p className="oa-eyebrow">Build</p>
          <h1 className="oa-h1">
            Agent <span className="oa-serif">Factory</span>
          </h1>
          <p className="oa-lead">
            One card for every agent in your plan. Everything below — each status, each log
            line, each failure — is what the build actually did. Nothing on this page is
            made up.
          </p>
          <div className={styles.headTags}>
            {view === null ? (
              <span className="oa-tag oa-tag--neutral">
                Not yet known whether these agents can act for real
              </span>
            ) : view.mode === "live" ? (
              <span className="oa-tag oa-tag--amber">
                Connected to your real tools — what these agents do, they really do
              </span>
            ) : view.mode === "fixture" ? (
              <span className="oa-tag oa-tag--teal">
                Sample tools — nothing these agents do leaves this workspace
              </span>
            ) : (
              /* An unrecognised word must not be read as the safe one, so this
                 says the cautious thing rather than naming the word. */
              <span className="oa-tag oa-tag--amber">
                Unrecognised setup — treat what these agents do as real
              </span>
            )}
            {view !== null &&
              (view.ready ? (
                <span className="oa-tag oa-tag--teal">Every agent is built and ready</span>
              ) : (
                <span className="oa-tag oa-tag--amber">
                  {plural(view.missing.length, "agent", "agents")} not ready yet
                </span>
              ))}
          </div>
        </div>

        <div className={styles.headActions}>
          <div className={ui.headerActions}>
            <button
              type="button"
              className="oa-btn oa-btn--primary"
              onClick={() => void build(force)}
              disabled={!canBuild}
            >
              {building ? (
                <Loader2 size={15} className="oa-spin" aria-hidden />
              ) : (
                <Hammer size={15} aria-hidden />
              )}
              {building ? "Building…" : force ? "Rebuild every agent" : "Build agents"}
            </button>
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--sm"
              onClick={refresh}
              disabled={reading && !heardFrom}
            >
              <RefreshCw size={13} className={reading ? "oa-spin" : ""} aria-hidden />
              Refresh
            </button>
          </div>
          <label className={styles.forceLabel}>
            <input
              type="checkbox"
              checked={force}
              onChange={(event) => setForce(event.target.checked)}
              disabled={building}
            />
            <span>
              Rebuild agents that are already up to date
              <span className="oa-micro"> — normally these are left alone</span>
            </span>
          </label>
          <p className="oa-micro">
            Building is what makes an agent ready to go live. Nothing is built unless you
            press the button.
          </p>
        </div>
      </header>

      {/* Above everything, in every state. See PlanSourceNotice. */}
      <PlanSourceNotice
        state={source}
        factoryPlanId={view?.planId ?? null}
        checking={sourceChecking}
      />

      {/* The live region is the CONNECTION and nothing else: `role="status"` is
          atomic, and folding the read stamp in would have a screen reader recite
          the whole line on every refetch. */}
      <p className={styles.stream}>
        <span className={styles.streamState} role="status">
          <StreamIcon status={stream.status} />
          <span className={styles.streamWord}>{STREAM_WORD[stream.status]}</span>
          <span className={styles.streamDetail}>
            {STREAM_MEANING[stream.status]} Builds are the one exception either way: a
            build started somewhere else never appears here by itself — it shows up when
            you come back to this page, when you press Refresh, or when something goes
            live.
          </span>
        </span>
        <span className={styles.streamRead}>
          {reading
            ? "Checking now."
            : readAt === null
              ? "Nothing has loaded yet."
              : `Last updated at ${readAt.toLocaleTimeString()}.`}
        </span>
      </p>

      {/* ── What just happened, in the runtime's own numbers ──
          Deliberately not dimmed once a read has answered past it: these numbers
          are the permanent record of what one build did, and a read of the store
          is a different fact rather than a newer version of this one. */}
      {report !== null && (
        <section className={`oa-card ${styles.reportBox}`} aria-label="The last build you ran here">
          <p className={styles.reportTitle}>
            <Boxes size={16} aria-hidden />
            The last build you ran here
          </p>
          <div className={styles.reportGrid}>
            <ReportStat label="Built" value={String(report.built)} />
            <ReportStat label="Already up to date" value={String(report.skipped)} />
            <ReportStat label="Failed" value={String(report.failed)} />
            <ReportStat label="Ready to go live" value={report.ready ? "Yes" : "No"} />
          </div>
          <p className={styles.reportBody}>
            {report.jobs.length === 0
              ? agents.length > 0
                ? PLAN_REFUSED_NOTE
                : "Nothing was built, and your plan has no agents in it — so there was nothing to build."
              : report.failed > 0
                ? `${plural(report.failed, "agent", "agents")} failed to build. Each card below says why. An agent that failed is not built and cannot go live.`
                : report.built === 0 && report.skipped > 0
                  ? "Nothing needed building — every agent already matched its settings, so they were left as they were. Tick the box above to build them again anyway."
                  : "Every agent in this build finished cleanly. What each one ended up with is on its card below."}
          </p>
        </section>
      )}

      {lostReply && (
        <div className={styles.warnBox} role="alert">
          <p className={styles.boxTitle}>
            <AlertTriangle size={16} aria-hidden />
            A build was started here and we never heard how it ended
          </p>
          <p>
            Each agent is saved the moment it finishes, so that build may have built some
            or all of your workforce. Nothing below is a report on it — the cards show what
            was last loaded, which may have been before that build finished.
          </p>
        </div>
      )}

      {runFailure !== null && (
        <div className={styles.errorBox} role="alert">
          <p className={styles.boxTitle}>
            <AlertTriangle size={16} aria-hidden />
            {FAILURE_TITLE.run[runFailure.kind]}
          </p>
          <p className={styles.boxDetail}>{runFailure.message}</p>
          {runFailure.hint !== null && <p>{runFailure.hint}</p>}
          <p>{FAILURE_ADVICE.run[runFailure.kind]}</p>
        </div>
      )}

      {readFailure !== null && (
        <div className={styles.errorBox} role="alert">
          <p className={styles.boxTitle}>
            <AlertTriangle size={16} aria-hidden />
            {view !== null
              ? "What you are seeing may be out of date"
              : FAILURE_TITLE.read[readFailure.kind]}
          </p>
          <p className={styles.boxDetail}>{readFailure.message}</p>
          {readFailure.hint !== null && <p>{readFailure.hint}</p>}
          <p>{FAILURE_ADVICE.read[readFailure.kind]}</p>
          {view !== null && (
            <p>
              The cards below are what was last confirmed
              {readAt === null ? "" : `, at ${readAt.toLocaleTimeString()}`}. An agent may
              have been built or changed since, and this page would not know. They are kept
              on screen on purpose: a blank page would read as &ldquo;nothing is built and
              nothing is wrong&rdquo;.
            </p>
          )}
          <div>
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--sm"
              onClick={refresh}
              disabled={reading}
            >
              <RefreshCw size={13} className={reading ? "oa-spin" : ""} aria-hidden />
              Try again
            </button>
          </div>
        </div>
      )}

      {/* The cards are withheld in the unheard state rather than rendered empty.
          Zero cards is an answer — "this plan has no agents" — and it is the
          wrong one when the truth is that nobody could ask. */}
      {unheard ? (
        <div className={styles.stateBox} aria-busy={reading}>
          <p className={styles.boxTitle}>
            {reading ? (
              <Loader2 size={17} className="oa-spin" aria-hidden />
            ) : (
              <HelpCircle size={17} aria-hidden />
            )}
            {reading
              ? "Loading your plan and everything built for it…"
              : "What has been built is not known"}
          </p>
          <p>
            No cards are shown, on purpose. A blank page here would say your plan has no
            agents and nothing is built — and that is not what happened. Nothing has
            answered yet, which is a different thing entirely.
          </p>
          {!reading && (
            <p>
              Your workforce may be fully built, or nothing may ever have been built. The
              message above says what went unanswered, and until something answers, this
              page cannot tell the two apart.
            </p>
          )}
        </div>
      ) : emptyPlan ? (
        <div className={styles.stateBox}>
          <p className={styles.boxTitle}>
            <Info size={17} aria-hidden />
            Your plan has no agents in it
          </p>
          <p>
            Your plan loaded without a problem — version {view?.planVersion} — and there is
            nothing in it to build. This is not a build failure: there is simply no
            workforce here yet.
          </p>
          <div>
            <Link href="/app/pipeline" className="oa-btn oa-btn--soft oa-btn--sm">
              Import your plan
              <ArrowRight size={13} aria-hidden />
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* ── The mock's overview strip, carrying the store's real coverage ── */}
          <section
            className={`oa-card oa-card--flat ${ui.overview}`}
            aria-label="How much of your workforce is built"
          >
            <div className={ui.overviewMeta}>
              <span className="oa-micro">Your workforce</span>
              <strong className={ui.overviewCount}>
                {withPackage} of {agents.length} agents are built and ready
              </strong>
            </div>
            <div
              className={`oa-progress ${view?.ready === true ? "oa-progress--teal" : ""} ${ui.overviewBar}`}
              role="progressbar"
              aria-valuenow={coveragePct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Share of agents built and ready"
            >
              <span style={{ width: `${coveragePct}%` }} />
            </div>
            <span className={ui.overviewPct} aria-hidden>
              {coveragePct}%
            </span>
            <p className={ui.overviewNote}>
              Each agent&apos;s own bar marks the step it reached — waiting, building,
              checking, done — rather than a measured percentage. A bar on an agent that
              failed stops at the step the build got to.
            </p>
          </section>

          {/* ── The mock's job grid, one card per agent in the plan's order ── */}
          <section className={ui.grid} aria-label="Agents in your plan">
            {agents.map((agent, index) => {
              const job = jobsByAgent.get(agent.id) ?? null;
              return (
                <BuildJobCard
                  key={agent.id}
                  agent={agent}
                  job={job}
                  pkg={packages.get(packageKey(agent.id, agent.version)) ?? null}
                  missingReason={missing.get(agent.id) ?? null}
                  building={building}
                  replayKey={buildSeq}
                  observedPct={
                    job === null ? null : observedPct.current.get(job.jobId) ?? null
                  }
                  canBuild={canBuild}
                  index={index}
                  onRetry={() => void build(false)}
                  onReview={() => setReviewId(agent.id)}
                />
              );
            })}
          </section>
        </>
      )}

      {strays.length > 0 && (
        <section
          className={styles.straySection}
          aria-label="Builds for agents that are no longer in your plan"
        >
          <h2 className={`oa-h2 ${styles.sectionTitle}`}>
            Builds for agents that are no longer in your plan
          </h2>
          <p className="oa-sub">
            These were built for this workforce earlier, and your plan does not list them
            any more. They are shown rather than hidden: each one is a real record of real
            work, and hiding them is how a workforce comes to look fully built when part of
            what was built is no longer planned.
          </p>
          <ul className={styles.strayList}>
            {strays.map((job) => (
              <li key={job.jobId} className={styles.strayRow}>
                {/* The plan no longer carries these agents, so their own name is
                    gone with it and the identifier is the only handle left. */}
                <code className={styles.mono}>{job.agentId}</code>
                <span className={`oa-status oa-status--${STATUS_META[job.status].cls}`}>
                  {STATUS_META[job.status].label}
                </span>
                <span className="oa-micro">
                  version {job.agentVersion}
                  {job.startedAt === null ? "" : ` · ${formatInstant(job.startedAt)}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <PackageDrawer
        open={reviewId !== null}
        agent={reviewAgent}
        pkg={reviewPkg}
        onClose={() => setReviewId(null)}
      />
    </main>
  );
}

/**
 * The one outcome the POST reports that this screen cannot explain from the
 * response alone. `buildPlan` refuses a whole plan that fails the plan
 * validator, before it builds anything: zero jobs, zero built, `ready: false`.
 * It returns those errors as `planErrors`, and the route does not carry them —
 * so the reasons genuinely are not on this screen, and saying where they are is
 * better than either inventing a cause or leaving four zeros unexplained.
 */
const PLAN_REFUSED_NOTE =
  "Nothing was built, and no agent was even attempted. That is what happens when the plan " +
  "itself does not pass its checks: the whole plan is turned down before the build starts, " +
  "rather than building agents out of a plan already judged unworkable. The reasons are " +
  "not on this page — they are listed where your plan is checked.";

function StreamIcon({ status }: { status: RuntimeEventsStatus }) {
  if (status === "live") return <Radio size={14} aria-hidden />;
  if (status === "unsupported") return <WifiOff size={14} aria-hidden />;
  return <Loader2 size={14} className="oa-spin" aria-hidden />;
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.reportStat}>
      <span className={styles.reportLabel}>{label}</span>
      <strong className={styles.reportValue}>{value}</strong>
    </div>
  );
}
