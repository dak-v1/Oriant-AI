"use client";
/**
 * MobileNav — compact bottom navigation for ≤768px (spec §21).
 */
import { usePathname, useRouter } from "next/navigation";
import { Compass, Hammer, LayoutDashboard, Map } from "lucide-react";
import { useDemoStore } from "@/lib/mock/store";
import { NAV_SECTIONS, atLeast } from "@/lib/mock/state-machine";
import styles from "./shell.module.css";

const ICONS = [Compass, Map, Hammer, LayoutDashboard];

export default function MobileNav({ ready }: { ready: boolean }) {
  const journey = useDemoStore((s) => s.journey);
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className={styles.mobileBar} aria-label="Product phases">
      {NAV_SECTIONS.map((section, i) => {
        const Icon = ICONS[i] ?? Compass;
        const unlocked = ready && atLeast(journey, section.min);
        const active =
          pathname.startsWith(section.route) ||
          section.children.some((c) => pathname.startsWith(c.route));
        return (
          <button
            key={section.id}
            type="button"
            className={`${styles.mobileItem} ${active ? styles.mobileItemActive : ""}`}
            disabled={!unlocked}
            onClick={() => router.push(section.route)}
            aria-current={active ? "true" : undefined}
          >
            <Icon size={17} aria-hidden />
            {section.label}
          </button>
        );
      })}
    </nav>
  );
}
