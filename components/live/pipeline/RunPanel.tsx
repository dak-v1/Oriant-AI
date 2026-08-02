"use client";
/**
 * components/live/pipeline/RunPanel.tsx — the buttons that run a pass, and the
 * sentences that say what pressing each of them costs and delivers.
 *
 * THIS IS NOT A DRY RUN AND THE PANEL SAYS SO IN WORDS. A pass that reaches the
 * end builds packages, runs the sandbox, registers triggers and records a
 * deployment. Everything up to `prove` is repeatable and cheap; `activate`
 * writes. A button labelled "Run" on a screen full of stage names invites the
 * reading that this is a preview, and the one place that reading is expensive is
 * the last stage, so it is stated next to the control rather than in a tooltip.
 *
 * THE FIXTURE IS THE PRIMARY ACTION, AND IT IS LABELLED AS A DEMONSTRATION OF
 * THE GAP REPORT — never as a way to go live. `POST {"fixture":true}` runs the
 * stored Role B handoff, which is kept deliberately as received: plan v1
 * against a current v2, `stale: true`, an approval owner this runtime cannot
 * resolve. Every one of those trips a gap, so the pass blocks at Ingest every
 * time — the real orchestrator refusing for real reasons, which is exactly
 * what it exists to show on a machine with no Role B backend, no seeded
 * database and nothing pasted. It keeps the primary slot because it is the one
 * press that works on that machine. An earlier label ("Run the stored Role B
 * handoff") was rejected in place: beside banners saying "run a handoff to
 * replace the demo", it read as the advertised remedy, and it is the one
 * handoff that can never deliver it.
 *
 * PASTING A HANDOFF IS THE SECOND PATH AND THE ONLY ONE THAT CAN GO LIVE,
 * because the fixture is the demonstration and a real handoff — pasted here,
 * or collected from Role B — is the job. It is validated as JSON in the browser before
 * anything is sent — not to second-guess the route, which does its own far
 * stricter check and answers 400 with a sentence, but because a trailing comma
 * should cost a message under the textarea rather than a round trip and a red
 * banner about the runtime.
 *
 * NEITHER BUTTON DISABLES ITSELF WHILE IT WORKS. A keyboard user who presses one
 * would lose focus to the document body the instant it went disabled, which on
 * this screen means being dropped out of the region they were reading. They stay
 * focusable, report `aria-busy`, and a second press is refused by the caller's
 * guard rather than by the DOM — the same rule
 * `components/live/workspace/ActivationGates.tsx` follows.
 */

import { useCallback, useId, useState } from "react";
import { Braces, Play, RefreshCw } from "lucide-react";
import type { PassRequest } from "./api";
import styles from "./pipeline.module.css";

export default function RunPanel({
  busy,
  hasResult,
  onRun,
}: {
  busy: boolean;
  /** Changes the verb: the second press is a re-run, and says so. */
  hasResult: boolean;
  onRun: (request: PassRequest) => void;
}) {
  const [showPayload, setShowPayload] = useState(false);
  const [payload, setPayload] = useState("");
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const areaId = useId();
  const errorId = useId();

  const runPasted = useCallback(() => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload) as unknown;
    } catch (err) {
      setPayloadError(
        `That is not valid JSON, so nothing was sent: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return;
    }
    setPayloadError(null);
    onRun({ payload: parsed });
  }, [onRun, payload]);

  return (
    <section className={`oa-card ${styles.runPanel}`} aria-labelledby="oa-pipe-run">
      <h2 className="oa-h3" id="oa-pipe-run">
        Bring your plan live
      </h2>

      <p className={styles.runNote}>
        One press runs all six steps for real. The first five are repeatable — receiving
        your plan, reading it in, checking it, building and testing can be done as often as
        you like. <strong>The last step goes live.</strong> A run that gets that far sets up
        scheduled runs and puts your workforce live; it is not a preview. It cannot be
        forced past something that is not ready: there is no override anywhere.
      </p>

      <div className={styles.runRow}>
        <button
          type="button"
          className="oa-btn oa-btn--primary"
          onClick={() => onRun({ fixture: true })}
          aria-busy={busy}
        >
          {busy ? (
            <RefreshCw size={14} className="oa-spin" aria-hidden />
          ) : (
            <Play size={14} aria-hidden />
          )}
          {/* "Demonstrate", not "Run … handoff": the verb is the label's whole
              job. The stored handoff blocks at Ingest by design, so a label
              that reads as running a handoff promises the go-live this button
              cannot produce. */}
          {busy
            ? "Running…"
            : hasResult
              ? "Show the example again"
              : "See it with an example plan"}
        </button>

        <button
          type="button"
          className="oa-btn oa-btn--ghost oa-btn--sm"
          onClick={() => setShowPayload((open) => !open)}
          aria-expanded={showPayload}
        >
          <Braces size={13} aria-hidden />
          {showPayload ? "Hide the paste box" : "Paste your own plan instead"}
        </button>
      </div>

      <p className={styles.runNote}>
        The example is a sample plan kept deliberately out of date, so the run stops early
        and shows you what gets assumed when information is missing. It is a demonstration,
        not a way to go live, and it never replaces the sample workforce. Going live takes a
        plan of your own: pasted below, or brought over from your planning step. Nothing on
        this screen asks who is authorising, so a run that reaches the end records a default
        name against the go-live rather than yours.
      </p>

      {showPayload && (
        <div className={styles.payloadForm}>
          <label className="oa-label" htmlFor={areaId}>
            Your workforce plan, as JSON
          </label>
          <textarea
            id={areaId}
            className={`oa-textarea ${styles.payloadArea}`}
            value={payload}
            spellCheck={false}
            onChange={(event) => {
              setPayload(event.target.value);
              if (payloadError !== null) setPayloadError(null);
            }}
            placeholder='{"workforce_plan": {…}, "agents": […], "integrations": […]}'
            aria-describedby={payloadError === null ? undefined : errorId}
            aria-invalid={payloadError !== null}
          />
          <p className={styles.runNote}>
            This is the plan your planning step produces, pasted whole. It is checked as it
            comes in, and anything that is not a workforce plan is refused before a single
            step runs.
          </p>
          {payloadError !== null && (
            <p className={styles.payloadError} id={errorId} role="alert">
              {payloadError}
            </p>
          )}
          <div className={styles.runRow}>
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--sm"
              onClick={runPasted}
              aria-busy={busy}
            >
              <Play size={13} aria-hidden />
              Bring this plan live
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
