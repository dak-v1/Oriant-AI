"use client";
/**
 * Landing: marketing page.
 * Port of the design's landing section (reference/Margo.dc.html:48-225),
 * data arrays copied from the prototype vals (reference lines 1455-1488).
 */
import { useApp } from "@/lib/store";
import { sx } from "@/lib/ui";

const heroStats = [
  { big: "20 min", label: "To a drafted team" },
  { big: "6", label: "Agents on tap" },
  { big: "100%", label: "You approve" },
];

const steps = [
  { n: "01", title: "Tell Margo about the shop", body: "Company basics, goals, the tools you already use. Rough notes are plenty; she reads between the lines." },
  { n: "02", title: "She fills the gaps on a quick call", body: "A short voice interview asks only what’s missing. You see the transcript and fix it before it’s saved." },
  { n: "03", title: "You approve the brief", body: "Margo writes a plain-English company report. Edit any line, check the evidence, then approve the source of truth." },
  { n: "04", title: "She drafts the team & the price", body: "A workflow of preset and custom agents appears, with a live monthly estimate. Add, cut, or reshuffle." },
  { n: "05", title: "Agents get built & stress-tested", body: "Each agent is generated into real files, then run in an isolated sandbox until the tests pass." },
  { n: "06", title: "You run the floor", body: "Watch the crew work, read the event feed, and sign off the calls that actually matter." },
];

const catalog = [
  { n: "01", name: "Front Desk", role: "Customer support", tag: "Preset", desc: "FAQs, order status, drafts or sends, clear escalation for the sensitive ones." },
  { n: "02", name: "Subscriptions", role: "Retention", tag: "Preset", desc: "Pauses, swaps and reschedules on request, no ticket needed." },
  { n: "03", name: "Restock Radar", role: "Inventory", tag: "Preset", desc: "Watches stock, flags low roasts, drafts the reorder for approval." },
  { n: "04", name: "Reviews", role: "Marketing", tag: "Preset", desc: "On-brand replies to reviews and DMs, always held for approval." },
  { n: "05", name: "Monday Report", role: "Reporting", tag: "Preset", desc: "One weekly readout across sales, tickets and stock." },
  { n: "06", name: "Wholesale Intake", role: "Custom-built", tag: "Custom", desc: "A focused design cycle builds an agent for a workflow no preset covers." },
];

const pillars = [
  { t: "Approved, not automatic", b: "AI drafts. Nothing becomes a decision until you approve the version." },
  { t: "Secrets stay yours", b: "Agents reference credentials by name. Real keys never touch a prompt or a file." },
  { t: "Every move is on the record", b: "Who changed what, who approved it, and which version shipped: all logged." },
];

/* `href` marks a CTA that leaves the page instead of entering the demo. "Talk
   to us" is a conversation, not an app screen — it opens mail to the address
   the footer already publishes, rather than silently running the same
   enterApp handler as every other button. */
const prices = [
  { name: "Solo", price: "$0", unit: "/ 14 days", badge: "Trial", blurb: "Meet Margo, build the brief, see your drafted team and price.", features: ["Full onboarding & interview", "Company brief + plan", "No card required"], cta: "Start free", href: null, border: "var(--line2)", bg: "var(--card)", fg: "var(--ink)", ctaBg: "var(--ink)", ctaFg: "var(--paper)" },
  { name: "Studio", price: "$490", unit: "/ mo + agents", badge: "Most shops", blurb: "The platform desk plus your active crew, billed per running agent.", features: ["Up to 6 active agents", "Sandbox validation", "Approvals + calendar", "WhatsApp & email alerts"], cta: "Build my team", href: null, border: "var(--ink)", bg: "var(--ink)", fg: "var(--paper)", ctaBg: "var(--paper)", ctaFg: "var(--ink)" },
  { name: "Warehouse", price: "Custom", unit: "managed", badge: "Scaling", blurb: "Unlimited agents, priority sandboxes and a human on our side.", features: ["Unlimited agents", "Batch overnight rebuilds", "Managed onboarding", "SSO & audit export"], cta: "Talk to us", href: "mailto:hello@margo.work", border: "var(--line2)", bg: "var(--card)", fg: "var(--ink)", ctaBg: "var(--ink)", ctaFg: "var(--paper)" },
];

