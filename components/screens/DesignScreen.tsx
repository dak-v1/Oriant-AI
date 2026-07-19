"use client";
/**
 * Design screen — the custom-agent design call.
 * Port of reference/Margo.dc.html:701-759.
 */
import { useApp } from "@/lib/store";
import { designVals } from "@/lib/vals";
import { sx } from "@/lib/ui";

export default function DesignScreen() {
  const s = useApp();
  const v = designVals(s);

  if (!v.onDesign) return null;

  return (
    <div style={sx({ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 })}>
      <div style={sx({ flex: 1, display: "grid", gridTemplateColumns: "250px 1fr", minHeight: 0 })}>
        {/* LEFT — checklist sidebar */}
        <div style={sx({ borderRight: "1px solid var(--line)", padding: "24px 20px", overflowY: "auto" })}>
          <div style={sx({ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ember)", marginBottom: 6 })}>Designing</div>
          <div style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 17, marginBottom: 16 })}>{v.dAgentName}</div>
          {v.dList.map((it, i) => (
            <div
              key={`${i}-${it.short}`}
              onClick={it.jump}
              className="hv-bg"
              style={sx({ display: "flex", gap: 9, alignItems: "flex-start", padding: "7px 9px", borderRadius: 8, cursor: "pointer", background: it.bg, "--hv-bg": "var(--paper3)" })}
            >
              <span style={sx({ width: 7, height: 7, borderRadius: "50%", background: it.dot, marginTop: 5, flex: "none" })} />
              <span style={sx({ fontSize: 12.5, lineHeight: 1.35, color: "var(--ink2)" })}>{it.short}</span>
            </div>
          ))}
        </div>

        {/* CENTER — question card / done state */}
        <div style={sx({ padding: "36px 48px", overflowY: "auto", display: "flex", flexDirection: "column", justifyContent: "center" })}>
          {v.dDone && (
            <div style={sx({ textAlign: "center", animation: "fadeUp .5s ease both", margin: "auto" })}>
              <span style={sx({ width: 56, height: 56, borderRadius: "50%", background: "var(--forest)", color: "var(--paper)", display: "inline-grid", placeItems: "center", fontSize: 26 })}>✓</span>
              <h1 style={sx({ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 38, letterSpacing: "-.03em", margin: "18px 0 6px" })}>Your agent is designed.</h1>
              <p style={sx({ fontSize: 16, color: "var(--ink2)", maxWidth: "44ch", margin: "0 auto" })}>I’ve turned this into an editable AgentSpec — objective, rules, tools, materials and approval gates. It’s ready to build.</p>
              <button
                onClick={() => { void s.finishDesign(); }}
                className="hv-bg"
                style={sx({ marginTop: 24, background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 999, padding: "15px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer", "--hv-bg": "var(--forest)" })}
              >
                Back to the plan →
              </button>
            </div>
          )}
          {v.dInProgress && (
            <div style={sx({ width: "100%", maxWidth: 620, margin: "0 auto" })}>
              <div style={sx({ display: "flex", gap: 13, alignItems: "flex-start", marginBottom: 22 })}>
                <span style={sx({ width: 36, height: 36, borderRadius: "50%", background: "var(--ink)", color: "var(--paper)", fontFamily: "var(--disp)", fontWeight: 700, fontSize: 15, display: "grid", placeItems: "center", flex: "none" })}>M</span>
                <div style={{ flex: 1 }}>
                  <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 5 })}>Margo · custom design</div>
                  <div style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 23, lineHeight: 1.22, letterSpacing: "-.01em", minHeight: 56 })}>
                    {v.dCaption}
                    {v.dSpeaking && (
                      <span style={sx({ display: "inline-block", width: 2, height: 21, background: "var(--ember)", marginLeft: 3, verticalAlign: -3, animation: "blink 1s step-end infinite" })} />
                    )}
                  </div>
                </div>
              </div>
              <div style={sx({ border: "1.5px solid var(--ember)", background: "var(--card)", borderRadius: 16, padding: 20, boxShadow: "0 22px 55px -34px rgba(26,23,18,.55)" })}>
                <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)", display: "flex", justifyContent: "space-between", marginBottom: 12 })}>
                  <span>{v.dCardId}</span>
                  <span>{v.dNum} / {v.dTotal}</span>
                </div>
                <textarea
                  value={v.dFilledVal}
                  onChange={(e) => s.dFill(e.target.value)}
                  placeholder={v.dPh}
                  style={sx({ width: "100%", border: "none", outline: "none", background: "transparent", resize: "vertical", minHeight: 70, fontFamily: "var(--sans)", fontSize: 16, lineHeight: 1.55, color: "var(--ink)" })}
                />
                {v.dIsMaterials && (
                  <div style={sx({ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 })}>
                    {v.dUploaded && (
                      <div style={sx({ display: "flex", alignItems: "center", gap: 9, background: "var(--paper2)", borderRadius: 9, padding: "10px 13px", fontSize: 13 })}>
                        <span style={sx({ width: 20, height: 20, borderRadius: 5, background: "var(--forest)", color: "var(--paper)", display: "grid", placeItems: "center", fontSize: 11 })}>✓</span>
                        wholesale-price-list.pdf attached
                      </div>
                    )}
                    <div
                      onClick={s.dUpload}
                      className="hv-bd"
                      style={sx({ border: "1px dashed var(--line2)", borderRadius: 10, padding: 14, textAlign: "center", cursor: "pointer", fontSize: 13, color: "var(--ink2)", "--hv-bd": "var(--ink)" })}
                    >
                      ⬆ Attach the price list, policy or docs this agent should use
                    </div>
                  </div>
                )}
              </div>
              <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, gap: 12 })}>
                <button
                  onClick={s.dSay}
                  className="hv-bd hv-fg"
                  style={sx({ display: "flex", alignItems: "center", gap: 9, background: "transparent", border: "1px solid var(--line2)", borderRadius: 999, padding: "11px 18px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", color: "var(--ink2)", "--hv-bd": "var(--ink)", "--hv-fg": "var(--ink)" })}
                >
                  <span style={sx({ width: 8, height: 8, borderRadius: "50%", background: "var(--ember)" })} />
                  Say it out loud
                </button>
                {v.dCanNext && (
                  <button
                    onClick={s.dNext}
                    className="hv-bg"
                    style={sx({ background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 999, padding: "12px 24px", fontSize: 14.5, fontWeight: 600, cursor: "pointer", "--hv-bg": "var(--forest)" })}
                  >
                    Got it, next →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM — call bar */}
      <div style={sx({ flex: "none", borderTop: "1px solid var(--line)", background: "var(--paper2)", padding: "12px 26px", display: "flex", alignItems: "center", gap: 18 })}>
        {v.dActive && (
          <>
            <div style={sx({ display: "flex", alignItems: "center", gap: 12, flex: 1 })}>
              <span style={sx({ width: 38, height: 38, borderRadius: "50%", background: "var(--ink)", color: "var(--paper)", fontFamily: "var(--disp)", fontWeight: 700, fontSize: 15, display: "grid", placeItems: "center", position: "relative" })}>
                M
                {v.dSpeaking && (
                  <span style={sx({ position: "absolute", inset: -4, borderRadius: "50%", border: "2px solid var(--ember)", animation: "pulse 1.6s ease-out infinite" })} />
                )}
              </span>
              <div>
                <div style={sx({ display: "flex", alignItems: "center", gap: 8 })}>
                  <span style={sx({ width: 7, height: 7, borderRadius: "50%", background: "var(--forest)" })} />
                  <span style={sx({ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".06em", color: "var(--ink2)" })}>DESIGN CALL · {v.dTimer}</span>
                </div>
                <div style={sx({ fontSize: 12.5, color: "var(--ink3)" })}>{v.dStatus}</div>
              </div>
            </div>
            <button
              onClick={s.endDesign}
              style={sx({ background: "var(--ember)", color: "var(--paper)", border: "none", borderRadius: 999, padding: "11px 20px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" })}
            >
              End call
            </button>
          </>
        )}
        {v.dPaused && (
          <>
            <div style={sx({ flex: 1, display: "flex", alignItems: "center", gap: 10 })}>
              <span style={sx({ width: 38, height: 38, borderRadius: "50%", background: "var(--paper3)", border: "1px solid var(--line2)", fontFamily: "var(--disp)", fontWeight: 700, fontSize: 15, display: "grid", placeItems: "center" })}>M</span>
              <span style={sx({ fontSize: 13.5, color: "var(--ink2)" })}>Design paused — your answers are saved.</span>
            </div>
            <button
              onClick={s.resumeDesign}
              className="hv-bg"
              style={sx({ background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 999, padding: "11px 22px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", "--hv-bg": "var(--forest)" })}
            >
              Resume →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
