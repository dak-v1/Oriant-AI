/**
 * /app/build — the Agent Factory, over the real runtime.
 *
 * WHAT WAS HERE BEFORE. A simulation: `lib/mock/store`, `mockAgentFactoryService`,
 * `BUILD_FIXTURES` and a reconciler that scheduled `setTimeout`s to animate a
 * percentage. It never called `/api/runtime/build`, which has been compiling and
 * validating real agent packages since M2. An agent whose id had no entry in the
 * fixture table — which is every agent of a plan that came from a real handoff —
 * hit an early return in `runJob` and stayed at "Queued, waiting for a build
 * slot…" indefinitely. The owner read that as a broken product. The build was
 * fine; this screen was the defect, and none of that machinery is imported any
 * more. What IS imported from the mock again — deliberately, at the owner's
 * request — is the LOOK: components/live/build/ui/** carries the mock's card
 * grid, dark terminal and progress bar (its CSS copied verbatim, its shells
 * adapted), while the data underneath stays the runtime's own. The mock's
 * STORE and fixtures remain referenced by nothing here.
 *
 * A THIN SERVER COMPONENT OVER A CLIENT SCREEN, the same shape /app/pipeline
 * uses. There is no `?live=` lane switch, and that is the point rather than an
 * omission: the lane exists where a scripted screen and a runtime-backed screen
 * answer the same question and picking wrong would put a simulated control in
 * front of somebody who asked for a real one. There is now only one Agent
 * Factory and it is the real one, so there is nothing to choose between.
 *
 * `force-dynamic` because the screen's first act is to ask the runtime what it
 * has built. Nothing here is prerenderable, and a build-time render would bake
 * "nothing has been built" into the deployment.
 */
import AgentFactoryScreen from "@/components/live/build/AgentFactoryScreen";

export const dynamic = "force-dynamic";

export default function BuildPage() {
  return <AgentFactoryScreen />;
}
