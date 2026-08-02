/**
 * lib/runtime/verify/collect.ts — the handoff seam's protocol, as executable checks.
 *
 * WHY THIS FILE EXISTS. `lib/runtime/pipeline/source.ts` shipped with a bug that
 * every other check in this repo was blind to: the claim marker lived in
 * `consumed_at`, Role B's `finalize-handoff` resets `status` alone, and so the
 * FIRST collection of a workforce plan worked and every revision after it was
 * invisible forever. `npm run verify` stayed green throughout, because nothing
 * anywhere collected the same plan twice.
 *
 * That is the shape of the gap, and it is worth naming precisely: the seam was
 * only ever exercised in one direction, once. A handoff is not a one-shot
 * message — Role B revises a plan and re-finalises the SAME row
 * (`workforce_plan_id` is UNIQUE) — so the second cycle is not an edge case, it
 * is the normal case on day two. COLLECT-3 and COLLECT-4 below are that second
 * cycle, and they are the reason this file exists rather than a paragraph in a
 * document.
 *
 * THE INVARIANT UNDER TEST, stated once: `status` is the only thing that gates
 * collection, so `status` back to 'ready' must release a row from EVERY terminal
 * state. Any column this file's implementation writes and later reads back as a
 * precondition would break that, because Role B does not clear it.
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT.
 *
 * These checks run against `StaticHandoffSource`, the in-memory twin, so no
 * database is touched and the target joins the default sweep. That buys the
 * protocol and not the SQL: the conditional UPDATE's exclusivity is a property
 * of Postgres row locking, and `verify:pg` is where executed SQL lives. What
 * makes the twin worth testing is that it mirrors the same rule — status as the
 * sole marker — so a future edit that reintroduces a second precondition on
 * either side turns COLLECT-3 red rather than passing quietly for one release.
 *
 * The honest limit: if someone changes ONLY `SupabaseHandoffSource`'s predicates
 * and leaves the twin alone, this file will not notice. That is the same limit
 * every fixture-backed target in this repo carries, and it is why the
 * implementation keeps both spellings adjacent and commented as a pair.
 *
 * COLLECT-8..14 ARE ABOUT A SECOND SEAM ON THE SAME ROUTE: not what the protocol
 * does with a row, but WHO IS ALLOWED TO ASK. They are here for the same reason
 * COLLECT-3 is — a second shipped bug of the same family, where each end was
 * right and the pair was not.
 *
 * `POST /api/runtime/pipeline` has refused a payload naming an organization
 * outside ORIANT_ALLOWED_ORGANIZATION_IDS since plans started carrying their own
 * owner. `POST /api/runtime/collect {"fixture": true}` built a handoff from
 * ROLE_B_HANDOFF_RESOLVED — a REAL organization uuid out of Role B's seed data —
 * and handed it to the same ingest→build→prove→activate pass with no check at
 * all, so with ORIANT_RUNTIME_TOOLS=composio one anonymous POST activated a
 * workforce acting through that company's connected accounts. Two reviewers
 * found it independently and `npm run verify` was green the whole time, because
 * nothing here had ever asked a route who was allowed to run a handoff.
 *
 * So COLLECT-8..11 go through the ROUTE HANDLERS rather than the source: the
 * fixture arm refused (COLLECT-8), every door refusing identically because they
 * share one gate rather than a copy of it (COLLECT-9), the two configurations
 * that must still run freely (COLLECT-10), and the Supabase arm answering about
 * its own configuration before any allowlist question can arise (COLLECT-11).
 *
 * COLLECT-12..14 ARE THE THIRD BUG OF THAT FAMILY, and the family resemblance is
 * the point. The Supabase arm was left ungated on the reasoning that its
 * organization id comes from Role B's finalize step rather than from the caller
 * — sound as far as it goes, and beside the point, because the writer feeding
 * that table (`POST /api/planner/:workforcePlanId/finalize-handoff`) is itself
 * unauthenticated. An anonymous caller deposits a 'ready' row and collects it,
 * so the id was theirs one hop earlier. PROVENANCE IS NOT AUTHORITY.
 *
 * THOSE THREE CANNOT GO THROUGH THE ROUTE, and that limit is worth stating
 * rather than working around. The Supabase arm needs a configured database
 * before it has a handoff at all, and a verify target that supplied one would be
 * a target that reads a developer's real `role_c_handoffs`. They drive
 * `claimIfPermitted` from lib/runtime/pipeline/gated-claim.ts instead — the
 * single function the route delegates that whole decision to — against
 * `StaticHandoffSource`. What that buys is the property the route cannot show
 * with no database behind it: the refusal lands BEFORE the claim, so a refused
 * row is still 'ready' and still collectable. What it does not buy is proof that
 * the route calls it, which is the same fixture-backed limit COLLECT-3 carries.
 *
 * NOTHING HERE CAN REACH COMPOSIO. `toolsLive` is a field on the session, and
 * these checks INSTALL a session on `globalThis` with that field set and a
 * `StubIntegrationProvider` behind it — so the gate sees the live-tools world it
 * is written for while the hands remain simulated. A target that proved this by
 * configuring real credentials would be a target that emails a real company to
 * prove it must not.
 */

