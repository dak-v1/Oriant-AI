"use client";
/**
 * PresetConfig — per-agent configuration for PRESET agents (spec §11.4).
 * A calm configuration document, not a dense admin form: operating mode,
 * triggers, channels, workflows, human approvals, people, schedule and a
 * read-only policy card — with a live Configuration summary rail (desktop)
 * and a sticky save bar carrying this agent's illustrative cost.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  CalendarClock,
  Check,
  Eye,
  Gauge,
  Hand,
  Link2,
  Lock,
  PenLine,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  X,
  Zap,
} from "lucide-react";
import type {
  AgentConfig,
  AgentDef,
  OperatingMode,
  PlanAgent,
  TriggerKind,
} from "@/lib/mock/types";
import { useDemoStore } from "@/lib/mock/store";
import { INTEGRATIONS } from "@/lib/mock/fixtures/integrations";
import { OWNER, PEOPLE } from "@/lib/mock/fixtures/ids";
import { money } from "@/lib/mock/pricing";
import { DUR, EASE, STAGGER } from "@/lib/mock/motion";
import { toast } from "@/components/mock/ui/Toaster";
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

const TRIGGER_ORDER: TriggerKind[] = [
  "event",
  "schedule",
  "threshold",
  "manual",
  "dependency",
  "approval",
];

const TRIGGER_META: Record<TriggerKind, { label: string; hint: string; icon: React.ReactNode }> = {
  event: { label: "Event", hint: "Something happens in a connected system", icon: <Zap size={13} aria-hidden /> },
  schedule: { label: "Schedule", hint: "Runs at set times", icon: <CalendarClock size={13} aria-hidden /> },
  threshold: { label: "Threshold", hint: "A number crosses a limit", icon: <Gauge size={13} aria-hidden /> },
  manual: { label: "Manual", hint: "Someone asks it to run", icon: <Hand size={13} aria-hidden /> },
  dependency: { label: "Dependency", hint: "Another workflow finishes first", icon: <Link2 size={13} aria-hidden /> },
  approval: { label: "Approval", hint: "A decision is approved", icon: <ShieldCheck size={13} aria-hidden /> },
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
  "Weekly — Fridays 09:00",
  "Event-driven — as qualifying work arrives",
];

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
    return structuredClone(rest);
  });
  const [newApproval, setNewApproval] = useState("");

  const patch = (p: Partial<ConfigDraft>) => setDraft((d) => ({ ...d, ...p }));

  const channelOptions = useMemo(() => {
    const names = def.integrations
      .map((r) => INTEGRATIONS[r.integrationId]?.name)
      .filter((n): n is string => Boolean(n));
    return Array.from(new Set([...def.defaultConfig.channels, ...names, ...draft.channels]));
  }, [def, draft.channels]);

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

  const workflowsOn = agent.workflowOrder.filter(
    (id) => agent.config.workflowsEnabled[id] ?? true,
  ).length;

  const approvalSuggestions = def.humanApprovals.filter(
    (a) => !draft.approvalActions.includes(a),
  );

  const summaryLine = [
    MODE_META[draft.operatingMode].label,
    `${draft.triggers.length} trigger${draft.triggers.length === 1 ? "" : "s"}`,
    `${workflowsOn}/${agent.workflowOrder.length} workflows on`,
    `${draft.approvalActions.length} approval action${draft.approvalActions.length === 1 ? "" : "s"}`,
    `Owner ${draft.processOwner}`,
  ].join(" · ");

  const save = () => {
    updateAgentConfig(def.id, draft);
    markAgentConfigured(def.id);
    toast({
      title: "Configuration saved",
      detail: `${def.name} is ready to build — ${MODE_META[draft.operatingMode].label.toLowerCase()}, ${workflowsOn} workflow${workflowsOn === 1 ? "" : "s"} enabled.`,
      tone: "ok",
    });
    router.push("/app/planner");
  };

  const toggleTrigger = (t: TriggerKind) =>
    patch({
      triggers: draft.triggers.includes(t)
        ? draft.triggers.filter((x) => x !== t)
        : [...draft.triggers, t],
    });

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
        {/* 1 — Operating mode */}
        <motion.section {...anim(0)} className={`oa-card ${styles.card}`}>
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
                  className={`${styles.modeCard} ${on ? styles.modeCardOn : ""}`}
                  onClick={() => patch({ operatingMode: mode })}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13.5,
                      fontWeight: 750,
                      color: on ? "var(--oa-blue-dark)" : "var(--oa-ink)",
                    }}
                  >
                    {MODE_META[mode].icon}
                    {MODE_META[mode].label}
                    {on && <Check size={13} aria-hidden style={{ marginLeft: "auto" }} />}
                  </span>
                  <span className="oa-sub" style={{ fontSize: 12.5 }}>
                    {MODE_META[mode].hint}
                  </span>
                </button>
              );
            })}
          </div>
        </motion.section>

        {/* 2 — Triggers */}
        <motion.section {...anim(1)} className={`oa-card ${styles.card}`}>
          <div style={{ display: "grid", gap: 3 }}>
            <h3 className="oa-h3">Triggers</h3>
            <p className="oa-sub">What starts this agent&rsquo;s work.</p>
          </div>
          <div className="oa-cluster" style={{ gap: 8 }}>
            {TRIGGER_ORDER.map((t) => {
              const on = draft.triggers.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  className={`oa-chip ${on ? "oa-chip--selected" : ""}`}
                  aria-pressed={on}
                  title={TRIGGER_META[t].hint}
                  onClick={() => toggleTrigger(t)}
                >
                  {TRIGGER_META[t].icon}
                  {TRIGGER_META[t].label}
                  {on && <Check size={13} aria-hidden />}
                </button>
              );
            })}
          </div>
          <p className="oa-sub" style={{ fontSize: 12 }}>
            {draft.triggers.length === 0
              ? "Pick at least one trigger so the agent knows when to start."
              : draft.triggers.map((t) => `${TRIGGER_META[t].label} — ${TRIGGER_META[t].hint.toLowerCase()}`).join(" · ")}
          </p>
        </motion.section>

        {/* 3 — Channels and systems */}
        <motion.section {...anim(2)} className={`oa-card ${styles.card}`}>
          <div style={{ display: "grid", gap: 3 }}>
            <h3 className="oa-h3">Channels and systems</h3>
            <p className="oa-sub">Where this agent is allowed to work, from its required connections.</p>
          </div>
          <div className="oa-cluster" style={{ gap: 8 }}>
            {channelOptions.map((name) => {
              const on = draft.channels.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  className={`oa-chip ${on ? "oa-chip--selected" : ""}`}
                  aria-pressed={on}
                  onClick={() => toggleChannel(name)}
                >
                  {name}
                  {on && <Check size={13} aria-hidden />}
                </button>
              );
            })}
          </div>
        </motion.section>

        {/* 4 — Workflows enabled */}
        <motion.section {...anim(3)} className={`oa-card ${styles.card}`}>
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
                    aria-label={`${wf.name} — ${enabled ? "enabled" : "disabled"}`}
                    className={`oa-switch ${enabled ? "oa-switch--on" : ""}`}
                    style={{ marginTop: 3 }}
                    onClick={() => toggleAgentWorkflow(def.id, wfId)}
                  />
                  <div style={{ display: "grid", gap: 5, minWidth: 0 }}>
                    <div className="oa-cluster" style={{ gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 750 }}>{wf.name}</span>
                      <span className="oa-tag oa-tag--neutral">
                        {TRIGGER_META[wf.trigger.kind].label}
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
        <motion.section {...anim(4)} className={`oa-card ${styles.card}`}>
          <div style={{ display: "grid", gap: 3 }}>
            <h3 className="oa-h3">Actions requiring human approval</h3>
            <p className="oa-sub">
              These always queue for a person — the agent cannot perform them alone.
            </p>
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {draft.approvalActions.map((a) => (
              <li
                key={a}
                className="oa-panel"
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}
              >
                <ShieldCheck size={15} aria-hidden style={{ color: "var(--oa-teal-deep)", flex: "none" }} />
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 650 }}>{a}</span>
                <button
                  type="button"
                  className="oa-btn oa-btn--ghost oa-btn--icon"
                  style={{ minHeight: 28, minWidth: 28 }}
                  aria-label={`Remove approval requirement: ${a}`}
                  onClick={() =>
                    patch({ approvalActions: draft.approvalActions.filter((x) => x !== a) })
                  }
                >
                  <X size={13} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          {approvalSuggestions.length > 0 && (
            <div className="oa-cluster" style={{ gap: 8 }}>
              {approvalSuggestions.map((a) => (
                <button key={a} type="button" className="oa-chip" onClick={() => addApproval(a)}>
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
        <motion.section {...anim(5)} className={`oa-card ${styles.card}`}>
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
        <motion.section {...anim(6)} className={`oa-card ${styles.card}`}>
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

        {/* 8 — Data access & forbidden (policy, read-only) */}
        <motion.section {...anim(7)} className={`oa-card oa-card--flat ${styles.card}`}>
          <div className="oa-between" style={{ gap: 10 }}>
            <div style={{ display: "grid", gap: 3 }}>
              <h3 className="oa-h3">Data access and hard limits</h3>
              <p className="oa-sub">
                Set by your approval restrictions from Discovery — policy, not preference. To change
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
                <span className="oa-sub" style={{ fontWeight: 600 }}>— illustrative pricing</span>
              </span>
              <span className={`oa-sub ${styles.stickyLine}`}>{summaryLine}</span>
            </div>
            <button type="button" className="oa-btn oa-btn--primary" onClick={save}>
              <Check size={15} aria-hidden />
              {agent.status === "needs_configuration"
                ? "Save configuration — mark ready"
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
            label="Triggers"
            value={
              draft.triggers.length
                ? draft.triggers.map((t) => TRIGGER_META[t].label).join(", ")
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
          <span className="oa-sim-note">Illustrative pricing — demo figures only.</span>
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
