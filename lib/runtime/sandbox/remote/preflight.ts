/**
 * lib/runtime/sandbox/remote/preflight.ts — is isolation actually available?
 *
 * The honest answer to that question is not "is DAYTONA_API_KEY set". A key can
 * be present and revoked; it can authenticate and still lack permission to
 * create a sandbox; the organisation can have no default region, so there is
 * nowhere to put one; and the runner bundle that gets uploaded is build output
 * that may simply not have been built. Every one of those ends with scenarios
 * running in this process, and the only unacceptable outcome is that they do so
 * while something reports "isolated".
 *
 * So this module answers by DOING each step, in dependency order, and stops
 * asking once an answer has become meaningless — there is nothing to learn from
 * a snapshot list after the key was rejected.
 *
 * EVERY FAILURE CARRIES ONE ACTIONABLE SENTENCE. Two of these were hit on this
 * account and will be hit again on any fresh organisation: a 400 for a missing
 * default region, and a 403 for a key without sandbox-create permission. Neither
 * is guessable from the raw error, and the raw error is what the owner would
 * otherwise spend an afternoon on. The sentences live in
 * `describeDaytonaFailure()` beside the transport, so the loud failure at run
 * time and the diagnosis here can never say different things.
 *
 * THE REPORT NEVER CARRIES THE KEY. It reports presence and length, which is
 * enough to catch the two mistakes a length can catch — nothing pasted, or half
 * of it pasted — and its shape makes leaking impossible rather than merely
 * unlikely. Every message is passed through the redactor on the way out.
 *
 * CREATING A SANDBOX IS PART OF THE CHECK. It is also the only step that costs
 * money and the only one that can prove the region and permission facts, so it
 * runs last and is always deleted. `probeSandbox: false` skips it, and the report
 * then records the step as UNPROVEN rather than passed: a check that did not run
 * is absent evidence, exactly as an absent stress sweep is to `SandboxVerdict`.
 */

import { access } from "node:fs/promises";
import path from "node:path";
import type { Sandbox } from "@daytonaio/sdk";
import {
  DEFAULT_BUNDLE_PATH,
  type DaytonaSettings,
  daytonaSettingsFromEnv,
  describeDaytonaFailure,
  inspectDaytonaEnv,
  loadDaytonaSdk,
  redactKey,
  withDeadline,
} from "./daytona";

/** The order they run in, which is also the order they depend on each other. */
export type PreflightStage =
  | "configuration"
  | "sdk"
  | "bundle"
  | "authentication"
  | "snapshot"
  | "sandbox";

export interface PreflightCheck {
  stage: PreflightStage;
  /** What was attempted, in the owner's terms. */
  label: string;
  ok: boolean;
  /** What happened. Never contains the API key. */
  detail: string;
  /** One sentence to act on. Present exactly when `!ok`. */
  remedy: string | null;
}

export interface PreflightReport {
  /**
   * True only when every check ran AND passed. A skipped check is not a pass —
   * see the header.
   */
  available: boolean;
  apiUrl: string;
  apiUrlSource: "env" | "default";
  keyPresent: boolean;
  /** Length only. Catches "nothing pasted" and "half of it pasted". */
  keyLength: number;
  /** Region override, or null when the organisation default is used. */
  target: string | null;
  bundlePath: string;
  checks: PreflightCheck[];
  /** The first unmet requirement's remedy; null when `available`. */
  remedy: string | null;
  /** The sandbox created and deleted while checking; null when not attempted. */
  probeSandboxId: string | null;
}

export interface PreflightOptions {
  env?: NodeJS.ProcessEnv;
  /** Overrides what `env` would yield. Mainly for scripts and tests. */
  settings?: DaytonaSettings;
  bundlePath?: string;
  /** Create and delete a real sandbox. Default true; it is the only proof. */
  probeSandbox?: boolean;
  /** Ceiling for each individual step. */
  stepMs?: number;
}

const DEFAULT_STEP_MS = 120_000;

