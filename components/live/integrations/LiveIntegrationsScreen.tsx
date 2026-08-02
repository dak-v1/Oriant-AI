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
    "Your browser could not reach the app at all. Check that it is running and that you are " +
    "still connected to it.",
  http: "The app answered, and the answer was a refusal. Its reason is above.",
  malformed:
    "The answer came back in a form this screen could not read, so nothing was shown from it " +
    "on purpose: a partly-read list of connections would be missing exactly the row you " +
    "cannot see is missing.",
  unknown: "The failure did not say what it was, which is itself worth reporting.",
};

/**
 * Whose connected accounts these are, in this screen's own words.
 *
 * The disclosure itself is not this screen's invention and must not be dropped:
 * a page that reports eight live connections on a deployment where nobody
 * authorised anything is the most convincing lie in the product. What IS this
 * screen's job is saying it in a sentence an owner can act on, rather than
 * quoting one written around an organisation identifier and an environment
 * variable that mean nothing to them.
 */
const PROVIDER_NOTE: Record<"stub" | "external" | "unknown", { title: string; body: string }> = {
  stub: {
    title: "These connections are examples, not real ones",
    body:
      "Nothing here was actually authorised: this workspace reports the same tools connected " +
      "on every machine, they cannot expire, and no account is behind them. Treat every " +
      "“Connected” below as an example rather than as proof your agents can reach anything.",
  },
  external: {
    title: "Whose connected accounts these are",
    body:
      "These come from real connected accounts. Where a workspace has been set up with sample " +
      "data, those accounts can belong to another organisation and be borrowed for it — so " +
      "what you see is real, but not necessarily yours.",
  },
  unknown: {
    title: "This app cannot say whose connections these are",
    body:
      "It could not be established whose connected accounts your agents would act through. " +
      "Every connection below is therefore shown as needed and going live is blocked. " +
      "Nothing was read from any other organisation's connections.",
  },
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
            it, and whether anything missing is holding up going live.
          </p>
        </div>
        <div className={styles.headSide}>
          {view?.mode === "live" ? (
            <span className="oa-tag oa-tag--amber">Actions are real</span>
          ) : view?.mode === "fixture" ? (
            <span className="oa-tag oa-tag--teal">Practice mode — nothing is sent</span>
          ) : (
            <span className="oa-tag oa-tag--neutral">
              Cannot tell whether actions are real
            </span>
          )}
          {blocked ? (
            <span className="oa-tag oa-tag--amber">
              {blocking > 0 ? `${blocking} blocking go-live` : "Go-live blocked"}
            </span>
          ) : rows.length > 0 ? (
            <span className="oa-tag oa-tag--teal">Nothing blocking go-live</span>
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
            {stream.detail} Connection states themselves are never pushed here, so a tool you
            connect somewhere else shows up when you come back to this page or press Refresh.
          </span>
        </span>
        <span className={styles.streamRead}>
          {busy || loading
            ? "Loading now."
            : readAt === null
              ? "Nothing has loaded yet."
              : `Last updated at ${readAt.toLocaleTimeString()}.`}
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
              : "Your connections could not be loaded"}
          </p>
          {/* The raw reason, except when the answer was unreadable — there the
              reason names a field for a developer, and the sentence below it is
              the one an owner can act on. */}
          {failure.kind !== "malformed" && (
            <p className={styles.errorDetail}>{failure.message}</p>
          )}
          <p>{FAILURE_ADVICE[failure.kind]}</p>
          {view !== null && (
            <p>
              The cards below are what was last confirmed, at{" "}
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
          gateLabel={gate?.label ?? "the connections check"}
          gateDetail={gate?.detail ?? null}
          connections={blocking}
          unattributed={unattributed}
        />
      )}

      {/* The provider disclosure renders in EVERY state, external included. It
          used to be skipped for an external registry, which read as "these are
          your workspace connections" on the one deployment where they are not.
          The route decides WHICH of the three cases this is; the wording is
          this screen's, because the route's own sentence is written around an
          organisation identifier and an environment variable that mean nothing
          to the person reading this page. Nothing the sentence asserts was
          dropped — see PROVIDER_NOTE. */}
      {view !== null && (
        <div className={styles.callout}>
          <span className={styles.calloutIcon} aria-hidden>
            <Info size={17} />
          </span>
          <div className={styles.calloutText}>
            <p className={styles.calloutTitle}>
              {PROVIDER_NOTE[view.provider.kind ?? "unknown"].title}
            </p>
            <p className="oa-sub">{PROVIDER_NOTE[view.provider.kind ?? "unknown"].body}</p>
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
                The go-live checks said nothing about connections
              </p>
              <p>
                Nothing on this screen can say what is blocking going live, because the one
                place that decides it did not answer. The connections below are still
                listed; treat every &ldquo;not blocking&rdquo; on this page as unproven
                until the checks run again.
              </p>
            </div>
          )}

          {view !== null && rows.length === 0 && <EmptyPlan />}

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
                  The go-live checks raised these and they match no connection above — usually
                  a permission in your plan that names no tool at all — so no card can carry
                  them. They stop go-live all the same.
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
                  Permissions that name no tool
                </h2>
                <p className="oa-sub">
                  These permissions name no tool at all, so there is nothing to check a
                  connection against. That is a problem in your plan rather than a connection
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
              <RailRow label="Named in your plan" value={String(rows.length)} />
              <RailRow label="Blocking go-live" value={String(blocking)} />
              <RailRow label="Connected and usable" value={String(grouped.get("connected")?.length ?? 0)} />
              <RailRow label="Need attention" value={String(attention)} />
              <RailRow label="Not connected" value={String(grouped.get("unconnected")?.length ?? 0)} />
              <RailRow
                label="Last updated"
                value={readAt ? readAt.toLocaleTimeString() : "—"}
              />
            </div>
            {gate !== null && (
              <p className="oa-sub">
                Connections check: <strong>{gate.satisfied ? "passing" : "not passing"}</strong>.{" "}
                {gate.detail}
              </p>
            )}
            {(grouped.get("unconnected")?.length ?? 0) > 0 && (
              <p className="oa-sub">
                &ldquo;Degrade gracefully&rdquo; is your plan&apos;s phrase for an optional
                connection, not a description of what actually happens. What happens when a
                tool is missing is on each not-connected card.
              </p>
            )}
          </section>

          <section className={`oa-card ${styles.railCard}`} aria-label="What this screen cannot tell you">
            <p className="oa-micro">What this screen cannot tell you</p>
            <p className="oa-sub">
              Expiry and re-authorisation warnings belong here. Nothing in this app records
              them, so they are named as missing rather than estimated — an invented renewal
              date would be the only made-up fact on a screen where everything else is checked.
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
              deliberately offers no button that looks like it might. This page only reads
              your connections; it cannot change them.
            </p>
            <p className="oa-sub">
              The sample connections screen shows the intended flow — search, connect, approve
              permissions — but nothing it does is real. The go-live checks link there for now.
            </p>
            <div className={styles.railActions}>
              <Link href="/app/integrations" className="oa-btn oa-btn--ghost oa-btn--sm">
                <Cable size={13} aria-hidden />
                Sample connections screen
              </Link>
              <Link href="/app/deploy" className="oa-btn oa-btn--ghost oa-btn--sm">
                <Plug size={13} aria-hidden />
                Go-live checks
              </Link>
            </div>
          </section>

          <section className={`oa-card ${styles.railCard}`} aria-label="Where this comes from">
            <p className="oa-micro">Where this comes from</p>
            <ol className={styles.stateSteps}>
              <li>
                Every row is a permission your approved plan grants
                {view !== null ? ` (version ${view.plan.version})` : ""}. A tool no agent asked
                for does not appear.
              </li>
              <li>
                Connection state is read fresh every time this page loads, and never cached.
              </li>
              <li>
                Whether something only reads or can act on your behalf comes from a shared list
                of known actions. An action that is not on it is shown as unrecognised, never
                as harmless.
              </li>
              <li>
                Whether something blocks going live is the go-live checks&apos; answer, quoted.
                This screen does not have its own opinion about that.
              </li>
            </ol>
            {view !== null && view.deployment !== null && (
              <p className="oa-sub">
                Plan version {view.deployment.planVersion} has been live since{" "}
                {formatInstant(view.deployment.activatedAt)}, put live by{" "}
                {view.deployment.activatedBy}. Its connections check was{" "}
                {view.deployment.integrationsReady ? "passing" : "not passing"} at that point —
                so anything blocking above went missing since, rather than never having been
                there.
              </p>
            )}
            {view !== null && (
              <p className="oa-sub">Current time: {formatInstant(view.now)}.</p>
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
        Blocked: going live is refused until these connections exist
      </p>
      <p>
        <strong>{gateLabel}</strong> is not passing.{" "}
        {connections > 0 && (
          <>
            {connections} {connections === 1 ? "connection is" : "connections are"} needed by
            your approved plan and not usable — each is in the first group below, with the
            go-live checks&apos; own sentence on its card.{" "}
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
          Open the go-live checks
        </Link>
        {destinations.map((href) => (
          <Link key={href} href={href} className="oa-btn oa-btn--ghost oa-btn--sm">
            <Cable size={13} aria-hidden />
            Fix this
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
      {grant.required ? "needed" : "optional"} permission that names no tool
      {grant.purpose === "" ? "" : ` for “${grant.purpose}”`}
      {grant.operationIds.length === 0
        ? ", and it names no actions either."
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
function EmptyPlan() {
  return (
    <div className={styles.stateBox}>
      <p className={styles.stateTitle}>
        <Cable size={17} aria-hidden />
        Your plan asks for no connections at all.
      </p>
      <p>
        Not one agent in your plan is given a tool, so there is nothing here to connect and the
        connections check has nothing to look at. That is perfectly normal for a workforce that
        only thinks and drafts — and it is also what a plan looks like when its tool permissions
        went missing on the way in.
      </p>
      <p style={{ margin: 0, fontWeight: 700 }}>Worth checking before you rely on it:</p>
      <ol className={styles.stateSteps}>
        <li>
          Open your plan and confirm the agents genuinely need no tools. An agent that is meant
          to read email but is given no tool will be refused at its first step, not at go-live.
        </li>
        <li>
          The connections check passes on a plan with no connections, because there is nothing
          to require. A green check here proves nothing about what your agents can do.
        </li>
      </ol>
    </div>
  );
}
