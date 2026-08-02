/**
 * app/api/runtime/notifications/route.ts — what needs the owner's attention right
 * now, derived on every read (ROLE_C_PLAN M7, "Notifications").
 *
 *   GET   the attention list, and the runtime instant every item was judged at
 *
 * WHAT THIS IS NOT. It is not the multi-channel notifier the product story
 * describes. Approval requests reaching an owner over WhatsApp, Telegram or email
 * is Role D's integration layer (PLAN_CONTRACT §8 Q3), and that layer has not
 * landed — so there is no delivery here, no channel preference, and no toggle
 * that would imply either. What Role C owns is the in-app surface, and this route
 * is the whole of it. The reason for saying so in the first paragraph is that a
 * notifications endpoint is exactly the shape a reader assumes sends something.
 *
 * NOTHING IS STORED, AND THAT IS THE DESIGN RATHER THAN A SIMPLIFICATION. There is
 * no notifications table, no read/unread column and no delivery log. Every item
 * below is a projection of a run, a job, an approval or an activation gate that
 * already exists, taken at the moment of the request. A stored notification is a
 * second copy of a fact whose original keeps moving: the row would still say
 * "waiting on you" after the approval was decided, still say "failed" after the
 * retry succeeded, and there is no rule for which of the two an owner should
 * believe. A derived item cannot drift from the thing it describes, because it IS
 * the thing it describes, re-read.
 *
 * The visible consequence, stated rather than hidden: an item stays in this list
 * until the underlying state changes. A failed run from three weeks ago is still
 * a failed run nobody fixed. Dismissal exists, and it is deliberately a browser
 * concern (components/live/notifications/useNotifications.ts) — persisting it
 * here would be the notifications table arriving through the back door.
 *
 * WHY THIS ROUTE EXISTS AT ALL, given that three of its four sources are already
 * served. Approvals, runs and jobs can each be fetched today, and an early draft
 * of this surface derived everything in the browser from
 * /api/runtime/{approvals,run,scheduler}. Three things killed that draft:
 *
 *   1. THREE RESPONSES CARRY THREE `now`s. Severity here is a claim about time —
 *      overdue against still in time — and judging one item against one instant
 *      and its neighbour against another produces a list that is internally
 *      inconsistent for as long as the three requests take. One read, one clock.
 *   2. /api/runtime/run RETURNS EVERY RUN EVER, unfiltered. Shipping the whole run
 *      log to a browser to find the three failures in it is a surface that gets
 *      slower exactly as a business gets busier. `listRuns({ status })` and
 *      `listJobs({ status })` ask the store for the terminal states and nothing
 *      else.
 *   3. ACTIVATION GATES ARE NOT DERIVABLE FROM ANY EXISTING GET AT A PRICE A BELL
 *      CAN PAY. /api/runtime/activation re-runs the entire scenario library and
 *      the stress sweep before it answers, and its header insists — correctly —
 *      that it must never learn to memoise. See the next paragraph for what this
 *      route does instead.
 *
 * The fourth reason is the smaller one and is about the five screens rather than
 * the runtime: a shared surface that needs three fetches is not a shared surface,
 * it is three integrations to get wrong on five screens.
 *
 * THE SANDBOX GATE IS NOT EVALUATED HERE, AND IS REPORTED AS NOT EVALUATED.
 * `activationChecklist` derives three gates that block independently. Two of them
 * — packages built, integrations connected — cost a directory walk and a registry
 * read. The third costs the sandbox suite. So the checklist is handed
 * `FixedSandboxEvidence(null)` and only the two funded gates are read, exactly as
 * app/api/runtime/integrations/route.ts already does and for the same reason.
 *
 * That has one sharp edge worth naming, because getting it wrong would put a
 * false alarm in front of every owner: with null evidence the sandbox gate comes
 * back SHUT, carrying "This workforce has not been proved in the sandbox yet".
 * On a machine where the sandbox in fact passes, emitting that as a notification
 * would be this route telling an owner their workforce is unproven on the
 * strength of a question it declined to ask. It is filtered out by id, and
 * `notEvaluated` says so on the wire so the omission is visible rather than
 * inferred. Nothing about overall readiness leaves this route — no `ready`, no
 * third gate — because a checklist assembled from evidence nobody gathered must
 * never be allowed to answer "can this go live". /api/runtime/activation remains
 * the only honest answer to that question.
 *
 * EVERY ITEM CARRIES SOMETHING TO DO, and where the obvious destination does not
 * exist this route does not invent one. An approval links to itself in the inbox
 * (`?focus=`), which M6-4 proves resolves. A blocked gate carries the
 * `ActivationBlocker.href` the runtime already computed. A failed run has nowhere
 * of its own to go — there is no run detail screen, and app/api/runtime/calendar
 * settled that question by giving such runs a null href rather than a link to a
 * page that does not exist — so its action is the AGENT it belongs to, on the
 * roster, which is where its run history, its limits and its pause control are.
 * The fragment (`#live-agent-<id>`) matches the heading id
 * components/live/agents/AgentCard.tsx renders; if that id ever changes the link
 * still lands on the right screen, one scroll away from the right row.
 *
 * SEVERITY IS THREE WORDS AND THEY MEAN DIFFERENT THINGS. `action_required`: the
 * owner is the remedy and the clock has already run out. `attention`: something
 * is broken and stays broken until a person looks, but no deadline is passing.
 * `waiting`: an agent is paused on the owner and is still inside its deadline.
 * Nothing that merely went well appears at any level — a completed run is not a
 * notification, and folding one in would train an owner to stop reading the list.
 *
 * OVERDUE IS THE RUNTIME'S WORD, NEVER THIS ROUTE'S. `approvalDeadline` derives it
 * from `escalateAfterMins` against the clock below, and its sentence is passed
 * through verbatim. An approval whose `dueAt` will not parse is reported by the
 * runtime as `unreadable`, and that counts as needing attention rather than as
 * time in hand — the same fail-closed reading the calendar and the inbox take.
 *
 * ONE SOURCE FAILING IS NOT THE LIST FAILING. Each of the four reads is caught
 * separately and reported in `sources`; a store that threw costs its own items and
 * nothing else, and `complete` goes false so a caller can never mistake a short
 * list for a quiet runtime. This is the one endpoint whose empty response means
 * "nothing is wrong", so it must never be able to say that by accident.
 *
 * A KNOWN DUPLICATE, RECORDED RATHER THAN HIDDEN. `atRiskItems` in
 * components/live/workspace/read-model.ts already defines four of these kinds for
 * the Workspace's at-risk tile, over the wire shapes rather than the store. The
 * two agree today and were written from the same reasoning; they are two places
 * all the same. Collapsing them needs an edit to a file this milestone does not
 * own, so the state of things is written down instead — exactly as M6 recorded
 * `countRunsToday`. If they ever disagree, the store is right and this route is
 * the one reading it directly.
 *
 * Determinism: this is route code, so wall time is permitted here in a way it is
 * not under lib/runtime — and it is the runtime's own injected clock that is read
 * regardless, so a fixed clock in a test moves this endpoint too. Nothing here
 * writes, stamps or generates an id.
 *
 * Unauthenticated on purpose for now, exactly as the other nine /api/runtime
 * routes are. That must be gated before any deployment: this one is a single call
 * that reports everything currently wrong with a business's workforce.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { ApprovedPlan } from "@/lib/plan/types";
import { approvalDeadline, pendingApprovals } from "@/lib/runtime/approvals";
import type { ApprovalDeadline } from "@/lib/runtime/approvals";
import { FixedSandboxEvidence, activationChecklist } from "@/lib/runtime/schedule/activation";
import type { ActivationBlocker, QueuedJob } from "@/lib/runtime/schedule/types";
import { getRuntimeSession } from "@/lib/runtime/session";
import type { RunState } from "@/lib/runtime/types";

export const dynamic = "force-dynamic";

/* ═══════════════════════════ The vocabulary ═══════════════════════════ */

