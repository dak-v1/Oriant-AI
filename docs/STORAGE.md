# Storage — the decision, the schema, and what it does not promise

**Owner:** Role C (`perynn/RoleC`) · **Status:** decided, implemented
**Closes:** `ROLE_C_PLAN.md` M0 — *"Decide storage"* and *"Write the schema"*
**Implementation:** [`lib/runtime/persist/`](../lib/runtime/persist) · wired in
[`lib/runtime/session.ts`](../lib/runtime/session.ts)

This is a decision record, not a guide. It says what was chosen, what was
rejected and why, what the choice guarantees, and — at least as importantly —
what it does not.

---

## 1. The decision

> **Durable state lives in one file per record under `data/runtime/`, written
> atomically. Postgres is the production path, behind the same three
> interfaces, and is not implemented.**

### Why this was blocking

`ROLE_C_PLAN.md` M0 left two items open and marked them **the M4 blocker**.
`RUNTIME_SETUP.md` §3 states the consequence in one sentence: without
durability *"a paused run and its pending approval vanish on restart, which
defeats the approval interrupt."*

That is not a degraded experience, it is a broken product. The approval
interrupt is the mechanism the whole plan calls *never cut*: an agent stops
mid-workflow, asks the owner a question, and waits. `AgentPolicy.escalateAfterMins`
on the fixture agents is 240 — four hours. Any process that stays up for four
hours uninterrupted during a hackathon is a lucky one, and every restart before
this change threw away the run, the approval, and the idempotency claim that
stopped the trigger firing again.

### The constraint set

| Constraint | Where it comes from |
| --- | --- |
| No database service | The project has none, and adding one is a dependency every reviewer, teammate and demo machine inherits |
| `npm install && npm run dev` from a clean clone | `RUNTIME_SETUP.md` §1, stated as *"the most important fact on this page"* |
| The fixture path is permanent | `ROLE_C_PLAN.md`: *"Keep the fixture path working permanently. It is the fallback, the test harness, and what carries the demo if another lane slips."* |
| Determinism must not regress | M3 exit criterion. No wall-clock reads, no random ids in runtime library code |
| Two workers must not double-fire | `schedule/types.ts` property 1, and the M4 risk table |

### What was rejected

**Postgres now.** Satisfies durability completely and violates the clean-clone
property completely. `npm run dev` would become "install Postgres, create a
database, set `DATABASE_URL`, run migrations, then `npm run dev`" — and the
fallback lane that carries the demo would be the one thing that stopped
working. It stays the production answer; see §7.

**SQLite / better-sqlite3.** Genuinely the right middle ground on the merits:
real transactions, one file, no service. Rejected on the clean-clone constraint
again — it is a native module, so `npm install` acquires a compile step or a
prebuilt binary per platform, and the project develops on Windows and demos
elsewhere. Worth revisiting the moment a native dependency is acceptable, and
it is a smaller step from here than from nothing, because the interfaces
already exist.

**Extending `data/db.json`.** `lib/server/store.ts` already keeps the scripted
`/demo` lane in a single JSON file, and M0 predicted the outcome: *"the shared
`data/db.json` will not survive real runs."* One file rewritten in full on every
write means every run's state is rewritten when one step advances, a lost write
is every run rather than one, and write-once semantics need a lock that only
works because every call site remembers to take it. The two lanes now share a
parent directory and nothing else.

**In-memory with a periodic snapshot.** The window between the snapshot and the
crash is exactly the state that matters, because a run pauses and then nothing
happens for hours. A snapshot taken every 30 seconds is a store that loses the
approval that arrived 29 seconds ago.

### What was chosen, and what it buys

One directory per entity, one JSON file per record, under `data/runtime/`.
`data/` is already gitignored, so nothing is committed and a clean clone starts
empty. Directories are created on first write, so there is no setup step and no
migration to run.

The precedent is `lib/server/store.ts` — file-backed, no ORM, *"trivially
inspectable"* — with the two things that store gets away with and this one
cannot: atomic writes and per-record files. Those are §4.

