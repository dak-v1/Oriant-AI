"use client";
/**
 * AgentKnowledgePanel — the live "Agent knowledge" rail for the custom-agent
 * design call (spec §11.5.3). Same soul as "What Oriant Knows" but local to
 * one agent: confirmed answers land as grouped chips, the touched group's
 * dot pulses once, and a quiet progress bar tracks coverage of the eight
 * design dimensions. Deliberately NOT imported from components/mock/discovery
 * to keep the experiences decoupled.
 */
import { motion, useReducedMotion } from "framer-motion";
import { NotebookPen } from "lucide-react";
import { DUR, EASE } from "@/lib/mock/motion";
import styles from "./agents.module.css";

export interface KnowledgeGroupData {
  id: string;
  label: string;
  chips: string[];
}

export default function AgentKnowledgePanel({ groups }: { groups: KnowledgeGroupData[] }) {
  const reduced = useReducedMotion();
  const captured = groups.reduce((n, g) => n + g.chips.length, 0);
  const filled = groups.filter((g) => g.chips.length > 0).length;

  return (
    <aside
      className={`oa-card oa-card--flat ${styles.card}`}
      aria-label="Agent knowledge"
      style={{ gap: 16 }}
    >
      <div className="oa-between" style={{ gap: 8 }}>
        <p className="oa-micro" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <NotebookPen size={13} aria-hidden />
          Agent knowledge
        </p>
        <span className="oa-sub">
          {captured === 0 ? "Nothing captured yet" : `${captured} detail${captured === 1 ? "" : "s"}`}
        </span>
      </div>

      <div
        className="oa-progress oa-progress--teal"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={groups.length}
        aria-valuenow={filled}
        aria-label={`${filled} of ${groups.length} design areas covered`}
      >
        <span style={{ width: `${(filled / Math.max(1, groups.length)) * 100}%` }} />
      </div>

      <div aria-live="polite" style={{ display: "grid", gap: 13 }}>
        {groups.map((g) => (
          <div key={g.id} style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span className="oa-micro">{g.label}</span>
              {g.chips.length > 0 && (
                <span
                  key={g.chips.length}
                  className="oa-pulse-ring"
                  aria-hidden
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--oa-teal)",
                    flex: "none",
                  }}
                />
              )}
            </div>
            {g.chips.length === 0 ? (
              <span className="oa-sub" style={{ opacity: 0.65 }}>
                Covered later in the call
              </span>
            ) : (
              <div className={styles.kChips}>
                {g.chips.map((chip) => (
                  <motion.span
                    key={chip}
                    initial={reduced ? false : { opacity: 0, y: 5, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: DUR.micro, ease: EASE }}
                    className="oa-chip"
                    style={{ padding: "4px 11px", fontSize: 12, whiteSpace: "normal" }}
                  >
                    {chip}
                  </motion.span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
