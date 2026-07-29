"use client";
/**
 * components/live/useRuntimeEvents.ts — how a live screen learns that the runtime
 * moved (ROLE_C_PLAN M7, "background runs push to Workspace/Approvals without a
 * refresh").
 *
 * Every live screen up to M6 loaded on mount, on tab visibility and on a button,
 * and each of their headers says so with the same closing line: push is M7. This
 * is that push, and it is deliberately the smallest possible thing — a number
 * that goes up.
 *
 *   const { revision, status } = useRuntimeEvents(["runs", "approvals"]);
 *   useEffect(() => { void load(); }, [load, revision]);
 *
 * A NUMBER IN A DEPENDENCY ARRAY, NOT DATA. `/api/runtime/events` pushes a change
 * SIGNAL and never a payload (see its header for why), so this hook has nothing
 * to hand a screen except the fact that something the screen cares about is now
 * different. The screen refetches the endpoint it already reads, through the
 * parser it already has, and there is exactly one shape of every fact in the
 * product. A hook that returned runs would be a second, subtly older copy of the
 * roster, and the two would disagree on the day it mattered.
 *
 * IT REPORTS ITS OWN HEALTH, BECAUSE THAT IS WHAT M7 IS FOR. The failure this
 * milestone exists to remove is a screen quietly showing yesterday's workforce.
 * Swapping "silently stale because nobody refreshed" for "silently stale because
 * a stream died" would be no progress at all, so `status` and `detail` are part
 * of the return value rather than an internal concern, and every screen is
 * expected to put them somewhere an owner can see.
 *
 * NOTHING DEPENDS ON IT FOR CORRECTNESS. A screen must still load on mount, still
 * refresh on visibility, and still offer its button. This hook makes those
 * unnecessary in the common case; it must never make them absent. If the stream
 * never connects, `status` says so and the fallback timer below keeps the screen
 * moving — slower, and honestly labelled.
 *
 * DEGRADING IS A DECISION IT ANNOUNCES. `EventSource` missing, a stream that
 * fails repeatedly, a server that says it cannot observe anything — all three end
 * in the same place: the stream is dropped, a slow timer takes over, `status`
 * becomes "unsupported", and `detail` carries the reason in words. The timer
 * cannot know WHAT changed, so it advances the revision on every tick; a screen
 * refetching every twenty seconds is the price of not knowing, and it is a price
 * worth naming on screen rather than hiding.
 *
 * IT FAILS TOWARDS REFETCHING. Everywhere this runtime refuses an input it cannot
 * understand, the unsafe direction is acting on a guess. Here the unsafe
 * direction is the opposite — a signal quietly dropped is a screen that stops
 * updating and says nothing — so an unreadable frame, a missing topic list, an
 * unrecognised topic in the caller's own list and an empty caller list all resolve
 * the same way: assume it was relevant and refetch. Refetching too often costs one
 * request; refetching too rarely costs the owner a decision they never saw.
 *
 * A HIDDEN TAB HOLDS NOTHING OPEN. On `visibilitychange` the stream is closed and
 * the fallback timer is stopped; on return the stream is reopened and its `hello`
 * frame settles, from the epoch and revision it carries, whether anything was
 * missed while the tab was away. That comparison is the whole reconnect story —
 * the signal is not a log and replays nothing, so "the numbers moved" means
 * "refetch", not "here is what you missed".
 */

import { useEffect, useMemo, useState } from "react";
/* Type-only, and therefore erased before any bundler sees it: the route is the
   emitter and owns the vocabulary, so importing the union from it is what makes
   the list below provably complete rather than a copy that can rot. */
import type { RuntimeTopic } from "@/app/api/runtime/events/route";

export type { RuntimeTopic };

/**
 * The same five words the route emits. `satisfies` is doing real work here: add a
 * sixth topic to `RuntimeTopic` and this object stops compiling until it is
 * taught the word, which is the only cheap defence against a screen subscribing
 * to a topic that silently never arrives.
 */
export const RUNTIME_TOPICS = Object.keys({
  runs: true,
  approvals: true,
  schedule: true,
  agents: true,
  deployment: true,
} satisfies Record<RuntimeTopic, true>) as RuntimeTopic[];

const EVENTS_URL = "/api/runtime/events";

/**
 * How often the fallback advances the revision when there is no stream.
 *
 * Slower than the 15s the Approvals inbox polled at before this existed, and
 * deliberately so: this path is the exception, it refetches blind because it
 * cannot know what changed, and a screen in it is telling the owner in writing
 * that it may be up to this far behind.
 */
