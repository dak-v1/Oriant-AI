"use client";
/**
 * ScenarioMain — the case detail in the middle of the workspace.
 *
 * ADAPTED FROM components/mock/sandbox/ScenarioMain.tsx. The header, the
 * key-value input panel, the blue-ruled expected-behavior line, the aligned
 * 44px run-control row and the step rail beneath it are the mock's, class for
 * class. What changed:
 *
 * 1. THE INPUT PANEL SHOWS WHAT THE RUNTIME PUBLISHES. The mock's `input` rows
 *    were fixture prose — a customer name, a channel, a message. A generated
 *    scenario has no such thing: `GET /api/runtime/sandbox` publishes id, name,
 *    description, agent and category, and that is the whole of it. These rows
 *    are those fields. Inventing a plausible "Customer: Mrs Wong" to fill the
 *    panel is precisely the defect being removed.
 *
 * 2. THE EXPECTED-BEHAVIOR LINE IS THE RUNTIME'S DESCRIPTION AND SAYS SO. The
 *    mock kept a hand-written `EXPECTED_BEHAVIOR` table keyed by fixture id.
 *    A scenario's real expectations are a `ScenarioExpectation` — a final
 *    status, operations that must and must not be called, approval counts — and
 *    NEITHER endpoint publishes them. They are checked in code and they surface
 *    only when one is not met, as a failure line. So this line carries the
 *    description the runtime wrote and states where the actual assertions live,
 *    rather than paraphrasing assertions this screen has never seen.
 *
 * 3. THERE ARE TWO RUN BUTTONS AND A STOP THAT CANNOT STOP ANYTHING. Running one
 *    test is the only way to get an event stream; running the suite is the only
 *    way to get a verdict and the sweep. And "Stop" can only abandon this tab's
 *    wait — the run is executing inside an HTTP request on the server and
 *    dropping the reply does not cancel it. That is printed under the row rather
 *    than implied by a button that looks like a cancel.
 */

import { ListChecks, PanelRight, Play, RotateCcw, Square } from "lucide-react";
import type { StressView } from "../api";
import type { TestOutcome } from "../outcome";
import EventTimeline from "./EventTimeline";
import StageRail from "./StageRail";
import StressPanel from "./StressPanel";
import { stageStates } from "./stages";
import styles from "./sandbox.module.css";

/**
 * What the numbered rail underneath is, in one sentence, per state.
 *
 * This is the single most important string in the file. A five-step rail is the
 * most animation-shaped thing on the page, and the Factory set the precedent
 * that a stage display must say out loud when it is a summary of something
 * finished rather than a trace of something happening.
 */
const RAIL_CAPTION = {
  run:
    "A summary of a run that has already finished — not a live trace. The scenario executes " +
    "inside one request and the runtime answers once, so there is no step-by-step progress to " +
    "subscribe to and none is drawn. Each frame is marked from the events the run actually " +
    "emitted: done, passed over, or never reached.",
  suite:
    "Blank on purpose. The whole-suite reply projects every result down to eight fields and " +
    "drops the event stream, so there is nothing to mark these frames from. Run this test on " +
    "its own and they fill in from the events that run emits — still a summary of a finished " +
    "run, never a live trace.",
  none:
    "The five frames a finished run is summarised into. Nothing has been run for this test in " +
    "this tab, so none of them can be marked. They are never animated: a sandbox run happens " +
    "inside a single request and is over before this screen sees it.",
} as const;

