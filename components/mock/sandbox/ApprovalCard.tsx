"use client";
/**
 * ApprovalCard — the human approval interception, the core §15 moment.
 *
 * Renders inline in the event timeline when the approval_pause event lands:
 * an amber-outlined card with the editable proposed resolution, an optional
 * owner note, "Ask agent to update" (~1.5s hardcoded revision → v2 with the
 * previous version kept struck-through) and the ONE primary action of the
 * paused state: "Approve and resume". After approval it collapses into a
 * quiet resolved summary.
 */
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Loader2, RefreshCw, UserCheck } from "lucide-react";
import type { SandboxEvent, SandboxScenario } from "@/lib/mock/types";
import { useDemoStore } from "@/lib/mock/store";
import { runTimeline, type TimelineHandle } from "@/lib/mock/services/timeline";
import { toast } from "@/components/mock/ui/Toaster";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import styles from "./sandbox.module.css";

export default function ApprovalCard({
  scenario,
  pauseEvent,
}: {
  scenario: SandboxScenario;
  pauseEvent: SandboxEvent;
}) {
  const phase = useDemoStore((s) => s.sandbox.phase);
  const editedResolution = useDemoStore((s) => s.sandbox.editedResolution);
  const resolutionRevised = useDemoStore((s) => s.sandbox.resolutionRevised);
  const setEditedResolution = useDemoStore((s) => s.setEditedResolution);
  const reviseSandboxResolution = useDemoStore((s) => s.reviseSandboxResolution);
  const approveSandboxAction = useDemoStore((s) => s.approveSandboxAction);
  const reduced = useReducedMotion();

  const [text, setText] = useState<string>(
    () => editedResolution ?? (resolutionRevised ? scenario.revisedResolution : scenario.proposedResolution),
  );
  const [comment, setComment] = useState("");
  const [revising, setRevising] = useState(false);
  const [prevText, setPrevText] = useState<string | null>(
    resolutionRevised ? scenario.proposedResolution : null,
  );
  const [prevOpen, setPrevOpen] = useState(false);
  const [finalOpen, setFinalOpen] = useState(false);

  const reviseHandle = useRef<TimelineHandle | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  /* Cancel the pending revision timer if the screen unmounts mid-revise. */
  useEffect(() => () => reviseHandle.current?.cancel(), []);

  /* Move keyboard focus to the interception when the run pauses. */
  useEffect(() => {
    if (phase === "paused_for_approval") headingRef.current?.focus({ preventScroll: true });
  }, [phase]);

  const paused = phase === "paused_for_approval";

  /* ── Resolved compact state (after approval) ── */
  if (!paused) {
    const finalText = editedResolution ?? (resolutionRevised ? scenario.revisedResolution : scenario.proposedResolution);
    return (
      <div className={styles.resolved} role="group" aria-label="Approval resolved">
        <div className={styles.resolvedHead}>
          <UserCheck size={16} aria-hidden style={{ color: "var(--oa-teal-deep)", flex: "none" }} />
          <p className={styles.eventTitle} style={{ flex: 1 }}>
            Resolution approved by you
          </p>
          <StatusBadge status="approved" />
        </div>
        <button
          type="button"
          className="oa-btn oa-btn--ghost oa-btn--sm"
          style={{ justifySelf: "start" }}
          aria-expanded={finalOpen}
          onClick={() => setFinalOpen((v) => !v)}
        >
          <ChevronDown
            size={12}
            aria-hidden
            className={`${styles.accChevron} ${finalOpen ? styles.accChevronOpen : ""}`}
            style={{ margin: 0 }}
          />
          {finalOpen ? "Hide the approved text" : "View the approved text"}
        </button>
        {finalOpen && <p className={styles.resolvedText}>{finalText}</p>}
      </div>
    );
  }

  /* ── Interactive paused state ── */

  const onAskUpdate = () => {
    if (revising || resolutionRevised) return;
    setRevising(true);
    setPrevText(text);
    reviseHandle.current = runTimeline(
      [{ delay: 1500, emit: true }],
      () => {},
      { instant: Boolean(reduced) },
    );
    reviseHandle.current.done.then((finished) => {
      if (!finished) return;
      reviseSandboxResolution();
      setText(scenario.revisedResolution);
      setEditedResolution(scenario.revisedResolution);
      setRevising(false);
    });
  };

  const onApprove = () => {
    if (revising) return;
    approveSandboxAction();
    toast({
      title: "Resolution approved, run resuming",
      detail: comment.trim()
        ? "Your note was recorded with the approval."
        : "Only the approved text will be used from here.",
      tone: "ok",
    });
  };

  return (
    <div className={styles.approval} role="group" aria-label="Human approval required">
      <div className={styles.approvalHead}>
        <span className={styles.approvalKicker}>Human approval</span>
        <StatusBadge status="pending" label="Waiting for you" />
        <span className={styles.eventTime}>{`+${(pauseEvent.at / 1000).toFixed(1)}s`}</span>
      </div>
      <div className={styles.approvalBody}>
        <div style={{ display: "grid", gap: 6 }}>
          <h3 className="oa-h3" tabIndex={-1} ref={headingRef}>
            The workflow paused: a human decision is required before anything is sent.
          </h3>
          <p className="oa-sub">{pauseEvent.detail}</p>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div className={styles.versionRow}>
            <label className="oa-label" htmlFor="sbx-resolution" style={{ margin: 0 }}>
              Proposed resolution
            </label>
            <span className="oa-tag oa-tag--neutral">{resolutionRevised ? "v2 · agent revision" : "v1"}</span>
            <span className="oa-sub" style={{ marginLeft: "auto", fontSize: 11.5 }}>
              Editable. Only the approved text is ever used
            </span>
          </div>
          <textarea
            id="sbx-resolution"
            className="oa-textarea"
            rows={7}
            value={text}
            disabled={revising}
            onChange={(e) => {
              setText(e.target.value);
              setEditedResolution(e.target.value);
            }}
          />
          {resolutionRevised && prevText && (
            <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
              <button
                type="button"
                className="oa-btn oa-btn--ghost oa-btn--sm"
                aria-expanded={prevOpen}
                onClick={() => setPrevOpen((v) => !v)}
              >
                <ChevronDown
                  size={12}
                  aria-hidden
                  className={`${styles.accChevron} ${prevOpen ? styles.accChevronOpen : ""}`}
                  style={{ margin: 0 }}
                />
                {prevOpen ? "Hide previous version" : "Show previous version (superseded)"}
              </button>
              {prevOpen && <p className={styles.prevBox}>{prevText}</p>}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label className="oa-label" htmlFor="sbx-comment" style={{ margin: 0 }}>
            Add a note (optional)
          </label>
          <input
            id="sbx-comment"
            className="oa-input"
            placeholder="e.g. Mention our senior technician by name"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>

        <div className={styles.approvalActions}>
          {revising ? (
            <span className={styles.revising} role="status" aria-live="polite">
              <Loader2 size={14} className="oa-spin" aria-hidden />
              Agent is revising the resolution…
            </span>
          ) : (
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--sm"
              onClick={onAskUpdate}
              disabled={resolutionRevised}
            >
              <RefreshCw size={14} aria-hidden />
              {resolutionRevised ? "Updated by the agent" : "Ask agent to update"}
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="oa-btn oa-btn--primary"
            onClick={onApprove}
            disabled={revising}
          >
            <Check size={15} aria-hidden />
            Approve and resume
          </button>
        </div>
        <span className="oa-sim-note">
          Simulated approval gate. Nothing reaches the customer, in the sandbox or otherwise.
        </span>
      </div>
    </div>
  );
}
