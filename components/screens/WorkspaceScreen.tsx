"use client";
/**
 * The floor — live workspace: ROI stats, active-agent grid, event feed.
 * Port of reference/Margo.dc.html:855-899.
 */
import { useApp } from "@/lib/store";
import { workspaceVals } from "@/lib/vals";
import { sx } from "@/lib/ui";

export default function WorkspaceScreen() {
  const s = useApp();
  const v = workspaceVals(s);

  if (!v.onWorkspace) return null;

  return (
    <div style={sx({ maxWidth: 1180, margin: "0 auto", padding: "36px 40px 90px", animation: "fadeUp .45s ease both" })}>
      <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 14 })}>
        <div>
          <div style={sx({ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ember)" })}>The floor · live</div>
          <h1 style={sx({ fontFamily: "var(--disp)", fontWeight: 800, fontSize: "clamp(30px,4vw,46px)", lineHeight: 0.98, letterSpacing: "-.03em", margin: "8px 0 0" })}>Your crew is working.</h1>
        </div>
        <div style={sx({ display: "flex", gap: 26 })}>
          <div>
            <div style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 30, letterSpacing: "-.02em" })}>{v.roiHours}h</div>
            <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink3)" })}>Saved / mo</div>
          </div>
          <div>
            <div style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 30, letterSpacing: "-.02em" })}>{v.roiValue}</div>
            <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink3)" })}>Value / mo</div>
          </div>
          <div>
            <div style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 30, letterSpacing: "-.02em" })}>{v.plannedCount}</div>
            <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink3)" })}>Active agents</div>
          </div>
        </div>
      </div>

      <div style={sx({ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 24, marginTop: 28, alignItems: "start" })}>
        <div style={sx({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 })}>
          {v.plannedRows.map((a, i) => (
            <div
              key={a.name + i}
              className="hv-bd"
              style={sx({ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: 18, "--hv-bd": "var(--ink)" })}
            >
              <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "center" })}>
                <span style={sx({ width: 8, height: 8, borderRadius: "50%", background: "var(--forest)" })} />
                <span style={sx({ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--forest)" })}>Active</span>
              </div>
              <h3 style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 19, margin: "12px 0 2px" })}>{a.name}</h3>
              <div style={sx({ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink3)" })}>{a.role}</div>
              <p style={sx({ fontSize: 13, color: "var(--ink2)", lineHeight: 1.4, margin: "10px 0 14px" })}>{a.desc}</p>
              <div style={sx({ display: "flex", gap: 6, fontFamily: "var(--mono)", fontSize: 10.5 })}>
                <span className="hv-bd" style={sx({ border: "1px solid var(--line2)", borderRadius: 6, padding: "4px 8px", cursor: "pointer", "--hv-bd": "var(--ink)" })}>Test</span>
                <span className="hv-bd" style={sx({ border: "1px solid var(--line2)", borderRadius: 6, padding: "4px 8px", cursor: "pointer", "--hv-bd": "var(--ink)" })}>Pause</span>
                <span className="hv-bd" style={sx({ border: "1px solid var(--line2)", borderRadius: 6, padding: "4px 8px", cursor: "pointer", "--hv-bd": "var(--ink)" })}>Logs</span>
              </div>
            </div>
          ))}
        </div>

        <div style={sx({ background: "var(--paper2)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, position: "sticky", top: 20 })}>
          <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 })}>
            <span style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)" })}>Event feed</span>
            <span style={sx({ fontFamily: "var(--mono)", fontSize: 10, color: "var(--forest)" })}>● live</span>
          </div>
          {v.events.map((e, i) => (
            <div key={i} style={sx({ display: "grid", gridTemplateColumns: "auto 1fr", gap: 11, padding: "11px 0", borderTop: "1px solid var(--line)" })}>
              <span style={sx({ width: 7, height: 7, borderRadius: "50%", background: e.color, marginTop: 6 })} />
              <div>
                <div style={sx({ display: "flex", justifyContent: "space-between", gap: 8 })}>
                  <span style={sx({ fontWeight: 600, fontSize: 13 })}>{e.who}</span>
                  <span style={sx({ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink3)" })}>{e.t}</span>
                </div>
                <div style={sx({ fontSize: 13, color: "var(--ink2)", lineHeight: 1.35, marginTop: 2 })}>{e.msg}</div>
              </div>
            </div>
          ))}
          <button
            onClick={() => s.go("approvals")}
            className="hv-bg"
            style={sx({ width: "100%", marginTop: 16, background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 999, padding: 11, fontSize: 13.5, fontWeight: 600, cursor: "pointer", "--hv-bg": "var(--ember)" })}
          >
            {v.apNeed} waiting on your desk →
          </button>
        </div>
      </div>
    </div>
  );
}
