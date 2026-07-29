/**
 * lib/runtime/verify/m5.ts — the M5 exit criterion, as an executable check.
 *
 * ROLE_C_PLAN calls M5 the product's core loop and exits on one sentence:
 * "scheduled run fires → agent pauses → approval appears → owner edits and
 * approves → run resumes and completes → Workspace reflects it", with no
 * fixtures bypassed. M5-1 is that sentence and nothing else, walked through the
 * real modules in the real order — `activate` behind its three gates,
 * `runDueWork` against a `FixedClock` that has just reached the cron minute,
 * `pendingApprovals` for the inbox, `decideAndResume` for the decision, and the
 * store reads the Operate surface makes for the last clause.
 *
 * WHAT "NO FIXTURES BYPASSED" MEANS HERE, because the phrase is easy to nod at
 * and hard to hold to. The BrightPath plan, the stub tools and the fixture
 * reasoner are INPUTS — they are the contract's own data and the M3 determinism
 * guarantee depends on them. What is bypassed is a shortcut around a module:
 * a hand-built `ApprovalRequest`, a `RunState` written straight into the store,
 * a decision recorded without the executor being asked to act on it. There is
 * exactly one constructed record in this file (M5-8's drifted package, which is
 * the thing being simulated) and it is called out where it appears. Every
 * approval below was raised by policy.ts breaching `invoice.amount <= 500` on a
 * run the Friday cron started unattended.
 *
 * A CHECK THAT CANNOT FAIL IS NOT A CHECK. This repo spent a round deleting
 * assertions that could not go red, so every guarantee below is paired with the
 * thing that would break it:
 *
 *   - M5-2 compares what was SENT against a merge this file computes for itself
 *     from the contract's words, and against the agent's original proposal. A
 *     replay of the frozen args instead of the merge fails the first half; a
 *     replacement instead of a patch fails the second.
 *   - M5-3 drives all three arms — an edit that changed something, an approval
 *     with no edits at all, and an "edit" that round-trips the proposal
 *     unchanged. Only the first may produce a second version.
 *   - M5-5 asks the double-send question twice, because the two shapes reach
 *     different guards: sequentially the run has already completed and
 *     `decideAndResume` refuses before writing, concurrently both callers pass
 *     that check and the write-once decision slot is the only thing left.
 *   - M5-7 runs the same loop WITHOUT the dependency handoff wired. That control
 *     is the point of the check: the failure it guards against is silent — no
 *     error, no retry, a chained workflow that simply never becomes due — so the
 *     only way to prove the handoff is load-bearing is to watch the chain not
 *     fire when it is missing.
 *   - M5-8 hands the resume a package with a step inserted ahead of the paused
 *     one. Without the executor's drift guard the frozen send executes against
 *     the wrong step, and the assertion that nothing was sent is what catches it.
 *
 * EACH CHECK GETS A FRESH WORLD, for the same reason as M4: sharing one store
 * across eight checks would be cheaper and would hide the class of bug this
 * milestone is most likely to have — an approval, a decision or a queued job
 * surviving a boundary it should not have survived. The sandbox verdict is the
 * one thing built once and reused, because it is evidence about the plan rather
 * than about any particular inbox.
 *
 * THE EDIT IS A PATCH, AND THAT IS THE WHOLE OF WHAT M5-2 IS ABOUT.
 * `ApprovalDecision.editedArgs` is laid OVER the frozen invocation, so the
 * expected result is `{ ...proposed, ...edited }` — computed in this file rather
 * than read back from `resolvedApprovalArgs`, because a verifier that asks the
 * implementation what the answer should be has proved only that the
 * implementation agrees with itself. `SARAH_EDIT` deliberately exercises all
 * three change kinds (one key changed, one added, one cleared), since `cleared`
 * is the one a JSON round trip through a store is most likely to lose.
 *
 * WHAT A "WORKSPACE READ" IS IN A HEADLESS CHECK. The live Operate screens are
 * client components behind an opt-in lane switch, and they read the runtime
 * through `/api/runtime/*`. Those routes are thin: the Approvals inbox is
 * `pendingApprovals`, the review drawer is `approvalRecord`, the run list is
 * `RunStore.listRuns`, the schedule panel is the trigger and job tables. So M5-1
 * asserts against those five reads, which is the same data the screen renders
 * and one layer below the JSON. It does NOT prove any pixel; the live UI is
 * unverified here and ROLE_C_PLAN says so.
 *
 * DETERMINISM IS AN M3 EXIT CRITERION AND MUST NOT REGRESS. Clock, ids, tools
 * and reasoner are pinned exactly as in the sandbox, and M5-9 builds the whole
 * loop twice under identical seeds and compares the two worlds byte for byte —
 * runs, events, approvals, decisions, versions, queue, triggers, and the tool
 * client's own call log, which is the one record that would notice an edit
 * arriving at the integration in a different shape.
 *
 * Run it with: npm run verify:m5
 */

import { BRIGHTPATH_PLAN } from "../../plan/fixtures/brightpath";
import type { StepSpec } from "../../plan/types";
import {
  approvalDeadline,
  approvalRecord,
  dependencyFanOut,
  isPastDue,
  overdueApprovals,
  pendingApprovals,
} from "../approvals";
import type { ApprovalVersion, PendingApproval } from "../approvals";
import { LocalPackageGenerator, buildPlan, loadBundle } from "../build/runner";
import { InMemoryBuildStore } from "../build/store";
import type { BuildDeps } from "../build/types";
import { ApprovalNotActionableError, decideAndResume } from "../executor";
import type { ExecutorOptions, RunOutcome } from "../executor";
import { FixtureReasoner } from "../llm";
import { runSuite } from "../sandbox/runner";
import { BRIGHTPATH_SCENARIOS } from "../sandbox/scenarios";
import { runStressSweep } from "../sandbox/stress";
import type { SandboxVerdict } from "../sandbox/types";
import { FixedSandboxEvidence, activate } from "../schedule/activation";
import type { ActivationDeps, ActivationResult } from "../schedule/activation";
import { InMemorySchedulerStore } from "../schedule/store";
import { triggerIdFor } from "../schedule/triggers";
import type { QueuedJob, SchedulerDeps } from "../schedule/types";
import { runDueWork } from "../schedule/worker";
import type { WorkSummary } from "../schedule/worker";
import { FixedClock, InMemoryRunStore, createIdFactory } from "../store";
import { StubIntegrationProvider } from "../tools";
import type {
  AgentBundle,
  ApprovalDecision,
  ApprovalRequest,
  RunState,
  ToolInvocation,
} from "../types";

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

/* ═══════════════════════════ The fixture ═══════════════════════════ */

/** The agent, the workflow that pauses, and the workflow chained behind it. */
const FINANCE = "finance-followup";
const SWEEP = "payment-reminder-drafting";
const SUMMARY = "overdue-invoice-summary";
const OWNER = "user_sarah_chen";

/** The one operation that must never happen twice, and must not happen at all
    on a rejection or a drifted resume. */
const SEND = "gmail.messages.send";

/**
 * Read off the plan rather than restated, so a fixture edit shows up as a red
 * check here instead of as a check quietly proving the wrong agent.
 */
