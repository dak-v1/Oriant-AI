"use client";
/**
 * Waveform — the animated voice bars used across every voice surface
 * (spec §9.1, §20). Purely decorative; static under reduced motion.
 * Bar heights are a fixed deterministic pattern, never random.
 */
import { useReducedMotion } from "framer-motion";

const PATTERN = [0.35, 0.7, 0.5, 0.95, 0.6, 0.8, 0.4, 1, 0.55, 0.85, 0.45, 0.75, 0.6, 0.9, 0.38];

export default function Waveform({
  active,
  height = 34,
  bars = 15,
  color = "var(--oa-blue)",
}: {
  /** true while "listening" — bars animate; false = calm resting state. */
  active: boolean;
  height?: number;
  bars?: number;
  color?: string;
}) {
  const reduced = useReducedMotion();
  const animate = active && !reduced;

  return (
    <div
      aria-hidden
      style={{
        display: "flex",
        alignItems: "center",
        gap: 3,
        height,
      }}
    >
      {Array.from({ length: bars }, (_, i) => {
        const h = PATTERN[i % PATTERN.length];
        return (
          <span
            key={i}
            style={{
              width: 3.5,
              borderRadius: 4,
              background: color,
              height: `${h * 100}%`,
              opacity: active ? 0.9 : 0.35,
              transformOrigin: "center",
              animation: animate
                ? `oa-wave ${0.9 + (i % 5) * 0.12}s ease-in-out ${i * 0.06}s infinite`
                : "none",
              transform: animate ? undefined : `scaleY(${active ? h : 0.3})`,
              transition: "opacity 0.3s var(--oa-ease)",
            }}
          />
        );
      })}
    </div>
  );
}