export default function ScenarioMain({
  isStress,
  name,
  description,
  category,
  agentId,
  scenarioId,
  outcome,
  stress,
  hasVerdict,
  runLabel,
  runIsPrimary,
  canRun,
  onRun,
  canStop,
  onStop,
  showOutputButton,
  onOpenOutput,
}: {
  isStress: boolean;
  name: string;
  description: string;
  category: string;
  /** Null on the stress entry, which is about the whole plan. */
  agentId: string | null;
  /** Null on the stress entry, which has no scenario id. */
  scenarioId: string | null;
  outcome: TestOutcome;
  stress: StressView | null;
  hasVerdict: boolean;
  runLabel: string;
  runIsPrimary: boolean;
  canRun: boolean;
  onRun: () => void;
  canStop: boolean;
  onStop: () => void;
  /** Below 1024px the output panel lives in a drawer behind this button. */
  showOutputButton: boolean;
  onOpenOutput: () => void;
}) {
  const isRerun = runLabel.startsWith("Run again");
  const railStates = stageStates(outcome.kind === "run" ? outcome.run : null);
  const railCaption =
    outcome.kind === "run"
      ? RAIL_CAPTION.run
      : outcome.kind === "suite"
        ? RAIL_CAPTION.suite
        : RAIL_CAPTION.none;

  return (
    <div className={styles.mainCol}>
      {/* ── Selected test header ── */}
      <header className={styles.mainHead}>
        <div className={styles.mainTitleRow}>
          <h2 className="oa-h2" style={{ margin: 0 }}>
            {name}
          </h2>
          <span className="oa-tag oa-tag--neutral">{category}</span>
        </div>
        <p className="oa-sub" style={{ maxWidth: 640 }}>
          {description}
        </p>
      </header>

      {/* ── What the runtime publishes about this test ── */}
      <section aria-label="Test details" style={{ display: "grid", gap: 8 }}>
        <p className="oa-micro">Details</p>
        <div className={`oa-panel ${styles.kvPanel}`}>
          <div className={styles.kvRow}>
            <span className={styles.kvLabel}>Agent</span>
            <p className={`${styles.kvValue} ${styles.mono}`}>
              {agentId ?? "The whole plan — the sweep is generated from every agent's guardrails."}
            </p>
          </div>
          <div className={styles.kvRow}>
            <span className={styles.kvLabel}>Case id</span>
            <p className={`${styles.kvValue} ${styles.mono}`}>
              {scenarioId ?? "No id — the sweep is one request, not a scenario."}
            </p>
          </div>
          <div className={styles.kvRow}>
            <span className={styles.kvLabel}>Source</span>
            <p className={styles.kvValue}>
              {isStress
                ? "Generated by the runtime from this plan's own limits, quiet hours and daily caps."
                : "Published by the runtime as part of the scenario library for the plan it currently holds."}
            </p>
          </div>
        </div>
      </section>

      {/* ── Expected behavior ── */}
      <div className={styles.expected}>
        <ListChecks size={16} aria-hidden className={styles.expectedIcon} />
        <p className={styles.expectedText}>
          <strong>What it is judged against: </strong>
          {isStress
            ? "each case asserts what the plan's own guardrails say should happen at a boundary — allow, refuse, or stop for a person — and is checked in code, never by a model."
            : "a structured expectation the runtime checks in code — the status the run must end in, operations it must call, operations it must never call, how many times it may pause. Neither endpoint publishes those assertions, so they are not restated here; every one that is NOT met appears as a failure line in the output panel, in the judge's own words."}
        </p>
      </div>

      {/* ── Run controls (aligned, 44px) ── */}
      <div className={styles.runRow}>
        <button
          type="button"
          className={`oa-btn ${runIsPrimary ? "oa-btn--primary" : "oa-btn--ghost"}`}
          onClick={onRun}
          disabled={!canRun}
        >
          {isRerun ? <RotateCcw size={15} aria-hidden /> : <Play size={15} aria-hidden />}
          {runLabel}
        </button>
        <button type="button" className="oa-btn oa-btn--ghost" onClick={onStop} disabled={!canStop}>
          <Square size={14} aria-hidden />
          Stop waiting
        </button>
        {showOutputButton && (
          <button type="button" className="oa-btn oa-btn--ghost" onClick={onOpenOutput}>
            <PanelRight size={15} aria-hidden />
            View output
          </button>
        )}
      </div>
      <div className={styles.runNotes}>
        <p style={{ margin: 0 }}>
          Every tool call in a sandbox run is served by a stub and the run store is thrown away
          afterwards. Nothing here reaches a real customer, mailbox or calendar, and nothing
          here writes anything the rest of the product reads.
        </p>
        <p style={{ margin: 0 }}>
          Stop only abandons this tab&apos;s wait. The scenario is executing inside an HTTP
          request on the server; dropping the reply does not cancel it, and the only thing lost
          is the answer.
        </p>
      </div>

      {/* ── The numbered step rail, then the run's own events ── */}
      {isStress ? (
        <StressPanel stress={stress} hasVerdict={hasVerdict} />
      ) : (
        <section aria-label="Run stages and events" style={{ display: "grid", gap: 14 }}>
          <StageRail states={railStates} caption={railCaption} />
          <EventTimeline
            events={outcome.kind === "run" ? outcome.run.events : []}
            emptyNote={
              outcome.kind === "run"
                ? {
                    title: "This run emitted no events",
                    body:
                      "The runtime returned a result with an empty stream, which is what a run that never started looks like — the agent is not in the plan, no workflow is enabled, or no package has been built for it. The failure lines in the output panel say which.",
                  }
                : outcome.kind === "suite"
                  ? {
                      title: "The suite reply carries no event stream",
                      body:
                        "This test has a real result — pass or fail, in the output panel — but the whole-suite response drops the events. Run this one test to get its step-by-step trace.",
                    }
                  : {
                      title: "The step trace appears here",
                      body:
                        "Run this test on its own and every event the executor emitted is listed: the trigger, each step, each tool call, any checkpoint the run stopped at, and how it ended.",
                    }
            }
          />
        </section>
      )}
    </div>
  );
}
