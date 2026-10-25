import type Database from 'better-sqlite3';

export interface Prefs {
  units: 'ly' | 'pc';
  speed_c: number;
  language: string;
  voice: string;
}

export const DEFAULT_PREFS: Readonly<Prefs> = {
  units: 'ly',
  speed_c: 0.9,
  language: 'en',
  voice: 'eve',
};

interface PrefsRow {
  units: unknown;
  speed_c: unknown;
  language: unknown;
  voice: unknown;
}

export function getPrefs(db: Database.Database, userId: string): Prefs {
  const row = db.prepare(
    'SELECT units, speed_c, language, voice FROM user_prefs WHERE user_id = ?',
  ).get(userId) as PrefsRow | undefined;
  if (
    row === undefined
    || (row.units !== 'ly' && row.units !== 'pc')
    || typeof row.speed_c !== 'number'
    || !Number.isFinite(row.speed_c)
    || row.speed_c < 0.01
    || row.speed_c > 0.999
    || typeof row.language !== 'string'
    || row.language.length === 0
    || typeof row.voice !== 'string'
    || row.voice.length === 0
  ) return { ...DEFAULT_PREFS };

  return {
    units: row.units,
    speed_c: row.speed_c,
    language: row.language,
    voice: row.voice,
  };
}
