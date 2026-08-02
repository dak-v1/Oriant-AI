"use client";
/**
 * components/live/pipeline/DraftOnlyNotice.tsx — the one thing nobody watching
 * this screen may leave without.
 *
 * EVERY AGENT THAT COMES THROUGH THIS PIPELINE PREPARES WORK AND STOPS. Role B's
 * handoff carries no approval boundaries — their own note says the discovery
 * interview captures them and nothing wires them into the payload — so
 * `lib/plan/ingest/from-handoff.ts` assigns `draft_only` to every agent and
 * records the assumption. That is the safe direction under ignorance: being
 * wrong costs a delay rather than a customer.
 *
 * WHY IT IS THE LOUDEST THING ON THE PAGE. A completed pass reads like a
 * success: six green stages, a deployment id, triggers registered, agents live.
 * Every one of those is true, and together they invite exactly one wrong
 * conclusion — that the workforce is now acting on its own. It is not. It drafts
 * and waits. Somebody demoing this to a room must not have to scroll to find
 * that out, so it sits above the pass rather than under it, and it is never
 * behind a disclosure.
 *
 * IT IS EVIDENCED, NOT ASSERTED. Once a pass has produced a plan, this component
 * stops claiming draft_only and starts SHOWING it: every agent, with the mode
 * the runtime actually recorded for it. If one is not `draft_only` the notice
 * changes character entirely and says so in red — because at that point the
 * reassurance above it would be false, and a false reassurance on this
 * particular subject is worse than no notice at all. That case should be
 * impossible today; a component that renders it is how anyone would find out it
 * had stopped being impossible.
 *
 * THE HEADLINE IS A POLICY, THE LIST IS A REPORT, AND `known` KEEPS THEM APART.
 * "Every agent from this pipeline prepares work and stops" is what the ingest
 * does to anything it takes in, so it is true on an empty screen and is shown in
 * every state. "No pass has produced a plan yet" is a different kind of sentence
 * — a claim about this server, right now — and it used to be printed off the
 * back of an empty agent list, which is also what a runtime that never answered
 * looks like. So a null `plan` no longer speaks for itself: with `known` false
 * the empty branch says the plan is unread rather than absent, and the headline
 * carries on saying the only thing it was ever entitled to say. `running` is the
 * same distinction one step along: "no plan yet" was a report when it was made
 * and is being overtaken while it is read, so it goes into the past tense for as
 * long as a pass is on the wire.
 */

import { Hand, HelpCircle, ShieldAlert } from "lucide-react";
import type { PlanView } from "./api";
import { plural } from "./format";
import styles from "./pipeline.module.css";

const DRAFT_ONLY = "draft_only";

/**
 * A mode as an owner would say it, or the raw value when this build has never
 * heard of it.
 *
 * Deliberately NOT total and deliberately not a refusal. The two modes that
 * exist today get a sentence; anything else is shown exactly as it arrived,
 * because an unfamiliar mode is precisely the case where inventing a friendly
 * phrase would describe something nobody here understands — and the row it sits
 * on is already flagged "can act". See the module header.
 */
function modeLabel(mode: string): string {
  switch (mode) {
    case DRAFT_ONLY:
      return "waits for your approval";
    case "auto_within_limits":
      return "works within the limits you set";
    default:
      return mode;
  }
}

export default function DraftOnlyNotice({
  plan,
  /** False while the runtime has not answered — see the header. */
  known,
  /**
   * True while a pass is in flight, and it reaches exactly one branch: the one
   * that says no pass has produced a plan. That is a claim about the ABSENCE of
   * a plan, and the pass now running may have ingested one several stages ago.
   * The list itself needs nothing here — it is the previous pass's plan, kept
   * and labelled as such by the banner above it.
   */
  running,
}: {
  plan: PlanView | null;
  known: boolean;
  running: boolean;
}) {
  const agents = plan?.agents ?? [];
  const other = agents.filter((agent) => agent.operatingMode !== DRAFT_ONLY);
  const unexpected = other.length > 0;

  return (
    <section
      className={styles.draftNotice}
      /* A NAMED LANDMARK IN THE ORDINARY CASE, AN ALERT ONLY IN THE BAD ONE.
         `role="alert"` is an assertive live region: it interrupts. The standing
         statement — every agent is draft_only — is present from the first paint
         and does not change, so making it assertive would have a screen reader
         recite the whole paragraph again every time a pass lands, which is the
         mistake `components/live/workspace/ui.tsx` warns about. It is a heading
         and a landmark instead, which is how it is found. An agent that CAN act
         is the opposite case: it appears as a result of something that just
         happened, it contradicts what the page said a moment ago, and it must
         interrupt. */
      role={unexpected ? "alert" : undefined}
      aria-labelledby="oa-pipe-draft-title"
    >
      <span className={styles.draftIcon} aria-hidden>
        {unexpected ? <ShieldAlert size={20} /> : <Hand size={20} />}
      </span>
      <div className={styles.draftText}>
        <h2 className={styles.draftTitle} id="oa-pipe-draft-title">
          {unexpected
            ? `Not every agent waits for you — ${plural(other.length, "agent", "agents")} can act on its own`
            : "Every agent here prepares work and waits for you"}
        </h2>

        {unexpected ? (
          <p className={styles.draftBody}>
            Every agent is supposed to wait for your approval, because your plan carries no
            approval limits and waiting is the only safe assumption when nobody has said
            otherwise. The run below did not do that. Until it is explained, treat this
            workforce as able to act unattended, and do not present it as one that always
            asks.
          </p>
        ) : (
          <p className={styles.draftBody}>
            Nothing here acts on its own. Your plan carries no approval limits at all — no
            operating mode, no spending limits, no owner — so every agent is set to wait for
            your approval, and that assumption is recorded in the list below. Such an agent
            drafts the work and asks; a person decides. It is allowed to make changes so
            that it is useful, and it pauses before every one of them.
          </p>
        )}

        {agents.length > 0 && (
          <ul className={styles.modeList}>
            {agents.map((agent) => {
              const isDraft = agent.operatingMode === DRAFT_ONLY;
              return (
                <li
                  key={agent.id}
                  className={`${styles.modeChip} ${isDraft ? "" : styles.modeChipOther}`}
                >
                  <span className={styles.modeName}>{agent.name}</span>
                  {/* The comparison is still by value against the raw mode — a
                      mode this build has never heard of must read as NOT
                      waiting for approval — and `modeLabel` only changes how the
                      answer is worded, never what counts as one. */}
                  <span className={styles.modeValue}>{modeLabel(agent.operatingMode)}</span>
                  {!isDraft && <span>can act on its own</span>}
                </li>
              );
            })}
          </ul>
        )}

        {agents.length === 0 && known && !running && (
          <p className={styles.draftBody}>
            No run has produced a plan yet, so there are no agents to list. The sentence
            above is what will happen, not a report of what did.
          </p>
        )}

        {agents.length === 0 && known && running && (
          <p className={styles.draftBody}>
            No run had produced a plan here when this screen last asked, and the one under
            way has not answered, so there is nothing to list yet. The sentence above is
            what is being done to the agents being read right now, and it is the reason this
            list will be safe to read when it arrives.
          </p>
        )}

        {agents.length === 0 && !known && (
          <p className={`${styles.draftBody} ${styles.draftUnknown}`}>
            <HelpCircle size={14} aria-hidden />
            <span>
              Whether a run has produced a plan here is not known — nothing has answered, so
              there is no list to show and no basis for saying there is nothing to list. The
              sentence above is what happens to every agent that comes in, and it holds
              whether or not anything has ever been run here.
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
