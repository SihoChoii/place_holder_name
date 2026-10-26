import { ModelError, postJson, toModelError, type ApiStyle } from "./http.js";

/**
 * Internal message shape (a superset of both wire formats). Tool calls carry an `id` and tool results carry
 * both `tool_call_id` (OpenAI) and `tool_name` (Ollama), so byte budgets measured on it bound either wire form.
 */
export interface OllamaToolCall { id?: string; type?: "function"; function: { name: string; arguments: Record<string, unknown> | string } }
export interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool"; content: string;
  tool_calls?: OllamaToolCall[]; tool_name?: string; tool_call_id?: string;
}
export interface ChatOptions { messages: OllamaMessage[]; tools?: unknown[]; numPredict: number; temperature?: number; signal?: AbortSignal; timeoutMs?: number }
export interface GemmaOptions { style?: ApiStyle; apiKey?: string }

const parseArgs = (raw: unknown): Record<string, unknown> => {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string") return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {}; // malformed model output: an invalid tool call (tool error), never a crash
  }
};

/**
 * Gemma client. `ollama` (default): native /api/chat with explicit num_ctx / num_predict and think:false.
 * `openai` (Unsloth and other OpenAI-compatible servers): /v1/chat/completions with max_tokens and
 * chat_template_kwargs.enable_thinking=false. Both return the same internal message and text stream.
 */
export class GemmaClient {
  readonly style: ApiStyle;
  private readonly apiKey?: string;
  constructor(readonly baseUrl: string, readonly model: string, readonly timeoutMs: number, readonly think: boolean, opts: GemmaOptions = {}) {
    this.style = opts.style ?? "ollama";
    this.apiKey = opts.apiKey || undefined;
  }

  private get url() { return `${this.baseUrl}${this.style === "openai" ? "/v1/chat/completions" : "/api/chat"}`; }

  private body(o: ChatOptions, stream: boolean) {
    if (this.style === "openai") {
      return {
        model: this.model, stream, max_tokens: o.numPredict,
        messages: o.messages.map(toOpenAI),
        ...(o.tools ? { tools: o.tools } : {}),
        ...(o.temperature !== undefined ? { temperature: o.temperature } : {}),
        ...(this.think ? {} : { chat_template_kwargs: { enable_thinking: false } }),
      };
    }
    return {
      model: this.model, messages: o.messages.map(toOllama), stream, keep_alive: -1,
      ...(o.tools ? { tools: o.tools } : {}),
      ...(this.think ? {} : { think: false }),
      options: { num_ctx: 4096, num_predict: o.numPredict, ...(o.temperature !== undefined ? { temperature: o.temperature } : {}) },
    };
  }

  private post(o: ChatOptions, stream: boolean) {
    return postJson(this.url, this.body(o, stream), { timeoutMs: o.timeoutMs ?? this.timeoutMs, signal: o.signal, apiKey: this.apiKey });
  }

  /** Non-streaming call (planner). */
  async chat(o: ChatOptions): Promise<OllamaMessage> {
    const res = await this.post(o, false);
    const j = (await res.json().catch(() => null)) as { message?: OllamaMessage; choices?: { message?: OpenAIWireMessage }[] } | null;
    const m = this.style === "openai" ? fromOpenAI(j?.choices?.[0]?.message) : j?.message;
    if (!m || typeof m.content !== "string") throw new ModelError("invalid_output", "guide returned no message");
    return m;
  }

  /** Streaming call: yields answer text chunks only (never thinking/reasoning/tool payloads). */
  async *stream(o: ChatOptions): AsyncGenerator<string> {
    const res = await this.post(o, true);
    if (!res.body) throw new ModelError("invalid_output", "guide returned no stream");
    const parse = this.style === "openai" ? parseSseLine : parseNdjsonLine;
    const decoder = new TextDecoder("utf-8");
    let buf = "";
    try {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        buf += decoder.decode(chunk, { stream: true }); // keeps partial UTF-8 sequences across chunks
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = parse(buf.slice(0, nl));
          buf = buf.slice(nl + 1);
          if (line.text) yield line.text;
          if (line.done) return;
        }
      }
      const last = parse(buf + decoder.decode());
      if (last.text) yield last.text;
      if (!last.done) throw new ModelError("invalid_output", "guide stream ended without done");
    } catch (e) {
      throw toModelError(e, o.signal);
    }
  }
}

interface OpenAIWireMessage {
  role?: string; content?: string | null;
  tool_calls?: { id?: string; type?: string; function?: { name?: string; arguments?: unknown } }[];
}

const toOllama = ({ role, content, tool_calls, tool_name }: OllamaMessage) => ({
  role, content,
  ...(tool_calls ? { tool_calls: tool_calls.map((c) => ({ function: { name: c.function.name, arguments: parseArgs(c.function.arguments) } })) } : {}),
  ...(tool_name ? { tool_name } : {}),
});

const toOpenAI = ({ role, content, tool_calls, tool_call_id }: OllamaMessage) => ({
  role, content,
  ...(tool_calls ? {
    tool_calls: tool_calls.map((c, i) => ({
      id: c.id ?? `call_${i}`, type: "function",
      function: { name: c.function.name, arguments: typeof c.function.arguments === "string" ? c.function.arguments : JSON.stringify(c.function.arguments) },
    })),
  } : {}),
  ...(tool_call_id ? { tool_call_id } : {}),
});

function fromOpenAI(m: OpenAIWireMessage | undefined): OllamaMessage | undefined {
  if (!m) return undefined;
  const calls = (m.tool_calls ?? []).filter((c) => typeof c.function?.name === "string");
  return {
    role: "assistant", content: typeof m.content === "string" ? m.content : "",
    ...(calls.length ? { tool_calls: calls.map((c) => ({ ...(c.id ? { id: c.id } : {}), function: { name: c.function!.name!, arguments: parseArgs(c.function!.arguments) } })) } : {}),
  };
}

type Line = { text: string; done: boolean };

function parseNdjsonLine(raw: string): Line {
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

/** OpenAI SSE: `data: {...}` chunks ending with `data: [DONE]`; only `delta.content` is answer text. */
function parseSseLine(raw: string): Line {
  const line = raw.trim();
  if (!line.startsWith("data:")) return { text: "", done: false }; // blank lines, comments, event:/id: fields
  const data = line.slice(5).trim();
  if (data === "[DONE]") return { text: "", done: true };
  let j: { choices?: { delta?: { content?: string | null } }[]; error?: unknown };
  try {
    j = JSON.parse(data);
  } catch {
    throw new ModelError("invalid_output", "guide stream sent malformed JSON");
  }
  if (j.error) throw new ModelError("http", "guide stream error");
  const content = j.choices?.[0]?.delta?.content;
  return { text: typeof content === "string" ? content : "", done: false };
}
