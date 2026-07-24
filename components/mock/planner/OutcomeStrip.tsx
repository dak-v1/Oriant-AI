"use client";
/**
 * OutcomeStrip — the outcome summary strip under the plan header
 * (improvement spec §12.1): two to four expected outcomes, each with the
 * plan workflows that deliver it. Content derives from PLAN_OUTCOMES plus
 * the workflows currently in the plan, so NL changes update it live.
 */
import { Check } from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import { outcomeSupport } from "./planner-utils";
import styles from "./planner.module.css";

export default function OutcomeStrip() {
  const agents = useDemoStore((s) => s.plan.agents);
  const items = outcomeSupport(agents);
  if (items.length === 0) return null;

  return (
    <section
      className={`oa-card oa-card--flat ${styles.outcomeStrip}`}
      aria-label="Expected outcomes and their supporting workflows"
    >
      <div className={styles.outcomeHead}>
        <p className="oa-micro">Outcome summary</p>
        <p className="oa-sub">
          What this plan is expected to deliver, and the workflows behind each outcome.
        </p>
      </div>
      <div className={styles.outcomeGrid}>
        {items.map((item) => (
          <div key={item.outcome} className={styles.outcomeItem}>
            <p className={styles.outcomeText}>
              <Check size={13} aria-hidden />
              {item.outcome}
            </p>
            <div className={styles.outcomeWfs}>
              {item.workflowNames.map((name) => (
                <span key={name} className={styles.outcomeWfChip}>
                  {name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
