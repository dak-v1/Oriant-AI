"use client";
/**
 * Report screen — the editable company brief (Phase 1).
 * Port of reference/Margo.dc.html:372-529.
 */
import { useApp } from "@/lib/store";
import { reportVals } from "@/lib/vals";
import { sx } from "@/lib/ui";

function Sec({ id, n, title, chip }: { id: string; n: string; title: string; chip: string }) {
  return (
    <div id={id} style={sx({ display: "flex", alignItems: "center", gap: 12, margin: "36px 0 14px" })}>
      <span style={sx({ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink3)" })}>§{n}</span>
      <h2 style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 22, letterSpacing: "-.01em", margin: 0, flex: 1 })}>{title}</h2>
      <span style={sx({ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink3)", border: "1px solid var(--line)", borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap" })}>{chip}</span>
    </div>
  );
}

export default function ReportScreen() {
  const s = useApp();
  const v = reportVals(s);
  // The report masthead names the org from server state, never a constant: the
  // header used to hardcode the legacy Overtone prototype fixture above a body
  // written entirely about the server org.
  const orgName = s.server?.org.name;

  if (!v.onReport) return null;

  if (!v.hasReport) {
    return (
      <div style={sx({ maxWidth: 1180, margin: "0 auto", padding: "44px 40px 90px", minHeight: "70vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, animation: "fadeUp .45s ease both" })}>
        <span style={sx({ width: 52, height: 52, borderRadius: "50%", background: "var(--ink)", color: "var(--paper)", fontFamily: "var(--disp)", fontWeight: 800, fontSize: 22, display: "grid", placeItems: "center" })}>M</span>
        <span style={sx({ width: 20, height: 20, borderRadius: "50%", border: "2px solid var(--line2)", borderTopColor: "var(--ink)", animation: "spin .7s linear infinite" })} />
        <span style={sx({ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink3)" })}>Margo is writing your brief…</span>
      </div>
    );
  }

  return (
    <div style={sx({ maxWidth: 1180, margin: "0 auto", padding: "44px 40px 90px", animation: "fadeUp .45s ease both" })}>
      <div style={sx({ display: "grid", gridTemplateColumns: "auto 1fr", gap: 22, alignItems: "start", marginBottom: 26 })}>
        <div style={sx({ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 74, lineHeight: 0.8, letterSpacing: "-.03em", color: "var(--paper3)" })}>02</div>
        <div>
          <div style={sx({ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ember)" })}>The company brief</div>
          <h1 style={sx({ fontFamily: "var(--disp)", fontWeight: 800, fontSize: "clamp(32px,4.4vw,50px)", lineHeight: 0.98, letterSpacing: "-.03em", margin: "10px 0 6px", maxWidth: "18ch" })}>Everything Margo learned.</h1>
          <p style={sx({ fontSize: 15.5, color: "var(--ink2)", maxWidth: "60ch", margin: 0 })}>Written from your call. Edit any line, check where each fact came from, then approve — this becomes the single source of truth for planning.</p>
        </div>
      </div>

      <div style={sx({ display: "grid", gridTemplateColumns: "1fr 288px", gap: 24, alignItems: "start" })}>
        <div contentEditable suppressContentEditableWarning style={sx({ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: "38px 44px", outline: "none" })}>
          <div style={sx({ display: "flex", alignItems: "center", gap: 8, background: "var(--paper2)", border: "1px solid var(--line)", borderRadius: 9, padding: "9px 13px", marginBottom: 20, fontSize: 12.5, color: "var(--ink2)" })}><span style={sx({ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ember)" })}>✎ LIVE</span>Every line here is editable — click any text to change it, then approve.</div>
          <div style={sx({ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)", display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--line)", paddingBottom: 14 })}><span>{orgName ? `${orgName} — Company Report` : "Company Report"}</span><span>{v.repVersion}</span></div>

          <Sec id="rep-01" n="01" title="Executive summary" chip="Owner + call" />
          <p
            style={sx({ margin: 0, fontSize: 15.5, lineHeight: 1.65, color: "var(--ink)" })}
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => s.saveReportExec(e.currentTarget.textContent ?? "")}
          >{v.repExec}</p>

          <Sec id="rep-02" n="02" title="Company snapshot" chip="Owner" />
          <div style={sx({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" })}>
            {v.repFacts.map((r) => (
              <div key={r.k} style={sx({ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 14px", borderBottom: "1px solid var(--line)" })}><span style={sx({ fontSize: 13, color: "var(--ink3)" })}>{r.k}</span><span style={sx({ fontSize: 13.5, fontWeight: 600, textAlign: "right" })}>{r.v}</span></div>
            ))}
          </div>

          <Sec id="rep-03" n="03" title="Lean Canvas" chip="Owner + AI" />
          <div style={sx({ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 })}>
            {v.canvas.map((c) => (
              <div key={c.label} style={sx({ background: "var(--paper2)", border: "1px solid var(--line)", borderRadius: 10, padding: 13, minHeight: 96 })}>
                <div style={sx({ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 6 })}>{c.label}</div>
                <p style={sx({ margin: 0, fontSize: 12.5, lineHeight: 1.4, color: "var(--ink)" })}>{c.body}</p>
              </div>
            ))}
          </div>

          <Sec id="rep-04" n="04" title="Operations overview" chip="From call" />
          <div style={sx({ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" })}>
            <div style={sx({ display: "grid", gridTemplateColumns: "1.5fr 1.1fr 1.2fr .8fr .8fr", background: "var(--paper2)", fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink3)" })}><span style={sx({ padding: "9px 12px" })}>Process</span><span style={sx({ padding: "9px 12px" })}>Trigger</span><span style={sx({ padding: "9px 12px" })}>Systems</span><span style={sx({ padding: "9px 12px" })}>Volume</span><span style={sx({ padding: "9px 12px" })}>Owner</span></div>
            {v.repProcesses.map((p) => (
              <div key={p.name} style={sx({ display: "grid", gridTemplateColumns: "1.5fr 1.1fr 1.2fr .8fr .8fr", borderTop: "1px solid var(--line)", fontSize: 12.5, alignItems: "center" })}><span style={sx({ padding: "11px 12px", fontWeight: 600 })}>{p.name}</span><span style={sx({ padding: "11px 12px", color: "var(--ink2)" })}>{p.trigger}</span><span style={sx({ padding: "11px 12px", color: "var(--ink2)" })}>{p.systems}</span><span style={sx({ padding: "11px 12px", fontFamily: "var(--mono)", fontSize: 11 })}>{p.freq}</span><span style={sx({ padding: "11px 12px", color: "var(--ink2)" })}>{p.owner}</span></div>
            ))}
          </div>

          <Sec id="rep-05" n="05" title="Systems & data" chip="Owner" />
          <div style={sx({ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" })}>
            {v.repSystems.map((sys) => (
              <div key={sys.name} style={sx({ display: "grid", gridTemplateColumns: "1fr 1.4fr auto", gap: 12, padding: "11px 14px", borderBottom: "1px solid var(--line)", alignItems: "center" })}><span style={sx({ fontWeight: 600, fontSize: 13.5 })}>{sys.name}</span><span style={sx({ fontSize: 13, color: "var(--ink2)" })}>{sys.use}</span><span style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".04em", textTransform: "uppercase", color: sys.color, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" })}><span style={sx({ width: 6, height: 6, borderRadius: "50%", background: sys.color })} />{sys.status}</span></div>
            ))}
          </div>

          <Sec id="rep-06" n="06" title="Pain points" chip="From call" />
          <div style={sx({ display: "flex", flexDirection: "column", gap: 10 })}>
            {v.repPain.map((p) => (
              <div key={p.t} style={sx({ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "start" })}><span style={sx({ width: 7, height: 7, borderRadius: "50%", background: "var(--ember)", marginTop: 7 })} /><div><span style={sx({ fontWeight: 600, fontSize: 14.5 })}>{p.t}</span><p style={sx({ margin: "2px 0 0", fontSize: 13.5, color: "var(--ink2)", lineHeight: 1.45 })}>{p.detail}</p></div></div>
            ))}
          </div>

          <Sec id="rep-07" n="07" title="Automation opportunities" chip="AI-inferred" />
          <p style={sx({ margin: "0 0 12px", fontSize: 13.5, color: "var(--ink2)", lineHeight: 1.5 })}>Candidate use cases only — the workforce isn’t committed until you approve the plan in the next step.</p>
          <div style={sx({ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" })}>
            <div style={sx({ display: "grid", gridTemplateColumns: "1.7fr 1.3fr .7fr .7fr", background: "var(--paper2)", fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink3)" })}><span style={sx({ padding: "9px 12px" })}>Use case</span><span style={sx({ padding: "9px 12px" })}>Trigger</span><span style={sx({ padding: "9px 12px" })}>Volume</span><span style={sx({ padding: "9px 12px" })}>Risk</span></div>
            {v.repUseCases.map((u) => (
              <div key={u.name} style={sx({ display: "grid", gridTemplateColumns: "1.7fr 1.3fr .7fr .7fr", borderTop: "1px solid var(--line)", fontSize: 12.5, alignItems: "center" })}><span style={sx({ padding: "11px 12px", fontWeight: 600 })}>{u.name}</span><span style={sx({ padding: "11px 12px", fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink2)" })}>{u.trigger}</span><span style={sx({ padding: "11px 12px", fontFamily: "var(--mono)", fontSize: 11 })}>{u.freq}</span><span style={sx({ padding: "11px 12px" })}><span style={sx({ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", color: u.rc })}>{u.risk}</span></span></div>
            ))}
          </div>

          <Sec id="rep-08" n="08" title="Constraints & approvals" chip="Owner" />
          <div style={sx({ display: "flex", flexDirection: "column", gap: 9 })}>
            {v.repConstraints.map((c) => (
              <div key={c} style={sx({ display: "flex", gap: 10, fontSize: 14, color: "var(--ink)", alignItems: "baseline" })}><span style={sx({ color: "var(--forest)" })}>◆</span>{c}</div>
            ))}
          </div>

          <Sec id="rep-09" n="09" title="Sources & confidence" chip="Method" />
          <p style={sx({ margin: "0 0 12px", fontSize: 13.5, color: "var(--ink2)", lineHeight: 1.55 })}>Every fact is labelled by where it came from. Margo may suggest a pattern, but never states a volume, cost or permission as fact unless you supplied it.</p>
          <div style={sx({ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, color: "var(--ink2)" })}>
            <span><span style={sx({ width: 7, height: 7, borderRadius: "50%", background: "var(--forest)", display: "inline-block", marginRight: 5 })} />Owner-supplied</span>
            <span><span style={sx({ width: 7, height: 7, borderRadius: "50%", background: "var(--ink2)", display: "inline-block", marginRight: 5 })} />From the call</span>
            <span><span style={sx({ width: 7, height: 7, borderRadius: "50%", background: "var(--ochre)", display: "inline-block", marginRight: 5 })} />AI-inferred — confirm</span>
          </div>

          <Sec id="rep-10" n="10" title="Phase 2 readiness" chip="Status" />
          <div style={sx({ display: "flex", gap: 14, alignItems: "center", background: "var(--paper2)", border: "1px solid var(--forest)", borderRadius: 12, padding: "18px 20px" })}>
            <span style={sx({ width: 34, height: 34, borderRadius: "50%", background: "var(--forest)", color: "var(--paper)", display: "grid", placeItems: "center", fontSize: 17, flex: "none" })}>✓</span>
            <p style={sx({ margin: 0, fontSize: 14, color: "var(--ink)", lineHeight: 1.5 })}>Ready for planning. The blueprint has enough operational detail to extract use cases and match a workforce. Three follow-ups remain, but none block Phase 2.</p>
          </div>
        </div>

        <aside style={sx({ position: "sticky", top: 20, display: "flex", flexDirection: "column", gap: 14 })}>
          <div style={sx({ background: "var(--paper2)", border: "1px solid var(--line)", borderRadius: 14, padding: "16px 18px" })}>
            <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 10 })}>Contents</div>
            {v.repToc.map((t) => (
              <div key={t.n} style={sx({ display: "flex", gap: 9, fontSize: 12.5, color: "var(--ink2)", padding: "4px 0" })}><span style={sx({ fontFamily: "var(--mono)", color: "var(--ink3)" })}>{t.n}</span>{t.label}</div>
            ))}
          </div>
          {v.reportApproved && (
            <div style={sx({ background: "var(--forest)", color: "var(--paper)", borderRadius: 14, padding: 20, textAlign: "center" })}>
              <div style={sx({ fontSize: 26 })}>✓</div><div style={sx({ fontWeight: 600, marginTop: 4 })}>Approved</div><div style={sx({ fontSize: 12.5, opacity: 0.8, marginTop: 2 })}>{v.approvedLabel}</div>
            </div>
          )}
          {v.reportNotApproved && (
            <div style={sx({ background: "var(--card)", border: "1px solid var(--line2)", borderRadius: 14, padding: 18 })}>
              <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)" })}>Sign-off</div>
              <p style={sx({ fontSize: 13, color: "var(--ink2)", lineHeight: 1.45, margin: "8px 0 14px" })}>Approving locks this version as the only input to planning. You can always edit and re-approve.</p>
              <button onClick={s.approveReport} className="hv-bg" style={sx({ width: "100%", background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 999, padding: 13, fontSize: 14, fontWeight: 600, cursor: "pointer", "--hv-bg": "var(--forest)" })}>Approve & send to planning →</button>
              <button onClick={() => window.print()} style={sx({ width: "100%", background: "transparent", border: "1px solid var(--line2)", color: "var(--ink2)", borderRadius: 999, padding: 11, fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 8 })}>Export DOCX / PDF</button>
            </div>
          )}
          <div style={sx({ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: 16 })}>
            <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 10 })}>Change history</div>
            {v.history.map((h) => (
              <div key={h.v} style={sx({ display: "flex", gap: 9, fontSize: 12.5, color: "var(--ink2)", padding: "5px 0" })}><span style={sx({ fontFamily: "var(--mono)", color: "var(--ink3)" })}>{h.v}</span>{h.t}</div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
