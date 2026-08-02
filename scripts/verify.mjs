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
 *   npm run verify:m5     workspace + approvals
 *   npm run verify:m6     calendar, agents, integrations
 *   npm run verify:m7     hardening
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
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, "..");

/*
 * `.env.local` first, then `.env`: `process.loadEnvFile` never overwrites an
 * already-set variable, so the personal file has to be read before the shared
 * one, and anything already in the real environment beats both (which is what
 * CI needs).
 *
 * Only the opt-in targets read any of it — `verify:pg` needs DATABASE_URL. Every
 * milestone target constructs its own stores, clock and reasoner explicitly and
 * reaches `process.env` for nothing, which is what keeps determinism a property
 * of the suite rather than of the machine it runs on.
 */
for (const file of [".env.local", ".env"]) {
  const full = path.join(repoRoot, file);
  if (existsSync(full)) process.loadEnvFile(full);
}

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
  m5: {
    entry: "lib/runtime/verify/m5.ts",
    out: "lib/runtime/verify/m5.js",
    label: "M5 — workspace + approvals",
    expectedChecks: 9,
  },
  m6: {
    entry: "lib/runtime/verify/m6.ts",
    out: "lib/runtime/verify/m6.js",
    label: "M6 — calendar, agents, integrations",
    expectedChecks: 9,
  },
  m7: {
    entry: "lib/runtime/verify/m7.ts",
    out: "lib/runtime/verify/m7.js",
    label: "M7 — hardening",
    expectedChecks: 7,
  },
  ingest: {
    entry: "lib/plan/verify/ingest.ts",
    out: "lib/plan/verify/ingest.js",
    label: "INGEST — Role B handoff into Role C",
    expectedChecks: 9,
  },
  e2e: {
    entry: "lib/runtime/verify/e2e.ts",
    out: "lib/runtime/verify/e2e.js",
    label: "E2E — handoff to a live workforce",
    expectedChecks: 10,
  },
  collect: {
    entry: "lib/runtime/verify/collect.ts",
    out: "lib/runtime/verify/collect.js",
    label: "COLLECT — the handoff seam's protocol",
    expectedChecks: 7,
  },
  pg: {
    entry: "lib/runtime/verify/pg.ts",
    out: "lib/runtime/verify/pg.js",
    label: "PG — the Postgres stores, executed",
    expectedChecks: 11,
    /*
     * OPT-IN. Needs a real DATABASE_URL, and RUNTIME_SETUP.md §1 promises a
     * clean clone runs on `npm install && npm run dev` with an empty .env — so
     * this must not join the default sweep and turn "no database configured"
     * into a red build. Ask for it by name: `npm run verify:pg`.
     */
    optIn: true,
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

const milestones =
  resolved.length > 0
    ? resolved
    : Object.keys(TARGETS).filter((key) => !TARGETS[key].optIn);

const tscBin = (() => {
  try {
    return path.join(path.dirname(require.resolve("typescript/package.json")), "bin", "tsc");
  } catch {
    console.error("TypeScript is not installed. Run `npm install` first.");
    process.exit(1);
  }
})();

/*
 * The compiler options this harness builds every milestone with.
 *
 * Written to a generated tsconfig rather than passed as flags, and the reason is
 * `paths`: it is object-valued, so it cannot be expressed on the command line at
 * all, and M6 needs it — its checks import `app/api/runtime/*` route handlers,
 * which reach for `@/lib/...` the way every file under app/ does. Naming a file
 * on the command line also makes tsc ignore tsconfig.json entirely, so this list
 * has always had to restate every option the sources are written against; a
 * config file is simply the honest shape for that list.
 *
 * `esModuleInterop` earned its place the hard way: lib/runtime/persist reaches
 * for `import path from "node:path"`, which is an error without it and nowhere
 * else in the repo, because Next compiles the app from tsconfig.json and never
 * noticed.
 */
function compilerOptions(outDir) {
  return {
    outDir,
    rootDir: repoRoot,
    // CommonJS so Node resolves the extensionless relative imports that
    // TypeScript emits verbatim. Next bundles the app itself, so this choice is
    // confined to verification.
    module: "commonjs",
    target: "es2022",
    moduleResolution: "node",
    strict: true,
    skipLibCheck: true,
    esModuleInterop: true,
    baseUrl: repoRoot,
    paths: { "@/*": ["./*"] },
    // Named because this config file does NOT live in the repository: TypeScript
    // discovers ambient @types relative to the tsconfig's own directory, and the
    // directory here is a throwaway one under the system temp. Without this,
    // `process` in lib/runtime/llm.ts stops being a name anything has heard of —
    // which is how the command-line invocation this replaced got away with never
    // mentioning it.
    typeRoots: [path.join(repoRoot, "node_modules", "@types")],
  };
}

/*
 * `@/` and bare package names, resolved for the compiled output.
 *
 * TypeScript rewrites neither: `@/lib/runtime/session` and `next/server` are
 * emitted verbatim, and the emitted files live in a temp directory outside the
 * repo, so Node can resolve neither on its own. Two rules fix that, and both are
 * no-ops for every milestone that does not reach into app/ — the alias branch
 * because nothing else uses it, and the package branch because it only runs
 * after the ordinary resolution has already thrown.
 *
 * `aliasRoot` is set per milestone before the module is required; the hook is
 * installed once because patching it per iteration would stack.
 */
let aliasRoot = null;
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (aliasRoot !== null && request.startsWith("@/")) {
    return resolveFilename.call(this, path.join(aliasRoot, request.slice(2)), parent, isMain, options);
  }
  const bare =
    !request.startsWith(".") && !request.startsWith("node:") && !path.isAbsolute(request);
  if (!bare) return resolveFilename.call(this, request, parent, isMain, options);
  try {
    return resolveFilename.call(this, request, parent, isMain, options);
  } catch {
    // Everything the compiled output imports by name lives in the repo's own
    // node_modules; nothing here invents a package that is not installed.
    return resolveFilename.call(this, request, parent, isMain, {
      ...(options ?? {}),
      paths: [repoRoot],
    });
  }
};

let failed = false;

for (const key of milestones) {
  const target = TARGETS[key];
  const outDir = mkdtempSync(path.join(tmpdir(), `oriant-verify-${key}-`));

  try {
    console.log(`\n──── ${target.label} ────`);

    const projectFile = path.join(outDir, "tsconfig.verify.json");
    writeFileSync(
      projectFile,
      JSON.stringify(
        {
          compilerOptions: compilerOptions(outDir),
          files: [path.join(repoRoot, target.entry)],
        },
        null,
        2,
      ),
    );

    const compiled = spawnSync(process.execPath, [tscBin, "-p", projectFile], {
      stdio: "inherit",
      cwd: repoRoot,
    });

    if (compiled.status !== 0) {
      console.error(`TypeScript compilation failed; ${key.toUpperCase()} did not run.`);
      failed = true;
      continue;
    }

    aliasRoot = outDir;
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
    // Cleared with the directory it points into, so a later milestone cannot
    // resolve an alias against output that no longer exists.
    aliasRoot = null;
    rmSync(outDir, { recursive: true, force: true });
  }
}

process.exit(failed ? 1 : 0);
