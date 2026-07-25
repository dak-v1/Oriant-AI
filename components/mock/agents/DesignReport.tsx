"use client";
/**
 * DesignReport — the editable AGENT DESIGN REPORT produced by the custom-agent
 * design call (spec §11.5.4). A document-style card mapping every
 * AgentDesignAnswers field to a titled, inline-editable section. Edits call
 * back to the store via onSave; when the design is approved the document
 * renders read-only.
 */
import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import type { AgentDesignAnswers } from "@/lib/mock/types";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import styles from "./agents.module.css";

const SECTIONS: { field: keyof AgentDesignAnswers; title: string; hint: string }[] = [
  { field: "objective", title: "Objective", hint: "What the agent is accountable for" },
  { field: "trigger", title: "Trigger", hint: "Exactly when it steps in" },
  { field: "inputs", title: "Required inputs", hint: "Information gathered before drafting" },
  { field: "decisions", title: "Decisions", hint: "Judgements it prepares, never makes alone" },
  { field: "permittedActions", title: "Permitted actions", hint: "What it may do on its own" },
  { field: "escalation", title: "Escalation", hint: "When a case goes straight to the owner" },
  { field: "systems", title: "Systems", hint: "Connections it works through" },
  { field: "successCriteria", title: "Success criteria", hint: "How the owner will judge it" },
];

export default function DesignReport({
  agentName,
  answers,
  editable,
  onSave,
}: {
  agentName: string;
  answers: AgentDesignAnswers;
  editable: boolean;
  onSave: (field: keyof AgentDesignAnswers, value: string) => void;
}) {
  const [editing, setEditing] = useState<keyof AgentDesignAnswers | null>(null);
  const [draft, setDraft] = useState("");

  const startEdit = (field: keyof AgentDesignAnswers) => {
    setEditing(field);
    setDraft(answers[field]);
  };

  const saveEdit = () => {
    if (editing && draft.trim()) onSave(editing, draft.trim());
    setEditing(null);
  };

  return (
    <article className={`oa-card ${styles.paper}`} aria-label="Agent design report">
      <header style={{ display: "grid", gap: 6 }}>
        <div className="oa-between" style={{ gap: 10 }}>
          <p className="oa-eyebrow">Agent design report</p>
          <StatusBadge
            status={editable ? "review_requested" : "approved"}
            label={editable ? "Draft, editable" : "Design approved"}
          />
        </div>
        <h2 className="oa-h2">
          {agentName} <span className="oa-serif">design</span>
        </h2>
        <p className="oa-sub">
          Built from your design-call answers. {editable ? "Edit any section before approving: the build uses exactly what is written here." : "This approved design is what the Agent Factory builds from."}
        </p>
      </header>

      <hr className="oa-divider" />

      {SECTIONS.map((s, i) => (
        <section key={s.field} style={{ display: "grid", gap: 8 }}>
          <div className="oa-between" style={{ gap: 10, alignItems: "flex-start" }}>
            <div style={{ display: "grid", gap: 2 }}>
              <p className="oa-micro">{s.title}</p>
              <p className="oa-sub" style={{ fontSize: 12 }}>{s.hint}</p>
            </div>
            {editable && editing !== s.field && (
              <button
                type="button"
                className="oa-btn oa-btn--ghost oa-btn--icon"
                aria-label={`Edit ${s.title}`}
                onClick={() => startEdit(s.field)}
              >
                <Pencil size={14} aria-hidden />
              </button>
            )}
          </div>

          {editing === s.field ? (
            <div style={{ display: "grid", gap: 8 }}>
              <textarea
                className="oa-textarea"
                value={draft}
                rows={3}
                onChange={(e) => setDraft(e.target.value)}
                aria-label={`${s.title} text`}
                autoFocus
              />
              <div className="oa-cluster" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="oa-btn oa-btn--ghost oa-btn--sm"
                  onClick={() => setEditing(null)}
                >
                  <X size={13} aria-hidden />
                  Cancel
                </button>
                <button
                  type="button"
                  className="oa-btn oa-btn--soft oa-btn--sm"
                  disabled={!draft.trim()}
                  onClick={saveEdit}
                >
                  <Check size={13} aria-hidden />
                  Save section
                </button>
              </div>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65 }}>{answers[s.field]}</p>
          )}

          {i < SECTIONS.length - 1 && <hr className="oa-divider" style={{ marginTop: 10 }} />}
        </section>
      ))}
    </article>
  );
}
