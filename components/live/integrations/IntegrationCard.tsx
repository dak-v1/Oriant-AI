"use client";
/**
 * IntegrationCard — one connection the approved plan depends on.
 *
 * The anatomy is the scripted integrations card's, deliberately: same mark, same
 * head, same "needed by" chips, same two permission columns. It reads as the same
 * product because it imports that stylesheet rather than a copy of it.
 *
 * WHAT DIFFERS FROM THE SCRIPTED CARD, AND WHY.
 *
 *   1. THERE IS NO CONNECT BUTTON. The scripted card opens a convincing four-step
 *      wizard that moves a value in the demo store. Connecting is Role D's
 *      registry surface and does not exist in this lane, so this card offers
 *      nothing that would pretend — a button that appears to connect a tool and
 *      does not is the most expensive control this screen could ship.
 *
 *   2. THE PERMISSION COLUMNS ARE THE GRANT, NOT A DESCRIPTION OF ONE. The
 *      scripted card lists prose from a fixture; these are the exact operation
 *      ids from `ToolGrant.operations`, split by `lib/plan/operations.ts` into
 *      what only reads and what acts outside Oriant. An operation the registry
 *      does not know gets its own column rather than being filed under either,
 *      because "we cannot say whether this writes" is not the same as "it reads".
 *      The id is always shown under the sentence: the sentence is a translation,
 *      the id is what the runtime will call.
 *
 *   3. BLOCKING SENTENCES ARE QUOTED, NOT COMPOSED. When a connection is holding
 *      up go-live, the words on the card are the activation checklist's own —
 *      the same ones the deploy screen shows and the go-live button refuses with.
 *
 *   4. EVERY STATE IS A WORD BEFORE IT IS A COLOUR, and the two contradictions
 *      worth catching are stated outright: a connection reported live that the
 *      runtime holds no client for, and an "optional" tool whose absence still
 *      fails a run.
 *
 * ── M7 ──
 *
 * A BLOCKER IS NOW A PLACE TO GO, not only a sentence to read. `ActivationBlocker`
 * has carried an `href` since M4 and this card quoted the message and dropped it,
 * which left the most urgent thing on the screen as the only thing with no way
 * forward. The link is rendered per DESTINATION rather than per blocker: several
 * blockers on one connection point at the same surface, and four identical links
 * would be four tab stops arriving in one place.
 *
 * THE DISCLOSURE'S REGION ALWAYS EXISTS. `aria-controls` used to name an element
 * that was only in the document while open, which is unresolvable exactly when a
 * screen reader is describing the collapsed button. The container is permanent and
 * `hidden`; its contents are still built only on open.
 *
 * MEMOISED, because the screen above holds a live connection whose status sentence
 * rewrites itself as the stream connects and drops, and a card is a large subtree —
 * two permission columns, a chip per agent and a block per grant.
 */
import { memo, useId, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  Eye,
  HelpCircle,
  Info,
  ShieldAlert,
  Timer,
} from "lucide-react";
import ToolMark from "@/components/mock/integrations/ToolMark";
import shell from "@/components/mock/integrations/integrations.module.css";
import type { GrantView, IntegrationView, OperationView } from "./api";
import {
  ACCESS_HEADING,
  type GroupId,
  OPTIONAL_REALITY,
  UNKNOWN_ACCESS_NOTE,
  clientContradiction,
  integrationLabel,
  runtimeStateMeta,
  statusMeta,
} from "./format";
import styles from "./live-integrations.module.css";

