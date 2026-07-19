/**
 * Build engine (blueprint §15) — asynchronous per-agent generation jobs.
 *
 * Live mode: one Doubleword async job per agent, polled on every state read.
 * Fixture mode: deterministic time-based progress with the same lifecycle,
 * finished with locally rendered template artifacts (labeled fixture).
 */
import type { Db } from "../contracts";
import { generationPrompt, parseLiveBundle, renderArtifacts } from "./factory";
import { pollGeneration, submitGeneration } from "./providers/doubleword";
import { audit, requireApprovedPlan, trace } from "./orchestrator";
import { nowIso } from "./store";

const WAVE_OF = (idx: number) => (idx === 0 ? 1 : idx < 3 ? 2 : 3);

export async function startBuild(db: Db): Promise<void> {
  requireApprovedPlan(db);
  const planned = db.plan!.team.filter((a) => a.inPlan);
  if (planned.length === 0) return;
  if (Object.values(db.buildJobs).some((j) => j.status === "running" || j.status === "queued")) {
    return; // idempotent — one build at a time (blueprint §23.5)
  }
  db.buildJobs = {};
  db.artifacts = {};
  db.validations = {};
  db.phase = "building";
  audit(db, "build.started", `plan v${db.plan!.version}`, `${planned.length} agents`);

  for (const [idx, agent] of planned.entries()) {
    const submit = await submitGeneration(generationPrompt(agent, db.plan!.version));
    db.buildJobs[agent.id] = {
      agentId: agent.id,
      status: "running",
      pct: 0,
      wave: WAVE_OF(idx),
      sourcePlanVersion: db.plan!.version,
      providerJobId: submit.jobId,
      mode: submit.mode,
      startedAt: nowIso(),
    };
    trace(db, "doubleword", `agent_artifact_generation:${agent.id}`,
      submit.mode === "live" ? "running" : "completed", submit.mode, submit.error);
  }
}

/** Advance jobs; called from every GET /api/state (safe to call repeatedly). */
export async function tickBuilds(db: Db): Promise<void> {
  const jobs = Object.values(db.buildJobs);
  if (jobs.length === 0) return;
  const planned = db.plan?.team.filter((a) => a.inPlan) ?? [];
  let allDone = jobs.length > 0;

  for (const job of jobs) {
    if (job.status === "completed" || job.status === "failed") {
      allDone = allDone && job.status === "completed";
      continue;
    }
    const agent = planned.find((a) => a.id === job.agentId);
    if (!agent) { job.status = "failed"; job.error = "agent left the plan"; continue; }
    const elapsed = (Date.now() - new Date(job.startedAt ?? nowIso()).getTime()) / 1000;
    const idx = planned.findIndex((a) => a.id === job.agentId);

    if (job.mode === "fixture") {
      // staggered deterministic progress, ~9–14s per agent like the design
      job.pct = Math.max(0, Math.min(100, Math.round(elapsed * 14 - idx * 16)));
      if (job.pct >= 100) {
        job.status = "completed";
        job.finishedAt = nowIso();
        db.artifacts[agent.id] = renderArtifacts(agent, job.sourcePlanVersion);
      }
    } else if (job.providerJobId) {
      const poll = await pollGeneration(job.providerJobId);
      if (poll.status === "completed" && poll.content) {
        const { bundle, usedLive, warning } = parseLiveBundle(agent, job.sourcePlanVersion, poll.content);
        if (warning) bundle.warnings.push(warning);
        db.artifacts[agent.id] = bundle;
        job.status = "completed";
        job.pct = 100;
        job.finishedAt = nowIso();
        trace(db, "doubleword", `agent_artifact_generation:${agent.id}`, "completed",
          usedLive ? "live" : "fixture", warning);
      } else if (poll.status === "failed") {
        // safe terminal fallback: validated templates, honestly labeled
        db.artifacts[agent.id] = renderArtifacts(agent, job.sourcePlanVersion);
        db.artifacts[agent.id].warnings.push(`Live generation failed (${poll.error ?? "unknown"}); used validated templates.`);
        job.status = "completed";
        job.pct = 100;
        job.mode = "fixture";
        job.finishedAt = nowIso();
        trace(db, "doubleword", `agent_artifact_generation:${agent.id}`, "failed", "live", poll.error);
      } else {
        job.pct = Math.min(95, Math.round(elapsed * 6)); // visual progress while polling
      }
    }
    allDone = allDone && (job as { status: string }).status === "completed";
  }

  if (allDone && db.phase === "building") {
    db.phase = "built";
    audit(db, "build.completed", `plan v${db.plan?.version}`, `${jobs.length} packages`);
  }
}
