"use client";
/**
 * PipelineScreen — the six-stage pass, the gap report and the draft_only notice,
 * on a screen instead of behind a curl command.
 *
 * `POST /api/runtime/pipeline` has existed since M-whenever and has never had a
 * surface. Everything downstream of an approved plan — the ingest that turns
 * Role B's handoff into an enforceable one, the six gates, the assumptions the
 * ingest had to record — was reachable only by somebody who already knew the
 * endpoint, the body shape and what the response fields meant. This screen is
 * that response, rendered for somebody who does not.
 *
 * FIVE THINGS IT REFUSES TO GET WRONG.
 *
 * 1. A 422 IS NOT AN ERROR. The endpoint answers 422 when a gate refused: the
 *    request was fine, the content is not live-able yet, and the body is a
 *    complete report naming the stage that stopped it and what would open it.
 *    That is the pipeline WORKING. It is rendered as a blocked pass — amber, with
 *    the stage marked in place and a link to where it is fixed — and never in the
 *    vocabulary of a crash. Rendering a correctly-refused activation as
 *    "something went wrong" would train a whole team to read the product's
 *    central safety feature as a bug report.
 *
 * 2. THE DRAFT_ONLY NOTICE IS NOT A FOOTNOTE. It sits above the pass, at the size
 *    of a headline, in every state including before anything has run. A completed
 *    pass shows six green stages, a deployment id and a trigger count, and every
 *    one of those invites the conclusion that the workforce is off and running.
 *    It is not: Role B's handoff carries no approval boundaries, so every agent
 *    is `draft_only` and stops for a person. See `DraftOnlyNotice`.
 *
 * 3. THE RESOLUTIONS ARE NOT HIDDEN. Each gap's `resolution` is the actionable
 *    half of the report and is rendered beside its `message`, never behind a
 *    disclosure. See `GapReport`.
 *
 * 4. A FAILED READ DOES NOT BLANK THE LAST GOOD ANSWER. A pass that could not be
 *    sent, or a response this screen could not parse, leaves the previous result
 *    on screen under a banner naming what failed. Clearing it would read as "no
 *    workforce is live and nothing is wrong", which is two lies at once.
 *
 * 5. AN UNANSWERED READ IS NOT A REPORT THAT NOTHING HAS RUN, and this is rule 4
 *    for the case where there is no last good answer to keep. When the mount GET
 *    does not come back — unreachable, refused, or in a shape this screen cannot
 *    parse — `pass` is null for exactly the same reason it is null on a server
 *    that has genuinely never run one, and those are not remotely the same fact.
 *    An earlier version of this screen rendered them identically, so the red
 *    "could not be reached" banner sat directly above four separate positive
 *    claims that no pass had ever run: an idle six-row stage list, "this runtime
 *    has not run a pass yet", "nothing has been assumed yet" and "no pass has
 *    produced a plan yet". Each turned the absence of INFORMATION into a
 *    statement about the world, and the world they described was the reassuring
 *    one — a runtime sitting quietly with nothing live — when the truth may be
 *    that a workforce went live thirty seconds ago and this tab cannot see it.
 *    So there is one predicate, `unheard`, derived once below and handed to
 *    every branch that would otherwise decide for itself what a null pass means.
 *    Four components each answering that question separately is how three of
 *    them came to answer it wrongly.
 *
 *    AND IT IS DERIVED FROM MEMORY RATHER THAN FROM WHAT IS IN FLIGHT, which is
 *    the whole of the fix. The first version read `pass === null && (reading ||
 *    failure !== null)` — a question about whether something is wrong RIGHT NOW,
 *    standing in for a question about whether anything has EVER answered. The two
 *    come apart the moment somebody presses run: the press clears `failure` so
 *    the new attempt is not read under the old banner, and for the whole length
 *    of a six-stage pass a tab that had never heard a word from this runtime went
 *    back to telling the room that no pass had ever run here. All four sentences
 *    returned, narrowed to a window instead of removed. `heardFrom` is a latch —
 *    set when a read or a run comes back CARRYING AN ANSWER, which means a pass
 *    from either verb or the GET's own "no pass on record", and never cleared by
 *    anything. Starting a request cannot make this screen certain again.
 *
 *    THE OTHER WAY TO STOP KNOWING IS TO WRITE AND NOT HEAR BACK, which is
 *    `wroteBlind`. An answered read followed by a POST that lost its reply leaves
 *    a screen holding "no pass on record" from before it pressed the button and a
 *    banner saying, correctly, that a pass which landed and lost its reply has
 *    still activated. Rendering the first of those as six idle rows and "this
 *    runtime has not run a pass yet" is rule 5's own failure mode arriving by the
 *    other door: the reassuring world, asserted directly underneath the sentence
 *    that says it is unproven. So `unheard` is the two latches together, and the
 *    screen goes quiet in both.
 *
 * THE POST IS NEVER AUTOMATIC. It writes — a pass that reaches the end registers
 * triggers and records a deployment — so nothing here retries, polls or runs on
 * mount. What DOES happen on mount is a `GET`, which is free and answers the
 * question somebody arriving at this URL actually has: what did the last pass
 * produce? Until this screen existed, every pass anyone had ever run was run by
 * curl, and that history is exactly what the GET is for.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  HelpCircle,
  Info,
  Loader2,
  Rocket,
  ShieldAlert,
} from "lucide-react";
import type { StageStatus } from "@/lib/runtime/pipeline/types";
import type { PassRequest, PipelinePass } from "./api";
import { SEVERITY_ORDER, readLastPass, runPass } from "./api";
import { SEVERITY_META, STAGE_META, STATUS_META, formatInstant, plural } from "./format";
import DraftOnlyNotice from "./DraftOnlyNotice";
import GapReport from "./GapReport";
import LiveSummary from "./LiveSummary";
import RunPanel from "./RunPanel";
import StageList from "./StageList";
import styles from "./pipeline.module.css";

/**
 * Why the attempt did not produce a pass, kept apart from the message because
 * the three cases need three different things from the reader.
 */
