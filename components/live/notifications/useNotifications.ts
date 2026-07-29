"use client";
/**
 * components/live/notifications/useNotifications.ts — the attention list as a
 * screen holds it (ROLE_C_PLAN M7, "Notifications").
 *
 * One read, refetched whenever the runtime moves, plus the two pieces of state
 * that cannot live on a server: what this reader has already seen, and what they
 * have waved away.
 *
 * DISMISSAL IS DELIBERATELY NOT PERSISTED, AND THE SURFACE SAYS SO. Every item is
 * derived — there is no notifications table by design (see the route header) —
 * and a durable "dismissed" flag would be that table arriving through the back
 * door, holding an opinion about a run it can no longer see. So dismissal means
 * "I have read this, fold it away now", not "never tell me again", and it lasts
 * as long as this screen is open. The alternative on offer was `sessionStorage`,
 * and it was rejected for a reason worth writing down: a dismissal that outlives
 * the reading hides a fact the runtime is still reporting, and the first time it
 * hides an overdue approval it will have cost exactly what this surface exists to
 * prevent.
 *
 * A DISMISSAL IS HELD AGAINST THE FINGERPRINT, NOT THE ID. The route changes an
 * item's fingerprint when its meaning changes, so an approval waved away while it
 * was merely waiting comes straight back the moment it goes overdue, and a
 * dead-lettered job that has since acquired a different error is shown again.
 * Dismissing the id alone would let one careless click silence an escalation.
 *
 * ANNOUNCEMENTS ARE FOR WHAT IS NEW, AND ONLY ONCE. `seen` is a set of
 * `id@fingerprint`, so the live region speaks when an item arrives or changes and
 * stays quiet through every refetch that changed nothing. A region that re-read
 * the whole list on each poll would make a screen reader unusable within a
 * minute, which is the ordinary way an accessible feature becomes an unusable
 * one.
 *
 * WHAT PUSHES AND WHAT DOES NOT, stated because the gap is invisible otherwise.
 * The hook subscribes to `approvals`, `runs`, `schedule` and `deployment`, which
 * covers every item derived from a store the change signal fingerprints. It does
 * NOT cover the activation gate items: those read the package store and the
 * integration registry, and app/api/runtime/events/route.ts fingerprints neither.
 * A package built in another tab therefore reaches this list on the next refetch
 * that something else caused, on the fallback timer, or when the reader presses
 * refresh — not the instant it lands.
 *
 * THE STALE LIST IS KEPT WHEN A REFRESH FAILS. A failed poll replaces neither the
 * items nor the truth: they stay, the error is named, and `readAt` stops
 * advancing so the surface can say how old what it is showing is. Blanking on a
 * transient failure would read as "nothing needs you", which is the single most
 * expensive thing this surface could get wrong.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RuntimeTopic } from "@/components/live/useRuntimeEvents";
import { useRuntimeEvents } from "@/components/live/useRuntimeEvents";
import type { RuntimeEvents } from "@/components/live/useRuntimeEvents";
import type {
  NotificationItem,
  NotificationSnapshot,
  NotificationsFailureKind,
} from "./api";
import { NotificationsApiError, fetchNotifications } from "./api";

/**
 * Everything this list is derived from that the change signal can see.
 *
 * `agents` is deliberately absent: pausing an agent changes no item here, and a
 * wider subscription is not wrong, only busier. See the header for the topic this
 * list needs and the signal does not have.
 */
const TOPICS: RuntimeTopic[] = ["approvals", "runs", "schedule", "deployment"];

/* ═══════════════════════════ The return value ═══════════════════════════ */

export interface NotificationsFailure {
  kind: NotificationsFailureKind | "unknown";
  message: string;
  /** What the reader can do about it, per kind. Never empty. */
  advice: string;
}

const ADVICE: Record<NotificationsFailure["kind"], string> = {
  transport:
    "The browser could not reach the runtime at all. Check that the app is running and " +
    "that /api/runtime/notifications is reachable from here.",
  http: "The runtime answered, and the answer was a refusal. Its reason is above.",
  malformed:
    "The runtime answered with a shape this surface does not understand, and nothing was " +
    "rendered from it on purpose — a half-read attention list is worse than none, because " +
    "you cannot see what is missing from it. This is a mismatch between this build and " +
    "/api/runtime/notifications.",
  unknown: "The failure did not identify itself, which is itself worth reporting.",
};

export interface UseNotifications {
  /** The last successful read. Null until one lands. */
  snapshot: NotificationSnapshot | null;
  /** Everything not currently dismissed, in the order the route derived. */
  items: NotificationItem[];
  /** Dismissed in this session and still true of the runtime. */
  dismissed: NotificationItem[];
  /** True while the first read is in flight; false forever after. */
  loading: boolean;
  /** True while a refresh is in flight over an existing list. */
  refreshing: boolean;
  /** Set when the LAST read failed. The list above is then stale, not gone. */
  error: NotificationsFailure | null;
  /** Browser clock, when this tab last got an answer. Null until it has. */
  readAt: Date | null;
  /** One polite sentence for the live region, or "" when there is nothing new. */
  announcement: string;
  /** How the surface is being kept current, for the reader to see. */
  events: RuntimeEvents;
  refresh: () => void;
  dismiss: (id: string) => void;
  restore: (id: string) => void;
  restoreAll: () => void;
}

