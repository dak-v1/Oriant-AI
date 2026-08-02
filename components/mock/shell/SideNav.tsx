"use client";
/**
 * SideNav — Oriant.ai wordmark + the four phases (Discovery / Plan / Build /
 * Operate). The active phase expands to show its sub-steps; locked phases
 * are visible but disabled until the journey reaches them (spec §4).
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import { NAV_SECTIONS, atLeast } from "@/lib/mock/state-machine";
import type { ShellLane } from "@/components/live/route-lane";
import BrandLogo from "@/components/brand/BrandLogo";
import styles from "./shell.module.css";

export default function SideNav({
  ready,
  lane,
}: {
  ready: boolean;
  /** Null while the shell has not resolved the lane yet — claim nothing. */
  lane: ShellLane | null;
}) {
  const journey = useDemoStore((s) => s.journey);
  const callInProgress = useDemoStore((s) => s.onboarding.callInProgress);
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className={styles.nav} aria-label="Product phases">
      <Link href="/" className={styles.wordmark} aria-label="Oriant home">
        <span className={styles.wordmarkFull}>
          <BrandLogo variant="lockup" size={24} />
        </span>
        <span className={styles.wordmarkStar}>
          <BrandLogo variant="star" size={26} />
        </span>
      </Link>

      {NAV_SECTIONS.map((section, i) => {
        const unlocked = ready && atLeast(journey, section.min);
        const isActive =
          pathname.startsWith(section.route) ||
          section.children.some((c) => pathname === c.route || pathname.startsWith(c.route + "/"));
        // a section is "done" when the journey has moved past every child gate
        const nextSection = NAV_SECTIONS[i + 1];
        const done = ready && nextSection ? atLeast(journey, nextSection.min) && !isActive : false;

        return (
          <div key={section.id} className={styles.navSection}>
            <button
              type="button"
              className={`${styles.navHead} ${isActive ? styles.navHeadActive : ""}`}
              disabled={!unlocked}
              onClick={() => router.push(section.route)}
              aria-current={isActive ? "true" : undefined}
            >
              <span
                className={`${styles.navNum} ${
                  isActive ? styles.navNumActive : done ? styles.navNumDone : ""
                }`}
                aria-hidden
              >
                {done ? <Check size={12} /> : i + 1}
              </span>
              <span>{section.label}</span>
            </button>

            {isActive && (
              <div className={styles.navChildren}>
                {section.children.map((child) => {
                  const childUnlocked = ready && atLeast(journey, child.min);
                  const callLocked = callInProgress && (
                    child.route === "/app/onboarding"
                    || child.route === "/app/discovery"
                    || child.route === "/app/discovery/review"
                  );
                  const childActive = pathname === child.route;
                  if (callLocked) {
                    return (
                      <span
                        key={child.route}
                        className={`${styles.navChild} ${styles.navChildLocked}`}
                        aria-disabled="true"
                        title="Available after your call"
                      >
                        {child.label}
                      </span>
                    );
                  }
                  return (
                    <Link
                      key={child.route}
                      href={child.route}
                      className={`${styles.navChild} ${
                        childActive ? styles.navChildActive : ""
                      } ${!childUnlocked ? styles.navChildLocked : ""}`}
                      aria-current={childActive ? "page" : undefined}
                      tabIndex={childUnlocked ? 0 : -1}
                    >
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Lane-aware, because this footer used to assert "No live systems are
          connected" unconditionally — around /app/build showing a real
          deployment and around Operate screens reading the real runtime. Each
          lane gets only the sentence that is true of it, and a refused lane
          gets neither: the page beside it is explaining that no screen was
          chosen at all. */}
      {lane === "demo" && (
        <div className={styles.navFoot} data-demo-label>
          <span className="oa-demo-badge">Interactive demo</span>
          <p className="oa-sub" style={{ fontSize: 11.5 }}>
            This screen is a scripted walkthrough on prepared demo data. Screens
            marked &ldquo;Live runtime&rdquo; read the real workforce.
          </p>
        </div>
      )}
      {lane === "live" && (
        <div className={styles.navFoot}>
          <span className="oa-tag oa-tag--amber">Live runtime</span>
          <p className="oa-sub" style={{ fontSize: 11.5 }}>
            This screen reads the live agent runtime. Calls are real.
          </p>
        </div>
      )}
    </nav>
  );
}
