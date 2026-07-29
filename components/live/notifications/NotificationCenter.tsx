"use client";
/**
 * components/live/notifications/NotificationCenter.tsx — the one place an owner
 * finds out that something needs them (ROLE_C_PLAN M7, "Notifications").
 *
 * WHAT IT IS, AND WHAT IT IS CAREFUL NOT TO IMPLY. This is the in-app surface and
 * the whole of it. Nothing in this build sends anything anywhere: the WhatsApp,
 * Telegram and email delivery the product story describes belongs to Role D's
 * integration layer (PLAN_CONTRACT §8 Q3), which has not landed. So there is no
 * channel picker here and no "notify me on WhatsApp" toggle — a switch that
 * silently does nothing is the most expensive control this product could ship,
 * because the owner who flips it then stops watching the screen. The absence is
 * stated in the footer rather than left to be discovered.
 *
 * IT SHOWS ONLY WHAT NEEDS SOMEBODY. A completed run is not in here. That is a
 * deliberate line: the Workspace already has an activity feed for what happened,
 * and a list that mixes "your invoice reminder went out" with "an approval has
 * been overdue for three hours" trains a reader to skim, at which point the
 * overdue one is missed. Everything in this list is something a person has to do.
 *
 * COLOUR IS NEVER THE MESSAGE. Every item carries a severity WORD and an icon,
 * and every group carries a heading and a sentence saying what the group means.
 * The tinting reinforces; it is not the signal. That is a WCAG requirement and,
 * here, a correctness one — the distinction between "waiting" and "overdue" is
 * the distinction between the product working and the product being ignored.
 *
 * NEW ITEMS ARE ANNOUNCED POLITELY AND NEVER TAKE FOCUS. A visually hidden
 * `aria-live="polite"` region carries one sentence when something arrives; the
 * list itself is not a live region, because a list that re-reads itself on every
 * three-second refetch is a list a screen-reader user turns off within a minute.
 * One known limitation, said rather than hidden: an identical sentence arriving
 * twice in a row does not change the DOM and so is not re-announced. The item is
 * still in the list and still visible; only the second spoken notice is lost.
 *
 * DISMISSING NEVER STRANDS THE KEYBOARD. Removing the element you are standing on
 * drops focus to the document body, which is a real and common way an accessible
 * control becomes unusable. Focus is moved deliberately to the next item's
 * dismiss control, or — when the last one goes — to the "dismissed" disclosure,
 * which by then exists precisely because something was dismissed.
 *
 * NOTHING HERE JUDGES TIME FOR ITSELF. Overdue is the runtime's word, derived from
 * `escalateAfterMins` in lib/runtime/approvals.ts and passed through verbatim;
 * ages are measured against the `now` the route judged everything at, not against
 * this browser's clock. A recomputation here would drift from the sentence beside
 * it by whatever the two clocks disagree about.
 *
 * A FAILED REFRESH KEEPS THE LIST AND SAYS SO. Blanking on a transient error would
 * read as "nothing needs you", and there is no state this surface could enter that
 * would be worse.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Bell,
  CircleAlert,
  Clock3,
  Lock,
  RefreshCw,
  ShieldAlert,
  Undo2,
  X,
  XCircle,
} from "lucide-react";
import type { NotificationItem, NotificationKind, NotificationSeverity } from "./api";
import { SEVERITY, SEVERITY_ORDER, formatAge, plural } from "./format";
import { useNotifications } from "./useNotifications";
import styles from "./notifications.module.css";

/**
 * One icon per kind, total over the union so an eighth kind is a compile error
 * here rather than an item that renders with a hole where its icon goes.
 *
 * Icons are `aria-hidden` throughout — every one of them sits beside the same
 * fact in words. An icon that carried information no text carried would be
 * invisible to half the people this surface is for.
 */
const KIND_ICON = {
  approval_overdue: AlertTriangle,
  approval_waiting: Clock3,
  approval_deadline_unreadable: CircleAlert,
  job_dead_letter: Ban,
  run_failed: XCircle,
  run_refused: ShieldAlert,
  activation_blocked: Lock,
} satisfies Record<NotificationKind, typeof Bell>;

/** Where focus should land after the list changes under the keyboard. */
type PendingFocus =
  | { kind: "item"; id: string }
  | { kind: "dismissed" }
  | null;

export interface NotificationCenterProps {
  /**
   * False renders nothing at all and reads nothing.
   *
   * For a screen on the scripted lane: the demo screens are convincing and their
   * controls change nothing, so a real attention list beside them would be the
   * one honest thing on a page of scripted ones — and would still be reading a
   * runtime the rest of the page is not about.
   */
  enabled?: boolean;
  /** Placement is the host screen's business; this is its hook for it. */
  className?: string;
}

