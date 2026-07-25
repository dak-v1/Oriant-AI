"use client";
/**
 * /app/build — Executor / Agent Factory (spec §14, §20 "Build", §22).
 *
 * Simulated asynchronous build jobs for the approved plan: one job card per
 * agent with status, progress and a streaming fixture log; staggered starts
 * (agent i begins i × 1200ms after the first); Skip animation for rehearsals;
 * per-job Cancel/Retry; artifact review drawer; Continue → /app/sandbox once
 * every package validates. Every timeline handle is cancelled on unmount.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, FastForward, FlaskConical } from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import { mockAgentFactoryService } from "@/lib/mock/services";
import type { TimelineHandle } from "@/lib/mock/services/timeline";
import { BUILD_FIXTURES, BUILD_ORDER } from "@/lib/mock/fixtures/build-artifacts";
import { AGENT_NAME } from "@/lib/mock/fixtures/ids";
import { AGENT_LIBRARY } from "@/lib/mock/fixtures/agent-library";
import type { BuildJobState } from "@/lib/mock/types";
import { DUR, EASE } from "@/lib/mock/motion";
import { toast } from "@/components/mock/ui/Toaster";
import BuildJobCard from "@/components/mock/build/BuildJobCard";
import PackageDrawer from "@/components/mock/build/PackageDrawer";
import styles from "@/components/mock/build/build.module.css";

/** Stable BUILD_ORDER rank (unknown ids sink to the end, order preserved). */
const rank = (id: string) => {
  const i = BUILD_ORDER.indexOf(id);
  return i === -1 ? BUILD_ORDER.length : i;
};

