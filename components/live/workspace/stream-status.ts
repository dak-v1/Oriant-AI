"use client";
/**
 * components/live/workspace/stream-status.ts — how a live screen reports the
 * health of its own change stream (ROLE_C_PLAN M7).
 *
 * `useRuntimeEvents` already returns `status`, `transport` and a sentence; its
 * header is explicit that every screen is expected to put them somewhere an
 * owner can see. What it does not decide — because it is a hook and not a
 * surface — is the WORD. This module decides it, once, for both screens that
 * carry it.
 *
 * ONE MAP, TWO SCREENS, AND THAT IS THE POINT. The Workspace and the Approvals
 * inbox sit one click apart and refetch off the same signal. If each chose its
 * own vocabulary, an owner could see "Live" on one and "Connected" on the other
 * for the identical connection and reasonably conclude the two disagree about
 * whether their workforce is being watched. The map is `satisfies
 * Record<RuntimeEventsStatus, …>`, so a fifth status added to the hook stops
 * this file compiling rather than rendering as a blank badge on both screens.
 *
 * It lives under `workspace/` because that is a directory this milestone's
 * Operate work owns; the honest home for it is `components/live/` beside the
 * hook, and moving it there is a one-line change whenever that file set is next
 * touched as a whole.
 *
 * "UNSUPPORTED" IS TWO DIFFERENT ANSWERS AND IS SPLIT ON `transport`. The hook
 * uses the one word for "a slow timer is driving this screen instead" and for
 * "nothing is driving this screen at all" — a real distinction to the person
 * reading it, because the first is behind by up to an interval and the second is
 * behind by however long they have been looking at it. `transport === "poll"`
 * separates them.
 *
 * THE WORD IS NEVER THE ONLY SIGNAL AND THE COLOUR IS NEVER A SIGNAL AT ALL.
 * `tone` exists to tint a badge that already reads "Live" or "On a timer"; both
 * screens render the label as text and the hook's sentence beside it.
 *
 * Wall time is read here — `changedAt` is a browser instant about this tab's own
 * connection, not a runtime fact, and the determinism rule that forbids it in
 * `lib/runtime` is about the runtime.
 */

import type { RuntimeEvents, RuntimeEventsStatus } from "@/components/live/useRuntimeEvents";

export type StreamTone =
  /** A stream is open and the runtime is being observed. */
  | "live"
  /** No answer yet, or one being retried. Not a fault, not a promise. */
  | "waiting"
  /** No push. Something slower and less certain is keeping the screen moving. */
  | "degraded";

interface StreamWord {
  label: string;
  tone: StreamTone;
}

const STATUS = {
  connecting: { label: "Connecting", tone: "waiting" },
  live: { label: "Live", tone: "live" },
  reconnecting: { label: "Reconnecting", tone: "waiting" },
  /* Reached only when `transport` is not "poll" — see the header. Kept in the
     map regardless so the set stays total and a new status cannot slip in. */
  unsupported: { label: "Not updating", tone: "degraded" },
} satisfies Record<RuntimeEventsStatus, StreamWord>;

const ON_A_TIMER: StreamWord = { label: "On a timer", tone: "degraded" };

export interface StreamReading extends StreamWord {
  /** The hook's own sentence. Never empty; always safe to render verbatim. */
  detail: string;
  /** "09:04:12" in the reader's locale, or null before anything has changed. */
  changedAt: string | null;
}

export function readStream(events: RuntimeEvents): StreamReading {
  const word =
    events.status === "unsupported" && events.transport === "poll"
      ? ON_A_TIMER
      : STATUS[events.status];

  return {
    label: word.label,
    tone: word.tone,
    detail: events.detail,
    changedAt: events.changedAt === null ? null : events.changedAt.toLocaleTimeString(),
  };
}
