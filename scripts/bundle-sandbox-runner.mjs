/**
 * scripts/bundle-sandbox-runner.mjs — build the scenario runner that executes
 * INSIDE a Daytona sandbox (ROLE_C_PLAN M3).
 *
 *   npm run sandbox:bundle
 *
 * A sandbox has no repo, no node_modules and no TypeScript. The runner therefore
 * has to arrive as ONE self-contained file, and that file has to carry the
 * BrightPath plan and the whole scenario library with it — over there, a scenario
 * id is all the host can send and all the bundle has to go on.
 *
 * IT IS BUNDLED TWICE AND THE BYTES ARE COMPARED. The host checksums this
 * artefact to know what it uploaded, and a checksum over bytes that wander says
 * nothing at all. Writing only after two passes agree means a bundle that stopped
 * being reproducible produces NO artefact rather than a subtly different one —
 * the same instinct as the rest of M3, where determinism is an exit criterion
 * and a flaky gate is no gate.
 *
 * Three deliberate choices, all in service of that:
 *
 *   not minified   a stack trace printed from inside a sandbox is the only
 *                  debugging channel that exists over there
 *   no sourcemap   nothing would resolve it, and it would double the upload
 *   esbuild pinned exactly in package.json, not floated on a caret: the output
 *                  bytes ARE the artefact, so the tool that decides them is not
 *                  free to change underneath a recorded checksum
 *
 * The two assertions past determinism are here because the failure they catch is
 * otherwise invisible until a run is already in a sandbox: a bundle missing a
 * scenario answers "unknown scenario", and a bundle that kept an external
 * `require` dies on a module that was never installed over there.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { build } from "esbuild";

const repoRoot = path.resolve(import.meta.dirname, "..");

const ENTRY = "lib/runtime/sandbox/remote/entry.ts";
/** The scenario library, read as the reference for what the bundle must carry. */
const SCENARIOS = "lib/runtime/sandbox/scenarios.ts";
const PLAN = "lib/plan/fixtures/brightpath.ts";
/**
 * Build output, under the already-gitignored `data/`. The path and the file name
 * are `DEFAULT_BUNDLE_PATH` and `REMOTE_BUNDLE_NAME` in
 * lib/runtime/sandbox/remote/daytona.ts — the adapter reads this file from disk
 * and uploads it under that name, so the two have to agree.
 */
const OUT = "data/sandbox/sandbox-runner.mjs";

/**
 * ESM, and named `.mjs`. The bundle is uploaded into a bare home directory with
 * no package.json beside it to declare a module type, so the extension is the
 * only thing telling Node how to read the file — and `.mjs` means the answer
 * never depends on what else happens to be in that directory.
 *
 * Node inside the sandbox is v25; `node20` is comfortably within range and keeps
 * the same bundle runnable on a developer machine, which is what makes the
 * remote-equals-local comparison possible to run locally at all.
 *
 * Paths are relative to `absWorkingDir`, so the module comments esbuild emits
 * carry repo-relative paths and the bytes do not depend on where the repo is
 * checked out.
 */
const options = {
  absWorkingDir: repoRoot,
  entryPoints: [ENTRY],
  outfile: OUT,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: false,
  minify: false,
  legalComments: "none",
  charset: "utf8",
  logLevel: "warning",
  write: false,
};

async function bundleOnce() {
  const result = await build(options);
  const file = result.outputFiles?.[0];
  if (!file) throw new Error("esbuild produced no output file.");
  return Buffer.from(file.contents);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** Every `sc-…` id the library declares, read from the source, not restated. */
function declaredScenarioIds() {
  const source = readFileSync(path.join(repoRoot, SCENARIOS), "utf8");
  const ids = [...source.matchAll(/\bid: "(sc-[A-Za-z0-9._-]+)"/g)].map((m) => m[1]);
  if (ids.length === 0) {
    // The regex is the reference, so a regex that matches nothing would make the
    // coverage check below pass by asserting nothing.
    fail(`Found no scenario ids in ${SCENARIOS}; the bundle check cannot be trusted.`);
  }
  return ids;
}

function planId() {
  const source = readFileSync(path.join(repoRoot, PLAN), "utf8");
  const match = source.match(/planId: "([^"]+)"/);
  if (!match) fail(`Found no planId in ${PLAN}; the bundle check cannot be trusted.`);
  return match[1];
}

/**
 * Anything still resolved by name at runtime that is not a Node built-in would
 * be looked up in a node_modules the sandbox does not have. Both spellings are
 * checked — a leftover `import` in the ESM output and a `require` from a
 * dependency that was compiled rather than bundled.
 */
function externalSpecifiers(text) {
  const builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
  const found = [
    ...text.matchAll(/^import\s[^\n]*?from\s*"([^"]+)"/gm),
    ...text.matchAll(/^import\s*"([^"]+)"/gm),
    ...text.matchAll(/require\("([^"]+)"\)/g),
  ].map((match) => match[1]);
  return [...new Set(found)].filter((specifier) => !builtins.has(specifier));
}

let first;
let second;
try {
  first = await bundleOnce();
  second = await bundleOnce();
} catch (err) {
  fail(`Bundling failed; no runner was written.\n${err instanceof Error ? err.message : err}`);
}

if (!first.equals(second)) {
  fail(
    "Two bundling passes produced different bytes, so the runner is not reproducible " +
      "and nothing was written. Look for a timestamp, an absolute path or an unordered " +
      "map reaching the output.",
  );
}

const text = first.toString("utf8");

const scenarioIds = declaredScenarioIds();
const missing = scenarioIds.filter((id) => !text.includes(`"${id}"`));
if (missing.length > 0) {
  fail(
    `The bundle is missing ${missing.length} scenario(s) the library declares: ${missing.join(", ")}. ` +
      `A sandbox has no repo, so a scenario absent here can only ever answer "unknown scenario".`,
  );
}

const plan = planId();
if (!text.includes(`"${plan}"`)) {
  fail(`The bundle does not carry plan ${plan}; a sandbox has no other copy of it.`);
}

const external = externalSpecifiers(text);
if (external.length > 0) {
  fail(
    `The bundle still resolves ${external.length} module(s) at runtime: ${external.join(", ")}. ` +
      `Nothing is installed in a sandbox, so the runner has to be self-contained.`,
  );
}

const outPath = path.join(repoRoot, OUT);
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, first);

const sha256 = createHash("sha256").update(first).digest("hex");

console.log(`${ENTRY} → ${OUT}`);
console.log(`  ${first.length.toLocaleString("en-US")} bytes (${(first.length / 1024).toFixed(1)} kB)`);
console.log(`  sha256 ${sha256}`);
console.log(`  carries plan ${plan} and ${scenarioIds.length} scenarios, resolves nothing at runtime`);
console.log(`  reproducible: two passes produced identical bytes`);
console.log(`\nRun one scenario locally the way a sandbox would:\n  node ${OUT} <scenarioId>`);
