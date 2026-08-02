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
import { guardRoute, atLeast, isJourneyState } from "@/lib/mock/state-machine";
import {
  demoJourneyGuardApplies,
  shellLaneFor,
  type LaneEnvDefaults,
  type ShellLane,
} from "@/components/live/route-lane";
import SideNav from "./SideNav";
import TopBar from "./TopBar";
import ProgressTracker from "./ProgressTracker";
import CommandPalette from "./CommandPalette";
import MobileNav from "./MobileNav";
import Toaster from "@/components/mock/ui/Toaster";
import AutopilotController from "@/components/mock/autopilot/AutopilotController";
import { MessageSquareText } from "lucide-react";
import styles from "./shell.module.css";

/**
 * Where this tab keeps its demo journey between page loads. sessionStorage, not
 * localStorage, on purpose: the journey is one tab's walk through a scripted
 * narrative, and a stale journey from last week's demo leaking into a fresh
 * browser session would deep-link a new viewer past the story.
 */
const JOURNEY_STORAGE_KEY = "oriant-demo-journey";

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
  /* Which lane the chrome's own labels may describe. Null until mounted — the
     pre-hydration render must match the server's, which cannot read the query
     string, so until the client has resolved the lane the chrome claims
     NOTHING. A moment with no badge beats a moment with the wrong one: this
     shell used to stamp "Interactive demo" over screens reading the live
     runtime. */
  const [shellLane, setShellLane] = useState<ShellLane | null>(null);
  const [supabaseError, setSupabaseError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const journey = useDemoStore((s) => s.journey);
  const setJourney = useDemoStore((s) => s.setJourney);
  const setCallInProgress = useDemoStore((s) => s.setCallInProgress);
  const presentation = useAutopilot((s) => s.presentation);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => setMounted(true), []);

  /* Resume this tab's journey before anything judges it. The store is created
     fresh on every page load (`create()` with no persist), so a mid-demo F5
     used to restart the journey UI at "not_started" — and the route guard below
     then bounced every deep link to onboarding. The saved value only ever moves
     the journey FORWARD (`atLeast`), so a slow /api/state response cannot be
     beaten to a downgrade, and an unrecognised stored value is dropped rather
     than ranked. The subscription keeps the copy current from then on,
     including Reset Demo, which persists "not_started" like any other step. */
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(JOURNEY_STORAGE_KEY);
      if (isJourneyState(saved) && !atLeast(useDemoStore.getState().journey, saved)) {
        setJourney(saved);
      }
    } catch {
      // Storage can be unavailable (privacy modes); the server sync still runs.
    }
    return useDemoStore.subscribe((state) => {
      try {
        sessionStorage.setItem(JOURNEY_STORAGE_KEY, state.journey);
      } catch {
        // Same: a tab that cannot persist simply falls back to server sync.
      }
    });
  }, [setJourney]);

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
    /* NOT BEFORE THE SERVER HAS ANSWERED. The journey starts at "not_started"
       in every fresh tab, and /api/state is what lifts it to where the demo
       actually is. Judging a deep link against the placeholder bounced every
       refresh past onboarding back to step 1 — the redirect had already
       happened by the time hydration arrived seconds later and silently proved
       it wrong. `serverSynced` is set in that request's `finally`, so a failed
       sync still lets the guard run (against whatever the sessionStorage resume
       above restored) rather than disabling it. */
    if (!serverSynced) return;
    /* THE LINE THE COMMENT ABOVE HAS ALWAYS DESCRIBED, AND WHICH WAS MISSING.
       `demoJourneyGuardApplies` was imported at the top of this file and never
       called, so the exemption it exists to provide was inert: every
       runtime-backed screen stayed gated on a scripted journey it takes no part
       in. /app/build and /app/deploy were unreachable in a browser because of
       it — they rendered and were replaced with /app/onboarding in the same
       tick, which is why a rewritten Agent Factory still looked broken. */
    const query = new URLSearchParams(window.location.search).get("live") ?? undefined;
    if (!demoJourneyGuardApplies(pathname, query, laneEnv)) return;
    const redirect = guardRoute(pathname, journey);
    if (redirect && redirect !== pathname) router.replace(redirect);
  }, [mounted, serverSynced, pathname, journey, router, laneEnv]);

  /* The shell's own honesty label. Resolved with the same inputs as the pages
     and the guard — pathname, `?live`, the server's lane env — so the sidebar
     can no longer claim "prepared demo data" around a screen that is reading
     the live runtime. Window.location is read here for the same prerendering
     reason as the guard above. */
  useEffect(() => {
    if (!mounted) return;
    const query = new URLSearchParams(window.location.search).get("live") ?? undefined;
    setShellLane(shellLaneFor(pathname, query, laneEnv));
  }, [mounted, pathname, laneEnv]);

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
          <p className="oa-eyebrow" style={{ color: "var(--oa-red-ink)" }}>Workspace unavailable</p>
          <h1 className="oa-h2" style={{ margin: 0 }}>We can&rsquo;t load your workspace right now</h1>
          <p className="oa-sub" style={{ margin: 0 }}>
            Oriant can&rsquo;t reach the service that keeps your workspace, so it
            is showing you nothing at all rather than a blank workspace you might
            mistake for an empty one. Nothing has been changed or lost.
          </p>
          <p className="oa-micro" style={{ margin: 0 }}>
            Whoever set this up needs to finish connecting it. Reload this page
            once they have.
          </p>
        </section>
      </main>
    );
  }

  return (
    <div className={`oa${mounted && presentation ? " oa-clean" : ""}`}>
      <div className={styles.shell}>
        <SideNav ready={mounted} lane={shellLane} />
        <div className={styles.main}>
          <TopBar ready={mounted} lane={shellLane} />
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
