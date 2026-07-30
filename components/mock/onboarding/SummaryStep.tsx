"use client";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, FileCheck2, Pencil, ShieldCheck } from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import { DEMO_COMPANY, TOOL_CATALOG } from "@/lib/mock/fixtures/demo-company";
import { fadeUp } from "@/lib/mock/motion";
import type { AutomationScope } from "@/lib/mock/types";
import styles from "./onboarding.module.css";

const STEP_MAP = {
  setup: 0,
  business: 1,
  workflow: 3,
} as const;

const SCOPE_LABELS: Record<AutomationScope, string> = {
  start_small: "Start with one task",
  focus_area: "Improve one business area",
  whole_business: "Analyse the whole business",
};

const TOOL_NAME = new Map(TOOL_CATALOG.map((tool) => [tool.id, tool.name]));

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function firstRecommendation(scope: AutomationScope | null, area: string, task: string): string {
  if (!task.trim()) return "Oriant will recommend the safest useful first step once the task is clear.";
  if (scope === "whole_business") {
    return `Start by mapping how ${task.toLowerCase()} works inside ${area || "the business"}, then recommend the first low-risk milestone before expanding further.`;
  }
  if (scope === "focus_area") {
    return `Start inside ${area || "the chosen area"} by standardising ${task.toLowerCase()} and keeping the first workflow behind a human approval step.`;
  }
  return `Start small by removing the most repetitive step inside ${task.toLowerCase()} and proving value quickly.`;
}

