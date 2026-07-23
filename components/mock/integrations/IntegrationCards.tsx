"use client";
/**
 * IntegrationCards — the card / row building blocks of the integrations
 * screens (spec §12): generous recommended cards, compact available cards,
 * MCP cards with the Advanced accordion, and connected rows. All content
 * comes from the INTEGRATIONS fixture; status comes from the store runtime.
 */
import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, ChevronDown, Eye, Plus } from "lucide-react";
import StatusBadge from "@/components/mock/ui/StatusBadge";
import { DUR, EASE, fadeUp } from "@/lib/mock/motion";
import type { IntegrationDef, IntegrationRuntime, IntegrationStatus } from "@/lib/mock/types";
import { AGENT_NAME } from "@/lib/mock/fixtures/ids";
import ToolMark from "./ToolMark";
import styles from "./integrations.module.css";

/* ── Shared bits ────────────────────────────────────────────────────────── */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-07-24T10:15:00+08:00" → "Connected 24 Jul 2026 · 10:15" (deterministic, no Date). */
export function formatConnectedAt(iso: string | null | undefined): string {
  if (!iso) return "Connected";
  const [date, rest] = iso.split("T");
  const [y, m, d] = (date ?? "").split("-");
  const time = rest ? rest.slice(0, 5) : "";
  const month = MONTHS[Number(m) - 1] ?? "";
  return `Connected ${Number(d)} ${month} ${y}${time ? ` · ${time}` : ""}`;
}

