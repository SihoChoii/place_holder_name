import { readFileSync } from 'node:fs';

import type Database from 'better-sqlite3';

export class SchemaError extends Error {}

const REQUIRED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  agent_sessions: ['id', 'user_id', 'scope', 'summary', 'turns', 'updated_at', 'summary_hyg_ids'],
  agent_messages: ['id', 'session_id', 'role', 'content', 'created_at', 'referenced_hyg_ids'],
  user_prefs: ['user_id', 'units', 'speed_c', 'language', 'voice', 'updated_at'],
  user_recent_stars: ['user_id', 'hyg_id', 'viewed_at'],
  star_knowledge: ['hyg_id', 'facts_json', 'wiki_title', 'wiki_summary', 'wiki_fetched_at'],
  star_blurbs: ['hyg_id', 'text', 'speech_script', 'model', 'created_at'],
  speech_scripts: ['id', 'user_id', 'hyg_id', 'text', 'text_hash', 'created_at'],
  community_digest: ['id', 'json', 'computed_at'],
};

const ADDITIVE_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  agent_sessions: ['summary_hyg_ids'],
  agent_messages: ['referenced_hyg_ids'],
};

interface TableRow {
  name: string;
}

function tableExists(db: Database.Database, table: string): boolean {
  return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined;
}

function tableColumns(db: Database.Database, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as TableRow[];
  return new Set(rows.map((row) => row.name));
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function validateExistingTable(db: Database.Database, table: string): void {
  const existing = tableColumns(db, table);
  const additive = new Set(ADDITIVE_COLUMNS[table] ?? []);
  const missing = REQUIRED_COLUMNS[table].filter((column) => !existing.has(column) && !additive.has(column));
  if (missing.length > 0) {
    throw new SchemaError(`Incompatible ${table}: missing columns ${missing.join(', ')}`);
  }

  for (const column of ADDITIVE_COLUMNS[table] ?? []) {
    if (!existing.has(column)) {
      db.exec(`ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN ${quoteIdentifier(column)} TEXT`);
    }
  }
}

/** Applies harness-owned schema and additive provenance migrations to a host SQLite database. */
export function applySchema(db: Database.Database): void {
  const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  db.transaction(() => {
    if (!tableExists(db, 'users')) {
      throw new SchemaError('Host users table is required before applying agent schema');
    }

    for (const table of Object.keys(REQUIRED_COLUMNS)) {
      if (tableExists(db, table)) validateExistingTable(db, table);
    }

    db.exec(schema);
  })();
}
