"use client";
/**
 * ReportFactList — individually reviewable fact rows inside a report section
 * (improvement spec §11.2, acceptance R-01).
 *
 * Each row carries its own status and actions:
 *   unreviewed → neutral row with Confirm / Edit / Reject
 *   confirmed  → teal badge, "Confirmed just now", Undo
 *   edited     → blue badge, current value, collapsible previous value,
 *                Confirm edit
 *   rejected   → muted red tint, visible reason, "Ask Oriant to clarify"
 *   confidential → lock icon + "Visible to you only" (orthogonal to status)
 *
 * When the whole report is approved, unreviewed facts render as confirmed
 * (approval implies confirmation) and row actions are hidden. Rejecting one
 * fact never touches any other fact or the section status (R-01).
 */
import { useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  Lock,
  LockOpen,
  MessageCircleQuestion,
  MessageSquareText,
  PencilLine,
  RotateCcw,
  Route,
  UserRound,
  X,
} from "lucide-react";
import type { FactReviewStatus, FactSource, ReportFactDef, ReportFactState } from "@/lib/mock/types";
import { useDemoStore } from "@/lib/mock/store";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import styles from "./report.module.css";

const SOURCE_META: Record<FactSource, { label: string; Icon: typeof UserRound; cls: string }> = {
  owner: { label: "Owner", Icon: UserRound, cls: styles.srcOwner },
  document: { label: "Document", Icon: FileText, cls: styles.srcDocument },
  interview: { label: "Interview", Icon: MessageSquareText, cls: styles.srcInterview },
  inference: { label: "Inferred", Icon: Route, cls: styles.srcInference },
};

const BLANK: ReportFactState = {
  status: "unreviewed",
  editedValue: null,
  reason: "",
  confidential: false,
  reviewedAt: null,
};

/** Effective display status: an approved report treats unreviewed as confirmed. */
export function effectiveFactStatus(
  state: ReportFactState | undefined,
  reportApproved: boolean,
): FactReviewStatus {
  const status = state?.status ?? "unreviewed";
  return reportApproved && status === "unreviewed" ? "confirmed" : status;
}

function reviewedLabel(prefix: string, reviewedAt: string | null): string {
  if (!reviewedAt) return prefix;
  return reviewedAt === "Just now" ? `${prefix} just now` : `${prefix} ${reviewedAt}`;
}

