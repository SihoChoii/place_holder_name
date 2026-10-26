// Vendored from tools/astral-harness/src/guide/wikipedia.ts (MIT License, Copyright (c) 2026 Milo Lin;
// see tools/astral-harness/LICENSE). Keep in sync with the harness; do not edit only here.
import { requestBytes, SummaryToolError } from './summary-http.js';

const WIKIPEDIA_SUMMARY_BASE = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const WIKIPEDIA_ARTICLE_BASE = 'https://en.wikipedia.org/wiki/';
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_USER_AGENT = 'AstralHarness/1.0 (Star Tagger demo)';

export interface WikipediaSummary {
  title: string;
  extract: string;
  url: string;
}

export interface WikipediaOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  userAgent?: string;
}

function invalidInput(message: string): never {
  throw new SummaryToolError('invalid_input', message);
}

function normalizedArticleName(name: unknown): string {
  if (typeof name !== 'string') invalidInput('Wikipedia article name must be a string');
  const trimmed = name.trim();
  if (!trimmed) invalidInput('Wikipedia article name must not be empty');
  if (trimmed.length > 200) invalidInput('Wikipedia article name must be at most 200 characters');
  if (/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(trimmed) || /^www\./i.test(trimmed)) {
    invalidInput('Wikipedia article name must not be a URL');
  }
  return trimmed.replace(/\s+/g, '_');
}

function articleUrl(title: string): string {
  return `${WIKIPEDIA_ARTICLE_BASE}${encodeURIComponent(title.trim().replace(/\s+/g, '_'))}`;
}

function parseSummary(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new SummaryToolError('invalid_response', 'Wikipedia returned malformed JSON');
  }
}

export function createWikipediaSummary(options: WikipediaOptions = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || !Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    invalidInput('Wikipedia timeout must be a positive integer');
  }
  const fetchImpl = options.fetch ?? fetch;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

  return async function get_wikipedia_summary(name: string, signal?: AbortSignal): Promise<WikipediaSummary> {
    const articleName = normalizedArticleName(name);
    const { status, bytes } = await requestBytes(
      `${WIKIPEDIA_SUMMARY_BASE}${encodeURIComponent(articleName)}`,
      {
        headers: { accept: 'application/json', 'user-agent': userAgent },
        redirect: 'follow',
      },
      {
        fetchImpl,
        signal,
        timeoutMs,
        maxBytes: MAX_RESPONSE_BYTES,
        service: 'Wikipedia',
      },
    );

    if (status === 404) {
      throw new SummaryToolError('not_found', 'Wikipedia article was not found', status);
    }
    if (status < 200 || status >= 300) {
      throw new SummaryToolError('upstream_error', `Wikipedia returned HTTP ${status}`, status);
    }

    const summary = parseSummary(bytes);
    if (!summary || typeof summary !== 'object') {
      throw new SummaryToolError('invalid_response', 'Wikipedia returned an invalid summary');
    }
    if ('type' in summary && summary.type === 'disambiguation') {
      throw new SummaryToolError('ambiguous', 'Wikipedia article is a disambiguation page');
    }
    if (!('title' in summary) || typeof summary.title !== 'string' || !summary.title.trim()
      || !('extract' in summary) || typeof summary.extract !== 'string' || !summary.extract.trim()) {
      throw new SummaryToolError('invalid_response', 'Wikipedia summary is missing a title or extract');
    }

    return {
      title: summary.title,
      extract: summary.extract,
      url: articleUrl(summary.title),
    };
  };
}
