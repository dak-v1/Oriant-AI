"use client";
/**
 * ManageDrawer — review a connected tool: plain-language permission
 * summary, what it can read / may request, who approves.
 *
 * Step 9 Pass 1: no real disconnect endpoint exists yet (only /connect and
 * /status) — Disconnect is dropped rather than faked as a client-only
 * action that wouldn't persist. Flagged as a real gap, not silently patched.
 */
import { Check, ShieldCheck } from "lucide-react";
import Drawer from "@/components/mock/ui/Drawer";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import type { IntegrationDef } from "@/lib/mock/types";
import { INTEGRATIONS } from "@/lib/mock/fixtures/integrations";
import { OWNER } from "@/lib/mock/fixtures/ids";
import ToolMark from "./ToolMark";
import { PermCols } from "./IntegrationCards";
import styles from "./integrations.module.css";

export default function ManageDrawer({
  defId,
  status,
  neededByAgents,
  onClose,
}: {
  /** Integration to manage; null = closed. */
  defId: string | null;
  status: string;
  /** Agent display names from the real GET /api/integrations/[organizationId] response. */
  neededByAgents: string[];
  onClose: () => void;
}) {
  const def: IntegrationDef | null = defId ? INTEGRATIONS[defId] ?? null : null;
  if (!def) return null;

  return (
    <Drawer
      open={Boolean(defId)}
      onClose={onClose}
      eyebrow="Manage connection"
      title={
        <span className={styles.wizTitleWrap}>
          <ToolMark name={def.name} size={34} tone={def.kind === "mcp" ? "dark" : "auto"} />
          {def.name}
        </span>
      }
      footer={
        <button type="button" className="oa-btn oa-btn--ghost" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className={styles.manageHead}>
        <p className={styles.rowTitle}>{def.name}</p>
        <StatusBadge status={status} />
      </div>

      <div className={styles.manageSection}>
        <span className="oa-micro">What you agreed to</span>
        <ul className={styles.wizPermList}>
          {def.permissionSummary.map((line) => (
            <li key={line} className={styles.wizPermItem}>
              <Check size={14} aria-hidden />
              {line}
            </li>
          ))}
        </ul>
        <div className={styles.ownerLine}>
          <ShieldCheck size={15} aria-hidden />
          <span>
            <strong>Owner approves changes.</strong> {OWNER.name} stays the approval owner for
            anything this connection can request.
          </span>
        </div>
      </div>

      <div className={styles.manageSection}>
        <PermCols def={def} />
      </div>

      {neededByAgents.length > 0 && (
        <div className={styles.manageSection}>
          <span className="oa-micro">Needed by</span>
          <div className={styles.needBy}>
            {neededByAgents.map((name) => (
              <span key={name} className={styles.agentChip}>
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="oa-sim-note" style={{ marginTop: 18 }}>
        Disconnecting isn&apos;t available yet — reach out if you need this tool disconnected.
      </p>
    </Drawer>
  );
}
