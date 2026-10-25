import type Database from 'better-sqlite3';

import type { CatalogStar } from '../types.js';

export interface KnowledgeFacts {
  hyg_id: number;
  name: string;
  mag: number;
  distance_ly: number | null;
  spectral_type?: string;
  luminosity_solar?: number;
  exoplanets?: readonly string[];
}

export interface Knowledge {
  facts: KnowledgeFacts;
  wiki_title: string | null;
  wiki_summary: string | null;
}

export interface Blurb {
  hyg_id: number;
  text: string;
  speech_script: string | null;
  model: string;
  created_at: number;
}

interface KnowledgeRow {
  facts_json: string;
  wiki_title: string | null;
  wiki_summary: string | null;
}

interface BlurbRow {
  hyg_id: number;
  text: string;
  speech_script: string | null;
  model: string;
  created_at: number;
}

function isKnowledgeFacts(value: unknown): value is KnowledgeFacts {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const facts = value as Record<string, unknown>;
  if (
    !Number.isInteger(facts.hyg_id)
    || typeof facts.name !== 'string'
    || typeof facts.mag !== 'number'
    || !Number.isFinite(facts.mag)
    || (facts.distance_ly !== null && (typeof facts.distance_ly !== 'number' || !Number.isFinite(facts.distance_ly)))
  ) return false;
  if (facts.spectral_type !== undefined && typeof facts.spectral_type !== 'string') return false;
  if (facts.luminosity_solar !== undefined && (typeof facts.luminosity_solar !== 'number' || !Number.isFinite(facts.luminosity_solar))) return false;
  return facts.exoplanets === undefined || (Array.isArray(facts.exoplanets) && facts.exoplanets.every((planet) => typeof planet === 'string'));
}

/** Selects only static catalog fields that may be stored in star knowledge. */
export function knowledgeFacts(star: CatalogStar): KnowledgeFacts {
  const facts: KnowledgeFacts = {
    hyg_id: star.hyg_id,
    name: star.name,
    mag: star.mag,
    distance_ly: star.distance_ly,
  };
  if (star.spectral_type !== undefined) facts.spectral_type = star.spectral_type;
  if (star.luminosity_solar !== undefined) facts.luminosity_solar = star.luminosity_solar;
  if (star.exoplanets !== undefined) facts.exoplanets = [...star.exoplanets];
  return facts;
}

export function getKnowledge(db: Database.Database, hygId: number): Knowledge | null {
  const row = db.prepare(
    'SELECT facts_json, wiki_title, wiki_summary FROM star_knowledge WHERE hyg_id = ?',
  ).get(hygId) as KnowledgeRow | undefined;
  if (row === undefined) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.facts_json);
  } catch {
    return null;
  }
  if (!isKnowledgeFacts(parsed)) return null;

  return {
    facts: parsed,
    wiki_title: row.wiki_title,
    wiki_summary: row.wiki_summary,
  };
}

export function upsertKnowledge(
  db: Database.Database,
  facts: KnowledgeFacts,
  wiki: { title: string; summary: string } | null,
  now: number,
): void {
  db.prepare(`
    INSERT INTO star_knowledge (hyg_id, facts_json, wiki_title, wiki_summary, wiki_fetched_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(hyg_id) DO UPDATE SET
      facts_json = excluded.facts_json,
      wiki_title = CASE WHEN ? THEN excluded.wiki_title ELSE star_knowledge.wiki_title END,
      wiki_summary = CASE WHEN ? THEN excluded.wiki_summary ELSE star_knowledge.wiki_summary END,
      wiki_fetched_at = CASE WHEN ? THEN excluded.wiki_fetched_at ELSE star_knowledge.wiki_fetched_at END
  `).run(
    facts.hyg_id,
    JSON.stringify(facts),
    wiki?.title ?? null,
    wiki?.summary ?? null,
    wiki === null ? null : now,
    wiki === null ? 0 : 1,
    wiki === null ? 0 : 1,
    wiki === null ? 0 : 1,
  );
}

export function getBlurb(db: Database.Database, hygId: number): Blurb | null {
  const row = db.prepare(
    'SELECT hyg_id, text, speech_script, model, created_at FROM star_blurbs WHERE hyg_id = ?',
  ).get(hygId) as BlurbRow | undefined;
  if (row === undefined) return null;
  return row;
}

export function upsertBlurb(db: Database.Database, blurb: Blurb): void {
  db.prepare(`
    INSERT INTO star_blurbs (hyg_id, text, speech_script, model, created_at)
    VALUES (@hyg_id, @text, @speech_script, @model, @created_at)
    ON CONFLICT(hyg_id) DO UPDATE SET
      text = excluded.text,
      speech_script = excluded.speech_script,
      model = excluded.model,
      created_at = excluded.created_at
  `).run(blurb);
}
