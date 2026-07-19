"use client";
/**
 * Validate screen — the sandbox (port of reference/Margo.dc.html:817-853).
 * Checks card · manifest card · guardrail card · activate bar.
 * Extends the design with an honest failed terminal state (blueprint F-12).
 */
import { useEffect } from "react";
import { useApp } from "@/lib/store";
import { validateVals } from "@/lib/vals";
import { sx } from "@/lib/ui";

export default function ValidateScreen() {
  const s = useApp();
  const v = validateVals(s);

  // arriving via the sidebar (not the build-screen CTA) must still start
  // validation when packages are built but unvalidated
  useEffect(() => {
    if (v.onValidate && !v.allValidated && !v.anyFailed && !s.validating) {
      void s.gotoValidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.onValidate]);

  if (!v.onValidate) return null;

  const barBorder = v.anyFailed ? "var(--ember)" : "var(--forest)";

  return (
    <div style={sx({ maxWidth: 1080, margin: "0 auto", padding: "44px 40px 90px", animation: "fadeUp .45s ease both" })}>
      <div style={sx({ display: "grid", gridTemplateColumns: "auto 1fr", gap: 22, alignItems: "start", marginBottom: 26 })}>
        <div style={sx({ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 74, lineHeight: 0.8, letterSpacing: "-.03em", color: "var(--paper3)" })}>06</div>
        <div>
          <div style={sx({ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ember)" })}>The sandbox</div>
          <h1 style={sx({ fontFamily: "var(--disp)", fontWeight: 800, fontSize: "clamp(32px,4.4vw,50px)", lineHeight: 0.98, letterSpacing: "-.03em", margin: "10px 0 6px", maxWidth: "20ch" })}>Proven safe before it’s live.</h1>
          <p style={sx({ fontSize: 15.5, color: "var(--ink2)", maxWidth: "56ch", margin: 0 })}>Every package runs in an isolated Daytona sandbox. Nothing activates until the tests pass and you say go.</p>
        </div>
      </div>

      <div style={sx({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 })}>
        <div style={sx({ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 24 })}>
          <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 })}>
            <span style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 19 })}>{v.firstAgentName}</span>
            {v.allValidated ? (
              <span style={sx({ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--forest)", border: "1px solid var(--forest)", borderRadius: 20, padding: "3px 10px" })}>Validated</span>
            ) : v.anyFailed ? (
              <span style={sx({ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ember)", border: "1px solid var(--ember)", borderRadius: 20, padding: "3px 10px" })}>Failed</span>
            ) : (
              <span style={sx({ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ochre)", border: "1px solid var(--ochre)", borderRadius: 20, padding: "3px 10px" })}>{v.noBuilds ? "Waiting" : "Validating…"}</span>
            )}
          </div>
          {v.validateChecks.map((c: { k: string; v: string; ok: boolean }) => (
            <div key={c.k} style={sx({ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--line)" })}>
              <span style={sx({ fontSize: 14, color: "var(--ink2)" })}>{c.k}</span>
              <span style={sx({ fontFamily: "var(--mono)", fontSize: 12.5, color: c.ok ? "var(--forest)" : "var(--ember)", fontWeight: 700 })}>{c.ok ? "✓" : "✗"} {c.v}</span>
            </div>
          ))}
        </div>
        <div style={sx({ display: "flex", flexDirection: "column", gap: 14 })}>
          <div style={sx({ background: "var(--paper2)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink2)", lineHeight: 1.9 })}>
            <div style={sx({ letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)", fontSize: 10, marginBottom: 8 })}>Manifest</div>
            <div>sandbox_id · <span style={sx({ color: "var(--ink)" })}>{v.sandboxId}</span></div>
            <div>artifact_hash · <span style={sx({ color: "var(--ink)" })}>{v.artifactHash}</span></div>
            <div>tests · <span style={sx({ color: v.anyFailed ? "var(--ember)" : "var(--forest)" })}>{v.testsLabel}</span></div>
            <div>warnings · <span style={sx({ color: "var(--ink)" })}>{v.warningsLabel}</span></div>
            <div style={sx({ display: "flex", alignItems: "center", gap: 8, marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--line)", fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink2)" })}>
              <span style={sx({ width: 6, height: 6, borderRadius: "50%", background: v.daytonaLive ? "var(--forest)" : "var(--ochre)" })} />
              DAYTONA · sandbox validation · {v.validationMode}
            </div>
          </div>
          <div style={sx({ background: "var(--ink)", color: "var(--paper)", borderRadius: 16, padding: 18, fontSize: 13, lineHeight: 1.5 })}>
            <span style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.6 })}>Guardrail</span>
            <div style={{ marginTop: 6 }}>No automatic privilege expansion. The sandbox blocked 0 unrequested tools — every permission matches the approved spec.</div>
          </div>
        </div>
      </div>

      <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 22, background: "var(--card)", border: `1px solid ${barBorder}`, borderRadius: 16, padding: "20px 24px", flexWrap: "wrap", gap: 14 })}>
        <div style={sx({ display: "flex", alignItems: "center", gap: 12 })}>
          {v.allValidated ? (
            <span style={sx({ width: 36, height: 36, borderRadius: "50%", background: "var(--forest)", color: "var(--paper)", display: "grid", placeItems: "center", fontSize: 18 })}>✓</span>
          ) : v.anyFailed ? (
            <span style={sx({ width: 36, height: 36, borderRadius: "50%", background: "var(--ember)", color: "var(--paper)", display: "grid", placeItems: "center", fontSize: 18 })}>✗</span>
          ) : v.noBuilds ? (
            <span style={sx({ width: 36, height: 36, borderRadius: "50%", background: "var(--paper3)", border: "1px solid var(--line2)", color: "var(--ink3)", display: "grid", placeItems: "center", fontSize: 16, flex: "none" })}>◇</span>
          ) : (
            <span style={sx({ width: 36, height: 36, border: "2px solid var(--line2)", borderTopColor: "var(--ink)", borderRadius: "50%", animation: "spin .7s linear infinite", flex: "none" })} />
          )}
          <div>
            <div style={sx({ fontWeight: 600, fontSize: 15 })}>
              {v.allValidated
                ? (v.validationMode === "live" ? "All agents validated in Daytona" : "All agents validated · local checks (fixture)")
                : v.anyFailed
                  ? "Validation failed — see the checks and warnings above"
                  : v.noBuilds
                    ? "Nothing to validate yet"
                    : "Running sandbox validation…"}
            </div>
            <div style={sx({ fontSize: 13, color: "var(--ink2)" })}>
              {v.anyFailed
                ? "Fix the flagged package (or rebuild) and run validation again."
                : v.noBuilds
                  ? "Send the approved plan to the factory first — packages are validated here once built."
                  : "Ready to activate under the approved policy."}
            </div>
          </div>
        </div>
        {v.allValidated ? (
          <button
            onClick={() => { void s.activate(); }}
            className="hv-bg"
            style={sx({ background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 999, padding: "14px 26px", fontSize: 15, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", "--hv-bg": "var(--forest)" })}
          >
            Activate the team →
          </button>
        ) : v.anyFailed ? (
          <button
            onClick={() => { void s.gotoValidate(); }}
            className="hv-bg"
            style={sx({ background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 999, padding: "14px 26px", fontSize: 15, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", "--hv-bg": "var(--ember)" })}
          >
            Re-run validation →
          </button>
        ) : (
          <button style={sx({ background: "var(--paper3)", color: "var(--ink3)", border: "none", borderRadius: 999, padding: "14px 26px", fontSize: 15, fontWeight: 600, cursor: "default", whiteSpace: "nowrap" })}>
            Activate the team →
          </button>
        )}
      </div>
    </div>
  );
}
