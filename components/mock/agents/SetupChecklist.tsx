"use client";
/**
 * SetupChecklist — the required setup checklist for a CUSTOM agent, rendered
 * ONLY after the design is approved (improvement spec §13): configuration
 * fields, the gated connections list with mock credential placeholders and
 * Connect later / Use mock connection actions, a permissions summary, and
 * the process-owner confirmation select. Never asks for real keys.
 */
import { CheckCircle2, Eye, Lock, Plug, ShieldCheck, UserCheck } from "lucide-react";
import type { AgentDef, PlanAgent } from "@/lib/mock/types";
import { useDemoStore } from "@/lib/mock/store";
import { OWNER, PEOPLE } from "@/lib/mock/fixtures/ids";
import { ConnectionList } from "./ConnectionsCard";
import styles from "./agents.module.css";

const MODE_LABEL: Record<string, string> = {
  draft_only: "Draft only",
  act_after_approval: "Act after approval",
  auto_within_limits: "Auto within limits",
};

export default function SetupChecklist({ def, agent }: { def: AgentDef; agent: PlanAgent }) {
  const updateAgentConfig = useDemoStore((s) => s.updateAgentConfig);

  const people = Array.from(
    new Set([OWNER.name, ...Object.values(PEOPLE), agent.config.processOwner]),
  );

  return (
    <section className={`oa-card ${styles.card}`} aria-label="Required setup checklist" style={{ gap: 4 }}>
      <div style={{ display: "grid", gap: 4, paddingBottom: 8 }}>
        <h3 className="oa-h3">Required setup</h3>
        <p className="oa-sub">
          Everything the build needs before this agent can go live. Nothing here connects or stores
          anything real in this demo.
        </p>
      </div>

      {/* 1 — configuration fields */}
      <div className={styles.checkRow}>
        <span className={`${styles.checkIcon} ${styles.checkIconOk}`} aria-hidden>
          <CheckCircle2 size={16} />
        </span>
        <div className={styles.checkBody}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 750 }}>Configuration fields</p>
          <p className="oa-sub">
            Operating mode, triggers, quiet hours and run frequency are prefilled from your answers.
          </p>
          <div className="oa-cluster" style={{ gap: 6 }}>
            <span className="oa-tag oa-tag--neutral">{MODE_LABEL[agent.config.operatingMode]}</span>
            <span className="oa-tag oa-tag--neutral">Quiet {agent.config.quietHours}</span>
            <span className="oa-tag oa-tag--neutral">{agent.config.runFrequency}</span>
          </div>
        </div>
      </div>

      {/* 2 — connections + mock credential placeholders (unlocked by approval) */}
      <div className={styles.checkRow}>
        <span className={styles.checkIcon} aria-hidden>
          <Plug size={16} />
        </span>
        <div className={styles.checkBody}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 750 }}>Connections</p>
          <p className="oa-sub">
            Unlocked now the design is approved. Use mock connections here, or leave them for
            activation.
          </p>
          <ConnectionList def={def} />
          <span className="oa-sim-note">
            Credentials are referenced by name only. This demo never asks for or stores real keys.
          </span>
        </div>
      </div>

      {/* 3 — permissions summary */}
      <div className={styles.checkRow}>
        <span className={styles.checkIcon} aria-hidden>
          <ShieldCheck size={16} />
        </span>
        <div className={styles.checkBody}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 750 }}>Permissions summary</p>
          <div className={styles.permSplit}>
            <div style={{ display: "grid", gap: 6 }}>
              <p className="oa-micro">Can read</p>
              {agent.config.dataAccess.map((d) => (
                <span
                  key={d}
                  className="oa-sub"
                  style={{ display: "flex", gap: 7, alignItems: "flex-start", color: "var(--oa-ink)" }}
                >
                  <Eye size={13} aria-hidden style={{ flex: "none", marginTop: 3, color: "var(--oa-muted)" }} />
                  {d}
                </span>
              ))}
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <p className="oa-micro">Can never</p>
              {agent.config.forbiddenActions.map((f) => (
                <span
                  key={f}
                  className="oa-sub"
                  style={{ display: "flex", gap: 7, alignItems: "flex-start", color: "var(--oa-ink)" }}
                >
                  <Lock size={13} aria-hidden style={{ flex: "none", marginTop: 3, color: "var(--oa-red-ink)" }} />
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 4 — process-owner confirmation */}
      <div className={styles.checkRow}>
        <span className={styles.checkIcon} aria-hidden>
          <UserCheck size={16} />
        </span>
        <div className={styles.checkBody}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 750 }}>Process-owner confirmation</p>
          <p className="oa-sub">
            The person who confirms this design matches how the process really runs today. You can
            still change who that is.
          </p>
          <div style={{ maxWidth: 320 }}>
            <label className="oa-label" htmlFor={`process-owner-${def.id}`}>
              Process owner
            </label>
            <select
              id={`process-owner-${def.id}`}
              className="oa-select"
              value={agent.config.processOwner}
              onChange={(e) => updateAgentConfig(def.id, { processOwner: e.target.value })}
            >
              {people.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </section>
  );
}
