"use client";
/**
 * /app/build — Executor / Agent Factory (spec §14, §20 "Build", §22).
 *
 * Simulated asynchronous build jobs for the approved plan: one job card per
 * agent with status, progress and a streaming fixture log; staggered starts
 * (agent i begins i × 1200ms after the first); Skip animation for rehearsals;
 * per-job Cancel/Retry; artifact review drawer; Continue → /app/sandbox once
 * every package validates. Every timeline handle is cancelled on unmount.
 *
 * A QUEUED CARD IS A PROMISE, so this screen only draws one when a timer is
 * behind it. The scheduler used to be a mount effect with two branches keyed on
 * the journey label — start when it read "plan_approved" with no jobs, restart
 * when it read "building" — and every other combination fell through silently.
 * The owner's report ("Queued, waiting for a build slot…" forever) had four
 * distinct causes underneath it, and only the first is about that missing
 * branch:
 *
 *   1. queued jobs already in the store while the label sat anywhere else;
 *   2. a plan emptied on /app/planner: zero jobs, journey pushed to "building",
 *      and the phase can only end when a job completes — so, never;
 *   3. a plan hydrated from the real backend, whose agent_keys have no
 *      BUILD_FIXTURES entry: `runJob` returned early and left the card queued;
 *   4. an empty queue rendering placeholder cards from BUILD_ORDER, which
 *      invented four confident job cards for agents not in the plan at all.
 *
 * So the label decides nothing here any more. `buildReadiness` (lib/mock/store)
 * answers from the facts — is a plan approved, is there an agent in it this
 * simulation can build — the reconciler below schedules every queued job that
 * answer allows, and a refusal renders the reason and the way forward instead
 * of a queue. There is no path left where a card claims to be waiting for a
 * build slot that no one is holding.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, FastForward, FlaskConical, Info } from "lucide-react";
import { buildReadiness, useDemoStore } from "@/lib/mock/store";
import { mockAgentFactoryService } from "@/lib/mock/services";
import { atLeast } from "@/lib/mock/state-machine";
import type { TimelineHandle } from "@/lib/mock/services/timeline";
import { BUILD_FIXTURES, BUILD_ORDER } from "@/lib/mock/fixtures/build-artifacts";
import { AGENT_NAME } from "@/lib/mock/fixtures/ids";
import { AGENT_LIBRARY } from "@/lib/mock/fixtures/agent-library";
import type { PlanAgent } from "@/lib/mock/types";
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

/** Timer key for the settle beat before the first job starts (spec §22 pacing). */
const BOOT_KEY = "__boot";

/**
 * The plan's own name for an agent wins: an agent synced from the real backend
 * carries one, and the fixture maps only know the four scripted agents — an
 * unnamed backend agent would otherwise be reported to the owner by its raw
 * agent_key, which is exactly the case this screen now has to explain.
 */
function agentLabel(agentId: string, agents: PlanAgent[]): string {
  return (
    agents.find((a) => a.agentId === agentId)?.name ??
    AGENT_NAME[agentId] ??
    AGENT_LIBRARY[agentId]?.name ??
    agentId
  );
}