import {
  HandoffPayloadError,
  StaticHandoffSource,
  type CollectedHandoff,
} from "../pipeline/source";
import { POST as collectPOST } from "../../../app/api/runtime/collect/route";
import { POST as pipelinePOST } from "../../../app/api/runtime/pipeline/route";
import { claimIfPermitted } from "../pipeline/gated-claim";
import {
  ALLOWED_ORGANIZATIONS_ENV,
  handoffOrganizationGate,
} from "../pipeline/organization-gate";
import { ROLE_B_HANDOFF_RESOLVED } from "../../plan/fixtures/role-b-handoff";
import { BRIGHTPATH_PLAN } from "../../plan/fixtures/brightpath";
import type { ApprovedPlan } from "../../plan/types";
import { resolveActivePlan } from "../active-plan";
import { LocalPackageGenerator } from "../build/runner";
import { InMemoryBuildStore } from "../build/store";
import type { BuildDeps } from "../build/types";
import { currentPlan, resolvePlanState } from "../current-plan";
import type { ExecutorOptions } from "../executor";
import { FixtureReasoner } from "../llm";
import { InMemorySchedulerStore } from "../schedule/store";
import type { SchedulerDeps } from "../schedule/types";
import type { RuntimeSession } from "../session";
import { FixedClock, InMemoryRunStore, createIdFactory } from "../store";
import { StubIntegrationProvider } from "../tools";
import type { IntegrationProvider } from "../types";

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

/** Role B's own fixture payload, so a drift in their shape fails here too. */
function readyRow(id: string): CollectedHandoff {
  const plan = ROLE_B_HANDOFF_RESOLVED.workforce_plan;
  return {
    id,
    workforcePlanId: plan.id,
    organizationId: ROLE_B_HANDOFF_RESOLVED.organization.id,
    idempotencyKey: `workforce:${plan.id}:v${plan.current_version}`,
    payload: ROLE_B_HANDOFF_RESOLVED,
    status: "ready",
    createdAt: ROLE_B_HANDOFF_RESOLVED.generated_at,
  };
}

/**
 * The same waiting row, owned by somebody else.
 *
 * BOTH PLACES THE ID APPEARS ARE MOVED — the `organization_id` column and the
 * payload's `organization.id` — because that is how Role B's finalize step
 * writes a row, and a fixture that changed only one of them would be testing a
 * divergence rather than a different owner.
 *
 * The two rows this builds share a `workforce_plan_id`, which Postgres forbids
 * (it is UNIQUE) and the in-memory twin does not care about: these checks are
 * about which row the gate looked at, and nothing in them reads a plan id.
 */
function readyRowFor(id: string, organizationId: string): CollectedHandoff {
  const base = readyRow(id);
  return {
    ...base,
    organizationId,
    payload: {
      ...base.payload,
      organization: { ...base.payload.organization, id: organizationId },
    },
  };
}

/**
 * A waiting row whose payload is not a handoff. Cast at the boundary because
 * the whole point is that the column can hold something the type forbids —
 * `payload` is jsonb, and Postgres guarantees JSON and nothing more.
 */
function malformedRow(id: string): CollectedHandoff {
  return {
    ...readyRow(id),
    id,
    payload: { workforce_plan: null } as unknown as CollectedHandoff["payload"],
  };
}

/**
 * What Role B's `finalize-handoff` does to a row: sets `status` back to 'ready'
 * and touches nothing else. Written as its own function because that "nothing
 * else" IS the invariant — if this ever needs a second field to make the row
 * collectable again, the protocol is broken and COLLECT-3 should say so.
 */
function refinalise(source: StaticHandoffSource, id: string): void {
  const rows = source as unknown as { rows: Map<string, { handoff: CollectedHandoff }> };
  const row = rows.rows.get(id);
  if (row) row.handoff = { ...row.handoff, status: "ready" };
}

/* ═══════════ The world COLLECT-8..11 drive the two routes in ═══════════ */

/** Read off the fixture rather than pasted, so an edit there turns these checks
    red instead of quietly pointing them at an organization nobody runs. */
const FIXTURE_ORGANIZATION = ROLE_B_HANDOFF_RESOLVED.organization.id;

/**
 * An organization id that is not the fixture's, standing in for "some other
 * customer this operator did permit". A well-formed uuid on purpose: an
 * obviously fake string would leave "the gate only refuses ids it cannot parse"
 * as a live explanation for a passing check, and the gate parses nothing.
 */
