"use client";
/**
 * components/live/build/ui/BuildJobCard.tsx — one Agent Factory job in the
 * mock's card shell (spec §14), reporting only what the runtime recorded.
 *
 * ADAPTED FROM components/mock/build/BuildJobCard.tsx. Same anatomy top to
 * bottom — identity row with the Bot tile, status badge, progress row, dark
 * terminal, "what's in the package" caption, footer with the per-state action —
 * same class names, same copied module CSS, same entrance motion. The props
 * changed because the facts changed:
 *
 *   THE BAR IS STAGE-BASED (see ui/stage.ts). The runtime reports states, not
 *   percentages, so the width marks the stage the runner last wrote at a fixed
 *   position — queued 5, generating 40, validating 75, done 100 — and a failed
 *   bar freezes where the build died with the runner's error printed under it.
 *   `aria-valuetext` says the stage in words so the number is never read as a
 *   measurement. The mock's tween toward a fixture duration is exactly what
 *   this replaces.
 *
 *   THE TERMINAL SHOWS `job.logs` VERBATIM (see ui/BuildLog.tsx), replayed at
 *   reading pace only when a build this tab ran has just answered — with the
 *   one-line note below it saying the pacing is presentational.
 *
 *   THE ACTIONS ARE THE ONES THE RUNTIME SUPPORTS. "Review stored package"
 *   opens the drawer over the store's real record. "Retry build" re-POSTs the
 *   whole plan WITHOUT force — the Factory skips every agent whose package is
 *   already current, so on a plan with one failure that request rebuilds
 *   exactly the failed agent. There is no Cancel: the build is one synchronous
 *   request and nothing here can stop the runner half-way; drawing the mock's
 *   Cancel button would be a control wired to nothing.
 *
 *   THE HONESTY LINES SURVIVE THE RESKIN. A job for a version the plan no
 *   longer asks for, the runtime's own missing-package reason, and an
 *   in-flight row with no build behind it (the original "stuck queued" defect)
 *   each keep a visible sentence — as amber caveats in the card body rather
 *   than the old screen's stacked panels.
 */

import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Bot, FileCode2, PackageCheck, PauseCircle, RotateCcw } from "lucide-react";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { DUR, EASE, STAGGER } from "@/lib/mock/motion";
import type { JobView, PackageView, PlanAgentView } from "../api";
import { STATUS_META, elapsed, plural } from "../format";
import BuildLog from "./BuildLog";
import { stagePercent } from "./stage";
import styles from "./build.module.css";

