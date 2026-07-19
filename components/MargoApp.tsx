"use client";
import { useEffect } from "react";
import { useApp } from "@/lib/store";
import { sx } from "@/lib/ui";
import Landing from "@/components/Landing";
import AppShell from "@/components/AppShell";

export default function MargoApp() {
  const screen = useApp((s) => s.screen);
  const error = useApp((s) => s.error);
  const hydrate = useApp((s) => s.hydrate);
  const clearError = useApp((s) => s.clearError);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <div style={{ minHeight: "100vh" }}>
      {screen === "landing" ? <Landing /> : <AppShell />}
      {error && (
        <div
          onClick={clearError}
          style={sx({
            position: "fixed", left: "50%", bottom: 26, transform: "translateX(-50%)",
            zIndex: 9999, background: "var(--ink)", color: "var(--paper)",
            borderRadius: 12, padding: "13px 20px", fontSize: 14, maxWidth: 520,
            boxShadow: "0 18px 40px -18px rgba(26,23,18,.55)", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 10,
            animation: "fadeUp .3s ease both",
          })}
        >
          <span style={sx({ width: 8, height: 8, borderRadius: "50%", background: "var(--ember)", flex: "none" })} />
          {error}
          <span style={sx({ fontFamily: "var(--mono)", fontSize: 10, opacity: 0.6, marginLeft: 6 })}>DISMISS</span>
        </div>
      )}
    </div>
  );
}
