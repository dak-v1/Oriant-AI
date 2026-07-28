/**
 * lib/runtime/verify/m4.ts — the M4 exit criterion, as an executable check.
 *
 * ROLE_C_PLAN M4 exits on one sentence: "activate the fixture plan → the Friday
 * sweep fires on schedule → a run appears with no human involvement." M4-1 is
 * that sentence and nothing else. It is provable at all only because
 * `runDueWork` returns instead of looping forever: a daemon can be demonstrated,
 * but a single call against a `FixedClock` can be asserted, and can be asserted
 * again tomorrow with the same bytes.
 *
 * Everything after M4-1 is here because a scheduler that fires once under
 * laboratory conditions has proved almost nothing. The failures that matter are
 * the ones nobody is awake for — a trigger that fires twice, a job that retries
 * a run already sitting in the owner's inbox, a daily cap that resets at the
 * wrong midnight — and each of those is a check below rather than a paragraph in
 * a header.
 *
 * A CHECK THAT CANNOT FAIL IS NOT A CHECK, which is the discipline M3 spent a
 * round learning and this file inherits. Every assertion of an absence is paired
 * with something genuinely trying: M4-3 hand-injects a duplicate row past the
 * queue's own guard so the executor's claim is what has to hold; M4-9 drives one
 * concurrency setting at the cap and another below it, so "no more than N at
 * once" cannot pass by the lanes never overlapping; M4-10 breaks each activation
 * gate on its own, because two gates covering for a third is exactly how a gate
 * stops being one.
 *
 * EACH CHECK GETS A FRESH WORLD. Sharing one queue across twelve checks would be
 * cheaper and would hide the class of bug this milestone is most likely to have:
 * state surviving a pass it should not have survived. The sandbox verdict is the
 * one thing built once and reused — it is evidence about the plan, not about any
 * particular scheduler, and re-earning it twelve times would say nothing new.
 *
 * THE FRIDAY SWEEP PAUSES, AND THAT IS THE CRITERION MET. Its `act` step breaches
 * `invoice.amount <= 500`, so the run ends `awaiting_approval` and its job ends
 * `succeeded`. A reader expecting `completed` would call M4 unmet; the plan asks
 * for a run to appear unattended, and one has — the decision waiting on Sarah is
 * the product working, not the scheduler failing. M4-7 pins that reading down,
 * because routing a paused run to the failure path is the single most plausible
 * mistake in the worker and it would look like diligence.
 *
 * DETERMINISM IS AN M3 EXIT CRITERION AND MUST NOT REGRESS. The same four things
 * are pinned as in the sandbox — clock, ids, tools, reasoner — and M4-12 builds
 * the headline world twice under identical seeds and compares the two worlds
 * byte for byte, which is what makes `npm run verify` reproducible now that a
 * scheduler is inside it.
 *
 * TWELVE CHECKS AGAINST A STORE THE PRODUCT DOES NOT USE PROVED LESS THAN THEY
 * LOOKED LIKE. Everything above builds `InMemorySchedulerStore`, while
 * `session.ts` defaults to `ORIANT_RUNTIME_STORAGE=file`. Nothing here had ever
 * driven the scheduler against a directory, and under that default this build
 * could not activate a plan at all: a trigger id is
 * `trg::<planId>::<agentId>::<workflowId>`, and `::` is not something a store
 * will put in a filename. Hashing the id fixed it and moved this file's output
 * by exactly zero bytes — which is the proof that the harness, not the store,
 * was the thing missing. M4-13 to M4-17 close that: the exit criterion itself
 * re-driven through `createFileStores`, plus the four properties only a
 * filesystem can break — a record id that has to become a filename, a paused run
 * read back by a second store object over the same directory, an idempotency
 * claim that is a file rather than a `Map` entry, and a write-once decision
 * whose second writer must lose.
 *
 * THE FILESYSTEM MAY BE TOUCHED; THE OUTPUT MAY NOT MOVE. Determinism is a
 * property of what this file PRINTS, not of which syscalls it makes, so the
 * constraint is narrower than "no I/O" and stricter than it first looks. The
 * directory name is FIXED rather than minted by `mkdtemp`: a random name differs
 * between two runs, and anything that differs between two runs is one detail
 * line away from breaking the guarantee. Fixed also means a run that crashed can
 * be cleaned up by the next one, which is why the tree is removed BEFORE as well
 * as after. No absolute path is ever printed — a store's own errors carry one,
 * and a home directory in a detail line would differ between two machines
 * exactly as surely as a random name differs between two runs — so anything read
 * out of a thrown store error goes through `redact`. The in-memory checks are
 * left exactly as they were: both stores need covering, and those twelve are
 * what keeps the suite fast.
 *
 * Run it with: npm run verify:m4
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { BRIGHTPATH_PLAN } from "../../plan/fixtures/brightpath";
import type { StepSpec, TriggerSpec } from "../../plan/types";
import { LocalPackageGenerator, buildPlan, loadBundle } from "../build/runner";
import { InMemoryBuildStore } from "../build/store";
import type { BuildDeps } from "../build/types";
import { decideAndResume } from "../executor";
import type { ExecutorOptions } from "../executor";
import { FixtureReasoner } from "../llm";
import { createFileStores } from "../persist";
import type { FileStores } from "../persist";
import { runSuite } from "../sandbox/runner";
import { BRIGHTPATH_SCENARIOS } from "../sandbox/scenarios";
import { runStressSweep } from "../sandbox/stress";
import type { SandboxVerdict } from "../sandbox/types";
import { FixedSandboxEvidence, activate } from "../schedule/activation";
import type { ActivationDeps, ActivationResult } from "../schedule/activation";
import { nextFireAfter } from "../schedule/cron";
import { BACKOFF_BASE_MS, enqueueTriggerEvent, listDeadLetterJobs } from "../schedule/queue";
import { InMemorySchedulerStore } from "../schedule/store";
import { buildTriggerEvent, triggerIdFor } from "../schedule/triggers";
import type {
  ActivationGateId,
  QueuedJob,
  ScheduledTrigger,
  SchedulerDeps,
} from "../schedule/types";
import { runDueWork } from "../schedule/worker";
import type { WorkSummary } from "../schedule/worker";
import { FixedClock, InMemoryRunStore, createIdFactory } from "../store";
import { StubIntegrationProvider, StubToolClient } from "../tools";
import type {
  IntegrationProvider,
  RunState,
  ToolClient,
  ToolInvocation,
  ToolResult,
  TriggerEvent,
} from "../types";

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

/* ═══════════════════════════ The fixture ═══════════════════════════ */

/** The agent and workflow the exit criterion names. */
const FINANCE = "finance-followup";
const SWEEP = "payment-reminder-drafting";
const OWNER = "user_sarah_chen";

/**
 * Read off the plan rather than restated, so a fixture edit shows up as a red
 * check here instead of as a check quietly proving the wrong agent. Undefined
 * only if the agent was renamed, in which case every check below reports it.
 */
const financeSpec = BRIGHTPATH_PLAN.agents.find((agent) => agent.id === FINANCE);

const SWEEP_TRIGGER_ID = triggerIdFor(BRIGHTPATH_PLAN.planId, FINANCE, SWEEP);

/* ═══════════════════════════ Instants ═══════════════════════════ */

/*
 * Every instant is written in UTC and annotated with the wall clock an owner in
 * Singapore would read, because every rule being tested — the cron, the quiet
 * window, the daily boundary — is stated in that wall clock and none of them is
 * stated in UTC.
 */

/** Friday 08:30 Asia/Singapore: activation happens half an hour before the sweep. */
const ACTIVATED_AT = "2026-07-24T00:30:00.000Z";
/** Friday 09:00 Asia/Singapore. The instant the whole milestone is about. */
const FRIDAY_0900 = "2026-07-24T01:00:00.000Z";
/** Friday 19:00 Asia/Singapore — inside 18:00–09:00, agent window and global alike. */
const FRIDAY_1900 = "2026-07-24T11:00:00.000Z";
/**
 * Saturday 01:00 Asia/Singapore, which is still FRIDAY in UTC. The whole of
 * M4-6 rests on that eight-hour disagreement.
 */
const SATURDAY_0100 = "2026-07-24T17:00:00.000Z";
/** Saturday 10:00 Asia/Singapore. */
const SATURDAY_1000 = "2026-07-25T02:00:00.000Z";
/** Sunday 10:00 Asia/Singapore — one local midnight after SATURDAY_0100. */
const SUNDAY_1000 = "2026-07-26T02:00:00.000Z";

const MS_PER_WEEK = 604_800_000;

/* ═══════════════════════════ The world ═══════════════════════════ */

interface World {
  clock: FixedClock;
  build: BuildDeps & { store: InMemoryBuildStore };
  runStore: InMemoryRunStore;
  scheduler: SchedulerDeps & { store: InMemorySchedulerStore };
  integrations: IntegrationProvider;
  executor: ExecutorOptions;
}

interface WorldOptions {
  /** False leaves the Factory's store empty, so the packages gate finds nothing. */
  build?: boolean;
  /** Replaces the default stub registry — a disconnected one, for M4-10. */
  integrations?: IntegrationProvider;
  /** A shared tool client, for the check that counts concurrent calls. */
  client?: ToolClient;
}

