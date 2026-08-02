/**
 * components/live/sandbox/format.ts — turning the runtime's words into the
 * screen's words, in one place.
 *
 * The rule every function here follows: NOTHING IS INVENTED AND NOTHING IS
 * SOFTENED. A status word the runtime sent is shown as the runtime sent it, with
 * a plain-English gloss BESIDE it rather than instead of it, so an owner reading
 * "awaiting_approval" and an engineer reading a log are looking at the same
 * token. Where this file has no gloss for a word, the word itself is the label —
 * a status this build has not learned must read as unfamiliar, not as fine.
 */

/** "1 agent" / "2 agents", with the number. */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * An ISO instant as a local time, or the raw string when it will not parse.
 *
 * Never "—" on a bad parse: an instant the runtime sent and this screen could
 * not read is information, and swallowing it would hide a contract break behind
 * a dash that also means "absent".
 */
export function formatInstant(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed).toLocaleString();
}

/**
 * The six `RunStatus` words, glossed.
 *
 * A plain record rather than a `satisfies Record<RunStatus, …>` on purpose: this
 * lane reads `finalStatus` as a plain string (see api.ts), so a seventh word must
 * be renderable rather than a compile error in a client component that would
 * still have to render SOMETHING at runtime. `statusGloss` returns null for
 * anything not listed and the callers print the bare word.
 */
const STATUS_GLOSS: Record<string, string> = {
  running: "still running when the sandbox stopped watching",
  awaiting_approval: "stopped and waited for a person",
  completed: "ran to the end",
  failed: "ended in an error",
  refused: "was refused by a guardrail or by the simulated owner",
  cancelled: "was cancelled",
};

export function statusGloss(status: string): string | null {
  return STATUS_GLOSS[status] ?? null;
}

/**
 * Which `.oa-status--*` badge a scenario's outcome earns.
 *
 * Only two, and that is the point: the runtime judges a scenario `passed: true`
 * or `passed: false` in code, and there is no third verdict to render. A run
 * that ended `awaiting_approval` and PASSED did exactly what its scenario
 * expected — the pause is the proof — so it is not amber. The status word is
 * printed beside the badge for the reader who wants to know which shape the pass
 * took.
 */
export function outcomeBadge(passed: boolean): { status: string; label: string } {
  return passed
    ? { status: "completed", label: "Passed" }
    : { status: "failed", label: "Failed" };
}

/**
 * What `packageSource` means for the strength of the evidence.
 *
 * The distinction is the reason `ScenarioResult` carries the field at all:
 * "stored" proves the artefact Activation will deploy, "compiled" proves an
 * equivalent one, and "none" means the run never reached a package. Only the
 * first is evidence about the thing that goes live.
 */
export function packageSourceNote(source: string): string {
  if (source === "stored") {
    return "Proved the package the Agent Factory built and stored — the same artefact Activation would deploy.";
  }
  if (source === "compiled") {
    return "Proved a fresh compile of the agent's spec, not the stored package. That is a weaker claim: it shows an equivalent artefact behaves, not the one that would go live.";
  }
  if (source === "none") {
    return "The run never reached a package, so it proved nothing about either the stored artefact or a compiled one.";
  }
  return `The runtime called this run's package source “${source}”, which this screen has no reading for.`;
}

/** Where the scenario actually executed. */
export function isolationNote(isolation: string): string {
  if (isolation === "in-process") {
    return "Ran in this server's own process. Every tool call was served by a stub, so nothing left the machine.";
  }
  if (isolation === "remote") {
    return "Ran on another machine through a remote isolate and came back unedited.";
  }
  return `The runtime called this run's isolation “${isolation}”, which this screen has no reading for.`;
}
