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
 *   npm run verify        both
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, "..");

const TARGETS = {
  m0: { entry: "lib/plan/verify/m0.ts", out: "lib/plan/verify/m0.js", label: "M0 — plan contract" },
  m1: { entry: "lib/runtime/verify/m1.ts", out: "lib/runtime/verify/m1.js", label: "M1 — agent runtime" },
  m2: { entry: "lib/runtime/verify/m2.ts", out: "lib/runtime/verify/m2.js", label: "M2 — agent factory" },
  m3: { entry: "lib/runtime/verify/m3.ts", out: "lib/runtime/verify/m3.js", label: "M3 — sandbox" },
  integration: {
    entry: "lib/runtime/verify/integration.ts",
    out: "lib/runtime/verify/integration.js",
    label: "INT — real modules end to end",
  },
};

const requested = process.argv.slice(2).filter((a) => a in TARGETS);
const milestones = requested.length > 0 ? requested : Object.keys(TARGETS);

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
    console.log("\n" + mod.formatResults(results) + "\n");
    if (!results.every((r) => r.pass)) failed = true;
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

process.exit(failed ? 1 : 0);
