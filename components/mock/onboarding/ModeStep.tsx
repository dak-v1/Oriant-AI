"use client";
/**
 * ModeStep — onboarding step 1 (spec §7.1): choose how Oriant should work
 * (Assist / Operate / Not sure yet) plus the "Use demo company" shortcut
 * that pre-fills the BrightPath fixture and confirms what was filled.
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Compass, Sparkles, Users, Zap } from "lucide-react";
import type { AutomationMode } from "@/lib/mock/types";
import {
  DEMO_COMPANY,
  TOOL_CATALOG,
} from "@/lib/mock/fixtures/demo-company";
import { DUR, EASE } from "@/lib/mock/motion";
import styles from "./onboarding.module.css";

/** Spec §7.1 — plain-language mode explanations (verbatim requirements). */
const MODES: {
  id: AutomationMode;
  title: string;
  body: string;
  icon: typeof Users;
}[] = [
  {
    id: "assist",
    title: "Assist",
    body: "AI prepares, recommends and handles routine work with your current employees. Important actions stay reviewable.",
    icon: Users,
  },
  {
    id: "operate",
    title: "Operate",
    body: "AI handles more eligible workflows automatically within explicit limits and approval rules.",
    icon: Zap,
  },
  {
    id: "unsure",
    title: "Not sure yet",
    body: "Oriant recommends an automation level after Discovery and explains why.",
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
          This sets the starting point — you can change it any time, and every
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
              className={`oa-card oa-card--flat ${styles.modeCard} ${
                selected ? "oa-card--selected" : ""
              }`}
              aria-pressed={selected}
              onClick={() => onSelectMode(m.id)}
            >
              <span className={styles.modeIcon}>
                <Icon size={17} aria-hidden />
              </span>
              <span className={styles.modeTitle}>
                {m.title}
                {selected && (
                  <Check size={16} aria-hidden style={{ color: "var(--oa-blue)" }} />
                )}
              </span>
              <span className="oa-sub">{m.body}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.demoPanel}>
        <div>
          <span className="oa-micro">Shortcut</span>
          <h3 className="oa-h3">Try it with a ready-made company</h3>
          <p className="oa-sub">
            {DEMO_COMPANY.name} — {DEMO_COMPANY.teamSize} people in{" "}
            {DEMO_COMPANY.location}, {DEMO_COMPANY.industry.toLowerCase()}.
          </p>
        </div>
        <button
          type="button"
          className="oa-btn oa-btn--soft"
          onClick={onUseDemo}
          disabled={usedDemo}
        >
          {usedDemo ? <Check size={15} aria-hidden /> : <Sparkles size={15} aria-hidden />}
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
                  Company profile filled — {DEMO_COMPANY.name},{" "}
                  {DEMO_COMPANY.teamSize} people, {DEMO_COMPANY.location},{" "}
                  {DEMO_COMPANY.monthlyVolume}.
                </span>
              </li>
              <li>
                <Check size={14} aria-hidden />
                <span>Opening answer drafted — review or re-record it in the next step.</span>
              </li>
              <li>
                <Check size={14} aria-hidden />
                <span>
                  {toolNames.length} tools selected —{" "}
                  {toolNames.slice(0, 3).join(", ")}
                  {toolNames.length > 3 ? " and more" : ""}.
                </span>
              </li>
              <li>
                <Check size={14} aria-hidden />
                <span>Automation mode set to Assist — change it above if you prefer.</span>
              </li>
            </ul>
            <span className="oa-sim-note">
              Prepared demo profile — nothing is imported from real accounts.
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
