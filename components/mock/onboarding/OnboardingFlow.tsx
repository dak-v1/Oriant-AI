"use client";
/**
 * OnboardingFlow — the /app/onboarding experience (spec §7, §20 Onboarding row).
 *
 * Five horizontally-transitioning steps (Setup → Business → Focus → Tools →
 * Review) with a persistent "What we've captured" rail. Question cards slide
 * horizontally; captured facts settle into the summary rail. All content
 * comes from fixtures; all state lives in the demo store.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { ArrowRight, Check, ChevronLeft } from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import { useApCommand } from "@/lib/mock/autopilot";
import { AP } from "@/components/mock/autopilot/script";
import type {
  AutomationScope,
  AutomationMode,
  BuilderAccess,
  DepartmentApproval,
  WorkflowBuilder,
} from "@/lib/mock/types";
import { DUR, EASE } from "@/lib/mock/motion";
import { toast } from "@/components/mock/ui/Toaster";
import CaptureRail from "./CaptureRail";
import ModeStep from "./ModeStep";
import IntroStep from "./IntroStep";
import ToolsStep from "./ToolsStep";
import SummaryStep from "./SummaryStep";
import styles from "./onboarding.module.css";

const STEPS = [
  { id: "welcome", label: "Setup" },
  { id: "intro", label: "Business" },
  { id: "focus", label: "Focus" },
  { id: "tools", label: "Tools" },
  { id: "review", label: "Discovery" },
] as const;

function stepVariants(reduced: boolean): Variants {
  if (reduced) {
    return {
      enter: { opacity: 0 },
      center: { opacity: 1, transition: { duration: 0.15 } },
      exit: { opacity: 0, transition: { duration: 0.1 } },
    };
  }
  return {
    enter: (dir: number) => ({ opacity: 0, x: 56 * dir }),
    center: { opacity: 1, x: 0, transition: { duration: DUR.page, ease: EASE } },
    exit: (dir: number) => ({
      opacity: 0,
      x: -56 * dir,
      transition: { duration: DUR.card * 0.6, ease: EASE },
    }),
  };
}

export default function OnboardingFlow() {
  const router = useRouter();
  const reduced = useReducedMotion();

  const onboarding = useDemoStore((s) => s.onboarding);
  const beginJourney = useDemoStore((s) => s.beginJourney);
  const setJourney = useDemoStore((s) => s.setJourney);
  const syncOnboardingFromServer = useDemoStore((s) => s.syncOnboardingFromServer);
  const setBackendSession = useDemoStore((s) => s.setBackendSession);
  const setOnboardingSync = useDemoStore((s) => s.setOnboardingSync);
  const setMode = useDemoStore((s) => s.setMode);
  const setIntro = useDemoStore((s) => s.setIntro);
  const setOrganizationShape = useDemoStore((s) => s.setOrganizationShape);
  const setWorkflowBuilder = useDemoStore((s) => s.setWorkflowBuilder);
  const setBuilderAccess = useDemoStore((s) => s.setBuilderAccess);
  const setAutomationScope = useDemoStore((s) => s.setAutomationScope);
  const setBusinessArea = useDemoStore((s) => s.setBusinessArea);
  const setRepetitiveTask = useDemoStore((s) => s.setRepetitiveTask);
  const setCurrentWorkflow = useDemoStore((s) => s.setCurrentWorkflow);
  const applyDemoCompany = useDemoStore((s) => s.useDemoCompany);
  const toggleTool = useDemoStore((s) => s.toggleTool);
  const captureSection = useDemoStore((s) => s.captureSection);
  const acceptConsent = useDemoStore((s) => s.acceptConsent);
  const completeOnboarding = useDemoStore((s) => s.completeOnboarding);
  const employeeEmails = onboarding.employeeEmails ?? [];
  const departmentApprovals = onboarding.departmentApprovals ?? [];

  /* Returning visitors who finished onboarding land on the review step. */
  const [step, setStep] = useState(() =>
    useDemoStore.getState().onboarding.completed ? 4 : 0,
  );
  const [maxVisited, setMaxVisited] = useState(() =>
    useDemoStore.getState().onboarding.completed ? 4 : 0,
  );
  const [dir, setDir] = useState(1);

  /* Consent checkbox mirrors the store but stays locally toggleable. */
  const [consentChecked, setConsentChecked] = useState(false);
  const consentTouched = useRef(false);
  useEffect(() => {
    if (!consentTouched.current && onboarding.consentAccepted) setConsentChecked(true);
  }, [onboarding.consentAccepted]);

  /* Spec §7: the journey begins on first meaningful interaction (mount). */
  useEffect(() => {
    beginJourney();
  }, [beginJourney]);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      try {
        const res = await fetch("/api/onboarding/session", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load onboarding session.");
        const data = (await res.json()) as {
          session: {
            id: string;
            preferredChannel: "typed" | "voice";
            currentStep: "welcome" | "intro" | "focus" | "tools" | "review";
            organization: {
              shape: "solo" | "owner_with_team" | "multi_role_team" | "manager_led";
              employeeCount?: number;
              approvalOwner?: string;
              employeeEmails?: string[];
            };
            selectedToolIds: string[];
            consentAccepted: boolean;
            blueprint?: { version: number; status: "draft" | "approved" };
            handoff?: { id: string };
            answers: Record<string, { value: string | string[] | boolean | number | DepartmentApproval[] }>;
          };
        };
        if (!cancelled) {
          const workflowBuilder = typeof data.session.answers.setup_builder?.value === "string"
            ? data.session.answers.setup_builder.value as WorkflowBuilder
            : "self";
          const automationScope = typeof data.session.answers.automation_scope?.value === "string"
            ? data.session.answers.automation_scope.value as AutomationScope
            : "focus_area";

          setBackendSession(data.session.id);
          syncOnboardingFromServer({
            channel: data.session.preferredChannel,
            intro: typeof data.session.answers.company_intro?.value === "string"
              ? data.session.answers.company_intro.value
              : "",
            mode: typeof data.session.answers.automation_mode?.value === "string"
              ? data.session.answers.automation_mode.value as AutomationMode
              : null,
            organizationShape: data.session.organization.shape,
            workflowBuilder,
            builderAccess: typeof data.session.answers.setup_builder_access?.value === "string"
              ? data.session.answers.setup_builder_access.value as BuilderAccess
              : null,
            automationScope,
            businessArea: typeof data.session.answers.business_area?.value === "string"
              ? data.session.answers.business_area.value
              : "",
            repetitiveTask: typeof data.session.answers.repetitive_task?.value === "string"
              ? data.session.answers.repetitive_task.value
              : "",
            currentWorkflow: typeof data.session.answers.current_workflow?.value === "string"
              ? data.session.answers.current_workflow.value
              : "",
            employeeCount: data.session.organization.employeeCount
              ? String(data.session.organization.employeeCount)
              : "",
            approvalOwner: data.session.organization.approvalOwner ?? "",
            employeeEmails: Array.isArray(data.session.answers.employee_emails?.value)
              ? data.session.answers.employee_emails.value as string[]
              : (data.session.organization.employeeEmails ?? []),
            departmentApprovals: Array.isArray(data.session.answers.department_approvals?.value)
              ? data.session.answers.department_approvals.value as DepartmentApproval[]
              : [],
            selectedToolIds: data.session.selectedToolIds,
            consentAccepted: data.session.consentAccepted,
            completed: data.session.blueprint?.status === "approved",
            blueprintVersion: data.session.blueprint?.version ?? null,
            blueprintStatus: data.session.blueprint?.status ?? "idle",
            handoffId: data.session.handoff?.id ?? null,
          });
          const resumedStep = STEPS.findIndex((item) => item.id === data.session.currentStep);
          if (resumedStep >= 0) {
            setStep(resumedStep);
            setMaxVisited((current) => Math.max(current, resumedStep));
          }
          if (!data.session.answers.setup_builder?.value || !data.session.answers.automation_scope?.value) {
            void fetch("/api/onboarding/session", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workflowBuilder,
                automationScope,
              }),
            });
          }
        }
      } catch (err) {
        if (!cancelled) {
          setOnboardingSync("error", err instanceof Error ? err.message : "Could not load onboarding.");
        }
      }
    };
    if (!onboarding.backendSessionId) void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [onboarding.backendSessionId, setBackendSession, setOnboardingSync, syncOnboardingFromServer]);

  const persistPatch = async (patch: Record<string, unknown>) => {
    setOnboardingSync("saving");
    try {
      const res = await fetch("/api/onboarding/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Could not save onboarding progress.");
      setOnboardingSync("saved");
    } catch (err) {
      setOnboardingSync("error", err instanceof Error ? err.message : "Could not save onboarding progress.");
    }
  };

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(STEPS.length - 1, next));
    setDir(clamped > step ? 1 : -1);
    setStep(clamped);
    setMaxVisited((m) => Math.max(m, clamped));
    void persistPatch({ currentStep: STEPS[clamped].id });
  };

  const onChangeWorkflowBuilder = (builder: WorkflowBuilder) => {
    setWorkflowBuilder(builder);
    if (builder === "self") {
      setBuilderAccess(null);
      void persistPatch({ workflowBuilder: builder, builderAccess: null });
      captureSection("team");
      return;
    }
    captureSection("team");
    void persistPatch({ workflowBuilder: builder });
  };

  const onChangeBuilderAccess = (access: BuilderAccess) => {
    setBuilderAccess(access);
    captureSection("team");
    void persistPatch({ builderAccess: access });
  };

  const onChangeAutomationScope = (scope: AutomationScope) => {
    setAutomationScope(scope);
    captureSection("automation-preference");
    if (!onboarding.mode) setMode("assist");
    void persistPatch({ automationScope: scope, mode: onboarding.mode ?? "assist" });
  };

  const onConfirmIntro = (text: string) => {
    setIntro(text);
    captureSection("company");
    if (onboarding.channel === "voice") {
      void fetch("/api/onboarding/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: "company_intro",
          transcript: text,
          confirmedAnswer: text,
          language: "en",
        }),
      }).then(() => setOnboardingSync("saved")).catch((err: unknown) => {
        setOnboardingSync("error", err instanceof Error ? err.message : "Could not save transcript.");
      });
      return;
    }
    void persistPatch({ intro: text });
  };

  const onEditIntro = (text: string) => {
    setIntro(text);
    void persistPatch({ intro: text });
  };

  const onChangeBusinessArea = (area: string) => {
    setBusinessArea(area);
    captureSection("goals");
    void persistPatch({ businessArea: area });
  };

  const onChangeRepetitiveTask = (task: string) => {
    setRepetitiveTask(task);
    captureSection("goals");
    void persistPatch({ repetitiveTask: task });
  };

  const onChangeCurrentWorkflow = (workflow: string) => {
    setCurrentWorkflow(workflow);
    captureSection("business-info");
    void persistPatch({ currentWorkflow: workflow });
  };

  const onChangeOrganizationShape = (shape: typeof onboarding.organizationShape) => {
    setOrganizationShape(shape);
    captureSection("team");
    void persistPatch({ organizationShape: shape });
  };

  const onUseDemo = () => {
    applyDemoCompany();
    setMode("assist");
    setOrganizationShape("solo");
    setWorkflowBuilder("self");
    setBuilderAccess("workflows_only");
    setAutomationScope("focus_area");
    setBusinessArea("Operations");
    setRepetitiveTask("Rescheduling customer appointments over the phone");
    setCurrentWorkflow("Messages come in through Gmail and WhatsApp, the coordinator checks the calendar manually, then calls customers one by one to shift appointments and update the spreadsheet.");
    captureSection("automation-preference");
    captureSection("goals");
    captureSection("business-info");
    captureSection("team");
    setMaxVisited(3);
    void persistPatch({
      mode: "assist",
      workflowBuilder: "self",
      builderAccess: "workflows_only",
      automationScope: "focus_area",
      businessArea: "Operations",
      repetitiveTask: "Rescheduling customer appointments over the phone",
      currentWorkflow: "Messages come in through Gmail and WhatsApp, the coordinator checks the calendar manually, then calls customers one by one to shift appointments and update the spreadsheet.",
      intro: "We run BrightPath Home Services in Singapore, eighteen of us doing residential maintenance, around 650 customer requests a month. Too much of our day goes into sorting Gmail and WhatsApp messages by hand and rescheduling appointments over the phone. Marketing keeps waiting on me, and every Friday the finance team combs through overdue invoices manually.",
      organizationShape: "solo",
      employeeCount: 18,
      approvalOwner: "Sarah Tan",
      employeeEmails: ["marcus@brightpath.sg", "sarah@brightpath.sg", "jolene@brightpath.sg"],
      departmentApprovals: [
        {
          department: "Finance",
          processOwner: "Marcus Lim",
          email: "marcus@brightpath.sg",
          approver: "marcus@brightpath.sg",
          setupDelegate: "marcus@brightpath.sg",
          discoveryStatus: "completed",
        },
        {
          department: "Operations",
          processOwner: "Sarah Tan",
          email: "sarah@brightpath.sg",
          approver: "Sarah Tan",
          setupDelegate: "Sarah Tan",
          discoveryStatus: "completed",
        },
        {
          department: "Marketing",
          processOwner: "Jolene Ng",
          email: "jolene@brightpath.sg",
          approver: "jolene@brightpath.sg",
          setupDelegate: "jolene@brightpath.sg",
          discoveryStatus: "invited",
        },
      ],
      selectedToolIds: [
        "gmail",
        "google-calendar",
        "hubspot",
        "whatsapp-business",
        "quickbooks",
        "google-drive",
        "slack",
      ],
    });
    toast({
      title: "Demo company loaded",
      detail: "BrightPath profile, intro answer and 7 tools were filled in.",
      tone: "ok",
    });
  };

  const onConsentChange = (checked: boolean) => {
    consentTouched.current = true;
    setConsentChecked(checked);
    if (checked) {
      acceptConsent();
      captureSection("consent");
    }
    void persistPatch({ consentAccepted: checked });
  };

  const onToggleTool = (toolId: string) => {
    const selectedToolIds = onboarding.selectedToolIds.includes(toolId)
      ? onboarding.selectedToolIds.filter((t) => t !== toolId)
      : [...onboarding.selectedToolIds, toolId];
    toggleTool(toolId);
    void persistPatch({ selectedToolIds });
  };

  /* Auto-play: load the demo company, jump to the review, accept consent, then
     continue to the interview. */
  useApCommand(AP.onboarding, () => {
    onUseDemo();
    goTo(4);
    onConsentChange(true);
    window.setTimeout(() => {
      completeOnboarding();
      router.replace("/app/discovery");
    }, 1800);
  });

  const hasIntro = onboarding.intro.trim().length > 0;
  const showContinue = step !== 1 || hasIntro;
  const continueDisabled =
    (step === 0 && (
      !onboarding.organizationShape
      || !onboarding.workflowBuilder
      || !onboarding.automationScope
      || (onboarding.workflowBuilder === "invite" && !onboarding.builderAccess)
    ));

  const runBlueprintAction = async (action: "generate" | "approve" | "handoff") => {
    setOnboardingSync("saving");
    try {
      const res = await fetch("/api/onboarding/blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(`Could not ${action} the Business Blueprint.`);
      const stateRes = await fetch("/api/onboarding/session", { cache: "no-store" });
      const data = (await stateRes.json()) as {
        session: {
          blueprint?: { version: number; status: "draft" | "approved" };
          handoff?: { id: string };
        };
      };
      syncOnboardingFromServer({
        blueprintVersion: data.session.blueprint?.version ?? null,
        blueprintStatus: data.session.blueprint?.status ?? "idle",
        handoffId: data.session.handoff?.id ?? null,
        completed: data.session.blueprint?.status === "approved",
      });
      setOnboardingSync("saved");
      toast({
        title:
          action === "generate"
            ? "Business Blueprint generated"
            : action === "approve"
              ? "Business Blueprint approved"
              : "Role B handoff ready",
        detail:
          action === "handoff"
            ? "The approved blueprint is now marked ready for Role B."
            : "The shared onboarding session was updated.",
        tone: "ok",
      });
    } catch (err) {
      setOnboardingSync("error", err instanceof Error ? err.message : "Action failed.");
    }
  };

  const onContinue = () => {
    if (
      step === 2 &&
      (onboarding.selectedToolIds.length > 0 || onboarding.customTools.length > 0)
    ) {
      captureSection("tools");
    }
    if (step < 4) {
      goTo(step + 1);
      return;
    }
    if (!consentChecked) {
      onConsentChange(true);
    }
    completeOnboarding();
    setJourney("discovery");
    toast({
      title: "Onboarding captured",
      detail: "Next: the process interview, where Oriant goes deeper into how the workflow runs.",
      tone: "ok",
    });
    router.replace("/app/discovery");
  };

  const variants = stepVariants(Boolean(reduced));

  return (
    <main className="oa-page">
      <div className={styles.layout}>
        <div className={styles.flowCol}>
          <header className={styles.heroHeader}>
            <p className="oa-eyebrow">Discovery · Onboarding</p>
            <h1 className={`oa-h1 ${styles.heroTitle}`}>
              Let&apos;s map your first <span className="oa-serif">workflow</span>
            </h1>
            <p className={`oa-lead ${styles.heroLead}`}>
              We&apos;ll keep this simple: who&apos;s involved, what task you want to improve, and how it works today.
            </p>
          </header>

          <nav className={styles.stepper} aria-label="Onboarding steps">
            {STEPS.map((s, i) => {
              const done = i < step;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`${styles.stepBtn} ${done ? styles.stepBtnDone : ""}`}
                  aria-current={i === step ? "step" : undefined}
                  disabled={i > maxVisited}
                  onClick={() => goTo(i)}
                >
                  <span className={styles.stepNum} aria-hidden>
                    {done ? <Check size={12} /> : i + 1}
                  </span>
                  {s.label}
                </button>
              );
            })}
            <span className="oa-sub" style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>
              Step {step + 1} of {STEPS.length}
            </span>
          </nav>

          <div className={styles.viewport}>
            <AnimatePresence mode="wait" custom={dir} initial={false}>
              <motion.section
                key={STEPS[step].id}
                className={`oa-card ${styles.stepCard}`}
                custom={dir}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                aria-label={STEPS[step].label}
              >
                {step === 0 && (
                  <ModeStep
                    organizationShape={onboarding.organizationShape}
                    workflowBuilder={onboarding.workflowBuilder}
                    builderAccess={onboarding.builderAccess}
                    automationScope={onboarding.automationScope}
                    usedDemo={onboarding.usedDemoCompany}
                    selectedToolIds={onboarding.selectedToolIds}
                    onOrganizationShapeChange={onChangeOrganizationShape}
                    onWorkflowBuilderChange={onChangeWorkflowBuilder}
                    onBuilderAccessChange={onChangeBuilderAccess}
                    onAutomationScopeChange={onChangeAutomationScope}
                    onUseDemo={onUseDemo}
                  />
                )}
                {step === 1 && (
                  <IntroStep
                    variant="intro"
                    intro={onboarding.intro}
                    channel={onboarding.channel}
                    organizationShape={onboarding.organizationShape}
                    automationScope={onboarding.automationScope}
                    businessArea={onboarding.businessArea}
                    repetitiveTask={onboarding.repetitiveTask}
                    onConfirmIntro={onConfirmIntro}
                    onEditIntro={onEditIntro}
                    onBusinessAreaChange={onChangeBusinessArea}
                    onRepetitiveTaskChange={onChangeRepetitiveTask}
                  />
                )}
                {step === 2 && (
                  <IntroStep
                    variant="focus"
                    intro={onboarding.intro}
                    channel={onboarding.channel}
                    organizationShape={onboarding.organizationShape}
                    automationScope={onboarding.automationScope}
                    businessArea={onboarding.businessArea}
                    repetitiveTask={onboarding.repetitiveTask}
                    onConfirmIntro={onConfirmIntro}
                    onEditIntro={onEditIntro}
                    onBusinessAreaChange={onChangeBusinessArea}
                    onRepetitiveTaskChange={onChangeRepetitiveTask}
                  />
                )}
                {step === 3 && (
                  <ToolsStep
                    automationScope={onboarding.automationScope}
                    businessArea={onboarding.businessArea}
                    repetitiveTask={onboarding.repetitiveTask}
                    currentWorkflow={onboarding.currentWorkflow}
                    selectedToolIds={onboarding.selectedToolIds}
                    onCurrentWorkflowChange={onChangeCurrentWorkflow}
                    onToggle={onToggleTool}
                  />
                )}
                {step === 4 && (
                  <SummaryStep
                    channel={onboarding.channel}
                    organizationShape={onboarding.organizationShape}
                    automationScope={onboarding.automationScope}
                    businessArea={onboarding.businessArea}
                    repetitiveTask={onboarding.repetitiveTask}
                    currentWorkflow={onboarding.currentWorkflow}
                    employeeCount={onboarding.employeeCount}
                    approvalOwner={onboarding.approvalOwner ?? ""}
                    employeeEmails={employeeEmails}
                    departmentApprovals={departmentApprovals}
                    syncStatus={onboarding.syncStatus}
                    blueprintVersion={onboarding.blueprintVersion}
                    blueprintStatus={onboarding.blueprintStatus}
                    consentChecked={consentChecked}
                    onConsentChange={onConsentChange}
                    onEditStep={goTo}
                  />
                )}
              </motion.section>
            </AnimatePresence>
          </div>

          <div className={styles.controls}>
            <button
              type="button"
              className="oa-btn oa-btn--ghost"
              onClick={() => goTo(step - 1)}
              disabled={step === 0}
              style={{ visibility: step === 0 ? "hidden" : undefined }}
            >
              <ChevronLeft size={15} aria-hidden />
              Back
            </button>
            {showContinue && (
              <button
                type="button"
                className="oa-btn oa-btn--primary"
                onClick={onContinue}
                disabled={continueDisabled}
              >
                {step === 3 ? "Continue to Interview" : "Continue"}
                <ArrowRight size={15} aria-hidden />
              </button>
            )}
          </div>
        </div>

        <CaptureRail />
      </div>
    </main>
  );
}
