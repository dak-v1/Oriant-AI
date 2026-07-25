"use client";
/**
 * OnboardingFlow — the /app/onboarding experience (spec §7, §20 Onboarding row).
 *
 * Four horizontally-transitioning steps (Welcome → Introduction → Tools →
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
import type { AutomationMode } from "@/lib/mock/types";
import { DUR, EASE } from "@/lib/mock/motion";
import { toast } from "@/components/mock/ui/Toaster";
import CaptureRail from "./CaptureRail";
import ModeStep from "./ModeStep";
import IntroStep from "./IntroStep";
import ToolsStep from "./ToolsStep";
import SummaryStep from "./SummaryStep";
import styles from "./onboarding.module.css";

const STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "intro", label: "Introduction" },
  { id: "tools", label: "Tools" },
  { id: "review", label: "Review" },
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
  const setMode = useDemoStore((s) => s.setMode);
  const applyDemoCompany = useDemoStore((s) => s.useDemoCompany);
  const toggleTool = useDemoStore((s) => s.toggleTool);
  const captureSection = useDemoStore((s) => s.captureSection);
  const acceptConsent = useDemoStore((s) => s.acceptConsent);
  const completeOnboarding = useDemoStore((s) => s.completeOnboarding);

  /* Returning visitors who finished onboarding land on the review step. */
  const [step, setStep] = useState(() =>
    useDemoStore.getState().onboarding.completed ? 3 : 0,
  );
  const [maxVisited, setMaxVisited] = useState(() =>
    useDemoStore.getState().onboarding.completed ? 3 : 0,
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

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(STEPS.length - 1, next));
    setDir(clamped > step ? 1 : -1);
    setStep(clamped);
    setMaxVisited((m) => Math.max(m, clamped));
  };

  const onSelectMode = (m: AutomationMode) => {
    setMode(m);
    captureSection("automation-preference");
  };

  const onUseDemo = () => {
    applyDemoCompany();
    setMode("assist");
    captureSection("automation-preference");
    setMaxVisited(3);
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
  };

  /* Auto-play: load the demo company, jump to the review, accept consent, then
     continue to the Lean Canvas. */
  useApCommand(AP.onboarding, () => {
    onUseDemo();
    goTo(3);
    onConsentChange(true);
    window.setTimeout(() => {
      completeOnboarding();
      router.push("/app/onboarding/lean-canvas");
    }, 1800);
  });

  const hasIntro = onboarding.intro.trim().length > 0;
  const showContinue = step !== 1 || hasIntro;
  const continueDisabled =
    (step === 0 && !onboarding.mode) || (step === 3 && !consentChecked);

  const onContinue = () => {
    if (
      step === 2 &&
      (onboarding.selectedToolIds.length > 0 || onboarding.customTools.length > 0)
    ) {
      captureSection("tools");
    }
    if (step < 3) {
      goTo(step + 1);
      return;
    }
    completeOnboarding();
    toast({
      title: "Onboarding captured",
      detail: "Next: your Lean Canvas. Upload it or build it together.",
      tone: "ok",
    });
    router.push("/app/onboarding/lean-canvas");
  };

  const variants = stepVariants(Boolean(reduced));

  return (
    <main className="oa-page">
      <div className={styles.layout}>
        <div className={styles.flowCol}>
          <header style={{ display: "grid", gap: 6, marginBottom: 6 }}>
            <p className="oa-eyebrow">Discovery · Onboarding</p>
            <h1 className="oa-h1">
              Let’s meet your <span className="oa-serif">business</span>
            </h1>
            <p className="oa-lead">
              A short, guided conversation. Speak or type, and edit anything
              later. Discovery covers whatever we don’t capture here.
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
                    mode={onboarding.mode}
                    usedDemo={onboarding.usedDemoCompany}
                    selectedToolIds={onboarding.selectedToolIds}
                    onSelectMode={onSelectMode}
                    onUseDemo={onUseDemo}
                  />
                )}
                {step === 1 && <IntroStep />}
                {step === 2 && (
                  <ToolsStep
                    selectedToolIds={onboarding.selectedToolIds}
                    onToggle={toggleTool}
                  />
                )}
                {step === 3 && (
                  <SummaryStep
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
                {step === 3 ? "Continue to Lean Canvas" : "Continue"}
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
