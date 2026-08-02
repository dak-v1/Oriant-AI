/**
 * /app/deploy — the go-live, against the runtime.
 *
 * WHAT THIS ROUTE USED TO BE. A simulation. It read `lib/mock/store`, rendered an
 * eight-step review nothing had checked, animated agents switching on one by one
 * and set `journey = "active_workspace"` — a convincing activation that never
 * sent a request anywhere. Meanwhile `/api/runtime/activation` has had three real
 * gates, a real 409 and a real deployment record for weeks, reachable only by
 * somebody who already knew the endpoint and what its fields meant. The runtime
 * worked; the screen was the lie. Every import of the demo store, the autopilot
 * script and `components/mock/deploy/**` is gone from this file. One thing from
 * that directory is back in the lane on purpose: components/live/deploy/ui/*
 * imports the mock checklist's STYLESHEET, read-only, so the real gates wear the
 * demo's anatomy — the owner asked for that look — while the store, the scripted
 * activation animation and the auto-redirect stay gone.
 *
 * A THIN SERVER COMPONENT OVER A CLIENT SCREEN, the same shape `/app/pipeline`
 * uses. There is no lane switch here, unlike `/app/workspace/*`: those screens
 * exist twice because a scripted demo and a runtime-backed view answer the same
 * question, and choosing wrong would put a simulated control in front of somebody
 * who asked for a real one. Activation now has no scripted counterpart at all —
 * there is one go-live and it is the real one — so there is nothing to choose
 * between and no `?live=` to read.
 *
 * `force-dynamic` matches `/app/pipeline`. This file reads nothing on the server
 * today, so a prerender would be harmless; the flag is here so that a future
 * server read — the plan source, say — cannot be quietly baked into the build
 * output and served as the truth for the life of the deployment.
 *
 * ONE THING THIS FILE CANNOT FIX FROM INSIDE ITSELF. The shell's journey guard
 * (`ROUTE_GATES` in lib/mock/state-machine.ts, applied by
 * components/mock/shell/AppShell.tsx) still gates this prefix behind the SCRIPTED
 * journey reaching `ready_to_activate`, and redirects to onboarding otherwise.
 * That gate exists so a demo cannot be deep-linked past its own narrative, and
 * this screen no longer has a narrative to skip — an owner whose workforce is
 * genuinely one press from live is bounced to onboarding because a demo they
 * never ran left `journey` at "not_started". components/live/route-lane.ts records
 * the identical defect being fixed for `/app/workspace/*`; the same reasoning now
 * applies here, and the fix belongs in those two files rather than this one.
 */
import LiveDeployScreen from "@/components/live/deploy/LiveDeployScreen";

export const dynamic = "force-dynamic";

export default function DeployPage() {
  return <LiveDeployScreen />;
}
