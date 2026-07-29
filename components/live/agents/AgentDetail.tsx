"use client";
/**
 * components/live/agents/AgentDetail.tsx — the drill-in: every workflow this
 * agent owns, what it has actually done, and the configuration it is running
 * under (ROLE_C_PLAN M6).
 *
 * IT IS A DISCLOSURE INSIDE THE CARD, NOT A DRAWER. A drawer needs a focus trap,
 * an escape key, a scroll lock and a way back — machinery the Approvals inbox
 * genuinely needs, because deciding an approval is a task you enter. Reading an
 * agent's configuration is not a task; it is a longer look at the row you are
 * already on. A `<button aria-expanded aria-controls>` over a region is
 * keyboard-operable, announces its own state, survives a page find, and cannot
 * strand anyone behind a modal.
 *
 * The disclosure's plumbing — the permanent `aria-controls` target, and why focus
 * stays on the toggle — lives in AgentCard.tsx, which owns both halves of it.
 * This file is the contents and nothing else; it holds no id and no open state,
 * so there is exactly one place either can be got wrong.
 *
 * THE CONFIGURATION IS D'S AND IS SHOWN READ-ONLY. There is no control anywhere
 * in this file, and that is a contract position rather than a scope cut: a limit
 * is what the runtime enforces outside the model (PLAN_CONTRACT §1), and a limit
 * an operator can nudge from a roster is a limit that no longer means what the
 * approved plan says it means. Changing one is a plan edit — approval, version
 * bump, re-activation through the gates. What this screen owes an owner is the
 * ability to READ what their agent may do without opening a JSON file.
 *
 * FORBIDDEN IS SHOWN IN TWO PARTS BECAUSE IT IS ENFORCED IN TWO PLACES. The
 * agent's own `forbidden` and the plan's `globalPolicy.forbidden` both refuse an
 * operation outright, and merging them into one list would lose the answer to
 * "who decided this?" — which is the first thing anyone asks when an agent
 * refuses to do something they expected it to do.
 *
 * NOTHING HERE INVENTS A FACT THE RUNTIME DOES NOT HOLD. A trigger with no
 * `nextFireAt` says what it is waiting for rather than guessing at a time; an
 * agent with no runs says so; and the run list says how much of the history it is
 * showing rather than implying it is all of it.
 */

import Link from "next/link";
import { AlertTriangle, History, ShieldCheck, Workflow as WorkflowIcon } from "lucide-react";
import type { Zone } from "@/components/live/workspace/read-model";
import { approvalsHref } from "@/components/live/workspace/read-model";
import type { AgentView, RunView, WorkflowView } from "./api";
import { RunStatusPill } from "./pills";
import { MODE_LABEL, WAITING_FOR, describeQuietHours, workflowNames } from "./read-model";
import styles from "./live-agents.module.css";

export default function AgentDetail({
  agent,
  globalForbidden,
  zone,
  live,
}: {
  agent: AgentView;
  /** The plan's org-wide denies — see the module header for why they are separate. */
  globalForbidden: string[];
  /** The agent's own timezone, so times read the way its schedule was written. */
  zone: Zone;
  /** Carried into every approvals deep link so it lands on the live inbox. */
  live: boolean;
}) {
  return (
    <div className={styles.detail}>
      <Workflows agent={agent} zone={zone} />
      <RunHistory agent={agent} zone={zone} live={live} names={workflowNames(agent)} />
      <Configuration agent={agent} globalForbidden={globalForbidden} />
    </div>
  );
}

/* ═══════════════════════════ Workflows ═══════════════════════════ */

function Workflows({ agent, zone }: { agent: AgentView; zone: Zone }) {
  return (
    <section className={styles.section} aria-label={`${agent.name} workflows`}>
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>
          <WorkflowIcon size={13} aria-hidden /> Workflows
        </h3>
        <span className={styles.emptyNote}>
          Times shown in {zone.id}
          {zone.ok ? "" : ` (the plan asked for "${zone.requested}", which this browser does not know)`}
        </span>
      </div>

      {agent.workflows.length === 0 ? (
        <p className={styles.emptyNote}>
          This agent has no workflows in the approved plan, so there is nothing for a
          trigger to start.
        </p>
      ) : (
        <div className={styles.list}>
          {agent.workflows.map((workflow) => (
            <WorkflowRow key={workflow.workflowId} workflow={workflow} zone={zone} />
          ))}
        </div>
      )}
    </section>
  );
}

