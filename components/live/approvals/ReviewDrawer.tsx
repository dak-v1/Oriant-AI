"use client";
/**
 * ReviewDrawer — the whole decision, in one panel: what the agent proposes, the
 * run that produced it, the owner's edits, and what happened when they decided.
 *
 * THE PANEL DOES NOT CLOSE ON A DECISION. Approving here is not a form
 * submission, it is `decideAndResume`: the frozen invocation is replayed and a
 * paused run continues to completion — or fails, or pauses again at a second
 * approval — before the response comes back. Closing on success would throw away
 * the only report of that, and would make "approved" indistinguishable from
 * "approved, and then the run failed". So the drawer stays open and turns into
 * the outcome.
 *
 * WHAT THE OWNER APPROVES IS WHAT RUNS, AND THE SCREEN NEVER LETS THAT BE
 * AMBIGUOUS. The moment an argument is edited, three things change together: the
 * edited fields are outlined and labelled, a banner lists every change with its
 * before and after, and the primary button stops saying "Approve as proposed"
 * and starts saying "Approve edited version". The banner also carries the exact
 * merged object — `{ ...proposed, ...patch }`, the same expression
 * `resolvedApprovalArgs` uses — because a diff describes a change and only the
 * merged object describes what will be sent.
 *
 * EVIDENCE IS FETCHED, NOT SUMMARISED. The run's trigger, its event timeline and
 * its accumulated context come from `/api/runtime/run` and are shown as the
 * runtime holds them. An approval whose evidence cannot be loaded still renders
 * — with the gap named — because the proposal itself is complete and the owner
 * may still need to reject it.
 *
 * A FAILED DECISION IS NEVER DRESSED AS A SUCCESSFUL ONE. `submitDecision`
 * returns three outcomes and each gets its own treatment: recorded, refused
 * (nothing was written — correct it and try again), and unknown (it may have
 * landed; refresh before retrying, because resending an approval that took
 * effect sends the action twice).
 *
 * THE PLAN CONTEXT ARRIVES AS ONE NULLABLE OBJECT, AND NULL MEANS "NOT READ
 * YET" (M7). Agent names and the runtime's mode come from a second request, so
 * on a `?focus=` deep link this panel can open before either is known. Two
 * props — a mode that could be null and a names map that could be empty — could
 * not express the difference between "the runtime is not in live mode" and "we
 * have not asked yet", and the footer's safety sentence turns on exactly that.
 * So: null hides the agent name rather than showing the id it is about to
 * replace, and makes the footer assume the action is real. Both transitions run
 * in the safe direction — nothing becomes something, and a warning relaxes —
 * never the other way.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileWarning,
  HelpCircle,
  Info,
  PenLine,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type {
  ApprovalRecordView,
  DecisionInput,
  DecisionOutcome,
  DecisionResult,
  PlanContext,
  RunView,
} from "./api";
import { ApprovalsApiError, fetchApprovalRecord, fetchRun, submitDecision } from "./api";
import {
  RISK_TAG,
  deadlineTone,
  describeAction,
  eventWord,
  formatInstant,
  previewValue,
  runStateWord,
  runStatusMeta,
  safeStringify,
  triggerWord,
} from "./format";
import ArgsEditor, { useArgDraft } from "./ArgsEditor";
import LiveDrawer from "./LiveDrawer";
import shell from "@/components/mock/approvals/approvals.module.css";
import styles from "./live-approvals.module.css";

/** What the screen keeps after the drawer closes, for "decided in this session". */
export interface DecidedSummary {
  approvalId: string;
  headline: string;
  decision: "approved" | "rejected";
  runStatus: string | null;
  edited: boolean;
}

/** Stable identity so the draft hook does not re-seed on every render. */
const NO_ARGS: Record<string, unknown> = {};

type DecisionFailure =
  | { kind: "refused"; status: number; message: string }
  | { kind: "unknown"; message: string };

