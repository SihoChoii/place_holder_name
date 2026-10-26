import { ModelError, postJson } from "./http.js";

export interface NoulQuestion { type: "noul"; instructions: string; criteria?: { true?: string; false?: string } }

/**
 * Clef Flash via the System One endpoint (POST /v1/systemone; Ollama or Unsloth, Bearer key when set). Returns, per question name, the
 * probability that the answer is "true". Missing/extra/non-finite answers are invalid output (retryable).
 */
export class ClefClient {
  constructor(readonly baseUrl: string, readonly model: string, readonly timeoutMs: number, private readonly apiKey?: string) {}

  async decide(state: string | object, questions: Record<string, NoulQuestion>, opts: { images?: string[]; signal?: AbortSignal } = {}) {
    const res = await postJson(`${this.baseUrl}/v1/systemone`, {
      model: this.model, state, questions, ...(opts.images?.length ? { images: opts.images } : {}), keep_alive: -1,
    }, { timeoutMs: this.timeoutMs, signal: opts.signal, apiKey: this.apiKey });
    let body: { answers?: Record<string, { type?: string; noul?: unknown }> };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      throw new ModelError("invalid_output", "moderation response was not JSON");
    }
    const out: Record<string, number> = {};
    for (const name of Object.keys(questions)) {
      const a = body.answers?.[name];
      const p = a?.noul;
      if (!a || a.type !== "noul" || typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1) {
        throw new ModelError("invalid_output", `moderation answer "${name}" missing or invalid`);
      }
      out[name] = p;
    }
    return out;
  }
}