const financeSpec = BRIGHTPATH_PLAN.agents.find((agent) => agent.id === FINANCE);

const SWEEP_TRIGGER_ID = triggerIdFor(BRIGHTPATH_PLAN.planId, FINANCE, SWEEP);
const SUMMARY_TRIGGER_ID = triggerIdFor(BRIGHTPATH_PLAN.planId, FINANCE, SUMMARY);

/* ═══════════════════════════ Instants ═══════════════════════════ */

/*
 * UTC, annotated with the wall clock Sarah reads. Every rule under test — the
 * cron, the quiet window, `escalateAfterMins` — is stated in Singapore time and
 * none of them is stated in UTC.
 */

/** Friday 08:30 Asia/Singapore: activation, half an hour before the sweep. */
const ACTIVATED_AT = "2026-07-24T00:30:00.000Z";
/** Friday 09:00 Asia/Singapore. The cron minute; the approval is raised here. */
const FRIDAY_0900 = "2026-07-24T01:00:00.000Z";

/** How long the sweep sits in the inbox before Sarah opens it. */
const REVIEW_DELAY_MS = 40 * 60_000;
/** The half hour between go-live and the cron minute. */
const UNTIL_CRON_MS = 30 * 60_000;

const MS_PER_MINUTE = 60_000;

/* ═══════════════════════════ The owner's edit ═══════════════════════════ */

/**
 * What Sarah changes before approving, and why it is shaped like this.
 *
 * The frozen invocation's args are the reasoning step's output —
 * `{ fixture, instruction, source, itemCount }` — so an edit that touched only a
 * key the agent never set would prove nothing about merging. This one moves all
 * three kinds `diffArgs` distinguishes:
 *
 *   changed — `instruction`, the draft itself, which is the field an owner
 *             actually rewrites;
 *   added   — `cc`, a key the proposal did not have;
 *   cleared — `source`, expressed as `undefined`, which is the value JSON drops
 *             and the persistence codec deliberately keeps. It is the one an
 *             edit is most likely to lose on the way through a store, and losing
 *             it means sending a field the owner deleted.
 */
const SARAH_EDIT: Record<string, unknown> = {
  instruction: "Chase only the two largest balances, and soften the opening line.",
  cc: "accounts@brightpath.example",
  source: undefined,
};

/**
 * What the merge must produce, written here from the contract's words —
 * `editedArgs` is "a PATCH over the frozen invocation's args, never a
 * replacement for them" — rather than obtained from `resolvedApprovalArgs`.
 *
 * The duplication is the point. Asking the implementation what the right answer
 * is would make M5-2 a check that the executor agrees with itself, which is
 * exactly the shape of assertion this milestone is not allowed to add.
 */
function expectedAfterEdit(request: ApprovalRequest): Record<string, unknown> {
  return { ...request.invocation.args, ...SARAH_EDIT };
}

/* ═══════════════════════════ Comparison ═══════════════════════════ */

/**
 * Key-sorted JSON, so two argument objects are compared by content rather than
 * by the order a spread happened to produce.
 *
 * `undefined` disappears, which is correct rather than convenient: an argument
 * the owner cleared is an argument the integration is not given, and a cleared
 * key must compare equal to an absent one.
 */
function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) out[key] = sortKeys(record[key]);
  return out;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/* ═══════════════════════════ The world ═══════════════════════════ */

interface World {
  clock: FixedClock;
  build: BuildDeps & { store: InMemoryBuildStore };
  runStore: InMemoryRunStore;
  scheduler: SchedulerDeps & { store: InMemorySchedulerStore };
  /**
   * Concrete rather than the `IntegrationProvider` interface M4 held, because
   * every check below asks what was actually SENT. `StubToolClient` is the only
   * implementation carrying a call log, and "the edited args reached the
   * integration" cannot be asked of anything narrower.
   */
  integrations: StubIntegrationProvider;
  executor: ExecutorOptions;
}

/**
 * One self-contained runtime: its own clock, packages, runs, approvals, queue
 * and ids, shared with nothing. That is what lets a check assert "no reminder
 * was sent" and mean it.
 *
 * ONE CLOCK DRIVES ALL THREE LAYERS, as in M4. The scheduler decides what is
 * due, the executor stamps run events and approval deadlines, and the Factory
 * stamps `builtAt`; separate clocks would let an approval be raised at an
 * instant its own `dueAt` had never heard of.
 */
async function world(now: string, seed: string): Promise<World> {
  const clock = new FixedClock(now);

  const build: BuildDeps & { store: InMemoryBuildStore } = {
    store: new InMemoryBuildStore(),
    generator: new LocalPackageGenerator(),
    clock,
    newId: createIdFactory(`${seed}-build`),
    sleep: async () => {},
  };
  await buildPlan(BRIGHTPATH_PLAN, build);

  const runStore = new InMemoryRunStore();
  const integrations = new StubIntegrationProvider();

  return {
    clock,
    build,
    runStore,
    scheduler: {
      store: new InMemorySchedulerStore(),
      clock,
      newId: createIdFactory(`${seed}-sched`),
    },
    integrations,
    executor: {
      store: runStore,
      tools: integrations,
      reasoner: new FixtureReasoner(),
      clock,
      newId: createIdFactory(`${seed}-run`),
      sleep: async () => {},
      globalPolicy: BRIGHTPATH_PLAN.globalPolicy,
    },
  };
}

function activationDeps(w: World, verdict: SandboxVerdict): ActivationDeps {
  return {
    scheduler: w.scheduler,
    packages: w.build,
    integrations: w.integrations,
    sandbox: new FixedSandboxEvidence(verdict),
  };
}

/** One turn of the worker against a world. */
async function pass(w: World, pollSchedules = true): Promise<WorkSummary> {
  return runDueWork({
    plan: BRIGHTPATH_PLAN,
    scheduler: w.scheduler,
    executor: w.executor,
    build: w.build,
    pollSchedules,
  });
}

/** Every reminder this world's agents actually put on the wire. */
function sends(w: World): ReadonlyArray<ToolInvocation> {
  return w.integrations.client.callsTo(SEND);
}

/* ═══════════════════ Getting to the paused approval ═══════════════════ */

/**
 * Everything up to the moment the decision is Sarah's: build, activate behind
 * the three real gates, let the cron minute arrive, turn the worker once, and
 * find a run waiting on an approval nobody created by hand.
 *
 * This is M5-1's first three clauses, and it is a shared helper rather than a
 * check because five other checks need to start from the same place. Each of
 * them gets its OWN call, so each gets its own world.
 */
interface Paused {
  ok: true;
  world: World;
  activation: ActivationResult;
  /** The pass that fired the sweep. */
  summary: WorkSummary;
  run: RunState;
  request: ApprovalRequest;
  bundle: AgentBundle;
  /**
   * The two observations that are only true AT the pause, taken here rather than
   * by the caller.
   *
   * A check reading them off the world after the decision would be asking the
   * wrong moment: by then the inbox holds whatever the resumed run raised next,
   * and the send it is asserting the absence of has legitimately happened. This
   * is where "nothing had been sent when the owner was asked" is still a fact.
   */
  inbox: PendingApproval[];
  sentBeforeTheDecision: number;
}

