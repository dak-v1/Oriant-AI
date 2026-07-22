"use client";
/**
 * FAQSection — accessible single-open FAQ accordion (master brief §7.10).
 * Open/close uses the CSS grid-template-rows 0fr→1fr technique so no JS
 * measurement is needed and reduced motion collapses to instant via the
 * global reduced-motion block in landing.css.
 */
import { useId, useState } from "react";
import { Plus } from "lucide-react";
import SectionReveal from "./SectionReveal";
import { FAQS } from "@/lib/landing-content";
import styles from "./FAQSection.module.css";

function FAQItem({
  question,
  answer,
  open,
  onToggle,
  buttonId,
  panelId,
}: {
  question: string;
  answer: string;
  open: boolean;
  onToggle: () => void;
  buttonId: string;
  panelId: string;
}) {
  return (
    <div className={open ? `${styles.item} ${styles.itemOpen}` : styles.item}>
      <h3 className={styles.itemHeading}>
        <button
          type="button"
          id={buttonId}
          className={styles.trigger}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className={styles.question}>{question}</span>
          <Plus
            size={18}
            strokeWidth={2}
            aria-hidden="true"
            className={styles.icon}
          />
        </button>
      </h3>
      <div
        role="region"
        id={panelId}
        aria-labelledby={buttonId}
        className={styles.panel}
      >
        <div className={styles.panelInner}>
          <p className={styles.answer}>{answer}</p>
        </div>
      </div>
    </div>
  );
}

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const baseId = useId();

  return (
    <SectionReveal>
      <section id="faq" className="lp-section">
        <div className="lp-container">
          <div className={styles.head}>
            <span className="lp-eyebrow">FAQ</span>
            <h2 className="lp-h2">
              Questions, <span className="lp-serif">answered</span>.
            </h2>
          </div>

          <div className={styles.accordion}>
            {FAQS.map((faq, i) => (
              <FAQItem
                key={faq.q}
                question={faq.q}
                answer={faq.a}
                open={openIndex === i}
                onToggle={() =>
                  setOpenIndex((current) => (current === i ? null : i))
                }
                buttonId={`${baseId}-faq-q-${i}`}
                panelId={`${baseId}-faq-a-${i}`}
              />
            ))}
          </div>
        </div>
      </section>
    </SectionReveal>
  );
}
