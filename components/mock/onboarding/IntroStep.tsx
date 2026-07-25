"use client";
/**
 * IntroStep — onboarding step 2 (spec §7.1): the voice-first opening prompt.
 * Uses the shared VoiceAnswer interaction; once an answer is captured the
 * step shows the saved text with edit / re-record affordances.
 */
import { useState } from "react";
import { Check, Pencil, RotateCcw } from "lucide-react";
import VoiceAnswer from "@/components/mock/ui/VoiceAnswer";
import { useDemoStore } from "@/lib/mock/store";
import { DEMO_INTRO_ANSWER } from "@/lib/mock/fixtures/demo-company";
import styles from "./onboarding.module.css";

/** Spec §7.1 — the voice-first opening prompt. */
const INTRO_PROMPT =
  "Tell me what your company does and what is taking too much of your team’s time.";

export default function IntroStep() {
  const intro = useDemoStore((s) => s.onboarding.intro);
  const setIntro = useDemoStore((s) => s.setIntro);
  const captureSection = useDemoStore((s) => s.captureSection);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const hasIntro = intro.trim().length > 0;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span className="oa-micro">Oriant asks</span>
        <p className={styles.promptQuote}>“{INTRO_PROMPT}”</p>
        <p className="oa-sub">
          Speak naturally for twenty or thirty seconds. Oriant turns it into
          structured facts you can review on the right.
        </p>
      </div>

      {!hasIntro ? (
        <VoiceAnswer
          answer={DEMO_INTRO_ANSWER}
          confirmLabel="Save introduction"
          onConfirm={(text) => {
            setIntro(text);
            captureSection("company");
          }}
        />
      ) : (
        <div className={styles.capturedCard}>
          <div className="oa-between">
            <span className="oa-status oa-status--completed">Captured</span>
            <div className="oa-cluster">
              {!editing && (
                <button
                  type="button"
                  className="oa-btn oa-btn--ghost oa-btn--sm"
                  onClick={() => {
                    setDraft(intro);
                    setEditing(true);
                  }}
                >
                  <Pencil size={12} aria-hidden />
                  Edit text
                </button>
              )}
              <button
                type="button"
                className="oa-btn oa-btn--ghost oa-btn--sm"
                onClick={() => {
                  setEditing(false);
                  setIntro("");
                }}
              >
                <RotateCcw size={12} aria-hidden />
                Re-record
              </button>
            </div>
          </div>

          {editing ? (
            <div style={{ display: "grid", gap: 8 }}>
              <textarea
                className="oa-textarea"
                rows={4}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="Edit your introduction"
                autoFocus
              />
              <div className="oa-cluster" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="oa-btn oa-btn--ghost oa-btn--sm"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="oa-btn oa-btn--soft oa-btn--sm"
                  disabled={!draft.trim()}
                  onClick={() => {
                    setIntro(draft.trim());
                    setEditing(false);
                  }}
                >
                  <Check size={13} aria-hidden />
                  Save changes
                </button>
              </div>
            </div>
          ) : (
            <p>{intro}</p>
          )}
        </div>
      )}
    </div>
  );
}
