"use client";
/**
 * DayTimeline — the day drawer body for the Automation Calendar (spec §17.2).
 *
 * Time-sorted block cards on an 08:00–18:00 hour rail. Every block shows a
 * state icon (colours from ./stateMeta, matching the legend, C-01), a clear
 * time column, a title that wraps to at most two lines, the agent and
 * workflow, a StatusBadge and ONE quick action: pending blocks open their
 * approval in the Approval Inbox (?focus=<approvalId>, C-02), completed
 * blocks open the outcome inline, everything else opens its details inline.
 * Pending events without a linked approval note that the approval will be
 * created when the run is prepared.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  CalendarOff,
  Check,
  ChevronDown,
  Hand,
  Info,
  Zap,
} from "lucide-react";
import type { ApprovalItem, CalendarEvent } from "@/lib/mock/types";
import { CALENDAR_ACTIONS } from "@/lib/mock/fixtures/calendar-events";
import { useDemoStore } from "@/lib/mock/store";
import { DUR, EASE } from "@/lib/mock/motion";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { toast } from "@/components/mock/ui/Toaster";
import { STATE_META, stateFill } from "./stateMeta";
import styles from "./calendar.module.css";

/** Working-hours rail (all fixture events fall inside 08:00–18:00). */
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

const RISK_TAG: Record<ApprovalItem["risk"], string> = {
  low: "oa-tag--teal",
  medium: "oa-tag--neutral",
  high: "oa-tag--amber",
};

