"use client";
/**
 * components/live/workspace/OutcomeProgress.tsx — progress against
 * `BusinessOutcome.metrics`, rendered honestly (ROLE_C_PLAN M5,
 * PLAN_CONTRACT §3.2).
 *
 * THE CONTRACT ASKS FOR "BASELINE → CURRENT → TARGET" AND THE RUNTIME CAN
 * SUPPLY TWO OF THE THREE. That sentence is the whole design of this component,
 * so it is worth being exact about it. `OutcomeMetric` carries `target`,
 * `direction`, `unit`, and a `baseline` that may legitimately be null; nothing
 * anywhere in `lib/runtime` measures `invoice.days_to_payment` or
 * `enquiry.first_response_minutes`. There is no store for metric samples, no
 * collector, and §8 Q5 of the contract is still open on where baselines even
 * come from. So the current value is not "missing pending a small piece of
 * wiring" — it does not exist.
 *
 * Which leaves exactly one defensible rendering: show the target, show the
 * baseline where the plan has one, and render the current value AS UNMEASURED —
 * not as zero, not as the baseline, not as a plausible interpolation, and not as
 * a progress bar filled to some fraction that implies a position on the route.
 * The contract's own §1 makes the case better than this header can: structure
 * exists so a target can be *rendered* rather than described. The corollary is
 * that a measurement nobody has taken must render as untaken. A number invented
 * here would be the single fabricated fact on a screen where everything else is
 * evidenced, and it would be the one an owner acted on.
 *
 * THE RAIL IS HATCHED, NOT FILLED, for the same reason. A progress bar is a
 * claim about where you are; a hatched route with two labelled ends is a claim
 * about where you started and where you are going, which is all that is known.
 * It is `aria-hidden` because every fact it gestures at is already in the
 * definition list beside it — the visual is reinforcement, never the only copy.
 *
 * WHAT IS SHOWN INSTEAD OF A TREND is attribution, and it is not a consolation
 * prize. `BusinessOutcome.agentIds` is the only place the outcome→agent
 * relationship is stored (§3.2, §4.1), and the runtime genuinely knows, for each
 * of those agents, how many triggers are live, how many runs have happened, and
 * how many decisions are queued. "Two agents assigned, both live, six runs, one
 * waiting on you" is real, checkable, and is the honest answer to "is anything
 * happening about this goal yet".
 *
 * An outcome naming an agent the plan no longer contains is shown as a gap
 * rather than dropped. Validator rule 13 makes that an error at handoff, so
 * seeing one here means something got past the gate, and hiding it would hide
 * the evidence.
 */

import { Target } from "lucide-react";
import type { OutcomeMetric, PlanOutcomeFacts, WorkspacePlanFacts } from "./plan-facts";
import { attributions, directionLabel, readMetric } from "./read-model";
import type { Directory } from "./read-model";
import type { ApprovalsSnapshot, RunsSnapshot, SchedulerSnapshot } from "./runtime-api";
import { EmptyNote } from "./ui";
import styles from "./live-workspace.module.css";

const PRIORITY_TAG = {
  high: "oa-tag--amber",
  medium: "oa-tag--neutral",
  low: "oa-tag--neutral",
} satisfies Record<PlanOutcomeFacts["priority"], string>;

export default function OutcomeProgress({
  plan,
  scheduler,
  runs,
  approvals,
  directory,
}: {
  plan: WorkspacePlanFacts;
  scheduler: SchedulerSnapshot | null;
  runs: RunsSnapshot | null;
  approvals: ApprovalsSnapshot | null;
  directory: Directory;
}) {
  return (
    <section aria-labelledby="live-ws-outcomes" className={styles.outcomeSection}>
      <div className={styles.cardTitle}>
        <Target size={16} className={styles.cardIcon} aria-hidden />
        <h2 className="oa-h2" id="live-ws-outcomes">
          Outcome progress
        </h2>
      </div>
      <p className="oa-lead">
        What this workforce was approved to achieve. Targets and starting figures
        are what your plan states; where things stand now is not shown, because
        nothing here measures it yet.
      </p>

      {plan.outcomes.length === 0 ? (
        <EmptyNote>
          Your approved plan sets no business outcomes, so there is nothing to
          report against.
        </EmptyNote>
      ) : (
        <div className={styles.outcomeGrid}>
          {plan.outcomes.map((outcome) => (
            <OutcomeCard
              key={outcome.id}
              outcome={outcome}
              plan={plan}
              scheduler={scheduler}
              runs={runs}
              approvals={approvals}
              directory={directory}
            />
          ))}
        </div>
      )}

      <p className={styles.footNote}>
        Making these move needs something that measures them: a figure this app can
        read for itself, or the numbers from your approved report fed back in. Until
        one exists, this section reports the goal and the work put against it, and
        says plainly that the middle number is unknown.
      </p>
    </section>
  );
}

