"use client";
/**
 * TriggerSection — the "When it runs" chooser (improvement spec §12.5, P-03).
 * Six selectable trigger-type cards (multi-select, .oa-selectable compact +
 * .oa-check-badge). Selecting a type reveals its deterministic config fields
 * below the grid, and every selected type contributes one plain-language
 * summary line, persisted into config.triggerDetails by the parent and shown
 * in a live preview panel. Cards never change height on selection.
 */
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CalendarClock,
  Check,
  Gauge,
  Hand,
  Link2,
  ShieldCheck,
  Zap,
} from "lucide-react";
import type { AgentDef, TriggerKind } from "@/lib/mock/types";
import { useDemoStore } from "@/lib/mock/store";
import { AGENT_LIBRARY } from "@/lib/mock/fixtures/agent-library";
import { WF_NAME } from "@/lib/mock/fixtures/ids";
import { DUR, EASE } from "@/lib/mock/motion";
import styles from "./agents.module.css";

export const TRIGGER_ORDER: TriggerKind[] = [
  "event",
  "schedule",
  "threshold",
  "manual",
  "dependency",
  "approval",
];

/** One shared label/example set. "threshold" reads as "Condition" (spec §12.5). */
export const TRIGGER_TYPE_META: Record<
  TriggerKind,
  { label: string; example: string; icon: React.ReactNode }
> = {
  event: {
    label: "Event",
    example: "Something happens in a connected system, like a new enquiry",
    icon: <Zap size={15} aria-hidden />,
  },
  schedule: {
    label: "Schedule",
    example: "Runs at set times, like every Friday at 09:00",
    icon: <CalendarClock size={15} aria-hidden />,
  },
  threshold: {
    label: "Condition",
    example: "A number crosses a limit, like 5 overdue invoices",
    icon: <Gauge size={15} aria-hidden />,
  },
  manual: {
    label: "Manual",
    example: "Someone clicks Run now",
    icon: <Hand size={15} aria-hidden />,
  },
  dependency: {
    label: "Dependency",
    example: "Another workflow finishes first",
    icon: <Link2 size={15} aria-hidden />,
  },
  approval: {
    label: "Approval",
    example: "A decision is approved",
    icon: <ShieldCheck size={15} aria-hidden />,
  },
};

/* ── Deterministic per-type options ── */

const EVENT_SOURCES: { label: string; summary: string }[] = [
  { label: "New email in Gmail", summary: "Runs when a new email arrives in Gmail" },
  { label: "New WhatsApp message", summary: "Runs when a new WhatsApp message arrives" },
  { label: "New HubSpot enquiry", summary: "Runs when a new customer enquiry arrives" },
  {
    label: "Complaint marked high severity",
    summary: "Runs when a complaint is marked high severity",
  },
  { label: "New booking request", summary: "Runs when a new booking request arrives" },
];

const SCHEDULE_DAYS = [
  "Every weekday",
  "Every Monday",
  "Every Tuesday",
  "Every Wednesday",
  "Every Thursday",
  "Every Friday",
  "Every Saturday",
];

const SCHEDULE_TIMES = ["07:30", "08:00", "08:30", "09:00", "09:30", "12:00", "14:00", "17:00"];

const CONDITIONS: { label: string; summary: string }[] = [
  {
    label: "More than 5 overdue invoices",
    summary: "Runs when more than 5 invoices are overdue",
  },
  {
    label: "More than 10 enquiries waiting",
    summary: "Runs when more than 10 enquiries are waiting for a reply",
  },
  {
    label: "An invoice passes 30 days overdue",
    summary: "Runs when an invoice passes 30 days overdue",
  },
  {
    label: "Complaint backlog above 3 cases",
    summary: "Runs when the complaint backlog goes above 3 cases",
  },
];

const MANUAL_NOTE = "Owner or approved employee clicks Run now. No other setup needed.";
const MANUAL_SUMMARY = "Runs when the owner or an approved employee clicks Run now";

const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

interface TriggerFields {
  eventSource: string;
  scheduleDay: string;
  scheduleTime: string;
  condition: string;
  dependencyWorkflow: string;
  approvalRule: string;
}

function detailFor(kind: TriggerKind, f: TriggerFields): string {
  switch (kind) {
    case "event":
      return (
        EVENT_SOURCES.find((o) => o.label === f.eventSource)?.summary ?? EVENT_SOURCES[0].summary
      );
    case "schedule":
      return `Runs ${lcFirst(f.scheduleDay)} at ${f.scheduleTime}`;
    case "threshold":
      return CONDITIONS.find((o) => o.label === f.condition)?.summary ?? CONDITIONS[0].summary;
    case "manual":
      return MANUAL_SUMMARY;
    case "dependency":
      return `Runs after ${f.dependencyWorkflow} finishes`;
    case "approval":
      return `Runs when "${f.approvalRule}" is approved`;
  }
}

