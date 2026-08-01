"use client";
/**
 * AgentConfigPage — per-agent configuration route body.
 *
 * Step 9 Pass 1: `agentId` here is actually the real agent_configs.id (the
 * planner UI now links to /app/planner/agents/[configId] — see PlanList.tsx
 * and GateDrawer.tsx). Resolves the live PlanAgent by configId, self-
 * bootstrapping via ensurePlanLoaded() if the store is empty (a direct
 * navigation, refresh, or shared link never visits /app/planner first, so
 * PlannerExperience's own bootstrap effect never runs). Then branches:
 *
 *   not found            → calm not-found state (stale link / real 404)
 *   needs_information    → "needs a design call" state (deferred this pass)
 *   otherwise            → SchemaConfigForm, driven by the template's
 *                          config_schema, POSTing straight to /configure
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, LoaderCircle, TriangleAlert } from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import { ensurePlanLoaded } from "@/lib/mock/planner-bootstrap";
import { DUR, EASE } from "@/lib/mock/motion";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { toast } from "@/components/mock/ui/Toaster";
import SchemaConfigForm from "./SchemaConfigForm";
import styles from "./agents.module.css";

export default function AgentConfigPage({ agentId }: { agentId: string }) {
  const router = useRouter();
  const planAgent = useDemoStore((s) => s.plan.agents.find((a) => a.configId === agentId));
  const approved = useDemoStore((s) => s.plan.status === "approved");
  const hasAgents = useDemoStore((s) => s.plan.agents.length > 0);
  const reduced = useReducedMotion();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!hasAgents);

  useEffect(() => {
    if (hasAgents) return;
    let cancelled = false;
    void ensurePlanLoaded().then((result) => {
      if (cancelled) return;
      if (!result.ok) setError(result.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // Only re-run if we land here with an empty store (e.g. a fresh tab).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <main className="oa-page oa-page--narrow">
        <div style={{ display: "grid", placeItems: "center", padding: 48 }}>
          <LoaderCircle size={22} className="oa-spin" aria-hidden />
          <p className="oa-sub" style={{ marginTop: 12 }}>Loading this agent…</p>
        </div>
      </main>
    );
  }

  if (!planAgent) {
    return (
      <main className="oa-page oa-page--narrow">
        <Link href="/app/planner" className={styles.back}>
          <ArrowLeft size={14} aria-hidden />
          Workforce plan
        </Link>
        <div className={`oa-card ${styles.card}`} style={{ justifyItems: "start", padding: 30 }}>
          <h1 className="oa-h2">Agent not found</h1>
          <p className="oa-sub">
            {error ?? "No agent with this id is loaded in the current plan. Go back to the workforce plan and open it from there."}
          </p>
          <Link href="/app/planner" className="oa-btn oa-btn--ghost">
            Back to the workforce plan
          </Link>
        </div>
      </main>
    );
  }

  const save = async (values: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/planner/agent/${agentId}/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; agent?: { status: string; config: Record<string, unknown> } };
      if (!res.ok) throw new Error(body.error ?? "Could not save this agent's configuration.");

      useDemoStore.setState((st) => ({
        plan: {
          ...st.plan,
          agents: st.plan.agents.map((a) =>
            a.configId === agentId
              ? { ...a, status: "ready_to_build", realConfig: body.agent?.config ?? values }
              : a,
          ),
        },
      }));
      toast({ title: `${planAgent.name ?? "Agent"} configured.`, tone: "ok" });
      router.push("/app/planner");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this agent's configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="oa-page">
      <Link href="/app/planner" className={styles.back}>
        <ArrowLeft size={14} aria-hidden />
        Workforce plan
      </Link>

      <motion.header
        className={styles.header}
        initial={reduced ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.card, ease: EASE }}
      >
        <p className="oa-eyebrow">Plan · Agent configuration</p>
        <div className={styles.titleRow}>
          <h1 className="oa-h1">{planAgent.name ?? planAgent.agentId}</h1>
          <StatusBadge status={planAgent.status} />
        </div>
        {planAgent.description && <p className="oa-lead">{planAgent.description}</p>}
        {planAgent.requiredTools && planAgent.requiredTools.length > 0 && (
          <p className="oa-sub">Needs: {planAgent.requiredTools.join(", ")}</p>
        )}
      </motion.header>

      {planAgent.status === "needs_information" ? (
        <div className={`oa-card ${styles.card}`} style={{ padding: 26, display: "grid", gap: 10, justifyItems: "start" }}>
          <p style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 650 }}>
            <TriangleAlert size={16} aria-hidden style={{ color: "var(--oa-amber-ink)" }} />
            Design call needed
          </p>
          <p className="oa-sub">
            This is a custom agent — it needs a short design call before it can be configured.
            That flow is coming in a future update.
          </p>
        </div>
      ) : (
        <motion.section
          className={`oa-card ${styles.card}`}
          style={{ maxWidth: 720, padding: 26 }}
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DUR.card, ease: EASE }}
        >
          {approved ? (
            <p className="oa-sub">This plan is approved — configuration is read-only.</p>
          ) : (
            <>
              {error && (
                <p className="oa-sub" style={{ color: "var(--oa-amber-ink)", marginBottom: 12 }}>
                  {error}
                </p>
              )}
              <SchemaConfigForm
                schema={planAgent.configSchema}
                initialValues={planAgent.realConfig ?? {}}
                onSave={save}
                saving={saving}
              />
            </>
          )}
        </motion.section>
      )}
    </main>
  );
}