---

## 2. On disk

```
data/runtime/
├── runs/                    run_<id>.json          RunState, events embedded
├── approvals/               ap_<id>.json           ApprovalRequest
├── approval-decisions/      ap_<id>.json           ApprovalDecision — write-once
├── idempotency-keys/        <sha256>.json          the scheduler's claim
├── build-jobs/              job_<id>.json          BuildJob
├── packages/                <agentId>@<n>.json     PackageRecord
├── schedules/               trg_<id>.json          ScheduledTrigger
├── queue-jobs/              job_<id>.json          QueuedJob
├── deployments/             dep_<id>.json          Deployment
├── agent-runtime-state/     <agentId>.json         AgentRuntimeRecord
└── .locks/queue-jobs.claim                         held only during claimNextJob
```

Every file is an envelope, pretty-printed so a developer can open one mid-demo
and read why an agent paused:

```json
{
  "schema": 1,
  "entity": "runs",
  "record": { "runId": "run_…", "status": "awaiting_approval", "cursor": 3, … }
}
```

`schema` and `entity` are both checked on read and neither is guessed at. A file
from a newer build refuses to load rather than resuming a run from fields this
build does not understand; a file in the wrong directory says so instead of
decoding as the wrong type.

---

## 3. The schema

M0 asked for seven entities. Two of them turned out to be more than one table,
and two tables the runtime needs did not exist when the list was written. The
mapping is stated rather than quietly adjusted:

| M0 asked for | Where it landed |
| --- | --- |
| `runs` | `runs` |
| `run_events` | embedded in `runs`; a separate table in Postgres — see §7 |
| `approvals` | `approvals` **and** `approval_decisions`, split so write-once is a property of the schema |
| `packages` | `packages`, plus `build_jobs` which M0 did not name and M2 needs |
| `deployments` | `deployments` |
| `schedules` | `schedules`, plus `queue_jobs` — the queue postdates the M0 list |
| `agent_runtime_config` | **specified below, not implemented.** See the note at the end of this section |
| — | `idempotency_keys`, which M0 did not name and which is the only thing standing between the Friday sweep and firing twice |

Types below are the TypeScript ones; the source of truth is the interface named
in each heading, and nothing here restates a field the code does not have.

### 3.1 `runs` — [`RunState`](../lib/runtime/types.ts)

Key: `runId`. Created exclusively; updated in place thereafter.

| Field | Type | Notes |
| --- | --- | --- |
| `runId` | string | Primary key. Filename. |
| `agentId` | string | Filter on `listRuns`. Indexed in Postgres. |
| `agentVersion` | number | From the package, not the plan — what actually ran. |
| `workflowId` | string | |
| `status` | `RunStatus` | `running` · `awaiting_approval` · `completed` · `failed` · `refused` · `cancelled`. The last four are terminal and are never written over. |
| `trigger` | `TriggerEvent` | Embedded. Carries `idempotencyKey`, which is how a resumed process finds the run a re-delivered trigger belongs to. |
| `cursor` | number | **The single most important field in the runtime.** Index of the next step; the approval interrupt resumes from exactly here. |
| `context` | `Record<string, unknown>` | Arbitrary caller data — accumulated step outputs, reserved keys (`__metrics`, `__action`, `__metricSources`, `__failureNotice`). The reason §5 exists. |
| `events` | `RunEvent[]` | See 3.2. |
| `pendingApprovalId` | string \| null | Set only while `status` is `awaiting_approval`. |
| `startedAt` | ISO 8601 | Immutable. The sort key for `listRuns`. |
| `endedAt` | ISO 8601 \| null | |
| `failure` | string \| null | Owner-facing prose on `failed` / `refused`. |

### 3.2 `run_events` — [`RunEvent`](../lib/runtime/types.ts)

Key in Postgres: `(runId, sequence)`. Today: the `events` array inside the run
file, which is why there is no separate directory.

A discriminated union on `kind`, every member carrying `at` (ISO 8601):

