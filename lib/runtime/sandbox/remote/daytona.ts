/**
 * lib/runtime/sandbox/remote/daytona.ts — the Sandbox, executed somewhere else.
 *
 * ROLE_C_PLAN M3 lists Daytona isolation last, and the seam in
 * `../types.ts` has always described it as "a network round trip per scenario".
 * This is that round trip. Three decisions shape the whole file, and each one is
 * a decision NOT to build the easier thing.
 *
 *   THE SCENARIO RUNS INSIDE THE SANDBOX, or the feature is theatre.
 *   `SandboxIsolation.run(label, fn)` hands over a LOCAL CLOSURE, and a closure
 *   cannot cross a machine boundary — it captures this process's stub tool
 *   client, its FixedClock, its module graph. An implementation that took the
 *   closure, created a remote sandbox, ran `fn()` here and returned the answer
 *   would satisfy the interface, report `name = "daytona"`, and be a lie: the
 *   scenario executed on this laptop and the verdict claims it did not. That is
 *   strictly worse than having no isolation, because the verdict is what
 *   Activation gates on. So `run()` REFUSES (see below) and the real work is the
 *   optional capability `SandboxIsolation.runScenarioRemotely(scenario)`, which
 *   ships a bundled runner into the sandbox, executes it there, and brings back
 *   the `ScenarioResult` the remote process produced. `runScenario` prefers that
 *   method whenever an isolation offers it, and stamps the result
 *   `isolation: "remote"` — so the mode a verdict was earned in is recorded on
 *   the verdict rather than inferred from how the caller was configured.
 *
 *   A REMOTE RESULT MUST BE INDISTINGUISHABLE FROM A LOCAL ONE. Every input the
 *   sandbox needs is pinned by construction — FixedClock, ids seeded from the
 *   scenario id, stubbed tools, a fixture reasoner — so the same scenario run
 *   remotely has no licence to differ from the same scenario run here, down to
 *   each event timestamp and id. That deep equality is the acceptance criterion,
 *   and it is falsifiable: if a remote run differs, isolation changed behaviour
 *   and that is a bug, not a tolerance to widen.
 *
 *   IT IS OPT-IN, AND THE STANDARD SUITE NEVER TOUCHES THE NETWORK. Determinism
 *   is an M3 exit criterion; `npm run verify` must be green AND byte-identical
 *   on a rerun. Forty-four round trips (24 scenarios + 20 stress cases) would
 *   make that criterion slow and hostage to a DNS hiccup. Nothing here is
 *   constructed unless a caller asks for it by name.
 *
 * TRANSPORT: THE SDK, NOT HAND-ROLLED REST. The raw path the legacy `/demo`
 * adapter uses (`POST /api/toolbox/{id}/process/execute`) is dead — it 404s. The
 * toolbox now lives behind `https://proxy.app.daytona.io/toolbox`, which rejects
 * an organisation API key with 401, so the credential that opens the control
 * plane does not open the data plane. `@daytonaio/sdk` holds that two-step, and
 * it is loaded with a DYNAMIC `await import` so the default in-process path
 * never pulls it — or its transitive AWS/OpenTelemetry tree — into a production
 * bundle.
 *
 * FAIL CLOSED AND LOUD. Every failure here throws. There is deliberately no
 * fallback to a local run, because a silent downgrade would produce exactly the
 * lie described above. The API key is never logged, never placed on a command
 * line, and is redacted out of any message this module raises.
 *
 * The sandbox is always deleted — on success, on failure, and on a caller that
 * forgets — because an abandoned sandbox bills until its auto-stop. Prefer
 * `withDaytonaIsolation()`, which puts the delete in a `finally` for you.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Daytona, Sandbox } from "@daytonaio/sdk";
import { BRIGHTPATH_SCENARIOS } from "../scenarios";
import type { SandboxIsolation, SandboxScenario, ScenarioResult } from "../types";
import {
  RemoteProtocolError,
  type RemoteScenarioRequest,
  decodeResponse,
  encodeRequest,
} from "./protocol";

/* ═══════════════════════════ Configuration ═══════════════════════════ */

