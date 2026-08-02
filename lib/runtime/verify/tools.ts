/**
 * lib/runtime/verify/tools.ts — real tool execution, proved without credentials.
 *
 * WHY THIS TARGET EXISTS. `lib/runtime/tools/composio.ts` is the first object in
 * this runtime that can do something irreversible. Every other verify target
 * checks that a decision was made correctly; this one checks that a decision is
 * made AT ALL before anything leaves the process. The failure it is written
 * against is specific and has a shape the rest of the suite is blind to: a
 * capability with no Composio tool being turned into a plausible slug by a
 * string transform, executed, and answered with somebody else's data.
 *
 * The four properties under test, all of them refusals:
 *
 *   1. TOTALITY. Every capability the BrightPath fixture uses — and every one in
 *      the shared registry — has an EXPLICIT entry in capabilities.ts, either a
 *      Composio tool slug or a written reason there cannot be one. "Not in the
 *      table" is never an answer, because a table with holes is a table that
 *      improvises at the holes.
 *   2. AN UNMAPPED CAPABILITY REFUSES, and refuses before any HTTP call. There
 *      is no Composio invoice tool for HubSpot or QuickBooks; the runtime says
 *      so rather than reaching for `HUBSPOT_LIST_QUOTES_PAGE`.
 *   3. MAILCHIMP REFUSES. It has no connection path in this application, so it
 *      reports not-connected and hands out no client EVEN IF Composio claims an
 *      active account for it — the check below plants exactly that trap.
 *   4. A MISSING API KEY IS A NAMED ERROR AT CONSTRUCTION, never a quiet
 *      downgrade to the stub. `ComposioToolsConfigError`, in the shape of
 *      `ReasonerConfigError`.
 *
 * AND THE FIFTH, ADDED WITH `ApprovedPlan.organizationId`: WHOSE HANDS. A plan
 * now names the business its agents act as, and lib/runtime/tools/
 * organization.ts is the only place that turns that name into credentials. Its
 * failure mode is not a wrong answer but a PLAUSIBLE one — sending a customer's
 * mail through whichever organization the server was configured with last — and
 * nothing downstream can tell, because the send succeeds. TOOLS-11..16 are
 * written against exactly that:
 *
 *   11. A blank organization refuses, AND ORIANT_ORGANIZATION_ID does not
 *       rescue it. The check runs with the variable set, because a check that
 *       ran with it unset would pass without asking the question.
 *   12. The BrightPath fixture is the ONLY plan that reads that variable. A real
 *       organization resolves to itself, identically, whether it is set or not.
 *   13. An unresolved organization hands back a REFUSING client — not null,
 *       which would read as "the owner never connected Gmail", and never the
 *       stub, which would report a send that did not happen.
 *   14. Two organizations get two providers, each scanning and executing under
 *       its own identity; the same organization twice gets one.
 *   15. A resolvable organization with no credentials refuses by name rather
 *       than throwing a stack trace into a route handler.
 *   16. The ingest refusal and the runtime refusal are the same fact: a handoff
 *       with no `organization.id` is blocked at the seam, and the plan it would
 *       have produced is refused again at the hands.
 *
 * AND THE SIXTH, ADDED WHEN THE ALLOWLIST MOVED HERE: WHETHER THIS DEPLOYMENT MAY
 * ACT FOR THEM AT ALL. ORIANT_ALLOWED_ORGANIZATION_IDS used to be read only by
 * lib/runtime/pipeline/organization-gate.ts, which sits on three request paths —
 * while POST /api/runtime/activation, /run, /approvals, /scheduler and the
 * background poller reached live Composio execution without it ever being read.
 * `liveIntegrationProviderFor` is the one function all eight go through, so the
 * rule lives there and TOOLS-17..20 are what hold it there:
 *
 *   17. A PERMITTED organization still gets a real, live provider and still
 *       executes as itself. A check that only proved refusals would be satisfied
 *       by a function that refused everything.
 *   18. An UNPERMITTED one gets the refusing provider — its own class, not
 *       "unresolved", because the owner is perfectly well known — carrying the
 *       allowlist reason, and no SDK client is even constructed. The permitted id
 *       appears nowhere in the message, which is the gate's rule about not
 *       telling a stranger what this server would accept, kept in a string that
 *       travels further than the 403 does.
 *   19. AN EMPTY ALLOWLIST PERMITS NOTHING — unset, blank, and whitespace-only
 *       commas all mean none rather than all, for a real plan and for the demo
 *       fixture's borrowed stand-in alike. This is the direction that has to be
 *       fail-closed and the one an "if configured" shortcut would get backwards.
 *   20. TOOLS OFF IS UNRESTRICTED, whatever the allowlist says. The stub executes
 *       for the very organization the live path refuses in the same environment,
 *       because a simulated send reaches nobody — the demo, the verify targets
 *       and a clean clone all depend on it.
 *
 * NO CREDENTIALS AND NO NETWORK, which is what keeps this in the default sweep.
 * The SDK is injected as `FakeComposio`, a hand-written object satisfying
 * `ComposioExecutionClient`, and TOOLS-6 deletes COMPOSIO_API_KEY from the
 * environment for the duration of one check so the target proves the same thing
 * on a developer machine that HAS a key as on CI that does not. TOOLS-11..16
 * inject the same fake one layer further out — see "the SDK, quarantined"
 * below — and every one of them puts back whatever environment variables it
 * touched, because `npm run verify` runs all targets in one process and a check
 * that leaked ORIANT_ORGANIZATION_ID would decide a later target's result from
 * the sweep's ordering.
 *
 * AND THE SEVENTH, WHICH IS ABOUT THE PREVIOUS SIX: WHOSE SCHEMAS THESE ARE.
 * Every schema this target had ever shown `../tools/schema.ts` was a literal
 * somebody wrote to match what they BELIEVED Composio returns. So a green suite
 * meant the parser agreed with its author; whether the author agreed with
 * Composio was a question nothing in this repository could ask. It could not, and
 * two of those beliefs had been written down as facts in this very file.
 * `../tools/catalog-recording.ts` is the actual HTTP response for every mapped
 * slug, and `CATALOG` now serves it. TOOLS-31..35 are what it bought:
 *
 *   31. Every mapped capability's tool has its real schema recorded. A mapping
 *       added without a capture fails here rather than shipping, because the four
 *       checks below iterate the recording and would simply not ask about it.
 *   32. The parser's reading of each recorded schema MATCHES a second, independent
 *       reading of the same bytes — name for name, required for required,
 *       `additionalProperties` included. This is the check that would have caught
 *       the hand-written fake.
 *   33. Every recorded tool accepts arguments drawn from its own schema, refuses a
 *       name it does not publish, and is described to the model honestly —
 *       including the half of the catalog that marks NOTHING required.
 *   34. Every mapped capability either executes, or refuses because Composio does
 *       not serve its slug. Two do the latter, today, for real.
 *   35. A property whose only type information is an `anyOf` is enforced on that
 *       union. No hand-written fixture had ever shown the parser one.
 *
 * WHAT THIS STILL DOES NOT PROVE, stated plainly: that the slugs are right TODAY.
 * The recording is a transcript of one day, replayed offline; a slug Composio
 * retires tomorrow will keep passing here and fail at run time with a
 * `ComposioToolNotFoundError` naming it — which the provider quotes verbatim.
 * TOOLS-3 catches the mechanical half of a wrong slug (one filed under the wrong
 * toolkit) and TOOLS-31 catches an unrecorded one; keeping the recording current
 * is a job for whoever re-takes it, and its header says how.
 */

import Module from "node:module";
import {
  BRIGHTPATH_DEMO_ORGANIZATION_ID,
  BRIGHTPATH_PLAN,
} from "../../plan/fixtures/brightpath";
import {
  ROLE_B_HANDOFF_RESOLVED,
  ROLE_B_HANDOFF_UNOWNED,
} from "../../plan/fixtures/role-b-handoff";
import { ingestHandoff } from "../../plan/ingest/from-handoff";
import { OPERATIONS } from "../../plan/operations";
// The variable's name, from the module that parses it, so a rename cannot leave
// these checks setting a string nothing reads. Safe to import statically — the
// gate imports one TYPE and nothing else, so it brings no `@composio/core` with
// it and does not disturb the quarantine below.
import { ALLOWED_ORGANIZATIONS_ENV } from "../pipeline/organization-gate";
import {
  hasCapabilityDecision,
  mappedCapabilities,
  resolveCapability,
  toolkitSlugFor,
  unroutableCapabilities,
} from "../tools/capabilities";
import {
  ComposioIntegrationProvider,
  ComposioToolsConfigError,
  type ComposioConnectedAccount,
  type ComposioConnectedAccountPage,
  type ComposioConnectedAccountQuery,
  type ComposioExecutionClient,
  type ComposioToolDefinition,
  type ComposioToolExecuteBody,
  type ComposioToolExecuteResult,
} from "../tools/composio";
import { resetToolSchemaCache } from "../tools/schema-cache";
// The recording, and the parser it is used to judge. Both are pure data/pure
// functions — no `@composio/core` anywhere in either module graph — so importing
// them statically cannot disturb the quarantine set up further down this file.
import {
  COMPOSIO_CATALOG_ENDPOINT,
  COMPOSIO_CATALOG_RECORDED_AT,
  COMPOSIO_CATALOG_RECORDING,
  recordedTool,
  recordedToolSlugs,
  recordedToolSlugsWithSchema,
} from "../tools/catalog-recording";
import {
  checkArgumentsAgainstSchema,
  parseToolInputSchema,
  renderSchemaForPrompt,
  type ToolInputProperty,
  type ToolInputSchema,
} from "../tools/schema";
// The executor, the factory and the stores are reached for by TOOLS-22 and
// TOOLS-25 only, and none of them imports `@composio/core` — so a static import
// here cannot disturb the quarantine set up further down this file.
import {
  TOOL_SCHEMA_NOTICE_KEY,
  UNFILTERED_FETCH_KEY,
  startRun,
  type ExecutorOptions,
} from "../executor";
import { bundleAgent } from "../factory";
import { FixedClock, InMemoryRunStore, createIdFactory } from "../store";
import { StubIntegrationProvider } from "../tools";
import type { AgentSpec, StepArgumentSource, StepSpec } from "../../plan/types";
import type { ReasonResult, Reasoner, RunState, TriggerEvent } from "../types";
// TYPE-ONLY, and it has to stay that way: a value import of this module would
// pull `@composio/core` into the target's module graph. See "the SDK,
// quarantined" below. TypeScript elides this line entirely.
import type { ToolsOrganization } from "../tools/organization";
import type { IntegrationProvider, ToolResult } from "../types";

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

/* ═══════════════════════════ The fake SDK ═══════════════════════════ */

interface ExecutedCall {
  slug: string;
  body: ComposioToolExecuteBody;
}

interface FakeComposioOptions {
  /** What `connectedAccounts.list` reports. */
  accounts?: ComposioConnectedAccount[];
  /** What `tools.execute` answers. A string means "throw with this message". */
  result?: ComposioToolExecuteResult | string;
  /** Overrides `CATALOG` per slug. A string means "throw with this message" —
      which is what an unreachable Composio, a dead key or a retired slug all
      look like from inside the provider. */
  catalog?: Record<string, unknown>;
}

/**
 * THE CATALOG THIS FAKE SERVES IS A RECORDING OF THE REAL ONE. That sentence is
 * the whole reason this block changed, and it is worth being blunt about what it
 * replaced.
 *
 * WHAT WAS HERE, AND WHY IT PROVED NOTHING. Three hand-written literals, honestly
 * described as "copied in shape from Composio's real `inputParameters`" — which
 * is to say, written by somebody to match what they BELIEVED Composio returns.
 * Every check below then compared `parseToolInputSchema` against that belief. The
 * parser and the belief agreed, so the checks were green; whether either agreed
 * with Composio was a question nothing in this repository could ask. Two of the
 * three literals were wrong, and one was wrong in the direction that matters:
 *
 *   - GMAIL_SEND_EMAIL was declared `required: ["recipient_email"]`. At the tool
 *     version this runtime actually executes, it publishes NO `required` array at
 *     all — so the gate's missing-argument arm never fires for the send this whole
 *     mechanism was built around, and TOOLS-21 was asserting a fact from nowhere.
 *   - SLACK_SEND_MESSAGE was given a `text` argument. The real tool has no such
 *     argument: it takes `markdown_text`, `fallback_text` and `blocks`. So the
 *     fake was teaching these checks a vocabulary Composio would have DROPPED —
 *     the exact failure ../tools/schema.ts exists to catch, sitting inside the
 *     thing doing the catching.
 *
 * ../tools/catalog-recording.ts is the actual HTTP response for every slug
 * ../tools/capabilities.ts maps, from the endpoint `@composio/core` really reads
 * (v3.1, not the v3 the literals were modelled on — they are different tool
 * versions under one slug). Its header lists what the capture found. Serving it
 * here means the fake SDK answers in Composio's own words and STILL reaches no
 * network: the recording is a TypeScript literal, so `npm run verify` needs no
 * key on any machine.
 *
 * A SLUG THE RECORDING CAPTURED A FAILURE FOR IS SERVED AS THAT FAILURE. Two of
 * the fourteen answered 404, and `FakeComposio` reads a string entry as "throw
 * with this message", so those two throw the recorded body verbatim. Substituting
 * a plausible schema would hide the live fact that two mapped capabilities cannot
 * be schema-checked at all — which is what TOOLS-34 is about.
 */
const CATALOG: Readonly<Record<string, unknown>> = Object.fromEntries(
  COMPOSIO_CATALOG_RECORDING.map((entry) => [
    entry.slug,
    entry.inputParameters === null
      ? `Composio answered HTTP ${entry.status} for ${entry.slug}: ` +
        `${JSON.stringify(entry.errorBody)}`
      : entry.inputParameters,
  ]),
);

/* ═════════ Reading the recording WITHOUT going through the parser ═════════
       These read ../tools/catalog-recording.ts directly, so a check can compare
       what Composio published against what `parseToolInputSchema` made of it.
       Asking the parser what the recording says would make the comparison
       circular — which is the exact shape of mistake this file is being repaired
       for, and it would be a quieter version of it. */

/** The recorded `input_parameters` object for a slug, or null. */
function recordedInput(slug: string): Record<string, unknown> | null {
  const entry = recordedTool(slug);
  const parameters = entry === null ? null : entry.inputParameters;
  return typeof parameters === "object" && parameters !== null && !Array.isArray(parameters)
    ? (parameters as Record<string, unknown>)
    : null;
}

/** The `properties` map Composio published for a slug, or null. */
function recordedProperties(slug: string): Record<string, unknown> | null {
  const input = recordedInput(slug);
  const properties = input === null ? undefined : input["properties"];
  return typeof properties === "object" && properties !== null && !Array.isArray(properties)
    ? (properties as Record<string, unknown>)
    : null;
}