/**
 * Seven kinds, each a different sentence and a different remedy.
 *
 * Exported as a type only — a route module may export nothing else — so the
 * browser reader can build a run-time list that `satisfies` this union and stop
 * compiling the day an eighth kind arrives without it. That is the same seam
 * `RuntimeTopic` uses in app/api/runtime/events/route.ts.
 */
export type NotificationKind =
  | "approval_overdue"
  | "approval_waiting"
  | "approval_deadline_unreadable"
  | "job_dead_letter"
  | "run_failed"
  | "run_refused"
  | "activation_blocked";

export type NotificationSeverity = "action_required" | "attention" | "waiting";

/* ═══════════════════════════ Wire shapes ═══════════════════════════ */

interface NotificationAction {
  href: string;
  /** Reads as an instruction on a link — "Review the decision". */
  label: string;
}

interface NotificationItem {
  /**
   * Stable across reads for as long as the underlying record exists, so a
   * browser can hold a dismissal against it. Prefixed by source because an
   * approval id and a run id are drawn from different sequences.
   */
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  /** One line naming what happened and which agent. */
  title: string;
  /** The concrete thing — an operation id, a workflow, a gate. */
  subject: string | null;
  /** The runtime's own reason, passed through rather than paraphrased. */
  detail: string;
  agentId: string | null;
  agentName: string | null;
  workflowId: string | null;
  workflowName: string | null;
  /** When it happened. Null only where the source is a derivation, not an event. */
  at: string | null;
  /** Why there is no instant. Set exactly when `at` is null. */
  atNote: string | null;
  action: NotificationAction | null;
  /** Why there is nothing to click. Set exactly when `action` is null. */
  actionNote: string | null;
  /**
   * Changes when the item's MEANING changes — its severity or its reason — and
   * not when something incidental moves. A browser dismissal is held against it,
   * so an approval that slides from waiting to overdue comes back rather than
   * staying hidden behind a dismissal made when it was not yet urgent.
   */
  fingerprint: string;
}

