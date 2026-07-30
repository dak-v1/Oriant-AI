"use client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRightCircle, Building2, Check, SearchCode, Send, ShieldCheck, Users } from "lucide-react";
import type {
  AutomationScope,
  BuilderAccess,
  OrganizationShape,
  WorkflowBuilder,
} from "@/lib/mock/types";
import { DEMO_COMPANY, TOOL_CATALOG } from "@/lib/mock/fixtures/demo-company";
import { DUR, EASE } from "@/lib/mock/motion";
import styles from "./onboarding.module.css";

const TEAM_OPTIONS: Array<{
  id: OrganizationShape;
  title: string;
  body: string;
  icon: typeof Building2;
}> = [
  {
    id: "solo",
    title: "Just me",
    body: "Keep the setup tight and move quickly.",
    icon: Building2,
  },
  {
    id: "owner_with_team",
    title: "Me and my team",
    body: "Start with the right people involved when needed.",
    icon: Users,
  },
];

const BUILDER_OPTIONS: Array<{
  id: WorkflowBuilder;
  title: string;
  body: string;
}> = [
  {
    id: "self",
    title: "I'll build it myself",
    body: "You stay hands-on for the first setup.",
  },
  {
    id: "invite",
    title: "I want someone else to build it",
    body: "Invite a teammate or operator to handle setup.",
  },
];

const ACCESS_OPTIONS: Array<{
  id: BuilderAccess;
  title: string;
  body: string;
  icon: typeof ShieldCheck;
}> = [
  {
    id: "workflows_only",
    title: "Build workflows only",
    body: "They can set up workflows, but not billing or users.",
    icon: ShieldCheck,
  },
  {
    id: "account_manager",
    title: "Build workflows + manage the account",
    body: "They can manage workflows, billing, users, and settings.",
    icon: ShieldCheck,
  },
];

const SCOPE_OPTIONS: Array<{
  id: AutomationScope;
  title: string;
  body: string;
  support: string;
  icon: typeof ArrowRightCircle;
}> = [
  {
    id: "start_small",
    title: "Start with one task",
    body: "Pick one repetitive task and prove value quickly.",
    support: "Best for a fast first win.",
    icon: ArrowRightCircle,
  },
  {
    id: "focus_area",
    title: "Improve one business area",
    body: "Focus on one area like ops, sales, or finance.",
    support: "Best if you know where the pressure is.",
    icon: SearchCode,
  },
  {
    id: "whole_business",
    title: "Analyse the whole business",
    body: "Review multiple areas and build a broader plan.",
    support: "Best for analysing the whole business and finding what to automate first.",
    icon: Users,
  },
];

const TOOL_NAME = new Map(TOOL_CATALOG.map((tool) => [tool.id, tool.name]));

