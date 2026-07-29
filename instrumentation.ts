/**
 * instrumentation.ts — the one place a Next server process is handed control
 * before it starts serving, and therefore the only place the scheduler daemon
 * can be started from (ROLE_C_PLAN M4 → M5).
 *
 * Next calls `register()` once per server process at boot. That is exactly the
 * lifetime a poller wants and there is no other hook with it: a route handler
 * runs per request, a module side effect runs per bundle in whichever runtime
 * happens to import it, and neither can be relied on to happen once.
 *
 * The three guards below are each here to stop one specific way this goes wrong,
 * and they are ordered cheapest-and-most-dangerous first.
 *
 * NODE.JS RUNTIME ONLY, AND THE SHAPE OF THAT GUARD IS LOAD-BEARING.
 * `register()` is invoked in the edge runtime too, where there is no filesystem, no
 * `setInterval` worth the name and no process to outlive a request. Nothing
 * under `lib/runtime` can run there — the durable stores open files.
 *
 * A dynamic import is necessary but NOT sufficient, and this is the trap: Next
 * compiles this file for BOTH runtimes, and webpack registers an `import()`
 * dependency when it PARSES the call, long before any runtime check could
 * matter. So the guard has to eliminate the call at parse time, and the only
 * thing that does that is wrapping it in a POSITIVE, statically-true-or-false
 * `if` block. `process.env.NEXT_RUNTIME` is substituted by DefinePlugin with the
 * literal `"edge"` in the edge compiler (next/dist/build/define-env.js), so
 * `if (process.env.NEXT_RUNTIME === "nodejs") { ... }` reads as
 * `if ("edge" === "nodejs")`, and webpack skips the body without walking it. The
 * poller and everything it pulls in are then genuinely absent from the edge
 * bundle.
 *
 * WRITING IT AS AN EARLY RETURN — `if (process.env.NEXT_RUNTIME !== "nodejs")
 * return;` — LOOKS EQUIVALENT AND IS NOT. The condition folds to a constant, but
 * the `import()` sits after the return rather than inside a dropped branch, so
 * webpack still parses it and pulls `lib/runtime/persist/run-store.ts` and its
 * `node:crypto` import into the EDGE bundle, where the `node:` scheme is
 * unhandled. That fails the edge compile of the instrumentation entry, and in
 * `next dev` that single failure is fatal to the whole server: every route,
 * including the scripted demo lanes at /app/workspace, answers 500. `next build`
 * hides it — build/entries.js drops the edge instrumentation entry when nothing
 * else needs an edge compiler — so this breaks in development ONLY, which is
 * exactly where it does the most damage and the least reporting.
 *
 * Keep the block positive. Do not "simplify" it back into a guard clause.
 *
 * NEVER DURING A BUILD. `next build` sets `NEXT_PHASE=phase-production-build`,
 * and its static-generation workers inherit it. Without this line a production
 * build would start a poller that claims jobs and executes runs — real ones, on
 * whatever credentials the build environment holds — as a side effect of
 * compiling the site, and the artefact would ship looking fine. Next's own
 * loader already refuses to call `register()` in that phase; this repeats the
 * check rather than depending on it, because the cost of the guard is one string
 * comparison and the cost of the guarantee silently changing is a customer
 * emailed by a CI job.
 *
 * AND IT NEVER TAKES THE SERVER DOWN. An exception out of `register()` becomes
 * "An error occurred while loading instrumentation hook" and a process that does
 * not boot. A background scheduler is not worth the product: anything that goes
 * wrong here is logged and swallowed, and `startPollerHost` is written to the
 * same rule from the inside. What is deliberately NOT swallowed is silence — the
 * host says on stderr exactly why it did not start.
 *
 * Turning it on: `ORIANT_POLLER=on`. Off is the default and off means no
 * schedule fires by itself. See docs/RUNTIME_SETUP.md §3b.
 */

export async function register(): Promise<void> {
  // Positive and wrapping, never an early return — see the header. This block is
  // what keeps `lib/runtime` out of the edge bundle, and it only does that
  // because the `import()` below is INSIDE it.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Not folded away and not required to be: this one is a genuine run-time
    // question, asked only in the runtime that can act on the answer.
    if (process.env.NEXT_PHASE === "phase-production-build") return;

    try {
      const { startPollerHost } = await import("./lib/runtime/schedule/poller-host");
      startPollerHost();
    } catch (error) {
      // Reached only if the module itself fails to load; every decision inside it
      // reports for itself. Named as the scheduler so the line is searchable
      // alongside the ones the host writes.
      console.error(
        "[oriant:poller] the scheduler host could not be loaded, so no schedule will fire on " +
          `its own in this process: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