| `kind` | Additional fields |
| --- | --- |
| `run_started` | `workflowId` |
| `step_started` | `stepId`, `stepKind`, `instruction` |
| `tool_call` | `stepId`, `integrationId`, `operation`, `ok`, `summary` |
| `reasoning` | `stepId`, `summary` |
| `needs_approval` | `stepId`, `approvalId`, `reason`, `risk`, `breachedLimits` |
| `approval_resolved` | `stepId`, `approvalId`, `decision` |
| `refused` | `stepId`, `reason` |
| `output` | `stepId`, `outputKind`, `summary` |
| `error` | `stepId` \| null, `message`, `attempt` |
| `run_finished` | `status` |

**Why embedded.** An event is only ever appended by the run that owns it, only
ever read with it, and the executor already writes the whole `RunState` on every
step boundary. Splitting them today would double the writes and buy nothing.
It stops being free when a run's stream grows past a few hundred events, and §6
says so.

### 3.3 `approvals` — [`ApprovalRequest`](../lib/runtime/types.ts)

Key: `approvalId`. Created exclusively; never updated.

| Field | Type | Notes |
| --- | --- | --- |
| `approvalId` | string | Primary key. |
| `runId` | string | The paused run. Foreign key in Postgres. |
| `agentId`, `workflowId`, `stepId` | string | `stepId` is what resume checks the cursor against — a plan edited while the approval sat in the inbox must not replay the frozen action against a different step. |
| `invocation` | `ToolInvocation` | **Frozen.** `{ integrationId, operation, args, metrics }`. Replayed verbatim on approve, so the owner approves exactly what runs. |
| `reason` | string | Owner-facing. |
| `risk` | `RiskLevel` | |
| `breachedLimits` | string[] | `PolicyLimit` ids. |
| `approvalOwner` | string | User id, not a display name. |
| `createdAt` | ISO 8601 | |
| `dueAt` | ISO 8601 | `createdAt + escalateAfterMins`. Sort key for the inbox. |

### 3.4 `approval_decisions` — [`ApprovalDecision`](../lib/runtime/types.ts)

Key: `approvalId` — one row per approval, forever. **Write-once**, and that is
enforced by the filesystem rather than by a check: the file is created
exclusively and a second decision loses the race.

| Field | Type | Notes |
| --- | --- | --- |
| `approvalId` | string | Primary key **and** the foreign key. The 1:1 key is the write-once guarantee. |
| `decision` | `"approved"` \| `"rejected"` | |
| `decidedBy` | string | User id. |
| `decidedAt` | ISO 8601 | |
| `reason` | string? | Required when rejected. |
| `editedArgs` | `Record<string, unknown>`? | Owner edits, merged over the frozen invocation. Becomes M5's `ApprovalVersion`. |

**Why a separate table.** A decision column on `approvals` would be an update,
and an update can happen twice. Deciding twice resumes the same run twice, which
for an `act` step means sending the customer the same email twice. A separate
row whose primary key is the approval makes "twice" impossible to express.

### 3.5 `idempotency_keys`

Key: `sha256(key)` as the filename, with the raw key stored inside so the
directory stays readable and a collision is detectable rather than silent.

| Field | Type | Notes |
| --- | --- | --- |
| `key` | string | The raw `TriggerEvent.idempotencyKey`. Arbitrary caller text, which is why the filename is a hash. |

**Why it exists at all.** `schedule/types.ts` property 1: *"A trigger never fires
twice."* Cron ticks are re-delivered and workers crash mid-job, so at-least-once
delivery has to be paired with idempotency at the point of effect.
`RunStore.claimIdempotencyKey` is that point, and an exclusive file create is the
strongest form of the claim available without a database — it holds across
processes, not just within one.

### 3.6 `build_jobs` — [`BuildJob`](../lib/runtime/build/types.ts)

Key: `jobId`. Upsert: a job is mutated in place as it moves
`queued → generating → validating → completed`.

