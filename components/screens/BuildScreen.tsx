"use client";
/**
 * Build screen — the agent factory (reference/Margo.dc.html:762-815).
 * Progress bar + per-agent rows, build waves card, generated-files card.
 */
import { useApp } from "@/lib/store";
import { buildVals } from "@/lib/vals";
import { sx } from "@/lib/ui";

export default function BuildScreen() {
  const s = useApp();
  const v = buildVals(s);
  if (!v.onBuild) return null;

  return (
    <div style={sx({ maxWidth: 1080, margin: "0 auto", padding: "44px 40px 90px", animation: "fadeUp .45s ease both" })}>
      <div style={sx({ display: "grid", gridTemplateColumns: "auto 1fr", gap: 22, alignItems: "start", marginBottom: 26 })}>
        <div style={sx({ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 74, lineHeight: 0.8, letterSpacing: "-.03em", color: "var(--paper3)" })}>05</div>
        <div>
          <div style={sx({ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ember)" })}>The agent factory</div>
          <h1 style={sx({ fontFamily: "var(--disp)", fontWeight: 800, fontSize: "clamp(32px,4.4vw,50px)", lineHeight: 0.98, letterSpacing: "-.03em", margin: "10px 0 6px", maxWidth: "20ch" })}>Turning the plan into real files.</h1>
          <p style={sx({ fontSize: 15.5, color: "var(--ink2)", maxWidth: "56ch", margin: 0 })}>Each agent is generated asynchronously — prompts, YAML, tests and docs. Leave and come back; the jobs keep running.</p>
        </div>
      </div>

      <div style={sx({ display: "grid", gridTemplateColumns: "1.3fr .9fr", gap: 24, alignItems: "start" })}>
        <div style={sx({ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 24 })}>
          <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 })}>
            <div style={sx({ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)" })}>Build progress</div>
            <span style={sx({ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700 })}>{v.buildPctLabel}</span>
          </div>
          <div style={sx({ height: 8, background: "var(--paper3)", borderRadius: 5, overflow: "hidden", marginBottom: 22 })}>
            <div style={sx({ height: "100%", background: "var(--ink)", borderRadius: 5, width: v.buildPctLabel, transition: "width .2s" })} />
          </div>
          {v.buildRows.map((r) => (
            <div key={r.name} style={sx({ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", padding: "11px 0", borderTop: "1px solid var(--line)" })}>
              <div>
                <div style={sx({ fontSize: 14.5, fontWeight: 600 })}>{r.name}</div>
                <div style={sx({ height: 5, background: "var(--paper3)", borderRadius: 3, overflow: "hidden", marginTop: 6, width: 220, maxWidth: "100%" })}>
                  <div style={sx({ height: "100%", background: r.color, borderRadius: 3, width: r.pct + "%" })} />
                </div>
              </div>
              <span style={sx({ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: r.color })}>{r.statusLabel}</span>
            </div>
          ))}

          {v.buildIdle && (
            <button
              onClick={s.startBuild}
              className="hv-bg"
              style={sx({ width: "100%", marginTop: 22, background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 999, padding: 14, fontSize: 15, fontWeight: 600, cursor: "pointer", "--hv-bg": "var(--ember)" })}
            >
              Send to the factory →
            </button>
          )}
          {v.buildRunning && (
            <div style={sx({ textAlign: "center", fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink2)", marginTop: 22 })}>
              <span style={sx({ display: "inline-block", width: 11, height: 11, border: "2px solid var(--line2)", borderTopColor: "var(--ink)", borderRadius: "50%", animation: "spin .7s linear infinite", verticalAlign: "-1px", marginRight: 8 })} />
              Generating in parallel…
            </div>
          )}
          {v.buildDone && (
            <button
              onClick={s.gotoValidate}
              style={sx({ width: "100%", marginTop: 22, background: "var(--forest)", color: "var(--paper)", border: "none", borderRadius: 999, padding: 14, fontSize: 15, fontWeight: 600, cursor: "pointer" })}
            >
              All packages built · validate →
            </button>
          )}
        </div>

        <div style={sx({ display: "flex", flexDirection: "column", gap: 14 })}>
          <div style={sx({ background: "var(--paper2)", border: "1px solid var(--line)", borderRadius: 16, padding: 20 })}>
            <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 12 })}>Build waves</div>
            {v.buildWaves.map((w) => (
              <div key={w.w} style={sx({ padding: "9px 0", borderBottom: "1px solid var(--line)" })}>
                <div style={sx({ display: "flex", justifyContent: "space-between" })}>
                  <span style={sx({ fontWeight: 600, fontSize: 13.5 })}>{w.label}</span>
                  <span style={sx({ fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink3)" })}>{w.w}</span>
                </div>
                <div style={sx({ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink3)", marginTop: 2 })}>{w.note}</div>
              </div>
            ))}
          </div>
          <div style={sx({ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 20 })}>
            <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 12 })}>{v.buildFilesAgent} · generated files</div>
            <div style={sx({ display: "flex", flexWrap: "wrap", gap: 6 })}>
              {v.buildFiles.map((f) => (
                <span key={f} style={sx({ fontFamily: "var(--mono)", fontSize: 11, background: "var(--paper2)", border: "1px solid var(--line)", borderRadius: 6, padding: "5px 8px" })}>{f}</span>
              ))}
            </div>
            <div style={sx({ display: "flex", alignItems: "center", gap: 8, marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--line)", fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink2)" })}>
              <span style={sx({ width: 6, height: 6, borderRadius: "50%", background: v.doublewordLive ? "var(--forest)" : "var(--ochre)" })} />
              DOUBLEWORD · async inference · {v.doublewordLive ? "live" : "fixture"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
