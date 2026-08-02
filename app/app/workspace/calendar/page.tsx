/**
 * /app/workspace/calendar — one URL, two Automation Calendars, and an explicit
 * switch between them.
 *
 * THE DEFAULT IS THE SCRIPTED DEMO, AND NOTHING HERE CHANGES IT. Visiting this
 * route with no query string renders exactly what it rendered before this file
 * grew a switch — the July 2026 demo month, its team chips and its day drawer,
 * now in `./demo-screen` with its behaviour untouched. ROLE_C_PLAN's integration
 * checkpoints say the fixture path must keep working permanently: it is the
 * fallback, the test harness, and what carries the demo if another lane slips.
 *
 * OPTING IN, both accepted, the query string winning either way:
 *
 *   /app/workspace/calendar?live=1     the live calendar, backed by the runtime
 *   /app/workspace/calendar?live=0     the scripted demo, even where the
 *                                      environment defaults to live
 *   ORIANT_CALENDAR_LANE=live          make live the default for this deployment
 *
 * Anything the switch cannot read renders a refusal rather than falling back.
 * Guessing is the one behaviour that is not available here: the scripted month is
 * convincing, its dates are fixtures, and putting it in front of somebody who
 * asked in writing for the live one would have them plan a week around a
 * schedule that does not exist. The reasoning lives in `components/live/lane.ts`,
 * shared with Approvals and the rest of the Operate surface.
 *
 * WHY THE ENVIRONMENT VARIABLE IS NOT `NEXT_PUBLIC_`. This page reads it on the
 * server and passes down a resolved lane, so the value never needs to reach the
 * browser; `.env.example` and `docs/RUNTIME_SETUP.md` §3 are emphatic that
 * nothing runtime-shaped carries that prefix, because it is inlined into a bundle
 * anyone can read and nobody can change.
 *
 * `force-dynamic` is not decoration: reading `searchParams` already makes this
 * route dynamic, and stating it stops a production build from trying to
 * prerender a screen whose whole content is a live read.
 */
import Link from "next/link";
import { CALENDAR_LANE_ENV, resolveCalendarLane } from "@/components/live/calendar/lane";
import type { CalendarLane } from "@/components/live/calendar/lane";
import { OPERATE_LANE_ENV, RUNTIME_MODE_ENV } from "@/components/live/lane";
import LiveCalendarScreen from "@/components/live/calendar/LiveCalendarScreen";
import DemoCalendarScreen from "./demo-screen";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const lane = resolveCalendarLane({
    live: params.live,
    env: process.env[CALENDAR_LANE_ENV],
    operateEnv: process.env[OPERATE_LANE_ENV],
    runtimeModeEnv: process.env[RUNTIME_MODE_ENV],
  });

  if (lane.lane === "refused") return <LaneRefused lane={lane} />;
  if (lane.lane === "live") return <LiveCalendarScreen />;
  return <DemoCalendarScreen />;
}

/**
 * The screen for a lane setting this build does not implement.
 *
 * It renders INSTEAD of a calendar rather than above one, because either
 * available answer would be a guess about which screen was meant, and one of
 * those guesses puts a fixture month where a real schedule was asked for. Both
 * lanes are offered as links, so recovering costs one click and nobody has to
 * know the spelling.
 */
function LaneRefused({ lane }: { lane: Extract<CalendarLane, { lane: "refused" }> }) {
  return (
    <main className="oa-page oa-page--narrow">
      <div className="oa-card oa-stack" role="alert">
        <p className="oa-eyebrow">Operate · Automation calendar</p>
        <h1 className="oa-h2">That is not a calendar this app has</h1>
        <p className="oa-lead">
          This address asked for{" "}
          <strong>{lane.value === "" ? "(blank)" : lane.value}</strong>, and what is accepted is{" "}
          {lane.accepted}. Nothing was chosen for you: the sample calendar shows a fixed example
          month, and handing it to someone who asked for their own would have them plan around
          work that is not scheduled.
        </p>
        <div className="oa-cluster">
          <Link href="/app/workspace/calendar?live=1" className="oa-btn oa-btn--primary oa-btn--sm">
            Open your calendar
          </Link>
          <Link href="/app/workspace/calendar?live=0" className="oa-btn oa-btn--ghost oa-btn--sm">
            Open the sample calendar
          </Link>
        </div>
      </div>
    </main>
  );
}
