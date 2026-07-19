"use client";
/**
 * Call screen — the voice kickoff call with Margo.
 * Port of reference/Margo.dc.html:273-369 (CALL section).
 */
import { useApp } from "@/lib/store";
import { callVals } from "@/lib/vals";
import { sx } from "@/lib/ui";

export default function CallScreen() {
  const s = useApp();
  const v = callVals(s);

  if (!v.onCall) return null;

  const briefBusy = v.generating;
  const briefFailed = !v.generating && !v.reportReady;
  const micColor = v.recording ? "var(--ember)" : "var(--paper)";
  const draftEmpty = v.reviewDraft.trim().length === 0;
  const showMic = v.composeVoice || v.recording || v.transcribing;

  return (
    <div style={sx({ height: "100%", display: "flex", minHeight: 0 })}>
      {/* VOICE STAGE */}
      <div style={sx({ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 30px", position: "relative", overflow: "hidden" })}>
        <div style={sx({ position: "absolute", top: 20, left: 24, fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".14em", color: "var(--ink3)" })}>{v.callTopic}</div>
        <button
          onClick={s.callToggleTx}
          className="hv-bd"
          style={sx({ position: "absolute", top: 16, right: 20, background: "transparent", border: "1px solid var(--line2)", borderRadius: 999, padding: "6px 13px", fontSize: 12, color: "var(--ink2)", cursor: "pointer", "--hv-bd": "var(--ink)" })}
        >
          Transcript
        </button>

        {v.callDone && (
          <div style={sx({ textAlign: "center", animation: "fadeUp .5s ease both" })}>
            <span style={sx({ width: 60, height: 60, borderRadius: "50%", background: "var(--forest)", color: "var(--paper)", display: "inline-grid", placeItems: "center", fontSize: 28 })}>✓</span>
            <h1 style={sx({ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 40, letterSpacing: "-.03em", margin: "18px 0 6px" })}>Great call.</h1>
            <p style={sx({ fontSize: 16, color: "var(--ink2)", maxWidth: "40ch", margin: "0 auto 22px" })}>I’m writing everything up into your company brief — you’ll get to edit and approve it.</p>
            {briefBusy ? (
              <button style={sx({ display: "inline-flex", alignItems: "center", gap: 10, background: "var(--paper3)", color: "var(--ink3)", border: "none", borderRadius: 999, padding: "15px 28px", fontSize: 15, fontWeight: 600, cursor: "default" })}>
                <span style={sx({ width: 14, height: 14, border: "2px solid var(--ink3)", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" })} />
                Writing the brief…
              </button>
            ) : (
              <button
                onClick={() => { void s.callToReport(); }}
                className="hv-bg"
                style={sx({ background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 999, padding: "15px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer", "--hv-bg": briefFailed ? "var(--forest)" : "var(--ember)" })}
              >
                {briefFailed ? "Try writing the brief again →" : "Read the brief →"}
              </button>
            )}
          </div>
        )}

        {v.callPaused && (
          <div style={sx({ textAlign: "center", animation: "fadeUp .4s ease both" })}>
            <span style={sx({ width: 80, height: 80, borderRadius: "50%", background: "var(--paper2)", border: "1px solid var(--line2)", display: "inline-grid", placeItems: "center", fontSize: 30, color: "var(--ink3)" })}>⏸</span>
            <h2 style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 26, margin: "16px 0 4px" })}>Call paused</h2>
            <p style={sx({ fontSize: 14.5, color: "var(--ink2)", margin: "0 0 20px" })}>Everything’s saved. Pick up right where you left off.</p>
            <button
              onClick={s.resumeCall}
              className="hv-bg"
              style={sx({ background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 999, padding: "14px 26px", fontSize: 15, fontWeight: 600, cursor: "pointer", "--hv-bg": "var(--forest)" })}
            >
              Resume call →
            </button>
          </div>
        )}

        {v.callActive && (
          <div style={sx({ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: 520 })}>
            <div style={sx({ position: "relative", width: 196, height: 196, display: "grid", placeItems: "center", marginBottom: 2 })}>
              <div style={sx({ position: "absolute", inset: 0, borderRadius: "50%", background: "radial-gradient(circle,var(--paper2) 0%,var(--paper) 70%)", border: "1px solid var(--line)" })} />
              <div style={sx({ position: "absolute", inset: 20, borderRadius: "50%", border: "1px solid var(--line)" })} />
              <div style={sx({ position: "relative", display: "flex", alignItems: "center", gap: 3, height: 82 })}>
                {v.waveBars.map((bar, i) => (
                  <span key={i} style={sx({ width: 3, height: bar.h, background: "var(--ink)", borderRadius: 3, transformOrigin: "center", animation: "wave 1s ease-in-out infinite", animationDelay: bar.delay })} />
                ))}
              </div>
            </div>
            <div style={sx({ fontFamily: "var(--mono)", letterSpacing: ".04em", color: "var(--ink)", marginTop: 0, fontSize: 28 })}>{v.callTimer}</div>
            <div style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 20, marginTop: 7, color: "var(--ink)" })}>{v.callStatusBig}</div>
            <div style={sx({ fontSize: 13.5, color: "var(--ink3)", marginTop: 3 })}>{v.callStatusSub}</div>

            <div style={sx({ minHeight: 48, marginTop: 14, display: "flex", justifyContent: "center", width: "100%" })}>
              {showMic && (
                <div style={sx({ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 })}>
                  <button
                    onClick={() => { void s.callAnswerVoice(); }}
                    className="hv-bg"
                    style={sx({ display: "flex", alignItems: "center", gap: 11, background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 999, padding: "13px 26px", fontSize: 15, fontWeight: 600, cursor: "pointer", "--hv-bg": "var(--forest)" })}
                  >
                    {v.transcribing ? (
                      <span style={sx({ width: 15, height: 15, border: "2px solid var(--paper)", borderTopColor: "transparent", borderRadius: "50%", display: "block", animation: "spin .7s linear infinite" })} />
                    ) : (
                      <span style={sx({ width: 13, height: 19, border: `2px solid ${micColor}`, borderRadius: 8, position: "relative", display: "block" })}>
                        <span style={sx({ position: "absolute", left: "50%", bottom: -7, transform: "translateX(-50%)", width: 9, height: 5, border: `2px solid ${micColor}`, borderTop: "none", borderRadius: "0 0 7px 7px" })} />
                      </span>
                    )}
                    {v.recording ? "Stop" : v.transcribing ? "Transcribing…" : "Tap to answer"}
                  </button>
                  {!v.recording && !v.transcribing && (
                    <span
                      onClick={s.callTypeInstead}
                      className="hv-fg"
                      style={sx({ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink3)", cursor: "pointer", "--hv-fg": "var(--ink)" })}
                    >
                      ⌨ type instead
                    </span>
                  )}
                </div>
              )}
              {v.composeOptions && (
                <div style={sx({ display: "flex", flexWrap: "wrap", gap: 9, justifyContent: "center" })}>
                  {v.optionList.map((op) => (
                    <button
                      key={op.label}
                      onClick={op.pick}
                      className="hv-bd hv-bg"
                      style={sx({ background: "var(--card)", border: "1px solid var(--line2)", borderRadius: 999, padding: "11px 19px", fontSize: 14, fontWeight: 500, color: "var(--ink)", cursor: "pointer", "--hv-bd": "var(--ink)", "--hv-bg": "var(--paper2)" })}
                    >
                      {op.label}
                    </button>
                  ))}
                </div>
              )}
              {v.composeGoals && (
                <div style={sx({ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", alignItems: "center", maxWidth: 480 })}>
                  {v.obGoals.map((g) => (
                    <span key={g.label} onClick={g.toggle} style={sx({ cursor: "pointer", fontSize: 13, padding: "8px 14px", borderRadius: 999, border: `1px solid ${g.bd}`, background: g.bg, color: g.fg, userSelect: "none" })}>{g.label}</span>
                  ))}
                  <button
                    onClick={s.callNext}
                    className="hv-bg"
                    style={sx({ background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 999, padding: "9px 18px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", "--hv-bg": "var(--forest)" })}
                  >
                    Send →
                  </button>
                </div>
              )}
              {v.composeSystems && (
                <div style={sx({ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", alignItems: "center", maxWidth: 480 })}>
                  {v.obSystems.map((sy) => (
                    <span key={sy.label} onClick={sy.toggle} style={sx({ cursor: "pointer", fontSize: 13, padding: "8px 13px", borderRadius: 9, border: `1px solid ${sy.bd}`, background: sy.bg, color: sy.fg, display: "flex", alignItems: "center", gap: 6, userSelect: "none" })}>
                      <span style={sx({ width: 6, height: 6, borderRadius: "50%", background: sy.dot })} />
                      {sy.label}
                    </span>
                  ))}
                  <button
                    onClick={s.callNext}
                    className="hv-bg"
                    style={sx({ background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 999, padding: "9px 18px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", "--hv-bg": "var(--forest)" })}
                  >
                    Send →
                  </button>
                </div>
              )}
              {v.composeIntro && (
                <div style={sx({ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" })}>
                  <button
                    onClick={s.callUpload}
                    className="hv-bd hv-bs"
                    style={sx({ background: "var(--card)", border: "1px dashed var(--line2)", borderRadius: 999, padding: "12px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "var(--ink)", "--hv-bd": "var(--ink)", "--hv-bs": "solid" })}
                  >
                    ⬆ Upload my canvas
                  </button>
                  <button
                    onClick={s.callBuild}
                    className="hv-bg"
                    style={sx({ background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 999, padding: "12px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer", "--hv-bg": "var(--forest)" })}
                  >
                    Build it together →
                  </button>
                </div>
              )}
              {v.composeReview && (
                <div style={sx({ background: "var(--card)", border: "1px solid var(--line2)", borderRadius: 14, padding: "12px 14px", width: "100%", maxWidth: 480 })}>
                  <textarea
                    value={v.reviewDraft}
                    onChange={(e) => s.callSetDraft(e.target.value)}
                    placeholder={v.reviewPh}
                    rows={2}
                    style={sx({ width: "100%", background: "transparent", border: "none", outline: "none", resize: "none", fontFamily: "var(--sans)", fontSize: 14, lineHeight: 1.5, color: "var(--ink)" })}
                  />
                  <div style={sx({ display: "flex", justifyContent: "flex-end", marginTop: 8 })}>
                    <button
                      onClick={draftEmpty ? undefined : s.callConfirmDraft}
                      className={draftEmpty ? undefined : "hv-bg"}
                      style={sx(
                        draftEmpty
                          ? { background: "var(--paper3)", color: "var(--ink3)", border: "none", borderRadius: 999, padding: "9px 18px", fontSize: 13.5, fontWeight: 600, cursor: "default" }
                          : { background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 999, padding: "9px 18px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", "--hv-bg": "var(--forest)" },
                      )}
                    >
                      Send →
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={sx({ display: "flex", alignItems: "center", gap: 24, marginTop: 14 })}>
              <div style={sx({ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 })}>
                <button
                  onClick={s.callMute}
                  className="hv-bd"
                  style={sx({ width: 50, height: 50, borderRadius: "50%", border: "1px solid var(--line2)", background: "var(--card)", cursor: "pointer", display: "grid", placeItems: "center", "--hv-bd": "var(--ink)" })}
                >
                  <span style={sx({ width: 12, height: 17, border: "2px solid var(--ink)", borderRadius: 7, display: "block" })} />
                </button>
                <span style={sx({ fontSize: 11, color: "var(--ink3)" })}>{v.muteLabel}</span>
              </div>
              <div style={sx({ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 })}>
                <button
                  onClick={s.endCall}
                  className="hv-fil"
                  style={sx({ width: 56, height: 56, borderRadius: "50%", border: "none", background: "var(--ember)", cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "0 6px 18px rgba(184,68,42,.35)", "--hv-fil": "brightness(1.06)" })}
                >
                  <span style={sx({ width: 22, height: 22, border: "3px solid var(--paper)", borderRadius: 6, display: "block", transform: "rotate(135deg)" })} />
                </button>
                <span style={sx({ fontSize: 11, color: "var(--ink3)" })}>End call</span>
              </div>
              <div style={sx({ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 })}>
                <button
                  onClick={s.callToggleTx}
                  className="hv-bd"
                  style={sx({ width: 50, height: 50, borderRadius: "50%", border: "1px solid var(--line2)", background: "var(--card)", cursor: "pointer", display: "grid", placeItems: "center", "--hv-bd": "var(--ink)" })}
                >
                  <span style={sx({ width: 16, height: 14, display: "flex", flexDirection: "column", gap: 3, justifyContent: "center" })}>
                    <span style={sx({ height: 2, background: "var(--ink)", borderRadius: 2 })} />
                    <span style={sx({ height: 2, width: "70%", background: "var(--ink)", borderRadius: 2 })} />
                    <span style={sx({ height: 2, background: "var(--ink)", borderRadius: 2 })} />
                  </span>
                </button>
                <span style={sx({ fontSize: 11, color: "var(--ink3)" })}>Transcript</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* TRANSCRIPT PANEL */}
      {v.callTxOpen && (
        <div style={sx({ width: 334, flex: "none", borderLeft: "1px solid var(--line)", background: "var(--paper2)", display: "flex", flexDirection: "column", minHeight: 0 })}>
          <div style={sx({ display: "flex", gap: 4, padding: "14px 16px 0" })}>
            <button
              onClick={() => s.callTxTabSet("transcript")}
              style={sx({ flex: 1, background: "transparent", border: "none", borderBottom: `2px solid ${v.txIsTranscript ? "var(--ink)" : "var(--line)"}`, padding: "8px 0", fontSize: 13, fontWeight: 600, color: v.txIsTranscript ? "var(--ink)" : "var(--ink3)", cursor: "pointer", fontFamily: "var(--sans)" })}
            >
              Transcript
            </button>
            <button
              onClick={() => s.callTxTabSet("notes")}
              style={sx({ flex: 1, background: "transparent", border: "none", borderBottom: `2px solid ${v.txIsNotes ? "var(--ink)" : "var(--line)"}`, padding: "8px 0", fontSize: 13, fontWeight: 600, color: v.txIsNotes ? "var(--ink)" : "var(--ink3)", cursor: "pointer", fontFamily: "var(--sans)" })}
            >
              Notes
            </button>
          </div>
          <div style={sx({ flex: 1, overflowY: "auto", padding: "10px 16px", minHeight: 0 })}>
            {v.txIsTranscript &&
              v.callTx.map((e, i) => (
                <div key={i} style={sx({ padding: "10px 0", borderBottom: "1px solid var(--line)" })}>
                  <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 })}>
                    <span style={sx({ fontSize: 12, fontWeight: 700, color: e.whoColor })}>{e.who}</span>
                    <span style={sx({ fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink3)" })}>{e.time}</span>
                  </div>
                  <div style={sx({ fontSize: 13, lineHeight: 1.5, color: "var(--ink2)" })}>{e.text}</div>
                </div>
              ))}
            {v.txIsNotes &&
              v.callNotes.map((n, i) => (
                <div key={i} style={sx({ display: "flex", gap: 9, padding: "8px 0", fontSize: 13, lineHeight: 1.5, color: "var(--ink2)" })}>
                  <span style={sx({ color: "var(--ember)" })}>✎</span>
                  {n}
                </div>
              ))}
          </div>
          <div style={sx({ borderTop: "1px solid var(--line)", padding: "11px 16px", fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".06em", color: "var(--ink3)" })}>
            {v.voiceLive ? "Powered by Nosana · Whisper transcription" : "Powered by Margo · demo transcription"}
          </div>
        </div>
      )}
    </div>
  );
}