| Field | Type | Notes |
| --- | --- | --- |
| `jobId` | string | Primary key. |
| `planId`, `planVersion` | string, number | Both `listJobs` filters. |
| `agentId`, `agentVersion` | string, number | Rebuilds are keyed on the version. |
| `status` | `BuildJobStatus` | `queued` · `generating` · `validating` · `completed` · `skipped` · `failed`. |
| `attempt` | number | 1-based. |
| `logs` | `BuildLogLine[]` | `{ at, level, message }`. Read as a narrative in the UI, so order is part of the data. |
| `checksum` | string \| null | Set once the package is stored. |
| `error` | string \| null | |
| `startedAt` | ISO 8601 | Immutable. Sort key. |
| `endedAt` | ISO 8601 \| null | |

### 3.7 `packages` — [`PackageRecord`](../lib/runtime/build/types.ts)

Key: `(agentId, agentVersion)`, which on disk is the filename `agentId@version`.
Addressed by both so history is kept — that is what makes rebuild-skipping
correct and what would let a rollback serve a previous version without
recompiling.

| Field | Type | Notes |
| --- | --- | --- |
| `agentId`, `agentVersion` | string, number | Composite primary key. |
| `checksum` | string | Stable hash of the inputs. Two builds of an unchanged spec must produce the same one (M2 equivalence test). |
| `pkg` | `AgentPackage` | Embedded: `{ agentId, agentVersion, builtAt, systemPrompt, workflows, allowedOperations, checksum }`. `workflows` are `CompiledWorkflow[]`, each carrying the plan's `StepSpec[]` verbatim. |
| `builtAt` | ISO 8601 | Immutable. Decides which package is "latest built" — deliberately not "highest version", because a hotfix rebuild of v2 after v3 exists is exactly the case where those differ. |
| `planId`, `planVersion` | string, number | Which approved plan this came out of. |

### 3.8 `schedules` — [`ScheduledTrigger`](../lib/runtime/schedule/types.ts)

Key: `triggerId`. Upsert — re-registering is how a re-activation adopts an edited
spec, and how the worker records a fire.

| Field | Type | Notes |
| --- | --- | --- |
| `triggerId` | string | Primary key. |
| `planId`, `planVersion` | string, number | |
| `agentId`, `workflowId` | string | |
| `kind` | `TriggerSpec["kind"]` | `schedule` · `event` · `threshold` · `dependency` · `manual`. Denormalised out of `spec` so a `listTriggers({ kind })` is an index scan in Postgres. |
| `spec` | `TriggerSpec` | **Frozen at go-live.** The scheduler keeps firing what the owner activated even if the plan is edited underneath it. |
| `enabled` | boolean | Pausing an agent disables its triggers without forgetting them. |
| `nextFireAt` | ISO 8601 \| null | `schedule` triggers only; the next UTC instant the cron is due, computed in the trigger's own timezone. Null for every other kind. |
| `lastFiredAt` | ISO 8601 \| null | |
| `registeredAt` | ISO 8601 | Immutable. Sort key. |

### 3.9 `queue_jobs` — [`QueuedJob`](../lib/runtime/schedule/types.ts)

Key: `jobId`. **Insert-only via `enqueueJob`, update-only via `saveJob`** — a
duplicate id means the caller lost track of a job that may already be running,
and overwriting it would hand a second worker work already in flight.