type FailureKind = "refused" | "unreachable" | "malformed";

/**
 * WHICH REQUEST FAILED, because the same three kinds mean opposite things on the
 * two verbs and the difference is what an operator does next.
 *
 * The GET is free and writes nothing: a GET that fails has taught us nothing at
 * all, and every sentence about it has to stay inside that. The POST activates a
 * workforce: a POST that fails EN ROUTE also taught us nothing, but the thing we
 * now do not know is whether triggers were registered and a deployment recorded.
 * One advice string for both verbs cannot be true twice — the old one said
 * "nothing ran ... nothing was activated" on a refusal, which is a fair report of
 * a 400 on the POST and a flat invention when a 500 came back from the read.
 */
type FailurePhase = "read" | "run";

interface Failure {
  kind: FailureKind;
  phase: FailurePhase;
  message: string;
  hint: string | null;
}

const FAILURE_TITLE = {
  read: {
    refused: "The runtime would not say what the last pass produced",
    unreachable: "The runtime could not be reached",
    malformed: "The last pass came back in a shape this screen does not understand",
  },
  run: {
    refused: "The runtime refused the request",
    unreachable: "The runtime could not be reached",
    malformed: "The runtime answered in a shape this screen does not understand",
  },
} satisfies Record<FailurePhase, Record<FailureKind, string>>;

