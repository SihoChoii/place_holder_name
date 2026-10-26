import { ModelError, postJson, toModelError } from "./http.js";

export interface OllamaToolCall { function: { name: string; arguments: Record<string, unknown> | string } }
export interface OllamaMessage { role: "system" | "user" | "assistant" | "tool"; content: string; tool_calls?: OllamaToolCall[]; tool_name?: string }
export interface ChatOptions { messages: OllamaMessage[]; tools?: unknown[]; numPredict: number; signal?: AbortSignal; timeoutMs?: number }

/** Gemma via Ollama's native /api/chat (explicit num_ctx / num_predict; think disabled when configured). */
export class GemmaClient {
  constructor(readonly baseUrl: string, readonly model: string, readonly timeoutMs: number, readonly think: boolean) {}

  private body(o: ChatOptions, stream: boolean) {
    return {
      model: this.model, messages: o.messages, stream, keep_alive: -1,
      ...(o.tools ? { tools: o.tools } : {}),
      ...(this.think ? {} : { think: false }),
      options: { num_ctx: 4096, num_predict: o.numPredict },
    };
  }

  /** Non-streaming call (planner). */
  async chat(o: ChatOptions): Promise<OllamaMessage> {
    const res = await postJson(`${this.baseUrl}/api/chat`, this.body(o, false), { timeoutMs: o.timeoutMs ?? this.timeoutMs, signal: o.signal });
    const j = (await res.json().catch(() => null)) as { message?: OllamaMessage } | null;
    if (!j?.message || typeof j.message.content !== "string") throw new ModelError("invalid_output", "guide returned no message");
    return j.message;
  }

  /** Streaming call: yields answer text chunks only (never thinking/tool payloads). */
  async *stream(o: ChatOptions): AsyncGenerator<string> {
    const res = await postJson(`${this.baseUrl}/api/chat`, this.body(o, true), { timeoutMs: o.timeoutMs ?? this.timeoutMs, signal: o.signal });
    if (!res.body) throw new ModelError("invalid_output", "guide returned no stream");
    const decoder = new TextDecoder("utf-8");
    let buf = "";
    try {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        buf += decoder.decode(chunk, { stream: true }); // keeps partial UTF-8 sequences across chunks
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = parseLine(buf.slice(0, nl));
          buf = buf.slice(nl + 1);
          if (line.text) yield line.text;
          if (line.done) return;
        }
      }
      const last = parseLine(buf + decoder.decode());
      if (last.text) yield last.text;
      if (!last.done) throw new ModelError("invalid_output", "guide stream ended without done");
    } catch (e) {
      throw toModelError(e, o.signal);
    }
  }
}

function parseLine(raw: string): { text: string; done: boolean } {
  const line = raw.trim();
  if (!line) return { text: "", done: false };
  let j: { message?: { content?: string }; done?: boolean; error?: string };
  try {
    j = JSON.parse(line);
  } catch {
    throw new ModelError("invalid_output", "guide stream sent malformed JSON");
  }
  if (j.error) throw new ModelError("http", `guide error: ${String(j.error).slice(0, 200)}`);
  return { text: typeof j.message?.content === "string" ? j.message.content : "", done: j.done === true };
}