const faqs = [
  { q: "Does Margo run my business on autopilot?", a: "No, and that’s the point. She proposes; you approve. Anything risky, financial or irreversible waits for a person." },
  { q: "Do I need to understand APIs or automations?", a: "Never. You describe the shop in plain words. Margo handles triggers, mappings and error handling behind the glass." },
  { q: "Where do my API keys live?", a: "In a server-side vault. Generated agent files reference a credential by name; the real secret is never embedded." },
  { q: "What if a task is too weird for a preset?", a: "That’s a custom agent: a short design interview produces an editable spec, built and tested like any other." },
];

export default function Landing() {
  const s = useApp();

  return (
    <div style={sx({ animation: "fadeUp .5s ease both" })}>
      {/* TICKER */}
      <div style={sx({ background: "var(--ink)", color: "var(--paper)", overflow: "hidden", whiteSpace: "nowrap", borderBottom: "1px solid var(--ink)" })}>
        <div style={sx({ display: "inline-flex", gap: 34, padding: "9px 0", fontFamily: "var(--mono)", fontSize: 12, letterSpacing: ".04em", animation: "marq 34s linear infinite", willChange: "transform" })}>
          <span>✶ MEET MARGO: YOUR AI OPERATIONS MANAGER</span><span>✶ SHE LEARNS THE SHOP</span><span>✶ HIRES THE TEAM</span><span>✶ RUNS IT PAST YOU FIRST</span><span>✶ FOR SMALL BRANDS THAT OUTGREW THE SPREADSHEET</span>
          <span>✶ MEET MARGO: YOUR AI OPERATIONS MANAGER</span><span>✶ SHE LEARNS THE SHOP</span><span>✶ HIRES THE TEAM</span><span>✶ RUNS IT PAST YOU FIRST</span><span>✶ FOR SMALL BRANDS THAT OUTGREW THE SPREADSHEET</span>
        </div>
      </div>

      {/* NAV */}
      <nav style={sx({ position: "sticky", top: 0, zIndex: 50, background: "rgba(244,238,227,.86)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--line)" })}>
        <div style={sx({ maxWidth: 1180, margin: "0 auto", padding: "15px 40px", display: "flex", alignItems: "center", justifyContent: "space-between" })}>
          <div style={sx({ display: "flex", alignItems: "center", gap: 9 })}>
            <span style={sx({ width: 11, height: 11, borderRadius: "50%", background: "var(--ink)", display: "inline-block" })} />
            <span style={sx({ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 22, letterSpacing: "-.02em" })}>Margo</span>
          </div>
          <div style={sx({ display: "flex", alignItems: "center", gap: 30, fontSize: 14.5 })}>
            <a href="#how">How it works</a><a href="#team">The team</a><a href="#pricing">Pricing</a>
            <button
              onClick={s.enterApp}
              className="hv-bg hv-tf"
              style={sx({ background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 999, padding: "11px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "transform .2s,background .2s", "--hv-bg": "var(--ember)", "--hv-tf": "translateY(-2px)" })}
            >
              Start free →
            </button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header style={sx({ maxWidth: 1180, margin: "0 auto", padding: "70px 40px 40px" })}>
        <div style={sx({ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--ink2)", display: "flex", gap: 12, alignItems: "center" })}>
          <span style={sx({ width: 26, height: 1, background: "var(--ink2)", display: "inline-block" })} />The done-for-you AI workforce
        </div>
        <h1 style={sx({ fontFamily: "var(--disp)", fontWeight: 800, fontSize: "clamp(48px,8.2vw,104px)", lineHeight: 0.9, letterSpacing: "-.035em", margin: "22px 0 0", maxWidth: "15ch", textWrap: "balance" })}>Hire the team you keep meaning to build.</h1>
        <div style={sx({ display: "grid", gridTemplateColumns: "1.15fr .85fr", gap: 48, alignItems: "end", marginTop: 30 })}>
          <div>
            <p style={sx({ fontSize: 19, lineHeight: 1.5, color: "var(--ink2)", maxWidth: "46ch", margin: 0 })}>Margo sits down with you for twenty minutes, learns how the shop actually runs, then drafts a crew of AI agents to handle the busywork, while every big decision still lands on your desk.</p>
            <div style={sx({ display: "flex", gap: 14, marginTop: 26, flexWrap: "wrap" })}>
              <button
                onClick={s.enterApp}
                className="hv-bg hv-tf"
                style={sx({ background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 999, padding: "16px 28px", fontSize: 15.5, fontWeight: 600, cursor: "pointer", transition: "transform .22s,background .22s", "--hv-bg": "var(--ember)", "--hv-tf": "translateY(-3px)" })}
              >
                Show me my team →
              </button>
              {/* Labelled for what the click actually does — it enters the same
                  interactive demo as the primary button. The old "Watch the
                  2-min tour" promised a video that exists nowhere in the app. */}
              <button
                onClick={s.enterApp}
                className="hv-bd hv-tf"
                style={sx({ background: "transparent", color: "var(--ink)", border: "1px solid var(--line2)", borderRadius: 999, padding: "16px 26px", fontSize: 15.5, fontWeight: 600, cursor: "pointer", transition: "transform .22s,border-color .22s", "--hv-bd": "var(--ink)", "--hv-tf": "translateY(-3px)" })}
              >
                Explore the interactive demo
              </button>
            </div>
            <div style={sx({ display: "flex", gap: 34, marginTop: 34, paddingTop: 22, borderTop: "1px solid var(--line)" })}>
              {heroStats.map((st) => (
                <div key={st.label}>
                  <div style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 30, letterSpacing: "-.02em" })}>{st.big}</div>
                  <div style={sx({ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--ink3)", marginTop: 2 })}>{st.label}</div>
                </div>
              ))}
            </div>
          </div>
          {/* hero product composition */}
          <div style={sx({ position: "relative", height: 340 })}>
            <div style={sx({ position: "absolute", inset: 0, background: "var(--paper2)", border: "1px solid var(--line)", borderRadius: 16, backgroundImage: "repeating-linear-gradient(-45deg,transparent 0 13px,rgba(26,23,18,.035) 13px 14px)" })} />
            <div style={sx({ position: "absolute", left: 26, top: 30, width: 250, background: "var(--card)", border: "1px solid var(--line2)", borderRadius: 13, padding: 16, boxShadow: "0 18px 40px -20px rgba(26,23,18,.4)", transform: "rotate(-3deg)", animation: "floatA 6s ease-in-out infinite" })}>
              <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "center" })}><span style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".1em", color: "var(--ink3)" })}>AGENT · ACTIVE</span><span style={sx({ width: 7, height: 7, borderRadius: "50%", background: "var(--forest)" })} /></div>
              <div style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 19, marginTop: 8 })}>Front Desk</div>
              <div style={sx({ fontSize: 12.5, color: "var(--ink2)", lineHeight: 1.35, marginTop: 3 })}>Cleared 41 “where’s my order?” tickets today.</div>
              <div style={sx({ display: "flex", gap: 5, marginTop: 12 })}><span style={sx({ height: 6, flex: 1, background: "var(--forest)", borderRadius: 3 })} /><span style={sx({ height: 6, flex: 1, background: "var(--forest)", borderRadius: 3 })} /><span style={sx({ height: 6, flex: 1, background: "var(--line2)", borderRadius: 3 })} /></div>
            </div>
            <div style={sx({ position: "absolute", right: 8, bottom: 8, width: 236, background: "var(--ink)", color: "var(--paper)", borderRadius: 13, padding: 16, boxShadow: "0 18px 40px -20px rgba(26,23,18,.55)", transform: "rotate(2.5deg)", animation: "floatB 6.6s ease-in-out .4s infinite" })}>
              <div style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".1em", opacity: 0.7 })}>NEEDS YOUR SIGN-OFF</div>
              <div style={sx({ fontSize: 13.5, lineHeight: 1.4, marginTop: 8 })}>Refund $48 to <b>M. Alvarez</b> (order arrived cracked).</div>
              <div style={sx({ display: "flex", gap: 8, marginTop: 13 })}><span style={sx({ flex: 1, textAlign: "center", background: "var(--paper)", color: "var(--ink)", borderRadius: 8, padding: "7px 0", fontSize: 12, fontWeight: 600 })}>Approve</span><span style={sx({ flex: 1, textAlign: "center", border: "1px solid rgba(244,238,227,.4)", borderRadius: 8, padding: "7px 0", fontSize: 12 })}>Edit</span></div>
            </div>
          </div>
        </div>
      </header>

      {/* MARQUEE BAND */}
      <div style={sx({ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", overflow: "hidden", whiteSpace: "nowrap", marginTop: 44, padding: "17px 0" })}>
        <div style={sx({ display: "inline-flex", gap: 22, fontFamily: "var(--disp)", fontWeight: 800, fontSize: 36, letterSpacing: "-.02em", animation: "marq 32s linear infinite", willChange: "transform" })}>
          <span>Learn the business</span><span style={sx({ color: "var(--ember)" })}>✶</span><span>Draft the team</span><span style={sx({ color: "var(--ember)" })}>✶</span><span>Prove it in a sandbox</span><span style={sx({ color: "var(--ember)" })}>✶</span><span>Keep the owner in control</span><span style={sx({ color: "var(--ember)" })}>✶</span>
          <span>Learn the business</span><span style={sx({ color: "var(--ember)" })}>✶</span><span>Draft the team</span><span style={sx({ color: "var(--ember)" })}>✶</span><span>Prove it in a sandbox</span><span style={sx({ color: "var(--ember)" })}>✶</span><span>Keep the owner in control</span><span style={sx({ color: "var(--ember)" })}>✶</span>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <section id="how" className="reveal" style={sx({ maxWidth: 1180, margin: "0 auto", padding: "84px 40px 20px" })}>
        <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 })}>
          <div>
            <div style={sx({ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ember)" })}>✶ The arc</div>
            <h2 style={sx({ fontFamily: "var(--disp)", fontWeight: 800, fontSize: "clamp(34px,5vw,58px)", lineHeight: 0.95, letterSpacing: "-.03em", margin: "14px 0 0", maxWidth: "16ch" })}>From “it’s all in my head” to a running crew.</h2>
          </div>
          <p style={sx({ fontSize: 15, color: "var(--ink2)", maxWidth: "30ch", margin: 0 })}>Six steps, roughly twenty guided minutes for a simple shop. You approve every gate.</p>
        </div>
        <div style={sx({ marginTop: 44, borderTop: "1px solid var(--line2)" })}>
          {steps.map((st) => (
            <div
              key={st.n}
              className="hv-bg hv-tf"
              style={sx({ display: "grid", gridTemplateColumns: "90px 1fr 1.3fr", gap: 28, padding: "26px 18px", margin: "0 -18px", borderBottom: "1px solid var(--line)", alignItems: "baseline", borderRadius: 12, transition: "background .25s,transform .25s", "--hv-bg": "var(--paper2)", "--hv-tf": "translateX(7px)" })}
            >
              <div style={sx({ fontFamily: "var(--mono)", fontSize: 14, color: "var(--ink3)" })}>{st.n}</div>
              <h3 style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 23, letterSpacing: "-.01em", margin: 0, lineHeight: 1.05 })}>{st.title}</h3>
              <p style={sx({ margin: 0, fontSize: 15.5, color: "var(--ink2)", lineHeight: 1.5 })}>{st.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* MEET THE TEAM */}
      <section id="team" style={sx({ background: "var(--paper2)", borderTop: "1px solid var(--line)", marginTop: 70 })}>
        <div className="reveal" style={sx({ maxWidth: 1180, margin: "0 auto", padding: "80px 40px" })}>
          <div style={sx({ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ember)" })}>✶ The roster</div>
          <h2 style={sx({ fontFamily: "var(--disp)", fontWeight: 800, fontSize: "clamp(34px,5vw,58px)", lineHeight: 0.95, letterSpacing: "-.03em", margin: "14px 0 6px", maxWidth: "20ch" })}>Configurable presets for the routine. Custom agents for the exceptions.</h2>
          <div style={sx({ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginTop: 38 })}>
            {catalog.map((c) => (
              <div
                key={c.n}
                className="hv-bd hv-tf hv-sh"
                style={sx({ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: 22, minHeight: 184, display: "flex", flexDirection: "column", transition: "transform .28s,box-shadow .28s,border-color .28s", "--hv-bd": "var(--ink)", "--hv-tf": "translateY(-6px)", "--hv-sh": "0 22px 40px -26px rgba(26,23,18,.5)" })}
              >
                <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "center" })}>
                  <span style={sx({ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink3)" })}>{c.n}</span>
                  <span style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink2)", border: "1px solid var(--line2)", borderRadius: 20, padding: "3px 9px" })}>{c.tag}</span>
                </div>
                <h3 style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 22, margin: "16px 0 2px", letterSpacing: "-.01em" })}>{c.name}</h3>
                <div style={sx({ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ember)", marginBottom: 9 })}>{c.role}</div>
                <p style={sx({ margin: 0, fontSize: 14, color: "var(--ink2)", lineHeight: 1.45 })}>{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MANIFESTO */}
      <section style={sx({ background: "var(--ink)", color: "var(--paper)" })}>
        <div className="reveal" style={sx({ maxWidth: 1180, margin: "0 auto", padding: "90px 40px" })}>
          <div style={sx({ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--paper)", opacity: 0.55 })}>✶ The deal</div>
          <p style={sx({ fontFamily: "var(--disp)", fontWeight: 600, fontSize: "clamp(30px,4.6vw,54px)", lineHeight: 1.08, letterSpacing: "-.02em", margin: "22px 0 0", maxWidth: "20ch", textWrap: "balance" })}>Autopilot is a myth. Margo keeps her hands on the wheel, and the final call stays yours.</p>
          <div style={sx({ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 30, marginTop: 54, borderTop: "1px solid rgba(244,238,227,.2)", paddingTop: 30 })}>
            {pillars.map((p) => (
              <div key={p.t}>
                <div style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 20 })}>{p.t}</div>
                <p style={sx({ fontSize: 14.5, opacity: 0.72, lineHeight: 1.5, margin: "8px 0 0" })}>{p.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="reveal" style={sx({ maxWidth: 1180, margin: "0 auto", padding: "84px 40px" })}>
        <div style={sx({ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ember)" })}>✶ Pay for the desk, not the drama</div>
        <h2 style={sx({ fontFamily: "var(--disp)", fontWeight: 800, fontSize: "clamp(34px,5vw,58px)", lineHeight: 0.95, letterSpacing: "-.03em", margin: "14px 0 38px" })}>Straightforward pricing.</h2>
        <div style={sx({ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 })}>
          {prices.map((p) => (
            <div
              key={p.name}
              className="hv-tf hv-sh"
              style={sx({ border: `1px solid ${p.border}`, background: p.bg, color: p.fg, borderRadius: 16, padding: 28, display: "flex", flexDirection: "column", transition: "transform .28s,box-shadow .28s", "--hv-tf": "translateY(-8px)", "--hv-sh": "0 26px 46px -28px rgba(26,23,18,.5)" })}
            >
              <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "center" })}><span style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 20 })}>{p.name}</span><span style={sx({ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.7 })}>{p.badge}</span></div>
              <div style={sx({ margin: "18px 0 4px" })}><span style={sx({ fontFamily: "var(--disp)", fontWeight: 800, fontSize: 44, letterSpacing: "-.03em" })}>{p.price}</span><span style={sx({ fontFamily: "var(--mono)", fontSize: 12, opacity: 0.7 })}> {p.unit}</span></div>
              <p style={sx({ fontSize: 13.5, opacity: 0.75, lineHeight: 1.45, margin: "0 0 18px" })}>{p.blurb}</p>
              <div style={sx({ display: "flex", flexDirection: "column", gap: 9, flex: 1 })}>
                {p.features.map((f) => (
                  <div key={f} style={sx({ display: "flex", gap: 9, fontSize: 13.5, alignItems: "baseline" })}><span style={sx({ opacity: 0.5 })}>→</span>{f}</div>
                ))}
              </div>
              {p.href ? (
                <a
                  href={p.href}
                  style={sx({ marginTop: 22, border: "none", borderRadius: 999, padding: 13, fontSize: 14, fontWeight: 600, cursor: "pointer", background: p.ctaBg, color: p.ctaFg, textAlign: "center", textDecoration: "none", display: "block" })}
                >
                  {p.cta}
                </a>
              ) : (
                <button
                  onClick={s.enterApp}
                  style={sx({ marginTop: 22, border: "none", borderRadius: 999, padding: 13, fontSize: 14, fontWeight: 600, cursor: "pointer", background: p.ctaBg, color: p.ctaFg })}
                >
                  {p.cta}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section style={sx({ borderTop: "1px solid var(--line)" })}>
        <div className="reveal" style={sx({ maxWidth: 1180, margin: "0 auto", padding: "70px 40px", display: "grid", gridTemplateColumns: ".7fr 1.3fr", gap: 48 })}>
          <h2 style={sx({ fontFamily: "var(--disp)", fontWeight: 800, fontSize: "clamp(30px,4vw,46px)", lineHeight: 0.95, letterSpacing: "-.03em", margin: 0 })}>The obvious questions.</h2>
          <div style={sx({ borderTop: "1px solid var(--line2)" })}>
            {faqs.map((q, i) => {
              const open = s.faqOpen === i;
              const rot = open ? "rotate(45deg)" : "none";
              return (
                <div
                  key={q.q}
                  onClick={() => s.toggleFaq(i)}
                  className="hv-bg"
                  style={sx({ padding: "22px 6px", margin: "0 -6px", borderBottom: "1px solid var(--line)", cursor: "pointer", transition: "background .2s", "--hv-bg": "rgba(26,23,18,.025)" })}
                >
                  <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18 })}>
                    <div style={sx({ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 19, lineHeight: 1.15 })}>{q.q}</div>
                    <span style={sx({ fontFamily: "var(--mono)", fontSize: 22, lineHeight: 1, color: "var(--ink2)", transition: "transform .3s", transform: rot, flex: "none" })}>+</span>
                  </div>
                  {open && (
                    <p style={sx({ margin: "12px 0 2px", fontSize: 15, color: "var(--ink2)", lineHeight: 1.55, maxWidth: "64ch", animation: "revUp .35s ease both" })}>{q.a}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FOOTER CTA */}
      <footer style={sx({ background: "var(--ink)", color: "var(--paper)" })}>
        <div style={sx({ maxWidth: 1180, margin: "0 auto", padding: "70px 40px 40px" })}>
          <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 24 })}>
            <div>
              <div style={sx({ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", opacity: 0.55 })}>✶ Twenty minutes. No card.</div>
              <div style={sx({ fontFamily: "var(--disp)", fontWeight: 800, fontSize: "clamp(40px,7vw,86px)", lineHeight: 0.9, letterSpacing: "-.03em", marginTop: 14 })}>Let’s meet the shop.</div>
            </div>
            <button
              onClick={s.enterApp}
              className="hv-bg hv-fg"
              style={sx({ background: "var(--paper)", color: "var(--ink)", border: "none", borderRadius: 999, padding: "17px 30px", fontSize: 16, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", "--hv-bg": "var(--ember)", "--hv-fg": "var(--paper)" })}
            >
              Start with Margo →
            </button>
          </div>
          <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 70, paddingTop: 22, borderTop: "1px solid rgba(244,238,227,.18)", fontFamily: "var(--mono)", fontSize: 12, opacity: 0.6, flexWrap: "wrap", gap: 12 })}>
            <span>© 2026 MARGO LABS</span><span>SHE WORKS FOR YOU · YOU SIGN THE CHECKS</span><span>HELLO@MARGO.WORK</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
