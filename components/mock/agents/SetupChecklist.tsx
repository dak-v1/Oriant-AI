"use client";
/**
 * SetupChecklist — the required setup checklist shown under the Agent Design
 * Report (spec §11.5.5): configuration fields, connections needed, credentials
 * the owner will provide later (referenced by name only), a permissions
 * summary, and the process-owner confirmation select.
 */
import {
  CheckCircle2,
  Eye,
  KeyRound,
  Lock,
  Plug,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import type { AgentDef, PlanAgent } from "@/lib/mock/types";
import { useDemoStore } from "@/lib/mock/store";
import { INTEGRATIONS } from "@/lib/mock/fixtures/integrations";
import { OWNER, PEOPLE } from "@/lib/mock/fixtures/ids";
import styles from "./agents.module.css";

const MODE_LABEL: Record<string, string> = {
  draft_only: "Draft only",
  act_after_approval: "Act after approval",
  auto_within_limits: "Auto within limits",
};

export default function SetupChecklist({
  def,
  agent,
  readOnly,
}: {
  def: AgentDef;
  agent: PlanAgent;
  readOnly: boolean;
}) {
  const updateAgentConfig = useDemoStore((s) => s.updateAgentConfig);

  const connections = def.integrations
    .map((r) => INTEGRATIONS[r.integrationId])
    .filter((d): d is NonNullable<typeof d> => Boolean(d));
  const appConnections = connections.filter((c) => c.kind === "app");

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

      {/* 2 — connections needed */}
      <div className={styles.checkRow}>
        <span className={styles.checkIcon} aria-hidden>
          <Plug size={16} />
        </span>
        <div className={styles.checkBody}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 750 }}>Connections needed</p>
          <p className="oa-sub">
            Selected for the plan, not yet connected — connections are made during activation.
          </p>
          <div className="oa-cluster" style={{ gap: 6 }}>
            {connections.map((c) => (
              <span key={c.id} className="oa-chip" style={{ padding: "5px 12px", fontSize: 12.5 }}>
                {c.name}
                {c.kind === "mcp" && (
                  <span className="oa-tag oa-tag--neutral" style={{ padding: "1px 7px" }}>
                    MCP
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 3 — credentials, by name only */}
      <div className={styles.checkRow}>
        <span className={styles.checkIcon} aria-hidden>
          <KeyRound size={16} />
        </span>
        <div className={styles.checkBody}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 750 }}>Credentials provided later</p>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
            {appConnections.map((c) => (
              <li key={c.id} className="oa-sub" style={{ color: "var(--oa-ink)" }}>
                {c.name} access — provided by {OWNER.name} at activation
              </li>
            ))}
          </ul>
          <span className="oa-sim-note">
            Referenced by name only — this demo never asks for or stores credentials.
          </span>
        </div>
      </div>

      {/* 4 — permissions summary */}
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

      {/* 5 — process-owner confirmation */}
      <div className={styles.checkRow}>
        <span className={styles.checkIcon} aria-hidden>
          <UserCheck size={16} />
        </span>
        <div className={styles.checkBody}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 750 }}>Process-owner confirmation</p>
          <p className="oa-sub">
            The person who confirms this design matches how the process really runs today.
          </p>
          {readOnly ? (
            <span className="oa-chip" style={{ justifySelf: "start", padding: "5px 12px", fontSize: 12.5 }}>
              <CheckCircle2 size={13} aria-hidden style={{ color: "var(--oa-teal-deep)" }} />
              {agent.config.processOwner}
            </span>
          ) : (
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
          )}
        </div>
      </div>
    </section>
  );
}