const FALLBACK_POLL_MS = 20_000;

/** A caller asking for a faster fallback than this is asking for a poll, not a fallback. */
const MIN_FALLBACK_POLL_MS = 5_000;

/**
 * How long the fallback waits before trying the stream again.
 *
 * It matters that this exists at all. The commonest cause of a dead stream in
 * development is a server restart, and a hook that gave up permanently would
 * leave every open tab needing a manual reload to become live again. It reuses
 * the fallback's own timer, so recovering costs no second timer.
 */
const STREAM_RETRY_AFTER_MS = 120_000;

/**
 * How many consecutive stream errors before the fallback takes over.
 *
 * `EventSource` reconnects on its own, so a single error is the ordinary noise of
 * a laptop lid closing. Three in a row is a stream that is not coming back on its
 * own within any useful time.
 */
const MAX_STREAM_FAILURES = 3;

/* ═══════════════════════════ The return value ═══════════════════════════ */

export type RuntimeEventsStatus =
  /** No answer yet. The first state, and the state after every reopen. */
  | "connecting"
  /** A stream is open and the runtime is being observed. */
  | "live"
  /** The stream dropped and the browser is retrying it. */
  | "reconnecting"
  /** No stream is possible or worth holding; the fallback timer is driving. */
  | "unsupported";

/** What is actually moving the revision right now. */
export type RuntimeEventsTransport =
  | "stream"
  | "poll"
  /** Nothing: disabled by the caller, or this tab is in the background. */
  | "none";

export interface RuntimeEvents {
  /**
   * Increments when a topic this caller asked for changed. Safe in a dependency
   * array, and stable across re-renders that changed nothing.
   */
  revision: number;
  status: RuntimeEventsStatus;
  transport: RuntimeEventsTransport;
  /** One sentence for an owner. Never empty; always safe to render. */
  detail: string;
  /** Browser clock, when `revision` last moved. Null until it has. */
  changedAt: Date | null;
}

export interface UseRuntimeEventsOptions {
  /**
   * False stops everything and reports it. For a screen on the scripted lane, or
   * one whose realtime the owner has switched off — a conditional hook call is
   * not an option, so the condition lives here.
   */
  enabled?: boolean;
  /** Overrides the fallback timer. Clamped, never taken below the floor. */
  fallbackPollMs?: number;
}

/* ═══════════════════════════ Topics ═══════════════════════════ */

interface NormalisedTopics {
  /** Sorted and deduplicated, so re-renders do not restart the stream. */
  list: RuntimeTopic[];
  /** Set when the ask was widened, and why. Shown to the reader. */
  note: string | null;
}

/**
 * An empty list and an unrecognised word both widen to everything rather than
 * narrowing to nothing — see the header on failing towards refetching. A caller
 * who genuinely wants no signal has `enabled: false`, which says so.
 */
function normaliseTopics(requested: readonly string[]): NormalisedTopics {
  const known: RuntimeTopic[] = [];
  const unknown: string[] = [];
  for (const topic of requested) {
    const match = RUNTIME_TOPICS.find((candidate) => candidate === topic);
    if (match === undefined) unknown.push(topic);
    else if (!known.includes(match)) known.push(match);
  }

  if (unknown.length > 0) {
    return {
      list: [...RUNTIME_TOPICS].sort(),
      note:
        `This screen asked for ${unknown.map((topic) => `"${topic}"`).join(", ")}, which this ` +
        `build does not emit, so it is listening to every topic instead. That refreshes more ` +
        `often than intended rather than less.`,
    };
  }

  if (known.length === 0) {
    return {
      list: [...RUNTIME_TOPICS].sort(),
      note:
        "This screen asked for no topics, so it is listening to every one of them. An empty " +
        "list is far more likely to be a mistake than a request never to update.",
    };
  }

  return { list: known.sort(), note: null };
}

/* ═══════════════════════════ Reading a frame ═══════════════════════════ */