const FAILURE_ADVICE = {
  read: {
    refused:
      "This was the read on arrival, which runs nothing and changes nothing — so this is " +
      "not a report about the workforce, it is this screen failing to ask. Whether a pass " +
      "has ever run here, and what it did, is unknown until the read succeeds. The " +
      "runtime's own sentence is above.",
    unreachable:
      "Nothing was sent but the question, and the answer never arrived. This screen " +
      "therefore knows nothing about this runtime — not that it is idle, not that it is " +
      "empty, not that nothing is live. Check that the app is running and that " +
      "/api/runtime/pipeline is reachable from this machine, then reload.",
    malformed:
      "Nothing was rendered from it on purpose: a partly-read pass would be missing exactly " +
      "the stage you cannot see is missing. This is a mismatch between this screen and " +
      "/api/runtime/pipeline, and it leaves the state of the workforce unread rather than " +
      "known to be fine.",
  },
  run: {
    refused:
      "Nothing ran. The request never got as far as the pipeline, so no package was built " +
      "and nothing was activated. The runtime's own sentence is above.",
    unreachable:
      "The browser never got an answer, so nothing here knows whether the pass ran. Check " +
      "that the app is running and that /api/runtime/pipeline is reachable from this " +
      "machine, then look at the last pass before pressing run again — a pass that landed " +
      "and lost its reply has still activated.",
    malformed:
      "Nothing was rendered from it on purpose: a partly-read pass would be missing exactly " +
      "the stage you cannot see is missing. The request itself did land, so treat this as a " +
      "pass whose result is unknown rather than one that did not happen — reload before " +
      "pressing run again.",
  },
} satisfies Record<FailurePhase, Record<FailureKind, string>>;

/** The four status words, explained once rather than on every row. */
const STATUS_LEGEND = Object.keys({
  ok: true,
  blocked: true,
  failed: true,
  skipped: true,
} satisfies Record<StageStatus, true>) as StageStatus[];

