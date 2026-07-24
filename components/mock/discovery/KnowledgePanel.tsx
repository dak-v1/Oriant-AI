"use client";
/**
 * KnowledgePanel — "What Oriant knows" (spec §9.3), the core product moment.
 *
 * Reusable: pass the fact ids to display (the discovery page passes the
 * store's discovery.factIds; other screens can embed a filtered set).
 * Facts are grouped into the nine knowledge sections, each fact carrying
 * provenance + confidence. Only sections with captured facts render (no
 * empty placeholders, spec §5). Assumptions are visually distinct, gaps
 * read as positive "We will clarify this next" open questions (never error
 * styling), opportunities sit on soft teal. When new facts arrive while
 * mounted, their section pulses softly and the new chips fade up.
 */
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Building2,
  CircleDashed,
  CircleHelp,
  Lightbulb,
  ShieldCheck,
  Target,
  Users,
  Workflow,
  Wrench,
} from "lucide-react";
import type { KnowledgeFact, KnowledgeSection } from "@/lib/mock/types";
import {
  KNOWLEDGE_FACTS,
  KNOWLEDGE_SECTION_LABELS,
} from "@/lib/mock/fixtures/discovery-questions";
import ProvenanceChip from "@/components/mock/ui/ProvenanceChip";
import { DUR, EASE } from "@/lib/mock/motion";
import styles from "./discovery.module.css";

const SECTION_ORDER = Object.keys(KNOWLEDGE_SECTION_LABELS) as KnowledgeSection[];

const SECTION_ICONS: Record<KnowledgeSection, React.ComponentType<{ size?: number | string; "aria-hidden"?: boolean }>> = {
  company: Building2,
  team: Users,
  goals: Target,
  processes: Workflow,
  systems: Wrench,
  rules: ShieldCheck,
  assumptions: CircleDashed,
  gaps: CircleHelp,
  opportunities: Lightbulb,
};

function factCardClass(f: KnowledgeFact): string {
  if (f.section === "assumptions") return `${styles.factCard} ${styles.factCardAssumption}`;
  if (f.section === "opportunities") return `${styles.factCard} ${styles.factCardOpportunity}`;
  if (f.section === "gaps") return `${styles.factCard} ${styles.factCardGap}`;
  return styles.factCard;
}

export default function KnowledgePanel({
  factIds,
  compact = false,
  title,
}: {
  factIds: string[];
  compact?: boolean;
  title?: string;
}) {
  const reduced = useReducedMotion();

  const facts = factIds
    .map((id) => KNOWLEDGE_FACTS[id])
    .filter((f): f is KnowledgeFact => Boolean(f));

  /* Detect facts that arrived after mount → pulse their section, fade chips. */
  const prevIds = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (prevIds.current === null) {
      prevIds.current = new Set(factIds);
      return;
    }
    const before = prevIds.current;
    const added = factIds.filter((id) => !before.has(id));
    prevIds.current = new Set(factIds);
    if (added.length === 0) return;
    setFresh(new Set(added));
    const t = setTimeout(() => setFresh(new Set()), 1400);
    return () => clearTimeout(t);
  }, [factIds]);

  const bySection = new Map<KnowledgeSection, KnowledgeFact[]>();
  for (const f of facts) {
    const list = bySection.get(f.section) ?? [];
    list.push(f);
    bySection.set(f.section, list);
  }

  const confirmedCount = facts.filter((f) => f.confirmed).length;
  const assumptionCount = bySection.get("assumptions")?.length ?? 0;
  const gapCount = bySection.get("gaps")?.length ?? 0;
  const pct = facts.length ? Math.round((confirmedCount / facts.length) * 100) : 0;

  const pulsingSections = new Set<KnowledgeSection>();
  for (const f of facts) if (fresh.has(f.id)) pulsingSections.add(f.section);

  return (
    <div className={`${styles.kWrap} ${compact ? styles.kCompact : ""}`}>
      {title && <h3 className="oa-h3">{title}</h3>}

      {!compact && (
        <div className={`oa-card oa-card--flat ${styles.meter}`}>
          <div className="oa-between">
            <div style={{ display: "grid", gap: 3 }}>
              <p className="oa-micro">Business understanding</p>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }} aria-live="polite">
                {confirmedCount} of {facts.length} facts confirmed
              </p>
            </div>
            <p className="oa-sub" style={{ textAlign: "right" }}>
              {assumptionCount} assumption{assumptionCount === 1 ? "" : "s"} ·{" "}
              {gapCount} open question{gapCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="oa-progress oa-progress--teal" aria-hidden>
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {SECTION_ORDER.map((section) => {
        const sectionFacts = bySection.get(section) ?? [];
        /* Captured facts only: sections without content never render as
           empty placeholders (spec §5). */
        if (sectionFacts.length === 0) return null;
        const Icon = SECTION_ICONS[section];
        const confirmed = sectionFacts.filter((f) => f.confirmed).length;
        const heading =
          section === "gaps"
            ? "We will clarify this next"
            : KNOWLEDGE_SECTION_LABELS[section];
        return (
          <section
            key={section}
            className={`${styles.kSection} ${pulsingSections.has(section) ? "oa-pulse-ring" : ""}`}
            aria-label={heading}
          >
            <header className={styles.kHead}>
              <span className={styles.kHeadId}>
                <Icon size={15} aria-hidden />
                <h4 className="oa-h3" style={{ fontSize: 14.5 }}>
                  {heading}
                </h4>
              </span>
              <span className="oa-sub">
                {section === "gaps"
                  ? `${sectionFacts.length} to clarify`
                  : `${sectionFacts.length} fact${sectionFacts.length === 1 ? "" : "s"} · ${confirmed} confirmed`}
              </span>
            </header>

            <div className={styles.factGrid}>
              {sectionFacts.map((f) => (
                <motion.article
                  key={f.id}
                  className={factCardClass(f)}
                  initial={fresh.has(f.id) && !reduced ? { opacity: 0, y: 12 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: DUR.card, ease: EASE }}
                >
                  <span className={styles.factLabel}>
                    {section === "gaps" && <CircleHelp size={12} aria-hidden />}
                    {f.label}
                    {section === "gaps" && (
                      <span className="oa-tag oa-tag--neutral" style={{ marginLeft: "auto" }}>
                        Open question
                      </span>
                    )}
                  </span>
                  <span className={styles.factValue}>{f.value}</span>
                  <span>
                    <ProvenanceChip provenance={f.provenance} confidence={f.confidence} />
                  </span>
                </motion.article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