/** One read that either answered or did not. Never silently absent. */
interface SourceReport {
  id: "approvals" | "runs" | "jobs" | "activation";
  label: string;
  ok: boolean;
  /** The failure, verbatim. Null when `ok`. */
  problem: string | null;
}

/* ═══════════════════════════ Limits ═══════════════════════════ */

/**
 * The most items one response carries.
 *
 * A cap is needed because failed runs accumulate and nothing acknowledges them
 * away, but a cap that could hide the urgent behind the merely old would be worse
 * than none. Ordering therefore runs severity-first, so everything
 * `action_required` is emitted before anything else can consume the budget, and
 * `total` reports what the cap left out.
 */
const MAX_ITEMS = 40;

/* ═══════════════════════════ Destinations ═══════════════════════════ */

/**
 * The inbox, opened on one approval.
 *
 * `live=1` is hard-coded, matching app/api/runtime/calendar/route.ts: this item
 * was derived from the runtime, and the scripted inbox does not contain it. A
 * link that lands on a convincing screen where the named approval does not exist
 * is worse than no link.
 */
function approvalHref(approvalId: string): string {
  return `/app/workspace/approvals?live=1&focus=${encodeURIComponent(approvalId)}`;
}

/** The roster, scrolled to one agent. See the module header on the fragment. */
function agentHref(agentId: string): string {
  return `/app/workspace/agents?live=1#live-agent-${encodeURIComponent(agentId)}`;
}

/* ═══════════════════════════ Naming things ═══════════════════════════ */

/**
 * Ids → the words the owner recognises.
 *
 * An id the plan does not contain comes back AS THE ID rather than as "Unknown
 * agent". Triggers and runs are frozen at activation and outlive plan edits by
 * design, so a failure belonging to an agent that has since left the plan is a
 * real thing to be told about, and its id is the only handle anyone has on it.
 */
interface Directory {
  agent(agentId: string): string;
  workflow(agentId: string, workflowId: string): string;
}

function createDirectory(plan: ApprovedPlan): Directory {
  const agents = new Map<string, string>();
  const workflows = new Map<string, string>();
  for (const agent of Array.isArray(plan.agents) ? plan.agents : []) {
    agents.set(agent.id, agent.name || agent.id);
    for (const workflow of Array.isArray(agent.workflows) ? agent.workflows : []) {
      workflows.set(`${agent.id}/${workflow.id}`, workflow.name || workflow.id);
    }
  }
  return {
    agent: (agentId) => agents.get(agentId) ?? agentId,
    workflow: (agentId, workflowId) =>
      workflows.get(`${agentId}/${workflowId}`) ?? workflowId,
  };
}

/* ═══════════════════════════ Fingerprints ═══════════════════════════ */

