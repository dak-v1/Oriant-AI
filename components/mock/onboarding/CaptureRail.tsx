"use client";
/**
 * CaptureRail — the persistent "What we've captured" summary beside the
 * onboarding flow (spec §7.2: a structured summary that updates as the owner
 * speaks). Desktop ≥1024px: sticky right rail; below that it stacks under
 * the flow (see onboarding.module.css).
 */
import { motion, useReducedMotion } from "framer-motion";
import { Check, Minus } from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import {
  ONBOARDING_SECTIONS,
  TOOL_CATALOG,
} from "@/lib/mock/fixtures/demo-company";
import { DUR, EASE } from "@/lib/mock/motion";
import styles from "./onboarding.module.css";

const MODE_LABELS: Record<string, string> = {
  assist: "Assist — AI works with your current team",
  operate: "Operate — AI runs eligible workflows within limits",
  unsure: "Not sure yet — Oriant will recommend after Discovery",
};

const TOOL_NAME = new Map(TOOL_CATALOG.map((t) => [t.id, t.name]));

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export default function CaptureRail() {
  const onboarding = useDemoStore((s) => s.onboarding);
  const reduced = useReducedMotion();

  const toolNames = onboarding.selectedToolIds
    .map((id) => TOOL_NAME.get(id))
    .filter((n): n is string => Boolean(n));

  const capturedCount = ONBOARDING_SECTIONS.filter((s) =>
    onboarding.capturedSections.includes(s.id),
  ).length;

  const hasAnything =
    Boolean(onboarding.mode) ||
    onboarding.intro.trim().length > 0 ||
    toolNames.length > 0;

  const appear = reduced
    ? {}
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: DUR.card, ease: EASE },
      };

  return (
    <aside className={styles.rail} aria-label="What we've captured">
      <div className={`oa-card oa-card--flat ${styles.railCard}`}>
        <div style={{ display: "grid", gap: 4 }}>
          <h2 className="oa-h3">What we’ve captured</h2>
          <p className="oa-sub">Updates live as you answer — everything stays editable.</p>
        </div>

        {!hasAnything && (
          <p className="oa-sub" style={{ fontStyle: "italic" }}>
            Answers you confirm will settle in here as structured facts.
          </p>
        )}

        {onboarding.mode && (
          <motion.div className={styles.railRow} {...appear}>
            <span className="oa-micro">Automation mode</span>
            <span style={{ fontSize: 13.5, fontWeight: 650 }}>
              {MODE_LABELS[onboarding.mode]}
            </span>
          </motion.div>
        )}

        {onboarding.intro.trim() && (
          <motion.div className={styles.railRow} {...appear}>
            <span className="oa-micro">Your introduction</span>
            <span style={{ fontSize: 13, lineHeight: 1.55, color: "var(--oa-muted-strong)" }}>
              “{clip(onboarding.intro.trim(), 120)}”
            </span>
          </motion.div>
        )}

        {toolNames.length > 0 && (
          <motion.div className={styles.railRow} {...appear}>
            <span className="oa-micro">Existing systems · {toolNames.length}</span>
            <div className={styles.railChips}>
              {toolNames.slice(0, 6).map((name) => (
                <span key={name} className={`oa-chip ${styles.railChip}`}>
                  {name}
                </span>
              ))}
              {toolNames.length > 6 && (
                <span className={`oa-chip ${styles.railChip}`}>
                  +{toolNames.length - 6} more
                </span>
              )}
            </div>
          </motion.div>
        )}

        <div className={styles.railRow}>
          <div className="oa-between" aria-live="polite">
            <span className="oa-micro">Sections</span>
            <span className="oa-sub">
              {capturedCount} of {ONBOARDING_SECTIONS.length} captured
            </span>
          </div>
          <div className="oa-progress oa-progress--teal" aria-hidden>
            <span
              style={{ width: `${(capturedCount / ONBOARDING_SECTIONS.length) * 100}%` }}
            />
          </div>
          <ul className={styles.railSections}>
            {ONBOARDING_SECTIONS.map((sec) => {
              const done = onboarding.capturedSections.includes(sec.id);
              return (
                <li key={sec.id} className={styles.railSectionRow} data-done={done}>
                  {done ? (
                    <Check size={12} aria-hidden style={{ color: "var(--oa-teal-deep)" }} />
                  ) : (
                    <Minus size={12} aria-hidden />
                  )}
                  {sec.title}
                  {!done && <span className="oa-sub" style={{ fontSize: 11 }}>· Discovery</span>}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </aside>
  );
}
