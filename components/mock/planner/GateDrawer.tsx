"use client";
/**
 * GateDrawer — Human Approval Gate 2: the plan-readiness review.
 *
 * Step 9 Pass 1: rewritten off real agent_configs statuses and a real
 * POST /api/planner/[id]/approve call. Integration status/human-approval
 * rules have no real backend source yet for this pass (integrations are
 * checked on the dedicated /app/integrations screen instead, and per-agent
 * approval rules aren't part of the current data model) — those sections
 * are dropped rather than shown with fixture content.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleCheckBig, Settings2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import Drawer from "@/components/mock/ui/Drawer";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { useDemoStore } from "@/lib/mock/store";
import { money } from "@/lib/mock/pricing";
import { toast } from "@/components/mock/ui/Toaster";
import styles from "./planner.module.css";

interface CostEstimateResponse {
  perAgent: Array<{ agentConfigId: string; monthlyCostUsd: number | null }>;
  totalMonthlyLlmCostUsd: number | null;
  note?: string;
}

export default function GateDrawer({
  open,
  onClose,
  cost,
}: {
  open: boolean;
  onClose: () => void;
  cost: CostEstimateResponse | null;
}) {
  const router = useRouter();
  const plan = useDemoStore((s) => s.plan);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blockers = plan.agents.filter((a) => a.status !== "ready_to_build");
  const ready = blockers.length === 0 && plan.agents.length > 0;
  const costByAgentKey = new Map((cost?.perAgent ?? []).map((a) => [a.agentConfigId, a.monthlyCostUsd ?? 0]));

  const approve = async () => {
    if (!plan.id) return;
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(`/api/planner/${plan.id}/approve`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string; plan?: { status: string; approved_at?: string | null } };
      if (!res.ok) throw new Error(body.error ?? "Could not approve the plan.");

      useDemoStore.setState((st) => ({
        plan: { ...st.plan, status: "approved", approvedAt: body.plan?.approved_at ?? null },
      }));
      toast({
        title: "Workforce plan approved.",
        detail: "Next, connect the tools your agents need.",
        tone: "ok",
      });
      onClose();
      router.push("/app/integrations");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve the plan.");
    } finally {
      setApproving(false);
    }
  };

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
            disabled={!ready || approving}
            onClick={() => void approve()}
            title={ready ? undefined : "Resolve the unresolved items first"}
          >
            {approving ? "Approving…" : "Approve plan"}
            <ArrowRight size={15} aria-hidden />
          </button>
        </>
      }
    >
      {error && (
        <div className={`${styles.gateStatus} ${styles.gateStatusWarn}`} role="alert">
          <TriangleAlert size={15} aria-hidden />
          {error}
        </div>
      )}

      <div
        className={`${styles.gateStatus} ${ready ? styles.gateStatusOk : styles.gateStatusWarn}`}
        role="status"
      >
        {ready ? (
          <CircleCheckBig size={15} aria-hidden />
        ) : (
          <TriangleAlert size={15} aria-hidden />
        )}
        {plan.agents.length === 0
          ? "This plan has no agents yet."
          : ready
            ? "All agents are configured. Approving moves on to connecting tools."
            : `${blockers.length} agent${blockers.length === 1 ? "" : "s"} still ${
                blockers.length === 1 ? "needs" : "need"
              } configuration before approving.`}
      </div>

      <div className={styles.gateSection}>
        <p className="oa-micro">Agent readiness</p>
        {plan.agents.map((a) => {
          const ok = a.status === "ready_to_build";
          return (
            <div key={a.agentId} className={styles.gateRow}>
              <span className={styles.gateRowName}>
                {ok ? (
                  <CircleCheckBig size={15} style={{ color: "var(--oa-teal-deep)" }} aria-hidden />
                ) : (
                  <TriangleAlert size={15} style={{ color: "var(--oa-amber-ink)" }} aria-hidden />
                )}
                {a.name ?? a.agentId}
              </span>
              <span className="oa-cluster" style={{ gap: 8 }}>
                <StatusBadge status={a.status} />
                {!ok && (
                  <Link
                    href={`/app/planner/agents/${a.configId ?? a.agentId}`}
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
      </div>

      <div className={styles.gateSection}>
        <p className="oa-micro">Estimated cost</p>
        {plan.agents.map((a) => (
          <p key={a.agentId} className={styles.gateCostRow} style={{ margin: 0 }}>
            <span>{a.name ?? a.agentId}</span>
            <span>{money(a.configId ? costByAgentKey.get(a.configId) ?? 0 : 0)}/mo</span>
          </p>
        ))}
        <p className={`${styles.gateCostRow} ${styles.gateCostTotal}`} style={{ margin: 0 }}>
          <span>Total</span>
          <span>{money(cost?.totalMonthlyLlmCostUsd ?? 0)}/mo</span>
        </p>
        <p className={styles.gateNote}>
          Estimated LLM usage cost only — connected-tool fees aren&apos;t included yet.
        </p>
      </div>

      <div className={styles.gateSection}>
        <p className="oa-micro">Next step</p>
        <div className={`${styles.insPanel} ${styles.insPanelTeal}`}>
          <p className={styles.insPanelTitle}>Connect your tools</p>
          <p className={styles.insPanelBody}>
            After approving, you&apos;ll connect the tools your agents need before the plan can be
            handed off to build.
          </p>
        </div>
      </div>
    </Drawer>
  );
}
