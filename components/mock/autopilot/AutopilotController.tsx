"use client";
/**
 * AutopilotController — mounted once in the app shell. When the autopilot is
 * running it drives the scripted journey to the Operate workspace, then stops.
 * Also renders the status overlay.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAutopilot, apDispatch } from "@/lib/mock/autopilot";
import { makeCtx, runScript } from "./engine";
import { AUTOPILOT_STOPS } from "./script";
import AutopilotOverlay from "./AutopilotOverlay";

export default function AutopilotController() {
  const running = useAutopilot((s) => s.running);
  const token = useAutopilot((s) => s.token);
  const router = useRouter();

  /* Esc stops the run (and exits recording mode) since the button/overlay are
     hidden while recording. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const ap = useAutopilot.getState();
      if (ap.running) ap.stop();
      else if (ap.presentation) ap.setPresentation(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!running) return;
    const myToken = token;
    let cancelled = false;
    const aborted = () => cancelled || useAutopilot.getState().token !== myToken;

    const ctx = makeCtx(
      (route) => router.push(route),
      aborted,
      (cmd, payload) => apDispatch(cmd, payload),
    );

    runScript(AUTOPILOT_STOPS, ctx, useAutopilot.getState().setProgress).then(() => {
      if (!aborted()) useAutopilot.getState().stop();
    });

    return () => {
      cancelled = true;
    };
  }, [running, token, router]);

  return <AutopilotOverlay />;
}
