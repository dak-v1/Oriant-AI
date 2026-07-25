"use client";
/**
 * ConnectWizard — the mock permission wizard (spec §12, §22): a drawer with
 * 4 visible steps (Account → Permissions → Testing → Connected) driven by
 * mockConnectionService.connect. No OAuth, no credentials — the sim label
 * says so plainly. Under reduced motion the whole run completes instantly.
 */
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import Drawer from "@/components/mock/ui/Drawer";
import { toast } from "@/components/mock/ui/Toaster";
import { useDemoStore } from "@/lib/mock/store";
import { mockConnectionService } from "@/lib/mock/services";
import type { TimelineHandle } from "@/lib/mock/services/timeline";
import type { IntegrationDef } from "@/lib/mock/types";
import { INTEGRATIONS } from "@/lib/mock/fixtures/integrations";
import { OWNER } from "@/lib/mock/fixtures/ids";
import { DUR, EASE } from "@/lib/mock/motion";
import ToolMark from "./ToolMark";
import styles from "./integrations.module.css";

const STEP_ORDER = ["account", "permissions", "testing", "connected"] as const;
const STEP_TITLES = ["Account", "Permissions", "Testing connection", "Connected"];

type Phase = "review" | "running" | "done";

export default function ConnectWizard({
  defId,
  onClose,
}: {
  /** Integration to connect; null = closed. */
  defId: string | null;
  onClose: () => void;
}) {
  /* Keep the last def so content stays rendered during the exit animation. */
  const lastDefRef = useRef<IntegrationDef | null>(null);
  if (defId && INTEGRATIONS[defId]) lastDefRef.current = INTEGRATIONS[defId];
  const def = lastDefRef.current;

  const markConnected = useDemoStore((s) => s.markConnected);
  const reduced = useReducedMotion();

  const [phase, setPhase] = useState<Phase>("review");
  const [reached, setReached] = useState(0);
  const handleRef = useRef<TimelineHandle | null>(null);

  /* Fresh state whenever a (new) tool opens; cancel any in-flight run on
     close and on unmount — no stale updates, ever. */
  useEffect(() => {
    if (defId) {
      setPhase("review");
      setReached(0);
    } else {
      handleRef.current?.cancel();
      handleRef.current = null;
    }
    return () => handleRef.current?.cancel();
  }, [defId]);

  const start = () => {
    if (!def || phase !== "review") return;
    setPhase("running");
    handleRef.current = mockConnectionService.connect(
      (step) => {
        const idx = STEP_ORDER.indexOf(step);
        setReached(idx);
        if (step === "connected") {
          markConnected(def.id);
          setPhase("done");
          toast({
            title: `${def.name} connected`,
            detail: "Simulated connection; no account was accessed.",
            tone: "ok",
          });
        }
      },
      { instant: Boolean(reduced) },
    );
  };

  const stateOf = (i: number): "done" | "active" | "upcoming" => {
    if (phase === "review") return i === 0 ? "active" : "upcoming";
    if (phase === "done") return "done";
    if (i < reached) return "done";
    if (i === reached) return "active";
    return "upcoming";
  };

  if (!def) return null;

  const stepBodies: (React.ReactNode | null)[] = [
    /* 1 — Account: fixture account preselected, radio look. */
    <div key="account" className={styles.radioGroup} role="radiogroup" aria-label="Account to connect">
      <div className={styles.radioRow} role="radio" aria-checked="true" tabIndex={0}>
        <span className={styles.radioDot} aria-hidden />
        <div style={{ minWidth: 0 }}>
          <p className={styles.radioLabel}>{def.account}</p>
          <p className={styles.radioSub}>Preselected for this demo</p>
        </div>
      </div>
      <div
        className={`${styles.radioRow} ${styles.radioRowAlt}`}
        role="radio"
        aria-checked="false"
        aria-disabled="true"
        tabIndex={-1}
      >
        <span className={`${styles.radioDot} ${styles.radioDotOff}`} aria-hidden />
        <div style={{ minWidth: 0 }}>
          <p className={styles.radioLabel} style={{ fontWeight: 650 }}>
            Use a different account
          </p>
          <p className={styles.radioSub}>Not available in the demo</p>
        </div>
      </div>
    </div>,

    /* 2 — Permissions: plain-language scopes + approval owner. */
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

    /* 3 — Testing: spinner while checking, quiet confirmation after. */
    phase === "running" && reached === 2 ? (
      <div key="testing" className={styles.testing}>
        <Loader2 size={15} className="oa-spin" aria-hidden />
        Checking access…
      </div>
    ) : reached >= 3 || phase === "done" ? (
      <div key="testing-ok" className={`${styles.testing} ${styles.testingOk}`}>
        <Check size={15} aria-hidden />
        Access confirmed.
      </div>
    ) : null,

    /* 4 — Connected: teal check state. */
    reached >= 3 || phase === "done" ? (
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
              onClick={start}
              disabled={phase === "running"}
            >
              {phase === "running" ? (
                <>
                  <Loader2 size={15} className="oa-spin" aria-hidden />
                  Connecting…
                </>
              ) : (
                "Connect"
              )}
            </button>
          </>
        )
      }
    >
      {/* Streaming status region: step changes are announced politely. */}
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
        This is a simulated connection; no account is accessed.
      </p>
    </Drawer>
  );
}
