"use client";
/**
 * SummaryStep — onboarding step 4 (spec §7.2, improvement spec §5).
 *
 * Shows ONLY the capture areas that already have content (positive wording,
 * "Captured" status, Edit affordances that jump back to the owning step),
 * followed by exactly one muted "Oriant will ask about this next" line.
 * The full structured checklist, including missing information, belongs to
 * the Company Report. The permissions & consent card stays.
 */
import { motion, useReducedMotion } from "framer-motion";
import { Check, Pencil, ShieldCheck } from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import {
  DEMO_COMPANY,
  ONBOARDING_SECTIONS,
  TOOL_CATALOG,
} from "@/lib/mock/fixtures/demo-company";
import { fadeUp } from "@/lib/mock/motion";
import styles from "./onboarding.module.css";

/** Which onboarding step edits each section (others are Discovery's job). */
const SECTION_STEP: Partial<Record<string, number>> = {
  "automation-preference": 0,
  company: 1,
  tools: 2,
};

const MODE_LABELS: Record<string, string> = {
  assist: "Assist: AI works with your current team",
  operate: "Operate: AI runs eligible workflows within limits",
  unsure: "Not sure yet: Oriant will recommend a level after Discovery",
};

const TOOL_NAME = new Map(TOOL_CATALOG.map((t) => [t.id, t.name]));

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export default function SummaryStep({
  consentChecked,
  onConsentChange,
  onEditStep,
}: {
  consentChecked: boolean;
  onConsentChange: (checked: boolean) => void;
  onEditStep: (step: number) => void;
}) {
  const onboarding = useDemoStore((s) => s.onboarding);
  const reduced = useReducedMotion();

  const toolNames = [
    ...onboarding.selectedToolIds
      .map((id) => TOOL_NAME.get(id))
      .filter((n): n is string => Boolean(n)),
    ...onboarding.customTools.map((t) => t.name),
  ];

  const snippetFor = (sectionId: string): string | null => {
    switch (sectionId) {
      case "company":
        return onboarding.intro.trim()
          ? `“${clip(onboarding.intro.trim(), 110)}”`
          : null;
      case "automation-preference":
        return onboarding.mode ? MODE_LABELS[onboarding.mode] : null;
      case "tools":
        return toolNames.length
          ? `${toolNames.length} selected: ${toolNames.slice(0, 3).join(", ")}${
              toolNames.length > 3 ? " and more" : ""
            }`
          : null;
      case "team":
        return onboarding.usedDemoCompany ? DEMO_COMPANY.teams.join(" · ") : null;
      case "goals":
        return onboarding.usedDemoCompany ? DEMO_COMPANY.primaryGoal : null;
      case "consent":
        return onboarding.consentAccepted
          ? "You confirmed what Oriant may read, draft and never automate."
          : null;
      default:
        return null;
    }
  };

  const capturedSections = ONBOARDING_SECTIONS.filter((sec) =>
    onboarding.capturedSections.includes(sec.id),
  );
  const nextSection = ONBOARDING_SECTIONS.find(
    (sec) => !onboarding.capturedSections.includes(sec.id),
  );

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <h2 className="oa-h3">Here&rsquo;s what Oriant has so far</h2>
        <p className="oa-sub">
          Nothing here is final. Edit anything now, and Discovery fills in the
          rest through a short conversation.
        </p>
      </div>

      {capturedSections.length === 0 && (
        <p className="oa-sub" style={{ fontStyle: "italic" }}>
          Nothing captured yet. Go back a step or load the demo company to see
          this summary fill in.
        </p>
      )}

      <ul className={styles.checkList}>
        {capturedSections.map((sec, i) => {
          const snippet = snippetFor(sec.id);
          const stepIdx = SECTION_STEP[sec.id];
          return (
            <motion.li
              key={sec.id}
              className={styles.checkRow}
              variants={fadeUp}
              initial={reduced ? false : "hidden"}
              animate="show"
              custom={i}
            >
              <span className={styles.checkIconDone} aria-hidden>
                <Check size={13} />
              </span>
              <div>
                <div className={styles.checkTitleRow}>
                  <strong style={{ fontSize: 14.5 }}>{sec.title}</strong>
                  <span className="oa-status oa-status--completed">Captured</span>
                </div>
                <p className="oa-sub">{snippet ?? sec.blurb}</p>
              </div>
              {stepIdx !== undefined && (
                <button
                  type="button"
                  className="oa-btn oa-btn--ghost oa-btn--sm"
                  onClick={() => onEditStep(stepIdx)}
                >
                  <Pencil size={12} aria-hidden />
                  Edit
                </button>
              )}
              {stepIdx === undefined && sec.id !== "consent" && (
                <span className="oa-sim-note">From demo company</span>
              )}
            </motion.li>
          );
        })}
      </ul>

      <p className={styles.railNext}>
        {nextSection ? (
          <>
            Oriant will ask about this next:{" "}
            {nextSection.title.toLowerCase() === "goals"
              ? "your goals"
              : nextSection.title.toLowerCase()}
            .
          </>
        ) : (
          <>All areas captured. Discovery goes deeper on each one next.</>
        )}
      </p>

      <div className={styles.consentCard}>
        <div style={{ display: "grid", gap: 4 }}>
          <h3 className="oa-h3">Permissions and consent</h3>
          <p className="oa-sub">Plain language: how Oriant treats your information.</p>
        </div>
        <ul className={styles.consentLines}>
          <li>
            <ShieldCheck size={15} aria-hidden />
            <span>
              Oriant reads only from tools you connect later, with scopes you
              approve. Today&rsquo;s selections connect nothing.
            </span>
          </li>
          <li>
            <ShieldCheck size={15} aria-hidden />
            <span>
              Drafts, replies and campaigns are always shown to you for review
              before anything is sent.
            </span>
          </li>
          <li>
            <ShieldCheck size={15} aria-hidden />
            <span>
              These always wait for your approval:{" "}
              {DEMO_COMPANY.alwaysApprove.join(", ").toLowerCase()}.
            </span>
          </li>
          <li>
            <ShieldCheck size={15} aria-hidden />
            <span>
              Never automated: {DEMO_COMPANY.neverAutomate.join(", ").toLowerCase()}.
            </span>
          </li>
        </ul>
        <label className={styles.consentCheck}>
          <input
            type="checkbox"
            checked={consentChecked}
            onChange={(e) => onConsentChange(e.target.checked)}
          />
          <span>
            I understand what Oriant may read and draft, and what always needs
            my approval.
          </span>
        </label>
      </div>
    </div>
  );
}
