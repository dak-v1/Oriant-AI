/**
 * /app/pipeline — the six-stage pass from Role B's handoff to a live workforce.
 *
 * Everything downstream of an approved plan has been reachable only by curl:
 * `POST /api/runtime/pipeline` runs collect, ingest, validate, build, prove and
 * activate in one request and answers with a full report — six stage results, a
 * gap report of everything the ingest had to assume, and whatever went live —
 * and until now nothing rendered any of it. This route is that report.
 *
 * A THIN SERVER COMPONENT OVER A CLIENT SCREEN, the same shape the other Operate
 * routes use. There is no lane switch here, unlike `/app/workspace/*`: those
 * screens exist twice because a scripted demo and a runtime-backed view answer
 * the same question, and picking wrong would put a simulated pause button in
 * front of somebody who asked for a real one. The pipeline has no scripted
 * counterpart at all — there is one pass and it is the real one — so there is
 * nothing to choose between and no `?live=` to read.
 *
 * `force-dynamic` because the screen's first act is to ask the runtime what the
 * last pass produced. Nothing about this page is prerenderable, and a build-time
 * render would bake in "no pass on record" for the life of the deployment.
 *
 * Note that the shell's journey guard (`lib/mock/state-machine.ts`) does not
 * cover this prefix, which is correct: that gate exists so a scripted demo
 * cannot be deep-linked past its own narrative, and this screen has no narrative
 * to skip. Somebody who wants to run a pass can always reach the screen that
 * runs one.
 */
import PipelineScreen from "@/components/live/pipeline/PipelineScreen";

export const dynamic = "force-dynamic";

export default function PipelinePage() {
  return <PipelineScreen />;
}
