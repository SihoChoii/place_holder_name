import type { Config } from '../config.js';
import { abortError, deadlineSignal, isPlainObject } from '../util.js';
import { FifoLimiter, runLimited } from './queue.js';

export interface ToolCall {
  id: string;
  index?: number;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface OpenAiTool {
  type: 'function';
  function: { name: string; description: string; parameters: object };
}

export class ModelError extends Error {
  constructor(readonly code: 'model_unavailable' | 'timeout') {
    super(code);
    this.name = 'ModelError';
  }
}

export interface GuideClient {
  chat(
    messages: ChatMessage[],
    tools: OpenAiTool[],
    signal: AbortSignal,
    opts?: { maxTokens?: number },
  ): Promise<ChatMessage>;
}

function isRole(value: unknown): value is ChatMessage['role'] {
  return value === 'system' || value === 'user' || value === 'assistant' || value === 'tool';
}

function parseToolCall(value: unknown): ToolCall | null {
  if (!isPlainObject(value) || typeof value.id !== 'string' || value.type !== 'function') return null;
  if (value.index !== undefined && typeof value.index !== 'number') return null;
  if (!isPlainObject(value.function) || typeof value.function.name !== 'string' || typeof value.function.arguments !== 'string') {
    return null;
  }
  return {
    id: value.id,
    ...(value.index === undefined ? {} : { index: value.index }),
    type: 'function',
    function: { name: value.function.name, arguments: value.function.arguments },
  };
}

function parseMessage(value: unknown): ChatMessage | null {
  if (!isPlainObject(value) || !isRole(value.role) || (value.content !== null && typeof value.content !== 'string')) return null;
  if (value.tool_call_id !== undefined && typeof value.tool_call_id !== 'string') return null;
  let toolCalls: ToolCall[] | undefined;
  if (value.tool_calls !== undefined) {
    if (!Array.isArray(value.tool_calls)) return null;
    toolCalls = [];
    for (const call of value.tool_calls) {
      const parsed = parseToolCall(call);
      if (!parsed) return null;
      toolCalls.push(parsed);
    }
  }
  return {
    role: value.role,
    content: value.content,
    ...(toolCalls === undefined ? {} : { tool_calls: toolCalls }),
    ...(value.tool_call_id === undefined ? {} : { tool_call_id: value.tool_call_id }),
  };
}

async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The response has already been consumed or the transport has closed.
  }
}

export function createGuideClient(cfg: Config, fetchImpl: typeof fetch, limiter: FifoLimiter): GuideClient {
  return {
    async chat(messages, tools, signal, opts) {
      return runLimited(limiter, signal, async () => {
        const deadline = deadlineSignal(signal, cfg.timeoutMs);
        try {
          for (let attempt = 0; attempt < 2; attempt++) {
            let response: Response;
            try {
              response = await fetchImpl(`${cfg.guideBaseUrl}/chat/completions`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  model: cfg.guideModel,
                  messages,
                  stream: false,
                  reasoning_effort: 'none',
                  temperature: 0.3,
                  max_tokens: opts?.maxTokens ?? cfg.maxTokens,
                  ...(tools.length === 0 ? {} : { tools }),
                }),
                signal: deadline.signal,
              });
            } catch {
              if (signal.aborted) throw abortError(signal);
              throw new ModelError(deadline.timedOut() ? 'timeout' : 'model_unavailable');
            }

            if (response.status >= 500 && response.status <= 599 && attempt === 0) {
              await cancelBody(response);
              continue;
            }
            if (!response.ok) {
              await cancelBody(response);
              if (signal.aborted) throw abortError(signal);
              throw new ModelError(deadline.timedOut() ? 'timeout' : 'model_unavailable');
            }

            let payload: unknown;
            try {
              payload = await response.json();
            } catch {
              if (signal.aborted) throw abortError(signal);
              throw new ModelError(deadline.timedOut() ? 'timeout' : 'model_unavailable');
            }
            if (!isPlainObject(payload) || !Array.isArray(payload.choices) || payload.choices.length === 0) {
              if (signal.aborted) throw abortError(signal);
              throw new ModelError('model_unavailable');
            }
            const first = payload.choices[0];
            if (!isPlainObject(first)) throw new ModelError('model_unavailable');
            const message = parseMessage(first.message);
            if (!message) throw new ModelError('model_unavailable');
            return message;
          }
          throw new ModelError(deadline.timedOut() ? 'timeout' : 'model_unavailable');
        } finally {
          deadline.dispose();
        }
      });
    },
  };
}
