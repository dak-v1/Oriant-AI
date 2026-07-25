"use client";
/**
 * WorkspaceOverview — the daily operating UI (spec §17, §19.1–§19.3;
 * improvement spec §16.1, W-01).
 *
 * One dominant grid: a four-stat top summary strip (every number carries a
 * label and a timeframe), a primary column (human approvals required, then
 * recent team activity) and a secondary column (today's schedule, next runs,
 * recent outcomes). The team tabline above filters everything. A slim
 * single-row "Ask Oriant" bar opens the universal command palette (§19.1).
 * Secondary sections sit below the grid: the grouped daily digest (§18),
 * connected-tools and cost summary lines, and the full weekly outcome
 * report. The bell opens the notifications drawer (§19.2). Approving inline
 * updates the approval row, calendar state and activity feed together.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ClipboardCheck,
  Clock,
  Info,
  MessageSquareText,
  Plug,
  Timer,
  Wallet,
} from "lucide-react";
import { useDemoStore, usePlanTotals } from "@/lib/mock/store";
import { AGENT, DEMO_TODAY } from "@/lib/mock/fixtures/ids";
import { WEEKLY_REPORT } from "@/lib/mock/fixtures/reports";
import { money } from "@/lib/mock/pricing";
import type { ActivityEvent, ApprovalItem, WorkspaceTeam } from "@/lib/mock/types";
import { DUR, EASE, STAGGER } from "@/lib/mock/motion";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { toast } from "@/components/mock/ui/Toaster";
import CommandPalette from "@/components/mock/shell/CommandPalette";
import NotificationsDrawer from "./NotificationsDrawer";
import DailyDigestPanel from "./DailyDigestPanel";
import { TEAM_LABEL, dayLabel, dueLabel } from "./format";
import styles from "./workspace.module.css";

/* Team tabs (spec §17). "Agents" is a link to the roster page, not a filter. */
const TEAM_TABS: { id: WorkspaceTeam; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "customer_care", label: "Customer Care" },
  { id: "admin", label: "Admin" },
  { id: "marketing", label: "Marketing" },
  { id: "finance", label: "Finance" },
];

/** Which workspace team each plan agent reports under (team-filtered stats). */
const AGENT_TEAM: Record<string, Exclude<WorkspaceTeam, "overview" | "agents">> = {
  [AGENT.admin]: "admin",
  [AGENT.marketing]: "marketing",
  [AGENT.finance]: "finance",
  [AGENT.recovery]: "customer_care",
};

const TONE_ICON: Record<ActivityEvent["tone"], { icon: typeof Check; cls: string }> = {
  done: { icon: Check, cls: "toneDone" },
  wait: { icon: Clock, cls: "toneWait" },
  info: { icon: Info, cls: "toneInfo" },
  alert: { icon: AlertTriangle, cls: "toneAlert" },
};

const RISK_CLS: Record<ApprovalItem["risk"], string> = {
  high: "riskHigh",
  medium: "riskMedium",
  low: "riskLow",
};

/** Condensed weekly metrics for the "Recent outcomes" secondary card. */
const CONDENSED_METRIC_LABELS = ["Hours saved", "Revenue impact", "Workflow success rate"];

/** Shared entrance wrapper — collapses to instant state under reduced motion. */
function Card({
  index,
  className,
  children,
  label,
  id,
}: {
  index: number;
  className?: string;
  children: React.ReactNode;
  label: string;
  id?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.section
      id={id}
      aria-label={label}
      className={`oa-card ${styles.card} ${className ?? ""}`}
      initial={reduced ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.card, ease: EASE, delay: index * STAGGER }}
    >
      {children}
    </motion.section>
  );
}

