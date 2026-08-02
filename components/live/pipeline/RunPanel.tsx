"use client";
/**
 * components/live/pipeline/RunPanel.tsx — the button that runs the whole chain,
 * and the sentence that says what pressing it costs.
 *
 * THIS IS NOT A DRY RUN AND THE PANEL SAYS SO IN WORDS. A pass that reaches the
 * end builds packages, runs the sandbox, registers triggers and records a
 * deployment. Everything up to `prove` is repeatable and cheap; `activate`
 * writes. A button labelled "Run" on a screen full of stage names invites the
 * reading that this is a preview, and the one place that reading is expensive is
 * the last stage, so it is stated next to the control rather than in a tooltip.
 *
 * THE FIXTURE IS THE PRIMARY ACTION, deliberately. `POST {"fixture":true}` runs
 * the stored Role B handoff, which means this screen demonstrates the entire
 * pipeline on a machine with no Role B backend, no seeded database and nothing
 * pasted — and the pass it produces is the real orchestrator against the real
 * stores, not a rehearsal of one.
 *
 * PASTING A HANDOFF IS THE SECOND PATH, because the fixture is the demo and a
 * real handoff is the job. It is validated as JSON in the browser before
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
        Run a pass
      </h2>

      <p className={styles.runNote}>
        One press runs all six stages against the real runtime stores. The first five are
        repeatable — collect, ingest, validate, build and prove can be run as often as you
        like. <strong>Activate writes.</strong> A pass that gets that far registers triggers
        and puts a deployment on record; it is a go-live, not a preview. It cannot be
        forced past a shut gate: there is no override flag, here or in the endpoint.
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
          {busy
            ? "Running the pass…"
            : hasResult
              ? "Run the stored Role B handoff again"
              : "Run the stored Role B handoff"}
        </button>

        <button
          type="button"
          className="oa-btn oa-btn--ghost oa-btn--sm"
          onClick={() => setShowPayload((open) => !open)}
          aria-expanded={showPayload}
        >
          <Braces size={13} aria-hidden />
          {showPayload ? "Hide the paste field" : "Paste a handoff instead"}
        </button>
      </div>

      <p className={styles.runNote}>
        The stored handoff is the fixture in <code>lib/plan/fixtures/role-b-handoff.ts</code>,
        sent as <code>{'{"fixture": true}'}</code>. It exists so the whole chain is
        demonstrable with no Role B backend running. Nothing on this screen names who is
        activating, so the endpoint records its own default owner on the deployment.
      </p>

      {showPayload && (
        <div className={styles.payloadForm}>
          <label className="oa-label" htmlFor={areaId}>
            A workforce handoff, as JSON
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
            placeholder='{"handoff_type":"workforce_plan", "workforce_plan":{…}, "agents":[…], "integrations":[…]}'
            aria-describedby={payloadError === null ? undefined : errorId}
            aria-invalid={payloadError !== null}
          />
          <p className={styles.runNote}>
            This is the <code>payload</code> from Role B&apos;s{" "}
            <code>GET /api/planner/:workforcePlanId/handoff</code>, posted as{" "}
            <code>{'{"payload": …}'}</code>. The runtime checks the shape itself and refuses
            anything that is not a workforce handoff.
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
              Run this handoff
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
