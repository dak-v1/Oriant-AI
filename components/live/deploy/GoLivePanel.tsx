"use client";
/**
 * components/live/deploy/GoLivePanel.tsx — the button, and everything that has
 * to be true before it sends.
 *
 * IT NEVER SENDS ON ITS OWN. `POST /api/runtime/activation` registers triggers,
 * marks every agent active and writes a deployment. Nothing on this screen
 * retries it, polls it or fires it on mount; every attempt is a press by somebody
 * who meant it, and a second press is refused on a ref rather than on the render
 * that produced the callback.
 *
 * IT IS OPEN ONLY WHEN THE CHECKLIST IS. `permission` is decided by the screen
 * from an answer the runtime actually gave, and there is no state in which the
 * absence of information opens it: a checklist that has not been read, one that
 * failed to read, and one that came back with an empty gate list all refuse, each
 * saying which of those it is. The empty-gate case is the subtle one — `ready` is
 * derived from `gates.every(...)` and `[].every(...)` is `true`, so a response
 * with no gates arrives claiming to be ready while nothing has been checked.
 *
 * THE BUTTON IS NOT `disabled`, IT IS `aria-disabled` WITH A GUARD. The states
 * that shut it arrive mid-press — a 409 comes back and the checklist goes red
 * under somebody's finger — and a control that disables itself drops a keyboard
 * user out of the region entirely. Same semantics, same refusal, no lost focus.
 * See `.refuses` in deploy.module.css.
 *
 * `activatedBy` IS TYPED BY A PERSON AND IS NEVER DEFAULTED. `activate` throws on
 * a blank actor rather than returning a checklist, because "a deployment record
 * that cannot say who authorised it is not evidence of anything". A default here
 * — "operator", a browser locale, anything at all — would put a name on an audit
 * record that nobody typed, which is the same defect wearing a helpful face.
 */

import { useCallback, useRef, useState } from "react";
import { Loader2, Rocket } from "lucide-react";
import styles from "./deploy.module.css";

/**
 * Whether the runtime has said this workforce may go live.
 *
 * A closed union rather than a boolean and a message, so a state nobody wrote a
 * sentence for cannot exist. Every one of them is a REASON, and the panel says it
 * out loud instead of leaving a dimmed button to be interpreted.
 */
export type GoLivePermission =
  /** Every gate satisfied, on an answer the runtime actually gave. */
  | { kind: "open" }
  /** No read has come back carrying a checklist. Nothing is known. */
  | { kind: "unknown" }
  /** The gates were read and at least one is shut. */
  | { kind: "blocked"; blockers: number }
  /** The checklist claimed to be ready with no gates in it. See the header. */
  | { kind: "empty" }
  /** A go-live is already in flight. */
  | { kind: "inFlight" };

export default function GoLivePanel({
  permission,
  onGoLive,
}: {
  permission: GoLivePermission;
  /** Only ever called with a non-blank actor, and only when `open`. */
  onGoLive: (activatedBy: string) => void;
}) {
  const [activatedBy, setActivatedBy] = useState("");
  /* Read by the guard rather than `permission`, so a second press is refused on
     the value as of this instant and not as of the render that made the
     callback. This POST puts a workforce live; a double press is not a cosmetic
     problem. */
  const busy = useRef(false);
  /** Set when a press was refused, so the reason is announced rather than felt. */
  const [refused, setRefused] = useState<string | null>(null);

  const actor = activatedBy.trim();
  const open = permission.kind === "open";
  const inFlight = permission.kind === "inFlight";
  const sends = open && actor !== "";

  const press = useCallback(() => {
    if (busy.current) return;
    if (permission.kind !== "open") {
      setRefused(
        "Nothing was sent. This button only sends when the runtime has answered that " +
          "every gate is satisfied, and it has not.",
      );
      return;
    }
    if (actor === "") {
      setRefused(
        "Nothing was sent. The deployment record has to name whoever authorised this " +
          "go-live, and this screen will not invent one.",
      );
      return;
    }
    busy.current = true;
    setRefused(null);
    onGoLive(actor);
    /* Released immediately: the guard exists to stop a double press inside one
       React commit, and the screen's own in-flight state is what stops a second
       press for the length of the request. Holding it here as well would mean a
       failed POST left a button nothing could ever press again. */
    busy.current = false;
  }, [actor, onGoLive, permission.kind]);

  return (
    <section className={`oa-card ${styles.goLive}`} aria-label="Go live">
      <div className={styles.goLiveRow}>
        <label className={styles.actorField}>
          <span className="oa-label">Who is authorising this go-live</span>
          <input
            className="oa-input"
            type="text"
            value={activatedBy}
            spellCheck={false}
            autoComplete="off"
            placeholder="your user id"
            onChange={(event) => setActivatedBy(event.target.value)}
            aria-describedby="oa-deploy-actor-note"
          />
        </label>

        <button
          type="button"
          className={`oa-btn oa-btn--primary ${sends ? "" : styles.refuses}`}
          aria-disabled={!sends}
          aria-busy={inFlight}
          onClick={press}
        >
          {inFlight ? (
            <Loader2 size={15} className="oa-spin" aria-hidden />
          ) : (
            <Rocket size={15} aria-hidden />
          )}
          {inFlight ? "Activating…" : "Go live"}
        </button>
      </div>

      <p className={styles.note} id="oa-deploy-actor-note">
        Recorded on the deployment as <code>activatedBy</code> and kept for audit. The
        runtime refuses a go-live that cannot say who authorised it, so this is not a
        formality and nothing here fills it in for you.
      </p>

      {/* Why it will not send, in the panel rather than in a tooltip. A dimmed
          control with no sentence beside it is a screen asking to be guessed
          at. */}
      {!open && (
        <p className={styles.whyNot}>
          {permission.kind === "unknown"
            ? "The gates have not been read, so this screen does not know whether this workforce may go live. It is not saying that it may not — it is saying nobody has been told."
            : permission.kind === "blocked"
              ? `${permission.blockers === 1 ? "One gate is" : `${permission.blockers} blockers are`} standing between this plan and go-live. Each one is listed below in the runtime's own words, with a link to where it is fixed. There is no override on this screen and none in the endpoint.`
              : permission.kind === "empty"
                ? "The checklist came back with no gates in it. An empty list satisfies “every gate passed” without anything having been checked, so this button stays shut whatever the response's own ready flag says."
                : "A go-live is already in flight. Nothing is sent twice from here."}
        </p>
      )}

      {open && actor === "" && (
        <p className={styles.whyNot}>
          Every gate is satisfied. Fill in who is authorising this and the button will
          send.
        </p>
      )}

      {refused !== null && (
        <p className={styles.whyNot} role="alert">
          {refused}
        </p>
      )}
    </section>
  );
}
