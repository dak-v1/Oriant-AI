/**
 * /app/sandbox — the Sandbox, over the real runtime.
 *
 * WHAT WAS HERE BEFORE. `components/mock/sandbox/SandboxScreen`: a script over
 * `lib/mock/fixtures/sandbox-scenarios.ts`. Its three tests were authored prose
 * about a named BrightPath customer — an aircon complaint, a WhatsApp Business
 * thread — with no relationship to the plan the runtime holds, and its "1 of 4
 * passed" counters were demo-store state advanced by `setTimeout`. It never
 * called `/api/runtime/sandbox`, which has generated a scenario suite from the
 * current plan, run it against the packages the Factory stored and returned the
 * verdict Activation gates on since M3. It was the last scripted page in the
 * Build section; the Agent Factory and Activation were rewritten before it.
 *
 * None of that machinery is imported any more. What IS imported from the mock
 * again — deliberately, at the owner's request — is the LOOK:
 * components/live/sandbox/ui/** carries the mock's four-zone workspace and its
 * stylesheet byte for byte, while the data underneath is the runtime's own. The
 * mock's STORE, its fixtures and its timeline services are referenced by nothing
 * here.
 *
 * A THIN SERVER COMPONENT OVER A CLIENT SCREEN, the same shape /app/build and
 * /app/pipeline use. There is no `?live=` lane switch, and that is the point
 * rather than an omission: the lane exists where a scripted screen and a
 * runtime-backed screen answer the same question and picking wrong would put a
 * simulated control in front of somebody who asked for a real one. There is now
 * only one Sandbox and it is the real one, so there is nothing to choose
 * between. `/app/sandbox` is registered in `RUNTIME_ONLY_PREFIXES` for the same
 * reason, without which the scripted journey guard redirects this page to
 * /app/onboarding in the tick after it renders.
 *
 * `force-dynamic` because the screen's first act is to ask the runtime which
 * scenarios this plan would be judged by. Nothing here is prerenderable, and a
 * build-time render would bake one plan's test list into the deployment.
 */
import SandboxScreen from "@/components/live/sandbox/SandboxScreen";

export const dynamic = "force-dynamic";

export default function SandboxPage() {
  return <SandboxScreen />;
}
