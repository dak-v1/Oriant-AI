"use client";
/**
 * ManageDrawer — review a connected tool (spec §12): plain-language
 * permission summary, what it can read / may request, who approves, and a
 * mock Disconnect that returns the tool to its default status.
 */
import { useRef } from "react";
import { Check, ShieldCheck } from "lucide-react";
import Drawer from "@/components/mock/ui/Drawer";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { toast } from "@/components/mock/ui/Toaster";
import { useDemoStore } from "@/lib/mock/store";
import type { IntegrationDef } from "@/lib/mock/types";
import { INTEGRATIONS } from "@/lib/mock/fixtures/integrations";
import { OWNER } from "@/lib/mock/fixtures/ids";
import ToolMark from "./ToolMark";
import { formatConnectedAt, NeededBy, PermCols } from "./IntegrationCards";
import styles from "./integrations.module.css";

export default function ManageDrawer({
  defId,
  onClose,
}: {
  /** Integration to manage; null = closed. */
  defId: string | null;
  onClose: () => void;
}) {
  const lastDefRef = useRef<IntegrationDef | null>(null);
  if (defId && INTEGRATIONS[defId]) lastDefRef.current = INTEGRATIONS[defId];
  const def = lastDefRef.current;

  const integrations = useDemoStore((s) => s.integrations);
  const setIntegrationStatus = useDemoStore((s) => s.setIntegrationStatus);
  const runtime = def ? integrations[def.id] : undefined;

  if (!def) return null;

  const disconnect = () => {
    setIntegrationStatus(def.id, def.defaultStatus);
    toast({
      title: `${def.name} disconnected`,
      detail: "Simulated — no real account access was changed.",
      tone: "info",
    });
    onClose();
  };

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
        <>
          <button type="button" className="oa-btn oa-btn--danger" onClick={disconnect}>
            Disconnect
          </button>
          <button type="button" className="oa-btn oa-btn--ghost" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className={styles.manageHead}>
        <div className={styles.rowText}>
          <p className={styles.rowTitle}>{def.account}</p>
          <p className={styles.rowSub}>{formatConnectedAt(runtime?.connectedAt)}</p>
        </div>
        <StatusBadge status={runtime?.status ?? "connected"} />
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

      <div className={styles.manageSection}>
        <NeededBy ids={def.neededBy} />
      </div>

      <p className="oa-sim-note" style={{ marginTop: 18 }}>
        Simulated connection — disconnecting only updates this demo.
      </p>
    </Drawer>
  );
}