interface NotPaused {
  ok: false;
  why: string;
}

type PauseAttempt = Paused | NotPaused;

async function pauseAtApproval(verdict: SandboxVerdict, seed: string): Promise<PauseAttempt> {
  if (financeSpec === undefined) {
    return { ok: false, why: `the plan no longer contains an agent called "${FINANCE}"` };
  }

  const w = await world(ACTIVATED_AT, seed);
  const activation = await activate(BRIGHTPATH_PLAN, activationDeps(w, verdict), {
    activatedBy: OWNER,
  });
  if (!activation.activated) {
    return {
      ok: false,
      why:
        `activation was blocked at go-live: ` +
        `${activation.blockers.map((blocker) => blocker.message).join("; ")}`,
    };
  }

  // Advancing rather than constructing the world at 09:00 is the point: the
  // trigger's nextFireAt was computed before the instant it fires at, exactly as
  // at a real go-live.
  w.clock.advance(UNTIL_CRON_MS);
  const summary = await pass(w);

  const job = summary.jobs.find(
    (entry) => entry.agentId === FINANCE && entry.workflowId === SWEEP,
  );
  const run = job?.runId ? await w.runStore.getRun(job.runId) : null;
  if (!run) {
    return {
      ok: false,
      why:
        `the Friday cron produced no run for ${FINANCE}/${SWEEP} — the pass claimed ` +
        `${summary.claimed} job(s) and enqueued ${summary.schedule.enqueued.length}`,
    };
  }
  if (run.status !== "awaiting_approval" || run.pendingApprovalId === null) {
    return {
      ok: false,
      why: `run ${run.runId} ended "${run.status}" instead of pausing for an approval`,
    };
  }

  const request = await w.runStore.getApproval(run.pendingApprovalId);
  if (!request) {
    return {
      ok: false,
      why: `run ${run.runId} points at approval ${run.pendingApprovalId}, which is not stored`,
    };
  }

  const bundle = await loadBundle(financeSpec, w.build);
  if (!bundle) {
    return {
      ok: false,
      why: `no built package exists for ${FINANCE} v${financeSpec.version}, so no resume is possible`,
    };
  }

  return {
    ok: true,
    world: w,
    activation,
    summary,
    run,
    request,
    bundle,
    inbox: await pendingApprovals(w.runStore, w.clock.now()),
    sentBeforeTheDecision: sends(w).length,
  };
}

/** What a check says when it never got to the thing it is about. */
function cannotProceed(attempt: NotPaused, about: string): string {
  return (
    `The Friday sweep never reached an approval, so there is no ${about} to test: ` +
    `${attempt.why}. M5-1 is the check that owns this failure.`
  );
}

/* ═══════════════════════════ The whole loop ═══════════════════════════ */

interface LoopOptions {
  /** Omit for the "approved unchanged" arm of M5-3. */
  editedArgs?: Record<string, unknown>;
  /**
   * Whether `dependencyFanOut` is handed to the executor as `onRunResumed`.
   *
   * False is M5-7's control, and it is the only reason this is a parameter: the
   * Approvals route always wires it, and a loop that could not be run without it
   * could not demonstrate what its absence costs.
   */
  wireDependencies: boolean;
}

interface Loop {
  ok: true;
  paused: Paused;
  decision: ApprovalDecision;
  outcome: RunOutcome;
  /** What the fan-out queued, or 0 when it was not wired. */
  dependentsQueued: number;
  /** The pass after the decision — where a chained workflow becomes a run. */
  drain: WorkSummary;
  /** Everything observable about this world, for the determinism comparison. */
  fingerprint: string;
}

type LoopAttempt = Loop | NotPaused;

/**
 * The exit criterion, executed: pause, wait, edit, approve, resume, then turn
 * the worker once more so anything the decision made due actually runs.
 *
 * The fingerprint is taken here rather than by the caller so both halves of M5-9
 * measure the same moment; a check that ran one extra pass before measuring
 * would be comparing two different questions and calling the answer
 * non-deterministic.
 */
async function runLoop(
  verdict: SandboxVerdict,
  seed: string,
  options: LoopOptions,
): Promise<LoopAttempt> {
  const paused = await pauseAtApproval(verdict, seed);
  if (!paused.ok) return paused;

  const w = paused.world;

  // Sarah is not sitting on the inbox at nine on a Friday. Moving the clock
  // before the decision is what makes `decidedAt` differ from `createdAt`, which
  // is the difference the deadline and the second version are computed from.
  w.clock.advance(REVIEW_DELAY_MS);

  const fanOut = dependencyFanOut({ plan: BRIGHTPATH_PLAN, scheduler: w.scheduler });

  const decision: ApprovalDecision = {
    approvalId: paused.request.approvalId,
    decision: "approved",
    decidedBy: OWNER,
    decidedAt: w.clock.now().toISOString(),
    editedArgs: options.editedArgs,
  };

  const outcome = await decideAndResume(decision, paused.bundle, {
    ...w.executor,
    ...(options.wireDependencies ? { onRunResumed: fanOut.onRunResumed } : {}),
  });

  const drain = await pass(w);

  const runs = await w.runStore.listRuns();
  const record = await approvalRecord(w.runStore, decision.approvalId, w.clock.now());
  const inbox = await pendingApprovals(w.runStore, w.clock.now());

  return {
    ok: true,
    paused,
    decision,
    outcome,
    dependentsQueued: options.wireDependencies ? fanOut.queued() : 0,
    drain,
    fingerprint: JSON.stringify({
      firstPass: paused.summary,
      drain,
      runs: runs.map((run) => [
        run.runId,
        run.workflowId,
        run.status,
        run.cursor,
        run.startedAt,
        run.endedAt,
        run.failure,
        run.events,
      ]),
      versions: record?.versions ?? null,
      decision: await w.runStore.getDecision(decision.approvalId),
      inbox: inbox.map((item) => [item.request.approvalId, item.request.stepId, item.deadline]),
      jobs: w.scheduler.store
        .snapshotJobs()
        .map((job) => [job.jobId, job.status, job.runId, job.trigger.idempotencyKey]),
      triggers: w.scheduler.store
        .snapshotTriggers()
        .map((trigger) => [trigger.triggerId, trigger.enabled, trigger.nextFireAt, trigger.lastFiredAt]),
      // The call log is the record that would notice an edit arriving at the
      // integration in a different shape, which no other field above would.
      sent: w.integrations.client.calls,
    }),
  };
}

/* ═══════════════════════════ Small readers ═══════════════════════════ */

function jobFor(w: World, workflowId: string): QueuedJob | undefined {
  return w.scheduler.store.snapshotJobs().find((job) => job.workflowId === workflowId);
}

function versionsOf(record: { versions: ApprovalVersion[] } | null): ApprovalVersion[] {
  return record?.versions ?? [];
}

function changeKinds(version: ApprovalVersion | undefined): string {
  return (version?.changes ?? []).map((change) => `${change.key}:${change.kind}`).join(", ");
}

/* ═══════════════════════════ The checks ═══════════════════════════ */

