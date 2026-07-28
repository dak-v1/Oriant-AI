/**
 * scripts/verify.mjs — run a milestone's exit criteria.
 *
 * Compiles the relevant slice of lib/ with the repo's own TypeScript into a
 * throwaway directory and executes it. No test runner and no extra dependency,
 * so the checks run on a clean clone.
 *
 * Exits non-zero when any criterion fails, so CI can gate on it.
 *
 *   npm run verify:m0     plan contract + fixture
 *   npm run verify:m1     agent runtime
 *   npm run verify:m2     agent factory
 *   npm run verify:m3     sandbox
 *   npm run verify:m4     scheduler + activation
 *   npm run verify:int    real modules end to end
 *   npm run verify        all of the above
 *
 * Two things this file asserts beyond "every check passed", because a harness
 * that only reports what it was handed cannot notice what it was not handed:
 *
 *   - An empty result set is a failure. `[].every(...)` is `true`, so a runner
 *     that returned nothing used to print a celebratory banner reading
 *     "EXIT CRITERIA MET — 0/0 checks passed."
 *   - Each target declares how many checks it must produce. Several counts are
 *     data-driven (M0 emits one check per entry in INVALID_PLANS), so a fixture
 *     table that quietly shrinks would otherwise take its coverage with it and
 *     still report green. The count is a tripwire, not a specification: when a
 *     check is deliberately added or removed, update the number in the same
 *     commit.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, "..");

/**
 * `expectedChecks` is the number of checks the runner must produce. See the
 * header: it exists so a check that silently disappears cannot pass as green.
 */
const TARGETS = {
  m0: {
    entry: "lib/plan/verify/m0.ts",
    out: "lib/plan/verify/m0.js",
    label: "M0 — plan contract",
    expectedChecks: 27,
  },
  m1: {
    entry: "lib/runtime/verify/m1.ts",
    out: "lib/runtime/verify/m1.js",
    label: "M1 — agent runtime",
    expectedChecks: 19,
  },
  m2: {
    entry: "lib/runtime/verify/m2.ts",
    out: "lib/runtime/verify/m2.js",
    label: "M2 — agent factory",
    expectedChecks: 13,
  },
  m3: {
    entry: "lib/runtime/verify/m3.ts",
    out: "lib/runtime/verify/m3.js",
    label: "M3 — sandbox",
    expectedChecks: 11,
  },
  m4: {
    entry: "lib/runtime/verify/m4.ts",
    out: "lib/runtime/verify/m4.js",
    label: "M4 — scheduler + activation",
    expectedChecks: 17,
  },
  integration: {
    entry: "lib/runtime/verify/integration.ts",
    out: "lib/runtime/verify/integration.js",
    label: "INT — real modules end to end",
    expectedChecks: 8,
  },
};

/** package.json exposes the last target as `verify:int`; accept the short form. */
const ALIASES = { int: "integration" };

/*
 * An unrecognised argument is rejected rather than dropped. Filtering it out
 * silently meant `verify m9` ran the whole sweep and exited 0 — and the failure
 * that actually invites is adding `"verify:m4": "... m4"` to package.json before
 * adding `m4` to TARGETS, which printed five green banners for a milestone that
 * never ran. Validation happens before the empty-argv fallback so that "typed
 * nothing" (run everything) stays distinct from "typed something wrong".
 */
const resolved = process.argv.slice(2).map((a) => ALIASES[a] ?? a);
const unknown = resolved.filter((a) => !(a in TARGETS));

if (unknown.length > 0) {
  console.error(
    `Unknown milestone${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}\n` +
      `Valid targets: ${Object.keys(TARGETS).join(", ")} (or "int" for integration).\n` +
      `Pass no arguments to run all of them.`,
  );
  process.exit(1);
}

const milestones = resolved.length > 0 ? resolved : Object.keys(TARGETS);

const tscBin = (() => {
  try {
    return path.join(path.dirname(require.resolve("typescript/package.json")), "bin", "tsc");
  } catch {
    console.error("TypeScript is not installed. Run `npm install` first.");
    process.exit(1);
  }
})();

let failed = false;

for (const key of milestones) {
  const target = TARGETS[key];
  const outDir = mkdtempSync(path.join(tmpdir(), `oriant-verify-${key}-`));

  try {
    console.log(`\n──── ${target.label} ────`);

    const compiled = spawnSync(
      process.execPath,
      [
        tscBin,
        path.join(repoRoot, target.entry),
        "--outDir", outDir,
        "--rootDir", repoRoot,
        // CommonJS so Node resolves the extensionless relative imports that
        // TypeScript emits verbatim. Next bundles the app itself, so this
        // choice is confined to verification.
        "--module", "commonjs",
        "--target", "es2022",
        "--moduleResolution", "node",
        "--strict",
        "--skipLibCheck",
        // Matches tsconfig.json, which this invocation does not read: naming a
        // file on the command line makes tsc ignore the project config, so every
        // option the sources depend on has to be repeated here. The app never
        // noticed the omission because Next compiles it from tsconfig; only this
        // list could disagree with the settings the code is written against, and
        // it did — lib/runtime/persist reaches for `import path from "node:path"`,
        // which is an error without this flag and nowhere else in the repo.
        "--esModuleInterop",
      ],
      { stdio: "inherit", cwd: repoRoot },
    );

    if (compiled.status !== 0) {
      console.error(`TypeScript compilation failed; ${key.toUpperCase()} did not run.`);
      failed = true;
      continue;
    }

    const mod = require(path.join(outDir, target.out));
    const run = mod[`run${key.toUpperCase()}Verification`];
    if (typeof run !== "function") {
      console.error(`${target.entry} does not export run${key.toUpperCase()}Verification().`);
      failed = true;
      continue;
    }

    const results = await run();

    // Before anything is printed: a runner that asserted nothing is not a pass,
    // and formatResults must never get the chance to congratulate it.
    if (!Array.isArray(results) || results.length === 0) {
      console.error(
        `${key.toUpperCase()} returned no checks. A milestone that asserts nothing is not a pass.`,
      );
      failed = true;
      continue;
    }

    console.log("\n" + mod.formatResults(results) + "\n");
    if (!results.every((r) => r.pass)) failed = true;

    // Reported after the results so the discrepancy is the last thing on
    // screen, and never instead of them: which checks ran is the information
    // needed to decide whether the count or the runner is wrong.
    if (results.length !== target.expectedChecks) {
      console.error(
        `${key.toUpperCase()} produced ${results.length} checks; scripts/verify.mjs expects ` +
          `${target.expectedChecks}. Either a check was lost, or one was added and the ` +
          `expectedChecks entry for "${key}" needs updating in the same commit.`,
      );
      failed = true;
    }
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

process.exit(failed ? 1 : 0);
