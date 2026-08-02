"use client";
/**
 * components/live/workspace/ActivationGates.tsx — "which gate is shut, and where
 * do I go to open it" (ROLE_C_PLAN M7, blocked states).
 *
 * Two screens have to answer that question and they must not answer it
 * differently. The Workspace asks it when no trigger is registered
 * (`ActivationNotice`); the Approvals inbox asks it when the queue is empty and
 * the reason is that no workforce exists to fill it (`EmptyInbox`). If each grew
 * its own rendering, the day a gate's wording changed one screen would say
 * "packages built" and the other "agents compiled", and the owner would be left
 * deciding which of their own screens to believe. So the gates are rendered
 * once, here, and both callers drop this component in.
 *
 * IT IS FETCHED ON DEMAND, AND THE BUTTON SAYS WHY. `GET /api/runtime/activation`
 * re-derives the sandbox verdict on every request — it runs the whole scenario
 * library and the stress sweep before it can answer, and its own header states
 * that is deliberate and must never be memoised. That is the right trade for the
 * deploy screen and the wrong one for an operations surface: loading it on mount
 * would mean an owner who leaves a tab open re-proves the entire workforce every
 * time they come back to it, and the M7 change stream would make that worse
 * again by re-proving it on every push. So it sits behind a button, and the
 * button admits it takes a moment.
 *
 * EVERY BLOCKER CARRIES ITS OWN `href` FROM THE RUNTIME. `ActivationBlocker`
 * already knows where a missing package or a disconnected integration is fixed;
 * these are rendered as links rather than restated as prose, because a second
 * route table here would be one more thing to keep in step with the go-live
 * button that actually enforces them.
 *
 * THE BUTTON IS NEVER `disabled` WHILE IT WORKS. A keyboard user who presses it
 * would lose focus to the document body the instant it disabled itself, which on
 * this screen means being dropped out of the region they were reading. It stays
 * focusable, says `aria-busy`, and a second press is refused by the guard rather
 * than by the DOM.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PlugZap } from "lucide-react";
import { loadActivation } from "./runtime-api";
import type { ActivationSnapshot, Loaded } from "./runtime-api";
import { SourceError } from "./ui";
import styles from "./live-workspace.module.css";

export default function ActivationGates({ label }: { label?: string }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Loaded<ActivationSnapshot> | null>(null);
  const abort = useRef<AbortController | null>(null);
  /* Read by the guard below rather than `checking`, so a second press is refused
     on the value as of this instant and not as of the render that made the
     callback. */
  const busy = useRef(false);

  // A checklist request outlives a fast navigation, and it is the most expensive
  // one on the whole surface. Aborted on unmount so leaving the page stops the
  // sandbox suite it started rather than letting it run to completion unread.
  useEffect(() => () => abort.current?.abort(), []);

  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setChecking(true);
    const next = await loadActivation(controller.signal);
    busy.current = false;
    if (controller.signal.aborted) return;
    setResult(next);
    setChecking(false);
  }, []);

  return (
    <div className={styles.gateBlock}>
      <div className="oa-cluster">
        <button
          type="button"
          className="oa-btn oa-btn--ghost oa-btn--sm"
          onClick={() => void check()}
          aria-busy={checking}
        >
          <PlugZap size={13} aria-hidden className={checking ? "oa-spin" : undefined} />
          {checking ? "Checking…" : (label ?? "Check what is blocking go-live")}
        </button>
        <span className="oa-sub">
          Takes a moment — it runs the checks again rather than trusting an old
          answer.
        </span>
      </div>

      {checking && (
        <p className="oa-sub">
          Checking that every agent is ready, running their test runs again, and
          re-checking the connections they need. Nothing is cached, so this is as
          slow as the truth is.
        </p>
      )}

      {!checking && result !== null && result.error !== null && (
        <SourceError
          source="The go-live checks"
          message={result.error}
          retry={() => void check()}
        />
      )}

      {!checking && result !== null && result.data !== null && (
        <GateList snapshot={result.data} />
      )}
    </div>
  );
}

/**
 * The three gates as the runtime reports them.
 *
 * Each gate says "Satisfied" or "Blocked" in words beside its badge, never by
 * the badge's colour alone, and a shut one lists the runtime's own blocker
 * sentences with the runtime's own links.
 */
function GateList({ snapshot }: { snapshot: ActivationSnapshot }) {
  return (
    <div className={styles.gateList}>
      <p className="oa-sub">
        {snapshot.ready
          ? "Every check has passed. Going live is one step away."
          : "At least one check has not passed. Each one blocks on its own."}
      </p>

      {snapshot.gates.map((gate) => (
        <div key={gate.id} className={styles.gate}>
          <div className={styles.gateHead}>
            <span className={styles.gateName}>{gate.label}</span>
            <span
              className={`oa-status oa-status--${gate.satisfied ? "completed" : "pending"}`}
            >
              {gate.satisfied ? "Passed" : "Blocked"}
            </span>
          </div>
          <p className="oa-sub">{gate.detail}</p>
          {gate.blockers.length > 0 && (
            <ul className={styles.blockerList}>
              {gate.blockers.map((blocker, index) => (
                <li key={`${gate.id}-${index}`} className={styles.blocker}>
                  {blocker.message}{" "}
                  <Link href={blocker.href} className={styles.inlineLink}>
                    Fix this
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {snapshot.deployment !== null && (
        <p className={styles.footNote}>
          Plan version {snapshot.deployment.planVersion} is recorded as live, put
          live by {snapshot.deployment.activatedBy} at{" "}
          {snapshot.deployment.activatedAt}. Nothing is scheduled against it,
          which should not happen — so treat this page and the go-live page as
          disagreeing until it is explained.
        </p>
      )}
    </div>
  );
}
