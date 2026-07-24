"use client";
/**
 * PresetConfig — per-agent configuration for PRESET agents (spec §11.4,
 * improvement spec §12.5 + §13). A calm configuration document: operating
 * mode, the "When it runs" trigger chooser, channels, workflows, human
 * approvals, people, schedule, read-only test scenarios and policy, with a
 * live Configuration summary rail (desktop) and a sticky save bar carrying
 * this agent's illustrative cost. Connections (with mock credential
 * placeholders) appear only after the configuration has been saved.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  Calendar,
  Check,
  Eye,
  File,
  FileText,
  Inbox,
  Lock,
  Megaphone,
  MessageSquare,
  PenLine,
  Play,
  Plug,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  User,
  UserCheck,
  X,
} from "lucide-react";
import type { AgentConfig, AgentDef, OperatingMode, PlanAgent } from "@/lib/mock/types";
import { useDemoStore } from "@/lib/mock/store";
import { INTEGRATIONS } from "@/lib/mock/fixtures/integrations";
import { OWNER, PEOPLE } from "@/lib/mock/fixtures/ids";
import { money } from "@/lib/mock/pricing";
import { DUR, EASE, STAGGER } from "@/lib/mock/motion";
import { toast } from "@/components/mock/ui/Toaster";
import TriggerSection, { TRIGGER_TYPE_META } from "./TriggerSection";
import ConnectionsCard from "./ConnectionsCard";
import styles from "./agents.module.css";

type ConfigDraft = Omit<AgentConfig, "workflowsEnabled">;

const MODE_META: Record<OperatingMode, { label: string; hint: string; icon: React.ReactNode }> = {
  draft_only: {
    label: "Draft only",
    hint: "Prepares drafts and recommendations. A person reviews and sends everything.",
    icon: <PenLine size={15} aria-hidden />,
  },
  act_after_approval: {
    label: "Act after approval",
    hint: "Acts only once the named approver clears each queued action.",
    icon: <UserCheck size={15} aria-hidden />,
  },
  auto_within_limits: {
    label: "Auto within limits",
    hint: "Handles routine work automatically inside the limits and approval rules below.",
    icon: <SlidersHorizontal size={15} aria-hidden />,
  },
};

const QUIET_HOURS_BASE = [
  "No quiet hours",
  "19:00–08:00 and Sundays",
  "21:00–07:30 SGT",
  "21:00–08:00",
  "Weekends and 19:00–08:00",
];

const FREQUENCY_BASE = [
  "Continuous during business hours (Mon–Sat 08:00–18:00)",
  "Every weekday 08:30",
  "Weekly, Fridays 09:00",
  "Event-driven, as qualifying work arrives",
];

/** Channel-card icon by integration category (operational icons only). */
const CHANNEL_ICON: Record<string, React.ReactNode> = {
  "Customer communication": <Inbox size={14} aria-hidden />,
  Scheduling: <Calendar size={14} aria-hidden />,
  "CRM and sales": <User size={14} aria-hidden />,
  Finance: <FileText size={14} aria-hidden />,
  "Storage and documents": <File size={14} aria-hidden />,
  Marketing: <Megaphone size={14} aria-hidden />,
  "Internal collaboration": <MessageSquare size={14} aria-hidden />,
  "MCP and internal tools": <Plug size={14} aria-hidden />,
};

/** Replace em dashes arriving from stored config values with plain phrasing. */
const stripDash = (s: string) => s.replace(/\s*—\s*/g, ", ").replace(/—/g, "-");

