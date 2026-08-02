/**
 * lib/runtime/verify/pg.ts — the Postgres stores, actually executed.
 *
 * Every other verify target runs against the in-memory stores, deliberately:
 * determinism is an M3 exit criterion and a store that touches a network is
 * neither deterministic nor fast. The consequence is that the implementation
 * the product ACTUALLY DEPLOYS ON had no automated coverage at all — a thousand
 * lines of SQL that typechecked and had never run.
 *
 * This target closes that. It is opt-in rather than part of `npm run verify`,
 * because it needs a real database and a clean clone must stay runnable with an
 * empty `.env`. Without `DATABASE_URL` it REFUSES rather than passing: a target
 * that goes green when it did not run is the exact failure `scripts/verify.mjs`
 * was hardened against.
 *
 * ISOLATION. Every record is prefixed with a per-run token and removed
 * afterwards, so the suite can run against a database that has real rows in it
 * without touching them. It never truncates.
 *
 * Run it with: npm run verify:pg
 */

import { createPostgresStores, closeSql } from "../persist/pg";
import { InMemoryRunStore } from "../store";
import type {
  ApprovalRequest,
  ApprovalDecision,
  RunState,
  RunStore,
  TriggerEvent,
} from "../types";
import type { BuildJob, PackageRecord } from "../build/types";

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

const NOW = "2026-08-02T01:00:00.000Z";

/** Unique per invocation so a rerun cannot collide with its own leftovers. */
const TOKEN = `pgverify-${Math.floor(Number(process.hrtime.bigint() % 100000000n))}`;

function trigger(key: string): TriggerEvent {
  return {
    kind: "schedule",
    workflowId: "wf-1",
    agentId: `${TOKEN}-agent`,
    firedAt: NOW,
    payload: {
      // A Date and a Map: the two things JSON drops and the codec exists for.
      when: new Date("2026-08-02T09:00:00+08:00"),
      tags: new Map<string, number>([["priority", 1]]),
    },
    idempotencyKey: key,
  };
}

function runState(id: string, events = 2): RunState {
  return {
    runId: id,
    agentId: `${TOKEN}-agent`,
    agentVersion: 3,
    workflowId: "wf-1",
    status: "awaiting_approval",
    trigger: trigger(`${id}-key`),
    cursor: 3,
    context: {
      __metrics: { "invoice.amount": 1200 },
      seen: new Set(["a", "b"]),
      at: new Date("2026-08-02T02:00:00.000Z"),
    },
    events: Array.from({ length: events }, (_, i) => ({
      kind: "step_started" as const,
      at: NOW,
      stepId: `s${i + 1}`,
      stepKind: "fetch" as const,
      instruction: `step ${i + 1}`,
    })),
    pendingApprovalId: `${id}-ap`,
    startedAt: NOW,
    endedAt: null,
    failure: null,
  };
}

function approval(id: string, runId: string): ApprovalRequest {
  return {
    approvalId: id,
    runId,
    agentId: `${TOKEN}-agent`,
    workflowId: "wf-1",
    stepId: "s3",
    invocation: {
      integrationId: "gmail",
      operation: "gmail.messages.send",
      args: { subject: "hello" },
      metrics: { "invoice.amount": 1200 },
    },
    reason: "exceeds invoice.amount <= 500 SGD",
    risk: "high",
    breachedLimits: ["amt"],
    approvalOwner: "user_sarah_chen",
    createdAt: NOW,
    dueAt: "2026-08-02T05:00:00.000Z",
  };
}

