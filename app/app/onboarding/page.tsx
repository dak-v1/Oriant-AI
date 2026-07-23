"use client";
/**
 * /app/onboarding — Phase 1 onboarding (spec §7). Thin route; the whole
 * experience lives in components/mock/onboarding/OnboardingFlow.
 */
import OnboardingFlow from "@/components/mock/onboarding/OnboardingFlow";

export default function OnboardingPage() {
  return <OnboardingFlow />;
}
