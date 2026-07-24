"use client";
/**
 * PlanInspector — the context-sensitive right rail (spec §11.1, §11.6,
 * improvement spec §12.4): selected agent detail (including the workflow
 * enable toggles, moved here from the canvas cards), selected connection
 * (what passes here / if it fails), or the default plan summary. Rendered
 * as a column ≥1024px and inside a Drawer below that (the parent decides).
 */
import Link from "next/link";
import { ArrowDown, Check, Plug, Settings2, ShieldCheck, TriangleAlert } from "lucide-react";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { AGENT_LIBRARY, PLAN_OUTCOMES } from "@/lib/mock/fixtures/agent-library";
import { INTEGRATIONS } from "@/lib/mock/fixtures/integrations";
import { money, planTotals } from "@/lib/mock/pricing";
import { useDemoStore } from "@/lib/mock/store";
import { toast } from "@/components/mock/ui/Toaster";
import type { AgentWorkflowDef } from "@/lib/mock/types";
import { TriggerGlyph } from "./AgentPlanCard";
import { OPERATING_MODE_LABEL, workflowDefById, type PlannerSelection } from "./planner-utils";
import styles from "./planner.module.css";

/* ── Selected agent ── */

function AgentDetail({ agentId, approved }: { agentId: string; approved: boolean }) {
  const plan = useDemoStore((s) => s.plan);
  const def = AGENT_LIBRARY[agentId];
  const agent = plan.agents.find((a) => a.agentId === agentId);
  if (!def || !agent) return null;

  const approvals = Array.from(new Set([...def.humanApprovals, ...agent.config.approvalActions]));
  const workflows = agent.workflowOrder
    .map((id) => workflowDefById(def, id))
    .filter((w): w is AgentWorkflowDef => Boolean(w));

  const toggle = (wf: AgentWorkflowDef) => {
    const st = useDemoStore.getState();
    const current = st.plan.agents.find((a) => a.agentId === agent.agentId);
    const wasEnabled = current?.config.workflowsEnabled[wf.id] ?? true;
    st.toggleAgentWorkflow(agent.agentId, wf.id);
    toast({
      title: wasEnabled ? `Disabled ${wf.name}.` : `Enabled ${wf.name}.`,
      detail: wasEnabled ? "Kept in the plan. It will not run until re-enabled." : undefined,
      tone: "info",
      action: { label: "Undo", onClick: () => useDemoStore.getState().undoPlan() },
    });
  };

  return (
    <>
      <div className={styles.insHead}>
        <div className="oa-cluster" style={{ gap: 8 }}>
          <span className={def.source === "preset" ? "oa-tag oa-tag--neutral" : "oa-tag oa-tag--amber"}>
            {def.source === "preset" ? "Preset" : "Custom"}
          </span>
          <StatusBadge status={agent.status} />
        </div>
        <h3 className="oa-h3">{def.name}</h3>
        <p className="oa-sub">{def.role}</p>
      </div>

      <div className={styles.insPanel}>
        <p className={styles.insPanelTitle}>
          {def.source === "preset" ? "Why it is recommended" : "Why it is custom"}
        </p>
        <p className={styles.insPanelBody}>
          {def.source === "preset" ? def.fitReason : def.customProposal?.whyCustom ?? def.fitReason}
        </p>
      </div>

      <div className={styles.insSection}>
        <p className="oa-micro">Workflows</p>
        <div className={styles.wfList}>
          {workflows.map((wf) => {
            const enabled = agent.config.workflowsEnabled[wf.id] ?? true;
            return (
              <div key={wf.id} className={`${styles.wfRow} ${enabled ? "" : styles.wfRowOff}`}>
                <div className={styles.wfText}>
                  <p className={styles.wfName}>{wf.name}</p>
                  <p className={styles.wfTrigger}>
                    <TriggerGlyph kind={wf.trigger.kind} />
                    {wf.trigger.label}
                  </p>
                  {!enabled && <p className={styles.wfOffNote}>Disabled, kept in plan</p>}
                </div>
                {!approved ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`${wf.name} enabled`}
                    className="oa-switch"
                    onClick={() => toggle(wf)}
                  />
                ) : (
                  <span className={`oa-switch ${enabled ? "oa-switch--on" : ""}`} aria-hidden />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.insSection}>
        <p className="oa-micro">Covered outcomes</p>
        <ul className={styles.insList}>
          {def.coveredOutcomes.map((o) => (
            <li key={o} className={styles.insItem}>
              <Check size={13} aria-hidden />
              {o}
            </li>
          ))}
        </ul>
      </div>

      <div className={`${styles.insPanel} ${styles.insPanelTeal}`}>
        <p className={styles.insPanelTitle}>Autonomy</p>
        <p className={styles.insPanelBody}>{def.autonomyNote}</p>
      </div>

      <div className={styles.insSection}>
        <p className="oa-micro">Human approval required</p>
        <ul className={styles.insList}>
          {approvals.map((a) => (
            <li key={a} className={styles.insItem}>
              <ShieldCheck size={13} aria-hidden />
              {a}
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.insSection}>
        <p className="oa-micro">Integrations and why</p>
        <div>
          {def.integrations.map((req) => (
            <div key={req.integrationId} className={styles.insIntRow}>
              <p className={styles.insIntName}>
                <Plug size={12} aria-hidden />
                {INTEGRATIONS[req.integrationId]?.name ?? req.integrationId}
              </p>
              <p className={styles.insIntPurpose}>{req.purpose}</p>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.insSection}>
        <p className="oa-micro">Configuration summary</p>
        <div className={styles.insRows}>
          <p className={styles.insRow}>
            <span className={styles.insRowLabel}>Operating mode</span>
            <span className={styles.insRowValue}>
              {OPERATING_MODE_LABEL[agent.config.operatingMode] ?? agent.config.operatingMode}
            </span>
          </p>
          <p className={styles.insRow}>
            <span className={styles.insRowLabel}>Process owner</span>
            <span className={styles.insRowValue}>{agent.config.processOwner}</span>
          </p>
          <p className={styles.insRow}>
            <span className={styles.insRowLabel}>Approval owner</span>
            <span className={styles.insRowValue}>{agent.config.approvalOwner}</span>
          </p>
          <p className={styles.insRow}>
            <span className={styles.insRowLabel}>Quiet hours</span>
            <span className={styles.insRowValue}>{agent.config.quietHours}</span>
          </p>
          <p className={styles.insRow}>
            <span className={styles.insRowLabel}>Runs</span>
            <span className={styles.insRowValue}>{agent.config.runFrequency}</span>
          </p>
          <p className={styles.insRow}>
            <span className={styles.insRowLabel}>Price</span>
            <span className={styles.insRowValue}>
              {money(def.setupCost)} setup · {money(def.monthlyCost)}/mo
            </span>
          </p>
        </div>
      </div>

      {def.source === "custom" && !agent.designApproved && def.customProposal && (
        <div className={`${styles.insPanel} ${styles.insPanelAmber}`}>
          <p className={styles.insPanelTitle}>
            <TriangleAlert size={11} aria-hidden style={{ marginRight: 5, verticalAlign: "-1px" }} />
            Missing information
          </p>
          {def.customProposal.missingInformation.map((m) => (
            <p key={m} className={styles.insPanelBody}>
              {m}
            </p>
          ))}
        </div>
      )}

      <Link
        href={`/app/planner/agents/${def.id}`}
        className="oa-btn oa-btn--dark"
        style={{ width: "100%" }}
      >
        <Settings2 size={14} aria-hidden />
        {approved
          ? "View configuration"
          : def.source === "custom" && !agent.designApproved
            ? "Start design call"
            : "Configure agent"}
      </Link>
    </>
  );
}

/* ── Selected connection ── */

function EdgeDetail({ fromId, toId }: { fromId: string; toId: string }) {
  const plan = useDemoStore((s) => s.plan);
  const fromDef = AGENT_LIBRARY[fromId];
  const toDef = AGENT_LIBRARY[toId];
  const fromAgent = plan.agents.find((a) => a.agentId === fromId);
  if (!fromDef || !toDef || !fromAgent) return null;

  const enabledWorkflows = fromAgent.workflowOrder
    .filter((id) => fromAgent.config.workflowsEnabled[id] ?? true)
    .map((id) => workflowDefById(fromDef, id))
    .filter((w): w is AgentWorkflowDef => Boolean(w));

  return (
    <>
      <div className={styles.insHead}>
        <p className="oa-micro">Connection</p>
        <div className={styles.edgeTitle}>
          <p className={styles.edgeAgent}>{fromDef.name}</p>
          <ArrowDown size={14} className={styles.edgeArrow} aria-hidden />
          <p className={styles.edgeAgent}>{toDef.name}</p>
        </div>
      </div>

      <div className={styles.insSection}>
        <p className="oa-micro">What passes here</p>
        {enabledWorkflows.length === 0 && (
          <p className="oa-sub">
            All upstream workflows are disabled, so nothing passes on this connection right now.
          </p>
        )}
        {enabledWorkflows.map((wf) => (
          <div key={wf.id} className={`${styles.insPanel} ${styles.insPanelBlue}`}>
            <p className={styles.insPanelTitle}>{wf.name}</p>
            <p className={styles.insPanelBody}>{wf.handoff}</p>
          </div>
        ))}
      </div>

      {enabledWorkflows.length > 0 && (
        <div className={styles.insSection}>
          <p className="oa-micro">If it fails</p>
          {enabledWorkflows.map((wf) => (
            <div key={wf.id} className={`${styles.insPanel} ${styles.insPanelAmber}`}>
              <p className={styles.insPanelTitle}>{wf.name}</p>
              <p className={styles.insPanelBody}>{wf.onFailure}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ── Default plan summary ── */

function PlanSummary() {
  const plan = useDemoStore((s) => s.plan);
  const totals = planTotals(plan.agents);
  const wfTotal = plan.agents.reduce((n, a) => n + a.workflowOrder.length, 0);
  const wfEnabled = plan.agents.reduce(
    (n, a) => n + a.workflowOrder.filter((id) => a.config.workflowsEnabled[id] ?? true).length,
    0,
  );

  return (
    <>
      <div className={styles.insHead}>
        <p className="oa-micro">Plan summary</p>
        <h3 className="oa-h3">Workforce plan v{plan.version}</h3>
        <p className="oa-sub">
          Select an agent card for its full detail, or a handoff connector to see what data passes
          between agents.
        </p>
      </div>

      <div className={styles.insRows}>
        <p className={styles.insRow}>
          <span className={styles.insRowLabel}>Agents in plan</span>
          <span className={styles.insRowValue}>{plan.agents.length}</span>
        </p>
        <p className={styles.insRow}>
          <span className={styles.insRowLabel}>Workflows enabled</span>
          <span className={styles.insRowValue}>
            {wfEnabled} of {wfTotal}
          </span>
        </p>
        <p className={styles.insRow}>
          <span className={styles.insRowLabel}>Plan rules</span>
          <span className={styles.insRowValue}>{plan.planRules.length}</span>
        </p>
        <p className={styles.insRow}>
          <span className={styles.insRowLabel}>Status</span>
          <span className={styles.insRowValue}>
            <StatusBadge status={plan.status === "approved" ? "approved" : "review_requested"} label={plan.status === "approved" ? "Approved" : "In review"} />
          </span>
        </p>
      </div>

      <div className={styles.insSection}>
        <p className="oa-micro">Expected outcomes</p>
        <ul className={styles.insList}>
          {PLAN_OUTCOMES.map((o) => (
            <li key={o} className={styles.insItem}>
              <Check size={13} aria-hidden />
              {o}
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.insPanel}>
        <p className={styles.insPanelTitle}>Illustrative pricing</p>
        <p className={styles.insPanelBody}>
          {money(totals.setup)} setup · {money(totals.monthly)}/mo. Estimates on demo data, with no
          guaranteed savings.
        </p>
      </div>
    </>
  );
}

/* ── Shell ── */

export default function PlanInspector({
  selection,
  approved,
  bare,
}: {
  selection: PlannerSelection;
  approved: boolean;
  /** true inside the mobile Drawer (no card chrome). */
  bare?: boolean;
}) {
  const body =
    selection?.type === "agent" ? (
      <AgentDetail agentId={selection.agentId} approved={approved} />
    ) : selection?.type === "edge" ? (
      <EdgeDetail fromId={selection.fromId} toId={selection.toId} />
    ) : (
      <PlanSummary />
    );

  if (bare) return <div className={styles.inspectorBare}>{body}</div>;
  return <div className={`oa-card oa-card--flat ${styles.inspector}`}>{body}</div>;
}
