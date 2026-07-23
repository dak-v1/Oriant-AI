"use client";
/**
 * ReportSectionCard — one editable section of the company report (spec §10).
 *
 * Reads like a document, acts like a product: body paragraphs + bullets from
 * the fixture (or the owner's edited body), a quiet action row revealed on
 * hover / focus-within, inline editors for Edit / Add context / Assign owner,
 * and status treatments — teal left rule + check when confirmed, muted
 * strikethrough with a revisit note when rejected.
 */
import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BookOpenText,
  Check,
  Lock,
  LockOpen,
  MessageCircleQuestion,
  MessageSquarePlus,
  Minus,
  PencilLine,
  RotateCcw,
  UserRoundPlus,
} from "lucide-react";
import type { ReportSectionDef, ReportSectionState } from "@/lib/mock/types";
import { useDemoStore } from "@/lib/mock/store";
import { DUR, EASE } from "@/lib/mock/motion";
import { toast } from "@/components/mock/ui/Toaster";
import { initialsOf, PROCESS_OWNER_OPTIONS, roleFor } from "./report-utils";
import styles from "./report.module.css";

type InlineTool = "none" | "note" | "owner";

export default function ReportSectionCard({
  def,
  state,
  index,
  reportApproved,
  onOpenEvidence,
  sectionRef,
}: {
  def: ReportSectionDef;
  state: ReportSectionState;
  index: number;
  /** Report currently approved (immutable look; Edit re-opens it). */
  reportApproved: boolean;
  onOpenEvidence: () => void;
  sectionRef: (el: HTMLElement | null) => void;
}) {
  const reduced = useReducedMotion();
  const editReportSection = useDemoStore((s) => s.editReportSection);
  const setSectionStatus = useDemoStore((s) => s.setSectionStatus);
  const setSectionNote = useDemoStore((s) => s.setSectionNote);
  const setSectionOwner = useDemoStore((s) => s.setSectionOwner);
  const toggleSectionConfidential = useDemoStore((s) => s.toggleSectionConfidential);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [tool, setTool] = useState<InlineTool>("none");
  const [noteDraft, setNoteDraft] = useState("");

  const body = state.editedBody ?? def.body;
  const rejected = state.status === "rejected";
  const confirmed = state.status === "confirmed";
  const noteLines = state.ownerNote.split("\n").filter(Boolean);

  const beginEdit = () => {
    setDraft(body.join("\n\n"));
    setEditing(true);
    setTool("none");
  };

  const saveEdit = () => {
    const paragraphs = draft
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (paragraphs.length === 0) return;
    const reopens = reportApproved;
    editReportSection(def.id, paragraphs);
    setEditing(false);
    if (reopens) {
      toast({
        title: "Report re-opened as a draft",
        detail: "The workforce plan is marked stale until you re-approve this report.",
        tone: "info",
      });
    } else {
      toast({ title: "Section updated", detail: `“${def.title}” now uses your wording.`, tone: "ok" });
    }
  };

  const submitNote = () => {
    const text = noteDraft.trim();
    if (!text) return;
    setSectionNote(def.id, state.ownerNote ? `${state.ownerNote}\n${text}` : text);
    setNoteDraft("");
    setTool("none");
  };

  return (
    <section
      ref={sectionRef}
      id={`report-${def.id}`}
      className={styles.section}
      aria-labelledby={`report-h-${def.id}`}
    >
      {/* Soft teal status rail on confirm */}
      <AnimatePresence>
        {confirmed && (
          <motion.span
            className={styles.sectionRail}
            aria-hidden
            initial={reduced ? { scaleY: 1 } : { scaleY: 0 }}
            animate={{ scaleY: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.card, ease: EASE }}
          />
        )}
      </AnimatePresence>

      <div className={styles.sectionHead}>
        <span className={styles.secNum} aria-hidden>
          {String(index + 1).padStart(2, "0")}
        </span>
        <h3 className="oa-h3" id={`report-h-${def.id}`}>
          {def.title}
        </h3>
        <AnimatePresence>
          {confirmed && (
            <motion.span
              className={styles.confirmChip}
              initial={reduced ? false : { scale: 0.3, rotate: -40, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: DUR.card, ease: EASE }}
              title="Confirmed by you"
            >
              <Check size={12} strokeWidth={3} aria-hidden />
              <span className={styles.srOnly}>Confirmed</span>
            </motion.span>
          )}
        </AnimatePresence>
        {rejected && (
          <span className="oa-tag oa-tag--amber">
            <Minus size={10} aria-hidden /> Rejected
          </span>
        )}
        {state.confidential && (
          <span className="oa-tag oa-tag--neutral">
            <Lock size={10} aria-hidden /> Confidential
          </span>
        )}
      </div>

      {/* Body — fixture text, owner-edited text, or the inline editor */}
      {editing ? (
        <div className={styles.editorBlock}>
          <label className={styles.srOnly} htmlFor={`edit-${def.id}`}>
            Edit section body
          </label>
          <textarea
            id={`edit-${def.id}`}
            className="oa-textarea"
            rows={Math.max(6, draft.split("\n").length + 2)}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          <div className={styles.editorRow}>
            <button type="button" className="oa-btn oa-btn--dark oa-btn--sm" onClick={saveEdit}>
              <Check size={13} aria-hidden /> Save
            </button>
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--sm"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            {reportApproved && (
              <span className="oa-sim-note">Saving re-opens the approved report</span>
            )}
          </div>
        </div>
      ) : (
        <div className={`${styles.sectionBody} ${rejected ? styles.rejectedBody : ""}`}>
          {body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
          {def.bullets.length > 0 && (
            <ul className={styles.bullets}>
              {def.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {rejected && (
        <p className={styles.rejectedNote} role="status">
          <RotateCcw size={13} aria-hidden />
          Rejected — Discovery will revisit this section.
        </p>
      )}

      {/* Owner-note callout */}
      {noteLines.length > 0 && (
        <div className={styles.noteCallout}>
          <span className={styles.noteCalloutHead}>
            <MessageSquarePlus size={12} aria-hidden /> Owner context
          </span>
          {noteLines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}

      {/* Assigned process owner */}
      {state.processOwner && (
        <span className={styles.ownerChip}>
          <span className={styles.ownerAvatar} aria-hidden>
            {initialsOf(state.processOwner)}
          </span>
          <span>
            <span className={styles.ownerChipName}>{state.processOwner}</span>{" "}
            <span className={styles.ownerChipRole}>· Process owner · {roleFor(state.processOwner)}</span>
          </span>
        </span>
      )}

      {/* Quiet per-section action row (hover / focus-within) */}
      {!editing && (
        <div className={styles.actions}>
          <button type="button" className={styles.actBtn} onClick={beginEdit}>
            <PencilLine size={13} aria-hidden /> Edit
          </button>

          {!reportApproved && !rejected && (
            <button
              type="button"
              className={`${styles.actBtn} ${styles.actBtnConfirm}`}
              onClick={() => setSectionStatus(def.id, confirmed ? "draft" : "confirmed")}
            >
              <Check size={13} aria-hidden /> {confirmed ? "Reopen" : "Confirm"}
            </button>
          )}

          {!reportApproved && (
            <button
              type="button"
              className={`${styles.actBtn} ${rejected ? "" : styles.actBtnReject}`}
              onClick={() => setSectionStatus(def.id, rejected ? "draft" : "rejected")}
            >
              {rejected ? (
                <>
                  <RotateCcw size={13} aria-hidden /> Restore finding
                </>
              ) : (
                <>
                  <Minus size={13} aria-hidden /> Reject finding
                </>
              )}
            </button>
          )}

          {!reportApproved && (
            <>
              <span className={styles.actDivider} aria-hidden />
              <button
                type="button"
                className={styles.actBtn}
                aria-expanded={tool === "note"}
                onClick={() => setTool(tool === "note" ? "none" : "note")}
              >
                <MessageSquarePlus size={13} aria-hidden /> Add context
              </button>
              <button
                type="button"
                className={styles.actBtn}
                aria-expanded={tool === "owner"}
                onClick={() => setTool(tool === "owner" ? "none" : "owner")}
              >
                <UserRoundPlus size={13} aria-hidden /> Assign process owner
              </button>
              <button
                type="button"
                className={styles.actBtn}
                aria-pressed={state.confidential}
                onClick={() => toggleSectionConfidential(def.id)}
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
            </>
          )}

          <span className={styles.actDivider} aria-hidden />
          <Link href="/app/discovery" className={styles.actBtn}>
            <MessageCircleQuestion size={13} aria-hidden /> Ask another discovery question
          </Link>
          <button
            type="button"
            className={`${styles.actBtn} ${styles.evidenceTrigger}`}
            onClick={onOpenEvidence}
          >
            <BookOpenText size={13} aria-hidden /> Evidence · {def.evidence.length}
          </button>
        </div>
      )}

      {/* Inline tools */}
      {tool === "note" && !editing && (
        <form
          className={styles.inlineForm}
          onSubmit={(e) => {
            e.preventDefault();
            submitNote();
          }}
        >
          <input
            className="oa-input"
            type="text"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Add context for this section…"
            aria-label={`Add context to ${def.title}`}
            autoFocus
          />
          <button type="submit" className="oa-btn oa-btn--soft oa-btn--sm" disabled={!noteDraft.trim()}>
            Add note
          </button>
        </form>
      )}

      {tool === "owner" && !editing && (
        <div className={styles.inlineForm}>
          <label className={styles.srOnly} htmlFor={`owner-${def.id}`}>
            Assign a process owner for {def.title}
          </label>
          <select
            id={`owner-${def.id}`}
            className="oa-select"
            value={state.processOwner}
            autoFocus
            onChange={(e) => {
              setSectionOwner(def.id, e.target.value);
              setTool("none");
            }}
          >
            <option value="">Choose a process owner…</option>
            {PROCESS_OWNER_OPTIONS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} — {p.role}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="oa-btn oa-btn--ghost oa-btn--sm"
            onClick={() => setTool("none")}
          >
            Close
          </button>
        </div>
      )}
    </section>
  );
}
