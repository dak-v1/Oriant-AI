"use client";
/**
 * ToolMark — the consistent tool identity mark for the integrations screens
 * (spec §12). A rounded square rendering the tool's initials: no external
 * logos anywhere in the mock. The tint is derived deterministically from the
 * name, so the same tool always looks the same; MCP / internal tools use the
 * dark "execution" tone to read as infrastructure.
 */
import type { CSSProperties } from "react";

const TINTS: { bg: string; fg: string }[] = [
  { bg: "var(--oa-soft-blue)", fg: "var(--oa-blue-dark)" },
  { bg: "var(--oa-soft-teal)", fg: "var(--oa-teal-deep)" },
  { bg: "var(--oa-bg-alt)", fg: "var(--oa-ink)" },
  { bg: "var(--oa-soft-amber)", fg: "var(--oa-amber-ink)" },
];

const DARK = { bg: "var(--oa-dark)", fg: "#dbe3ef" };

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
  }
  const w = words[0] ?? "?";
  return w.charAt(0).toUpperCase() + w.charAt(1).toLowerCase();
}

export default function ToolMark({
  name,
  size = 42,
  tone = "auto",
}: {
  name: string;
  size?: number;
  /** "dark" = MCP / internal tools. */
  tone?: "auto" | "dark";
}) {
  const hash = Array.from(name).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const tint = tone === "dark" ? DARK : TINTS[hash % TINTS.length];

  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: Math.max(10, Math.round(size * 0.3)),
    background: tint.bg,
    color: tint.fg,
    display: "grid",
    placeItems: "center",
    fontSize: Math.round(size * 0.33),
    fontWeight: 800,
    letterSpacing: "-0.02em",
    lineHeight: 1,
    flex: "none",
    border: "1px solid rgba(16, 24, 40, 0.07)",
    userSelect: "none",
  };

  /* Decorative: the tool name is always rendered as text right beside it. */
  return (
    <span style={style} aria-hidden>
      {initials(name)}
    </span>
  );
}
