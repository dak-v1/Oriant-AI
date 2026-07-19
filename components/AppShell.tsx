"use client";
/**
 * App shell — sidebar (journey nav) + top bar + active screen.
 * Port of the design's APP section chrome (reference/Margo.dc.html:228-271).
 */
import { useApp } from "@/lib/store";
import { journeyVals, META } from "@/lib/vals";
import { sx } from "@/lib/ui";
import CallScreen from "@/components/screens/CallScreen";
import ReportScreen from "@/components/screens/ReportScreen";
import PlannerScreen from "@/components/screens/PlannerScreen";
import DesignScreen from "@/components/screens/DesignScreen";
import BuildScreen from "@/components/screens/BuildScreen";
import ValidateScreen from "@/components/screens/ValidateScreen";
import WorkspaceScreen from "@/components/screens/WorkspaceScreen";
import ApprovalsScreen from "@/components/screens/ApprovalsScreen";

export default function AppShell() {
  const s = useApp();
  const journey = journeyVals(s);
  const [topKicker, topTitle] = META[s.screen] ?? ["", ""];
  const org = s.server?.org ?? { name: "Overtone Coffee", owner: "Nadia O.", initials: "NO" };
  const savedAt = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* SIDEBAR */}
      <aside style={sx({ width: 266, flex: "none", background: "var(--paper2)", borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" })}>
        <div style={sx({ padding: "20px 22px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 9 })}>
          <span style={sx({ width: 10, height: 10, borderRadius: "50%", background: "var(--ink)", display: "inline-block" })} />
          <span style={sx({ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 20, letterSpacing: "-.02em" })}>Margo</span>
        </div>
        <div style={sx({ padding: "16px 22px", borderBottom: "1px solid var(--line)" })}>
          <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)" })}>Workspace</div>
          <div style={sx({ display: "flex", alignItems: "center", gap: 9, marginTop: 7 })}>
            <span style={sx({ width: 24, height: 24, borderRadius: 6, background: "var(--ink)", color: "var(--paper)", fontFamily: "var(--disp)", fontWeight: 700, fontSize: 13, display: "grid", placeItems: "center" })}>{org.name[0]}</span>
            <span style={sx({ fontWeight: 600, fontSize: 14.5 })}>{org.name}</span>
          </div>
        </div>
        <nav style={sx({ flex: 1, overflowY: "auto", padding: "12px 12px" })}>
          {journey.map((j) => (
            <div
              key={j.screen}
              onClick={() => (j.screen === "call" ? s.enterCall(s.call.idx, true) : s.go(j.screen))}
              className="hv-bg"
              style={sx({ display: "flex", alignItems: "center", gap: 11, padding: "9px 11px", borderRadius: 9, cursor: "pointer", background: j.bg, "--hv-bg": "var(--paper3)" })}
            >
              <span style={sx({ fontFamily: "var(--mono)", fontSize: 11, width: 34, color: j.numColor })}>{j.n}</span>
              <span style={sx({ width: 7, height: 7, borderRadius: "50%", background: j.dot, flex: "none" })} />
              <span style={sx({ fontSize: 14, fontWeight: j.weight, color: j.color })}>{j.label}</span>
            </div>
          ))}
        </nav>
        <div style={sx({ padding: "14px 22px", borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" })}>
          <div style={sx({ display: "flex", alignItems: "center", gap: 9 })}>
            <span style={sx({ width: 26, height: 26, borderRadius: "50%", background: "var(--paper3)", border: "1px solid var(--line2)", fontFamily: "var(--disp)", fontWeight: 700, fontSize: 12, display: "grid", placeItems: "center" })}>{org.initials}</span>
            <span style={{ fontSize: 13 }}>{org.owner}</span>
          </div>
          <span
            onClick={s.toLanding}
            className="hv-fg"
            style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".06em", color: "var(--ink3)", cursor: "pointer", "--hv-fg": "var(--ember)" })}
          >
            EXIT ↗
          </span>
        </div>
      </aside>

      {/* MAIN */}
      <main style={sx({ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" })}>
        <div style={sx({ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 34px", borderBottom: "1px solid var(--line)", background: "rgba(244,238,227,.7)", backdropFilter: "blur(8px)", flex: "none" })}>
          <div style={sx({ display: "flex", alignItems: "center", gap: 14 })}>
            <span style={sx({ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)" })}>{topKicker}</span>
            <span style={sx({ width: 5, height: 5, borderRadius: "50%", background: "var(--line2)" })} />
            <span style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 16 })}>{topTitle}</span>
          </div>
          <div style={sx({ display: "flex", alignItems: "center", gap: 10 })}>
            <span style={sx({ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink3)", letterSpacing: ".04em" })}>SAVED · {savedAt.toUpperCase()}</span>
            <span style={sx({ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--line2)", display: "grid", placeItems: "center", fontSize: 15, cursor: "pointer" })}>?</span>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {s.screen === "call" && <CallScreen />}
          {s.screen === "report" && <ReportScreen />}
          {s.screen === "planner" && <PlannerScreen />}
          {s.screen === "design" && <DesignScreen />}
          {s.screen === "build" && <BuildScreen />}
          {s.screen === "validate" && <ValidateScreen />}
          {s.screen === "workspace" && <WorkspaceScreen />}
          {s.screen === "approvals" && <ApprovalsScreen />}
        </div>
      </main>
    </div>
  );
}
