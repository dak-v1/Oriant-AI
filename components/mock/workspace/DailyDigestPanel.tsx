"use client";
/**
 * DailyDigestPanel — the grouped daily digest (improvement spec §18, DD-01).
 *
 * A structured summary, not a feed, in the §18.1 order: Today at a glance,
 * Needs your attention (rows deep-link to the approval inbox), Completed
 * automatically (collapsed team groups, expandable), Coming up, Insights.
 * Header carries the date, coverage period and a "Generated from mock
 * activity" tag. Content is a deterministic fixture; no timers.
 */
import { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  Gauge,
  Lightbulb,
  ListChecks,
} from "lucide-react";
import { DAILY_DIGEST_V2 } from "@/lib/mock/fixtures/reports";
import type { RiskLevel } from "@/lib/mock/types";
import { DUR, EASE, STAGGER } from "@/lib/mock/motion";
import { dayLabel } from "./format";
import styles from "./workspace.module.css";

const RISK_CLS: Record<RiskLevel, string> = {
  high: "riskHigh",
  medium: "riskMedium",
  low: "riskLow",
};

export default function DailyDigestPanel({ index }: { index: number }) {
  const reduced = useReducedMotion();
  const [openTeams, setOpenTeams] = useState<Record<string, boolean>>({});
  const digest = DAILY_DIGEST_V2;

  const toggleTeam = (team: string) =>
    setOpenTeams((prev) => ({ ...prev, [team]: !prev[team] }));

  return (
    <motion.section
      aria-label="Daily digest"
      className={`oa-card ${styles.card}`}
      initial={reduced ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.card, ease: EASE, delay: index * STAGGER }}
    >
      <div className={styles.cardHead}>
        <div className={styles.cardTitle}>
          <ListChecks size={16} className={styles.cardIcon} aria-hidden />
          <h2 className="oa-h3">Daily digest</h2>
        </div>
        <div className={styles.digestMeta}>
          <span className="oa-sub">
            {dayLabel(digest.date)} · {digest.coverage}
          </span>
          <span className="oa-tag oa-tag--neutral">Generated from mock activity</span>
        </div>
      </div>

      <div className={styles.dgCols}>
        <div className={styles.dgCol}>
          {/* ── 1. Today at a glance ── */}
          <section aria-label="Today at a glance" className={styles.dgSection}>
            <span className={styles.dgHead}>
              <Gauge size={12} aria-hidden style={{ color: "var(--oa-muted-strong)" }} />
              Today at a glance
            </span>
            <div className={styles.flatList}>
              {digest.glance.map((row) => (
                <div key={row.label} className={styles.glanceRow}>
                  <span className={styles.glanceLabel}>
                    {row.label}
                    {row.note && <span className={styles.glanceNote}>{row.note}</span>}
                  </span>
                  <span className={styles.glanceValue}>{row.value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── 2. Needs your attention (deep-links to the approval inbox) ── */}
          <section aria-label="Needs your attention" className={styles.dgSection}>
            <span className={styles.dgHead}>
              <Clock size={12} aria-hidden style={{ color: "var(--oa-amber-ink)" }} />
              Needs your attention
              <span className={`oa-tag oa-tag--amber ${styles.countTag}`}>
                {digest.attention.length}
              </span>
            </span>
            <div className={styles.flatList}>
              {digest.attention.map((item) => (
                <Link
                  key={item.title}
                  href="/app/workspace/approvals"
                  className={styles.attnRow}
                >
                  <span className={`${styles.risk} ${styles[RISK_CLS[item.risk]]}`}>
                    {item.risk} risk
                  </span>
                  <span className={styles.attnMain}>
                    <span className={styles.rowTitle}>{item.title}</span>
                    <span className={`${styles.due} ${styles.dueToday}`}>
                      Due {item.due} · Review in the approval inbox
                    </span>
                  </span>
                  <ChevronRight size={14} className={styles.attnArrow} aria-hidden />
                </Link>
              ))}
            </div>
          </section>
        </div>

        <div className={styles.dgCol}>
          {/* ── 3. Completed automatically, grouped by team ── */}
          <section aria-label="Completed automatically" className={styles.dgSection}>
            <span className={styles.dgHead}>
              <Check size={12} aria-hidden style={{ color: "var(--oa-teal-deep)" }} />
              Completed automatically
            </span>
            <div className={styles.flatList}>
              {digest.completedByTeam.map((group) => {
                const open = Boolean(openTeams[group.team]);
                return (
                  <div key={group.team} className={styles.teamGroup}>
                    <button
                      type="button"
                      className={styles.teamBtn}
                      aria-expanded={open}
                      onClick={() => toggleTeam(group.team)}
                    >
                      <ChevronRight
                        size={14}
                        aria-hidden
                        className={`${styles.teamChevron} ${open ? styles.teamChevronOpen : ""}`}
                      />
                      {group.team}
                      <span className={styles.teamCount}>
                        {group.items.length} completed
                      </span>
                    </button>
                    {open && (
                      <ul className={styles.teamItems}>
                        {group.items.map((item) => (
                          <li key={item} className={styles.dgItem}>
                            <Check size={13} className={styles.dgCheck} aria-hidden />
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── 4. Coming up ── */}
          <section aria-label="Coming up" className={styles.dgSection}>
            <span className={styles.dgHead}>
              <CalendarDays size={12} aria-hidden style={{ color: "var(--oa-blue-dark)" }} />
              Coming up
            </span>
            <ul className={styles.dgList}>
              {digest.comingUp.map((line) => (
                <li key={line} className={styles.dgItem}>
                  <span className={styles.dgDot} aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </section>

          {/* ── 5. Insights ── */}
          <section aria-label="Insights" className={styles.dgSection}>
            <span className={styles.dgHead}>
              <Lightbulb size={12} aria-hidden style={{ color: "var(--oa-blue-dark)" }} />
              Insights
            </span>
            <ul className={styles.dgList}>
              {digest.insights.map((line) => (
                <li key={line} className={styles.insightRow}>
                  <Lightbulb size={13} className={styles.insightIcon} aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </motion.section>
  );
}