const OTHER_ORGANIZATION = "00000000-0000-4000-8000-000000000000";

/** Where a relative path is resolved against. Never fetched — the handlers are
    called as functions, exactly as in verify:m6 and verify:m7. */
const ROUTE_BASE = "https://app.oriant.invalid";

/** 09:00 Asia/Singapore, the instant verify:e2e pins its pipeline runs to. */
const NOW = "2026-08-01T01:00:00.000Z";

interface SessionGlobal {
  __oriantRuntime?: RuntimeSession;
}

interface GateWorld {
  session: RuntimeSession;
  schedulerStore: InMemorySchedulerStore;
  /**
   * Every organization the pass asked for hands for.
   *
   * `runPipeline` calls `integrationsFor(plan.organizationId)` at the activate
   * stage — the exact line where a live deployment picks up a company's Composio
   * connections — and the route resolves that through `session.toolsFor`.
   * Recording the argument is how COLLECT-8 can prove the refusal landed BEFORE
   * anything asked whose accounts to use, without a real provider to watch.
   */
  requestedFor: string[];
}

/**
 * The session `getRuntimeSession()` caches on `globalThis`, assembled from
 * deterministic pieces instead of from the environment.
 *
 * Going through `lib/runtime/session.ts` would read two env switches, touch a
 * disk and mint random ids — and, with `toolsLive` true, demand COMPOSIO_API_KEY
 * and build real Composio clients. Installing a session is the same substitution
 * verify:m7 makes, and here it is what lets a check assert the live-tools
 * refusal while every hand in the process is still a stub.
 */
function gateWorld(seed: string, toolsLive: boolean): GateWorld {
  const clock = new FixedClock(NOW);
  const runStore = new InMemoryRunStore();
  const buildStore = new InMemoryBuildStore();
  const schedulerStore = new InMemorySchedulerStore();
  const reasoner = new FixtureReasoner();
  const stub = new StubIntegrationProvider();
  const requestedFor: string[] = [];

  const build: BuildDeps = {
    store: buildStore,
    generator: new LocalPackageGenerator(),
    clock,
    newId: createIdFactory(`${seed}-build`),
    sleep: async () => {},
  };
  const scheduler: SchedulerDeps = {
    store: schedulerStore,
    clock,
    newId: createIdFactory(`${seed}-sched`),
  };

  const toolsFor = (organizationId: string): IntegrationProvider => {
    requestedFor.push(organizationId);
    // The stub whatever the organization, mirroring the not-live branch of
    // `toolsFor` in lib/runtime/session.ts. `toolsLive` above is a claim about
    // the DEPLOYMENT that the gate reads; nothing in a verify target may hold a
    // client that can reach a customer.
    return stub;
  };

  const executorWith = (plan: ApprovedPlan): ExecutorOptions => ({
    store: runStore,
    tools: stub,
    reasoner,
    clock,
    newId: createIdFactory(`${seed}-run`),
    sleep: async () => {},
    globalPolicy: plan.globalPolicy,
  });

  const session: RuntimeSession = {
    mode: "fixture",
    // The one field these four checks exist to vary, and the one the gate reads.
    // NOT `mode`: a session can report "fixture" while holding live clients.
    toolsLive,
    storage: "memory",
    dataDir: null,
    seedPlan: BRIGHTPATH_PLAN,
    currentPlan: () => currentPlan(schedulerStore),
    planState: () => resolvePlanState(schedulerStore),
    deployedPlan: async () => {
      const active = await resolveActivePlan(schedulerStore);
      return active.source === "deployment" ? active.plan : null;
    },
    executorFor: executorWith,
    runStore,
    buildStore,
    schedulerStore,
    tools: stub,
    toolsFor,
    reasoner,
    executor: executorWith(BRIGHTPATH_PLAN),
    build,
    scheduler,
    reset: async () => {},
  };

  return { session, schedulerStore, requestedFor };
}

/** Install a session, and hand back the undo. */
function install(world: GateWorld): () => void {
  const container = globalThis as unknown as SessionGlobal;
  const previous = container.__oriantRuntime;
  container.__oriantRuntime = world.session;
  return () => {
    // PUT BACK, NOT DELETED. `npm run verify` runs every target in ONE process
    // and M6/M7 install sessions of their own; a world left behind here would
    // make some later target's result depend on the order the sweep ran in.
    if (previous === undefined) delete container.__oriantRuntime;
    else container.__oriantRuntime = previous;
  };
}

/**
 * Run `body` with these variables set — or, for `null`, unset — and restore the
 * environment afterwards, including when `body` throws.
 *
 * The same shape lib/runtime/verify/tools.ts uses, and for the same reason: the
 * gate reads ORIANT_ALLOWED_ORGANIZATION_IDS at request time, scripts/verify.mjs
 * loads the repository's own `.env` before any target runs, and a variable left
 * behind by this file would silently decide what verify:tools sees next.
 */
