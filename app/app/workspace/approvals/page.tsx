/**
 * /app/workspace/approvals — one URL, two Approval Inboxes, and an explicit
 * switch between them.
 *
 * THE DEFAULT IS THE SCRIPTED DEMO, AND NOTHING HERE CHANGES IT. Visiting this
 * route with no query string renders exactly what it rendered before this file
 * grew a switch: `components/mock/approvals/ApprovalsScreen`, inside the same
 * Suspense boundary it has always needed for its `?focus=` deep link (spec §18,
 * §18.1, C-02). ROLE_C_PLAN's integration checkpoints say the fixture path must
 * keep working permanently — it is the fallback, the test harness and what
 * carries the demo if another lane slips — so it keeps the URL and the live
 * screen has to be asked for.
 *
 * OPTING IN, both accepted, the query string winning either way:
 *
 *   /app/workspace/approvals?live=1      the live, runtime-backed inbox
 *   /app/workspace/approvals?live=0      the scripted demo, even where the
 *                                        environment defaults to live
 *   ORIANT_APPROVALS_LANE=live           make live the default for this
 *                                        deployment
 *
 * Deep links carry both: `?live=1&focus=<approvalId>` opens the live drawer on
 * one approval, and `?focus=<approvalId>` alone still means the demo's C-02
 * link. Anything the switch cannot read renders a refusal rather than falling
 * back — see `components/live/approvals/lane.ts` for why guessing is the one
 * behaviour that is not available here.
 *
 * WHY THE ENVIRONMENT VARIABLE IS NOT `NEXT_PUBLIC_`. This page reads it on the
 * server and passes down a resolved lane, so the value never needs to reach the
 * browser. `docs/RUNTIME_SETUP.md` §3 is emphatic that nothing runtime-shaped
 * gets that prefix, and a switch that decides whether a screen can send customer
 * email should not be inlined into a bundle that anyone can read and nobody can
 * change.
 *
 * Reading `searchParams` makes this route dynamic, which it effectively already
 * was: both screens are client components that render from a store or a fetch,
 * and neither has anything to prerender.
 */
import { Suspense } from "react";
import LaneRefusal from "@/components/live/approvals/LaneRefusal";
import LiveApprovalsScreen from "@/components/live/approvals/LiveApprovalsScreen";
import { APPROVALS_LANE_ENV, resolveApprovalsLane } from "@/components/live/approvals/lane";
import ApprovalsScreen from "@/components/mock/approvals/ApprovalsScreen";

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const lane = resolveApprovalsLane({
    live: params.live,
    env: process.env[APPROVALS_LANE_ENV],
  });

  if (lane.lane === "refused") {
    return <LaneRefusal setting={lane.setting} value={lane.value} accepted={lane.accepted} />;
  }

  if (lane.lane === "live") {
    return (
      <Suspense fallback={null}>
        <LiveApprovalsScreen />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={null}>
      <ApprovalsScreen />
    </Suspense>
  );
}
