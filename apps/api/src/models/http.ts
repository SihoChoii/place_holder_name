/** Errors from model hosts. All are retryable from the moderation loop's point of view. */
export class ModelError extends Error {
  constructor(readonly kind: "unreachable" | "timeout" | "http" | "invalid_output" | "aborted", message: string) {
    super(message);
  }
}

/** POST JSON with a deadline; maps network/timeouts/HTTP errors to ModelError. */
export async function postJson(url: string, body: unknown, opts: { timeoutMs: number; signal?: AbortSignal }): Promise<Response> {
  const signals = [AbortSignal.timeout(opts.timeoutMs), ...(opts.signal ? [opts.signal] : [])];
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
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

export function toModelError(e: unknown, signal?: AbortSignal): ModelError {
  if (e instanceof ModelError) return e;
  const name = (e as Error)?.name;
  if (signal?.aborted) return new ModelError("aborted", "request cancelled");
  if (name === "TimeoutError" || name === "AbortError") return new ModelError("timeout", "model request timed out");
  return new ModelError("unreachable", `model host unreachable (${(e as Error)?.message ?? e})`);
}

export async function getJson<T>(url: string, timeoutMs: number): Promise<T> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
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