export default function WorkspaceOverview() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const team = useDemoStore((s) => s.workspace.team);
  const setTeam = useDemoStore((s) => s.setTeam);
  const approvals = useDemoStore((s) => s.workspace.approvals);
  const calendarEvents = useDemoStore((s) => s.workspace.calendarEvents);
  const activity = useDemoStore((s) => s.workspace.activity);
  const unreadCount = useDemoStore((s) => s.workspace.unreadNotifications.length);
  const planAgents = useDemoStore((s) => s.plan.agents);
  const integrations = useDemoStore((s) => s.integrations);
  const approveItem = useDemoStore((s) => s.approveItem);
  const totals = usePlanTotals();

  const [notifOpen, setNotifOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  /* Team tabs: arrow-key support with roving tabindex (spec §19). */
  const onTeamTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const ids = TEAM_TABS.map((t) => t.id);
    const idx = ids.indexOf(team);
    const next = ids[(idx + (e.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length];
    setTeam(next);
    document.getElementById(`workspace-team-tab-${next}`)?.focus();
  };

  const filterTeam = team === "overview" ? null : team;
  const teamLabel =
    filterTeam && filterTeam !== "agents" ? TEAM_LABEL[filterTeam] : null;

  const pendingApprovals = useMemo(() => {
    return Object.values(approvals)
      .filter(
        (a) =>
          (a.status === "pending" || a.status === "review_requested") &&
          (!filterTeam || a.team === filterTeam),
      )
      .sort((a, b) =>
        `${a.dueAt} ${a.dueTime}`.localeCompare(`${b.dueAt} ${b.dueTime}`),
      );
  }, [approvals, filterTeam]);

  const scheduled = useMemo(() => {
    const all = Object.values(calendarEvents).filter(
      (e) => !filterTeam || e.team === filterTeam,
    );
    const today = all
      .filter((e) => e.date === DEMO_TODAY)
      .sort((a, b) => a.time.localeCompare(b.time));
    const upcoming = all
      .filter((e) => e.date > DEMO_TODAY)
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
      .slice(0, 4);
    return { today, upcoming };
  }, [calendarEvents, filterTeam]);

  /* Workflows at risk = failed + needs-changes calendar events (§16.1a). */
  const atRiskCount = useMemo(
    () =>
      Object.values(calendarEvents).filter(
        (e) =>
          (e.state === "failed" || e.state === "needs_changes") &&
          (!filterTeam || e.team === filterTeam),
      ).length,
    [calendarEvents, filterTeam],
  );

  /* Enabled workflows across active agents (team-filtered via AGENT_TEAM). */
  const activeWorkflowCount = useMemo(
    () =>
      planAgents
        .filter(
          (a) =>
            a.status === "active" &&
            (!filterTeam || AGENT_TEAM[a.agentId] === filterTeam),
        )
        .reduce(
          (n, a) =>
            n +
            a.workflowOrder.filter((id) => a.config.workflowsEnabled[id] !== false)
              .length,
          0,
        ),
    [planAgents, filterTeam],
  );

  const connectedTools = useMemo(() => {
    const all = Object.values(integrations);
    return {
      connected: all.filter((i) => i.status === "connected").length,
      total: all.length,
    };
  }, [integrations]);

  const teamActivity = useMemo(
    () => activity.filter((a) => !filterTeam || a.team === filterTeam),
    [activity, filterTeam],
  );

  const condensedMetrics = useMemo(
    () =>
      CONDENSED_METRIC_LABELS.map((label) =>
        WEEKLY_REPORT.metrics.find((m) => m.label === label),
      ).filter((m): m is NonNullable<typeof m> => Boolean(m)),
    [],
  );

  /* §16.1a: every stat = number + label + timeframe. */
  const summaryStats = [
    { value: activeWorkflowCount, label: "Active workflows", time: "running this week" },
    { value: pendingApprovals.length, label: "Approvals needed", time: "due this week" },
    { value: atRiskCount, label: "Workflows at risk", time: "this month" },
    { value: scheduled.today.length, label: "Scheduled runs", time: "today" },
  ];

  const approve = (item: ApprovalItem) => {
    approveItem(item.id);
    toast({
      title: "Approved",
      detail: item.title,
      tone: "ok",
    });
  };

  return (
    <main className="oa-page">
      {/* ── Header ── */}
      <header className={`oa-between ${styles.head}`}>
        <div className={styles.headTitles}>
          <p className="oa-eyebrow">Operate · Workspace</p>
          <h1 className="oa-h1">
            Your workforce, <span className="oa-serif">today</span>
          </h1>
          <p className="oa-lead">
            What your AI agents are doing right now, and the decisions waiting on you.
          </p>
        </div>
        <div className={styles.headActions}>
          <span className={styles.headDate}>Friday 24 July 2026</span>
          <div className={styles.bellWrap}>
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--icon"
              aria-label={
                unreadCount > 0
                  ? `Notifications, ${unreadCount} unread`
                  : "Notifications"
              }
              onClick={() => setNotifOpen(true)}
            >
              <Bell size={16} aria-hidden />
            </button>
            {unreadCount > 0 && (
              <span className={styles.bellBadge} aria-hidden>
                {unreadCount}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ── Team tabline (§16.1d) ── */}
      <div
        className={`oa-tabline ${styles.tabline}`}
        role="tablist"
        aria-label="Workspace teams"
        onKeyDown={onTeamTabKey}
      >
        {TEAM_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`workspace-team-tab-${t.id}`}
            aria-selected={team === t.id}
            tabIndex={team === t.id ? 0 : -1}
            className={`oa-tabline-tab ${team === t.id ? "oa-tabline-tab--active" : ""}`}
            onClick={() => setTeam(t.id)}
          >
            {t.label}
          </button>
        ))}
        <Link
          href="/app/workspace/agents"
          className={`oa-tabline-tab ${styles.tabLink}`}
        >
          Agents
          <ArrowUpRight size={13} aria-hidden />
        </Link>
      </div>

      {/* ── 1. Top summary strip (§16.1a) ── */}
      <motion.section
        aria-label="Workspace summary"
        className={`oa-card ${styles.summaryCard}`}
        initial={reduced ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.card, ease: EASE }}
      >
        {summaryStats.map((s) => (
          <div key={s.label} className={styles.sumStat}>
            <span className={styles.sumNum}>{s.value}</span>
            <span className={styles.sumLabel}>{s.label}</span>
            <span className={styles.sumTime}>{s.time}</span>
          </div>
        ))}
      </motion.section>

      {/* ── 2. Slim "Ask Oriant" command bar (§16.1e) ── */}
      <motion.section
        aria-label="Ask Oriant"
        className={`oa-card ${styles.cmdBar}`}
        initial={reduced ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.card, ease: EASE, delay: STAGGER }}
      >
        <span className={styles.cmdLabel}>
          <MessageSquareText size={15} aria-hidden />
          Ask Oriant
        </span>
        <button
          type="button"
          className={styles.cmdInputBtn}
          onClick={() => setPaletteOpen(true)}
        >
          <span className={styles.cmdInputText}>
            Ask Oriant to prepare, summarise or change something…
          </span>
          <span className={styles.cmdKbd} aria-hidden>
            ⌘K
          </span>
        </button>
      </motion.section>

      {/* ── 3. The dominant grid: primary + secondary columns ── */}
      <div className={styles.cols}>
        {/* ════════ Primary column (§16.1b) ════════ */}
        <div className={styles.col}>
          {/* Human approvals required */}
          <Card index={2} label="Human approvals required">
            <div className={styles.cardHead}>
              <div className={styles.cardTitle}>
                <ClipboardCheck size={16} className={styles.cardIcon} aria-hidden />
                <h2 className="oa-h3">Human approvals required</h2>
                {pendingApprovals.length > 0 && (
                  <span className={`oa-tag oa-tag--amber ${styles.countTag}`}>
                    {pendingApprovals.length}
                  </span>
                )}
              </div>
              <Link
                href="/app/workspace/approvals"
                className="oa-btn oa-btn--primary oa-btn--sm"
              >
                Open approval inbox
                <ArrowRight size={13} aria-hidden />
              </Link>
            </div>

            {pendingApprovals.length === 0 ? (
              <p className={`oa-sub ${styles.emptyNote}`}>
                Nothing is waiting on you{teamLabel ? ` in ${teamLabel}` : ""} right now.
              </p>
            ) : (
              <div className={styles.rows}>
                <AnimatePresence initial={false}>
                  {pendingApprovals.slice(0, 4).map((item) => (
                    <motion.div
                      key={item.id}
                      layout={!reduced}
                      exit={reduced ? undefined : { opacity: 0, x: 12 }}
                      transition={{ duration: DUR.micro, ease: EASE }}
                      className={`oa-row oa-row--click ${styles.approvalRow}`}
                      onClick={() => router.push("/app/workspace/approvals")}
                    >
                      <div className={styles.rowMain}>
                        <Link
                          href="/app/workspace/approvals"
                          className={styles.rowTitle}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {item.title}
                        </Link>
                        <span className={styles.rowSub}>
                          {item.agentName} · {item.valueLabel}
                        </span>
                        <span className={styles.rowMeta}>
                          <span className={`${styles.risk} ${styles[RISK_CLS[item.risk]]}`}>
                            {item.risk} risk
                          </span>
                          <span
                            className={`${styles.due} ${
                              item.dueAt === DEMO_TODAY ? styles.dueToday : ""
                            }`}
                          >
                            <Clock size={12} aria-hidden />
                            Due {dueLabel(item.dueAt, item.dueTime)}
                          </span>
                        </span>
                      </div>
                      <div className={styles.rowSide}>
                        <button
                          type="button"
                          className="oa-btn oa-btn--soft oa-btn--sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            approve(item);
                          }}
                        >
                          <Check size={13} aria-hidden />
                          Approve
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </Card>

          {/* Recent team activity */}
          <Card index={3} label="Recent team activity">
            <div className={styles.cardHead}>
              <div className={styles.cardTitle}>
                <ActivityIcon size={16} className={styles.cardIcon} aria-hidden />
                <h2 className="oa-h3">Recent team activity</h2>
              </div>
              {teamLabel && <span className="oa-tag oa-tag--neutral">{teamLabel}</span>}
            </div>
            {teamActivity.length === 0 ? (
              <p className={`oa-sub ${styles.emptyNote}`}>
                No activity{teamLabel ? ` from ${teamLabel}` : ""} yet today.
              </p>
            ) : (
              <div className={styles.activityList} aria-live="polite">
                <AnimatePresence initial={false}>
                  {teamActivity.slice(0, 8).map((ev, i) => {
                      const tone = TONE_ICON[ev.tone];
                      const ToneIcon = tone.icon;
                      return (
                        <motion.div
                          key={ev.id}
                          layout={!reduced}
                          initial={reduced ? false : { opacity: 0, y: 8 }}
                          animate={{
                            opacity: 1,
                            y: 0,
                            transition: {
                              duration: DUR.card,
                              ease: EASE,
                              delay: Math.min(i, 6) * (STAGGER / 1.4),
                            },
                          }}
                          className={styles.activityRow}
                        >
                          <span
                            className={`${styles.activityIcon} ${styles[tone.cls]}`}
                            aria-hidden
                          >
                            <ToneIcon size={13} />
                          </span>
                          <div className={styles.activityBody}>
                            <p className={styles.activityMsg}>{ev.message}</p>
                            <p className={styles.activityMeta}>
                              {ev.agentName} · {ev.at}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })}
                </AnimatePresence>
              </div>
            )}
          </Card>
        </div>

        {/* ════════ Secondary column (§16.1c) ════════ */}
        <div className={styles.col}>
          {/* Today's schedule */}
          <Card index={2} label="Today's schedule">
            <div className={styles.cardHead}>
              <div className={styles.cardTitle}>
                <CalendarDays size={16} className={styles.cardIcon} aria-hidden />
                <h2 className="oa-h3">Today&apos;s schedule</h2>
              </div>
              <Link href="/app/workspace/calendar" className={styles.linkArrow}>
                Open calendar
                <ArrowRight size={13} aria-hidden />
              </Link>
            </div>
            {scheduled.today.length === 0 ? (
              <p className={`oa-sub ${styles.emptyNote}`}>
                No runs scheduled{teamLabel ? ` for ${teamLabel}` : ""} today.
              </p>
            ) : (
              <div className={styles.flatList}>
                {scheduled.today.map((ev) => (
                  <Link
                    key={ev.id}
                    href="/app/workspace/calendar"
                    className={styles.flatRow}
                  >
                    <span className={styles.timeBlock}>
                      <span className={styles.timeMain}>{ev.time}</span>
                      <span className={styles.timeSub}>Today</span>
                    </span>
                    <span className={styles.rowMain}>
                      <span className={styles.rowTitle}>{ev.title}</span>
                      <span className={styles.rowSub}>{ev.agentName}</span>
                    </span>
                    <StatusBadge status={ev.state} />
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Next runs */}
          <Card index={3} label="Next runs">
            <div className={styles.cardHead}>
              <div className={styles.cardTitle}>
                <Timer size={16} className={styles.cardIcon} aria-hidden />
                <h2 className="oa-h3">Next runs</h2>
              </div>
              <span className="oa-sub">next few days</span>
            </div>
            {scheduled.upcoming.length === 0 ? (
              <p className={`oa-sub ${styles.emptyNote}`}>
                No upcoming runs{teamLabel ? ` for ${teamLabel}` : ""} in the next few days.
              </p>
            ) : (
              <div className={styles.flatList}>
                {scheduled.upcoming.map((ev) => (
                  <Link
                    key={ev.id}
                    href="/app/workspace/calendar"
                    className={styles.flatRow}
                  >
                    <span className={styles.timeBlock}>
                      <span className={styles.timeMain}>{ev.time}</span>
                      <span className={styles.timeSub}>{dayLabel(ev.date)}</span>
                    </span>
                    <span className={styles.rowMain}>
                      <span className={styles.rowTitle}>{ev.title}</span>
                      <span className={styles.rowSub}>{ev.agentName}</span>
                    </span>
                    <StatusBadge status={ev.state} />
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Recent outcomes (condensed weekly snapshot) */}
          <Card index={4} label="Recent outcomes">
            <div className={styles.cardHead}>
              <div className={styles.cardTitle}>
                <BarChart3 size={16} className={styles.cardIcon} aria-hidden />
                <h2 className="oa-h3">Recent outcomes</h2>
              </div>
              <span className="oa-sub">{WEEKLY_REPORT.weekLabel}</span>
            </div>
            <div className={styles.flatList}>
              {condensedMetrics.map((m) => (
                <div key={m.label} className={styles.glanceRow}>
                  <span className={styles.glanceLabel}>{m.label}</span>
                  <span className={styles.glanceValue}>{m.value}</span>
                </div>
              ))}
            </div>
            <div className="oa-between">
              <span className="oa-sim-note">Estimates from demo data</span>
              <a href="#weekly-report" className={styles.linkArrow}>
                Full weekly report
                <ArrowRight size={13} aria-hidden />
              </a>
            </div>
          </Card>
        </div>
      </div>

      {/* ── 4. Secondary sections below the grid (§16.1f) ── */}
      <div className={styles.below}>
        {/* Daily digest (§18) */}
        <DailyDigestPanel index={5} />

        {/* Connected tools + cost summary lines */}
        <Card index={6} label="Connected tools and cost" className={styles.metaCard}>
          <div className={styles.metaRow}>
            <Plug size={15} className={styles.metaIcon} aria-hidden />
            <span className={styles.metaText}>
              <strong>
                {connectedTools.connected} of {connectedTools.total}
              </strong>{" "}
              tools connected across your workspace
            </span>
            <Link
              href="/app/workspace/integrations"
              className={`${styles.linkArrow} ${styles.metaAction}`}
            >
              Manage integrations
              <ArrowRight size={13} aria-hidden />
            </Link>
          </div>
          <hr className="oa-divider" />
          <div className={styles.metaRow}>
            <Wallet size={15} className={styles.metaIcon} aria-hidden />
            <span className={styles.metaText}>
              Workforce cost: <strong>{money(totals.monthly)}/month</strong> for{" "}
              {planAgents.length} agents
            </span>
            <span className={`oa-sim-note ${styles.metaAction}`}>
              Illustrative pricing
            </span>
          </div>
        </Card>

        {/* Full weekly outcome report (§19.3) */}
        <Card
          index={7}
          label="Weekly outcome report"
          className={styles.weeklyCard}
          id="weekly-report"
        >
          <div className={styles.cardHead}>
            <div className={styles.cardTitle}>
              <BarChart3 size={16} className={styles.cardIcon} aria-hidden />
              <h2 className="oa-h3">Weekly outcome report</h2>
            </div>
            <span className="oa-sub">{WEEKLY_REPORT.weekLabel}</span>
          </div>
          <span className="oa-sim-note">Estimates from demo data</span>
          <div className={styles.metricGrid}>
            {WEEKLY_REPORT.metrics.map((m) => (
              <div key={m.label} className={styles.metricTile}>
                <span className={styles.metricLabel}>{m.label}</span>
                <span className={styles.metricValue}>{m.value}</span>
                <span className={styles.metricNote}>{m.note}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="oa-micro" style={{ marginBottom: 8 }}>
              Highlights
            </p>
            <ul className={styles.highlights}>
              {WEEKLY_REPORT.highlights.map((h) => (
                <li key={h} className={styles.highlight}>
                  <Check size={13} className={styles.highlightIcon} aria-hidden />
                  {h}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <NotificationsDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </main>
  );
}