| Field | Type | Notes |
| --- | --- | --- |
| `jobId` | string | Primary key. |
| `triggerId` | string \| null | Null for a manual run, which has no registered trigger behind it. |
| `agentId`, `workflowId` | string | |
| `trigger` | `TriggerEvent` | Embedded; carries the `idempotencyKey` the executor claims. |
| `status` | `JobStatus` | `queued` · `running` · `succeeded` · `failed` · `dead_letter` · `skipped`. `skipped` is a policy refusal, not an error — "correctly did nothing at 3am" must not page anyone. |
| `attempt`, `maxAttempts` | number | 1-based. `claimNextJob` never touches `attempt`; retry accounting belongs to the worker. |
| `runAfter` | ISO 8601 | Claimability. Backoff moves this forward rather than sleeping, so a restart does not lose the delay. **Refused at the write if unparseable** — a job with a bad `runAfter` would sit in the queue reading as `queued` and never run. |
| `enqueuedAt` | ISO 8601 | Immutable. Sort key for `listJobs`, deliberately not `runAfter`: backoff moves that, so a due-ordered listing reshuffles itself between two reads of a queue nobody touched. |
| `startedAt`, `endedAt` | ISO 8601 \| null | `startedAt` is stamped by `claimNextJob` from the instant it was handed. |
| `runId` | string \| null | Set once the executor produced a run. |
| `error` | string \| null | On `failed` / `dead_letter`. |
| `skipReason` | string \| null | On `skipped` — the policy reason, in the owner's language. |

### 3.10 `deployments` — [`Deployment`](../lib/runtime/schedule/types.ts)

Key: `deploymentId`. Upsert; append-only in practice — this list is read as an
audit trail.

| Field | Type | Notes |
| --- | --- | --- |
| `deploymentId` | string | Primary key. |
| `planId`, `planVersion` | string, number | |
| `activatedAt` | ISO 8601 | Immutable. Decides which deployment is active. |
| `activatedBy` | string | User id. |
| `agents` | `{ agentId, agentVersion }[]` | Agent versions **as activated** — what is live, not what is planned. |
| `triggerIds` | string[] | What go-live registered. |
| `evidence` | object | `{ packagesReady, sandboxReady, sandboxFingerprint, integrationsReady }`. The checklist's inputs, frozen for audit. The checklist itself is re-derived on every read and never stored — a stale "ready" is the one failure mode that ships a workforce on evidence gathered before the plan changed. |

There is no `deactivatedAt`, so "active" can only mean "latest for this plan".
Re-activating supersedes rather than closes. `planVersion` is deliberately not
consulted by `getActiveDeployment`: a store that filtered on it would report a
rollback to an earlier version as no deployment at all.

### 3.11 `agent_runtime_state` — [`AgentRuntimeRecord`](../lib/runtime/schedule/types.ts)

Key: `agentId`. Upsert — this is current state, not a history.

| Field | Type | Notes |
| --- | --- | --- |
| `agentId` | string | Primary key. |
| `agentVersion` | number | |
| `state` | `AgentRuntimeState` | `building` · `validated` · `active` · `paused` · `failed`. Role C's half of the `PLAN_CONTRACT.md` §4.2 split; never appears in an `ApprovedPlan`. |
| `detail` | string | Why it is in this state; shown in the M6 roster. |
| `updatedAt` | ISO 8601 | **Mutable**, which is why it is not the sort key — an agent flipping `active → paused` must not jump to the end of the roster. Listing is by `agentId`. |

### 3.12 `agent_runtime_config` — specified, **not implemented**

`PLAN_CONTRACT.md` §4.3 defines it, and M0's checklist names it. No runtime type
declares it yet, and nothing writes it. Stating that plainly is more useful than
shipping an empty table:

| Field | Type | Notes |
| --- | --- | --- |
| `agentId` | string | Primary key. |
| `concurrency` | number | How many runs of this agent may be in flight. |
| `queue` | string | Which worker pool claims its jobs. |

`AgentRuntimeRecord` above is **state**, not config, and the two must not be
merged — one is written by the runtime on every transition, the other is written
by an operator and read by the scheduler. When concurrency routing lands, this
belongs on `SchedulerStore` beside the queue methods, as
`saveAgentConfig` / `getAgentConfig` / `listAgentConfigs`, with a
`FileSchedulerStore` table `agent-runtime-config/`. It was not added
speculatively because a store method nothing calls is dead code, and adding
three methods to `SchedulerStore` would break every implementation of it.

---

## 4. What durability actually guarantees