/**
 * A short digest of the fields that carry meaning.
 *
 * Compared against a value a browser stored microseconds-to-minutes earlier,
 * never persisted server-side and never relied on to resist anybody, so twelve
 * hex characters is plenty.
 *
 * The separator is not decoration, and it is a newline for the same reason
 * app/api/runtime/events/route.ts picks one: without a separator ["ab", "c"] and
 * ["a", "bc"] hash alike, so a severity ending where a detail began would produce
 * one fingerprint for two different meanings — and a dismissal would silently
 * outlive the change that should have revoked it. A newline cannot occur inside
 * any part here: every one is an enum word, a gate id or a single-line sentence.
 */
function fingerprint(parts: readonly string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part);
    hash.update("\n");
  }
  return hash.digest("hex").slice(0, 12);
}

/* ═══════════════════════════ Errors ═══════════════════════════ */

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs one source, keeping its failure instead of throwing it.
 *
 * The whole point of the `sources` array is that a broken store costs its own
 * items and nothing else; a `Promise.all` over four reads would let the least
 * important of them empty the list and leave the owner looking at a calm screen.
 */
async function attempt<T>(
  id: SourceReport["id"],
  label: string,
  read: () => Promise<T>,
): Promise<{ value: T | null; report: SourceReport }> {
  try {
    return { value: await read(), report: { id, label, ok: true, problem: null } };
  } catch (error) {
    return {
      value: null,
      report: { id, label, ok: false, problem: messageOf(error) },
    };
  }
}

/* ═══════════════════════════ Approvals ═══════════════════════════ */

/**
 * Every paused run waiting on a person, split by whether its deadline has gone.
 *
 * The split is read from `ApprovalDeadline.state` rather than recomputed: the
 * runtime already judged it against the instant passed in, and a second judgement
 * here would be a second answer to the one question this surface exists to get
 * right. `unreadable` gets its own kind because it is neither — it is the runtime
 * saying it could not tell, and the fail-closed reading is that somebody must
 * look.
 */
function approvalItem(input: {
  approvalId: string;
  agentId: string;
  workflowId: string;
  operation: string;
  reason: string;
  createdAt: string;
  deadline: ApprovalDeadline;
  directory: Directory;
}): NotificationItem {
  const agentName = input.directory.agent(input.agentId);
  const workflowName = input.directory.workflow(input.agentId, input.workflowId);

  const kind: NotificationKind =
    input.deadline.state === "overdue"
      ? "approval_overdue"
      : input.deadline.state === "unreadable"
        ? "approval_deadline_unreadable"
        : "approval_waiting";

  const severity: NotificationSeverity =
    kind === "approval_waiting" ? "waiting" : "action_required";

  const title =
    kind === "approval_overdue"
      ? `${agentName} has been waiting past its deadline`
      : kind === "approval_deadline_unreadable"
        ? `${agentName} is waiting, and its deadline cannot be read`
        : `${agentName} is waiting on your decision`;

  return {
    id: `approval:${input.approvalId}`,
    kind,
    severity,
    title,
    subject: input.operation,
    // Two sentences from two sources, both the runtime's: what the deadline is
    // doing, and why the policy engine stopped here in the first place.
    detail: `${input.deadline.detail} ${input.reason}`.trim(),
    agentId: input.agentId,
    agentName,
    workflowId: input.workflowId,
    workflowName,
    at: input.createdAt,
    atNote: null,
    action: {
      href: approvalHref(input.approvalId),
      label:
        kind === "approval_waiting" ? "Review the decision" : "Decide this now",
    },
    actionNote: null,
    fingerprint: fingerprint([severity, input.deadline.state, input.deadline.detail]),
  };
}

/* ═══════════════════════════ Jobs and runs ═══════════════════════════ */

/**
 * A job the queue gave up on.
 *
 * Dead-lettered is terminal after `maxAttempts` and nothing retries out of it, so
 * the word has to say more than "failed" does — this is scheduled work that has
 * stopped happening and will keep not happening until somebody intervenes.
 * `skipped` is deliberately absent from this whole file: quiet hours and the
 * daily cap are `resolveRunStart` correctly deciding an agent may not wake up,
 * and paging an owner because their workforce respected 3am would be the surest
 * way to make them stop reading it.
 */
