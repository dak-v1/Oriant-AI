/**
 * Daytona adapter — package validation for the legacy `/demo` lane
 * (blueprint §20.5, §16). One call per generated agent from
 * `app/api/validate/route.ts`; `ValidateScreen` renders what comes back.
 *
 * THIS ADAPTER HAS NO LIVE PATH ANY MORE, AND SAYS SO RATHER THAN PRETENDING.
 * It used to create a sandbox and run the checks INSIDE it over
 * `POST /api/toolbox/{id}/process/execute`. That endpoint is gone: the toolbox
 * moved behind `https://proxy.app.daytona.io/toolbox`, and that proxy rejects an
 * organisation API key — so the call authenticated at sandbox creation and then
 * 404'd at the first command. Checked against the live API rather than inferred;
 * `RUNTIME_SETUP.md` §4 carries the same warning.
 *
 * Both branches of that attempt were dishonest, in opposite directions. The
 * success branch claimed `mode: "live"` for a response it could never receive.
 * The failure branch ALSO claimed `mode: "live"` — for work that had happened
 * nowhere at all — and reported all four security checks as failed, so on any
 * machine configured for M3 isolation the scripted demo could not get past its
 * own validate step — and it created and deleted a real sandbox per agent on the
 * way to that failure.
 *
 * So the attempt is gone and the label is `fixture` in every case, which is what
 * `fixture` has always meant here: these checks ran in this process. The type
 * says so too — there is no `"live"` left for this function to return.
 *
 * REPAIRING THE TRANSPORT IS NOT THE FIX, AND IS DELIBERATELY NOT DONE HERE.
 * `lib/runtime/sandbox/remote/` (M3) already executes inside a Daytona sandbox
 * through `@daytonaio/sdk`, comes back byte-identical to the same work run
 * locally, fails closed rather than mislabelling a local result, and is provable
 * with `npm run daytona:check`. Two hand-rolled clients for one provider is how
 * this one rotted unnoticed; a second one would rot the same way. Giving the
 * `/demo` lane real isolation means calling the runtime's client, and that is a
 * piece of work rather than a patch.
 *
 * A CONFIGURED KEY STILL EARNS A WORD. `DAYTONA_API_KEY` being set means somebody
 * is expecting isolation, and quietly running local checks under a green provider
 * dot is the exact failure this file is being repaired for — so the result then
 * carries a warning naming what did not happen and where the working
 * implementation is. With no key, nothing about this lane changes.
 */
import type { ArtifactBundle } from "../../contracts";
import { daytonaLive } from "./env";

export interface SandboxValidation {
  /**
   * Where the checks ran. `fixture` and nothing else: this process. Narrowed
   * from `ProviderMode` on purpose — the value is rendered on the manifest card
   * and written into the provider trace, and a union carrying a `"live"` this
   * adapter cannot earn is how the old lie was expressible in the first place.
   */
  mode: "fixture";
  sandboxId: string;
  ok: boolean;
  tests: { passed: number; failed: number };
  securityChecks: Record<string, "passed" | "failed">;
  warnings: string[];
  /** Why this was not a sandbox run. Surfaced as the provider trace's detail. */
  error?: string;
}

/* ── the validation logic itself ──────────────────────────────────────────── */

// Word boundaries + realistic token lengths so agent slugs like
// "front-desk-assistant" ("…sk-assistant") never false-positive.
const SECRET_PATTERN = /(\bsk-[A-Za-z0-9]{16,}|api[_-]?key\s*[:=]\s*['"][^'"]{8,}|\bAKIA[0-9A-Z]{16}\b|-----BEGIN (RSA |EC )?PRIVATE KEY)/i;

export function staticChecks(bundle: ArtifactBundle): {
  securityChecks: Record<string, "passed" | "failed">;
  tests: { passed: number; failed: number };
  warnings: string[];
} {
  const warnings: string[] = [];
  const required = ["agent.yaml", "workflow.yaml", "prompt.md", "tools.yaml", "permissions.yaml", "test-cases.yaml", "required-integrations.json", "README.md"];
  const paths = bundle.files.map((f) => f.path);
  const missing = required.filter((p) => !paths.includes(p));
  const schema: "passed" | "failed" = missing.length === 0 ? "passed" : "failed";
  if (missing.length) warnings.push(`Missing artifacts: ${missing.join(", ")}`);

  const secretHit = bundle.files.some((f) => SECRET_PATTERN.test(f.content));
  const secretScan: "passed" | "failed" = secretHit ? "failed" : "passed";
  if (secretHit) warnings.push("A file matched a secret pattern — credentials must be referenced by name only.");

  const perms = bundle.files.find((f) => f.path === "permissions.yaml")?.content ?? "";
  const permissionPolicy: "passed" | "failed" = /forbidden:/.test(perms) ? "passed" : "failed";
  const tools = bundle.files.find((f) => f.path === "tools.yaml")?.content ?? "";
  const toolAllowlist: "passed" | "failed" = /tools:/.test(tools) ? "passed" : "failed";

  // unit tests = the generated test cases; each named case counts as one test
  const testsFile = bundle.files.find((f) => f.path === "test-cases.yaml")?.content ?? "";
  const caseCount = (testsFile.match(/- +name:/g) || []).length;
  const failed = [schema, secretScan, permissionPolicy, toolAllowlist].filter((s) => s === "failed").length;

  return {
    securityChecks: {
      schema, secret_scan: secretScan,
      tool_allowlist: toolAllowlist, permission_policy: permissionPolicy,
    },
    tests: { passed: failed === 0 ? Math.max(caseCount, 1) : Math.max(caseCount - failed, 0), failed },
    warnings,
  };
}

/* ── what an owner is told when a key is configured ──────────────────────── */

/** Short enough for the manifest card, which joins every warning with " · ". */
const NOT_ISOLATED_WARNING =
  "Not a sandbox run — this adapter's Daytona transport is dead (toolbox execute → 404). " +
  "The checks ran on this server.";

/** The longer version, for the provider trace where a reviewer is reading. */
const NOT_ISOLATED_DETAIL =
  "DAYTONA_API_KEY is set, but this /demo adapter no longer has a working live path: the " +
  "toolbox moved behind proxy.app.daytona.io and rejects an organisation key, so the " +
  "process/execute call it used returns 404. The validation below therefore ran in this " +
  "process, not inside a sandbox, and is labelled fixture for that reason. The working " +
  "isolation client is lib/runtime/sandbox/remote/ (M3, @daytonaio/sdk) — prove it with " +
  "`npm run daytona:check`, and see docs/RUNTIME_SETUP.md §3a.";

export async function validateInSandbox(bundle: ArtifactBundle): Promise<SandboxValidation> {
  const local = staticChecks(bundle);
  const ok = Object.values(local.securityChecks).every((v) => v === "passed");

  /* `sandboxId` says where this happened, and it happened here — so it is
     `local_…` whether or not a key is configured. The manifest card prints this
     id, and a sandbox-shaped id for work that never left the process would undo
     everything above.

     `async` with nothing to await, deliberately: the signature is the seam a
     future call into lib/runtime/sandbox/remote/ would arrive through, and
     narrowing it to a synchronous return would make that a caller change too. */
  const result: SandboxValidation = {
    mode: "fixture",
    sandboxId: `local_${bundle.agentId}`,
    ok,
    ...local,
  };

  if (!daytonaLive()) return result;

  return {
    ...result,
    warnings: [...result.warnings, NOT_ISOLATED_WARNING],
    error: NOT_ISOLATED_DETAIL,
  };
}