/**
 * One self-contained runtime: its own clock, package store, run store, queue and
 * ids. Nothing is shared with any other world, which is what lets a check assert
 * "no run exists" and mean it.
 *
 * ONE CLOCK DRIVES ALL THREE LAYERS. The scheduler decides what is due, the
 * executor stamps run events, and the Factory stamps `builtAt`; handing them
 * separate clocks would let a job be claimed at an instant the run it starts has
 * never heard of, and the daily-cap arithmetic in M4-6 would be comparing two
 * different Fridays.
 */
async function world(now: string, seed: string, options: WorldOptions = {}): Promise<World> {
  const clock = new FixedClock(now);

  const buildStore = new InMemoryBuildStore();
  const build: BuildDeps & { store: InMemoryBuildStore } = {
    store: buildStore,
    generator: new LocalPackageGenerator(),
    clock,
    newId: createIdFactory(`${seed}-build`),
    sleep: async () => {},
  };
  if (options.build !== false) await buildPlan(BRIGHTPATH_PLAN, build);

  const runStore = new InMemoryRunStore();
  const integrations =
    options.integrations ??
    new StubIntegrationProvider(options.client ? { client: options.client } : {});

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

/**
 * The two helpers below take the SHAPE they use rather than `World` itself, so
 * the file-backed world further down drives the same two lines instead of a
 * near-copy of them. Nothing about the twelve checks changes: `World` satisfies
 * both shapes, and every existing call site is untouched.
 */
type Activatable = {
  scheduler: SchedulerDeps;
  build: Pick<BuildDeps, "store">;
  integrations: IntegrationProvider;
};

type Drivable = {
  scheduler: SchedulerDeps;
  executor: ExecutorOptions;
  build: Pick<BuildDeps, "store">;
};

function activationDeps(w: Activatable, verdict: SandboxVerdict | null): ActivationDeps {
  return {
    scheduler: w.scheduler,
    packages: w.build,
    integrations: w.integrations,
    sandbox: new FixedSandboxEvidence(verdict),
  };
}

interface PassOptions {
  pollSchedules?: boolean;
  concurrency?: number;
  maxAttempts?: number;
}

/** One turn of the worker against a world. */
async function pass(w: Drivable, options: PassOptions = {}): Promise<WorkSummary> {
  return runDueWork({
    plan: BRIGHTPATH_PLAN,
    scheduler: w.scheduler,
    executor: w.executor,
    build: w.build,
    ...options,
  });
}

/* ═══════════════════════════ Firings ═══════════════════════════ */

/**
 * A "run now" firing with no registered trigger behind it — the one case
 * `enqueueTriggerEvent` exists for rather than `enqueueFiring` (see queue.ts).
 *
 * The key is spelled exactly as `buildTriggerEvent` spells a manual one, so the
 * queue's duplicate check and the executor's claim behave here as they do in
 * production. Several checks need to drive an agent whose only enabled workflows
 * are schedule- or event-triggered, and inventing a key shape for that would
 * mean testing a dedupe rule the runtime does not use.
 */
function manualFiring(
  agentId: string,
  workflowId: string,
  invocationId: string,
  at: string,
): TriggerEvent {
  const triggerId = triggerIdFor(BRIGHTPATH_PLAN.planId, agentId, workflowId);
  return {
    kind: "manual",
    agentId,
    workflowId,
    firedAt: at,
    payload: { requestedBy: "m4-verification", invocationId },
    idempotencyKey: `${triggerId}#manual@${invocationId}`,
  };
}

/* ═══════════════════════════ The headline world ═══════════════════════════ */

interface Headline {
  world: World;
  activation: ActivationResult;
  summary: WorkSummary;
  triggers: ScheduledTrigger[];
  jobs: QueuedJob[];
  runs: RunState[];
  /** Everything observable about this world, for the determinism comparison. */
  fingerprint: string;
}

/**
 * The exit criterion, executed: activate at 08:30, move the clock to 09:00, turn
 * the worker once.
 *
 * The fingerprint is taken here rather than by the caller so both halves of
 * M4-12 measure the same moment. A check that ran one extra pass before
 * measuring would be comparing two different questions and calling the answer
 * non-deterministic.
 */
async function headline(verdict: SandboxVerdict, seed: string): Promise<Headline> {
  const w = await world(ACTIVATED_AT, seed);
  const activation = await activate(BRIGHTPATH_PLAN, activationDeps(w, verdict), {
    activatedBy: OWNER,
  });

  // Half an hour of nothing, then the cron minute arrives. Advancing rather than
  // constructing the world at 09:00 is the point: the trigger's nextFireAt was
  // computed before the instant it fires at, exactly as at a real go-live.
  w.clock.advance(30 * 60_000);

  const summary = await pass(w);
  const triggers = w.scheduler.store.snapshotTriggers();
  const jobs = w.scheduler.store.snapshotJobs();
  const runs = w.runStore.snapshotRuns();

  return {
    world: w,
    activation,
    summary,
    triggers,
    jobs,
    runs,
    fingerprint: JSON.stringify({
      summary,
      triggers: triggers.map((t) => [t.triggerId, t.enabled, t.nextFireAt, t.lastFiredAt]),
      jobs: jobs.map((j) => [j.jobId, j.status, j.attempt, j.runAfter, j.runId, j.skipReason]),
      runs: runs.map((r) => [r.runId, r.status, r.startedAt, r.endedAt, r.events]),
    }),
  };
}

/* ═══════════════════════ The durable world ═══════════════════════ */

/**
 * A FIXED directory under the OS temp dir, deliberately not a `mkdtemp` one.
 *
 * See the module header for why the obvious choice is the wrong one here. Fixed
 * also buys the recovery property: a run that died holding a half-written table
 * leaves a directory the NEXT run can find and delete, which a random name would
 * make impossible — it would leave one orphan per crash and no way to tell them
 * from a run in progress.
 */
const FILE_STORE_ROOT = path.join(os.tmpdir(), "oriant-verify-m4-file-store");

/** The durable world M4-13 activates, and the scratch table M4-14 corrupts. */
const LIVE_DIR = path.join(FILE_STORE_ROOT, "live");
const TAMPER_DIR = path.join(FILE_STORE_ROOT, "tampered");

/**
 * Everything read out of a thrown store error goes through here first.
 *
 * Those messages name the file they are about, and an absolute path contains a
 * home directory: printing one would make this file's output differ between two
 * machines exactly as surely as a random directory name would make it differ
 * between two runs. The point of the whole exercise is that the bytes do not
 * move, and a red run has to keep that promise too.
 */
function redact(text: string): string {
  return text.split(FILE_STORE_ROOT).join("<store>");
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * One record as JSON, with the run and approval ids masked out.
 *
 * M4-16 compares a record the durable store holds against the same record the
 * in-memory store holds, and those two worlds are seeded separately — which is
 * deliberate, because two instances minting the same id would collide on an
 * exclusive `createRun`. Masking the ids is what lets every OTHER field be
 * compared exactly rather than field by hand-picked field. Empty ids are left
 * alone: `"".split("")` explodes a string into its characters, and a comparison
 * of two exploded strings would pass on almost anything.
 */
function maskIds(value: unknown, runId: string, approvalId: string): string {
  const text = JSON.stringify(value);
  const runMasked = runId.length > 0 ? text.split(runId).join("<run>") : text;
  return approvalId.length > 0 ? runMasked.split(approvalId).join("<approval>") : runMasked;
}

/**
 * One durable runtime over a real directory.
 *
 * NOT `World` with different stores plugged in. Those twelve checks read
 * `snapshotJobs()` and `snapshotTriggers()`, which are the in-memory store's own
 * test helpers with no counterpart on disk, so widening `World` to cover both
 * would mean editing every check that has already been proved. A second, smaller
 * shape costs one builder and leaves the fast path alone.
 */
interface FileWorld {
  clock: FixedClock;
  stores: FileStores;
  build: BuildDeps;
  integrations: IntegrationProvider;
  scheduler: SchedulerDeps;
  executor: ExecutorOptions;
}

/**
 * Open — or REOPEN — the durable stores over one directory.
 *
 * Called more than once against the same path on purpose: the second call is the
 * restart. Two instances share nothing, because `Table` deliberately keeps no
 * cache in front of the files, so "the second instance can see it" means "it is
 * on disk" and nothing weaker.
 *
 * Each instance seeds its own ids. A restarted process does not resume the
 * previous one's counter, and two instances both minting `run_…_1` would collide
 * on a store whose `createRun` is exclusive — which would look like a bug in the
 * executor rather than in this file.
 */
async function fileWorld(
  dir: string,
  now: string,
  seed: string,
  options: { build?: boolean } = {},
): Promise<FileWorld> {
  const clock = new FixedClock(now);
  const stores = createFileStores(dir);
  const integrations = new StubIntegrationProvider();

  const build: BuildDeps = {
    store: stores.buildStore,
    generator: new LocalPackageGenerator(),
    clock,
    newId: createIdFactory(`${seed}-build`),
    sleep: async () => {},
  };
  if (options.build !== false) await buildPlan(BRIGHTPATH_PLAN, build);

  return {
    clock,
    stores,
    build,
    integrations,
    scheduler: {
      store: stores.schedulerStore,
      clock,
      newId: createIdFactory(`${seed}-sched`),
    },
    executor: {
      store: stores.runStore,
      tools: integrations,
      reasoner: new FixtureReasoner(),
      clock,
      newId: createIdFactory(`${seed}-run`),
      sleep: async () => {},
      globalPolicy: BRIGHTPATH_PLAN.globalPolicy,
    },
  };
}

/**
 * The five file-backed check names, declared once.
 *
 * They are a list rather than five string literals at their `add` sites because
 * an I/O failure part-way through the group has to be reported AS the checks
 * that did not run: `scripts/verify.mjs` asserts an exact count, and a group that
 * silently produced three checks instead of five would trip that tripwire with a
 * number instead of a reason.
 */
const FILE_CHECKS = [
  "M4-13 the exit criterion holds against the file-backed stores, which is what the product runs by default",
  'M4-14 a trigger id full of "::" becomes a file and comes back as itself, and a tampered one is refused',
  "M4-15 a trigger re-delivered to a second store instance still produces exactly one run",
  "M4-16 a run paused for approval survives the restart intact, and resumes to completion through a second instance",
  "M4-17 a second decision on an approval already decided is refused by the filesystem",
];

/* ═══════════════════════ Instrumented tool client ═══════════════════════ */

/**
 * Records the most calls that were ever in flight at once.
 *
 * Instrumented at the tool client rather than at the queue because a claimed job
 * is not a running one: the store flips a row to `running` and returns, so
 * counting claims would report the queue's bookkeeping rather than the work. The
 * first step of every BrightPath workflow is a `fetch`, so every run passes
 * through here, and the yield below is what gives a second lane the chance to
 * arrive — without it the measurement would report 1 for any concurrency and the
 * check would be measuring its own instrument.
 */
class ConcurrencyProbe implements ToolClient {
  max = 0;
  private live = 0;

  constructor(private readonly inner: ToolClient) {}

  async call(invocation: ToolInvocation): Promise<ToolResult> {
    this.live += 1;
    if (this.live > this.max) this.max = this.live;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    try {
      return await this.inner.call(invocation);
    } finally {
      this.live -= 1;
    }
  }
}

/* ═══════════════════════════ Small readers ═══════════════════════════ */

function jobsFor(summary: WorkSummary, agentId: string, workflowId: string) {
  return summary.jobs.filter((job) => job.agentId === agentId && job.workflowId === workflowId);
}

function sweepSchedule(): Extract<TriggerSpec, { kind: "schedule" }> | null {
  const workflow = financeSpec?.workflows.find((candidate) => candidate.id === SWEEP);
  const spec = workflow?.trigger;
  return spec !== undefined && spec.kind === "schedule" ? spec : null;
}

/**
 * The sweep's steps, read off the plan. M4-16 asks where a restarted run resumes
 * FROM, and the only honest answer is an index into this array — a hard-coded
 * cursor would keep passing after a step was inserted ahead of the one that
 * actually paused, which is precisely the edit that would break a resume.
 */
function sweepSteps(): StepSpec[] {
  return financeSpec?.workflows.find((candidate) => candidate.id === SWEEP)?.steps ?? [];
}

/**
 * A finished run the store is told about rather than one the runtime produced.
 *
 * Used by exactly one check, M4-6, and only because the instants that
 * distinguish a local day boundary from a UTC one are unreachable any other way:
 * Singapore is UTC+8, so the two disagree only between 16:00 and 24:00 UTC,
 * which in Singapore is 00:00 to 08:00 — squarely inside the quiet window, where
 * no genuine run can start. Constructing the history is the only way to ask the
 * question; everything the check then asserts is real.
 */
function historicRun(runId: string, startedAt: string): RunState {
  return {
    runId,
    agentId: FINANCE,
    agentVersion: financeSpec?.version ?? 0,
    workflowId: SWEEP,
    status: "completed",
    trigger: manualFiring(FINANCE, SWEEP, runId, startedAt),
    cursor: 0,
    context: {},
    events: [],
    pendingApprovalId: null,
    startedAt,
    endedAt: startedAt,
    failure: null,
  };
}

/* ═══════════════════════════ The checks ═══════════════════════════ */

export async function runM4Verification(): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, pass_: boolean, detail: string) =>
    checks.push({ name, pass: pass_, detail });

  /* 0. The sandbox verdict activation gates on. Earned once, from the packages
        the Factory built, exactly as M3 earns it — activation re-derives its own
        conclusions from this data, so handing it a hand-written verdict would
        test the gate against evidence no sandbox ever produced. */
  const evidenceBuild: BuildDeps & { store: InMemoryBuildStore } = {
    store: new InMemoryBuildStore(),
    generator: new LocalPackageGenerator(),
    clock: new FixedClock(ACTIVATED_AT),
    newId: createIdFactory("m4-evidence"),
    sleep: async () => {},
  };
  await buildPlan(BRIGHTPATH_PLAN, evidenceBuild);
  const stress = await runStressSweep(BRIGHTPATH_PLAN, { packages: evidenceBuild });
  const verdict = await runSuite(BRIGHTPATH_SCENARIOS, BRIGHTPATH_PLAN, {
    packages: evidenceBuild,
    stress,
  });

  /* ═══ 1. THE EXIT CRITERION ═══
     Activate, let the Friday cron minute arrive, turn the worker once, and find
     a run nobody asked for. Every clause of the plan's sentence is asserted
     separately so a failure names which clause broke. */
  const first = await headline(verdict, "m4");
  {
    const activation = first.activation;
    const activated = activation.activated === true;

    // What go-live promised: the sweep was scheduled for 09:00 before 09:00
    // existed. Read off the registration rather than off the stored trigger,
    // which has since advanced to next Friday — the two answer different
    // questions and only this one is about the criterion.
    const registeredFor = activation.activated
      ? activation.registration?.registered.find((t) => t.triggerId === SWEEP_TRIGGER_ID)
          ?.nextFireAt
      : undefined;
    const scheduledForFriday = registeredFor === FRIDAY_0900;

    // What the schedule poll then did with it, and what it left behind: fired
    // once, and moved on to the next Friday rather than staying due.
    const sweepTrigger = first.triggers.find((t) => t.triggerId === SWEEP_TRIGGER_ID);
    const firedOnSchedule =
      first.summary.schedule.enqueued.length === 1 &&
      first.summary.schedule.enqueued[0]?.triggerId === SWEEP_TRIGGER_ID &&
      sweepTrigger?.lastFiredAt === FRIDAY_0900 &&
      Date.parse(sweepTrigger.nextFireAt ?? "") - Date.parse(FRIDAY_0900) === MS_PER_WEEK;
    const sweepJobs = jobsFor(first.summary, FINANCE, SWEEP);
    const job = sweepJobs[0];
    const ranUnattended = sweepJobs.length === 1 && job !== undefined && job.runId !== null;

    const run = first.runs.find((candidate) => candidate.runId === job?.runId);
    const runIsTheSweep =
      run !== undefined &&
      run.agentId === FINANCE &&
      run.workflowId === SWEEP &&
      run.trigger.kind === "schedule" &&
      run.trigger.idempotencyKey === `${SWEEP_TRIGGER_ID}#schedule@${FRIDAY_0900}`;

    // "No human involvement" as something falsifiable rather than as a claim:
    // the queue holds nothing anybody put there by hand, and the run reached its
    // present state without a decision being recorded against it.
    const noHumanInLoop =
      first.jobs.length === 1 &&
      first.jobs.every((queued) => queued.triggerId === SWEEP_TRIGGER_ID) &&
      run !== undefined &&
      !run.events.some((event) => event.kind === "approval_resolved") &&
      (run.pendingApprovalId === null ||
        (await first.world.runStore.getDecision(run.pendingApprovalId)) === null);

    add(
      "M4-1 activate the fixture plan, and the Friday sweep produces a run with nobody watching",
      activated &&
        scheduledForFriday &&
        firedOnSchedule &&
        ranUnattended &&
        runIsTheSweep &&
        noHumanInLoop,
      activated && ranUnattended && runIsTheSweep && noHumanInLoop
        ? `activated at 08:30 SGT, cron "0 9 * * 5" came due at ${FRIDAY_0900}, job ${job?.jobId} ` +
            `started run ${run?.runId} (${run?.status}) for ${FINANCE}/${SWEEP} — one job, one run, no decision recorded`
        : `activated=${activated} outcome=${activation.activated ? activation.outcome : "blocked"} ` +
            `registeredFor=${registeredFor ?? "nothing"} firedOnSchedule=${firedOnSchedule} ` +
            `lastFiredAt=${sweepTrigger?.lastFiredAt ?? "none"} sweepJobs=${sweepJobs.length} ` +
            `runIsTheSweep=${runIsTheSweep} unattended=${noHumanInLoop}`,
    );
  }

  /* ═══ 2. The cron itself ═══
     "Fires on Fridays" is only half the claim; "and only Fridays" is the half a
     scheduler gets wrong, and a wrong day-of-week reading shows up as a workflow
     that either never runs or runs every day. Ten consecutive firings exactly a
     week apart, each landing on Friday 09:00 in Singapore, says both at once:
     nothing was missed between two firings seven days apart, and nothing extra
     could hide there either. */
  {
    const spec = sweepSchedule();
    if (spec === null) {
      add(
        "M4-2 \"0 9 * * 5\" fires every Friday, only on Fridays, in Asia/Singapore",
        false,
        `The fixture's ${FINANCE}/${SWEEP} workflow no longer carries a schedule trigger, so the ` +
          `exit criterion has nothing to fire. Restore it or move this milestone's definition.`,
      );
    } else {
      const from = new Date("2026-07-01T00:00:00.000Z");
      const fires: Date[] = [];
      let cursor = from;
      for (let i = 0; i < 10; i++) {
        const next = nextFireAfter(spec.cron, spec.timezone, cursor);
        if (next === null) break;
        fires.push(next);
        cursor = next;
      }

      const local = new Intl.DateTimeFormat("en-GB", {
        timeZone: spec.timezone,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const readAs = (at: Date): string => {
        const parts = local.formatToParts(at);
        const part = (type: Intl.DateTimeFormatPartTypes): string =>
          parts.find((candidate) => candidate.type === type)?.value ?? "";
        return `${part("weekday")} ${part("hour")}:${part("minute")}`;
      };

      const wrongDay = fires.filter((at) => readAs(at) !== "Fri 09:00").map(readAs);
      const gaps = fires.slice(1).map((at, i) => at.getTime() - (fires[i]?.getTime() ?? 0));
      const weekly = gaps.every((gap) => gap === MS_PER_WEEK);

      // The zone is honoured rather than ignored: the same expression read in UTC
      // is eight hours later. An implementation that dropped `timezone` would
      // produce the same instant twice and this difference would be zero.
      const inZone = nextFireAfter(spec.cron, spec.timezone, from);
      const inUtc = nextFireAfter(spec.cron, "UTC", from);
      const offsetApplied =
        inZone !== null && inUtc !== null && inUtc.getTime() - inZone.getTime() === 8 * 3_600_000;

      const asPlanned = spec.cron === "0 9 * * 5" && spec.timezone === "Asia/Singapore";

      add(
        "M4-2 \"0 9 * * 5\" fires every Friday, only on Fridays, in Asia/Singapore",
        asPlanned && fires.length === 10 && wrongDay.length === 0 && weekly && offsetApplied,
        wrongDay.length === 0 && weekly && offsetApplied && asPlanned
          ? `${fires.length} consecutive firings from ${fires[0]?.toISOString()} to ` +
              `${fires[fires.length - 1]?.toISOString()}, every one Fri 09:00 Asia/Singapore, ` +
              `every gap exactly 7 days; the same expression in UTC lands 8h later`
          : `cron="${spec.cron}" timezone="${spec.timezone}" firings=${fires.length} ` +
              `offDays=[${wrongDay.join(", ")}] weekly=${weekly} zoneApplied=${offsetApplied}`,
      );
    }
  }

  /* ═══ 3. One firing, one run — at BOTH layers ═══
     The queue refuses a second job for a key it already holds, and the executor
     refuses a second run for a key it has already claimed. Only the second is a
     guarantee (queue.ts is explicit that its own check has a window between the
     scan and the insert), so this check hand-injects a twin row straight into the
     store to walk past the queue's guard. If `claimIdempotencyKey` stopped being
     consulted, the queue check would still pass and two customers would be
     emailed — which is exactly why the twin is here. */
  {
    const w = await world(FRIDAY_0900, "dupe");
    await activate(BRIGHTPATH_PLAN, activationDeps(w, verdict), { activatedBy: OWNER });

    const registered = await w.scheduler.store.getTrigger(SWEEP_TRIGGER_ID);
    if (registered === null) {
      add(
        "M4-3 the same trigger delivered twice produces exactly one run",
        false,
        `Activation registered no trigger at ${SWEEP_TRIGGER_ID}, so a duplicate delivery ` +
          `cannot be constructed. M4-1 covers why that matters.`,
      );
    } else {
      const event = buildTriggerEvent(registered, {
        kind: "schedule",
        fireAt: new Date(FRIDAY_0900),
      });
      const once = await enqueueTriggerEvent(event, w.scheduler, {
        triggerId: SWEEP_TRIGGER_ID,
      });
      const twice = await enqueueTriggerEvent(event, w.scheduler, {
        triggerId: SWEEP_TRIGGER_ID,
      });
      const queueRefused =
        once.created && !twice.created && twice.job.jobId === once.job.jobId;
      const oneJobQueued = (await w.scheduler.store.listJobs()).length === 1;

      // Past the queue's guard, which the store enforces on jobId and not on the
      // key. This is the at-least-once delivery the queue admits it cannot fully
      // close on its own.
      await w.scheduler.store.enqueueJob({ ...once.job, jobId: `${once.job.jobId}-twin` });

      const summary = await pass(w, { pollSchedules: false });
      const [left, right] = summary.jobs;
      const bothSettled =
        summary.claimed === 2 && left?.status === "succeeded" && right?.status === "succeeded";
      const sameRun =
        left?.runId !== null && left?.runId !== undefined && left.runId === right?.runId;
      const runs = await w.runStore.listRuns({ agentId: FINANCE });

      add(
        "M4-3 the same trigger delivered twice produces exactly one run",
        queueRefused && oneJobQueued && bothSettled && sameRun && runs.length === 1,
        queueRefused && sameRun && runs.length === 1
          ? `queue refused the redelivery (one job, ${once.job.jobId}); a twin row forced past it ` +
              `was claimed and settled against the SAME run ${left?.runId ?? "?"} — ` +
              `${runs.length} run exists for ${FINANCE}`
          : `queueRefused=${queueRefused} jobsQueued=${oneJobQueued ? 1 : "≠1"} ` +
              `claimed=${summary.claimed} statuses=${summary.jobs.map((j) => j.status).join(",")} ` +
              `runIds=${summary.jobs.map((j) => j.runId ?? "none").join(",")} runs=${runs.length}`,
      );
    }
  }

  /* ═══ 4. Quiet hours SKIP, they do not fail ═══
     "Correctly did nothing at 7pm" is a success and must not page anyone, so the
     job is `skipped` with the owner's own words and no run is created. The second
     agent is here for a reason worth stating: service-recovery declares a
     degenerate 00:00–00:00 window, which used to opt it out of the org-wide one
     and no longer does, because quiet hours are now the UNION of the agent's
     window and the plan's. That behaviour is asserted rather than assumed —
     ROLE_C_PLAN's open-dependency table carries the question it raises for D. */
  {
    const w = await world(FRIDAY_1900, "quiet");
    await activate(BRIGHTPATH_PLAN, activationDeps(w, verdict), { activatedBy: OWNER });
    await enqueueTriggerEvent(
      manualFiring(FINANCE, SWEEP, "quiet-1", FRIDAY_1900),
      w.scheduler,
    );
    await enqueueTriggerEvent(
      manualFiring("service-recovery", "recovery-case-review", "quiet-2", FRIDAY_1900),
      w.scheduler,
    );

    const summary = await pass(w, { pollSchedules: false });
    const settled = w.scheduler.store.snapshotJobs();
    const agentWindow = settled.find((job) => job.agentId === FINANCE);
    const orgWindow = settled.find((job) => job.agentId === "service-recovery");

    const bothSkipped =
      summary.skipped === 2 && summary.succeeded === 0 && summary.claimed === 2;
    const namedTheRightWindow =
      agentWindow?.skipReason?.includes("this agent's quiet hours") === true &&
      orgWindow?.skipReason?.includes("org-wide quiet hours") === true;
    const nothingRan =
      settled.every((job) => job.status === "skipped" && job.runId === null && job.error === null) &&
      (await w.runStore.listRuns()).length === 0;

    add(
      "M4-4 a job refused by quiet hours is skipped with the reason, and no run is created",
      bothSkipped && namedTheRightWindow && nothingRan,
      bothSkipped && namedTheRightWindow && nothingRan
        ? `at 19:00 SGT both jobs settled "skipped" with no run and no error — ` +
            `${FINANCE}: "${agentWindow?.skipReason}"; service-recovery (00:00–00:00 window, ` +
            `caught by the union): "${orgWindow?.skipReason}"`
        : `skipped=${summary.skipped} succeeded=${summary.succeeded} ` +
            `reasons=[${settled.map((j) => `${j.agentId}:${j.status}:${j.skipReason ?? j.error ?? "—"}`).join(" | ")}] ` +
            `runs=${(await w.runStore.listRuns()).length}`,
    );
  }

  /* ═══ 5. maxRunsPerDay caps ═══
     Driven for real: four firings at an hour policy allows, against a cap of
     three. The fourth must be the one that stops, and it must stop as a decision
     rather than as a breakage. */
  {
    const cap = financeSpec?.policy.maxRunsPerDay ?? null;
    const w = await world(SATURDAY_1000, "cap");
    await activate(BRIGHTPATH_PLAN, activationDeps(w, verdict), { activatedBy: OWNER });
    for (let i = 1; i <= 4; i++) {
      await enqueueTriggerEvent(
        manualFiring(FINANCE, SWEEP, `cap-${i}`, SATURDAY_1000),
        w.scheduler,
      );
    }

    const summary = await pass(w, { pollSchedules: false });
    const started = summary.jobs.filter((job) => job.status === "succeeded");
    const stopped = summary.jobs.filter((job) => job.status === "skipped");
    const runs = await w.runStore.listRuns({ agentId: FINANCE });
    const distinctRuns = new Set(started.map((job) => job.runId)).size;

    const cappedAtThree =
      cap === 3 &&
      started.length === 3 &&
      distinctRuns === 3 &&
      runs.length === 3 &&
      stopped.length === 1 &&
      stopped[0]?.runId === null;
    const saidWhy = stopped[0]?.detail.includes("Daily run limit reached (3)") === true;

    add(
      "M4-5 maxRunsPerDay caps runs, and the run over the cap is skipped rather than failed",
      cappedAtThree && saidWhy,
      cappedAtThree && saidWhy
        ? `four firings against a cap of ${cap}: three distinct runs started, the fourth ` +
            `settled "skipped" with "${stopped[0]?.detail.split(" (")[0]}" and no run`
        : `cap=${cap ?? "none"} started=${started.length} distinctRuns=${distinctRuns} ` +
            `runs=${runs.length} skipped=${stopped.length} detail="${stopped[0]?.detail ?? "—"}"`,
    );
  }

  /* ═══ 6. The cap resets on the AGENT'S day, not on UTC ═══
     Singapore is UTC+8, so the two calendars disagree for eight hours a day, and
     a cap keyed to the wrong one lets an agent run four times or refuses it at
     nine in the morning. The history below sits at 01:00 Saturday Singapore
     time, which is still Friday in UTC: a UTC-keyed counter sees a new day and
     allows the fourth run, a local one sees three runs already spent. Then one
     local midnight later the cap must genuinely release, or "reset" would just
     be another word for "never". */
  {
    const w = await world(SATURDAY_1000, "day");
    await activate(BRIGHTPATH_PLAN, activationDeps(w, verdict), { activatedBy: OWNER });
    for (let i = 1; i <= 3; i++) {
      await w.runStore.createRun(historicRun(`run-history-${i}`, SATURDAY_0100));
    }

    await enqueueTriggerEvent(
      manualFiring(FINANCE, SWEEP, "day-same", SATURDAY_1000),
      w.scheduler,
    );
    const sameDay = await pass(w, { pollSchedules: false });
    const heldByLocalDay =
      sameDay.jobs.length === 1 &&
      sameDay.jobs[0]?.status === "skipped" &&
      sameDay.jobs[0].detail.includes("Daily run limit reached");

    // One local midnight later — and still, in UTC, only a day after a history a
    // UTC counter had already forgotten.
    w.clock.advance(Date.parse(SUNDAY_1000) - Date.parse(SATURDAY_1000));
    await enqueueTriggerEvent(
      manualFiring(FINANCE, SWEEP, "day-next", SUNDAY_1000),
      w.scheduler,
    );
    const nextDay = await pass(w, { pollSchedules: false });
    const released =
      nextDay.jobs.length === 1 &&
      nextDay.jobs[0]?.status === "succeeded" &&
      nextDay.jobs[0].runId !== null;

    add(
      "M4-6 the daily cap counts the agent's local day, and resets on its local midnight",
      heldByLocalDay && released,
      heldByLocalDay && released
        ? `three runs at 01:00 Sat Asia/Singapore (still Fri in UTC) capped the 10:00 Sat firing — ` +
            `a UTC day boundary would have let it through — and the 10:00 Sun firing started ` +
            `run ${nextDay.jobs[0]?.runId}`
        : `sameLocalDay=${sameDay.jobs[0]?.status ?? "no job"} ("${sameDay.jobs[0]?.detail ?? "—"}") ` +
            `nextLocalDay=${nextDay.jobs[0]?.status ?? "no job"} runId=${nextDay.jobs[0]?.runId ?? "none"}`,
    );
  }

  /* ═══ 7. A paused run is not a failure ═══
     The headline sweep pauses on its first over-limit invoice, so this is the
     same run M4-1 found, asked a different question. The job's contract is "get a
     run under way", and a run in the approvals inbox is under way: settle it
     `failed` instead and it retries, the executor refuses the second start on the
     claimed key, and three attempts later a healthy run is pointed at by a
     dead-lettered job. The second pass below is what proves nothing is quietly
     retrying it. */
  {
    const job = jobsFor(first.summary, FINANCE, SWEEP)[0];
    // The persisted row, not the pass summary: `error` is what a reader looking
    // at the queue tomorrow would see, and a paused run must not have written one.
    const row = first.jobs.find((queued) => queued.jobId === job?.jobId);
    const run = first.runs.find((candidate) => candidate.runId === job?.runId);
    const paused = run?.status === "awaiting_approval" && run.pendingApprovalId !== null;
    const settledClean =
      job?.status === "succeeded" &&
      job.runId !== null &&
      job.attempt === 1 &&
      row?.status === "succeeded" &&
      row.runId === job.runId &&
      row.error === null &&
      row.skipReason === null;

    const pending = await first.world.runStore.listPendingApprovals();
    const awaitingSarah = pending.some(
      (request) => request.runId === run?.runId && request.approvalOwner === OWNER,
    );

    // Nothing left claimable: a job routed to the failure path would be back in
    // `queued` with a moved runAfter, and this pass would pick it up.
    const second = await pass(first.world);
    const notRetried =
      second.claimed === 0 &&
      first.world.scheduler.store
        .snapshotJobs()
        .every((queued) => queued.status === "succeeded");
    const runUntouched =
      (await first.world.runStore.getRun(run?.runId ?? ""))?.status === "awaiting_approval";

    add(
      "M4-7 a run that pauses for approval leaves its job succeeded, with the run id",
      paused && settledClean && awaitingSarah && notRetried && runUntouched,
      paused && settledClean && awaitingSarah && notRetried && runUntouched
        ? `run ${run?.runId} is awaiting_approval on ${run?.pendingApprovalId} for ${OWNER}; ` +
            `job ${job?.jobId} is "succeeded" at attempt 1 with no error, and a second pass ` +
            `claimed nothing`
        : `runStatus=${run?.status ?? "no run"} jobStatus=${job?.status ?? "no job"} ` +
            `runId=${job?.runId ?? "none"} storedError=${row?.error ?? "none"} ` +
            `pendingForOwner=${awaitingSarah} secondPassClaimed=${second.claimed}`,
    );
  }

  /* ═══ 8. Retry, backoff, dead-letter ═══
     The failure used is a real one the worker documents: a queued job naming an
     agent the plan no longer contains, which is what a plan edit leaves behind.
     The middle pass is the part that matters — it runs at the same instant as the
     first and must claim nothing, because backoff is a moved date and not a sleep.
     Without that pass, "retries with backoff" and "retries immediately" look the
     same from outside. */
  {
    const w = await world(FRIDAY_0900, "retry");
    await enqueueTriggerEvent(
      manualFiring("agent-removed-from-the-plan", SWEEP, "retry-1", FRIDAY_0900),
      w.scheduler,
      { maxAttempts: 2 },
    );

    const attemptOne = await pass(w, { pollSchedules: false });
    const requeued = w.scheduler.store.snapshotJobs()[0];
    const backedOff =
      attemptOne.retrying === 1 &&
      requeued?.status === "queued" &&
      requeued.attempt === 2 &&
      Date.parse(requeued.runAfter) - Date.parse(FRIDAY_0900) === BACKOFF_BASE_MS;

    const tooSoon = await pass(w, { pollSchedules: false });
    const heldBack = tooSoon.claimed === 0;

    w.clock.advance(BACKOFF_BASE_MS);
    const attemptTwo = await pass(w, { pollSchedules: false });
    const dead = w.scheduler.store.snapshotJobs()[0];
    const deadLettered =
      attemptTwo.deadLettered === 1 &&
      dead?.status === "dead_letter" &&
      dead.error?.includes("Gave up after 2 of 2 attempt(s)") === true;
    const visible = (await listDeadLetterJobs(w.scheduler)).length === 1;
    const noRuns = (await w.runStore.listRuns()).length === 0;

    add(
      "M4-8 a failing job retries after a backoff it cannot skip, then dead-letters at maxAttempts",
      backedOff && heldBack && deadLettered && visible && noRuns,
      backedOff && heldBack && deadLettered && visible && noRuns
        ? `attempt 1 failed and moved runAfter ${BACKOFF_BASE_MS / 1000}s forward; a pass at the ` +
            `same instant claimed nothing; attempt 2 dead-lettered and stayed visible in the ` +
            `dead-letter list, with no run ever created`
        : `backedOff=${backedOff} (runAfter=${requeued?.runAfter ?? "—"}, attempt=${requeued?.attempt ?? "—"}) ` +
            `heldBack=${heldBack} deadLettered=${deadLettered} visible=${visible} ` +
            `error="${dead?.error ?? "—"}"`,
    );
  }

  /* ═══ 9. Concurrency is a ceiling, and the lanes really do overlap ═══
     Four jobs across four different agents, because the worker serialises per
     agent and four jobs for one agent would never overlap whatever the setting.
     Both halves are load-bearing: the cap alone would pass if concurrency were
     ignored and everything ran one at a time, and the overlap alone would pass if
     the ceiling were ignored. */
  {
    const drive = async (concurrency: number, seed: string): Promise<[number, WorkSummary]> => {
      const probe = new ConcurrencyProbe(new StubToolClient());
      const w = await world(FRIDAY_0900, seed, { client: probe });
      await activate(BRIGHTPATH_PLAN, activationDeps(w, verdict), { activatedBy: OWNER });

      const lanes: [string, string][] = [
        ["admin-operations", "customer-response-drafting"],
        ["marketing", "content-planning"],
        [FINANCE, SWEEP],
        ["service-recovery", "recovery-case-review"],
      ];
      let n = 0;
      for (const [agentId, workflowId] of lanes) {
        n += 1;
        await enqueueTriggerEvent(
          manualFiring(agentId, workflowId, `${seed}-${n}`, FRIDAY_0900),
          w.scheduler,
        );
      }
      // The pass first, the reading second. Written the other way round — as one
      // array literal — the peak is read before any job has been claimed and both
      // settings report zero, which is what this check said the first time it ran.
      const summary = await pass(w, { pollSchedules: false, concurrency });
      return [probe.max, summary];
    };

    const [maxAtOne, oneLane] = await drive(1, "lane1");
    const [maxAtThree, threeLanes] = await drive(3, "lane3");

    const allWorked = oneLane.claimed === 4 && threeLanes.claimed === 4;
    const ceilingHeld = maxAtThree <= 3 && maxAtOne === 1;
    const lanesOverlapped = maxAtThree >= 2;

    add(
      "M4-9 no more than `concurrency` jobs are ever in flight, and above one they genuinely overlap",
      allWorked && ceilingHeld && lanesOverlapped,
      allWorked && ceilingHeld && lanesOverlapped
        ? `four jobs across four agents: concurrency 1 never exceeded 1 in-flight call, ` +
            `concurrency 3 peaked at ${maxAtThree} — capped and demonstrably parallel`
        : `claimed=${oneLane.claimed}/${threeLanes.claimed} peakAtOne=${maxAtOne} ` +
            `peakAtThree=${maxAtThree} (must be ≥2 and ≤3)`,
    );
  }

  /* ═══ 10. Each gate can shut on its own ═══
     Three worlds, each missing exactly one input. A gate proved only in company
     is not proved: two healthy gates masking a third that never blocks is how a
     checklist becomes decoration, and this repo has already shipped one
     permissive fall-through. The green path is M4-1, so the assertion here is
     narrower and sharper — the gate that shut is the one that was broken, the
     other two stayed open, and nothing at all was written. */
  {
    type GateCase = { id: ActivationGateId; label: string; make: () => Promise<World> };
    const cases: GateCase[] = [
      {
        id: "packages",
        label: "nothing built",
        make: () => world(ACTIVATED_AT, "gate-pkg", { build: false }),
      },
      {
        id: "sandbox",
        label: "nothing proved",
        make: () => world(ACTIVATED_AT, "gate-sbx"),
      },
      {
        id: "integrations",
        label: "gmail disconnected",
        make: () =>
          world(ACTIVATED_AT, "gate-int", {
            integrations: new StubIntegrationProvider({ disconnected: ["gmail"] }),
          }),
      },
    ];

    const outcomes: string[] = [];
    let allRefused = true;

    for (const gate of cases) {
      const w = await gate.make();
      // The sandbox case withholds the verdict; the others get the real one, so
      // each world differs from the healthy one in exactly one input.
      const result = await activate(
        BRIGHTPATH_PLAN,
        activationDeps(w, gate.id === "sandbox" ? null : verdict),
        { activatedBy: OWNER },
      );

      const shut = result.checklist.gates.filter((g) => !g.satisfied).map((g) => g.id);
      const refused =
        result.activated === false &&
        result.outcome === "blocked" &&
        result.blockers.length > 0 &&
        shut.length === 1 &&
        shut[0] === gate.id &&
        w.scheduler.store.snapshotTriggers().length === 0 &&
        (await w.scheduler.store.getActiveDeployment(BRIGHTPATH_PLAN.planId)) === null;

      if (!refused) allRefused = false;
      outcomes.push(
        refused
          ? `${gate.id} (${gate.label}) → blocked, nothing registered`
          : `${gate.id} (${gate.label}) → activated=${result.activated} shut=[${shut.join(",")}]`,
      );
    }

    add(
      "M4-10 activation is refused when any ONE of the three gates is unsatisfied",
      allRefused,
      allRefused
        ? `each gate broken alone still shuts the checklist and leaves no trigger and no ` +
            `deployment behind: ${outcomes.join("; ")}`
        : outcomes.join("; "),
    );
  }

  /* ═══ 11. Re-activation is a no-op, not a second registration ═══
     Trigger ids are derived, so a repeat registration cannot accumulate rows —
     but it DOES recompute `nextFireAt` from now, and a plan re-activated at 08:59
     would push a 09:00 sweep into next week. The owner would have pressed a
     button that promised nothing would change and silently cancelled that
     morning's run. So the assertion is not "no duplicate triggers", it is "the
     sweep still fires". */
  {
    const w = await world(ACTIVATED_AT, "again");
    const deps = activationDeps(w, verdict);
    const once = await activate(BRIGHTPATH_PLAN, deps, { activatedBy: OWNER });
    const afterFirst = w.scheduler.store.snapshotTriggers();
    const dueBefore = afterFirst.find((t) => t.triggerId === SWEEP_TRIGGER_ID)?.nextFireAt;

    w.clock.advance(29 * 60_000); // 08:59 Asia/Singapore — one minute to go.
    const twice = await activate(BRIGHTPATH_PLAN, deps, { activatedBy: OWNER });
    const afterSecond = w.scheduler.store.snapshotTriggers();
    const dueAfter = afterSecond.find((t) => t.triggerId === SWEEP_TRIGGER_ID)?.nextFireAt;

    const wroteNothing =
      once.activated &&
      once.outcome === "activated" &&
      twice.activated &&
      twice.outcome === "unchanged" &&
      twice.registration === null &&
      twice.agents.length === 0;
    const sameTriggers =
      afterSecond.length === afterFirst.length &&
      new Set(afterSecond.map((t) => t.triggerId)).size === afterSecond.length;
    const scheduleUnmoved = dueAfter === dueBefore && dueBefore === FRIDAY_0900;

    w.clock.advance(60_000);
    const summary = await pass(w);
    const stillFired = jobsFor(summary, FINANCE, SWEEP).some((job) => job.runId !== null);

    add(
      "M4-11 re-activating a live plan registers nothing twice and does not move a due trigger",
      wroteNothing && sameTriggers && scheduleUnmoved && stillFired,
      wroteNothing && sameTriggers && scheduleUnmoved && stillFired
        ? `second activation returned "unchanged" and wrote nothing; ${afterSecond.length} ` +
            `triggers, all distinct, sweep still due at ${dueAfter} — and it fired a minute later`
        : `outcomes=${once.activated ? once.outcome : "blocked"}/${twice.activated ? twice.outcome : "blocked"} ` +
            `triggers=${afterFirst.length}→${afterSecond.length} due=${dueBefore ?? "none"}→${dueAfter ?? "none"} ` +
            `firedAfterwards=${stillFired}`,
    );
  }

  /* ═══ 12. Determinism, which M3 earned and M4 must not spend ═══
     The whole headline world built twice under identical seeds — activation,
     deployment id, trigger table, queue, run events, every timestamp. Compared
     as bytes rather than as a summary, because the failure this guards against is
     a stray `Date.now()` or `Math.random()` somewhere on the scheduling path, and
     those show up in a field nobody thought to assert. */
  {
    const again = await headline(verdict, "m4");
    const identical = again.fingerprint === first.fingerprint;

    add(
      "M4-12 the whole activate-and-fire sequence is byte-identical on a rerun",
      identical,
      identical
        ? `two independent worlds under the same seed produced identical triggers, jobs and ` +
            `run event streams (${first.fingerprint.length} bytes)`
        : `the two worlds diverged: ${first.fingerprint.length} vs ${again.fingerprint.length} bytes. ` +
            `Something on the scheduling path is reading a wall clock or a random source instead ` +
            `of the injected Clock and newId.`,
    );
  }

  /* ═══ 13–17. THE SAME RUNTIME, ON THE STORAGE IT ACTUALLY SHIPS WITH ═══
     Everything above is in-memory; `session.ts` defaults to file. The tree is
     removed before as well as after, because a run that died mid-write left one
     behind and a stale `deployments` row would make M4-13 read as `unchanged`
     and register nothing. A throw anywhere inside is reported as the checks that
     did not run rather than allowed to escape: it would take the twelve results
     above with it, and verify.mjs's count tripwire would then fire with a number
     where a reason belongs. */
  const beforeFileChecks = checks.length;
  await fs.rm(FILE_STORE_ROOT, { recursive: true, force: true });

  try {
    const live = await fileWorld(LIVE_DIR, ACTIVATED_AT, "m4-file");
    const activation = await activate(BRIGHTPATH_PLAN, activationDeps(live, verdict), {
      activatedBy: OWNER,
    });

    // Half an hour of nothing, then the cron minute — the same movement M4-1
    // makes, so a difference between the two checks is a difference between the
    // two stores and nothing else.
    live.clock.advance(30 * 60_000);
    const summary = await pass(live);

    const triggers = await live.stores.schedulerStore.listTriggers();
    const jobs = await live.stores.schedulerStore.listJobs();
    const sweepJobs = jobsFor(summary, FINANCE, SWEEP);
    const job = sweepJobs[0];
    const run =
      job?.runId === null || job?.runId === undefined
        ? null
        : await live.stores.runStore.getRun(job.runId);

    /* ── 13. The exit criterion, re-driven through createFileStores. This is the
           check that would have caught the StoragePathError: registration is the
           first thing activation does, and every trigger id it writes carries the
           `::` that used to be unrepresentable as a filename. */
    {
      const activated = activation.activated === true;
      const registeredFor = activation.activated
        ? activation.registration?.registered.find((t) => t.triggerId === SWEEP_TRIGGER_ID)
            ?.nextFireAt
        : undefined;
      const scheduledForFriday = registeredFor === FRIDAY_0900;

      const sweepTrigger = triggers.find((t) => t.triggerId === SWEEP_TRIGGER_ID);
      const firedOnSchedule =
        summary.schedule.enqueued.length === 1 &&
        summary.schedule.enqueued[0]?.triggerId === SWEEP_TRIGGER_ID &&
        sweepTrigger?.lastFiredAt === FRIDAY_0900 &&
        Date.parse(sweepTrigger.nextFireAt ?? "") - Date.parse(FRIDAY_0900) === MS_PER_WEEK;
      const ranUnattended = sweepJobs.length === 1 && job !== undefined && job.runId !== null;

      const runIsTheSweep =
        run !== null &&
        run.agentId === FINANCE &&
        run.workflowId === SWEEP &&
        run.trigger.kind === "schedule" &&
        run.trigger.idempotencyKey === `${SWEEP_TRIGGER_ID}#schedule@${FRIDAY_0900}`;

      const noHumanInLoop =
        jobs.length === 1 &&
        jobs.every((queued) => queued.triggerId === SWEEP_TRIGGER_ID) &&
        run !== null &&
        !run.events.some((event) => event.kind === "approval_resolved") &&
        (run.pendingApprovalId === null ||
          (await live.stores.runStore.getDecision(run.pendingApprovalId)) === null);

      add(
        FILE_CHECKS[0] ?? "M4-13",
        activated &&
          scheduledForFriday &&
          firedOnSchedule &&
          ranUnattended &&
          runIsTheSweep &&
          noHumanInLoop,
        activated && ranUnattended && runIsTheSweep && noHumanInLoop
          ? `on disk: ${triggers.length} triggers registered under ids containing "::", the ` +
              `cron came due at ${FRIDAY_0900}, job ${job?.jobId} started run ${run?.runId} ` +
              `(${run?.status}) for ${FINANCE}/${SWEEP} — one job, one run, no decision recorded`
          : `activated=${activated} outcome=${activation.outcome} ` +
              `registeredFor=${registeredFor ?? "nothing"} triggers=${triggers.length} ` +
              `firedOnSchedule=${firedOnSchedule} sweepJobs=${sweepJobs.length} ` +
              `runIsTheSweep=${runIsTheSweep} unattended=${noHumanInLoop}`,
      );
    }

    /* ── 14. The id that could not be a filename, both ways round.
           The round trip alone would pass against a store that returned the only
           record it had, so the second half hand-edits the file behind the
           sweep's id to hold a DIFFERENT trigger — which is the one thing
           `getTrigger`'s cross-check exists to catch and the one thing no API
           call can set up. Done in its own directory, because a store that
           passed this check by NOT throwing would leave the live world holding
           somebody else's schedule for every check after it. */
    {
      const roundTripped = await live.stores.schedulerStore.getTrigger(SWEEP_TRIGGER_ID);
      const otherId = triggerIdFor(BRIGHTPATH_PLAN.planId, FINANCE, "overdue-invoice-summary");
      const other = await live.stores.schedulerStore.getTrigger(otherId);

      const cameBackAsItself =
        SWEEP_TRIGGER_ID.includes("::") &&
        roundTripped !== null &&
        roundTripped.triggerId === SWEEP_TRIGGER_ID &&
        roundTripped.agentId === FINANCE &&
        roundTripped.workflowId === SWEEP &&
        roundTripped.spec.kind === "schedule" &&
        roundTripped.lastFiredAt === FRIDAY_0900 &&
        // Two ids differing only in their last segment must not share a file.
        other !== null &&
        other.triggerId === otherId &&
        other.workflowId === "overdue-invoice-summary";

      let refused = false;
      let namedBoth = false;
      let tamperDetail = "the trigger could not be read back, so there was nothing to tamper with";

      if (roundTripped !== null) {
        const scratch = createFileStores(TAMPER_DIR).schedulerStore;
        await scratch.saveTrigger(roundTripped);

        const dir = path.join(TAMPER_DIR, "schedules");
        const files = (await fs.readdir(dir)).filter((name) => name.endsWith(".json"));
        const only = files[0];
        if (files.length !== 1 || only === undefined) {
          tamperDetail = `one saved trigger produced ${files.length} files, not 1`;
        } else {
          // A hand edit, which is exactly what the guard's own error message
          // tells the reader to suspect. The envelope's schema and entity are
          // left untouched so the codec accepts the file and the CROSS-CHECK is
          // what refuses it — rewriting it wholesale would prove the decoder
          // works and say nothing about the guard.
          const file = path.join(dir, only);
          const envelope = JSON.parse(await fs.readFile(file, "utf8")) as {
            record: { triggerId: string };
          };
          envelope.record.triggerId = otherId;
          await fs.writeFile(file, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

          try {
            const wrong = await scratch.getTrigger(SWEEP_TRIGGER_ID);
            tamperDetail =
              `the store handed back "${wrong?.triggerId ?? "null"}" for ` +
              `"${SWEEP_TRIGGER_ID}" instead of refusing it`;
          } catch (error) {
            refused = true;
            const message = redact(messageOf(error));
            namedBoth = message.includes(SWEEP_TRIGGER_ID) && message.includes(otherId);
            tamperDetail = namedBoth
              ? "a file holding another workflow's schedule under the sweep's name was refused, " +
                "naming both ids"
              : `it threw, but the message named neither the id asked for nor the id found: ` +
                `${message}`;
          }
        }
      }

      add(
        FILE_CHECKS[1] ?? "M4-14",
        cameBackAsItself && refused && namedBoth,
        cameBackAsItself && refused && namedBoth
          ? `"${SWEEP_TRIGGER_ID}" was written, listed and read back by its original id with its ` +
              `own spec and history, and a sibling id differing only in its workflow resolved to ` +
              `its own record; ${tamperDetail}`
          : `roundTrip=${cameBackAsItself} refusedTamperedFile=${refused} — ${tamperDetail}`,
      );
    }

    /* ── The three properties below are all about a run that already exists.
           Without one there is nothing to re-deliver, restart or decide, so they
           are reported as failures naming M4-13 rather than left to throw on an
           undefined id. */
    const pausedRunId = run?.runId ?? null;
    const pausedApprovalId = run?.pendingApprovalId ?? null;

    if (pausedRunId === null) {
      for (const name of FILE_CHECKS.slice(2)) {
        add(
          name,
          false,
          "No run reached the file-backed store, so there is nothing to re-deliver, restart " +
            "or decide. M4-13 says what went wrong.",
        );
      }
    } else {
      /* ── 15. The idempotency claim is a FILE, so it holds across instances.
             Two layers, as in M4-3, but the redelivery now arrives at a store
             object that never saw the first one: the queue's duplicate check has
             to read a table it did not write, and the executor's claim has to be
             a file rather than a `Map` entry. The twin row walks past the queue
             exactly as it does in memory, so it is the claim that has to hold. */
      const restarted = await fileWorld(LIVE_DIR, FRIDAY_0900, "m4-file-b", { build: false });
      const stored = (await restarted.stores.schedulerStore.listJobs()).find(
        (queued) => queued.triggerId === SWEEP_TRIGGER_ID,
      );

      let twinDetail = "the queued job was not on disk for the second instance to find";
      let claimHeld = false;
      let queueRefused = false;
      let oneRun = false;

      if (stored !== undefined) {
        queueRefused = await (async () => {
          const again = await enqueueTriggerEvent(stored.trigger, restarted.scheduler, {
            triggerId: SWEEP_TRIGGER_ID,
          });
          return !again.created && again.job.jobId === stored.jobId;
        })();

        const twin: QueuedJob = {
          ...stored,
          jobId: `${stored.jobId}-twin`,
          status: "queued",
          attempt: 1,
          startedAt: null,
          endedAt: null,
          runId: null,
          error: null,
          skipReason: null,
        };
        await restarted.stores.schedulerStore.enqueueJob(twin);

        const twinPass = await pass(restarted, { pollSchedules: false });
        const outcome = twinPass.jobs.find((entry) => entry.jobId === twin.jobId);
        claimHeld =
          twinPass.claimed === 1 &&
          outcome?.status === "succeeded" &&
          outcome.runId === pausedRunId;
        oneRun =
          (await restarted.stores.runStore.listRuns({ agentId: FINANCE })).length === 1;
        twinDetail =
          `a twin row forced past the queue was claimed and settled against run ` +
          `${outcome?.runId ?? "none"}`;
      }

      add(
        FILE_CHECKS[2] ?? "M4-15",
        queueRefused && claimHeld && oneRun,
        queueRefused && claimHeld && oneRun
          ? `a second store instance over the same directory refused the redelivery from the ` +
              `queue table it had not written (job ${stored?.jobId}); ${twinDetail}, and ` +
              `${FINANCE} still has exactly one run`
          : `queueRefusedAcrossInstances=${queueRefused} executorClaimHeld=${claimHeld} ` +
              `runs=${oneRun ? 1 : "≠1"} — ${twinDetail}`,
      );

      /* The last two are both about the approval interrupt, so a sweep that did
         not pause leaves neither of them anything to be about. */
      if (pausedApprovalId === null) {
        for (const name of FILE_CHECKS.slice(3)) {
          add(
            name,
            false,
            `Run ${pausedRunId} did not pause for approval, so there is no interrupt to ` +
              `survive a restart and no decision to record. M4-13 reports its status.`,
          );
        }
      } else {
        /* ── 16. THE PROPERTY M4 EXISTS FOR. types.ts states it plainly: a timer
               wheel "cannot survive a restart, and a paused run outliving the
               process is the whole point of the approval interrupt." Until this
               check nothing in the repo had ever reopened a directory and asked.
               Three things have to survive and each one breaks the resume
               differently: the CURSOR (resume from the wrong step and the
               customer gets nothing, or gets it twice), the EVENT STREAM (the
               owner's record of why it stopped), and the FROZEN INVOCATION —
               what they are approving, which a codec that quietly dropped a
               field would turn into something else entirely. */
        const afterRestart = await restarted.stores.runStore.getRun(pausedRunId);
        const afterApproval = await restarted.stores.runStore.getApproval(pausedApprovalId);

        /* THE WITNESS IS M4-1'S IN-MEMORY RUN, NOT A SECOND READ OF THESE FILES.
           Comparing what instance B reads against what instance A reads proves
           only that the store agrees with itself: blank the invocation on the
           way out of `getApproval` and both sides blank identically, leaving a
           green check over an owner approving an empty email. The in-memory run
           is an independent witness — same plan, same instants, same fixtures, a
           different store — so the ONLY fields that may legitimately differ are
           the two ids the seeds mint, which is what `maskIds` takes out. What
           STORAGE.md records as a real divergence between the two stores is list
           ORDER; the content of one record is not allowed to differ at all. */
        const witness =
          first.runs.find(
            (candidate) => candidate.agentId === FINANCE && candidate.workflowId === SWEEP,
          ) ?? null;
        const witnessApprovalId = witness?.pendingApprovalId ?? "";
        const witnessApproval =
          witnessApprovalId === ""
            ? null
            : await first.world.runStore.getApproval(witnessApprovalId);

        const steps = sweepSteps();
        const pausedAt = steps.findIndex((step) => step.id === afterApproval?.stepId);

        const cursorIntact =
          pausedAt >= 0 &&
          afterRestart?.status === "awaiting_approval" &&
          afterRestart.cursor === pausedAt &&
          afterRestart.pendingApprovalId === pausedApprovalId;

        const stateIntact =
          afterRestart !== null &&
          witness !== null &&
          afterRestart.events.length > 0 &&
          afterRestart.events.some(
            (event) =>
              event.kind === "needs_approval" && event.approvalId === pausedApprovalId,
          ) &&
          maskIds(afterRestart, pausedRunId, pausedApprovalId) ===
            maskIds(witness, witness.runId, witnessApprovalId);

        const approvalIntact =
          afterApproval !== null &&
          witnessApproval !== null &&
          afterApproval.approvalOwner === OWNER &&
          afterApproval.invocation.operation === steps[pausedAt]?.tool?.operation &&
          Object.keys(afterApproval.invocation.args).length > 0 &&
          maskIds(afterApproval, pausedRunId, pausedApprovalId) ===
            maskIds(witnessApproval, witness?.runId ?? "", witnessApprovalId);

        const inTheInbox = (await restarted.stores.runStore.listPendingApprovals()).some(
          (request) => request.approvalId === pausedApprovalId,
        );

        const bundle =
          financeSpec === undefined ? null : await loadBundle(financeSpec, restarted.build);
        const resumed =
          bundle === null
            ? null
            : await decideAndResume(
                {
                  approvalId: pausedApprovalId,
                  decision: "approved",
                  decidedBy: OWNER,
                  decidedAt: restarted.clock.now().toISOString(),
                },
                bundle,
                restarted.executor,
              );

        const settled = await restarted.stores.runStore.getRun(pausedRunId);
        const finished =
          resumed?.status === "completed" &&
          settled?.status === "completed" &&
          settled.cursor > pausedAt &&
          settled.events.some(
            (event) =>
              event.kind === "approval_resolved" &&
              event.approvalId === pausedApprovalId &&
              event.decision === "approved",
          );

        add(
          FILE_CHECKS[3] ?? "M4-16",
          cursorIntact && stateIntact && approvalIntact && inTheInbox && finished,
          cursorIntact && stateIntact && approvalIntact && inTheInbox && finished
            ? `a second store instance found run ${pausedRunId} still awaiting_approval at ` +
                `cursor ${pausedAt} (step "${afterApproval?.stepId}"), its ` +
                `${afterRestart?.events.length} events and its frozen ` +
                `${afterApproval?.invocation.operation} invocation identical field for field to ` +
                `M4-1's in-memory run of the same workflow — and approving through that instance ` +
                `ran it to "${settled?.status}"`
            : `cursor=${afterRestart?.cursor ?? "no run"} (expected ${pausedAt}) ` +
                `matchesInMemoryRun=${stateIntact} matchesInMemoryApproval=${approvalIntact} ` +
                `inPendingInbox=${inTheInbox} bundleLoaded=${bundle !== null} ` +
                `resumed=${resumed?.status ?? "not attempted"} onDisk=${settled?.status ?? "gone"}`,
        );

        /* ── 17. Write-once, enforced by the filesystem rather than by a
               convention. `FileRunStore.saveDecision` says why in one line: a
               second decision "would resume the same run twice, which for an
               `act` step means sending the email twice". Throwing is only half
               of it — the stored decision must still be the FIRST one, or the
               audit trail records a rejection that never took effect. A third
               instance, which never saw the decision go in, is what makes it a
               statement about the disk. */
        const third = createFileStores(LIVE_DIR).runStore;
        const winner = await third.getDecision(pausedApprovalId);

        let secondRefused = false;
        let namesTheWinner = false;
        try {
          await third.saveDecision({
            approvalId: pausedApprovalId,
            decision: "rejected",
            decidedBy: "user_someone_else",
            decidedAt: restarted.clock.now().toISOString(),
            reason: "A second decision on an approval that has already been resolved.",
          });
        } catch (error) {
          secondRefused = true;
          const message = redact(messageOf(error));
          namesTheWinner = message.includes(OWNER) && message.includes("approved");
        }

        const stillTheFirst =
          winner?.decision === "approved" &&
          winner.decidedBy === OWNER &&
          JSON.stringify(await third.getDecision(pausedApprovalId)) === JSON.stringify(winner);
        const runUntouched =
          (await third.getRun(pausedRunId))?.status === "completed";

        add(
          FILE_CHECKS[4] ?? "M4-17",
          secondRefused && namesTheWinner && stillTheFirst && runUntouched,
          secondRefused && namesTheWinner && stillTheFirst && runUntouched
            ? `a third instance was refused a rejection of ${pausedApprovalId} and told who had ` +
                `already approved it; the stored decision is still ${OWNER}'s and run ` +
                `${pausedRunId} is still completed`
            : `refused=${secondRefused} namedTheFirstDecider=${namesTheWinner} ` +
                `storedDecisionUnchanged=${stillTheFirst} runUntouched=${runUntouched}`,
        );
      }
    }
  } catch (error) {
    const why = redact(messageOf(error));
    for (let i = checks.length - beforeFileChecks; i < FILE_CHECKS.length; i++) {
      add(
        FILE_CHECKS[i] ?? `M4-${13 + i}`,
        false,
        `The file-backed group could not get past this check: ${why}`,
      );
    }
  } finally {
    await fs.rm(FILE_STORE_ROOT, { recursive: true, force: true });
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
      ? `M4 EXIT CRITERIA MET — ${results.length}/${results.length} checks passed.`
      : `M4 NOT MET — ${failed} of ${results.length} checks failed.`,
  );
  return lines.join("\n");
}