function deadLetterItem(job: QueuedJob, directory: Directory): NotificationItem {
  const agentName = directory.agent(job.agentId);
  const workflowName = directory.workflow(job.agentId, job.workflowId);
  const detail =
    job.error ??
    `The queue gave up after ${job.attempt} of ${job.maxAttempts} attempts and recorded no ` +
      `reason. Nothing retries it automatically.`;

  return {
    id: `job:${job.jobId}`,
    kind: "job_dead_letter",
    severity: "attention",
    title: `${agentName} stopped retrying ${workflowName}`,
    subject: workflowName,
    detail,
    agentId: job.agentId,
    agentName,
    workflowId: job.workflowId,
    workflowName,
    at: job.endedAt ?? job.enqueuedAt,
    atNote: null,
    action: { href: agentHref(job.agentId), label: `Open ${agentName}` },
    actionNote: null,
    fingerprint: fingerprint(["attention", "dead_letter", String(job.attempt), detail]),
  };
}

/**
 * A run that ended badly, in one of the two ways that mean different things.
 *
 * `failed` is a fault: a step threw, a tool was unreachable, something broke.
 * `refused` is the runtime working — policy blocked an operation the plan asked
 * for — and it is reported anyway, because from the owner's chair it is still
 * work that did not happen, and its cause is a plan defect that recurs on every
 * fire until the plan changes. The wording distinguishes them; the severity does
 * not, because both need the same thing: somebody to look.
 */
function runItem(run: RunState, directory: Directory): NotificationItem {
  const agentName = directory.agent(run.agentId);
  const workflowName = directory.workflow(run.agentId, run.workflowId);
  const refused = run.status === "refused";

  const detail =
    run.failure ??
    (refused
      ? "Policy refused the operation and ended the run, and no reason was recorded."
      : "The run ended in failure and recorded no reason.");

  return {
    id: `run:${run.runId}`,
    kind: refused ? "run_refused" : "run_failed",
    severity: "attention",
    title: refused
      ? `Policy refused what ${agentName} tried to do`
      : `${agentName} failed part-way through ${workflowName}`,
    subject: workflowName,
    detail: refused
      ? `${detail} The plan asks this agent for something its policy forbids, so this ` +
        `recurs every time the workflow fires.`
      : detail,
    agentId: run.agentId,
    agentName,
    workflowId: run.workflowId,
    workflowName,
    at: run.endedAt ?? run.startedAt,
    atNote: null,
    action: { href: agentHref(run.agentId), label: `Open ${agentName}` },
    // There is no run detail screen; see the module header for why this is the
    // agent rather than a link to one that does not exist.
    actionNote: null,
    fingerprint: fingerprint(["attention", run.status, detail]),
  };
}

/* ═══════════════════════════ Activation ═══════════════════════════ */

/**
 * One blocker, one item — never one item per gate.
 *
 * A gate carries a count; a blocker carries the sentence, the destination and the
 * agent or integration at fault, which is the whole of what a notification needs.
 * Collapsing four missing packages into "the packages gate is shut" would produce
 * an item that names nothing and links nowhere in particular.
 *
 * `live` changes the wording rather than the severity. Both situations need the
 * same work; they differ in what is at stake, and that belongs in the sentence
 * the owner reads, not in a rank that would then have to be defended.
 */
function blockerItem(input: {
  blocker: ActivationBlocker;
  gateId: string;
  gateLabel: string;
  index: number;
  live: boolean;
  directory: Directory;
}): NotificationItem {
  const agentId = input.blocker.agentId ?? null;
  const agentName = agentId === null ? null : input.directory.agent(agentId);

  const preface = input.live
    ? "This plan version is live and this gate would now refuse it: "
    : "This plan is not live yet, and this is one reason activation would refuse: ";

  return {
    // Blockers have no id of their own, so the position within its gate is what
    // keeps this stable between reads of an unchanged checklist.
    id: `gate:${input.gateId}:${input.index}`,
    kind: "activation_blocked",
    severity: "attention",
    title:
      agentName === null
        ? `${input.gateLabel} is blocking activation`
        : `${input.gateLabel} is blocking activation for ${agentName}`,
    subject: input.blocker.integrationId ?? input.gateLabel,
    detail: `${preface}${input.blocker.message}`,
    agentId,
    agentName,
    workflowId: null,
    workflowName: null,
    at: null,
    atNote:
      "A gate is a derivation over the current state of the plan, not something that " +
      "happened at an instant, so there is no time to show.",
    action: { href: input.blocker.href, label: "Fix this" },
    actionNote: null,
    fingerprint: fingerprint(["attention", input.gateId, input.blocker.message]),
  };
}