export default function ReviewDrawer({
  approvalId,
  open,
  plan,
  onClose,
  onDecided,
  onFocusApproval,
}: {
  approvalId: string | null;
  open: boolean;
  /**
   * Agent display names and the runtime's mode. Null until the lookup has
   * answered — see the module header for why that is one object and not two
   * optional fields.
   */
  plan: PlanContext | null;
  onClose: () => void;
  onDecided: (summary: DecidedSummary) => void;
  /** Follows the run's NEXT approval when a decision paused it again. */
  onFocusApproval: (approvalId: string) => void;
}) {
  const [record, setRecord] = useState<ApprovalRecordView | null>(null);
  const [run, setRun] = useState<RunView | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    decision: "approved" | "rejected";
    outcome: DecisionOutcome;
  } | null>(null);
  const [failure, setFailure] = useState<DecisionFailure | null>(null);

  const fieldPrefix = useId();
  const rejectRef = useRef<HTMLTextAreaElement | null>(null);

  /* ── Load ──
     Record first, then its run. The run is evidence: losing it costs context,
     not the ability to decide, so its failure is reported beside the timeline
     rather than replacing the panel. */
  useEffect(() => {
    if (!open || approvalId === null) return;
    const controller = new AbortController();

    setRecord(null);
    setRun(null);
    setLoadError(null);
    setRunError(null);
    setRejecting(false);
    setRejectReason("");
    setResult(null);
    setFailure(null);
    setLoading(true);

    void (async () => {
      try {
        const loaded = await fetchApprovalRecord(approvalId, controller.signal);
        if (controller.signal.aborted) return;
        setRecord(loaded);
        setLoading(false);
        try {
          const loadedRun = await fetchRun(loaded.approval.runId, controller.signal);
          if (!controller.signal.aborted) setRun(loadedRun);
        } catch (err) {
          if (!controller.signal.aborted) setRunError(messageOf(err));
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setLoadError(messageOf(err));
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [open, approvalId]);

  /* ── Where focus goes when "Reject…" is pressed ──
     The button that was focused unmounts on that click, so without this the
     browser drops focus to `document.body` and the owner's next keystroke lands
     outside the dialog. The reason field is also the only thing that can be done
     next — rejecting requires it — so moving focus there is what a mouse user
     was about to do anyway. Closing the reject form is handled by the drawer's
     own trap, which pulls a stray focus back inside on the next Tab. */
  useEffect(() => {
    if (!rejecting) return;
    const timer = window.setTimeout(() => rejectRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [rejecting]);

  /* The draft is keyed on the LOADED approval, not the requested one, so it
     re-seeds when the record arrives and again on every switch between items. */
  const draft = useArgDraft(
    record?.approval.approvalId ?? "",
    record?.approval.proposed.args ?? NO_ARGS,
  );

  const alreadyDecided = record?.decision ?? null;
  const settled = result !== null || alreadyDecided !== null;
  const editable = record !== null && !settled && !busy;
  const edits = draft.changes.length;
  const blocked = draft.invalidKeys.length > 0;

  const decide = useCallback(
    async (decision: "approved" | "rejected") => {
      if (!record || busy || settled) return;
      setBusy(true);
      setFailure(null);

      const input: DecisionInput = { approvalId: record.approval.approvalId, decision };
      if (decision === "rejected") {
        input.reason = rejectReason.trim();
      } else if (edits > 0) {
        // Only what moved. See ArgsEditor's header for why the whole object is
        // deliberately not round-tripped.
        input.editedArgs = draft.patch;
      }

      let outcome: DecisionResult;
      try {
        outcome = await submitDecision(input);
      } catch (err) {
        // submitDecision is written not to throw; if it ever does, the decision's
        // fate is unknown and must be reported as such rather than as a failure.
        outcome = {
          kind: "unknown",
          message:
            `The decision could not be completed (${messageOf(err)}). It may or may not have ` +
            `been recorded — refresh the inbox before deciding again.`,
        };
      }
      setBusy(false);

      if (outcome.kind === "recorded") {
        setResult({ decision, outcome: outcome.outcome });
        /* The run moved on inside that same request, so the timeline loaded a
           moment ago now describes a run that no longer exists in that state.
           The decision response carries the resumed run's whole event list and
           final status, so the evidence is brought forward from it rather than
           re-fetched — one fewer request, and no window in which the panel says
           "completed" above a timeline that still says "awaiting approval". */
        setRun((current) =>
          current === null
            ? current
            : {
                ...current,
                status: outcome.outcome.runStatus ?? current.status,
                failure: outcome.outcome.failure,
                events: outcome.outcome.events.length > 0 ? outcome.outcome.events : current.events,
              },
        );
        onDecided({
          approvalId: record.approval.approvalId,
          headline: describeAction(record.approval.proposed).headline,
          decision,
          runStatus: outcome.outcome.runStatus,
          edited: outcome.outcome.edited || edits > 0,
        });
        return;
      }
      setFailure(outcome);
    },
    [busy, draft.patch, edits, onDecided, record, rejectReason, settled],
  );

  const approval = record?.approval ?? null;
  const action = approval ? describeAction(approval.proposed) : null;
  /* Null while the plan lookup is outstanding: nothing, rather than the id it is
     about to be replaced by. See the module header. */
  const agentLabel =
    approval === null || plan === null
      ? null
      : plan.agentNames[approval.agentId] ?? approval.agentId;
  const rejectReady = rejectReason.trim() !== "";

  return (
    <LiveDrawer
      open={open}
      onClose={onClose}
      focusKey={approvalId ?? ""}
      eyebrow={
        approval === null
          ? "Approval"
          : agentLabel === null
            ? approval.workflowId
            : `${agentLabel} · ${approval.workflowId}`
      }
      title={action ? action.headline : loadError ? "This approval could not be loaded" : "Loading…"}
      footer={
        <Footer
          state={{
            loading,
            loadError,
            settled,
            busy,
            rejecting,
            rejectReady,
            blocked,
            edits,
            plan,
            hasRecord: record !== null,
          }}
          onClose={onClose}
          onStartReject={() => setRejecting(true)}
          onCancelReject={() => {
            setRejecting(false);
            setRejectReason("");
          }}
          onApprove={() => void decide("approved")}
          onReject={() => void decide("rejected")}
        />
      }
    >
      {loading && (
        <div className={styles.drawerLoading} aria-live="polite">
          <p className="oa-sub">Loading the proposal and the run behind it…</p>
          <div className={styles.skelLine} style={{ width: "70%" }} />
          <div className={styles.skelLine} style={{ width: "92%" }} />
          <div className={styles.skelLine} style={{ width: "55%" }} />
        </div>
      )}

      {loadError && (
        <div className={styles.errorBox} role="alert">
          <p className={styles.errorTitle}>
            <AlertTriangle size={15} aria-hidden />
            This approval could not be loaded
          </p>
          <p className={styles.errorDetail}>{loadError}</p>
          <p>
            Nothing has been decided. Close this panel and refresh the inbox — if the approval has
            already been decided elsewhere it will no longer be waiting.
          </p>
        </div>
      )}

      {record && approval && action && (
        <div>
          {/* ── What just happened, if anything ── */}
          {result && (
            <OutcomePanel
              decision={result.decision}
              outcome={result.outcome}
              onFocusApproval={onFocusApproval}
            />
          )}

          {failure && <FailurePanel failure={failure} />}

          {alreadyDecided && !result && (
            <div className={`${styles.outcome} ${styles.outcomeOk}`} role="status">
              <div className={styles.outcomeHead}>
                <span
                  className={`oa-status oa-status--${
                    alreadyDecided.decision === "approved" ? "approved" : "neutral"
                  }`}
                >
                  {alreadyDecided.decision === "approved" ? "Approved" : "Rejected"}
                </span>
                <span className="oa-sub">
                  by {alreadyDecided.decidedBy} · {formatInstant(alreadyDecided.decidedAt)}
                </span>
              </div>
              <p className={styles.outcomeSentence}>
                This has already been decided, so nothing on it can change. Its details below are
                read-only.
              </p>
              {alreadyDecided.reason && (
                <p className={styles.outcomeNote}>Reason given: {alreadyDecided.reason}</p>
              )}
              {record.edited && (
                <p className={styles.outcomeNote}>
                  The details were edited before this was approved — see the version history below.
                </p>
              )}
            </div>
          )}

          {/* ── Decision context ── */}
          <section className={shell.section} aria-label="Decision required">
            <p className="oa-micro">Why this needs you</p>
            <p className={shell.decision}>{approval.reason}</p>
            <div className="oa-cluster">
              <span className={`oa-tag ${RISK_TAG[approval.risk]}`}>Risk: {approval.risk}</span>
              {approval.breachedLimits.map((limit) => (
                <span key={limit} className={styles.limitTag}>
                  Limit: {limit}
                </span>
              ))}
              <span
                className={`${shell.due} ${
                  deadlineTone(record.deadline.state).pressing ? styles.duePressing : ""
                }`}
              >
                <Clock size={12} aria-hidden />
                {record.deadline.detail}
              </span>
            </div>
            {!action.named && (
              <p className={styles.unnamedOp}>
                <FileWarning size={13} aria-hidden />
                There is no plain description of{" "}
                <strong>{approval.proposed.operation}</strong>. Read its details below before
                deciding.
              </p>
            )}
          </section>

          {/* ── Where it came from ── */}
          <section className={shell.section} aria-label="Where this came from">
            <p className="oa-micro">Where this came from</p>
            <div className={shell.srcRows}>
              <SourceRow
                label="Agent"
                value={
                  agentLabel === null
                    ? approval.agentId
                    : `${agentLabel} (${approval.agentId})`
                }
              />
              <SourceRow label="Workflow" value={approval.workflowId} />
              <SourceRow label="Step" value={approval.stepId} />
              <SourceRow label="Tool" value={action.integration} />
              <SourceRow label="Action" value={approval.proposed.operation} />
              <SourceRow label="Decision owner" value={approval.approvalOwner} />
              <SourceRow label="Raised" value={formatInstant(approval.createdAt)} />
              <SourceRow
                label="Escalates"
                value={`${formatInstant(approval.dueAt)} — ${record.deadline.detail}`}
              />
            </div>
          </section>

          {/* ── The proposed invocation ── */}
          <section className={shell.section} aria-label="What will be sent">
            <div className={shell.proposedHead}>
              <p className="oa-micro">
                {editable ? "What will be sent — edit it before you decide" : "What will be sent"}
              </p>
              <span className={shell.proposedMeta}>
                {action.integration} · {approval.proposed.operation}
              </span>
            </div>
            <ArgsEditor draft={draft} disabled={!editable} idPrefix={fieldPrefix} />
          </section>

          {Object.keys(approval.proposed.metrics).length > 0 && (
            <section className={shell.section} aria-label="What your limits were checked against">
              <p className="oa-micro">What your limits were checked against</p>
              <div className={shell.srcRows}>
                {Object.keys(approval.proposed.metrics)
                  .sort()
                  .map((metric) => (
                    <SourceRow
                      key={metric}
                      label={metric}
                      value={String(approval.proposed.metrics[metric])}
                      mono
                    />
                  ))}
              </div>
              <p className="oa-sub">
                These were recorded when this was sent to you and are not recalculated from your
                edits. Changing an amount above does not re-run the limit check that stopped the
                agent.
              </p>
            </section>
          )}

          {/* ── The edit, stated as loudly as it deserves ── */}
          {edits > 0 && !settled && (
            <div className={styles.editBanner} role="status">
              <p className={styles.editBannerTitle}>
                <PenLine size={15} aria-hidden />
                You are approving an edited version
              </p>
              <ul className={styles.diffList}>
                {draft.changes.map((change) => (
                  <li key={change.key} className={styles.diffRow}>
                    <span className={styles.diffKey}>
                      {change.key} · {change.kind === "added" ? "added by you" : "changed"}
                    </span>
                    {change.kind === "changed" && (
                      <span className={styles.diffFrom}>{previewValue(change.from)}</span>
                    )}
                    <span className={styles.diffTo}>{previewValue(change.to)}</span>
                  </li>
                ))}
              </ul>
              <p style={{ margin: 0, fontSize: 12.5 }}>
                Approving sends your edited version, not what the agent proposed. The change is
                recorded against this approval as a second version.
              </p>
              <details>
                <summary style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 700 }}>
                  Show exactly what will be sent
                </summary>
                <pre className={styles.jsonBox}>{safeStringify(draft.resolved)}</pre>
              </details>
            </div>
          )}

          {blocked && !settled && (
            <div className={styles.errorBox} role="alert">
              <p className={styles.errorTitle}>
                <AlertTriangle size={15} aria-hidden />
                {draft.invalidKeys.length === 1
                  ? "One field cannot be read"
                  : `${draft.invalidKeys.length} fields cannot be read`}
              </p>
              <p>
                Approving is blocked while {draft.invalidKeys.join(", ")} cannot be read. Sending
                this without them would run the agent&apos;s original values while showing you
                yours.
              </p>
            </div>
          )}

          {/* ── Rejection ── */}
          {rejecting && !settled && (
            <div className={styles.rejectBox}>
              <label className="oa-label" htmlFor={`${fieldPrefix}-reject-reason`}>
                Why are you rejecting this? (required)
              </label>
              <textarea
                ref={rejectRef}
                id={`${fieldPrefix}-reject-reason`}
                className="oa-textarea"
                rows={3}
                value={rejectReason}
                disabled={busy}
                onChange={(event) => setRejectReason(event.target.value)}
              />
              <p className="oa-sub">
                The reason is kept with your decision and ends the run — the agent will not act.
                Any edits you made above are discarded, because a rejected action never happens.
              </p>
            </div>
          )}

          {/* ── Evidence ── */}
          <section className={shell.section} aria-label="Evidence from the run">
            <p className="oa-micro">Evidence — the run behind this proposal</p>
            {runError && (
              <p className="oa-sub">
                The run behind this could not be loaded ({runError}) — so the background to it
                is missing. What the agent proposes, above, is complete and can still be
                decided.
              </p>
            )}
            {run && (
              <>
                <div className={shell.srcRows}>
                  <SourceRow label="Status" value={runStateWord(run.status)} />
                  <SourceRow label="Started" value={formatInstant(run.startedAt)} />
                  <SourceRow
                    label="Started by"
                    value={
                      run.trigger
                        ? `${triggerWord(run.trigger.kind)} · ${formatInstant(run.trigger.firedAt)}`
                        : "—"
                    }
                  />
                </div>
                <ul className={styles.timeline}>
                  {run.events.map((event, index) => (
                    <li
                      key={`${event.kind}-${event.at}-${index}`}
                      className={`${styles.eventRow} ${
                        event.approvalId === approval.approvalId ? styles.eventPivot : ""
                      }`}
                    >
                      <span className={styles.eventKind}>
                        {eventWord(event.kind)}
                        <span className={styles.eventAt}>{formatInstant(event.at)}</span>
                      </span>
                      <span className={styles.eventText}>
                        {event.text || "—"}
                        {event.stepId && <span className={styles.eventAt}>step {event.stepId}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                <details>
                  <summary style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 700 }}>
                    Show everything the run had gathered when it paused
                  </summary>
                  <pre className={styles.jsonBox}>{safeStringify(run.context)}</pre>
                </details>
                {settled && (
                  <p className="oa-sub">
                    The timeline above now includes the steps your decision unblocked. The context
                    is still the snapshot from when the run paused — it is not re-read after a
                    decision.
                  </p>
                )}
              </>
            )}
          </section>

          {/* ── Versions ── */}
          <section className={shell.section} aria-label="Version history">
            <p className="oa-micro">Version history</p>
            <div className={shell.versions}>
              {(result?.outcome.versions.length ? result.outcome.versions : record.versions).map(
                (version) => (
                  <div
                    key={version.version}
                    className={`${shell.version} ${
                      version.author === "owner" ? shell.versionLatest : ""
                    }`}
                  >
                    <div className={styles.versionHeadRow}>
                      <span className={shell.versionTag}>v{version.version}</span>
                      <span className={shell.versionNote}>
                        {version.author === "agent" ? "Proposed by the agent" : "Edited before approval"}{" "}
                        · {version.authoredBy}
                      </span>
                      <span className={shell.versionAt}>{formatInstant(version.authoredAt)}</span>
                    </div>
                    <div className={shell.versionBody}>
                      {version.changes.length > 0 && (
                        <ul className={styles.diffList} style={{ marginBottom: 8 }}>
                          {version.changes.map((change) => (
                            <li key={change.key} className={styles.diffRow}>
                              <span className={styles.diffKey}>
                                {change.key} · {change.kind}
                              </span>
                              {change.kind !== "added" && (
                                <span className={styles.diffFrom}>{previewValue(change.from)}</span>
                              )}
                              {change.kind !== "cleared" && (
                                <span className={styles.diffTo}>{previewValue(change.to)}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      <pre className={styles.jsonBox}>{safeStringify(version.args)}</pre>
                    </div>
                  </div>
                ),
              )}
            </div>
            <p className="oa-sub">
              Version 1 is always exactly what the agent proposed. A second version exists only
              when whoever approved it changed something — it comes from the decision itself
              rather than being kept alongside it, so what an audit reads is what actually ran.
            </p>
          </section>
        </div>
      )}
    </LiveDrawer>
  );
}

/* ═══════════════════════════ Pieces ═══════════════════════════ */

function SourceRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={shell.srcRow}>
      <span className={shell.srcLabel}>{label}</span>
      <span className={`${shell.srcValue} ${mono ? styles.mono : ""}`}>{value}</span>
    </div>
  );
}

/**
 * What the runtime did with the decision. The run's status is the headline
 * because it is the thing an owner cannot see anywhere else on this screen: the
 * decision itself always "worked", and the interesting question is what the run
 * then did with it.
 */
function OutcomePanel({
  decision,
  outcome,
  onFocusApproval,
}: {
  decision: "approved" | "rejected";
  outcome: DecisionOutcome;
  onFocusApproval: (approvalId: string) => void;
}) {
  const meta = runStatusMeta(outcome.runStatus, decision);
  // Read out of the object so the click handler keeps the narrowing; a property
  // access inside the closure would be `string | null` again.
  const next = outcome.nextApprovalId;
  const toneClass =
    meta.tone === "ok"
      ? styles.outcomeOk
      : meta.tone === "bad"
        ? styles.outcomeBad
        : meta.tone === "warn"
          ? styles.outcomeWarn
          : "";

  return (
    <div className={`${styles.outcome} ${toneClass}`} role="status">
      <div className={styles.outcomeHead}>
        <span className={`oa-status oa-status--${meta.badge}`}>{meta.label}</span>
        <span className="oa-tag oa-tag--neutral">
          {decision === "approved" ? (outcome.edited ? "Approved with edits" : "Approved") : "Rejected"}
        </span>
      </div>
      <p className={styles.outcomeSentence}>{meta.sentence}</p>

      {outcome.failure && <p className={styles.outcomeNote}>The run reported: {outcome.failure}</p>}

      {outcome.unreadable && <p className={styles.outcomeNote}>{outcome.unreadable}</p>}

      <div className={styles.outcomeRows}>
        {outcome.dependentsQueued !== null && outcome.dependentsQueued > 0 && (
          <span>
            {outcome.dependentsQueued} dependent workflow
            {outcome.dependentsQueued === 1 ? "" : "s"} became due because this run finished.
          </span>
        )}
      </div>

      {outcome.dependencyError && (
        <p className={styles.outcomeNote}>
          <AlertTriangle size={13} aria-hidden /> The run itself finished correctly, but the
          workflows that follow it were not started: {outcome.dependencyError}
        </p>
      )}

      {next !== null && (
        <button
          type="button"
          className="oa-btn oa-btn--soft oa-btn--sm"
          onClick={() => onFocusApproval(next)}
        >
          Open the new approval this run raised
        </button>
      )}
    </div>
  );
}

function FailurePanel({ failure }: { failure: DecisionFailure }) {
  const unknown = failure.kind === "unknown";
  return (
    <div className={styles.errorBox} role="alert">
      <p className={styles.errorTitle}>
        {unknown ? <HelpCircle size={15} aria-hidden /> : <XCircle size={15} aria-hidden />}
        {unknown ? "It is not known whether this decision was recorded" : "The decision was refused"}
      </p>
      <p>{failure.message}</p>
      <p>
        {unknown
          ? "Do not decide again from here. Close this panel, refresh the inbox, and check whether " +
            "the approval is still waiting — approving twice would carry the action out twice."
          : "Nothing was recorded and the run is still paused, so you can correct this and decide " +
            "again."}
      </p>
    </div>
  );
}

/* ═══════════════════════════ Footer ═══════════════════════════ */

interface FooterState {
  loading: boolean;
  loadError: string | null;
  settled: boolean;
  busy: boolean;
  rejecting: boolean;
  rejectReady: boolean;
  blocked: boolean;
  edits: number;
  /** Null while the runtime's mode is still being read — see `ModeNote`. */
  plan: PlanContext | null;
  hasRecord: boolean;
}

/**
 * Whether pressing Approve sends a real email, said before it is pressed.
 *
 * FOUR STATES AND ONLY ONE OF THEM RELAXES THE WARNING. Unread and unreadable
 * both mean "assume this acts for real": an approval whose consequences are
 * unknown must be treated as the expensive one, which is the same fail-closed
 * posture `resolveAct` takes one layer down. The two are still worded
 * differently, because "we have not asked yet" resolves on its own in a moment
 * and "we asked and could not tell" does not.
 */
function ModeNote({ plan }: { plan: PlanContext | null }) {
  if (plan === null) {
    return (
      <>
        <AlertTriangle size={12} aria-hidden />
        Still checking whether this acts for real — until it answers, assume it does.
      </>
    );
  }
  if (plan.mode === "live") {
    return (
      <>
        <ShieldCheck size={12} aria-hidden />
        Approving carries this action out for real.
      </>
    );
  }
  if (plan.mode === "fixture") {
    return (
      <>
        <ShieldCheck size={12} aria-hidden />
        Practice mode: the run is real, but nothing is actually sent.
      </>
    );
  }
  return (
    <>
      <AlertTriangle size={12} aria-hidden />
      This screen could not check whether this acts for real — assume it does.
    </>
  );
}

function Footer({
  state,
  onClose,
  onStartReject,
  onCancelReject,
  onApprove,
  onReject,
}: {
  state: FooterState;
  onClose: () => void;
  onStartReject: () => void;
  onCancelReject: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  if (state.loading || state.loadError || !state.hasRecord) {
    return (
      <button type="button" className="oa-btn oa-btn--ghost" onClick={onClose}>
        Close
      </button>
    );
  }

  if (state.settled) {
    return (
      <>
        <span className={`oa-sim-note ${shell.footNote}`}>
          <Info size={12} aria-hidden />
          The decision is recorded and cannot be changed.
        </span>
        <button type="button" className="oa-btn oa-btn--primary" onClick={onClose}>
          Close
        </button>
      </>
    );
  }

  if (state.rejecting) {
    return (
      <>
        <span className={`oa-sim-note ${shell.footNote}`}>
          <Info size={12} aria-hidden />
          Rejecting ends the run without acting.
        </span>
        <button
          type="button"
          className="oa-btn oa-btn--ghost"
          onClick={onCancelReject}
          disabled={state.busy}
        >
          Back
        </button>
        <button
          type="button"
          className="oa-btn oa-btn--danger"
          onClick={onReject}
          disabled={state.busy || !state.rejectReady}
        >
          <XCircle size={14} aria-hidden />
          {state.busy ? "Rejecting…" : "Confirm rejection"}
        </button>
      </>
    );
  }

  return (
    <>
      <span className={`oa-sim-note ${shell.footNote}`}>
        <ModeNote plan={state.plan} />
      </span>
      <button
        type="button"
        className="oa-btn oa-btn--danger"
        onClick={onStartReject}
        disabled={state.busy}
      >
        Reject…
      </button>
      <button
        type="button"
        className="oa-btn oa-btn--primary"
        onClick={onApprove}
        disabled={state.busy || state.blocked}
      >
        <CheckCircle2 size={14} aria-hidden />
        {state.busy
          ? "Approving…"
          : state.edits > 0
            ? `Approve edited version (${state.edits} change${state.edits === 1 ? "" : "s"})`
            : "Approve as proposed"}
      </button>
    </>
  );
}

/**
 * The sentence to put in front of the reader.
 *
 * A malformed answer's own message names the field that was wrong, which is
 * written for whoever has to fix the mismatch and is meaningless to the person
 * holding the decision. The fact they need — that nothing could be read, so
 * nothing is being shown — is said instead, and nothing is quietly rendered
 * from a half-read record.
 */
function messageOf(error: unknown): string {
  if (error instanceof ApprovalsApiError && error.kind === "malformed") {
    return (
      "The answer came back in a form this screen could not read, so nothing was shown " +
      "from it. A half-read approval is worse than none, because you cannot see what is " +
      "missing from it."
    );
  }
  return error instanceof Error ? error.message : String(error);
}
