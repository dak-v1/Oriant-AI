"use client";
/**
 * components/live/deploy/ui/ActivateCard.tsx — the button, and everything that
 * has to be true before it sends, wearing the demo checklist's final step.
 *
 * ADAPTED FROM the "Activate workforce" card at the foot of
 * components/mock/deploy/DeployChecklist.tsx — same stylesheet, imported rather
 * than copied and read-only from this lane — and it REPLACES
 * components/live/deploy/GoLivePanel.tsx with that panel's logic intact. What
 * was dropped from the demo card: the illustrative pricing meta (this screen
 * quotes no number the runtime did not send) and the store-derived readiness
 * (permission here is decided by the screen from an answer the runtime actually
 * gave). What was added: the actor field, because the runtime refuses a go-live
 * that cannot say who authorised it.
 *
 * IT NEVER SENDS ON ITS OWN. `POST /api/runtime/activation` registers triggers,
 * marks every agent active and writes a deployment. Nothing on this screen
 * retries it, polls it or fires it on mount; every attempt is a press by
 * somebody who meant it, and a second press is refused on a ref rather than on
 * the render that produced the callback.
 *
 * IT IS OPEN ONLY WHEN THE CHECKLIST IS. There is no state in which the absence
 * of information opens it: a checklist that has not been read, one that failed
 * to read, and one that came back with an empty gate list all refuse, each
 * saying which of those it is. The empty-gate case is the subtle one — `ready`
 * is derived from `gates.every(...)` and `[].every(...)` is `true`, so a
 * response with no gates arrives claiming to be ready while nothing has been
 * checked.
 *
 * THE BUTTON IS NOT `disabled`, IT IS `aria-disabled` WITH A GUARD. The states
 * that shut it arrive mid-press — a 409 comes back and the checklist goes amber
 * under somebody's finger — and a control that disables itself drops a keyboard
 * user out of the region entirely. Same semantics, same refusal, no lost focus.
 * See `.refuses` in ../deploy.module.css.
 *
 * `activatedBy` IS TYPED BY A PERSON AND IS NEVER DEFAULTED. `activate` throws
 * on a blank actor rather than returning a checklist, because "a deployment
 * record that cannot say who authorised it is not evidence of anything". A
 * default here — "operator", a browser locale, anything at all — would put a
 * name on an audit record that nobody typed, which is the same defect wearing a
 * helpful face.
 */

import { useCallback, useRef, useState } from "react";
import { Loader2, Rocket } from "lucide-react";
import type { ChecklistView } from "../api";
import { plural } from "../format";
import shell from "@/components/mock/deploy/deploy.module.css";
import live from "../deploy.module.css";

/**
 * Whether the runtime has said this workforce may go live.
 *
 * A closed union rather than a boolean and a message, so a state nobody wrote a
 * sentence for cannot exist. Every one of them is a REASON, and the card says
 * it out loud instead of leaving a dimmed button to be interpreted.
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

export default function ActivateCard({
  permission,
  checklist,
  onGoLive,
}: {
  permission: GoLivePermission;
  /**
   * The gates the button is judged by — the newest checklist from ANY answer,
   * or null before one exists. Renders the meta row and the "before this can
   * go live" list; it never decides `permission`, which the screen derives.
   */
  checklist: ChecklistView | null;
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

  const satisfied =
    checklist === null ? 0 : checklist.gates.filter((gate) => gate.satisfied).length;
  const shut = checklist === null ? [] : checklist.gates.filter((gate) => !gate.satisfied);

  const press = useCallback(() => {
    if (busy.current) return;
    if (permission.kind !== "open") {
      setRefused(
        "Nothing was sent. This button only sends once every check has come back passed, " +
          "and they have not.",
      );
      return;
    }
    if (actor === "") {
      setRefused(
        "Nothing was sent. The record has to name whoever authorised this go-live, and " +
          "this screen will not invent one.",
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
    <section className={`oa-card ${shell.activateCard}`} aria-label="Go live">
      <div className={shell.activateInfo}>
        <span className={shell.stepNo}>Final step</span>
        <h2 className={shell.activateTitle}>Go live</h2>

        {/* The demo card's meta row, with the runtime's numbers in place of the
            illustrative pricing. Nothing here when nothing has answered — a
            tag saying so, never a zero pretending to be a count. */}
        <div className={shell.activateMeta}>
          {checklist === null ? (
            <span className="oa-tag oa-tag--neutral">Checks not run yet</span>
          ) : (
            <>
              <span>
                <strong>
                  {satisfied} of {checklist.gates.length}
                </strong>{" "}
                checks passed
              </span>
              <span aria-hidden>·</span>
              <span>
                plan <strong>v{checklist.planVersion}</strong>
              </span>
              {shut.length > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <span>
                    <strong>
                      {plural(
                        shut.reduce((count, gate) => count + gate.blockers.length, 0),
                        "thing",
                        "things",
                      )}
                    </strong>{" "}
                    to fix
                  </span>
                </>
              )}
            </>
          )}
        </div>

        <p className={live.note} id="oa-deploy-actor-note">
          Recorded against this go-live and kept for your records. A go-live that cannot say
          who authorised it is refused, so this is not a formality and nothing here fills it
          in for you.
        </p>

        {/* The demo's "before you can activate" list, pointing at the gate rows
            above — its #chk-* anchor pattern with the runtime's gate ids and
            the runtime's own labels. The full blockers are on the rows; this
            is the index of them, never a substitute for them. */}
        {shut.length > 0 && (
          <ul className={shell.missing} aria-label="Before this can go live">
            {shut.map((gate) => (
              <li key={gate.id}>
                <span className={shell.missingDot} aria-hidden />
                <a href={`#gate-${gate.id}`}>{gate.label}</a>
                <span>— {plural(gate.blockers.length, "thing", "things")} to fix above</span>
              </li>
            ))}
          </ul>
        )}

        {/* Why it will not send, in the card rather than in a tooltip. A dimmed
            control with no sentence beside it is a screen asking to be guessed
            at. */}
        {!open && (
          <p className={live.whyNot}>
            {permission.kind === "unknown"
              ? "The checks have not run, so this screen does not know whether this workforce may go live. It is not saying that it may not — it is saying nobody has been told."
              : permission.kind === "blocked"
                ? `${permission.blockers === 1 ? "One thing is" : `${permission.blockers} things are`} standing between this plan and going live. Each one is listed above, with a link to where it is fixed. There is no way to override this.`
                : permission.kind === "empty"
                  ? "The list came back with no checks in it at all. An empty list counts as “everything passed” without anything having been checked, so this button stays shut whatever it claims."
                  : "Going live is already under way. Nothing is sent twice from here."}
          </p>
        )}

        {open && actor === "" && (
          <p className={live.whyNot}>
            Every check has passed. Fill in who is authorising this and the button will send.
          </p>
        )}

        {refused !== null && (
          <p className={live.whyNot} role="alert">
            {refused}
          </p>
        )}
      </div>

      <div className={shell.activateSide}>
        <label className={live.actorField}>
          <span className="oa-label">Who is authorising this go-live</span>
          <input
            className="oa-input"
            type="text"
            value={activatedBy}
            spellCheck={false}
            autoComplete="off"
            placeholder="your name"
            onChange={(event) => setActivatedBy(event.target.value)}
            aria-describedby="oa-deploy-actor-note"
          />
        </label>
        <button
          type="button"
          className={`oa-btn oa-btn--primary oa-btn--lg ${sends ? "" : live.refuses}`}
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
    </section>
  );
}