function IntegrationCardImpl({
  row,
  group,
}: {
  row: IntegrationView;
  /** Decided once in `groupOf`; passed in so the card cannot file itself. */
  group: GroupId;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const panelId = useId();

  const label = integrationLabel(row.integrationId);
  const status = statusMeta(row.status);
  const contradiction = clientContradiction(row);

  const reads = row.operations.filter((op) => op.access === "read");
  const writes = row.operations.filter((op) => op.access === "write");
  const unknown = row.operations.filter((op) => op.access === "unknown");

  /* One chip per agent, in plan order, even when an agent holds two grants. */
  const agents: GrantView[] = [];
  for (const grant of row.grants) {
    if (!agents.some((seen) => seen.agentId === grant.agentId)) agents.push(grant);
  }
  const liveAgents = agents.filter((grant) => runtimeStateMeta(grant.runtimeState).live);

  /* One link per distinct destination, not one per blocker. See the header. */
  const blockerDestinations = [...new Set(row.blockers.map((blocker) => blocker.href))];

  return (
    <article
      className={`oa-card ${shell.card} ${styles.card} ${
        group === "blocking" ? styles.cardBlocking : group === "attention" ? styles.cardAttention : ""
      }`}
      aria-labelledby={titleId}
    >
      <div className={shell.cardHead}>
        <ToolMark name={label} />
        <div className={shell.cardHeadText}>
          <h3 id={titleId} className="oa-h3">
            {label}
          </h3>
          <p className={styles.idLine}>{row.integrationId}</p>
        </div>
        <span className={shell.cardStatus}>
          <span className={`oa-status ${status.badge}`}>{status.label}</span>
        </span>
      </div>

      <div className="oa-cluster">
        <span className={`oa-tag ${row.requiredByPlan ? "oa-tag--amber" : "oa-tag--neutral"}`}>
          {row.requiredByPlan ? "Required by the plan" : "Optional in the plan"}
        </span>
        <span className="oa-tag oa-tag--neutral">
          {agents.length} {agents.length === 1 ? "agent" : "agents"}
          {liveAgents.length > 0 ? ` · ${liveAgents.length} active` : ""}
        </span>
        <span className="oa-tag oa-tag--neutral">
          {row.operations.length} {row.operations.length === 1 ? "operation" : "operations"}
        </span>
        {writes.length > 0 && (
          <span className="oa-tag oa-tag--amber">
            {writes.length} can act on your behalf
          </span>
        )}
      </div>

      <p className={shell.purpose}>{status.sentence}</p>

      {row.statusProblem !== null && (
        <p className={styles.problem}>
          <AlertTriangle size={13} aria-hidden />
          <span>{row.statusProblem}</span>
        </p>
      )}

      {contradiction !== null && (
        <p className={styles.problem}>
          <AlertTriangle size={13} aria-hidden />
          <span>
            {contradiction}
            {row.clientProblem !== null && (
              <span className={styles.quiet}>{row.clientProblem}</span>
            )}
          </span>
        </p>
      )}

      {row.blockers.length > 0 && (
        <div className={styles.blockerBox}>
          <p className={styles.blockerTitle}>
            <ShieldAlert size={14} aria-hidden />
            Blocks go-live
          </p>
          <ul className={styles.blockerList}>
            {row.blockers.map((blocker, index) => (
              <li key={`${blocker.message}-${index}`}>{blocker.message}</li>
            ))}
          </ul>
          <p className="oa-sub">
            Quoted from the activation checklist. Fixing it is Role D&apos;s connections
            surface; this view reads the registry and cannot change it.
          </p>
          {blockerDestinations.length > 0 && (
            <div className={styles.blockerActions}>
              {blockerDestinations.map((href) => (
                <Link key={href} href={href} className="oa-btn oa-btn--ghost oa-btn--sm">
                  Go to {href}
                  <ArrowUpRight size={13} aria-hidden />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Deliberately a note and not a warning: an optional connection that is
          off is not a problem, and the icon should not say it is. What it costs
          is still stated in full. */}
      {group === "unconnected" && (
        <p className={styles.note}>
          <Info size={13} aria-hidden />
          <span>{OPTIONAL_REALITY}</span>
        </p>
      )}

      <div className={shell.needBy}>
        <span className="oa-micro">Needed by</span>
        {agents.map((grant) => {
          const state = runtimeStateMeta(grant.runtimeState);
          return (
            <span key={grant.agentId} className={shell.agentChip}>
              {grant.agentName}
              <span className={styles.chipState}>{state.label}</span>
            </span>
          );
        })}
      </div>

      <div className={shell.permCols}>
        <OperationColumn
          heading={ACCESS_HEADING.read}
          empty="No read-only operation is granted here."
          operations={reads}
          integrationId={row.integrationId}
          icon="read"
        />
        <OperationColumn
          heading={ACCESS_HEADING.write}
          empty="Nothing here can change anything outside Oriant."
          operations={writes}
          integrationId={row.integrationId}
          icon="write"
        />
      </div>

      {unknown.length > 0 && (
        <div className={styles.unknownBox}>
          <p className={styles.blockerTitle}>
            <HelpCircle size={14} aria-hidden />
            {ACCESS_HEADING.unknown}
          </p>
          <p className="oa-sub">{UNKNOWN_ACCESS_NOTE}</p>
          <ul className={styles.opIdList}>
            {unknown.map((op) => (
              <li key={op.id} className={styles.opId}>
                {op.id}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <button
          type="button"
          className={shell.advBtn}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
        >
          <ChevronDown
            size={14}
            aria-hidden
            className={`${shell.advChevron} ${open ? shell.advChevronOpen : ""}`}
          />
          Which agent uses what
          <span className="oa-sub" style={{ fontSize: 11.5 }}>
            ({row.grants.length} {row.grants.length === 1 ? "grant" : "grants"} in the plan)
          </span>
        </button>
        {/* Permanent, so `aria-controls` above always resolves; empty until
            opened, so a list of eight connections does not build eight panels. */}
        <div id={panelId} className={open ? styles.agentPanel : undefined} hidden={!open}>
          {open &&
            row.grants.map((grant, index) => (
              <GrantBlock
                key={`${grant.agentId}-${index}`}
                grant={grant}
                operations={row.operations}
              />
            ))}
        </div>
      </div>

      <p className={styles.footNote}>
        <Timer size={12} aria-hidden />
        <span>
          Expiry and re-authorisation are not tracked in this build — nothing anywhere
          carries a token lifetime. See &ldquo;What this screen cannot tell you&rdquo;.
        </span>
      </p>
    </article>
  );
}

export default memo(IntegrationCardImpl);

/* ═══════════════════════════ Pieces ═══════════════════════════ */

function OperationColumn({
  heading,
  empty,
  operations,
  integrationId,
  icon,
}: {
  heading: string;
  empty: string;
  operations: OperationView[];
  integrationId: string;
  icon: "read" | "write";
}) {
  return (
    <div className={shell.permCol}>
      <span className="oa-micro">{heading}</span>
      {operations.length === 0 ? (
        <p className={styles.quiet}>{empty}</p>
      ) : (
        <ul className={shell.permList}>
          {operations.map((op) => (
            <li key={op.id} className={shell.permItem}>
              {icon === "read" ? (
                <Eye size={13} aria-hidden />
              ) : (
                <ArrowUpRight size={13} aria-hidden />
              )}
              <span className={styles.opText}>
                <span>
                  {op.description ??
                    "The operation registry has no description for this operation."}
                </span>
                <span className={styles.opId}>{op.id}</span>
                {op.baselineRisk !== null && icon === "write" && (
                  <span className={styles.quiet}>Baseline risk: {op.baselineRisk}</span>
                )}
                {op.belongsTo !== null && op.belongsTo !== integrationId && (
                  <span className={styles.mismatch}>
                    The operation registry files this under {op.belongsTo}, not{" "}
                    {integrationId}.
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One `ToolGrant` as the plan wrote it: which agent, what it is for in the
 * planner's own words, and the exact operations it may call.
 *
 * The purpose is quoted rather than paraphrased. It is prose D authored for this
 * grant, and a screen that summarised it would be inventing a second answer to
 * "why does this agent have access to my email".
 */
function GrantBlock({
  grant,
  operations,
}: {
  grant: GrantView;
  /** The integration's operations, for the access of each granted id. */
  operations: OperationView[];
}) {
  const state = runtimeStateMeta(grant.runtimeState);
  const accessOf = (id: string): "read" | "write" | "unknown" =>
    operations.find((op) => op.id === id)?.access ?? "unknown";

  return (
    <div className={styles.grantBlock}>
      <p className={styles.grantHead}>
        <span className={styles.grantAgent}>{grant.agentName}</span>
        <span className={`oa-tag ${state.live ? "oa-tag--teal" : "oa-tag--neutral"}`}>
          {state.label}
        </span>
        <span className={`oa-tag ${grant.required ? "oa-tag--amber" : "oa-tag--neutral"}`}>
          {grant.required ? "Required" : "Optional"}
        </span>
        <span className={styles.quiet}>v{grant.agentVersion}</span>
      </p>

      <p className={styles.grantPurpose}>
        {grant.purpose === ""
          ? "The plan records no purpose for this grant."
          : `“${grant.purpose}”`}
      </p>

      <ul className={styles.opIdList}>
        {grant.operationIds.map((id) => {
          const access = accessOf(id);
          const refused = grant.refusedOperationIds.includes(id);
          return (
            <li key={id} className={styles.opId} data-access={access}>
              {id}
              <span className={styles.opAccess}>
                {access === "write" ? "acts" : access === "read" ? "reads" : "unknown"}
              </span>
              {refused && <span className={styles.opRefused}>refused by policy</span>}
            </li>
          );
        })}
      </ul>

      {grant.refusedOperationIds.length > 0 && (
        <p className={styles.problem}>
          <AlertTriangle size={13} aria-hidden />
          <span>
            A deny list also names{" "}
            {grant.refusedOperationIds.length === 1 ? "this operation" : "these operations"}, so
            the runtime refuses{" "}
            {grant.refusedOperationIds.length === 1 ? "it" : "them"} outright whatever the grant
            says. Granting and forbidding the same operation is a plan defect the validator
            rejects.
          </span>
        </p>
      )}

      {grant.runtimeDetail !== null && (
        <p className={styles.quiet}>
          Runtime state: {grant.runtimeDetail}
        </p>
      )}
    </div>
  );
}