export default function PresetConfig({ def, agent }: { def: AgentDef; agent: PlanAgent }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const updateAgentConfig = useDemoStore((s) => s.updateAgentConfig);
  const markAgentConfigured = useDemoStore((s) => s.markAgentConfigured);
  const toggleAgentWorkflow = useDemoStore((s) => s.toggleAgentWorkflow);

  /* Draft of everything except workflowsEnabled (switches write straight to
     the store via toggleAgentWorkflow so the plan canvas stays in sync). */
  const [draft, setDraft] = useState<ConfigDraft>(() => {
    const { workflowsEnabled: _wf, ...rest } = agent.config;
    void _wf;
    const clean = structuredClone(rest);
    clean.quietHours = stripDash(clean.quietHours);
    clean.runFrequency = stripDash(clean.runFrequency);
    clean.triggerDetails = clean.triggerDetails ?? {};
    return clean;
  });
  const [newApproval, setNewApproval] = useState("");

  const patch = (p: Partial<ConfigDraft>) => setDraft((d) => ({ ...d, ...p }));

  const configured = agent.status !== "needs_configuration";

  const channelOptions = useMemo(() => {
    const names = def.integrations
      .map((r) => INTEGRATIONS[r.integrationId]?.name)
      .filter((n): n is string => Boolean(n));
    return Array.from(new Set([...def.defaultConfig.channels, ...names, ...draft.channels]));
  }, [def, draft.channels]);

  const channelMeta = useMemo(() => {
    const m = new Map<string, { category: string; kind: "app" | "mcp" }>();
    for (const d of Object.values(INTEGRATIONS)) m.set(d.name, { category: d.category, kind: d.kind });
    return m;
  }, []);

  const people = useMemo(
    () =>
      Array.from(
        new Set([OWNER.name, ...Object.values(PEOPLE), draft.processOwner, draft.approvalOwner]),
      ),
    [draft.processOwner, draft.approvalOwner],
  );

  const quietOptions = useMemo(
    () => Array.from(new Set([...QUIET_HOURS_BASE, draft.quietHours])),
    [draft.quietHours],
  );
  const frequencyOptions = useMemo(
    () => Array.from(new Set([...FREQUENCY_BASE, draft.runFrequency])),
    [draft.runFrequency],
  );

  /** Rules offered by the Approval trigger select (own rules + preset list). */
  const approvalRuleOptions = useMemo(
    () => Array.from(new Set([...draft.approvalActions, ...def.humanApprovals])),
    [draft.approvalActions, def.humanApprovals],
  );

  const workflowsOn = agent.workflowOrder.filter(
    (id) => agent.config.workflowsEnabled[id] ?? true,
  ).length;

  const approvalSuggestions = def.humanApprovals.filter(
    (a) => !draft.approvalActions.includes(a),
  );

  const summaryLine = [
    MODE_META[draft.operatingMode].label,
    `${draft.triggers.length} trigger type${draft.triggers.length === 1 ? "" : "s"}`,
    `${workflowsOn}/${agent.workflowOrder.length} workflows on`,
    `${draft.approvalActions.length} approval action${draft.approvalActions.length === 1 ? "" : "s"}`,
    `Owner ${draft.processOwner}`,
  ].join(" · ");

  const save = () => {
    updateAgentConfig(def.id, draft);
    markAgentConfigured(def.id);
    toast({
      title: "Configuration saved",
      detail: `${def.name} is ready to build: ${MODE_META[draft.operatingMode].label.toLowerCase()}, ${workflowsOn} workflow${workflowsOn === 1 ? "" : "s"} enabled. Connections are now available on this agent's page.`,
      tone: "ok",
      action: {
        label: "Set up connections",
        onClick: () => router.push(`/app/planner/agents/${def.id}`),
      },
    });
    router.push("/app/planner");
  };

  const toggleChannel = (name: string) =>
    patch({
      channels: draft.channels.includes(name)
        ? draft.channels.filter((x) => x !== name)
        : [...draft.channels, name],
    });

  const addApproval = (text: string) => {
    const v = text.trim();
    if (!v || draft.approvalActions.includes(v)) return;
    patch({ approvalActions: [...draft.approvalActions, v] });
  };

  const anim = (i: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: DUR.card, ease: EASE, delay: i * STAGGER },
        };

  return (
    <div className={styles.layout}>
      <div className={styles.docCol}>
        {/* 0 — Connections: revealed only once the configuration is saved (§13) */}
        {configured && (
          <motion.div {...anim(0)}>
            <ConnectionsCard def={def} />
          </motion.div>
        )}

        {/* 1 — Operating mode */}
        <motion.section {...anim(configured ? 1 : 0)} className={`oa-card ${styles.card}`}>
          <div style={{ display: "grid", gap: 3 }}>
            <h3 className="oa-h3">Operating mode</h3>
            <p className="oa-sub">How much this agent does on its own.</p>
          </div>
          <div className={styles.modeGrid} role="radiogroup" aria-label="Operating mode">
            {(Object.keys(MODE_META) as OperatingMode[]).map((mode) => {
              const on = draft.operatingMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`oa-selectable ${styles.modeCard} ${on ? "oa-selectable--selected" : ""}`}
                  onClick={() => patch({ operatingMode: mode })}
                >
                  <span className="oa-radio" aria-hidden />
                  <span style={{ display: "grid", gap: 4, minWidth: 0 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 7,
                        fontSize: 13.5,
                        fontWeight: 750,
                        color: on ? "var(--oa-blue-dark)" : "var(--oa-ink)",
                      }}
                    >
                      {MODE_META[mode].icon}
                      {MODE_META[mode].label}
                    </span>
                    <span className="oa-sub" style={{ fontSize: 12.5 }}>
                      {MODE_META[mode].hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </motion.section>

        {/* 2 — When it runs (improvement spec §12.5, P-03) */}
        <motion.section {...anim(configured ? 2 : 1)} className={`oa-card ${styles.card}`}>
          <div style={{ display: "grid", gap: 3 }}>
            <h3 className="oa-h3">When it runs</h3>
            <p className="oa-sub">Choose what starts this agent, then set the details for each type.</p>
          </div>
          <TriggerSection
            def={def}
            triggers={draft.triggers}
            details={draft.triggerDetails ?? {}}
            approvalOptions={approvalRuleOptions}
            onChange={(next) => patch(next)}
          />
        </motion.section>

        {/* 3 — Channels and systems */}
        <motion.section {...anim(configured ? 3 : 2)} className={`oa-card ${styles.card}`}>
          <div style={{ display: "grid", gap: 3 }}>
            <h3 className="oa-h3">Channels and systems</h3>
            <p className="oa-sub">Where this agent is allowed to work, from its required connections.</p>
          </div>
          <div className={styles.channelGrid} role="group" aria-label="Channels and systems">
            {channelOptions.map((name) => {
              const on = draft.channels.includes(name);
              const meta = channelMeta.get(name);
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={on}
                  className={`oa-selectable ${styles.channelCard} ${on ? "oa-selectable--selected" : ""}`}
                  onClick={() => toggleChannel(name)}
                >
                  <span
                    className={styles.triggerIcon}
                    aria-hidden
                    style={
                      on
                        ? { background: "var(--oa-soft-blue)", color: "var(--oa-blue-dark)" }
                        : undefined
                    }
                  >
                    {(meta && CHANNEL_ICON[meta.category]) ?? <Plug size={14} aria-hidden />}
                  </span>
                  <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 750, overflowWrap: "anywhere" }}>
                      {name}
                    </span>
                    <span className="oa-sub" style={{ fontSize: 11.5 }}>
                      {meta?.category ?? "Connected system"}
                    </span>
                  </span>
                  <span className="oa-check-badge" aria-hidden>
                    <Check size={13} />
                  </span>
                </button>
              );
            })}
          </div>
        </motion.section>

        {/* 4 — Workflows enabled */}
        <motion.section {...anim(configured ? 4 : 3)} className={`oa-card ${styles.card}`}>
          <div style={{ display: "grid", gap: 3 }}>
            <h3 className="oa-h3">Workflows enabled</h3>
            <p className="oa-sub">
              Switch a workflow off to keep it in the plan without running it.
            </p>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {agent.workflowOrder.map((wfId) => {
              const wf = def.workflows.find((w) => w.id === wfId);
              if (!wf) return null;
              const enabled = agent.config.workflowsEnabled[wfId] ?? true;
              return (
                <div key={wfId} className={`${styles.wfRow} ${enabled ? "" : styles.wfRowOff}`}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`${wf.name}, ${enabled ? "enabled" : "disabled"}`}
                    className={`oa-switch ${enabled ? "oa-switch--on" : ""}`}
                    style={{ marginTop: 3 }}
                    onClick={() => toggleAgentWorkflow(def.id, wfId)}
                  />
                  <div style={{ display: "grid", gap: 5, minWidth: 0 }}>
                    <div className="oa-cluster" style={{ gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 750 }}>{wf.name}</span>
                      <span className="oa-tag oa-tag--neutral">
                        {TRIGGER_TYPE_META[wf.trigger.kind].label}
                      </span>
                    </div>
                    <p className="oa-sub" style={{ fontSize: 12.5 }}>{wf.trigger.label}</p>
                    <p className="oa-sub">{wf.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.section>

        {/* 5 — Human approvals */}
        <motion.section {...anim(configured ? 5 : 4)} className={`oa-card ${styles.card}`}>
          <div style={{ display: "grid", gap: 3 }}>
            <h3 className="oa-h3">Actions requiring human approval</h3>
            <p className="oa-sub">
              These always queue for a person. The agent cannot perform them alone.
            </p>
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {draft.approvalActions.map((a) => (
              <li
                key={a}
                className="oa-panel"
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px 6px 14px" }}
              >
                <ShieldCheck size={15} aria-hidden style={{ color: "var(--oa-teal-deep)", flex: "none" }} />
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 650 }}>{a}</span>
                <button
                  type="button"
                  className="oa-btn oa-btn--ghost oa-btn--icon"
                  aria-label={`Remove approval requirement: ${a}`}
                  onClick={() =>
                    patch({ approvalActions: draft.approvalActions.filter((x) => x !== a) })
                  }
                >
                  <X size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          {approvalSuggestions.length > 0 && (
            <div className="oa-cluster" style={{ gap: 8 }}>
              {approvalSuggestions.map((a) => (
                <button
                  key={a}
                  type="button"
                  className="oa-btn oa-btn--ghost oa-btn--sm"
                  style={{ whiteSpace: "normal", textAlign: "left" }}
                  onClick={() => addApproval(a)}
                >
                  <Plus size={13} aria-hidden />
                  {a}
                </button>
              ))}
            </div>
          )}
          <form
            style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
            onSubmit={(e) => {
              e.preventDefault();
              addApproval(newApproval);
              setNewApproval("");
            }}
          >
            <input
              className="oa-input"
              style={{ flex: 1, minWidth: 200 }}
              value={newApproval}
              onChange={(e) => setNewApproval(e.target.value)}
              placeholder="Add another action that must stay human-approved…"
              aria-label="New approval action"
            />
            <button type="submit" className="oa-btn oa-btn--soft" disabled={!newApproval.trim()}>
              <Plus size={14} aria-hidden />
              Add
            </button>
          </form>
        </motion.section>

        {/* 6 — People */}
        <motion.section {...anim(configured ? 6 : 5)} className={`oa-card ${styles.card}`}>
          <div style={{ display: "grid", gap: 3 }}>
            <h3 className="oa-h3">People</h3>
            <p className="oa-sub">Who owns the process, and who clears the approvals.</p>
          </div>
          <div className={styles.permSplit}>
            <div className="oa-field">
              <label className="oa-label" htmlFor={`po-${def.id}`}>Process owner</label>
              <select
                id={`po-${def.id}`}
                className="oa-select"
                value={draft.processOwner}
                onChange={(e) => patch({ processOwner: e.target.value })}
              >
                {people.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="oa-field">
              <label className="oa-label" htmlFor={`ao-${def.id}`}>Approval owner</label>
              <select
                id={`ao-${def.id}`}
                className="oa-select"
                value={draft.approvalOwner}
                onChange={(e) => patch({ approvalOwner: e.target.value })}
              >
                {people.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
        </motion.section>

        {/* 7 — Schedule */}
        <motion.section {...anim(configured ? 7 : 6)} className={`oa-card ${styles.card}`}>
          <div style={{ display: "grid", gap: 3 }}>
            <h3 className="oa-h3">Schedule</h3>
            <p className="oa-sub">When the agent may work, and how often it runs.</p>
          </div>
          <div className={styles.permSplit}>
            <div className="oa-field">
              <label className="oa-label" htmlFor={`qh-${def.id}`}>Quiet hours</label>
              <select
                id={`qh-${def.id}`}
                className="oa-select"
                value={draft.quietHours}
                onChange={(e) => patch({ quietHours: e.target.value })}
              >
                {quietOptions.map((q) => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
            </div>
            <div className="oa-field">
              <label className="oa-label" htmlFor={`rf-${def.id}`}>Run frequency</label>
              <select
                id={`rf-${def.id}`}
                className="oa-select"
                value={draft.runFrequency}
                onChange={(e) => patch({ runFrequency: e.target.value })}
              >
                {frequencyOptions.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          </div>
        </motion.section>

        {/* 8 — Test scenarios (read-only, §13) + budget guide */}
        <motion.section {...anim(configured ? 8 : 7)} className={`oa-card ${styles.card}`}>
          <div className="oa-between" style={{ gap: 10 }}>
            <div style={{ display: "grid", gap: 3 }}>
              <h3 className="oa-h3">Test scenarios</h3>
              <p className="oa-sub">How this agent will be exercised in the sandbox after the build.</p>
            </div>
            <span className="oa-tag oa-tag--neutral">Read-only</span>
          </div>
          <div>
            {def.workflows.slice(0, 3).map((wf) => (
              <div key={wf.id} className={styles.scenarioRow}>
                <span
                  className={styles.checkIcon}
                  aria-hidden
                  style={{ width: 28, height: 28, borderRadius: 8 }}
                >
                  <Play size={13} />
                </span>
                <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 750 }}>{wf.name}</span>
                  <span className="oa-sub" style={{ fontSize: 12.5 }}>
                    {wf.trigger.label} → expected: {wf.handoff}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <hr className="oa-divider" />
          <p className="oa-sub" style={{ fontSize: 12.5 }}>
            Budget guide: plan for about {money(def.setupCost)} once for setup and{" "}
            {money(def.monthlyCost)} per month while active. Illustrative demo figures, not a
            quote.
          </p>
        </motion.section>

        {/* 9 — Data access & forbidden (policy, read-only) */}
        <motion.section {...anim(configured ? 9 : 8)} className={`oa-card oa-card--flat ${styles.card}`}>
          <div className="oa-between" style={{ gap: 10 }}>
            <div style={{ display: "grid", gap: 3 }}>
              <h3 className="oa-h3">Data access and hard limits</h3>
              <p className="oa-sub">
                Set by your approval restrictions from Discovery: policy, not preference. To change
                them, update the company report before approving the plan.
              </p>
            </div>
            <span className="oa-tag oa-tag--neutral">Read-only</span>
          </div>
          <div className={styles.permSplit}>
            <div style={{ display: "grid", gap: 7 }}>
              <p className="oa-micro">The agent can read</p>
              {draft.dataAccess.map((d) => (
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
            <div style={{ display: "grid", gap: 7 }}>
              <p className="oa-micro">It can never</p>
              {draft.forbiddenActions.map((f) => (
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
        </motion.section>

        {/* Sticky save bar */}
        <div className={styles.stickyBar}>
          <div className={`oa-card ${styles.stickyInner}`}>
            <div className={styles.stickySummary}>
              <span style={{ fontSize: 13.5, fontWeight: 750 }}>
                {money(def.setupCost)} setup · {money(def.monthlyCost)}/month{" "}
                <span className="oa-sub" style={{ fontWeight: 600 }}>(illustrative pricing)</span>
              </span>
              <span className={`oa-sub ${styles.stickyLine}`}>{summaryLine}</span>
            </div>
            <button type="button" className="oa-btn oa-btn--primary" onClick={save}>
              <Check size={15} aria-hidden />
              {agent.status === "needs_configuration"
                ? "Save configuration and mark ready"
                : "Save configuration"}
            </button>
          </div>
        </div>
      </div>

      {/* Live configuration summary (desktop rail) */}
      <aside
        className={`${styles.rail} ${styles.railDesktop}`}
        aria-label="Configuration summary"
      >
        <div className={`oa-card oa-card--flat ${styles.card}`} style={{ gap: 12 }}>
          <p className="oa-micro">Configuration summary</p>
          <SummaryRow label="Operating mode" value={MODE_META[draft.operatingMode].label} />
          <SummaryRow
            label="When it runs"
            value={
              draft.triggers.length
                ? draft.triggers.map((t) => TRIGGER_TYPE_META[t].label).join(", ")
                : "None selected"
            }
          />
          <SummaryRow
            label="Channels"
            value={draft.channels.length ? draft.channels.join(", ") : "None selected"}
          />
          <SummaryRow
            label="Workflows"
            value={`${workflowsOn} of ${agent.workflowOrder.length} enabled`}
          />
          <SummaryRow
            label="Human approvals"
            value={`${draft.approvalActions.length} action${draft.approvalActions.length === 1 ? "" : "s"}`}
          />
          <SummaryRow label="Process owner" value={draft.processOwner} />
          <SummaryRow label="Approval owner" value={draft.approvalOwner} />
          <SummaryRow label="Quiet hours" value={draft.quietHours} />
          <SummaryRow label="Run frequency" value={draft.runFrequency} />
          <hr className="oa-divider" />
          <SummaryRow label="Setup" value={money(def.setupCost)} />
          <SummaryRow label="Monthly" value={`${money(def.monthlyCost)}/month`} />
          <span className="oa-sim-note">Illustrative pricing. Demo figures only.</span>
        </div>
      </aside>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <span className="oa-micro" style={{ fontSize: 10 }}>{label}</span>
      <motion.span
        key={value}
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.micro, ease: EASE }}
        style={{ fontSize: 13, fontWeight: 650, lineHeight: 1.45, overflowWrap: "anywhere" }}
      >
        {value}
      </motion.span>
    </div>
  );
}
