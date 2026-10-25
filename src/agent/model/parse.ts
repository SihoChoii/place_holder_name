import type { ChatMessage } from './gemma.js';
import { isPlainObject } from '../util.js';

export interface ParsedCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export type ParseResult =
  | { kind: 'calls'; calls: ParsedCall[] }
  | { kind: 'text'; text: string }
  | { kind: 'broken'; raw: string };

const GEMMA_QUOTE = '<|"|>';
const OPEN = '<|tool_call>';
const CLOSE = '<tool_call|>';
const RESPONSE = '<|tool_response>';
const NAME = /^[A-Za-z_][\w-]*$/;

function broken(raw: string): ParseResult {
  return { kind: 'broken', raw };
}

function parseStrictArgs(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    return isPlainObject(value) ? value : null;
  } catch {
    return null;
  }
}

function containsControlToken(text: string): boolean {
  return /<\|[^>]*>|<[^<>|]*\|>/.test(text);
}

function balancedObjectEnd(text: string, start: number): number | null {
  let depth = 0;
  let stringKind: 'json' | 'gemma' | null = null;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    if (stringKind === 'gemma') {
      if (text.startsWith(GEMMA_QUOTE, index)) {
        stringKind = null;
        index += GEMMA_QUOTE.length - 1;
      }
      continue;
    }

    const char = text[index];
    if (stringKind === 'json') {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') stringKind = null;
      continue;
    }
    if (text.startsWith(GEMMA_QUOTE, index)) {
      stringKind = 'gemma';
      index += GEMMA_QUOTE.length - 1;
      continue;
    }
    if (char === '"') {
      stringKind = 'json';
      continue;
    }
    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) return index + 1;
      if (depth < 0) return null;
    }
  }
  return null;
}

function normalizeGemmaStrings(text: string): string | null {
  let normalized = '';
  let jsonString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (jsonString) {
      normalized += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') jsonString = false;
      continue;
    }
    if (text.startsWith(GEMMA_QUOTE, index)) {
      const close = text.indexOf(GEMMA_QUOTE, index + GEMMA_QUOTE.length);
      if (close === -1) return null;
      normalized += JSON.stringify(text.slice(index + GEMMA_QUOTE.length, close));
      index = close + GEMMA_QUOTE.length - 1;
      continue;
    }
    normalized += char;
    if (char === '"') jsonString = true;
  }
  return jsonString || escaped ? null : normalized;
}

function quoteBareKeys(text: string): string | null {
  let result = '';
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      result += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') {
      quoted = true;
      result += char;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let previous = index - 1;
      while (previous >= 0 && /\s/.test(text[previous])) previous--;
      const propertyPosition = previous < 0 || text[previous] === '{' || text[previous] === ',';
      const match = /^[A-Za-z_]\w*/.exec(text.slice(index));
      if (propertyPosition && match) {
        const after = index + match[0].length;
        let cursor = after;
        while (cursor < text.length && /\s/.test(text[cursor])) cursor++;
        if (text[cursor] !== ':') return null;
        result += `"${match[0]}"`;
        index = after - 1;
        continue;
      }
    }
    result += char;
  }
  return quoted || escaped ? null : result;
}

function parseLeakedArgs(raw: string): Record<string, unknown> | null {
  if (raw.replaceAll(GEMMA_QUOTE, '').includes('<|') || /<[^<>|]*\|>/.test(raw)) return null;
  const normalized = normalizeGemmaStrings(raw);
  if (normalized === null) return null;
  const repaired = quoteBareKeys(normalized);
  if (repaired === null) return null;
  return parseStrictArgs(repaired);
}

function parseStructuredCalls(calls: unknown): ParsedCall[] | null {
  if (!Array.isArray(calls) || calls.length === 0) return null;
  const parsed: ParsedCall[] = [];
  for (const call of calls) {
    if (!isPlainObject(call) || typeof call.id !== 'string' || !isPlainObject(call.function)) return null;
    if (typeof call.function.name !== 'string' || typeof call.function.arguments !== 'string') return null;
    const args = parseStrictArgs(call.function.arguments);
    if (!args) return null;
    parsed.push({ id: call.id, name: call.function.name, args });
  }
  return parsed;
}

function parseLeakedCalls(text: string, idPrefix: string): ParsedCall[] | null {
  let cursor = 0;
  let count = 0;
  const calls: ParsedCall[] = [];
  while (cursor < text.length) {
    while (cursor < text.length && /\s/.test(text[cursor])) cursor++;
    if (text.startsWith(RESPONSE, cursor)) {
      cursor += RESPONSE.length;
      continue;
    }
    if (!text.startsWith(OPEN, cursor)) return null;
    cursor += OPEN.length;
    while (cursor < text.length && /\s/.test(text[cursor])) cursor++;
    if (!text.startsWith('call:', cursor)) return null;
    cursor += 'call:'.length;
    const nameStart = cursor;
    while (cursor < text.length && /[A-Za-z0-9_-]/.test(text[cursor])) cursor++;
    const name = text.slice(nameStart, cursor);
    if (!NAME.test(name)) return null;
    while (cursor < text.length && /\s/.test(text[cursor])) cursor++;
    if (text[cursor] !== '{') return null;
    const end = balancedObjectEnd(text, cursor);
    if (end === null) return null;
    const args = parseLeakedArgs(text.slice(cursor, end));
    if (!args) return null;
    cursor = end;
    while (cursor < text.length && /\s/.test(text[cursor])) cursor++;
    if (!text.startsWith(CLOSE, cursor)) return null;
    cursor += CLOSE.length;
    calls.push({ id: `${idPrefix}_${count++}`, name, args });
  }
  return calls.length === 0 ? null : calls;
}

export function parseReply(msg: ChatMessage, idPrefix: string): ParseResult {
  if (msg.tool_calls !== undefined) {
    if (!Array.isArray(msg.tool_calls)) return broken(msg.content ?? '');
    if (msg.tool_calls.length > 0) {
      const calls = parseStructuredCalls(msg.tool_calls);
      return calls ? { kind: 'calls', calls } : broken(msg.content ?? '');
    }
  }
  const raw = msg.content ?? '';
  const text = raw.trim();
  if (!text) return broken(raw);
  if (text.includes(OPEN) || text.includes(CLOSE) || text.includes(RESPONSE)) {
    const calls = parseLeakedCalls(text, idPrefix);
    return calls ? { kind: 'calls', calls } : broken(raw);
  }
  if (containsControlToken(text) || /\bcall:[A-Za-z_]/.test(text)) return broken(raw);
  return { kind: 'text', text };
}
