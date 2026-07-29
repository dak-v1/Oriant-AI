"use client";
/**
 * LiveIntegrationsScreen — the connections the approved plan actually depends
 * on, read from `/api/runtime/integrations` (ROLE_C_PLAN M6).
 *
 * The scripted screen answers "what could I connect?". This one answers the two
 * questions an owner has once agents are live: what may each agent do through
 * each connection, and is anything missing that stops the workforce going live.
 * Every row exists because a `ToolGrant` in the approved plan names it — there
 * is no catalogue here, and nothing appears that no agent asked for.
 *
 * BLOCKING FIRST, ALWAYS, AND NEVER RE-DERIVED IN THIS BROWSER. The groups are
 * ordered so anything the activation checklist named comes first, and membership
 * of that group is "the checklist raised a blocker for it" — the same sentences
 * the deploy screen shows and the go-live button refuses with. Nothing on this
 * screen recomputes "required and not connected"; see `format.ts`.
 *
 * THE STALE LIST IS KEPT WHEN A REFRESH FAILS. A read that cannot reach the
 * runtime replaces neither the list nor the truth: the cards stay, a banner says
 * the view is out of date and names the error, and the timestamp stops advancing.
 * Blanking the screen would read as "nothing is connected and nothing is wrong",
 * which are two different lies at once.
 *
 * ── M7: REALTIME, AND THE HALF OF IT THAT DOES NOT EXIST ──
 *
 * This screen subscribes to the runtime's change signal, and it is the one place
 * in the Operate surface where saying what the stream CANNOT tell you matters
 * more than the subscription itself.
 *
 * `/api/runtime/events` observes the runtime's own stores — runs, approvals,
 * triggers, jobs, agent records, the active deployment. It does not observe D's
 * integration registry, because nothing in this build does: connection state is
 * fetched per request and there is no store to fingerprint. So a tool being
 * authorised in another tab pushes NOTHING here, and it never will until the
 * registry is something the runtime holds rather than something it asks. What the
 * stream does carry is `deployment` — a go-live re-derives the checklist and can
 * turn every "blocking" on this page green at once — and `agents`, because each
 * card names the agents depending on the connection and their live state, and a
 * paused agent shown as active on the screen that says who is reading your email
 * is exactly the wrong error to leave up.
 *
 * The page therefore says, in the status line and not in a comment, that the
 * connections themselves are read on mount, on a returning tab and on the button,
 * and that this is the mechanism for a tool somebody just connected. Claiming
 * "live" for a screen whose main subject is unobserved would be worse than the
 * M6 behaviour it replaces.
 *
 * NOTHING HERE CONNECTS ANYTHING, and the screen says so rather than leaving a
 * dead button to be discovered. Connecting, disconnecting and re-authorising are
 * Role D's registry surface; this lane reads it.
 *
 * FOUR STATES, KEPT APART: loading is a shaped skeleton, empty is a plan that
 * asks for no connections at all, error keeps the last good list and names what
 * failed, and BLOCKED names the activation checklist's integrations gate and
 * links to the blockers it raised. And in every one of those four, the difference
 * between a connection that is optional-and-absent and one that is
 * required-and-absent is on the page — see `REQUIRED_VS_OPTIONAL`, which is
 * rendered before there is anything to group.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Cable,
  Info,
  Plug,
  Radio,
  RefreshCw,
  ShieldAlert,
  WifiOff,
} from "lucide-react";
import type { RuntimeEventsStatus, RuntimeTopic } from "@/components/live/useRuntimeEvents";
import { useRuntimeEvents } from "@/components/live/useRuntimeEvents";
import type { ApiFailureKind, BlockerView, ConnectionsView, GrantView, IntegrationView } from "./api";
import { IntegrationsApiError, fetchConnections } from "./api";
import {
  GROUPS,
  type GroupId,
  REQUIRED_VS_OPTIONAL,
  formatInstant,
  groupOf,
  runtimeStateMeta,
} from "./format";
import IntegrationCard from "./IntegrationCard";
import styles from "./live-integrations.module.css";

/**
 * What this screen wakes for — and, as much to the point, what it cannot.
 *
 * `deployment`: a go-live re-derives the activation checklist, which is where
 * every blocking sentence on this page comes from. `agents`: the cards attribute
 * each connection to the agents that depend on it and show each one's runtime
 * state. The registry itself is not on this list because it is not on any list;
 * see the module header.
 */
