"use client";
/**
 * BuildJobCard — one Agent Factory job (spec §14): agent identity, status
 * badge, per-job progress, streaming build log, "what's being generated"
 * caption and the per-state action (Cancel / Retry / Review package).
 */
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Bot, FileCode2, PackageCheck, RotateCcw } from "lucide-react";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import type { BuildFixture, BuildJobState } from "@/lib/mock/types";
import { DUR, EASE, STAGGER } from "@/lib/mock/motion";
import BuildLog from "./BuildLog";
import styles from "./build.module.css";

export default function BuildJobCard({
  name,
  role,
  job,
  fixture,
  index,
  onCancel,
  onRetry,
  onReview,
}: {
  name: string;
  role?: string;
  job: BuildJobState;
  fixture?: BuildFixture;
  index: number;
  onCancel: () => void;
  onRetry: () => void;
  onReview: () => void;
}) {
  const reduced = useReducedMotion();
  const running = job.status === "generating" || job.status === "validating";
  const completed = job.status === "completed";
  const failed = job.status === "failed";
  const lines = fixture ? fixture.log.slice(0, Math.min(job.logCount, fixture.log.length)) : [];
  const artifactNames = fixture ? fixture.artifacts.map((a) => a.name) : [];

  return (
    <motion.article
      className={`oa-card ${styles.card}`}
      initial={reduced ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.card, ease: EASE, delay: index * STAGGER }}
    >
      <div className={styles.cardHead}>
        <div className={styles.agentIdent}>
          <span className={`${styles.agentIcon} ${completed ? styles.agentIconDone : ""}`} aria-hidden>
            <Bot size={18} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h2 className={styles.agentName}>{name}</h2>
            {role && <p className="oa-sub">{role}</p>}
          </div>
        </div>
        <StatusBadge status={job.status} />
      </div>

      <div className={styles.progressRow}>
        <div
          className={`oa-progress ${completed ? "oa-progress--teal" : ""} ${styles.progressBar}`}
          role="progressbar"
          aria-valuenow={job.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${name} build progress`}
        >
          <span style={{ width: `${job.progress}%` }} />
        </div>
        <span className={styles.progressPct} aria-hidden>
          {job.progress}%
        </span>
      </div>

      <BuildLog lines={lines} running={running} agentName={name} />

      {artifactNames.length > 0 && (
        <p className={styles.artifacts}>
          <FileCode2 size={13} aria-hidden style={{ flex: "none", marginTop: 3 }} />
          <span>
            {completed ? "Package:" : "Generating:"} {artifactNames.join(" · ")}
          </span>
        </p>
      )}

      <div className={styles.cardFoot}>
        {failed ? (
          <span className={styles.cancelNote}>
            <AlertTriangle size={13} aria-hidden /> Cancelled. Retry when ready
          </span>
        ) : completed ? (
          <span className={styles.footNote}>
            <PackageCheck size={13} aria-hidden /> Validated · {artifactNames.length} files
          </span>
        ) : running ? (
          <span className={styles.footNote}>Writing build log…</span>
        ) : (
          <span className={styles.footNote}>Waiting for a build slot</span>
        )}

        {running && (
          <button type="button" className="oa-btn oa-btn--ghost oa-btn--sm" onClick={onCancel}>
            Cancel
          </button>
        )}
        {failed && (
          <button type="button" className="oa-btn oa-btn--soft oa-btn--sm" onClick={onRetry}>
            <RotateCcw size={13} aria-hidden /> Retry build
          </button>
        )}
        {completed && (
          <button type="button" className="oa-btn oa-btn--soft oa-btn--sm" onClick={onReview}>
            Review generated package
          </button>
        )}
      </div>
    </motion.article>
  );
}
