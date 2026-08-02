"use client";
/**
 * PlanInspector — the context-sensitive right rail: selected agent detail,
 * or the default plan summary. Rendered as a column ≥1024px and inside a
 * Drawer below that (the parent decides).
 *
 * Step 9 Pass 1: rewritten off real agent_configs fields (name, description,
 * requiredTools, status) instead of the AGENT_LIBRARY fixture — real agents
 * have no workflows/handoff data, so the workflow-toggle list and connection
 * ("EdgeDetail") views from the old canvas-based inspector are dropped; a
 * plan selection can now only be "agent" or absent.
 */
import Link from "next/link";
import { Plug, Settings2 } from "lucide-react";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { money } from "@/lib/mock/pricing";
import { useDemoStore } from "@/lib/mock/store";
import type { PlannerSelection } from "./planner-utils";
import styles from "./planner.module.css";

/* ── Selected agent ── */

function AgentDetail({
  agentId,
  approved,
  costByAgentKey,
}: {
  agentId: string;
  approved: boolean;
  costByAgentKey: Map<string, number>;
}) {
  const plan = useDemoStore((s) => s.plan);
  const agent = plan.agents.find((a) => a.agentId === agentId);
  if (!agent) return null;

  const monthlyCost = agent.configId ? costByAgentKey.get(agent.configId) : undefined;

  return (
    <>
      <div className={styles.insHead}>
        <div className="oa-cluster" style={{ gap: 8 }}>
          <StatusBadge status={agent.status} />
        </div>
        <h3 className="oa-h3">{agent.name ?? agent.agentId}</h3>
        {agent.description && <p className="oa-sub">{agent.description}</p>}
      </div>

      <div className={styles.insSection}>
        <p className="oa-micro">Required tools</p>
        {agent.requiredTools && agent.requiredTools.length > 0 ? (
          <ul className={styles.insList}>
            {agent.requiredTools.map((tool) => (
              <li key={tool} className={styles.insItem}>
                <Plug size={13} aria-hidden />
                {tool}
              </li>
            ))}
          </ul>
        ) : (
          <p className="oa-sub">This agent doesn&apos;t need any connected tools.</p>
        )}
      </div>

      <div className={styles.insSection}>
        <p className="oa-micro">Estimated cost</p>
        <div className={styles.insRows}>
          <p className={styles.insRow}>
            <span className={styles.insRowLabel}>Monthly (LLM usage)</span>
            <span className={styles.insRowValue}>
              {monthlyCost !== undefined ? `${money(monthlyCost)}/mo` : "—"}
            </span>
          </p>
        </div>
      </div>

      {agent.status === "needs_information" && (
        <div className={`${styles.insPanel} ${styles.insPanelAmber}`}>
          <p className={styles.insPanelTitle}>Design call needed</p>
          <p className={styles.insPanelBody}>
            This custom agent needs a design call before it can be configured — coming in a future
            update.
          </p>
        </div>
      )}

      <Link
        href={`/app/planner/agents/${agent.configId ?? agent.agentId}`}
        className="oa-btn oa-btn--dark"
        style={{ width: "100%" }}
      >
        <Settings2 size={14} aria-hidden />
        {approved ? "View configuration" : "Configure agent"}
      </Link>
    </>
  );
}

/* ── Default plan summary ── */

function PlanSummary({ costByAgentKey }: { costByAgentKey: Map<string, number> }) {
  const plan = useDemoStore((s) => s.plan);
  const readyCount = plan.agents.filter((a) => a.status === "ready_to_build").length;
  const totalMonthly = plan.agents.reduce(
    (sum, a) => sum + (a.configId ? costByAgentKey.get(a.configId) ?? 0 : 0),
    0,
  );

  return (
    <>
      <div className={styles.insHead}>
        <p className="oa-micro">Plan summary</p>
        <h3 className="oa-h3">Workforce plan v{plan.version}</h3>
        <p className="oa-sub">Select an agent card for its full detail.</p>
      </div>

      <div className={styles.insRows}>
        <p className={styles.insRow}>
          <span className={styles.insRowLabel}>Agents in plan</span>
          <span className={styles.insRowValue}>{plan.agents.length}</span>
        </p>
        <p className={styles.insRow}>
          <span className={styles.insRowLabel}>Configured / ready</span>
          <span className={styles.insRowValue}>
            {readyCount} of {plan.agents.length}
          </span>
        </p>
        <p className={styles.insRow}>
          <span className={styles.insRowLabel}>Status</span>
          <span className={styles.insRowValue}>
            <StatusBadge
              status={plan.status === "approved" ? "approved" : "review_requested"}
              label={plan.status === "approved" ? "Approved" : "In review"}
            />
          </span>
        </p>
      </div>

      <div className={styles.insPanel}>
        <p className={styles.insPanelTitle}>Estimated cost</p>
        <p className={styles.insPanelBody}>
          {money(totalMonthly)}/mo across all agents, based on real usage estimates from your
          company report.
        </p>
      </div>
    </>
  );
}

/* ── Shell ── */

export default function PlanInspector({
  selection,
  approved,
  costByAgentKey,
  bare,
}: {
  selection: PlannerSelection;
  approved: boolean;
  costByAgentKey: Map<string, number>;
  /** true inside the mobile Drawer (no card chrome). */
  bare?: boolean;
}) {
  const body =
    selection?.type === "agent" ? (
      <AgentDetail agentId={selection.agentId} approved={approved} costByAgentKey={costByAgentKey} />
    ) : (
      <PlanSummary costByAgentKey={costByAgentKey} />
    );

  if (bare) return <div className={styles.inspectorBare}>{body}</div>;
  return <div className={`oa-card oa-card--flat ${styles.inspector}`}>{body}</div>;
}
