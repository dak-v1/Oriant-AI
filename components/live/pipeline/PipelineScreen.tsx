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
 * FOUR THINGS IT REFUSES TO GET WRONG.
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

interface Failure {
  kind: FailureKind;
  message: string;
  hint: string | null;
}

const FAILURE_TITLE: Record<FailureKind, string> = {
  refused: "The runtime refused the request",
  unreachable: "The runtime could not be reached",
  malformed: "The runtime answered in a shape this screen does not understand",
};

const FAILURE_ADVICE: Record<FailureKind, string> = {
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
    "the stage you cannot see is missing. This is a mismatch between this screen and " +
    "/api/runtime/pipeline rather than anything wrong with the workforce.",
};

/** The four status words, explained once rather than on every row. */
const STATUS_LEGEND = Object.keys({
  ok: true,
  blocked: true,
  failed: true,
  skipped: true,
} satisfies Record<StageStatus, true>) as StageStatus[];

export default function PipelineScreen() {
  const [pass, setPass] = useState<PipelinePass | null>(null);
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
      if (outcome.kind === "pass") setPass(outcome.pass);
      else if (outcome.kind === "none") setNoPassHint(outcome.hint);
      else if (outcome.kind === "refused") {
        setFailure({ kind: "refused", message: outcome.message, hint: outcome.hint });
      } else if (outcome.kind === "unreachable") {
        setFailure({ kind: "unreachable", message: outcome.message, hint: null });
      } else {
        setFailure({ kind: "malformed", message: outcome.message, hint: null });
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

    setRunning(true);
    setFailure(null);

    const outcome = await runPass(request, controller.signal);
    busy.current = false;
    if (controller.signal.aborted) return;

    if (outcome.kind === "pass") {
      setPass(outcome.pass);
      setNoPassHint(null);
    } else if (outcome.kind === "refused") {
      // Deliberately does NOT clear `pass`; see rule 4 in the header.
      setFailure({ kind: "refused", message: outcome.message, hint: outcome.hint });
    } else if (outcome.kind === "unreachable") {
      setFailure({ kind: "unreachable", message: outcome.message, hint: null });
    } else {
      setFailure({ kind: "malformed", message: outcome.message, hint: null });
    }

    setReading(false);
    setRunning(false);
  }, []);

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
            <span className="oa-tag oa-tag--neutral">
              {reading ? "Reading the last pass" : "No pass on record"}
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

      {/* Above everything, in every state, at the size it deserves. */}
      <DraftOnlyNotice plan={pass?.plan ?? null} />

      <div className={styles.split}>
        <div className={styles.mainPane}>
          <RunPanel busy={running} hasResult={pass !== null} onRun={(request) => void run(request)} />

          {failure !== null && (
            <div className={styles.errorBox} role="alert">
              <p className={styles.errorTitle}>
                <AlertTriangle size={16} aria-hidden />
                {FAILURE_TITLE[failure.kind]}
              </p>
              <p className={styles.errorDetail}>{failure.message}</p>
              {failure.hint !== null && <p>{failure.hint}</p>}
              <p>{FAILURE_ADVICE[failure.kind]}</p>
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
              {pass !== null && (
                <p>
                  What is shown below is the PREVIOUS pass, dimmed, until this one answers.
                </p>
              )}
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

            {reading ? (
              <div className={styles.stateBox} aria-busy="true">
                <p className={styles.stateTitle}>
                  <Loader2 size={17} className="oa-spin" aria-hidden />
                  Reading what the last pass produced…
                </p>
                <p>
                  The six rows stay empty until this answers. Showing them as
                  &ldquo;not run yet&rdquo; before the runtime has said so would be an
                  answer, and this is the absence of one.
                </p>
              </div>
            ) : (
              <StageList
                stages={pass?.stages ?? null}
                stoppedAt={stopped}
                superseded={running && pass !== null}
              />
            )}

            {!reading && pass === null && (
              <div className={styles.stateBox}>
                <p className={styles.stateTitle}>
                  <Info size={17} aria-hidden />
                  This runtime has not run a pass yet.
                </p>
                <p>
                  {noPassHint ??
                    'Nothing has been run on this server. Press the button above, or POST {"fixture":true} to /api/runtime/pipeline.'}
                </p>
              </div>
            )}
          </section>

          <GapReport gaps={pass?.gaps ?? []} ran={pass !== null} />
        </div>

        <div className={styles.railPane}>
          <section className={`oa-card ${styles.railCard}`} aria-label="This pass">
            <p className="oa-micro">This pass</p>
            <div className={styles.railRows}>
              <RailRow
                label="Outcome"
                value={
                  pass === null
                    ? reading
                      ? "reading…"
                      : "no pass yet"
                    : pass.completed
                      ? "completed"
                      : "blocked"
                }
              />
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
