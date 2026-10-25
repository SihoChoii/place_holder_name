import type { AgentConfig } from './types.js';

export interface Config {
  guideBaseUrl: string;
  guideModel: string;
  clefBaseUrl: string | null;
  clefModel: string;
  maxTokens: number;
  timeoutMs: number;
  queueDepth: number;
  toolTimeoutMs: number;
}

export const LIMITS = {
  maxRounds: 4,
  maxCallsPerRequest: 6,
  chatsPerWindow: 20,
  windowMs: 10 * 60_000,
  inViewMax: 200,
  clefModerationMs: 3_000,
  clefDraftMs: 1_500,
  clefRoutingMs: 300,
} as const;

export class ConfigError extends Error {}

function positiveInt(value: number | undefined, fallback: number, name: string, max: number): number {
  const v = value ?? fallback;
  if (!Number.isInteger(v) || v < 1 || v > max) throw new ConfigError(`${name} must be an integer between 1 and ${max}`);
  return v;
}

function httpUrl(raw: string, name: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(`${name} must be an absolute http(s) URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ConfigError(`${name} must use http or https`);
  if (url.username || url.password || url.search || url.hash) throw new ConfigError(`${name} must not contain credentials, query or fragment`);
  return url;
}

/** Validates administrator configuration. Throws ConfigError with the offending variable name. */
export function resolveConfig(raw: AgentConfig): Config {
  if (!raw.guideBaseUrl) throw new ConfigError('GUIDE_BASE_URL is required (OpenAI-compatible root ending in /v1)');
  const guide = httpUrl(raw.guideBaseUrl, 'GUIDE_BASE_URL');
  const guidePath = guide.pathname.replace(/\/+$/, '');
  if (!guidePath.endsWith('/v1')) throw new ConfigError('GUIDE_BASE_URL must end in /v1, not a full /chat/completions URL');
  if (!raw.guideModel?.trim()) throw new ConfigError('GUIDE_MODEL is required');

  let clefBaseUrl: string | null = null;
  if (raw.clefBaseUrl) {
    const clef = httpUrl(raw.clefBaseUrl, 'CLEF_BASE_URL');
    if (clef.pathname.replace(/\/+$/, '') !== '') throw new ConfigError('CLEF_BASE_URL must be an origin without a path; /v1/systemone is appended');
    clefBaseUrl = clef.origin;
  }

  return {
    guideBaseUrl: guide.origin + guidePath,
    guideModel: raw.guideModel.trim(),
    clefBaseUrl,
    clefModel: raw.clefModel?.trim() || 'clef-flash',
    maxTokens: positiveInt(raw.maxTokens, 220, 'AGENT_MAX_TOKENS', 4096),
    timeoutMs: positiveInt(raw.timeoutMs, 20_000, 'GEMMA_TIMEOUT_MS', 120_000),
    queueDepth: positiveInt(raw.queueDepth, 8, 'AGENT_QUEUE_DEPTH', 64),
    toolTimeoutMs: positiveInt(raw.toolTimeoutMs, 2_000, 'AGENT_TOOL_TIMEOUT_MS', 30_000),
  };
}

function envInt(name: string): number | undefined {
  const v = process.env[name];
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new ConfigError(`${name} must be an integer`);
  return n;
}

/** Reads AgentConfig from process.env. AGENT_CONCURRENCY is fixed at 1 and rejected otherwise. */
export function configFromEnv(): AgentConfig {
  const concurrency = envInt('AGENT_CONCURRENCY');
  if (concurrency !== undefined && concurrency !== 1) throw new ConfigError('AGENT_CONCURRENCY must be 1');
  return {
    guideBaseUrl: process.env.GUIDE_BASE_URL ?? '',
    guideModel: process.env.GUIDE_MODEL ?? '',
    clefBaseUrl: process.env.CLEF_BASE_URL || undefined,
    clefModel: process.env.CLEF_MODEL || undefined,
    maxTokens: envInt('AGENT_MAX_TOKENS'),
    timeoutMs: envInt('GEMMA_TIMEOUT_MS'),
    queueDepth: envInt('AGENT_QUEUE_DEPTH'),
    toolTimeoutMs: envInt('AGENT_TOOL_TIMEOUT_MS'),
  };
}
