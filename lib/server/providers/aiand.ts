/**
 * AI& adapter — reasoning and structured output (blueprint §20.2).
 *
 * AI& exposes an OpenAI-compatible chat-completions endpoint with strict
 * JSON-schema structured outputs. This adapter is the only place that knows
 * the wire format; everything else consumes typed results.
 *
 * Live when AIAND_API_KEY + AIAND_BASE_URL + AIAND_MODEL are set.
 */
import { aiandLive, providerEnv } from "./env";

export interface AiandResult<T> {
  mode: "live" | "fixture";
  data: T;
  error?: string;
}

/**
 * Ask AI& for a schema-constrained JSON object. `fixture` is returned (and
 * labeled) when the provider is unconfigured or the call fails — the caller
 * always gets usable data plus an honest mode flag.
 */
export async function aiandJson<T>(opts: {
  operation: string;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  fixture: T;
  responseFormat?: "json_schema" | "json_object";
  reasoningEffort?: "none" | "low" | "medium" | "high";
  timeoutMs?: number;
}): Promise<AiandResult<T>> {
  if (!aiandLive()) return { mode: "fixture", data: opts.fixture };

  const env = providerEnv().aiand;
  try {
    const res = await fetch(`${env.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.key}`,
      },
      body: JSON.stringify({
        model: env.model,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        response_format: opts.responseFormat === "json_object"
          ? { type: "json_object" }
          : { type: "json_schema", json_schema: { name: opts.schemaName, strict: true, schema: opts.schema } },
        ...(opts.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}),
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
    });
    if (!res.ok) throw new Error(`AI& ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI& returned an empty completion");
    return { mode: "live", data: JSON.parse(content) as T };
  } catch (err) {
    // Live call failed → fall back, but report the failure honestly.
    return { mode: "fixture", data: opts.fixture, error: String(err) };
  }
}
