"use client";
/**
 * WorkspaceOverview — the daily operating UI (spec §17, §19.1–§19.3).
 *
 * Team tabline filters approvals, scheduled work and activity. The overview
 * grid: today summary, human approvals required, scheduled work, active
 * agents, recent activity, weekly outcome snapshot, daily digest, and the
 * universal command bar moment. The bell opens the notifications drawer
 * (§19.2). Approving inline updates the approval card, calendar state and
 * activity feed together (§20 "Workspace" motion row).
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
  Bot,
  CalendarDays,
  Check,
  ClipboardCheck,
  Clock,
  Info,
  ListChecks,
  Sparkles,
} from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import { AGENT_LIBRARY } from "@/lib/mock/fixtures/agent-library";
import { DEMO_TODAY, WF_NAME } from "@/lib/mock/fixtures/ids";
import { COMMANDS, DAILY_DIGEST, WEEKLY_REPORT } from "@/lib/mock/fixtures/reports";
import type { ActivityEvent, ApprovalItem, WorkspaceTeam } from "@/lib/mock/types";
import { DUR, EASE, STAGGER } from "@/lib/mock/motion";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { toast } from "@/components/mock/ui/Toaster";
import CommandPalette from "@/components/mock/shell/CommandPalette";
import NotificationsDrawer from "./NotificationsDrawer";
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

/** Shared entrance wrapper — collapses to instant state under reduced motion. */
function Card({
  index,
  className,
  children,
  label,
}: {
  index: number;
  className?: string;
  children: React.ReactNode;
  label: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.section
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
  const approveItem = useDemoStore((s) => s.approveItem);

  const [notifOpen, setNotifOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

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
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    return { today, list: [...today, ...upcoming].slice(0, 5) };
  }, [calendarEvents, filterTeam]);

  const activeAgents = useMemo(
    () => planAgents.filter((a) => a.status === "active"),
    [planAgents],
  );

  const teamActivity = useMemo(
    () => activity.filter((a) => !filterTeam || a.team === filterTeam),
    [activity, filterTeam],
  );

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
            What your AI agents are doing right now — and the decisions waiting on you.
          </p>
        </div>
        <div className={styles.headActions}>
          <div className={styles.bellWrap}>
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--icon"
              aria-label={
                unreadCount > 0
                  ? `Notifications — ${unreadCount} unread`
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

      {/* ── Team tabline ── */}
      <div
        className={`oa-tabline ${styles.tabline}`}
        role="tablist"
        aria-label="Workspace teams"
      >
        {TEAM_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={team === t.id}
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

      {/* ── 1. Today summary strip ── */}
      <motion.section
        aria-label="Today summary"
        className={`oa-card ${styles.todayCard}`}
        initial={reduced ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.card, ease: EASE }}
      >
        <div className={styles.todayDate}>
          <p className="oa-micro">Today</p>
          <p className={styles.todayDay}>Friday 24 July 2026</p>
          <span className="oa-demo-badge">All systems · demo</span>
        </div>
        <div className={styles.todayTiles}>
          <div className={styles.statTile}>
            <span className={styles.statNum}>{pendingApprovals.length}</span>
            <span className={styles.statLabel}>Approvals waiting</span>
          </div>
          <div className={styles.statTile}>
            <span className={styles.statNum}>{scheduled.today.length}</span>
            <span className={styles.statLabel}>Scheduled today</span>
          </div>
          <div className={styles.statTile}>
            <span className={styles.statNum}>{activeAgents.length}</span>
            <span className={styles.statLabel}>Active agents</span>
          </div>
        </div>
      </motion.section>

      {/* ── 8. Command bar moment (spec §17, §19.1) ── */}
      <Card index={1} className={styles.cmdCard} label="Ask Oriant command bar">
        <div className={styles.cardHead}>
          <div className={styles.cardTitle}>
            <Sparkles size={16} className={styles.cardIcon} aria-hidden />
            <h2 className="oa-h3">Ask Oriant</h2>
          </div>
          <span className="oa-sim-note">Runs on prepared demo data</span>
        </div>
        <button
          type="button"
          className={styles.cmdInputBtn}
          onClick={() => setPaletteOpen(true)}
        >
          <Sparkles size={16} aria-hidden style={{ color: "var(--oa-blue)", flex: "none" }} />
          <span className={styles.cmdInputText}>
            Ask Oriant to prepare, summarise or change something…
          </span>
          <span className={styles.cmdKbd} aria-hidden>
            ⌘K
          </span>
        </button>
        <div className="oa-cluster">
          {COMMANDS.slice(0, 2).map((c) => (
            <button
              key={c.id}
              type="button"
              className="oa-chip"
              onClick={() => setPaletteOpen(true)}
            >
              {c.example}
              <ArrowRight size={12} aria-hidden style={{ color: "var(--oa-muted)" }} />
            </button>
          ))}
        </div>
      </Card>

      <div className={styles.cols}>
        {/* ════════ Left column ════════ */}
        <div className={styles.col}>
          {/* ── 2. Human approvals required ── */}
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
                  {pendingApprovals.slice(0, 3).map((item) => (
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

          {/* ── 3. Scheduled work ── */}
          <Card index={3} label="Scheduled work">
            <div className={styles.cardHead}>
              <div className={styles.cardTitle}>
                <CalendarDays size={16} className={styles.cardIcon} aria-hidden />
                <h2 className="oa-h3">Scheduled work</h2>
              </div>
              <Link href="/app/workspace/calendar" className={styles.linkArrow}>
                Open calendar
                <ArrowRight size={13} aria-hidden />
              </Link>
            </div>

            {scheduled.list.length === 0 ? (
              <p className={`oa-sub ${styles.emptyNote}`}>
                No scheduled runs{teamLabel ? ` for ${teamLabel}` : ""} in the next few days.
              </p>
            ) : (
              <div className={styles.rows}>
                {scheduled.list.map((ev) => (
                  <div
                    key={ev.id}
                    className={`oa-row oa-row--click ${styles.schedRow}`}
                    onClick={() => router.push("/app/workspace/calendar")}
                    role="link"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push("/app/workspace/calendar");
                      }
                    }}
                  >
                    <div className={styles.timeBlock}>
                      <span className={styles.timeMain}>{ev.time}</span>
                      <span className={styles.timeSub}>
                        {ev.date === DEMO_TODAY ? "Today" : dayLabel(ev.date)}
                      </span>
                    </div>
                    <div className={styles.rowMain}>
                      <span className={styles.rowTitle}>{ev.title}</span>
                      <span className={styles.rowSub}>{ev.agentName}</span>
                    </div>
                    <StatusBadge status={ev.state} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ── 6. Weekly outcome snapshot (spec §19.3) ── */}
          <Card index={4} label="Weekly outcome snapshot">
            <div className={styles.cardHead}>
              <div className={styles.cardTitle}>
                <BarChart3 size={16} className={styles.cardIcon} aria-hidden />
                <h2 className="oa-h3">Weekly outcome snapshot</h2>
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

        {/* ════════ Right column ════════ */}
        <div className={styles.col}>
          {/* ── 4. Active agents & workflows ── */}
          <Card index={3} label="Active agents and workflows">
            <div className={styles.cardHead}>
              <div className={styles.cardTitle}>
                <Bot size={16} className={styles.cardIcon} aria-hidden />
                <h2 className="oa-h3">Active agents &amp; workflows</h2>
              </div>
              <Link href="/app/workspace/agents" className={styles.linkArrow}>
                Manage agents
                <ArrowRight size={13} aria-hidden />
              </Link>
            </div>
            <div className={styles.rows}>
              {activeAgents.map((a) => {
                const def = AGENT_LIBRARY[a.agentId];
                if (!def) return null;
                const enabled = a.workflowOrder.filter(
                  (id) => a.config.workflowsEnabled[id] !== false,
                );
                return (
                  <div key={a.agentId} className={`oa-row ${styles.agentRow}`}>
                    <div className={styles.rowMain}>
                      <span className={styles.rowTitle}>{def.name}</span>
                      <span className={styles.rowSub}>{def.role}</span>
                      <span className={styles.wfChips}>
                        {enabled.map((id) => (
                          <span key={id} className={styles.wfChip}>
                            {WF_NAME[id] ?? id}
                          </span>
                        ))}
                      </span>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                );
              })}
            </div>
          </Card>

          {/* ── 5. Recent activity ── */}
          <Card index={4} label="Recent activity">
            <div className={styles.cardHead}>
              <div className={styles.cardTitle}>
                <ActivityIcon size={16} className={styles.cardIcon} aria-hidden />
                <h2 className="oa-h3">Recent activity</h2>
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

          {/* ── 7. Daily digest (spec §19.3) ── */}
          <Card index={5} label="Daily digest">
            <div className={styles.cardHead}>
              <div className={styles.cardTitle}>
                <ListChecks size={16} className={styles.cardIcon} aria-hidden />
                <h2 className="oa-h3">Daily digest</h2>
              </div>
              <span className="oa-sub">Friday 24 July</span>
            </div>
            <div className={styles.digestGrid}>
              <div className={styles.digestBlock}>
                <span className={styles.digestHead}>
                  <Check size={12} aria-hidden style={{ color: "var(--oa-teal-deep)" }} />
                  Routine work completed
                </span>
                <ul className={styles.digestList}>
                  {DAILY_DIGEST.completed.map((line) => (
                    <li key={line} className={styles.digestItem}>
                      <span className={styles.digestDot} aria-hidden />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
              <div className={styles.digestBlock}>
                <span className={styles.digestHead}>
                  <Clock size={12} aria-hidden style={{ color: "var(--oa-amber-ink)" }} />
                  Waiting for review
                </span>
                <ul className={styles.digestList}>
                  {DAILY_DIGEST.reviews.map((line) => (
                    <li key={line} className={styles.digestItem}>
                      <span className={styles.digestDot} aria-hidden />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
              <div className={styles.digestBlock}>
                <span className={styles.digestHead}>
                  <AlertTriangle size={12} aria-hidden style={{ color: "var(--oa-red-ink)" }} />
                  Exceptions handled
                </span>
                <ul className={styles.digestList}>
                  {DAILY_DIGEST.exceptions.map((line) => (
                    <li key={line} className={styles.digestItem}>
                      <span className={styles.digestDot} aria-hidden />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
              <div className={styles.digestBlock}>
                <span className={styles.digestHead}>
                  <CalendarDays size={12} aria-hidden style={{ color: "var(--oa-blue-dark)" }} />
                  Coming up
                </span>
                <ul className={styles.digestList}>
                  {DAILY_DIGEST.upcoming.map((line) => (
                    <li key={line} className={styles.digestItem}>
                      <span className={styles.digestDot} aria-hidden />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <NotificationsDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </main>
  );
}
