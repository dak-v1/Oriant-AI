"use client";
/**
 * components/live/deploy/GateList.tsx — the three go-live gates, exactly as the
 * runtime reports them.
 *
 * EVERY SENTENCE HERE THAT MATTERS IS THE RUNTIME'S. A gate's `label` and
 * `detail` and every blocker's `message` are rendered verbatim, and the blockers
 * are linked with the `href` the runtime attached rather than with a route table
 * kept here. lib/runtime/schedule/activation.ts writes those sentences with care
 * — "the integrations registry lists it as optional, but the approved plan marks
 * it required", "a sweep that was skipped is missing evidence, not a pass" — and
 * each one is the difference between an owner knowing what to do and knowing only
 * that something is wrong. This file adds framing and takes nothing away.
 *
 * A SHUT GATE IS NOT AN ERROR AND IS NOT STYLED AS ONE. It is the checklist
 * working: the plan is not live-able yet and the gate says what would change
 * that. Amber, with the word "Blocked" beside the badge, never red and never the
 * vocabulary of a crash.
 *
 * EVERY GATE THE RUNTIME SENDS IS RENDERED, INCLUDING ONE THIS BUILD HAS NEVER
 * HEARD OF. `gateMeta` returns null for an unrecognised id and the row simply
 * loses its one line of framing. A checklist screen that dropped a gate it did
 * not recognise would be the single worst bug available here — the owner would
 * read three green rows and press a button that a fourth, invisible gate was
 * refusing.
 *
 * NO BLOCKER IS EVER COLLAPSED, TRUNCATED OR PUT BEHIND A DISCLOSURE. There is no
 * "and 3 more". Each one is a separate thing somebody has to go and fix.
 */

import Link from "next/link";
import { ArrowRight, CircleCheck, CircleSlash } from "lucide-react";
import type { ChecklistView } from "./api";
import { gateMeta } from "./format";
import styles from "./deploy.module.css";

export default function GateList({
  checklist,
  superseded,
}: {
  checklist: ChecklistView;
  /**
   * A newer request is in flight and this is the PREVIOUS answer. Dimmed and
   * labelled by the caller rather than blanked — an empty checklist mid-request
   * reads as "no gate is shut", which is the reassuring version of a state
   * nobody has confirmed.
   */
  superseded: boolean;
}) {
  return (
    <ul className={`${styles.gateList} ${superseded ? styles.superseded : ""}`}>
      {checklist.gates.map((gate) => {
        const meta = gateMeta(gate.id);
        return (
          <li
            key={gate.id}
            className={`${styles.gate} ${gate.satisfied ? styles.gateOpen : styles.gateShut}`}
          >
            <div className={styles.gateHead}>
              {gate.satisfied ? (
                <CircleCheck size={17} aria-hidden />
              ) : (
                <CircleSlash size={17} aria-hidden />
              )}
              <h3 className={styles.gateTitle}>{gate.label}</h3>
              {/* The word, not the colour. See deploy.module.css. */}
              <span
                className={`oa-status oa-status--${gate.satisfied ? "completed" : "pending"}`}
              >
                {gate.satisfied ? "Satisfied" : "Blocked"}
              </span>
            </div>

            {/* The runtime's one-line status, whether or not the gate is open —
                "12 of 12 agents built and current", "0 of 24 scenarios passed". */}
            <p className={styles.gateDetail}>{gate.detail}</p>

            {meta !== null && (
              <p className={styles.gateWhat}>
                {gate.satisfied ? meta.what : meta.whenShut}
              </p>
            )}

            {gate.blockers.length > 0 && (
              <ul className={styles.blockerList}>
                {gate.blockers.map((blocker, index) => (
                  <li key={`${gate.id}-${index}`} className={styles.blocker}>
                    {/* Verbatim. This is the whole point of the component. */}
                    <span>{blocker.message}</span>
                    <span className={styles.blockerMeta}>
                      {blocker.agentId !== null && (
                        <span className={styles.blockerTag}>agent {blocker.agentId}</span>
                      )}
                      {blocker.integrationId !== null && (
                        <span className={styles.blockerTag}>
                          integration {blocker.integrationId}
                        </span>
                      )}
                      {/* The runtime's own route to the fix, not ours. */}
                      <Link href={blocker.href} className="oa-btn oa-btn--ghost oa-btn--sm">
                        Open {blocker.href}
                        <ArrowRight size={13} aria-hidden />
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}

      {/* A checklist with no gates at all is not a checklist that passed. The
          runtime derives `ready` from `gates.every(...)`, and `[].every(...)` is
          true, so an empty list would arrive as `ready: true` with nothing
          behind it. Said out loud rather than rendered as a clean, empty
          section. */}
      {checklist.gates.length === 0 && (
        <li className={`${styles.gate} ${styles.gateShut}`}>
          <div className={styles.gateHead}>
            <CircleSlash size={17} aria-hidden />
            <h3 className={styles.gateTitle}>The runtime reported no gates</h3>
            <span className="oa-status oa-status--pending">Unproven</span>
          </div>
          <p className={styles.gateDetail}>
            This response carried an empty gate list. An empty list satisfies
            &ldquo;every gate passed&rdquo; without anything having been checked, so
            nothing on this screen will treat it as a workforce that is ready — whatever
            the checklist&apos;s own <code>ready</code> flag says.
          </p>
        </li>
      )}
    </ul>
  );
}
