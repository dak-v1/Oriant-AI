"use client";
/**
 * ConnectWizard — the connect drawer (Account → Permissions → Testing →
 * Connected).
 *
 * Step 9 Pass 1: for the 7 real Composio-routed tools (`real` prop), this
 * now does a genuine OAuth handoff — POST /connect for a redirect URL, open
 * it in a new tab (Composio-hosted OAuth; there's no in-app completion),
 * then poll GET /status until it resolves. For the other tools (no backend
 * connection exists at all yet), the wizard doesn't open — IntegrationCards
 * disables their Connect buttons upstream.
 */
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import Drawer from "@/components/mock/ui/Drawer";
import { toast } from "@/components/mock/ui/Toaster";
import type { IntegrationDef } from "@/lib/mock/types";
import { INTEGRATIONS } from "@/lib/mock/fixtures/integrations";
import { OWNER } from "@/lib/mock/fixtures/ids";
import { DUR, EASE } from "@/lib/mock/motion";
import ToolMark from "./ToolMark";
import styles from "./integrations.module.css";

const STEP_ORDER = ["account", "permissions", "testing", "connected"] as const;
const STEP_TITLES = ["Account", "Permissions", "Testing connection", "Connected"];
const POLL_INTERVAL_MS = 2500;

type Phase = "review" | "opened" | "polling" | "done" | "error";

export default function ConnectWizard({
  defId,
  organizationId,
  real,
  onClose,
  onConnected,
}: {
  /** Integration to connect; null = closed. */
  defId: string | null;
  organizationId: string | null;
  /** True only for the 7 Composio-routed tools — everything else has no real connection path yet. */
  real: boolean;
  onClose: () => void;
  onConnected: () => void;
}) {
  const lastDefRef = useRef<IntegrationDef | null>(null);
  if (defId && INTEGRATIONS[defId]) lastDefRef.current = INTEGRATIONS[defId];
  const def = lastDefRef.current;

  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("review");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  useEffect(() => {
    if (defId) {
      setPhase("review");
      setError(null);
    } else {
      stopPolling();
    }
    return stopPolling;
  }, [defId]);

  const pollStatus = (toolKey: string, orgId: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/integrations/${orgId}/${toolKey}/status`, { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { status: string };
        if (body.status === "connected") {
          stopPolling();
          setPhase("done");
          onConnected();
          toast({ title: `${def?.name ?? toolKey} connected`, tone: "ok" });
        } else if (body.status === "error") {
          stopPolling();
          setPhase("error");
          setError("The connection failed. You can try again.");
        }
      } catch {
        // Transient network error — keep polling.
      }
    }, POLL_INTERVAL_MS);
  };

  const start = async () => {
    if (!def || !organizationId || phase === "polling" || phase === "opened") return;
    setError(null);
    try {
      const res = await fetch(`/api/integrations/${organizationId}/${def.id}/connect`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string; redirectUrl?: string };
      if (!res.ok || !body.redirectUrl) throw new Error(body.error ?? "Could not start the connection.");
      window.open(body.redirectUrl, "_blank", "noopener,noreferrer");
      setPhase("opened");
      pollStatus(def.id, organizationId);
      setPhase("polling");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the connection.");
      setPhase("error");
    }
  };

  const stateOf = (i: number): "done" | "active" | "upcoming" => {
    if (phase === "review") return i === 0 ? "active" : "upcoming";
    if (phase === "done") return "done";
    if (phase === "polling" || phase === "opened") return i <= 1 ? "done" : i === 2 ? "active" : "upcoming";
    return i === 0 ? "active" : "upcoming";
  };

  if (!def) return null;

  if (!real) {
    // Shouldn't normally open (Connect is disabled upstream for these), but
    // guard anyway rather than showing a misleading real-looking flow.
    return null;
  }

  const stepBodies: (React.ReactNode | null)[] = [
    <p key="account" className="oa-sub">
      You&apos;ll choose or sign in to your {def.name} account in the tab that opens.
    </p>,

    <div key="permissions" className={styles.manageStack}>
      <ul className={styles.wizPermList}>
        {def.permissionSummary.map((line) => (
          <li key={line} className={styles.wizPermItem}>
            <Check size={14} aria-hidden />
            {line}
          </li>
        ))}
      </ul>
      <div className={styles.ownerLine}>
        <ShieldCheck size={15} aria-hidden />
        <span>
          <strong>Owner approves changes.</strong> {OWNER.name} stays the approval owner for anything
          this connection can request.
        </span>
      </div>
    </div>,

    phase === "polling" || phase === "opened" ? (
      <div key="testing" className={styles.testing}>
        <Loader2 size={15} className="oa-spin" aria-hidden />
        Waiting for you to finish in the other tab…
      </div>
    ) : phase === "done" ? (
      <div key="testing-ok" className={`${styles.testing} ${styles.testingOk}`}>
        <Check size={15} aria-hidden />
        Access confirmed.
      </div>
    ) : phase === "error" ? (
      <div key="testing-err" className={styles.testing}>
        <TriangleAlert size={15} aria-hidden />
        {error}
      </div>
    ) : null,

    phase === "done" ? (
      <motion.div
        key="connected"
        className={styles.connectedBox}
        initial={reduced ? false : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: DUR.card, ease: EASE }}
      >
        <span className={styles.connectedIcon} aria-hidden>
          <Check size={17} />
        </span>
        <div className={styles.connectedText}>
          <p className={styles.connectedTitle}>{def.name} is connected</p>
          <p className="oa-sub">Your agents can now use it within the rules above.</p>
        </div>
      </motion.div>
    ) : null,
  ];

  return (
    <Drawer
      open={Boolean(defId)}
      onClose={onClose}
      eyebrow="Connect a tool"
      title={
        <span className={styles.wizTitleWrap}>
          <ToolMark name={def.name} size={34} tone={def.kind === "mcp" ? "dark" : "auto"} />
          {def.name}
        </span>
      }
      footer={
        phase === "done" ? (
          <button type="button" className="oa-btn oa-btn--primary" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button type="button" className="oa-btn oa-btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="oa-btn oa-btn--primary"
              onClick={() => void start()}
              disabled={phase === "polling" || phase === "opened"}
            >
              {phase === "polling" || phase === "opened" ? (
                <>
                  <Loader2 size={15} className="oa-spin" aria-hidden />
                  Waiting…
                </>
              ) : phase === "error" ? (
                "Try again"
              ) : (
                "Connect"
              )}
            </button>
          </>
        )
      }
    >
      <div className={styles.wizSteps} aria-live="polite">
        {STEP_ORDER.map((stepId, i) => {
          const state = stateOf(i);
          return (
            <div key={stepId} className={styles.wizStep} data-state={state}>
              <span className={styles.wizBullet} aria-hidden>
                {state === "done" ? <Check size={14} /> : i + 1}
              </span>
              <div className={styles.wizBody}>
                <p className={styles.wizTitle}>
                  {STEP_TITLES[i]}
                  {state === "done" && <span className="oa-sub" style={{ marginLeft: 8 }}>Done</span>}
                </p>
                {stepBodies[i]}
              </div>
            </div>
          );
        })}
      </div>

      <p className="oa-sim-note" style={{ marginTop: 6 }}>
        Opens a real sign-in tab for {def.name}. This app never sees your password.
      </p>
    </Drawer>
  );
}
