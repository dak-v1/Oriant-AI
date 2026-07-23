"use client";
/**
 * GateDrawer — Human Approval Gate 2 (spec §13): the plan-readiness review.
 * Checklist of agent readiness (blockers keep approval disabled, with links
 * back to configuration), integration status with a "connect now or during
 * activation" note, the combined human-approval rules, illustrative cost
 * summary and the deployment mode line. Approving starts the mock build.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleCheckBig, Plug, Settings2, ShieldCheck, TriangleAlert } from "lucide-react";
import Drawer from "@/components/mock/ui/Drawer";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { planBlockers, useDemoStore } from "@/lib/mock/store";
import { AGENT_LIBRARY } from "@/lib/mock/fixtures/agent-library";
import { INTEGRATIONS } from "@/lib/mock/fixtures/integrations";
import { money, planTotals } from "@/lib/mock/pricing";
import { toast } from "@/components/mock/ui/Toaster";
import styles from "./planner.module.css";

export default function GateDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const plan = useDemoStore((s) => s.plan);
  const integrationRuntime = useDemoStore((s) => s.integrations);

  const blockers = planBlockers(plan.agents);
  const ready = blockers.length === 0;
  const totals = planTotals(plan.agents);

  const integrationIds: string[] = [];
  for (const a of plan.agents) {
    for (const req of AGENT_LIBRARY[a.agentId]?.integrations ?? []) {
      if (!integrationIds.includes(req.integrationId)) integrationIds.push(req.integrationId);
    }
  }

  const approvalRules = Array.from(
    new Set([
      ...plan.agents.flatMap((a) => AGENT_LIBRARY[a.agentId]?.humanApprovals ?? []),
      ...plan.planRules,
    ]),
  );

  const approve = () => {
    useDemoStore.getState().approvePlan();
    toast({
      title: "Workforce plan approved.",
      detail: "Handing off to the Agent Factory — simulated build.",
      tone: "ok",
    });
    onClose();
    router.push("/app/build");
  };

  const agentReady = (status: string, designApproved: boolean, source: string) =>
    status !== "needs_information" &&
    status !== "needs_configuration" &&
    (source !== "custom" || designApproved);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Approve the workforce plan"
      eyebrow="Human approval · Gate 2"
      wide
      footer={
        <>
          <button type="button" className="oa-btn oa-btn--ghost" onClick={onClose}>
            Keep editing
          </button>
          <button
            type="button"
            className="oa-btn oa-btn--primary"
            disabled={!ready}
            onClick={approve}
            title={ready ? undefined : "Resolve the readiness items first"}
          >
            Approve plan and start build
            <ArrowRight size={15} aria-hidden />
          </button>
        </>
      }
    >
      <div className={styles.gateSection}>
        <p className="oa-micro">Agent readiness</p>
        {plan.agents.map((a) => {
          const def = AGENT_LIBRARY[a.agentId];
          if (!def) return null;
          const ok = agentReady(a.status, a.designApproved, def.source);
          return (
            <div key={a.agentId} className={styles.gateRow}>
              <span className={styles.gateRowName}>
                {ok ? (
                  <CircleCheckBig size={15} style={{ color: "var(--oa-teal-deep)" }} aria-hidden />
                ) : (
                  <TriangleAlert size={15} style={{ color: "var(--oa-amber-ink)" }} aria-hidden />
                )}
                {def.name}
              </span>
              <span className="oa-cluster" style={{ gap: 8 }}>
                <StatusBadge status={a.status} />
                {!ok && (
                  <Link
                    href={`/app/planner/agents/${a.agentId}`}
                    className="oa-btn oa-btn--soft oa-btn--sm"
                    onClick={onClose}
                  >
                    <Settings2 size={12} aria-hidden />
                    Open
                  </Link>
                )}
              </span>
            </div>
          );
        })}
        {blockers.length > 0 && (
          <div className={styles.gateBlockers} role="status">
            {blockers.map((b) => (
              <p key={b} className={styles.gateBlockerRow}>
                <TriangleAlert size={13} aria-hidden />
                {b}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className={styles.gateSection}>
        <p className="oa-micro">Integrations</p>
        {integrationIds.map((id) => (
          <div key={id} className={styles.gateRow}>
            <span className={styles.gateRowName}>
              <Plug size={14} style={{ color: "var(--oa-muted-strong)" }} aria-hidden />
              {INTEGRATIONS[id]?.name ?? id}
            </span>
            <StatusBadge status={integrationRuntime[id]?.status ?? "optional"} />
          </div>
        ))}
        <p className={styles.gateNote}>
          Connections can be made now or during activation — none of them block the build.{" "}
          <Link href="/app/integrations" className="oa-blue-text" onClick={onClose} style={{ fontWeight: 700 }}>
            Open integrations
          </Link>
        </p>
      </div>

      <div className={styles.gateSection}>
        <p className="oa-micro">Human approval rules</p>
        <ul className={styles.insList}>
          {approvalRules.map((rule) => (
            <li key={rule} className={styles.insItem}>
              <ShieldCheck size={13} aria-hidden />
              {rule}
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.gateSection}>
        <p className="oa-micro">Illustrative cost</p>
        {plan.agents.map((a) => {
          const def = AGENT_LIBRARY[a.agentId];
          if (!def) return null;
          return (
            <p key={a.agentId} className={styles.gateCostRow} style={{ margin: 0 }}>
              <span>{def.name}</span>
              <span>
                {money(def.setupCost)} setup · {money(def.monthlyCost)}/mo
              </span>
            </p>
          );
        })}
        <p className={`${styles.gateCostRow} ${styles.gateCostTotal}`} style={{ margin: 0 }}>
          <span>Illustrative total</span>
          <span>
            {money(totals.setup)} setup · {money(totals.monthly)}/mo
          </span>
        </p>
        <p className={styles.gateNote}>Demo pricing — no charges, no guaranteed savings.</p>
      </div>

      <div className={styles.gateSection}>
        <p className="oa-micro">Deployment mode</p>
        <div className={`${styles.insPanel} ${styles.insPanelTeal}`}>
          <p className={styles.insPanelTitle}>Assist mode — approved actions only</p>
          <p className={styles.insPanelBody}>
            Agents prepare and coordinate work with your team. Every action on your approval list
            waits for a person before anything reaches a customer or moves money.
          </p>
        </div>
        <span className="oa-sim-note">Simulated build — no real agents are created.</span>
      </div>
    </Drawer>
  );
}