export default function NotificationCenter({
  enabled = true,
  className,
}: NotificationCenterProps) {
  const {
    snapshot,
    items,
    dismissed,
    loading,
    refreshing,
    error,
    readAt,
    announcement,
    events,
    refresh,
    dismiss,
    restore,
    restoreAll,
  } = useNotifications({ enabled });

  const headingId = useId();
  const dismissedListId = useId();

  const [showDismissed, setShowDismissed] = useState(false);
  const [pendingFocus, setPendingFocus] = useState<PendingFocus>(null);

  const dismissButtons = useRef(new Map<string, HTMLButtonElement>());
  const dismissedToggle = useRef<HTMLButtonElement | null>(null);

  /* Runs after the list has re-rendered without the dismissed row, which is the
     only moment the replacement target exists to be focused. */
  useEffect(() => {
    if (pendingFocus === null) return;
    if (pendingFocus.kind === "dismissed") dismissedToggle.current?.focus();
    else dismissButtons.current.get(pendingFocus.id)?.focus();
    setPendingFocus(null);
  }, [pendingFocus]);

  const registerButton = useCallback(
    (id: string) => (node: HTMLButtonElement | null) => {
      if (node === null) dismissButtons.current.delete(id);
      else dismissButtons.current.set(id, node);
    },
    [],
  );

  const handleDismiss = useCallback(
    (id: string) => {
      const index = items.findIndex((candidate) => candidate.id === id);
      // The row below, else the row above, else the disclosure that is about to
      // appear because this dismissal created the first dismissed item.
      const next = items[index + 1] ?? items[index - 1] ?? null;
      dismiss(id);
      setPendingFocus(next === null ? { kind: "dismissed" } : { kind: "item", id: next.id });
    },
    [dismiss, items],
  );

  const handleRestore = useCallback(
    (id: string) => {
      restore(id);
      setPendingFocus({ kind: "item", id });
    },
    [restore],
  );

  if (!enabled) return null;

  const now = snapshot?.now ?? null;
  const visibleCounts = SEVERITY_ORDER.map((severity) => ({
    severity,
    count: items.filter((item) => item.severity === severity).length,
  })).filter((entry) => entry.count > 0);

  const failedSources = (snapshot?.sources ?? []).filter((source) => !source.ok);
  const capped =
    snapshot !== null && snapshot.counts.total > snapshot.items.length
      ? snapshot.counts.total - snapshot.items.length
      : 0;

  return (
    <section
      aria-labelledby={headingId}
      className={`oa-card ${styles.card} ${className ?? ""}`}
    >
      {/* The live region. Outside every conditional branch below, so it is never
          torn down and re-created — a region the browser has just inserted is a
          region some assistive technology will not have started watching. */}
      <p className={styles.srOnly} aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      <div className={styles.head}>
        <div className={styles.headTitle}>
          <Bell size={16} className={styles.headIcon} aria-hidden />
          <h2 className="oa-h3" id={headingId}>
            Needs your attention
          </h2>
          {visibleCounts.map((entry) => (
            <span
              key={entry.severity}
              className={`oa-status oa-status--${SEVERITY[entry.severity].statusClass}`}
            >
              {entry.count} {SEVERITY[entry.severity].label.toLowerCase()}
            </span>
          ))}
        </div>

        {/* Never disabled. This surface refetches on its own whenever the runtime
            moves, and a control that goes disabled under a keyboard user drops
            their focus to the document body — several times a minute on a busy
            workforce. `aria-busy` says the same thing and takes nothing away. */}
        <button
          type="button"
          className="oa-btn oa-btn--ghost oa-btn--sm"
          onClick={refresh}
          aria-busy={refreshing || loading}
        >
          <RefreshCw size={13} aria-hidden />
          {refreshing || loading ? "Reading…" : "Refresh"}
        </button>
      </div>

      {/* ── The read itself ── */}

      {loading && snapshot === null && error === null && (
        <p className="oa-sub">Reading the runtime…</p>
      )}

      {error !== null && (
        <div className={styles.errorBox} role="alert">
          <p className={styles.errorTitle}>
            <AlertTriangle size={15} aria-hidden />
            The attention list could not be read
          </p>
          <p className={styles.errorBody}>{error.message}</p>
          <p className={styles.errorBody}>{error.advice}</p>
          {snapshot !== null && (
            <p className={styles.errorBody}>
              What is shown below is the last answer that arrived
              {readAt === null ? "" : `, at ${readAt.toLocaleTimeString()}`}. It has not
              been cleared, because an empty list would read as “nothing needs you”.
            </p>
          )}
        </div>
      )}

      {failedSources.length > 0 && (
        <div className={styles.partialBox} role="status">
          <p className={styles.errorTitle}>
            <AlertTriangle size={15} aria-hidden />
            This list is incomplete
          </p>
          <ul className={styles.partialList}>
            {failedSources.map((source) => (
              <li key={source.id}>
                <strong>{source.label}</strong> did not answer:{" "}
                {source.problem ?? "no reason was given."}
              </li>
            ))}
          </ul>
          <p className={styles.errorBody}>
            Anything those sources would have contributed is missing from what follows,
            so a short list here is not evidence of a quiet runtime.
          </p>
        </div>
      )}

      {/* ── The items ── */}

      {snapshot !== null && items.length === 0 && (
        <EmptyState
          complete={snapshot.complete}
          dismissedCount={dismissed.length}
          onShowDismissed={() => setShowDismissed(true)}
        />
      )}

      {SEVERITY_ORDER.map((severity) => {
        const group = items.filter((item) => item.severity === severity);
        if (group.length === 0) return null;
        const meta = SEVERITY[severity];
        return (
          <section key={severity} aria-label={meta.heading} className={styles.group}>
            <h3 className={styles.groupHead}>
              {meta.heading}
              <span className={styles.groupCount}>{plural(group.length, "item", "items")}</span>
            </h3>
            <p className="oa-sub">{meta.blurb}</p>
            <ul className={styles.rows}>
              {group.map((item) => (
                <Row
                  key={item.id}
                  item={item}
                  now={now}
                  buttonRef={registerButton(item.id)}
                  onDismiss={() => handleDismiss(item.id)}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {snapshot !== null && capped > 0 && (
        <p className={`oa-sub ${styles.note}`}>
          {plural(capped, "further item", "further items")} of the same kinds are not
          shown — {snapshot.counts.total} were derived and the runtime caps one response
          at {snapshot.limit}. Everything needing action now is emitted before the cap
          can take effect, so nothing urgent is behind it.
        </p>
      )}

      {/* ── Dismissed ── */}

      {dismissed.length > 0 && (
        <div className={styles.dismissedBlock}>
          <div className="oa-cluster">
            <button
              type="button"
              ref={dismissedToggle}
              className="oa-btn oa-btn--ghost oa-btn--sm"
              aria-expanded={showDismissed}
              aria-controls={dismissedListId}
              onClick={() => setShowDismissed((open) => !open)}
            >
              {showDismissed ? "Hide" : "Show"} {plural(dismissed.length, "dismissed item", "dismissed items")}
            </button>
            {showDismissed && (
              <button
                type="button"
                className="oa-btn oa-btn--ghost oa-btn--sm"
                onClick={restoreAll}
              >
                <Undo2 size={13} aria-hidden />
                Bring them all back
              </button>
            )}
          </div>

          <div id={dismissedListId} hidden={!showDismissed}>
            <p className={`oa-sub ${styles.note}`}>
              Dismissing folds an item away for as long as this screen stays open. It is
              not stored anywhere and it is not an acknowledgement: the runtime still
              reports every one of these, and any that changes — an approval going
              overdue, a job failing for a new reason — comes back on its own.
            </p>
            <ul className={styles.rows}>
              {dismissed.map((item) => (
                <li key={item.id} className={`oa-row ${styles.row} ${styles.rowMuted}`}>
                  <span className={styles.rowBody}>
                    <span className={styles.rowTitle}>{item.title}</span>
                    <span className="oa-sub">{item.detail}</span>
                  </span>
                  <button
                    type="button"
                    className="oa-btn oa-btn--ghost oa-btn--sm"
                    onClick={() => handleRestore(item.id)}
                  >
                    <Undo2 size={13} aria-hidden />
                    Bring back
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── What this list does not cover ── */}

      {snapshot !== null && snapshot.notEvaluated.length > 0 && (
        <div className={styles.footer}>
          <h3 className={styles.groupHead}>What this list does not cover</h3>
          <ul className={styles.footNotes}>
            {snapshot.notEvaluated.map((gap) => (
              <li key={gap.id}>
                <strong>{gap.label}.</strong> {gap.reason}
                {gap.href !== null && (
                  <>
                    {" "}
                    <Link href={gap.href} className={styles.inlineLink}>
                      Go there
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className={`oa-micro ${styles.status}`}>
        {events.detail}
        {readAt !== null && ` This tab last read the runtime at ${readAt.toLocaleTimeString()}.`}
      </p>
    </section>
  );
}

/* ═══════════════════════════ One item ═══════════════════════════ */

function Row({
  item,
  now,
  buttonRef,
  onDismiss,
}: {
  item: NotificationItem;
  /** The runtime instant the route judged against. Null before the first read. */
  now: string | null;
  buttonRef: (node: HTMLButtonElement | null) => void;
  onDismiss: () => void;
}) {
  const Icon = KIND_ICON[item.kind];
  const meta = SEVERITY[item.severity];
  const age = now === null ? null : formatAge(item.at, now);

  return (
    <li className={`oa-row ${styles.row}`}>
      <Icon size={16} className={styles.rowIcon} aria-hidden />

      <span className={styles.rowBody}>
        <span className={styles.rowMeta}>
          <span className={`oa-status oa-status--${meta.statusClass}`}>{meta.label}</span>
          {item.agentName !== null && (
            <span className={styles.rowAgent}>{item.agentName}</span>
          )}
          {item.at !== null && age !== null && (
            <time
              dateTime={item.at}
              className={age.odd ? styles.rowTimeOdd : styles.rowTime}
            >
              {age.text}
            </time>
          )}
          {/* The reason is identical on every gate item, so repeating it in the
              visible row four times over would be noise. It is still carried in
              full for anyone who cannot hover a tooltip — `title` alone reaches
              neither the keyboard nor a screen reader. */}
          {item.at === null && item.atNote !== null && (
            <span className={styles.rowTime} title={item.atNote}>
              no time recorded
              <span className={styles.srOnly}> — {item.atNote}</span>
            </span>
          )}
        </span>

        <span className={styles.rowTitle}>{item.title}</span>
        {item.subject !== null && <span className={styles.rowSubject}>{item.subject}</span>}
        <span className="oa-sub">{item.detail}</span>

        {/* A notification with nothing to do is noise. The route emits an action
            for every kind it raises today; where a future kind cannot, it must
            say why, and that sentence is shown rather than swallowed. */}
        {item.action === null && item.actionNote !== null && (
          <span className={`oa-sub ${styles.rowNoAction}`}>{item.actionNote}</span>
        )}
      </span>

      <span className={styles.rowActions}>
        {item.action !== null && (
          <Link href={item.action.href} className="oa-btn oa-btn--soft oa-btn--sm">
            {item.action.label}
            <ArrowRight size={13} aria-hidden />
          </Link>
        )}
        <button
          type="button"
          ref={buttonRef}
          className={`oa-btn oa-btn--ghost oa-btn--sm ${styles.dismissButton}`}
          onClick={onDismiss}
        >
          <X size={13} aria-hidden />
          {/* The accessible name names the item, because "Dismiss" repeated
              fourteen times down a list tells a screen-reader user nothing about
              which one they are on. */}
          <span className={styles.srOnly}>Dismiss: {item.title}</span>
          <span aria-hidden>Dismiss</span>
        </button>
      </span>
    </li>
  );
}

/* ═══════════════════════════ Nothing to do ═══════════════════════════ */

/**
 * An empty list that says what it looked at.
 *
 * "You're all caught up" with a tick is the conventional thing here and it is a
 * claim this surface is not entitled to make on its own: it covers approvals,
 * failed and dead-lettered work and two of the three activation gates, and
 * nothing else. Saying which is the difference between reassurance and a promise.
 */
function EmptyState({
  complete,
  dismissedCount,
  onShowDismissed,
}: {
  complete: boolean;
  dismissedCount: number;
  onShowDismissed: () => void;
}) {
  if (!complete) {
    return (
      <p className="oa-sub">
        Nothing was derived, but at least one source did not answer — see above. This is
        not the same as nothing being wrong.
      </p>
    );
  }

  /* "Nothing needs you" would be false while something is merely folded away, and
     this is the one sentence on the surface that must never be said loosely. */
  if (dismissedCount > 0) {
    return (
      <div className={styles.empty}>
        <p className="oa-lead">
          Nothing is showing, but {plural(dismissedCount, "item is", "items are")} still
          open and dismissed on this screen.
        </p>
        <p className="oa-sub">
          Dismissing hides an item here; it does not resolve it, and the runtime still
          reports every one of them.
        </p>
        <button type="button" className="oa-btn oa-btn--ghost oa-btn--sm" onClick={onShowDismissed}>
          Show what was dismissed
        </button>
      </div>
    );
  }

  return (
    <div className={styles.empty}>
      <p className="oa-lead">Nothing needs you right now.</p>
      <p className="oa-sub">
        No approval is waiting, no run failed or was refused, no scheduled job was given
        up on, and the two activation gates this list checks are open. Anything that
        changes will appear here on its own.
      </p>
    </div>
  );
}

/* Re-exported for a host that wants the severity type in its own props. */
export type { NotificationSeverity };