async function withEnv<T>(
  vars: Readonly<Record<string, string | null>>,
  body: () => Promise<T>,
): Promise<T> {
  const saved = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(vars)) {
    saved.set(name, process.env[name]);
    if (value === null) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return await body();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function post(path: string, body: unknown): Request {
  return new Request(`${ROUTE_BASE}${path}`, { method: "POST", body: JSON.stringify(body) });
}

/** A route's JSON body, read defensively: a refusal that answered with an array
    or a bare string must fail a check rather than throw out of the target. */
async function jsonOf(response: Response): Promise<Record<string, unknown>> {
  const raw: unknown = await response.json();
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

function nested(body: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = body[key];
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function runCOLLECTVerification(): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean, detail: string) =>
    checks.push({ name, pass, detail });

  /* ═══ COLLECT-1 a waiting row is listed, and listing claims nothing ═══ */
  {
    const source = new StaticHandoffSource([readyRow("h1")]);
    const first = await source.pending();
    const second = await source.pending();
    const claimed = await source.claim("h1");

    add(
      "COLLECT-1 a ready row is listed, twice, and only claim() takes it",
      first.collectable.length === 1 &&
        second.collectable.length === 1 &&
        first.collectable[0]?.id === "h1" &&
        claimed !== null,
      `scan #1 saw ${first.collectable.length}, scan #2 saw ${second.collectable.length} ` +
        `(a scan that consumed would make the second 0), claim ${claimed ? "landed" : "returned null"}`,
    );
  }

  /* ═══ COLLECT-2 the claim is exclusive ═══
     Two collectors polling the same table must not both activate one workforce.
     The second claim has to return null — not throw, and not succeed. */
  {
    const source = new StaticHandoffSource([readyRow("h1")]);
    const winner = await source.claim("h1");
    const loser = await source.claim("h1");
    const afterScan = await source.pending();

    add(
      "COLLECT-2 a second claim of the same row returns null, and the scan drops it",
      winner !== null && loser === null && afterScan.collectable.length === 0,
      `winner=${winner ? "claimed" : "null"} loser=${loser === null ? "null" : "CLAIMED TWICE"} ` +
        `queue after=${afterScan.collectable.length}`,
    );
  }

  /* ═══ COLLECT-3 THE REGRESSION. A consumed plan, revised and re-finalised,
         is collectable again. This is the check the shipped bug failed. ═══ */
  {
    const source = new StaticHandoffSource([readyRow("h1")]);
    await source.claim("h1");
    await source.markConsumed("h1");

    const beforeRefinalise = await source.pending();
    refinalise(source, "h1");
    const afterRefinalise = await source.pending();
    const reclaimed = await source.claim("h1");

    add(
      "COLLECT-3 a consumed handoff, re-finalised by Role B, collects a second time",
      beforeRefinalise.collectable.length === 0 &&
        afterRefinalise.collectable.length === 1 &&
        reclaimed !== null,
      `consumed queue=${beforeRefinalise.collectable.length} (must be 0), ` +
        `after Role B sets status='ready' queue=${afterRefinalise.collectable.length} (must be 1), ` +
        `re-claim ${reclaimed ? "landed" : "RETURNED NULL — the row is wedged and every plan revision is lost"}`,
    );
  }

  /* ═══ COLLECT-4 the same release, from the other terminal state ═══
         A blocked pipeline marks the row failed. Fixing the cause and
         re-finalising has to hand it back exactly as it does after a success. */
  {
    const source = new StaticHandoffSource([readyRow("h1")]);
    await source.claim("h1");
    await source.markFailed("h1", "the integrations gate was shut");

    const beforeRefinalise = await source.pending();
    refinalise(source, "h1");
    const afterRefinalise = await source.pending();
    const reclaimed = await source.claim("h1");

    add(
      "COLLECT-4 a failed handoff, re-finalised by Role B, collects again",
      beforeRefinalise.collectable.length === 0 &&
        afterRefinalise.collectable.length === 1 &&
        reclaimed !== null,
      `failed queue=${beforeRefinalise.collectable.length} (must be 0), ` +
        `after re-finalise queue=${afterRefinalise.collectable.length} (must be 1), ` +
        `re-claim ${reclaimed ? "landed" : "returned null"}`,
    );
  }

  /* ═══ COLLECT-5 the read path writes NOTHING ═══
         An unreadable row is reported as unreadable and left alone. A scan that
         retired it would make GET destructive: a prefetch or an uptime monitor
         would move rows to a terminal state only Role B can undo. */
  {
    const source = new StaticHandoffSource([malformedRow("bad"), readyRow("good")]);
    const first = await source.pending();
    const second = await source.pending();

    const stable =
      first.unreadable.length === 1 &&
      second.unreadable.length === 1 &&
      first.collectable.length === 1 &&
      second.collectable.length === 1;

    add(
      "COLLECT-5 scanning reports an unreadable row without retiring it",
      stable && first.unreadable[0]?.id === "bad" && first.collectable[0]?.id === "good",
      `scan #1 collectable=${first.collectable.length} unreadable=${first.unreadable.length}, ` +
        `scan #2 collectable=${second.collectable.length} unreadable=${second.unreadable.length} ` +
        `(a differing second scan means the read path mutated the queue)`,
    );
  }

  /* ═══ COLLECT-6 the write path DOES retire it ═══
         Claiming a malformed row records the failure and throws, so the caller
         learns the row is dead rather than being told somebody else won it. */
  {
    const source = new StaticHandoffSource([malformedRow("bad")]);
    let threw: unknown = null;
    try {
      await source.claim("bad");
    } catch (err) {
      threw = err;
    }
    const after = await source.pending();

    add(
      "COLLECT-6 claiming an unreadable row retires it and throws HandoffPayloadError",
      threw instanceof HandoffPayloadError &&
        after.collectable.length === 0 &&
        after.unreadable.length === 0,
      `threw=${threw instanceof HandoffPayloadError ? "HandoffPayloadError" : String(threw)}, ` +
        `queue after=${after.collectable.length} collectable / ${after.unreadable.length} unreadable ` +
        `(both 0: the row is 'failed', so it is neither runnable nor still waiting)`,
    );
  }

  /* ═══ COLLECT-7 nothing waiting is not an error ═══
         A poller asking an empty queue is the healthy case, and an empty scan
         must be empty in both buckets rather than throwing. */
  {
    const source = new StaticHandoffSource([]);
    const scan = await source.pending();
    const claimed = await source.claim("nothing-here");

    add(
      "COLLECT-7 an empty queue scans empty and an unknown id claims null",
      scan.collectable.length === 0 && scan.unreadable.length === 0 && claimed === null,
      `collectable=${scan.collectable.length} unreadable=${scan.unreadable.length} ` +
        `claim(unknown)=${claimed === null ? "null" : "CLAIMED A ROW THAT DOES NOT EXIST"}`,
    );
  }

  /* ═══ COLLECT-8 THE SECOND REGRESSION. The fixture arm is behind the
         organization gate, and the refusal lands before anything runs. ═══
         Live tools, an allowlist that permits somebody else, and the stored
         handoff naming a real organization: this is the shipped bypass, written
         down. The three reads after the response are the refusal's own promise
         — "nothing was ingested, built, recorded as the current plan, or
         activated" — asserted rather than believed. */
  {
    const world = gateWorld("gate-refused", true);
    const restore = install(world);
    let status = 0;
    let body: Record<string, unknown> = {};
    try {
      const response = await withEnv({ [ALLOWED_ORGANIZATIONS_ENV]: OTHER_ORGANIZATION }, () =>
        collectPOST(post("/api/runtime/collect", { fixture: true })),
      );
      status = response.status;
      body = await jsonOf(response);
    } finally {
      restore();
    }

    const allowlist = nested(body, "allowlist");
    const current = await world.schedulerStore.getCurrentPlan();
    const deployments = await world.schedulerStore.listDeployments();
    // THE COUNT, NEVER THE IDS: the permitted id must appear nowhere in what an
    // anonymous caller is handed back. The refused id may — it is their own input.
    const leaked = JSON.stringify(body).includes(OTHER_ORGANIZATION);

    add(
      'COLLECT-8 POST {"fixture": true} is refused 403 when live tools are on and the fixture\'s organization is not permitted',
      status === 403 &&
        body.code === "organization_not_allowlisted" &&
        body.organizationId === FIXTURE_ORGANIZATION &&
        allowlist.permitted === 1 &&
        !leaked &&
        world.requestedFor.length === 0 &&
        current === null &&
        deployments.length === 0,
      `status=${status} (403 required) code=${String(body.code)} ` +
        `organizationId=${String(body.organizationId)} (the fixture names ${FIXTURE_ORGANIZATION}), ` +
        `allowlist.permitted=${String(allowlist.permitted)} and the permitted id itself ` +
        `${leaked ? "LEAKED INTO THE BODY" : "never appears"}, hands requested for ` +
        `${world.requestedFor.length} organization(s) (0 required — anything else means the ` +
        `pass reached activation), current plan ${current === null ? "unwritten" : "WRITTEN"}, ` +
        `deployments=${deployments.length}`,
    );
  }

  /* ═══ COLLECT-9 ONE GATE, NOT THREE SPELLINGS OF ONE ═══
         The bug COLLECT-8 covers was a rule that lived on one route while a
         second route ran the same payload, so the repair has to be shared rather
         than copied. Identical bodies is the property that says it still is: a
         future edit that re-inlines the refusal into any handler passes
         COLLECT-8 and fails here the moment the copy drifts by a word.

         THE THIRD DOOR IS ASKED DIRECTLY. `POST /api/runtime/collect {}` cannot
         answer without a database, so its refusal is taken from
         `handoffOrganizationGate` — the function that route reaches through
         `claimIfPermitted`, called with the row the Supabase arm would have
         read. Its body has to match the other two to the byte: three doors, one
         sentence, or the asymmetry that caused all of this grows back. */
  {
    const world = gateWorld("gate-shared", true);
    const restore = install(world);
    let collectStatus = 0;
    let pipelineStatus = 0;
    let storedStatus = 0;
    let collectBody = "";
    let pipelineBody = "";
    let storedBody = "";
    try {
      await withEnv({ [ALLOWED_ORGANIZATIONS_ENV]: OTHER_ORGANIZATION }, async () => {
        const collected = await collectPOST(post("/api/runtime/collect", { fixture: true }));
        const piped = await pipelinePOST(post("/api/runtime/pipeline", { fixture: true }));
        const stored = handoffOrganizationGate(readyRow("h1"), true);
        collectStatus = collected.status;
        pipelineStatus = piped.status;
        storedStatus = stored === null ? 0 : stored.status;
        collectBody = JSON.stringify(await jsonOf(collected));
        pipelineBody = JSON.stringify(await jsonOf(piped));
        storedBody = stored === null ? "" : JSON.stringify(stored.body);
      });
    } finally {
      restore();
    }

    const identical = collectBody === pipelineBody && collectBody === storedBody;

    add(
      "COLLECT-9 all three doors answer the same refusal, because they share one gate rather than a copy of it",
      collectStatus === 403 && pipelineStatus === 403 && storedStatus === 403 && identical,
      `collect=${collectStatus} pipeline=${pipelineStatus} stored=${storedStatus}, bodies ` +
        `${identical ? "identical" : "DIFFER"}` +
        (identical
          ? ""
          : `\n        collect:  ${collectBody}\n        pipeline: ${pipelineBody}` +
            `\n        stored:   ${storedBody}`),
    );
  }

  /* ═══ COLLECT-10 THE TWO WAYS IT STILL RUNS ═══
         A gate that refused everything would satisfy COLLECT-8 and break the
         product, so both open paths are asserted here. Permitting the fixture's
         organization lets it through; and with tools OFF — the default, the demo,
         a clean clone — the allowlist is not consulted at all, because every
         `act` step is a stub call that reaches nobody and restricting a
         simulation buys no safety. */
  {
    const permitted = gateWorld("gate-permitted", true);
    let permittedStatus = 0;
    let permittedBody: Record<string, unknown> = {};
    {
      const restore = install(permitted);
      try {
        // Two entries, with whitespace, because the parser trims and this is the
        // shape an operator's real value has.
        const response = await withEnv(
          { [ALLOWED_ORGANIZATIONS_ENV]: `${OTHER_ORGANIZATION}, ${FIXTURE_ORGANIZATION}` },
          () => collectPOST(post("/api/runtime/collect", { fixture: true })),
        );
        permittedStatus = response.status;
        permittedBody = await jsonOf(response);
      } finally {
        restore();
      }
    }

    const stubbed = gateWorld("gate-stub", false);
    let stubbedStatus = 0;
    let stubbedBody: Record<string, unknown> = {};
    {
      const restore = install(stubbed);
      try {
        // Unset, which permits NOTHING when tools are live — so this arm passing
        // is entirely down to `toolsLive` being false.
        const response = await withEnv({ [ALLOWED_ORGANIZATIONS_ENV]: null }, () =>
          collectPOST(post("/api/runtime/collect", { fixture: true })),
        );
        stubbedStatus = response.status;
        stubbedBody = await jsonOf(response);
      } finally {
        restore();
      }
    }

    // Not "the pipeline completed": that is E2E-3's assertion about the handoff,
    // and this check is about the door. `pipeline` present plus the hands having
    // been asked for is what says the pass really ran rather than being refused.
    const ran = (body: Record<string, unknown>, world: GateWorld): boolean =>
      body.collected === true &&
      Object.keys(nested(body, "pipeline")).length > 0 &&
      world.requestedFor.includes(FIXTURE_ORGANIZATION);

    add(
      "COLLECT-10 the fixture arm still runs when the organization is permitted, and when tools are off whatever the allowlist says",
      permittedStatus !== 403 &&
        stubbedStatus !== 403 &&
        ran(permittedBody, permitted) &&
        ran(stubbedBody, stubbed),
      `permitted: status=${permittedStatus} collected=${String(permittedBody.collected)} ` +
        `hands asked for [${permitted.requestedFor.join(", ")}]; ` +
        `tools off, allowlist unset: status=${stubbedStatus} ` +
        `collected=${String(stubbedBody.collected)} hands asked for ` +
        `[${stubbed.requestedFor.join(", ")}] (a 403 in either column would mean the gate ` +
        `is refusing a pass that reaches nobody)`,
    );
  }

  /* ═══ COLLECT-11 THE SUPABASE ARM ANSWERS FOR ITSELF FIRST ═══
         This check used to assert that arm was ungated, which is the hole
         COLLECT-12..14 close. It still asserts a 503, and now for a different
         and narrower reason: THE GATE IS PER-HANDOFF, and with no database there
         is no handoff to gate. A collector pointed at nothing must say so.
         Asserted in the very configuration that refuses the fixture arm 403, so
         a gate that crept up the handler to a place where it refuses requests it
         has not even read a row for shows up here as a 403 where a 503 belongs —
         and that ordering matters, because "which organization?" is a question
         about a row and "is Supabase configured?" is a question about the
         server. */
  {
    const world = gateWorld("gate-supabase", true);
    const restore = install(world);
    let status = 0;
    let body: Record<string, unknown> = {};
    try {
      const response = await withEnv(
        {
          [ALLOWED_ORGANIZATIONS_ENV]: OTHER_ORGANIZATION,
          // Unset so this arm answers from its own configuration check and never
          // reaches a network: scripts/verify.mjs loads the repository's `.env`,
          // and a developer with real Supabase credentials would otherwise have
          // this check query their database.
          NEXT_PUBLIC_SUPABASE_URL: null,
          SUPABASE_SERVICE_ROLE_KEY: null,
        },
        () => collectPOST(post("/api/runtime/collect", {})),
      );
      status = response.status;
      body = await jsonOf(response);
    } finally {
      restore();
    }

    add(
      "COLLECT-11 the Supabase arm answers about its own configuration first: no database, no handoff to gate, 503 not 403",
      status === 503 && body.code === "SUPABASE_NOT_CONFIGURED",
      `status=${status} code=${String(body.code)} — 503/SUPABASE_NOT_CONFIGURED required; ` +
        `403 here would mean the gate had moved ahead of the row it is supposed to ` +
        `be asking about`,
    );
  }

  /* ═══ COLLECT-12 THE THIRD REGRESSION. A stored handoff is gated too, and the
         refusal lands BEFORE the claim ═══
         The Supabase arm ran `role_c_handoffs` rows past the allowlist entirely,
         on the reasoning that Role B's finalize step wrote the organization
         rather than the caller. That writer is unauthenticated, so an anonymous
         caller deposits a row and then collects it — the id is theirs, one hop
         earlier.

         THE ORDER IS HALF THE CHECK. Refusing after the claim would leave the
         row 'consumed' with nothing deployed: invisible to every scan, and
         `workforce_plan_id` is UNIQUE so there is no second row to collect
         instead. The queue read after the refusal, and the successful claim once
         the operator permits the organization, are that property asserted rather
         than believed — the SAME row, unchanged, running later. */
  {
    const source = new StaticHandoffSource([readyRow("h1")]);
    let outcome = "";
    let status = 0;
    let code: unknown = null;
    let refused: unknown = null;

    await withEnv({ [ALLOWED_ORGANIZATIONS_ENV]: OTHER_ORGANIZATION }, async () => {
      const attempt = await claimIfPermitted(source, undefined, true);
      outcome = attempt.outcome;
      if (attempt.outcome === "refused") {
        status = attempt.refusal.status;
        code = attempt.refusal.body.code;
        refused = attempt.refusal.body.organizationId;
      }
    });

    const after = await source.pending();
    const later = await withEnv({ [ALLOWED_ORGANIZATIONS_ENV]: FIXTURE_ORGANIZATION }, () =>
      claimIfPermitted(source, undefined, true),
    );

    add(
      "COLLECT-12 a stored handoff for an unpermitted organization is refused before the claim, and the row stays 'ready'",
      outcome === "refused" &&
        status === 403 &&
        code === "organization_not_allowlisted" &&
        refused === FIXTURE_ORGANIZATION &&
        after.collectable.length === 1 &&
        later.outcome === "claimed",
      `outcome=${outcome} status=${status} code=${String(code)} ` +
        `organizationId=${String(refused)} (the row names ${FIXTURE_ORGANIZATION}), ` +
        `queue after the refusal=${after.collectable.length} (must be 1 — a 0 means the ` +
        `row was claimed and only then refused, which strands it 'consumed' with ` +
        `nothing deployed until Role B re-finalises), and once its organization is ` +
        `permitted the same row ` +
        `${later.outcome === "claimed" ? "claims and runs" : `answers ${later.outcome}`}`,
    );
  }

  /* ═══ COLLECT-13 NAMING A ROW DOES NOT WALK ROUND THE GATE ═══
         `POST {"handoffId": "…"}` used to skip the scan entirely and go straight
         to the claim, which is exactly the shape of edit that would put the gate
         on one path and not the other for a third time. The allowlist here
         permits the OLDEST row's organization and not the named row's, so a gate
         that checked whatever `pending()` returned first would let this through
         and a gate that follows the target refuses it. Both rows must still be
         waiting afterwards: the refused one because it was never claimed, the
         permitted one because nobody asked for it. */
  {
    const source = new StaticHandoffSource([
      readyRowFor("older", OTHER_ORGANIZATION),
      readyRowFor("named", FIXTURE_ORGANIZATION),
    ]);
    let outcome = "";
    let refused: unknown = null;

    await withEnv({ [ALLOWED_ORGANIZATIONS_ENV]: OTHER_ORGANIZATION }, async () => {
      const attempt = await claimIfPermitted(source, "named", true);
      outcome = attempt.outcome;
      if (attempt.outcome === "refused") refused = attempt.refusal.body.organizationId;
    });

    const after = await source.pending();

    add(
      "COLLECT-13 an explicitly named handoff is gated on ITS organization, not on whichever row is next in the queue",
      outcome === "refused" && refused === FIXTURE_ORGANIZATION && after.collectable.length === 2,
      `outcome=${outcome} (refused required) organizationId=${String(refused)} — must be ` +
        `${FIXTURE_ORGANIZATION}, the named row's owner, not ${OTHER_ORGANIZATION}, the ` +
        `permitted owner of the row that happened to be first; queue after=` +
        `${after.collectable.length} of 2 (neither row may be claimed)`,
    );
  }

  /* ═══ COLLECT-14 THE THREE WAYS THE STORED ARM STILL WORKS ═══
         A gate that refused everything would satisfy COLLECT-12 and break the
         automated lane this route exists to be. Permitting the row's
         organization collects it; with tools OFF — the default, the demo, a
         clean clone — the allowlist is not consulted at all, because every `act`
         step is a stub call that reaches nobody. And an EMPTY QUEUE must still
         answer "nothing waiting" rather than a refusal: the gate fails closed on
         an unreadable owner, and that must never turn a poller's idle tick into
         a 403 about an organization nobody named. */
  {
    const permitted = new StaticHandoffSource([readyRow("h1")]);
    const permittedAttempt = await withEnv(
      // Two entries, with whitespace, because the parser trims and this is the
      // shape an operator's real value has.
      { [ALLOWED_ORGANIZATIONS_ENV]: `${OTHER_ORGANIZATION}, ${FIXTURE_ORGANIZATION}` },
      () => claimIfPermitted(permitted, undefined, true),
    );

    const stubbed = new StaticHandoffSource([readyRow("h1")]);
    // Unset, which permits NOTHING when tools are live — so this arm claiming is
    // entirely down to `toolsLive` being false.
    const stubbedAttempt = await withEnv({ [ALLOWED_ORGANIZATIONS_ENV]: null }, () =>
      claimIfPermitted(stubbed, undefined, false),
    );

    const idle = new StaticHandoffSource([]);
    const idleAttempt = await withEnv({ [ALLOWED_ORGANIZATIONS_ENV]: null }, () =>
      claimIfPermitted(idle, undefined, true),
    );

    add(
      "COLLECT-14 the stored arm still collects when the organization is permitted, when tools are off, and answers empty on an empty queue",
      permittedAttempt.outcome === "claimed" &&
        stubbedAttempt.outcome === "claimed" &&
        idleAttempt.outcome === "empty",
      `permitted=${permittedAttempt.outcome} (live tools, organization on the list); ` +
        `tools off with the allowlist unset=${stubbedAttempt.outcome}; ` +
        `empty queue with live tools and nothing permitted=${idleAttempt.outcome} ` +
        `(a refusal in any column means the gate is refusing a pass that reaches ` +
        `nobody, or refusing on behalf of a row that does not exist)`,
    );
  }

  return checks;
}

export function formatResults(results: Check[]): string {
  const lines = results.map(
    (r) => `${r.pass ? "PASS" : "FAIL"}  ${r.name}\n        ${r.detail}`,
  );
  const failed = results.filter((r) => !r.pass).length;
  lines.push("");
  lines.push(
    failed === 0
      ? `COLLECT OK — ${results.length}/${results.length} checks passed.`
      : `COLLECT BROKEN — ${failed} of ${results.length} checks failed.`,
  );
  return lines.join("\n");
}
