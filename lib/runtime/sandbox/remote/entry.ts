/**
 * lib/runtime/sandbox/remote/entry.ts — the scenario runner, as it exists inside
 * a Daytona sandbox (ROLE_C_PLAN M3).
 *
 * `SandboxIsolation.run` takes a LOCAL closure, and a closure cannot be shipped
 * to another machine. Handing a remote sandbox a handle to a local call would
 * leave the scenario executing on this laptop while the verdict claimed
 * otherwise — theatre, and worse than having no isolation at all, because
 * Activation gates on that verdict. Genuine isolation means the scenario itself
 * runs over there, which is what this file is: one process, one scenario id, one
 * line of output, no repo and no node_modules underneath it. Everything it needs
 * arrives inside the bundle scripts/bundle-sandbox-runner.mjs produces.
 *
 * IT RUNS THE REAL RUNNER, NOT A REMOTE-FLAVOURED COPY OF IT. The acceptance
 * criterion for the whole feature is that a scenario run here is deep-equal to
 * the same scenario run in process — every event timestamp, every id. That is
 * falsifiable only while both paths call the same `runScenario`; a second
 * implementation shaped like the first would make the comparison a test of two
 * copies agreeing rather than of isolation being transparent.
 *
 * NO PACKAGE STORE, DELIBERATELY. A sandbox has no Factory store, so the
 * scenario compiles its package from the spec and the result says so
 * (`packageSource: "compiled"`). Building the plan in here to earn the word
 * "stored" would be a fresh compile wearing the provenance of the artefact
 * Activation deploys, which is the one claim a pre-flight gate must never fake.
 * The host's local comparison therefore runs `runScenario` with no store either
 * — like against like, and both honest about which artefact they proved.
 */

import { BRIGHTPATH_PLAN } from "../../../plan/fixtures/brightpath";
import { runScenario } from "../runner";
import { BRIGHTPATH_SCENARIOS } from "../scenarios";
import type { ScenarioResult } from "../types";
import {
  RemoteProtocolError,
  type RemoteScenarioResponse,
  decodeRequest,
  encodeResponse,
} from "./protocol";

async function main(argv: readonly string[]): Promise<ScenarioResult> {
  const request = decodeRequest(argv);
  const scenario = BRIGHTPATH_SCENARIOS.find((s) => s.id === request.scenarioId);
  if (!scenario) {
    // Names what IS here, because the likeliest cause is a stale bundle rather
    // than a mistyped id, and only the list tells those two apart from outside.
    throw new RemoteProtocolError(
      `Unknown scenario "${request.scenarioId}". This bundle carries ${BRIGHTPATH_SCENARIOS.length}: ` +
        BRIGHTPATH_SCENARIOS.map((s) => s.id).join(", "),
    );
  }
  return runScenario(scenario, BRIGHTPATH_PLAN);
}

/**
 * Report, then exit explicitly.
 *
 * EXPLICITLY, because the host waits for this process to end and a scenario is
 * allowed to leave work behind: sc-24-send-hangs finishes on a promise that
 * never settles, by design. Waiting for an empty event loop would let a scenario
 * about a hang hang the command that reported its verdict.
 *
 * INSIDE THE WRITE CALLBACK, because output in a sandbox is a pipe: the write is
 * asynchronous, and exiting before it flushes would truncate the one line the
 * whole run exists to produce.
 *
 * A failure is stated twice on purpose — plain text for whoever is reading a
 * terminal, then the same thing in the shape the host parses. The toolbox
 * reports an exit code only optionally, so a runner that could not run has to be
 * legible to a reader who never sees one.
 */
function finish(response: RemoteScenarioResponse, code: number): void {
  const line = `${encodeResponse(response)}\n`;
  if (response.ok) {
    process.stdout.write(line, () => process.exit(code));
    return;
  }
  process.stderr.write(`${response.error}\n`, () => {
    process.stdout.write(line, () => process.exit(code));
  });
}

main(process.argv.slice(2)).then(
  (result) => finish({ ok: true, result }, 0),
  (err: unknown) => finish({ ok: false, error: err instanceof Error ? err.message : String(err) }, 1),
);
