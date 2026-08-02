"use client";
/**
 * TopBar — company selector, current phase, autosaved indicator, Interactive
 * Demo badge, Help, demo menu (Reset / Fast-forward) and owner avatar
 * (spec §4, §22).
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Eye,
  EyeOff,
  FastForward,
  HelpCircle,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import { useAutopilot } from "@/lib/mock/autopilot";
import type { ShellLane } from "@/components/live/route-lane";
import {
  PROGRESS_PHASES,
  homeRouteFor,
  phaseStatus,
} from "@/lib/mock/state-machine";
import type { JourneyState } from "@/lib/mock/types";
import { OWNER } from "@/lib/mock/fixtures/ids";
import AutopilotButton from "@/components/mock/autopilot/AutopilotButton";
import styles from "./shell.module.css";

const FAST_FORWARD_TARGETS: { label: string; state: JourneyState }[] = [
  { label: "Discovery interview", state: "discovery" },
  { label: "Report review", state: "report_review" },
  { label: "Workforce plan", state: "plan_review" },
  { label: "Plan approved", state: "plan_approved" },
  { label: "Sandbox testing", state: "sandbox_ready" },
  { label: "Ready to activate", state: "ready_to_activate" },
  { label: "Active workspace", state: "active_workspace" },
];

export default function TopBar({
  ready,
  lane,
}: {
  ready: boolean;
  /** Null while the shell has not resolved the lane yet — claim nothing. */
  lane: ShellLane | null;
}) {
  const journey = useDemoStore((s) => s.journey);
  const resetDemo = useDemoStore((s) => s.resetDemo);
  const fastForwardTo = useDemoStore((s) => s.fastForwardTo);
  const presentation = useAutopilot((s) => s.presentation);
  const setPresentation = useAutopilot((s) => s.setPresentation);
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuOpen]);

  const activePhase = ready
    ? PROGRESS_PHASES.find((p) => phaseStatus(p, journey) === "active") ??
      PROGRESS_PHASES[PROGRESS_PHASES.length - 1]
    : PROGRESS_PHASES[0];

  return (
    <header className={styles.topbar}>
      <button type="button" className={styles.company} aria-label="Company: BrightPath Home Services (a sample company)">
        <span className={styles.companyMark} aria-hidden>
          BP
        </span>
        BrightPath Home Services
        <ChevronDown size={14} aria-hidden style={{ color: "var(--oa-muted)" }} />
      </button>

      <span className={styles.phaseLabel}>
        Phase: <strong style={{ color: "var(--oa-ink)" }}>{activePhase.label}</strong>
      </span>

      <span className={styles.autosave}>
        <span className={styles.autosaveDot} aria-hidden />
        Autosaved
      </span>

      <div className={styles.topActions}>
        <AutopilotButton variant="chip" />
        {/* Same rule as the sidebar footer: the chrome may only claim the lane
            the screen was actually resolved to. A refused lane gets no badge —
            the page itself is explaining that neither screen was chosen. */}
        {lane === "demo" && <span className="oa-demo-badge">Sample data</span>}
        {lane === "live" && <span className="oa-tag oa-tag--amber">Your workspace</span>}

        <Link
          href="/#faq"
          className={styles.iconBtn}
          aria-label="Help and frequently asked questions"
          title="Help"
        >
          <HelpCircle size={16} aria-hidden />
        </Link>

        <div style={{ position: "relative" }} ref={menuRef}>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Options"
            aria-expanded={menuOpen}
            title="Options"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <SlidersHorizontal size={16} aria-hidden />
          </button>

          {menuOpen && (
            <div className={styles.demoMenu} role="menu" aria-label="Options">
              <p className={`oa-micro ${styles.demoMenuLabel}`}>Options</p>
              <button
                type="button"
                role="menuitem"
                className={styles.demoMenuItem}
                onClick={() => {
                  setMenuOpen(false);
                  setPresentation(!presentation);
                }}
              >
                {presentation ? (
                  <Eye size={14} aria-hidden style={{ color: "var(--oa-blue)" }} />
                ) : (
                  <EyeOff size={14} aria-hidden style={{ color: "var(--oa-blue)" }} />
                )}
                {presentation ? "Show sample-data labels" : "Hide sample-data labels"}
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.demoMenuItem}
                onClick={() => {
                  setMenuOpen(false);
                  resetDemo();
                  router.push("/app/onboarding");
                }}
              >
                <RotateCcw size={14} aria-hidden style={{ color: "var(--oa-red-ink)" }} />
                Start over
              </button>
              <hr className="oa-divider" style={{ margin: "6px 0" }} />
              <p className={`oa-micro ${styles.demoMenuLabel}`}>Jump to…</p>
              {FAST_FORWARD_TARGETS.map((t) => (
                <button
                  key={t.state}
                  type="button"
                  role="menuitem"
                  className={styles.demoMenuItem}
                  onClick={() => {
                    setMenuOpen(false);
                    fastForwardTo(t.state);
                    router.push(homeRouteFor(t.state));
                  }}
                >
                  <FastForward size={14} aria-hidden style={{ color: "var(--oa-blue)" }} />
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <span className={styles.avatar} aria-label={`Signed in as ${OWNER.name} (a sample account)`}>
          {OWNER.initials}
        </span>
      </div>
    </header>
  );
}
