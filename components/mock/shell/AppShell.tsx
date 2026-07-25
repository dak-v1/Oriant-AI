"use client";
/**
 * AppShell — the persistent product chrome (spec §4).
 *
 * One shell for every /app route: side navigation (phases + sub-steps),
 * top bar (company, phase, autosave, Interactive Demo badge, help, demo
 * menu, avatar), the 6-step progress tracker, the floating universal
 * command button (available once planning has begun) and the route guard.
 *
 * The store persists to localStorage, so the first client render can differ
 * from SSR — everything store-driven renders after mount (hydration gate).
 */
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDemoStore } from "@/lib/mock/store";
import { useAutopilot } from "@/lib/mock/autopilot";
import { guardRoute, atLeast } from "@/lib/mock/state-machine";
import SideNav from "./SideNav";
import TopBar from "./TopBar";
import ProgressTracker from "./ProgressTracker";
import CommandPalette from "./CommandPalette";
import MobileNav from "./MobileNav";
import Toaster from "@/components/mock/ui/Toaster";
import AutopilotController from "@/components/mock/autopilot/AutopilotController";
import { MessageSquareText } from "lucide-react";
import styles from "./shell.module.css";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const journey = useDemoStore((s) => s.journey);
  const presentation = useAutopilot((s) => s.presentation);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => setMounted(true), []);

  /* Route guard: forward deep links redirect to the current step (spec §5). */
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
