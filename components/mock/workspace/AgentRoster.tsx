"use client";
/**
 * AgentRoster — /app/workspace/agents (spec §17 "Agents" tab, §20 row
 * "Workspace"). A read-only operational view: one generous card per plan
 * agent with status, enabled workflows, configuration summary, connections
 * and illustrative cost. "Pause agent" is honestly simulated — it only
 * toasts; no live agent exists to pause.
 */
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Moon,
  Pause,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import { AGENT_LIBRARY } from "@/lib/mock/fixtures/agent-library";
import { INTEGRATIONS } from "@/lib/mock/fixtures/integrations";
import { WF_NAME } from "@/lib/mock/fixtures/ids";
import { money } from "@/lib/mock/pricing";
import { DUR, EASE, STAGGER } from "@/lib/mock/motion";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { toast } from "@/components/mock/ui/Toaster";
import { MODE_LABEL } from "./format";
import styles from "./workspace.module.css";

export default function AgentRoster() {
  const reduced = useReducedMotion();
  const planAgents = useDemoStore((s) => s.plan.agents);

  const pause = (name: string) => {
    toast({
      title: `${name} paused (simulated)`,
      detail: "Demo only. No live agent was changed.",
      tone: "info",
    });
  };

  return (
    <main className="oa-page">
      <header className={`oa-between ${styles.head}`}>
        <div className={styles.headTitles}>
          <p className="oa-eyebrow">Operate · Agents</p>
          <h1 className="oa-h1">Agent roster</h1>
          <p className="oa-lead">
            Every agent on your plan: status, workflows, guardrails and cost in one
            operational view.
          </p>
        </div>
        <Link href="/app/workspace" className="oa-btn oa-btn--ghost oa-btn--sm">
          <ArrowLeft size={13} aria-hidden />
          Back to workspace
        </Link>
      </header>

      <div className={styles.rosterGrid}>
        {planAgents.map((a, i) => {
          const def = AGENT_LIBRARY[a.agentId];
          if (!def) return null;
          const enabled = a.workflowOrder.filter(
            (id) => a.config.workflowsEnabled[id] !== false,
          );
          const disabledCount = a.workflowOrder.length - enabled.length;
          const connections = Array.from(
            new Set(
              def.integrations
                .map((req) => INTEGRATIONS[req.integrationId]?.name)
                .filter((n): n is string => Boolean(n)),
            ),
          );

          return (
            <motion.article
              key={a.agentId}
              aria-label={def.name}
              className={`oa-card ${styles.agentCard}`}
              initial={reduced ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DUR.card, ease: EASE, delay: i * STAGGER }}
            >
              <div className={styles.agentHead}>
                <div className={styles.agentTitles}>
                  <h2 className={styles.agentName}>{def.name}</h2>
                  <p className="oa-sub">{def.role}</p>
                </div>
                <StatusBadge status={a.status} />
              </div>

              <div className={styles.section}>
                <p className="oa-micro">Enabled workflows</p>
                <div className={styles.wfChips}>
                  {enabled.map((id) => (
                    <span key={id} className={styles.wfChip}>
                      {WF_NAME[id] ?? id}
                    </span>
                  ))}
                </div>
                {disabledCount > 0 && (
                  <p className="oa-sub">
                    {disabledCount} workflow{disabledCount > 1 ? "s" : ""} turned off in
                    this plan.
                  </p>
                )}
              </div>

              <div className={styles.section}>
                <p className="oa-micro">Configuration</p>
                <div className={styles.configList}>
                  <p className={styles.configRow}>
                    <ShieldCheck size={14} className={styles.configIcon} aria-hidden />
                    <span>
                      <span className={styles.configKey}>Mode:</span>{" "}
                      {MODE_LABEL[a.config.operatingMode]}
                    </span>
                  </p>
                  <p className={styles.configRow}>
                    <Moon size={14} className={styles.configIcon} aria-hidden />
                    <span>
                      <span className={styles.configKey}>Quiet hours:</span>{" "}
                      {a.config.quietHours}
                    </span>
                  </p>
                  <p className={styles.configRow}>
                    <UserRound size={14} className={styles.configIcon} aria-hidden />
                    <span>
                      <span className={styles.configKey}>Owner:</span>{" "}
                      {a.config.processOwner}
                    </span>
                  </p>
                </div>
              </div>

              <div className={styles.section}>
                <p className="oa-micro">Connections</p>
                <div className={styles.wfChips}>
                  {connections.map((name) => (
                    <span key={name} className={styles.wfChip}>
                      {name}
                    </span>
                  ))}
                </div>
              </div>

              <div className={styles.priceRow}>
                <span className={styles.price}>
                  {money(def.setupCost)} setup · {money(def.monthlyCost)}/month
                </span>
                <span className="oa-sim-note">Illustrative pricing</span>
              </div>

              <div className={styles.agentFoot}>
                <Link
                  href="/app/workspace/approvals"
                  className="oa-btn oa-btn--soft oa-btn--sm"
                >
                  View approvals
                  <ArrowRight size={13} aria-hidden />
                </Link>
                <button
                  type="button"
                  className="oa-btn oa-btn--ghost oa-btn--sm"
                  onClick={() => pause(def.name)}
                >
                  <Pause size={13} aria-hidden />
                  Pause agent
                </button>
              </div>
            </motion.article>
          );
        })}
      </div>

      <p className="oa-sim-note" style={{ marginTop: 16 }}>
        Read-only operational view. Pausing is simulated in this demo.
      </p>
    </main>
  );
}