/** Daytona's own default; only a self-hosted or regional endpoint needs more. */
export const DAYTONA_DEFAULT_API_URL = "https://app.daytona.io/api";

/**
 * Where `scripts/bundle-sandbox-runner.mjs` leaves the runner, relative to the
 * repository root. Under `data/`, which is already gitignored, because the
 * bundle is build output: a committed copy would be a second definition of the
 * scenario suite, and the one that drifted would be the one the sandbox actually
 * ran.
 *
 * The bundler is a `.mjs` script and cannot import this constant, so the pairing
 * is a convention rather than a shared value. It is checked rather than assumed:
 * a missing bundle is reported by name at `readBundle()` and by the preflight,
 * so the two disagreeing shows up as "nothing at <path>" rather than as a
 * sandbox that runs an old build.
 */
export const DEFAULT_BUNDLE_PATH = path.join("data", "sandbox", "sandbox-runner.mjs");

/** The bundle's name inside the sandbox. Relative paths resolve to the home
    directory (`/home/daytona`), which is also where a command starts. `.mjs`
    because the sandbox has no package.json to declare a module type and the
    bundle is ESM. */
const REMOTE_BUNDLE_NAME = "sandbox-runner.mjs";

interface DaytonaTimeouts {
  createMs: number;
  uploadMs: number;
  execMs: number;
  deleteMs: number;
}

/**
 * Measured against the live account on 2026-07-28, `target: "us"`: create 1.4s,
 * upload 1.0s, one scenario 0.3s, delete 0.6s. The ceilings below are generous
 * multiples of that, because a ceiling exists to end a hang, not to police
 * latency — one tuned close to the measurement would turn a slow afternoon into
 * a red verdict.
 */
const DEFAULT_TIMEOUTS: DaytonaTimeouts = {
  createMs: 120_000,
  uploadMs: 60_000,
  execMs: 120_000,
  deleteMs: 60_000,
};

export interface DaytonaSettings {
  apiKey: string;
  apiUrl: string;
  /** Region to place sandboxes in. Omitted, the organisation's default is used. */
  target?: string;
}

/**
 * What can be said about the configuration WITHOUT holding the key. The key
 * itself is deliberately absent from this shape: a preflight report, a log line
 * and an HTTP response can all be built from it and none of them can leak the
 * credential, which is a property that has to be structural rather than
 * remembered at each call site.
 */
export interface DaytonaEnvSummary {
  keyPresent: boolean;
  keyLength: number;
  apiUrl: string;
  apiUrlSource: "env" | "default";
  target: string | null;
}

/** A misconfiguration: something the owner can fix, stated in one sentence. */
export class DaytonaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DaytonaConfigError";
  }
}

/** The round trip itself went wrong. Distinct from a misconfiguration because
    the two want different responses: fix your `.env.local`, versus look at what
    the sandbox actually printed. */
export class DaytonaTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DaytonaTransportError";
  }
}

export function inspectDaytonaEnv(env: NodeJS.ProcessEnv = process.env): DaytonaEnvSummary {
  const key = (env.DAYTONA_API_KEY ?? "").trim();
  const url = (env.DAYTONA_API_URL ?? "").trim();
  const target = (env.DAYTONA_TARGET ?? "").trim();
  return {
    keyPresent: key !== "",
    keyLength: key.length,
    apiUrl: url === "" ? DAYTONA_DEFAULT_API_URL : url,
    apiUrlSource: url === "" ? "default" : "env",
    target: target === "" ? null : target,
  };
}

/** Settings, or null when there is no key to build them from. */
export function daytonaSettingsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): DaytonaSettings | null {
  const summary = inspectDaytonaEnv(env);
  if (!summary.keyPresent) return null;
  const settings: DaytonaSettings = {
    apiKey: (env.DAYTONA_API_KEY ?? "").trim(),
    apiUrl: summary.apiUrl,
  };
  if (summary.target !== null) settings.target = summary.target;
  return settings;
}