export async function runM5Verification(): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, pass_: boolean, detail: string) =>
    checks.push({ name, pass: pass_, detail });

  /* 0. The sandbox verdict activation gates on. Earned once, from the packages
        the Factory built, exactly as M3 earns it — activation re-derives its own
        conclusions from this data, so a hand-written verdict would test the gate
        against evidence no sandbox ever produced. */
  const evidenceBuild: BuildDeps & { store: InMemoryBuildStore } = {
    store: new InMemoryBuildStore(),
    generator: new LocalPackageGenerator(),
    clock: new FixedClock(ACTIVATED_AT),
    newId: createIdFactory("m5-evidence"),
    sleep: async () => {},
  };
  await buildPlan(BRIGHTPATH_PLAN, evidenceBuild);
  const stress = await runStressSweep(BRIGHTPATH_PLAN, { packages: evidenceBuild });
  const verdict = await runSuite(BRIGHTPATH_SCENARIOS, BRIGHTPATH_PLAN, {
    packages: evidenceBuild,
    stress,
  });

  /* ═══ 1. THE EXIT CRITERION ═══
     Every clause of the plan's sentence asserted separately, so a failure names
     which clause broke rather than reporting that "the loop" is red. */
  const loop = await runLoop(verdict, "m5", {
    editedArgs: SARAH_EDIT,
    wireDependencies: true,
  });

  if (!loop.ok) {
    add(
      "M5-1 a scheduled run pauses, the owner edits and approves, the run completes, and the Workspace reads it back",
      false,
      `The loop stopped before a decision could be made: ${loop.why}`,
    );
  } else {
    const w = loop.paused.world;
    const request = loop.paused.request;

    // Clause 1–2: the run fired unattended and stopped for a human. Both are
    // M4's ground, re-asserted because M5's loop is meaningless if it starts
    // from a run somebody launched.
    const firedUnattended =
      loop.paused.summary.schedule.enqueued.length === 1 &&
      loop.paused.summary.schedule.enqueued[0]?.triggerId === SWEEP_TRIGGER_ID &&
      loop.paused.run.trigger.kind === "schedule" &&
      !loop.paused.run.events.some((event) => event.kind === "approval_resolved");
    const pausedForSarah =
      loop.paused.run.status === "awaiting_approval" &&
      request.approvalOwner === OWNER &&
      request.breachedLimits.length > 0 &&
      // Nothing had been sent when the owner was asked. Read from the pause, not
      // from the world afterwards — see `Paused`.
      loop.paused.sentBeforeTheDecision === 0;

    // Clause 3: an approval APPEARED — in the inbox the Operate surface reads,
    // with a deadline, not merely as a row somewhere.
    const inboxAtPause = loop.paused.inbox;
    const appearedInInbox =
      inboxAtPause.length === 1 &&
      inboxAtPause[0]?.request.approvalId === request.approvalId &&
      inboxAtPause[0]?.request.runId === loop.paused.run.runId &&
      inboxAtPause[0]?.deadline.state === "due";

    // Clause 4–5: edited, approved, resumed, completed.
    const settled = await w.runStore.getRun(loop.paused.run.runId);
    const resumedAndCompleted =
      loop.outcome.status === "completed" &&
      settled?.status === "completed" &&
      settled.cursor > loop.paused.run.cursor &&
      settled.events.some(
        (event) =>
          event.kind === "approval_resolved" &&
          event.approvalId === request.approvalId &&
          event.decision === "approved",
      ) &&
      sends(w).length === 1;

    // Clause 6: the reads the Operate surface makes. Five of them, because
    // "reflects it" is not one fact — the run left the inbox, the drawer can
    // still show what was decided, and the chained work became visible.
    const record = await approvalRecord(w.runStore, request.approvalId, w.clock.now());
    const inboxAfter = await pendingApprovals(w.runStore, w.clock.now());
    const runs = await w.runStore.listRuns({ agentId: FINANCE });
    const summaryRun = runs.find((run) => run.workflowId === SUMMARY);
    const jobs = w.scheduler.store.snapshotJobs();

    const workspaceReflectsIt =
      // The decided item is gone from the inbox, and what remains is the NEXT
      // decision — the write-off the chained summary paused on — not a stale copy
      // of the one Sarah just made.
      !inboxAfter.some((item) => item.request.approvalId === request.approvalId) &&
      inboxAfter.length === 1 &&
      inboxAfter[0]?.request.runId === summaryRun?.runId &&
      // The drawer can still read a decided approval, with its lineage.
      record?.decision?.decision === "approved" &&
      record.edited &&
      record.versions.length === 2 &&
      // Two runs for the finance agent, and no failure anywhere in the queue.
      runs.length === 2 &&
      jobs.length === 2 &&
      jobs.every((job) => job.status === "succeeded" && job.error === null) &&
      // The sweep did not re-fire while all this was happening.
      loop.drain.schedule.enqueued.length === 0;

    add(
      "M5-1 a scheduled run pauses, the owner edits and approves, the run completes, and the Workspace reads it back",
      firedUnattended && pausedForSarah && appearedInInbox && resumedAndCompleted && workspaceReflectsIt,
      firedUnattended && pausedForSarah && appearedInInbox && resumedAndCompleted && workspaceReflectsIt
        ? `cron "0 9 * * 5" started run ${loop.paused.run.runId} unattended at ${FRIDAY_0900}; it ` +
            `paused at step ${request.stepId} on ${request.breachedLimits.join(", ")} and appeared ` +
            `in ${OWNER}'s inbox (${inboxAtPause[0]?.deadline.detail}); ${REVIEW_DELAY_MS / MS_PER_MINUTE}m ` +
            `later she edited ${record?.versions[1]?.changes.length ?? 0} argument(s) and approved, ` +
            `the run resumed to "${settled?.status}" with exactly one ${SEND}, and the Workspace now ` +
            `reads ${runs.length} runs, ${jobs.length} settled jobs, a decided approval with ` +
            `${record?.versions.length} versions, and one new decision waiting on run ${summaryRun?.runId}`
        : `firedUnattended=${firedUnattended} pausedForSarah=${pausedForSarah} ` +
            `appearedInInbox=${appearedInInbox} (inbox held ${inboxAtPause.length}) ` +
            `resumedAndCompleted=${resumedAndCompleted} (outcome=${loop.outcome.status}, ` +
            `stored=${settled?.status ?? "gone"}, sends=${sends(w).length}) ` +
            `workspaceReflectsIt=${workspaceReflectsIt} (runs=${runs.length}, jobs=${jobs.length}, ` +
            `inboxAfter=${inboxAfter.length}, versions=${record?.versions.length ?? 0})`,
    );
  }

  /* ═══ 2. WHAT THEY APPROVED IS WHAT RUNS ═══
     The contract's promise in one assertion. `ApprovalRequest.invocation` is
     documented as "replayed verbatim on approve, so the owner approves exactly
     what runs", and `editedArgs` is a patch over it — so the invocation that
     reached the integration must equal the merge and must NOT equal the
     proposal. Both halves are needed: dropping the edits passes the second,
     replacing the args wholesale passes the first. */
  {
    const name =
      "M5-2 the arguments the owner EDITED are the ones that executed, not the ones the agent proposed";
    if (!loop.ok) {
      add(name, false, cannotProceed(loop, "edit"));
    } else {
      const w = loop.paused.world;
      const request = loop.paused.request;
      const sent = sends(w);
      const only = sent[0];

      const expected = expectedAfterEdit(request);
      const executedTheMerge = sent.length === 1 && canonical(only?.args) === canonical(expected);
      const notTheProposal = canonical(only?.args) !== canonical(request.invocation.args);

      // The patch is a patch: keys Sarah did not touch survived, the one she
      // changed changed, the one she added arrived, and the one she cleared is
      // absent from what the integration was handed.
      const untouchedSurvived = only?.args["fixture"] === request.invocation.args["fixture"];
      const changeLanded = only?.args["instruction"] === SARAH_EDIT["instruction"];
      const additionLanded = only?.args["cc"] === SARAH_EDIT["cc"];
      const clearLanded =
        only !== undefined &&
        only.args["source"] === undefined &&
        request.invocation.args["source"] !== undefined;

      // The metrics the owner was shown are the ones the replay carried: an
      // approval that re-derived them would be judging a different action from
      // the one on the card.
      const metricsFrozen = canonical(only?.metrics) === canonical(request.invocation.metrics);

      add(
        name,
        executedTheMerge &&
          notTheProposal &&
          untouchedSurvived &&
          changeLanded &&
          additionLanded &&
          clearLanded &&
          metricsFrozen,
        executedTheMerge && notTheProposal && clearLanded && metricsFrozen
          ? `the one ${SEND} carried exactly { ...proposed, ...edited }: "instruction" rewritten, ` +
              `"cc" added, "source" cleared, "fixture" and "itemCount" untouched, and the frozen ` +
              `metrics (${Object.keys(request.invocation.metrics).join(", ")}) unchanged — and it ` +
              `is NOT what the agent proposed`
          : `sends=${sent.length} executedTheMerge=${executedTheMerge} ` +
              `differsFromProposal=${notTheProposal} untouched=${untouchedSurvived} ` +
              `changed=${changeLanded} added=${additionLanded} cleared=${clearLanded} ` +
              `metricsFrozen=${metricsFrozen}; sent=${canonical(only?.args)} ` +
              `expected=${canonical(expected)}`,
      );
    }
  }

  /* ═══ 3. THE VERSION AN AUDIT READS ═══
     Three arms, because a derivation that always returns two versions is as
     wrong as one that always returns one. The third arm is the subtle one: an
     inbox that round-trips the whole argument object back as `editedArgs` must
     not produce "you edited this before approving" for an owner who did not. */
  {
    const name =
      "M5-3 an owner's edit is recorded as an ApprovalVersion, and approving unchanged records none";

    const unchanged = await runLoop(verdict, "m5-plain", { wireDependencies: true });
    const noop = await pauseAtApproval(verdict, "m5-noop");

    if (!loop.ok || !unchanged.ok || !noop.ok) {
      const failed = !loop.ok ? loop : !unchanged.ok ? unchanged : (noop as NotPaused);
      add(name, false, cannotProceed(failed, "approval to version"));
    } else {
      // Arm 1 — the edit.
      const edited = await approvalRecord(
        loop.paused.world.runStore,
        loop.paused.request.approvalId,
        loop.paused.world.clock.now(),
      );
      const editedVersions = versionsOf(edited);
      const proposal = editedVersions[0];
      const owners = editedVersions[1];
      const kinds = new Set((owners?.changes ?? []).map((change) => change.kind));

      const lineage =
        editedVersions.length === 2 &&
        proposal?.version === 1 &&
        proposal.author === "agent" &&
        proposal.authoredBy === FINANCE &&
        proposal.authoredAt === loop.paused.request.createdAt &&
        canonical(proposal.args) === canonical(loop.paused.request.invocation.args) &&
        proposal.changes.length === 0 &&
        owners?.version === 2 &&
        owners.author === "owner" &&
        owners.authoredBy === OWNER &&
        owners.authoredAt === loop.decision.decidedAt &&
        edited?.edited === true;

      // The second version is the COMPLETE arguments, and they are the ones that
      // ran — which is what makes the audit trail a record of the action rather
      // than a note about it.
      const versionIsWhatRan =
        canonical(owners?.args) === canonical(expectedAfterEdit(loop.paused.request)) &&
        canonical(owners?.args) === canonical(sends(loop.paused.world)[0]?.args);
      const namedEveryChange =
        owners?.changes.length === 3 &&
        kinds.has("changed") &&
        kinds.has("added") &&
        kinds.has("cleared");

      // Arm 2 — approved with no edits at all.
      const plain = await approvalRecord(
        unchanged.paused.world.runStore,
        unchanged.paused.request.approvalId,
        unchanged.paused.world.clock.now(),
      );
      const noVersionForPlainApproval =
        versionsOf(plain).length === 1 && plain?.edited === false && plain.decision !== null;

      // Arm 3 — an "edit" that changed nothing.
      const roundTrip = { ...noop.request.invocation.args };
      await decideAndResume(
        {
          approvalId: noop.request.approvalId,
          decision: "approved",
          decidedBy: OWNER,
          decidedAt: noop.world.clock.now().toISOString(),
          editedArgs: roundTrip,
        },
        noop.bundle,
        noop.world.executor,
      );
      const echoed = await approvalRecord(
        noop.world.runStore,
        noop.request.approvalId,
        noop.world.clock.now(),
      );
      const noVersionForANoOpEdit =
        versionsOf(echoed).length === 1 && echoed?.edited === false;

      add(
        name,
        lineage &&
          versionIsWhatRan &&
          namedEveryChange &&
          noVersionForPlainApproval &&
          noVersionForANoOpEdit,
        lineage && versionIsWhatRan && namedEveryChange && noVersionForPlainApproval && noVersionForANoOpEdit
          ? `the edited approval reads as two versions — v1 the agent's proposal at ` +
              `${proposal?.authoredAt}, v2 ${OWNER}'s at ${owners?.authoredAt} naming ` +
              `${changeKinds(owners)} and holding exactly the arguments that were sent; approving ` +
              `with no edits, and approving with an unchanged copy of the proposal, both record ` +
              `one version and report edited=false`
          : `lineage=${lineage} (versions=${editedVersions.length}) ` +
              `versionIsWhatRan=${versionIsWhatRan} changes=[${changeKinds(owners)}] ` +
              `plainApprovalVersions=${versionsOf(plain).length} ` +
              `noOpEditVersions=${versionsOf(echoed).length}`,
      );
    }
  }

  /* ═══ 4. REJECT-WITH-REASON ═══
     The half of the inbox that must do nothing. A rejection that still replayed
     the frozen invocation would be the worst failure in this milestone — the
     owner said no and the customer was emailed anyway — so the assertion that
     nothing was sent is the load-bearing one, and the reason surviving is what
     makes the refusal reviewable afterwards. */
  {
    const name = "M5-4 reject-with-reason ends the run refused, sends nothing, and keeps the reason";
    const attempt = await pauseAtApproval(verdict, "m5-reject");

    if (!attempt.ok) {
      add(name, false, cannotProceed(attempt, "approval to reject"));
    } else {
      const w = attempt.world;
      const reason =
        "Two of these were settled by cheque on Tuesday, so chasing them would be wrong.";

      w.clock.advance(REVIEW_DELAY_MS);
      // Wired exactly as the Approvals route wires it, so the check can assert
      // that a refused run fans out to nothing — the chain is behind the RESULT,
      // and a rejected sweep has none.
      const fanOut = dependencyFanOut({ plan: BRIGHTPATH_PLAN, scheduler: w.scheduler });
      const outcome = await decideAndResume(
        {
          approvalId: attempt.request.approvalId,
          decision: "rejected",
          decidedBy: OWNER,
          decidedAt: w.clock.now().toISOString(),
          reason,
        },
        attempt.bundle,
        { ...w.executor, onRunResumed: fanOut.onRunResumed },
      );

      const settled = await w.runStore.getRun(attempt.run.runId);
      const refused =
        outcome.status === "refused" &&
        settled?.status === "refused" &&
        settled.failure === reason &&
        settled.endedAt !== null;

      const nothingHappened = sends(w).length === 0 && fanOut.queued() === 0;

      const recorded =
        settled?.events.some(
          (event) =>
            event.kind === "approval_resolved" &&
            event.approvalId === attempt.request.approvalId &&
            event.decision === "rejected",
        ) === true &&
        settled.events.some(
          (event) => event.kind === "refused" && event.reason === reason,
        ) &&
        (await w.runStore.getDecision(attempt.request.approvalId))?.reason === reason;

      // A decided approval leaves the inbox whichever way it was decided.
      const leftTheInbox =
        (await pendingApprovals(w.runStore, w.clock.now())).length === 0;

      // And the worker has nothing left to do: a rejection must not leave a job
      // that some later pass picks up and starts again.
      const after = await pass(w);
      const nothingRetried = after.claimed === 0 && after.schedule.enqueued.length === 0;

      add(
        name,
        refused && nothingHappened && recorded && leftTheInbox && nothingRetried,
        refused && nothingHappened && recorded && leftTheInbox && nothingRetried
          ? `run ${attempt.run.runId} ended "refused" carrying ${OWNER}'s words verbatim, with ` +
              `zero ${SEND} calls, zero dependent workflows queued, an approval_resolved(rejected) ` +
              `and a refused event in the stream, an empty inbox, and nothing for the next worker ` +
              `pass to claim`
          : `refused=${refused} (status=${settled?.status ?? "gone"}, failure="${settled?.failure ?? "—"}") ` +
              `sends=${sends(w).length} dependentsQueued=${fanOut.queued()} recorded=${recorded} ` +
              `inboxEmpty=${leftTheInbox} retried=${!nothingRetried}`,
      );
    }
  }

  /* ═══ 5. THE DOUBLE-SEND TRAP ═══
     Two shapes, because they hit different guards and only one of them is the
     guard people remember. Sequentially the run has already completed, so
     `decideAndResume` refuses BEFORE the write and the approval's single
     decision slot is never burnt. Concurrently both callers read
     "awaiting_approval" and pass that check, and the write-once decision is the
     only thing standing between the customer and a second identical email. */
  {
    const name = "M5-5 a second decision on the same approval is refused rather than resuming the run twice";
    const sequential = await pauseAtApproval(verdict, "m5-twice");
    const concurrent = await pauseAtApproval(verdict, "m5-race");

    if (!sequential.ok || !concurrent.ok) {
      add(
        name,
        false,
        cannotProceed(!sequential.ok ? sequential : (concurrent as NotPaused), "approval to decide twice"),
      );
    } else {
      /* ── Sequentially ── */
      const first: ApprovalDecision = {
        approvalId: sequential.request.approvalId,
        decision: "approved",
        decidedBy: OWNER,
        decidedAt: sequential.world.clock.now().toISOString(),
      };
      const firstOutcome = await decideAndResume(first, sequential.bundle, sequential.world.executor);

      let refusedSecond = false;
      let refusedAsNotActionable = false;
      let secondMessage = "the second decision was accepted";
      try {
        await decideAndResume(
          { ...first, decision: "rejected", reason: "On reflection, hold these until Monday." },
          sequential.bundle,
          sequential.world.executor,
        );
      } catch (error) {
        refusedSecond = true;
        refusedAsNotActionable = error instanceof ApprovalNotActionableError;
        secondMessage = messageOf(error);
      }

      const storedFirst = await sequential.world.runStore.getDecision(first.approvalId);
      const sequentialRun = await sequential.world.runStore.getRun(sequential.run.runId);
      const sequentialHeld =
        firstOutcome.status === "completed" &&
        refusedSecond &&
        refusedAsNotActionable &&
        // The refusal came before the write, so the audit still reads "approved"
        // rather than a rejection that never took effect.
        storedFirst?.decision === "approved" &&
        storedFirst.decidedBy === OWNER &&
        sends(sequential.world).length === 1 &&
        sequentialRun?.status === "completed" &&
        sequentialRun.events.filter((event) => event.kind === "approval_resolved").length === 1;

      /* ── Concurrently ──
         Identical decisions on purpose. Two different decisions would make the
         outcome depend on which call won the race, and this check has to be
         about how many times the run resumed, not about who got there first. */
      const twin: ApprovalDecision = {
        approvalId: concurrent.request.approvalId,
        decision: "approved",
        decidedBy: OWNER,
        decidedAt: concurrent.world.clock.now().toISOString(),
        editedArgs: SARAH_EDIT,
      };
      const raced = await Promise.allSettled([
        decideAndResume(twin, concurrent.bundle, concurrent.world.executor),
        decideAndResume(twin, concurrent.bundle, concurrent.world.executor),
      ]);
      const won = raced.filter((entry) => entry.status === "fulfilled");
      const lost = raced.filter(
        (entry): entry is PromiseRejectedResult => entry.status === "rejected",
      );
      const concurrentRun = await concurrent.world.runStore.getRun(concurrent.run.runId);
      const loserMessage = lost.length === 1 ? messageOf(lost[0]?.reason) : "nobody lost";

      const raceHeld =
        won.length === 1 &&
        lost.length === 1 &&
        loserMessage.includes("was already approved by") &&
        // The one that matters: one email, not two.
        sends(concurrent.world).length === 1 &&
        concurrentRun?.status === "completed" &&
        concurrentRun.events.filter((event) => event.kind === "approval_resolved").length === 1;

      add(
        name,
        sequentialHeld && raceHeld,
        sequentialHeld && raceHeld
          ? `after the run completed, a second decision was refused as ApprovalNotActionableError ` +
              `without touching the stored one ("${secondMessage.split(":").slice(1).join(":").trim()}"); ` +
              `two simultaneous decisions on a still-paused approval produced one resume and one ` +
              `${SEND}, the loser refused by the write-once decision slot`
          : `sequential: firstStatus=${firstOutcome.status} refused=${refusedSecond} ` +
              `asNotActionable=${refusedAsNotActionable} storedDecision=${storedFirst?.decision ?? "none"} ` +
              `sends=${sends(sequential.world).length} — concurrent: won=${won.length} lost=${lost.length} ` +
              `sends=${sends(concurrent.world).length} resolvedEvents=` +
              `${concurrentRun?.events.filter((event) => event.kind === "approval_resolved").length ?? 0} ` +
              `loser="${loserMessage}"`,
      );
    }
  }

  /* ═══ 6. escalateAfterMins ═══
     Overdue is derived, never stored, so the check drives the derivation at
     three instants around the deadline the plan itself implies — and reads it
     back through `overdueApprovals`, which is the query the "at risk" tile and a
     future notifier both make. The boundary is asserted as inclusive because a
     notifier polling every thirty seconds has to escalate on its first pass AT
     the deadline; a strictly-greater comparison would be invisible in a UI and
     wrong in a page. The fourth arm is the fail-closed one: a deadline nobody
     can parse must not read as "plenty of time left". */
  {
    const name =
      "M5-6 an approval past escalateAfterMins reads overdue, one inside it does not, and an unreadable deadline counts";
    const attempt = await pauseAtApproval(verdict, "m5-overdue");

    if (!attempt.ok) {
      add(name, false, cannotProceed(attempt, "approval to age"));
    } else {
      const w = attempt.world;
      const request = attempt.request;
      const escalateAfterMins = financeSpec?.policy.escalateAfterMins ?? 0;

      // The deadline is the policy's, not a number this file chose: an agent
      // whose escalation window was retuned must move this check with it.
      const dueMs = Date.parse(request.dueAt);
      const derivedFromPolicy =
        Number.isFinite(dueMs) &&
        dueMs - Date.parse(request.createdAt) === escalateAfterMins * MS_PER_MINUTE;

      const justBefore = new Date(dueMs - MS_PER_MINUTE);
      const exactly = new Date(dueMs);
      const wellAfter = new Date(dueMs + 90 * MS_PER_MINUTE);

      const before = approvalDeadline(request, justBefore);
      const at = approvalDeadline(request, exactly);
      const after = approvalDeadline(request, wellAfter);

      const insideIsNotOverdue =
        before.state === "due" && before.minutesRemaining === 1 && !isPastDue(before);
      const boundaryIsInclusive =
        at.state === "overdue" && at.overdueByMins === 0 && isPastDue(at);
      const pastIsOverdue =
        after.state === "overdue" &&
        after.overdueByMins === 90 &&
        after.detail === "Overdue by 1h 30m." &&
        isPastDue(after);

      // The same question asked of the store, which is what the Workspace does.
      const storeAgrees =
        (await overdueApprovals(w.runStore, justBefore)).length === 0 &&
        (await overdueApprovals(w.runStore, exactly)).some(
          (item) => item.request.approvalId === request.approvalId,
        ) &&
        (await overdueApprovals(w.runStore, wellAfter)).length === 1;

      // Fail closed. `dueAt` crosses a store as text, so it can come back as
      // something Date.parse refuses, and reading that as "not overdue yet"
      // would hide the one item nobody can reason about.
      const unreadable = approvalDeadline(
        { approvalId: request.approvalId, dueAt: "whenever Sarah gets to it" },
        exactly,
      );
      const unreadableCounts =
        unreadable.state === "unreadable" &&
        isPastDue(unreadable) &&
        unreadable.detail.includes("needing attention");

      add(
        name,
        derivedFromPolicy &&
          insideIsNotOverdue &&
          boundaryIsInclusive &&
          pastIsOverdue &&
          storeAgrees &&
          unreadableCounts,
        derivedFromPolicy && insideIsNotOverdue && boundaryIsInclusive && pastIsOverdue && storeAgrees && unreadableCounts
          ? `${FINANCE}'s escalateAfterMins of ${escalateAfterMins} put the deadline at ` +
              `${request.dueAt}; a minute before it the approval is "${before.detail}" and absent ` +
              `from overdueApprovals, AT it the approval is overdue by 0m and present, 90 minutes ` +
              `later it reads "${after.detail}" — and a dueAt nothing can parse is reported as ` +
              `unreadable and still counted as past due`
          : `derivedFromPolicy=${derivedFromPolicy} (escalateAfterMins=${escalateAfterMins}, ` +
              `createdAt=${request.createdAt}, dueAt=${request.dueAt}) inside=${before.state} ` +
              `boundary=${at.state}/${at.overdueByMins} past=${after.state}/${after.overdueByMins} ` +
              `("${after.detail}") storeAgrees=${storeAgrees} unreadable=${unreadable.state}/` +
              `${isPastDue(unreadable)}`,
      );
    }
  }

  /* ═══ 7. THE HANDOFF THAT WOULD OTHERWISE FAIL SILENTLY ═══
     `runDueWork` fans out to dependent workflows when a run IT started
     completes. The Friday sweep does not complete inside a pass — it pauses, its
     job settles `succeeded`, and it finishes much later inside
     `decideAndResume`, which no pass ever observes. On BrightPath that is the
     ORDINARY path, so the summary chained behind the sweep only becomes due when
     Sarah decides.

     The control is the check. Nothing errors when the handoff is missing:
     no failed job, no retry, no dead letter — the workflow simply never runs,
     and the only way to see that is to run the same loop without the fan-out and
     watch the queue stay empty. */
  {
    const name =
      "M5-7 the workflow chained behind the approved run actually fires — and without the handoff it silently does not";
    const unwired = await runLoop(verdict, "m5-unwired", { wireDependencies: false });

    if (!loop.ok || !unwired.ok) {
      add(name, false, cannotProceed(!loop.ok ? loop : (unwired as NotPaused), "chained workflow"));
    } else {
      const w = loop.paused.world;

      // The chain exists in the activation, not just in the fixture.
      const registered = await w.scheduler.store.getTrigger(SUMMARY_TRIGGER_ID);
      const chainIsLive =
        registered?.enabled === true &&
        registered.kind === "dependency" &&
        registered.spec.kind === "dependency" &&
        registered.spec.afterWorkflowId === SWEEP;

      const queued = jobFor(w, SUMMARY);
      const firedOnTheDecision =
        loop.dependentsQueued === 1 &&
        loop.outcome.followUpError === undefined &&
        queued !== undefined &&
        queued.trigger.kind === "dependency" &&
        // Keyed on the upstream run, so a second decision could not queue a
        // second copy of the same downstream work.
        queued.trigger.idempotencyKey ===
          `${SUMMARY_TRIGGER_ID}#dependency@${loop.paused.run.runId}`;

      const summaryRun =
        queued?.runId === null || queued?.runId === undefined
          ? null
          : await w.runStore.getRun(queued.runId);
      const itActuallyRan =
        loop.drain.claimed === 1 &&
        summaryRun !== null &&
        summaryRun.workflowId === SUMMARY &&
        summaryRun.trigger.payload["upstreamRunId"] === loop.paused.run.runId;

      /* ── The control ── */
      const control = unwired.paused.world;
      const controlSweep = await control.runStore.getRun(unwired.paused.run.runId);
      const silentWithoutIt =
        // The sweep itself is fine — this is not a broken run, which is exactly
        // what makes the missing chain hard to notice.
        controlSweep?.status === "completed" &&
        unwired.drain.claimed === 0 &&
        jobFor(control, SUMMARY) === undefined &&
        !(await control.runStore.listRuns()).some((run) => run.workflowId === SUMMARY);

      add(
        name,
        chainIsLive && firedOnTheDecision && itActuallyRan && silentWithoutIt,
        chainIsLive && firedOnTheDecision && itActuallyRan && silentWithoutIt
          ? `${SUMMARY} is registered as a dependency on ${SWEEP}; approving the paused sweep ` +
              `queued exactly one job keyed on the upstream run ${loop.paused.run.runId}, and the ` +
              `next pass ran it as ${summaryRun?.runId} (${summaryRun?.status}). With the same ` +
              `decision made WITHOUT onRunResumed wired, the sweep still completed, no job was ` +
              `queued, no run appeared, and no error was raised anywhere — which is the silent ` +
              `failure this check exists to make loud`
          : `chainIsLive=${chainIsLive} dependentsQueued=${loop.dependentsQueued} ` +
              `firedOnTheDecision=${firedOnTheDecision} (job=${queued?.jobId ?? "none"}, ` +
              `key=${queued?.trigger.idempotencyKey ?? "—"}) itActuallyRan=${itActuallyRan} ` +
              `(drainClaimed=${loop.drain.claimed}, run=${summaryRun?.runId ?? "none"}) ` +
              `controlStayedSilent=${silentWithoutIt} (controlSweep=${controlSweep?.status ?? "gone"}, ` +
              `controlClaimed=${unwired.drain.claimed})`,
      );
    }
  }

  /* ═══ 8. THE PLAN CHANGED WHILE SHE WAS DECIDING ═══
     `RunState.cursor` is an INDEX and `ApprovalRequest.stepId` is a NAME, so a
     workflow re-approved with a step inserted ahead of the paused one leaves the
     index pointing somewhere the owner never looked. Replaying the frozen send
     there would perform the side effect under the wrong step AND then propose
     the same send again at the real one.

     THE DRIFTED PACKAGE IS THE ONE CONSTRUCTED RECORD IN THIS FILE. It has to
     be: a plan edited mid-approval is a sequence no fixture can express, and
     re-approving BRIGHTPATH_PLAN would rebuild every package rather than move
     one step. What is constructed is the situation; everything asserted about it
     is the executor's own behaviour. */
  {
    const name =
      "M5-8 a resume against a plan that changed underneath is refused, not replayed against the wrong step";
    const attempt = await pauseAtApproval(verdict, "m5-drift");

    if (!attempt.ok) {
      add(name, false, cannotProceed(attempt, "approval to resume"));
    } else {
      const w = attempt.world;
      const drifted: AgentBundle = structuredClone(attempt.bundle);
      const workflow = drifted.pkg.workflows.find(
        (candidate) => candidate.workflowId === SWEEP,
      );
      const inserted: StepSpec = {
        id: "sweep-0-inserted",
        kind: "reason",
        instruction: "A step added to the workflow while the approval sat in Sarah's inbox.",
      };
      workflow?.steps.unshift(inserted);
      // What now sits under the cursor the approval was frozen at.
      const nowAtCursor = workflow?.steps[attempt.run.cursor]?.id ?? "nothing";

      w.clock.advance(REVIEW_DELAY_MS);
      const outcome = await decideAndResume(
        {
          approvalId: attempt.request.approvalId,
          decision: "approved",
          decidedBy: OWNER,
          decidedAt: w.clock.now().toISOString(),
        },
        drifted,
        w.executor,
      );

      const settled = await w.runStore.getRun(attempt.run.runId);
      const failedClosed =
        outcome.status === "failed" &&
        settled?.status === "failed" &&
        settled.cursor === attempt.run.cursor &&
        settled.failure?.includes(attempt.request.stepId) === true &&
        settled.failure.includes(nowAtCursor);

      // The only assertion that would catch a missing guard.
      const nothingSent = sends(w).length === 0;

      // The failure is named for the step the OWNER saw, and the run stream never
      // claims the approval was applied — the guard runs before that emit.
      const annotatedHonestly =
        settled?.events.some(
          (event) =>
            event.kind === "error" &&
            event.stepId === attempt.request.stepId &&
            event.message.includes("The workflow changed while the approval was pending"),
        ) === true &&
        !settled.events.some((event) => event.kind === "approval_resolved");

      // The decision IS stored: it was taken before the resume and the slot is
      // write-once. That is the honest reading, and it is why the guard fails the
      // run rather than throwing — a throw would leave the run wedged in
      // "awaiting_approval" with every retry dying in saveDecision.
      const decisionRecorded =
        (await w.runStore.getDecision(attempt.request.approvalId))?.decision === "approved";

      add(
        name,
        failedClosed && nothingSent && annotatedHonestly && decisionRecorded,
        failedClosed && nothingSent && annotatedHonestly && decisionRecorded
          ? `with a step inserted ahead of it, index ${attempt.run.cursor} now holds ` +
              `"${nowAtCursor}" instead of "${attempt.request.stepId}"; the resume failed the run ` +
              `naming both, sent nothing, recorded no approval_resolved event, and stamped the ` +
              `error against the step Sarah actually reviewed`
          : `failedClosed=${failedClosed} (status=${settled?.status ?? "gone"}, ` +
              `cursor=${settled?.cursor ?? "—"}, failure="${settled?.failure ?? "—"}") ` +
              `sends=${sends(w).length} annotatedHonestly=${annotatedHonestly} ` +
              `decisionRecorded=${decisionRecorded} stepNowAtCursor=${nowAtCursor}`,
      );
    }
  }

  /* ═══ 9. Determinism, which M3 earned and M5 must not spend ═══
     The whole loop built twice under identical seeds — activation, run events,
     approval, deadline, decision, versions, queue, and the tool client's call
     log. Compared as bytes rather than as a summary, because the failure this
     guards against is a stray `Date.now()` or `Math.random()` somewhere on the
     approval path, and those show up in a field nobody thought to assert. */
  {
    const name = "M5-9 the whole pause-edit-approve-resume loop is byte-identical on a rerun";
    const again = await runLoop(verdict, "m5", {
      editedArgs: SARAH_EDIT,
      wireDependencies: true,
    });

    if (!loop.ok || !again.ok) {
      add(name, false, cannotProceed(!loop.ok ? loop : (again as NotPaused), "loop to repeat"));
    } else {
      const identical = again.fingerprint === loop.fingerprint;
      add(
        name,
        identical,
        identical
          ? `two independent worlds under the same seed produced identical runs, event streams, ` +
              `approval versions, queue rows and tool invocations (${loop.fingerprint.length} bytes)`
          : `the two worlds diverged: ${loop.fingerprint.length} vs ${again.fingerprint.length} bytes. ` +
              `Something on the approval path is reading a wall clock or a random source instead ` +
              `of the injected Clock and newId.`,
      );
    }
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
      ? `M5 EXIT CRITERIA MET — ${results.length}/${results.length} checks passed.`
      : `M5 NOT MET — ${failed} of ${results.length} checks failed.`,
  );
  return lines.join("\n");
}