/** Status badge that swaps with a small morph when Required → Connected. */
export function StatusSwap({ status }: { status: IntegrationStatus }) {
  const reduced = useReducedMotion();
  return (
    <span className={styles.cardStatus} style={{ display: "inline-flex" }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={status}
          initial={reduced ? false : { opacity: 0, y: -6, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: 6, scale: 0.9 }}
          transition={{ duration: DUR.micro, ease: EASE }}
          style={{ display: "inline-flex" }}
        >
          <StatusBadge status={status} />
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** "Needed by" agent badges (plain names, from the AGENT_NAME fixture). */
export function NeededBy({ ids }: { ids: string[] }) {
  if (ids.length === 0) return null;
  return (
    <div className={styles.needBy}>
      <span className="oa-micro">Needed by</span>
      {ids.map((id) => (
        <span key={id} className={styles.agentChip}>
          {AGENT_NAME[id] ?? id}
        </span>
      ))}
    </div>
  );
}

/** Two quiet columns: what the agent can read / what it may request. */
export function PermCols({ def }: { def: IntegrationDef }) {
  return (
    <div className={styles.permCols}>
      <div className={styles.permCol}>
        <span className="oa-micro">Can read</span>
        <ul className={styles.permList}>
          {def.reads.map((line) => (
            <li key={line} className={styles.permItem}>
              <Eye size={13} aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.permCol}>
        <span className="oa-micro">May request</span>
        <ul className={styles.permList}>
          {def.actions.map((line) => (
            <li key={line} className={styles.permItem}>
              <ArrowUpRight size={13} aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ── Recommended card (generous, plan-first; spec §12) ──────────────────── */

export function RecommendedCard({
  def,
  status,
  index,
  onConnect,
  onManage,
}: {
  def: IntegrationDef;
  status: IntegrationStatus;
  index: number;
  onConnect: (id: string) => void;
  onManage: (id: string) => void;
}) {
  const reduced = useReducedMotion();
  const connected = status === "connected";
  return (
    <motion.article
      className={`oa-card ${styles.card}`}
      variants={fadeUp}
      custom={Math.min(index, 8)}
      initial={reduced ? false : "hidden"}
      animate="show"
    >
      <div className={styles.cardHead}>
        <ToolMark name={def.name} />
        <div className={styles.cardHeadText}>
          <h3 className="oa-h3">{def.name}</h3>
          <p className={styles.purpose}>{def.purpose}</p>
        </div>
        <StatusSwap status={status} />
      </div>

      <NeededBy ids={def.neededBy} />
      <PermCols def={def} />

      <div className={styles.cardFoot}>
        <span className={styles.category}>{def.category}</span>
        {connected ? (
          <button type="button" className="oa-btn oa-btn--ghost oa-btn--sm" onClick={() => onManage(def.id)}>
            Manage
          </button>
        ) : (
          <button type="button" className="oa-btn oa-btn--soft" onClick={() => onConnect(def.id)}>
            Connect
          </button>
        )}
      </div>
    </motion.article>
  );
}

/* ── Available app card (compact, searchable grid) ──────────────────────── */

export function AvailableCard({
  def,
  status,
  index,
  onConnect,
  onManage,
}: {
  def: IntegrationDef;
  status: IntegrationStatus;
  index: number;
  onConnect: (id: string) => void;
  onManage: (id: string) => void;
}) {
  const reduced = useReducedMotion();
  const connected = status === "connected";
  return (
    <motion.article
      className={`oa-card oa-card--flat ${styles.availCard}`}
      variants={fadeUp}
      custom={Math.min(index, 8)}
      initial={reduced ? false : "hidden"}
      animate="show"
    >
      <div className={styles.cardHead}>
        <ToolMark name={def.name} size={36} />
        <div className={styles.cardHeadText}>
          <h3 className="oa-h3" style={{ fontSize: 15 }}>
            {def.name}
          </h3>
          <span className={styles.category}>{def.category}</span>
        </div>
        {connected && <StatusSwap status={status} />}
      </div>

      <p className={`${styles.purpose} ${styles.clamp2}`}>{def.purpose}</p>

      <div className={styles.cardFoot}>
        {connected ? (
          <button type="button" className="oa-btn oa-btn--ghost oa-btn--sm" onClick={() => onManage(def.id)}>
            Manage
          </button>
        ) : (
          <button type="button" className="oa-btn oa-btn--soft oa-btn--sm" onClick={() => onConnect(def.id)}>
            <Plus size={14} aria-hidden />
            Connect
          </button>
        )}
      </div>
    </motion.article>
  );
}

/* ── MCP / internal tool card (plain language + Advanced accordion) ─────── */

function AdvancedAccordion({ adv, name }: { adv: IntegrationDef["advanced"]; name: string }) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const panelId = useId();
  return (
    <div>
      <button
        type="button"
        className={styles.advBtn}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown
          size={14}
          aria-hidden
          className={`${styles.advChevron} ${open ? styles.advChevronOpen : ""}`}
        />
        Advanced
        <span className="oa-sub" style={{ fontSize: 11.5 }}>
          — technical details for {name}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            className={styles.advPanel}
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
            transition={{ duration: DUR.micro + 0.08, ease: EASE }}
          >
            <div className={styles.advInner}>
              <div className={styles.advRow}>
                <span className={styles.advKey}>Protocol</span>
                <p className={styles.advVal}>{adv.protocol}</p>
              </div>
              <div className={styles.advRow}>
                <span className={styles.advKey}>Server</span>
                <p className={styles.advVal}>{adv.server}</p>
              </div>
              <div className={styles.advRow}>
                <span className={styles.advKey}>Scopes</span>
                <p className={styles.advVal}>{adv.scopes.join(" · ")}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function McpCard({
  def,
  status,
  index,
  onConnect,
  onManage,
}: {
  def: IntegrationDef;
  status: IntegrationStatus;
  index: number;
  onConnect: (id: string) => void;
  onManage: (id: string) => void;
}) {
  const reduced = useReducedMotion();
  const connected = status === "connected";
  return (
    <motion.article
      className={`oa-card ${styles.card}`}
      variants={fadeUp}
      custom={Math.min(index, 8)}
      initial={reduced ? false : "hidden"}
      animate="show"
    >
      <div className={styles.cardHead}>
        <ToolMark name={def.name} tone="dark" />
        <div className={styles.cardHeadText}>
          <h3 className="oa-h3">{def.name}</h3>
          <p className={styles.purpose}>{def.purpose}</p>
        </div>
        <StatusSwap status={status} />
      </div>

      <NeededBy ids={def.neededBy} />
      <AdvancedAccordion adv={def.advanced} name={def.name} />

      <div className={styles.cardFoot}>
        <span className={styles.category}>Internal tool</span>
        {connected ? (
          <button type="button" className="oa-btn oa-btn--ghost oa-btn--sm" onClick={() => onManage(def.id)}>
            Manage
          </button>
        ) : (
          <button type="button" className="oa-btn oa-btn--soft" onClick={() => onConnect(def.id)}>
            Connect
          </button>
        )}
      </div>
    </motion.article>
  );
}

/* ── Connected row (compact; spec §12 "Connected apps") ─────────────────── */

export function ConnectedRow({
  def,
  runtime,
  index,
  onManage,
}: {
  def: IntegrationDef;
  runtime: IntegrationRuntime | undefined;
  index: number;
  onManage: (id: string) => void;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={`oa-row ${styles.connRow}`}
      variants={fadeUp}
      custom={Math.min(index, 8)}
      initial={reduced ? false : "hidden"}
      animate="show"
    >
      <ToolMark name={def.name} size={36} tone={def.kind === "mcp" ? "dark" : "auto"} />
      <div className={styles.rowText}>
        <p className={styles.rowTitle}>
          {def.name}
          {def.kind === "mcp" && <span className="oa-tag oa-tag--neutral">MCP</span>}
        </p>
        <p className={styles.rowSub}>
          {formatConnectedAt(runtime?.connectedAt)} · {def.account}
        </p>
      </div>
      <div className={styles.rowActions}>
        <StatusBadge status="connected" />
        <button type="button" className="oa-btn oa-btn--ghost oa-btn--sm" onClick={() => onManage(def.id)}>
          Manage
        </button>
      </div>
    </motion.div>
  );
}