const CONNECTIONS_TOPICS: RuntimeTopic[] = ["deployment", "agents"];

/** The connection, in one word, before the sentence explaining it. */
const STREAM_WORD = {
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
  unsupported: "Not live",
} satisfies Record<RuntimeEventsStatus, string>;

/**
 * Why the read failed, kept apart from the message because the three cases need
 * three different things from the reader: a transport failure is theirs to fix,
 * an HTTP status is the runtime's answer, and a malformed body is a contract
 * break between this screen and the route.
 */
interface LoadFailure {
  kind: ApiFailureKind | "unknown";
  message: string;
}

const FAILURE_ADVICE: Record<LoadFailure["kind"], string> = {
  transport:
    "The browser could not reach the runtime at all. Check that the app is running and " +
    "that /api/runtime/integrations is reachable from here.",
  http: "The runtime answered, and the answer was a refusal. The status and its reason are above.",
  malformed:
    "The runtime answered with a shape this screen does not understand. Nothing was " +
    "rendered from it on purpose: a partly-read connections list would be missing exactly " +
    "the row you cannot see is missing. This is a mismatch between this screen and " +
    "/api/runtime/integrations.",
  unknown: "The failure did not identify itself, which is itself worth reporting.",
};

export default function LiveIntegrationsScreen() {
  const [view, setView] = useState<ConnectionsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  /** Browser clock — when this tab last got an answer, not a runtime instant. */
  const [readAt, setReadAt] = useState<Date | null>(null);

  const abort = useRef<AbortController | null>(null);
  const stream = useRuntimeEvents(CONNECTIONS_TOPICS);

  /* One read in flight at a time. A newer trigger — the stream, the button, a
     returning tab — aborts the older one rather than racing it, so a burst costs
     one completed request instead of one per trigger. */
  const load = useCallback(async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    try {
      const next = await fetchConnections(controller.signal);
      if (controller.signal.aborted) return;
      setView(next);
      setReadAt(new Date());
      setFailure(null);
    } catch (err) {
      // An abort is a superseded read, not a failure to report — and it must not
      // blank a list a newer read is about to fill.
      if (controller.signal.aborted) return;
      // Deliberately does NOT clear `view`; see the module header.
      setFailure({
        kind: err instanceof IntegrationsApiError ? err.kind : "unknown",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => abort.current?.abort();
  }, [load, stream.revision]);

  const refresh = useCallback(async () => {
    setBusy(true);
    await load();
    setBusy(false);
  }, [load]);

  /* Back to the front of the screen: somebody may have connected a tool in the
     other tab they just came from. This is the ONLY way that reaches this page —
     the registry pushes nothing. See the module header. */
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const rows = useMemo(() => view?.integrations ?? [], [view]);

  /* Grouped once per read rather than once per render: the status line above
     rewrites itself as the stream connects and drops, and re-filing every
     connection each time it does is work with no output. */
  const grouped = useMemo(() => {
    const map = new Map<GroupId, IntegrationView[]>();
    for (const row of rows) {
      const id = groupOf(row);
      const bucket = map.get(id);
      if (bucket === undefined) map.set(id, [row]);
      else bucket.push(row);
    }
    return map;
  }, [rows]);

  const blocking = grouped.get("blocking")?.length ?? 0;
  const attention = grouped.get("attention")?.length ?? 0;
  const unattributed = view?.unattributedBlockers ?? [];
  const gate = view?.gate ?? null;

  /* BLOCKED IS THE CHECKLIST'S JUDGEMENT, NEVER THIS SCREEN'S, and it is read
     from two places that must not be allowed to disagree in the reassuring
     direction: the gate's own `satisfied`, and the blocker sentences it raised.
     Either one is enough. A gate reporting unsatisfied while every card looks
     fine is still a go-live that will be refused, and a header badge reading
     "nothing blocking activation" next to it would be this screen inventing an
     opinion — which is the one thing format.ts exists to stop it doing. */
  const blocked =
    view !== null && ((gate !== null && !gate.satisfied) || blocking + unattributed.length > 0);

  return (
    <main className="oa-page">
      <header className="oa-between" style={{ marginBottom: 20, alignItems: "flex-start" }}>
        <div style={{ display: "grid", gap: 6, maxWidth: 760 }}>
          <p className="oa-eyebrow">Operate · Integrations</p>
          <h1 className="oa-h1">
            Workspace <span className="oa-serif">connections</span>
          </h1>
          <p className="oa-lead">
            Every connection your approved plan depends on, what each agent may do through
            it, and whether anything missing is holding up go-live.
          </p>
        </div>
        <div className={styles.headSide}>
          {view?.mode === "live" ? (
            <span className="oa-tag oa-tag--amber">Live runtime · calls are real</span>
          ) : view?.mode === "fixture" ? (
            <span className="oa-tag oa-tag--teal">Fixture runtime · tools stubbed</span>
          ) : (
            <span className="oa-tag oa-tag--neutral">Runtime mode unknown</span>
          )}
          {blocked ? (
            <span className="oa-tag oa-tag--amber">
              {blocking > 0 ? `${blocking} blocking activation` : "Activation blocked"}
            </span>
          ) : rows.length > 0 ? (
            <span className="oa-tag oa-tag--teal">Nothing blocking activation</span>
          ) : null}
          {attention > 0 && (
            <span className="oa-tag oa-tag--neutral">{attention} need attention</span>
          )}
        </div>
      </header>

      {/* Both of these render in every state — before the first read, during a
          failure, and on a plan with no connections at all. See the header. */}
      {/* The live region is the CONNECTION and nothing else: `role="status"` is
          atomic, and folding the read stamp in would have a screen reader recite
          the whole line on every refetch. */}
      <p className={styles.stream}>
        <span className={styles.streamState} role="status">
          <StreamIcon status={stream.status} />
          <span className={styles.streamWord}>{STREAM_WORD[stream.status]}</span>
          <span className={styles.streamDetail}>
            {stream.detail} Connection states themselves are not pushed by anything: the runtime
            does not observe Role D&apos;s registry, so a tool authorised elsewhere reaches this
            page when you come back to this tab or press Refresh.
          </span>
        </span>
        <span className={styles.streamRead}>
          {busy || loading
            ? "Reading now."
            : readAt === null
              ? "Nothing has been read yet."
              : `Last read at ${readAt.toLocaleTimeString()}.`}
        </span>
      </p>

      <p className={styles.groundRule}>
        <Info size={13} aria-hidden />
        <span>{REQUIRED_VS_OPTIONAL}</span>
      </p>

      {failure !== null && (
        <div className={styles.errorBox} role="alert">
          <p className={styles.errorTitle}>
            <AlertTriangle size={15} aria-hidden />
            {view !== null
              ? "This view is out of date"
              : "The connections could not be read"}
          </p>
          <p className={styles.errorDetail}>{failure.message}</p>
          <p>{FAILURE_ADVICE[failure.kind]}</p>
          {view !== null && (
            <p>
              The cards below are what the runtime last confirmed, at{" "}
              {readAt ? readAt.toLocaleTimeString() : "an earlier point"}. A connection may
              have been removed since, and this screen would not know.
            </p>
          )}
          <div>
            <button
              type="button"
              className="oa-btn oa-btn--ghost oa-btn--sm"
              onClick={() => void refresh()}
              disabled={busy}
            >
              <RefreshCw size={13} className={busy ? "oa-spin" : ""} aria-hidden />
              Try again
            </button>
          </div>
        </div>
      )}

      {blocked && (
        <BlockedByIntegrations
          gateLabel={gate?.label ?? "integrations gate"}
          gateDetail={gate?.detail ?? null}
          connections={blocking}
          unattributed={unattributed}
        />
      )}

      {/* Shown for anything that is not a named external registry, so a `kind`
          this build does not recognise still carries its caveat rather than
          quietly reading as a real connection. */}
      {view !== null && view.provider.kind !== "external" && (
        <div className={styles.callout}>
          <span className={styles.calloutIcon} aria-hidden>
            <Info size={17} />
          </span>
          <div className={styles.calloutText}>
            <p className={styles.calloutTitle}>
              {view.provider.kind === "stub"
                ? "These connection states are stubbed, not authorised"
                : "This build cannot identify where these connection states came from"}
            </p>
            <p className="oa-sub">{view.provider.detail}</p>
          </div>
        </div>
      )}

      <div className={styles.split}>
        <div className={styles.mainPane}>
          {loading && view === null && (
            <div className={styles.cardGrid} aria-busy="true" aria-label="Loading connections">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className={`oa-card oa-card--flat ${styles.skelCard}`}>
                  <div className={styles.skelLine} style={{ width: "46%" }} />
                  <div className={styles.skelLine} style={{ width: "82%" }} />
                  <div className={styles.skelLine} style={{ width: "64%" }} />
                </div>
              ))}
            </div>
          )}

          {view !== null && view.gate === null && (
            <div className={styles.errorBox} role="alert">
              <p className={styles.errorTitle}>
                <ShieldAlert size={15} aria-hidden />
                The activation checklist returned no integrations gate
              </p>
              <p>
                Nothing on this screen can say what is blocking go-live, because the one
                place that decides it did not answer. The connections below are still
                listed; treat every &ldquo;not blocking&rdquo; on this page as unproven
                until the checklist reads again.
              </p>
            </div>
          )}

          {view !== null && rows.length === 0 && <EmptyPlan planId={view.plan.planId} />}

          {GROUPS.map((group) => {
            const list = grouped.get(group.id) ?? [];
            if (list.length === 0) return null;
            return (
              <section key={group.id} className={styles.group} aria-labelledby={`oa-ig-${group.id}`}>
                <div className={styles.groupHead}>
                  <h2 id={`oa-ig-${group.id}`} className="oa-h2" style={{ fontSize: 19 }}>
                    {group.title}
                    <span className={styles.groupCount}>{list.length}</span>
                  </h2>
                  <p className="oa-sub">{group.sentence}</p>
                </div>
                <div className={styles.cardGrid}>
                  {list.map((row) => (
                    <IntegrationCard key={row.integrationId} row={row} group={group.id} />
                  ))}
                </div>
              </section>
            );
          })}

          {view !== null && view.unattributedBlockers.length > 0 && (
            <section className={styles.group} aria-labelledby="oa-ig-unattributed-blockers">
              <div className={styles.groupHead}>
                <h2 id="oa-ig-unattributed-blockers" className="oa-h2" style={{ fontSize: 19 }}>
                  Blocking, with no connection to point at
                </h2>
                <p className="oa-sub">
                  The activation checklist raised these and they match no connection above —
                  usually a required tool grant that names no integration at all — so no card
                  can carry them. They stop go-live all the same.
                </p>
              </div>
              <div className={styles.blockerBox}>
                <ul className={styles.blockerList}>
                  {view.unattributedBlockers.map((blocker, index) => (
                    <li key={`${blocker.message}-${index}`}>{blocker.message}</li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {view !== null && view.grantsWithoutIntegration.length > 0 && (
            <section className={styles.group} aria-labelledby="oa-ig-unattributed-grants">
              <div className={styles.groupHead}>
                <h2 id="oa-ig-unattributed-grants" className="oa-h2" style={{ fontSize: 19 }}>
                  Grants that name no tool
                </h2>
                <p className="oa-sub">
                  These tool grants carry no integration id, so there is nothing to check a
                  connection against. That is a defect in the plan rather than a connection
                  problem, and it is shown here because this is where somebody would notice it.
                </p>
              </div>
              <div className={styles.blockerBox}>
                <ul className={styles.blockerList}>
                  {view.grantsWithoutIntegration.map((grant, index) => (
                    <li key={`${grant.agentId}-${index}`}>
                      <UnattributedGrant grant={grant} />
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </div>

        <div className={styles.railPane}>
          <section className={`oa-card ${styles.railCard}`} aria-label="Connections summary">
            <div className={styles.railHead}>
              <p className="oa-micro">This plan&apos;s connections</p>
              <button
                type="button"
                className="oa-btn oa-btn--ghost oa-btn--sm"
                onClick={() => void refresh()}
                disabled={busy}
              >
                <RefreshCw size={13} className={busy ? "oa-spin" : ""} aria-hidden />
                Refresh
              </button>
            </div>
            <div className={styles.railRows}>
              <RailRow label="Referenced by the plan" value={String(rows.length)} />
              <RailRow label="Blocking activation" value={String(blocking)} />
              <RailRow label="Connected and callable" value={String(grouped.get("connected")?.length ?? 0)} />
              <RailRow label="Need attention" value={String(attention)} />
              <RailRow label="Not connected" value={String(grouped.get("unconnected")?.length ?? 0)} />
              <RailRow
                label="This tab last read"
                value={readAt ? readAt.toLocaleTimeString() : "—"}
              />
            </div>
            {gate !== null && (
              <p className="oa-sub">
                Activation checklist, integrations gate:{" "}
                <strong>{gate.satisfied ? "satisfied" : "not satisfied"}</strong>. {gate.detail}
              </p>
            )}
            {(grouped.get("unconnected")?.length ?? 0) > 0 && (
              <p className="oa-sub">
                &ldquo;Degrade gracefully&rdquo; in that sentence is the plan contract&apos;s
                phrase for an optional connection (§3.9), not a description of what the
                runtime does. What actually happens when a tool is missing is on each
                not-connected card.
              </p>
            )}
          </section>

          <section className={`oa-card ${styles.railCard}`} aria-label="What this screen cannot tell you">
            <p className="oa-micro">What this screen cannot tell you</p>
            <p className="oa-sub">
              ROLE_C_PLAN asks this screen for expiry and re-authorisation warnings. The
              fields below do not exist anywhere in this build, so they are named as missing
              rather than estimated — an invented renewal date would be the only fabricated
              fact on a screen where everything else is derived.
            </p>
            <dl className={styles.unavailableList}>
              {(view?.unavailable ?? []).map((field) => (
                <div key={field.field} className={styles.unavailableRow}>
                  <dt>
                    {field.label}
                    <span className={styles.unavailableTag}>unavailable</span>
                  </dt>
                  <dd>{field.reason}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className={`oa-card ${styles.railCard}`} aria-label="Connecting a tool">
            <p className="oa-micro">Connecting a tool</p>
            <p className="oa-sub">
              Nothing on this screen connects, disconnects or re-authorises anything, and it
              deliberately offers no button that looks like it might. Connections belong to
              Role D&apos;s integration registry, which this lane reads through{" "}
              <code>IntegrationProvider</code> and cannot write to.
            </p>
            <p className="oa-sub">
              The scripted connections screen shows the intended flow — search, connect,
              approve permissions — but its wizard moves a value in the demo store and
              reaches no registry. The activation checklist&apos;s blockers link there today.
            </p>
            <div className={styles.railActions}>
              <Link href="/app/integrations" className="oa-btn oa-btn--ghost oa-btn--sm">
                <Cable size={13} aria-hidden />
                Scripted connections screen
              </Link>
              <Link href="/app/deploy" className="oa-btn oa-btn--ghost oa-btn--sm">
                <Plug size={13} aria-hidden />
                Activation
              </Link>
            </div>
          </section>

          <section className={`oa-card ${styles.railCard}`} aria-label="Where this comes from">
            <p className="oa-micro">Where this comes from</p>
            <ol className={styles.stateSteps}>
              <li>
                Every row is a <code>ToolGrant</code> in the approved plan
                {view !== null ? ` (${view.plan.planId}, v${view.plan.version})` : ""}. A tool
                no agent asked for does not appear.
              </li>
              <li>
                Connection state is the integrations registry&apos;s answer for that id, read
                fresh on every request and never cached.
              </li>
              <li>
                Read-only versus acting comes from the shared operation registry,{" "}
                <code>lib/plan/operations.ts</code>. An operation it does not know is shown as
                unknown, never as harmless.
              </li>
              <li>
                Whether something blocks go-live is the activation checklist&apos;s answer,
                quoted. This screen does not have its own opinion about that.
              </li>
            </ol>
            {view !== null && view.deployment !== null && (
              <p className="oa-sub">
                Plan v{view.deployment.planVersion} is live as deployment{" "}
                <code>{view.deployment.deploymentId}</code>, activated{" "}
                {formatInstant(view.deployment.activatedAt)} by {view.deployment.activatedBy}.
                Its integrations gate was{" "}
                {view.deployment.integrationsReady ? "satisfied" : "not satisfied"} at go-live —
                so anything blocking above went missing after that, rather than never having
                been there.
              </p>
            )}
            {view !== null && (
              <p className="oa-sub">
                Server clock at this read: {formatInstant(view.now)}.
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

/* ═══════════════════════════ Pieces ═══════════════════════════ */

/**
 * The connection's own state, as an icon that differs per state.
 *
 * Beside a word, never instead of one. Connecting and reconnecting share a
 * picture because they are the same thing happening; the word tells them apart.
 */
function StreamIcon({ status }: { status: RuntimeEventsStatus }) {
  if (status === "live") return <Radio size={13} aria-hidden />;
  if (status === "unsupported") return <WifiOff size={13} aria-hidden />;
  return <RefreshCw size={13} aria-hidden className="oa-spin" />;
}

/**
 * BLOCKED, named and addressed.
 *
 * Distinct from the error box beside it, and the distinction is the point: an
 * error is something that failed and might work on the next try, while this is a
 * gate that has not been passed and will not be by refreshing. It names the gate
 * — the activation checklist's integrations gate, in the checklist's own words —
 * says how many connections it is holding, and links to the checklist and to
 * whatever each blocker itself pointed at.
 *
 * It does NOT restate why each connection blocks. Those sentences belong to the
 * cards below, quoted from the checklist, and repeating them here would be a
 * second copy of a judgement that must have exactly one.
 */
function BlockedByIntegrations({
  gateLabel,
  gateDetail,
  connections,
  unattributed,
}: {
  gateLabel: string;
  /** The checklist's own sentence. Null when it returned no gate at all. */
  gateDetail: string | null;
  connections: number;
  unattributed: BlockerView[];
}) {
  /* One link per distinct destination. Blockers routinely share an href — they
     all point at the connections surface — and four identical links would be
     four tab stops that go to one place. */
  const destinations = [...new Set(unattributed.map((blocker) => blocker.href))];

  return (
    <div className={styles.blockedBox} role="alert">
      <p className={styles.blockedTitle}>
        <ShieldAlert size={16} aria-hidden />
        Blocked: go-live is refused until these connections exist
      </p>
      <p>
        The activation checklist&apos;s <strong>{gateLabel}</strong> is not satisfied.{" "}
        {connections > 0 && (
          <>
            {connections} {connections === 1 ? "connection is" : "connections are"} required by
            the approved plan and not usable — each is in the first group below, with the
            checklist&apos;s own sentence on its card.{" "}
          </>
        )}
        {unattributed.length > 0 && (
          <>
            {unattributed.length}{" "}
            {unattributed.length === 1 ? "blocker names" : "blockers name"} no connection this
            page can show, and {unattributed.length === 1 ? "is" : "are"} listed at the foot of
            the list.{" "}
          </>
        )}
        Pressing go-live now returns this same refusal; nothing here is a warning you can pass.
      </p>
      {gateDetail !== null && <p className={styles.blockedQuote}>{gateDetail}</p>}
      <div className={styles.blockedActions}>
        <Link href="/app/deploy" className="oa-btn oa-btn--primary oa-btn--sm">
          <Plug size={13} aria-hidden />
          Open the activation checklist
        </Link>
        {destinations.map((href) => (
          <Link key={href} href={href} className="oa-btn oa-btn--ghost oa-btn--sm">
            <Cable size={13} aria-hidden />
            Go to {href}
          </Link>
        ))}
      </div>
    </div>
  );
}

function RailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.railRow}>
      <span className={styles.railLabel}>{label}</span>
      <span className={styles.railValue}>{value}</span>
    </div>
  );
}

function UnattributedGrant({ grant }: { grant: GrantView }) {
  const state = runtimeStateMeta(grant.runtimeState);
  return (
    <>
      <strong>{grant.agentName}</strong> ({state.label}) holds a{" "}
      {grant.required ? "required" : "optional"} grant with no integration id
      {grant.purpose === "" ? "" : ` for “${grant.purpose}”`}
      {grant.operationIds.length === 0
        ? ", and it names no operations either."
        : `, covering ${grant.operationIds.join(", ")}.`}
    </>
  );
}

/**
 * The honest empty state.
 *
 * "No integrations" is true and useless: it does not distinguish a plan whose
 * agents genuinely need no tools from one whose grants never crossed the seam.
 * Only the first is normal, and the second would leave a workforce that activates
 * cleanly and cannot do anything.
 */
function EmptyPlan({ planId }: { planId: string }) {
  return (
    <div className={styles.stateBox}>
      <p className={styles.stateTitle}>
        <Cable size={17} aria-hidden />
        This plan asks for no connections at all.
      </p>
      <p>
        Not one agent in <code>{planId}</code> carries a <code>ToolGrant</code>, so there is
        nothing here to connect and the integrations gate has nothing to check. That is
        legitimate for a workforce that only reasons and drafts — and it is also what a plan
        looks like when its grants were dropped on the way across the seam.
      </p>
      <p style={{ margin: 0, fontWeight: 700 }}>Worth checking before you rely on it:</p>
      <ol className={styles.stateSteps}>
        <li>
          Open the plan and confirm the agents genuinely have <code>tools: []</code>. An agent
          that is meant to read email and holds no grant will be refused at its first fetch
          step, not at activation.
        </li>
        <li>
          The activation checklist will pass its integrations gate on an empty plan, because
          there is nothing to require. A green gate here proves nothing about capability.
        </li>
      </ol>
    </div>
  );
}
