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
 */

import {
  HandoffPayloadError,
  StaticHandoffSource,
  type CollectedHandoff,
} from "../pipeline/source";
import { ROLE_B_HANDOFF_RESOLVED } from "../../plan/fixtures/role-b-handoff";

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
