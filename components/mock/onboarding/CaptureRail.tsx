"use client";
/**
 * CaptureRail — the persistent "What we've captured" panel beside the
 * onboarding flow (improvement spec §5 + §8).
 *
 * An intentional info panel: 1.5px border + subtle tint, title row with a
 * captured-fact count, and a quiet "Updated just now" badge that appears
 * when new information lands. Shows ONLY captured facts, grouped with small
 * icons (Company, Team, Goals, Tools, Automation preference, Guardrails),
 * plus exactly one muted "Oriant will ask about this next" line. The full
 * checklist lives in the Company Report, not here.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Building2,
  Plug,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Users,
} from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import { DEMO_COMPANY, TOOL_CATALOG } from "@/lib/mock/fixtures/demo-company";
import { DUR, EASE } from "@/lib/mock/motion";
import styles from "./onboarding.module.css";

const MODE_LABELS: Record<string, string> = {
  assist: "Assist: AI works with your current team",
  operate: "Operate: AI runs eligible workflows within limits",
  unsure: "Not sure yet: Oriant will recommend a level after Discovery",
};

const TOOL_NAME = new Map(TOOL_CATALOG.map((t) => [t.id, t.name]));

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export default function CaptureRail() {
  const onboarding = useDemoStore((s) => s.onboarding);
  const hydrated = useDemoStore((s) => s._hydrated);
  const reduced = useReducedMotion();

  const toolNames = [
    ...onboarding.selectedToolIds
      .map((id) => TOOL_NAME.get(id))
      .filter((n): n is string => Boolean(n)),
    ...onboarding.customTools.map((t) => t.name),
  ];

  const captured = onboarding.capturedSections;
  const hasIntro = onboarding.intro.trim().length > 0;
  const hasTeam = captured.includes("team");
  const hasGoals = captured.includes("goals");

  /* Captured fact groups — only what exists, in spec §8 group order. */
  const facts: {
    id: string;
    icon: typeof Users;
    label: string;
    body: React.ReactNode;
  }[] = [];
  if (hasIntro) {
    facts.push({
      id: "company",
      icon: Building2,
      label: "Company",
      body: <span>&ldquo;{clip(onboarding.intro.trim(), 120)}&rdquo;</span>,
    });
  }
  if (hasTeam) {
    facts.push({
      id: "team",
      icon: Users,
      label: "Team",
      body: <span>{DEMO_COMPANY.teams.join(" · ")}</span>,
    });
  }
  if (hasGoals) {
    facts.push({
      id: "goals",
      icon: Target,
      label: "Goals",
      body: <span>{DEMO_COMPANY.primaryGoal}.</span>,
    });
  }
  if (toolNames.length > 0) {
    facts.push({
      id: "tools",
      icon: Plug,
      label: `Tools · ${toolNames.length}`,
      body: (
        <span className={styles.railChips}>
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
        </span>
      ),
    });
  }
  if (onboarding.mode) {
    facts.push({
      id: "automation",
      icon: SlidersHorizontal,
      label: "Automation preference",
      body: <span>{MODE_LABELS[onboarding.mode]}.</span>,
    });
  }
  if (onboarding.consentAccepted) {
    facts.push({
      id: "guardrails",
      icon: ShieldCheck,
      label: "Guardrails",
      body: (
        <span>
          {DEMO_COMPANY.alwaysApprove.slice(0, 2).join(", ").toLowerCase()} and{" "}
          {DEMO_COMPANY.alwaysApprove.length - 2} more always need your
          approval.
        </span>
      ),
    });
  }

  /* Exactly ONE next-question line, in the order the flow actually asks. */
  const nextAreas: { done: boolean; label: string }[] = [
    { done: Boolean(onboarding.mode), label: "how much should run automatically" },
    { done: hasIntro, label: "what your company does and what takes too much time" },
    { done: toolNames.length > 0, label: "the tools your team already uses" },
    { done: onboarding.consentAccepted, label: "permissions and what always needs your approval" },
    { done: hasTeam, label: "your team and who handles what" },
    { done: hasGoals, label: "what you want Oriant to improve first" },
  ];
  const next = nextAreas.find((a) => !a.done);

  /* "Updated just now" badge: appears when new info lands, then fades.
     Baseline is set after store hydration so a refresh never triggers it. */
  const sig = [
    facts.length,
    toolNames.length,
    onboarding.intro.trim().length,
    onboarding.mode ?? "",
    onboarding.consentAccepted,
  ].join("|");
  const prevSig = useRef<string | null>(null);
  const [justUpdated, setJustUpdated] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hydrated) {
      prevSig.current = null;
      return;
    }
    if (prevSig.current === null) {
      prevSig.current = sig;
      return;
    }
    if (prevSig.current !== sig) {
      prevSig.current = sig;
      setJustUpdated(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setJustUpdated(false), 4000);
    }
  }, [sig, hydrated]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

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
        <div className={styles.railHead}>
          <h2 className="oa-h3">What we&rsquo;ve captured</h2>
          <span className={styles.railHeadRight} aria-live="polite">
            <AnimatePresence initial={false}>
              {justUpdated && (
                <motion.span
                  key="updated"
                  className={styles.updatedBadge}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: DUR.micro, ease: EASE }}
                >
                  <span className={styles.updatedDot} aria-hidden />
                  Updated just now
                </motion.span>
              )}
            </AnimatePresence>
            <span className={styles.railCount}>{facts.length} captured</span>
          </span>
        </div>
        <p className="oa-sub">
          Only what you&rsquo;ve shared so far. Everything stays editable.
        </p>

        {facts.length === 0 && (
          <p className="oa-sub" style={{ fontStyle: "italic" }}>
            Answers you confirm will settle in here as structured facts.
          </p>
        )}

        {facts.length > 0 && (
          <div className={styles.railFacts}>
            {facts.map((f) => {
              const Icon = f.icon;
              return (
                <motion.div key={f.id} className={styles.railFact} {...appear}>
                  <span className={styles.railFactIcon} aria-hidden>
                    <Icon size={13} />
                  </span>
                  <div className={styles.railFactBody}>
                    <span className="oa-micro">{f.label}</span>
                    {f.body}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        <p className={styles.railNext}>
          {next ? (
            <>Oriant will ask about this next: {next.label}.</>
          ) : (
            <>All areas captured. Discovery goes deeper on each one next.</>
          )}
        </p>
      </div>
    </aside>
  );
}