/**
 * Settings or a thrown explanation. The preflight wants the null; a caller that
 * reached THIS function has already decided to run remotely, and handing it a
 * half-configured client would move the failure to the first network call, where
 * the message is Daytona's rather than ours.
 */
export function requireDaytonaSettings(env: NodeJS.ProcessEnv = process.env): DaytonaSettings {
  const settings = daytonaSettingsFromEnv(env);
  if (!settings) {
    throw new DaytonaConfigError(
      "DAYTONA_API_KEY is not set, so there is nothing to isolate into. Add it to " +
        ".env.local (see .env.example section D) or drop the remote isolation — the " +
        "sandbox runs in process without it, which is the supported default.",
    );
  }
  return settings;
}

/* ═══════════════════════════ SDK access ═══════════════════════════ */

type DaytonaModule = typeof import("@daytonaio/sdk");

/**
 * The one import of the SDK in the whole runtime, and it is dynamic. A static
 * import would place axios, the AWS S3 client and the OpenTelemetry SDK in the
 * dependency graph of every module that transitively reaches the sandbox — for
 * a feature that is off by default.
 */
export async function loadDaytonaSdk(): Promise<DaytonaModule> {
  try {
    return await import("@daytonaio/sdk");
  } catch (err) {
    throw new DaytonaConfigError(
      `@daytonaio/sdk could not be loaded (${short(err)}). Daytona isolation needs it ` +
        "as a real dependency, not a devDependency: run `npm install @daytonaio/sdk`.",
    );
  }
}

/* ═══════════════════════════ Diagnosis ═══════════════════════════ */

interface ErrorLike {
  name?: unknown;
  message?: unknown;
  statusCode?: unknown;
  code?: unknown;
}

function errorLike(err: unknown): ErrorLike {
  return typeof err === "object" && err !== null ? (err as ErrorLike) : {};
}

function short(err: unknown): string {
  const message = errorLike(err).message;
  return typeof message === "string" && message !== "" ? message : String(err);
}

/**
 * Removes the key from a string. Belt and braces: the SDK's own errors are short
 * and credential-free ("Invalid credentials"), but an error is exactly the place
 * where a request gets stringified with its headers, and one leaked key in one
 * log line is not recoverable by fixing the code afterwards.
 */
export function redactKey(text: string, apiKey: string | undefined): string {
  if (!apiKey || apiKey.length < 8) return text;
  return text.split(apiKey).join("[DAYTONA_API_KEY redacted]");
}

/**
 * One actionable sentence per failure the owner can actually hit. Two of these
 * were hit on this account and will be hit again on any fresh organisation — a
 * 400 for a missing default region and a 403 for a key without sandbox-create
 * permission — and neither is guessable from the raw error. A stack trace here
 * costs an afternoon; the sentence costs a line.
 *
 * Errors are matched on `statusCode` and class NAME rather than `instanceof`,
 * because the SDK is loaded dynamically and this function must stay callable
 * without it.
 */