export default function BuildPage() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const journey = useDemoStore((s) => s.journey);
  const jobs = useDemoStore((s) => s.buildJobs);
  const finishBuildPhase = useDemoStore((s) => s.finishBuildPhase);

  const [reviewId, setReviewId] = useState<string | null>(null);
  /* Keep the last reviewed agent so drawer content survives the exit animation. */
  const lastReviewRef = useRef<string | null>(null);
  if (reviewId) lastReviewRef.current = reviewId;

  /* ── Service bookkeeping: every handle/timer is cancelled on unmount ── */
  const handlesRef = useRef(new Map<string, TimelineHandle>());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const reducedRef = useRef(reduced);
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  const runJob = useCallback((agentId: string) => {
    const fixture = BUILD_FIXTURES[agentId];
    if (!fixture) return;
    handlesRef.current.get(agentId)?.cancel();
    const handle = mockAgentFactoryService.build(
      { duration: fixture.duration, logOffsets: fixture.log.map((l) => l.at) },
      (e) => {
        const update = useDemoStore.getState().updateBuildJob;
        if (e.type === "status") {
          if (e.status === "completed") update(agentId, { status: "completed", progress: 100 });
          else update(agentId, { status: e.status });
        } else if (e.type === "log") {
          update(agentId, { logCount: e.index + 1 });
        } else {
          update(agentId, { progress: e.pct });
        }
      },
      { instant: Boolean(reducedRef.current) },
    );
    handlesRef.current.set(agentId, handle);
  }, []);

  const scheduleRun = useCallback(
    (agentId: string, delay: number) => {
      const existing = timersRef.current.get(agentId);
      if (existing) clearTimeout(existing);
      if (delay <= 0) {
        runJob(agentId);
        return;
      }
      const t = setTimeout(() => {
        timersRef.current.delete(agentId);
        runJob(agentId);
      }, delay);
      timersRef.current.set(agentId, t);
    },
    [runJob],
  );

  /* ── Mount: start fresh builds, or restart incomplete jobs after a re-mount.
     Deterministic fixtures make a from-zero restart acceptable (spec §22).
     The cleanup cancels every handle and timer — no stale updates, ever. ── */
  useEffect(() => {
    const st = useDemoStore.getState();
    /* Reduced motion: jobs complete instantly, ~600ms apart so order stays visible. */
    const gap = reducedRef.current ? 600 : 1200;

    if (st.journey === "plan_approved" && Object.keys(st.buildJobs).length === 0) {
      const boot = setTimeout(() => {
        timersRef.current.delete("__boot");
        useDemoStore.getState().startBuilds();
        Object.keys(useDemoStore.getState().buildJobs)
          .sort((a, b) => rank(a) - rank(b))
          .forEach((id, i) => scheduleRun(id, i * gap));
      }, 400);
      timersRef.current.set("__boot", boot);
    } else if (st.journey === "building") {
      Object.values(st.buildJobs)
        .filter((j) => j.status !== "completed")
        .map((j) => j.agentId)
        .sort((a, b) => rank(a) - rank(b))
        .forEach((id, i) => {
          useDemoStore.getState().updateBuildJob(id, { status: "queued", progress: 0, logCount: 0 });
          scheduleRun(id, 400 + i * gap);
        });
    }

    const handles = handlesRef.current;
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      handles.forEach((h) => h.cancel());
      handles.clear();
    };
  }, [scheduleRun]);

  /* ── Rehearsal control: skip straight to completed packages ── */
  const skipAll = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current.clear();
    handlesRef.current.forEach((h) => h.cancel());
    handlesRef.current.clear();
    const st = useDemoStore.getState();
    if (Object.keys(st.buildJobs).length === 0) st.startBuilds();
    const after = useDemoStore.getState();
    for (const id of Object.keys(after.buildJobs)) {
      after.updateBuildJob(id, { status: "completed", progress: 100, logCount: 999 });
    }
  }, []);

  const cancelJob = useCallback((agentId: string) => {
    const timer = timersRef.current.get(agentId);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(agentId);
    }
    handlesRef.current.get(agentId)?.cancel();
    handlesRef.current.delete(agentId);
    useDemoStore.getState().updateBuildJob(agentId, { status: "failed" });
  }, []);

  const retryJob = useCallback(
    (agentId: string) => {
      useDemoStore.getState().updateBuildJob(agentId, { status: "queued", progress: 0, logCount: 0 });
      scheduleRun(agentId, 350);
    },
    [scheduleRun],
  );

  /* ── Derived view state ── */
  const orderedIds = useMemo(() => {
    const ids = Object.keys(jobs);
    const base = ids.length > 0 ? ids : [...BUILD_ORDER];
    return base.sort((a, b) => rank(a) - rank(b));
  }, [jobs]);

  const total = orderedIds.length;
  const completedCount = orderedIds.filter((id) => jobs[id]?.status === "completed").length;
  const avgProgress = total
    ? Math.round(orderedIds.reduce((sum, id) => sum + (jobs[id]?.progress ?? 0), 0) / total)
    : 0;
  const allDone = Object.keys(jobs).length > 0 && orderedIds.every((id) => jobs[id]?.status === "completed");

  /* All packages validated → advance the journey and reveal the primary action. */
  useEffect(() => {
    if (allDone && journey === "building") {
      finishBuildPhase();
      toast({
        title: "All agent packages generated",
        detail: "Every package validated. Continue to sandbox testing.",
        tone: "ok",
      });
    }
  }, [allDone, journey, finishBuildPhase]);

  return (
    <main className="oa-page">
      <header className="oa-between" style={{ marginBottom: 20, alignItems: "flex-start" }}>
        <div style={{ display: "grid", gap: 6, maxWidth: 660 }}>
          <p className="oa-eyebrow">Build · Agent Factory</p>
          <h1 className="oa-h1">
            Agent <span className="oa-serif">Factory</span>
          </h1>
          <p className="oa-lead">
            Your approved plan is being assembled into reviewable agent packages; nothing is built
            beyond what you approved.
          </p>
          <span className="oa-sim-note">
            <FlaskConical size={12} aria-hidden />
            Simulated build: deterministic demo output; no real systems are provisioned.
          </span>
        </div>
        <div className={styles.headerActions}>
          {allDone ? (
            <motion.button
              type="button"
              className="oa-btn oa-btn--primary"
              onClick={() => router.push("/app/sandbox")}
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DUR.card, ease: EASE }}
            >
              Continue to sandbox testing
              <ArrowRight size={15} aria-hidden />
            </motion.button>
          ) : (
            <button type="button" className="oa-btn oa-btn--ghost" onClick={skipAll}>
              <FastForward size={14} aria-hidden />
              Skip animation
            </button>
          )}
        </div>
      </header>

      <motion.section
        className={`oa-card oa-card--flat ${styles.overview}`}
        aria-label="Overall build progress"
        initial={reduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.card, ease: EASE }}
      >
        <div className={styles.overviewMeta}>
          <span className="oa-micro">Overall progress</span>
          <strong className={styles.overviewCount}>
            {completedCount} of {total} packages complete
          </strong>
        </div>
        <div
          className={`oa-progress ${allDone ? "oa-progress--teal" : ""} ${styles.overviewBar}`}
          role="progressbar"
          aria-valuenow={avgProgress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Average build progress across all agents"
        >
          <span style={{ width: `${avgProgress}%` }} />
        </div>
        <span className={styles.overviewPct} aria-hidden>
          {avgProgress}%
        </span>
      </motion.section>

      <section className={styles.grid} aria-label="Agent build jobs">
        {orderedIds.map((id, i) => {
          const job: BuildJobState = jobs[id] ?? { agentId: id, status: "queued", progress: 0, logCount: 0 };
          return (
            <BuildJobCard
              key={id}
              name={AGENT_NAME[id] ?? AGENT_LIBRARY[id]?.name ?? id}
              role={AGENT_LIBRARY[id]?.role}
              job={job}
              fixture={BUILD_FIXTURES[id]}
              index={i}
              onCancel={() => cancelJob(id)}
              onRetry={() => retryJob(id)}
              onReview={() => setReviewId(id)}
            />
          );
        })}
      </section>

      <PackageDrawer
        open={Boolean(reviewId)}
        agentId={reviewId ?? lastReviewRef.current}
        onClose={() => setReviewId(null)}
      />
    </main>
  );
}
