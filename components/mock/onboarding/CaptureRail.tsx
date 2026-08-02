"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Building2, Plug, ShieldCheck, SlidersHorizontal, Users } from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import { DEMO_COMPANY, TOOL_CATALOG } from "@/lib/mock/fixtures/demo-company";
import { DUR, EASE } from "@/lib/mock/motion";
import styles from "./onboarding.module.css";

const TOOL_NAME = new Map(TOOL_CATALOG.map((tool) => [tool.id, tool.name]));

const BUILDER_LABELS: Record<string, string> = {
  self: "You'll build the first workflow",
  invite: "Someone else will build the first workflow",
};

const ACCESS_LABELS: Record<string, string> = {
  workflows_only: "Workflow access only",
  account_manager: "Workflow + account management access",
};

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export default function CaptureRail() {
  const onboarding = useDemoStore((state) => state.onboarding);
  const hydrated = useDemoStore((state) => state._hydrated);
  const reduced = useReducedMotion();
  const intro = onboarding.intro ?? "";
  const builderAccess = onboarding.builderAccess ?? "";
  const workflowBuilder = onboarding.workflowBuilder ?? "";

  const toolNames = [
    ...onboarding.selectedToolIds
      .map((id) => TOOL_NAME.get(id))
      .filter((name): name is string => Boolean(name)),
    ...onboarding.customTools.map((tool) => tool.name),
  ];

  const contributorCount = onboarding.employeeEmails?.length ?? 0;
  const facts: {
    id: string;
    icon: typeof Users;
    label: string;
    body: React.ReactNode;
  }[] = [];

  if (intro.trim()) {
    facts.push({
      id: "company",
      icon: Building2,
      label: "Business summary",
      body: <span>&ldquo;{clip(intro.trim(), 120)}&rdquo;</span>,
    });
  }

  if (workflowBuilder) {
    facts.push({
      id: "builder",
      icon: SlidersHorizontal,
      label: "Workflow setup",
      body: (
        <span>
          {BUILDER_LABELS[workflowBuilder] ?? "Builder not selected"}
          {workflowBuilder === "invite" && builderAccess
            ? ` · ${ACCESS_LABELS[builderAccess] ?? builderAccess}`
            : ""}
        </span>
      ),
    });
  }

  if (onboarding.capturedSections.includes("team")) {
    facts.push({
      id: "setup",
      icon: Users,
      label: "Setup",
      body: (
        <span>
          {onboarding.organizationShape === "solo"
            ? "Solo setup selected."
            : `${contributorCount} teammate email${contributorCount === 1 ? "" : "s"} added.`}
        </span>
      ),
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

  if (onboarding.consentAccepted) {
    facts.push({
      id: "guardrails",
      icon: ShieldCheck,
      label: "Guardrails",
      body: (
        <span>
          {DEMO_COMPANY.alwaysApprove.slice(0, 2).join(", ").toLowerCase()} and{" "}
          {DEMO_COMPANY.alwaysApprove.length - 2} more still need approval.
        </span>
      ),
    });
  }

  const nextAreas: { done: boolean; label: string }[] = [
    {
      done: Boolean(onboarding.organizationShape && workflowBuilder && (workflowBuilder === "self" || builderAccess)),
      label: "whether you're setting this up alone and who will build the first workflow",
    },
    {
      done: Boolean(onboarding.intro.trim()),
      label: "what your business does and where time is being lost today",
    },
    {
      done: onboarding.organizationShape === "solo" || contributorCount >= 0,
      label: "any extra people you may want to bring in later",
    },
    {
      done: toolNames.length > 0,
      label: "the tools your team already uses",
    },
    {
      done: onboarding.consentAccepted,
      label: "permissions and what always needs human approval",
    },
  ];
  const next = nextAreas.find((area) => !area.done);

  const sig = [
    facts.length,
    toolNames.length,
    intro.trim().length,
    workflowBuilder,
    builderAccess,
    onboarding.consentAccepted,
    contributorCount,
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
          <h2 className="oa-h3">Your setup</h2>
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
        <p className="oa-sub">A live summary of what you&apos;ve shared so far.</p>

        {facts.length === 0 && (
          <p className="oa-sub" style={{ fontStyle: "italic" }}>
            Your answers will build up here as you go.
          </p>
        )}

        {facts.length > 0 && (
          <div className={styles.railFacts}>
            {facts.map((fact) => {
              const Icon = fact.icon;
              return (
                <motion.div key={fact.id} className={styles.railFact} {...appear}>
                  <span className={styles.railFactIcon} aria-hidden>
                    <Icon size={13} />
                  </span>
                  <div className={styles.railFactBody}>
                    <span className="oa-micro">{fact.label}</span>
                    {fact.body}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        <p className={styles.railNext}>
          {next ? (
            <>Next up: {next.label}.</>
          ) : (
            <>Everything important is captured. You can move into the first automation brief.</>
          )}
        </p>
      </div>
    </aside>
  );
}