function OutcomeCard({
  outcome,
  plan,
  scheduler,
  runs,
  approvals,
  directory,
}: {
  outcome: PlanOutcomeFacts;
  plan: WorkspacePlanFacts;
  scheduler: SchedulerSnapshot | null;
  runs: RunsSnapshot | null;
  approvals: ApprovalsSnapshot | null;
  directory: Directory;
}) {
  const headingId = `live-ws-outcome-${outcome.id}`;
  const assigned = attributions({
    agentIds: outcome.agentIds,
    plan,
    scheduler,
    runs,
    approvals,
    directory,
  });

  return (
    <section
      aria-labelledby={headingId}
      className={`oa-card ${styles.outcomeCard}`}
    >
      <div className={styles.outcomeHead}>
        <div className={styles.outcomeTitleRow}>
          <h3 className="oa-h3" id={headingId}>
            {outcome.name}
          </h3>
          <span className={`oa-tag ${PRIORITY_TAG[outcome.priority]}`}>
            {outcome.priority} priority
          </span>
        </div>
        <p className="oa-sub">Owned by {outcome.owner}</p>
      </div>

      {outcome.metrics.length === 0 ? (
        <EmptyNote>This outcome has no metrics, so success is undefined for it.</EmptyNote>
      ) : (
        <div className={styles.metricList}>
          {outcome.metrics.map((metric) => (
            <Metric key={metric.id} metric={metric} />
          ))}
        </div>
      )}

      <div className={styles.attribution}>
        <p className={styles.factTerm}>Agents working towards this</p>
        {assigned.length === 0 ? (
          <p className={styles.attributionFacts}>
            No agent is assigned to this outcome, so nothing in the workforce is
            working towards it.
          </p>
        ) : (
          assigned.map((agent) => (
            <div key={agent.agentId} className={styles.attributionRow}>
              <span className={styles.attributionName}>{agent.name}</span>
              <span className={styles.attributionFacts}>
                {agent.inPlan ? describeWork(agent) : "no longer in your approved plan"}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/** Only facts the runtime actually holds. Missing sources say so. */
function describeWork(agent: {
  liveTriggers: number | null;
  runs: number | null;
  awaitingDecision: number;
}): string {
  const parts: string[] = [];

  if (agent.liveTriggers === null) parts.push("schedule unknown");
  else if (agent.liveTriggers === 0) parts.push("nothing scheduled");
  else parts.push(`${agent.liveTriggers} scheduled ${plural(agent.liveTriggers, "workflow")}`);

  if (agent.runs === null) parts.push("runs unknown");
  else parts.push(`${agent.runs} ${plural(agent.runs, "run")}`);

  if (agent.awaitingDecision > 0) {
    parts.push(`${agent.awaitingDecision} waiting on you`);
  }

  return parts.join(" · ");
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}

/**
 * One metric: what the plan asked for, and the explicit absence of a measurement.
 *
 * The definition list is the authoritative copy — "Now: not measured" is a real
 * `<dd>` that a screen reader reads in the same breath as the baseline and the
 * target, rather than a visual treatment a sighted reader has to infer.
 */
function Metric({ metric }: { metric: OutcomeMetric }) {
  const reading = readMetric(metric);

  return (
    <div className={styles.metric}>
      <div className={styles.metricHead}>
        <span className={styles.metricLabel}>{reading.label}</span>
        <span className={styles.metricDirection}>{directionLabel(reading.direction)}</span>
      </div>

      <dl className={styles.metricFacts}>
        <div className={styles.fact}>
          <dt className={styles.factTerm}>Where you started</dt>
          {reading.baseline === null ? (
            <dd className={styles.factUnknown}>Not in your plan</dd>
          ) : (
            <dd className={styles.factValue}>{reading.baseline}</dd>
          )}
        </div>
        <div className={styles.fact}>
          <dt className={styles.factTerm}>Now</dt>
          <dd className={styles.factUnknown}>Not measured</dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factTerm}>Target</dt>
          <dd className={`${styles.factValue} ${styles.factTarget}`}>{reading.target}</dd>
        </div>
      </dl>

      {/* Decorative: the definition list above already states every fact. A
          filled bar would assert a current position that nothing measured. */}
      <div className={styles.metricTrack} aria-hidden>
        <span className={styles.metricTrackNote}>No measurement recorded</span>
      </div>

      <p className={styles.metricNote}>
        {reading.unmeasured}
        {reading.gap !== null && ` ${reading.gap}`}
      </p>
    </div>
  );
}