export default function ModeStep({
  organizationShape,
  workflowBuilder,
  builderAccess,
  automationScope,
  usedDemo,
  selectedToolIds,
  onOrganizationShapeChange,
  onWorkflowBuilderChange,
  onBuilderAccessChange,
  onAutomationScopeChange,
  onUseDemo,
}: {
  organizationShape: OrganizationShape;
  workflowBuilder: WorkflowBuilder | null;
  builderAccess: BuilderAccess | null;
  automationScope: AutomationScope | null;
  usedDemo: boolean;
  selectedToolIds: string[];
  onOrganizationShapeChange: (shape: OrganizationShape) => void;
  onWorkflowBuilderChange: (builder: WorkflowBuilder) => void;
  onBuilderAccessChange: (access: BuilderAccess) => void;
  onAutomationScopeChange: (scope: AutomationScope) => void;
  onUseDemo: () => void;
}) {
  const reduced = useReducedMotion();
  const toolNames = selectedToolIds
    .map((id) => TOOL_NAME.get(id))
    .filter((name): name is string => Boolean(name));

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <h2 className="oa-h3">Set up your discovery</h2>
        <p className="oa-sub">
          A few quick choices first, then we&apos;ll narrow into the workflow you want to improve.
        </p>
      </div>

      <div className={styles.setupPanel}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 4 }}>
            <label className="oa-label">Is it just you, or are you setting this up with a team?</label>
          </div>
          <div className={styles.setupGridTwo}>
            {TEAM_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = option.id === "solo" ? organizationShape === "solo" : organizationShape !== "solo";
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`oa-selectable ${styles.setupCard} ${selected ? "oa-selectable--selected" : ""}`}
                  aria-pressed={selected}
                  onClick={() => onOrganizationShapeChange(option.id)}
                >
                  <span className={styles.modeBody}>
                    <span className={styles.modeTop}>
                      <span className={styles.modeIcon}>
                        <Icon size={17} aria-hidden />
                      </span>
                      <span className="oa-radio" aria-hidden />
                    </span>
                    <span className={styles.modeText}>
                      <span className={styles.modeTitle}>{option.title}</span>
                      <span className="oa-sub">{option.body}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 4 }}>
            <label className="oa-label">Who&apos;s going to build your first workflow?</label>
          </div>
          <div className={styles.setupGridTwo}>
            {BUILDER_OPTIONS.map((option) => {
              const selected = workflowBuilder === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`oa-selectable ${styles.setupCard} ${selected ? "oa-selectable--selected" : ""}`}
                  aria-pressed={selected}
                  onClick={() => onWorkflowBuilderChange(option.id)}
                >
                  <span className={styles.modeBody}>
                    <span className={styles.modeTop}>
                      <span className={styles.modeMiniLabel}>Workflow owner</span>
                      <span className="oa-radio" aria-hidden />
                    </span>
                    <span className={styles.modeText}>
                      <span className={styles.modeTitle}>{option.title}</span>
                      <span className="oa-sub">{option.body}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {workflowBuilder === "invite" && (
            <motion.div
              key="builder-access"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DUR.card, ease: EASE }}
              className={styles.setupInfoCard}
            >
              <div style={{ display: "grid", gap: 4 }}>
                <label className="oa-label">What should they be able to do?</label>
              </div>
              <div className={styles.setupGridTwo}>
                {ACCESS_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const selected = builderAccess === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`oa-selectable ${styles.setupCard} ${selected ? "oa-selectable--selected" : ""}`}
                      aria-pressed={selected}
                      onClick={() => onBuilderAccessChange(option.id)}
                    >
                      <span className={styles.modeBody}>
                        <span className={styles.modeTop}>
                          <span className={styles.modeIcon}>
                            <Icon size={17} aria-hidden />
                          </span>
                          <span className="oa-radio" aria-hidden />
                        </span>
                        <span className={styles.modeText}>
                          <span className={styles.modeTitle}>{option.title}</span>
                          <span className="oa-sub">{option.body}</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={styles.setupPanel}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 4 }}>
            <label className="oa-label">How do you want to start?</label>
            <p className="oa-sub" style={{ margin: 0 }}>
              This controls how focused the onboarding stays.
            </p>
          </div>
          <div className={styles.setupGrid}>
            {SCOPE_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = automationScope === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`oa-selectable ${styles.setupCard} ${selected ? "oa-selectable--selected" : ""}`}
                  aria-pressed={selected}
                  onClick={() => onAutomationScopeChange(option.id)}
                >
                  <span className={styles.modeBody}>
                    <span className={styles.modeTop}>
                      <span className={styles.modeIcon}>
                        <Icon size={17} aria-hidden />
                      </span>
                      <span className="oa-radio" aria-hidden />
                    </span>
                    <span className={styles.modeText}>
                      <span className={styles.modeTitle}>{option.title}</span>
                      <span className="oa-sub">{option.body}</span>
                    </span>
                    <span className={styles.modeRec}>{option.support}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <span className="oa-sim-note">
            You can always start small and expand later.
          </span>
        </div>
      </div>

      <div className={styles.demoPanel} data-demo-label>
        <div>
          <span className="oa-micro">Shortcut</span>
          <h3 className="oa-h3">Try it with a ready-made company</h3>
          <p className="oa-sub">
            {DEMO_COMPANY.name}: {DEMO_COMPANY.teamSize} people in{" "}
            {DEMO_COMPANY.location}, already scoped around one workflow.
          </p>
        </div>
        <button
          type="button"
          className="oa-btn oa-btn--soft"
          onClick={onUseDemo}
          disabled={usedDemo}
        >
          {usedDemo ? <Check size={15} aria-hidden /> : <Send size={15} aria-hidden />}
          {usedDemo ? "Demo company loaded" : "Use demo company"}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {usedDemo && (
          <motion.div
            key="demo-confirm"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.card, ease: EASE }}
            style={{ display: "grid", gap: 8 }}
          >
            <ul className={styles.demoList} aria-live="polite">
              <li>
                <Check size={14} aria-hidden />
                <span>Automation scope is set to improving one business area first.</span>
              </li>
              <li>
                <Check size={14} aria-hidden />
                <span>The business introduction, biggest time drain, and current workflow are drafted in the next steps.</span>
              </li>
              <li>
                <Check size={14} aria-hidden />
                <span>
                  {toolNames.length} tools selected: {toolNames.slice(0, 3).join(", ")}
                  {toolNames.length > 3 ? " and more" : ""}.
                </span>
              </li>
            </ul>
            <span className="oa-sim-note">
              Prepared demo profile. Nothing is imported from real accounts.
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
