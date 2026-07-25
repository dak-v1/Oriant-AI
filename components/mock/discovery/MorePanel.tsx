"use client";
/**
 * MorePanel — the two extra discovery inputs (spec §9.4):
 *  · Upload more information — fake dropzone, staged 1.5s read, adds the
 *    hardcoded SOP/org-chart facts via simulateUploadMore().
 *  · Invite an employee — mock invite link, simulated send, Priya's response
 *    arrives after ~2.5s via simulateInvite().
 * Both are honestly labeled as simulated.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
  Copy,
  FileText,
  Link2,
  Loader2,
  Send,
  UploadCloud,
  UserPlus,
} from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import {
  INVITE_FACT_IDS,
  KNOWLEDGE_FACTS,
  UPLOAD_FACT_IDS,
} from "@/lib/mock/fixtures/discovery-questions";
import type { KnowledgeFact } from "@/lib/mock/types";
import { runTimeline, type TimelineHandle } from "@/lib/mock/services/timeline";
import { toast } from "@/components/mock/ui/Toaster";
import { DUR, EASE } from "@/lib/mock/motion";
import styles from "./discovery.module.css";

const INVITE_LINK = "oriant.ai/invite/brightpath-ops";

const UPLOAD_STAGES = [
  "Reading BrightPath-SOP-Manual.pdf",
  "Extracting processes and team structure",
  "Adding facts to What Oriant knows",
];

function facts(ids: string[]): KnowledgeFact[] {
  return ids.map((id) => KNOWLEDGE_FACTS[id]).filter((f): f is KnowledgeFact => Boolean(f));
}

function FactList({ ids }: { ids: string[] }) {
  const reduced = useReducedMotion();
  return (
    <div className={styles.flyChips}>
      {facts(ids).map((f, i) => (
        <motion.span
          key={f.id}
          className={styles.flyChip}
          initial={reduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DUR.card, ease: EASE, delay: reduced ? 0 : i * 0.08 }}
        >
          <span className={styles.flyChipLabel}>{f.label}</span>
          <span className={styles.flyChipValue}>{f.value}</span>
        </motion.span>
      ))}
    </div>
  );
}

export default function MorePanel() {
  const reduced = useReducedMotion();
  const uploadedMore = useDemoStore((s) => s.discovery.uploadedMore);
  const invitedEmployee = useDemoStore((s) => s.discovery.invitedEmployee);
  const simulateUploadMore = useDemoStore((s) => s.simulateUploadMore);
  const simulateInvite = useDemoStore((s) => s.simulateInvite);

  const [uploadStage, setUploadStage] = useState(-1); // -1 idle, 0..2 reading
  const [inviteSent, setInviteSent] = useState(false);
  const uploadHandle = useRef<TimelineHandle | null>(null);
  const inviteHandle = useRef<TimelineHandle | null>(null);

  useEffect(
    () => () => {
      uploadHandle.current?.cancel();
      inviteHandle.current?.cancel();
    },
    [],
  );

  const startUpload = () => {
    if (uploadedMore || uploadStage >= 0) return;
    setUploadStage(0);
    const handle = runTimeline(
      UPLOAD_STAGES.map((_, i) => ({ delay: 500, emit: i })),
      (i) => setUploadStage(i),
      { instant: Boolean(reduced) },
    );
    uploadHandle.current = handle;
    handle.done.then((finished) => {
      if (!finished) return;
      simulateUploadMore();
      toast({
        title: `${UPLOAD_FACT_IDS.length} new facts added`,
        detail: "From BrightPath-SOP-Manual.pdf. See What Oriant knows.",
        tone: "ok",
      });
    });
  };

  const sendInvite = () => {
    if (invitedEmployee || inviteSent) return;
    setInviteSent(true);
    const handle = runTimeline([{ delay: 2500, emit: true }], () => {}, {
      instant: Boolean(reduced),
    });
    inviteHandle.current = handle;
    handle.done.then((finished) => {
      if (!finished) return;
      simulateInvite();
      toast({
        title: "Priya answered about complaint handling",
        detail: `${INVITE_FACT_IDS.length} new facts added to What Oriant knows.`,
        tone: "ok",
      });
    });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`https://${INVITE_LINK}`);
      toast({ title: "Invite link copied", tone: "info" });
    } catch {
      toast({ title: "Copy not available in this browser", tone: "info" });
    }
  };

  const uploading = uploadStage >= 0 && !uploadedMore;

  return (
    <div className={styles.moreGrid}>
      {/* ── Upload more information ── */}
      <section className={`oa-card oa-card--flat ${styles.moreCard}`} aria-label="Upload more information">
        <div style={{ display: "grid", gap: 4 }}>
          <h3 className="oa-h3">Upload more information</h3>
          <p className="oa-sub">
            SOPs, org charts or price lists give Oriant confirmed detail instead of assumptions.
          </p>
        </div>

        {uploadedMore ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div className={styles.fileRow}>
              <FileText size={15} aria-hidden style={{ color: "var(--oa-teal-deep)" }} />
              BrightPath-SOP-Manual.pdf
              <span className="oa-tag oa-tag--teal" style={{ marginLeft: "auto" }}>
                Read
              </span>
            </div>
            <p className="oa-sub" style={{ margin: 0 }}>
              {UPLOAD_FACT_IDS.length} facts added to What Oriant knows:
            </p>
            <FactList ids={UPLOAD_FACT_IDS} />
          </div>
        ) : uploading ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div className={styles.fileRow}>
              <FileText size={15} aria-hidden />
              BrightPath-SOP-Manual.pdf · 1.2 MB
            </div>
            <ul className={styles.stageList} aria-live="polite">
              {UPLOAD_STAGES.map((stage, i) => (
                <li key={stage} className={styles.stageItem}>
                  {i < uploadStage ? (
                    <Check size={14} aria-hidden style={{ color: "var(--oa-teal-deep)" }} />
                  ) : i === uploadStage ? (
                    <Loader2 size={14} aria-hidden className="oa-spin" style={{ color: "var(--oa-blue)" }} />
                  ) : (
                    <span
                      aria-hidden
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        border: "1.5px solid var(--oa-border)",
                        display: "inline-block",
                      }}
                    />
                  )}
                  {stage}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <button type="button" className={styles.dropzone} onClick={startUpload}>
            <UploadCloud size={22} aria-hidden style={{ color: "var(--oa-blue)" }} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>
              Drop a document here, or browse
            </span>
            <span className="oa-sub">PDF, PNG or DOCX. SOPs and org charts work best</span>
          </button>
        )}
        <span className="oa-sim-note">
          Simulated upload. No file leaves this demo.
        </span>
      </section>

      {/* ── Invite an employee ── */}
      <section className={`oa-card oa-card--flat ${styles.moreCard}`} aria-label="Invite an employee">
        <div style={{ display: "grid", gap: 4 }}>
          <h3 className="oa-h3">Invite an employee</h3>
          <p className="oa-sub">
            Someone closer to the work can answer a topic directly. Their reply lands in
            What Oriant knows with its own provenance.
          </p>
        </div>

        <div className={styles.linkChip}>
          <Link2 size={14} aria-hidden style={{ flex: "none", color: "var(--oa-muted-strong)" }} />
          <span>{INVITE_LINK}</span>
          <button
            type="button"
            className="oa-btn oa-btn--ghost oa-btn--sm"
            style={{ marginLeft: "auto", flex: "none" }}
            onClick={copyLink}
            aria-label="Copy invite link"
          >
            <Copy size={13} aria-hidden />
            Copy
          </button>
        </div>

        <p className="oa-sub" style={{ margin: 0 }}>
          Topic: how complaints are handled today · Invitee: Priya Nair, Customer Care lead
        </p>

        <AnimatePresence mode="wait" initial={false}>
          {invitedEmployee ? (
            <motion.div
              key="answered"
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DUR.card, ease: EASE }}
              className={styles.respCard}
            >
              <div className={styles.respHead}>
                <span className={styles.respAvatar} aria-hidden>
                  PN
                </span>
                <div style={{ display: "grid", gap: 1 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 750 }}>
                    Priya answered about complaint handling
                  </span>
                  <span className="oa-sub">Customer Care lead · via invite link</span>
                </div>
              </div>
              <FactList ids={INVITE_FACT_IDS} />
            </motion.div>
          ) : inviteSent ? (
            <motion.div
              key="waiting"
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={styles.stageItem}
              aria-live="polite"
            >
              <Loader2 size={14} aria-hidden className="oa-spin" style={{ color: "var(--oa-blue)" }} />
              Invite sent. Waiting for Priya&apos;s reply…
            </motion.div>
          ) : (
            <motion.div key="send" exit={{ opacity: 0 }}>
              <button type="button" className="oa-btn oa-btn--soft oa-btn--sm" onClick={sendInvite}>
                <Send size={13} aria-hidden />
                Send invite
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <span className="oa-sim-note">
          <UserPlus size={12} aria-hidden />
          Simulated invite. No real message is sent.
        </span>
      </section>
    </div>
  );
}