export default function BuildJobCard({
  agent,
  job,
  pkg,
  missingReason,
  building,
  replayKey,
  observedPct,
  canBuild,
  index,
  onRetry,
  onReview,
}: {
  agent: PlanAgentView;
  /** The newest job recorded for this agent, or null when there has never been one. */
  job: JobView | null;
  /** The stored package for this agent AT THE PLAN'S VERSION. Null when none. */
  pkg: PackageView | null;
  /** The runtime's own reason this agent has no current package, from `missing`. */
  missingReason: string | null;
  /** A build sent from this tab is still open. */
  building: boolean;
  /** Bumped once per build this tab ran; drives the terminal replay. */
  replayKey: number;
  /** Highest in-flight bar position this tab observed for the job, or null. */
  observedPct: number | null;
  /** The screen's own gate on the Build POST; Retry obeys the same one. */
  canBuild: boolean;
  index: number;
  onRetry: () => void;
  onReview: () => void;
}) {
  const reduced = useReducedMotion();

  const inFlight = job !== null && STATUS_META[job.status].inFlight;
  const running = building && job !== null && (inFlight || job.status === "queued");
  const done = job !== null && (job.status === "completed" || job.status === "skipped");
  const failed = job !== null && job.status === "failed";
  /* An in-flight word with no build of ours behind it. The runner never clears
     a row it abandoned, so this is the shape of the original "stuck queued"
     defect when it is real rather than simulated. */
  const orphaned = job !== null && !building && (inFlight || job.status === "queued");
  const staleVersion = job !== null && job.agentVersion !== agent.version;
  const stage = stagePercent(job, observedPct);
  const took = job === null ? null : elapsed(job.startedAt, job.endedAt);

  return (
    <motion.article
      className={`oa-card ${styles.card}`}
      aria-label={`Build state for ${agent.name}`}
      initial={reduced === true ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.card, ease: EASE, delay: index * STAGGER }}
    >
      <div className={styles.cardHead}>
        <div className={styles.agentIdent}>
          <span
            className={`${styles.agentIcon} ${done || pkg !== null ? styles.agentIconDone : ""}`}
            aria-hidden
          >
            <Bot size={18} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h2 className={styles.agentName}>{agent.name}</h2>
            <p className="oa-sub">
              <code>{agent.id}</code> · v{agent.version} · {agent.operatingMode}
            </p>
          </div>
        </div>
        {job !== null ? (
          <StatusBadge status={job.status} />
        ) : pkg !== null ? (
          /* No job under this plan, but the store holds a current package —
             built earlier, or by another process. The badge reports the store. */
          <StatusBadge status="validated" label="Package stored" />
        ) : (
          <StatusBadge status="never_built" label="Never built" />
        )}
      </div>

      {/* Stage-based, and saying so: the width is a fixed per-state position
          (legend in the overview strip), never a measured or animated percent. */}
      <div className={styles.progressRow}>
        <div
          className={`oa-progress ${done ? "oa-progress--teal" : ""} ${styles.progressBar}`}
          role="progressbar"
          aria-valuenow={stage.pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={stage.label}
          aria-label={`${agent.name} build stage`}
        >
          <span style={{ width: `${stage.pct}%` }} />
        </div>
        <span className={styles.progressPct} aria-hidden title={stage.label}>
          {stage.pct}%
        </span>
      </div>

      <BuildLog
        lines={job?.logs ?? []}
        startedAt={job?.startedAt ?? null}
        running={running}
        replayKey={job === null ? 0 : replayKey}
        agentName={agent.name}
        emptyText={
          job === null
            ? "No build has ever been recorded for this agent under this plan."
            : "The runtime recorded no log lines for this job."
        }
      />
      {replayKey > 0 && job !== null && job.logs.length > 0 && (
        <p className={styles.paceNote}>
          Replayed at reading pace — the pacing is presentational; every line is the
          runtime&apos;s own.
        </p>
      )}

      {pkg !== null ? (
        <p className={styles.artifacts}>
          <FileCode2 size={13} aria-hidden style={{ flex: "none", marginTop: 3 }} />
          <span>
            Package: {plural(pkg.workflows, "workflow", "workflows")} ·{" "}
            {plural(pkg.allowedOperations, "permitted operation", "permitted operations")} ·{" "}
            <code>{pkg.checksum}</code>
          </span>
        </p>
      ) : (
        running && (
          <p className={styles.artifacts}>
            <FileCode2 size={13} aria-hidden style={{ flex: "none", marginTop: 3 }} />
            <span>Compiling and validating a package from the approved spec…</span>
          </p>
        )
      )}

      {staleVersion && job !== null && (
        <p className={styles.caveat}>
          <AlertTriangle size={13} aria-hidden style={{ flex: "none", marginTop: 3 }} />
          <span>
            This job built version {job.agentVersion}; the plan now asks for version{" "}
            {agent.version}, so it says nothing about whether the current spec is built.
          </span>
        </p>
      )}

      {missingReason !== null && (
        <p className={styles.caveat}>
          <AlertTriangle size={13} aria-hidden style={{ flex: "none", marginTop: 3 }} />
          <span>{missingReason}</span>
        </p>
      )}

      {orphaned && (
        <p className={styles.caveat}>
          <PauseCircle size={13} aria-hidden style={{ flex: "none", marginTop: 3 }} />
          <span>
            Nothing is building from this tab, so this row is another process mid-build or
            a build that stopped without finishing. It is not a queue: pressing Build
            starts a fresh job rather than resuming this one.
          </span>
        </p>
      )}

      {failed && job !== null && job.error !== null && (
        <p className={styles.errorText} role="alert">
          <AlertTriangle size={13} aria-hidden style={{ flex: "none", marginTop: 3 }} />
          <span>{job.error}</span>
        </p>
      )}

      <div className={styles.cardFoot}>
        {failed ? (
          <span className={styles.cancelNote}>
            <AlertTriangle size={13} aria-hidden /> Failed — no current package
          </span>
        ) : done ? (
          <span className={styles.footNote}>
            <PackageCheck size={13} aria-hidden />
            {job !== null && job.status === "skipped"
              ? "Stored package already current — reused"
              : `Validated and stored${took !== null ? ` · ${took}` : ""}`}
          </span>
        ) : running ? (
          <span className={styles.footNote}>Reading the runner&apos;s rows…</span>
        ) : job === null ? (
          <span className={styles.footNote}>
            {pkg !== null
              ? "Current package in the store"
              : "Nothing has been asked of the Factory yet"}
          </span>
        ) : (
          <span className={styles.footNote}>Last recorded state: {job.status}</span>
        )}

        {failed && (
          <button
            type="button"
            className="oa-btn oa-btn--soft oa-btn--sm"
            onClick={onRetry}
            disabled={!canBuild}
          >
            <RotateCcw size={13} aria-hidden /> Retry build
          </button>
        )}
        {pkg !== null && (
          <button type="button" className="oa-btn oa-btn--soft oa-btn--sm" onClick={onReview}>
            Review stored package
          </button>
        )}
      </div>
    </motion.article>
  );
}
