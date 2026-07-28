/**
 * scripts/daytona-check.mjs — can the sandbox actually isolate right now?
 *
 *   npm run daytona:check
 *
 * Daytona isolation is opt-in, so the interesting question is never "did the
 * suite pass" but "is this configuration capable of running a scenario off this
 * machine at all". Answering it by hand means reading four error messages that
 * do not say what to do — a 401 that could be any of three mistakes, a 400 about
 * a default region, a 403 that names no permission. This script runs the real
 * `daytonaPreflight()` and prints the sentence.
 *
 * It COMPILES the checker rather than reimplementing it, the same way
 * scripts/verify.mjs does. A second copy of these checks written in JavaScript
 * would be a second thing to keep true, and the one that drifted would be the
 * one reporting green.
 *
 * Exits non-zero when isolation is unavailable, so it can gate a lane in CI.
 *
 * THE KEY IS NEVER PRINTED — only whether one is present and how long it is,
 * which is enough to catch the two mistakes a length can catch (nothing pasted,
 * half of it pasted) and cannot leak the credential into a terminal scrollback,
 * a CI log, or a screenshot.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, "..");

const ENTRY = "lib/runtime/sandbox/remote/preflight.ts";
const OUT = "lib/runtime/sandbox/remote/preflight.js";

/*
 * `.env.local` FIRST, then `.env`. That order looks backwards and is not:
 * `process.loadEnvFile()` never overwrites a variable that is already set, so
 * whichever file is loaded first wins. Loading `.env` first would let the shared
 * file quietly override the personal one, which is the opposite of what everyone
 * expects from `.env.local`. Variables already in the real environment beat both,
 * which is what CI needs.
 */
for (const file of [".env.local", ".env"]) {
  const full = path.join(repoRoot, file);
  if (existsSync(full)) process.loadEnvFile(full);
}

const tscBin = (() => {
  try {
    return path.join(path.dirname(require.resolve("typescript/package.json")), "bin", "tsc");
  } catch {
    console.error("TypeScript is not installed. Run `npm install` first.");
    process.exit(1);
  }
})();

/*
 * Compiled INSIDE the repository, not into the system temp directory that
 * scripts/verify.mjs uses. The preflight dynamically requires `@daytonaio/sdk`,
 * and Node resolves that against the requiring FILE's location: from %TEMP%
 * there is no node_modules anywhere up the tree, so the check reported "the SDK
 * is not installed" on a machine where it plainly was. `node_modules/.cache` is
 * already gitignored and resolution from there finds the repo's own packages.
 */
const cacheRoot = path.join(repoRoot, "node_modules", ".cache");
mkdirSync(cacheRoot, { recursive: true });
const outDir = mkdtempSync(path.join(cacheRoot, "oriant-daytona-check-"));
let report;

try {
  const compiled = spawnSync(
    process.execPath,
    [
      tscBin,
      path.join(repoRoot, ENTRY),
      "--outDir", outDir,
      "--rootDir", repoRoot,
      // Matches scripts/verify.mjs. Naming a file on the command line makes tsc
      // ignore tsconfig.json, so every option the sources are written against
      // has to be repeated here.
      "--module", "commonjs",
      "--target", "es2022",
      "--moduleResolution", "node",
      "--strict",
      "--skipLibCheck",
      "--esModuleInterop",
    ],
    { stdio: "inherit", cwd: repoRoot },
  );

  if (compiled.status !== 0) {
    console.error(
      "\nThe preflight did not compile, so nothing was checked. If the error names " +
        "./protocol, the sandbox runner protocol module has not landed yet.",
    );
    process.exit(1);
  }

  const { daytonaPreflight } = require(path.join(outDir, OUT));
  const startedAt = Date.now();
  report = await daytonaPreflight();
  report.elapsedMs = Date.now() - startedAt;
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

/* ── the report ── */

const line = (label, value) => `  ${label.padEnd(18)}${value}`;

/**
 * One line per fact. A raw Node module-resolution error is eight lines of
 * require stack, and a report that scrolls is a report nobody reads to the
 * sentence at the bottom — which is the only part that says what to do.
 */
const flat = (text, limit = 240) => {
  const one = String(text ?? "").replace(/\s+/g, " ").trim();
  return one.length <= limit ? one : `${one.slice(0, limit)}…`;
};

console.log("\n──── Daytona isolation preflight ────\n");
console.log(
  line(
    "DAYTONA_API_KEY",
    report.keyPresent ? `present (${report.keyLength} characters)` : "not set",
  ),
);
console.log(line("DAYTONA_API_URL", `${report.apiUrl} (${report.apiUrlSource})`));
console.log(line("region", report.target ?? "organisation default"));
console.log(line("runner bundle", report.bundlePath));
console.log("");

for (const check of report.checks) {
  console.log(`  ${check.ok ? "PASS" : "FAIL"}  ${check.stage.padEnd(15)}${check.label}`);
  console.log(`        ${flat(check.detail)}`);
  if (!check.ok) console.log(`        → ${flat(check.remedy, 400)}`);
}

console.log("");
if (report.probeSandboxId) {
  console.log(`  Probe sandbox ${report.probeSandboxId} was created and deleted.`);
}
console.log(`  Checked in ${(report.elapsedMs / 1000).toFixed(1)}s.`);
console.log("");

if (report.available) {
  console.log("  ISOLATION AVAILABLE — a scenario can be executed off this machine.");
  console.log("  It is still opt-in: `npm run verify` stays in-process on purpose.\n");
  process.exit(0);
}

console.log("  ISOLATION UNAVAILABLE — scenarios would run in this process.");
console.log(`  Fix: ${flat(report.remedy, 400)}\n`);
process.exit(1);