/** Seed field state from stored plain-language summaries (reverse lookup). */
function seedFields(
  details: Partial<Record<TriggerKind, string>>,
  workflowOptions: string[],
  approvalOptions: string[],
): TriggerFields {
  const eventSource =
    EVENT_SOURCES.find((o) => o.summary === details.event)?.label ?? EVENT_SOURCES[0].label;

  let scheduleDay = "Every weekday";
  let scheduleTime = "09:00";
  const sm = details.schedule?.match(/^Runs (every .+) at (\d{2}:\d{2})$/i);
  if (sm) {
    scheduleDay =
      SCHEDULE_DAYS.find((d) => d.toLowerCase() === sm[1].toLowerCase()) ?? scheduleDay;
    scheduleTime = SCHEDULE_TIMES.includes(sm[2]) ? sm[2] : scheduleTime;
  }

  const condition =
    CONDITIONS.find((o) => o.summary === details.threshold)?.label ?? CONDITIONS[0].label;

  const dep = details.dependency?.match(/^Runs after (.+) finishes$/)?.[1];
  const dependencyWorkflow =
    dep && workflowOptions.includes(dep) ? dep : (workflowOptions[0] ?? "");

  const ap = details.approval?.match(/^Runs when "(.+)" is approved$/)?.[1];
  const approvalRule = ap ?? approvalOptions[0] ?? "";

  return { eventSource, scheduleDay, scheduleTime, condition, dependencyWorkflow, approvalRule };
}

