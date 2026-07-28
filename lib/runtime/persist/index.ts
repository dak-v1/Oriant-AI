/**
 * lib/runtime/persist/index.ts — the durable storage seam, assembled.
 *
 * Three stores, one directory, one place that knows they belong together. The
 * runtime's composition root (`lib/runtime/session.ts`) chooses between these
 * and the in-memory trio; this module's job is to make that choice a single
 * call, so the branch there stays a branch rather than nine lines of wiring
 * duplicated per implementation.
 *
 * NO ENVIRONMENT IS READ HERE. `createFileStores` takes an absolute path and
 * nothing else. Reading `process.env` in a library module is how a project ends
 * up with three places that disagree about which directory is the real one, and
 * `RUNTIME_SETUP.md` already names session.ts as the one place a runtime switch
 * is read. This module stays a mechanism.
 */

import path from "node:path";
import { FileBuildStore } from "./build-store";
import { FileRunStore } from "./run-store";
import { FileSchedulerStore } from "./scheduler-store";

export { FileRunStore } from "./run-store";
export { FileBuildStore } from "./build-store";
export { FileSchedulerStore } from "./scheduler-store";
export { SCHEMA_VERSION, StorageCodecError } from "./codec";
export { StoragePathError } from "./atomic";

export interface FileStores {
  /** Absolute directory holding every table. */
  root: string;
  runStore: FileRunStore;
  buildStore: FileBuildStore;
  schedulerStore: FileSchedulerStore;
  /** Drops every table under `root`. Development only. */
  reset(): Promise<void>;
}

/**
 * The three durable stores over one root directory.
 *
 * Constructing them touches no disk: directories are created on the first write,
 * which is what lets a clean clone run `npm run dev` with no setup step and no
 * `data/` directory in git. Reads of a table that does not exist yet answer
 * "empty", not "error".
 *
 * The root must be absolute. A relative path would resolve against
 * `process.cwd()`, and the cwd of `next dev` is not the cwd of a script run from
 * anywhere else — two processes would then quietly keep two separate copies of
 * the same paused run, which is the exact failure durable storage exists to
 * prevent.
 */
export function createFileStores(root: string): FileStores {
  if (!path.isAbsolute(root)) {
    throw new Error(
      `createFileStores: "${root}" is not an absolute path. A relative root resolves ` +
        `against the current working directory, so two processes started from ` +
        `different places would each get their own copy of every run.`,
    );
  }

  const normalised = path.normalize(root);
  const runStore = new FileRunStore(normalised);
  const buildStore = new FileBuildStore(normalised);
  const schedulerStore = new FileSchedulerStore(normalised);

  return {
    root: normalised,
    runStore,
    buildStore,
    schedulerStore,
    async reset() {
      await Promise.all([runStore.reset(), buildStore.reset(), schedulerStore.reset()]);
    },
  };
}
