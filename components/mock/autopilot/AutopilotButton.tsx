"use client";
/**
 * AutopilotButton — the "Do it for me" control. Starts the auto-play demo from
 * a clean state and runs the whole journey through to the Operate workspace,
 * playing every animation (voice, generation, build, sandbox, activation) so
 * the run can be screen-recorded for the landing page.
 */
import { Sparkles, Square } from "lucide-react";
import { useAutopilot } from "@/lib/mock/autopilot";

export default function AutopilotButton({
  variant = "chip",
}: {
  /** "chip" = compact top-bar style; "cta" = large onboarding call-to-action. */
  variant?: "chip" | "cta";
}) {
  const running = useAutopilot((s) => s.running);
  const presentation = useAutopilot((s) => s.presentation);
  const start = useAutopilot((s) => s.start);
  const stop = useAutopilot((s) => s.stop);

  /* Hidden while recording (presentation mode) so it never appears on camera.
     Pressing "Do it for me" turns presentation on, so the button hides itself
     once the run begins; press Esc to stop. */
  if (presentation) return null;

  if (variant === "cta") {
    return (
      <button
        type="button"
        className={`oa-btn ${running ? "oa-btn--ghost" : "oa-btn--dark"} oa-btn--lg`}
        onClick={running ? stop : start}
      >
        {running ? (
          <>
            <Square size={15} aria-hidden />
            Stop auto-play
          </>
        ) : (
          <>
            <Sparkles size={16} aria-hidden />
            Do it for me
          </>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`oa-btn ${running ? "oa-btn--danger" : "oa-btn--dark"} oa-btn--sm`}
      onClick={running ? stop : start}
      title={running ? "Stop the auto-play demo" : "Auto-play the whole demo"}
    >
      {running ? (
        <>
          <Square size={13} aria-hidden />
          Stop demo
        </>
      ) : (
        <>
          <Sparkles size={14} aria-hidden />
          Do it for me
        </>
      )}
    </button>
  );
}
