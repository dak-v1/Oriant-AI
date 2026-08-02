"use client";
/**
 * components/live/deploy/LifecycleList.tsx — what is running, what this button
 * would change, and what it would leave behind.
 *
 * THE CHECKLIST SAYS WHETHER THIS PLAN *CAN* GO LIVE; IT NEVER SAID WHAT IS LIVE
 * ALREADY. The activation route's own header calls the gap between those two
 * questions "the whole of the go-live decision", and this list is the second one.
 * `running`, `drifted`, `planned` and `retired` are the same four words
 * `/api/runtime/agents` tags its roster with — reconciled by one read of both
 * plans, so this screen and the roster cannot disagree about what is running.
 *
 * THE ROWS COME FROM THE RECONCILIATION AND NEVER FROM A PLAN. Both endpoints
 * also publish a per-agent list built from the CURRENT plan, and it is a shorter
 * list: `retired` agents — deployed once, since removed from the plan, still
 * running because triggers are frozen at go-live — are in the reconciliation and
 * in neither plan's agent list. Building this out of the roster's `agents` array
 * would have quietly dropped exactly the rows this activation abandons, which are
 * the ones nobody expects. Names are looked up from that array; the LIST is the
 * reconciliation.
 *
 * AN UNRECOGNISED TAG IS DISPLAYED, NOT DROPPED. `lifecycleMeta` returns null for
 * a word this build has never seen and the row loses its one line of framing —
 * but the tag itself and the runtime's own `note`, which carries the meaning, are
 * rendered exactly as they arrived. Dropping the row would hide an agent from the
 * only screen that says what a go-live does to it.
 *
 * NAMES WHEN THERE ARE NAMES, IDS WHEN THERE ARE NOT, AND NEVER A GUESS. When the
 * roster has not answered, the rows still render — from the checklist's own copy
 * of the reconciliation — keyed by agent id, with the reason the names are
 * missing said out loud. "brightpath-finance" and "Finance Follow-up Agent" being
 * the same agent is not something an owner should have to already know.
 */

import { HelpCircle } from "lucide-react";
import type { LifecycleRowView, LiveCountsView, RosterAgentView } from "./api";
import { lifecycleMeta } from "./format";
import styles from "./deploy.module.css";

/**
 * Where the rows came from. A closed union rather than a nullable list, so the
 * "nobody has told us" case has to be handled rather than rendered as a list that
 * happens to be empty — those two are the same pixels and opposite facts.
 */
export type LifecycleSource =
  | {
      kind: "rows";
      /** Every agent in either plan. The complete list — see the header. */
      rows: LifecycleRowView[];
      /** Names and runtime records, when the roster answered. Empty when not. */
      detail: ReadonlyMap<string, RosterAgentView>;
      /** Why the names are missing, when they are. Null when they are not. */
      unnamed: string | null;
    }
  | { kind: "unknown"; why: string };

export default function LifecycleList({
  source,
  counts,
}: {
  source: LifecycleSource;
  /** The runtime's own four totals. Null when no read carried them. */
  counts: LiveCountsView | null;
}) {
  if (source.kind === "unknown") {
    return (
      <div className={`${styles.stateBox} ${styles.stateUnknown}`}>
        <p className={styles.stateTitle}>
          <HelpCircle size={17} aria-hidden />
          What is running is not known
        </p>
        <p>{source.why}</p>
        <p>
          No rows are shown. An empty list here would read as &ldquo;nothing is
          deployed&rdquo;, and that is a claim about the workforce rather than a report
          of what this screen was told — which is nothing.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      {counts !== null && (
        <p className="oa-sub">
          {counts.running} running · {counts.drifted} drifted · {counts.planned} planned ·{" "}
          {counts.retired} retired. These are the runtime&apos;s own totals, reconciled
          from the deployed plan and the current one in a single read.
        </p>
      )}

      {source.unnamed !== null && (
        <p className="oa-sub">Shown by agent id rather than by name: {source.unnamed}</p>
      )}

      {source.rows.length === 0 ? (
        <div className={styles.stateBox}>
          <p className={styles.stateTitle}>No agent appears in either plan</p>
          <p>
            The runtime reconciled what is deployed against what is planned and found
            nothing in either. That is what an empty workforce looks like — and it is also
            what the packages gate refuses to activate.
          </p>
        </div>
      ) : (
        <ul className={styles.lifecycleList}>
          {source.rows.map((row) => {
            const meta = lifecycleMeta(row.lifecycle);
            const agent = source.detail.get(row.agentId) ?? null;
            return (
              <li key={row.agentId} className={styles.lifecycleRow}>
                <div className={styles.lifecycleHead}>
                  <span className={styles.lifecycleName}>{agent?.name ?? row.agentId}</span>
                  {/* The word itself, always — the tint is reinforcement. An
                      unrecognised tag is printed exactly as it arrived. */}
                  <span
                    className={`oa-status oa-status--${meta === null ? "neutral" : meta.cls}`}
                  >
                    {meta === null ? row.lifecycle : meta.label}
                  </span>
                  <span className={styles.lifecycleVersions}>
                    {row.runningVersion === null
                      ? "not deployed"
                      : `running v${row.runningVersion}`}
                    {" · "}
                    {row.plannedVersion === null
                      ? "not in the current plan"
                      : `planned v${row.plannedVersion}`}
                  </span>
                </div>

                {/* The runtime's line for this row, verbatim. It is what carries
                    the meaning of a tag this build does not know. */}
                <p className={styles.lifecycleNote}>{row.note}</p>

                {meta !== null && <p className={styles.lifecycleMeaning}>{meta.meaning}</p>}

                {agent !== null && agent.runtimeState !== null && (
                  <p className={styles.lifecycleMeaning}>
                    Runtime state <strong>{agent.runtimeState}</strong> · {agent.enabledTriggers}{" "}
                    of {agent.registeredTriggers} triggers enabled
                    {agent.runtimeDetail === null ? "" : ` — ${agent.runtimeDetail}`}
                  </p>
                )}

                {/* Distinct from every state in the union and rendered as such:
                    "never activated" and "paused" ask different things of an
                    owner. Only claimed when the roster answered for this agent —
                    a row with no lookup behind it has told us nothing about
                    whether a runtime record exists. */}
                {agent !== null && agent.runtimeState === null && (
                  <p className={styles.lifecycleMeaning}>
                    No runtime record — this agent has never been through activation.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
