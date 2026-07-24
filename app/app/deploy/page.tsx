"use client";
/**
 * /app/deploy — Deployment & Activation (spec §16, §20 "Deployment", §22).
 *
 * Three screen states:
 *  1. Checklist — the eight-step activation review (primary: Activate).
 *  2. Activation — sequential agent status animation + activity burst,
 *     then auto-handoff to the workspace (resumes correctly on refresh).
 *  3. Live — friendly "already activated" state when revisiting the route.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import DeployChecklist from "@/components/mock/deploy/DeployChecklist";
import ActivationPanel from "@/components/mock/deploy/ActivationPanel";
import styles from "@/components/mock/deploy/deploy.module.css";

export default function DeployPage() {
  const journey = useDemoStore((s) => s.journey);
  const beginActivation = useDemoStore((s) => s.beginActivation);
  const agents = useDemoStore((s) => s.plan.agents);
  const activatedAt = useDemoStore((s) => s.deployment.activatedAt);

  /* True while THIS visit runs the activation flow (animation + burst).
     A refresh mid-activation resumes; a later revisit shows the live state. */
  const [flowActive, setFlowActive] = useState(false);
  useEffect(() => {
    if (useDemoStore.getState().journey === "activating") setFlowActive(true);
  }, []);

  const showLive = journey === "active_workspace" && !flowActive;
  const showActivation = flowActive || journey === "activating";
  const activatedTime = activatedAt ? activatedAt.slice(11, 16) : null;

  return (
    <main className="oa-page oa-page--narrow">
      <header className="oa-between" style={{ marginBottom: 24 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <p className="oa-eyebrow">
            {showActivation ? "Activate · Activation" : "Activate · Final review"}
          </p>
          <h1 className="oa-h1">
            {showLive ? (
              "Workforce is live"
            ) : showActivation ? (
              "Going live"
            ) : (
              <>
                Ready to go <span className="oa-serif">live</span>
              </>
            )}
          </h1>
          <p className="oa-lead">
            {showLive
              ? "Your agents are active and reporting into the workspace."
              : showActivation
                ? "Your agents are switching on one by one. This takes a few seconds."
                : "One last check that everything Oriant built matches the rules you approved, then activate."}
          </p>
        </div>
      </header>

      {showLive ? (
        <section className={`oa-card ${styles.live}`} aria-label="Workforce status">
          <span className={styles.liveIcon} aria-hidden>
            <CheckCircle2 size={26} />
          </span>
          <h2 className="oa-h2">Your workforce is live</h2>
          <p className="oa-sub">
            {agents.length} agents active{activatedTime ? ` since ${activatedTime} today` : ""}. Approvals,
            calendar and activity are waiting in your workspace.
          </p>
          <Link href="/app/workspace" className="oa-btn oa-btn--primary">
            Open workspace
          </Link>
        </section>
      ) : showActivation ? (
        <ActivationPanel />
      ) : (
        <DeployChecklist
          onActivate={() => {
            setFlowActive(true);
            beginActivation();
          }}
        />
      )}
    </main>
  );
}