export default function SummaryStep({
  channel,
  organizationShape,
  automationScope,
  businessArea,
  repetitiveTask,
  currentWorkflow,
  employeeCount,
  approvalOwner,
  employeeEmails,
  departmentApprovals,
  syncStatus,
  blueprintVersion,
  blueprintStatus,
  consentChecked,
  onConsentChange,
  onEditStep,
}: {
  channel: "typed" | "voice";
  organizationShape: "solo" | "owner_with_team" | "multi_role_team" | "manager_led";
  automationScope: AutomationScope | null;
  businessArea: string;
  repetitiveTask: string;
  currentWorkflow: string;
  employeeCount: string;
  approvalOwner: string;
  employeeEmails: string[];
  departmentApprovals: unknown[];
  syncStatus: "idle" | "saving" | "saved" | "error";
  blueprintVersion: number | null;
  blueprintStatus: "idle" | "draft" | "approved";
  consentChecked: boolean;
  onConsentChange: (checked: boolean) => void;
  onEditStep: (step: number) => void;
}) {
  const onboarding = useDemoStore((state) => state.onboarding);
  const reduced = useReducedMotion();
  void approvalOwner;
  void employeeEmails;
  void departmentApprovals;

  const toolNames = [
    ...onboarding.selectedToolIds
      .map((id) => TOOL_NAME.get(id))
      .filter((name): name is string => Boolean(name)),
    ...onboarding.customTools.map((tool) => tool.name),
  ];

  const confidence = Math.min(
    95,
    35
      + (automationScope ? 15 : 0)
      + (onboarding.intro.trim() ? 16 : 0)
      + (businessArea.trim() ? 10 : 0)
      + (repetitiveTask.trim() ? 12 : 0)
      + (currentWorkflow.trim() ? 12 : 0)
      + Math.min(toolNames.length * 3, 9),
  );

  const briefSections: Array<{
    id: keyof typeof STEP_MAP;
    title: string;
    body: string;
  }> = [
    {
      id: "setup",
      title: "Automation approach",
      body: automationScope
        ? `${SCOPE_LABELS[automationScope]} · ${organizationShape.replaceAll("_", " ")}`
        : "Not captured yet",
    },
    {
      id: "business",
      title: "Business snapshot",
      body: onboarding.intro.trim()
        ? `“${clip(onboarding.intro.trim(), 110)}”`
        : "Not captured yet",
    },
    {
      id: "workflow",
      title: "Workflow focus",
      body: repetitiveTask.trim()
        ? `${businessArea || "Selected area"} · ${repetitiveTask}`
        : "Not captured yet",
    },
  ];

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <h2 className="oa-h3">Your first automation brief</h2>
        <p className="oa-sub">
          This review should feel like a clear business brief: what area needs help, what task is repetitive, how it works today, and what Oriant should do first.
        </p>
        <p className="oa-sub" style={{ margin: 0 }}>
          {channel === "voice" ? "Voice" : "Typed"} is your current onboarding method.
          {syncStatus === "saving" ? " Saving to the shared onboarding session…" : ""}
          {syncStatus === "saved" ? " Saved to the shared onboarding session." : ""}
          {syncStatus === "error" ? " Save failed locally. Refresh before continuing." : ""}
        </p>
      </div>

      <div className={styles.progressPanel}>
        <div className={styles.progressMetric}>
          <span className="oa-micro">Discovery confidence</span>
          <strong>{confidence}%</strong>
          <span className="oa-sub">Strong enough to draft the first automation recommendation.</span>
        </div>
        <div className={styles.progressMetric}>
          <span className="oa-micro">Recommended first direction</span>
          <strong>{automationScope ? SCOPE_LABELS[automationScope] : "Choose an approach first"}</strong>
          <span className="oa-sub">{firstRecommendation(automationScope, businessArea, repetitiveTask)}</span>
        </div>
      </div>

      <ul className={styles.checkList}>
        {briefSections.map((section, index) => (
          <motion.li
            key={section.id}
            className={styles.checkRow}
            variants={fadeUp}
            initial={reduced ? false : "hidden"}
            animate="show"
            custom={index}
          >
            <span className={styles.checkIconDone} aria-hidden>
              <Check size={13} />
            </span>
            <div>
              <div className={styles.checkTitleRow}>
                <strong style={{ fontSize: 14.5 }}>{section.title}</strong>
                <span className="oa-status oa-status--completed">Captured</span>
              </div>
              <p className="oa-sub">{section.body}</p>
            </div>
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--sm"
              onClick={() => onEditStep(STEP_MAP[section.id])}
            >
              <Pencil size={12} aria-hidden />
              Edit
            </button>
          </motion.li>
        ))}
      </ul>

      <div className={styles.blueprintCard}>
        <div style={{ display: "grid", gap: 4 }}>
          <h3 className="oa-h3">How the task works today</h3>
          <p className="oa-sub" style={{ margin: 0 }}>
            Oriant should understand the current process before drafting automation.
          </p>
        </div>
        <p className="oa-sub" style={{ margin: 0 }}>
          {currentWorkflow.trim()
            ? currentWorkflow
            : "Add a short workflow description in the previous step so Oriant can propose a more precise starting point."}
        </p>
        {toolNames.length > 0 && (
          <div className={styles.railChips}>
            {toolNames.map((name) => (
              <span key={name} className="oa-chip">
                {name}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className={styles.blueprintCard}>
        <div style={{ display: "grid", gap: 4 }}>
          <h3 className="oa-h3">What Oriant should help with first</h3>
          <p className="oa-sub" style={{ margin: 0 }}>
            Recommendation: keep the first automation small, safe and clearly reviewable.
          </p>
        </div>
        <p className="oa-sub" style={{ margin: 0 }}>
          {firstRecommendation(automationScope, businessArea, repetitiveTask)}
        </p>
      </div>

      <div className={styles.consentCard}>
        <div style={{ display: "grid", gap: 4 }}>
          <h3 className="oa-h3">Permissions and consent</h3>
          <p className="oa-sub">Plain language: what Oriant may read, draft and never automate.</p>
        </div>
        <ul className={styles.consentLines}>
          <li>
            <ShieldCheck size={15} aria-hidden />
            <span>Oriant reads only from tools you connect later, with scopes you approve.</span>
          </li>
          <li>
            <ShieldCheck size={15} aria-hidden />
            <span>Drafts and recommendations stay reviewable before anything customer-facing is sent.</span>
          </li>
          <li>
            <ShieldCheck size={15} aria-hidden />
            <span>These always wait for human approval: {DEMO_COMPANY.alwaysApprove.join(", ").toLowerCase()}.</span>
          </li>
          <li>
            <ShieldCheck size={15} aria-hidden />
            <span>Never automated: {DEMO_COMPANY.neverAutomate.join(", ").toLowerCase()}.</span>
          </li>
        </ul>
        <label className={styles.consentCheck}>
          <input
            type="checkbox"
            checked={consentChecked}
            onChange={(e) => onConsentChange(e.target.checked)}
          />
          <span>
            I understand what Oriant may read and draft, and what always needs my approval.
          </span>
        </label>
      </div>

      <div className={styles.blueprintCard}>
        <div style={{ display: "grid", gap: 4 }}>
          <h3 className="oa-h3">What happens after this</h3>
          <p className="oa-sub" style={{ margin: 0 }}>
            Once you continue, Oriant moves into the interview to understand the workflow in more detail before drafting the business blueprint.
          </p>
        </div>
        <div className={styles.blueprintTimeline}>
          <div className={styles.blueprintTimelineRow}>
            <span className={styles.blueprintStepNum}>1</span>
            <div className={styles.blueprintTimelineBody}>
              <strong>Interview the workflow</strong>
              <span className="oa-sub">Oriant asks tailored follow-up questions and captures the real process.</span>
            </div>
          </div>
          <div className={styles.blueprintTimelineRow}>
            <span className={styles.blueprintStepNum}>2</span>
            <div className={styles.blueprintTimelineBody}>
              <strong>Draft the business blueprint</strong>
              <span className="oa-sub">You review the summary after the interview, not during setup.</span>
            </div>
          </div>
        </div>
        {(blueprintStatus !== "idle" || blueprintVersion) && (
          <div className={styles.blueprintMeta}>
            <span className="oa-sub">
              Internal status: <strong>{blueprintStatus}</strong>
              {blueprintVersion ? ` · version ${blueprintVersion}` : ""}
            </span>
          </div>
        )}
        <div className={styles.blueprintInlineNote}>
          <FileCheck2 size={15} aria-hidden />
          <span>The next visible milestone for the owner is the business blueprint review after the interview.</span>
        </div>
      </div>
    </div>
  );
}
