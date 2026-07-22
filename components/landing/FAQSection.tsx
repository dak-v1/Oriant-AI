"use client";
/**
 * FAQSection — accessible single-open FAQ accordion (redesign brief §18).
 * Primary motion concept: the grid-template-rows 0fr→1fr open/close itself,
 * now with entrance rhythm — the ten items stagger into view individually
 * (whileInView once, 0.05s stagger) sliding in from alternating ±16px x
 * offsets instead of one block reveal. The open item gets an accent bar
 * sliding down its left edge (scaleY, 0.3s), the answer text fades up 8px
 * as the panel opens, and the Plus icon rotates with a slight overshoot.
 * No loops anywhere; MotionConfig reducedMotion="user" collapses the x
 * slides to fades and the global kill in landing.css makes every transition
 * instant. First item open by default so the server HTML reads complete.
 * Keyboard: native button semantics plus APG accordion
 * ArrowUp/ArrowDown/Home/End focus movement — behaviour unchanged.
 */

import { useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { FAQS } from "@/lib/landing-content";
import SectionReveal from "./SectionReveal";
import { DUR, EASE } from "./motion";
import styles from "./FAQSection.module.css";

/** Entrance rhythm: 0.05s between items, alternating ±16px x offsets. */
const ITEM_STAGGER = 0.05;
const ITEM_OFFSET = 16;

export default function FAQSection() {
  const baseId = useId();
  const [openIndex, setOpenIndex] = useState<number>(0);
  const triggersRef = useRef<Array<HTMLButtonElement | null>>([]);

  const onTriggerKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const count = FAQS.length;
    let target: number;
    switch (event.key) {
      case "ArrowDown":
        target = (index + 1) % count;
        break;
      case "ArrowUp":
        target = (index - 1 + count) % count;
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    triggersRef.current[target]?.focus();
  };

  return (
    <section id="faq" className={`lp-section ${styles.section}`}>
      <div className="lp-container">
        <SectionReveal y={24}>
          <div className={styles.head}>
            <span className="lp-eyebrow">FAQ</span>
            <h2 className="lp-h2-sm">
              Questions, <span className="lp-serif">answered</span>.
            </h2>
          </div>
        </SectionReveal>

        <div className={styles.accordion}>
          {FAQS.map((item, i) => {
            const isOpen = openIndex === i;
            const buttonId = `${baseId}-faq-btn-${i}`;
            const panelId = `${baseId}-faq-panel-${i}`;
            return (
              <motion.div
                key={item.q}
                className={
                  isOpen ? `${styles.item} ${styles.itemOpen}` : styles.item
                }
                initial={{
                  opacity: 0,
                  x: i % 2 === 0 ? -ITEM_OFFSET : ITEM_OFFSET,
                }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "0px 0px -60px 0px" }}
                transition={{
                  duration: DUR.card,
                  delay: i * ITEM_STAGGER,
                  ease: EASE,
                }}
              >
                {/* Accent bar sliding down the open item's left edge */}
                <span className={styles.accentBar} aria-hidden="true" />
                <h3 className={styles.question}>
                  <button
                    type="button"
                    id={buttonId}
                    ref={(el) => {
                      triggersRef.current[i] = el;
                    }}
                    className={styles.trigger}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() =>
                      setOpenIndex((prev) => (prev === i ? -1 : i))
                    }
                    onKeyDown={(event) => onTriggerKeyDown(event, i)}
                  >
                    <span className={styles.questionText}>{item.q}</span>
                    <span className={styles.icon} aria-hidden="true">
                      <Plus size={18} strokeWidth={2} aria-hidden="true" />
                    </span>
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  className={
                    isOpen
                      ? `${styles.panel} ${styles.panelOpen}`
                      : styles.panel
                  }
                >
                  <div className={styles.panelClip}>
                    <p className={styles.answer}>{item.a}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
