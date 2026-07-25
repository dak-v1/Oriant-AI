"use client";
/**
 * AutopilotOverlay — a calm status banner shown while the auto-play demo runs.
 * Names the current step and offers a Stop control. Deliberately unobtrusive
 * (bottom-centre, above the fab) so it stays out of a screen recording's way.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Square } from "lucide-react";
import { useAutopilot } from "@/lib/mock/autopilot";
import { DUR, EASE } from "@/lib/mock/motion";

export default function AutopilotOverlay() {
  const running = useAutopilot((s) => s.running);
  const presentation = useAutopilot((s) => s.presentation);
  const label = useAutopilot((s) => s.label);
  const step = useAutopilot((s) => s.step);
  const total = useAutopilot((s) => s.total);
  const stop = useAutopilot((s) => s.stop);

  /* Hidden while recording so it never appears on camera (press Esc to stop). */
  return (
    <AnimatePresence>
      {running && !presentation && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: DUR.card, ease: EASE }}
          style={{
            position: "fixed",
            left: "50%",
            bottom: 20,
            transform: "translateX(-50%)",
            zIndex: 90,
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "12px 14px 12px 18px",
            borderRadius: 999,
            background: "var(--oa-ink)",
            color: "#f3f4f0",
            boxShadow: "var(--oa-shadow-pop)",
            maxWidth: "min(560px, calc(100vw - 28px))",
          }}
          role="status"
          aria-live="polite"
        >
          <span
            aria-hidden
            style={{
              display: "grid",
              placeItems: "center",
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: "rgba(243,244,240,0.14)",
              flex: "none",
            }}
          >
            <Sparkles size={14} />
          </span>
          <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.7 }}>
              Auto-playing demo{total ? ` · ${step}/${total}` : ""}
            </span>
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 650,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {label || "Getting ready…"}
            </span>
          </div>
          <button
            type="button"
            onClick={stop}
            className="oa-btn oa-btn--sm"
            style={{
              flex: "none",
              background: "rgba(243,244,240,0.16)",
              color: "#f3f4f0",
              paddingInline: 16,
            }}
          >
            <Square size={12} aria-hidden />
            Stop
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
