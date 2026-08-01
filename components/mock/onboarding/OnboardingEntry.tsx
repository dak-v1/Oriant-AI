"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ListChecks, PhoneCall } from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import type { OnboardingChannel } from "@/lib/mock/types";
import styles from "./onboarding-entry.module.css";

export default function OnboardingEntry() {
  const router = useRouter();
  const setChannel = useDemoStore((state) => state.setChannel);
  const setCallInProgress = useDemoStore((state) => state.setCallInProgress);
  const setOnboardingSync = useDemoStore((state) => state.setOnboardingSync);
  const [saving, setSaving] = useState<OnboardingChannel | null>(null);

  const choosePath = async (channel: OnboardingChannel) => {
    setSaving(channel);
    setChannel(channel);
    try {
      const response = await fetch("/api/onboarding/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredChannel: channel, startCall: channel === "voice" }),
      });
      if (!response.ok) throw new Error("Could not save your onboarding preference.");
      setOnboardingSync("saved");
      setCallInProgress(channel === "voice");
      router.push(channel === "voice" ? "/app/onboarding/voice-call" : "/app/onboarding");
    } catch (error) {
      setOnboardingSync("error", error instanceof Error ? error.message : "Could not save your onboarding preference.");
      setSaving(null);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.content}>
          <p className={styles.eyebrow}>A simple place to start</p>
          <h1>Settle in with Oriant.</h1>
          <p className={styles.lede}>
            Choose the way that feels easiest. We&apos;ll learn how your business works and keep the first step focused.
          </p>

          <div className={styles.options}>
            <button
              type="button"
              className={`${styles.option} ${styles.featured}`}
              onClick={() => void choosePath("voice")}
              disabled={saving !== null}
            >
              <span className={styles.icon}><PhoneCall size={20} aria-hidden /></span>
              <span className={styles.optionBody}>
                <strong>Talk it through in one call</strong>
                <span>Have a guided conversation with Oriant. Speak naturally and we&apos;ll capture the important details as you go.</span>
                <span className={styles.optionMeta}>Start with a conversation <ArrowRight size={15} aria-hidden /></span>
              </span>
            </button>

            <button
              type="button"
              className={styles.option}
              onClick={() => void choosePath("typed")}
              disabled={saving !== null}
            >
              <span className={styles.icon}><ListChecks size={20} aria-hidden /></span>
              <span className={styles.optionBody}>
                <strong>Go through it at your own pace</strong>
                <span>Answer a few focused questions one step at a time. You can pause and come back whenever you like.</span>
                <span className={styles.optionMeta}>Guided setup <ArrowRight size={15} aria-hidden /></span>
              </span>
            </button>
          </div>

        </div>
      </div>
    </main>
  );
}