/** The argument names Composio published for a slug, sorted. */
function recordedPropertyNames(slug: string): string[] {
  const properties = recordedProperties(slug);
  return properties === null ? [] : Object.keys(properties).sort();
}

/** The `required` list Composio published, sorted. Empty when the tool published
    none — which, at this recording, is half of them. */
function recordedRequired(slug: string): string[] {
  const input = recordedInput(slug);
  const required = input === null ? undefined : input["required"];
  return Array.isArray(required)
    ? required.filter((entry): entry is string => typeof entry === "string").sort()
    : [];
}

/**
 * A value of the right JSON type for one parsed property.
 *
 * Built from the SCHEMA rather than from a table of plausible-looking examples,
 * so that a check claiming to send "arguments the tool itself describes" cannot
 * quietly be sending arguments this file invented. An enum answers with its own
 * first member; a property the schema constrained not at all answers with a
 * string, which is what a reasoner produces when it has nothing to go on.
 */
function valueForProperty(property: ToolInputProperty): unknown {
  const enumValues = property.enumValues;
  if (enumValues !== null && enumValues.length > 0) return enumValues[0];
  for (const type of property.types) {
    switch (type) {
      case "string":
        return "recorded-schema-probe";
      case "integer":
      case "number":
        return 1;
      case "boolean":
        return false;
      case "array":
        return [];
      case "object":
        return {};
      default:
        continue;
    }
  }
  return "recorded-schema-probe";
}

/**
 * An argument record built entirely out of the tool's own recorded schema: every
 * required name, plus the first two optional ones so the type check is exercised
 * rather than merely satisfied.
 */
function argumentsFromSchema(schema: ToolInputSchema): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const ordered = [...schema.properties.values()].sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  let optionalsTaken = 0;
  for (const property of ordered) {
    if (!property.required) {
      if (optionalsTaken >= 2) continue;
      optionalsTaken += 1;
    }
    args[property.name] = valueForProperty(property);
  }
  return args;
}

/** A name no recorded tool publishes, for the "would be dropped" half of the
    argument checks. Long and ugly so it can never collide with a real one. */
const NAME_NO_TOOL_PUBLISHES = "definitely_not_a_composio_argument_name";

/**
 * Fifteen honest lines instead of a mocked SDK. It records what it was asked to
 * do, which is the only way a check can assert that NOTHING was asked — the
 * property every refusal in this file turns on.
 */
class FakeComposio implements ComposioExecutionClient {
  readonly executed: ExecutedCall[] = [];
  readonly queries: ComposioConnectedAccountQuery[] = [];
  /** Every catalog read, in order. Length is the cache assertion in TOOLS-21. */
  readonly schemaReads: string[] = [];
  private readonly accounts: ComposioConnectedAccount[];
  private readonly result: ComposioToolExecuteResult | string;
  private readonly catalog: Readonly<Record<string, unknown>>;

  constructor(options: FakeComposioOptions = {}) {
    this.accounts = options.accounts ?? [];
    this.result = options.result ?? { successful: true, error: null, data: { ok: true } };
    this.catalog = options.catalog ?? CATALOG;
  }

  readonly tools = {
    execute: async (
      slug: string,
      body: ComposioToolExecuteBody,
    ): Promise<ComposioToolExecuteResult> => {
      this.executed.push({ slug, body });
      if (typeof this.result === "string") throw new Error(this.result);
      return this.result;
    },

    getRawComposioToolBySlug: async (slug: string): Promise<ComposioToolDefinition> => {
      this.schemaReads.push(slug);
      // A slug this fake has no entry for THROWS rather than answering with an
      // empty schema. An empty schema accepts every argument list, so a silent
      // one would let a check pass while proving the passthrough is back.
      if (!Object.hasOwn(this.catalog, slug)) {
        throw new Error(`ComposioToolNotFoundError: ${slug} is not in the fake catalog`);
      }
      const entry = this.catalog[slug];
      if (typeof entry === "string") throw new Error(entry);
      return { slug, description: `Fake catalog entry for ${slug}.`, inputParameters: entry };
    },
  };

  readonly connectedAccounts = {
    list: async (
      query: ComposioConnectedAccountQuery,
    ): Promise<ComposioConnectedAccountPage> => {
      this.queries.push(query);
      return { items: this.accounts };
    },
  };
}

function account(
  toolkitSlug: string,
  status: string,
  id: string,
  isDisabled = false,
): ComposioConnectedAccount {
  return { id, status, isDisabled, toolkit: { slug: toolkitSlug } };
}

const ORG = "org_brightpath_demo";
const API_KEY = "ak_verify_not_a_real_key";

/** Every provider in this file shares one frozen clock: the TTL must never be
    the reason a check passes or fails. */
function provider(
  client: ComposioExecutionClient,
  overrides: { prime?: boolean } = {},
): ComposioIntegrationProvider {
  return new ComposioIntegrationProvider({
    organizationId: ORG,
    client,
    apiKey: API_KEY,
    clock: new FixedClock("2026-07-24T09:00:00+08:00"),
    prime: overrides.prime,
  });
}

/* ═══════════════ The environment, borrowed and put back ═══════════════ */

/**
 * Run `body` with these variables set — or, for `null`, unset — and restore the
 * environment afterwards, including when `body` throws.
 *
 * TOOLS-6 does this inline for one variable. Six of the organization checks need
 * one or two each, and `npm run verify` runs every target in a single process:
 * a check that left ORIANT_ORGANIZATION_ID behind would make some later target's
 * result depend on the order the sweep happened to run in, which is the one
 * failure a verification suite must not have.
 */