function parseFrame(data: unknown): Record<string, unknown> | null {
  if (typeof data !== "string" || data.trim() === "") return null;
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readText(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function readCount(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Null means the frame did not say — which the caller must treat as "relevant". */
function readTopics(source: Record<string, unknown>): string[] | null {
  const value = source.topics;
  if (!Array.isArray(value)) return null;
  const topics: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    topics.push(entry);
  }
  return topics;
}

/* ═══════════════════════════ The hook ═══════════════════════════ */

interface State {
  revision: number;
  status: RuntimeEventsStatus;
  transport: RuntimeEventsTransport;
  detail: string;
  changedAt: Date | null;
}

const INITIAL: State = {
  revision: 0,
  status: "connecting",
  transport: "none",
  detail: "Connecting to the runtime so this screen updates without a refresh…",
  changedAt: null,
};

/**
 * Subscribe to the runtime's change signal.
 *
 * @param topics what this screen's data is derived from. Pass the narrowest true
 *   answer: a wider list is not wrong, it just refetches more often.
 */
export function useRuntimeEvents(
  topics: readonly RuntimeTopic[],
  options: UseRuntimeEventsOptions = {},
): RuntimeEvents {
  const enabled = options.enabled ?? true;
  const pollMs =
    typeof options.fallbackPollMs === "number" && Number.isFinite(options.fallbackPollMs)
      ? Math.max(MIN_FALLBACK_POLL_MS, Math.floor(options.fallbackPollMs))
      : FALLBACK_POLL_MS;

  const [state, setState] = useState<State>(INITIAL);

  /* Derived every render and depended on as a STRING. The caller almost certainly
     passes an array literal, whose identity changes on every render; depending on
     it directly would tear the stream down and rebuild it several times a second. */
  const { list, note } = normaliseTopics(topics);
  const key = list.join(",");

  useEffect(() => {
    if (!enabled) {
      setState((prev) => ({
        ...prev,
        status: "unsupported",
        transport: "none",
        detail:
          "Live updates are switched off for this screen, so it shows what it last read. " +
          "Refresh it to see anything newer.",
      }));
      return;
    }

    const wanted = new Set(key.split(","));

    /* ── Everything this connection owns ──
       Locals rather than refs: they are created and destroyed with the effect, so
       there is exactly one of each per subscription and no way for a stale one to
       outlive its cleanup. */
    let disposed = false;
    let mode: "stream" | "poll" = "stream";
    let source: EventSource | null = null;
    let timer: number | null = null;
    let failures = 0;
    let gaveUpAtMs: number | null = null;
    /** What the last `hello` said. Null until one has arrived. */
    let epoch: string | null = null;
    let revision: number | null = null;

    const report = (patch: Partial<Omit<State, "revision" | "changedAt">>): void => {
      if (disposed) return;
      setState((prev) => ({ ...prev, ...patch }));
    };

    /** The one thing this hook exists to do. */
    const bump = (): void => {
      if (disposed) return;
      setState((prev) => ({ ...prev, revision: prev.revision + 1, changedAt: new Date() }));
    };

    const closeStream = (): void => {
      if (source === null) return;
      const closing = source;
      source = null;
      // Cleared before `close()`: closing a source can raise a final error event,
      // and a handler that ran after disposal would restart the very thing being
      // torn down.
      closing.onerror = null;
      closing.onopen = null;
      closing.close();
    };

    const stopTimer = (): void => {
      if (timer === null) return;
      window.clearInterval(timer);
      timer = null;
    };

    /* ── The fallback ──
       One timer, guarded, cleared on every path out. A screen in here refetches
       blind, which is the honest consequence of having no signal to filter. */
    const startTimer = (): void => {
      if (timer !== null || disposed) return;
      timer = window.setInterval(() => {
        if (disposed || document.hidden) return;
        bump();
        if (gaveUpAtMs !== null && Date.now() - gaveUpAtMs >= STREAM_RETRY_AFTER_MS) {
          gaveUpAtMs = null;
          mode = "stream";
          stopTimer();
          openStream();
        }
      }, pollMs);
    };

    const degrade = (reason: string): void => {
      closeStream();
      mode = "poll";
      gaveUpAtMs = Date.now();
      report({
        status: "unsupported",
        transport: "poll",
        detail:
          `${reason} This screen is refreshing itself every ${Math.round(pollMs / 1000)} ` +
          `seconds instead, so what you are looking at can be that far behind.`,
      });
      startTimer();
    };

    const onHello = (data: unknown): void => {
      const payload = parseFrame(data);
      if (payload === null) {
        degrade(
          "The runtime opened a change stream but its first frame was not readable, so this " +
            "screen cannot trust it to report anything.",
        );
        return;
      }

      failures = 0;

      // The server explaining, in band, that it is not observing anything. Its
      // sentence is the useful part and is passed straight through.
      if (payload.observing !== true) {
        degrade(
          readText(payload, "stalled") ??
            readText(payload, "detail") ??
            "The runtime accepted the connection but is not watching for changes, and did " +
              "not say why.",
        );
        return;
      }

      const stalled = readText(payload, "stalled");
      if (stalled !== null) {
        degrade(stalled);
        return;
      }

      const nextEpoch = readText(payload, "epoch");
      const nextRevision = readCount(payload, "revision");

      /* Did anything happen while this tab was not listening? A different epoch
         means a different counter — a restarted server, or a second process
         behind the same address — and a different revision on the same epoch
         means frames were emitted that this tab never saw. Neither says WHAT
         changed, because the signal is not a log, so both mean refetch. */
      const missed =
        epoch !== null &&
        (nextEpoch === null || nextRevision === null || nextEpoch !== epoch || nextRevision !== revision);

      epoch = nextEpoch;
      revision = nextRevision;

      report({
        status: "live",
        transport: "stream",
        detail:
          "Live. The runtime pushes a signal when something changes, and this screen " +
          "refetches itself when it arrives.",
      });
      if (missed) bump();
    };

    const onSignal = (data: unknown): void => {
      const payload = parseFrame(data);
      if (payload === null) {
        // Something was pushed and could not be read. Assume it mattered.
        bump();
        return;
      }

      const stalled = readText(payload, "stalled");
      if (stalled !== null) {
        degrade(stalled);
        return;
      }

      epoch = readText(payload, "epoch") ?? epoch;
      revision = readCount(payload, "revision") ?? revision;

      const changed = readTopics(payload);
      if (changed === null) {
        bump();
        return;
      }
      if (changed.some((topic) => wanted.has(topic))) bump();
    };

    /** Named events only; a handler typed as `Event` narrowed once, here. */
    const listen = (target: EventSource, name: string, handle: (data: unknown) => void): void => {
      target.addEventListener(name, (event: Event) => {
        if (disposed) return;
        handle((event as MessageEvent<unknown>).data);
      });
    };

    function openStream(): void {
      if (disposed || source !== null) return;

      if (typeof EventSource === "undefined") {
        degrade(
          "This browser has no EventSource, so the runtime cannot push changes to it.",
        );
        return;
      }

      report({
        status: "connecting",
        transport: "none",
        detail: "Connecting to the runtime so this screen updates without a refresh…",
      });

      // Each explicit open starts a fresh error budget. The browser's own silent
      // retries do not come through here, which is exactly what the budget counts.
      failures = 0;

      let opened: EventSource;
      try {
        opened = new EventSource(EVENTS_URL);
      } catch (error) {
        degrade(
          `The change stream could not be opened: ` +
            `${error instanceof Error ? error.message : String(error)}.`,
        );
        return;
      }
      source = opened;

      listen(opened, "hello", onHello);
      listen(opened, "signal", onSignal);

      opened.onerror = () => {
        if (disposed || source !== opened) return;
        failures += 1;
        // CLOSED means the browser has given up by itself and will not retry.
        if (opened.readyState === EventSource.CLOSED || failures >= MAX_STREAM_FAILURES) {
          degrade(
            `The change stream to the runtime failed ${failures} ` +
              `${failures === 1 ? "time" : "times in a row"}.`,
          );
          return;
        }
        report({
          status: "reconnecting",
          transport: "none",
          detail:
            "The connection to the runtime dropped and is being retried. Anything that " +
            "changed in the meantime will arrive when it is back.",
        });
      };
    }

    const suspend = (): void => {
      closeStream();
      stopTimer();
      report({
        transport: "none",
        detail:
          "This tab is in the background, so it is not holding a connection open. It " +
          "reconnects and catches up when you come back to it.",
      });
    };

    const resume = (): void => {
      if (disposed) return;
      if (mode === "stream") {
        openStream();
        return;
      }
      // Nothing ticked while the tab was hidden, so the first thing a returning
      // reader gets is a refetch rather than a wait of up to one interval.
      bump();
      startTimer();
    };

    const onVisibility = (): void => {
      if (disposed) return;
      if (document.hidden) suspend();
      else resume();
    };

    document.addEventListener("visibilitychange", onVisibility);
    if (document.hidden) suspend();
    else openStream();

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      closeStream();
      stopTimer();
    };
  }, [enabled, key, pollMs]);

  /* Memoised so a screen that puts the whole object in a dependency array — which
     is a reasonable thing to do — does not loop on identity alone. */
  return useMemo(
    () => ({
      revision: state.revision,
      status: state.status,
      transport: state.transport,
      detail: note === null ? state.detail : `${state.detail} ${note}`,
      changedAt: state.changedAt,
    }),
    [state.revision, state.status, state.transport, state.detail, state.changedAt, note],
  );
}
