"use client";
/**
 * AppShell — the persistent product chrome (spec §4).
 *
 * One shell for every /app route: side navigation (phases + sub-steps),
 * top bar (company, phase, autosave, Interactive Demo badge, help, demo
 * menu, avatar), the 6-step progress tracker, the floating universal
 * command button (available once planning has begun) and the route guard.
 * Supabase is required before the product shell becomes usable.
 */
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDemoStore } from "@/lib/mock/store";
import { useAutopilot } from "@/lib/mock/autopilot";
import { guardRoute, atLeast } from "@/lib/mock/state-machine";
import { demoJourneyGuardApplies, type LaneEnvDefaults } from "@/components/live/route-lane";
import SideNav from "./SideNav";
import TopBar from "./TopBar";
import ProgressTracker from "./ProgressTracker";
import CommandPalette from "./CommandPalette";
import MobileNav from "./MobileNav";
import Toaster from "@/components/mock/ui/Toaster";
import AutopilotController from "@/components/mock/autopilot/AutopilotController";
import { MessageSquareText } from "lucide-react";
import styles from "./shell.module.css";

export default function AppShell({
  children,
  laneEnv = {},
}: {
  children: React.ReactNode;
  /** Lane defaults read on the server; see components/live/route-lane.ts. */
  laneEnv?: LaneEnvDefaults;
}) {
  const [mounted, setMounted] = useState(false);
  const [serverSynced, setServerSynced] = useState(false);
  const [supabaseError, setSupabaseError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const journey = useDemoStore((s) => s.journey);
  const setJourney = useDemoStore((s) => s.setJourney);
  const setCallInProgress = useDemoStore((s) => s.setCallInProgress);
  const presentation = useAutopilot((s) => s.presentation);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/state", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          const error = await response.json().catch(() => ({})) as { error?: string; code?: string };
          if (error.code === "SUPABASE_NOT_CONFIGURED" || error.code === "SUPABASE_UNAVAILABLE") {
            setSupabaseError(error.error ?? "Supabase is not configured or unavailable.");
          }
          throw new Error(error.error ?? "Could not restore server state.");
        }
        const payload = await response.json() as {
          state?: {
            phase?: string;
            report?: { status?: string } | null;
            call?: { completedAt?: string };
            onboarding?: {
              activeSessionId?: string | null;
              sessions?: Record<string, { currentStep?: string; status?: string }>;
            };
          };
        };
        if (cancelled) return;
        const phase = payload.state?.phase;
        const activeSessionId = payload.state?.onboarding?.activeSessionId;
        const activeSession = activeSessionId
          ? payload.state?.onboarding?.sessions?.[activeSessionId]
          : undefined;
        setCallInProgress(activeSession?.status === "voice_in_progress");
        const onboardingReviewReady = activeSession?.currentStep === "review"
          || activeSession?.status === "review_pending"
          || activeSession?.status === "approved"
          || activeSession?.status === "handed_off";
        const next = phase === "report_approved" || payload.state?.report?.status === "approved"
          ? "planning"
          : phase === "report_draft"
            ? "report_review"
            : payload.state?.call?.completedAt
              ? "discovery"
              : onboardingReviewReady
                ? "discovery"
              : "onboarding";
        // Continue can advance the in-memory journey while this initial state
        // request is still in flight. Do not let that older response send the
        // user backwards during navigation to the interview.
        const currentJourney = useDemoStore.getState().journey;
        setJourney(atLeast(currentJourney, next) ? currentJourney : next);
      })
      .catch(() => {
        // The shell remains blocked until Supabase is available.
      })
      .finally(() => {
        if (!cancelled) setServerSynced(true);
      });
    return () => { cancelled = true; };
  }, [setCallInProgress, setJourney]);

  /* Route guard: forward deep links redirect to the current step (spec §5).
     It applies to the SCRIPTED lane only. The gate exists so a scripted demo
     cannot be deep-linked past its own narrative; a runtime-backed screen has no
     narrative to skip, and applying it there bounced an owner whose workforce is
     genuinely activated to onboarding because a demo they never ran left
     `journey` at "not_started". A refused lane is outside it for the same
     reason — see components/live/route-lane.ts.

     The query is read from `window.location` rather than `useSearchParams`,
     which would opt EVERY page under /app out of static prerendering (Next's
     CSR bailout) to answer a question this effect only asks after mount. */
  useEffect(() => {
    if (!mounted) return;
    const redirect = guardRoute(pathname, journey);
    if (redirect && redirect !== pathname) router.replace(redirect);
  }, [mounted, pathname, journey, router]);

  /* ⌘K / Ctrl+K opens the universal command palette (spec §19.1). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commandsAvailable = mounted && atLeast(journey, "planning");

  if (supabaseError) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "var(--oa-bg)" }}>
        <section className="oa-card" role="alert" style={{ maxWidth: 560, display: "grid", gap: 12 }}>
          <p className="oa-eyebrow" style={{ color: "var(--oa-red-ink)" }}>Supabase required</p>
          <h1 className="oa-h2" style={{ margin: 0 }}>Connect Supabase to continue</h1>
          <p className="oa-sub" style={{ margin: 0 }}>
            Oriant does not use local storage for product data. Add the Supabase URL and server service-role key to <code>.env.local</code>, then restart the dev server.
          </p>
          <p className="oa-micro" style={{ margin: 0 }}>{supabaseError}</p>
        </section>
      </main>
    );
  }

  return (
    <div className={`oa${mounted && presentation ? " oa-clean" : ""}`}>
      <div className={styles.shell}>
        <SideNav ready={mounted} />
        <div className={styles.main}>
          <TopBar ready={mounted} />
          <ProgressTracker ready={mounted} />
          <div className={styles.content}>{mounted ? children : null}</div>
          <MobileNav ready={mounted} />
        </div>
      </div>

      {commandsAvailable && (
        <button
          type="button"
          className={styles.cmdFab}
          onClick={() => setPaletteOpen(true)}
          aria-haspopup="dialog"
        >
          <MessageSquareText size={15} aria-hidden />
          Ask Oriant
          <span className={styles.cmdKbd} aria-hidden>
            ⌘K
          </span>
        </button>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Toaster />
      <AutopilotController />
    </div>
  );
}
