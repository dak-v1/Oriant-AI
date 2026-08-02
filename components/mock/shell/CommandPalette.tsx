"use client";
/**
 * CommandPalette — the universal command bar (spec §19.1).
 *
 * The owner never needs to know which agent to invoke: submit a request,
 * watch the Orchestrator route it (3 deterministic steps), see the named
 * agent and a hardcoded result. Suggestion chips cover the four canonical
 * commands. Available from every page once planning has begun.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CornerDownLeft, MessageSquareText, X } from "lucide-react";
import { COMMANDS } from "@/lib/mock/fixtures/reports";
import type { CommandFixture } from "@/lib/mock/types";
import { runTimeline, stageSteps } from "@/lib/mock/services/timeline";
import { DUR, EASE } from "@/lib/mock/motion";
import styles from "./shell.module.css";

type Phase = "input" | "routing" | "result";

function matchCommand(input: string): CommandFixture {
  const lower = input.toLowerCase();
  const hit = COMMANDS.find((c) => c.keywords.every((k) => lower.includes(k.toLowerCase())));
  if (hit) return hit;
  const partial = COMMANDS.find((c) => c.keywords.some((k) => lower.includes(k.toLowerCase())));
  return partial ?? COMMANDS[0];
}

export default function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("input");
  const [value, setValue] = useState("");
  const [routedSteps, setRoutedSteps] = useState<string[]>([]);
  const [result, setResult] = useState<CommandFixture | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (open) {
      setPhase("input");
      setValue("");
      setRoutedSteps([]);
      setResult(null);
      setTimeout(() => inputRef.current?.focus(), 60);
    } else {
      cancelRef.current?.();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  const submit = (text: string) => {
    const cmd = matchCommand(text);
    setPhase("routing");
    setRoutedSteps([]);
    const handle = runTimeline(
      stageSteps(cmd.routingSteps, reduced ? 10 : 1800),
      (line) => setRoutedSteps((prev) => [...prev, line]),
      { instant: Boolean(reduced) },
    );
    cancelRef.current = handle.cancel;
    handle.done.then((finished) => {
      if (!finished) return;
      setResult(cmd);
      setPhase("result");
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="oa-scrim"
            style={{ zIndex: 70 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <div className="oa-modal oa" style={{ zIndex: 71, alignItems: "start", paddingTop: "12vh" }}>
            <motion.div
              className={styles.palette}
              role="dialog"
              aria-modal="true"
              aria-label="Ask Oriant"
              initial={{ opacity: 0, y: 14, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.99 }}
              transition={{ duration: DUR.card, ease: EASE }}
            >
              <div className={styles.paletteHead}>
                <MessageSquareText size={17} aria-hidden style={{ color: "var(--oa-blue)", flex: "none" }} />
                <input
                  ref={inputRef}
                  className={styles.paletteInput}
                  placeholder="Ask Oriant to prepare, summarise or change something…"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && value.trim()) submit(value);
                  }}
                  disabled={phase === "routing"}
                  aria-label="What would you like Oriant to do?"
                />
                {phase === "input" && value.trim() && (
                  <button
                    type="button"
                    className="oa-btn oa-btn--primary oa-btn--sm"
                    onClick={() => submit(value)}
                  >
                    Run
                    <CornerDownLeft size={13} aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={onClose}
                  aria-label="Close"
                >
                  <X size={15} aria-hidden />
                </button>
              </div>

              <div className={styles.paletteBody} aria-live="polite">
                {phase === "input" && (
                  <>
                    <p className="oa-micro">Try one of these</p>
                    <div className="oa-cluster">
                      {COMMANDS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="oa-chip"
                          onClick={() => {
                            setValue(c.example);
                            submit(c.example);
                          }}
                        >
                          {c.example}
                          <ArrowRight size={12} aria-hidden style={{ color: "var(--oa-muted)" }} />
                        </button>
                      ))}
                    </div>
                    <p className="oa-sub">
                      Requests here run on the sample workforce. Nothing is sent
                      to a real customer, inbox or account.
                    </p>
                  </>
                )}

                {phase === "routing" && (
                  <div className={styles.routing}>
                    <p className="oa-micro">Orchestrator is routing your request</p>
                    {routedSteps.map((line) => (
                      <motion.p
                        key={line}
                        className={styles.routingLine}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, ease: EASE }}
                      >
                        <span className={styles.routingDot} aria-hidden />
                        {line}
                      </motion.p>
                    ))}
                  </div>
                )}

                {phase === "result" && result && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: DUR.card, ease: EASE }}
                    style={{ display: "grid", gap: 12 }}
                  >
                    <div className="oa-between">
                      <span className="oa-tag">Routed to {result.agentName}</span>
                      <span className="oa-sim-note">Example result, from sample data</span>
                    </div>
                    <div className={styles.resultCard}>
                      <h3 className="oa-h3">{result.resultTitle}</h3>
                      {result.resultLines.map((line, i) => (
                        <p key={i} className={styles.resultLine}>
                          {line}
                        </p>
                      ))}
                    </div>
                    <div className="oa-cluster" style={{ justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="oa-btn oa-btn--ghost oa-btn--sm"
                        onClick={() => {
                          setPhase("input");
                          setValue("");
                          setResult(null);
                        }}
                      >
                        Ask something else
                      </button>
                      <button type="button" className="oa-btn oa-btn--primary oa-btn--sm" onClick={onClose}>
                        Done
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