export async function runPGVerification(): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean, detail: string) =>
    checks.push({ name, pass, detail });

  const url = (process.env.DATABASE_URL ?? "").trim();
  if (url === "" || !/^postgres(ql)?:\/\//.test(url)) {
    // Refuse, do not skip quietly. A green banner for a suite that never
    // connected is worse than no suite.
    add(
      "PG-0 DATABASE_URL is a Postgres connection string",
      false,
      url === ""
        ? "DATABASE_URL is not set, so the Postgres stores were not exercised. Run `npm run db:check` first."
        : "DATABASE_URL is not a postgresql:// connection string.",
    );
    return checks;
  }

  const stores = createPostgresStores(url);
  const created: { runs: string[]; approvals: string[]; keys: string[] } = {
    runs: [],
    approvals: [],
    keys: [],
  };

  try {
    /* 1. Migration is idempotent — it runs on every boot. */
    try {
      const second = createPostgresStores(url);
      await second.ready;
      await stores.ready;
      add("PG-1 the schema migration is idempotent", true, "applied twice without error");
    } catch (err) {
      add("PG-1 the schema migration is idempotent", false, String(err));
      return checks;
    }

    /* 2. A run survives the round trip VALUE-IDENTICALLY. jsonb has no Date,
          Map or Set, so this is the codec's whole reason for existing. */
    {
      const id = `${TOKEN}-run-1`;
      created.runs.push(id);
      const state = runState(id);
      await stores.runStore.createRun(state);
      const back = await stores.runStore.getRun(id);

      const payload = back?.trigger.payload as Record<string, unknown> | undefined;
      const ctx = back?.context as Record<string, unknown> | undefined;
      const dateOk = payload?.when instanceof Date;
      const mapOk = payload?.tags instanceof Map && (payload.tags as Map<string, number>).get("priority") === 1;
      const setOk = ctx?.seen instanceof Set && (ctx.seen as Set<string>).has("a");

      add(
        "PG-2 a run round-trips with Date, Map and Set intact",
        back !== null && dateOk && mapOk && setOk && back.cursor === 3,
        `found=${back !== null} Date=${dateOk} Map=${mapOk} Set=${setOk} cursor=${back?.cursor}`,
      );
    }

    /* 3. Events append rather than rewrite, and come back in order. */
    {
      const id = `${TOKEN}-run-1`;
      const state = runState(id, 5);
      await stores.runStore.saveRun(state);
      const back = await stores.runStore.getRun(id);
      const ids = (back?.events ?? []).map((e) => ("stepId" in e ? e.stepId : ""));
      add(
        "PG-3 events append and read back in sequence order",
        back?.events.length === 5 && ids.join(",") === "s1,s2,s3,s4,s5",
        `count=${back?.events.length} order=${ids.join(",")}`,
      );
    }

    /* 4. THE IDEMPOTENCY GUARANTEE. A primary key, not a read-then-write. */
    {
      const key = `${TOKEN}-idem`;
      created.keys.push(key);
      const first = await stores.runStore.claimIdempotencyKey(key);
      const second = await stores.runStore.claimIdempotencyKey(key);
      add(
        "PG-4 an idempotency key can be claimed exactly once",
        first === true && second === false,
        `first=${first} second=${second}`,
      );
    }

    /* 5. Concurrent claims of the SAME key: exactly one winner. This is the
          property a read-then-write cannot provide and a unique index can. */
    {
      const key = `${TOKEN}-idem-race`;
      created.keys.push(key);
      const results = await Promise.all(
        Array.from({ length: 8 }, () => stores.runStore.claimIdempotencyKey(key)),
      );
      const winners = results.filter(Boolean).length;
      add(
        "PG-5 eight concurrent claims produce exactly one winner",
        winners === 1,
        `winners=${winners} of ${results.length}`,
      );
    }

    /* 6. An approval is decided once, ever — enforced by the primary key. */
    {
      const runId = `${TOKEN}-run-1`;
      const apId = `${TOKEN}-ap-1`;
      created.approvals.push(apId);
      await stores.runStore.createApproval(approval(apId, runId));

      const decision: ApprovalDecision = {
        approvalId: apId,
        decision: "approved",
        decidedBy: "user_sarah_chen",
        decidedAt: NOW,
      };
      await stores.runStore.saveDecision(decision);

      let refused = false;
      try {
        await stores.runStore.saveDecision(decision);
      } catch {
        refused = true;
      }
      const stored = await stores.runStore.getDecision(apId);
      add(
        "PG-6 an approval cannot be decided twice",
        refused && stored?.decision === "approved",
        `secondRefused=${refused} stored=${stored?.decision}`,
      );
    }

    /* 7. Pending approvals exclude decided ones. The inbox is the product. */
    {
      const runId = `${TOKEN}-run-1`;
      const openId = `${TOKEN}-ap-2`;
      created.approvals.push(openId);
      await stores.runStore.createApproval(approval(openId, runId));

      const pending = await stores.runStore.listPendingApprovals();
      const mine = pending.filter((a) => a.approvalId.startsWith(TOKEN));
      add(
        "PG-7 the pending list holds the undecided approval and not the decided one",
        mine.length === 1 && mine[0]?.approvalId === openId,
        `pending(mine)=${mine.map((a) => a.approvalId).join(",") || "none"}`,
      );
    }

    /* 8. DURABILITY. Throw the store away, build a new one, read it back. This
          is the guarantee M4 depends on and the reason Postgres exists here. */
    {
      const id = `${TOKEN}-run-1`;
      await closeSql();
      const reopened = createPostgresStores(url);
      const back = await reopened.runStore.getRun(id);
      const pending = (await reopened.runStore.listPendingApprovals()).filter((a) =>
        a.approvalId.startsWith(TOKEN),
      );
      add(
        "PG-8 a paused run and its approval survive a new connection",
        back?.status === "awaiting_approval" && back.cursor === 3 && pending.length === 1,
        `status=${back?.status} cursor=${back?.cursor} events=${back?.events.length} pending=${pending.length}`,
      );
    }

    /* 9. Packages: stored, addressed by (agent, version), latest resolves. */
    {
      const s = createPostgresStores(url);
      const base: PackageRecord = {
        agentId: `${TOKEN}-agent`,
        agentVersion: 1,
        checksum: "fnv1a-aaaa1111",
        builtAt: NOW,
        planId: `${TOKEN}-plan`,
        planVersion: 1,
        pkg: {
          agentId: `${TOKEN}-agent`,
          agentVersion: 1,
          builtAt: NOW,
          systemPrompt: "p",
          workflows: [],
          allowedOperations: ["gmail.messages.send"],
          checksum: "fnv1a-aaaa1111",
        },
      };
      await s.buildStore.savePackage(base);
      await s.buildStore.savePackage({
        ...base,
        agentVersion: 2,
        checksum: "fnv1a-bbbb2222",
        builtAt: "2026-08-02T03:00:00.000Z",
        pkg: { ...base.pkg, agentVersion: 2, checksum: "fnv1a-bbbb2222" },
      });

      const v1 = await s.buildStore.getPackage(`${TOKEN}-agent`, 1);
      const latest = await s.buildStore.getLatestPackage(`${TOKEN}-agent`);
      add(
        "PG-9 packages are addressed by agent and version, and latest resolves",
        v1?.checksum === "fnv1a-aaaa1111" && latest?.agentVersion === 2,
        `v1=${v1?.checksum} latest=v${latest?.agentVersion}`,
      );

      const job: BuildJob = {
        jobId: `${TOKEN}-job-1`,
        planId: `${TOKEN}-plan`,
        planVersion: 1,
        agentId: `${TOKEN}-agent`,
        agentVersion: 1,
        status: "completed",
        attempt: 1,
        logs: [{ at: NOW, level: "info", message: "built" }],
        checksum: "fnv1a-aaaa1111",
        error: null,
        startedAt: NOW,
        endedAt: NOW,
      };
      await s.buildStore.saveJob(job);
      const backJob = await s.buildStore.getJob(job.jobId);
      add(
        "PG-10 a build job round-trips with its log",
        backJob?.status === "completed" && backJob.logs.length === 1,
        `status=${backJob?.status} logs=${backJob?.logs.length}`,
      );
    }

    /* 11. PARITY. The same sequence against both stores must agree, or
           `ORIANT_RUNTIME_STORAGE` is a fork rather than a switch. */
    {
      const memory: RunStore = new InMemoryRunStore();
      const pg = createPostgresStores(url).runStore;
      const id = `${TOKEN}-parity`;
      created.runs.push(id);
      const state = runState(id, 3);

      await memory.createRun(structuredClone(state));
      await pg.createRun(structuredClone(state));

      const a = await memory.getRun(id);
      const b = await pg.getRun(id);

      // Compared field by field rather than by JSON: the codec restores Dates
      // and Maps, which JSON.stringify would flatten on BOTH sides and hide any
      // difference that actually mattered.
      const same =
        a?.status === b?.status &&
        a?.cursor === b?.cursor &&
        a?.events.length === b?.events.length &&
        (a?.trigger.payload.when as Date)?.getTime() ===
          (b?.trigger.payload.when as Date)?.getTime() &&
        (a?.context.seen as Set<string>)?.size === (b?.context.seen as Set<string>)?.size;

      add(
        "PG-11 the Postgres store and the in-memory store agree",
        same,
        `memory=${a?.status}/${a?.cursor}/${a?.events.length} postgres=${b?.status}/${b?.cursor}/${b?.events.length}`,
      );
    }
  } finally {
    /* Remove only what this run created. The suite must be safe against a
       database that has real rows in it, so it never truncates. */
    try {
      const s = createPostgresStores(url);
      const sql = (await import("../persist/pg/client")).getSql(url);
      await sql`DELETE FROM oriant_approval_decisions WHERE approval_id LIKE ${TOKEN + "%"}`;
      await sql`DELETE FROM oriant_approvals WHERE approval_id LIKE ${TOKEN + "%"}`;
      await sql`DELETE FROM oriant_run_events WHERE run_id LIKE ${TOKEN + "%"}`;
      await sql`DELETE FROM oriant_runs WHERE run_id LIKE ${TOKEN + "%"}`;
      await sql`DELETE FROM oriant_idempotency_keys WHERE key LIKE ${TOKEN + "%"}`;
      await sql`DELETE FROM oriant_build_jobs WHERE job_id LIKE ${TOKEN + "%"}`;
      await sql`DELETE FROM oriant_packages WHERE agent_id LIKE ${TOKEN + "%"}`;
      void s;
    } catch {
      // Cleanup failure must not turn a passing suite red; the rows are
      // prefixed and harmless.
    }
    await closeSql().catch(() => {});
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
      ? `POSTGRES OK — ${results.length}/${results.length} checks passed.`
      : `POSTGRES BROKEN — ${failed} of ${results.length} checks failed.`,
  );
  return lines.join("\n");
}
