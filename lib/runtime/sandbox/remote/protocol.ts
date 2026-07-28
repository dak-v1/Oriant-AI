/**
 * lib/runtime/sandbox/remote/protocol.ts — the contract between this process and
 * a scenario running inside a Daytona sandbox (ROLE_C_PLAN M3).
 *
 * The two ends are compiled separately: the host runs from the repo, the sandbox
 * runs a bundle built minutes or days earlier that carries no repo at all. What
 * they must agree on therefore lives HERE and exactly once — the marker literal,
 * the argv shape, the envelope, and the reading of each. Each direction has one
 * encoder and one decoder for that reason: a marker string or a parse rule
 * restated on the far side is a bug that surfaces only as an unparseable remote
 * run, at which point nothing tells it apart from a sandbox that never started.
 *
 * A REMOTE RUN IS ONLY EVIDENCE IF IT CAN BE TOLD APART FROM A NON-RUN. A
 * sandbox's output is shared with whatever else the process, the shell or Node
 * decided to print, so a verdict is claimed only by the line carrying the
 * marker; everything else is ignorable by construction. The corollary is the
 * load-bearing half: no marker line means NO VERDICT, and every fault below
 * throws rather than returning something a caller could mistake for a result. A
 * remote run that quietly degraded into something local-looking and green would
 * make the sandbox verdict a lie, and Activation gates on that verdict.
 *
 * THE ENVELOPE SAYS WHICH OF THE TWO IT IS, and carries nothing the result
 * already carries — `ScenarioResult` names its own scenario, so the decode
 * checks THAT against what was asked for rather than an echo the sandbox could
 * get right while getting the result wrong. There is deliberately no version
 * number: the payload is validated field by field, which a stale bundle cannot
 * satisfy by asserting a number about itself.
 *
 * `ok: false` is not the ordinary failure path. A scenario that fails is a
 * perfectly good `ok: true` result with `passed: false` — the workforce
 * misbehaved, which is what the sandbox exists to find out. `ok: false` means
 * the RUNNER could not run it at all, and it always travels with a non-zero exit
 * code, because the toolbox reports an exit code only optionally and a failure
 * has to survive not being asked about.
 */

import type { ScenarioResult } from "../types";

/**
 * Opens the one line that carries a verdict. Deliberately unlovely and unlikely
 * to occur in scenario prose, log output or a stack trace: the whole parse hangs
 * off finding it.
 */
export const REMOTE_RESULT_MARKER = "__ORIANT_SANDBOX_RESULT__";

/** What the host asks the bundle to run. One scenario per invocation. */
export interface RemoteScenarioRequest {
  scenarioId: string;
}

/** What the bundle prints, exactly once, on the marker line. */
export type RemoteScenarioResponse =
  | { ok: true; result: ScenarioResult }
  | { ok: false; error: string };

/**
 * Every way the wire can be wrong, under one name, so a caller can tell a
 * protocol fault ("the sandbox did not answer in a shape I understand") from a
 * scenario failure ("it answered, and the verdict is red"). Those two must never
 * be reported as one thing: the first is infrastructure, the second is the
 * workforce.
 */
export class RemoteProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteProtocolError";
  }
}

/**
 * Scenario ids reach the sandbox as words in a command line, so the safe set is
 * pinned rather than trusted. Every id in the library is already of this shape;
 * the point is that one which is NOT — carrying a quote, a semicolon or a space
 * — can never be turned into a command by either end.
 */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function assertSafeId(scenarioId: string): string {
  if (!SAFE_ID.test(scenarioId)) {
    throw new RemoteProtocolError(
      `Scenario id ${JSON.stringify(scenarioId)} is not a plain identifier and cannot be sent to a sandbox.`,
    );
  }
  return scenarioId;
}

/** Keeps a diagnostic legible when the payload is a whole event stream. */
function truncate(text: string, max = 300): string {
  const flat = text.trim().replace(/\s+/g, " ");
  return flat.length <= max ? flat : `${flat.slice(0, max)}… (${flat.length} chars)`;
}

/**
 * Host side: the argv words to append after `node <bundle>`.
 *
 * Validation belongs on THIS side. By the time the sandbox reads its argv a
 * shell has already interpreted the line, so `decodeRequest` can only report an
 * id that should never have been sent; only the encoder can refuse to send it.
 */
export function encodeRequest(request: RemoteScenarioRequest): string[] {
  return [assertSafeId(request.scenarioId)];
}

/** Sandbox side: `process.argv.slice(2)`, held to the same rule. */
export function decodeRequest(argv: readonly string[]): RemoteScenarioRequest {
  if (argv.length !== 1) {
    throw new RemoteProtocolError(
      `Expected exactly one argument, a scenario id; received ${argv.length}.`,
    );
  }
  return { scenarioId: assertSafeId(argv[0]) };
}

/**
 * Sandbox side: the line to print, newline excluded.
 *
 * One line, because the host reads the output line by line and a payload split
 * across two of them would be indistinguishable from a runner that died halfway
 * through printing. `JSON.stringify` never emits a newline it did not escape, so
 * "one line" is a property of this encoding rather than a hope about the result.
 */
