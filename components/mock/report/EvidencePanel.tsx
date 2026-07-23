"use client";
/**
 * EvidencePanel — evidence + notes for the active report section (spec §10).
 * Rendered inside the sticky right rail at ≥1024px and inside a Drawer
 * overlay below that. Shows each evidence quote with its provenance, the
 * confirmed-facts vs assumptions counts, and the owner-note thread.
 */
import { useState } from "react";
import { Send, UserRound } from "lucide-react";
import ProvenanceChip from "@/components/mock/ui/ProvenanceChip";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import type { ReportSectionDef, ReportSectionState } from "@/lib/mock/types";
import { OWNER } from "@/lib/mock/fixtures/ids";
import { roleFor } from "./report-utils";
import styles from "./report.module.css";

export default function EvidencePanel({
  def,
  state,
  sectionNumber,
  onAddNote,
}: {
  def: ReportSectionDef;
  state: ReportSectionState;
  sectionNumber: number;
  onAddNote: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const noteLines = state.ownerNote.split("\n").filter(Boolean);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onAddNote(text);
    setDraft("");
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "grid", gap: 5 }}>
        <p className="oa-micro">Evidence · Section {String(sectionNumber).padStart(2, "0")}</p>
        <h3 className="oa-h3">{def.title}</h3>
        <div className="oa-cluster" style={{ gap: 6 }}>
          <StatusBadge
            status={
              state.status === "confirmed"
                ? "completed"
                : state.status === "rejected"
                  ? "failed"
                  : "pending"
            }
            label={
              state.status === "confirmed"
                ? "Confirmed"
                : state.status === "rejected"
                  ? "Rejected"
                  : "Draft"
            }
          />
          {state.processOwner && (
            <span className="oa-sub">
              Owner: {state.processOwner} ({roleFor(state.processOwner)})
            </span>
          )}
        </div>
      </div>

      {/* Confirmed facts vs assumptions feeding this section */}
      <div className={styles.railCounts}>
        <div className={styles.railCount}>
          <span className={`${styles.railCountNum} oa-teal-text`}>{def.confirmedFacts}</span>
          <span className="oa-sub">Confirmed facts</span>
        </div>
        <div className={styles.railCount}>
          <span className={styles.railCountNum} style={{ color: "var(--oa-amber-ink)" }}>
            {def.assumptions}
          </span>
          <span className="oa-sub">Assumptions</span>
        </div>
      </div>

      {/* Evidence quotes */}
      <div style={{ display: "grid", gap: 10 }}>
        <p className="oa-micro">Where this came from</p>
        <div className={styles.evidenceList}>
          {def.evidence.map((ev, i) => (
            <figure key={i} className={styles.evidenceItem} style={{ margin: 0 }}>
              <blockquote className={styles.evidenceQuote} style={{ margin: 0 }}>
                “{ev.quote}”
              </blockquote>
              <figcaption className={styles.evidenceSource}>
                <span className="oa-sub" style={{ fontWeight: 700 }}>
                  {ev.source}
                </span>
                <ProvenanceChip provenance={ev.provenance} />
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      {/* Owner notes / comments thread */}
      <div className={styles.thread}>
        <p className="oa-micro">Notes &amp; comments</p>
        {noteLines.length === 0 && (
          <p className="oa-sub">No notes yet — anything you add travels with this section to the Planner.</p>
        )}
        {noteLines.map((line, i) => (
          <div key={i} className={styles.threadBubble}>
            <span className="oa-micro" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <UserRound size={11} aria-hidden />
              {OWNER.name} · {OWNER.role}
            </span>
            <p>{line}</p>
          </div>
        ))}
        <form
          className={styles.threadForm}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            className="oa-input"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a note for your team…"
            aria-label={`Add a note to ${def.title}`}
          />
          <button
            type="submit"
            className="oa-btn oa-btn--soft oa-btn--sm"
            disabled={!draft.trim()}
            aria-label="Add note"
          >
            <Send size={13} aria-hidden />
          </button>
        </form>
        <span className="oa-sim-note">Notes stay inside this demo — nothing is shared.</span>
      </div>
    </div>
  );
}