export function describeDaytonaFailure(err: unknown, apiUrl?: string): string {
  const info = errorLike(err);
  const name = typeof info.name === "string" ? info.name : "";
  const status = typeof info.statusCode === "number" ? info.statusCode : null;
  const message = short(err);
  const where = apiUrl ?? DAYTONA_DEFAULT_API_URL;

  if (err instanceof DaytonaConfigError || err instanceof DaytonaTransportError) {
    return message;
  }

  if (status === 401 || name === "DaytonaAuthenticationError") {
    return (
      "Daytona rejected the API key (401). Re-copy DAYTONA_API_KEY from the Daytona " +
      "Dashboard → Keys into .env.local; a revoked, expired or truncated key fails " +
      "exactly like this."
    );
  }

  if (status === 403 || name === "DaytonaForbiddenError" || name === "DaytonaAuthorizationError") {
    return (
      "Daytona accepted the key but refused the operation (403 Access denied). The key " +
      "lacks sandbox-create permission — grant it in the Daytona Dashboard → Keys, or " +
      "issue a new key with the sandbox create and delete scopes."
    );
  }

  if (/default region/i.test(message)) {
    return (
      "This organisation has no default region, so Daytona has nowhere to place a " +
      "sandbox (400). Set a default region in the Daytona Dashboard → Settings; " +
      "creating one sandbox by hand in the dashboard also sets it. DAYTONA_TARGET " +
      "(e.g. \"us\") overrides it per run."
    );
  }

  if (status === 404 || name === "DaytonaNotFoundError") {
    return (
      `Daytona answered 404 for ${where}. Check DAYTONA_API_URL — it must be the API ` +
      "root (https://app.daytona.io/api), not the dashboard URL and not the toolbox proxy."
    );
  }

  if (status === 429 || name === "DaytonaRateLimitError") {
    return (
      "Daytona is rate-limiting this organisation (429). Wait and retry; if it persists, " +
      "an abandoned sandbox may be holding the quota — check the Dashboard → Sandboxes."
    );
  }

  if (name === "DaytonaConnectionError" || name === "DaytonaConnectionTimeoutError") {
    return (
      `Could not reach ${where} (${message}). Check network access and DAYTONA_API_URL; ` +
      "isolation needs outbound HTTPS and a WebSocket upgrade."
    );
  }

  if (name === "DaytonaProcessExecutionTimeoutError") {
    return (
      "The scenario did not finish inside the sandbox before the command timeout. Raise " +
      "execMs, or check that the runner bundle is not waiting on something — a scenario " +
      "with a hanging tool relies on the executor's own stepTimeoutMs, not on this one."
    );
  }

  if (status !== null && status >= 500) {
    return `Daytona returned ${status} (${message}). That is a Daytona-side fault; retry before investigating locally.`;
  }

  return name !== "" ? `${name}: ${message}` : message;
}

/* ═══════════════════════════ The seam ═══════════════════════════ */

export interface DaytonaIsolationOptions {
  /** Defaults to `requireDaytonaSettings()`, read from `process.env`. */
  settings?: DaytonaSettings;
  /** Defaults to `DEFAULT_BUNDLE_PATH`, resolved against the current directory. */
  bundlePath?: string;
  /**
   * One sandbox for every scenario (the default), or a fresh one each time.
   * See `acquire()` for why reuse is safe here and what it would cost to lose.
   */
  reuseSandbox?: boolean;
  createMs?: number;
  uploadMs?: number;
  execMs?: number;
  deleteMs?: number;
  /** Progress sink. Never receives the API key. Defaults to silence. */
  log?: (line: string) => void;
}

/* ═══════════════════════════ The isolation ═══════════════════════════ */

export class DaytonaIsolation implements SandboxIsolation {
  readonly name = "daytona";

  private readonly settings: DaytonaSettings;
  private readonly bundlePath: string;
  private readonly reuse: boolean;
  private readonly timeouts: DaytonaTimeouts;
  private readonly log: (line: string) => void;

  private sdk: DaytonaModule | null = null;
  private client: Daytona | null = null;
  private bundle: Buffer | null = null;
  private sandbox: Sandbox | null = null;
  /** In flight `acquire()`, so two callers cannot each create a sandbox. */
  private acquiring: Promise<Sandbox> | null = null;
  private executions = 0;

  constructor(options: DaytonaIsolationOptions = {}) {
    this.settings = options.settings ?? requireDaytonaSettings();
    this.bundlePath = path.resolve(options.bundlePath ?? DEFAULT_BUNDLE_PATH);
    this.reuse = options.reuseSandbox ?? true;
    this.timeouts = {
      createMs: options.createMs ?? DEFAULT_TIMEOUTS.createMs,
      uploadMs: options.uploadMs ?? DEFAULT_TIMEOUTS.uploadMs,
      execMs: options.execMs ?? DEFAULT_TIMEOUTS.execMs,
      deleteMs: options.deleteMs ?? DEFAULT_TIMEOUTS.deleteMs,
    };
    this.log = options.log ?? (() => {});
  }

  /** The sandbox that actually ran, for a report that has to name it. */
  get sandboxId(): string | null {
    return this.sandbox?.id ?? null;
  }

