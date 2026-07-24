"use client";
/**
 * ReviewDrawer — the large approval review drawer (spec §18.1).
 *
 * Sections, top to bottom: decision context, source information rows,
 * editable proposed content, confidence + approval rule, owner-edited local
 * draft (see note), version history (latest expanded, previous preserved and
 * collapsible), comments thread. Footer: Ask Agent to Update (ghost, slides
 * a prepared demo revision atop the history) + Approve (the one primary).
 *
 * Owner edits: the store has no action that appends an owner-authored
 * version, so "Save edit" keeps the text as a clearly-labelled LOCAL draft
 * layered above the version list (reported as a store gap, per brief).
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
  ChevronDown,
  Clock,
  Info,
  PenLine,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";
import type { ApprovalItem } from "@/lib/mock/types";
import { useDemoStore } from "@/lib/mock/store";
import { DEMO_TODAY } from "@/lib/mock/fixtures/ids";
import { DUR, EASE } from "@/lib/mock/motion";
import Drawer from "@/components/mock/ui/Drawer";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { toast } from "@/components/mock/ui/Toaster";
import { RISK_TAG, TEAM_LABEL, cap, dueLabel, stampLabel } from "./format";
import styles from "./approvals.module.css";

export default function ReviewDrawer({
  item,
  open,
  onClose,
  ownerDraft,
  onSaveOwnerDraft,
}: {
  item: ApprovalItem | null;
  open: boolean;
  onClose: () => void;
  /** Locally saved owner edit for this item (demo-only, lives in the screen). */
  ownerDraft?: string;
  onSaveOwnerDraft: (approvalId: string, text: string) => void;
}) {
  const reduced = useReducedMotion();
  const approveItem = useDemoStore((s) => s.approveItem);
  const askAgentToUpdate = useDemoStore((s) => s.askAgentToUpdate);
  const addApprovalComment = useDemoStore((s) => s.addApprovalComment);

  const [draftText, setDraftText] = useState("");
  const [commentText, setCommentText] = useState("");
  const [revising, setRevising] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const timerRef = useRef<number | null>(null);

  const latest = item ? item.versions[item.versions.length - 1] : undefined;
  const actionable =
    item !== null && (item.status === "pending" || item.status === "review_requested");

  /* Re-seed the editable draft whenever the item or its version count changes
     (a new agent revision replaces the textarea content). */
  useEffect(() => {
    if (!item) return;
    const last = item.versions[item.versions.length - 1];
    if (!last) return;
    setDraftText(last.content);
    setExpanded(new Set([last.version]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, item?.versions.length]);

  /* Cancel the simulated revision timer on close and on unmount. */
  useEffect(() => {
    if (!open) {
      setRevising(false);
      setCommentText("");
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [open]);
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const askUpdate = () => {
    if (!item || revising) return;
    const id = item.id;
    const note = item.nextRevision.note;
    const run = () => {
      askAgentToUpdate(id);
      toast({ title: "New draft version prepared", detail: note, tone: "info" });
    };
    if (reduced) {
      run();
      return;
    }
    setRevising(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setRevising(false);
      run();
    }, 1300);
  };

  const approve = () => {
    if (!item) return;
    approveItem(item.id);
    toast({
      title: "Approved. Calendar and activity updated",
      detail: item.title,
      tone: "ok",
    });
    onClose();
  };

  const trimmed = draftText.trim();
  const canSave = Boolean(
    item &&
      actionable &&
      latest &&
      trimmed.length > 0 &&
      trimmed !== latest.content &&
      trimmed !== (ownerDraft ?? ""),
  );
  const saveEdit = () => {
    if (!item || !canSave) return;
    onSaveOwnerDraft(item.id, trimmed);
    toast({
      title: "Edit saved as a local owner draft",
      detail: "It stays layered above the agent's versions in this demo.",
      tone: "info",
    });
  };

  const submitComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!item || !commentText.trim()) return;
    addApprovalComment(item.id, commentText);
    setCommentText("");
  };

  const toggleVersion = (v: number) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });

  return (
    <Drawer
      open={open && item !== null}
      onClose={onClose}
      wide
      eyebrow={item ? `${item.workflowName} · ${item.agentName}` : undefined}
      title={item?.title ?? ""}
      footer={
        item &&
        (actionable ? (
          <>
            <span className={`oa-sim-note ${styles.footNote}`}>
              <Info size={12} aria-hidden />
              Demo decision. Nothing is really sent.
            </span>
            <button
              type="button"
              className="oa-btn oa-btn--ghost"
              onClick={askUpdate}
              disabled={revising}
            >
              {revising ? (
                <>
                  <RefreshCw size={14} className="oa-spin" aria-hidden />
                  Agent revising…
                </>
              ) : (
                <>
                  <PenLine size={14} aria-hidden />
                  Ask Agent to Update
                </>
              )}
            </button>
            <button
              type="button"
              className="oa-btn oa-btn--primary"
              onClick={approve}
              disabled={revising}
            >
              <Check size={14} aria-hidden />
              Approve
            </button>
          </>
        ) : (
          <>
            <span className={`oa-sim-note ${styles.footNote}`}>
              Decision recorded. History stays intact.
            </span>
            <StatusBadge status={item.status} />
            <button type="button" className="oa-btn oa-btn--ghost" onClick={onClose}>
              Close
            </button>
          </>
        ))
      }
    >
      {item && latest && (
        <div>
          {/* ── Decision context ── */}
          <section className={styles.section} aria-label="Decision required">
            <p className="oa-micro">Decision required</p>
            <p className={styles.decision}>{item.decision}</p>
            <p className="oa-sub">{item.reason}</p>
            <div className="oa-cluster">
              <span className={`oa-tag ${RISK_TAG[item.risk]}`}>Risk: {cap(item.risk)}</span>
              <span className="oa-tag oa-tag--neutral">{item.valueLabel}</span>
              <span className="oa-tag oa-tag--neutral">{TEAM_LABEL[item.team]}</span>
              <span
                className={`${styles.due} ${item.dueAt === DEMO_TODAY ? styles.dueToday : ""}`}
              >
                <Clock size={12} aria-hidden />
                Due {dueLabel(item.dueAt, item.dueTime)}
              </span>
            </div>
          </section>

          {/* ── Source information ── */}
          <section className={styles.section} aria-label="Source information">
            <p className="oa-micro">Source information</p>
            <div className={styles.srcRows}>
              {item.source.map((s) => (
                <div key={s.label} className={styles.srcRow}>
                  <span className={styles.srcLabel}>{s.label}</span>
                  <span className={styles.srcValue}>{s.value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── Proposed decision / content ── */}
          <section className={styles.section} aria-label="Proposed decision and content">
            <div className={styles.proposedHead}>
              <p className="oa-micro">Proposed content</p>
              <span className={styles.proposedMeta}>
                <span className={styles.versionTag}>v{latest.version}</span>
                {stampLabel(latest.at)}
              </span>
            </div>
            <label className="oa-label" htmlFor="oa-approvals-proposed">
              {actionable ? "Edit before you decide" : "Final content"}
            </label>
            <textarea
              id="oa-approvals-proposed"
              className="oa-textarea"
              rows={7}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              readOnly={!actionable}
            />
            {actionable && (
              <div className={styles.saveRow}>
                <span className="oa-sim-note">
                  <PenLine size={12} aria-hidden />
                  Edits save as a local owner draft in this demo.
                </span>
                <button
                  type="button"
                  className="oa-btn oa-btn--ghost oa-btn--sm"
                  onClick={saveEdit}
                  disabled={!canSave}
                >
                  Save edit
                </button>
              </div>
            )}
          </section>

          {/* ── Confidence + approval rule ── */}
          <div className={styles.confRule}>
            <div className={styles.confBox}>
              <div className={styles.confHead}>
                <span className="oa-micro">Agent confidence</span>
                <span className={styles.confVal}>{Math.round(item.confidence * 100)}%</span>
              </div>
              <div className="oa-progress oa-progress--teal" aria-hidden>
                <span style={{ width: `${Math.round(item.confidence * 100)}%` }} />
              </div>
            </div>
            <div className={styles.ruleBox}>
              <ShieldCheck size={15} aria-hidden />
              <div>
                <p className="oa-micro" style={{ color: "inherit" }}>
                  Approval rule
                </p>
                <p className={styles.ruleText}>{item.approvalRule}</p>
              </div>
            </div>
          </div>

          {/* ── Owner-edited local draft (layered above history) ── */}
          <AnimatePresence initial={false}>
            {ownerDraft && (
              <motion.section
                className={styles.draftPanel}
                aria-label="Owner-edited draft"
                initial={reduced ? false : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0 }}
                transition={{ duration: DUR.card, ease: EASE }}
              >
                <p className="oa-micro">Owner-edited draft · saved locally</p>
                <p className={styles.versionText}>{ownerDraft}</p>
                <span className="oa-sim-note">
                  <Info size={12} aria-hidden />
                  Demo-only draft, kept alongside the agent&apos;s versions.
                </span>
              </motion.section>
            )}
          </AnimatePresence>

          {/* ── Version history ── */}
          <section className={styles.section} aria-label="Version history">
            <p className="oa-micro">Version history</p>
            <div className={styles.versions}>
              {revising && (
                <motion.div
                  className={styles.versionPending}
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: DUR.micro, ease: EASE }}
                >
                  <RefreshCw size={12} className="oa-spin" aria-hidden />
                  The agent is preparing a new version…
                  <span className="oa-sim-note">Prepared demo revision</span>
                </motion.div>
              )}
              <AnimatePresence initial={false}>
                {[...item.versions].reverse().map((v) => {
                  const isLatest = v.version === latest.version;
                  const isOpen = expanded.has(v.version);
                  return (
                    <motion.div
                      key={v.version}
                      layout={!reduced}
                      initial={reduced ? false : { opacity: 0, y: -12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: DUR.card, ease: EASE }}
                      className={`${styles.version} ${isLatest ? styles.versionLatest : ""}`}
                    >
                      <button
                        type="button"
                        className={styles.versionHead}
                        aria-expanded={isOpen}
                        onClick={() => toggleVersion(v.version)}
                      >
                        <span className={styles.versionTag}>v{v.version}</span>
                        {isLatest && <span className="oa-tag">Latest</span>}
                        <span className={styles.versionNote} title={v.note}>
                          {v.note}
                        </span>
                        <span className={styles.versionAt}>{stampLabel(v.at)}</span>
                        <ChevronDown
                          size={14}
                          aria-hidden
                          className={`${styles.versionChevron} ${
                            isOpen ? styles.versionChevronOpen : ""
                          }`}
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            className={styles.versionBodyWrap}
                            initial={reduced ? false : { height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{
                              duration: reduced ? 0 : DUR.card * 0.6,
                              ease: EASE,
                            }}
                          >
                            <div className={styles.versionBody}>
                              <p className={styles.versionText}>{v.content}</p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </section>

          {/* ── Comments ── */}
          <section className={styles.section} aria-label="Comments">
            <p className="oa-micro">Comments</p>
            {item.comments.length === 0 && <p className="oa-sub">No comments yet.</p>}
            <div className={styles.comments}>
              {item.comments.map((c, i) => (
                <div key={`${c.author}-${c.at}-${i}`} className={styles.comment}>
                  <div className={styles.commentHead}>
                    <span className={styles.commentAuthor}>{c.author}</span>
                    <span className={styles.commentAt}>{stampLabel(c.at)}</span>
                  </div>
                  <p className={styles.commentText}>{c.text}</p>
                </div>
              ))}
            </div>
            <form className={styles.commentForm} onSubmit={submitComment}>
              <input
                type="text"
                className="oa-input"
                placeholder="Add a comment for your team…"
                aria-label="Add a comment"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
              />
              <button
                type="submit"
                className="oa-btn oa-btn--soft oa-btn--sm"
                disabled={!commentText.trim()}
                aria-label="Post comment"
              >
                <Send size={13} aria-hidden />
                Post
              </button>
            </form>
          </section>
        </div>
      )}
    </Drawer>
  );
}
