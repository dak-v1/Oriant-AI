"use client";
/**
 * components/live/workspace/AttentionPanel.tsx — the "at risk" tile, expanded
 * into the things it is counting (ROLE_C_PLAN M5).
 *
 * A number on a tile is an alarm without an instruction. This panel exists so
 * that the moment "At risk: 3" is not zero, the three are named, each with the
 * runtime's own reason attached and a link where one exists. It renders only
 * when there is something in it: a permanently present "Needs attention (0)"
 * card teaches an owner to stop reading it, and this is the one region of the
 * page that has to survive being read quickly.
 *
 * FOUR KINDS, EACH LABELLED. Overdue approvals, dead-lettered jobs, failed runs
 * and refused runs sit in one list because they share a property — a human has
 * to do something — and are labelled individually because the something is
 * different every time. An overdue approval needs a decision; a dead-lettered
 * job needs a diagnosis and will not retry itself; a refusal means the plan is
 * asking an agent to do something policy forbids, which will recur on every
 * fire until the plan changes. The chip carries that word, so the kind is never
 * inferred from position or colour.
 *
 * The definition of the set is in `atRiskItems`, not here — see
 * read-model.ts, including why a SKIPPED job is deliberately absent from it.
 */

import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { ATTENTION_LABEL } from "./read-model";
import type { AttentionItem } from "./read-model";
import styles from "./live-workspace.module.css";

export default function AttentionPanel({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="live-ws-attention"
      className={`oa-card ${styles.card} ${styles.attentionCard}`}
    >
      <div className={styles.cardHead}>
        <div className={styles.cardTitle}>
          <AlertTriangle size={16} className={styles.cardIcon} aria-hidden />
          <h2 className="oa-h3" id="live-ws-attention">
            Needs attention
          </h2>
          <span className="oa-tag oa-tag--amber">{items.length}</span>
        </div>
      </div>

      <ul className={styles.rows}>
        {items.map((item) => {
          const body = (
            <>
              <span className={styles.rowMain}>
                <span className={styles.rowMeta}>
                  <span className={styles.attentionKind}>
                    {ATTENTION_LABEL[item.kind]}
                  </span>
                </span>
                <span className={styles.rowTitle}>{item.title}</span>
                <span className={styles.rowSub}>{item.detail}</span>
              </span>
              {item.href !== null && (
                <span className={styles.rowSide} aria-hidden>
                  <ArrowRight size={16} />
                </span>
              )}
            </>
          );

          return (
            <li key={item.id}>
              {item.href === null ? (
                <div className={`oa-row ${styles.itemRow}`}>{body}</div>
              ) : (
                <Link href={item.href} className={`oa-row oa-row--click ${styles.itemRow}`}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
