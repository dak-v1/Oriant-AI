"use client";
/**
 * AgentConfigPage — per-agent configuration route body (spec §11.4, §11.5).
 * Resolves the AgentDef from the library and the live PlanAgent from the
 * plan slice, then branches:
 *
 *   not in library  → calm not-found state
 *   not in the plan → "Add to plan" first (spec brief)
 *   preset          → PresetConfig (configuration document)
 *   custom          → CustomDesign (mini discovery cycle)
 */
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Plus, Target } from "lucide-react";
import { AGENT_LIBRARY } from "@/lib/mock/fixtures/agent-library";
import { useDemoStore } from "@/lib/mock/store";
import { money } from "@/lib/mock/pricing";
import { DUR, EASE } from "@/lib/mock/motion";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { toast } from "@/components/mock/ui/Toaster";
import PresetConfig from "./PresetConfig";
import CustomDesign from "./CustomDesign";
import styles from "./agents.module.css";

export default function AgentConfigPage({ agentId }: { agentId: string }) {
  const def = AGENT_LIBRARY[agentId];
  const planAgent = useDemoStore((s) => s.plan.agents.find((a) => a.agentId === agentId));
  const addAgentToPlan = useDemoStore((s) => s.addAgentToPlan);
  const reduced = useReducedMotion();

  if (!def) {
    return (
      <main className="oa-page oa-page--narrow">
        <Link href="/app/planner" className={styles.back}>
          <ArrowLeft size={14} aria-hidden />
          Workforce plan
        </Link>
        <div className={`oa-card ${styles.card}`} style={{ justifyItems: "start", padding: 30 }}>
          <h1 className="oa-h2">Agent not found</h1>
          <p className="oa-sub">
            No agent with the id &ldquo;{agentId}&rdquo; exists in the library. It may have been
            removed from the demo plan.
          </p>
          <Link href="/app/planner" className="oa-btn oa-btn--ghost">
            Back to the workforce plan
          </Link>
        </div>
      </main>
    );
  }

  const isPreset = def.source === "preset";

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
        <p className="oa-eyebrow">
          Plan · {isPreset ? "Agent configuration" : "Custom agent design"}
        </p>
        <div className={styles.titleRow}>
          <h1 className="oa-h1">{def.name}</h1>
          <span className={`oa-tag ${isPreset ? "oa-tag--neutral" : ""}`}>
            {isPreset ? "Preset agent" : "Custom agent"}
          </span>
          <StatusBadge status={planAgent ? planAgent.status : "recommended"} label={planAgent ? undefined : "Not in plan"} />
        </div>
        <p className="oa-lead">{def.role}</p>
        <p className="oa-sub">
          {money(def.setupCost)} setup · {money(def.monthlyCost)}/month · Illustrative pricing
        </p>
      </motion.header>

      {!planAgent ? (
        <AddToPlan
          def={def}
          onAdd={() => {
            addAgentToPlan(def.id);
            toast({
              title: `${def.name} added to the plan`,
              detail: `${money(def.setupCost)} setup · ${money(def.monthlyCost)}/month, illustrative. ${
                isPreset ? "Configure it below." : "Design it below."
              }`,
              tone: "ok",
            });
          }}
        />
      ) : isPreset ? (
        <PresetConfig key={def.id} def={def} agent={planAgent} />
      ) : (
        <CustomDesign key={def.id} def={def} agent={planAgent} />
      )}
    </main>
  );
}

function AddToPlan({ def, onAdd }: { def: (typeof AGENT_LIBRARY)[string]; onAdd: () => void }) {
  const reduced = useReducedMotion();
  return (
    <motion.section
      className={`oa-card ${styles.card}`}
      style={{ maxWidth: 860, gap: 16, padding: 26 }}
      initial={reduced ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.card, ease: EASE }}
      aria-label="Add this agent to the plan"
    >
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65 }}>{def.description}</p>
      {def.fitReason && (
        <p className="oa-sub" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Target size={14} aria-hidden style={{ flex: "none", marginTop: 3, color: "var(--oa-blue)" }} />
          {def.fitReason}
        </p>
      )}
      {def.coveredOutcomes.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          <p className="oa-micro">What it covers</p>
          <div className="oa-cluster" style={{ gap: 6 }}>
            {def.coveredOutcomes.map((o) => (
              <span key={o} className="oa-chip" style={{ padding: "5px 12px", fontSize: 12.5, whiteSpace: "normal" }}>
                {o}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="oa-between" style={{ gap: 12 }}>
        <span className="oa-sub">
          This agent is in the library but not in your current plan. Add it to configure it.
        </span>
        <button type="button" className="oa-btn oa-btn--primary" onClick={onAdd}>
          <Plus size={15} aria-hidden />
          Add to plan
        </button>
      </div>
    </motion.section>
  );
}