function FactRow({ def, reportApproved }: { def: ReportFactDef; reportApproved: boolean }) {
  const state = useDemoStore((s) => s.report.facts[def.id]) ?? BLANK;
  const confirmFact = useDemoStore((s) => s.confirmFact);
  const editFact = useDemoStore((s) => s.editFact);
  const rejectFact = useDemoStore((s) => s.rejectFact);
  const undoFactReview = useDemoStore((s) => s.undoFactReview);
  const toggleFactConfidential = useDemoStore((s) => s.toggleFactConfidential);

  const [mode, setMode] = useState<"view" | "edit" | "reject">("view");
  const [draft, setDraft] = useState("");
  const [reasonDraft, setReasonDraft] = useState("");
  const [showPrevious, setShowPrevious] = useState(false);

  const status = effectiveFactStatus(state, reportApproved);
  const value = state.editedValue ?? def.value;
  const src = SOURCE_META[def.source];

  const rowClass = [
    styles.factRow,
    status === "confirmed" ? styles.factRowConfirmed : "",
    status === "edited" ? styles.factRowEdited : "",
    status === "rejected" ? styles.factRowRejected : "",
  ]
    .filter(Boolean)
    .join(" ");

  const beginEdit = () => {
    setDraft(value);
    setMode("edit");
  };
  const saveEdit = () => {
    const text = draft.trim();
    if (!text) return;
    if (text === def.value) {
      // Saving the original wording is not an edit; treat as a review reset.
      undoFactReview(def.id);
    } else {
      editFact(def.id, text);
    }
    setMode("view");
    setShowPrevious(false);
  };
  const submitReject = () => {
    rejectFact(def.id, reasonDraft.trim() || "Marked as incorrect by the owner.");
    setReasonDraft("");
    setMode("view");
  };

  return (
    <li id={`fact-row-${def.id}`} className={rowClass} tabIndex={-1}>
      <div className={styles.factMain}>
        <div className={styles.factTop}>
          <span className={styles.factLabel}>{def.label}</span>
          <span className={`${styles.srcChip} ${src.cls}`}>
            <src.Icon size={10} aria-hidden />
            {src.label}
          </span>
          {status === "confirmed" && <StatusBadge status="completed" label="Confirmed" />}
          {status === "edited" && <StatusBadge status="review" label="Edited" />}
          {status === "rejected" && <StatusBadge status="failed" label="Rejected" />}
          {state.confidential && (
            <span className={styles.factConf}>
              <Lock size={11} aria-hidden /> Visible to you only
            </span>
          )}
        </div>

        {mode === "edit" ? (
          <form
            className={styles.factForm}
            onSubmit={(e) => {
              e.preventDefault();
              saveEdit();
            }}
          >
            <label className={styles.srOnly} htmlFor={`fact-edit-${def.id}`}>
              Edit value for {def.label}
            </label>
            <input
              id={`fact-edit-${def.id}`}
              className="oa-input"
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
            <div className={styles.factFormRow}>
              <button type="submit" className="oa-btn oa-btn--dark oa-btn--sm" disabled={!draft.trim()}>
                <Check size={13} aria-hidden /> Save
              </button>
              <button
                type="button"
                className="oa-btn oa-btn--ghost oa-btn--sm"
                onClick={() => setMode("view")}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <p className={`${styles.factValue} ${status === "rejected" ? styles.factValueRejected : ""}`}>
            {value}
          </p>
        )}

        {/* Edited: collapsible previous value + confirmation hint */}
        {status === "edited" && mode === "view" && (
          <div className={styles.factExtra}>
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--sm"
              aria-expanded={showPrevious}
              onClick={() => setShowPrevious((v) => !v)}
            >
              {showPrevious ? <ChevronUp size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />}
              {showPrevious ? "Hide previous value" : "Show previous value"}
            </button>
            {showPrevious && (
              <p className={styles.factPrev}>
                <span className={styles.factPrevLabel}>Previous</span> {def.value}
              </p>
            )}
          </div>
        )}

        {/* Rejected: visible reason + clarify link */}
        {status === "rejected" && mode === "view" && (
          <div className={styles.factExtra}>
            <p className={styles.factReason}>Reason: {state.reason || "Marked as incorrect by the owner."}</p>
            <Link href="/app/discovery" className="oa-chip">
              <MessageCircleQuestion size={13} aria-hidden /> Ask Oriant to clarify
            </Link>
          </div>
        )}

        {mode === "reject" && (
          <form
            className={styles.factForm}
            onSubmit={(e) => {
              e.preventDefault();
              submitReject();
            }}
          >
            <label className={styles.srOnly} htmlFor={`fact-reason-${def.id}`}>
              Why is {def.label} wrong?
            </label>
            <input
              id={`fact-reason-${def.id}`}
              className="oa-input"
              type="text"
              value={reasonDraft}
              onChange={(e) => setReasonDraft(e.target.value)}
              placeholder="What is wrong with this fact?"
              autoFocus
            />
            <div className={styles.factFormRow}>
              <button type="submit" className="oa-btn oa-btn--danger oa-btn--sm">
                <X size={13} aria-hidden /> Reject fact
              </button>
              <button
                type="button"
                className="oa-btn oa-btn--ghost oa-btn--sm"
                onClick={() => setMode("view")}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Review timestamp */}
        {mode === "view" && state.reviewedAt && status !== "unreviewed" && (
          <p className={styles.factWhen} aria-live="polite">
            {status === "confirmed"
              ? reviewedLabel("Confirmed", state.reviewedAt)
              : status === "edited"
                ? reviewedLabel("Edited", state.reviewedAt)
                : reviewedLabel("Rejected", state.reviewedAt)}
          </p>
        )}
      </div>

      {/* Per-state actions (hidden once the report is approved) */}
      {!reportApproved && mode === "view" && (
        <div className={styles.factActions}>
          {status === "unreviewed" && (
            <>
              <button
                type="button"
                className="oa-btn oa-btn--ghost oa-btn--sm"
                aria-label={`Confirm ${def.label}`}
                onClick={() => confirmFact(def.id)}
              >
                <Check size={13} aria-hidden /> Confirm
              </button>
              <button
                type="button"
                className="oa-btn oa-btn--ghost oa-btn--sm"
                aria-label={`Edit ${def.label}`}
                onClick={beginEdit}
              >
                <PencilLine size={13} aria-hidden /> Edit
              </button>
              <button
                type="button"
                className="oa-btn oa-btn--ghost oa-btn--sm"
                aria-label={`Reject ${def.label}`}
                onClick={() => setMode("reject")}
              >
                <X size={13} aria-hidden /> Reject
              </button>
            </>
          )}

          {status === "edited" && (
            <>
              <button
                type="button"
                className="oa-btn oa-btn--ghost oa-btn--sm"
                aria-label={`Confirm the edited value of ${def.label}`}
                onClick={() => confirmFact(def.id)}
              >
                <Check size={13} aria-hidden /> Confirm edit
              </button>
              <button
                type="button"
                className="oa-btn oa-btn--ghost oa-btn--sm"
                aria-label={`Edit ${def.label} again`}
                onClick={beginEdit}
              >
                <PencilLine size={13} aria-hidden /> Edit
              </button>
            </>
          )}

          {(status === "confirmed" || status === "edited" || status === "rejected") && (
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--sm"
              aria-label={`Undo review of ${def.label}`}
              onClick={() => {
                undoFactReview(def.id);
                setShowPrevious(false);
              }}
            >
              <RotateCcw size={13} aria-hidden /> Undo
            </button>
          )}

          <button
            type="button"
            className="oa-btn oa-btn--ghost oa-btn--sm"
            aria-pressed={state.confidential}
            aria-label={
              state.confidential
                ? `Remove confidential from ${def.label}`
                : `Mark ${def.label} confidential`
            }
            onClick={() => toggleFactConfidential(def.id)}
          >
            {state.confidential ? (
              <>
                <LockOpen size={13} aria-hidden /> Remove confidential
              </>
            ) : (
              <>
                <Lock size={13} aria-hidden /> Mark confidential
              </>
            )}
          </button>
        </div>
      )}
    </li>
  );
}

export default function ReportFactList({
  facts,
  reportApproved,
}: {
  facts: ReportFactDef[];
  reportApproved: boolean;
}) {
  if (facts.length === 0) return null;
  return (
    <div className={styles.factsBlock}>
      <p className="oa-micro">Facts in this section · {facts.length}</p>
      <ul className={styles.factList}>
        {facts.map((f) => (
          <FactRow key={f.id} def={f} reportApproved={reportApproved} />
        ))}
      </ul>
    </div>
  );
}