function WorkflowRow({ workflow, zone }: { workflow: WorkflowView; zone: Zone }) {
  const trigger = workflow.trigger;

  /* Four distinguishable situations, and each asks something different of the
     owner. "Turned off in the plan" is a decision somebody made; "no trigger
     registered" is a workflow the plan says should run that nothing will ever
     start — the single worst state on this screen, and the one that has to
     shout. */
  const state = !workflow.enabled
    ? { label: "Off in the plan", cls: "neutral" as const }
    : trigger === null
      ? { label: "No trigger", cls: "failed" as const }
      : trigger.enabled
        ? { label: "Live", cls: "active" as const }
        : { label: "Stood down", cls: "pending" as const };

  const next =
    trigger !== null && trigger.enabled && trigger.nextFireAt !== null
      ? zone.stamp(trigger.nextFireAt)
      : null;

  return (
    <div className={`${styles.row} ${workflow.enabled ? "" : styles.rowOff}`}>
      <div className={styles.rowMain}>
        <span className={styles.rowTitle}>{workflow.name}</span>
        <span className={styles.rowSub}>{workflow.description}</span>
        <span className={styles.rowSub}>
          {workflow.label} · <span className={styles.mono}>{workflow.kind}</span>
        </span>
        {workflow.enabled && trigger === null && (
          <span className={styles.rowSub}>
            The plan enables this workflow but no trigger is registered for it, so nothing
            will ever start it. Re-activating the plan is what registers one.
          </span>
        )}
        {trigger !== null && trigger.enabled && next === null && (
          <span className={styles.rowSub}>{WAITING_FOR[workflow.kind]}</span>
        )}
      </div>

      <div className={styles.rowSide}>
        {next !== null && (
          <span className={styles.rowSub}>
            Next: <strong>{next}</strong>
          </span>
        )}
        {trigger !== null && trigger.lastFiredAt !== null && (
          <span className={styles.rowSub}>Last fired {zone.stamp(trigger.lastFiredAt) ?? "—"}</span>
        )}
        <span className={`oa-status oa-status--${state.cls}`}>{state.label}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════ Run history ═══════════════════════════ */

function RunHistory({
  agent,
  zone,
  live,
  names,
}: {
  agent: AgentView;
  zone: Zone;
  live: boolean;
  names: Map<string, string>;
}) {
  const hidden = agent.runsTotal - agent.runs.length;

  return (
    <section className={styles.section} aria-label={`${agent.name} run history`}>
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>
          <History size={13} aria-hidden /> Recent runs
        </h3>
        <span className={styles.emptyNote}>
          {agent.runsTotal === 0
            ? "None yet"
            : hidden > 0
              ? `Showing ${agent.runs.length} of ${agent.runsTotal}`
              : `${agent.runsTotal} in total`}
        </span>
      </div>

      {agent.runs.length === 0 ? (
        <p className={styles.emptyNote}>
          This agent has never started a run. A run appears when one of its triggers fires
          and the scheduler is turned — either by the poller or by a scheduler pass.
        </p>
      ) : (
        <div className={styles.list}>
          {agent.runs.map((run) => (
            <RunRow
              key={run.runId}
              run={run}
              zone={zone}
              live={live}
              workflowName={names.get(run.workflowId) ?? run.workflowId}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RunRow({
  run,
  zone,
  live,
  workflowName,
}: {
  run: RunView;
  zone: Zone;
  live: boolean;
  workflowName: string;
}) {
  const started = zone.stamp(run.startedAt);
  const ended = run.endedAt === null ? null : zone.stamp(run.endedAt);

  return (
    <div className={styles.row}>
      <div className={styles.rowMain}>
        <span className={styles.rowTitle}>{workflowName}</span>
        {/* The runtime's own sentence for what it is waiting on, or what ended
            it. Rendered verbatim rather than recomposed here. */}
        <span className={styles.rowSub}>{run.detail}</span>
        <span className={styles.rowSub}>
          Started {started ?? "at an instant this browser cannot read"}
          {ended === null ? " · not finished" : ` · ended ${ended}`} ·{" "}
          <span className={styles.mono}>{run.runId}</span>
        </span>
      </div>

      <div className={styles.rowSide}>
        {run.pendingApprovalId !== null && (
          <Link
            href={approvalsHref(run.pendingApprovalId, live)}
            className="oa-btn oa-btn--soft oa-btn--sm"
          >
            Review approval
          </Link>
        )}
        <RunStatusPill status={run.status} />
      </div>
    </div>
  );
}

/* ═══════════════════════════ Configuration ═══════════════════════════ */

function Configuration({
  agent,
  globalForbidden,
}: {
  agent: AgentView;
  globalForbidden: string[];
}) {
  const config = agent.config;
  const quiet = describeQuietHours(config.quietHours);

  return (
    <section className={styles.section} aria-label={`${agent.name} configuration`}>
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>
          <ShieldCheck size={13} aria-hidden /> Configuration
        </h3>
        <span className={styles.emptyNote}>
          From the approved plan · read-only here
        </span>
      </div>

      <dl className={styles.configGrid}>
        <ConfigItem term="Operating mode" value={MODE_LABEL[config.operatingMode]} />
        <ConfigItem term="Approvals go to" value={config.approvalOwner} />
        <ConfigItem
          term="Escalates after"
          value={`${config.escalateAfterMins} minutes`}
        />
        <ConfigItem
          term="Quiet hours"
          value={quiet}
          absent="None declared for this agent"
        />
        <ConfigItem
          term="Runs per day"
          value={config.maxRunsPerDay === null ? null : `Capped at ${config.maxRunsPerDay}`}
          absent="Uncapped"
        />
      </dl>

      {quiet !== null && (
        <p className={styles.emptyNote}>
          Quiet hours are enforced as the union of this window and the plan&apos;s org-wide
          one — it is quiet if either says quiet, so a narrower agent window does not buy
          an exemption from the org-wide floor.
        </p>
      )}

      {/* ── Limits ── */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Policy limits</h4>
        {config.limits.length === 0 ? (
          <p className={styles.emptyNote}>
            {config.operatingMode === "auto_within_limits"
              ? "This agent acts automatically and declares no limits, which the plan validator " +
                "treats as an error — an automatic agent with no limits has nothing to escalate on."
              : "No limits declared. Limits gate automatic action, and this agent does not act " +
                "automatically."}
          </p>
        ) : (
          <div className={styles.list}>
            {config.limits.map((limit) => (
              <div key={limit.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>
                    <span className={styles.mono}>{limit.metric}</span> {limit.op}{" "}
                    {limit.value}
                    {limit.unit === null ? "" : ` ${limit.unit}`}
                  </span>
                  <span className={styles.rowSub}>
                    {limit.onBreach === "block"
                      ? "Over this, the operation is refused outright."
                      : "Over this, the run pauses and waits for a decision."}
                  </span>
                </div>
                <div className={styles.rowSide}>
                  <span
                    className={`${styles.chip} ${
                      limit.onBreach === "block" ? styles.chipDeny : styles.chipGate
                    }`}
                  >
                    {limit.onBreach === "block" ? "Blocks" : "Needs approval"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Always-approve, and the agent's own denies ── */}
      <dl className={styles.configGrid}>
        <OperationList
          term="Always needs approval"
          operations={config.alwaysApprove}
          absent="Nothing is forced to an approval beyond what the operating mode and the limits already require."
        />
        <OperationList
          term="Forbidden for this agent"
          operations={config.forbidden}
          absent="Nothing denied at the agent level."
          deny
        />
        <OperationList
          term="Forbidden org-wide"
          operations={globalForbidden}
          absent="The plan denies nothing organisation-wide."
          deny
        />
      </dl>

      {/* ── Tool grants ── */}
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <h4 className={styles.sectionTitle}>What it may call</h4>
          <Link href="/app/workspace/integrations" className={styles.inlineLink}>
            Connections
          </Link>
        </div>
        {config.tools.length === 0 ? (
          <p className={styles.emptyNote}>
            This agent is granted no tools, so every <code>fetch</code> and <code>act</code>{" "}
            step it has would be refused at run time.
          </p>
        ) : (
          <div className={styles.list}>
            {config.tools.map((grant) => (
              <div key={grant.integrationId} className={styles.toolCard}>
                <div className={styles.toolHead}>
                  <span className={styles.toolName}>{grant.integrationId}</span>
                  <span
                    className={`oa-status oa-status--${grant.required ? "required" : "optional"}`}
                  >
                    {grant.required ? "Required" : "Optional"}
                  </span>
                </div>
                <p className={styles.rowSub}>{grant.purpose}</p>
                <div className={styles.chipList}>
                  {grant.operations.map((operation) => (
                    <span key={operation} className={`${styles.chip} ${styles.mono}`}>
                      {operation}
                    </span>
                  ))}
                </div>
                <p className={styles.emptyNote}>
                  {grant.required
                    ? "A missing connection here blocks activation."
                    : "The agent degrades gracefully without this connection."}{" "}
                  Anything not listed is refused at run time, even if the model asks for it.
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className={styles.emptyNote}>
        <AlertTriangle size={12} aria-hidden /> None of this can be edited here. Mode,
        limits and grants are part of the approved plan; changing one is a plan edit that
        goes back through approval and re-activation, so that the packages and sandbox
        gates see it.
      </p>
    </section>
  );
}

function ConfigItem({
  term,
  value,
  absent,
}: {
  term: string;
  /** Null renders `absent` in the "not a value" style. */
  value: string | null;
  absent?: string;
}) {
  return (
    <div className={styles.configItem}>
      <dt className={styles.configTerm}>{term}</dt>
      {value === null ? (
        <dd className={styles.unknown}>{absent ?? "Not set"}</dd>
      ) : (
        <dd className={styles.configValue}>{value}</dd>
      )}
    </div>
  );
}

function OperationList({
  term,
  operations,
  absent,
  deny,
}: {
  term: string;
  operations: string[];
  absent: string;
  deny?: boolean;
}) {
  return (
    <div className={styles.configItem}>
      <dt className={styles.configTerm}>{term}</dt>
      <dd>
        {operations.length === 0 ? (
          <span className={styles.emptyNote}>{absent}</span>
        ) : (
          <span className={styles.chipList}>
            {operations.map((operation) => (
              <span
                key={operation}
                className={`${styles.chip} ${styles.mono} ${deny ? styles.chipDeny : ""}`}
              >
                {operation}
              </span>
            ))}
          </span>
        )}
      </dd>
    </div>
  );
}