  /** How many scenarios this isolation has executed remotely. */
  get remoteRuns(): number {
    return this.executions;
  }

  /**
   * REFUSES, deliberately. See the header: running `fn` here would put the
   * scenario on this machine while the verdict said otherwise, and a verdict
   * Activation gates on must not be able to lie about where it was earned. The
   * runner is expected to prefer `runScenarioRemotely`; reaching this method
   * means the wiring silently fell back, and that is the bug worth shouting
   * about rather than absorbing.
   */
  async run<T>(label: string, _fn: () => Promise<T>): Promise<T> {
    throw new DaytonaConfigError(
      `Daytona isolation cannot run "${label}" through SandboxIsolation.run(): that ` +
        "method takes a local closure, and executing it here would report a remote " +
        "verdict for work done in this process. Call runScenarioRemotely(scenario) " +
        "instead — runScenario() does exactly that — or use InProcessIsolation and say so.",
    );
  }

  /**
   * Runs the scenario in another process on another machine and returns what
   * THAT process produced, unedited. Throws rather than degrading: a result
   * this method returns has genuinely been earned remotely.
   *
   * It takes the whole scenario and sends only its id, which is not a
   * contradiction — see `bundledScenarioId`. Only the id can cross the wire, so
   * the object is here to be CHECKED against the library the far side resolves
   * that id in.
   */
  async runScenarioRemotely(scenario: SandboxScenario): Promise<ScenarioResult> {
    const request: RemoteScenarioRequest = { scenarioId: bundledScenarioId(scenario) };
    // Encoded BEFORE anything is created: `encodeRequest` is where an id that is
    // not a plain identifier is refused, and discovering that after paying for a
    // sandbox would be a strange way to learn it.
    const argv = encodeRequest(request);

    const sandbox = await this.acquire();
    try {
      const result = await this.execute(sandbox, request, argv);
      this.executions += 1;
      return result;
    } catch (err) {
      // Any failure past this point leaves a sandbox of unknown state, so it is
      // destroyed rather than reused — and destroyed even if the caller never
      // reaches `dispose()`, because an orphan bills until its auto-stop.
      await this.discard();
      throw err;
    } finally {
      if (!this.reuse) await this.discard();
    }
  }

  /**
   * Deletes the sandbox if one is up. Idempotent, and never throws: it is called
   * from a `finally`, where a raised error would replace the failure the caller
   * is actually trying to report. A delete that does not land is warned about
   * with the sandbox id, because that is a bill someone has to go and stop.
   */
  async dispose(): Promise<void> {
    await this.discard();
  }

  /* ── Lifecycle ── */

  /**
   * One sandbox, created on first use, reused for every scenario after it.
   *
   * Reuse is safe because each scenario is a FRESH `node` process inside the
   * sandbox: nothing survives between executions except the uploaded bundle,
   * which is read-only input, and the runner writes nothing to disk. So the
   * result contract is untouched — which matters, because the acceptance
   * criterion is deep equality with a local run, and any state leaking from
   * scenario N into scenario N+1 would break it loudly rather than subtly.
   *
   * The saving is not marginal. Measured: a fresh sandbox per scenario costs
   * create + upload + delete ≈ 3s each, so 44 scenarios cost about 2.5 minutes
   * of pure setup; reused, the same suite pays that once and 0.3s per scenario.
   */
  private async acquire(): Promise<Sandbox> {
    if (this.sandbox) return this.sandbox;
    if (this.acquiring) return this.acquiring;

    this.acquiring = this.create().finally(() => {
      this.acquiring = null;
    });
    return this.acquiring;
  }