async function withEnv<T>(
  vars: Readonly<Record<string, string | null>>,
  body: () => Promise<T>,
): Promise<T> {
  const saved = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(vars)) {
    saved.set(name, process.env[name]);
    if (value === null) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return await body();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

/* ═══════════════ The SDK, quarantined rather than imported ═══════════════ */

/**
 * WHY THIS EXISTS. TOOLS-11..16 are about `lib/runtime/tools/organization.ts`,
 * which imports `./composio-sdk`, which is the one module in the repository that
 * imports `@composio/core`. Reaching the real SDK here would mean a real HTTP
 * call to Composio from the target that is supposed to prove nothing reaches
 * Composio, so `new Composio({ apiKey })` has to answer with a fake — the same
 * injection every other check in this file performs, moved one layer out so that
 * `createComposioClient`, `providerForOrganization` and the provider cache all
 * run for real.
 *
 * HOW. A module object carrying a fake `Composio` is written into `require.cache`
 * under the path the real package resolves to, the two modules under test are
 * loaded, and the previous cache entry is put back.
 *
 * PUT BACK, NOT LEFT — and the entry is usually NOT empty. M6 and M7 import
 * `app/api/runtime/**`, which reaches `lib/runtime/session.ts`, which imports
 * composio-sdk.ts: by the time this target runs in `npm run verify`, the real
 * package is already loaded, and the first version of this code politely
 * declined to overwrite it and built a real client against a fake key. The stub
 * therefore DISPLACES whatever is there and restores it afterwards, so which
 * `Composio` a later target sees is not decided by this one.
 *
 * Run alone — `npm run verify:tools` — nothing has loaded the package, and the
 * quarantine means this target still never reads `dist/index.mjs`. That is worth
 * keeping: `@composio/core` is ESM-only, and a `require` of ESM from the
 * CommonJS output scripts/verify.mjs produces throws ERR_REQUIRE_ESM below Node
 * 20.19/22.12 — which is why composio-sdk.ts is the only module that imports it.
 *
 * REJECTED: importing `../tools/organization` at the top of this file. Static
 * imports are emitted above every statement, so the stub could not be in place
 * first, and the checks would run against whichever SDK happened to be loaded.
 *
 * REJECTED: stubbing `../tools/composio-sdk` itself, which is shorter and would
 * leave TOOLS-14 proving nothing. The per-organization memoisation under test
 * LIVES in composio-sdk.ts, so replacing that module would replace the code
 * being verified with the assumption being verified.
 */

/** Every client `createComposioClient` built, in construction order. Length is
    itself an assertion: nothing in this target may reach the real SDK, and a
    real `Composio` would never appear here. */
const SDK_CLIENTS: FakeComposioSdk[] = [];

/** What `new Composio({ apiKey })` produces once the package is quarantined. */
class FakeComposioSdk extends FakeComposio {
  readonly apiKey: string;

  constructor(options: { apiKey: string }) {
    // The SAME one ACTIVE Gmail account for every organization, deliberately.
    // What must differ between two organizations is the `userId` their provider
    // scans and executes under; an account id that varied per organization would
    // let TOOLS-14 pass on evidence the real Composio does not supply.
    super({ accounts: [account("gmail", "ACTIVE", "ca_gmail_shared")] });
    this.apiKey = options.apiKey;
    SDK_CLIENTS.push(this);
  }
}

interface QuarantinedModules {
  organization: typeof import("../tools/organization");
  providerCache: typeof import("../tools/composio-sdk");
}

let quarantined: QuarantinedModules | null = null;

/**
 * The two modules under test, loaded once, with `@composio/core` already
 * answered.
 *
 * `await import` rather than a top-level import for one reason: the cache entry
 * has to be in place FIRST, and static imports are emitted above every statement
 * in the file. Under scripts/verify.mjs's CommonJS build TypeScript emits this
 * as a plain `require` at the point of use, so "first" means what it says.
 */
async function organizationModules(): Promise<QuarantinedModules> {
  if (quarantined !== null) return quarantined;

  if (typeof require === "undefined") {
    // Only reachable if this file is ever run as an ES module, where there is no
    // `require.cache` to seed and the import below would load the real SDK.
    // Stopping is the honest answer; loading it quietly is not.
    throw new Error(
      "lib/runtime/verify/tools.ts must run under scripts/verify.mjs's CommonJS " +
        "build: the organization checks quarantine @composio/core through " +
        "require.cache, which does not exist in an ES module.",
    );
  }

  const sdkPath = require.resolve("@composio/core");
  const displaced = require.cache[sdkPath];

  const stub = new Module(sdkPath);
  stub.filename = sdkPath;
  stub.loaded = true;
  stub.exports = { Composio: FakeComposioSdk };
  require.cache[sdkPath] = stub;

  try {
    // This target's own compiled copy of composio-sdk.js is loaded here for the
    // first time — scripts/verify.mjs compiles each target into its own temp
    // directory — so it binds the stub, permanently, however the cache is left.
    quarantined = {
      organization: await import("../tools/organization"),
      providerCache: await import("../tools/composio-sdk"),
    };
  } finally {
    if (displaced === undefined) delete require.cache[sdkPath];
    else require.cache[sdkPath] = displaced;
  }
  return quarantined;
}

/** One line of a detail string, for either arm of the union. */
function describeOrganization(resolved: ToolsOrganization): string {
  return resolved.kind === "unresolved"
    ? `unresolved("${resolved.reason.slice(0, 60)}…")`
    : `${resolved.kind}:${resolved.organizationId}`;
}

/** The one invocation every organization check sends: a real write, on the one
    integration the fake reports connected. */
const SEND: { integrationId: string; operation: string } = {
  integrationId: "gmail",
  operation: "gmail.messages.send",
};

async function trySend(target: IntegrationProvider): Promise<ToolResult | undefined> {
  return target.getToolClient(SEND.integrationId)?.call({
    integrationId: SEND.integrationId,
    operation: SEND.operation,
    args: { recipient_email: "adeline.wong@example.sg" },
    metrics: {},
  });
}

/* ═══════════ A real run, for the half that happens before the send ═══════════
       TOOLS-21, -23, -24 and -25's refusals can all be read off the provider on
       its own. WHERE THE ARGUMENTS COME FROM cannot: an act step has no
       arguments in the plan — `StepSpec.tool` is an integration and an operation
       — so what it sends is whatever the preceding `reason` step wrote into the
       run context. The only way to prove the schema reaches the model that
       produces them is to drive the executor and read what the reasoner was
       handed, so TOOLS-22 and TOOLS-25 do exactly that, with the real executor,
       the real factory and the real provider over the fake SDK. */

/**
 * Records the prompts it was given and answers with a fixed action.
 *
 * The CONTEXTS are recorded as well as the prompts, because the schema block and
 * the run's own facts arrive by different routes — the block is appended to the
 * workflow prompt, the facts are in the context the executor seeds — and TOOLS-30
 * has to read both. Kept as the objects handed over rather than a serialisation,
 * so a check decides for itself what to assert.
 */
class RecordingReasoner implements Reasoner {
  readonly prompts: { instruction: string; workflowPrompt: string }[] = [];
  readonly contexts: Record<string, unknown>[] = [];

  constructor(private readonly data: Record<string, unknown>) {}

  async reason(input: {
    systemPrompt: string;
    workflowPrompt: string;
    instruction: string;
    context: Record<string, unknown>;
  }): Promise<ReasonResult> {
    this.prompts.push({
      instruction: input.instruction,
      workflowPrompt: input.workflowPrompt,
    });
    this.contexts.push({ ...input.context });
    return { summary: "Chase the overdue invoice.", data: { ...this.data }, metrics: {} };
  }
}

/**
 * Two reason steps around one send, which is the shape the assertions need:
 * `draft` produces the arguments for `send`, and `wrap-up` produces nothing any
 * tool consumes. Only the first may be given a schema.
 *
 * NO POLICY LIMITS, on purpose. A limit whose metric is missing fails closed into
 * an approval (lib/runtime/policy.ts), and a run that paused would prove nothing
 * about arguments. The limits have their own checks in M1.
 */
function sendingAgent(): AgentSpec {
  return {
    id: "schema-probe",
    version: 1,
    name: "Schema Probe Agent",
    role: "Sends one reminder, so the argument path can be observed end to end",
    capabilities: [
      {
        id: "send_payment_reminder",
        name: "Send payment reminder",
        description: "Send a reminder to the customer.",
        backedBy: ["gmail.messages.send"],
      },
    ],
    tools: [
      {
        integrationId: "gmail",
        operations: ["gmail.messages.send"],
        purpose: "Send payment reminders",
        required: true,
      },
    ],
    policy: {
      operatingMode: "auto_within_limits",
      limits: [],
      alwaysApprove: [],
      forbidden: [],
      approvalOwner: "user_sarah_chen",
      escalateAfterMins: 240,
      quietHours: null,
      maxRunsPerDay: null,
    },
    guidance: {
      objective: "Get the reminder out in the tool's own vocabulary.",
      businessContext: "BrightPath Home Services, Singapore.",
    },
    workflows: [
      {
        id: "one-send",
        name: "One send",
        description: "Draft a reminder and send it.",
        enabled: true,
        trigger: { kind: "manual", label: "Run now" },
        steps: [
          { id: "draft", kind: "reason", instruction: "Draft the reminder." },
          {
            id: "send",
            kind: "act",
            instruction: "Send the reminder.",
            tool: { integrationId: "gmail", operation: "gmail.messages.send" },
            risk: "medium",
          },
          { id: "wrap-up", kind: "reason", instruction: "Summarise what was sent." },
        ],
        output: { kind: "message", successCriteria: "One reminder sent." },
        onFailure: { retries: 0, backoffSeconds: 0, onExhausted: "notify_owner" },
      },
    ],
  };
}

interface DrivenRun {
  run: RunState;
  reasoner: RecordingReasoner;
}

/** One run of `one-send` against a live provider over the injected fake SDK. */
async function driveOneSend(
  client: FakeComposio,
  data: Record<string, unknown>,
): Promise<DrivenRun> {
  const p = provider(client);
  // `getToolClient` is synchronous over an HTTP fact, so the scan has to have
  // landed before the run starts or the act step reads "not connected" and the
  // argument path is never reached. See the header of ../tools/composio.ts.
  await p.ready();

  const reasoner = new RecordingReasoner(data);
  const deps: ExecutorOptions = {
    store: new InMemoryRunStore(),
    tools: p,
    reasoner,
    clock: new FixedClock("2026-07-24T09:00:00+08:00"),
    newId: createIdFactory("tools"),
    globalPolicy: { quietHours: null, forbidden: [] },
  };
  const trigger: TriggerEvent = {
    kind: "manual",
    workflowId: "one-send",
    agentId: "schema-probe",
    firedAt: "2026-07-24T09:00:00+08:00",
    payload: {},
    idempotencyKey: `one-send-${client.schemaReads.length}-${Math.random()}`,
  };
  const outcome = await startRun(
    bundleAgent(sendingAgent(), { builtAt: "2026-07-24T08:00:00.000Z" }),
    trigger,
    deps,
  );
  return { run: outcome.run, reasoner };
}

/* ══════════ A fetch-FIRST run, for the arguments nobody produced ══════════
       `driveOneSend` above opens with a `reason` step, which is the shape that
       always worked: the model writes the arguments and the act step spends
       them. A workflow that opens with a `fetch` has no such step, and until
       `StepSpec.argumentSource` existed it sent `{}` — accepted by
       GMAIL_LIST_THREADS, which then returns the whole mailbox. Two of the three
       enabled Meridian workflows open with a fetch, so this is the ordinary
       shape rather than an edge case, and it needs a fixture of its own. */

/**
 * One workflow whose steps the caller supplies, so the same agent can be driven
 * with a fetch that declares nothing, a literal, a justified `none`, and a
 * reason step feeding it — which is the only way the four outcomes can be
 * compared without four near-identical fixtures drifting apart.
 *
 * READ-ONLY GRANT, so nothing here can be rescued or blocked by policy: the
 * ungated path is exactly where an unscoped read is dangerous, and these checks
 * must fail for argument reasons or not at all.
 */
function sweepingAgent(steps: StepSpec[]): AgentSpec {
  return {
    id: "diary-sweeper",
    version: 1,
    name: "Diary Sweep Agent",
    role: "Reads the overnight appointment requests",
    capabilities: [
      {
        id: "read_enquiries",
        name: "Read appointment requests",
        description: "Read the request threads in the shared clinic inbox.",
        backedBy: ["gmail.threads.read"],
      },
    ],
    tools: [
      {
        integrationId: "gmail",
        operations: ["gmail.threads.read"],
        purpose: "Read appointment requests in the shared inbox",
        required: true,
      },
    ],
    policy: {
      operatingMode: "auto_within_limits",
      limits: [],
      alwaysApprove: [],
      forbidden: [],
      approvalOwner: "user_priya_nair",
      escalateAfterMins: 90,
      quietHours: null,
      maxRunsPerDay: null,
    },
    guidance: {
      objective: "Turn overnight appointment requests into a morning worklist.",
      businessContext: "Meridian Physiotherapy, Singapore.",
    },
    workflows: [
      {
        id: "diary-sweep",
        name: "Morning Diary Sweep",
        description: "Read what arrived overnight.",
        enabled: true,
        trigger: {
          kind: "schedule",
          label: "Every morning the clinic opens, at 8:00am",
          cron: "0 8 * * 1-6",
          timezone: "Asia/Singapore",
        },
        steps,
        output: {
          kind: "report",
          successCriteria: "Every overnight request is listed once.",
        },
        onFailure: { retries: 0, backoffSeconds: 0, onExhausted: "notify_owner" },
      },
    ],
  };
}

/**
 * The fetch step under test. `argumentSource` omitted entirely rather than set
 * to undefined, because "the field is absent" is the state every plan written
 * before it existed is in, and it is the state TOOLS-26 is about.
 */
function readThreads(argumentSource?: StepArgumentSource): StepSpec {
  const step: StepSpec = {
    id: "sweep-1",
    kind: "fetch",
    instruction:
      "Read the request threads that arrived since yesterday's sweep and keep the ones asking for an appointment.",
    tool: { integrationId: "gmail", operation: "gmail.threads.read" },
  };
  return argumentSource === undefined ? step : { ...step, argumentSource };
}

async function driveSweep(client: FakeComposio, steps: StepSpec[]): Promise<DrivenRun> {
  const p = provider(client);
  await p.ready();

  const reasoner = new RecordingReasoner({
    query: "label:appointments newer_than:1d",
    max_results: 25,
  });
  const deps: ExecutorOptions = {
    store: new InMemoryRunStore(),
    tools: p,
    reasoner,
    clock: new FixedClock("2026-07-24T08:00:00+08:00"),
    newId: createIdFactory("sweep"),
    globalPolicy: { quietHours: null, forbidden: [] },
  };
  const trigger: TriggerEvent = {
    kind: "schedule",
    workflowId: "diary-sweep",
    agentId: "diary-sweeper",
    firedAt: "2026-07-24T08:00:00+08:00",
    payload: {},
    idempotencyKey: `diary-sweep-${client.schemaReads.length}-${Math.random()}`,
  };
  const outcome = await startRun(
    bundleAgent(sweepingAgent(steps), { builtAt: "2026-07-24T07:00:00.000Z" }),
    trigger,
    deps,
  );
  return { run: outcome.run, reasoner };
}

/* ═══════════════════════ Fixture capability set ═══════════════════════ */

/**
 * Every capability the BrightPath plan can reach, from all three places a plan
 * names one. Grants alone would miss a step that calls something ungranted, and
 * steps alone would miss a grant the workflows have not caught up with — and
 * either gap is a capability that arrives at the provider with no entry.
 */
function fixtureCapabilities(): string[] {
  const seen = new Set<string>();
  for (const agent of BRIGHTPATH_PLAN.agents) {
    for (const grant of agent.tools) {
      for (const operation of grant.operations) seen.add(operation);
    }
    for (const capability of agent.capabilities) {
      for (const operation of capability.backedBy) seen.add(operation);
    }
    for (const workflow of agent.workflows) {
      for (const step of workflow.steps) {
        if (step.tool !== undefined) seen.add(step.tool.operation);
      }
    }
  }
  return Array.from(seen).sort();
}

/* ═══════════════════════════ Checks ═══════════════════════════ */

export async function runTOOLSVerification(): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean, detail: string) =>
    checks.push({ name, pass, detail });

  /* ═══ TOOLS-1 the table is total over what the fixture actually uses ═══ */
  {
    const used = fixtureCapabilities();
    const undecided = used.filter((capability) => !hasCapabilityDecision(capability));
    const unknown = used.filter(
      (capability) => resolveCapability(capability).kind === "unknown",
    );

    add(
      "TOOLS-1 every capability the BrightPath fixture uses has an explicit Composio decision",
      used.length > 0 && undecided.length === 0 && unknown.length === 0,
      `${used.length} capabilities across ${BRIGHTPATH_PLAN.agents.length} agents; ` +
        `${undecided.length} with no table entry` +
        (undecided.length === 0 ? "" : ` (${undecided.join(", ")})`) +
        `, ${unknown.length} resolving to "unknown"` +
        (unknown.length === 0 ? "" : ` (${unknown.join(", ")})`),
    );
  }

  /* ═══ TOOLS-2 total over the shared registry, and never contradicting it ═══
         Stronger than TOOLS-1 and the reason a new operation in
         lib/plan/operations.ts cannot ship without a Composio decision. */
  {
    const unknown: string[] = [];
    const misfiled: string[] = [];
    for (const def of OPERATIONS) {
      const route = resolveCapability(def.id);
      if (route.kind === "unknown") {
        unknown.push(def.id);
        continue;
      }
      if (route.integrationId !== def.integrationId) {
        misfiled.push(`${def.id} -> ${route.integrationId} (registry says ${def.integrationId})`);
      }
    }
    const both = mappedCapabilities().filter((capability) =>
      unroutableCapabilities().includes(capability),
    );

    add(
      "TOOLS-2 the table is total over lib/plan/operations.ts and agrees with it about ownership",
      unknown.length === 0 && misfiled.length === 0 && both.length === 0,
      `${OPERATIONS.length} registry operations = ${mappedCapabilities().length} mapped + ` +
        `${unroutableCapabilities().length} explicitly unroutable; ` +
        `${unknown.length} undecided${unknown.length === 0 ? "" : ` (${unknown.join(", ")})`}, ` +
        `${misfiled.length} on the wrong integration${misfiled.length === 0 ? "" : ` (${misfiled.join("; ")})`}, ` +
        `${both.length} listed in both tables`,
    );
  }

  /* ═══ TOOLS-3 a mapped slug belongs to the toolkit it is filed under ═══
         The mechanical half of "is the slug right": Composio prefixes every
         tool with its toolkit, so GMAIL_* under slack is a typo this catches
         without asking the catalog anything. */
  {
    const wrong: string[] = [];
    for (const capability of mappedCapabilities()) {
      const route = resolveCapability(capability);
      if (route.kind !== "tool") {
        wrong.push(`${capability} did not resolve to a tool`);
        continue;
      }
      const expected = `${route.toolkitSlug.toUpperCase()}_`;
      if (!route.toolSlug.startsWith(expected)) {
        wrong.push(`${capability} -> ${route.toolSlug} (expected prefix ${expected})`);
      }
      if (toolkitSlugFor(route.integrationId) !== route.toolkitSlug) {
        wrong.push(`${capability} resolved toolkit ${route.toolkitSlug}, table says otherwise`);
      }
    }

    add(
      "TOOLS-3 every mapped tool slug carries its own toolkit's prefix",
      wrong.length === 0,
      `${mappedCapabilities().length} mapped capabilities checked; ` +
        `${wrong.length} mismatched${wrong.length === 0 ? "" : `: ${wrong.join("; ")}`}`,
    );
  }

  /* ═══ TOOLS-4 an unmapped capability refuses, before any HTTP call ═══
         QuickBooks is CONNECTED here on purpose. The refusal must come from the
         absent tool, not from an absent connection — otherwise the check would
         pass for the wrong reason and stop protecting anything the day
         QuickBooks is linked for real. */
  {
    const fake = new FakeComposio({
      accounts: [account("quickbooks", "ACTIVE", "ca_qb"), account("gmail", "ACTIVE", "ca_gmail")],
    });
    const p = provider(fake);
    await p.ready();

    // Connected, and every capability it has is unroutable. The client is still
    // issued — reporting "QuickBooks is not connected" would be false — and the
    // refusal names the real reason.
    const quickbooks = p.getToolClient("quickbooks");
    const noTool = await quickbooks?.call({
      integrationId: "quickbooks",
      operation: "quickbooks.invoices.list",
      args: { status: "overdue" },
      metrics: {},
    });

    // In no table at all: the registry and capabilities.ts have drifted, or an
    // agent package invented an operation. Either way, nothing is looked up.
    const stranger = await p.getToolClient("gmail")?.call({
      integrationId: "gmail",
      operation: "acme.widgets.frobnicate",
      args: {},
      metrics: {},
    });

    // A grant for one tool spent on another: the client is scoped, so it
    // refuses rather than reaching for Slack through the Gmail connection.
    const crossed = await p.getToolClient("gmail")?.call({
      integrationId: "slack",
      operation: "slack.messages.post",
      args: { channel: "#field-ops" },
      metrics: {},
    });

    add(
      "TOOLS-4 unmapped, unknown and cross-integration calls all refuse without executing anything",
      quickbooks !== null &&
        noTool?.ok === false &&
        (noTool.error ?? "").includes("QuickBooks toolkit") &&
        stranger?.ok === false &&
        (stranger.error ?? "").includes("lib/plan/operations.ts") &&
        crossed?.ok === false &&
        (crossed.error ?? "").includes("bound to") &&
        fake.executed.length === 0,
      `client for connected QuickBooks: ${quickbooks === null ? "null (WRONG — it is connected)" : "issued"}; ` +
        `quickbooks.invoices.list -> ${noTool?.ok === false ? "refused" : "ACCEPTED"}; ` +
        `acme.widgets.frobnicate -> ${stranger?.ok === false ? "refused" : "ACCEPTED"}; ` +
        `slack.messages.post on the gmail client -> ${crossed?.ok === false ? "refused" : "ACCEPTED"}; ` +
        `tools.execute called ${fake.executed.length} time(s) (must be 0)`,
    );
  }

  /* ═══ TOOLS-5 mailchimp refuses even when Composio says it is connected ═══
         The trap: the fake reports an ACTIVE mailchimp account. If the refusal
         were incidental — "we never saw one" — this check would go red. */
  {
    const fake = new FakeComposio({
      accounts: [account("mailchimp", "ACTIVE", "ca_mc"), account("gmail", "ACTIVE", "ca_gmail")],
    });
    const p = provider(fake);
    await p.ready();

    const status = p.getIntegrationStatus("mailchimp");
    const client = p.getToolClient("mailchimp");
    const route = resolveCapability("mailchimp.campaigns.publish");
    const scanned = fake.queries[0]?.toolkitSlugs ?? [];

    add(
      "TOOLS-5 mailchimp reports not-connected and refuses, with an ACTIVE account on offer",
      status === "required" &&
        client === null &&
        route.kind === "unroutable" &&
        !scanned.includes("mailchimp") &&
        p.getIntegrationStatus("gmail") === "connected",
      `status=${status} (must be "required"), client=${client === null ? "null" : "ISSUED"}, ` +
        `mailchimp.campaigns.publish route=${route.kind}, ` +
        `the connection scan asked about [${scanned.join(", ")}] — mailchimp absent, ` +
        `while gmail in the same response reads ${p.getIntegrationStatus("gmail")}`,
    );
  }

  /* ═══ TOOLS-6 no credentials is a named error at construction ═══ */
  {
    const saved = process.env.COMPOSIO_API_KEY;
    delete process.env.COMPOSIO_API_KEY;

    let missingKey: unknown = null;
    try {
      new ComposioIntegrationProvider({ organizationId: ORG, client: new FakeComposio() });
    } catch (error) {
      missingKey = error;
    }

    let missingOrg: unknown = null;
    try {
      new ComposioIntegrationProvider({
        organizationId: "   ",
        client: new FakeComposio(),
        apiKey: API_KEY,
      });
    } catch (error) {
      missingOrg = error;
    }

    if (saved === undefined) delete process.env.COMPOSIO_API_KEY;
    else process.env.COMPOSIO_API_KEY = saved;

    const keyError = missingKey instanceof ComposioToolsConfigError ? missingKey : null;
    const orgError = missingOrg instanceof ComposioToolsConfigError ? missingOrg : null;

    add(
      "TOOLS-6 a missing key or organization throws ComposioToolsConfigError, never a stub",
      keyError !== null &&
        keyError.name === "ComposioToolsConfigError" &&
        keyError.missing.includes("COMPOSIO_API_KEY") &&
        keyError.message.includes("does not fall back") &&
        orgError !== null &&
        orgError.missing.some((entry) => entry.startsWith("organizationId")),
      `no key -> ${keyError === null ? String(missingKey) : `${keyError.name} missing=[${keyError.missing.join(", ")}]`}; ` +
        `blank organization -> ${orgError === null ? String(missingOrg) : `${orgError.name} missing=[${orgError.missing.join(", ")}]`}`,
    );
  }

  /* ═══ TOOLS-7 an unread snapshot is not an optimistic one ═══
         `getIntegrationStatus` and `getToolClient` are synchronous seams over an
         HTTP fact. Before the first scan lands they must answer pessimistically,
         because the alternative is handing out a client for a connection nobody
         has confirmed exists. */
  {
    const fake = new FakeComposio({ accounts: [account("gmail", "ACTIVE", "ca_gmail")] });
    const p = provider(fake, { prime: false });

    const statusBefore = p.getIntegrationStatus("gmail");
    const clientBefore = p.getToolClient("gmail");
    const scansBefore = fake.queries.length;

    await p.ready();
    const statusAfter = p.getIntegrationStatus("gmail");
    const clientAfter = p.getToolClient("gmail");

    add(
      "TOOLS-7 an integration whose state has not been read yet is not connected",
      statusBefore === "required" &&
        clientBefore === null &&
        scansBefore === 0 &&
        statusAfter === "connected" &&
        clientAfter !== null,
      `before the scan: status=${statusBefore} client=${clientBefore === null ? "null" : "ISSUED"} ` +
        `(${scansBefore} scans made); after: status=${statusAfter} ` +
        `client=${clientAfter === null ? "null" : "issued"}`,
    );
  }

  /* ═══ TOOLS-8 a connected integration executes the mapped slug, as the org ═══
         The identity is the point: Composio scopes a connected account to a user
         id, this application uses the organization id, and executing one
         business's Gmail under another's is not undoable. */
  {
    const fake = new FakeComposio({
      accounts: [account("gmail", "ACTIVE", "ca_gmail_9")],
      result: { successful: true, error: null, data: { id: "msg-1", threadId: "t-1" } },
    });
    const p = provider(fake);
    await p.ready();

    const args: Record<string, unknown> = { recipient_email: "adeline.wong@example.sg" };
    const result = await p.getToolClient("gmail")?.call({
      integrationId: "gmail",
      operation: "gmail.messages.send",
      args,
      metrics: { "invoice.amount": 95 },
    });
    const sent = fake.executed[0];
    // Mutating the caller's args after the call must not change what was sent:
    // the executor keeps this object in the run record and in frozen approvals.
    args["recipient_email"] = "somebody-else@example.sg";

    add(
      "TOOLS-8 a connected integration executes the mapped slug under the organization's identity",
      result?.ok === true &&
        fake.executed.length === 1 &&
        sent?.slug === "GMAIL_SEND_EMAIL" &&
        sent.body.userId === ORG &&
        sent.body.connectedAccountId === "ca_gmail_9" &&
        sent.body.arguments?.["recipient_email"] === "adeline.wong@example.sg" &&
        sent.body.dangerouslySkipVersionCheck === true,
      `gmail.messages.send -> ${sent?.slug ?? "NOTHING"} ` +
        `userId=${sent?.body.userId} connectedAccountId=${sent?.body.connectedAccountId} ` +
        `args.recipient_email=${String(sent?.body.arguments?.["recipient_email"])} ` +
        `(caller mutated theirs afterwards), ok=${String(result?.ok)}`,
    );
  }

  /* ═══ TOOLS-9 expired and disabled are not connected ═══
         EXPIRED becomes "needs_approval" because the owner can act on it; both
         still hand out no client, which is the only thing that gates a call. */
  {
    const fake = new FakeComposio({
      accounts: [
        account("gmail", "EXPIRED", "ca_gmail_dead"),
        account("slack", "ACTIVE", "ca_slack_off", true),
        account("hubspot", "INITIATED", "ca_hs_half"),
      ],
    });
    const p = provider(fake);
    await p.ready();

    const gmail = p.getIntegrationStatus("gmail");
    const slack = p.getIntegrationStatus("slack");
    const hubspot = p.getIntegrationStatus("hubspot");
    const issued = ["gmail", "slack", "hubspot"].filter(
      (integrationId) => p.getToolClient(integrationId) !== null,
    );

    add(
      "TOOLS-9 expired, disabled and half-finished connections hand out no client",
      gmail === "needs_approval" &&
        slack === "required" &&
        hubspot === "required" &&
        issued.length === 0,
      `EXPIRED gmail=${gmail} (re-auth is something an owner can do, so it is not ` +
        `flattened into "required"), disabled slack=${slack}, INITIATED hubspot=${hubspot}; ` +
        `clients issued: ${issued.length === 0 ? "none" : issued.join(", ")} (must be none)`,
    );
  }

  /* ═══ TOOLS-10 Composio's own failure is a failed call, not data ═══
         `successful: false` carries a 200 response. Reading it as data would put
         an error object into the run context and let the next step reason over
         it as though the email had gone out. */
  {
    const refusing = new FakeComposio({
      accounts: [account("slack", "ACTIVE", "ca_slack")],
      result: { successful: false, error: "channel_not_found", data: {} },
    });
    const p1 = provider(refusing);
    await p1.ready();
    const refused = await p1.getToolClient("slack")?.call({
      integrationId: "slack",
      operation: "slack.messages.post",
      args: { channel: "#nope" },
      metrics: {},
    });

    const throwing = new FakeComposio({
      accounts: [account("slack", "ACTIVE", "ca_slack")],
      result: "ComposioToolNotFoundError: SLACK_SEND_MESSAGE",
    });
    const p2 = provider(throwing);
    await p2.ready();
    let threw = false;
    let thrownResult: ToolResult | undefined;
    try {
      thrownResult = await p2.getToolClient("slack")?.call({
        integrationId: "slack",
        operation: "slack.messages.post",
        // `{ channel }` RATHER THAN `{}`, and the recording is why. This check is
        // about an SDK throw becoming a failed tool call, so the shape gate has to
        // let the call reach the SDK first. The hand-written fake declared
        // SLACK_SEND_MESSAGE `required: []`, so `{}` used to get through;
        // ../tools/catalog-recording.ts says the real tool requires `channel`, and
        // with `{}` this check would now be refused before `tools.execute` was
        // ever called — passing, while proving something else entirely.
        args: { channel: "#field-ops" },
        metrics: {},
      });
    } catch {
      threw = true;
    }

    add(
      "TOOLS-10 a Composio refusal and a Composio throw both come back as failed tool calls",
      refused?.ok === false &&
        (refused.error ?? "").includes("channel_not_found") &&
        (refused.error ?? "").includes("SLACK_SEND_MESSAGE") &&
        threw === false &&
        thrownResult?.ok === false &&
        (thrownResult.error ?? "").includes("SLACK_SEND_MESSAGE"),
      `successful:false -> ok=${String(refused?.ok)} "${(refused?.error ?? "").slice(0, 70)}..."; ` +
        `SDK throw -> ${threw ? "PROPAGATED (the executor would see a stack, not a refusal)" : `ok=${String(thrownResult?.ok)}`} ` +
        `"${(thrownResult?.error ?? "").slice(0, 70)}..."`,
    );
  }

  /* ═══════════════════ Whose hands: organization.ts ═══════════════════
         Nothing above this line has loaded lib/runtime/tools/organization.ts,
         and it is loaded here with `@composio/core` already answered from
         require.cache — see "the SDK, quarantined". */
  const { organization: routing, providerCache } = await organizationModules();

  /* ═══ TOOLS-11 a plan with no organization gets nobody's connections ═══
         RUN WITH ORIANT_ORGANIZATION_ID SET, on purpose. A blank id falling
         through to the environment is the original bug wearing the new field's
         name, and a check that ran with the variable unset would go green
         without ever asking. */
  {
    const ELSEWHERE = "org-somebody-elses-gmail";
    const sdkBefore = SDK_CLIENTS.length;
    const seen = await withEnv({ ORIANT_ORGANIZATION_ID: ELSEWHERE }, async () => ({
      empty: routing.resolveToolsOrganization(""),
      // Whitespace is not a name either — `resolveToolsOrganization` trims
      // before it decides, so " " must land where "" lands.
      spaces: routing.resolveToolsOrganization("  \t\n "),
      // The shape a stored `Deployment.plan` frozen before `organizationId`
      // existed actually hands the runtime: not "", but undefined. The live
      // poller once crashed on exactly this — `.trim()` of undefined killed
      // the scheduler pass — so this probe is the regression tripwire: it must
      // land on the same refusal as "" and must not throw.
      missing: routing.resolveToolsOrganization(undefined as unknown as string),
      blankProvider: routing.liveIntegrationProviderFor(""),
    }));
    const { empty, spaces, missing, blankProvider } = seen;
    const refusal = await trySend(blankProvider);

    add(
      "TOOLS-11 a plan that names no organization is refused, and ORIANT_ORGANIZATION_ID does not rescue it",
      empty.kind === "unresolved" &&
        spaces.kind === "unresolved" &&
        missing.kind === "unresolved" &&
        empty.reason.includes("ApprovedPlan.organizationId is empty") &&
        // The borrowed value appears nowhere in the answer: not as the
        // organization, and not quoted into the reason as a suggestion.
        !JSON.stringify(seen).includes(ELSEWHERE) &&
        blankProvider instanceof routing.UnresolvedOrganizationProvider &&
        refusal?.ok === false &&
        SDK_CLIENTS.length === sdkBefore,
      `"" -> ${describeOrganization(empty)}; "  \\t\\n " -> ${describeOrganization(spaces)}; ` +
        `undefined (a pre-organizationId deployment row) -> ${describeOrganization(missing)}; ` +
        `with ORIANT_ORGANIZATION_ID=${ELSEWHERE} the value appears in the answer: ` +
        `${JSON.stringify(seen).includes(ELSEWHERE) ? "YES (it was borrowed)" : "no"}; ` +
        `${SEND.operation} -> ${refusal?.ok === false ? "refused" : "ACCEPTED"}; ` +
        `Composio clients constructed: ${SDK_CLIENTS.length - sdkBefore} (must be 0)`,
    );
  }

  /* ═══ TOOLS-12 the fixture is the only plan that reads the environment ═══
         THE LOAD-BEARING PROPERTY of lib/runtime/tools/organization.ts, and the
         one that decides whether the fix is real or a rename: a deployment that
         still has the old ORIANT_ORGANIZATION_ID in place must not be able to
         redirect a real customer's plan with it. */
  {
    // The organization id on Role B's actual handoff, not an invented one.
    const REAL = "1647df28-64de-4c69-b681-d20c3170b88b";
    const BORROWED = "org-the-demo-may-borrow";
    const resolveBoth = async () => ({
      fixture: routing.resolveToolsOrganization(BRIGHTPATH_DEMO_ORGANIZATION_ID),
      real: routing.resolveToolsOrganization(REAL),
    });

    const set = await withEnv({ ORIANT_ORGANIZATION_ID: BORROWED }, resolveBoth);
    const unset = await withEnv({ ORIANT_ORGANIZATION_ID: null }, resolveBoth);

    add(
      "TOOLS-12 only the BrightPath fixture reads ORIANT_ORGANIZATION_ID; a real plan never does",
      set.fixture.kind === "fixture_fallback" &&
        set.fixture.organizationId === BORROWED &&
        unset.fixture.kind === "unresolved" &&
        unset.fixture.reason.includes(routing.FIXTURE_ORGANIZATION_ENV) &&
        set.real.kind === "plan" &&
        set.real.organizationId === REAL &&
        // The whole property in one line: for a plan that is not the fixture,
        // the variable is not an input, so setting it changes nothing.
        JSON.stringify(set.real) === JSON.stringify(unset.real),
      `with ${routing.FIXTURE_ORGANIZATION_ENV}=${BORROWED}: fixture -> ` +
        `${describeOrganization(set.fixture)}, real plan -> ${describeOrganization(set.real)}; ` +
        `with it unset: fixture -> ${describeOrganization(unset.fixture)}, real plan -> ` +
        `${describeOrganization(unset.real)}; the real plan's answer is ` +
        `${JSON.stringify(set.real) === JSON.stringify(unset.real) ? "identical either way" : "DIFFERENT (the environment reached a customer's plan)"}`,
    );
  }

  /* ═══ TOOLS-13 the refusal is a client, not a null and not a stub ═══
         Three wrong answers are available here and each is worse than refusing:
         null reads downstream as "the owner never connected Gmail", "connected"
         lets a workforce go live on credentials nobody could resolve, and the
         stub answers the write with { simulated: true } and reports success. */
  {
    const blankProvider = await withEnv({ ORIANT_ORGANIZATION_ID: null }, async () =>
      routing.liveIntegrationProviderFor(""),
    );
    const integrations = ["gmail", "slack", "google-calendar", "quickbooks"];
    const statuses = integrations.map((id) => blankProvider.getIntegrationStatus(id));
    const clients = integrations.map((id) => blankProvider.getToolClient(id));
    const refusal = await trySend(blankProvider);
    const error = refusal?.ok === false ? refusal.error ?? "" : "";

    add(
      "TOOLS-13 an unresolved organization hands out a refusing client, never null and never the stub",
      blankProvider instanceof routing.UnresolvedOrganizationProvider &&
        !(blankProvider instanceof ComposioIntegrationProvider) &&
        !(blankProvider instanceof StubIntegrationProvider) &&
        statuses.every((status) => status === "required") &&
        clients.every((client) => client !== null) &&
        refusal?.ok === false &&
        error.includes(SEND.operation) &&
        error.includes("Nothing was sent to Composio") &&
        error.includes("no other organization's connections were used in its place"),
      `provider=${blankProvider.constructor.name}; statuses=[${statuses.join(", ")}] ` +
        `(all must be "required" — "connected" would let activation through); ` +
        `clients issued ${clients.filter((client) => client !== null).length}/${clients.length} ` +
        `(null would read as "not connected", which is a different problem with a ` +
        `different fix); refusal="${error.slice(0, 90)}..."`,
    );
  }

  /* ═══ TOOLS-14 one provider per organization, each acting as itself ═══
         The memoisation is not an optimisation: `getToolClient` answers
         synchronously off a connection snapshot, so a provider rebuilt per call
         would answer "required" forever. And the key is the point — a cache with
         one entry, or none, is the process-wide provider this change removes. */
  {
    const ACME = "org-acme-plumbing";
    const GLOBEX = "org-globex-aircon";

    const seen = await withEnv(
      {
        COMPOSIO_API_KEY: API_KEY,
        ORIANT_ORGANIZATION_ID: "org-must-not-be-consulted",
        // BOTH PERMITTED, because this check is about the memoisation and not
        // about the allowlist: `liveIntegrationProviderFor` refuses an
        // unpermitted organization before it builds anything, so without this
        // line the two providers below would be refusals and TOOLS-14 would go
        // green on evidence that no client was ever cached. TOOLS-18 is where
        // the refusal is the subject.
        [ALLOWED_ORGANIZATIONS_ENV]: `${ACME}, ${GLOBEX}`,
      },
      async () => {
        // Reset on the way in AND on the way out: this target must neither
        // inherit a provider from an earlier check nor leave a fake-backed one
        // on globalThis for anything that runs after it.
        providerCache.resetOrganizationProviders();
        const sdkBefore = SDK_CLIENTS.length;

        const acme = routing.liveIntegrationProviderFor(ACME);
        const acmeAgain = routing.liveIntegrationProviderFor(ACME);
        const globex = routing.liveIntegrationProviderFor(GLOBEX);
        for (const built of [acme, globex]) {
          if (built instanceof ComposioIntegrationProvider) await built.ready();
        }

        const acmeSent = await trySend(acme);
        const globexSent = await trySend(globex);
        const clients = SDK_CLIENTS.slice(sdkBefore);

        providerCache.resetOrganizationProviders();
        return { acme, acmeAgain, globex, acmeSent, globexSent, clients };
      },
    );

    // What each fake SDK client was actually asked, in its own words: who the
    // connection scan was for, and who the send went out as.
    const scannedAs = seen.clients.map((client) => (client.queries[0]?.userIds ?? []).join("+"));
    const sentAs = seen.clients.map((client) =>
      client.executed.map((call) => String(call.body.userId)).join("+"),
    );

    add(
      "TOOLS-14 two organizations get two providers, each acting as itself; the same one twice gets one",
      seen.acme === seen.acmeAgain &&
        seen.acme !== seen.globex &&
        seen.acme instanceof ComposioIntegrationProvider &&
        seen.globex instanceof ComposioIntegrationProvider &&
        seen.clients.length === 2 &&
        seen.clients.every((client) => client.apiKey === API_KEY) &&
        seen.acmeSent?.ok === true &&
        seen.globexSent?.ok === true &&
        scannedAs.join(" | ") === `${ACME} | ${GLOBEX}` &&
        sentAs.join(" | ") === `${ACME} | ${GLOBEX}`,
      `${ACME} asked twice -> ${seen.acme === seen.acmeAgain ? "one provider" : "TWO (the snapshot is rebuilt per call)"}; ` +
        `${GLOBEX} -> ${seen.acme === seen.globex ? "THE SAME OBJECT (one organization per process)" : "its own provider"}; ` +
        `SDK clients built: ${seen.clients.length} (must be 2); ` +
        `connection scans ran as [${scannedAs.join(" | ")}], sends went out as [${sentAs.join(" | ")}] ` +
        `— both must read "${ACME} | ${GLOBEX}", never org-must-not-be-consulted`,
    );
  }

  /* ═══ TOOLS-15 no credentials is a refusal, not a stack trace ═══
         session.ts already asserts COMPOSIO_API_KEY at construction, so by the
         time a plan is being executed a missing key means it went away
         mid-flight. That is one plan's problem, not the deployment's, and a
         throw here would take out the route handler serving it. */
  {
    const ACME = "org-acme-plumbing";
    const seen = await withEnv(
      {
        COMPOSIO_API_KEY: null,
        ORIANT_ORGANIZATION_ID: null,
        // PERMITTED, so the refusal this check reads can only be about the
        // missing key. `liveIntegrationProviderFor` asks about authority before
        // credentials — an operator sent to fix a credential for an id they were
        // never allowed to use is being sent to fix the wrong thing — so leaving
        // this unset would make the check pass for the other reason entirely.
        [ALLOWED_ORGANIZATIONS_ENV]: ACME,
      },
      async () => {
        providerCache.resetOrganizationProviders();
        const sdkBefore = SDK_CLIENTS.length;
        let resolved: IntegrationProvider | null = null;
        let threw: unknown = null;
        try {
          resolved = routing.liveIntegrationProviderFor(ACME);
        } catch (error) {
          threw = error;
        }
        const built = SDK_CLIENTS.length - sdkBefore;
        providerCache.resetOrganizationProviders();
        return { resolved, threw, built };
      },
    );
    // Read through `IntegrationProvider`, before the `instanceof` below narrows
    // to the concrete class: this is the seam the activation checklist calls,
    // and the status it gets is what decides whether a workforce may go live.
    const status = seen.resolved?.getIntegrationStatus("gmail");
    const refusal = seen.resolved === null ? undefined : await trySend(seen.resolved);
    const error = refusal?.ok === false ? refusal.error ?? "" : "";

    add(
      "TOOLS-15 a resolvable organization with no credentials refuses by name instead of throwing",
      seen.threw === null &&
        seen.resolved instanceof routing.UnresolvedOrganizationProvider &&
        seen.built === 0 &&
        status === "required" &&
        refusal?.ok === false &&
        error.includes(ACME) &&
        error.includes("COMPOSIO_API_KEY"),
      `liveIntegrationProviderFor("${ACME}") with no key -> ` +
        `${seen.threw !== null ? `THREW ${String(seen.threw)}` : seen.resolved?.constructor.name ?? "null"}; ` +
        `SDK clients built: ${seen.built} (must be 0 — the key is checked before the client); ` +
        `refusal names the organization and the variable: ` +
        `${error.includes(ACME) && error.includes("COMPOSIO_API_KEY") ? "yes" : `NO ("${error.slice(0, 70)}...")`}`,
    );
  }

  /* ═══ TOOLS-16 the ingest refusal and the runtime refusal are one fact ═══
         `organization_unresolved` is the only blocking gap Role B's real payload
         never produces, so without ROLE_B_HANDOFF_UNOWNED both halves of this
         are code nothing executes. The corrected handoff is ingested alongside
         it as the control: the two fixtures differ in `organization.id` and
         nothing else, so the refusal cannot be coming from somewhere else. */
  {
    const unowned = ingestHandoff(ROLE_B_HANDOFF_UNOWNED);
    const owned = ingestHandoff(ROLE_B_HANDOFF_RESOLVED);
    const gap = unowned.gaps.find((entry) => entry.code === "organization_unresolved");

    // Set, again on purpose: the plan reaches the runtime with a blank owner and
    // the deployment has an organization configured. It still gets nobody's.
    const hands = await withEnv(
      { ORIANT_ORGANIZATION_ID: "org-somebody-elses-gmail" },
      async () => routing.liveIntegrationProviderFor(unowned.plan.organizationId),
    );
    const refusal = await trySend(hands);

    add(
      "TOOLS-16 a handoff with no organization is refused at ingest and refused again at the hands",
      gap !== undefined &&
        gap.severity === "blocking" &&
        gap.resolution.includes("organization.id") &&
        unowned.runnable === false &&
        unowned.plan.organizationId === "" &&
        owned.plan.organizationId.length > 0 &&
        owned.gaps.every((entry) => entry.code !== "organization_unresolved") &&
        hands instanceof routing.UnresolvedOrganizationProvider &&
        refusal?.ok === false,
      `ingest: runnable=${unowned.runnable} gap=${gap === undefined ? "NONE (the refusal is dead code)" : `${gap.code}/${gap.severity}`} ` +
        `plan.organizationId="${unowned.plan.organizationId}"; the same fixture WITH an id -> ` +
        `"${owned.plan.organizationId}" and no such gap; runtime: ` +
        `${hands.constructor.name}, ${SEND.operation} -> ${refusal?.ok === false ? "refused" : "ACCEPTED"}`,
    );
  }

  /* ═════════ May this deployment act for them: the allowlist ═════════
         ORIANT_ALLOWED_ORGANIZATION_IDS is enforced in
         `liveIntegrationProviderFor`, the one function that hands out a live
         Composio provider — see the header for the five paths that reached live
         execution while it was read on three routes only. */

  /* ═══ TOOLS-17 a permitted organization still gets live hands ═══
         THE CHECK THAT STOPS THE OTHER THREE PASSING FOR NOTHING. A function
         that refused every organization would satisfy TOOLS-18, -19 and -20 and
         break every deployment that has ever been configured correctly. The
         allowlist here is deliberately two entries with sloppy whitespace,
         because that is the shape an operator's real value has. */
  {
    const ACME = "org-acme-plumbing";
    const OTHER = "org-globex-aircon";
    const seen = await withEnv(
      {
        COMPOSIO_API_KEY: API_KEY,
        ORIANT_ORGANIZATION_ID: null,
        [ALLOWED_ORGANIZATIONS_ENV]: `  ${OTHER} ,  ${ACME}  `,
      },
      async () => {
        providerCache.resetOrganizationProviders();
        const sdkBefore = SDK_CLIENTS.length;
        const resolved = routing.liveIntegrationProviderFor(ACME);
        if (resolved instanceof ComposioIntegrationProvider) await resolved.ready();
        const sent = await trySend(resolved);
        const status = resolved.getIntegrationStatus("gmail");
        const clients = SDK_CLIENTS.slice(sdkBefore);
        providerCache.resetOrganizationProviders();
        return { resolved, sent, status, clients };
      },
    );
    // Who the send actually went out as. A provider that was live but acting as
    // the wrong organization would pass every other clause in this check.
    const sentAs = seen.clients
      .flatMap((client) => client.executed.map((call) => String(call.body.userId)))
      .join("+");

    add(
      "TOOLS-17 an organization on the allowlist gets a live provider and executes as itself",
      seen.resolved instanceof ComposioIntegrationProvider &&
        seen.clients.length === 1 &&
        seen.status === "connected" &&
        seen.sent?.ok === true &&
        sentAs === ACME,
      `liveIntegrationProviderFor("${ACME}") with the allowlist reading ` +
        `"  ${OTHER} ,  ${ACME}  " -> ${seen.resolved.constructor.name} ` +
        `(ComposioIntegrationProvider required — a refusal here means the trimming ` +
        `or the membership test is wrong); gmail=${seen.status}; ` +
        `${SEND.operation} -> ${seen.sent?.ok === true ? "executed" : "REFUSED"} as ` +
        `[${sentAs}] (must be ${ACME}); SDK clients built: ${seen.clients.length} (must be 1)`,
    );
  }

  /* ═══ TOOLS-18 an unpermitted organization is refused at the hands ═══
         THE WHOLE POINT OF MOVING THE RULE HERE. This is the refusal
         /api/runtime/activation, /run, /approvals, /scheduler and the poller
         get — none of them ever consulted the allowlist, and none of them had
         to change. Nothing is constructed, nothing is sent, and the message
         names the id and the variable rather than the list. */
  {
    const ACME = "org-acme-plumbing";
    const PERMITTED = "org-the-only-one-this-server-allows";
    const seen = await withEnv(
      {
        COMPOSIO_API_KEY: API_KEY,
        ORIANT_ORGANIZATION_ID: null,
        [ALLOWED_ORGANIZATIONS_ENV]: PERMITTED,
      },
      async () => {
        providerCache.resetOrganizationProviders();
        const sdkBefore = SDK_CLIENTS.length;
        const resolved = routing.liveIntegrationProviderFor(ACME);
        const sent = await trySend(resolved);
        const status = resolved.getIntegrationStatus("gmail");
        const client = resolved.getToolClient("gmail");
        const built = SDK_CLIENTS.length - sdkBefore;
        providerCache.resetOrganizationProviders();
        return { resolved, sent, status, client, built };
      },
    );
    const unpermitted =
      seen.resolved instanceof routing.UnpermittedOrganizationProvider ? seen.resolved : null;
    const error = seen.sent?.ok === false ? seen.sent.error ?? "" : "";
    // THE COUNT, NEVER THE IDS — the same discretion the 403 exercises, kept in a
    // string that travels further than the 403 does: into a run record, an
    // approval, and an inbox.
    const leaked = error.includes(PERMITTED);

    add(
      "TOOLS-18 an organization the allowlist does not permit gets a refusing provider naming the variable, and no client is built",
      unpermitted !== null &&
        unpermitted.refusal === "organization_not_allowlisted" &&
        !(seen.resolved instanceof ComposioIntegrationProvider) &&
        !(seen.resolved instanceof StubIntegrationProvider) &&
        seen.built === 0 &&
        seen.status === "required" &&
        // Not null: null reads downstream as "the owner never connected Gmail",
        // which is a different problem with a different, useless fix.
        seen.client !== null &&
        seen.sent?.ok === false &&
        error.includes(ACME) &&
        error.includes(ALLOWED_ORGANIZATIONS_ENV) &&
        error.includes("Nothing was sent to Composio") &&
        !leaked,
      `provider=${seen.resolved.constructor.name} refusal=${unpermitted?.refusal ?? "n/a"}; ` +
        `gmail=${seen.status} (must be "required" — "connected" would let activation ` +
        `through), client=${seen.client === null ? "NULL" : "issued"}; SDK clients built: ` +
        `${seen.built} (must be 0); ${SEND.operation} -> ` +
        `${seen.sent?.ok === false ? "refused" : "ACCEPTED"}; the message names the refused ` +
        `id and ${ALLOWED_ORGANIZATIONS_ENV}: ` +
        `${error.includes(ACME) && error.includes(ALLOWED_ORGANIZATIONS_ENV) ? "yes" : "NO"}, ` +
        `and the permitted id ${leaked ? "LEAKED INTO IT" : "never appears"}; ` +
        `"${error.slice(0, 90)}..."`,
    );
  }

  /* ═══ TOOLS-19 an empty allowlist permits nothing, however it is spelled ═══
         THE DIRECTION THAT HAS TO FAIL CLOSED. "Unconfigured means unrestricted"
         is the reading that would make every deployment that has not heard of
         this variable an open door, and it is what an `if (allowed.size > 0)`
         shortcut written for convenience would silently mean. Three spellings of
         empty, and two subjects: a real ingested organization, and the demo
         fixture's borrowed stand-in — which is checked on the id that would
         actually reach Composio, not on the fixture's own name. */
  {
    const REAL = "1647df28-64de-4c69-b681-d20c3170b88b";
    const BORROWED = "org-the-demo-would-borrow";
    const spellings: ReadonlyArray<readonly [string, string | null]> = [
      ["unset", null],
      ["empty string", ""],
      ["separators only", " , ,  "],
    ];

    let refusedEverywhere = true;
    let built = 0;
    let fixtureNamesItsSource = true;
    const outcomes: string[] = [];

    for (const [label, value] of spellings) {
      const seen = await withEnv(
        {
          COMPOSIO_API_KEY: API_KEY,
          ORIANT_ORGANIZATION_ID: BORROWED,
          [ALLOWED_ORGANIZATIONS_ENV]: value,
        },
        async () => {
          providerCache.resetOrganizationProviders();
          const sdkBefore = SDK_CLIENTS.length;
          const real = routing.liveIntegrationProviderFor(REAL);
          const fixture = routing.liveIntegrationProviderFor(BRIGHTPATH_DEMO_ORGANIZATION_ID);
          const realSent = await trySend(real);
          const fixtureSent = await trySend(fixture);
          const made = SDK_CLIENTS.length - sdkBefore;
          providerCache.resetOrganizationProviders();
          return { real, fixture, realSent, fixtureSent, made };
        },
      );

      const bothRefused =
        seen.real instanceof routing.UnpermittedOrganizationProvider &&
        seen.fixture instanceof routing.UnpermittedOrganizationProvider &&
        seen.realSent?.ok === false &&
        seen.fixtureSent?.ok === false;
      if (!bothRefused) refusedEverywhere = false;
      built += seen.made;

      // The fixture's refusal has to name the BORROWED id and where it came
      // from: an operator told "not permitted to act for org-the-demo-would-
      // borrow" would otherwise grep their handoffs for it and find nothing.
      const fixtureError =
        seen.fixtureSent?.ok === false ? seen.fixtureSent.error ?? "" : "";
      if (
        !fixtureError.includes(BORROWED) ||
        !fixtureError.includes(routing.FIXTURE_ORGANIZATION_ENV)
      ) {
        fixtureNamesItsSource = false;
      }

      outcomes.push(
        `${label}: real -> ${seen.real.constructor.name}/` +
          `${seen.realSent?.ok === false ? "refused" : "ACCEPTED"}, fixture -> ` +
          `${seen.fixture.constructor.name}/` +
          `${seen.fixtureSent?.ok === false ? "refused" : "ACCEPTED"}`,
      );
    }

    add(
      "TOOLS-19 an unset, blank or separators-only allowlist permits no organization at all",
      refusedEverywhere && built === 0 && fixtureNamesItsSource,
      `${outcomes.join("; ")}; SDK clients built across all three: ${built} (must be 0); ` +
        `the fixture's refusal names the borrowed id and ` +
        `${routing.FIXTURE_ORGANIZATION_ENV}: ${fixtureNamesItsSource ? "yes" : "NO"}`,
    );
  }

  /* ═══ TOOLS-20 with tools off the allowlist restricts nothing ═══
         The default, the demo, the verify targets and a clean clone all run
         here, and an allowlist they had to carry would buy no safety: every
         `act` step is a `StubIntegrationProvider` call that reaches nobody.
         PROVED BY CONTRAST, IN ONE ENVIRONMENT — the same organization, with the
         allowlist permitting nothing, executes down the stub branch and is
         refused down the live one. Two providers, one env, so the difference
         cannot be coming from anywhere else.

         The stub is constructed here rather than reached through
         `getRuntimeSession()`, mirroring the not-live branch of `toolsFor` in
         lib/runtime/session.ts: with ORIANT_RUNTIME_TOOLS unset that function
         returns the session's one stub and never calls
         `liveIntegrationProviderFor` at all, so the allowlist is not merely
         permissive with tools off — it is not read. */
  {
    const ACME = "org-acme-plumbing";
    const seen = await withEnv(
      {
        COMPOSIO_API_KEY: API_KEY,
        ORIANT_ORGANIZATION_ID: null,
        [ALLOWED_ORGANIZATIONS_ENV]: null,
      },
      async () => {
        providerCache.resetOrganizationProviders();
        const sdkBefore = SDK_CLIENTS.length;

        const stub: IntegrationProvider = new StubIntegrationProvider();
        const simulated = await trySend(stub);
        const stubStatus = stub.getIntegrationStatus("gmail");

        const live = routing.liveIntegrationProviderFor(ACME);
        const refused = await trySend(live);

        const built = SDK_CLIENTS.length - sdkBefore;
        providerCache.resetOrganizationProviders();
        return { stub, simulated, stubStatus, live, refused, built };
      },
    );

    add(
      "TOOLS-20 tools off is unrestricted: the stub executes for the very organization the live path refuses",
      seen.simulated?.ok === true &&
        seen.stubStatus === "connected" &&
        seen.live instanceof routing.UnpermittedOrganizationProvider &&
        seen.refused?.ok === false &&
        seen.built === 0,
      `with ${ALLOWED_ORGANIZATIONS_ENV} unset (permits nothing), organization ${ACME}: ` +
        `stub gmail=${seen.stubStatus}, ${SEND.operation} -> ` +
        `${seen.simulated?.ok === true ? "simulated" : "REFUSED (the demo and every verify target run through this line)"}; ` +
        `live -> ${seen.live.constructor.name}, ${SEND.operation} -> ` +
        `${seen.refused?.ok === false ? "refused" : "ACCEPTED"}; ` +
        `SDK clients built: ${seen.built} (must be 0)`,
    );
  }

  /* ═════════ The arguments themselves: schema-driven, or refused ═════════
         Everything above this line is about WHETHER a call may happen. These
         five are about whether the call is even the right SHAPE — the half that
         had never worked, because `arguments: { ...args }` forwarded whatever
         vocabulary the model happened to use.

         The process-wide schema cache is reset on the way in and on the way out:
         earlier checks in this file have already executed GMAIL_SEND_EMAIL and
         warmed it, and a check that read a schema some other check fetched would
         be asserting the cache rather than the fetch. */
  resetToolSchemaCache();

  /* ═══ TOOLS-21 the schema comes from the catalog, once per tool ═══
         And an unroutable capability never asks: the refusal in capabilities.ts
         is decided before anything reaches the network, schema included. */
  {
    const fake = new FakeComposio({ accounts: [account("gmail", "ACTIVE", "ca_gmail")] });
    const p = provider(fake);
    await p.ready();

    const first = await p.describeToolArguments("gmail.messages.send");
    const again = await p.describeToolArguments("gmail.messages.send");
    const unroutable = await p.describeToolArguments("quickbooks.invoices.list");
    const stranger = await p.describeToolArguments("acme.widgets.frobnicate");

    const names =
      first.kind === "schema" ? [...first.schema.properties.keys()].sort().join(", ") : "";

    add(
      "TOOLS-21 a tool's input schema is read from Composio's catalog and cached per tool",
      first.kind === "schema" &&
        first.toolSlug === "GMAIL_SEND_EMAIL" &&
        first.schema.properties.has("recipient_email") &&
        // WHAT THIS CLAUSE USED TO SAY: `required.includes("recipient_email")`.
        // The hand-written fake declared that, and it was not true — the recording
        // shows GMAIL_SEND_EMAIL publishing no `required` array at all. Asserting
        // the parser's answer against the RECORDING's own reading of the same
        // response is the only version of this clause that can catch a parser
        // that invented a required list, or lost one.
        first.schema.required.join(",") === recordedRequired("GMAIL_SEND_EMAIL").join(",") &&
        [...first.schema.properties.keys()].sort().join(",") ===
          recordedPropertyNames("GMAIL_SEND_EMAIL").join(",") &&
        // The prompt block is built here, not by the caller, so the text the
        // model sees and the schema the gate enforces cannot drift apart.
        first.prompt.includes("recipient_email") &&
        first.prompt.includes("GMAIL_SEND_EMAIL") &&
        again.kind === "schema" &&
        fake.schemaReads.length === 1 &&
        unroutable.kind === "no_tool" &&
        stranger.kind === "no_tool" &&
        fake.schemaReads.join(",") === "GMAIL_SEND_EMAIL",
      `gmail.messages.send -> ${first.kind}` +
        (first.kind === "schema" ? ` ${first.toolSlug} {${names}}` : "") +
        `; the recording says required=[${recordedRequired("GMAIL_SEND_EMAIL").join(", ")}] ` +
        `(empty: Composio marks none of the ten arguments required at this version); ` +
        `asked twice, the catalog was read ${fake.schemaReads.length} time(s) (must be 1); ` +
        `quickbooks.invoices.list -> ${unroutable.kind}, acme.widgets.frobnicate -> ` +
        `${stranger.kind}; catalog reads in total: [${fake.schemaReads.join(", ")}] ` +
        `(an unroutable capability must not appear)`,
    );
  }

  /* ═══ TOOLS-22 the schema reaches the model that produces the arguments ═══
         THE CHECK THE WHOLE CHANGE RESTS ON. A translation table would sit
         between the model and Composio; this design has nothing there, so if the
         schema does not reach the `reason` step's prompt then nothing else
         works. And it must reach only the step that produces arguments — the
         second reason step's output is consumed by no tool, so a block there
         would be telling the model to answer in a vocabulary nothing will read. */
  {
    resetToolSchemaCache();
    const fake = new FakeComposio({ accounts: [account("gmail", "ACTIVE", "ca_gmail_p")] });
    const driven = await driveOneSend(fake, {
      recipient_email: "adeline.wong@example.sg",
      subject: "Invoice INV-2041",
      body: "A gentle reminder about invoice INV-2041.",
    });

    const draft = driven.reasoner.prompts[0];
    const wrapUp = driven.reasoner.prompts[1];
    const draftPrompt = draft?.workflowPrompt ?? "";
    const wrapUpPrompt = wrapUp?.workflowPrompt ?? "";

    add(
      "TOOLS-22 the reason step that produces the arguments is given the tool's own schema, and only that step",
      driven.reasoner.prompts.length === 2 &&
        draft?.instruction === "Draft the reminder." &&
        draftPrompt.includes("recipient_email") &&
        draftPrompt.includes("GMAIL_SEND_EMAIL") &&
        // THE WORD "REQUIRED" USED TO BE ASSERTED HERE, and it passed only because
        // the fake invented a required argument. The recording shows
        // GMAIL_SEND_EMAIL publishing none, so the prompt for the runtime's most
        // consequential tool contains no REQUIRED line at all — and what has to be
        // asserted instead is that the block SAYS SO, rather than listing ten
        // arguments as "optional" and leaving the model to conclude `{}` will do.
        // See the no-required notice in ../tools/schema.ts.
        draftPrompt.includes("marks NONE of these arguments as required") &&
        // The workflow's own prompt is still there: the block is appended to it,
        // never in place of it.
        draftPrompt.includes("One send") &&
        wrapUp?.instruction === "Summarise what was sent." &&
        !wrapUpPrompt.includes("recipient_email") &&
        driven.run.status === "completed",
      `reason steps prompted: ${driven.reasoner.prompts.length}; "draft" prompt names ` +
        `recipient_email=${draftPrompt.includes("recipient_email")} ` +
        `GMAIL_SEND_EMAIL=${draftPrompt.includes("GMAIL_SEND_EMAIL")} ` +
        `and says the tool marks nothing required=` +
        `${draftPrompt.includes("marks NONE of these arguments as required")} ` +
        `and still carries the workflow prompt=${draftPrompt.includes("One send")}; ` +
        `"wrap-up" (its output feeds no tool) names recipient_email=` +
        `${wrapUpPrompt.includes("recipient_email")} (must be false); run=${driven.run.status}`,
    );
  }

  /* ═══ TOOLS-23 arguments that match the schema are sent exactly as produced ═══
         The check that stops the other three passing for nothing: a gate that
         refused everything would satisfy TOOLS-24 and TOOLS-25 and send no email
         ever again. Nothing is renamed, reordered or dropped on the way through —
         the model's answer IS the argument list. */
  {
    resetToolSchemaCache();
    const fake = new FakeComposio({
      accounts: [account("gmail", "ACTIVE", "ca_gmail_ok")],
      result: { successful: true, error: null, data: { id: "msg-9" } },
    });
    const p = provider(fake);
    await p.ready();

    const args: Record<string, unknown> = {
      recipient_email: "adeline.wong@example.sg",
      subject: "Invoice INV-2041",
      body: "A gentle reminder.",
      is_html: false,
    };
    const sent = await p.getToolClient("gmail")?.call({
      integrationId: "gmail",
      operation: "gmail.messages.send",
      args,
      metrics: {},
    });
    const call = fake.executed[0];
    const delivered = call?.body.arguments ?? {};

    add(
      "TOOLS-23 arguments matching the tool's schema reach Composio unchanged",
      sent?.ok === true &&
        fake.executed.length === 1 &&
        call?.slug === "GMAIL_SEND_EMAIL" &&
        JSON.stringify(delivered) === JSON.stringify(args) &&
        // A NARROWER SEND ALSO GOES OUT. This clause used to be described as
        // "carrying only the required argument"; the recording shows this tool
        // publishes no required arguments at all, so what it really proves is that
        // a short argument list — every name published, none of them compulsory —
        // is not refused for being short.
        (await (async () => {
          const minimal = await p.getToolClient("gmail")?.call({
            integrationId: "gmail",
            operation: "gmail.messages.send",
            args: { recipient_email: "someone@example.sg" },
            metrics: {},
          });
          return minimal?.ok === true;
        })()),
      `send with the schema's own names -> ok=${String(sent?.ok)}, slug=${call?.slug}, ` +
        `arguments delivered=${JSON.stringify(delivered)} ` +
        `(must equal what was produced, key for key); a second, shorter send also went ` +
        `out, so ${fake.executed.length} calls reached the SDK and neither was rewritten`,
    );
  }

  /* ═══ TOOLS-24 the model's own vocabulary is refused, not sent ═══
         `{ to, subject, body }` is what a language model answers when asked to
         send an email, and it is the exact shape this runtime used to forward.

         WHAT THE RECORDING CHANGED ABOUT THIS CHECK. The old version said two
         things were wrong with that argument list — a missing `recipient_email`
         and an unknown `to` — and asserted both. Only one of them was ever true:
         ../tools/catalog-recording.ts shows GMAIL_SEND_EMAIL marking nothing
         required, so there is no missing-argument complaint to make and NOTHING
         WOULD HAVE CAUGHT THIS CALL except the unknown name. That makes the
         unknown-name arm load-bearing on its own rather than a second opinion,
         which is worth knowing: it is the only thing between `{ to, … }` and an
         email Composio accepts and delivers to nobody. */
  {
    resetToolSchemaCache();
    const fake = new FakeComposio({ accounts: [account("gmail", "ACTIVE", "ca_gmail_bad")] });
    const p = provider(fake);
    await p.ready();

    const refused = await p.getToolClient("gmail")?.call({
      integrationId: "gmail",
      operation: "gmail.messages.send",
      args: { to: "adeline.wong@example.sg", subject: "Invoice INV-2041", body: "Reminder." },
      metrics: {},
    });
    const error = refused?.ok === false ? refused.error ?? "" : "";

    // A type that cannot be what the argument means is caught the same way.
    const wrongType = await p.getToolClient("gmail")?.call({
      integrationId: "gmail",
      operation: "gmail.messages.send",
      args: { recipient_email: 42 },
      metrics: {},
    });

    add(
      "TOOLS-24 arguments in the model's vocabulary are refused, naming what would have been dropped and what the tool does accept",
      refused?.ok === false &&
        error.includes('"to"') &&
        error.includes("dropped") &&
        error.includes("GMAIL_SEND_EMAIL") &&
        // The refusal has to hand the reader the right name, and the only place
        // it can come from is the tool's own list.
        error.includes("recipient_email") &&
        wrongType?.ok === false &&
        (wrongType.error ?? "").includes("must be string") &&
        fake.executed.length === 0,
      `{to, subject, body} -> ${refused?.ok === false ? "refused" : "SENT"}; the message names ` +
        `the name Composio would have silently dropped=${error.includes('"to"')}, the slug=` +
        `${error.includes("GMAIL_SEND_EMAIL")}, and the name the tool really uses=` +
        `${error.includes("recipient_email")} — note it is NOT reported as missing, because ` +
        `the recording shows Composio marks it optional; recipient_email=42 -> ` +
        `${wrongType?.ok === false ? "refused" : "SENT"}; tools.execute called ` +
        `${fake.executed.length} time(s) (must be 0)`,
    );
  }

  /* ═══ TOOLS-25 no schema is a refusal, and the run says why ═══
         THE FAIL-CLOSED DIRECTION, and the one an "if we could not fetch it,
         send it anyway" shortcut would get backwards. A catalog that cannot be
         read means the arguments cannot be checked, and an unchecked send is the
         passthrough this whole change removes — it can even SUCCEED, with the
         fields the tool did not recognise quietly missing.

         Driven through the executor rather than the provider alone, because the
         second half of the promise is that the run RECORD says so: the reason
         step notes that its prompt went out without a schema, and the act step
         fails with the fetch's own error rather than with a shape error from
         Composio that nobody can trace back. */
  {
    resetToolSchemaCache();
    const fake = new FakeComposio({
      accounts: [account("gmail", "ACTIVE", "ca_gmail_nocat")],
      catalog: { GMAIL_SEND_EMAIL: "Composio API unreachable: ETIMEDOUT" },
    });
    const driven = await driveOneSend(fake, {
      recipient_email: "adeline.wong@example.sg",
      subject: "Invoice INV-2041",
    });
    const notice = driven.run.context[TOOL_SCHEMA_NOTICE_KEY];
    const noticeText = JSON.stringify(notice ?? null);
    const failure = driven.run.failure ?? "";

    add(
      "TOOLS-25 a tool whose schema cannot be fetched refuses, and the run record says so",
      driven.run.status === "failed" &&
        failure.includes("input schema could not be read") &&
        failure.includes("ETIMEDOUT") &&
        failure.includes("GMAIL_SEND_EMAIL") &&
        // Never the old behaviour: the arguments were perfectly plausible and
        // still nothing was sent.
        fake.executed.length === 0 &&
        noticeText.includes("gmail.messages.send") &&
        noticeText.includes("ETIMEDOUT") &&
        // The prompt still went out — a catalog outage degrades the guidance, it
        // does not stop the reasoning step and turn one bad fetch into a
        // less-informative failure.
        driven.reasoner.prompts.length >= 1,
      `run=${driven.run.status}; failure="${failure.slice(0, 110)}..."; ` +
        `tools.execute called ${fake.executed.length} time(s) (must be 0 — an unchecked ` +
        `send can succeed and deliver nothing); run record notice=${noticeText.slice(0, 120)}; ` +
        `reason steps still prompted: ${driven.reasoner.prompts.length}`,
    );
  }

  /* ═════════ Where a FETCH step's arguments come from ═════════
         TOOLS-21..25 are about the arguments a `reason` step produces for the
         `act` step after it. These five are about the steps that have no such
         predecessor. `runFetch` built its arguments from the same slot the
         reason step writes, so a workflow whose FIRST step is a fetch sent `{}`
         — and `{}` is not an error: GMAIL_LIST_THREADS publishes `required: []`,
         so the call SUCCEEDS and returns the whole mailbox. That is the failure
         these exist for, and it is worse than a refusal, because the run record
         reports it as ok.

         Each of the five is a different answer to "where did these arguments
         come from?", and between them they say the thing that matters: a fetch
         either carries arguments somebody chose, or it does not run. */

  /* ═══ TOOLS-26 a fetch that declares no arguments is refused, not sent ═══
         The regression check for the defect itself. Note what is NOT asserted:
         nothing here is missing and no name is unknown, so the provider's own
         shape gate has no complaint — `checkArgumentsAgainstSchema({}, schema)`
         returns ok. The refusal has to come from the executor knowing that an
         empty argument list against a tool that accepts arguments is a read
         nobody scoped. */
  {
    resetToolSchemaCache();
    const fake = new FakeComposio({ accounts: [account("gmail", "ACTIVE", "ca_gmail_sweep")] });
    const driven = await driveSweep(fake, [
      readThreads(),
      { id: "sweep-2", kind: "reason", instruction: "Summarise what arrived." },
    ]);
    const failure = driven.run.failure ?? "";

    add(
      "TOOLS-26 a fetch step with no argument source is refused rather than sent unfiltered",
      driven.run.status === "refused" &&
        fake.executed.length === 0 &&
        failure.includes("sweep-1") &&
        failure.includes("GMAIL_LIST_THREADS") &&
        failure.includes("unfiltered") &&
        // The refusal has to say what the right answer would have looked like,
        // or it is a dead end for whoever has to fix the plan.
        failure.includes("argumentSource") &&
        failure.includes("query") &&
        // The run stopped AT the fetch: the reason step after it never ran.
        driven.reasoner.prompts.length === 0,
      `run=${driven.run.status}; tools.execute called ${fake.executed.length} time(s) (must be 0 — ` +
        `GMAIL_LIST_THREADS requires nothing, so this call would have SUCCEEDED and returned the ` +
        `whole mailbox); failure names the step=${failure.includes("sweep-1")} the slug=` +
        `${failure.includes("GMAIL_LIST_THREADS")} the fix=${failure.includes("argumentSource")} ` +
        `and what the tool accepts=${failure.includes("query")}; later steps run: ` +
        `${driven.reasoner.prompts.length} (must be 0)`,
    );
  }

  /* ═══ TOOLS-27 a literal argument source is what reaches Composio ═══
         The check that stops the other four passing for nothing: a gate that
         refused every fetch would satisfy TOOLS-26 and TOOLS-29 and never read
         an inbox again. Nothing is renamed, added or dropped — what the plan
         states is what the tool is asked. */
  {
    resetToolSchemaCache();
    const fake = new FakeComposio({
      accounts: [account("gmail", "ACTIVE", "ca_gmail_literal")],
      result: { successful: true, error: null, data: { threads: [] } },
    });
    const values: Record<string, unknown> = {
      query: "label:appointments newer_than:1d",
      max_results: 25,
    };
    const driven = await driveSweep(fake, [
      readThreads({ kind: "literal", values }),
    ]);
    const call = fake.executed[0];

    add(
      "TOOLS-27 a fetch step's literal arguments reach Composio exactly as the plan states them",
      driven.run.status === "completed" &&
        fake.executed.length === 1 &&
        call?.slug === "GMAIL_LIST_THREADS" &&
        JSON.stringify(call?.body.arguments) === JSON.stringify(values),
      `run=${driven.run.status}; ${fake.executed.length} execute(s), slug=${call?.slug}; ` +
        `delivered=${JSON.stringify(call?.body.arguments)} (plan stated ${JSON.stringify(values)})`,
    );
  }

  /* ═══ TOOLS-28 an unfiltered read is possible, but never accidental ═══
         The escape hatch has to exist — some reads really are "everything" — and
         it has to cost a sentence somebody wrote. Both halves are asserted: the
         justified call goes out AND is written onto the run record, and a blank
         justification is refused, because an empty string is not a decision. */
  {
    resetToolSchemaCache();
    const justification =
      "The clinic inbox is swept clean each morning, so every thread in it is unread work.";
    const fake = new FakeComposio({
      accounts: [account("gmail", "ACTIVE", "ca_gmail_none")],
      result: { successful: true, error: null, data: { threads: [] } },
    });
    const declared = await driveSweep(fake, [
      readThreads({ kind: "none", justification }),
    ]);
    const recorded = JSON.stringify(declared.run.context[UNFILTERED_FETCH_KEY] ?? null);

    resetToolSchemaCache();
    const blankFake = new FakeComposio({
      accounts: [account("gmail", "ACTIVE", "ca_gmail_blank")],
    });
    const blank = await driveSweep(blankFake, [
      readThreads({ kind: "none", justification: "   " }),
    ]);

    add(
      "TOOLS-28 a deliberately unfiltered fetch runs and is recorded; an unjustified one is refused",
      declared.run.status === "completed" &&
        fake.executed.length === 1 &&
        JSON.stringify(fake.executed[0]?.body.arguments) === "{}" &&
        recorded.includes("sweep-1") &&
        recorded.includes(justification) &&
        // What was declined is on the record too, not just that something was.
        recorded.includes("query") &&
        blank.run.status === "refused" &&
        blankFake.executed.length === 0 &&
        (blank.run.failure ?? "").includes("justification"),
      `justified: run=${declared.run.status}, args=` +
        `${JSON.stringify(fake.executed[0]?.body.arguments)}, run record=` +
        `${recorded.slice(0, 140)}; blank justification: run=${blank.run.status}, ` +
        `tools.execute called ${blankFake.executed.length} time(s) (must be 0)`,
    );
  }

  /* ═══ TOOLS-29 stated arguments in the wrong vocabulary refuse at the step ═══
         The same disagreement TOOLS-24 catches on the way out of an act step,
         one layer earlier. It matters that it is earlier: a shape problem is
         deterministic, so `FailurePolicy.retries` would spend the whole budget
         re-sending an argument list that cannot become right, and the run would
         end "failed" with a transport-shaped error instead of "refused" with a
         plan-shaped one. */
  {
    resetToolSchemaCache();
    const fake = new FakeComposio({ accounts: [account("gmail", "ACTIVE", "ca_gmail_wrong")] });
    const driven = await driveSweep(fake, [
      readThreads({ kind: "literal", values: { search: "label:appointments", limit: 25 } }),
    ]);
    const failure = driven.run.failure ?? "";

    add(
      "TOOLS-29 a fetch whose stated arguments the tool does not publish is refused before anything is sent",
      driven.run.status === "refused" &&
        fake.executed.length === 0 &&
        failure.includes("sweep-1") &&
        failure.includes('"search"') &&
        failure.includes("dropped") &&
        failure.includes("GMAIL_LIST_THREADS"),
      `run=${driven.run.status}; tools.execute called ${fake.executed.length} time(s) (must be 0); ` +
        `failure names the step=${failure.includes("sweep-1")} the argument Composio would have ` +
        `dropped=${failure.includes('"search"')} and the slug=` +
        `${failure.includes("GMAIL_LIST_THREADS")}`,
    );
  }

  /* ═══ TOOLS-30 the reasoning arm works for a fetch, schema and all ═══
         The arm a run-relative window needs — "the next ten working days" cannot
         be a literal — so it has to be more than a name in a union. Three things
         at once: the reason step BEFORE a fetch is given that fetch's schema (the
         forward scan in executor.ts always claimed to cover fetch consumers and
         nothing drove it), its answer becomes the fetch's arguments, and the
         model is told when the run is happening, without which every ISO-8601
         bound in a tool schema is unanswerable. */
  {
    resetToolSchemaCache();
    const fake = new FakeComposio({
      accounts: [account("gmail", "ACTIVE", "ca_gmail_reasoned")],
      result: { successful: true, error: null, data: { threads: [] } },
    });
    const driven = await driveSweep(fake, [
      { id: "sweep-0", kind: "reason", instruction: "Work out which threads to read." },
      readThreads({ kind: "reasoning" }),
    ]);
    const prompt = driven.reasoner.prompts[0]?.workflowPrompt ?? "";
    const contextSeen = JSON.stringify(driven.reasoner.contexts[0] ?? null);
    const delivered = JSON.stringify(fake.executed[0]?.body.arguments);

    add(
      "TOOLS-30 a reason step before a fetch is given that fetch's schema, and its answer is what the fetch sends",
      driven.run.status === "completed" &&
        prompt.includes("GMAIL_LIST_THREADS") &&
        prompt.includes("max_results") &&
        fake.executed.length === 1 &&
        delivered === JSON.stringify({ query: "label:appointments newer_than:1d", max_results: 25 }) &&
        // The run's own facts reach the model: a schema asking for a timestamp
        // is unanswerable by something that does not know the date, and it will
        // answer anyway.
        contextSeen.includes("2026-07-24T08:00:00+08:00"),
      `run=${driven.run.status}; the reason step's prompt names GMAIL_LIST_THREADS=` +
        `${prompt.includes("GMAIL_LIST_THREADS")} max_results=${prompt.includes("max_results")}; ` +
        `the fetch sent ${delivered}; the model was told when it is running=` +
        `${contextSeen.includes("2026-07-24T08:00:00+08:00")}`,
    );
  }

  /* ═════════ The parser, against the catalog rather than against us ═════════
         Everything above proves the parser behaves correctly ON SCHEMAS THIS
         REPOSITORY SUPPLIED. Until ../tools/catalog-recording.ts existed, every
         one of those schemas was a literal somebody wrote to match what they
         believed Composio returns — so a green suite meant the parser agreed with
         its author, and whether the author agreed with Composio was a question
         nothing could ask. It turned out they did not: see the recording's header
         for the four differences the capture found, two of which had been asserted
         as facts in this very file.

         These five ask the other question. Each reads the recording DIRECTLY —
         never through the parser — and compares. */

  /* ═══ TOOLS-31 the recording covers every mapped capability, and only those ═══
         THE CHECK THAT KEEPS THE OTHER FOUR HONEST AS THE MAP GROWS. A mapping
         added to capabilities.ts with no recorded schema would otherwise ship
         quietly: the four below iterate the recording, so a slug missing from it
         is a slug nothing asks about, and "we have no evidence" would look
         identical to "we checked". Drift the other way is caught too — a
         recording for a slug nothing maps is either a mapping that was removed
         without re-recording, or a capture of the wrong tool. */
  {
    const mapped = mappedCapabilities();
    const wanted = new Map<string, string>();
    for (const capability of mapped) {
      const route = resolveCapability(capability);
      if (route.kind === "tool") wanted.set(route.toolSlug, capability);
    }

    const missing = [...wanted.entries()]
      .filter(([slug]) => recordedTool(slug) === null)
      .map(([slug, capability]) => `${capability} -> ${slug}`);
    const stale = recordedToolSlugs().filter((slug) => !wanted.has(slug));
    // Provenance is part of the coverage: a recording that does not say where it
    // came from cannot be re-taken, and one taken from the wrong endpoint is the
    // mistake this file is being repaired for, wearing a URL.
    const provenance =
      COMPOSIO_CATALOG_ENDPOINT.includes("/api/v3.1/tools/") &&
      COMPOSIO_CATALOG_RECORDED_AT.length > 0 &&
      COMPOSIO_CATALOG_RECORDING.every((entry) => entry.status > 0);

    add(
      "TOOLS-31 every capability with a Composio tool has that tool's real schema recorded",
      mapped.length > 0 &&
        wanted.size === mapped.length &&
        missing.length === 0 &&
        stale.length === 0 &&
        provenance,
      `${mapped.length} mapped capabilities -> ${wanted.size} distinct slugs; ` +
        `${missing.length} with no recording${missing.length === 0 ? "" : ` (${missing.join(", ")})`}; ` +
        `${stale.length} recorded slugs nothing maps${stale.length === 0 ? "" : ` (${stale.join(", ")})`}; ` +
        `recorded ${COMPOSIO_CATALOG_RECORDED_AT} from ${COMPOSIO_CATALOG_ENDPOINT}; ` +
        `${recordedToolSlugsWithSchema().length} of ${recordedToolSlugs().length} answered with a schema`,
    );
  }

  /* ═══ TOOLS-32 the parser reads the recording as Composio wrote it ═══
         Name for name, required for required. This is the check that would have
         caught the hand-written fake: it compares `parseToolInputSchema`'s answer
         against a SECOND, independent reading of the same bytes, so a parser that
         invented a required list, dropped a property or mis-defaulted
         `additionalProperties` has nowhere to hide. */
  {
    const problems: string[] = [];
    let parsed = 0;
    let closedByDefault = 0;
    let closedExplicitly = 0;

    for (const slug of recordedToolSlugsWithSchema()) {
      const entry = recordedTool(slug);
      const schema = parseToolInputSchema(entry === null ? null : entry.inputParameters);
      if (schema === null) {
        problems.push(`${slug}: the parser refused a schema Composio published`);
        continue;
      }
      parsed += 1;

      const parsedNames = [...schema.properties.keys()].sort().join(",");
      const realNames = recordedPropertyNames(slug).join(",");
      if (parsedNames !== realNames) {
        problems.push(`${slug}: names differ (parser [${parsedNames}] vs catalog [${realNames}])`);
      }

      const parsedRequired = [...schema.required].sort().join(",");
      const realRequired = recordedRequired(slug).join(",");
      if (parsedRequired !== realRequired) {
        problems.push(
          `${slug}: required differs (parser [${parsedRequired}] vs catalog [${realRequired}])`,
        );
      }

      // `additionalProperties` absent must read as CLOSED — JSON Schema's own
      // default is the opposite, and Composio drops an unlisted field rather than
      // rejecting it, so the permissive reading would mean "silently discarded".
      const declared = recordedInput(slug)?.["additionalProperties"];
      if (declared === undefined) closedByDefault += 1;
      else if (declared === false) closedExplicitly += 1;
      if (schema.additionalPropertiesAllowed !== (declared === true)) {
        problems.push(
          `${slug}: additionalProperties read as ` +
            `${schema.additionalPropertiesAllowed} for a catalog value of ${JSON.stringify(declared)}`,
        );
      }
    }

    add(
      "TOOLS-32 the parser's reading of every recorded schema matches what Composio actually published",
      parsed === recordedToolSlugsWithSchema().length && parsed > 0 && problems.length === 0,
      `${parsed} recorded schemas parsed; ${problems.length} disagreements` +
        (problems.length === 0 ? "" : `: ${problems.join("; ")}`) +
        `; unlisted names refused for ${closedByDefault} tool(s) that say nothing about ` +
        `additionalProperties and ${closedExplicitly} that say false — none published true, ` +
        `so the closed default is what is actually protecting every one of them`,
    );
  }

  /* ═══ TOOLS-33 the gate and the prompt speak each tool's own vocabulary ═══
         For every recorded tool, not just the one this file was written around:
         an argument record drawn from the tool's OWN schema is accepted, a name
         it does not publish is refused, and the prompt block lists every argument
         it does publish. The last clause is where the no-required notice is
         proved — half these tools mark nothing required, and a block that listed
         ten arguments as "optional" with no further comment was telling a model,
         accurately and uselessly, that an empty object would do. */
  {
    const problems: string[] = [];
    let accepted = 0;
    let refusedUnknown = 0;
    let noticed = 0;
    const silentTools: string[] = [];

    for (const slug of recordedToolSlugsWithSchema()) {
      const entry = recordedTool(slug);
      const schema = parseToolInputSchema(entry === null ? null : entry.inputParameters);
      if (schema === null) {
        problems.push(`${slug}: unparseable`);
        continue;
      }

      const own = argumentsFromSchema(schema);
      const ownVerdict = checkArgumentsAgainstSchema(own, schema);
      if (ownVerdict.ok) accepted += 1;
      else problems.push(`${slug}: its own arguments were refused — ${ownVerdict.problems[0]}`);

      const strange = checkArgumentsAgainstSchema(
        { ...own, [NAME_NO_TOOL_PUBLISHES]: "x" },
        schema,
      );
      if (!strange.ok) refusedUnknown += 1;
      else problems.push(`${slug}: accepted "${NAME_NO_TOOL_PUBLISHES}", which it does not publish`);

      const prompt = renderSchemaForPrompt({
        capability: "probe.capability",
        toolSlug: slug,
        schema,
        toolDescription: entry === null ? null : entry.description,
      });
      const unnamed = recordedPropertyNames(slug).filter((name) => !prompt.includes(name));
      if (unnamed.length > 0) {
        problems.push(`${slug}: the prompt omits ${unnamed.length} published argument(s)`);
      }

      // The notice belongs exactly where the catalog marks nothing required, and
      // nowhere else: on a tool WITH required arguments it would be false.
      const expectNotice = schema.required.length === 0;
      const hasNotice = prompt.includes("marks NONE of these arguments as required");
      if (expectNotice) silentTools.push(slug);
      if (expectNotice !== hasNotice) {
        problems.push(
          `${slug}: no-required notice ${hasNotice ? "present" : "absent"} for a tool with ` +
            `${schema.required.length} required argument(s)`,
        );
      }
      if (expectNotice && hasNotice) noticed += 1;
    }

    add(
      "TOOLS-33 every recorded tool accepts its own vocabulary, refuses a name it does not publish, and is described honestly",
      accepted === recordedToolSlugsWithSchema().length &&
        refusedUnknown === accepted &&
        accepted > 0 &&
        problems.length === 0,
      `${accepted} tools accepted arguments built from their own schema and ${refusedUnknown} ` +
        `refused "${NAME_NO_TOOL_PUBLISHES}"; ${noticed} of ${silentTools.length} tools that mark ` +
        `nothing required say so in the prompt (${silentTools.join(", ")}); ` +
        `${problems.length} problems${problems.length === 0 ? "" : `: ${problems.join("; ")}`}`,
    );
  }

  /* ═══ TOOLS-34 a slug the catalog will not serve refuses, and sends nothing ═══
         THE FINDING THE RECORDING MADE VISIBLE, and it is a live one:
         HUBSPOT_FETCH_CONTACT_DETAILS_BY_ID and HUBSPOT_READ_A_PAGE_OF_DEALS
         answer 404 on the endpoint the SDK reads — they survive only on the
         legacy v3 route capabilities.ts was written against. So
         `hubspot.contacts.read` and `hubspot.deals.read` cannot be schema-checked
         at all, and every call through them refuses. A fake catalog could never
         have shown this: it answers for whatever it is asked about.

         Both arms, over the whole map, so the check keeps meaning something after
         the day HubSpot is fixed: a capability whose schema WAS recorded must
         execute, and one whose recording is a failure must refuse without
         reaching `tools.execute`. */
  {
    resetToolSchemaCache();
    const toolkits = new Set<string>();
    for (const capability of mappedCapabilities()) {
      const route = resolveCapability(capability);
      if (route.kind === "tool") toolkits.add(route.toolkitSlug);
    }
    const fake = new FakeComposio({
      accounts: [...toolkits].sort().map((slug) => account(slug, "ACTIVE", `ca_${slug}`)),
    });
    const p = provider(fake);
    await p.ready();

    const executedFor: string[] = [];
    const refusedFor: string[] = [];
    const problems: string[] = [];

    for (const capability of mappedCapabilities()) {
      const route = resolveCapability(capability);
      if (route.kind !== "tool") {
        problems.push(`${capability}: did not resolve to a tool`);
        continue;
      }
      const entry = recordedTool(route.toolSlug);
      const schema =
        entry === null || entry.inputParameters === null
          ? null
          : parseToolInputSchema(entry.inputParameters);

      const result = await p.getToolClient(route.integrationId)?.call({
        integrationId: route.integrationId,
        operation: capability,
        args: schema === null ? {} : argumentsFromSchema(schema),
        metrics: {},
      });

      if (schema !== null) {
        if (result?.ok === true) executedFor.push(capability);
        else problems.push(`${capability}: refused despite a recorded schema — ${result?.ok === false ? (result.error ?? "").slice(0, 70) : "no client"}`);
        continue;
      }

      const error = result?.ok === false ? result.error ?? "" : "";
      if (
        result?.ok === false &&
        error.includes("input schema could not be read") &&
        error.includes(route.toolSlug) &&
        error.includes("not found")
      ) {
        refusedFor.push(capability);
      } else {
        problems.push(
          `${capability}: expected a schema-unreadable refusal, got ` +
            `${result?.ok === true ? "AN EXECUTED CALL" : `"${error.slice(0, 70)}"`}`,
        );
      }
    }

    add(
      "TOOLS-34 every mapped capability either executes with arguments from its own recorded schema, or refuses because Composio has no schema for it",
      problems.length === 0 &&
        executedFor.length + refusedFor.length === mappedCapabilities().length &&
        fake.executed.length === executedFor.length,
      `${executedFor.length} capabilities executed with arguments taken from their own recorded ` +
        `schema; ${refusedFor.length} refused because the catalog does not serve their slug` +
        (refusedFor.length === 0 ? "" : ` (${refusedFor.join(", ")})`) +
        `; tools.execute reached ${fake.executed.length} time(s), which must equal the ` +
        `${executedFor.length} that had a schema — a refused capability must send nothing; ` +
        `${problems.length} problems${problems.length === 0 ? "" : `: ${problems.join("; ")}`}`,
    );
  }

  /* ═══ TOOLS-35 a union type is a constraint, not a shrug ═══
         GMAIL_SEND_EMAIL and GMAIL_CREATE_EMAIL_DRAFT publish `attachment` with no
         `type` at all — only `anyOf: [{ type: "object" }, { type: "array" }]`.
         `readTypes` used to answer `[]` for that, `[]` means "constrained
         nothing", and so the gate accepted `attachment: "invoice-2041.pdf"` — a
         string, and the likeliest thing a model asked to attach a file produces —
         and sent it on a live send. No hand-written fixture had ever shown the
         parser an `anyOf`, so nothing could have found this.

         The second half is the direction that must NOT change: a union this build
         cannot read stays unconstrained and passes, because refusing a value the
         tool accepts is worse than passing one it does not. That case has no
         example in the real catalog, so it is constructed here — clearly, in the
         check, rather than by editing the recording. */
  {
    const constrained: string[] = [];
    const problems: string[] = [];

    for (const slug of recordedToolSlugsWithSchema()) {
      const properties = recordedProperties(slug);
      if (properties === null) continue;
      const schema = parseToolInputSchema(recordedInput(slug));
      if (schema === null) continue;

      for (const [name, raw] of Object.entries(properties)) {
        if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
        const property = raw as Record<string, unknown>;
        if (property["type"] !== undefined || !Array.isArray(property["anyOf"])) continue;

        const parsedProperty = schema.properties.get(name);
        if (parsedProperty === undefined || parsedProperty.types.length === 0) {
          problems.push(`${slug}.${name}: an anyOf union still reads as unconstrained`);
          continue;
        }
        constrained.push(`${slug}.${name} (${parsedProperty.types.join(" or ")})`);

        // A string is only a fair probe when the union does not allow one.
        if (parsedProperty.types.includes("string")) continue;
        const verdict = checkArgumentsAgainstSchema({ [name]: "invoice-2041.pdf" }, schema);
        if (verdict.ok) {
          problems.push(`${slug}.${name}: accepted a string the union does not allow`);
        }
      }
    }

    // CONSTRUCTED, not recorded: one branch with no `type` makes the union
    // unreadable, and an unreadable union must not become a refusal.
    const unreadable = parseToolInputSchema({
      type: "object",
      properties: {
        payload: { anyOf: [{ type: "object" }, { description: "no type on this branch" }] },
      },
    });
    const unreadablePasses =
      unreadable !== null &&
      (unreadable.properties.get("payload")?.types.length ?? -1) === 0 &&
      checkArgumentsAgainstSchema({ payload: "anything at all" }, unreadable).ok;

    add(
      "TOOLS-35 a property whose only type information is an anyOf is enforced on that union, and an unreadable one still passes",
      constrained.length > 0 && problems.length === 0 && unreadablePasses,
      `${constrained.length} recorded properties declare no "type" and only an anyOf: ` +
        `${constrained.join(", ")} — each now refuses a value outside its union, where the ` +
        `parser previously called it "any" and sent it; ` +
        `a union with a branch that names no type stays unconstrained=${unreadablePasses}; ` +
        `${problems.length} problems${problems.length === 0 ? "" : `: ${problems.join("; ")}`}`,
    );
  }

  // Left as it was found: `npm run verify` runs every target in one process, and
  // a schema this target cached from a fake SDK must not be what some later
  // target reads.
  resetToolSchemaCache();

  return checks;
}

export function formatResults(results: Check[]): string {
  const lines = results.map(
    (r) => `${r.pass ? "PASS" : "FAIL"}  ${r.name}\n        ${r.detail}`,
  );
  const failed = results.filter((r) => !r.pass).length;
  lines.push("");
  lines.push(
    failed === 0
      ? `TOOLS OK — ${results.length}/${results.length} checks passed.`
      : `TOOLS BROKEN — ${failed} of ${results.length} checks failed.`,
  );
  return lines.join("\n");
}
