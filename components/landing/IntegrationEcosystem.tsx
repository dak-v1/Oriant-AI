"use client";
/**
 * IntegrationEcosystem — grouped integration ecosystem (master brief §7.9).
 * A hub-and-clusters composition: a dark "Oriant.ai" hub pill at the top
 * centre, connected on desktop by faint dashed lines to six grouped
 * integration cards. Airy by design — not a dense directory.
 */
import { motion, type Variants } from "framer-motion";
import SectionReveal, { LP_EASE } from "./SectionReveal";
import { INTEGRATIONS } from "@/lib/landing-content";
import styles from "./IntegrationEcosystem.module.css";

const listVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.12 },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: LP_EASE } },
};

/** Renders `text` with the first occurrence of `phrase` in the serif accent. */
function SerifPhrase({ text, phrase }: { text: string; phrase: string }) {
  const idx = text.indexOf(phrase);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="lp-serif">{phrase}</span>
      {text.slice(idx + phrase.length)}
    </>
  );
}

type IntegrationGroup = { name: string; tools: readonly string[] };

function GroupCard({ group }: { group: IntegrationGroup }) {
  return (
    <div className={`lp-card ${styles.card}`}>
      <h3 className={`lp-micro ${styles.groupName}`}>{group.name}</h3>
      <ul className={styles.chipRow}>
        {group.tools.map((tool) => (
          <li key={tool} className={styles.chipItem}>
            <span className={`lp-chip ${styles.chip}`}>{tool}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function IntegrationEcosystem() {
  return (
    <section id="integrations" className="lp-section lp-section--alt">
      <div className="lp-container">
        <SectionReveal>
          <div className="lp-section-head">
            <span className="lp-eyebrow">Integrations</span>
            <h2 className="lp-h2">
              <SerifPhrase text={INTEGRATIONS.heading} phrase="fit" />
            </h2>
            <p className="lp-lead">{INTEGRATIONS.disclaimer}</p>
          </div>
        </SectionReveal>

        <div className={styles.diagram}>
          <SectionReveal delay={0.05}>
            <div className={styles.hubRow}>
              <div className={styles.hub}>
                <span className={styles.hubDot} aria-hidden="true" />
                Oriant.ai
              </div>
            </div>
            {/* Decorative dashed connections: hub → spine → top-row cards.
                Desktop only; hidden below 1024px. */}
            <div className={styles.connector} aria-hidden="true">
              <span className={styles.dropLeft} />
              <span className={styles.dropRight} />
            </div>
          </SectionReveal>

          <motion.ul
            className={styles.grid}
            variants={listVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "0px 0px -80px 0px" }}
          >
            {INTEGRATIONS.groups.map((group) => (
              <motion.li
                key={group.name}
                className={styles.cell}
                variants={cardVariants}
              >
                <GroupCard group={group} />
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </div>
    </section>
  );
}
