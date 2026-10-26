/** Errors from model hosts. All are retryable from the moderation loop's point of view. */
export class ModelError extends Error {
  constructor(readonly kind: "unreachable" | "timeout" | "http" | "invalid_output" | "aborted", message: string) {
    super(message);
  }
}

/** POST JSON with a deadline; maps network/timeouts/HTTP errors to ModelError. */
export type ApiStyle = "ollama" | "openai";

/** Request headers; the Bearer key is sent only when configured and never logged or echoed. */
const headers = (apiKey?: string, json = false): Record<string, string> => ({
  ...(json ? { "content-type": "application/json" } : {}),
  ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
});

export async function postJson(url: string, body: unknown, opts: { timeoutMs: number; signal?: AbortSignal; apiKey?: string }): Promise<Response> {
  const signals = [AbortSignal.timeout(opts.timeoutMs), ...(opts.signal ? [opts.signal] : [])];
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: headers(opts.apiKey, true),
      body: JSON.stringify(body),
      signal: AbortSignal.any(signals),
    });
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 200);
      throw new ModelError("http", `HTTP ${res.status} ${text}`);
    }
    return res;
  } catch (e) {
    throw toModelError(e, opts.signal);
  }
}

/**
 * A deadline (our own timeout or a caller deadline signal) is "timeout"; any other abort of the caller's
 * signal (client disconnect, shutdown) is "aborted" so it can be dropped quietly.
 */
export function toModelError(e: unknown, signal?: AbortSignal): ModelError {
  if (e instanceof ModelError) return e;
  const name = (e as Error)?.name;
  if (signal?.aborted && (signal.reason as Error | undefined)?.name !== "TimeoutError") return new ModelError("aborted", "request cancelled");
  if (name === "TimeoutError" || name === "AbortError" || signal?.aborted) return new ModelError("timeout", "model request timed out");
  return new ModelError("unreachable", `model host unreachable (${(e as Error)?.message ?? e})`);
}

export async function getJson<T>(url: string, timeoutMs: number, apiKey?: string): Promise<T> {
  try {
    const res = await fetch(url, { headers: headers(apiKey), signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new ModelError("http", `HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (e) {
    throw toModelError(e);
  }
}

export interface OllamaTag { name: string; model: string; digest: string; size: number }
export const listModels = (baseUrl: string, timeoutMs = 3000) =>
  getJson<{ models: OllamaTag[] }>(`${baseUrl}/api/tags`, timeoutMs).then((r) => r.models ?? []);
export const ollamaVersion = (baseUrl: string, timeoutMs = 3000) =>
  getJson<{ version: string }>(`${baseUrl}/api/version`, timeoutMs).then((r) => r.version);

/** OpenAI-compatible model list (Unsloth adds a `loaded` flag; other servers may omit it). */
export interface OpenAIModel { id: string; loaded?: boolean; digest?: string }
export const listOpenAIModels = (baseUrl: string, apiKey?: string, timeoutMs = 3000) =>
  getJson<{ data?: OpenAIModel[] }>(`${baseUrl}/v1/models`, timeoutMs, apiKey).then((r) => r.data ?? []);

/** Model identity used by the readiness drift check and `models:check --write-lock`. */
export interface ModelIdentity { api_style?: ApiStyle; ollama_version?: string; model: string; digest?: string; size_bytes?: number }

/** Current identity of `model` on a host, or a ModelError("http") when it is missing or not loaded. */
export async function modelIdentity(style: ApiStyle, baseUrl: string, model: string, apiKey?: string): Promise<ModelIdentity> {
  if (style === "openai") {
    const m = (await listOpenAIModels(baseUrl, apiKey)).find((x) => x.id === model);
    if (!m) throw new ModelError("http", `model ${model} not listed by ${baseUrl}/v1/models`);
    if (m.loaded === false) throw new ModelError("http", `model ${model} is not loaded`);
    return { api_style: "openai", model, ...(typeof m.digest === "string" ? { digest: m.digest } : {}) };
  }
  const [version, tags] = await Promise.all([ollamaVersion(baseUrl), listModels(baseUrl)]);
  const tag = tags.find((m) => m.name === model || m.model === model);
  if (!tag) throw new ModelError("http", `model ${model} not pulled (ollama pull ${model})`);
  return { ollama_version: version, model, digest: tag.digest, size_bytes: tag.size };
}

/** Same model? Ollama compares version + digest; OpenAI-style compares the id (and digest only if both have one). */
export function sameIdentity(style: ApiStyle, expected: ModelIdentity | undefined, actual: ModelIdentity): boolean {
  if (!expected?.model || expected.model !== actual.model) return false;
  if (style === "openai") return expected.api_style === "openai" && (!expected.digest || !actual.digest || expected.digest === actual.digest);
  return !!expected.ollama_version && expected.ollama_version === actual.ollama_version && !!expected.digest && expected.digest === actual.digest;
}
