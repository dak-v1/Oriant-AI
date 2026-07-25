"use client";
/**
 * ModeStep — onboarding step 1 (spec §7.1, improvement spec §6): choose how
 * Oriant should work (Assist / Operate / Not sure yet) plus the "Use demo
 * company" shortcut that pre-fills the BrightPath fixture.
 *
 * The three cards are built on .oa-selectable + .oa-radio: equal height,
 * radio indicator always visible, selection changes outline + tint only
 * (zero layout shift). Continue lives below the group in OnboardingFlow and
 * stays disabled until a mode is chosen.
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Building2, Check, Compass, Users, Zap } from "lucide-react";
import type { AutomationMode } from "@/lib/mock/types";
import {
  DEMO_COMPANY,
  TOOL_CATALOG,
} from "@/lib/mock/fixtures/demo-company";
import { DUR, EASE } from "@/lib/mock/motion";
import styles from "./onboarding.module.css";

/** Spec §6 — plain-language mode explanations. */
const MODES: {
  id: AutomationMode;
  title: string;
  body: string;
  recommendedFor: string | null;
  icon: typeof Users;
}[] = [
  {
    id: "assist",
    title: "Assist",
    body: "AI prepares, recommends and handles routine work with your current employees. Important actions stay reviewable.",
    recommendedFor: "teams adding AI support for the first time.",
    icon: Users,
  },
  {
    id: "operate",
    title: "Operate",
    body: "AI handles more eligible workflows automatically within explicit limits and approval rules.",
    recommendedFor: "stable, repetitive processes with clear rules.",
    icon: Zap,
  },
  {
    id: "unsure",
    title: "Not sure yet",
    body: "Oriant recommends an automation level after Discovery and explains why.",
    recommendedFor: null,
    icon: Compass,
  },
];

const TOOL_NAME = new Map(TOOL_CATALOG.map((t) => [t.id, t.name]));

export default function ModeStep({
  mode,
  usedDemo,
  selectedToolIds,
  onSelectMode,
  onUseDemo,
}: {
  mode: AutomationMode | null;
  usedDemo: boolean;
  selectedToolIds: string[];
  onSelectMode: (m: AutomationMode) => void;
  onUseDemo: () => void;
}) {
  const reduced = useReducedMotion();
  const toolNames = selectedToolIds
    .map((id) => TOOL_NAME.get(id))
    .filter((n): n is string => Boolean(n));

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <h2 className="oa-h3">How should Oriant work with your team?</h2>
        <p className="oa-sub">
          This sets the starting point. You can change it any time, and every
          important action keeps a human in charge.
        </p>
      </div>

      <div className={styles.modeGrid} role="group" aria-label="Automation mode">
        {MODES.map((m) => {
          const Icon = m.icon;
          const selected = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              className={`oa-selectable ${styles.modeCard} ${
                selected ? "oa-selectable--selected" : ""
              }`}
              aria-pressed={selected}
              onClick={() => onSelectMode(m.id)}
            >
              <span className="oa-radio" aria-hidden />
              <span className={styles.modeBody}>
                <span className={styles.modeIcon}>
                  <Icon size={17} aria-hidden />
                </span>
                <span className={styles.modeTitle}>{m.title}</span>
                <span className="oa-sub">{m.body}</span>
                {m.recommendedFor && (
                  <span className={styles.modeRec}>
                    Recommended for {m.recommendedFor}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className={styles.demoPanel} data-demo-label>
        <div>
          <span className="oa-micro">Shortcut</span>
          <h3 className="oa-h3">Try it with a ready-made company</h3>
          <p className="oa-sub">
            {DEMO_COMPANY.name}: {DEMO_COMPANY.teamSize} people in{" "}
            {DEMO_COMPANY.location}, {DEMO_COMPANY.industry.toLowerCase()}.
          </p>
        </div>
        <button
          type="button"
          className="oa-btn oa-btn--soft"
          onClick={onUseDemo}
          disabled={usedDemo}
        >
          {usedDemo ? <Check size={15} aria-hidden /> : <Building2 size={15} aria-hidden />}
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
                <span>
                  Company profile filled: {DEMO_COMPANY.name},{" "}
                  {DEMO_COMPANY.teamSize} people, {DEMO_COMPANY.location},{" "}
                  {DEMO_COMPANY.monthlyVolume}.
                </span>
              </li>
              <li>
                <Check size={14} aria-hidden />
                <span>Opening answer drafted. Review or re-record it in the next step.</span>
              </li>
              <li>
                <Check size={14} aria-hidden />
                <span>
                  {toolNames.length} tools selected:{" "}
                  {toolNames.slice(0, 3).join(", ")}
                  {toolNames.length > 3 ? " and more" : ""}.
                </span>
              </li>
              <li>
                <Check size={14} aria-hidden />
                <span>Automation mode set to Assist. Change it above if you prefer.</span>
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