export default function BuildPage() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const journey = useDemoStore((s) => s.journey);
  const jobs = useDemoStore((s) => s.buildJobs);
  const plan = useDemoStore((s) => s.plan);
  const finishBuildPhase = useDemoStore((s) => s.finishBuildPhase);

  const [reviewId, setReviewId] = useState<string | null>(null);
  /* Keep the last reviewed agent so drawer content survives the exit animation. */
  const lastReviewRef = useRef<string | null>(null);
  if (reviewId) lastReviewRef.current = reviewId;

  /* Memoised so an unrelated store write (every progress tick writes buildJobs)
     does not hand the reconciler a fresh object and make it re-decide. */
  const readiness = useMemo(() => buildReadiness(journey, plan), [journey, plan]);

  /* ── Service bookkeeping: every handle/timer is cancelled on unmount ── */
  const handlesRef = useRef(new Map<string, TimelineHandle>());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /* Jobs this mount has already put on a timer. The reconciler runs on every
     store write, so without it a job would be restarted by its own progress. */
  const startedRef = useRef(new Set<string>());
  const reducedRef = useRef(reduced);
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  const cancelAllWork = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current.clear();
    handlesRef.current.forEach((h) => h.cancel());
    handlesRef.current.clear();
    startedRef.current.clear();
  }, []);

  const runJob = useCallback((agentId: string) => {
    const fixture = BUILD_FIXTURES[agentId];
    /* Unreachable by construction — startBuilds only queues ids with a fixture
       and the reconciler filters again — and it stays a silent return because a
       job with no fixture must never be rendered as queued in the first place. */
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

  /* ── Mount: adopt jobs orphaned by the previous mount ──
     A timeline dies with the component that started it, so a job left mid-flight
     has no one driving it. Deterministic fixtures make a from-zero restart
     acceptable (spec §22); what is not acceptable is leaving it displaying
     progress that will never move again. Declared before the reconciler so the
     rewind is in state by the time it looks. ── */
  useEffect(() => {
    const st = useDemoStore.getState();
    for (const job of Object.values(st.buildJobs)) {
      if (job.status === "generating" || job.status === "validating") {
        st.updateBuildJob(job.agentId, { status: "queued", progress: 0, logCount: 0 });
      }
    }
  }, []);

  /* ── Reconciler: every queued job gets a timer, or the screen says why not.
     Runs on each relevant store write rather than once on mount, because the
     stall was never about the first render — it was about arriving at a queue
     nobody had scheduled. Idempotent: `startedRef` makes a repeat pass a no-op. ── */
  useEffect(() => {
    if (readiness.kind === "blocked") {
      /* Nothing may run, so nothing may be left pending either — a stray timer
         would finish a build the screen is telling the owner cannot start. */
      cancelAllWork();
      return;
    }

    const jobIds = Object.keys(jobs);
    if (jobIds.length === 0) {
      /* The store decides whether a queue may exist; it refuses if the plan
         cannot support one, in which case `readiness` is already blocked and we
         never reach here. Re-entry during the settle beat must not stack. */
      if (timersRef.current.has(BOOT_KEY)) return;
      const boot = setTimeout(() => {
        timersRef.current.delete(BOOT_KEY);
        useDemoStore.getState().startBuilds();
      }, 400);
      timersRef.current.set(BOOT_KEY, boot);
      return;
    }

    /* A queue that outlived its phase label: the jobs are the fact, so move the
       label to them rather than refusing to run them (the old "building"-only
       branch). Without this the finish gate below never opens. */
    if (!atLeast(journey, "building")) useDemoStore.getState().startBuilds();

    const gap = reducedRef.current ? 600 : 1200;
    const firstWave = startedRef.current.size === 0;
    const pending = Object.values(jobs)
      .filter(
        (j) =>
          j.status === "queued" &&
          Boolean(BUILD_FIXTURES[j.agentId]) &&
          !startedRef.current.has(j.agentId),
      )
      .map((j) => j.agentId)
      .sort((a, b) => rank(a) - rank(b));

    pending.forEach((id, i) => {
      startedRef.current.add(id);
      scheduleRun(id, (firstWave ? 400 : 0) + i * gap);
    });
  }, [jobs, journey, readiness, cancelAllWork, scheduleRun]);

  /* Unmount only — kept out of the reconciler, whose cleanup would otherwise
     cancel every live build each time a progress tick re-ran it. */
  useEffect(() => cancelAllWork, [cancelAllWork]);

  /* ── Rehearsal control: skip straight to completed packages ── */
  const skipAll = useCallback(() => {
    cancelAllWork();
    const st = useDemoStore.getState();
    /* Refuses when the plan cannot be built; the button is not rendered then,
       and a rehearsal shortcut is the last place that should invent a queue. */
    if (Object.keys(st.buildJobs).length === 0) st.startBuilds();
    const after = useDemoStore.getState();
    for (const id of Object.keys(after.buildJobs)) {
      startedRef.current.add(id);
      after.updateBuildJob(id, { status: "completed", progress: 100, logCount: 999 });
    }
  }, [cancelAllWork]);

  const cancelJob = useCallback((agentId: string) => {
    const timer = timersRef.current.get(agentId);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(agentId);
    }
    handlesRef.current.get(agentId)?.cancel();
    handlesRef.current.delete(agentId);
    /* Stays in startedRef: a cancelled job waits for the owner's Retry, and the
       reconciler must not quietly restart what they just stopped. */
    useDemoStore.getState().updateBuildJob(agentId, { status: "failed" });
  }, []);

  const retryJob = useCallback(
    (agentId: string) => {
      startedRef.current.add(agentId);
      useDemoStore.getState().updateBuildJob(agentId, { status: "queued", progress: 0, logCount: 0 });
      scheduleRun(agentId, 350);
    },
    [scheduleRun],
  );

  /* ── Derived view state ──
     Cards come from jobs that exist and can actually run. No BUILD_ORDER
     fallback: a placeholder for an agent with no job is a queue that does not
     exist. When the plan is blocked, completed packages still deserve their
     card — they were genuinely produced — but anything still waiting cannot
     move, so it is counted in the panel rather than drawn as if it will. */
  const runnableIds = useMemo(
    () => Object.keys(jobs).filter((id) => BUILD_FIXTURES[id]).sort((a, b) => rank(a) - rank(b)),
    [jobs],
  );
  const orderedIds = useMemo(
    () =>
      readiness.kind === "ready"
        ? runnableIds
        : runnableIds.filter((id) => jobs[id]?.status === "completed"),
    [readiness, runnableIds, jobs],
  );
  const strandedCount = runnableIds.length - orderedIds.length;

  /* Agents in the plan (or left in the queue) this simulation has no package
     for. Named rather than dropped: silence here is what let a plan look fully
     built when part of it had never been touched. */
  const unsupportedIds = useMemo(() => {
    const ids = new Set(readiness.kind === "ready" ? readiness.unsupported : []);
    for (const id of Object.keys(jobs)) if (!BUILD_FIXTURES[id]) ids.add(id);
    return [...ids];
  }, [readiness, jobs]);

  const total = orderedIds.length;
  const completedCount = orderedIds.filter((id) => jobs[id]?.status === "completed").length;
  const avgProgress = total
    ? Math.round(orderedIds.reduce((sum, id) => sum + (jobs[id]?.progress ?? 0), 0) / total)
    : 0;
  const allDone = total > 0 && orderedIds.every((id) => jobs[id]?.status === "completed");

  /* All packages validated → advance the journey and reveal the primary action.
     Gated on the journey not having passed the phase rather than on it reading
     exactly "building": a queue adopted at any later label still finishes, and
     the Continue button must never appear while /app/sandbox would bounce the
     owner straight back here. */
  useEffect(() => {
    if (allDone && !atLeast(journey, "sandbox_ready")) {
      finishBuildPhase();
      toast({
        title: "All agent packages generated",
        detail: "Every package validated. Continue to sandbox testing.",
        tone: "ok",
      });
    }
  }, [allDone, journey, finishBuildPhase]);

  const canContinue = allDone && atLeast(journey, "sandbox_ready");

  return (
    <main className="oa-page">
      <header className="oa-between" style={{ marginBottom: 20, alignItems: "flex-start" }}>
        <div style={{ display: "grid", gap: 6, maxWidth: 660 }}>
          <p className="oa-eyebrow">Build · Agent Factory</p>
          <h1 className="oa-h1">
            Agent <span className="oa-serif">Factory</span>
          </h1>
          {/* Blocked: the panel below is the single explanation. Repeating it
              here read as two different claims about the same nothing. */}
          {readiness.kind === "ready" && (
            <p className="oa-lead">
              Your approved plan is being assembled into reviewable agent packages; nothing is built
              beyond what you approved.
            </p>
          )}
          <span className="oa-sim-note">
            <FlaskConical size={12} aria-hidden />
            Simulated build: deterministic demo output; no real systems are provisioned.
          </span>
        </div>
        <div className={styles.headerActions}>
          {canContinue ? (
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
          ) : readiness.kind === "ready" ? (
            <button type="button" className="oa-btn oa-btn--ghost" onClick={skipAll}>
              <FastForward size={14} aria-hidden />
              Skip animation
            </button>
          ) : null}
        </div>
      </header>

      {readiness.kind === "blocked" && (
        <motion.section
          className="oa-card"
          role="status"
          aria-label="Why no build is queued"
          style={{ display: "grid", gap: 10, marginBottom: 20, maxWidth: 660 }}
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DUR.card, ease: EASE }}
        >
          <span className="oa-status oa-status--pending" style={{ justifySelf: "start" }}>
            Nothing queued
          </span>
          <h2 className="oa-h3" style={{ margin: 0 }}>
            {readiness.headline}
          </h2>
          <p className="oa-sub">{readiness.detail}</p>
          {strandedCount > 0 && (
            <p className="oa-micro">
              {strandedCount} earlier build {strandedCount === 1 ? "job is" : "jobs are"} still
              unfinished. {strandedCount === 1 ? "It" : "They"} cannot run in this state, so{" "}
              {strandedCount === 1 ? "it is" : "they are"} not shown as queued.
            </p>
          )}
          <Link href={readiness.action.href} className="oa-btn oa-btn--soft oa-btn--sm" style={{ justifySelf: "start" }}>
            {readiness.action.label}
            <ArrowRight size={14} aria-hidden />
          </Link>
        </motion.section>
      )}

      {total > 0 && (
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
      )}

      {/* The settle beat before the first job: an honest placeholder for the one
          moment when there is genuinely no queue yet, but there will be. */}
      {readiness.kind === "ready" && total === 0 && (
        <p className="oa-sub" role="status">
          Preparing the build queue…
        </p>
      )}

      {total > 0 && (
        <section className={styles.grid} aria-label="Agent build jobs">
          {orderedIds.map((id, i) => {
            const job = jobs[id];
            if (!job) return null;
            return (
              <BuildJobCard
                key={id}
                name={agentLabel(id, plan.agents)}
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
      )}

      {readiness.kind === "ready" && unsupportedIds.length > 0 && (
        <p className="oa-sub" style={{ display: "flex", gap: 8, marginTop: 16, maxWidth: 660 }}>
          <Info size={14} aria-hidden style={{ flex: "none", marginTop: 3 }} />
          <span>
            No package is generated here for{" "}
            {unsupportedIds.map((id) => agentLabel(id, plan.agents)).join(", ")}. This simulation
            ships prepared packages for the scripted BrightPath agents only, so{" "}
            {unsupportedIds.length === 1 ? "that agent is" : "those agents are"} not queued and will
            not be built or validated.
          </span>
        </p>
      )}

      <PackageDrawer
        open={Boolean(reviewId)}
        agentId={reviewId ?? lastReviewRef.current}
        onClose={() => setReviewId(null)}
      />
    </main>
  );
}
