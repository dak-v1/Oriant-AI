"use client";
/**
 * CommandBar — natural-language plan reconfiguration (spec §11.7, §22):
 * typed input + the four example command chips. A match plays the fixture's
 * reasoning as a compact "Planner is thinking" strip (~2.5s), then applies
 * the deterministic change and confirms with a cost delta + Undo toast.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LoaderCircle, Send, Sparkles } from "lucide-react";
import { NL_COMMANDS } from "@/lib/mock/fixtures/workflow-plan";
import type { NlCommandFixture } from "@/lib/mock/types";
import { mockPlannerService } from "@/lib/mock/services";
import type { TimelineHandle } from "@/lib/mock/services/timeline";
import { useDemoStore } from "@/lib/mock/store";
import { toast } from "@/components/mock/ui/Toaster";
import { DUR, EASE } from "@/lib/mock/motion";
import { formatCostDelta } from "./planner-utils";
import styles from "./planner.module.css";

/** Every keyword included (case-insensitive); fallback: first partial match. */
function matchCommand(input: string): NlCommandFixture | null {
  const norm = input.toLowerCase();
  const exact = NL_COMMANDS.find((c) => c.keywords.every((k) => norm.includes(k.toLowerCase())));
  if (exact) return exact;
  return (
    NL_COMMANDS.find((c) =>
      c.example
        .toLowerCase()
        .split(/[^a-z-]+/)
        .filter((w) => w.length > 3)
        .some((w) => norm.includes(w)),
    ) ?? null
  );
}

export default function CommandBar() {
  const [value, setValue] = useState("");
  const [busyCmd, setBusyCmd] = useState<NlCommandFixture | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const reduced = useReducedMotion();
  const handleRef = useRef<TimelineHandle | null>(null);

  useEffect(() => () => handleRef.current?.cancel(), []);

  const run = (cmd: NlCommandFixture, echo: string) => {
    if (busyCmd) return;
    setValue(echo);
    setBusyCmd(cmd);
    setLines([]);
    const handle = mockPlannerService.reconfigure(
      cmd.reasoning,
      (line) => setLines((prev) => [...prev, line]),
      { instant: Boolean(reduced) },
    );
    handleRef.current = handle;
    void handle.done.then((finished) => {
      if (!finished) return;
      useDemoStore.getState().applyNlCommand(cmd);
      toast({
        title: cmd.summary,
        detail: formatCostDelta(cmd.costDelta),
        tone: "ok",
        action: { label: "Undo", onClick: () => useDemoStore.getState().undoPlan() },
      });
      setBusyCmd(null);
      setLines([]);
      setValue("");
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || busyCmd) return;
    const cmd = matchCommand(trimmed);
    if (!cmd) {
      toast({
        title: "Oriant didn't recognise that command.",
        detail: "Try one of the example commands below — the demo planner supports those four changes.",
        tone: "info",
      });
      return;
    }
    run(cmd, trimmed);
  };

  return (
    <section className={styles.commandBar} aria-label="Plan command bar">
      <form className={styles.cmdRow} onSubmit={submit}>
        <Sparkles size={16} className={styles.cmdIcon} aria-hidden />
        <input
          type="text"
          className={styles.cmdInput}
          placeholder='Describe a change — e.g. "Add a weekly overdue-invoice summary"'
          aria-label="Describe a plan change in plain language"
          value={value}
          disabled={Boolean(busyCmd)}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="submit"
          className="oa-btn oa-btn--dark oa-btn--sm"
          disabled={Boolean(busyCmd) || !value.trim()}
        >
          <Send size={13} aria-hidden />
          Update plan
        </button>
      </form>

      {busyCmd ? (
        <div className={styles.thinking} aria-live="polite">
          <LoaderCircle size={14} className="oa-spin" aria-hidden />
          <div className={styles.thinkingLines}>
            <p className={styles.thinkingTitle}>Planner is thinking…</p>
            <AnimatePresence initial={false}>
              {lines.map((line) => (
                <motion.p
                  key={line}
                  className={styles.thinkingLine}
                  initial={reduced ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: DUR.micro, ease: EASE }}
                >
                  {line}
                </motion.p>
              ))}
            </AnimatePresence>
          </div>
        </div>
      ) : (
        <div className={styles.cmdFooter}>
          <div className={styles.cmdChips}>
            {NL_COMMANDS.map((cmd) => (
              <button
                key={cmd.id}
                type="button"
                className="oa-chip"
                onClick={() => run(cmd, cmd.example)}
              >
                {cmd.example}
              </button>
            ))}
          </div>
          <span className="oa-sim-note">Simulated planner — deterministic demo changes</span>
        </div>
      )}
    </section>
  );
}
