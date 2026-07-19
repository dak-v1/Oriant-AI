"use client";
/**
 * Planner — "Build the team" (port of reference/Margo.dc.html:532-698).
 * Header with version chip + undo, NL reconfigure bar + diff banner, agent
 * library (draggable), tabs (Workflow / The team / Use cases), config view,
 * sticky pricing footer with confirm gating.
 */
import { useApp } from "@/lib/store";
import { plannerVals } from "@/lib/vals";
import { sx } from "@/lib/ui";

export default function PlannerScreen() {
  const s = useApp();
  const v = plannerVals(s);
  if (!v.onPlanner) return null;

  return (
    <div style={sx({ maxWidth: 1180, margin: "0 auto", padding: "28px 30px 0", animation: "fadeUp .45s ease both" })}>
      <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 })}>
        <div style={sx({ display: "grid", gridTemplateColumns: "auto 1fr", gap: 18, alignItems: "start" })}>
          <div style={sx({ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 58, lineHeight: 0.8, letterSpacing: "-.03em", color: "var(--paper3)" })}>03</div>
          <div>
            <div style={sx({ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ember)" })}>Build the team</div>
            <h1 style={sx({ fontFamily: "var(--disp)", fontWeight: 800, fontSize: "clamp(28px,3.6vw,42px)", lineHeight: 0.98, letterSpacing: "-.03em", margin: "8px 0 4px", maxWidth: "20ch" })}>Margo drafted your crew.</h1>
            <p style={sx({ fontSize: 14.5, color: "var(--ink2)", maxWidth: "60ch", margin: 0 })}>See the workflow, drag agents in from the library, set each one up, or tell Margo what to change. Nothing builds until every agent is ready.</p>
          </div>
        </div>
        <div style={sx({ display: "flex", alignItems: "center", gap: 10 })}>
          <span style={sx({ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".06em", color: "var(--ink3)", border: "1px solid var(--line2)", borderRadius: 20, padding: "6px 12px" })}>Plan {v.plVer}</span>
          {v.plStale && (
            <span style={sx({ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".06em", border: "1px solid var(--ochre)", color: "var(--ochre)", borderRadius: 20, padding: "6px 12px" })}>Brief changed — replan</span>
          )}
          {v.plCanUndo && (
            <button onClick={s.plUndo} style={sx({ background: "transparent", border: "1px solid var(--line2)", borderRadius: 20, padding: "6px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", color: "var(--ink2)" })}>↺ Undo</button>
          )}
        </div>
      </div>

      <div style={sx({ display: "flex", gap: 8, marginTop: 20 })}>
        <div style={sx({ flex: 1, display: "flex", gap: 8, background: "var(--card)", border: "1px solid var(--line2)", borderRadius: 999, padding: "6px 6px 6px 16px", alignItems: "center" })}>
          <span style={sx({ width: 22, height: 22, borderRadius: "50%", background: "var(--ink)", color: "var(--paper)", fontFamily: "var(--disp)", fontWeight: 700, fontSize: 11, display: "grid", placeItems: "center", flex: "none" })}>M</span>
          <input
            value={v.plNl}
            onChange={(e) => s.plSetNl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void s.plPreview(); }}
            placeholder="Tell Margo a change — e.g. “add invoicing” or “require approval before refunds”"
            style={sx({ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 14, color: "var(--ink)" })}
          />
          <button
            onClick={s.plPreview}
            className="hv-bg"
            style={sx({ background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 999, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", "--hv-bg": "var(--ember)" })}
          >
            {v.plNlBusy && (
              <span style={sx({ display: "inline-block", width: 11, height: 11, border: "2px solid rgba(244,238,227,.4)", borderTopColor: "var(--paper)", borderRadius: "50%", animation: "spin .7s linear infinite", verticalAlign: -1, marginRight: 8 })} />
            )}
            Preview change
          </button>
        </div>
      </div>
      {v.plHasDiff && v.plDiff && (
        <div style={sx({ marginTop: 12, background: "var(--paper2)", border: "1px solid var(--ink)", borderRadius: 14, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", animation: "revUp .3s ease both" })}>
          <div>
            <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 4 })}>Proposed change · review before applying</div>
            <div style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 18 })}>{v.plDiff.title}</div>
            <div style={sx({ display: "flex", gap: 16, marginTop: 6, fontSize: 13, color: "var(--ink2)" })}><span style={sx({ fontFamily: "var(--mono)", fontSize: 12 })}>{v.plDiff.price}</span><span>· {v.plDiff.risk}</span></div>
          </div>
          <div style={sx({ display: "flex", gap: 9 })}>
            <button onClick={s.plDiscardDiff} style={sx({ background: "transparent", border: "1px solid var(--line2)", borderRadius: 999, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--ink2)" })}>Discard</button>
            <button onClick={s.plApplyDiff} className="hv-bg" style={sx({ background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 999, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", "--hv-bg": "var(--forest)" })}>Apply →</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 8 })}>Agent library · drag one into the team, or click to add</div>
        <div style={sx({ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "stretch" })}>
          {v.plLibrary.map((l) => (
            <div
              key={l.id}
              draggable
              onDragStart={(e) => {
                try { e.dataTransfer.setData("text/plain", l.id); } catch { /* noop */ }
                l.dragStart();
              }}
              onClick={l.add}
              className="hv-bd hv-bs"
              style={sx({ width: 150, background: "var(--card)", border: "1px dashed var(--line2)", borderRadius: 11, padding: "11px 12px", cursor: "grab", "--hv-bd": "var(--ink)", "--hv-bs": "solid" })}
            >
              <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "center" })}><span style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 14.5 })}>{l.name}</span><span style={sx({ fontSize: 15, color: "var(--ink3)" })}>＋</span></div>
              <div style={sx({ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ember)", marginTop: 2 })}>{l.role}</div>
              <div style={sx({ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink3)", marginTop: 5 })}>{l.priceLabel}</div>
            </div>
          ))}
          <div
            onClick={s.addCustom}
            className="hv-bg"
            style={sx({ width: 164, background: "var(--ink)", color: "var(--paper)", borderRadius: 11, padding: "11px 12px", cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "center", "--hv-bg": "var(--ember)" })}
          >
            <div style={sx({ fontSize: 18, lineHeight: 1 })}>＋</div>
            <div style={sx({ fontSize: 13, fontWeight: 600, marginTop: 3 })}>Create custom agent</div>
            <div style={sx({ fontSize: 10.5, opacity: 0.7 })}>Draggable · renamable</div>
          </div>
        </div>
      </div>

      <div style={sx({ display: "flex", gap: 6, margin: "18px 0 14px", background: "var(--paper2)", border: "1px solid var(--line)", borderRadius: 999, padding: 4, width: "fit-content" })}>
        <span onClick={() => s.plTab("workflow")} style={sx({ cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "8px 18px", borderRadius: 999, background: v.plTabFlowBg, color: v.plTabFlowFg })}>Workflow</span>
        <span onClick={() => s.plTab("team")} style={sx({ cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "8px 18px", borderRadius: 999, background: v.plTabTeamBg, color: v.plTabTeamFg })}>The team</span>
        <span onClick={() => s.plTab("usecases")} style={sx({ cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "8px 18px", borderRadius: 999, background: v.plTabUseBg, color: v.plTabUseFg })}>Use cases</span>
      </div>

      <div style={{ paddingBottom: 96 }}>
        {v.plViewConfig && (
          <div style={sx({ background: "var(--card)", border: "1px solid var(--line2)", borderRadius: 16, padding: "22px 24px" })}>
            <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, borderBottom: "1px solid var(--line)", paddingBottom: 14, marginBottom: 18 })}>
              <div>
                <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--ember)" })}>Configure for execution</div>
                <div style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 22 })}>{v.cfgName}</div>
              </div>
              <button onClick={s.plConfigBack} style={sx({ background: "transparent", border: "1px solid var(--line2)", borderRadius: 999, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--ink2)" })}>← Back to plan</button>
            </div>
            <div style={sx({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 })}>
              <div>
                <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 8 })}>Operating mode</div>
                <div style={sx({ display: "flex", flexDirection: "column", gap: 7 })}>
                  <div onClick={() => s.plCfgSet("mode", "draft")} style={sx({ border: `1px solid ${v.cfgModeDraftBd}`, borderRadius: 9, padding: "10px 12px", cursor: "pointer", fontSize: 13 })}><b>Draft only</b> — prepares, never sends</div>
                  <div onClick={() => s.plCfgSet("mode", "routine")} style={sx({ border: `1px solid ${v.cfgModeRoutineBd}`, borderRadius: 9, padding: "10px 12px", cursor: "pointer", fontSize: 13 })}><b>Auto for routine</b> — sends the safe ones</div>
                  <div onClick={() => s.plCfgSet("mode", "approval")} style={sx({ border: `1px solid ${v.cfgModeApprovalBd}`, borderRadius: 9, padding: "10px 12px", cursor: "pointer", fontSize: 13 })}><b>Approval for all</b> — you sign every action</div>
                </div>
                <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--ink3)", margin: "16px 0 8px" })}>Triggers & channels</div>
                <div style={sx({ display: "flex", flexWrap: "wrap", gap: 6 })}>
                  {v.cfgChannels.map((c) => (
                    <span key={c.label} onClick={c.toggle} style={sx({ cursor: "pointer", fontSize: 12.5, padding: "7px 12px", borderRadius: 20, userSelect: "none", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg })}>{c.label}</span>
                  ))}
                </div>
                <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--ink3)", margin: "16px 0 8px" })}>Knowledge sources</div>
                <div style={sx({ display: "flex", flexWrap: "wrap", gap: 6 })}>
                  {v.cfgKnowledge.map((c) => (
                    <span key={c.label} onClick={c.toggle} style={sx({ cursor: "pointer", fontSize: 12.5, padding: "7px 12px", borderRadius: 20, userSelect: "none", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg })}>{c.label}</span>
                  ))}
                </div>
              </div>
              <div>
                <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 8 })}>Always needs your approval</div>
                <div style={sx({ display: "flex", flexWrap: "wrap", gap: 6 })}>
                  {v.cfgApprovals.map((c) => (
                    <span key={c.label} onClick={c.toggle} style={sx({ cursor: "pointer", fontSize: 12.5, padding: "7px 12px", borderRadius: 20, userSelect: "none", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg })}>{c.label}</span>
                  ))}
                </div>
                <div style={sx({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16 })}>
                  <div>
                    <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 7 })}>Response target</div>
                    <div style={sx({ display: "flex", flexWrap: "wrap", gap: 6 })}>
                      {v.cfgTarget.map((c) => (
                        <span key={c.label} onClick={c.set} style={sx({ cursor: "pointer", fontSize: 12.5, padding: "7px 12px", borderRadius: 20, userSelect: "none", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg })}>{c.label}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 7 })}>Working hours</div>
                    <div style={sx({ display: "flex", flexWrap: "wrap", gap: 6 })}>
                      {v.cfgHours.map((c) => (
                        <span key={c.label} onClick={c.set} style={sx({ cursor: "pointer", fontSize: 12.5, padding: "7px 12px", borderRadius: 20, userSelect: "none", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg })}>{c.label}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 7 })}>Escalation owner</div>
                    <div style={sx({ display: "flex", flexWrap: "wrap", gap: 6 })}>
                      {v.cfgEsc.map((c) => (
                        <span key={c.label} onClick={c.set} style={sx({ cursor: "pointer", fontSize: 12.5, padding: "7px 12px", borderRadius: 20, userSelect: "none", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg })}>{c.label}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 7 })}>Retry policy</div>
                    <div style={sx({ display: "flex", flexWrap: "wrap", gap: 6 })}>
                      {v.cfgRetry.map((c) => (
                        <span key={c.label} onClick={c.set} style={sx({ cursor: "pointer", fontSize: 12.5, padding: "7px 12px", borderRadius: 20, userSelect: "none", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg })}>{c.label}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div style={sx({ marginTop: 20, borderTop: "1px solid var(--line)", paddingTop: 16 })}>
              <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 9 })}>Admin setup · credentials this agent needs (referenced by name, never stored in the open)</div>
              <div style={sx({ display: "flex", flexDirection: "column", gap: 7 })}>
                {v.cfgCreds.map((c, i) => (
                  <div key={c.ref + i} style={sx({ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--paper2)", border: "1px solid var(--line)", borderRadius: 9, padding: "9px 13px" })}>
                    <div style={sx({ display: "flex", alignItems: "center", gap: 10 })}><span style={sx({ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink)" })}>{c.ref}</span><span style={sx({ fontSize: 12, color: "var(--ink3)" })}>for {c.system}</span></div>
                    <span style={sx({ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".04em", textTransform: "uppercase", color: c.color, display: "flex", alignItems: "center", gap: 6 })}><span style={sx({ width: 6, height: 6, borderRadius: "50%", background: c.color })} />{c.status}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={sx({ display: "flex", justifyContent: "flex-end", marginTop: 20 })}>
              <button onClick={s.plConfigSave} className="hv-bg" style={sx({ background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 999, padding: "13px 26px", fontSize: 14.5, fontWeight: 600, cursor: "pointer", "--hv-bg": "var(--forest)" })}>Save & mark ready →</button>
            </div>
          </div>
        )}

        {v.plViewPlan && (
          <>
            {v.plTabFlow && (
              <div style={sx({ background: "var(--paper2)", border: "1px solid var(--line)", borderRadius: 16, padding: "26px 24px" })}>
                <div style={sx({ display: "flex", flexDirection: "column", alignItems: "center" })}>
                  <div style={sx({ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "var(--card)", border: "1px dashed var(--line2)", borderRadius: 999, fontSize: 13 })}><span style={sx({ fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink3)" })}>TRIGGER</span>Customer & stock events come in</div>
                  <div style={sx({ width: 2, height: 20, background: "var(--line2)" })} />
                  <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 12 })}>Agents run in parallel</div>
                  <div style={sx({ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", width: "100%" })}>
                    {v.plNodes.map((n, i) => (
                      <div
                        key={n.name + i}
                        onClick={n.open}
                        className="hv-op"
                        style={sx({ flex: 1, minWidth: 150, maxWidth: 210, background: "var(--ink)", color: "var(--paper)", borderRadius: 12, padding: "14px 15px", cursor: "pointer", "--hv-op": ".92" })}
                      >
                        <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "center" })}><span style={sx({ width: 7, height: 7, borderRadius: "50%", background: n.dot })} /><span style={sx({ fontFamily: "var(--mono)", fontSize: 9, opacity: 0.6, textTransform: "uppercase" })}>{n.role}</span></div>
                        <div style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 16, marginTop: 8 })}>{n.name}</div>
                        <div style={sx({ fontFamily: "var(--mono)", fontSize: 9.5, opacity: 0.7, marginTop: 6 })}>◇ {n.gate}</div>
                      </div>
                    ))}
                  </div>
                  <div style={sx({ width: 2, height: 20, background: "var(--line2)" })} />
                  <div style={sx({ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "var(--card)", border: "1px solid var(--forest)", borderRadius: 999, fontSize: 13 })}><span style={sx({ fontFamily: "var(--mono)", fontSize: 10, color: "var(--forest)" })}>YOU</span>Approvals & sign-off</div>
                </div>
              </div>
            )}

            {v.plTabTeam && (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); void s.dropOnList(); }}
                style={sx({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 })}
              >
                {v.plTeamCards.map((a) => (
                  <div
                    key={a.id}
                    draggable
                    onDragStart={(e) => {
                      try { e.dataTransfer.setData("text/plain", a.id); } catch { /* noop */ }
                      a.dragStart();
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); void a.drop(); }}
                    style={sx({ background: "var(--card)", border: `1px solid ${a.cardBd}`, borderRadius: 14, padding: "15px 16px", cursor: "grab", transition: "border-color .2s" })}
                  >
                    <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 })}>
                      <div style={sx({ display: "flex", gap: 9, alignItems: "baseline", flex: 1, minWidth: 0 })}>
                        <span style={sx({ width: 8, height: 8, borderRadius: "50%", background: a.statusColor, marginTop: 6, flex: "none" })} />
                        <div style={sx({ flex: 1, minWidth: 0 })}>
                          {a.isCustom && (
                            /* uncontrolled: the DOM keeps the typed text while
                               debounced commits round-trip the server */
                            <input
                              key={a.id}
                              defaultValue={a.name}
                              onChange={(e) => a.rename(e.target.value)}
                              onBlur={(e) => a.rename(e.target.value)}
                              style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 17, letterSpacing: "-.01em", border: "none", borderBottom: "1px dashed var(--line2)", background: "transparent", outline: "none", width: "100%", color: "var(--ink)", padding: "0 0 2px" })}
                            />
                          )}
                          {a.notCustom && (
                            <h3 style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 17, letterSpacing: "-.01em", margin: 0 })}>{a.name}</h3>
                          )}
                          <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".05em", textTransform: "uppercase", color: a.statusColor, marginTop: 3 })}>{a.role} · {a.statusLabel}</div>
                        </div>
                      </div>
                      <span style={sx({ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--ink2)", whiteSpace: "nowrap" })}>{a.priceLabel}</span>
                    </div>
                    <p style={sx({ margin: "9px 0 9px 17px", fontSize: 13, color: "var(--ink2)", lineHeight: 1.4 })}>{a.desc}</p>
                    <div style={sx({ marginLeft: 17, fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink3)", marginBottom: 11 })}>⚙ {a.integLabel} · ◇ {a.approval}</div>
                    <div style={sx({ display: "flex", gap: 8, marginLeft: 17 })}>
                      {a.hasAction && (
                        <button onClick={a.resolve} className="hv-bg" style={sx({ background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 999, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", "--hv-bg": "var(--ember)" })}>{a.actionLabel}</button>
                      )}
                      <button onClick={a.remove} style={sx({ background: "transparent", color: "var(--ink2)", border: "1px solid var(--line2)", borderRadius: 999, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" })}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {v.plTabUse && (
              <div style={sx({ border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden" })}>
                <div style={sx({ background: "var(--paper2)", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)" })}><span style={sx({ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink3)" })}>Use-case coverage · Tier 1 + Tier 2</span><span style={sx({ fontFamily: "var(--mono)", fontSize: 12, color: "var(--forest)" })}>{v.plCovered} / {v.plUseTotal} covered</span></div>
                {v.plCover.map((u) => (
                  <div key={u.name} style={sx({ display: "grid", gridTemplateColumns: "1.6fr 1fr auto", gap: 12, padding: "13px 16px", borderBottom: "1px solid var(--line)", alignItems: "center" })}>
                    <div>
                      <div style={sx({ fontWeight: 600, fontSize: 14 })}>{u.name}</div>
                      <div style={sx({ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink3)", marginTop: 2 })}>{u.trigger} · {u.freq}</div>
                    </div>
                    <div style={sx({ fontSize: 13, color: "var(--ink2)" })}>{u.agent}</div>
                    <span style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".05em", textTransform: "uppercase", color: u.covColor, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" })}><span style={sx({ width: 6, height: 6, borderRadius: "50%", background: u.covColor })} />{u.covLabel}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div style={sx({ position: "sticky", bottom: 0, background: "rgba(244,238,227,.94)", backdropFilter: "blur(10px)", borderTop: "1px solid var(--line2)", padding: "13px 0", marginTop: 6, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" })}>
        <div><span style={sx({ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 26, letterSpacing: "-.02em" })}>{v.plTotal}</span><span style={sx({ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink3)" })}> /mo · {v.plLow}–{v.plHigh} range · {v.plPlannedCount} agents</span></div>
        <div style={{ flex: 1 }} />
        {v.plCantConfirm && (
          <>
            <span style={sx({ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--ochre)" })}>{v.plBlockerCount} agent(s) to set up first</span>
            <div style={sx({ background: "var(--paper3)", color: "var(--ink3)", borderRadius: 999, padding: "12px 24px", fontSize: 14, fontWeight: 600 })}>Confirm workflow →</div>
          </>
        )}
        {v.plCanConfirm && (
          <>
            <span style={sx({ fontSize: 13, color: "var(--forest)", display: "flex", alignItems: "center", gap: 7 })}><span style={sx({ width: 16, height: 16, borderRadius: "50%", background: "var(--forest)", color: "var(--paper)", display: "grid", placeItems: "center", fontSize: 10 })}>✓</span>All ready</span>
            <button onClick={s.confirmWorkflow} className="hv-bg" style={sx({ background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 999, padding: "12px 26px", fontSize: 14.5, fontWeight: 600, cursor: "pointer", "--hv-bg": "var(--forest)" })}>Confirm workflow →</button>
          </>
        )}
      </div>
    </div>
  );
}