  private async create(): Promise<Sandbox> {
    const sdk = this.sdk ?? (this.sdk = await loadDaytonaSdk());
    const bundle = this.bundle ?? (this.bundle = await this.readBundle());

    if (!this.client) {
      const config: { apiKey: string; apiUrl: string; target?: string } = {
        apiKey: this.settings.apiKey,
        apiUrl: this.settings.apiUrl,
      };
      if (this.settings.target) config.target = this.settings.target;
      this.client = new sdk.Daytona(config);
    }

    let sandbox: Sandbox;
    try {
      sandbox = await this.client.create(
        { language: "javascript", labels: { app: "oriant", lane: "sandbox-isolation" } },
        { timeout: seconds(this.timeouts.createMs) },
      );
    } catch (err) {
      throw this.fail(err);
    }
    this.sandbox = sandbox;
    this.log(`sandbox ${sandbox.id} created (state ${sandbox.state ?? "unknown"})`);

    try {
      // `create` has been observed to return `started` already. Confirming is
      // cheap when it is true and is the difference between a clear failure and
      // a confusing one when it is not.
      if (sandbox.state !== "started") {
        await sandbox.waitUntilStarted(seconds(this.timeouts.createMs));
      }
      await sandbox.fs.uploadFile(bundle, REMOTE_BUNDLE_NAME, seconds(this.timeouts.uploadMs));
      this.log(`runner uploaded (${bundle.byteLength} bytes)`);
    } catch (err) {
      // The sandbox exists but is not usable. Delete it before reporting, or the
      // failure leaves a billed resource behind.
      await this.discard();
      throw this.fail(err);
    }

    return sandbox;
  }

  private async execute(
    sandbox: Sandbox,
    request: RemoteScenarioRequest,
    argv: string[],
  ): Promise<ScenarioResult> {
    let exitCode: number | undefined;
    let stdout: string;
    try {
      const response = await sandbox.process.executeCommand(
        `node ${REMOTE_BUNDLE_NAME} ${argv.join(" ")}`,
        undefined,
        // Pinned rather than inherited: whatever the image sets, the runner must
        // not be able to pick up a live reasoner, a disk-backed store or an
        // ambient timezone. If a deep-equal diff ever appears here, something in
        // the run read one of these, and that is the bug.
        { ORIANT_RUNTIME_MODE: "fixture", ORIANT_RUNTIME_STORAGE: "memory", TZ: "UTC" },
        seconds(this.timeouts.execMs),
      );
      exitCode = response.exitCode;
      stdout = response.result ?? "";
    } catch (err) {
      throw this.fail(err);
    }

    return this.decode(this.clean(stdout), exitCode, request);
  }

  /**
   * Turns what the sandbox printed into a result, or into a loud refusal.
   *
   * The parse rule itself lives in `protocol.ts` and is NOT restated here. Both
   * ends of the wire import that module precisely so a second copy cannot drift
   * from it — a decoder that disagrees with its encoder by one field would turn a
   * real verdict into a protocol error, or worse, the reverse. This method's only
   * job is to hand the decoder the two things it cannot see for itself: the
   * cleaned output and this transport's exit code.
   */
  private decode(
    output: string,
    exitCode: number | undefined,
    request: RemoteScenarioRequest,
  ): ScenarioResult {
    return decodeResponse(output, request, exitCode);
  }

  private async readBundle(): Promise<Buffer> {
    try {
      return await readFile(this.bundlePath);
    } catch {
      throw new DaytonaConfigError(
        `The sandbox runner bundle is missing at ${this.bundlePath}. Build it with ` +
          "`npm run sandbox:bundle` — remote isolation ships that file into the sandbox " +
          "and executes it there, so there is nothing to run without it.",
      );
    }
  }

  /** Deletes the sandbox, forgets it, and never throws. */
  private async discard(): Promise<void> {
    const sandbox = this.sandbox;
    this.sandbox = null;
    if (!sandbox) return;
    try {
      await sandbox.delete(seconds(this.timeouts.deleteMs));
      this.log(`sandbox ${sandbox.id} deleted`);
    } catch (err) {
      // Loud, and never rethrown: this runs in a `finally`, and a leaked
      // sandbox is a bill rather than a wrong answer. The id is the only thing
      // that lets someone stop it by hand.
      console.warn(
        `[daytona] sandbox ${sandbox.id} could not be deleted (` +
          `${this.clean(describeDaytonaFailure(err, this.settings.apiUrl))}). It bills ` +
          "until its auto-stop — delete it in the Daytona Dashboard → Sandboxes.",
      );
    }
  }