| Property | Mechanism | Holds across |
| --- | --- | --- |
| A write is never half-applied | temp file → `fsync` → `rename` over the target. `rename` is atomic on POSIX and, via `MoveFileEx` with `MOVEFILE_REPLACE_EXISTING`, on NTFS | crash, kill, power loss |
| A crash mid-write leaves the *previous* record | same — the target is never opened for writing | crash |
| A decision is recorded at most once | the decision file is created exclusively; a second decision loses the race and is told who won and when | processes |
| An idempotency key is claimed at most once | exclusive create | processes |
| A run id is created at most once | exclusive create | processes |
| A queued job is claimed by at most one worker | the whole select-and-flip runs under a lock file taken with the same exclusive create | processes |
| No caller can mutate stored state through an alias | there is no shared object to alias: a write encodes to a JSON string, a read decodes to fresh objects, and there is no cache in front of the files | always |

The exclusive-create primitive links a fully written temp file into place rather
than opening the target with `"wx"` and writing afterwards. `"wx"` is atomic
about the *creation* and says nothing about the *content*: a crash in that window
leaves a claim that exists but says nothing, and a decision that exists but
cannot be read. The link path makes the file complete at the instant it becomes
visible. A volume with no hard links falls back to `"wx"` and reopens that
window; it is named in `atomic.ts` rather than assumed away.

### Cloning, restated

`InMemoryRunStore` documents deep cloning as load-bearing
([`lib/runtime/store.ts:9-21`](../lib/runtime/store.ts)): the approval interrupt
persists a run, hands control to a human, then resumes from `cursor` much later,
and a caller holding an alias could mutate the resume point after the fact. The
file store gets that property for free and keeps it that way deliberately —
**there is no read cache**, because a cache would reintroduce exactly the
aliasing the in-memory store had to work to avoid, and it would make "the file is
the truth" false at the one moment it matters, which is the restart.

### Verified, not assumed

The properties above were exercised against the real executor and the
BrightPath fixture: a Service Recovery run started in one store instance, paused
for approval, and was resumed to completion through a **second store instance
constructed over the same directory** with a fresh id factory — the run, its
cursor, its frozen invocation, its whole event stream and its idempotency claim
all survived, and re-delivering the same trigger returned the existing run
rather than starting a second one. Concurrent claims of one idempotency key
yielded exactly one winner, and concurrent `claimNextJob` calls over a shared
queue never handed the same job to two callers.

---

## 5. Dates, Maps and Sets — the serialisation problem, and what was done about it

Both in-memory stores clone with `structuredClone`, and both say why in the same
words: run context and trigger payloads legitimately hold Dates, Maps and Sets,
all of which JSON flattens or drops. `JSON.stringify(new Map([["a", 1]]))` is
`{}`. A run resumed from `{}` is a run whose evidence disappeared while a human
was deciding what to do about it.

So [`persist/codec.ts`](../lib/runtime/persist/codec.ts) is a codec, not a
serialiser, with two rules.

**What it keeps, it keeps exactly.** Written as tagged objects and read back as
themselves:

| Value | On disk |
| --- | --- |
| `Date` | `{ "$type": "date", "value": "2026-07-24T08:00:00.000Z" }` |
| `Map` | `{ "$type": "map", "value": [[k, v], …] }` |
| `Set` | `{ "$type": "set", "value": [ … ] }` |
| `undefined` | `{ "$type": "undefined" }` — so the *key* survives, not just the value |
| `bigint` | `{ "$type": "bigint", "value": "10" }` |
| `NaN`, `±Infinity`, `-0` | `{ "$type": "number", "value": "NaN" }` … |

A plain object that carries its own `$type` key is wrapped rather than mistaken
for a tagged value; without that escape, a tool result shaped
`{ $type: "invoice" }` would take the run down on read.

**What it cannot keep, it refuses — at the write.** Class instances, functions,
symbols and circular references throw, naming the exact path inside the record
(`<record>.context.s2.invoices[3].customer`). This is the fail-closed posture the rest of the
codebase takes, applied here: a loud write failure is a bug report with a stack
trace, a silent one is a support ticket six weeks later. It also costs nothing in
practice, because `structuredClone` already refuses functions and symbols, so an
in-memory run carrying one is broken before it reaches disk.

