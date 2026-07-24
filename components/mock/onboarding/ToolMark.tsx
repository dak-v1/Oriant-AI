"use client";
/**
 * ToolMark — deterministic monogram mark for a tool row/card (improvement
 * spec §7: every tool row shows a mark, name, category and purpose). No
 * external logos; a stable two-letter monogram keeps the mock offline-safe.
 */
import styles from "./onboarding.module.css";

export default function ToolMark({ name }: { name: string }) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials =
    words.length >= 2
      ? `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase()
      : name.slice(0, 2);
  return (
    <span className={styles.toolMark} aria-hidden>
      {initials}
    </span>
  );
}
