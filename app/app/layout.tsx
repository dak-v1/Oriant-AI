import type { Metadata } from "next";
import "./app.css";
import AppShell from "@/components/mock/shell/AppShell";
import { LANE_ENV_VARS, type LaneEnvDefaults } from "@/components/live/route-lane";

export const metadata: Metadata = {
  title: "Oriant.ai - Workspace",
  description:
    "Interactive product demo: guided discovery, an approvable company report, an AI workforce plan, sandbox testing and an owner-controlled operations workspace.",
  robots: { index: false },
};

export default function MockAppLayout({ children }: { children: React.ReactNode }) {
  /* The shell guards /app/workspace/* behind the scripted demo journey, which is
     right for the scripted lane and wrong for the live one — see
     components/live/route-lane.ts. The shell is a client component, so the
     server reads the lane defaults here and hands them down. Lane names only;
     nothing else from the environment crosses. */
  const laneEnv: LaneEnvDefaults = Object.fromEntries(
    LANE_ENV_VARS.map((name) => [name, process.env[name]]),
  );

  return <AppShell laneEnv={laneEnv}>{children}</AppShell>;
}