export interface UseNotificationsOptions {
  /**
   * False stops the read and the subscription. For a screen on the scripted lane
   * — a conditional hook call is not an option, so the condition lives here.
   */
  enabled?: boolean;
}

/* ═══════════════════════════ Announcing ═══════════════════════════ */

const SEVERITY_WORD = {
  action_required: "needs action now",
  attention: "needs attention",
  waiting: "is waiting on you",
} as const;

/**
 * What the live region says about a set of newly arrived items.
 *
 * One item gets its own sentence, because that is the case where the detail is
 * worth hearing. More than one gets a count and the worst severity, because a
 * screen reader reading four titles is a screen reader nobody lets finish.
 */
function announce(arrivals: NotificationItem[]): string {
  if (arrivals.length === 0) return "";
  if (arrivals.length === 1) {
    const item = arrivals[0];
    return `${item.title} — ${SEVERITY_WORD[item.severity]}.`;
  }
  const urgent = arrivals.filter((item) => item.severity === "action_required").length;
  const tail = urgent > 0 ? ` ${urgent} of them ${urgent === 1 ? "needs" : "need"} action now.` : "";
  return `${arrivals.length} new notifications.${tail}`;
}

/* ═══════════════════════════ The hook ═══════════════════════════ */

export function useNotifications(
  options: UseNotificationsOptions = {},
): UseNotifications {
  const enabled = options.enabled ?? true;

  const [snapshot, setSnapshot] = useState<NotificationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<NotificationsFailure | null>(null);
  const [readAt, setReadAt] = useState<Date | null>(null);
  const [announcement, setAnnouncement] = useState("");

  /** id → the fingerprint that was dismissed. See the header on why not the id. */
  const [dismissals, setDismissals] = useState<Record<string, string>>({});

  /**
   * `id@fingerprint` for everything already announced. A ref rather than state:
   * it is read and written inside the load, and putting it in state would make
   * every read schedule a render whose only content is "we have seen this".
   */
  const seen = useRef<Set<string>>(new Set());
  /** Suppresses the announcement for the very first list — none of it is new. */
  const primed = useRef(false);

  const events = useRuntimeEvents(TOPICS, { enabled });
  const revision = events.revision;

  const load = useCallback(
    async (signal: AbortSignal, isRefresh: boolean) => {
      if (isRefresh) setRefreshing(true);
      try {
        const next = await fetchNotifications(signal);
        if (signal.aborted) return;

        const key = (item: NotificationItem): string => `${item.id}@${item.fingerprint}`;
        const arrivals = primed.current
          ? next.items.filter((item) => !seen.current.has(key(item)))
          : [];
        // Replaced rather than added to, so the set cannot grow without bound
        // across a long-lived tab, and an item that leaves and comes back is
        // announced again — which is correct, because it is news again.
        seen.current = new Set(next.items.map(key));
        primed.current = true;

        // Dismissals for items that are no longer derived have nothing left to
        // hide, and keeping them would grow this map for the life of the tab. It
        // also means an item that leaves and returns arrives undismissed, which
        // matches the announcement above treating it as news.
        const present = new Set(next.items.map((item) => item.id));
        setDismissals((current) => {
          const kept: Record<string, string> = {};
          let dropped = false;
          for (const [id, mark] of Object.entries(current)) {
            if (present.has(id)) kept[id] = mark;
            else dropped = true;
          }
          return dropped ? kept : current;
        });

        setSnapshot(next);
        setReadAt(new Date());
        setError(null);
        if (arrivals.length > 0) setAnnouncement(announce(arrivals));
      } catch (err) {
        if (signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Deliberately does NOT clear `snapshot`; see the module header.
        const kind = err instanceof NotificationsApiError ? err.kind : "unknown";
        setError({
          kind,
          message: err instanceof Error ? err.message : String(err),
          advice: ADVICE[kind],
        });
      } finally {
        if (!signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [],
  );

  /* ── Mount, and every time the runtime moves ──
     `revision` starts at 0, so this covers the first read too. The hook already
     suspends its stream on a hidden tab and catches up on return, so there is no
     visibility listener here. */
  const [manual, setManual] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    void load(controller.signal, revision > 0 || manual > 0);
    return () => controller.abort();
  }, [enabled, load, revision, manual]);

  const refresh = useCallback(() => setManual((count) => count + 1), []);

  /* ── Dismissal ── */

  const dismiss = useCallback(
    (id: string) => {
      const item = snapshot?.items.find((candidate) => candidate.id === id);
      if (item === undefined) return;
      setDismissals((current) => ({ ...current, [id]: item.fingerprint }));
    },
    [snapshot],
  );

  const restore = useCallback((id: string) => {
    setDismissals((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const restoreAll = useCallback(() => setDismissals({}), []);

  /* ── The split ──
     Recomputed from the snapshot each time rather than stored, for the same
     reason the route derives rather than stores: a dismissal whose fingerprint no
     longer matches has already lapsed, and holding two lists would need a rule
     for reconciling them. */
  const { items, dismissed } = useMemo(() => {
    const live: NotificationItem[] = [];
    const hidden: NotificationItem[] = [];
    for (const item of snapshot?.items ?? []) {
      if (dismissals[item.id] === item.fingerprint) hidden.push(item);
      else live.push(item);
    }
    return { items: live, dismissed: hidden };
  }, [snapshot, dismissals]);

  return {
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
  };
}
