"use client";
/**
 * CommandBar — compact natural-language plan reconfiguration (improvement
 * spec §12.3): collapsed it is a single 56px input row (message icon, input,
 * decorative mic, Send) with a clear 1.5px border. Focus expands it smoothly
 * (height animation, no sibling jump) to reveal three example chips and a
 * hint line; it collapses on blur when empty. A matched command plays the
 * fixture's reasoning strip (~2.5s), then applies the deterministic change:
 * the store bumps the plan version and the toast offers Undo.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LoaderCircle, MessageSquare, Mic, Send } from "lucide-react";
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
  const [expanded, setExpanded] = useState(false);
  const [busyCmd, setBusyCmd] = useState<NlCommandFixture | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const reduced = useReducedMotion();
  const handleRef = useRef<TimelineHandle | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
      setExpanded(false);
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
        detail: "Try one of the example commands. The demo planner supports a fixed set of changes.",
        tone: "info",
      });
      return;
    }
    run(cmd, trimmed);
  };

  const expandAndFocus = () => {
    setExpanded(true);
    inputRef.current?.focus();
  };

  const showExamples = expanded && !busyCmd;

  return (
    <section
      className={styles.commandBar}
      aria-label="Describe a plan change"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        inputRef.current?.focus();
      }}
      onFocus={() => setExpanded(true)}
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (next && e.currentTarget.contains(next)) return;
        if (!value.trim() && !busyCmd) setExpanded(false);
      }}
    >
      <form className={styles.cmdRow} onSubmit={submit}>
        <MessageSquare size={16} className={styles.cmdIcon} aria-hidden />
        <input
          ref={inputRef}
          type="text"
          className={styles.cmdInput}
          placeholder='Describe a change, for example "Add a weekly overdue-invoice summary"'
          aria-label="Describe a plan change in plain language"
          value={value}
          disabled={Boolean(busyCmd)}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="button"
          className="oa-btn oa-btn--ghost oa-btn--icon"
          aria-label="Voice input (demo). Opens the example commands."
          onClick={expandAndFocus}
        >
          <Mic size={15} aria-hidden />
        </button>
        <button
          type="submit"
          className="oa-btn oa-btn--dark oa-btn--sm"
          disabled={Boolean(busyCmd) || !value.trim()}
        >
          <Send size={13} aria-hidden />
          Send
        </button>
      </form>

      <AnimatePresence initial={false}>
        {busyCmd && (
          <motion.div
            key="thinking"
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduced ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: DUR.micro, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
            <div className={styles.thinking} aria-live="polite">
              <LoaderCircle size={14} className="oa-spin" aria-hidden />
              <div className={styles.thinkingLines}>
                <p className={styles.thinkingTitle}>Planner is thinking…</p>
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
              </div>
            </div>
          </motion.div>
        )}

        {showExamples && (
          <motion.div
            key="examples"
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduced ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: DUR.micro, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
            <div className={styles.cmdMore}>
              <div className={styles.cmdChips}>
                {NL_COMMANDS.slice(0, 3).map((cmd) => (
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
              <div className={styles.cmdFooter}>
                <p className={styles.cmdHint}>
                  Oriant applies the change as a new plan version. Undo restores the previous one.
                </p>
                <span className="oa-sim-note">Simulated planner, deterministic demo changes</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