export default function TriggerSection({
  def,
  triggers,
  details,
  approvalOptions,
  onChange,
}: {
  def: AgentDef;
  triggers: TriggerKind[];
  details: Partial<Record<TriggerKind, string>>;
  /** Approval rules offered by the Approval trigger select. */
  approvalOptions: string[];
  onChange: (next: {
    triggers: TriggerKind[];
    triggerDetails: Partial<Record<TriggerKind, string>>;
  }) => void;
}) {
  const reduced = useReducedMotion();
  const planAgents = useDemoStore((s) => s.plan.agents);

  /** Every workflow currently in the plan, for the Dependency select. */
  const workflowOptions = useMemo(() => {
    const names: string[] = [];
    for (const a of planAgents) {
      const adef = AGENT_LIBRARY[a.agentId];
      for (const wfId of a.workflowOrder) {
        const name = adef?.workflows.find((w) => w.id === wfId)?.name ?? WF_NAME[wfId] ?? wfId;
        if (!names.includes(name)) names.push(name);
      }
    }
    return names;
  }, [planAgents]);

  const [fields, setFields] = useState<TriggerFields>(() =>
    seedFields(details, workflowOptions, approvalOptions),
  );

  /* Fill in summary lines for types selected before this UI existed, once. */
  useEffect(() => {
    const missing = triggers.filter((t) => !details[t]);
    if (missing.length > 0) {
      const next = { ...details };
      for (const t of missing) next[t] = detailFor(t, fields);
      onChange({ triggers, triggerDetails: next });
    }
    // Mount-only backfill; toggles keep details in sync afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = TRIGGER_ORDER.filter((t) => triggers.includes(t));

  const toggle = (kind: TriggerKind) => {
    const on = triggers.includes(kind);
    const nextTriggers = on
      ? triggers.filter((t) => t !== kind)
      : TRIGGER_ORDER.filter((t) => triggers.includes(t) || t === kind);
    const nextDetails = { ...details };
    if (on) delete nextDetails[kind];
    else nextDetails[kind] = detailFor(kind, fields);
    onChange({ triggers: nextTriggers, triggerDetails: nextDetails });
  };

  const setField = (kind: TriggerKind, patch: Partial<TriggerFields>) => {
    const next = { ...fields, ...patch };
    setFields(next);
    onChange({ triggers, triggerDetails: { ...details, [kind]: detailFor(kind, next) } });
  };

  /* Keep the current value selectable even if its source list changed. */
  const dependencyChoices = workflowOptions.includes(fields.dependencyWorkflow)
    ? workflowOptions
    : [fields.dependencyWorkflow, ...workflowOptions].filter(Boolean);
  const approvalChoices = approvalOptions.includes(fields.approvalRule)
    ? approvalOptions
    : [fields.approvalRule, ...approvalOptions].filter(Boolean);

  const reveal = reduced
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -6 },
        transition: { duration: DUR.micro, ease: EASE },
      };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Type cards — multi-select, constant height */}
      <div className={styles.triggerGrid} role="group" aria-label="Trigger types">
        {TRIGGER_ORDER.map((kind) => {
          const meta = TRIGGER_TYPE_META[kind];
          const on = triggers.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={on}
              className={`oa-selectable ${styles.triggerCard} ${on ? "oa-selectable--selected" : ""}`}
              onClick={() => toggle(kind)}
            >
              <span
                className={styles.triggerIcon}
                aria-hidden
                style={
                  on ? { background: "var(--oa-soft-blue)", color: "var(--oa-blue-dark)" } : undefined
                }
              >
                {meta.icon}
              </span>
              <span style={{ display: "grid", gap: 3, minWidth: 0 }}>
                <span style={{ fontSize: 13.5, fontWeight: 750 }}>{meta.label}</span>
                <span className="oa-sub" style={{ fontSize: 12 }}>
                  {meta.example}
                </span>
              </span>
              <span className="oa-check-badge" aria-hidden>
                <Check size={13} />
              </span>
            </button>
          );
        })}
      </div>

      {/* Per-type config fields — revealed below the grid, never inside cards */}
      <AnimatePresence initial={false}>
        {selected.map((kind) => (
          <motion.div
            key={kind}
            {...reveal}
            className={`oa-panel ${styles.triggerConfig}`}
            aria-label={`${TRIGGER_TYPE_META[kind].label} trigger details`}
          >
            <p className="oa-micro" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <span aria-hidden style={{ display: "inline-flex", color: "var(--oa-muted-strong)" }}>
                {TRIGGER_TYPE_META[kind].icon}
              </span>
              {TRIGGER_TYPE_META[kind].label} details
            </p>

            {kind === "event" && (
              <div className="oa-field">
                <label className="oa-label" htmlFor={`${def.id}-trig-event`}>
                  Event source
                </label>
                <select
                  id={`${def.id}-trig-event`}
                  className="oa-select"
                  value={fields.eventSource}
                  onChange={(e) => setField("event", { eventSource: e.target.value })}
                >
                  {EVENT_SOURCES.map((o) => (
                    <option key={o.label} value={o.label}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {kind === "schedule" && (
              <div className={styles.triggerFieldRow}>
                <div className="oa-field">
                  <label className="oa-label" htmlFor={`${def.id}-trig-day`}>
                    Day
                  </label>
                  <select
                    id={`${def.id}-trig-day`}
                    className="oa-select"
                    value={fields.scheduleDay}
                    onChange={(e) => setField("schedule", { scheduleDay: e.target.value })}
                  >
                    {SCHEDULE_DAYS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="oa-field">
                  <label className="oa-label" htmlFor={`${def.id}-trig-time`}>
                    Time
                  </label>
                  <select
                    id={`${def.id}-trig-time`}
                    className="oa-select"
                    value={fields.scheduleTime}
                    onChange={(e) => setField("schedule", { scheduleTime: e.target.value })}
                  >
                    {SCHEDULE_TIMES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {kind === "threshold" && (
              <div className="oa-field">
                <label className="oa-label" htmlFor={`${def.id}-trig-condition`}>
                  Condition
                </label>
                <select
                  id={`${def.id}-trig-condition`}
                  className="oa-select"
                  value={fields.condition}
                  onChange={(e) => setField("threshold", { condition: e.target.value })}
                >
                  {CONDITIONS.map((o) => (
                    <option key={o.label} value={o.label}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {kind === "manual" && (
              <p className="oa-sub" style={{ fontSize: 13, color: "var(--oa-ink)" }}>
                {MANUAL_NOTE}
              </p>
            )}

            {kind === "dependency" && (
              <div className="oa-field">
                <label className="oa-label" htmlFor={`${def.id}-trig-dependency`}>
                  Runs after this workflow
                </label>
                <select
                  id={`${def.id}-trig-dependency`}
                  className="oa-select"
                  value={fields.dependencyWorkflow}
                  onChange={(e) => setField("dependency", { dependencyWorkflow: e.target.value })}
                >
                  {dependencyChoices.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {kind === "approval" && (
              <div className="oa-field">
                <label className="oa-label" htmlFor={`${def.id}-trig-approval`}>
                  Approval rule
                </label>
                <select
                  id={`${def.id}-trig-approval`}
                  className="oa-select"
                  value={fields.approvalRule}
                  onChange={(e) => setField("approval", { approvalRule: e.target.value })}
                >
                  {approvalChoices.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Live plain-language preview (P-03) */}
      <div className={`oa-panel ${styles.triggerConfig}`} aria-live="polite">
        <p className="oa-micro">In plain language</p>
        {selected.length === 0 ? (
          <p className="oa-sub" style={{ fontSize: 12.5 }}>
            Pick at least one trigger type so the agent knows when to start.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 5 }}>
            {selected.map((kind) => (
              <p
                key={kind}
                className="oa-sub"
                style={{
                  display: "flex",
                  gap: 7,
                  alignItems: "flex-start",
                  color: "var(--oa-ink)",
                  fontSize: 13,
                  margin: 0,
                }}
              >
                <Check
                  size={13}
                  aria-hidden
                  style={{ flex: "none", marginTop: 3, color: "var(--oa-teal-deep)" }}
                />
                {details[kind] ?? detailFor(kind, fields)}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
