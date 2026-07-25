"use client";
/**
 * ConnectionsCard / ConnectionList — required integrations with mock
 * credential placeholders, revealed ONLY after the agent's plan is settled
 * (preset: configuration saved; custom: design approved), improvement spec
 * §13. Each line: name, "Connection required" tag and two mock actions:
 * "Connect later" (default, no-op note) and "Use mock connection"
 * (markConnected). This demo never asks for real keys.
 */
import { useState } from "react";
import { Check, KeyRound, Plug } from "lucide-react";
import type { AgentDef } from "@/lib/mock/types";
import { useDemoStore } from "@/lib/mock/store";
import { INTEGRATIONS } from "@/lib/mock/fixtures/integrations";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { toast } from "@/components/mock/ui/Toaster";
import styles from "./agents.module.css";

/** The connection lines alone, for embedding (custom-agent setup checklist). */
export function ConnectionList({ def }: { def: AgentDef }) {
  const integrations = useDemoStore((s) => s.integrations);
  const markConnected = useDemoStore((s) => s.markConnected);
  const [deferred, setDeferred] = useState<Record<string, boolean>>({});

  const items = def.integrations.flatMap((req) => {
    const d = INTEGRATIONS[req.integrationId];
    return d ? [{ req, d }] : [];
  });

  return (
    <div>
      {items.map(({ req, d }) => {
        const connected = integrations[d.id]?.status === "connected";
        const later = Boolean(deferred[d.id]) && !connected;
        return (
          <div key={d.id} className={styles.connRow}>
            <span className={styles.checkIcon} aria-hidden>
              <Plug size={15} />
            </span>
            <div className={styles.connBody}>
              <div className="oa-cluster" style={{ gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 750 }}>{d.name}</span>
                {d.kind === "mcp" && <span className="oa-tag oa-tag--neutral">MCP</span>}
                {connected ? (
                  <StatusBadge status="connected" label="Mock connection active" />
                ) : (
                  <span className="oa-status oa-status--required">Connection required</span>
                )}
              </div>
              <p className="oa-sub" style={{ fontSize: 12.5, margin: 0 }}>
                {req.purpose}
              </p>
              <span className={styles.connCred}>
                <KeyRound size={12} aria-hidden />
                {d.account} · credential placeholder, never a real key
              </span>
              {later && (
                <p className="oa-sub" style={{ fontSize: 12, margin: 0 }}>
                  Noted. Nothing to do now: this connection is planned for activation.
                </p>
              )}
              {!connected && (
                <div className={styles.connActions}>
                  <button
                    type="button"
                    className="oa-btn oa-btn--ghost oa-btn--sm"
                    onClick={() => setDeferred((m) => ({ ...m, [d.id]: true }))}
                  >
                    Connect later
                  </button>
                  <button
                    type="button"
                    className="oa-btn oa-btn--soft oa-btn--sm"
                    onClick={() => {
                      markConnected(d.id);
                      toast({
                        title: `${d.name} connected (mock)`,
                        detail: "Marked as connected for the demo. No external system was contacted.",
                        tone: "ok",
                      });
                    }}
                  >
                    <Check size={13} aria-hidden />
                    Use mock connection
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Standalone card used on the preset page once configuration is saved. */
export default function ConnectionsCard({ def }: { def: AgentDef }) {
  return (
    <section className={`oa-card ${styles.card}`} aria-label="Connections">
      <div className="oa-between" style={{ gap: 10, alignItems: "flex-start" }}>
        <div style={{ display: "grid", gap: 3 }}>
          <h3 className="oa-h3">Connections</h3>
          <p className="oa-sub">
            The systems this agent needs. Set up mock connections now, or leave them for
            activation.
          </p>
        </div>
        <span className="oa-sim-note">Mock connections only. Nothing external is contacted.</span>
      </div>
      <ConnectionList def={def} />
    </section>
  );
}
