import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DB } from "./connection.js";

/** Migrations ship next to dist/ as plain SQL (packages/db/migrations). */
export const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../migrations");

export interface MigrationResult { applied: string[]; alreadyApplied: string[] }

/**
 * Apply unapplied migrations in filename order. A previously applied migration whose file content
 * changed is a hard error: we never silently reset or rewrite existing state.
 */
export function migrate(db: DB, dir = MIGRATIONS_DIR): MigrationResult {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL)`);
  const done = new Map(
    (db.prepare("SELECT version, checksum FROM schema_migrations").all() as { version: string; checksum: string }[]).map(
      (r) => [r.version, r.checksum],
    ),
  );
  const files = readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const result: MigrationResult = { applied: [], alreadyApplied: [] };
  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const prior = done.get(file);
    if (prior) {
      if (prior !== checksum) throw new Error(`Migration ${file} changed after it was applied; refusing to continue`);
      result.alreadyApplied.push(file);
      continue;
    }
    db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)").run(file, checksum, Date.now());
    }).immediate();
    result.applied.push(file);
  }
  return result;
}