const TEAM_LABEL: Record<CalendarEvent["team"], string> = {
  customer_care: "Customer Care",
  admin: "Admin",
  marketing: "Marketing",
  finance: "Finance",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function DayTimeline({
  events,
  expandedId,
  onToggle,
}: {
  /** Events for the selected day (any order — sorted here). */
  events: CalendarEvent[];
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  const reduced = useReducedMotion();
  const router = useRouter();
  const approvals = useDemoStore((s) => s.workspace.approvals);
  const approveItem = useDemoStore((s) => s.approveItem);

  const sorted = [...events].sort((a, b) => a.time.localeCompare(b.time));
  const waiting = sorted.filter((e) => e.state === "pending_approval").length;

  if (sorted.length === 0) {
    return (
      <div>
        <div className={styles.emptyDay}>
          <CalendarOff size={20} aria-hidden />
          <p style={{ margin: 0, fontWeight: 700 }}>Nothing scheduled this day.</p>
          <p className="oa-sub" style={{ maxWidth: 340 }}>
            Event-triggered work appears in the activity feed, not the calendar.
          </p>
        </div>
      </div>
    );
  }

  /** Bucket events by starting hour, clamped onto the 08:00–17:00 rail. */
  const byHour = new Map<number, CalendarEvent[]>();
  for (const ev of sorted) {
    const h = Math.min(17, Math.max(8, Number(ev.time.slice(0, 2))));
    const list = byHour.get(h);
    if (list) list.push(ev);
    else byHour.set(h, [ev]);
  }

  return (
    <div>
      <div className={styles.daySummary}>
        <span className="oa-tag oa-tag--neutral">
          {sorted.length} scheduled item{sorted.length > 1 ? "s" : ""}
        </span>
        {waiting > 0 && (
          <span className="oa-tag oa-tag--amber">
            {waiting} waiting on you
          </span>
        )}
      </div>

      <div className={styles.timeline}>
        {HOURS.map((h) => {
          const slotEvents = byHour.get(h) ?? [];
          return (
            <div key={h} className={styles.hourRow}>
              <span className={styles.hourLabel} aria-hidden>
                {String(h).padStart(2, "0")}:00
              </span>
              <div className={styles.hourSlot}>
                {slotEvents.map((ev) => (
                  <EventBlock
                    key={ev.id}
                    event={ev}
                    approval={ev.approvalId ? approvals[ev.approvalId] : undefined}
                    expanded={expandedId === ev.id}
                    onToggle={() => onToggle(ev.id)}
                    onOpenApproval={(href) => router.push(href)}
                    onApprove={(approval) => {
                      approveItem(approval.id);
                      toast({
                        title: "Approved",
                        detail: `${approval.title}. The calendar and approval inbox updated together.`,
                        tone: "ok",
                      });
                    }}
                    reduced={Boolean(reduced)}
                  />
                ))}
              </div>
            </div>
          );
        })}
        <div className={styles.hourRow}>
          <span className={styles.hourLabel} aria-hidden>
            18:00
          </span>
          <div className={styles.hourSlot} />
        </div>
      </div>

      <p className={styles.feedNote}>
        <Zap size={12} aria-hidden />
        Event-triggered work appears in the activity feed, not the calendar.
      </p>
    </div>
  );
}

/* ── One time block: head, one quick action, inline expanding detail ── */

function EventBlock({
  event,
  approval,
  expanded,
  onToggle,
  onOpenApproval,
  onApprove,
  reduced,
}: {
  event: CalendarEvent;
  approval: ApprovalItem | undefined;
  expanded: boolean;
  onToggle: () => void;
  onOpenApproval: (href: string) => void;
  onApprove: (approval: ApprovalItem) => void;
  reduced: boolean;
}) {
  const meta = STATE_META[event.state];
  const focusHref = event.approvalId
    ? `/app/workspace/approvals?focus=${event.approvalId}`
    : null;
  /* C-02: clicking a pending block opens/focuses its approval. */
  const opensApproval = event.state === "pending_approval" && focusHref !== null;

  return (
    <div className={`${styles.block} ${expanded ? styles.blockExpanded : ""}`}>
      <button
        type="button"
        className={styles.blockHead}
        {...(opensApproval
          ? {
              onClick: () => onOpenApproval(focusHref as string),
              "aria-label": `${event.time}, ${event.title}. Opens its approval in the Approval Inbox.`,
            }
          : { onClick: onToggle, "aria-expanded": expanded })}
      >
        <span className={styles.blockIcon} style={stateFill(event.state)} aria-hidden>
          <meta.icon size={13} />
        </span>
        <span className={styles.blockTime}>
          <span className={styles.blockTimeMain}>{event.time}</span>
          <span className={styles.blockTimeSub}>{event.durationMin} min</span>
        </span>
        <span className={styles.blockMain}>
          <span className={styles.blockTitle}>{event.title}</span>
          <span className={styles.blockAgent}>
            {event.agentName} · {event.workflowName}
          </span>
        </span>
        <StatusBadge status={event.state} />
        {opensApproval ? (
          <ArrowUpRight size={14} aria-hidden className={styles.blockChevron} />
        ) : (
          <ChevronDown
            size={14}
            aria-hidden
            className={`${styles.blockChevron} ${expanded ? styles.blockChevronOpen : ""}`}
          />
        )}
      </button>

      {/* ONE quick action per block (spec §17.2). The extra chevron on
          pending blocks is disclosure only, so run details stay reachable. */}
      <div className={styles.blockActions}>
        {opensApproval && focusHref ? (
          <>
            <Link href={focusHref} className="oa-btn oa-btn--soft oa-btn--sm">
              <Hand size={13} aria-hidden />
              Review approval
            </Link>
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--icon"
              aria-expanded={expanded}
              aria-label={expanded ? "Hide run details" : "Show run details"}
              onClick={onToggle}
            >
              <ChevronDown
                size={14}
                aria-hidden
                className={`${styles.blockChevron} ${expanded ? styles.blockChevronOpen : ""}`}
              />
            </button>
          </>
        ) : event.state === "pending_approval" ? (
          <span className={styles.blockNote}>
            <Hand size={12} aria-hidden />
            Approval will be created when the run is prepared.
          </span>
        ) : (
          <button
            type="button"
            className="oa-btn oa-btn--ghost oa-btn--sm"
            aria-expanded={expanded}
            onClick={onToggle}
          >
            {event.state === "completed"
              ? expanded
                ? "Hide outcome"
                : "View outcome"
              : expanded
                ? "Hide details"
                : "View details"}
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            className={styles.blockDetailWrap}
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : DUR.card * 0.7, ease: EASE }}
          >
            <div className={styles.blockDetail}>
              <p className={styles.detailText}>{event.detail}</p>

              <div className={styles.metaRow}>
                <span className={styles.stateChip} style={stateFill(event.state)}>
                  <meta.icon size={11} aria-hidden />
                  {meta.label}
                </span>
                <span className="oa-tag oa-tag--neutral">{event.workflowName}</span>
                <span className="oa-tag oa-tag--neutral">{event.agentName}</span>
                <span className="oa-tag oa-tag--neutral">{TEAM_LABEL[event.team]}</span>
              </div>

              {approval && (
                <div className={`oa-panel ${styles.approvalPanel}`}>
                  <p className="oa-micro">Linked approval</p>
                  <p className={styles.approvalTitle}>{approval.title}</p>
                  <p className="oa-sub">{approval.decision}</p>
                  <div className="oa-cluster" aria-live="polite">
                    <span className={`oa-tag ${RISK_TAG[approval.risk]}`}>
                      Risk: {cap(approval.risk)}
                    </span>
                    <StatusBadge status={approval.status} />
                  </div>
                  <div className={styles.approvalActions}>
                    <Link
                      href={`/app/workspace/approvals?focus=${approval.id}`}
                      className="oa-btn oa-btn--ghost oa-btn--sm"
                    >
                      Open in approvals
                      <ArrowUpRight size={13} aria-hidden />
                    </Link>
                    {approval.status === "pending" && (
                      <button
                        type="button"
                        className="oa-btn oa-btn--primary oa-btn--sm"
                        onClick={() => onApprove(approval)}
                      >
                        <Check size={13} aria-hidden />
                        Approve
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className={styles.actionsBlock}>
                <p className="oa-micro">Calendar actions</p>
                <div className="oa-cluster">
                  {CALENDAR_ACTIONS.map((action) => (
                    <button
                      key={action}
                      type="button"
                      className="oa-chip"
                      onClick={() =>
                        toast({ title: `${action}: simulated demo action`, tone: "info" })
                      }
                    >
                      {action}
                    </button>
                  ))}
                </div>
                <span className="oa-sim-note">
                  <Info size={12} aria-hidden />
                  Simulated demo actions. No schedule is changed.
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
