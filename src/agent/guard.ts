import { LIMITS } from './config.js';
import type { ParsedCall } from './model/parse.js';
import { NumberLedger } from './numbers.js';
import { estimatedTokens, stableStringify, withDeadline } from './util.js';
import { TOOLS } from './tools/registry.js';
import type { ToolDef, ToolEnv, ToolResult } from './tools/types.js';
import { ToolDenied } from './tools/types.js';
import { validateArgs } from './tools/validate.js';
import type { DraftCard, FactCard } from './types.js';

export interface Outcome {
  ok: boolean;
  modelText: string;
  card?: FactCard | DraftCard;
  refs: number[];
  reused: boolean;
}

function denied(reason: string): Outcome {
  return { ok: false, modelText: JSON.stringify({ error: reason }), refs: [], reused: false };
}

function shrinkStrings(value: unknown, limit: number): boolean {
  if (typeof value === 'string') return false;
  if (Array.isArray(value)) {
    for (const item of value) if (shrinkStrings(item, limit)) return true;
    return false;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    let largest: string | undefined;
    let key: string | undefined;
    for (const [candidate, entry] of Object.entries(record)) {
      if (typeof entry === 'string' && (largest === undefined || entry.length > largest.length)) {
        key = candidate;
        largest = entry;
      }
    }
    if (key !== undefined && largest !== undefined && largest.length > limit) {
      record[key] = largest.slice(0, limit).trimEnd();
      return true;
    }
    for (const entry of Object.values(record)) if (shrinkStrings(entry, limit)) return true;
  }
  return false;
}

function trimOneArray(value: unknown): boolean {
  if (Array.isArray(value)) {
    if (value.length > 0) {
      value.pop();
      return true;
    }
    return false;
  }
  if (value !== null && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) if (trimOneArray(entry)) return true;
  }
  return false;
}

function compactData(data: unknown): unknown {
  let value: unknown;
  try {
    value = structuredClone(data);
  } catch {
    return { error: 'tool result unavailable' };
  }
  for (let attempts = 0; estimatedTokens(JSON.stringify(value)) > 600 && attempts < 2_000; attempts++) {
    if (trimOneArray(value)) continue;
    const serialized = JSON.stringify(value);
    if (!shrinkStrings(value, Math.max(8, Math.floor(serialized.length / 4)))) return { truncated: true };
  }
  return value;
}

export class Guard {
  private count = 0;
  private readonly successes = new Map<string, Outcome>();

  constructor(
    private readonly env: ToolEnv,
    private readonly allowed: readonly ToolDef[],
    private readonly ledger: NumberLedger,
    private readonly maxCalls = LIMITS.maxCallsPerRequest,
  ) {}

  get attempts(): number {
    return this.count;
  }

  get exhausted(): boolean {
    return this.count >= this.maxCalls;
  }

  async run(call: ParsedCall): Promise<Outcome> {
    return this.execute(call.name, call.args, false);
  }

  async runEager(name: 'get_star_facts' | 'compute_travel_time', args: Record<string, unknown>): Promise<Outcome> {
    return this.execute(name, args, true);
  }

  private async execute(name: string, args: Record<string, unknown>, eager: boolean): Promise<Outcome> {
    this.count++;
    if (this.count > this.maxCalls) return denied('Tool budget used up. Answer now.');

    const tool = eager
      ? TOOLS.find((candidate) => candidate.name === name)
      : this.allowed.find((candidate) => candidate.name === name);
    if (tool === undefined || tool.access === 'internal') return denied('Tool not available in this mode.');

    const validation = validateArgs(tool, args);
    if (validation !== null) return denied(`Invalid arguments: ${validation}`);

    const cacheKey = `${tool.name}:${stableStringify(args)}`;
    try {
      const deadlineMs = this.env.now() + this.env.cfg.toolTimeoutMs;
      const result = await withDeadline(this.env.ctx.signal, this.env.cfg.toolTimeoutMs, async (signal) => {
        await this.authorize(tool, args, signal);
        if (tool.access === 'read') {
          const previous = this.successes.get(cacheKey);
          if (previous !== undefined) return previous;
        }
        return tool.run(args, this.env, signal, deadlineMs);
      });
      if ('modelText' in result) return { ...result, card: undefined, reused: true };
      if (this.env.ctx.mode === 'local' && result.refs.some((id) => !this.env.ctx.inView.has(id))) {
        return denied('Tool failed. Use what you already know or say the data is unavailable.');
      }
      const data = compactData(result.data);
      const modelText = JSON.stringify(data);
      this.ledger.addValue(data);
      const outcome: Outcome = { ok: true, modelText, card: result.card, refs: result.refs, reused: false };
      if (tool.access === 'read') this.successes.set(cacheKey, outcome);
      return outcome;
    } catch (error) {
      if (this.env.ctx.signal.aborted) throw error;
      if (error instanceof ToolDenied) return denied(error.reason);
      return denied('Tool failed. Use what you already know or say the data is unavailable.');
    }
  }

  private async authorize(tool: ToolDef, args: Record<string, unknown>, signal: AbortSignal): Promise<void> {
    if (tool.tagArg !== undefined) {
      const tagId = args[tool.tagArg] as string;
      const target = await this.env.backend.tagTarget(tagId, this.env.ctx.userId, signal);
      if (target === null) throw new ToolDenied('not_found');
      if (this.env.ctx.mode === 'local' && !this.env.ctx.inView.has(target.hyg_id)) {
        throw new ToolDenied(`Star ${target.hyg_id} is not in view. Suggest Explore mode.`);
      }
    }
    if (this.env.ctx.mode !== 'local') return;
    for (const key of tool.idArgs ?? []) {
      const value = args[key];
      const ids = Array.isArray(value) ? value : [value];
      for (const id of ids) {
        if (typeof id !== 'number' || !this.env.ctx.inView.has(id)) {
          throw new ToolDenied(`Star ${String(id)} is not in view. Suggest Explore mode.`);
        }
      }
    }
  }
}