**The honest limitation:** shared references are duplicated. If a run's context
holds the same object under two keys, `structuredClone` preserves the sharing and
a JSON round trip does not — after a restart there are two equal objects rather
than one. Nothing in the runtime relies on identity, and cycles (the case where
duplication would be impossible rather than merely different) are refused
outright, so this is a difference in fact rather than a defect. It is written
down here because "we thought about it" and "it does not happen" are different
claims.

---

## 6. Known limitations

Stated as a list because every one of them is a real thing this store does not
do, and the migration in §7 is what closes them.

1. **No cross-file transactions.** "Write the run, then create the approval" can
   be interrupted between the two. The executor is already built for that — it
   persists the run *before* creating the approval, precisely so the surviving
   half-state is the harmless one (a paused run with no inbox item, rather than
   an inbox item for a run that never paused). Every other multi-file sequence
   in the runtime has the same property by construction, and any new one has to
   be checked by hand. Postgres removes the need to check.

2. **No conditional write.** `RunStore` offers `getRun` then `saveRun`, so the
   executor's `persist()` guard against clobbering a terminal status has a window
   between the read and the write. The executor's own header already names this
   and names the fix: `UPDATE runs SET … WHERE run_id = $1 AND status NOT IN
   (<terminal>)`, checking the affected row count. A file store cannot express
   that, so the file store does not close it. **This is the one limitation that
   is a correctness gap rather than a cost**, and it is inherited from the
   interface, not introduced here.

3. **Listing reads every file.** `listRuns` and `listPendingApprovals` decode the
   whole table. Fine at demo scale — four agents, tens of runs — and linear in a
   table that only grows. There is no index and no pagination.

4. **Ordering is derived, not recorded.** The in-memory stores list in insertion
   order; a directory has none. Every list here sorts on an *immutable* field
   with the id as a tie-break: runs by `startedAt`, approvals by `dueAt` then
   `createdAt`, jobs by `enqueuedAt`, triggers by `registeredAt`, deployments by
   `activatedAt`, packages by `builtAt`, agent states by `agentId`. Total,
   stable and reproducible — but a run and its successor stamped by the same
   fixed clock resolve by id, where in memory they resolve by insertion. The
   sandbox and every verify target use the in-memory stores, so this cannot
   affect a determinism check.

5. **Run events are embedded.** A run with a few hundred events rewrites all of
   them on every step. Acceptable now; the first thing to split.

6. **A crashed worker's claimed job stays `running`.** The claim lock is released
   after `staleAfterMs`, so the queue never wedges — but the job itself sits in
   `running` until something decides it was abandoned. That needs a heartbeat and
   a reaper, and both belong to the worker rather than the store.

7. **Breaking a stale lock is bounded, not eliminated.** Two workers can both
   decide the same abandoned lock is stale and both remove it; the second then
   loses the exclusive create and retries. The window only opens after a crash,
   and only at the staleness boundary. A lease token compared on release would
   close it, and is more machinery than one worker per process warrants.

8. **`reset()` is genuinely destructive.** Under `memory` it drops a `Map`; under
   `file` it deletes state that deliberately outlived a process. It is reachable
   only through `RuntimeSession.reset()`.

9. **The directory is not encrypted and not access-controlled.** Run context can
   hold customer names, invoice amounts and draft email bodies. It inherits the
   filesystem's permissions and nothing more. Do not point
   `ORIANT_RUNTIME_DATA_DIR` at a synced folder.

---

## 7. Migration to Postgres

Postgres is the production path. The work is bounded because the seam already
exists and nothing above the seam changes.

**What already holds.** `RunStore`, `BuildStore` and `SchedulerStore` are
deliberately narrow, and the executor, the Factory, the sandbox and the scheduler
all take them by injection. `lib/runtime/session.ts` is the only place an
implementation is chosen. A Postgres implementation is three classes in
`lib/runtime/persist/pg/` and one arm added to the switch — no call site moves.