export default function PipelineScreen() {
  const [pass, setPass] = useState<PipelinePass | null>(null);
  /**
   * Whether this tab has ever been told ANYTHING about this runtime's passes.
   *
   * A latch: set by exactly two outcomes — a pass came back, from either verb, or
   * the GET said there is no pass on record — and never cleared by anything. Both
   * of those are the runtime answering the question this screen exists to ask.
   * Nothing else sets it, and the near misses are the point: a read the runtime
   * refused, a POST rejected 400 because the body was not a handoff, a request
   * that never arrived, a body this screen could not parse. Every one of them
   * leaves the question exactly as unanswered as it was, and the 400 most
   * obviously of all — it proves the runtime is up and still says nothing
   * whatever about what it has run.
   *
   * It is a flag of its own rather than a shape read off `pass`, `failure` and
   * `reading` because all three of those describe the request that is happening
   * now, and this has to outlive every request that has already finished. See
   * rule 5 in the header for what happened when it was read off them.
   */
  const [heardFrom, setHeardFrom] = useState(false);
  /**
   * This tab has SENT a pass and never learned what it did.
   *
   * The second way to stop knowing, and the mirror of `heardFrom`: that one is
   * about never having been told, this one is about an answer we were given and
   * then invalidated ourselves. "No pass on record" was true when the GET said
   * it; the POST that went out afterwards and lost its reply may have run all six
   * stages and put a workforce live, and `FAILURE_ADVICE.run` says so in both
   * cases that set this — unreachable ("a pass that landed and lost its reply has
   * still activated") and malformed ("the request itself did land"). Six rows of
   * "not run yet" underneath either of those sentences is the reassuring version
   * of a state whose whole point is that the reassuring version is unproven.
   *
   * A 400 deliberately does NOT set it. That one is refused before the pipeline
   * is reached — "nothing ran ... nothing was activated" — so whatever the read
   * established is still standing, and this must not blank a screen that is
   * simply telling somebody their payload was not a handoff.
   *
   * Latched for the same reason `heardFrom` is: derived from `failure` it would
   * be cleared by the next press, and pressing run again would put "this runtime
   * has not run a pass yet" back on screen for the length of the second POST.
   */
  const [wroteBlind, setWroteBlind] = useState(false);
  /** The mount GET, and only that, while it is in flight. */
  const [reading, setReading] = useState(true);
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  /** The route's own line when it has never run a pass. Shown in the idle state. */
  const [noPassHint, setNoPassHint] = useState<string | null>(null);

  const abort = useRef<AbortController | null>(null);
  /* Read by the guard rather than `running`, so a second press is refused on the
     value as of this instant and not as of the render that made the callback.
     This POST activates a workforce; a double press is not a cosmetic problem. */
  const busy = useRef(false);

  /* The one automatic request on this screen, and it is a read. See the header
     for why the POST is never made on the screen's own initiative. */
  useEffect(() => {
    const controller = new AbortController();
    abort.current = controller;

    void (async () => {
      const outcome = await readLastPass(controller.signal);
      if (controller.signal.aborted) return;
      if (outcome.kind === "pass") {
        setPass(outcome.pass);
        setHeardFrom(true);
      } else if (outcome.kind === "none") {
        setNoPassHint(outcome.hint);
        // "No pass on record" is an ANSWER, and the only thing that ever
        // entitles this screen to say so. See `heardFrom`.
        setHeardFrom(true);
      } else if (outcome.kind === "refused") {
        setFailure({
          kind: "refused",
          phase: "read",
          message: outcome.message,
          hint: outcome.hint,
        });
      } else if (outcome.kind === "unreachable") {
        setFailure({ kind: "unreachable", phase: "read", message: outcome.message, hint: null });
      } else {
        setFailure({ kind: "malformed", phase: "read", message: outcome.message, hint: null });
      }
      setReading(false);
    })();

    return () => controller.abort();
  }, []);

  const run = useCallback(async (request: PassRequest) => {
    if (busy.current) return;
    busy.current = true;

    /* This aborts the mount read and nothing else — the guard above means there
       is never a second pass in flight to cancel. Note what is deliberately
       missing: the POST is not aborted on unmount. Navigating away from a
       write cannot un-write it, and dropping the reply would leave a workforce
       that may have gone live with nobody holding the report saying so. The
       read is cancellable because it costs nothing to ask again. */
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    /* The mount read was just aborted, so it will never clear this itself and
       there is genuinely nothing being read any more. Cleared HERE rather than
       when the POST lands, so `reading` keeps meaning "the mount GET is in
       flight" and is never borrowed to describe a screen that is running
       instead — it used to sit true for the length of the POST and put a
       "reading the last pass…" spinner over a read nobody was doing. */
    setReading(false);
    setRunning(true);
    /* Clears the BANNER, not the memory. The old failure describes a finished
       attempt and must not be read as this one's result; what it cannot be
       allowed to take with it is the two facts about what this screen knows —
       whether anything has ever answered, and whether a write of ours is
       outstanding — which is why both of those are latches of their own.
       See rule 5 in the header. */
    setFailure(null);

    const outcome = await runPass(request, controller.signal);
    busy.current = false;
    if (controller.signal.aborted) return;

    if (outcome.kind === "pass") {
      setPass(outcome.pass);
      setNoPassHint(null);
      setHeardFrom(true);
    } else if (outcome.kind === "refused") {
      /* Deliberately does NOT clear `pass`; see rule 4 in the header. And
         deliberately does not set `wroteBlind` either: a 400 is refused in front
         of the pipeline, so nothing was activated and nothing this screen was
         previously told has stopped being true. */
      setFailure({
        kind: "refused",
        phase: "run",
        message: outcome.message,
        hint: outcome.hint,
      });
    } else if (outcome.kind === "unreachable") {
      // The other two both mean a write may have landed unseen. See `wroteBlind`.
      setWroteBlind(true);
      setFailure({ kind: "unreachable", phase: "run", message: outcome.message, hint: null });
    } else {
      setWroteBlind(true);
      setFailure({ kind: "malformed", phase: "run", message: outcome.message, hint: null });
    }

    setRunning(false);
  }, []);

  /**
   * The runtime has not been heard from, and so nothing on this screen may say
   * what it has or has not done. See rule 5 in the header.
   *
   * Two latches and a null check, and no live request state at all. `reading`,
   * `running` and `failure` all describe whichever request is happening now, and
   * "this screen has no answer it can stand behind" is a fact about the requests
   * that have already finished. Every state that reads as silence — the mount
   * read in flight, a read that failed, a run started on top of either — is the
   * same single fact here, and only the WORDING of the silence differs below.
   *
   * The second term is the one that is easy to miss. `wroteBlind` only matters
   * while there is no pass to show: with one in hand the failed run is a failed
   * REFRESH over an answer the runtime confirmed, and rule 4 says that answer
   * stays on screen under the banner rather than being blanked. With no pass, the
   * only thing left to render is the claim that nothing has ever run here, which
   * is exactly the claim our own unanswered write has put in doubt.
   */
  const unheard = !heardFrom || (pass === null && wroteBlind);

  /**
   * The rail's one-word verdict. "no pass yet" is a fifth thing the runtime can
   * tell us and not a synonym for silence, so silence gets its own word — and it
   * keeps that word while a pass runs, because a POST in flight answers nothing
   * about what came before it. The heard-and-empty case gets "running…" for the
   * opposite reason: there the dashes really are about to become this pass.
   */
  const outcomeWord: string =
    pass !== null
      ? pass.completed
        ? "completed"
        : "blocked"
      : unheard
        ? reading
          ? "reading…"
          : "not known"
        : running
          ? "running…"
          : "no pass yet";

  const blocked = pass !== null && !pass.completed;
  const stopped = pass?.stoppedAt ?? null;
  const stoppedStage =
    pass === null || stopped === null
      ? null
      : (pass.stages.find((stage) => stage.stage === stopped) ?? null);

  return (
    <main className="oa-page">
      <header className={`oa-between ${styles.head}`}>
        <div className={styles.headTitles}>
          <p className="oa-eyebrow">Runtime · Pipeline</p>
          <h1 className="oa-h1">
            Handoff to <span className="oa-serif">live</span>, in one pass
          </h1>
          <p className="oa-lead">
            Six stages take Role B&apos;s workforce handoff and either put it live or stop
            at the first gate that refuses. Every stage reports in the same six rows
            whatever happens, and every assumption the ingest had to make about the
            business is listed underneath with what would settle it.
          </p>
        </div>
        <div className={styles.headSide}>
          <span className="oa-tag oa-tag--amber">Every agent draft_only</span>
          {pass === null ? (
            /* Four tags, not two. "No pass on record" is a fact the runtime told
               us: it must never be what a silent runtime looks like, and it must
               not go on being asserted while the request that changes it is in
               flight. `unheard` is asked first because it outranks both — a tab
               that has heard nothing does not get to say a pass is running
               instead of saying it does not know what preceded it. */
            <span className="oa-tag oa-tag--neutral">
              {unheard
                ? reading
                  ? "Reading the last pass"
                  : "Last pass unknown"
                : running
                  ? "A pass is running now"
                  : "No pass on record"}
            </span>
          ) : pass.completed ? (
            <span className="oa-tag oa-tag--teal">Last pass completed</span>
          ) : (
            <span className="oa-tag oa-tag--neutral">
              Last pass blocked{stopped === null ? "" : ` at ${STAGE_META[stopped].title}`}
            </span>
          )}
        </div>
      </header>

      {/* Above everything, in every state, at the size it deserves. `known` is
          what stops the standing statement being followed by a claim that no
          plan exists when the truth is that nobody has been able to ask. */}
      <DraftOnlyNotice plan={pass?.plan ?? null} known={!unheard} running={running} />

      <div className={styles.split}>
        <div className={styles.mainPane}>
          <RunPanel busy={running} hasResult={pass !== null} onRun={(request) => void run(request)} />

          {failure !== null && (
            <div className={styles.errorBox} role="alert">
              <p className={styles.errorTitle}>
                <AlertTriangle size={16} aria-hidden />
                {FAILURE_TITLE[failure.phase][failure.kind]}
              </p>
              <p className={styles.errorDetail}>{failure.message}</p>
              {failure.hint !== null && <p>{failure.hint}</p>}
              <p>{FAILURE_ADVICE[failure.phase][failure.kind]}</p>
              {pass !== null && (
                <p>
                  The pass below is the last one the runtime confirmed
                  {pass.at === null ? "" : `, at ${formatInstant(pass.at)}`}. It is kept on
                  screen on purpose: an empty page would read as &ldquo;nothing is live and
                  nothing is wrong&rdquo;.
                </p>
              )}
            </div>
          )}

          {running && (
            <div className={styles.runningBox} aria-busy="true">
              <p className={styles.runningTitle}>
                <Loader2 size={16} className="oa-spin" aria-hidden />
                A pass is running
              </p>
              <p>
                All six stages run inside one request, so nothing is reported until the pass
                stops or finishes. Build and prove are the slow ones — the sandbox runs the
                whole scenario suite and a stress sweep, and none of it is cached.
              </p>
              {/* What everything underneath this box is, in all three states it
                  can be in. None of it reports on the pass in flight, and the
                  one state with nothing to report is the one that has to say so
                  hardest. */}
              <p>
                {pass !== null
                  ? "What is shown below is the PREVIOUS pass, dimmed, until this one answers."
                  : unheard
                    ? "Nothing below reports on this pass, and nothing below reports on an earlier one either: no read has answered here, so this tab does not know what this runtime had done before the button was pressed — including whether it had already put a workforce live."
                    : "Below is what the runtime said BEFORE this pass was sent, which was that it had never run one. It is dimmed because this request is the thing that changes it."}
              </p>
            </div>
          )}

          {blocked && stopped !== null && (
            <div className={styles.blockedBox} role="alert">
              <p className={styles.blockedTitle}>
                <ShieldAlert size={17} aria-hidden />
                Blocked at {STAGE_META[stopped].title} — this is a normal result
              </p>
              <p>
                A gate refused, which is the pipeline doing its job rather than failing at
                it. The endpoint answers this with <code>422</code>: the request was fine,
                the workforce is not live-able yet, and the stage below says who fixes what.
                There is no force flag here or in the endpoint, so nothing on this screen
                can wave it through.
              </p>
              {stoppedStage !== null && (
                <>
                  <p>{stoppedStage.summary}</p>
                  {stoppedStage.href !== null && (
                    <div className={styles.blockedActions}>
                      <Link
                        href={stoppedStage.href}
                        className="oa-btn oa-btn--primary oa-btn--sm"
                      >
                        Go to {stoppedStage.href}
                        <ArrowRight size={13} aria-hidden />
                      </Link>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {pass !== null && pass.completed && pass.live !== null && (
            <LiveSummary live={pass.live} plan={pass.plan} notice={pass.notice} />
          )}

          {pass !== null && pass.completed && pass.live === null && (
            <div className={styles.errorBox} role="alert">
              <p className={styles.errorTitle}>
                <AlertTriangle size={16} aria-hidden />
                The pass says it completed and reported nothing live
              </p>
              <p>
                A completed pass always carries the deployment it created. This one does
                not, so there is no evidence any workforce went live and this screen will
                not invent a deployment id to fill the space. Treat the green stages below
                as unproven.
              </p>
            </div>
          )}

          <section aria-labelledby="oa-pipe-stages" className={styles.gapReport}>
            <div className={styles.gapGroupHead}>
              <h2 className={`oa-h2 ${styles.sectionTitle}`} id="oa-pipe-stages">
                The six stages
              </h2>
              <p className="oa-sub">
                In the order the orchestrator attempts them. Each one reads the one before
                it from storage rather than being told it went well, and the pass stops at
                the first closed gate.
              </p>
            </div>

            {/* The six rows are withheld in BOTH unheard states, not just while
                the read is in flight. `StageList` renders a null `stages` as six
                "not run yet" rows, which is the correct rendering of a runtime
                that said it has never run a pass and a fabrication otherwise. */}
            {unheard ? (
              <div
                className={`${styles.stateBox} ${styles.stateUnknown}`}
                aria-busy={reading}
              >
                <p className={styles.stateTitle}>
                  {reading ? (
                    <Loader2 size={17} className="oa-spin" aria-hidden />
                  ) : (
                    <HelpCircle size={17} aria-hidden />
                  )}
                  {reading
                    ? "Reading what the last pass produced…"
                    : "What the last pass produced is not known"}
                </p>
                <p>
                  The six rows stay empty. Showing them as &ldquo;not run yet&rdquo;
                  before the runtime has said so would be an answer, and this is the
                  absence of one.
                </p>
                {!reading && (
                  <p>
                    A pass may have run on this server a minute ago, or never.{" "}
                    {running
                      ? "The pass now in flight cannot settle that either — it will report on itself, and the read that would have reported on what came before it is the one that went unanswered."
                      : "The banner above says which request went unanswered, and until one answers, nothing on this tab can tell the two apart."}
                  </p>
                )}
              </div>
            ) : (
              /* `superseded` is not conditioned on holding a pass. Six rows
                 reading "not run yet" are just as much the PREVIOUS answer as
                 six reporting one, and they are the answer this pass is in the
                 middle of overwriting. */
              <StageList
                stages={pass?.stages ?? null}
                stoppedAt={stopped}
                superseded={running}
              />
            )}

            {/* `!unheard` and not `!reading`: this box is a positive claim about
                the runtime and is only ever allowed to appear when the runtime
                is the one that made it. It goes into the past tense while a pass
                is in flight for the neighbouring reason — the runtime did make
                this claim, and the request now running is precisely the thing
                that falsifies it, quite possibly several stages ago. */}
            {!unheard && pass === null && (
              <div className={styles.stateBox}>
                <p className={styles.stateTitle}>
                  <Info size={17} aria-hidden />
                  {running
                    ? "No pass had run here when this screen last asked."
                    : "This runtime has not run a pass yet."}
                </p>
                <p>
                  {running
                    ? "The pass in flight has not answered, so the six rows above are still the runtime's last word rather than a report on it. Whether this server has now run one is settled by that request and not by this sentence."
                    : (noPassHint ??
                      "Nothing has been run on this server. The button above demonstrates the gap report with the stored handoff — it blocks at Ingest by design. A pass that can go live takes a real handoff, pasted or collected from Role B.")}
                </p>
              </div>
            )}
          </section>

          <GapReport
            gaps={pass?.gaps ?? []}
            ran={pass !== null}
            known={!unheard}
            running={running}
          />
        </div>

        <div className={styles.railPane}>
          <section className={`oa-card ${styles.railCard}`} aria-label="This pass">
            <p className="oa-micro">This pass</p>
            <div className={styles.railRows}>
              <RailRow label="Outcome" value={outcomeWord} />
              <RailRow
                label="Stopped at"
                value={stopped === null ? (pass === null ? "—" : "ran to the end") : stopped}
              />
              <RailRow
                label="Answered"
                value={
                  pass === null
                    ? "—"
                    : pass.httpStatus === null
                      ? "on an earlier request"
                      : String(pass.httpStatus)
                }
              />
              <RailRow
                label="Recorded at"
                value={pass === null || pass.at === null ? "—" : formatInstant(pass.at)}
              />
              <RailRow
                label="Agents ingested"
                value={
                  pass === null || pass.plan === null ? "—" : String(pass.plan.agents.length)
                }
              />
              {SEVERITY_ORDER.map((severity) => (
                <RailRow
                  key={severity}
                  label={`Gaps · ${SEVERITY_META[severity].title.toLowerCase()}`}
                  value={
                    pass === null
                      ? "—"
                      : String(pass.gaps.filter((gap) => gap.severity === severity).length)
                  }
                />
              ))}
            </div>
            {pass !== null && (
              <p className="oa-sub">
                {plural(pass.stages.filter((s) => s.status === "ok").length, "stage", "stages")}{" "}
                reported ok out of {pass.stages.length}.
              </p>
            )}
            {/* Every value above is a dash in this state, and a column of dashes
                reads as a run that produced nothing rather than as a question
                nobody has answered. The dashes are not changed — six rows of
                "not known" is unreadable — so the sentence carries it. The card
                is headed "This pass", which is the other thing a running pass
                makes untrue for as long as it is in flight, so that gets a
                sentence too rather than letting the rail quietly attribute the
                previous pass's numbers to the one on the wire. */}
            {unheard ? (
              <p className="oa-sub">
                {reading
                  ? "Being read now: every dash above is a value this screen has not been given yet."
                  : "The runtime has not answered, so every dash above is a value this screen does not have — not a zero, and not a pass that did not happen."}
              </p>
            ) : (
              running && (
                <p className="oa-sub">
                  {pass === null
                    ? "A pass is running. Every dash above is what the runtime said before it was sent, and none of them is a result from it."
                    : "A pass is running. Every value above belongs to the previous pass until this one answers."}
                </p>
              )
            )}
          </section>

          <section className={`oa-card ${styles.railCard}`} aria-label="What the four words mean">
            <p className="oa-micro">What the four words mean</p>
            <p className="oa-sub">
              The vocabulary matters more than it looks. <strong>Blocked</strong> and{" "}
              <strong>failed</strong> are not synonyms: one is a gate shutting on purpose
              and the other is a defect.
            </p>
            <dl className={styles.railRows}>
              {STATUS_LEGEND.map((status) => (
                <div key={status} className={styles.legendRow}>
                  <dt>
                    <span className={`oa-status oa-status--${STATUS_META[status].cls}`}>
                      {STATUS_META[status].label}
                    </span>
                  </dt>
                  <dd>{STATUS_META[status].meaning}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className={`oa-card ${styles.railCard}`} aria-label="Where this comes from">
            <p className="oa-micro">Where this comes from</p>
            <ol className={styles.steps}>
              <li>
                One <code>POST /api/runtime/pipeline</code>. All six stages run inside that
                request; there is no partial progress to poll for.
              </li>
              <li>
                Every stage reads the previous one from storage rather than from a variable
                the orchestrator is holding — <code>prove</code> loads the packages{" "}
                <code>build</code> wrote, and <code>activate</code> reads the packages and
                the verdict rather than being told they were fine.
              </li>
              <li>
                A blocked pass is answered <code>422</code> and carries the same six stages
                as a completed one. This screen renders both the same way and lets the
                stage badges say which is which.
              </li>
              <li>
                The gap report is the ingest&apos;s own record of what it had to assume,
                carried through the whole pass. Nothing on this screen adds to it or
                editorialises it.
              </li>
            </ol>
          </section>

          <section className={`oa-card ${styles.railCard}`} aria-label="Where to go next">
            <p className="oa-micro">Where to go next</p>
            <p className="oa-sub">
              A blocked stage links to the surface that owns its cause. These are the two
              places a completed pass shows up.
            </p>
            <div className={styles.runRow}>
              <Link href="/app/deploy" className="oa-btn oa-btn--ghost oa-btn--sm">
                <Rocket size={13} aria-hidden />
                Activation checklist
              </Link>
              <Link
                href="/app/workspace/agents?live=1"
                className="oa-btn oa-btn--ghost oa-btn--sm"
              >
                <ArrowRight size={13} aria-hidden />
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