export async function daytonaPreflight(
  options: PreflightOptions = {},
): Promise<PreflightReport> {
  const env = options.env ?? process.env;
  const summary = inspectDaytonaEnv(env);
  const bundlePath = path.resolve(options.bundlePath ?? DEFAULT_BUNDLE_PATH);
  const stepMs = options.stepMs ?? DEFAULT_STEP_MS;
  const stepSeconds = Math.max(1, Math.ceil(stepMs / 1000));
  const probeSandbox = options.probeSandbox ?? true;

  const checks: PreflightCheck[] = [];
  let probeSandboxId: string | null = null;

  const finish = (settings: DaytonaSettings | null): PreflightReport => {
    const firstFailure = checks.find((c) => !c.ok);
    return {
      available: checks.length > 0 && firstFailure === undefined,
      apiUrl: settings?.apiUrl ?? summary.apiUrl,
      apiUrlSource: summary.apiUrlSource,
      keyPresent: summary.keyPresent,
      keyLength: summary.keyLength,
      target: settings?.target ?? summary.target,
      bundlePath,
      checks,
      remedy: firstFailure?.remedy ?? null,
      probeSandboxId,
    };
  };

  /* ── 1. Configuration ──
     Read as a plain fact rather than as an exception, because "not configured"
     is a supported state: the sandbox runs in process without any of this. */
  const settings = options.settings ?? daytonaSettingsFromEnv(env);
  if (!settings) {
    checks.push(
      fail(
        "configuration",
        "DAYTONA_API_KEY is set",
        "empty or absent",
        "Set DAYTONA_API_KEY in .env.local (see .env.example section D). Isolation is " +
          "opt-in: without it the sandbox runs in this process, which is the supported " +
          "default and what `npm run verify` uses.",
      ),
    );
    return finish(null);
  }
  checks.push(
    pass(
      "configuration",
      "DAYTONA_API_KEY is set",
      options.settings
        ? "settings supplied by the caller"
        : `${summary.keyLength} characters; API at ${summary.apiUrl} (${summary.apiUrlSource})`,
    ),
  );

  const clean = (text: string): string => redactKey(text, settings.apiKey);

  /* ── 2. The SDK ──
     A dependency question, not a credentials question, and worth separating:
     "the package is still a devDependency" and "the key is wrong" want entirely
     different fixes. */
  let sdk: typeof import("@daytonaio/sdk");
  try {
    sdk = await loadDaytonaSdk();
    checks.push(
      pass(
        "sdk",
        "@daytonaio/sdk loads",
        "imported dynamically, so the in-process default never bundles it",
      ),
    );
  } catch (err) {
    checks.push(fail("sdk", "@daytonaio/sdk loads", clean(message(err)), clean(describeDaytonaFailure(err, settings.apiUrl))));
    return finish(settings);
  }

  /* ── 3. The runner bundle ──
     Local and cheap, and genuinely part of the answer: with nothing to upload,
     isolation is unavailable however healthy Daytona is. Checked before spending
     network time, and NON-fatal — the credential answers below are worth having
     even when the bundle has not been built. */
  try {
    await access(bundlePath);
    checks.push(pass("bundle", "the runner bundle exists", bundlePath));
  } catch {
    checks.push(
      fail(
        "bundle",
        "the runner bundle exists",
        `nothing at ${bundlePath}`,
        "Build it with `npm run sandbox:bundle`. Isolation uploads that file into the " +
          "sandbox and executes it there, so there is nothing to run without it.",
      ),
    );
  }

  const client = new sdk.Daytona(
    settings.target
      ? { apiKey: settings.apiKey, apiUrl: settings.apiUrl, target: settings.target }
      : { apiKey: settings.apiKey, apiUrl: settings.apiUrl },
  );

  /* ── 4. Authentication ──
     `snapshot.list` is the cheapest authenticated read: it proves the key opens
     the control plane without creating anything. It carries no timeout of its
     own, hence the explicit deadline. */
  let snapshots: ReadonlyArray<{ name?: string; state?: string }>;
  try {
    const page = await withDeadline(client.snapshot.list(1, 50), stepMs, "snapshot.list");
    snapshots = page.items;
    checks.push(
      pass(
        "authentication",
        "the API key authenticates",
        `${page.total} snapshot(s) visible to this organisation`,
      ),
    );
  } catch (err) {
    checks.push(
      fail(
        "authentication",
        "the API key authenticates",
        clean(message(err)),
        clean(describeDaytonaFailure(err, settings.apiUrl)),
      ),
    );
    return finish(settings);
  }

  /* ── 5. An image to boot from ──
     Non-fatal: `create` picks the organisation default and will speak for itself
     below. Reported anyway, because "no active snapshot" explains a create
     failure that otherwise reads as a permission problem. */
  const active = snapshots.filter((s) => s.state === "active");
  if (active.length > 0) {
    checks.push(
      pass(
        "snapshot",
        "an active snapshot exists",
        `${active.length} active, e.g. ${active.slice(0, 3).map((s) => s.name ?? "unnamed").join(", ")}`,
      ),
    );
  } else {
    checks.push(
      fail(
        "snapshot",
        "an active snapshot exists",
        `${snapshots.length} snapshot(s), none in state "active"`,
        "No snapshot is active, so Daytona has no image to boot a sandbox from. Create or " +
          "activate one in the Daytona Dashboard → Snapshots.",
      ),
    );
  }

  /* ── 6. A sandbox ──
     The only step that proves the region is resolvable and the key may create.
     Deleted in a `finally`, including when the step itself failed halfway. */
  if (!probeSandbox) {
    checks.push(
      fail(
        "sandbox",
        "a sandbox can be created",
        "not attempted (probeSandbox: false)",
        "Run the preflight without `probeSandbox: false` to prove a sandbox can actually " +
          "be created. A missing default region and a key without create permission both " +
          "surface only here.",
      ),
    );
    return finish(settings);
  }

  let created: Sandbox | null = null;
  try {
    created = await client.create(
      { language: "javascript", labels: { app: "oriant", lane: "preflight" } },
      { timeout: stepSeconds },
    );
    probeSandboxId = created.id;
    if (created.state !== "started") await created.waitUntilStarted(stepSeconds);
    checks.push(
      pass(
        "sandbox",
        "a sandbox can be created",
        `${created.id} reached "${created.state ?? "started"}"` +
          (created.target ? ` in region "${created.target}"` : ""),
      ),
    );
  } catch (err) {
    checks.push(
      fail(
        "sandbox",
        "a sandbox can be created",
        clean(message(err)),
        clean(describeDaytonaFailure(err, settings.apiUrl)),
      ),
    );
  } finally {
    if (created) {
      try {
        await created.delete(stepSeconds);
      } catch (err) {
        // The check above still stands; the cleanup did not. Reported as its own
        // failure with the id, because an undeleted sandbox bills until its
        // auto-stop and nobody can stop what they cannot name.
        checks.push(
          fail(
            "sandbox",
            "the probe sandbox was deleted",
            clean(message(err)),
            `Sandbox ${created.id} was created by this check and could not be deleted. ` +
              "Delete it in the Daytona Dashboard → Sandboxes; it bills until its auto-stop.",
          ),
        );
      }
    }
  }

  return finish(settings);
}

function pass(stage: PreflightStage, label: string, detail: string): PreflightCheck {
  return { stage, label, ok: true, detail, remedy: null };
}

function fail(
  stage: PreflightStage,
  label: string,
  detail: string,
  remedy: string,
): PreflightCheck {
  return { stage, label, ok: false, detail, remedy };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