  /** Turns any thrown thing into one actionable, key-free sentence. */
  private fail(err: unknown): Error {
    if (err instanceof DaytonaConfigError || err instanceof DaytonaTransportError) return err;
    return new DaytonaTransportError(
      this.clean(describeDaytonaFailure(err, this.settings.apiUrl)),
    );
  }

  private clean(text: string): string {
    return redactKey(text, this.settings.apiKey);
  }
}

/**
 * The safe way to hold a `DaytonaIsolation`: the delete is in a `finally`, so a
 * throw in `body` cannot leave a sandbox running. Constructing the class
 * directly is supported and means taking that responsibility on.
 */
export async function withDaytonaIsolation<T>(
  options: DaytonaIsolationOptions,
  body: (isolation: DaytonaIsolation) => Promise<T>,
): Promise<T> {
  const isolation = new DaytonaIsolation(options);
  try {
    return await body(isolation);
  } finally {
    await isolation.dispose();
  }
}

/* ═══════════════════════════ Small shared pieces ═══════════════════════════ */

/**
 * The id to send, or a refusal to send anything.
 *
 * A scenario cannot be serialised: `toolResponses`, `reasonScript` and
 * `specPatch` are closures, and a closure has no meaning on another machine. So
 * the wire carries an ID and the sandbox resolves it against the library its
 * bundle was built from — which means an id is a NAME FOR A DEFINITION THAT
 * LIVES OVER THERE, not a description of the object the caller is holding.
 *
 * That is fine while the two are the same object and silently wrong the moment
 * they are not. `lib/runtime/verify/m3.ts` M3-6 sabotages a copy of
 * `sc-01-small-invoice` by inverting its expectation; the stress sweep
 * synthesises scenarios of its own. Sent by id alone, the first would come back
 * as a well-formed green result about the UNsabotaged scenario — a verdict about
 * something nobody asked about, which is the same class of lie as running
 * locally and claiming otherwise. Identity, not a structural comparison,
 * because the parts that would differ are exactly the parts (functions) that no
 * comparison can see through.
 *
 * A refusal here is a `DaytonaConfigError` rather than a transport error: the
 * caller asked for something isolation cannot honestly do, and the fix is at
 * the call site.
 */
function bundledScenarioId(scenario: SandboxScenario): string {
  const known = BRIGHTPATH_SCENARIOS.find((s) => s.id === scenario.id);
  if (known === scenario) return scenario.id;

  throw new DaytonaConfigError(
    known === undefined
      ? `Scenario "${scenario.id}" is not in the scenario library, and only a library ` +
        `scenario can be run remotely: a sandbox holds the bundled library and nothing ` +
        `else, so there is no definition over there for this id. Run it in process.`
      : `Scenario "${scenario.id}" is not the library's own object — it is a copy or a ` +
        `modified version of one. Only an id crosses the wire, so the sandbox would run ` +
        `the LIBRARY scenario of that id and return a verdict about a scenario you did ` +
        `not ask about. Run modified scenarios in process.`,
  );
}

/** The SDK counts timeouts in seconds; this codebase counts them in ms. */
function seconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

function truncate(text: string, limit = 600): string {
  const flat = text.trim();
  if (flat === "") return "(nothing)";
  return flat.length <= limit ? flat : `${flat.slice(0, limit)}… (${flat.length} chars)`;
}

/**
 * A deadline for an SDK call that does not take one — `snapshot.list()` in the
 * preflight, notably. The timer is unref'd so a diagnostic cannot be the reason
 * a process refuses to exit.
 *
 * This is the one wall clock in the module, and it never reaches a result: it
 * decides how long to wait, not what the answer is, so it cannot affect the
 * determinism M3 exits on.
 */
export function withDeadline<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new DaytonaTransportError(`${what} did not answer within ${ms}ms.`)),
      ms,
    );
    (timer as unknown as { unref?: () => void }).unref?.();
  });
  return Promise.race([work, deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

