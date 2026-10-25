import { Ajv } from 'ajv';

import type { Client, Mode } from './types.js';

export interface ParsedRequest {
  message: string;
  context: {
    client: Client;
    mode: Mode;
    hyg_id?: number;
    hyg_ids: number[];
    lat?: number;
    lon?: number;
    ts_ms?: number;
    demo: boolean;
  };
}

type RawMessage = { role: 'user' | 'assistant'; content: string };
type RawBody = {
  messages: RawMessage[];
  context: Omit<ParsedRequest['context'], 'demo'> & { demo?: boolean };
};

const ajv = new Ajv({ allErrors: false, coerceTypes: false, removeAdditional: false });
const validBody = ajv.compile({
  type: 'object',
  additionalProperties: false,
  required: ['messages', 'context'],
  properties: {
    messages: {
      type: 'array',
      maxItems: 50,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['role', 'content'],
        properties: {
          role: { enum: ['user', 'assistant'] },
          content: { type: 'string', maxLength: 2_000 },
        },
      },
    },
    context: {
      type: 'object',
      additionalProperties: false,
      required: ['client', 'mode'],
      properties: {
        client: { enum: ['ios', 'web'] },
        mode: { enum: ['local', 'explore'] },
        hyg_id: { type: 'integer', minimum: 0 },
        hyg_ids: {
          type: 'array',
          maxItems: 200,
          uniqueItems: true,
          items: { type: 'integer', minimum: 0 },
        },
        lat: { type: 'number', minimum: -90, maximum: 90 },
        lon: { type: 'number', minimum: -180, maximum: 180 },
        ts_ms: { type: 'integer', minimum: 0 },
        demo: { type: 'boolean' },
      },
    },
  },
});

/** Strictly validates the untrusted chat body and normalizes its useful context. */
export function parseChatBody(body: unknown): ParsedRequest | null {
  if (!validBody(body)) return null;
  const raw = body as RawBody;
  if (!Number.isSafeInteger(raw.context.ts_ms) && raw.context.ts_ms !== undefined) return null;

  let message = '';
  for (let index = raw.messages.length - 1; index >= 0; index--) {
    const candidate = raw.messages[index];
    if (candidate?.role === 'user') {
      message = candidate.content.trim();
      break;
    }
  }
  if (message === '' && raw.context.hyg_id === undefined) return null;

  const mode: Mode = raw.context.client === 'web' ? 'explore' : raw.context.mode;
  const hygIds = raw.context.hyg_ids === undefined ? [] : [...raw.context.hyg_ids];
  if (mode === 'local' && raw.context.hyg_ids === undefined) return null;
  if (mode === 'local' && raw.context.hyg_id !== undefined && !hygIds.includes(raw.context.hyg_id)) return null;

  return {
    message,
    context: {
      client: raw.context.client,
      mode,
      ...(raw.context.hyg_id === undefined ? {} : { hyg_id: raw.context.hyg_id }),
      hyg_ids: hygIds,
      ...(raw.context.lat === undefined ? {} : { lat: raw.context.lat }),
      ...(raw.context.lon === undefined ? {} : { lon: raw.context.lon }),
      ...(raw.context.ts_ms === undefined ? {} : { ts_ms: raw.context.ts_ms }),
      demo: raw.context.demo ?? false,
    },
  };
}