/* ═══════════════════════════ Ordering ═══════════════════════════ */

/**
 * Later-first for things that happened; soonest-due-first for things that are
 * waiting.
 *
 * Written as three sorted groups rather than one comparator with a severity rank
 * in it, because the two halves genuinely sort in opposite directions: the most
 * useful failure is the newest, and the most useful pending approval is the one
 * closest to its deadline. A single comparator would have had to hide that
 * contradiction inside a synthetic key.
 */
function byInstantDescending(a: NotificationItem, b: NotificationItem): number {
  const left = a.at === null ? Number.NaN : Date.parse(a.at);
  const right = b.at === null ? Number.NaN : Date.parse(b.at);
  const leftOk = Number.isFinite(left);
  const rightOk = Number.isFinite(right);
  // An unreadable or absent instant sorts last rather than to the top, and never
  // out of the list: it is still something that needs attention.
  if (!leftOk && !rightOk) return a.id.localeCompare(b.id);
  if (!leftOk) return 1;
  if (!rightOk) return -1;
  if (left !== right) return right - left;
  return a.id.localeCompare(b.id);
}

/* ═══════════════════════════ The read ═══════════════════════════ */

export async function GET(request: Request) {
  /* ── The query ──
     Refused rather than ignored. There is nothing to filter by: the list is
     already only what needs attention, and a `?severity=` would let a caller
     construct a quiet-looking response from a runtime that is not quiet. */
  const unexpected = [...new URL(request.url).searchParams.keys()];
  if (unexpected.length > 0) {
    return NextResponse.json(
      {
        error:
          `This endpoint does not accept ${unexpected.map((key) => `"${key}"`).join(", ")}, or ` +
          `any other parameter. It returns everything currently needing attention; filtering ` +
          `it server-side would make a partial answer indistinguishable from a calm runtime.`,
      },
      { status: 400 },
    );
  }

  const session = getRuntimeSession();
  // Routes may read wall time; the runtime library beneath them may not. Read
  // ONCE — every deadline, age and severity below is judged against this single
  // instant, which is the first reason this route exists at all.
  const now = session.executor.clock.now();
  /* The plan every name and every gate below is read against — `currentPlan()`,
     because this list goes in front of the owner and the seed is BrightPath.
     Read ONCE for the same reason `now` is: the directory that names an agent and
     the checklist that blocks on it must be about one workforce, or a single
     response could name agents from the plan before an ingest while reporting
     gates from the one after it. */
  const plan = await session.currentPlan();
  const directory = createDirectory(plan);

  const actionRequired: NotificationItem[] = [];
  const attention: NotificationItem[] = [];
  /**
   * Carried with its `dueAt` because that is what it sorts by and `dueAt` is not
   * on the wire shape. It is deliberately NOT the item's `at`: an approval's `at`
   * is when the agent asked, and two approvals raised in the same minute against
   * agents with different `escalateAfterMins` fall due hours apart. Sorting the
   * waiting list by age would be a guess dressed as an order.
   */
  const waiting: { dueAt: string; item: NotificationItem }[] = [];

  /* ── Approvals ── */
  const approvals = await attempt("approvals", "Pending approvals", () =>
    pendingApprovals(session.runStore, now),
  );
  for (const pending of approvals.value ?? []) {
    const item = approvalItem({
      approvalId: pending.request.approvalId,
      agentId: pending.request.agentId,
      workflowId: pending.request.workflowId,
      operation: pending.request.invocation.operation,
      reason: pending.request.reason,
      createdAt: pending.request.createdAt,
      deadline: pending.deadline,
      directory,
    });
    if (item.severity === "waiting") waiting.push({ dueAt: pending.request.dueAt, item });
    else actionRequired.push(item);
  }

  /* ── Runs that ended badly ──
     Two filtered reads rather than one unfiltered one; see the header on why the
     browser draft could not do this. */
  const runs = await attempt("runs", "Failed and refused runs", async () => [
    ...(await session.runStore.listRuns({ status: "failed" })),
    ...(await session.runStore.listRuns({ status: "refused" })),
  ]);
  for (const run of runs.value ?? []) attention.push(runItem(run, directory));

  /* ── Jobs the queue gave up on ── */
  const jobs = await attempt("jobs", "Dead-lettered jobs", () =>
    session.schedulerStore.listJobs({ status: "dead_letter" }),
  );
  for (const job of jobs.value ?? []) attention.push(deadLetterItem(job, directory));

  /* ── Activation gates ──
     Two of the three. See the header: the sandbox gate is not funded here, comes
     back shut on evidence nobody gathered, and is filtered out by id. */
  const activation = await attempt("activation", "Activation gates", () =>
    activationChecklist(plan, {
      scheduler: session.scheduler,
      packages: session.build,
      // The plan's OWN organization, not `session.tools`. That member resolves
      // the fixture's organization, so judging this plan's integrations gate
      // through it would tell an owner to reconnect a tool that is already
      // connected — or stay silent while theirs is not. An attention list is
      // read precisely when somebody suspects something is wrong, so every row
      // in it has to be about one business.
      integrations: session.toolsFor(plan.organizationId),
      sandbox: new FixedSandboxEvidence(null),
    }),
  );
  const checklist = activation.value;
  // `activeDeployment` is set only when THIS plan version is already live, which
  // is exactly the distinction the blocker's wording turns on.
  const live = checklist !== null && checklist.activeDeployment !== null;
  for (const gate of checklist?.gates ?? []) {
    if (gate.id === "sandbox") continue;
    gate.blockers.forEach((blocker, index) => {
      attention.push(
        blockerItem({
          blocker,
          gateId: gate.id,
          gateLabel: gate.label,
          index,
          live,
          directory,
        }),
      );
    });
  }

  /* ── Order and cap ── */
  actionRequired.sort(byInstantDescending);
  attention.sort(byInstantDescending);
  // Soonest deadline first. An unreadable `dueAt` cannot reach this list at all —
  // the runtime reports that state as `unreadable`, which is action_required —
  // so there is no unparseable instant to defend against here.
  waiting.sort((a, b) => {
    const left = Date.parse(a.dueAt);
    const right = Date.parse(b.dueAt);
    if (left !== right) return left - right;
    return a.item.id.localeCompare(b.item.id);
  });

  const ordered = [
    ...actionRequired,
    ...attention,
    ...waiting.map((entry) => entry.item),
  ];
  const items = ordered.slice(0, MAX_ITEMS);

  const sources: SourceReport[] = [
    approvals.report,
    runs.report,
    jobs.report,
    activation.report,
  ];

  return NextResponse.json({
    mode: session.mode,
    /**
     * The instant every deadline, age and severity above was judged against.
     * Without it a browser has to trust its own clock agrees with the runtime's,
     * and "overdue" is precisely the word where a few minutes of drift shows.
     */
    now: now.toISOString(),
    /**
     * False when any source failed. A caller must not read a short list as a calm
     * runtime — that is the one mistake this endpoint could make that nobody
     * would notice.
     */
    complete: sources.every((source) => source.ok),
    counts: {
      actionRequired: actionRequired.length,
      attention: attention.length,
      waiting: waiting.length,
      /** Everything derived, before the cap. `items.length` is what is returned. */
      total: ordered.length,
    },
    limit: MAX_ITEMS,
    items,
    sources,
    /**
     * What this answer deliberately does not cover. Rendered rather than
     * omitted — a surface that silently declines to check something looks
     * identical to one that checked and found nothing.
     */
    notEvaluated: [
      {
        id: "sandbox",
        label: "Sandbox passed",
        reason:
          "The sandbox gate re-runs the entire scenario library and the stress sweep to " +
          "answer, which is the right price for a go-live decision and the wrong one for a " +
          "surface that refreshes whenever the runtime moves. It is not checked here, and " +
          "its absence is not a pass — GET /api/runtime/activation is the only honest " +
          "answer to whether this plan can go live.",
        href: "/app/deploy",
      },
      {
        id: "external-delivery",
        label: "WhatsApp, Telegram and email delivery",
        reason:
          "Nothing in this build sends a notification anywhere. External delivery belongs " +
          "to Role D's integration layer (PLAN_CONTRACT §8 Q3), which has not landed, so " +
          "this list is in-app only and an owner who is not looking at the screen has not " +
          "been told.",
        href: null,
      },
    ],
  });
}
