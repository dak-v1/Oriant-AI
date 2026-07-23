import type { Metadata } from "next";
import "./app.css";
import AppShell from "@/components/mock/shell/AppShell";

export const metadata: Metadata = {
  title: "Oriant.ai — Workspace",
  description:
    "Interactive product demo: guided discovery, an approvable company report, an AI workforce plan, sandbox testing and an owner-controlled operations workspace.",
  robots: { index: false },
};

export default function MockAppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
