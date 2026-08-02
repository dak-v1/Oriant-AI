"use client";
/**
 * components/live/workspace/ui.tsx — the four primitives every live Workspace
 * panel is built from.
 *
 * They exist as one small file rather than four, because each is a handful of
 * lines and the reason they belong together is a single one: they are the
 * places where a status word, a missing value or a failure gets turned into
 * something visible. Spread across the panels, each panel would have grown its
 * own answer, and the screen would eventually have shown a dead-lettered job in
 * one colour on the schedule and another in the feed.
 *
 * `StatusPill` maps the runtime's own unions — `RunStatus`, `JobStatus` — onto
 * the `.oa-status--*` badges the rest of the product uses. Both maps are total
 * and checked with `satisfies`, so a seventh status added to the runtime fails
 * to compile here rather than rendering as a blank badge. That is the same
 * guarantee `app/api/runtime/scheduler/route.ts` gives its `?status=` filter,
 * and for the same reason: a status with no meaning attached is worse than no
 * badge at all.
 *
 * EVERY BADGE CARRIES ITS WORD. There is no variant of `StatusPill` that draws
 * a dot and nothing else. Colour is reinforcement here, never the message —
 * partly for contrast and colour-vision reasons, and partly because "waiting on
 * you" and "refused" are distinctions an owner has to be able to read.
 *
 * `SourceError` is the deliberate opposite of a silent fallback. When an
 * endpoint does not answer, the panel that needed it says which endpoint and
 * what it said, and shows NO numbers at all. A panel that quietly renders zero
 * when its source failed is the single most dangerous thing this screen could
 * do: zero approvals waiting and zero problems is also what a healthy workspace
 * looks like.
 *
 * `LoadingNote` AND `EmptyNote` ARE TWO COMPONENTS ON PURPOSE (M7). They started
 * as one — "Reading the inbox…" and "Nothing is waiting on a decision" were the
 * same muted sentence in the same muted box — and that is the third way this
 * screen can quietly mislead, after the zero and the silent fallback: an empty
 * panel is an ANSWER, and a loading one is the absence of one. An owner glancing
 * at a slow first read must not come away believing the schedule is clear. So
 * loading has its own shape, its own motion and its own `aria-busy`, and nothing
 * that has not answered yet is ever rendered in the vocabulary of something that
 * has.
 */

import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { JobStatus } from "@/lib/runtime/schedule/types";
import type { RunStatus } from "@/lib/runtime/types";
import styles from "./live-workspace.module.css";

/* ═══════════════════════════ Card ═══════════════════════════ */

/**
 * A titled region of the page.
 *
 * `<section>` with an accessible name every time, so the screen is navigable by
 * landmark rather than by scrolling: the panels ARE the structure of this page,
 * and an unnamed one is invisible to anyone not looking at it.
 */
export function Card({
  title,
  icon,
  action,
  count,
  className,
  children,
}: {
  title: string;
  icon?: ReactNode;
  /** Top-right control — a link into the surface that owns this data. */
  action?: ReactNode;
  /** Rendered as a tag beside the title when non-zero. */
  count?: number | null;
  className?: string;
  children: ReactNode;
}) {
  const headingId = `live-ws-${slug(title)}`;
  return (
    <section
      aria-labelledby={headingId}
      className={`oa-card ${styles.card} ${className ?? ""}`}
    >
      <div className={styles.cardHead}>
        <div className={styles.cardTitle}>
          {icon}
          <h2 className="oa-h3" id={headingId}>
            {title}
          </h2>
          {count !== null && count !== undefined && count > 0 && (
            <span className={`oa-tag oa-tag--amber ${styles.countTag}`}>{count}</span>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/* ═══════════════════════════ Status ═══════════════════════════ */

interface Pill {
  /** The `.oa-status--*` modifier. */
  cls: string;
  label: string;
}

const RUN_PILL = {
  running: { cls: "active", label: "Running" },
  awaiting_approval: { cls: "pending", label: "Waiting on you" },
  completed: { cls: "completed", label: "Completed" },
  failed: { cls: "failed", label: "Failed" },
  refused: { cls: "failed", label: "Blocked by your rules" },
  cancelled: { cls: "neutral", label: "Cancelled" },
} satisfies Record<RunStatus, Pill>;

const JOB_PILL = {
  queued: { cls: "neutral", label: "Waiting to start" },
  running: { cls: "active", label: "Running" },
  succeeded: { cls: "completed", label: "Succeeded" },
  failed: { cls: "failed", label: "Failed" },
  // Terminal after `maxAttempts`. Nothing retries out of it automatically, so
  // the word has to say more than "failed" does.
  dead_letter: { cls: "failed", label: "Gave up" },
  // Quiet hours or the daily cap. NOT a failure — see the read-model header.
  skipped: { cls: "optional", label: "Skipped" },
} satisfies Record<JobStatus, Pill>;

export function StatusPill(
  props: { kind: "run"; status: RunStatus } | { kind: "job"; status: JobStatus },
) {
  const pill: Pill =
    props.kind === "run" ? RUN_PILL[props.status] : JOB_PILL[props.status];
  return <span className={`oa-status oa-status--${pill.cls}`}>{pill.label}</span>;
}

/* ═══════════════════════════ Failure ═══════════════════════════ */

/**
 * One source that did not answer, named.
 *
 * `retry` is optional because not every panel owns a refresh; where it is
 * given, it is a real button rather than a clickable div, so it reaches the
 * keyboard and announces itself.
 */
export function SourceError({
  source,
  message,
  retry,
}: {
  /** What could not be read, in the owner's language. */
  source: string;
  message: string;
  retry?: () => void;
}) {
  return (
    <div className={styles.errorCard} role="alert">
      <p className={styles.errorTitle}>
        <AlertTriangle size={15} aria-hidden />
        {source} could not be read
      </p>
      <p className={styles.errorBody}>{message}</p>
      {retry && (
        <div>
          <button type="button" className="oa-btn oa-btn--ghost oa-btn--sm" onClick={retry}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════ Nothing here ═══════════════════════════ */

/**
 * An empty panel that says why it is empty. Never a bare dash.
 *
 * Only ever rendered once a source has ANSWERED. A panel that has not read
 * anything yet uses `LoadingNote` — see the module header for why the two must
 * not look alike.
 */
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className={`oa-sub ${styles.emptyNote}`}>{children}</p>;
}

/* ═══════════════════════════ Not yet known ═══════════════════════════ */

/**
 * A panel still reading its source.
 *
 * The two bars carry no information and are `aria-hidden`; the sentence is the
 * message, and `aria-busy` is what tells assistive technology that this region
 * is mid-flight rather than settled. `role="status"` is deliberately NOT used:
 * these mount once per screen load, and a live region that announces "Reading
 * the schedule…" on every background refetch would make the realtime push worse
 * than the timer it replaced.
 */
export function LoadingNote({ children }: { children: ReactNode }) {
  return (
    <div className={styles.loadingNote} aria-busy="true">
      <p className={styles.loadingText}>
        <Loader2 size={13} className="oa-spin" aria-hidden />
        {children}
      </p>
      <span className={styles.loadingBar} aria-hidden />
      <span className={`${styles.loadingBar} ${styles.loadingBarShort}`} aria-hidden />
    </div>
  );
}
