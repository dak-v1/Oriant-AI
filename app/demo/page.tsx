import type { Metadata } from "next";
import MargoApp from "@/components/MargoApp";

export const metadata: Metadata = {
  title: "Margo — your AI operations manager",
  description:
    "Margo learns the shop, hires the team, and runs it past you first. The done-for-you AI workforce for small brands that outgrew the spreadsheet.",
};

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.42'/%3E%3C/svg%3E\")";

export default function DemoPage() {
  return (
    <>
      <MargoApp />
      {/* film grain overlay (ported from the original root layout) */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 9998,
          opacity: 0.5,
          mixBlendMode: "multiply",
          backgroundImage: GRAIN,
          backgroundSize: "140px",
        }}
      />
    </>
  );
}
