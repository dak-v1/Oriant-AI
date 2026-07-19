/**
 * Doubleword adapter — asynchronous artifact generation (blueprint §20.4).
 *
 * Doubleword provides OpenAI-compatible inference with separate real-time,
 * async and batch tiers. The Agent Factory submits one job per agent build
 * and polls for completion; jobs survive page reloads because the job id is
 * stored server-side in the BuildJob record.
 *
 * Live when DOUBLEWORD_API_KEY + DOUBLEWORD_BASE_URL + DOUBLEWORD_MODEL are
 * set. Endpoint paths follow Doubleword's OpenAI-compatible convention; if
 * your org console shows different paths, adjust ASYNC_SUBMIT / ASYNC_POLL.
 */
import { doublewordLive, providerEnv } from "./env";

const ASYNC_SUBMIT = "/v1/chat/completions"; // async tier uses the same shape…
const ASYNC_POLL = "/v1/requests";           // …and returns/polls a request id

export interface DwSubmit {
  mode: "live" | "fixture";
  jobId?: string;
  error?: string;
}

export interface DwPoll {
  status: "running" | "completed" | "failed";
  content?: string;
  error?: string;
}

function headers() {
  const env = providerEnv().doubleword;
  return { "Content-Type": "application/json", Authorization: `Bearer ${env.key}` };
}

/** Submit one generation job. Returns a provider job id to poll. */
export async function submitGeneration(prompt: { system: string; user: string }): Promise<DwSubmit> {
  if (!doublewordLive()) return { mode: "fixture" };
  const env = providerEnv().doubleword;
  try {
    const res = await fetch(`${env.baseUrl}${ASYNC_SUBMIT}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        model: env.model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        response_format: { type: "json_object" },
        // async service tier — background job, poll for the result
        service_tier: "async",
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Doubleword ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as {
      id?: string;
      request_id?: string;
      choices?: { message?: { content?: string } }[];
    };
    // Some deployments answer synchronously even on the async tier — accept both.
    const jobId = body.request_id ?? body.id;
    if (body.choices?.[0]?.message?.content) {
      // finished inline: cache under a UNIQUE synthetic id so concurrent
      // submissions never overwrite each other's results
      const key = jobId ?? `inline_${Date.now()}_${inlineSeq++}`;
      inlineResults.set(key, body.choices[0].message!.content!);
      return { mode: "live", jobId: key };
    }
    if (!jobId) throw new Error("Doubleword returned no job id");
    return { mode: "live", jobId };
  } catch (err) {
    return { mode: "fixture", error: String(err) };
  }
}

const inlineResults = new Map<string, string>();
let inlineSeq = 0;

export async function pollGeneration(jobId: string): Promise<DwPoll> {
  const inline = inlineResults.get(jobId);
  if (inline) return { status: "completed", content: inline };
  const env = providerEnv().doubleword;
  try {
    const res = await fetch(`${env.baseUrl}${ASYNC_POLL}/${jobId}`, {
      headers: headers(),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Doubleword poll ${res.status}`);
    const body = (await res.json()) as {
      status?: string;
      choices?: { message?: { content?: string } }[];
      response?: { choices?: { message?: { content?: string } }[] };
    };
    const content =
      body.choices?.[0]?.message?.content ??
      body.response?.choices?.[0]?.message?.content;
    if (content) return { status: "completed", content };
    if (body.status === "failed") return { status: "failed", error: "provider reported failure" };
    return { status: "running" };
  } catch (err) {
    return { status: "failed", error: String(err) };
  }
}