**The order to do it in.**

1. Add `"postgres"` to `runtimeStorage()`, reading `DATABASE_URL` (already
   documented in `.env.example` §F, already named in `RUNTIME_SETUP.md` §3 as the
   M4 requirement).
2. Translate §3 to DDL. It is close to literal: every table's key is stated, the
   embedded structures (`trigger`, `invocation`, `context`, `pkg`, `spec`,
   `evidence`, `logs`) become `jsonb`, every `ISO 8601` becomes `timestamptz`,
   and `approval_decisions.approvalId` becomes both the primary key and the
   foreign key so write-once stays a schema property.
3. Split `run_events` into its own table keyed `(run_id, sequence)`, with an
   append rather than a rewrite. This is the one shape change, and §6.5 is why.
4. Add `agent_runtime_config` (§3.12) and its three `SchedulerStore` methods.
5. Replace the exclusive-create primitives with their SQL equivalents:

| Today | In Postgres |
| --- | --- |
| exclusive create of `runs/<id>.json` | `INSERT … ON CONFLICT DO NOTHING`, check the row count |
| exclusive create of `approval-decisions/<id>.json` | `INSERT` against a primary key; catch the unique violation and read the winner |
| exclusive create of `idempotency-keys/<hash>.json` | `INSERT INTO idempotency_keys (key) VALUES ($1) ON CONFLICT DO NOTHING`, check the row count |
| lock file around `claimNextJob` | `UPDATE queue_jobs SET status='running', started_at=$1 WHERE job_id = (SELECT job_id FROM queue_jobs WHERE status='queued' AND run_after <= $1 ORDER BY run_after, enqueued_at, job_id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *` |
| the codec's tagged values | still needed. `jsonb` has no Date, Map or Set either, so §5 travels with the data rather than being replaced by it |

6. **Then, and only then**, add the conditional write from §6.2 to `RunStore`
   and take the executor's `persist()` guard off its read-then-write. That is an
   interface change, so it is a change to `lib/runtime/types.ts` and to every
   implementation of it — which is the reason it is last, not first.

**What must not change.** The file store stays. `RUNTIME_SETUP.md` §1 promises
zero-configuration development and `ROLE_C_PLAN.md` promises the fixture path
permanently; `ORIANT_RUNTIME_STORAGE=file` must remain the default so a clean
clone still runs on `npm install && npm run dev`.

---

## 8. Operating it

```bash
# nothing — this is the default
npm run dev

# ephemeral, for a throwaway experiment
ORIANT_RUNTIME_STORAGE=memory npm run dev

# somewhere other than data/runtime
ORIANT_RUNTIME_DATA_DIR=/tmp/oriant npm run dev
```

`ORIANT_RUNTIME_STORAGE` accepts `file` (default) and `memory`, and **throws on
anything else**. That is deliberately unlike `ORIANT_RUNTIME_MODE`, which treats
an unrecognised value as `fixture`. The asymmetry is the point: for the reasoner
the dangerous default is "does something", so unknown must fall to the quiet
option; for storage the dangerous default is "forgets something", so unknown must
not fall anywhere at all. `ORIANT_RUNTIME_STORAGE=postgres` is a thing someone
will type the day §7 is taken up, and silently treating it as `file` would give
them a green server that is not using the database they just configured — the
same shape as the `operatingMode` fall-through this codebase has already been
bitten by once.

To wipe state: delete `data/runtime/`, or call `RuntimeSession.reset()`. To read
it: open the files. That was one of the reasons for choosing this.

**Tests and the sandbox never come through here.** `lib/runtime/verify/*` and
`lib/runtime/sandbox/runner.ts` construct `InMemoryRunStore`, `FixedClock` and a
seeded `createIdFactory()` explicitly, and they must keep doing so — determinism
is an M3 exit criterion, and a store that touches a disk is neither deterministic
nor fast. `npm run verify` compiles from each milestone's entry point and never
reaches `session.ts` or `persist/`, so nothing in this document can move a verify
result.
