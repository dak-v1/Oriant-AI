"use client";
/**
 * ActivationPanel — sequential agent activation (spec §16, §22: 5–8s).
 *
 * mockDeploymentService.activate drives each plan agent Ready → Activating
 * (pulse) → Active in order; on completion the store's completeActivation()
 * fires, a short activity burst fades in (first three ACTIVATION_BURST
 * entries) and the page auto-redirects to /app/workspace after ~1.8s — with
 * a "Go to workspace now" escape so nobody is forced to wait. Skip animation
 * replays the sequence instantly. Reduced motion: statuses step, no pulses.
 */
import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import { mockDeploymentService } from "@/lib/mock/services";
import type { TimelineHandle } from "@/lib/mock/services/timeline";
import { DUR, EASE } from "@/lib/mock/motion";
import { AGENT_NAME } from "@/lib/mock/fixtures/ids";
import { AGENT_LIBRARY } from "@/lib/mock/fixtures/agent-library";
import { ACTIVATION_BURST } from "@/lib/mock/fixtures/activity";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import styles from "./deploy.module.css";

export default function ActivationPanel() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const agents = useDemoStore((s) => s.plan.agents);
  const agentStatus = useDemoStore((s) => s.deployment.agentStatus);
  const journey = useDemoStore((s) => s.journey);
  const handleRef = useRef<TimelineHandle | null>(null);

  const done = journey === "active_workspace";
  const activeCount = agents.filter((a) => agentStatus[a.agentId] === "active").length;
  const progressPct = agents.length ? Math.round((activeCount / agents.length) * 100) : 0;

  const run = useCallback((instant: boolean) => {
    handleRef.current?.cancel();
    const st = useDemoStore.getState();
    const ids = st.plan.agents.map((a) => a.agentId);
    const handle = mockDeploymentService.activate(
      ids,
      (e) => useDemoStore.getState().setAgentActivation(e.agentId, e.status),
      { instant },
    );
    handleRef.current = handle;
    handle.done.then((finished) => {
      if (finished) useDemoStore.getState().completeActivation();
    });
  }, []);

  /* Start (or resume after a refresh) the sequence; cancel on unmount. */
  useEffect(() => {
    if (useDemoStore.getState().journey !== "activating") return;
    run(false);
    return () => handleRef.current?.cancel();
  }, [run]);

  /* Auto-handoff to the workspace shortly after the burst appears. */
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => router.push("/app/workspace"), 1800);
    return () => clearTimeout(t);
  }, [done, router]);

  return (
    <section className={`oa-card ${styles.panel}`} aria-label="Workforce activation">
      <header className={styles.panelHead}>
        <div style={{ display: "grid", gap: 4 }}>
          <p className="oa-micro">{done ? "Workforce online" : "Activation in progress"}</p>
          <h2 className="oa-h2">
            {done ? "Your workforce is live" : "Bringing your workforce online"}
          </h2>
        </div>
        <div className={styles.panelHeadRight}>
          <span className="oa-demo-badge">Demo agents</span>
          {!done && (
            <button type="button" className="oa-btn oa-btn--ghost oa-btn--sm" onClick={() => run(true)}>
              Skip animation
            </button>
          )}
        </div>
      </header>

      <div className="oa-progress oa-progress--teal" aria-hidden>
        <span style={{ width: `${progressPct}%` }} />
      </div>

      <ul className={styles.agentList} aria-live="polite">
        {agents.map((a, i) => {
          const st = agentStatus[a.agentId] ?? "ready";
          const rowCls = [
            styles.agentRow,
            st === "activating" ? styles.rowActivating : "",
            st === "activating" && !reduced ? styles.rowPulse : "",
            st === "active" ? styles.rowActive : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <li key={a.agentId} className={rowCls}>
              <span className={styles.agentIdx} aria-hidden>
                {i + 1}
              </span>
              <div className={styles.agentInfo}>
                <p className={styles.agentName}>{AGENT_NAME[a.agentId] ?? a.agentId}</p>
                <p className={styles.agentRole}>{AGENT_LIBRARY[a.agentId]?.role ?? ""}</p>
              </div>
              <StatusBadge status={st} />
            </li>
          );
        })}
      </ul>

      <span className="oa-sim-note">Simulated activation: nothing outside this demo is changed.</span>

      <AnimatePresence>
        {done && (
          <motion.div
            className={styles.burst}
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.card, ease: EASE }}
          >
            <h3 className="oa-h3">First activity</h3>
            <div style={{ display: "grid", gap: 10 }} aria-live="polite">
              {ACTIVATION_BURST.slice(0, 3).map((ev, i) => (
                <motion.div
                  key={ev.id}
                  className={styles.burstRow}
                  initial={reduced ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: DUR.card, ease: EASE, delay: 0.15 + i * 0.14 }}
                >
                  <span className={styles.burstDot} aria-hidden />
                  <div className={styles.burstText}>
                    <p className={styles.burstMsg}>{ev.message}</p>
                    <p className={styles.burstMeta}>
                      {ev.agentName} · {ev.at}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className={styles.handoff}>
              <p className="oa-sub">Opening your workspace…</p>
              <Link href="/app/workspace" className="oa-btn oa-btn--primary">
                Go to workspace now
                <ArrowRight size={15} aria-hidden />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