export function encodeResponse(response: RemoteScenarioResponse): string {
  return `${REMOTE_RESULT_MARKER} ${JSON.stringify(response)}`;
}

/**
 * Host side: pulls the verdict out of everything the sandbox printed.
 *
 * The transport hands back stdout and stderr merged into one string, so the
 * marker is located with `indexOf` inside each line rather than `startsWith`: an
 * unterminated write can land in front of it on the same line, and losing the
 * payload to that would look exactly like a runner that crashed. The LAST marker
 * wins, so anything printed earlier — by a dependency, by a shell, by a previous
 * command in the same session — cannot be mistaken for the result.
 *
 * The request is required rather than optional so the identity check cannot be
 * skipped by a caller in a hurry. A sandbox holding a stale bundle would
 * otherwise hand back a real `ScenarioResult` for a different scenario: green,
 * well-formed, and about something nobody asked about.
 *
 * `exitCode` is optional only because not every transport reports one. When a
 * transport does, pass it: a well-formed verdict arriving alongside a non-zero
 * exit means the runner and its process disagree, and neither is then
 * trustworthy. That correlation is a rule about the protocol, not about any one
 * transport, so it lives here — restating it on the far side is exactly the
 * drift this module exists to prevent.
 */
export function decodeResponse(
  output: string,
  request: RemoteScenarioRequest,
  exitCode?: number,
): ScenarioResult {
  // An absent exit code must read as "the sandbox did not say", never as "the
  // sandbox said fine".
  const code = exitCode === undefined ? "no reported exit code" : `exit ${exitCode}`;

  let payload: string | null = null;
  for (const line of output.split(/\r?\n/)) {
    const at = line.indexOf(REMOTE_RESULT_MARKER);
    if (at !== -1) payload = line.slice(at + REMOTE_RESULT_MARKER.length);
  }

  if (payload === null) {
    throw new RemoteProtocolError(
      `The sandbox printed no ${REMOTE_RESULT_MARKER} line for "${request.scenarioId}" ` +
        `(${code}), so no scenario is known to have run. A stale or half-built runner ` +
        `bundle looks exactly like this — rebuild it with \`npm run sandbox:bundle\`. ` +
        `Output: ${truncate(output)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload.trim());
  } catch (err) {
    throw new RemoteProtocolError(
      `The sandbox's result line for "${request.scenarioId}" is not JSON (${
        err instanceof Error ? err.message : String(err)
      }): ${truncate(payload)}`,
    );
  }

  // Nothing is known about the parsed value yet, so it is narrowed one field at
  // a time rather than asserted into the envelope type wholesale.
  const envelope = parsed as { ok?: unknown; error?: unknown; result?: unknown };
  if (envelope.ok === false) {
    throw new RemoteProtocolError(
      `The sandbox could not run "${request.scenarioId}": ` +
        (typeof envelope.error === "string" ? envelope.error : "no reason given"),
    );
  }
  if (envelope.ok !== true) {
    throw new RemoteProtocolError(
      `The sandbox's result line for "${request.scenarioId}" is not a response envelope: ${truncate(payload)}`,
    );
  }
  if (!isScenarioResult(envelope.result)) {
    throw new RemoteProtocolError(
      `The sandbox's result for "${request.scenarioId}" is not a ScenarioResult, so the runner ` +
        `bundle and this host disagree about the protocol: ${truncate(payload)}`,
    );
  }
  if (envelope.result.scenarioId !== request.scenarioId) {
    throw new RemoteProtocolError(
      `Asked the sandbox for "${request.scenarioId}" and it answered about "${envelope.result.scenarioId}".`,
    );
  }

  // Checked last, so a malformed payload is reported as malformed rather than as
  // an exit-code disagreement. A verdict and a non-zero exit cannot both be
  // right, and there is no way to tell which one lied.
  if (exitCode !== undefined && exitCode !== 0) {
    throw new RemoteProtocolError(
      `The sandbox reported a verdict for "${request.scenarioId}" and then ${code}. A ` +
        `successful envelope must travel with exit 0, so one of the two is wrong and ` +
        `neither can be trusted. Output: ${truncate(output)}`,
    );
  }

  return envelope.result;
}

/**
 * Checked field by field, because a cast is what would let a malformed payload
 * become a verdict: `undefined` is falsy, so an absent `passed` would read as
 * "this scenario failed" and an absent `events` would fail the deep-equal
 * against a local run with a diff that says nothing about why.
 */
function isScenarioResult(value: unknown): value is ScenarioResult {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.scenarioId === "string" &&
    typeof r.name === "string" &&
    typeof r.category === "string" &&
    typeof r.agentId === "string" &&
    typeof r.passed === "boolean" &&
    Array.isArray(r.failures) &&
    typeof r.finalStatus === "string" &&
    typeof r.approvalsRaised === "number" &&
    Array.isArray(r.operationsCalled) &&
    (typeof r.failureReason === "string" || r.failureReason === null) &&
    typeof r.packageSource === "string" &&
    Array.isArray(r.events) &&
    typeof r.runId === "string"
  );
}
