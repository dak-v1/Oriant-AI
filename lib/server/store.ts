/**
 * File-backed store. `data/db.json` is the single source of truth the
 * Orchestration Controller reads and writes. No ORM, no external DB —
 * the mock MVP persists across restarts and is trivially inspectable.
 */
import { promises as fs } from "fs";
import path from "path";
import type { Db } from "../contracts";
import { FIXTURE_CALENDAR, ORG } from "../fixtures";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

function freshDb(): Db {
  return {
    org: { ...ORG },
    phase: "onboarding",
    call: { answers: {}, goals: {}, systems: {}, canvasUploaded: false },
    report: null,
    plan: null,
    planHistory: [],
    buildJobs: {},
    artifacts: {},
    validations: {},
    deployment: null,
    approvals: [],
    events: [],
    calendar: FIXTURE_CALENDAR,
    audit: [],
    providerRuns: [],
  };
}

// survive Next.js dev-server module reloads
const g = globalThis as unknown as { __margoDb?: Db; __margoLock?: Promise<unknown> };

export async function loadDb(): Promise<Db> {
  if (g.__margoDb) return g.__margoDb;
  try {
    const raw = await fs.readFile(DB_PATH, "utf-8");
    g.__margoDb = JSON.parse(raw) as Db;
  } catch {
    g.__margoDb = freshDb();
  }
  return g.__margoDb!;
}

export async function saveDb(db: Db): Promise<void> {
  g.__margoDb = db;
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

export async function resetDb(): Promise<Db> {
  const db = freshDb();
  await saveDb(db);
  return db;
}

/** Serialize mutations so concurrent API calls can't interleave writes. */
export async function withDb<T>(fn: (db: Db) => Promise<T> | T): Promise<T> {
  const prev = g.__margoLock ?? Promise.resolve();
  let release!: (value?: unknown) => void;
  g.__margoLock = new Promise((r) => (release = r));
  await prev;
  try {
    const db = await loadDb();
    const result = await fn(db);
    await saveDb(db);
    return result;
  } finally {
    release();
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

let counter = 0;
export function uid(prefix: string): string {
  counter = (counter + 1) % 10000;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}
