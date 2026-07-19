"use client";
/**
 * Approvals screen — "Your desk": approval queue, selected approval card,
 * decision buttons, month calendar. Port of reference/Margo.dc.html:901-963.
 */
import { useApp } from "@/lib/store";
import { approvalsVals } from "@/lib/vals";
import { sx } from "@/lib/ui";

export default function ApprovalsScreen() {
  const s = useApp();
  const v = approvalsVals(s);

  if (!v.onApprovals) return null;

  return (
    <div style={sx({ maxWidth: 1180, margin: "0 auto", padding: "36px 40px 90px", animation: "fadeUp .45s ease both" })}>
      <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 14, marginBottom: 22 })}>
        <div>
          <div style={sx({ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ember)" })}>Your desk</div>
          <h1 style={sx({ fontFamily: "var(--disp)", fontWeight: 800, fontSize: "clamp(30px,4vw,46px)", lineHeight: 0.98, letterSpacing: "-.03em", margin: "8px 0 0" })}>The calls that need you.</h1>
        </div>
        <div style={sx({ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink2)" })}><span style={sx({ color: "var(--ember)", fontWeight: 700 })}>{v.apNeed}</span> awaiting decision</div>
      </div>

      <div style={sx({ display: "grid", gridTemplateColumns: "340px 1fr", gap: 20, alignItems: "start" })}>
        <div style={sx({ display: "flex", flexDirection: "column", gap: 8 })}>
          <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)", padding: "0 4px" })}>Queue · by urgency</div>
          {v.apRows.map((a) => (
            <div
              key={a.id}
              onClick={a.select}
              className="hv-bd"
              style={sx({ background: a.bg, border: `1px solid ${a.bd}`, borderRadius: 12, padding: "14px 15px", cursor: "pointer", "--hv-bd": "var(--ink)" })}
            >
              <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 })}>
                <span style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink3)" })}>{a.agent}</span>
                <span style={sx({ display: "flex", alignItems: "center", gap: 5, fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink2)" })}>
                  <span style={sx({ width: 6, height: 6, borderRadius: "50%", background: a.dot })} />
                  {a.statusLabel}
                </span>
              </div>
              <div style={sx({ fontWeight: 600, fontSize: 14.5, lineHeight: 1.25 })}>{a.title}</div>
              <div style={sx({ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink3)", marginTop: 6 })}>{a.due} · risk {a.risk}</div>
            </div>
          ))}
        </div>

        <div style={sx({ display: "flex", flexDirection: "column", gap: 18 })}>
          {v.apSel && (
            <div style={sx({ background: "var(--card)", border: "1px solid var(--line2)", borderRadius: 16, padding: 24 })}>
              <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 })}>
                <div>
                  <div style={sx({ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ember)" })}>{v.apSel.agent} proposes</div>
                  <h2 style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 26, letterSpacing: "-.02em", margin: "6px 0 0" })}>{v.apSel.title}</h2>
                </div>
                <span style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", border: `1px solid ${v.apSel.riskColor}`, color: v.apSel.riskColor, borderRadius: 20, padding: "4px 11px", whiteSpace: "nowrap" })}>Risk · {v.apSel.risk}</span>
              </div>
              <p style={sx({ fontSize: 15, color: "var(--ink2)", lineHeight: 1.55, margin: "16px 0" })}>{v.apSel.summary}</p>
              <div style={sx({ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 })}>
                <div style={sx({ background: "var(--paper2)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px" })}>
                  <div style={sx({ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink3)" })}>Amount</div>
                  <div style={sx({ fontWeight: 600, fontSize: 15 })}>{v.apSel.amount}</div>
                </div>
                <div style={sx({ background: "var(--paper2)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px" })}>
                  <div style={sx({ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink3)" })}>Due</div>
                  <div style={sx({ fontWeight: 600, fontSize: 15 })}>{v.apSel.due}</div>
                </div>
                <div style={sx({ background: "var(--paper2)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px" })}>
                  <div style={sx({ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink3)" })}>Status</div>
                  <div style={sx({ fontWeight: 600, fontSize: 15 })}>{v.apSel.statusLabel}</div>
                </div>
              </div>
              {v.apSel.isOpen && (
                <div style={sx({ display: "flex", gap: 10, flexWrap: "wrap" })}>
                  <button
                    onClick={() => { void s.decide("approved"); }}
                    className="hv-bg"
                    style={sx({ background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 999, padding: "13px 26px", fontSize: 14.5, fontWeight: 600, cursor: "pointer", "--hv-bg": "var(--forest)" })}
                  >
                    Approve
                  </button>
                  <button style={sx({ background: "transparent", border: "1px solid var(--line2)", color: "var(--ink)", borderRadius: 999, padding: "13px 22px", fontSize: 14.5, fontWeight: 600, cursor: "pointer" })}>
                    Ask agent to revise
                  </button>
                  <button
                    onClick={() => { void s.decide("rejected"); }}
                    className="hv-bd hv-fg"
                    style={sx({ background: "transparent", border: "1px solid var(--line2)", color: "var(--ink2)", borderRadius: 999, padding: "13px 22px", fontSize: 14.5, fontWeight: 600, cursor: "pointer", "--hv-bd": "var(--ember)", "--hv-fg": "var(--ember)" })}
                  >
                    Reject
                  </button>
                </div>
              )}
              {v.apSelClosed && (
                <div style={sx({ display: "flex", alignItems: "center", gap: 10, background: "var(--paper2)", borderRadius: 10, padding: "12px 16px", fontSize: 14, color: "var(--ink2)" })}>
                  <span style={sx({ width: 20, height: 20, borderRadius: "50%", background: "var(--forest)", color: "var(--paper)", display: "grid", placeItems: "center", fontSize: 12 })}>✓</span>
                  Decision recorded — the agent was notified.
                </div>
              )}
            </div>
          )}

          <div style={sx({ background: "var(--paper2)", border: "1px solid var(--line)", borderRadius: 16, padding: 22 })}>
            <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 })}>
              <span style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 18 })}>{v.calMonth}</span>
              <span style={sx({ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink3)" })}>Scheduled work & approvals</span>
            </div>
            <div style={sx({ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 6 })}>
              <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
            </div>
            {v.calWeeks.map((w, wi) => (
              <div key={wi} style={sx({ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 4 })}>
                {w.map((d, di) => (
                  <div
                    key={di}
                    style={sx({ aspectRatio: "1", borderRadius: 8, background: d.bg, color: d.fg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 12.5, position: "relative" })}
                  >
                    {d.day}
                    {d.dot && <span style={sx({ width: 5, height: 5, borderRadius: "50%", background: d.dot, marginTop: 2 })} />}
                  </div>
                ))}
              </div>
            ))}
            <div style={sx({ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12, fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink2)" })}>
              <span><span style={sx({ width: 6, height: 6, borderRadius: "50%", background: "var(--ember)", display: "inline-block", marginRight: 5 })} />Needs approval</span>
              <span><span style={sx({ width: 6, height: 6, borderRadius: "50%", background: "var(--forest)", display: "inline-block", marginRight: 5 })} />Approved</span>
              <span><span style={sx({ width: 6, height: 6, borderRadius: "50%", background: "var(--ink2)", display: "inline-block", marginRight: 5 })} />Done</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
