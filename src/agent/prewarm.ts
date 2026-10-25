import type Database from 'better-sqlite3';

import { resolveConfig } from './config.js';
import { templateText, validBlurb } from './fallbacks.js';
import { getBlurb, knowledgeFacts, upsertBlurb, upsertKnowledge } from './memory/knowledge.js';
import { createGuideClient } from './model/gemma.js';
import { FifoLimiter } from './model/queue.js';
import { parseReply } from './model/parse.js';
import { toSpeechScript } from './speech/script.js';
import type { AgentConfig, BackendReads, CatalogStar, StarFacts } from './types.js';
import { abortError } from './util.js';

export interface PrewarmOptions {
  db: Database.Database;
  backend: BackendReads;
  config: AgentConfig;
  fetch?: typeof fetch;
  wikipedia?: boolean;
  limit?: number;
}

type Wiki = { title: string; summary: string } | null;

function staticFacts(star: CatalogStar): StarFacts {
  return {
    hyg_id: star.hyg_id,
    name: star.name,
    mag: star.mag,
    distance_ly: star.distance_ly,
    claim_state: 'claimable',
    ...(star.spectral_type === undefined ? {} : { spectral_type: star.spectral_type }),
  };
}

async function wikipediaSummary(fetchImpl: typeof fetch, name: string, signal: AbortSignal): Promise<Wiki> {
  let url = new URL(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const timeout = AbortSignal.timeout(5_000);
    const combined = AbortSignal.any([signal, timeout]);
    const response = await fetchImpl(url, { signal: combined, redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location === null) return null;
      const next = new URL(location, url);
      if (next.protocol !== 'https:' || next.hostname !== 'en.wikipedia.org') return null;
      url = next;
      continue;
    }
    if (!response.ok) return null;
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > 256 * 1024) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 256 * 1024) return null;
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return null;
    }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
    const record = body as Record<string, unknown>;
    return typeof record.title === 'string' && typeof record.extract === 'string' && record.extract.trim() !== ''
      ? { title: record.title, summary: record.extract }
      : null;
  }
  return null;
}

/** Populates trusted static knowledge and narration cache from the public catalog only. */
export async function prewarm(
  opts: PrewarmOptions,
  signal: AbortSignal,
): Promise<{ requested: number; cached: number; failed: number }> {
  const cfg = resolveConfig(opts.config);
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const limit = Math.max(0, Math.floor(opts.limit ?? 50));
  const catalog = await opts.backend.catalog(signal);
  if (signal.aborted) throw abortError(signal);
  const stars = [...catalog]
    .sort((left, right) => left.mag - right.mag || left.hyg_id - right.hyg_id)
    .slice(0, limit);
  const guide = createGuideClient(cfg, fetchImpl, new FifoLimiter(1, cfg.queueDepth));
  let cached = 0;
  let failed = 0;

  for (const star of stars) {
    if (signal.aborted) throw abortError(signal);
    const facts = staticFacts(star);
    try {
      const old = getBlurb(opts.db, star.hyg_id);
      if (old !== null && validBlurb(old.text, facts)) {
        cached++;
        continue;
      }
      const wiki = opts.wikipedia === false ? null : await wikipediaSummary(fetchImpl, star.name, signal).catch((error: unknown) => {
        if (signal.aborted) throw error;
        return null;
      });
      upsertKnowledge(opts.db, knowledgeFacts(star), wiki, Date.now());
      const prompt = [
        { role: 'system' as const, content: 'Write a short factual star introduction using only the supplied facts. Do not invent numbers.' },
        { role: 'user' as const, content: JSON.stringify(knowledgeFacts(star)) },
      ];
      const reply = await guide.chat(prompt, [], signal, { maxTokens: cfg.maxTokens });
      const parsed = parseReply(reply, `prewarm_${star.hyg_id}`);
      const text = parsed.kind === 'text' && validBlurb(parsed.text, facts) ? parsed.text : templateText(facts);
      upsertBlurb(opts.db, {
        hyg_id: star.hyg_id,
        text,
        speech_script: toSpeechScript(text, [star.name]),
        model: cfg.guideModel,
        created_at: Date.now(),
      });
      cached++;
    } catch (error) {
      if (signal.aborted) throw error;
      failed++;
    }
  }
  return { requested: stars.length, cached, failed };
}
