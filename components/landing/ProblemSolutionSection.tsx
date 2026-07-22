"use client";
/**
 * ProblemSolutionSection — master brief §7.4.
 * The four problem cards on the alt band, then the full-width rose
 * solution panel pivot. Reveal-once motion only; MotionConfig
 * reducedMotion="user" suppresses transforms under reduced motion.
 */
import { motion } from "framer-motion";
import {
  Check,
  Compass,
  Layers,
  PencilRuler,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { PROBLEM, SOLUTION } from "@/lib/landing-content";
import SectionReveal, { LP_EASE } from "./SectionReveal";
import styles from "./ProblemSolutionSection.module.css";

/* One glyph per problem card, in PROBLEM.cards order:
   no starting point → Compass; tools without a plan → PencilRuler;
   not enough control → ShieldAlert; more complexity → Layers. */
const PROBLEM_ICONS: readonly LucideIcon[] = [
  Compass,
  PencilRuler,
  ShieldAlert,
  Layers,
];

/* Phrase inside SOLUTION.statement rendered in the editorial serif. */
const SERIF_PHRASE = "the business";

function SolutionStatement() {
  const statement: string = SOLUTION.statement;
  const index = statement.indexOf(SERIF_PHRASE);

  if (index === -1) {
    return <p className={styles.statement}>{statement}</p>;
  }

  return (
    <p className={styles.statement}>
      {statement.slice(0, index)}
      <span className={`lp-serif ${styles.statementSerif}`}>
        {SERIF_PHRASE}
      </span>
      {statement.slice(index + SERIF_PHRASE.length)}
    </p>
  );
}

function ProblemCardBody({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <div className={`lp-card ${styles.problemCard}`}>
      <span className={styles.glyph} aria-hidden="true">
        <Icon size={18} strokeWidth={2} aria-hidden="true" />
      </span>
      <h3 className={styles.cardTitle}>{title}</h3>
      <p className={styles.cardBody}>{body}</p>
    </div>
  );
}

export default function ProblemSolutionSection() {
  return (
    <section
      className="lp-section lp-section--alt"
      aria-labelledby="problem-solution-heading"
    >
      <div className="lp-container">
        <SectionReveal className="lp-section-head">
          <p className="lp-eyebrow">The problem</p>
          <h2 id="problem-solution-heading" className="lp-h2">
            {PROBLEM.heading}
          </h2>
        </SectionReveal>

        <ul className={styles.problemGrid}>
          {PROBLEM.cards.map((card, i) => {
            const Icon = PROBLEM_ICONS[i] ?? Layers;

            return (
              <motion.li
                key={card.title}
                className={styles.problemItem}
                initial={{ opacity: 0, y: 26 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "0px 0px -80px 0px" }}
                transition={{ duration: 0.6, delay: i * 0.06, ease: LP_EASE }}
              >
                <ProblemCardBody
                  icon={Icon}
                  title={card.title}
                  body={card.body}
                />
              </motion.li>
            );
          })}
        </ul>

        <SectionReveal className={styles.solutionPanel} delay={0.08}>
          <p className={`lp-eyebrow ${styles.solutionEyebrow}`}>The solution</p>
          <SolutionStatement />
          <ul className={styles.pointGrid}>
            {SOLUTION.points.map((point) => (
              <li key={point} className={styles.pointRow}>
                <span className={styles.pointCheck} aria-hidden="true">
                  <Check size={15} strokeWidth={2} aria-hidden="true" />
                </span>
                <span className={styles.pointText}>{point}</span>
              </li>
            ))}
          </ul>
        </SectionReveal>
      </div>
    </section>
  );
}
